import asyncio
import csv
import io
import json
import logging
import os
import re
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import pandas as pd

from app.models.prediction_data import PredictionDataTable
from app.services.llm_service import llm_service

log = logging.getLogger(__name__)

MLJAR_MODES = ["Explain", "Perform", "Compete"]
MLJAR_ALGORITHMS = [
    "Baseline", "Linear", "Decision Tree", "Random Forest",
    "Extra Trees", "LightGBM", "Xgboost", "CatBoost",
    "Neural Network", "Nearest Neighbors",
]
MLJAR_SIMPLE_ALGORITHMS = {"Baseline", "Linear", "Decision Tree"}
MLJAR_MODE_RANK = {"Explain": 0, "Perform": 1, "Compete": 2}
MLJAR_ALGORITHM_DESCRIPTIONS = {
    "Baseline": "Simple baseline (mean/most-frequent) — validates if ML is needed",
    "Linear": "Logistic/Linear regression — fast, interpretable",
    "Decision Tree": "Simple tree (max_depth ≤ 4) — easy to visualize",
    "Random Forest": "Ensemble of decision trees — robust, handles non-linearity",
    "Extra Trees": "Randomized trees — faster than RF, good for high-dimensional data",
    "LightGBM": "Gradient boosting — fast, handles categoricals natively",
    "Xgboost": "Gradient boosting — often best performer on tabular data",
    "CatBoost": "Gradient boosting — excellent with categorical features",
    "Neural Network": "Deep learning — good for large datasets",
    "Nearest Neighbors": "Instance-based — good for small datasets",
}


class AutoMLService:
    def __init__(self) -> None:
        self.base_dir = Path("./data/automl")
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self._mljar_models: Dict[str, Dict[str, Any]] = {}

    # ── Job management ──────────────────────────────────────────────

    def _init_job(self, job_id: str, dataset_id: str, problem_type: str, config: Dict[str, Any]) -> None:
        self.jobs[job_id] = {
            "job_id": job_id,
            "dataset_id": dataset_id,
            "problem_type": problem_type,
            "config": config,
            "status": "queued",
            "current_step": "",
            "completed_models": [],
            "leaderboard": [],
            "best_model": None,
            "best_model_report": None,
            "stdout_lines": [],
            "error": None,
            "results_path": None,
            "started_at": None,
            "finished_at": None,
        }

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self.jobs.get(job_id)

    def list_jobs(self) -> List[Dict[str, Any]]:
        summaries: List[Dict[str, Any]] = []
        for job_id, job in self.jobs.items():
            config = job.get("config") or {}
            dataset_id = str(job.get("dataset_id") or "")
            dataset_name = None
            try:
                dataset_meta = PredictionDataTable.get_dataset_by_id(dataset_id)
                if dataset_meta:
                    dataset_name = dataset_meta.get("original_filename")
            except Exception:
                pass
            summaries.append({
                "job_id": job_id,
                "dataset_id": dataset_id,
                "dataset_name": dataset_name,
                "problem_type": job.get("problem_type"),
                "target_column": config.get("target_column"),
                "feature_columns": config.get("feature_columns"),
                "mode": config.get("mode"),
                "algorithms": config.get("algorithms"),
                "time_budget_minutes": config.get("time_budget_minutes"),
                "status": job.get("status", "unknown"),
                "best_model": job.get("best_model"),
                "registered_model_id": job.get("registered_model_id"),
                "completed_models_count": len(job.get("completed_models") or []),
                "leaderboard": job.get("leaderboard") or [],
                "error": job.get("error"),
                "started_at": job.get("started_at"),
                "finished_at": job.get("finished_at"),
            })
        summaries.sort(key=lambda x: str(x.get("started_at") or ""), reverse=True)
        return summaries

    def get_best_model_report(self, job_id: str) -> Optional[str]:
        job = self.jobs.get(job_id)
        if not job:
            return None
        report = job.get("best_model_report")
        if not report:
            return None
        return self._rewrite_job_report_markdown(job_id, report)

    def ensure_registered_model(self, job_id: str) -> Optional[str]:
        job = self.jobs.get(job_id)
        if not job:
            return None
        if job.get("status") == "completed":
            self._register_automl_model(job_id)
        registered_model_id = job.get("registered_model_id")
        return str(registered_model_id) if registered_model_id else None

    def _minimum_training_plan(
        self,
        rows: int,
        cols: int,
        time_budget_minutes: int,
    ) -> Dict[str, Any]:
        small_tabular_dataset = rows <= 5000 and cols <= 100

        if time_budget_minutes <= 2:
            if small_tabular_dataset:
                return {
                    "mode": "Perform",
                    "algorithms": ["Linear", "Random Forest", "LightGBM", "Xgboost", "CatBoost"],
                    "min_algorithms": 4,
                    "min_advanced_algorithms": 3,
                }
            return {
                "mode": "Explain",
                "algorithms": ["Baseline", "Linear", "Decision Tree", "Random Forest", "LightGBM"],
                "min_algorithms": 4,
                "min_advanced_algorithms": 2,
            }

        if time_budget_minutes <= 15:
            return {
                "mode": "Perform",
                "algorithms": ["Linear", "Random Forest", "LightGBM", "Xgboost", "CatBoost"],
                "min_algorithms": 4,
                "min_advanced_algorithms": 3,
            }

        return {
            "mode": "Compete",
            "algorithms": ["Random Forest", "Extra Trees", "LightGBM", "Xgboost", "CatBoost", "Neural Network", "Nearest Neighbors"],
            "min_algorithms": 5,
            "min_advanced_algorithms": 4,
        }

    def _normalize_training_plan(
        self,
        mode: str,
        algorithms: Optional[List[str]],
        rows: int,
        cols: int,
        time_budget_minutes: int,
    ) -> Dict[str, Any]:
        minimum_plan = self._minimum_training_plan(rows, cols, time_budget_minutes)
        normalized_mode = mode if mode in MLJAR_MODES else minimum_plan["mode"]
        normalized_algorithms = [
            str(algo).strip()
            for algo in (algorithms or [])
            if str(algo).strip() in MLJAR_ALGORITHMS
        ]
        adjusted = normalized_mode != mode

        if MLJAR_MODE_RANK.get(normalized_mode, 0) < MLJAR_MODE_RANK[minimum_plan["mode"]]:
            normalized_mode = minimum_plan["mode"]
            adjusted = True

        advanced_algorithms = [
            algo for algo in normalized_algorithms if algo not in MLJAR_SIMPLE_ALGORITHMS
        ]
        if (
            not normalized_algorithms
            or len(normalized_algorithms) < minimum_plan["min_algorithms"]
            or len(advanced_algorithms) < minimum_plan["min_advanced_algorithms"]
        ):
            merged_algorithms = list(dict.fromkeys(normalized_algorithms + minimum_plan["algorithms"]))
            if normalized_mode != "Explain":
                merged_algorithms = [algo for algo in merged_algorithms if algo != "Baseline"]
            normalized_algorithms = merged_algorithms
            adjusted = True

        return {
            "mode": normalized_mode,
            "algorithms": normalized_algorithms,
            "adjusted": adjusted,
        }

    # ── LLM Step 1: Detect problem type ────────────────────────────

    async def detect_problem_type(
        self,
        dataset_id: str,
        user_instruction: str,
    ) -> Dict[str, Any]:
        dataset_meta = PredictionDataTable.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")

        insights: Dict[str, Any] = {}
        try:
            from app.services.prediction_service import prediction_service
            insights = prediction_service.get_dataset_insights_from_metadata(dataset_id=dataset_id)
        except Exception:
            pass

        segments = dict((insights or {}).get("segments") or {})
        schema_cols = list(dataset_meta.get("schema") or [])
        sample_rows: List[Dict[str, Any]] = []
        try:
            sample_rows = PredictionDataTable.get_dataset_rows(dataset_id, limit=15)
        except Exception:
            pass

        overview = dict(segments.get("overview") or {})
        target_diag = dict(segments.get("target_diagnostics") or {})
        target_profile = dict(target_diag.get("profile") or {})
        feature_ready = dict(segments.get("feature_readiness") or {})
        trainability = dict(feature_ready.get("trainability") or {})
        leakage = list(feature_ready.get("leakage_candidates") or [])

        schema_lines = ["| Column | Type | Semantic | Null% | Unique |", "|---|---|---|---|---|"]
        for col in schema_cols:
            name = col.get("name", "")
            dtype = col.get("detected_dtype", "")
            semantic = col.get("semantic_type", "")
            null_count = int(col.get("null_count", 0))
            rows_count = int(dataset_meta.get("rows", 1)) or 1
            null_pct = round(100.0 * null_count / rows_count, 1)
            unique = col.get("unique_count", "")
            schema_lines.append(f"| {name} | {dtype} | {semantic} | {null_pct}% | {unique} |")
        schema_table = "\n".join(schema_lines)

        sample_table = ""
        if sample_rows:
            headers = list(sample_rows[0].keys())[:12]
            sample_table = "| " + " | ".join(headers) + " |\n|" + "---|" * len(headers) + "\n"
            for row in sample_rows[:8]:
                vals = [str(row.get(h, ""))[:25] for h in headers]
                sample_table += "| " + " | ".join(vals) + " |\n"

        safe_instruction = user_instruction.replace('"', "'")

        system_prompt = (
            "You are an expert data scientist. Analyze the dataset and the user's instruction. "
            "Determine if this is a CLASSIFICATION or REGRESSION problem. "
            "Return STRICT JSON only."
        )

        user_prompt = (
            f'USER INSTRUCTION: "{safe_instruction}"\n\n'
            f"DATASET: {dataset_meta.get('original_filename')}\n"
            f"Rows: {dataset_meta.get('rows')}, Columns: {dataset_meta.get('columns_count')}\n"
            f"Quality Score: {overview.get('quality_score', 'N/A')}/100\n\n"
            f"SCHEMA:\n{schema_table}\n\n"
            f"TARGET DIAGNOSTICS:\n"
            f"- Suggested target: {target_profile.get('suggested_target')}\n"
            f"- Target type: {target_profile.get('target_type')}\n"
            f"- Semantic domain: {(target_diag.get('semantic_context') or {}).get('primary_domain')}\n"
            f"- Leakage candidates: {[l.get('feature') for l in leakage[:5]]}\n\n"
            f"FEATURE READINESS:\n"
            f"- Difficulty: {trainability.get('difficulty')}\n"
            f"- Signal strength: {trainability.get('proxy_signal_strength')}\n\n"
            f"SAMPLE DATA:\n{sample_table}\n\n"
            "Return JSON:\n"
            "{\n"
            '  "problem_type": "classification|regression",\n'
            '  "target_column": "column_name",\n'
            '  "excluded_columns": ["id_col", "leakage_col"],\n'
            '  "message": "Explanation of why this is classification/regression and what the model will predict"\n'
            "}"
        )

        try:
            llm_response = await llm_service.generate(
                prompt=user_prompt, system_prompt=system_prompt,
                temperature=0.1, max_tokens=800,
            )
            parsed = self._extract_json(str(llm_response))
        except Exception as e:
            log.warning(f"LLM detect_problem_type failed: {e}")
            parsed = {}

        column_names = [str(c.get("name")) for c in schema_cols if c.get("name")]
        problem_type = str(parsed.get("problem_type") or "regression").strip().lower()
        if problem_type not in {"regression", "classification"}:
            problem_type = "regression"

        target_col = str(parsed.get("target_column") or target_profile.get("suggested_target") or "").strip()
        if target_col not in column_names:
            target_col = column_names[-1] if column_names else ""

        excluded = [str(c) for c in (parsed.get("excluded_columns") or []) if str(c).strip()]
        leakage_names = [str(l.get("feature", "")) for l in leakage if l.get("feature")]
        excluded = list(set(excluded + leakage_names))

        feature_cols = [c for c in column_names if c != target_col and c not in excluded]

        message = str(parsed.get("message") or "").strip()
        if not message:
            message = f"This looks like a {problem_type} problem. The model will predict '{target_col}' based on {len(feature_cols)} features."

        return {
            "problem_type": problem_type,
            "target_column": target_col,
            "feature_columns": feature_cols,
            "excluded_columns": excluded,
            "message": message,
            "dataset_summary": {
                "rows": dataset_meta.get("rows"),
                "columns": dataset_meta.get("columns_count"),
                "quality_score": overview.get("quality_score"),
                "difficulty": trainability.get("difficulty"),
            },
        }

    # ── LLM Step 2: Recommend algorithms + mode ────────────────────

    async def recommend_algorithms(
        self,
        dataset_id: str,
        problem_type: str,
        target_column: str,
        feature_columns: Optional[List[str]] = None,
        time_budget_minutes: int = 5,
    ) -> Dict[str, Any]:
        dataset_meta = PredictionDataTable.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")

        rows = int(dataset_meta.get("rows", 0) or 0)
        cols = len(feature_columns or []) or int(dataset_meta.get("columns_count", 0) or 0)

        system_prompt = (
            "You are an ML engineer. Given the dataset profile and time budget, "
            "recommend which MLJAR AutoML mode to use and which algorithms to include. "
            "Return STRICT JSON only.\n"
            "Modes: Explain (quick, 1 model/algo), Perform (moderate, ~13 models/algo), Compete (thorough, ~22 models/algo).\n"
            "Algorithms: Baseline, Linear, Decision Tree, Random Forest, Extra Trees, LightGBM, Xgboost, CatBoost, Neural Network, Nearest Neighbors."
        )

        user_prompt = (
            f"PROBLEM: {problem_type}\n"
            f"TARGET: {target_column}\n"
            f"FEATURES: {cols} columns\n"
            f"DATASET: {rows} rows\n"
            f"TIME BUDGET: {time_budget_minutes} minutes\n\n"
            "Recommend:\n"
            "1. Which MLJAR mode to use (Explain/Perform/Compete)\n"
            "2. Which algorithms to include\n"
            "3. A brief message explaining your choices\n\n"
            "Return JSON:\n"
            "{\n"
            '  "mode": "Explain|Perform|Compete",\n'
            '  "algorithms": ["LightGBM", "Xgboost", "CatBoost"],\n'
            '  "message": "I recommend Perform mode with LightGBM, Xgboost, and CatBoost because..."\n'
            "}"
        )

        try:
            llm_response = await llm_service.generate(
                prompt=user_prompt, system_prompt=system_prompt,
                temperature=0.1, max_tokens=600,
            )
            parsed = self._extract_json(str(llm_response))
        except Exception as e:
            log.warning(f"LLM recommend_algorithms failed: {e}")
            parsed = {}

        mode = str(parsed.get("mode") or "Perform").strip()
        raw_algos = parsed.get("algorithms") or []
        normalized_plan = self._normalize_training_plan(
            mode=mode,
            algorithms=raw_algos,
            rows=rows,
            cols=cols,
            time_budget_minutes=time_budget_minutes,
        )
        mode = normalized_plan["mode"]
        algorithms = normalized_plan["algorithms"]

        message = str(parsed.get("message") or "").strip()
        if normalized_plan["adjusted"]:
            message = (
                f"I'll use {mode} mode with {', '.join(algorithms)}. "
                f"The training plan was widened to match your {time_budget_minutes}-minute budget "
                "so AutoML does more than a couple of quick baseline models."
            )
        elif not message:
            message = f"I'll use {mode} mode with {', '.join(algorithms)}. MLJAR will train multiple models for each algorithm and find the best one."

        algo_details = []
        for a in algorithms:
            desc = MLJAR_ALGORITHM_DESCRIPTIONS.get(a, a)
            algo_details.append({"name": a, "description": desc})

        return {
            "mode": mode,
            "algorithms": algorithms,
            "algorithm_details": algo_details,
            "time_budget_minutes": time_budget_minutes,
            "message": message,
        }

    # ── Start MLJAR training ───────────────────────────────────────

    def start_automl_training(
        self,
        dataset_id: str,
        problem_type: str,
        target_column: str,
        feature_columns: Optional[List[str]],
        mode: str = "Perform",
        algorithms: Optional[List[str]] = None,
        time_budget_minutes: int = 5,
    ) -> str:
        dataset_meta = PredictionDataTable.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")

        rows = int(dataset_meta.get("rows", 0) or 0)
        cols = len(feature_columns or []) or int(dataset_meta.get("columns_count", 0) or 0)
        normalized_plan = self._normalize_training_plan(
            mode=mode,
            algorithms=algorithms,
            rows=rows,
            cols=cols,
            time_budget_minutes=time_budget_minutes,
        )

        job_id = str(uuid.uuid4())
        config = {
            "problem_type": problem_type,
            "target_column": target_column,
            "feature_columns": feature_columns,
            "mode": normalized_plan["mode"],
            "algorithms": normalized_plan["algorithms"],
            "time_budget_minutes": time_budget_minutes,
        }
        self._init_job(job_id, dataset_id, problem_type, config)
        self.jobs[job_id]["status"] = "starting"
        self.jobs[job_id]["started_at"] = datetime.utcnow().isoformat()

        results_path = str((self.base_dir / f"job_{job_id[:8]}").resolve())
        self.jobs[job_id]["results_path"] = results_path

        asyncio.create_task(self._run_automl(job_id))
        return job_id

    async def _run_automl(self, job_id: str) -> None:
        job = self.jobs[job_id]
        config = job["config"]
        dataset_id = job["dataset_id"]
        results_path = job["results_path"]

        try:
            dataset_meta = PredictionDataTable.get_dataset_by_id(dataset_id)
            if not dataset_meta:
                raise ValueError("Dataset not found.")

            from app.services.prediction_service import prediction_service
            df = prediction_service._load_dataset_dataframe(dataset_meta)

            target_col = config["target_column"]
            feature_cols = config.get("feature_columns")
            if feature_cols:
                df = df[feature_cols + [target_col]].copy()
            df = df.dropna(subset=[target_col])

            X = df.drop(columns=[target_col])
            y = df[target_col]

            job["status"] = "running"
            job["current_step"] = "Preparing MLJAR AutoML"

            ml_task = "auto"
            if config["problem_type"] == "classification":
                n_unique = y.nunique()
                if n_unique == 2:
                    ml_task = "binary_classification"
                else:
                    ml_task = "multiclass_classification"
            elif config["problem_type"] == "regression":
                ml_task = "regression"

            total_seconds = int(config.get("time_budget_minutes", 5) * 60)
            mode = config.get("mode", "Perform")
            algorithms = config.get("algorithms")

            await asyncio.to_thread(
                self._train_automl_sync,
                job_id, X, y, ml_task, mode, algorithms, total_seconds, results_path,
            )

            job["status"] = "completed"
            job["finished_at"] = datetime.utcnow().isoformat()
            self._load_final_results(job_id)

        except Exception as e:
            log.error(f"AutoML training failed ({job_id}): {e}")
            job["status"] = "failed"
            job["error"] = str(e)
            job["finished_at"] = datetime.utcnow().isoformat()

    def _train_automl_sync(
        self,
        job_id: str,
        X: pd.DataFrame,
        y: pd.Series,
        ml_task: str,
        mode: str,
        algorithms: Optional[List[str]],
        total_seconds: int,
        results_path: str,
    ) -> None:
        import io as _io
        from contextlib import redirect_stdout

        job = self.jobs[job_id]

        captured_lines: List[str] = []
        progress_path = os.path.join(results_path, "progress.json")

        class ProgressCapture(_io.TextIOBase):
            def __init__(self, original_stdout):
                self.original = original_stdout
                self.buffer = ""

            def write(self, text):
                self.original.write(text)
                self.buffer += text
                while "\n" in self.buffer:
                    line, self.buffer = self.buffer.split("\n", 1)
                    line = line.strip()
                    if line:
                        captured_lines.append(line)
                        self._process_line(line, job, results_path)
                return len(text)

            def flush(self):
                self.original.flush()

            def _process_line(self, line, job, results_path):
                if line.startswith("* Step "):
                    step = line.replace("* Step ", "").split(" will")[0].strip()
                    job["current_step"] = step

                match = re.match(
                    r"^(\S+)\s+\S+\s+([-\d.]+)\s+trained in\s+([\d.]+)\s+seconds",
                    line,
                )
                if match:
                    model_name = match.group(1)
                    metric_val = float(match.group(2))
                    train_time = float(match.group(3))
                    job["completed_models"].append({
                        "name": model_name,
                        "metric": metric_val,
                        "train_time": train_time,
                    })
                    self._refresh_leaderboard(job, results_path)
                    self._collect_model_visuals_inline(job, results_path, model_name)

                if "AutoML best model:" in line:
                    job["best_model"] = line.split("AutoML best model:")[-1].strip()

            def _refresh_leaderboard(self, job, results_path):
                lb_path = os.path.join(results_path, "leaderboard.csv")
                if not os.path.exists(lb_path):
                    return
                try:
                    with open(lb_path, "r") as f:
                        reader = csv.DictReader(f)
                        job["leaderboard"] = [dict(row) for row in reader]
                except Exception:
                    pass

            def _collect_model_visuals_inline(self, job, results_path, model_name):
                model_dir = os.path.join(results_path, model_name)
                if not os.path.isdir(model_dir):
                    return
                image_files = [
                    "learning_curves.png", "permutation_importance.png",
                    "confusion_matrix.png", "confusion_matrix_normalized.png",
                    "roc_curve.png", "precision_recall_curve.png",
                    "true_vs_predicted.png", "predicted_vs_residuals.png",
                ]
                found = []
                for fname in image_files:
                    fpath = os.path.join(model_dir, fname)
                    if os.path.exists(fpath):
                        title = fname.replace(".png", "").replace("_", " ").title()
                        found.append({"title": title, "filename": fname, "model_name": model_name})
                for fname in sorted(os.listdir(model_dir)):
                    if fname.endswith("_tree.svg"):
                        found.append({"title": "Decision Tree", "filename": fname, "model_name": model_name})
                    elif fname.endswith("_shap_summary.png"):
                        found.append({"title": "SHAP Summary", "filename": fname, "model_name": model_name})
                if "model_visuals" not in job:
                    job["model_visuals"] = {}
                job["model_visuals"][model_name] = found

        job["status"] = "running"
        job["current_step"] = "Initializing"

        original_stdout = sys.stdout
        capture = ProgressCapture(original_stdout)

        try:
            from supervised.automl import AutoML

            automl = AutoML(
                results_path=results_path,
                mode=mode,
                ml_task=ml_task,
                total_time_limit=total_seconds,
                # model_time_limit=min(total_seconds // 3, 120),
                algorithms=algorithms if algorithms else "auto",
                train_ensemble=True,
                stack_models=False,
                explain_level=0,
                golden_features=False,
                features_selection=False,
                verbose=1,
                random_state=42,
                n_jobs=2,
            )

            sys.stdout = capture
            automl.fit(X, y)
            sys.stdout = original_stdout

            job["automl_results_path"] = results_path
            job["automl_object"] = automl

        except Exception as e:
            sys.stdout = original_stdout
            raise
        finally:
            sys.stdout = original_stdout

    def _load_final_results(self, job_id: str) -> None:
        job = self.jobs[job_id]
        results_path = job.get("results_path")
        if not results_path:
            return

        lb_path = os.path.join(results_path, "leaderboard.csv")
        if os.path.exists(lb_path):
            try:
                with open(lb_path, "r") as f:
                    reader = csv.DictReader(f)
                    job["leaderboard"] = [dict(row) for row in reader]
            except Exception:
                pass

        readme_path = os.path.join(results_path, "README.md")
        if os.path.exists(readme_path):
            try:
                with open(readme_path, "r") as f:
                    job["best_model_report"] = self._rewrite_job_report_markdown(job_id, f.read())
            except Exception:
                pass

        params_path = os.path.join(results_path, "params.json")
        if os.path.exists(params_path):
            try:
                with open(params_path, "r") as f:
                    params = json.load(f)
                    job["best_model"] = params.get("best_model", job.get("best_model"))
            except Exception:
                pass

        if "model_visuals" not in job:
            job["model_visuals"] = {}
        for model_name in os.listdir(results_path):
            model_dir = os.path.join(results_path, model_name)
            if os.path.isdir(model_dir) and not model_name.startswith("."):
                self._collect_visuals_for_dir(job, results_path, model_name)

        self._register_automl_model(job_id)

    def _collect_visuals_for_dir(self, job, results_path, model_name):
        model_dir = os.path.join(results_path, model_name)
        if not os.path.isdir(model_dir):
            return
        image_files = [
            "learning_curves.png", "permutation_importance.png",
            "confusion_matrix.png", "confusion_matrix_normalized.png",
            "roc_curve.png", "precision_recall_curve.png",
            "true_vs_predicted.png", "predicted_vs_residuals.png",
            "ks_statistic.png", "calibration_curve_curve.png",
            "cumulative_gains_curve.png", "lift_curve.png",
        ]
        found = []
        for fname in image_files:
            fpath = os.path.join(model_dir, fname)
            if os.path.exists(fpath):
                title = fname.replace(".png", "").replace("_", " ").title()
                found.append({"title": title, "filename": fname, "model_name": model_name})
        try:
            for fname in sorted(os.listdir(model_dir)):
                if fname.endswith("_tree.svg"):
                    found.append({"title": "Decision Tree", "filename": fname, "model_name": model_name})
                elif fname.endswith("_shap_summary.png"):
                    found.append({"title": "SHAP Summary", "filename": fname, "model_name": model_name})
        except Exception:
            pass
        job["model_visuals"][model_name] = found

    def get_model_report(self, job_id: str, model_name: str) -> Optional[Dict[str, Any]]:
        job = self.jobs.get(job_id)
        if not job:
            return None
        results_path = job.get("results_path")
        if not results_path:
            return None

        model_dir = os.path.join(results_path, model_name)
        if not os.path.isdir(model_dir):
            return None

        report: Dict[str, Any] = {"model_name": model_name}

        readme_path = os.path.join(model_dir, "README.md")
        if os.path.exists(readme_path):
            try:
                with open(readme_path, "r") as f:
                    report["readme"] = self._rewrite_model_report_markdown(job_id, model_name, f.read())
            except Exception:
                pass

        fw_path = os.path.join(model_dir, "framework.json")
        if os.path.exists(fw_path):
            try:
                with open(fw_path, "r") as f:
                    report["framework"] = json.load(f)
            except Exception:
                pass

        visuals = self._collect_model_visuals(model_dir, model_name)
        report["visuals"] = visuals

        return report

    def _collect_model_visuals(self, model_dir: str, model_name: str) -> List[Dict[str, str]]:
        visuals: List[Dict[str, str]] = []
        if not os.path.isdir(model_dir):
            return visuals

        image_files = {
            "learning_curves.png": "Learning Curves",
            "permutation_importance.png": "Feature Importance",
            "confusion_matrix.png": "Confusion Matrix",
            "confusion_matrix_normalized.png": "Normalized Confusion Matrix",
            "roc_curve.png": "ROC Curve",
            "precision_recall_curve.png": "Precision-Recall Curve",
            "true_vs_predicted.png": "True vs Predicted",
            "predicted_vs_residuals.png": "Predicted vs Residuals",
            "ks_statistic.png": "KS Statistic",
            "calibration_curve_curve.png": "Calibration Curve",
            "cumulative_gains_curve.png": "Cumulative Gains",
            "lift_curve.png": "Lift Curve",
        }

        for filename, title in image_files.items():
            path = os.path.join(model_dir, filename)
            if os.path.exists(path):
                visuals.append({
                    "title": title,
                    "filename": filename,
                    "path": path,
                    "type": "image",
                })

        for fname in sorted(os.listdir(model_dir)):
            if fname.endswith("_tree.svg"):
                path = os.path.join(model_dir, fname)
                visuals.append({
                    "title": "Decision Tree",
                    "filename": fname,
                    "path": path,
                    "type": "svg",
                })
            elif fname.endswith("_shap_summary.png"):
                path = os.path.join(model_dir, fname)
                visuals.append({
                    "title": f"SHAP Summary ({fname.replace('_shap_summary.png', '')})",
                    "filename": fname,
                    "path": path,
                    "type": "image",
                })
            elif fname.endswith("_shap_dependence.png"):
                path = os.path.join(model_dir, fname)
                visuals.append({
                    "title": f"SHAP Dependence ({fname.replace('_shap_dependence.png', '')})",
                    "filename": fname,
                    "path": path,
                    "type": "image",
                })

        return visuals

    def _strip_internal_readme_links(self, markdown: str) -> str:
        cleaned = re.sub(r"^\[<< Go back\]\(\.\./README\.md\)\s*$", "", markdown, flags=re.MULTILINE)
        return cleaned.strip()

    def _rewrite_markdown_image_links(self, markdown: str, url_builder) -> str:
        if not markdown:
            return markdown

        def replace_markdown_image(match: re.Match[str]) -> str:
            alt_text = match.group(1)
            target = match.group(2).strip()
            normalized_target = target.strip("<>")
            if (
                not normalized_target
                or normalized_target.startswith(("/", "#", "data:"))
                or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", normalized_target)
            ):
                return match.group(0)

            resolved_url = url_builder(normalized_target)
            if not resolved_url:
                return match.group(0)
            return f"![{alt_text}]({resolved_url})"

        return re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", replace_markdown_image, markdown)

    def _rewrite_model_report_markdown(self, job_id: str, model_name: str, markdown: str) -> str:
        def build_url(target: str) -> Optional[str]:
            filename = os.path.basename(target)
            if not self.get_visual_file(job_id, model_name, filename):
                return None
            return (
                f"/emly/api/prediction/automl/train/{quote(job_id, safe='')}"
                f"/model/{quote(model_name, safe='')}/visual/{quote(filename, safe='')}"
            )

        cleaned_markdown = self._strip_internal_readme_links(markdown)
        return self._rewrite_markdown_image_links(cleaned_markdown, build_url)

    def _rewrite_job_report_markdown(self, job_id: str, markdown: str) -> str:
        def build_url(target: str) -> Optional[str]:
            filename = os.path.basename(target)
            if not self.get_job_asset_file(job_id, filename):
                return None
            return f"/emly/api/prediction/automl/train/{quote(job_id, safe='')}/asset/{quote(filename, safe='')}"

        return self._rewrite_markdown_image_links(markdown, build_url)

    def get_visual_file(self, job_id: str, model_name: str, filename: str) -> Optional[str]:
        job = self.jobs.get(job_id)
        if not job:
            return None
        results_path = job.get("results_path")
        if not results_path:
            return None
        safe_filename = os.path.basename(filename)
        if safe_filename != filename:
            return None
        file_path = os.path.join(results_path, model_name, safe_filename)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return file_path
        return None

    def get_job_asset_file(self, job_id: str, filename: str) -> Optional[str]:
        job = self.jobs.get(job_id)
        if not job:
            return None
        results_path = job.get("results_path")
        if not results_path:
            return None
        safe_filename = os.path.basename(filename)
        if safe_filename != filename:
            return None
        file_path = os.path.join(results_path, safe_filename)
        if os.path.exists(file_path) and os.path.isfile(file_path):
            return file_path
        return None

    def get_top_visuals(self, job_id: str) -> List[Dict[str, str]]:
        job = self.jobs.get(job_id)
        if not job:
            return []
        results_path = job.get("results_path")
        if not results_path:
            return []

        visuals: List[Dict[str, str]] = []
        best_model = job.get("best_model")
        if best_model:
            best_dir = os.path.join(results_path, best_model)
            if os.path.isdir(best_dir):
                for v in self._collect_model_visuals(best_dir, best_model):
                    v["model_name"] = best_model
                    visuals.append(v)

        return visuals

    def _register_automl_model(self, job_id: str) -> None:
        job = self.jobs[job_id]
        automl_obj = job.get("automl_object")
        if not automl_obj:
            return
        config = job.get("config", {})
        best_model_name = job.get("best_model", "unknown")
        leaderboard = job.get("leaderboard", [])
        best_row = dict(leaderboard[0]) if leaderboard else {}
        best_metric = None
        try:
            best_metric = float(best_row.get("metric_value"))
        except (TypeError, ValueError):
            best_metric = None
        best_metric_type = str(best_row.get("metric_type") or "").strip() or None
        model_id = str(job.get("registered_model_id") or uuid.uuid4())
        job["registered_model_id"] = model_id
        job["registered_model_type"] = "mljar"

        self._mljar_models[model_id] = {
            "model_id": model_id,
            "automl_object": automl_obj,
            "results_path": job.get("results_path"),
            "dataset_id": job.get("dataset_id"),
            "problem_type": config.get("problem_type", "regression"),
            "target_column": config.get("target_column"),
            "feature_columns": config.get("feature_columns"),
            "algorithm": f"MLJAR AutoML ({best_model_name})",
            "algorithm_label": f"MLJAR AutoML — {best_model_name}",
            "mode": config.get("mode", "Perform"),
            "best_metric": best_metric,
            "best_metric_type": best_metric_type,
            "created_at": datetime.utcnow().isoformat(),
        }
        self._persist_registered_model(job_id, model_id)

    def get_mljar_model_info(self, model_id: str) -> Optional[Dict[str, Any]]:
        info = self._mljar_models.get(model_id)
        if not info:
            return None
        return {
            "model_id": info["model_id"],
            "algorithm": info["algorithm"],
            "algorithm_label": info["algorithm_label"],
            "problem_type": info["problem_type"],
            "target_column": info["target_column"],
            "feature_columns": info["feature_columns"],
            "dataset_id": info["dataset_id"],
            "best_metric": info["best_metric"],
            "best_metric_type": info.get("best_metric_type"),
            "created_at": info["created_at"],
            "source": "mljar_automl",
        }

    def list_mljar_models(self) -> List[Dict[str, Any]]:
        return [self.get_mljar_model_info(mid) for mid in self._mljar_models]

    def predict_with_mljar(self, model_id: str, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
        info = self._mljar_models.get(model_id)
        if not info:
            raise ValueError("MLJAR model not found.")

        automl_obj = info.get("automl_object")
        if not automl_obj:
            results_path = str(info.get("results_path") or "").strip()
            if not results_path:
                raise ValueError("MLJAR model object not available (server may have restarted).")
            from supervised.automl import AutoML
            automl_obj = AutoML(results_path=results_path)
            info["automl_object"] = automl_obj

        feature_cols = info.get("feature_columns") or []
        df = pd.DataFrame(rows)
        if feature_cols:
            missing = [c for c in feature_cols if c not in df.columns]
            if missing:
                raise ValueError(f"Missing feature columns: {', '.join(missing)}")
            df = df[feature_cols]

        predictions = automl_obj.predict(df)
        if hasattr(predictions, "tolist"):
            predictions = predictions.tolist()
        predictions = [
            value.item() if hasattr(value, "item") else value
            for value in list(predictions)
        ]

        return {
            "model_id": model_id,
            "predictions": predictions,
        }

    def _persist_registered_model(self, job_id: str, model_id: str) -> None:
        job = self.jobs.get(job_id)
        info = self._mljar_models.get(model_id)
        if not job or not info:
            return

        from app.services.prediction_service import prediction_service

        meta_path = prediction_service.models_dir / f"{model_id}.meta.json"
        if meta_path.exists():
            return

        problem_type = str(info.get("problem_type") or "regression")
        best_metric = info.get("best_metric")
        best_metric_type = info.get("best_metric_type")
        metrics: Dict[str, Any] = {}
        if problem_type == "regression" and best_metric_type in {"r2", "rmse", "mse", "mae", "mape", "spearman", "pearson"}:
            metrics[best_metric_type] = best_metric
        elif problem_type == "classification" and best_metric_type in {"accuracy", "auc", "f1", "average_precision", "logloss"}:
            metrics[best_metric_type] = best_metric

        # Determine accuracy_score for display in model list
        # Only use "higher is better" metrics: r2, accuracy, auc, f1, average_precision
        # Do NOT use loss metrics: logloss, rmse, mse, mae, mape
        accuracy_score = None
        if best_metric is not None:
            higher_is_better = {"r2", "accuracy", "auc", "f1", "average_precision", "spearman", "pearson"}
            if best_metric_type in higher_is_better:
                accuracy_score = best_metric

        created_at = str(info.get("created_at") or datetime.utcnow().isoformat())
        report = {
            "model_id": model_id,
            "problem_type": problem_type,
            "algorithm_label": info.get("algorithm_label"),
            "target_column": info.get("target_column"),
            "feature_columns": info.get("feature_columns") or [],
            "created_at": created_at,
            "evaluation_method": f"MLJAR AutoML ({info.get('mode', 'Perform')} mode)",
            "metrics": metrics,
            "diagnostics": {},
            "important_features": [],
            "vif_table": [],
            "business_meaning": None,
        }

        metadata = {
            "model_id": model_id,
            "dataset_id": info.get("dataset_id"),
            "problem_type": problem_type,
            "algorithm": "mljar_automl",
            "algorithm_label": info.get("algorithm_label"),
            "target_column": info.get("target_column"),
            "feature_columns": info.get("feature_columns") or [],
            "metrics": metrics,
            "diagnostics": {},
            "important_features": [],
            "vif_table": [],
            "evaluation_method": f"MLJAR AutoML ({info.get('mode', 'Perform')} mode)",
            "report": report,
            "accuracy_score": accuracy_score,
            "created_at": created_at,
            "source": "mljar_automl",
            "job_id": job_id,
            "results_path": info.get("results_path"),
            "best_model_name": job.get("best_model"),
            "best_metric": best_metric,
            "best_metric_type": best_metric_type,
        }

        prediction_service.persist_external_model(
            metadata=metadata,
            bundle={"pipeline": None, "metadata": metadata},
            activate_if_missing=True,
        )

    # ── Utils ───────────────────────────────────────────────────────

    def _extract_json(self, text: str) -> Dict[str, Any]:
        try:
            start = text.index("{")
            depth = 0
            for i in range(start, len(text)):
                if text[i] == "{":
                    depth += 1
                elif text[i] == "}":
                    depth -= 1
                    if depth == 0:
                        return json.loads(text[start:i + 1])
        except (ValueError, json.JSONDecodeError):
            pass
        return {}


automl_service = AutoMLService()
