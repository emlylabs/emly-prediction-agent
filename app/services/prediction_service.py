import asyncio
import hashlib
import json
import logging
import math
import os
import re
import shutil
import uuid
import zipfile
from io import BytesIO
from pathlib import Path
from datetime import time
from statistics import NormalDist
import datetime as dt
import warnings
from typing import Any, Dict, List, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from fastapi import UploadFile
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import (
    GradientBoostingRegressor,
    GradientBoostingClassifier,
    RandomForestRegressor,
    RandomForestClassifier,
)
from sklearn.linear_model import ElasticNet, Lasso, LinearRegression, Ridge, LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    confusion_matrix,
    roc_auc_score,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    silhouette_score,
    davies_bouldin_score,
)
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder, QuantileTransformer, LabelEncoder
from sklearn.svm import SVC, SVR
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor
from scipy.stats import kendalltau

from app.connectors import ConnectorType, create_connector
from app.models.prediction_data import PredictionDataTable
from app.models.dashboard import DashboardConfigTable
from app.services.llm_service import llm_service

log = logging.getLogger(__name__)

ALLOWED_DATASET_EXTENSIONS = {".csv", ".xlsx", ".xls", ".json"}
ALLOWED_UPLOAD_EXTENSIONS = ALLOWED_DATASET_EXTENSIONS | {".zip"}
SQL_TABLE_IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$")
UNIT_CONVERSION_FACTORS: Dict[str, Dict[str, float]] = {
    "length": {
        "mm": 0.001,
        "cm": 0.01,
        "m": 1.0,
        "km": 1000.0,
        "in": 0.0254,
        "ft": 0.3048,
        "yd": 0.9144,
        "mi": 1609.344,
        "nmi": 1852.0,
    },
    "mass": {
        "mg": 1e-6,
        "g": 0.001,
        "kg": 1.0,
        "t": 1000.0,
        "lb": 0.45359237,
        "oz": 0.028349523125,
        "stone": 6.35029318,
    },
    "time": {
        "ms": 0.001,
        "s": 1.0,
        "min": 60.0,
        "h": 3600.0,
        "day": 86400.0,
        "week": 604800.0,
    },
    "volume": {
        "ml": 0.001,
        "l": 1.0,
        "m3": 1000.0,
        "tsp_us": 0.00492892159375,
        "tbsp_us": 0.01478676478125,
        "floz_us": 0.0295735295625,
        "cup_us": 0.2365882365,
        "pt_us": 0.473176473,
        "qt_us": 0.946352946,
        "gal_us": 3.785411784,
        "gal_imp": 4.54609,
    },
    "area": {
        "mm2": 1e-6,
        "cm2": 1e-4,
        "m2": 1.0,
        "km2": 1e6,
        "in2": 0.00064516,
        "ft2": 0.09290304,
        "yd2": 0.83612736,
        "acre": 4046.8564224,
        "ha": 10000.0,
        "mi2": 2589988.110336,
    },
    "speed": {
        "mps": 1.0,
        "kmh": 0.2777777777777778,
        "mph": 0.44704,
        "knot": 0.5144444444444445,
        "fps": 0.3048,
    },
    "pressure": {
        "pa": 1.0,
        "kpa": 1000.0,
        "mpa": 1_000_000.0,
        "bar": 100000.0,
        "mbar": 100.0,
        "psi": 6894.757293168361,
        "mmhg": 133.32236842105263,
        "inhg": 3386.388157894737,
        "atm": 101325.0,
    },
    "energy": {
        "j": 1.0,
        "kj": 1000.0,
        "cal": 4.184,
        "kcal": 4184.0,
        "wh": 3600.0,
        "kwh": 3_600_000.0,
        "btu": 1055.05585262,
    },
}
UNIT_ALIASES: Dict[str, str] = {
    # Length
    "millimeter": "mm",
    "millimeters": "mm",
    "millimetre": "mm",
    "millimetres": "mm",
    "centimeter": "cm",
    "centimeters": "cm",
    "centimetre": "cm",
    "centimetres": "cm",
    "meter": "m",
    "meters": "m",
    "metre": "m",
    "metres": "m",
    "kilometer": "km",
    "kilometers": "km",
    "kilometre": "km",
    "kilometres": "km",
    "inch": "in",
    "inches": "in",
    "foot": "ft",
    "feet": "ft",
    "yard": "yd",
    "yards": "yd",
    "mile": "mi",
    "miles": "mi",
    "nauticalmile": "nmi",
    "nauticalmiles": "nmi",
    # Mass
    "milligram": "mg",
    "milligrams": "mg",
    "gram": "g",
    "grams": "g",
    "kilogram": "kg",
    "kilograms": "kg",
    "tonne": "t",
    "tonnes": "t",
    "metricton": "t",
    "metrictons": "t",
    "pound": "lb",
    "pounds": "lb",
    "lbs": "lb",
    "ounce": "oz",
    "ounces": "oz",
    # Time
    "millisecond": "ms",
    "milliseconds": "ms",
    "second": "s",
    "seconds": "s",
    "sec": "s",
    "minute": "min",
    "minutes": "min",
    "hour": "h",
    "hours": "h",
    "hr": "h",
    "day": "day",
    "days": "day",
    "week": "week",
    "weeks": "week",
    # Temperature
    "c": "c",
    "celsius": "c",
    "centigrade": "c",
    "f": "f",
    "fahrenheit": "f",
    "k": "k",
    "kelvin": "k",
    # Area
    "squaremeter": "m2",
    "squaremeters": "m2",
    "squaremetre": "m2",
    "squaremetres": "m2",
    "squarekilometer": "km2",
    "squarekilometers": "km2",
    "squaremile": "mi2",
    "squaremiles": "mi2",
    "squarefoot": "ft2",
    "squarefeet": "ft2",
    "squareinch": "in2",
    "squareinches": "in2",
    "acre": "acre",
    "acres": "acre",
    "hectare": "ha",
    "hectares": "ha",
    # Volume
    "milliliter": "ml",
    "milliliters": "ml",
    "millilitre": "ml",
    "millilitres": "ml",
    "liter": "l",
    "liters": "l",
    "litre": "l",
    "litres": "l",
    "cubicmeter": "m3",
    "cubicmeters": "m3",
    "cubicmetre": "m3",
    "cubicmetres": "m3",
    "usgallon": "gal_us",
    "usgallons": "gal_us",
    "imperialgallon": "gal_imp",
    "imperialgallons": "gal_imp",
    # Speed
    "m/s": "mps",
    "meterpersecond": "mps",
    "meterspersecond": "mps",
    "metrepersecond": "mps",
    "metrespersecond": "mps",
    "km/h": "kmh",
    "kph": "kmh",
    "kilometerperhour": "kmh",
    "kilometersperhour": "kmh",
    "mph": "mph",
    "mileperhour": "mph",
    "milesperhour": "mph",
    "kts": "knot",
    "knots": "knot",
    # Pressure
    "pascal": "pa",
    "pascals": "pa",
    "kilopascal": "kpa",
    "kilopascals": "kpa",
    "megapascal": "mpa",
    "megapascals": "mpa",
    "millibar": "mbar",
    "millibars": "mbar",
    # Energy
    "joule": "j",
    "joules": "j",
    "kilojoule": "kj",
    "kilojoules": "kj",
}

PREP_COPILOT_SUPPORTED_OPERATIONS = {
    "drop_duplicates",
    "sort_rows",
    "drop_missing_rows",
    "fill_missing",
    "replace_values",
    "split_column",
    "merge_columns",
    "add_row",
    "derive_column",
    "group_aggregate",
    "trim_whitespace",
    "cast_column",
    "unit_convert",
    "bin_numeric_categories",
    "auto_binning",
    "min_max_scaling",
    "max_absolute_scaling",
    "mean_normalization",
    "unit_vector_scaling",
    "decimal_scaling",
    "z_score_scaling",
    "robust_scaling",
    "log_scaling",
    "quantile_transform",
    "rename_column",
    "clip_values",
    "remove_outliers_iqr",
    "encode_categorical",
    "normalize_text_case",
    "extract_date_part",
    "date_diff_days",
    "datetime_floor",
    "shift_column",
    "cyclical_encoding",
    "significant_lags_kendall",
    "rolling_window_stats_nested",
    "math_scalar",
    "math_unary",
    "math_between_columns",
    "merge_datasets",
    "stats_zscore",
    "stats_percentile_rank",
    "stats_rolling_mean",
    "stats_variance",
    "stats_std",
    "delete_rows",
    "delete_rows_condition",
    "duplicate_rows",
    "duplicate_column",
    "delete_columns",
}


PREP_COPILOT_OPERATION_ALIASES: Dict[str, str] = {
    "add_column": "merge_columns",
    "add_columns": "merge_columns",
    "concat_columns": "merge_columns",
    "concatenate_columns": "merge_columns",
    "custom_formula_column": "derive_column",
    "delete_column": "delete_columns",
    "duplicate_columns": "duplicate_column",
    "convert_units": "unit_convert",
    "unit_conversion": "unit_convert",
    "column_shift": "shift_column",
    "auto_bin": "auto_binning",
    "automatic_binning": "auto_binning",
    "numeric_to_categories": "bin_numeric_categories",
    "cyclical_encode": "cyclical_encoding",
    "kendall_lags": "significant_lags_kendall",
    "nested_rolling_stats": "rolling_window_stats_nested",
    "zscore": "stats_zscore",
    "percentile_rank": "stats_percentile_rank",
}


def _build_prepare_operation_catalog() -> Dict[str, Dict[str, Any]]:
    catalog: Dict[str, Dict[str, Any]] = {}
    for op in sorted(PREP_COPILOT_SUPPORTED_OPERATIONS):
        catalog[op] = {
            "operation": op,
            "description": f"Apply `{op}` on the active prepare dataset.",
            "required_params": [],
            "optional_params": [],
            "notes": "",
        }

    catalog.update(
        {
            "fill_missing": {
                "operation": "fill_missing",
                "description": "Fill null values for one column or all columns.",
                "required_params": [],
                "optional_params": ["column", "strategy", "value"],
                "notes": "strategy: value|mean|median|mode|ffill|bfill",
            },
            "drop_missing_rows": {
                "operation": "drop_missing_rows",
                "description": "Drop rows with missing values.",
                "required_params": [],
                "optional_params": ["subset", "how"],
                "notes": "how: any|all",
            },
            "drop_duplicates": {
                "operation": "drop_duplicates",
                "description": "Remove duplicate rows.",
                "required_params": [],
                "optional_params": ["subset"],
                "notes": "",
            },
            "replace_values": {
                "operation": "replace_values",
                "description": "Find/replace values in one column or all columns.",
                "required_params": ["find", "replace"],
                "optional_params": ["column", "regex", "case_sensitive"],
                "notes": "",
            },
            "sort_rows": {
                "operation": "sort_rows",
                "description": "Sort rows by one column.",
                "required_params": ["column"],
                "optional_params": ["ascending"],
                "notes": "ascending defaults to true",
            },
            "delete_rows_condition": {
                "operation": "delete_rows_condition",
                "description": "Delete rows matching a condition.",
                "required_params": ["column", "condition"],
                "optional_params": ["value", "case_sensitive"],
                "notes": "value is optional only for is_null/is_not_null",
            },
            "normalize_text_case": {
                "operation": "normalize_text_case",
                "description": "Normalize text to lower, upper, or title case for one column.",
                "required_params": ["column"],
                "optional_params": ["case"],
                "notes": "case: lower|upper|title",
            },
            "split_column": {
                "operation": "split_column",
                "description": "Split a text column into multiple columns.",
                "required_params": ["column", "delimiter"],
                "optional_params": ["maxsplit", "new_columns", "drop_original"],
                "notes": "",
            },
            "merge_columns": {
                "operation": "merge_columns",
                "description": "Concatenate multiple columns into a new column.",
                "required_params": ["columns", "new_name"],
                "optional_params": ["separator", "drop_source", "skip_null"],
                "notes": "Use this to combine latitude/longitude into gps column.",
            },
            "derive_column": {
                "operation": "derive_column",
                "description": "Create a new column using pandas eval expression.",
                "required_params": ["new_name", "expression"],
                "optional_params": [],
                "notes": "Formula/eval operation; not for string concat with delimiters.",
            },
            "group_aggregate": {
                "operation": "group_aggregate",
                "description": "Group by columns and aggregate.",
                "required_params": ["group_by", "aggregations"],
                "optional_params": [],
                "notes": "aggregations: list of {column, func, alias}",
            },
            "cast_column": {
                "operation": "cast_column",
                "description": "Cast a column to a target dtype.",
                "required_params": ["column", "dtype"],
                "optional_params": [],
                "notes": "dtype: numeric|string|datetime|boolean",
            },
            "rename_column": {
                "operation": "rename_column",
                "description": "Rename a column.",
                "required_params": ["column", "new_name"],
                "optional_params": [],
                "notes": "",
            },
            "delete_columns": {
                "operation": "delete_columns",
                "description": "Delete one or more columns.",
                "required_params": ["columns"],
                "optional_params": [],
                "notes": "",
            },
            "math_scalar": {
                "operation": "math_scalar",
                "description": "Apply scalar math on a numeric column.",
                "required_params": ["column", "operator", "value"],
                "optional_params": ["new_name"],
                "notes": "operator: add|subtract|multiply|divide|power",
            },
            "math_unary": {
                "operation": "math_unary",
                "description": "Apply unary math function on a numeric column.",
                "required_params": ["column", "func"],
                "optional_params": ["decimals", "new_name"],
                "notes": "func: abs|sqrt|log|log10|exp|round|floor|ceil|negate",
            },
            "math_between_columns": {
                "operation": "math_between_columns",
                "description": "Apply math between two numeric columns.",
                "required_params": ["left_column", "right_column", "operator", "new_name"],
                "optional_params": [],
                "notes": "operator: add|subtract|multiply|divide",
            },
            "merge_datasets": {
                "operation": "merge_datasets",
                "description": "Append datasets or join by keys.",
                "required_params": ["mode"],
                "optional_params": ["source_dataset_ids", "source_dataset_id", "join_how", "left_keys", "right_keys"],
                "notes": "mode: append or join_on_keys",
            },
            "stats_zscore": {
                "operation": "stats_zscore",
                "description": "Create zscore feature column.",
                "required_params": ["column"],
                "optional_params": ["new_name"],
                "notes": "",
            },
            "stats_percentile_rank": {
                "operation": "stats_percentile_rank",
                "description": "Create percentile rank feature column.",
                "required_params": ["column"],
                "optional_params": ["new_name"],
                "notes": "",
            },
            "stats_rolling_mean": {
                "operation": "stats_rolling_mean",
                "description": "Create rolling mean feature column.",
                "required_params": ["column", "window"],
                "optional_params": ["min_periods", "new_name"],
                "notes": "",
            },
            "stats_variance": {
                "operation": "stats_variance",
                "description": "Create variance feature column.",
                "required_params": ["column"],
                "optional_params": ["new_name"],
                "notes": "",
            },
            "stats_std": {
                "operation": "stats_std",
                "description": "Create std-dev feature column.",
                "required_params": ["column"],
                "optional_params": ["new_name"],
                "notes": "",
            },
        }
    )
    return catalog


PREP_COPILOT_OPERATION_CATALOG = _build_prepare_operation_catalog()


class PredictionService:
    def __init__(self) -> None:
        self.base_dir = Path("./data/prediction")
        self.datasets_dir = self.base_dir / "datasets"
        self.models_dir = self.base_dir / "models"
        self.active_model_file = self.models_dir / "active_model.json"
        self.prep_dir = self.base_dir / "prepare_sessions"
        self.prep_plans_dir = self.base_dir / "prepare_plans"
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.datasets_dir.mkdir(parents=True, exist_ok=True)
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.prep_dir.mkdir(parents=True, exist_ok=True)
        self.prep_plans_dir.mkdir(parents=True, exist_ok=True)
        self.uploads_dir = self.base_dir / "uploads"
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        self.connectors_file = self.base_dir / "connectors.json"
        self.prep_plan_index_path = self.prep_plans_dir / "index.json"
        self.jobs: Dict[str, Dict[str, Any]] = {}
        self.prep_sessions: Dict[str, Dict[str, Any]] = {}
        self.upload_sessions: Dict[str, Dict[str, Any]] = {}
        self.algorithms: Dict[str, Dict[str, Any]] = {
            # ── Regression ──────────────────────────────────────────────
            "linear_regression": {
                "label": "Linear Regression",
                "problem_type": "regression",
                "estimator": LinearRegression,
                "params": [
                    {"name": "fit_intercept", "type": "bool", "default": True},
                ],
            },
            "ridge": {
                "label": "Ridge Regression",
                "problem_type": "regression",
                "estimator": Ridge,
                "params": [
                    {"name": "alpha", "type": "float", "default": 1.0},
                    {"name": "fit_intercept", "type": "bool", "default": True},
                ],
            },
            "lasso": {
                "label": "Lasso Regression",
                "problem_type": "regression",
                "estimator": Lasso,
                "params": [
                    {"name": "alpha", "type": "float", "default": 1.0},
                    {"name": "max_iter", "type": "int", "default": 1000},
                ],
            },
            "elastic_net": {
                "label": "Elastic Net",
                "problem_type": "regression",
                "estimator": ElasticNet,
                "params": [
                    {"name": "alpha", "type": "float", "default": 1.0},
                    {"name": "l1_ratio", "type": "float", "default": 0.5},
                    {"name": "max_iter", "type": "int", "default": 1000},
                ],
            },
            "random_forest": {
                "label": "Random Forest Regressor",
                "problem_type": "regression",
                "estimator": RandomForestRegressor,
                "params": [
                    {"name": "n_estimators", "type": "int", "default": 200},
                    {"name": "max_depth", "type": "int_optional", "default": None},
                    {"name": "min_samples_split", "type": "int", "default": 2},
                ],
            },
            "gradient_boosting": {
                "label": "Gradient Boosting Regressor",
                "problem_type": "regression",
                "estimator": GradientBoostingRegressor,
                "params": [
                    {"name": "n_estimators", "type": "int", "default": 100},
                    {"name": "learning_rate", "type": "float", "default": 0.1},
                    {"name": "max_depth", "type": "int", "default": 3},
                ],
            },
            "svr": {
                "label": "Support Vector Regressor",
                "problem_type": "regression",
                "estimator": SVR,
                "params": [
                    {"name": "C", "type": "float", "default": 1.0},
                    {"name": "kernel", "type": "str", "default": "rbf"},
                    {"name": "epsilon", "type": "float", "default": 0.1},
                ],
            },
            "knn_regressor": {
                "label": "K-Nearest Neighbors Regressor",
                "problem_type": "regression",
                "estimator": KNeighborsRegressor,
                "params": [
                    {"name": "n_neighbors", "type": "int", "default": 5},
                    {"name": "weights", "type": "str", "default": "uniform"},
                ],
            },
            # ── Classification ──────────────────────────────────────────
            "logistic_regression": {
                "label": "Logistic Regression",
                "problem_type": "classification",
                "estimator": LogisticRegression,
                "params": [
                    {"name": "C", "type": "float", "default": 1.0},
                    {"name": "max_iter", "type": "int", "default": 1000},
                    {"name": "solver", "type": "str", "default": "lbfgs"},
                ],
            },
            "decision_tree_classifier": {
                "label": "Decision Tree Classifier",
                "problem_type": "classification",
                "estimator": DecisionTreeClassifier,
                "params": [
                    {"name": "max_depth", "type": "int_optional", "default": None},
                    {"name": "min_samples_split", "type": "int", "default": 2},
                    {"name": "criterion", "type": "str", "default": "gini"},
                ],
            },
            "random_forest_classifier": {
                "label": "Random Forest Classifier",
                "problem_type": "classification",
                "estimator": RandomForestClassifier,
                "params": [
                    {"name": "n_estimators", "type": "int", "default": 200},
                    {"name": "max_depth", "type": "int_optional", "default": None},
                    {"name": "min_samples_split", "type": "int", "default": 2},
                ],
            },
            "gradient_boosting_classifier": {
                "label": "Gradient Boosting Classifier",
                "problem_type": "classification",
                "estimator": GradientBoostingClassifier,
                "params": [
                    {"name": "n_estimators", "type": "int", "default": 100},
                    {"name": "learning_rate", "type": "float", "default": 0.1},
                    {"name": "max_depth", "type": "int", "default": 3},
                ],
            },
            "knn_classifier": {
                "label": "K-Nearest Neighbors Classifier",
                "problem_type": "classification",
                "estimator": KNeighborsClassifier,
                "params": [
                    {"name": "n_neighbors", "type": "int", "default": 5},
                    {"name": "weights", "type": "str", "default": "uniform"},
                ],
            },
            "svc": {
                "label": "Support Vector Classifier",
                "problem_type": "classification",
                "estimator": SVC,
                "params": [
                    {"name": "C", "type": "float", "default": 1.0},
                    {"name": "kernel", "type": "str", "default": "rbf"},
                    {"name": "probability", "type": "bool", "default": True},
                ],
            },
            # ── Clustering ──────────────────────────────────────────────
            "kmeans": {
                "label": "K-Means Clustering",
                "problem_type": "clustering",
                "estimator": KMeans,
                "params": [
                    {"name": "n_clusters", "type": "int", "default": 5},
                    {"name": "n_init", "type": "int", "default": 10},
                    {"name": "max_iter", "type": "int", "default": 300},
                ],
            },
            "dbscan": {
                "label": "DBSCAN Clustering",
                "problem_type": "clustering",
                "estimator": DBSCAN,
                "params": [
                    {"name": "eps", "type": "float", "default": 0.5},
                    {"name": "min_samples", "type": "int", "default": 5},
                ],
            },
            "agglomerative": {
                "label": "Agglomerative Clustering",
                "problem_type": "clustering",
                "estimator": AgglomerativeClustering,
                "params": [
                    {"name": "n_clusters", "type": "int", "default": 2},
                    {"name": "linkage", "type": "str", "default": "ward"},
                ],
            },
        }
        self.default_folder = "default"
        self._get_dataset_folder_path(self.default_folder).mkdir(parents=True, exist_ok=True)
        self._ensure_connectors_store()
        self._migrate_legacy_dataset_metadata()

    def _sanitize_folder_name(self, folder: str) -> str:
        name = (folder or "").strip().lower()
        name = re.sub(r"[^a-z0-9._-]", "_", name)
        return name.strip("._-") or "folder"

    def _sanitize_folder_path(self, folder_path: str) -> str:
        raw = (folder_path or self.default_folder).strip().strip("/")
        parts = [self._sanitize_folder_name(part) for part in raw.split("/") if part.strip()]
        return "/".join(parts) if parts else self.default_folder

    def _get_dataset_folder_path(self, folder: str) -> Path:
        safe_folder = self._sanitize_folder_path(folder)
        return self.datasets_dir / Path(safe_folder)

    def _resolve_or_create_folder(self, folder: Optional[str]) -> Dict[str, Any]:
        safe_path = self._sanitize_folder_path(folder or self.default_folder)
        existing = PredictionDataTable.get_folder_by_path(safe_path)
        if existing:
            return existing

        current_parent_id: Optional[str] = None
        current_path = ""
        for segment in safe_path.split("/"):
            current_path = f"{current_path}/{segment}" if current_path else segment
            found = PredictionDataTable.get_folder_by_path(current_path)
            if found:
                current_parent_id = found["id"]
                continue
            created = PredictionDataTable.create_folder(
                name=segment,
                normalized_name=segment,
                parent_id=current_parent_id,
            )
            current_parent_id = created["id"]
        return PredictionDataTable.get_folder_by_path(safe_path) or PredictionDataTable.default_folder

    def list_folders(self) -> List[Dict[str, Any]]:
        folders = PredictionDataTable.list_folders()
        return [
            {
                "id": folder["id"],
                "name": folder["path"],
                "display_name": folder["name"],
                "parent_id": folder["parent_id"],
                "path": folder["path"],
                "file_count": folder["file_count"],
                "created_on": folder["created_on"],
                "updated_on": folder["updated_on"],
            }
            for folder in folders
        ]

    def create_folder(self, name: str, parent_folder_id: Optional[str] = None) -> Dict[str, Any]:
        safe_name = self._sanitize_folder_name(name)
        folder = PredictionDataTable.create_folder(
            name=name.strip(),
            normalized_name=safe_name,
            parent_id=parent_folder_id,
        )
        self._get_dataset_folder_path(folder["path"]).mkdir(parents=True, exist_ok=True)
        return {
            "id": folder["id"],
            "name": folder["path"],
            "display_name": folder["name"],
            "parent_id": folder["parent_id"],
            "path": folder["path"],
            "file_count": folder["file_count"],
            "created_on": folder["created_on"],
            "updated_on": folder["updated_on"],
        }

    def rename_folder(self, folder_id: str, name: str) -> Dict[str, Any]:
        target = PredictionDataTable.get_folder_by_id(folder_id)
        if not target:
            raise ValueError("Folder not found.")

        target_id = str(target.get("id") or "")
        target_path = str(target.get("path") or "")
        default_folder_id = str((PredictionDataTable.default_folder or {}).get("id") or "")
        if target_id == default_folder_id or target_path == self.default_folder:
            raise ValueError("Default folder cannot be renamed.")

        safe_name = self._sanitize_folder_name(name)
        if not safe_name:
            raise ValueError("Folder name is required.")

        parent_path = ""
        if "/" in target_path:
            parent_path = target_path.rsplit("/", 1)[0]
        new_base_path = f"{parent_path}/{safe_name}" if parent_path else safe_name
        if new_base_path == target_path:
            updated = PredictionDataTable.rename_folder(
                folder_id=folder_id,
                name=name.strip() or safe_name,
                normalized_name=safe_name,
            )
            if not updated:
                raise ValueError("Folder not found.")
            return {
                "id": updated["id"],
                "name": updated["path"],
                "display_name": updated["name"],
                "parent_id": updated["parent_id"],
                "path": updated["path"],
                "file_count": updated["file_count"],
                "created_on": updated["created_on"],
                "updated_on": updated["updated_on"],
            }

        old_dir = self._get_dataset_folder_path(target_path)
        new_dir = self._get_dataset_folder_path(new_base_path)
        if new_dir.exists() and new_dir != old_dir:
            raise ValueError("A folder with this name already exists.")

        affected_datasets = [
            dataset
            for dataset in self.list_datasets()
            if str(dataset.get("folder") or "") == target_path
            or str(dataset.get("folder") or "").startswith(f"{target_path}/")
        ]

        if old_dir.exists():
            new_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(old_dir), str(new_dir))
        else:
            new_dir.mkdir(parents=True, exist_ok=True)

        updated = PredictionDataTable.rename_folder(
            folder_id=folder_id,
            name=name.strip() or safe_name,
            normalized_name=safe_name,
        )
        if not updated:
            raise ValueError("Folder not found.")

        for dataset in affected_datasets:
            dataset_id = str(dataset.get("dataset_id") or "").strip()
            if not dataset_id:
                continue
            old_dataset_path = Path(str(dataset.get("path") or ""))
            new_dataset_path = old_dataset_path
            try:
                rel_path = old_dataset_path.relative_to(old_dir)
                new_dataset_path = new_dir / rel_path
            except Exception:
                old_dir_text = str(old_dir)
                old_dataset_path_text = str(old_dataset_path)
                if old_dataset_path_text.startswith(old_dir_text):
                    suffix = old_dataset_path_text[len(old_dir_text):].lstrip("/")
                    new_dataset_path = new_dir / suffix
            metadata_payload = dict(dataset.get("metadata", {}))
            metadata_payload["folder_renamed_at"] = pd.Timestamp.utcnow().isoformat()
            metadata_payload["folder_renamed_from"] = target_path
            metadata_payload["folder_renamed_to"] = new_base_path
            PredictionDataTable.update_dataset(
                dataset_id=dataset_id,
                file_path=str(new_dataset_path),
                metadata=metadata_payload,
            )

        for session in self.prep_sessions.values():
            source_folder = str(session.get("source_folder") or "")
            if source_folder == target_path or source_folder.startswith(f"{target_path}/"):
                session["source_folder"] = source_folder.replace(target_path, new_base_path, 1)
            source_path = str(session.get("source_path") or "")
            old_dir_text = str(old_dir)
            if source_path.startswith(old_dir_text):
                suffix = source_path[len(old_dir_text):].lstrip("/")
                session["source_path"] = str(new_dir / suffix)

        return {
            "id": updated["id"],
            "name": updated["path"],
            "display_name": updated["name"],
            "parent_id": updated["parent_id"],
            "path": updated["path"],
            "file_count": updated["file_count"],
            "created_on": updated["created_on"],
            "updated_on": updated["updated_on"],
        }

    def delete_folder(self, folder_id: str) -> Dict[str, Any]:
        target = PredictionDataTable.get_folder_by_id(folder_id)
        if not target:
            raise ValueError("Folder not found.")

        default_folder_id = str((PredictionDataTable.default_folder or {}).get("id") or "")
        target_id = str(target.get("id") or "")
        target_path = str(target.get("path") or "")
        if target_id == default_folder_id or target_path == self.default_folder:
            raise ValueError("Default folder cannot be deleted.")

        subtree = PredictionDataTable.list_folder_subtree(folder_id=folder_id)
        if not subtree:
            raise ValueError("Folder not found.")

        subtree_paths = [str(folder.get("path") or "") for folder in subtree]
        subtree_ids = [str(folder.get("id") or "") for folder in subtree]
        subtree_path_prefixes = [f"{path}/" for path in subtree_paths if path]

        datasets_to_delete = []
        for dataset in self.list_datasets():
            dataset_folder = str(dataset.get("folder") or "")
            if dataset_folder in subtree_paths:
                datasets_to_delete.append(dataset)
                continue
            if any(dataset_folder.startswith(prefix) for prefix in subtree_path_prefixes):
                datasets_to_delete.append(dataset)

        deleted_datasets = 0
        failed_datasets: List[Dict[str, Any]] = []
        for dataset in datasets_to_delete:
            dataset_id = str(dataset.get("dataset_id") or "")
            if not dataset_id:
                continue
            try:
                self.delete_dataset(dataset_id=dataset_id)
                deleted_datasets += 1
            except Exception as e:
                failed_datasets.append({
                    "dataset_id": dataset_id,
                    "original_filename": dataset.get("original_filename"),
                    "error": str(e),
                })

        deleted_folders = PredictionDataTable.delete_folders_by_ids(folder_ids=subtree_ids)
        folder_dir = self._get_dataset_folder_path(target_path)
        if folder_dir.exists():
            shutil.rmtree(folder_dir, ignore_errors=True)

        return {
            "folder_id": target_id,
            "path": target_path,
            "deleted": deleted_folders > 0,
            "deleted_folders_count": int(deleted_folders),
            "deleted_datasets_count": int(deleted_datasets),
            "failed_datasets_count": int(len(failed_datasets)),
            "failed_datasets": failed_datasets,
        }

    def list_algorithms(self, problem_type: Optional[str] = None) -> List[Dict[str, Any]]:
        return [
            {
                "id": algo_id,
                "label": cfg["label"],
                "problem_type": cfg.get("problem_type", "regression"),
                "params": cfg["params"],
            }
            for algo_id, cfg in self.algorithms.items()
            if problem_type is None or cfg.get("problem_type") == problem_type
        ]

    def list_datasets(self) -> List[Dict[str, Any]]:
        return PredictionDataTable.list_datasets()

    def _ensure_connectors_store(self) -> None:
        if self.connectors_file.exists():
            return
        self._save_json(self.connectors_file, {"connectors": []})

    def _load_connectors_store(self) -> List[Dict[str, Any]]:
        self._ensure_connectors_store()
        try:
            with self.connectors_file.open("r", encoding="utf-8") as f:
                payload = json.load(f)
        except Exception:
            return []
        connectors = payload.get("connectors", [])
        if not isinstance(connectors, list):
            return []
        return [item for item in connectors if isinstance(item, dict)]

    def _save_connectors_store(self, connectors: List[Dict[str, Any]]) -> None:
        self._save_json(self.connectors_file, {"connectors": connectors})

    def _sanitize_connector_payload(self, connector: Dict[str, Any]) -> Dict[str, Any]:
        data = dict(connector)
        config = dict(data.get("config") or {})
        if "password" in config and config["password"]:
            config["password"] = "********"
        if "private_key_passphrase" in config and config["private_key_passphrase"]:
            config["private_key_passphrase"] = "********"
        data["config"] = config
        return data

    def _normalize_dataset_filename(self, dataset_name: str) -> str:
        requested = str(dataset_name or "").strip()
        if not requested:
            raise ValueError("dataset_name is required.")
        safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", requested)
        extension = Path(safe_name).suffix.lower()
        if extension not in ALLOWED_DATASET_EXTENSIONS:
            safe_name = f"{safe_name}.csv"
        return safe_name

    def _quote_table_identifier(self, table_name: str) -> str:
        token = str(table_name or "").strip()
        if not SQL_TABLE_IDENTIFIER_PATTERN.match(token):
            raise ValueError(f"Invalid table name '{table_name}'.")
        if "." in token:
            schema, table = token.split(".", 1)
            return f'"{schema}"."{table}"'
        return f'"{token}"'

    def list_connectors(self) -> List[Dict[str, Any]]:
        connectors = self._load_connectors_store()
        connectors.sort(key=lambda item: str(item.get("created_at", "")), reverse=True)
        return [self._sanitize_connector_payload(connector) for connector in connectors]

    def save_sql_connector(
        self,
        name: str,
        driver: str,
        database: str,
        host: Optional[str] = None,
        port: Optional[int] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        read_only: bool = True,
        connect_timeout_seconds: int = 10,
        mysql_ssl_mode: str = "disable",
        mysql_ssl_ca: Optional[str] = None,
        mysql_ssl_cert: Optional[str] = None,
        mysql_ssl_key: Optional[str] = None,
        mysql_ssl_check_hostname: bool = False,
    ) -> Dict[str, Any]:
        connector_name = str(name or "").strip()
        if not connector_name:
            raise ValueError("Connector name is required.")

        config: Dict[str, Any] = {
            "name": connector_name,
            "driver": str(driver or "").strip().lower(),
            "database": str(database or "").strip(),
            "read_only": bool(read_only),
            "connect_timeout_seconds": int(connect_timeout_seconds or 10),
        }
        if not config["database"]:
            raise ValueError("Database is required.")
        if host:
            config["host"] = str(host).strip()
        if port:
            config["port"] = int(port)
        if username:
            config["username"] = str(username).strip()
        if password:
            config["password"] = str(password)
        if config["driver"] == "mysql":
            config["mysql_ssl_mode"] = str(mysql_ssl_mode or "disable")
            if mysql_ssl_ca:
                config["mysql_ssl_ca"] = str(mysql_ssl_ca).strip()
            if mysql_ssl_cert:
                config["mysql_ssl_cert"] = str(mysql_ssl_cert).strip()
            if mysql_ssl_key:
                config["mysql_ssl_key"] = str(mysql_ssl_key).strip()
            config["mysql_ssl_check_hostname"] = bool(mysql_ssl_check_hostname)

        # Validate at creation time.
        try:
            connector = create_connector(ConnectorType.SQL, config)
            with connector:
                health = connector.health_check()
            if not health.healthy:
                raise ValueError(str((health.details or {}).get("error") or "Connector health check failed."))
        except Exception as e:
            raise ValueError(f"Invalid connector configuration: {e}")

        connectors = self._load_connectors_store()
        existing_index = next(
            (
                idx for idx, row in enumerate(connectors)
                if str(row.get("name", "")).strip().lower() == connector_name.lower()
                and str(row.get("connector_type", "")).strip().lower() == ConnectorType.SQL.value
            ),
            None,
        )
        now = pd.Timestamp.utcnow().isoformat()
        if existing_index is not None:
            existing = connectors[existing_index]
            updated = {
                **existing,
                "name": connector_name,
                "connector_type": ConnectorType.SQL.value,
                "config": config,
                "updated_at": now,
            }
            connectors[existing_index] = updated
            self._save_connectors_store(connectors)
            return self._sanitize_connector_payload(updated)

        connector_row = {
            "connector_id": str(uuid.uuid4()),
            "name": connector_name,
            "connector_type": ConnectorType.SQL.value,
            "config": config,
            "created_at": now,
            "updated_at": now,
        }
        connectors.append(connector_row)
        self._save_connectors_store(connectors)
        return self._sanitize_connector_payload(connector_row)

    def update_sql_connector(
        self,
        connector_id: str,
        name: str,
        driver: str,
        database: str,
        host: Optional[str] = None,
        port: Optional[int] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
        read_only: bool = True,
        connect_timeout_seconds: int = 10,
        mysql_ssl_mode: str = "disable",
        mysql_ssl_ca: Optional[str] = None,
        mysql_ssl_cert: Optional[str] = None,
        mysql_ssl_key: Optional[str] = None,
        mysql_ssl_check_hostname: bool = False,
    ) -> Dict[str, Any]:
        existing = self._get_connector_by_id(connector_id)
        connector_type = str(existing.get("connector_type", "")).strip().lower()
        if connector_type != ConnectorType.SQL.value:
            raise ValueError("Only SQL connector update is implemented.")

        connector_name = str(name or "").strip()
        if not connector_name:
            raise ValueError("Connector name is required.")

        previous_config = dict(existing.get("config") or {})
        normalized_driver = str(driver or "").strip().lower()
        config: Dict[str, Any] = {
            "name": connector_name,
            "driver": normalized_driver,
            "database": str(database or "").strip(),
            "read_only": bool(read_only),
            "connect_timeout_seconds": int(connect_timeout_seconds or 10),
        }
        if not config["database"]:
            raise ValueError("Database is required.")

        if normalized_driver != "sqlite":
            config["host"] = str(host if host is not None else previous_config.get("host") or "").strip()
            config["port"] = int(port if port is not None else previous_config.get("port") or 0)
            config["username"] = str(username if username is not None else previous_config.get("username") or "").strip()
            if password is not None and str(password).strip():
                config["password"] = str(password)
            elif previous_config.get("password"):
                config["password"] = previous_config.get("password")
            else:
                raise ValueError("Password is required.")

        if normalized_driver == "mysql":
            config["mysql_ssl_mode"] = str(mysql_ssl_mode or previous_config.get("mysql_ssl_mode") or "disable")
            if mysql_ssl_ca is not None:
                token = str(mysql_ssl_ca).strip()
                if token:
                    config["mysql_ssl_ca"] = token
            elif previous_config.get("mysql_ssl_ca"):
                config["mysql_ssl_ca"] = previous_config.get("mysql_ssl_ca")

            if mysql_ssl_cert is not None:
                token = str(mysql_ssl_cert).strip()
                if token:
                    config["mysql_ssl_cert"] = token
            elif previous_config.get("mysql_ssl_cert"):
                config["mysql_ssl_cert"] = previous_config.get("mysql_ssl_cert")

            if mysql_ssl_key is not None:
                token = str(mysql_ssl_key).strip()
                if token:
                    config["mysql_ssl_key"] = token
            elif previous_config.get("mysql_ssl_key"):
                config["mysql_ssl_key"] = previous_config.get("mysql_ssl_key")

            config["mysql_ssl_check_hostname"] = bool(
                mysql_ssl_check_hostname if mysql_ssl_check_hostname is not None
                else previous_config.get("mysql_ssl_check_hostname", False)
            )

        try:
            connector = create_connector(ConnectorType.SQL, config)
            with connector:
                health = connector.health_check()
            if not health.healthy:
                raise ValueError(str((health.details or {}).get("error") or "Connector health check failed."))
        except Exception as e:
            raise ValueError(f"Invalid connector configuration: {e}")

        connectors = self._load_connectors_store()
        for row in connectors:
            if str(row.get("connector_id", "")) == str(connector_id):
                continue
            if str(row.get("connector_type", "")).strip().lower() != ConnectorType.SQL.value:
                continue
            if str(row.get("name", "")).strip().lower() == connector_name.lower():
                raise ValueError("A SQL connector with this name already exists.")

        now = pd.Timestamp.utcnow().isoformat()
        updated = None
        for idx, row in enumerate(connectors):
            if str(row.get("connector_id", "")) != str(connector_id):
                continue
            row["name"] = connector_name
            row["connector_type"] = ConnectorType.SQL.value
            row["config"] = config
            row["updated_at"] = now
            connectors[idx] = row
            updated = row
            break
        if updated is None:
            raise ValueError("Connector not found.")

        self._save_connectors_store(connectors)
        return self._sanitize_connector_payload(updated)

    def save_sftp_connector(
        self,
        name: str,
        host: str,
        port: int = 22,
        username: str = "",
        password: Optional[str] = None,
        private_key_path: Optional[str] = None,
        private_key_passphrase: Optional[str] = None,
        remote_path: str = ".",
        connect_timeout_seconds: int = 15,
        recursive: bool = True,
        strict_host_key_check: bool = False,
        known_hosts_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        connector_name = str(name or "").strip()
        if not connector_name:
            raise ValueError("Connector name is required.")

        config: Dict[str, Any] = {
            "name": connector_name,
            "host": str(host or "").strip(),
            "port": int(port or 22),
            "username": str(username or "").strip(),
            "remote_path": str(remote_path or ".").strip() or ".",
            "connect_timeout_seconds": int(connect_timeout_seconds or 15),
            "recursive": bool(recursive),
            "strict_host_key_check": bool(strict_host_key_check),
        }
        if password:
            config["password"] = str(password)
        if private_key_path:
            config["private_key_path"] = str(private_key_path).strip()
        if private_key_passphrase:
            config["private_key_passphrase"] = str(private_key_passphrase)
        if known_hosts_path:
            config["known_hosts_path"] = str(known_hosts_path).strip()
        if not config["host"]:
            raise ValueError("host is required.")
        if not config["username"]:
            raise ValueError("username is required.")
        if not config.get("password") and not config.get("private_key_path"):
            raise ValueError("Either password or private_key_path is required.")

        try:
            connector = create_connector(ConnectorType.SFTP, config)
            with connector:
                health = connector.health_check()
            if not health.healthy:
                raise ValueError(str((health.details or {}).get("error") or "Connector health check failed."))
        except Exception as e:
            raise ValueError(f"Invalid connector configuration: {e}")

        connectors = self._load_connectors_store()
        existing_index = next(
            (
                idx for idx, row in enumerate(connectors)
                if str(row.get("name", "")).strip().lower() == connector_name.lower()
                and str(row.get("connector_type", "")).strip().lower() == ConnectorType.SFTP.value
            ),
            None,
        )
        now = pd.Timestamp.utcnow().isoformat()
        if existing_index is not None:
            existing = connectors[existing_index]
            updated = {
                **existing,
                "name": connector_name,
                "connector_type": ConnectorType.SFTP.value,
                "config": config,
                "updated_at": now,
            }
            connectors[existing_index] = updated
            self._save_connectors_store(connectors)
            return self._sanitize_connector_payload(updated)

        connector_row = {
            "connector_id": str(uuid.uuid4()),
            "name": connector_name,
            "connector_type": ConnectorType.SFTP.value,
            "config": config,
            "created_at": now,
            "updated_at": now,
        }
        connectors.append(connector_row)
        self._save_connectors_store(connectors)
        return self._sanitize_connector_payload(connector_row)

    def update_sftp_connector(
        self,
        connector_id: str,
        name: str,
        host: str,
        port: int = 22,
        username: str = "",
        password: Optional[str] = None,
        private_key_path: Optional[str] = None,
        private_key_passphrase: Optional[str] = None,
        remote_path: str = ".",
        connect_timeout_seconds: int = 15,
        recursive: bool = True,
        strict_host_key_check: bool = False,
        known_hosts_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        existing = self._get_connector_by_id(connector_id)
        connector_type = str(existing.get("connector_type", "")).strip().lower()
        if connector_type != ConnectorType.SFTP.value:
            raise ValueError("Only SFTP connector update is implemented.")

        connector_name = str(name or "").strip()
        if not connector_name:
            raise ValueError("Connector name is required.")

        previous_config = dict(existing.get("config") or {})
        config: Dict[str, Any] = {
            "name": connector_name,
            "host": str(host if host is not None else previous_config.get("host") or "").strip(),
            "port": int(port if port is not None else previous_config.get("port") or 22),
            "username": str(username if username is not None else previous_config.get("username") or "").strip(),
            "remote_path": str(remote_path if remote_path is not None else previous_config.get("remote_path") or ".").strip() or ".",
            "connect_timeout_seconds": int(connect_timeout_seconds if connect_timeout_seconds is not None else previous_config.get("connect_timeout_seconds") or 15),
            "recursive": bool(recursive if recursive is not None else previous_config.get("recursive", True)),
            "strict_host_key_check": bool(
                strict_host_key_check if strict_host_key_check is not None else previous_config.get("strict_host_key_check", False)
            ),
        }

        if password is not None and str(password).strip():
            config["password"] = str(password)
        elif previous_config.get("password"):
            config["password"] = previous_config.get("password")

        if private_key_path is not None and str(private_key_path).strip():
            config["private_key_path"] = str(private_key_path).strip()
        elif previous_config.get("private_key_path"):
            config["private_key_path"] = previous_config.get("private_key_path")

        if private_key_passphrase is not None and str(private_key_passphrase).strip():
            config["private_key_passphrase"] = str(private_key_passphrase)
        elif previous_config.get("private_key_passphrase"):
            config["private_key_passphrase"] = previous_config.get("private_key_passphrase")

        if known_hosts_path is not None and str(known_hosts_path).strip():
            config["known_hosts_path"] = str(known_hosts_path).strip()
        elif previous_config.get("known_hosts_path"):
            config["known_hosts_path"] = previous_config.get("known_hosts_path")

        if not config["host"]:
            raise ValueError("host is required.")
        if not config["username"]:
            raise ValueError("username is required.")
        if not config.get("password") and not config.get("private_key_path"):
            raise ValueError("Either password or private_key_path is required.")

        try:
            connector = create_connector(ConnectorType.SFTP, config)
            with connector:
                health = connector.health_check()
            if not health.healthy:
                raise ValueError(str((health.details or {}).get("error") or "Connector health check failed."))
        except Exception as e:
            raise ValueError(f"Invalid connector configuration: {e}")

        connectors = self._load_connectors_store()
        for row in connectors:
            if str(row.get("connector_id", "")) == str(connector_id):
                continue
            if str(row.get("connector_type", "")).strip().lower() != ConnectorType.SFTP.value:
                continue
            if str(row.get("name", "")).strip().lower() == connector_name.lower():
                raise ValueError("An SFTP connector with this name already exists.")

        now = pd.Timestamp.utcnow().isoformat()
        updated = None
        for idx, row in enumerate(connectors):
            if str(row.get("connector_id", "")) != str(connector_id):
                continue
            row["name"] = connector_name
            row["connector_type"] = ConnectorType.SFTP.value
            row["config"] = config
            row["updated_at"] = now
            connectors[idx] = row
            updated = row
            break
        if updated is None:
            raise ValueError("Connector not found.")

        self._save_connectors_store(connectors)
        return self._sanitize_connector_payload(updated)

    def delete_connector(self, connector_id: str) -> Dict[str, Any]:
        target_id = str(connector_id or "").strip()
        if not target_id:
            raise ValueError("connector_id is required.")
        connectors = self._load_connectors_store()
        remaining: List[Dict[str, Any]] = []
        deleted_row = None
        for row in connectors:
            if str(row.get("connector_id", "")) == target_id:
                deleted_row = row
                continue
            remaining.append(row)
        if deleted_row is None:
            raise ValueError("Connector not found.")
        self._save_connectors_store(remaining)
        return {
            "connector_id": target_id,
            "name": str(deleted_row.get("name", "")),
            "deleted": True,
        }

    def _get_connector_by_id(self, connector_id: str) -> Dict[str, Any]:
        normalized_id = str(connector_id or "").strip()
        if not normalized_id:
            raise ValueError("connector_id is required.")
        connectors = self._load_connectors_store()
        for connector in connectors:
            if str(connector.get("connector_id", "")) == normalized_id:
                return connector
        raise ValueError("Connector not found.")

    def test_connector(self, connector_id: str) -> Dict[str, Any]:
        connector_meta = self._get_connector_by_id(connector_id)
        connector_type = str(connector_meta.get("connector_type", "")).strip().lower()
        try:
            if connector_type == ConnectorType.SQL.value:
                sql_connector = create_connector(ConnectorType.SQL, dict(connector_meta.get("config") or {}))
                with sql_connector:
                    health = sql_connector.health_check().model_dump()
                    sample_tables = sql_connector.list_tables()[:20]
            elif connector_type == ConnectorType.SFTP.value:
                sftp_connector = create_connector(ConnectorType.SFTP, dict(connector_meta.get("config") or {}))
                with sftp_connector:
                    health = sftp_connector.health_check().model_dump()
                    sample_tables = sftp_connector.list_files()[:20]
            else:
                raise ValueError("Connector testing not implemented for this connector type.")
        except Exception as e:
            raise ValueError(f"Connector test failed: {e}")
        return {
            "connector": self._sanitize_connector_payload(connector_meta),
            "health": health,
            "tables": sample_tables,
        }

    def list_sql_connector_tables(self, connector_id: str) -> Dict[str, Any]:
        connector_meta = self._get_connector_by_id(connector_id)
        connector_type = str(connector_meta.get("connector_type", "")).strip().lower()
        directories: List[Dict[str, Any]] = []
        try:
            if connector_type == ConnectorType.SQL.value:
                sql_connector = create_connector(ConnectorType.SQL, dict(connector_meta.get("config") or {}))
                with sql_connector:
                    tables = sql_connector.list_tables()
            elif connector_type == ConnectorType.SFTP.value:
                sftp_connector = create_connector(ConnectorType.SFTP, dict(connector_meta.get("config") or {}))
                with sftp_connector:
                    directories = sftp_connector.list_directories(
                        root=str((connector_meta.get("config") or {}).get("remote_path") or "."),
                        recursive=True,
                    )
                tables = [str(row.get("path") or "") for row in directories if str(row.get("path") or "").strip()]
            else:
                raise ValueError("Connector table discovery not implemented for this connector type.")
        except Exception as e:
            raise ValueError(f"Failed to list tables: {e}")

        existing_mappings = connector_meta.get("table_mappings") or []
        mapping_by_table = {
            str(row.get("source_table", "")).strip(): dict(row)
            for row in existing_mappings
            if isinstance(row, dict) and str(row.get("source_table", "")).strip()
        }

        default_folder = self.default_folder
        normalized_mappings: List[Dict[str, Any]] = []
        for table in tables:
            table_name = str(table or "").strip()
            if not table_name:
                continue
            existing = mapping_by_table.get(table_name, {})
            if connector_type == ConnectorType.SFTP.value:
                default_dataset = Path(table_name).name or "root.csv"
            else:
                default_dataset = table_name
            directory_meta = None
            if connector_type == ConnectorType.SFTP.value:
                directory_meta = next(
                    (row for row in directories if str(row.get("path") or "").strip() == table_name),
                    None,
                )
            normalized_mappings.append(
                {
                    "source_table": table_name,
                    "dataset_name": str(existing.get("dataset_name") or self._normalize_dataset_filename(default_dataset)),
                    "folder": str(existing.get("folder") or default_folder),
                    "enabled": bool(existing.get("enabled", False)),
                    "dataset_id": existing.get("dataset_id"),
                    "last_synced_at": existing.get("last_synced_at"),
                    "last_error": existing.get("last_error"),
                    "file_count": int((directory_meta or {}).get("file_count", 0)) if connector_type == ConnectorType.SFTP.value else None,
                    "folder_count": int((directory_meta or {}).get("folder_count", 0)) if connector_type == ConnectorType.SFTP.value else None,
                    "depth": int((directory_meta or {}).get("depth", 0)) if connector_type == ConnectorType.SFTP.value else None,
                    "parent_path": (directory_meta or {}).get("parent_path") if connector_type == ConnectorType.SFTP.value else None,
                }
            )

        connectors = self._load_connectors_store()
        now = pd.Timestamp.utcnow().isoformat()
        for idx, row in enumerate(connectors):
            if str(row.get("connector_id", "")) == str(connector_meta.get("connector_id", "")):
                row["table_mappings"] = normalized_mappings
                row["updated_at"] = now
                connectors[idx] = row
                connector_meta = row
                break
        self._save_connectors_store(connectors)

        return {
            "connector": self._sanitize_connector_payload(connector_meta),
            "tables": tables,
            "table_mappings": normalized_mappings,
        }

    def save_sql_connector_table_mappings(
        self,
        connector_id: str,
        table_mappings: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        connector_meta = self._get_connector_by_id(connector_id)
        connector_type = str(connector_meta.get("connector_type", "")).strip().lower()
        if connector_type not in {ConnectorType.SQL.value, ConnectorType.SFTP.value}:
            raise ValueError("Connector table mapping is not implemented for this connector type.")

        normalized: List[Dict[str, Any]] = []
        seen_tables: set[str] = set()
        for raw in table_mappings or []:
            source_table = str((raw or {}).get("source_table") or "").strip()
            if not source_table:
                continue
            if source_table in seen_tables:
                continue
            seen_tables.add(source_table)
            if connector_type == ConnectorType.SQL.value and not SQL_TABLE_IDENTIFIER_PATTERN.match(source_table):
                raise ValueError(f"Invalid source table '{source_table}'.")

            dataset_name = self._normalize_dataset_filename(str((raw or {}).get("dataset_name") or f"{source_table}.csv"))
            folder = self._sanitize_folder_path(str((raw or {}).get("folder") or self.default_folder))
            normalized.append(
                {
                    "source_table": source_table,
                    "dataset_name": dataset_name,
                    "folder": folder,
                    "enabled": bool((raw or {}).get("enabled", False)),
                    "dataset_id": (raw or {}).get("dataset_id"),
                    "last_synced_at": (raw or {}).get("last_synced_at"),
                    "last_error": (raw or {}).get("last_error"),
                }
            )

        connectors = self._load_connectors_store()
        now = pd.Timestamp.utcnow().isoformat()
        updated = None
        for idx, row in enumerate(connectors):
            if str(row.get("connector_id", "")) != str(connector_meta.get("connector_id", "")):
                continue
            row["table_mappings"] = normalized
            row["updated_at"] = now
            connectors[idx] = row
            updated = row
            break
        if updated is None:
            raise ValueError("Connector not found.")
        self._save_connectors_store(connectors)
        return self._sanitize_connector_payload(updated)

    def _load_sql_table_dataframe(self, sql_connector: Any, table_name: str, max_rows: int) -> pd.DataFrame:
        safe_table = self._quote_table_identifier(table_name)
        sql = f"SELECT * FROM {safe_table} LIMIT {int(max_rows)}"
        rows = sql_connector.query(sql)
        if not rows:
            return pd.DataFrame()
        return pd.DataFrame(rows)

    def _load_dataframe_from_bytes(self, file_bytes: bytes, extension: str) -> pd.DataFrame:
        suffix = str(extension or "").lower()
        payload = BytesIO(file_bytes)
        if suffix == ".csv":
            return pd.read_csv(payload)
        if suffix in {".xlsx", ".xls"}:
            return pd.read_excel(payload)
        if suffix == ".json":
            try:
                return pd.read_json(payload)
            except ValueError:
                payload.seek(0)
                return pd.read_json(payload, lines=True)
        raise ValueError(f"Unsupported file format '{suffix}'.")

    def _load_sftp_file_dataframe(self, sftp_connector: Any, remote_path: str, max_rows: int) -> pd.DataFrame:
        file_path = str(remote_path or "").strip()
        if not file_path:
            raise ValueError("source_table is required.")
        extension = Path(file_path).suffix.lower()
        if extension != ".csv":
            raise ValueError(f"Unsupported remote file format '{extension}'.")
        content = sftp_connector.read_file(file_path)
        if not content:
            return pd.DataFrame()
        df = self._load_dataframe_from_bytes(content, extension)
        if int(max_rows) > 0 and len(df) > int(max_rows):
            df = df.head(int(max_rows)).copy()
        return df

    def _overwrite_existing_dataset_from_dataframe(
        self,
        dataset_id: str,
        df: pd.DataFrame,
        desired_filename: str,
        source: str,
        metadata_overrides: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if df.empty:
            raise ValueError("Table returned zero rows.")
        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Mapped dataset not found.")

        normalized_filename = self._normalize_dataset_filename(desired_filename)
        if str(dataset_meta.get("original_filename") or "") != normalized_filename:
            dataset_meta = self.rename_dataset(dataset_id=dataset_id, filename=normalized_filename)

        dataset_path = Path(str(dataset_meta.get("path", "")))
        if not dataset_path.exists():
            dataset_path.parent.mkdir(parents=True, exist_ok=True)
        self._write_dataframe(dataset_path, df)

        schema = self._infer_schema(df)
        records = self._records_from_dataframe(df)
        metadata_payload = dict(dataset_meta.get("metadata", {}))
        metadata_payload["source"] = source
        metadata_payload["schema_detected_at"] = pd.Timestamp.utcnow().isoformat()
        if metadata_overrides:
            metadata_payload.update(metadata_overrides)

        PredictionDataTable.replace_dataset_rows(dataset_id=dataset_id, rows=records, schema=schema)
        updated = PredictionDataTable.update_dataset(
            dataset_id=dataset_id,
            rows=int(len(df)),
            schema=schema,
            file_size=dataset_path.stat().st_size if dataset_path.exists() else None,
            file_hash=self._hash_file(dataset_path),
            metadata=metadata_payload,
        )
        if not updated:
            raise ValueError("Failed to update dataset.")
        with_insights = self._compute_and_persist_dataset_insights(dataset_id=dataset_id)
        return with_insights or PredictionDataTable.get_dataset_by_id(dataset_id) or updated

    def sync_sql_connector_tables(
        self,
        connector_id: str,
        max_rows_per_table: int = 500000,
    ) -> Dict[str, Any]:
        connector_meta = self._get_connector_by_id(connector_id)
        connector_type = str(connector_meta.get("connector_type", "")).strip().lower()
        if connector_type == ConnectorType.SFTP.value:
            return self.sync_sftp_connector_tables(
                connector_id=connector_id,
                max_rows_per_table=max_rows_per_table,
            )
        if connector_type != ConnectorType.SQL.value:
            raise ValueError("Connector sync is not implemented for this connector type.")

        table_mappings = connector_meta.get("table_mappings") or []
        enabled_mappings = [m for m in table_mappings if isinstance(m, dict) and bool(m.get("enabled"))]
        if not enabled_mappings:
            raise ValueError("No enabled table mappings found. Select tables to sync first.")

        sql_connector = create_connector(ConnectorType.SQL, dict(connector_meta.get("config") or {}))
        results: List[Dict[str, Any]] = []
        now = pd.Timestamp.utcnow().isoformat()

        try:
            with sql_connector:
                for mapping in enabled_mappings:
                    source_table = str(mapping.get("source_table") or "").strip()
                    dataset_name = self._normalize_dataset_filename(str(mapping.get("dataset_name") or f"{source_table}.csv"))
                    folder = self._sanitize_folder_path(str(mapping.get("folder") or self.default_folder))
                    mapped_dataset_id = str(mapping.get("dataset_id") or "").strip()
                    try:
                        df = self._load_sql_table_dataframe(
                            sql_connector=sql_connector,
                            table_name=source_table,
                            max_rows=int(max_rows_per_table),
                        )
                        if df.empty:
                            raise ValueError("Table returned zero rows.")

                        if mapped_dataset_id and self.get_dataset_by_id(mapped_dataset_id):
                            dataset = self._overwrite_existing_dataset_from_dataframe(
                                dataset_id=mapped_dataset_id,
                                df=df,
                                desired_filename=dataset_name,
                                source="connector_sql_table_sync",
                                metadata_overrides={
                                    "connector_id": str(connector_meta.get("connector_id", "")),
                                    "connector_name": str(connector_meta.get("name", "")),
                                    "source_table": source_table,
                                },
                            )
                            status = "updated"
                        else:
                            dataset = self._persist_dataframe_dataset(
                                df=df,
                                filename=dataset_name,
                                folder=folder,
                                source="connector_sql_table_sync",
                                metadata_overrides={
                                    "connector_id": str(connector_meta.get("connector_id", "")),
                                    "connector_name": str(connector_meta.get("name", "")),
                                    "source_table": source_table,
                                },
                            )
                            status = "created"

                        mapping["dataset_id"] = dataset.get("dataset_id")
                        mapping["dataset_name"] = dataset_name
                        mapping["folder"] = folder
                        mapping["last_synced_at"] = now
                        mapping["last_error"] = None
                        results.append(
                            {
                                "source_table": source_table,
                                "status": status,
                                "rows": int(len(df)),
                                "dataset": dataset,
                            }
                        )
                    except Exception as e:
                        mapping["last_error"] = str(e)
                        results.append(
                            {
                                "source_table": source_table,
                                "status": "failed",
                                "error": str(e),
                                "dataset": None,
                            }
                        )
        finally:
            sql_connector.close()

        connectors = self._load_connectors_store()
        updated_connector = None
        for idx, row in enumerate(connectors):
            if str(row.get("connector_id", "")) != str(connector_meta.get("connector_id", "")):
                continue
            row["table_mappings"] = table_mappings
            row["updated_at"] = now
            connectors[idx] = row
            updated_connector = row
            break
        if updated_connector is None:
            raise ValueError("Connector not found.")
        self._save_connectors_store(connectors)

        successful = [row for row in results if row.get("status") in {"created", "updated"}]
        failed = [row for row in results if row.get("status") == "failed"]
        return {
            "connector": self._sanitize_connector_payload(updated_connector),
            "results": results,
            "synced_count": len(successful),
            "failed_count": len(failed),
        }

    def _find_dataset_by_sftp_source_file(self, connector_id: str, source_file: str) -> Optional[Dict[str, Any]]:
        target_connector = str(connector_id or "").strip()
        target_source = str(source_file or "").strip()
        if not target_connector or not target_source:
            return None
        for dataset in self.list_datasets():
            metadata = dict((dataset or {}).get("metadata") or {})
            if str(metadata.get("connector_id") or "") != target_connector:
                continue
            if str(metadata.get("source_file") or "") != target_source:
                continue
            return dataset
        return None

    def sync_sftp_connector_tables(
        self,
        connector_id: str,
        max_rows_per_table: int = 500000,
    ) -> Dict[str, Any]:
        connector_meta = self._get_connector_by_id(connector_id)
        connector_type = str(connector_meta.get("connector_type", "")).strip().lower()
        if connector_type != ConnectorType.SFTP.value:
            raise ValueError("Only SFTP connector sync is implemented.")

        table_mappings = connector_meta.get("table_mappings") or []
        enabled_mappings = [m for m in table_mappings if isinstance(m, dict) and bool(m.get("enabled"))]
        if not enabled_mappings:
            raise ValueError("No enabled file mappings found. Select files to sync first.")

        sftp_connector = create_connector(ConnectorType.SFTP, dict(connector_meta.get("config") or {}))
        results: List[Dict[str, Any]] = []
        now = pd.Timestamp.utcnow().isoformat()

        try:
            with sftp_connector:
                for mapping in enabled_mappings:
                    source_directory = str(mapping.get("source_table") or "").strip()
                    if not source_directory:
                        continue
                    folder = self._sanitize_folder_path(str(mapping.get("folder") or self.default_folder))
                    imported_files = 0
                    failed_files = 0
                    last_dataset = None
                    directory_errors: List[str] = []

                    try:
                        remote_files = [
                            str(path)
                            for path in sftp_connector.list_files(directory=source_directory, recursive=True)
                            if Path(str(path)).suffix.lower() == ".csv"
                        ]
                        if not remote_files:
                            raise ValueError("No CSV files found in directory.")

                        for source_file in remote_files:
                            try:
                                df = self._load_sftp_file_dataframe(
                                    sftp_connector=sftp_connector,
                                    remote_path=source_file,
                                    max_rows=int(max_rows_per_table),
                                )
                                if df.empty:
                                    raise ValueError("Remote file returned zero rows.")

                                dataset_name = self._normalize_dataset_filename(Path(source_file).name)
                                existing_dataset = self._find_dataset_by_sftp_source_file(
                                    connector_id=str(connector_meta.get("connector_id", "")),
                                    source_file=source_file,
                                )
                                if existing_dataset:
                                    dataset = self._overwrite_existing_dataset_from_dataframe(
                                        dataset_id=str(existing_dataset.get("dataset_id")),
                                        df=df,
                                        desired_filename=dataset_name,
                                        source="connector_sftp_file_sync",
                                        metadata_overrides={
                                            "connector_id": str(connector_meta.get("connector_id", "")),
                                            "connector_name": str(connector_meta.get("name", "")),
                                            "source_file": source_file,
                                            "source_directory": source_directory,
                                        },
                                    )
                                else:
                                    dataset = self._persist_dataframe_dataset(
                                        df=df,
                                        filename=dataset_name,
                                        folder=folder,
                                        source="connector_sftp_file_sync",
                                        metadata_overrides={
                                            "connector_id": str(connector_meta.get("connector_id", "")),
                                            "connector_name": str(connector_meta.get("name", "")),
                                            "source_file": source_file,
                                            "source_directory": source_directory,
                                        },
                                    )
                                imported_files += 1
                                last_dataset = dataset
                            except Exception as file_error:
                                failed_files += 1
                                directory_errors.append(f"{source_file}: {file_error}")

                        if imported_files <= 0:
                            raise ValueError("No CSV files were synced successfully.")

                        mapping["dataset_id"] = (last_dataset or {}).get("dataset_id")
                        mapping["dataset_name"] = self._normalize_dataset_filename(Path(source_directory).name or "dataset.csv")
                        mapping["folder"] = folder
                        mapping["last_synced_at"] = now
                        mapping["last_error"] = "; ".join(directory_errors[:5]) if directory_errors else None
                        results.append(
                            {
                                "source_table": source_directory,
                                "status": "updated",
                                "rows": None,
                                "dataset": last_dataset,
                                "synced_files": int(imported_files),
                                "failed_files": int(failed_files),
                            }
                        )
                    except Exception as e:
                        mapping["last_error"] = str(e)
                        results.append(
                            {
                                "source_table": source_directory,
                                "status": "failed",
                                "error": str(e),
                                "dataset": None,
                            }
                        )
        finally:
            sftp_connector.close()

        connectors = self._load_connectors_store()
        updated_connector = None
        for idx, row in enumerate(connectors):
            if str(row.get("connector_id", "")) != str(connector_meta.get("connector_id", "")):
                continue
            row["table_mappings"] = table_mappings
            row["updated_at"] = now
            connectors[idx] = row
            updated_connector = row
            break
        if updated_connector is None:
            raise ValueError("Connector not found.")
        self._save_connectors_store(connectors)

        successful = [row for row in results if row.get("status") in {"created", "updated"}]
        failed = [row for row in results if row.get("status") == "failed"]
        return {
            "connector": self._sanitize_connector_payload(updated_connector),
            "results": results,
            "synced_count": len(successful),
            "failed_count": len(failed),
        }

    def _persist_dataframe_dataset(
        self,
        df: pd.DataFrame,
        filename: str,
        folder: Optional[str],
        source: str,
        metadata_overrides: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        if df.empty:
            raise ValueError("Query returned zero rows.")

        requested_name = str(filename or "").strip()
        if not requested_name:
            raise ValueError("filename is required.")

        safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", requested_name)
        extension = Path(safe_name).suffix.lower()
        if extension not in ALLOWED_DATASET_EXTENSIONS:
            safe_name = f"{safe_name}.csv"
            extension = ".csv"

        dataset_id = str(uuid.uuid4())
        folder_data = self._resolve_or_create_folder(folder or self.default_folder)
        target_folder = self._get_dataset_folder_path(str(folder_data.get("path") or self.default_folder))
        target_folder.mkdir(parents=True, exist_ok=True)
        stored_name = f"{dataset_id}_{safe_name}"
        target_path = target_folder / stored_name
        self._write_dataframe(target_path, df)
        schema = self._infer_schema(df)
        records = self._records_from_dataframe(df)
        metadata_payload = {
            "source": source,
            "schema_detected_at": pd.Timestamp.utcnow().isoformat(),
        }
        if metadata_overrides:
            metadata_payload.update(metadata_overrides)

        meta = PredictionDataTable.create_dataset(
            dataset_id=dataset_id,
            folder_id=folder_data["id"],
            original_filename=safe_name,
            stored_filename=stored_name,
            file_extension=extension,
            file_path=str(target_path),
            file_size=target_path.stat().st_size if target_path.exists() else None,
            mime_type=self._media_type_for_extension(extension),
            file_hash=self._hash_file(target_path),
            rows=int(len(df)),
            schema=schema,
            metadata=metadata_payload,
        )
        PredictionDataTable.replace_dataset_rows(dataset_id=dataset_id, rows=records, schema=schema)
        with_insights = self._compute_and_persist_dataset_insights(dataset_id=dataset_id)
        return with_insights or PredictionDataTable.get_dataset_by_id(dataset_id) or meta

    def run_sql_connector_query(
        self,
        connector_id: str,
        query: str,
        filename: str,
        folder: Optional[str] = None,
        max_rows: int = 200000,
    ) -> Dict[str, Any]:
        connector_meta = self._get_connector_by_id(connector_id)
        connector_type = str(connector_meta.get("connector_type", "")).strip().lower()
        if connector_type != ConnectorType.SQL.value:
            raise ValueError("Only SQL connector execution is implemented.")

        sql_query = str(query or "").strip()
        if not sql_query:
            raise ValueError("query is required.")

        try:
            sql_connector = create_connector(ConnectorType.SQL, dict(connector_meta.get("config") or {}))
            with sql_connector:
                rows = sql_connector.query(sql_query)
        except Exception as e:
            raise ValueError(f"Connector query failed: {e}")
        if not rows:
            raise ValueError("Query returned zero rows.")
        if len(rows) > int(max_rows):
            raise ValueError(f"Query returned {len(rows)} rows which exceeds the max_rows={int(max_rows)} limit.")

        df = pd.DataFrame(rows)
        imported = self._persist_dataframe_dataset(
            df=df,
            filename=filename,
            folder=folder,
            source="connector_sql_query",
            metadata_overrides={
                "connector_id": str(connector_meta.get("connector_id", "")),
                "connector_name": str(connector_meta.get("name", "")),
                "query": sql_query,
            },
        )
        return {
            "connector": self._sanitize_connector_payload(connector_meta),
            "dataset": imported,
            "rows": int(len(df)),
            "columns": [str(col) for col in df.columns.tolist()],
        }

    def list_models(self) -> List[Dict[str, Any]]:
        active_model_id = self.get_active_model_id()
        models: List[Dict[str, Any]] = []
        # Loss/error metrics that should NOT be used as accuracy_score
        loss_metrics = {"logloss", "rmse", "mse", "mae", "mape", "davies_bouldin_score"}
        for meta_path in sorted(self.models_dir.glob("*.meta.json"), reverse=True):
            try:
                with meta_path.open("r", encoding="utf-8") as f:
                    model = json.load(f)
                    if not model.get("created_at"):
                        try:
                            model["created_at"] = dt.datetime.utcfromtimestamp(meta_path.stat().st_mtime).isoformat()
                        except Exception:
                            model["created_at"] = None
                    metrics = model.get("metrics") or {}
                    best_metric_type = model.get("best_metric_type")
                    # Fix accuracy_score if it's a loss metric
                    if best_metric_type in loss_metrics:
                        model["accuracy_score"] = metrics.get("accuracy") or metrics.get("r2") or metrics.get("auc") or metrics.get("f1")
                    elif model.get("accuracy_score") is None:
                        model["accuracy_score"] = metrics.get("accuracy", metrics.get("r2"))
                    model["is_active"] = bool(active_model_id and model.get("model_id") == active_model_id)
                    models.append(model)
            except Exception as e:
                log.warning(f"Failed to read model metadata {meta_path}: {e}")
        return models

    def get_active_model_id(self) -> Optional[str]:
        if not self.active_model_file.exists():
            return None
        try:
            with self.active_model_file.open("r", encoding="utf-8") as f:
                data = json.load(f)
            model_id = data.get("model_id")
            return str(model_id) if model_id else None
        except Exception:
            return None

    def set_active_model(self, model_id: str) -> Dict[str, Any]:
        if not model_id:
            raise ValueError("model_id is required.")
        meta_path = self.models_dir / f"{model_id}.meta.json"
        if not meta_path.exists():
            raise ValueError("Model not found.")
        payload = {"model_id": model_id, "updated_at": pd.Timestamp.utcnow().isoformat()}
        self._save_json(self.active_model_file, payload)
        return payload

    def delete_model(self, model_id: str) -> Dict[str, Any]:
        if not model_id:
            raise ValueError("model_id is required.")

        meta_path = self.models_dir / f"{model_id}.meta.json"
        model_path = self.models_dir / f"{model_id}.joblib"
        if not meta_path.exists() and not model_path.exists():
            raise ValueError("Model not found.")

        try:
            if meta_path.exists():
                meta_path.unlink()
        except Exception as e:
            raise ValueError(f"Failed to delete model metadata: {e}")

        try:
            if model_path.exists():
                model_path.unlink()
        except Exception as e:
            raise ValueError(f"Failed to delete model file: {e}")

        active_model_id = self.get_active_model_id()
        if active_model_id == model_id:
            replacement = None
            for candidate in sorted(self.models_dir.glob("*.meta.json"), reverse=True):
                replacement = candidate.stem.replace(".meta", "")
                break
            if replacement:
                self.set_active_model(replacement)
            else:
                try:
                    if self.active_model_file.exists():
                        self.active_model_file.unlink()
                except Exception:
                    pass

        return {"model_id": model_id, "deleted": True}

    def get_model_report(self, model_id: str) -> Dict[str, Any]:
        meta_path = self.models_dir / f"{model_id}.meta.json"
        model_path = self.models_dir / f"{model_id}.joblib"
        if not meta_path.exists() or not model_path.exists():
            raise ValueError("Model not found.")

        try:
            with meta_path.open("r", encoding="utf-8") as f:
                metadata = json.load(f)
        except Exception as e:
            raise ValueError(f"Failed to load model metadata: {e}")

        try:
            bundle = joblib.load(model_path)
            pipeline = bundle.get("pipeline")
        except Exception as e:
            raise ValueError(f"Failed to load trained model artifact: {e}")

        cached_report = metadata.get("report") or {}
        if cached_report:
            report = cached_report
        else:
            report = self._build_report_from_metadata(metadata, pipeline)

        # ── Enhance AutoML models with MLJAR visuals and readme ─────
        if metadata.get("source") == "mljar_automl":
            self._attach_automl_extras(report, metadata)

        return report

    def _attach_automl_extras(self, report: Dict[str, Any], metadata: Dict[str, Any]) -> None:
        """Attach MLJAR-generated visuals and readme to an AutoML model report."""
        import base64
        import re

        results_path = str(metadata.get("results_path") or "").strip()
        best_model_name = str(metadata.get("best_model_name") or "").strip()
        job_id = str(metadata.get("job_id") or "").strip()
        if not results_path or not os.path.isdir(results_path):
            return

        model_dir = os.path.join(results_path, best_model_name) if best_model_name else None

        # Collect visuals from the best model directory as base64 data URIs
        # Also build a lookup for replacing image refs in markdown
        visuals: List[Dict[str, str]] = []
        image_data_map: Dict[str, str] = {}  # filename -> data_uri
        if model_dir and os.path.isdir(model_dir):
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
                "feature_importance.png": "Feature Importance",
                "calibration_curve_curve.png": "Calibration Curve",
                "cumulative_gains_curve.png": "Cumulative Gains Curve",
                "lift_curve.png": "Lift Curve",
            }
            for fname, title in image_files.items():
                fpath = os.path.join(model_dir, fname)
                if os.path.isfile(fpath):
                    try:
                        with open(fpath, "rb") as img_f:
                            img_bytes = img_f.read()
                        b64 = base64.b64encode(img_bytes).decode("utf-8")
                        data_uri = f"data:image/png;base64,{b64}"
                        visuals.append({
                            "filename": fname,
                            "title": title,
                            "type": "png",
                            "data_uri": data_uri,
                        })
                        image_data_map[fname] = data_uri
                    except Exception:
                        pass

        # Collect readme and replace relative image URLs with base64 data URIs
        readme_content = None
        if model_dir and os.path.isdir(model_dir):
            readme_path = os.path.join(model_dir, "README.md")
            if os.path.isfile(readme_path):
                try:
                    with open(readme_path, "r", encoding="utf-8") as f:
                        readme_content = f.read()
                except Exception:
                    pass

        # Replace markdown image references with base64 data URIs
        if readme_content and image_data_map:
            def _replace_image_ref(match):
                alt_text = match.group(1)
                filename = match.group(2)
                data_uri = image_data_map.get(filename)
                if data_uri:
                    return f'![{alt_text}]({data_uri})'
                return match.group(0)  # Keep original if no data URI found

            readme_content = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', _replace_image_ref, readme_content)

        report["automl_job_id"] = job_id
        report["automl_model_name"] = best_model_name
        report["automl_visuals"] = visuals
        report["automl_readme"] = readme_content

    def _build_report_from_metadata(self, metadata: Dict[str, Any], pipeline: Any = None) -> Dict[str, Any]:
        """Build a report from metadata when no cached report exists."""
        problem_type = str(metadata.get("problem_type") or "regression").strip().lower()
        metrics = metadata.get("metrics") or {}
        diagnostics = metadata.get("diagnostics") or {}
        important_features = metadata.get("important_features") or ([] if pipeline is None else self._extract_important_features(pipeline))
        important_features = [
            row for row in important_features
            if row is not None and float(row.get("importance", 0) or 0) > 0
        ]

        problem_type = str(metadata.get("problem_type") or "regression").strip().lower()
        metrics = metadata.get("metrics") or {}
        diagnostics = metadata.get("diagnostics") or {}
        important_features = metadata.get("important_features") or self._extract_important_features(pipeline)
        important_features = [
            row for row in important_features
            if row is not None and float(row.get("importance", 0) or 0) > 0
        ]

        # ── Regression report ───────────────────────────────────────
        if problem_type == "regression":
            residual_points = diagnostics.get("residual_points") or []
            actual_vs_predicted = diagnostics.get("actual_vs_predicted_points") or [
                {"actual": p.get("actual"), "predicted": p.get("predicted")}
                for p in residual_points
                if p.get("actual") is not None and p.get("predicted") is not None
            ]
            qq_points = diagnostics.get("qq_plot_points") or self._build_qq_points(residual_points)
            vif_table = metadata.get("vif_table") or []

            report = {
                "model_id": metadata.get("model_id"),
                "problem_type": "regression",
                "algorithm_label": metadata.get("algorithm_label"),
                "target_column": metadata.get("target_column"),
                "feature_columns": metadata.get("feature_columns") or [],
                "created_at": metadata.get("created_at"),
                "evaluation_method": metadata.get("evaluation_method")
                or self._evaluation_method_from_metadata(metadata),
                "metrics": {
                    "r2": metrics.get("r2"),
                    "adjusted_r2": metrics.get("adjusted_r2"),
                    "mae": metrics.get("mae"),
                    "mse": metrics.get("mse"),
                    "rmse": metrics.get("rmse"),
                    "mape": metrics.get("mape"),
                    "cv_mean_r2": metrics.get("cv_mean_r2"),
                    "cv_std_r2": metrics.get("cv_std_r2"),
                    "cv_folds": metrics.get("cv_folds"),
                },
                "diagnostics": {
                    "actual_vs_predicted_points": actual_vs_predicted[:300],
                    "residual_points": residual_points[:300],
                    "qq_plot_points": qq_points[:300],
                    "loss_curve": (diagnostics.get("loss_curve") or [])[:300],
                },
                "important_features": important_features[:20],
                "vif_table": vif_table[:50],
                "metric_explanations": [
                    {"metric": "R2", "why_it_matters": "Proportion of variance explained by the model. 1.0 = perfect, 0 = baseline."},
                    {"metric": "Adjusted R2", "why_it_matters": "R2 penalized for number of features. Guards against overfitting."},
                    {"metric": "MAE", "why_it_matters": "Mean Absolute Error — average magnitude of prediction errors."},
                    {"metric": "MSE", "why_it_matters": "Mean Squared Error — penalizes large errors more heavily."},
                    {"metric": "RMSE", "why_it_matters": "Root Mean Squared Error — error in the same units as the target."},
                    {"metric": "MAPE", "why_it_matters": "Mean Absolute Percentage Error — relative error as a percentage."},
                ],
                "business_meaning": self._business_error_meaning(metadata, metrics),
            }
            return report

        # ── Classification report ───────────────────────────────────
        if problem_type == "classification":
            confusion_matrix = diagnostics.get("confusion_matrix") or []
            loss_curve = diagnostics.get("loss_curve") or []

            report = {
                "model_id": metadata.get("model_id"),
                "problem_type": "classification",
                "algorithm_label": metadata.get("algorithm_label"),
                "target_column": metadata.get("target_column"),
                "feature_columns": metadata.get("feature_columns") or [],
                "created_at": metadata.get("created_at"),
                "evaluation_method": metadata.get("evaluation_method")
                or self._evaluation_method_from_metadata(metadata),
                "metrics": {
                    "accuracy": metrics.get("accuracy"),
                    "f1_macro": metrics.get("f1_macro"),
                    "precision_macro": metrics.get("precision_macro"),
                    "recall_macro": metrics.get("recall_macro"),
                    "cv_mean_accuracy": metrics.get("cv_mean_accuracy"),
                    "cv_std_accuracy": metrics.get("cv_std_accuracy"),
                    "cv_folds": metrics.get("cv_folds"),
                },
                "diagnostics": {
                    "confusion_matrix": confusion_matrix,
                    "loss_curve": loss_curve[:300],
                },
                "important_features": important_features[:20],
                "metric_explanations": [
                    {"metric": "Accuracy", "why_it_matters": "Proportion of correct predictions out of all predictions."},
                    {"metric": "F1 (Macro)", "why_it_matters": "Harmonic mean of precision and recall, averaged across all classes."},
                    {"metric": "Precision (Macro)", "why_it_matters": "Of all predicted positives, how many are actually positive."},
                    {"metric": "Recall (Macro)", "why_it_matters": "Of all actual positives, how many were correctly predicted."},
                ],
                "business_meaning": self._classification_business_meaning(metrics),
            }
            return report

        # ── Clustering report ───────────────────────────────────────
        loss_curve = diagnostics.get("loss_curve") or []
        cluster_labels_sample = diagnostics.get("cluster_labels_sample") or []

        report = {
            "model_id": metadata.get("model_id"),
            "problem_type": "clustering",
            "algorithm_label": metadata.get("algorithm_label"),
            "target_column": None,
            "feature_columns": metadata.get("feature_columns") or [],
            "created_at": metadata.get("created_at"),
            "evaluation_method": metadata.get("evaluation_method")
            or self._evaluation_method_from_metadata(metadata),
            "metrics": {
                "n_clusters": metrics.get("n_clusters"),
                "silhouette_score": metrics.get("silhouette_score"),
                "davies_bouldin_score": metrics.get("davies_bouldin_score"),
                "inertia": metrics.get("inertia"),
            },
            "diagnostics": {
                "loss_curve": loss_curve[:300],
                "cluster_labels_sample": cluster_labels_sample[:300],
            },
            "important_features": important_features[:20],
            "metric_explanations": [
                {"metric": "N Clusters", "why_it_matters": "Number of distinct clusters found by the algorithm."},
                {"metric": "Silhouette Score", "why_it_matters": "Measures how similar points are to their own cluster vs others. Range: -1 to 1. Higher is better."},
                {"metric": "Davies-Bouldin Score", "why_it_matters": "Average similarity between clusters. Lower is better (0 = optimal)."},
                {"metric": "Inertia", "why_it_matters": "Sum of squared distances to nearest cluster center. Lower means tighter clusters."},
            ],
            "business_meaning": self._clustering_business_meaning(metrics),
        }
        return report

    def _classification_business_meaning(self, metrics: Dict[str, Any]) -> str:
        accuracy = metrics.get("accuracy")
        f1 = metrics.get("f1_macro")
        if accuracy is not None and f1 is not None:
            return (
                f"Accuracy = {float(accuracy):.2%} means {float(accuracy):.2%} of predictions are correct. "
                f"F1 = {float(f1):.4f} balances precision and recall across all classes."
            )
        if accuracy is not None:
            return f"Accuracy = {float(accuracy):.2%} means {float(accuracy):.2%} of predictions are correct."
        return "Classification metrics indicate how well the model distinguishes between classes."

    def _clustering_business_meaning(self, metrics: Dict[str, Any]) -> str:
        n = metrics.get("n_clusters")
        sil = metrics.get("silhouette_score")
        parts = []
        if n is not None:
            parts.append(f"The model found {n} distinct clusters.")
        if sil is not None:
            quality = "excellent" if sil > 0.7 else "good" if sil > 0.5 else "fair" if sil > 0.25 else "poor"
            parts.append(f"Silhouette score = {float(sil):.4f} ({quality} separation).")
        return " ".join(parts) or "Clustering metrics indicate how well the data is grouped."

    def _metric_explanations_for_type(self, problem_type: str) -> List[Dict[str, str]]:
        if problem_type == "classification":
            return [
                {"metric": "Accuracy", "why_it_matters": "Proportion of correct predictions out of all predictions."},
                {"metric": "F1 (Macro)", "why_it_matters": "Harmonic mean of precision and recall, averaged across all classes."},
                {"metric": "Precision (Macro)", "why_it_matters": "Of all predicted positives, how many are actually positive."},
                {"metric": "Recall (Macro)", "why_it_matters": "Of all actual positives, how many were correctly predicted."},
            ]
        if problem_type == "clustering":
            return [
                {"metric": "N Clusters", "why_it_matters": "Number of distinct clusters found by the algorithm."},
                {"metric": "Silhouette Score", "why_it_matters": "Measures how similar points are to their own cluster vs others. Range: -1 to 1. Higher is better."},
                {"metric": "Davies-Bouldin Score", "why_it_matters": "Average similarity between clusters. Lower is better (0 = optimal)."},
                {"metric": "Inertia", "why_it_matters": "Sum of squared distances to nearest cluster center. Lower means tighter clusters."},
            ]
        return [
            {"metric": "R2", "why_it_matters": "Proportion of variance explained by the model. 1.0 = perfect, 0 = baseline."},
            {"metric": "Adjusted R2", "why_it_matters": "R2 penalized for number of features. Guards against overfitting."},
            {"metric": "MAE", "why_it_matters": "Mean Absolute Error — average magnitude of prediction errors."},
            {"metric": "MSE", "why_it_matters": "Mean Squared Error — penalizes large errors more heavily."},
            {"metric": "RMSE", "why_it_matters": "Root Mean Squared Error — error in the same units as the target."},
            {"metric": "MAPE", "why_it_matters": "Mean Absolute Percentage Error — relative error as a percentage."},
        ]

    def _evaluation_method_from_metadata(self, metadata: Dict[str, Any]) -> str:
        test_size = metadata.get("test_size")
        cv_folds = (metadata.get("metrics") or {}).get("cv_folds")
        base = f"Train/Test Split (test_size={test_size if test_size is not None else 'n/a'})"
        if cv_folds:
            return f"{base} + {cv_folds}-Fold Cross-Validation"
        return base

    def _business_error_meaning(self, metadata: Dict[str, Any], metrics: Dict[str, Any]) -> str:
        target = metadata.get("target_column") or "target"
        rmse = metrics.get("rmse")
        mae = metrics.get("mae")
        if rmse is not None:
            return (
                f"RMSE = {float(rmse):.4f} means predictions are typically off by about "
                f"{float(rmse):.4f} units of '{target}'."
            )
        if mae is not None:
            return (
                f"MAE = {float(mae):.4f} means predictions are off by about "
                f"{float(mae):.4f} units of '{target}' on average."
            )
        return "Error interpretation unavailable for this model."

    def _build_qq_points(self, residual_points: List[Dict[str, Any]]) -> List[Dict[str, float]]:
        residuals = [float(p.get("residual")) for p in residual_points if p.get("residual") is not None]
        n = len(residuals)
        if n < 3:
            return []
        sorted_res = sorted(residuals)
        mean_res = float(np.mean(sorted_res))
        std_res = float(np.std(sorted_res)) or 1.0
        qq_points: List[Dict[str, float]] = []
        normal = NormalDist()
        for i, residual in enumerate(sorted_res, start=1):
            p = (i - 0.5) / n
            theo = normal.inv_cdf(p)
            sample = (residual - mean_res) / std_res
            qq_points.append({"theoretical": float(theo), "sample": float(sample)})
        return qq_points

    def _extract_important_features(self, pipeline: Pipeline) -> List[Dict[str, float]]:
        try:
            preprocessor = pipeline.named_steps.get("preprocessor")
            regressor = pipeline.named_steps.get("regressor")
            names = []
            if preprocessor is not None and hasattr(preprocessor, "get_feature_names_out"):
                names = [str(n) for n in preprocessor.get_feature_names_out()]
            if hasattr(regressor, "feature_importances_"):
                values = np.asarray(getattr(regressor, "feature_importances_"), dtype=float)
            elif hasattr(regressor, "coef_"):
                values = np.abs(np.asarray(getattr(regressor, "coef_"), dtype=float).ravel())
            else:
                return []
            if not len(values):
                return []
            if names and len(names) != len(values):
                names = [f"feature_{idx}" for idx in range(len(values))]
            if not names:
                names = [f"feature_{idx}" for idx in range(len(values))]
            rows = [{"feature": names[i], "importance": float(values[i])} for i in range(len(values))]
            rows = [row for row in rows if row["importance"] > 0]
            rows.sort(key=lambda item: item["importance"], reverse=True)
            return rows
        except Exception:
            return []

    def _fallback_feature_importance(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        features: List[str],
    ) -> List[Dict[str, float]]:
        # Fallback ranking from absolute Pearson correlation for numeric features.
        rows: List[Dict[str, float]] = []
        try:
            y_num = pd.to_numeric(y_train, errors="coerce")
            for feature in features:
                x_num = pd.to_numeric(X_train.get(feature), errors="coerce")
                valid = ~(x_num.isna() | y_num.isna())
                if valid.sum() < 3:
                    continue
                corr = x_num[valid].corr(y_num[valid])
                if corr is None or np.isnan(corr):
                    continue
                importance = float(abs(corr))
                if importance <= 0:
                    continue
                rows.append({"feature": str(feature), "importance": importance})
            rows.sort(key=lambda item: item["importance"], reverse=True)
            return rows
        except Exception:
            return []

    def _compute_vif_table(self, X_train: pd.DataFrame, numeric_features: List[str]) -> List[Dict[str, Any]]:
        if not numeric_features or len(numeric_features) < 2:
            return []
        try:
            X_num = X_train[numeric_features].apply(pd.to_numeric, errors="coerce").dropna()
            if len(X_num) < 5:
                return []
            vif_rows: List[Dict[str, Any]] = []
            for feature in numeric_features:
                y_feature = X_num[feature].to_numpy()
                X_other = X_num.drop(columns=[feature])
                if X_other.shape[1] == 0:
                    continue
                model = LinearRegression()
                model.fit(X_other, y_feature)
                r2_j = float(model.score(X_other, y_feature))
                if r2_j >= 0.999999:
                    vif_value = float("inf")
                    tolerance = 0.0
                else:
                    tolerance = max(1e-9, 1 - r2_j)
                    vif_value = 1 / tolerance
                vif_rows.append(
                    {
                        "feature": feature,
                        "vif": float(vif_value) if np.isfinite(vif_value) else None,
                        "tolerance": float(tolerance),
                    }
                )
            return sorted(vif_rows, key=lambda item: (item.get("vif") is None, -(item.get("vif") or 0)))
        except Exception:
            return []

    def analyze_dataset(self, dataset_id: str) -> Dict[str, Any]:
        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")
        df = self._load_dataset_dataframe(dataset_meta)
        row_count = int(len(df))
        col_count = int(len(df.columns))
        memory_mb = round(float(df.memory_usage(deep=True).sum()) / (1024 * 1024), 3)

        missing_by_col = df.isna().sum().sort_values(ascending=False)
        total_missing = int(missing_by_col.sum())
        duplicate_rows = int(df.duplicated().sum())
        missing_pct_dataset = round((total_missing / max(1, row_count * max(1, col_count))) * 100, 2)
        duplicate_pct = round((duplicate_rows / max(1, row_count)) * 100, 2)

        numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
        categorical_cols = [c for c in df.columns if c not in numeric_cols]
        datetime_like_cols = [
            c for c in df.columns
            if ("date" in str(c).lower() or "time" in str(c).lower())
        ]

        column_types: List[Dict[str, Any]] = []
        constant_columns: List[str] = []
        high_missing_columns: List[Dict[str, Any]] = []
        high_cardinality_columns: List[Dict[str, Any]] = []

        for col in df.columns:
            missing = int(df[col].isna().sum())
            unique = int(df[col].nunique(dropna=True))
            missing_pct = round((missing / row_count) * 100, 2) if row_count else 0.0
            is_constant = unique <= 1
            if is_constant:
                constant_columns.append(str(col))
            if missing_pct >= 30:
                high_missing_columns.append({"column": str(col), "missing_pct": missing_pct})

            unique_ratio = round((unique / max(1, row_count)) * 100, 2)
            if col in categorical_cols and unique_ratio > 60:
                high_cardinality_columns.append({
                    "column": str(col),
                    "unique_values": unique,
                    "unique_ratio_pct": unique_ratio,
                })

            column_types.append({
                "column": str(col),
                "dtype": str(df[col].dtype),
                "missing": missing,
                "missing_pct": missing_pct,
                "unique": unique,
                "unique_ratio_pct": unique_ratio,
                "is_constant": is_constant,
            })

        numeric_summary: List[Dict[str, Any]] = []
        skewed_features: List[Dict[str, Any]] = []
        outlier_summary: List[Dict[str, Any]] = []
        target_candidates: List[Dict[str, Any]] = []

        if numeric_cols:
            desc = df[numeric_cols].describe().transpose()
            for col in numeric_cols:
                series = pd.to_numeric(df[col], errors="coerce")
                non_null = series.dropna()
                row = desc.loc[col]

                mean_value = self._safe_float(row.get("mean"))
                std_value = self._safe_float(row.get("std"))
                q1 = self._safe_float(row.get("25%"))
                q3 = self._safe_float(row.get("75%"))
                iqr = self._safe_float((q3 - q1) if q1 is not None and q3 is not None else None)

                outliers_iqr = 0
                if q1 is not None and q3 is not None and iqr is not None:
                    lower = q1 - 1.5 * iqr
                    upper = q3 + 1.5 * iqr
                    outliers_iqr = int(((series < lower) | (series > upper)).sum())

                outlier_pct = round((outliers_iqr / max(1, len(non_null))) * 100, 2)
                skewness = self._safe_float(non_null.skew() if len(non_null) > 2 else None)
                kurtosis = self._safe_float(non_null.kurtosis() if len(non_null) > 3 else None)

                numeric_summary.append({
                    "column": col,
                    "mean": mean_value,
                    "std": std_value,
                    "min": self._safe_float(row.get("min")),
                    "p25": q1,
                    "p50": self._safe_float(row.get("50%")),
                    "p75": q3,
                    "max": self._safe_float(row.get("max")),
                    "skewness": skewness,
                    "kurtosis": kurtosis,
                    "outlier_pct": outlier_pct,
                })

                if skewness is not None and abs(skewness) >= 1.0:
                    skewed_features.append({
                        "column": col,
                        "skewness": round(skewness, 4),
                    })

                outlier_summary.append({
                    "column": col,
                    "outliers_iqr": outliers_iqr,
                    "outlier_pct": outlier_pct,
                })

                unique = int(non_null.nunique())
                unique_ratio = round((unique / max(1, len(non_null))) * 100, 2)
                target_candidates.append({
                    "column": col,
                    "non_null_count": int(len(non_null)),
                    "unique_values": unique,
                    "unique_ratio_pct": unique_ratio,
                    "missing_pct": round((series.isna().sum() / max(1, row_count)) * 100, 2),
                    "variance": round(float(non_null.var()) if len(non_null) > 1 else 0.0, 6),
                })

            outlier_summary.sort(key=lambda x: x["outlier_pct"], reverse=True)
            skewed_features.sort(key=lambda x: abs(x["skewness"]), reverse=True)
            target_candidates.sort(key=lambda x: (x["missing_pct"], -x["variance"]))

        corr_pairs: List[Dict[str, Any]] = []
        high_corr_pairs: List[Dict[str, Any]] = []
        if len(numeric_cols) >= 2:
            corr = df[numeric_cols].corr(numeric_only=True)
            seen = set()
            for col_a in corr.columns:
                for col_b in corr.columns:
                    if col_a == col_b:
                        continue
                    key = tuple(sorted((col_a, col_b)))
                    if key in seen:
                        continue
                    seen.add(key)
                    value = corr.loc[col_a, col_b]
                    if pd.isna(value):
                        continue
                    abs_value = abs(float(value))
                    pair = {
                        "feature_a": col_a,
                        "feature_b": col_b,
                        "correlation": round(float(value), 4),
                        "abs_correlation": round(abs_value, 4),
                    }
                    corr_pairs.append(pair)
                    if abs_value >= 0.85:
                        high_corr_pairs.append(pair)
            corr_pairs.sort(key=lambda item: item["abs_correlation"], reverse=True)
            high_corr_pairs.sort(key=lambda item: item["abs_correlation"], reverse=True)

        missing_chart = [
            {
                "column": str(col),
                "missing": int(count),
                "missing_pct": round((int(count) / max(1, row_count)) * 100, 2),
            }
            for col, count in missing_by_col.head(15).items()
        ]
        std_chart = [
            {"column": item["column"], "std": round(float(item["std"] or 0.0), 4)}
            for item in sorted(numeric_summary, key=lambda x: x["std"] or 0.0, reverse=True)[:15]
        ]
        outlier_chart = [
            {"column": row["column"], "outlier_pct": row["outlier_pct"]}
            for row in outlier_summary[:15]
        ]

        issues: List[str] = []
        if missing_pct_dataset > 10:
            issues.append("high_missingness")
        if duplicate_pct > 5:
            issues.append("high_duplicates")
        if constant_columns:
            issues.append("constant_features")
        if high_cardinality_columns:
            issues.append("high_cardinality_categories")
        if high_corr_pairs:
            issues.append("multicollinearity_risk")
        if skewed_features:
            issues.append("skewed_numeric_features")

        quality_score = 100.0
        quality_score -= min(35.0, missing_pct_dataset * 1.8)
        quality_score -= min(20.0, duplicate_pct * 2.0)
        quality_score -= min(15.0, len(constant_columns) * 3.0)
        quality_score -= min(12.0, len(high_cardinality_columns) * 2.0)
        quality_score -= min(10.0, len(high_corr_pairs) * 1.0)
        quality_score -= min(8.0, len(skewed_features) * 0.8)
        quality_score = round(max(0.0, quality_score), 2)

        recommendations: List[str] = []
        if total_missing > 0:
            recommendations.append("Apply robust imputation strategy per column type before model training.")
        if duplicate_rows > 0:
            recommendations.append("Drop exact duplicates before train/test split to avoid optimistic metrics.")
        if constant_columns:
            recommendations.append("Remove constant columns because they add noise and no predictive signal.")
        if high_cardinality_columns:
            recommendations.append("Use encoding strategy for high-cardinality categories (target/frequency/hashing).")
        if high_corr_pairs:
            recommendations.append("Reduce highly correlated features to limit multicollinearity and instability.")
        if skewed_features:
            recommendations.append("Consider log/Box-Cox transforms for highly skewed numeric features.")
        if row_count < 200:
            recommendations.append("Prefer simpler models and strong cross-validation due to limited sample size.")
        if row_count >= 2000:
            recommendations.append("Dataset size supports stronger ensemble models and feature interactions.")
        if len(numeric_cols) < 2:
            recommendations.append("Add more numeric features or derive them from categorical/date columns.")
        if not recommendations:
            recommendations.append("Dataset quality looks stable; proceed with baseline model and CV evaluation.")

        # Model-focused segmented insights
        semantic_context = self._infer_dataset_semantics(
            column_names=[str(c) for c in df.columns.tolist()],
            numeric_cols=[str(c) for c in numeric_cols],
            categorical_cols=[str(c) for c in categorical_cols],
            datetime_like_cols=[str(c) for c in datetime_like_cols],
        )
        numeric_summary_by_col = {str(item.get("column")): item for item in numeric_summary}
        semantic_target_candidates: List[Dict[str, Any]] = []
        for item in column_types:
            column_name = str(item.get("column") or "")
            if not column_name:
                continue
            candidate = self._score_semantic_target_candidate(
                column_name=column_name,
                column_meta=item,
                semantic_context=semantic_context,
                numeric_summary=numeric_summary_by_col.get(column_name),
            )
            semantic_target_candidates.append(candidate)
        semantic_target_candidates.sort(key=lambda row: float(row.get("score") or 0.0), reverse=True)

        suggested_target = None
        for candidate in semantic_target_candidates:
            if not bool(candidate.get("excluded", False)):
                suggested_target = str(candidate.get("column") or "").strip()
                if suggested_target:
                    break
        if not suggested_target and target_candidates:
            suggested_target = str(target_candidates[0].get("column") or "")
        if not suggested_target and numeric_cols:
            suggested_target = str(numeric_cols[0])

        target_profile: Dict[str, Any] = {
            "suggested_target": suggested_target or None,
            "target_type": "unknown",
            "missing_pct": None,
            "unique_values": None,
            "unique_ratio_pct": None,
            "std": None,
            "skewness": None,
            "outlier_pct": None,
            "distribution_note": "Target diagnostics unavailable.",
        }
        if semantic_context:
            target_profile["semantic_domain"] = semantic_context.get("primary_domain")
        best_candidate = next(
            (row for row in semantic_target_candidates if str(row.get("column") or "") == str(suggested_target or "")),
            None,
        )
        if best_candidate:
            target_profile["selection_rationale"] = list(best_candidate.get("reasons") or [])[:5]
        feature_target_signal: List[Dict[str, Any]] = []
        leakage_candidates: List[Dict[str, Any]] = []
        trainability: Dict[str, Any] = {
            "proxy_signal_strength": None,
            "difficulty": "unknown",
            "rows_per_feature": round(float(row_count / max(1, col_count)), 3),
            "overfitting_risk": "low",
            "baseline_hint": "Use mean/median baseline before advanced models.",
        }

        if suggested_target and suggested_target in df.columns:
            target_series = df[suggested_target]
            target_missing_pct = round((target_series.isna().sum() / max(1, row_count)) * 100, 2)
            target_unique_values = int(target_series.nunique(dropna=True))
            target_unique_ratio_pct = round((target_unique_values / max(1, row_count)) * 100, 2)

            target_profile["missing_pct"] = target_missing_pct
            target_profile["unique_values"] = target_unique_values
            target_profile["unique_ratio_pct"] = target_unique_ratio_pct

            if suggested_target in numeric_cols:
                y = pd.to_numeric(target_series, errors="coerce")
                y_non_null = y.dropna()
                target_profile["target_type"] = "numeric"
                target_profile["std"] = round(float(y_non_null.std()), 6) if len(y_non_null) > 1 else 0.0
                target_profile["skewness"] = self._safe_float(y_non_null.skew() if len(y_non_null) > 2 else None)

                if len(y_non_null) > 3:
                    q1 = self._safe_float(y_non_null.quantile(0.25))
                    q3 = self._safe_float(y_non_null.quantile(0.75))
                    iqr = self._safe_float((q3 - q1) if q1 is not None and q3 is not None else None)
                    if q1 is not None and q3 is not None and iqr is not None:
                        low = q1 - 1.5 * iqr
                        high = q3 + 1.5 * iqr
                        outlier_count = int(((y < low) | (y > high)).sum())
                        target_profile["outlier_pct"] = round((outlier_count / max(1, len(y_non_null))) * 100, 2)

                target_profile["distribution_note"] = (
                    "Target is near-constant; learning signal may be weak."
                    if target_unique_values <= 2
                    else "Target has enough variability for regression modeling."
                )

                if len(numeric_cols) >= 2:
                    for col in numeric_cols:
                        if col == suggested_target:
                            continue
                        paired = pd.DataFrame(
                            {
                                "x": pd.to_numeric(df[col], errors="coerce"),
                                "y": y,
                            }
                        ).dropna()
                        if len(paired) < 8:
                            continue
                        corr_value = paired["x"].corr(paired["y"])
                        if pd.isna(corr_value):
                            continue
                        abs_corr = abs(float(corr_value))
                        feature_target_signal.append(
                            {
                                "feature": col,
                                "correlation": round(float(corr_value), 4),
                                "abs_correlation": round(abs_corr, 4),
                            }
                        )
                        if abs_corr >= 0.98:
                            leakage_candidates.append(
                                {
                                    "feature": col,
                                    "reason": "Near-perfect correlation with suggested target.",
                                    "abs_correlation": round(abs_corr, 4),
                                }
                            )
                feature_target_signal.sort(key=lambda item: item["abs_correlation"], reverse=True)

                top_signal = feature_target_signal[0]["abs_correlation"] if feature_target_signal else 0.0
                trainability["proxy_signal_strength"] = round(float(top_signal), 4)
                if top_signal >= 0.6:
                    trainability["difficulty"] = "easy"
                elif top_signal >= 0.35:
                    trainability["difficulty"] = "medium"
                else:
                    trainability["difficulty"] = "hard"
                trainability["baseline_hint"] = (
                    "Compare against median baseline MAE before selecting advanced regressors."
                )
            else:
                target_profile["target_type"] = "categorical"
                target_profile["distribution_note"] = (
                    "Target appears categorical; use class balance checks and classification metrics."
                )
                value_counts = target_series.dropna().value_counts()
                if len(value_counts):
                    dominant_ratio = round(float(value_counts.iloc[0] / max(1, value_counts.sum())) * 100, 2)
                    target_profile["dominant_class_pct"] = dominant_ratio

        rows_per_feature = float(trainability["rows_per_feature"] or 0.0)
        if rows_per_feature < 8:
            trainability["overfitting_risk"] = "high"
        elif rows_per_feature < 20:
            trainability["overfitting_risk"] = "medium"

        validation_strategy: Dict[str, Any] = {
            "recommended_method": "kfold",
            "folds": 5 if row_count >= 1000 else (3 if row_count >= 200 else 2),
            "test_size_pct": 20 if row_count >= 100 else 30,
            "warnings": [],
        }
        if datetime_like_cols:
            validation_strategy["recommended_method"] = "time_series_split"
            validation_strategy["warnings"].append(
                "Datetime-like columns detected; prefer chronological splits to avoid leakage."
            )
        if duplicate_rows > 0:
            validation_strategy["warnings"].append(
                "Duplicates detected; remove duplicates before splitting to avoid optimistic validation."
            )
        if row_count < 120:
            validation_strategy["warnings"].append(
                "Small sample size; prefer repeated CV and conservative model complexity."
            )

        encoding_plan: List[Dict[str, Any]] = []
        for item in high_cardinality_columns[:20]:
            encoding_plan.append(
                {
                    "column": item.get("column"),
                    "strategy": "frequency_or_target_encoding",
                    "reason": "High cardinality category.",
                }
            )
        moderate_cardinality = [
            c for c in categorical_cols
            if c not in {str(x.get("column")) for x in high_cardinality_columns}
            and int(df[c].nunique(dropna=True)) > 2
        ]
        for col in moderate_cardinality[:20]:
            encoding_plan.append(
                {
                    "column": col,
                    "strategy": "one_hot_encoding",
                    "reason": "Moderate category count.",
                }
            )

        scaling_candidates = [
            row["column"]
            for row in numeric_summary
            if row.get("std") is not None and float(row.get("std") or 0.0) > 0.0
        ][:25]

        segmented_recommendations: List[str] = []
        if trainability["overfitting_risk"] in {"high", "medium"}:
            segmented_recommendations.append(
                "Feature-to-row ratio is tight; apply regularization and simplify feature space."
            )
        if leakage_candidates:
            segmented_recommendations.append(
                "Review leakage candidates before training; remove features too close to target behavior."
            )
        if validation_strategy["recommended_method"] == "time_series_split":
            segmented_recommendations.append(
                "Use time-series cross-validation and avoid random shuffling."
            )
        if not segmented_recommendations:
            segmented_recommendations.append(
                "Model-readiness signals look stable; proceed with baseline and cross-validated tuning."
            )
        model_building_summary = self._build_rule_based_model_summary(
            issues=issues,
            trainability=trainability,
            validation_strategy=validation_strategy,
            target_profile=target_profile,
            semantic_context=semantic_context,
            recommendations=(recommendations + segmented_recommendations),
        )

        segments = {
            "overview": {
                "dataset_id": dataset_id,
                "dataset_name": dataset_meta.get("original_filename"),
                "rows": row_count,
                "columns": col_count,
                "memory_mb": memory_mb,
                "quality_score": quality_score,
                "issues": issues,
            },
            "data_quality": {
                "missing_pct_dataset": missing_pct_dataset,
                "duplicate_pct": duplicate_pct,
                "total_missing_values": total_missing,
                "duplicate_rows": duplicate_rows,
                "constant_columns": constant_columns,
                "high_missing_columns": high_missing_columns,
                "high_cardinality_columns": high_cardinality_columns,
                "column_types": sorted(column_types, key=lambda x: x["missing_pct"], reverse=True),
                "charts": {
                    "missing_by_column": missing_chart,
                    "std_by_numeric_column": std_chart,
                    "outlier_pct_by_column": outlier_chart,
                },
            },
            "target_diagnostics": {
                "profile": target_profile,
                "target_candidates": target_candidates[:12],
                "semantic_target_candidates": semantic_target_candidates[:20],
                "semantic_context": semantic_context,
            },
            "feature_readiness": {
                "numeric_columns": len(numeric_cols),
                "categorical_columns": len(categorical_cols),
                "datetime_like_columns": len(datetime_like_cols),
                "numeric_summary": sorted(numeric_summary, key=lambda x: x["outlier_pct"], reverse=True),
                "outlier_summary": outlier_summary,
                "skewed_features": skewed_features,
                "top_correlations": corr_pairs[:20],
                "high_correlations": high_corr_pairs[:20],
                "feature_target_signal": feature_target_signal[:20],
                "leakage_candidates": leakage_candidates[:20],
                "trainability": trainability,
            },
            "validation_strategy": validation_strategy,
            "preprocessing": {
                "encoding_plan": encoding_plan,
                "scaling_candidates": scaling_candidates,
                "recommendations": segmented_recommendations,
            },
            "model_building_summary": model_building_summary,
        }

        return {
            "dataset_id": dataset_id,
            "dataset_name": dataset_meta.get("original_filename"),
            "rows": row_count,
            "columns": col_count,
            "memory_mb": memory_mb,
            "quality_score": quality_score,
            "issues": issues,
            "numeric_columns": len(numeric_cols),
            "categorical_columns": len(categorical_cols),
            "datetime_like_columns": len(datetime_like_cols),
            "total_missing_values": total_missing,
            "missing_pct_dataset": missing_pct_dataset,
            "duplicate_rows": duplicate_rows,
            "duplicate_pct": duplicate_pct,
            "constant_columns": constant_columns,
            "high_missing_columns": high_missing_columns,
            "high_cardinality_columns": high_cardinality_columns,
            "column_types": sorted(column_types, key=lambda x: x["missing_pct"], reverse=True),
            "numeric_summary": sorted(numeric_summary, key=lambda x: x["outlier_pct"], reverse=True),
            "outlier_summary": outlier_summary,
            "skewed_features": skewed_features,
            "target_candidates": target_candidates[:12],
            "top_correlations": corr_pairs[:20],
            "high_correlations": high_corr_pairs[:20],
            "charts": {
                "missing_by_column": missing_chart,
                "std_by_numeric_column": std_chart,
                "outlier_pct_by_column": outlier_chart,
            },
            "recommendations": recommendations + segmented_recommendations,
            "llm_summary": model_building_summary,
            "segments": segments,
        }

    def _compute_and_persist_dataset_insights(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            return None
        insights = self.analyze_dataset(dataset_id=dataset_id)
        metadata_payload = dict(dataset_meta.get("metadata", {}))
        metadata_payload["insights"] = insights
        metadata_payload["insights_updated_at"] = pd.Timestamp.utcnow().isoformat()
        updated = PredictionDataTable.update_dataset(
            dataset_id=dataset_id,
            metadata=metadata_payload,
        )
        return updated or PredictionDataTable.get_dataset_by_id(dataset_id)

    def get_dataset_insights_from_metadata(self, dataset_id: str) -> Dict[str, Any]:
        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")
        metadata_payload = dict(dataset_meta.get("metadata", {}))
        insights = metadata_payload.get("insights")
        if not isinstance(insights, dict) or not insights:
            raise ValueError("Insights are not available for this dataset. Click Recompute Insights.")
        return insights

    def recompute_dataset_insights(self, dataset_id: str) -> Dict[str, Any]:
        updated = self._compute_and_persist_dataset_insights(dataset_id=dataset_id)
        if not updated:
            raise ValueError("Dataset not found.")
        metadata_payload = dict((updated or {}).get("metadata", {}))
        insights = metadata_payload.get("insights")
        if not isinstance(insights, dict) or not insights:
            raise ValueError("Failed to recompute dataset insights.")
        return insights

    def _infer_dataset_semantics(
        self,
        column_names: List[str],
        numeric_cols: List[str],
        categorical_cols: List[str],
        datetime_like_cols: List[str],
    ) -> Dict[str, Any]:
        domain_keywords: Dict[str, List[str]] = {
            "sales_revenue": [
                "sale", "sales", "revenue", "amount", "price", "profit", "margin", "discount", "order", "invoice",
                "quantity", "units", "customer",
            ],
            "customer_experience": [
                "csat", "satisfaction", "nps", "rating", "score", "review", "complaint", "churn", "retention",
                "sentiment", "customer",
            ],
            "sensor_timeseries": [
                "sensor", "temperature", "pressure", "vibration", "flow", "current", "voltage", "rpm", "speed",
                "anomaly", "alarm", "failure", "fault", "timestamp", "time", "date",
            ],
            "operations_logistics": [
                "shipment", "delivery", "lead_time", "sla", "inventory", "stock", "warehouse", "route", "utilization",
                "capacity", "downtime",
            ],
            "finance_risk": [
                "loan", "credit", "default", "risk", "payment", "balance", "interest", "apr", "exposure",
            ],
            "hr_people": [
                "employee", "attrition", "tenure", "salary", "performance", "hiring", "absence", "engagement",
            ],
        }
        scores: Dict[str, int] = {domain: 0 for domain in domain_keywords}
        evidence: Dict[str, List[str]] = {domain: [] for domain in domain_keywords}

        for raw_col in column_names:
            col = str(raw_col or "").lower()
            for domain, keywords in domain_keywords.items():
                matches = [token for token in keywords if token in col]
                if matches:
                    scores[domain] += len(matches)
                    if len(evidence[domain]) < 8:
                        evidence[domain].append(str(raw_col))

        if datetime_like_cols and numeric_cols:
            scores["sensor_timeseries"] += 2
        if any("customer" in str(c).lower() for c in column_names):
            scores["customer_experience"] += 1
            scores["sales_revenue"] += 1

        best_domain = max(scores, key=lambda k: scores[k]) if scores else "general_tabular"
        best_score = int(scores.get(best_domain, 0))
        if best_score <= 0:
            best_domain = "general_tabular"
        confidence = round(min(0.95, 0.35 + (best_score / max(1, len(column_names) + 2))), 3) if best_score > 0 else 0.25

        return {
            "primary_domain": best_domain,
            "confidence": confidence,
            "domain_scores": scores,
            "evidence_columns": evidence.get(best_domain, [])[:8],
            "shape": {
                "numeric_columns": int(len(numeric_cols)),
                "categorical_columns": int(len(categorical_cols)),
                "datetime_like_columns": int(len(datetime_like_cols)),
            },
            "notes": (
                f"Likely domain: {best_domain.replace('_', ' ')}"
                if best_domain != "general_tabular"
                else "No strong domain signal from column names."
            ),
        }

    def _score_semantic_target_candidate(
        self,
        column_name: str,
        column_meta: Dict[str, Any],
        semantic_context: Dict[str, Any],
        numeric_summary: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        col = str(column_name or "")
        col_l = col.lower()
        dtype = str((column_meta or {}).get("dtype") or "").lower()
        missing_pct = float((column_meta or {}).get("missing_pct") or 0.0)
        unique_ratio_pct = float((column_meta or {}).get("unique_ratio_pct") or 0.0)
        unique_count = int((column_meta or {}).get("unique") or 0)
        is_constant = bool((column_meta or {}).get("is_constant"))

        score = 0.0
        reasons: List[str] = []
        excluded = False

        id_tokens = {"id", "uuid", "guid", "key", "index", "timestamp", "date", "time"}
        if any(token in col_l for token in id_tokens):
            score -= 3.0
            reasons.append("identifier/time-like column")
            if unique_ratio_pct >= 95:
                score -= 2.0
                excluded = True

        target_tokens = {
            "target", "label", "outcome", "y", "score", "rating", "revenue", "sales", "amount", "profit", "churn",
            "satisfaction", "nps", "failure", "fault", "anomaly", "demand",
        }
        if any(token in col_l for token in target_tokens):
            score += 3.0
            reasons.append("target-like name")

        primary_domain = str((semantic_context or {}).get("primary_domain") or "")
        domain_target_keywords = {
            "sales_revenue": {"revenue", "sales", "amount", "profit", "margin", "units", "quantity"},
            "customer_experience": {"satisfaction", "csat", "nps", "rating", "score", "churn", "retention"},
            "sensor_timeseries": {"failure", "fault", "anomaly", "temperature", "pressure", "vibration", "load"},
            "operations_logistics": {"lead_time", "delivery", "downtime", "utilization", "sla"},
            "finance_risk": {"default", "risk", "loss", "balance", "payment"},
            "hr_people": {"attrition", "performance", "salary", "engagement"},
        }
        for token in domain_target_keywords.get(primary_domain, set()):
            if token in col_l:
                score += 2.0
                reasons.append(f"matches {primary_domain} outcome")

        score -= min(2.0, missing_pct / 30.0)
        if missing_pct > 40:
            reasons.append("high missingness")

        if is_constant or unique_count <= 1:
            score -= 4.0
            reasons.append("constant column")
            excluded = True

        if "int" in dtype or "float" in dtype:
            score += 0.8
            std_value = self._safe_float((numeric_summary or {}).get("std"))
            if std_value is not None and std_value > 0:
                score += 0.4
        elif "bool" in dtype:
            score += 0.6
        else:
            score += 0.2

        if 1 <= unique_ratio_pct <= 85:
            score += 0.8
        if unique_ratio_pct >= 98:
            score -= 1.5
        if unique_ratio_pct <= 0.3:
            score -= 1.0

        if score >= 2.5:
            reasons.append("strong candidate")
        elif score <= -1.0:
            reasons.append("weak candidate")

        return {
            "column": col,
            "score": round(float(score), 4),
            "excluded": bool(excluded),
            "dtype": dtype,
            "missing_pct": round(float(missing_pct), 2),
            "unique_ratio_pct": round(float(unique_ratio_pct), 2),
            "reasons": reasons[:6],
        }

    def _build_rule_based_model_summary(
        self,
        issues: List[str],
        trainability: Dict[str, Any],
        validation_strategy: Dict[str, Any],
        target_profile: Dict[str, Any],
        semantic_context: Dict[str, Any],
        recommendations: List[str],
    ) -> Dict[str, Any]:
        risk_score = 0
        if "high_missingness" in issues:
            risk_score += 2
        if "high_duplicates" in issues:
            risk_score += 2
        if "multicollinearity_risk" in issues:
            risk_score += 1
        if str(trainability.get("overfitting_risk")) == "high":
            risk_score += 2
        elif str(trainability.get("overfitting_risk")) == "medium":
            risk_score += 1
        if str(validation_strategy.get("recommended_method")) == "time_series_split":
            risk_score += 1

        if risk_score >= 5:
            risk_level = "high"
            headline = "Dataset needs stabilization before aggressive modeling."
        elif risk_score >= 3:
            risk_level = "medium"
            headline = "Dataset is usable with careful validation and preprocessing."
        else:
            risk_level = "low"
            headline = "Dataset appears model-ready for baseline-to-advanced iteration."

        target_name = str(target_profile.get("suggested_target") or "-")
        target_type = str(target_profile.get("target_type") or "unknown")
        semantic_domain = str((semantic_context or {}).get("primary_domain") or "general_tabular")
        validation_method = str(validation_strategy.get("recommended_method") or "kfold")
        difficulty = str(trainability.get("difficulty") or "unknown")
        overfit_risk = str(trainability.get("overfitting_risk") or "low")
        summary_text = (
            f"Dataset semantics suggest {semantic_domain.replace('_', ' ')}. "
            f"Suggested target: {target_name} ({target_type}). "
            f"Expected training difficulty: {difficulty}; overfitting risk: {overfit_risk}. "
            f"Recommended validation: {validation_method}."
        )
        priority_actions = [str(item) for item in (recommendations or [])[:5]]
        return {
            "generated_by": "rules",
            "risk_level": risk_level,
            "headline": headline,
            "summary": summary_text,
            "priority_actions": priority_actions,
            "generated_at": pd.Timestamp.utcnow().isoformat(),
        }

    async def _generate_llm_model_building_summary(self, insights: Dict[str, Any]) -> Dict[str, Any]:
        segments = dict((insights or {}).get("segments") or {})
        default_summary = dict(segments.get("model_building_summary") or (insights or {}).get("llm_summary") or {})
        if not default_summary:
            default_summary = self._build_rule_based_model_summary(
                issues=list((insights or {}).get("issues") or []),
                trainability=dict((segments.get("feature_readiness") or {}).get("trainability") or {}),
                validation_strategy=dict(segments.get("validation_strategy") or {}),
                target_profile=dict((segments.get("target_diagnostics") or {}).get("profile") or {}),
                semantic_context=dict((segments.get("target_diagnostics") or {}).get("semantic_context") or {}),
                recommendations=list((insights or {}).get("recommendations") or []),
            )

        compact_payload = {
            "overview": {
                "rows": (segments.get("overview") or {}).get("rows"),
                "columns": (segments.get("overview") or {}).get("columns"),
                "quality_score": (segments.get("overview") or {}).get("quality_score"),
                "issues": (segments.get("overview") or {}).get("issues"),
            },
            "target_profile": (segments.get("target_diagnostics") or {}).get("profile"),
            "semantic_context": (segments.get("target_diagnostics") or {}).get("semantic_context"),
            "semantic_target_candidates": (segments.get("target_diagnostics") or {}).get("semantic_target_candidates"),
            "trainability": (segments.get("feature_readiness") or {}).get("trainability"),
            "validation": segments.get("validation_strategy"),
            "preprocessing_recommendations": (segments.get("preprocessing") or {}).get("recommendations"),
        }
        system_prompt = (
            "You are a senior ML lead. Return STRICT JSON only. "
            "Provide concise model-building summary from the dataset insights. "
            "Infer likely dataset business semantics and ensure suggested target aligns with that semantics."
        )
        user_prompt = (
            "Given this dataset insight payload, produce JSON with keys: "
            "risk_level (low|medium|high), headline (string), summary (string), "
            "priority_actions (array of 3-6 short strings).\\n\\n"
            f"payload={json.dumps(compact_payload, ensure_ascii=True)}"
        )
        try:
            llm_response = await llm_service.generate(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.2,
                max_tokens=350,
            )
            parsed = self._extract_json_payload(str(llm_response))
            risk_level = str(parsed.get("risk_level") or default_summary.get("risk_level") or "medium").lower()
            if risk_level not in {"low", "medium", "high"}:
                risk_level = "medium"
            headline = str(parsed.get("headline") or default_summary.get("headline") or "").strip()
            summary = str(parsed.get("summary") or default_summary.get("summary") or "").strip()
            actions_raw = parsed.get("priority_actions")
            actions = [str(item).strip() for item in (actions_raw or []) if str(item).strip()]
            if not actions:
                actions = list(default_summary.get("priority_actions") or [])
            return {
                "generated_by": "llm",
                "risk_level": risk_level,
                "headline": headline,
                "summary": summary,
                "priority_actions": actions[:6],
                "generated_at": pd.Timestamp.utcnow().isoformat(),
            }
        except Exception as e:
            log.warning(f"LLM summary generation failed; using rule summary. reason={e}")
            fallback = dict(default_summary)
            fallback["generated_by"] = "rules_fallback"
            fallback["generated_at"] = pd.Timestamp.utcnow().isoformat()
            return fallback

    async def recompute_dataset_insights_with_llm_summary(self, dataset_id: str) -> Dict[str, Any]:
        insights = self.recompute_dataset_insights(dataset_id=dataset_id)
        llm_summary = await self._generate_llm_model_building_summary(insights)
        merged = dict(insights)
        merged["llm_summary"] = llm_summary
        segments = dict((merged.get("segments") or {}))
        segments["model_building_summary"] = llm_summary
        merged["segments"] = segments

        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")
        metadata_payload = dict(dataset_meta.get("metadata", {}))
        metadata_payload["insights"] = merged
        metadata_payload["insights_updated_at"] = pd.Timestamp.utcnow().isoformat()
        updated = PredictionDataTable.update_dataset(
            dataset_id=dataset_id,
            metadata=metadata_payload,
        )
        if not updated:
            raise ValueError("Failed to persist LLM insight summary.")
        return merged

    async def analyze_dataset_with_llm(
        self,
        dataset_id: str,
        user_instruction: str,
    ) -> Dict[str, Any]:
        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")

        insights: Dict[str, Any] = {}
        try:
            insights = self.get_dataset_insights_from_metadata(dataset_id=dataset_id)
        except Exception:
            insights = self.analyze_dataset(dataset_id=dataset_id)

        segments = dict((insights or {}).get("segments") or {})
        schema_cols = list(dataset_meta.get("schema") or [])
        sample_rows: List[Dict[str, Any]] = []
        try:
            sample_rows = PredictionDataTable.get_dataset_rows(dataset_id, limit=20)
        except Exception:
            pass

        overview = dict(segments.get("overview") or {})
        data_quality = dict(segments.get("data_quality") or {})
        target_diag = dict(segments.get("target_diagnostics") or {})
        target_profile = dict(target_diag.get("profile") or {})
        feature_ready = dict(segments.get("feature_readiness") or {})
        validation = dict(segments.get("validation_strategy") or {})
        preprocessing = dict(segments.get("preprocessing") or {})
        trainability = dict(feature_ready.get("trainability") or {})
        leakage = list(feature_ready.get("leakage_candidates") or [])
        top_corr = list(feature_ready.get("top_correlations") or feature_ready.get("feature_target_signal") or [])[:10]
        high_corr = list(feature_ready.get("high_correlations") or [])[:5]
        skewed = list(feature_ready.get("skewed_features") or [])[:5]
        outlier_summary = list(data_quality.get("outlier_summary") or [])[:5]

        schema_table_lines = ["| Column | Dtype | Semantic | Null% | Unique | Sample |", "|---|---|---|---|---|---|"]
        for col in schema_cols:
            name = col.get("name", "")
            dtype = col.get("detected_dtype", "")
            semantic = col.get("semantic_type", "")
            null_count = int(col.get("null_count", 0))
            rows_count = int(dataset_meta.get("rows", 1)) or 1
            null_pct = round(100.0 * null_count / rows_count, 1)
            unique = col.get("unique_count", "")
            samples = col.get("sample_values", [])[:3]
            sample_str = ", ".join(str(s) for s in samples)[:60]
            schema_table_lines.append(f"| {name} | {dtype} | {semantic} | {null_pct}% | {unique} | {sample_str} |")
        schema_table = "\n".join(schema_table_lines)

        sample_table = ""
        if sample_rows:
            headers = list(sample_rows[0].keys())[:15]
            sample_table_lines = ["| " + " | ".join(headers) + " |", "|" + "---|" * len(headers)]
            for row in sample_rows[:10]:
                vals = [str(row.get(h, ""))[:30] for h in headers]
                sample_table_lines.append("| " + " | ".join(vals) + " |")
            sample_table = "\n".join(sample_table_lines)

        available_algos = self.list_algorithms()
        algo_list = "\n".join(
            f"- {a['id']}: {a['label']} (problem_type={a['problem_type']})"
            for a in available_algos
        )

        system_prompt = (
            "You are an expert data scientist. Analyze the dataset profile and the user's instruction. "
            "Return STRICT JSON only with the exact keys specified. "
            "Choose the best problem_type from: regression, classification, clustering. "
            "Pick the most appropriate target column based on the user's intent and data characteristics. "
            "Exclude ID columns, leakage candidates, and non-predictive columns from features."
        )

        top_corr_str = ", ".join(
            f"{c.get('feature_a', c.get('feature', ''))}:{c.get('abs_correlation', c.get('correlation', ''))}"
            for c in top_corr
        )
        high_corr_str = ", ".join(
            f"{c.get('feature_a','')}-{c.get('feature_b','')}:{c.get('abs_correlation','')}"
            for c in high_corr
        )
        skewed_str = ", ".join(str(s.get("column")) for s in skewed)

        safe_instruction = user_instruction.replace('"', "'")
        instruction_line = f'USER INSTRUCTION: "{safe_instruction}"'
        user_prompt = (
            f"{instruction_line}\n\n"
            f"DATASET: {dataset_meta.get('original_filename')}\n"
            f"Rows: {dataset_meta.get('rows')}, Columns: {dataset_meta.get('columns_count')}\n"
            f"Quality Score: {overview.get('quality_score', 'N/A')}/100\n"
            f"Issues: {overview.get('issues', [])}\n\n"
            f"SCHEMA:\n{schema_table}\n\n"
            f"TARGET DIAGNOSTICS (automated analysis):\n"
            f"- Suggested target: {target_profile.get('suggested_target')}\n"
            f"- Target type: {target_profile.get('target_type')}\n"
            f"- Semantic domain: {(target_diag.get('semantic_context') or {}).get('primary_domain')}\n"
            f"- Leakage candidates: {[l.get('feature') for l in leakage]}\n\n"
            f"FEATURE READINESS:\n"
            f"- Numeric: {feature_ready.get('numeric_columns', 0)}, Categorical: {feature_ready.get('categorical_columns', 0)}, Datetime: {feature_ready.get('datetime_like_columns', 0)}\n"
            f"- Signal strength: {trainability.get('proxy_signal_strength')}\n"
            f"- Difficulty: {trainability.get('difficulty')}\n"
            f"- Overfitting risk: {trainability.get('overfitting_risk')}\n"
            f"- Top correlations: [{top_corr_str}]\n"
            f"- High correlations: [{high_corr_str}]\n"
            f"- Skewed features: [{skewed_str}]\n\n"
            f"VALIDATION: method={validation.get('recommended_method')}, folds={validation.get('folds')}, test_size={validation.get('test_size_pct')}%\n\n"
            f"SAMPLE DATA:\n{sample_table}\n\n"
            f"AVAILABLE ALGORITHMS:\n{algo_list}\n\n"
            "Return JSON with exactly these keys:\n"
            "{\n"
            '  "problem_type": "regression|classification|clustering",\n'
            '  "target_column": "column_name",\n'
            '  "feature_columns": ["col1", "col2"],\n'
            '  "excluded_columns": ["id_col", "leakage_col"],\n'
            '  "message": "Human-readable explanation of your recommendation",\n'
            '  "data_quality_notes": ["note1", "note2"],\n'
            '  "preprocessing_suggestion": {\n'
            '    "encoding": {"column": "strategy"},\n'
            '    "scaling": ["columns"],\n'
            '    "handle_missing": "strategy"\n'
            "  }\n"
            "}"
        )

        try:
            llm_response = await llm_service.generate(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.1,
                max_tokens=1200,
            )
            parsed = self._extract_json_payload(str(llm_response))
        except Exception as e:
            log.warning(f"LLM analyze-dataset failed; using rule-based fallback. reason={e}")
            parsed = {}

        column_names = [str(c.get("name")) for c in schema_cols if c.get("name")]
        problem_type = str(parsed.get("problem_type") or "regression").strip().lower()
        if problem_type not in {"regression", "classification", "clustering"}:
            problem_type = "regression"

        target_col = str(parsed.get("target_column") or target_profile.get("suggested_target") or "").strip()
        if target_col not in column_names:
            target_col = column_names[-1] if column_names else ""

        excluded = [str(c) for c in (parsed.get("excluded_columns") or []) if str(c).strip()]
        leakage_names = [str(l.get("feature", "")) for l in leakage if l.get("feature")]
        excluded = list(set(excluded + leakage_names))

        feature_cols = [str(c) for c in (parsed.get("feature_columns") or []) if str(c).strip() and str(c).strip() in column_names]
        if not feature_cols:
            feature_cols = [c for c in column_names if c != target_col and c not in excluded]

        message = str(parsed.get("message") or "").strip()
        if not message:
            message = f"Based on analysis of '{dataset_meta.get('original_filename')}', I recommend {problem_type} with target '{target_col}'."

        data_quality_notes = [str(n) for n in (parsed.get("data_quality_notes") or []) if str(n).strip()]
        preprocessing_suggestion = parsed.get("preprocessing_suggestion") or {}

        return {
            "problem_type": problem_type,
            "target_column": target_col,
            "feature_columns": feature_cols,
            "excluded_columns": excluded,
            "message": message,
            "data_quality_notes": data_quality_notes,
            "preprocessing_suggestion": preprocessing_suggestion,
            "dataset_summary": {
                "rows": dataset_meta.get("rows"),
                "columns": dataset_meta.get("columns_count"),
                "quality_score": overview.get("quality_score"),
                "difficulty": trainability.get("difficulty"),
                "signal_strength": trainability.get("proxy_signal_strength"),
            },
        }

    async def recommend_algorithms_with_llm(
        self,
        dataset_id: str,
        problem_type: str,
        target_column: str,
        feature_columns: Optional[List[str]] = None,
        user_preferences: str = "",
    ) -> Dict[str, Any]:
        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")

        insights: Dict[str, Any] = {}
        try:
            insights = self.get_dataset_insights_from_metadata(dataset_id=dataset_id)
        except Exception:
            insights = {}

        segments = dict((insights or {}).get("segments") or {})
        feature_ready = dict(segments.get("feature_readiness") or {})
        trainability = dict(feature_ready.get("trainability") or {})
        validation = dict(segments.get("validation_strategy") or {})
        top_corr = list(feature_ready.get("top_correlations") or feature_ready.get("feature_target_signal") or [])[:10]
        high_corr = list(feature_ready.get("high_correlations") or [])[:5]
        skewed = list(feature_ready.get("skewed_features") or [])[:5]
        outlier_cols = list((segments.get("data_quality") or {}).get("outlier_summary") or [])[:5]

        schema_cols = list(dataset_meta.get("schema") or [])
        feature_count = len(feature_columns or [])
        if not feature_count:
            feature_count = len(schema_cols) - 1

        available_algos = [a for a in self.list_algorithms(problem_type=problem_type)]
        algo_descriptions = []
        for a in available_algos:
            params_desc = ", ".join(
                f"{p['name']}({p['type']}, default={p.get('default')})" for p in a.get("params", [])
            )
            algo_descriptions.append(f"- {a['id']}: {a['label']} | params: {params_desc}")
        algo_text = "\n".join(algo_descriptions) if algo_descriptions else "No algorithms available."

        system_prompt = (
            "You are an expert ML engineer. Given the dataset profile and problem configuration, "
            "recommend the top 3 algorithms with optimal hyperparameters. "
            "Return STRICT JSON only. Consider dataset size, feature types, multicollinearity, "
            "outliers, skewness, and the user's preferences when recommending."
        )

        top_corr_str2 = ", ".join(
            f"{c.get('feature_a', c.get('feature', ''))}:{c.get('abs_correlation', c.get('correlation', ''))}"
            for c in top_corr
        )
        high_corr_str2 = ", ".join(
            f"{c.get('feature_a','')}-{c.get('feature_b','')}:{c.get('abs_correlation','')}"
            for c in high_corr
        )
        skewed_str2 = ", ".join(str(s.get("column")) for s in skewed)
        outlier_str2 = ", ".join(str(o.get("column")) for o in outlier_cols)

        user_prompt = (
            f"PROBLEM: {problem_type}\n"
            f"TARGET: {target_column}\n"
            f"FEATURES: {feature_columns or 'all except target'} ({feature_count} features)\n"
            f"DATASET SIZE: {dataset_meta.get('rows')} rows\n\n"
            f"DATA PROFILE:\n"
            f"- Difficulty: {trainability.get('difficulty')}\n"
            f"- Signal strength: {trainability.get('proxy_signal_strength')}\n"
            f"- Overfitting risk: {trainability.get('overfitting_risk')}\n"
            f"- Rows per feature: {trainability.get('rows_per_feature')}\n"
            f"- Top correlations: [{top_corr_str2}]\n"
            f"- Multicollinearity: [{high_corr_str2}]\n"
            f"- Skewed features: [{skewed_str2}]\n"
            f"- Outlier columns: [{outlier_str2}]\n"
            f"- Recommended validation: {validation.get('recommended_method')}, folds={validation.get('folds')}\n\n"
            f"USER PREFERENCES: {user_preferences or 'None specified'}\n\n"
            f"AVAILABLE ALGORITHMS for {problem_type}:\n{algo_text}\n\n"
            "Return JSON:\n"
            "{\n"
            '  "recommendations": [\n'
            "    {\n"
            '      "algorithm": "algorithm_id",\n'
            '      "reason": "Why this algorithm suits this dataset",\n'
            '      "params": {"param": value},\n'
            '      "expected_performance": "high|good|moderate|low",\n'
            '      "training_time_estimate": "fast|medium|slow"\n'
            "    }\n"
            "  ],\n"
            '  "preprocessing_notes": ["note1", "note2"],\n'
            '  "message": "Summary recommendation to user"\n'
            "}"
        )

        try:
            llm_response = await llm_service.generate(
                prompt=user_prompt,
                system_prompt=system_prompt,
                temperature=0.1,
                max_tokens=1200,
            )
            parsed = self._extract_json_payload(str(llm_response))
        except Exception as e:
            log.warning(f"LLM recommend-algorithms failed; using rule-based fallback. reason={e}")
            parsed = {}

        raw_recs = parsed.get("recommendations") or []
        if not raw_recs and available_algos:
            raw_recs = [
                {
                    "algorithm": available_algos[0]["id"],
                    "reason": "Default recommendation.",
                    "params": {p["name"]: p.get("default") for p in available_algos[0].get("params", [])},
                    "expected_performance": "good",
                    "training_time_estimate": "medium",
                }
            ]

        algo_ids = {a["id"] for a in available_algos}
        validated_recs: List[Dict[str, Any]] = []
        for rec in raw_recs:
            algo_id = str(rec.get("algorithm") or "").strip()
            if algo_id not in algo_ids:
                continue
            algo_cfg = self.algorithms.get(algo_id, {})
            param_schema = {p["name"]: p for p in algo_cfg.get("params", [])}
            raw_params = dict(rec.get("params") or {})
            clean_params: Dict[str, Any] = {}
            for key, value in raw_params.items():
                if key in param_schema:
                    clean_params[key] = self._coerce_value(value, param_schema[key]["type"])
            for p in algo_cfg.get("params", []):
                if p["name"] not in clean_params:
                    clean_params[p["name"]] = p.get("default")
            validated_recs.append({
                "algorithm": algo_id,
                "label": algo_cfg.get("label", algo_id),
                "reason": str(rec.get("reason") or ""),
                "params": clean_params,
                "expected_performance": str(rec.get("expected_performance") or "good"),
                "training_time_estimate": str(rec.get("training_time_estimate") or "medium"),
            })

        preprocessing_notes = [str(n) for n in (parsed.get("preprocessing_notes") or []) if str(n).strip()]
        message = str(parsed.get("message") or "").strip()
        if not message:
            if validated_recs:
                message = f"I recommend starting with {validated_recs[0]['label']}. {validated_recs[0].get('reason', '')}"
            else:
                message = "No suitable algorithms found for this configuration."

        return {
            "recommendations": validated_recs,
            "preprocessing_notes": preprocessing_notes,
            "message": message,
        }

    async def save_uploaded_dataset(self, file: UploadFile, folder: Optional[str] = None) -> Dict[str, Any]:
        if not file.filename:
            raise ValueError("Filename is required")

        extension = Path(file.filename).suffix.lower()
        if extension not in ALLOWED_UPLOAD_EXTENSIONS:
            raise ValueError("Unsupported file format. Use CSV, Excel, JSON, or ZIP.")

        dataset_id = str(uuid.uuid4())
        safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", file.filename)
        stored_name = f"{dataset_id}_{safe_name}"
        folder_data = self._resolve_or_create_folder(folder or self.default_folder)
        folder_path_value = folder_data["path"]
        folder_path = self._get_dataset_folder_path(folder_path_value)
        folder_path.mkdir(parents=True, exist_ok=True)
        dataset_path = folder_path / stored_name
        file_size, file_hash = await self._write_upload_to_path(file, dataset_path)
        if extension == ".zip":
            return self._persist_uploaded_archive(
                archive_path=dataset_path,
                folder_data=folder_data,
                archive_filename=file.filename,
                source="upload_zip",
                metadata_overrides={"archive_upload": True},
            )
        return self._persist_uploaded_dataset(
            dataset_id=dataset_id,
            dataset_path=dataset_path,
            folder_data=folder_data,
            original_filename=file.filename,
            stored_filename=stored_name,
            extension=extension,
            mime_type=file.content_type,
            file_size=file_size,
            file_hash=file_hash,
            source="upload",
        )

    def start_chunked_upload(
        self,
        filename: str,
        file_size: int,
        folder: Optional[str] = None,
        content_type: Optional[str] = None,
        chunk_size: int = 5 * 1024 * 1024,
        resume_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        safe_filename = str(filename or "").strip()
        if not safe_filename:
            raise ValueError("Filename is required")
        extension = Path(safe_filename).suffix.lower()
        if extension not in ALLOWED_UPLOAD_EXTENSIONS:
            raise ValueError("Unsupported file format. Use CSV, Excel, JSON, or ZIP.")
        if file_size <= 0:
            raise ValueError("File size must be greater than zero.")

        normalized_chunk_size = int(chunk_size or 5 * 1024 * 1024)
        if normalized_chunk_size <= 0:
            normalized_chunk_size = 5 * 1024 * 1024

        safe_resume_key = str(resume_key or "").strip()
        if safe_resume_key:
            for session in self.upload_sessions.values():
                if (
                    session.get("resume_key") == safe_resume_key
                    and session.get("status") in {"initialized", "uploading", "uploaded", "processing"}
                    and int(session.get("total_bytes", 0) or 0) == int(file_size)
                    and str(session.get("original_filename") or "") == safe_filename
                ):
                    return self._public_upload_status(session)

        upload_id = str(uuid.uuid4())
        temp_path = self.uploads_dir / f"{upload_id}.part"
        temp_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path.touch(exist_ok=True)
        now_iso = pd.Timestamp.utcnow().isoformat()
        session = {
            "upload_id": upload_id,
            "resume_key": safe_resume_key or None,
            "original_filename": safe_filename,
            "extension": extension,
            "folder": self._sanitize_folder_path(folder or self.default_folder),
            "content_type": content_type,
            "chunk_size": normalized_chunk_size,
            "total_bytes": int(file_size),
            "uploaded_bytes": 0,
            "next_chunk_index": 0,
            "status": "initialized",
            "message": "Upload session initialized",
            "progress": 0,
            "temp_path": str(temp_path),
            "dataset_id": None,
            "error": None,
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        self.upload_sessions[upload_id] = session
        return self._public_upload_status(session)

    async def append_upload_chunk(
        self,
        upload_id: str,
        chunk_index: int,
        chunk_file: UploadFile,
    ) -> Dict[str, Any]:
        session = self.upload_sessions.get(upload_id)
        if not session:
            raise ValueError("Upload session not found.")
        if session.get("status") in {"processing", "completed"}:
            raise ValueError("Upload session is not accepting new chunks.")
        if session.get("status") == "failed":
            raise ValueError("Upload session failed. Start a new upload.")

        expected_chunk = int(session.get("next_chunk_index", 0) or 0)
        if chunk_index < expected_chunk:
            return self._public_upload_status(session)
        if chunk_index > expected_chunk:
            raise ValueError(f"Out-of-order chunk. Expected chunk {expected_chunk}.")

        temp_path = Path(str(session.get("temp_path", "")))
        if not temp_path.parent.exists():
            temp_path.parent.mkdir(parents=True, exist_ok=True)
        total_written = 0
        try:
            with temp_path.open("ab") as f:
                while True:
                    data = await chunk_file.read(1024 * 1024)
                    if not data:
                        break
                    f.write(data)
                    total_written += len(data)
        except Exception as e:
            session["status"] = "failed"
            session["error"] = str(e)
            session["message"] = "Failed to write upload chunk"
            session["updated_at"] = pd.Timestamp.utcnow().isoformat()
            raise
        finally:
            await chunk_file.close()

        if total_written <= 0:
            raise ValueError("Received empty chunk.")

        uploaded = int(session.get("uploaded_bytes", 0) or 0) + total_written
        total_bytes = int(session.get("total_bytes", 0) or 0)
        if uploaded > total_bytes:
            session["status"] = "failed"
            session["error"] = "Uploaded data exceeds expected file size."
            session["message"] = "Upload payload is larger than expected"
            session["updated_at"] = pd.Timestamp.utcnow().isoformat()
            raise ValueError("Uploaded data exceeds expected file size.")

        session["uploaded_bytes"] = uploaded
        session["next_chunk_index"] = expected_chunk + 1
        session["status"] = "uploaded" if uploaded == total_bytes else "uploading"
        session["message"] = "Upload transfer complete" if uploaded == total_bytes else "Receiving chunks"
        session["progress"] = self._upload_transfer_progress(uploaded, total_bytes)
        session["updated_at"] = pd.Timestamp.utcnow().isoformat()
        return self._public_upload_status(session)

    def get_upload_status(self, upload_id: str) -> Dict[str, Any]:
        session = self.upload_sessions.get(upload_id)
        if not session:
            raise ValueError("Upload session not found.")
        return self._public_upload_status(session)

    async def finalize_chunked_upload(self, upload_id: str) -> Dict[str, Any]:
        session = self.upload_sessions.get(upload_id)
        if not session:
            raise ValueError("Upload session not found.")
        if session.get("status") == "completed" and session.get("dataset_id"):
            return self._public_upload_status(session)
        if session.get("status") == "failed":
            raise ValueError(str(session.get("error") or "Upload session failed."))

        total_bytes = int(session.get("total_bytes", 0) or 0)
        uploaded_bytes = int(session.get("uploaded_bytes", 0) or 0)
        if uploaded_bytes != total_bytes:
            raise ValueError("Upload is incomplete. Continue uploading remaining chunks.")

        temp_path = Path(str(session.get("temp_path", "")))
        if not temp_path.exists():
            raise ValueError("Uploaded file chunk data not found.")

        session["status"] = "processing"
        session["message"] = "Validating and parsing dataset"
        session["progress"] = 90
        session["updated_at"] = pd.Timestamp.utcnow().isoformat()

        try:
            folder_data = self._resolve_or_create_folder(str(session.get("folder") or self.default_folder))
            dataset_id = str(uuid.uuid4())
            safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", str(session.get("original_filename", "")))
            stored_name = f"{dataset_id}_{safe_name}"
            folder_path = self._get_dataset_folder_path(folder_data["path"])
            folder_path.mkdir(parents=True, exist_ok=True)
            dataset_path = folder_path / stored_name
            temp_path.replace(dataset_path)
            extension = str(session.get("extension", "")).lower()
            if extension == ".zip":
                metadata = self._persist_uploaded_archive(
                    archive_path=dataset_path,
                    folder_data=folder_data,
                    archive_filename=str(session.get("original_filename", "")),
                    source="chunk_upload_zip",
                    metadata_overrides={
                        "resume_key": session.get("resume_key"),
                        "upload_id": upload_id,
                        "archive_upload": True,
                    },
                )
            else:
                file_hash = self._hash_file(dataset_path)
                metadata = self._persist_uploaded_dataset(
                    dataset_id=dataset_id,
                    dataset_path=dataset_path,
                    folder_data=folder_data,
                    original_filename=str(session.get("original_filename", "")),
                    stored_filename=stored_name,
                    extension=extension,
                    mime_type=session.get("content_type"),
                    file_size=uploaded_bytes,
                    file_hash=file_hash,
                    source="chunk_upload",
                    metadata_overrides={
                        "resume_key": session.get("resume_key"),
                        "upload_id": upload_id,
                    },
                )
            session["status"] = "completed"
            session["message"] = "Upload and processing completed"
            session["progress"] = 100
            session["dataset_id"] = metadata["dataset_id"]
            session["result"] = metadata
            session["updated_at"] = pd.Timestamp.utcnow().isoformat()
            session["error"] = None
            return self._public_upload_status(session)
        except Exception as e:
            session["status"] = "failed"
            session["error"] = str(e)
            session["message"] = "Failed to finalize upload"
            session["updated_at"] = pd.Timestamp.utcnow().isoformat()
            raise

    def _public_upload_status(self, session: Dict[str, Any]) -> Dict[str, Any]:
        payload = {
            "upload_id": str(session.get("upload_id", "")),
            "status": str(session.get("status", "unknown")),
            "message": str(session.get("message", "")),
            "progress": int(session.get("progress", 0) or 0),
            "original_filename": str(session.get("original_filename", "")),
            "folder": str(session.get("folder", self.default_folder)),
            "total_bytes": int(session.get("total_bytes", 0) or 0),
            "uploaded_bytes": int(session.get("uploaded_bytes", 0) or 0),
            "next_chunk_index": int(session.get("next_chunk_index", 0) or 0),
            "chunk_size": int(session.get("chunk_size", 0) or 0),
            "dataset_id": session.get("dataset_id"),
            "error": session.get("error"),
            "created_at": session.get("created_at"),
            "updated_at": session.get("updated_at"),
        }
        if session.get("result"):
            payload["result"] = session["result"]
        return payload

    async def _write_upload_to_path(self, file: UploadFile, path: Path) -> Tuple[int, str]:
        total = 0
        hash_sha256 = hashlib.sha256()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
                total += len(chunk)
                hash_sha256.update(chunk)
        await file.close()
        return total, hash_sha256.hexdigest()

    def _persist_uploaded_dataset(
        self,
        dataset_id: str,
        dataset_path: Path,
        folder_data: Dict[str, Any],
        original_filename: str,
        stored_filename: str,
        extension: str,
        mime_type: Optional[str],
        file_size: int,
        file_hash: Optional[str],
        source: str,
        metadata_overrides: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        try:
            df = self._load_dataframe(dataset_path)
            if df.empty:
                raise ValueError("Uploaded file has no rows.")
            schema = self._infer_schema(df)
            row_payload = self._records_from_dataframe(df)
            metadata_payload: Dict[str, Any] = {
                "source": source,
                "upload_filename": original_filename,
                "schema_detected_at": pd.Timestamp.utcnow().isoformat(),
                "format": str(extension).replace(".", ""),
            }
            if metadata_overrides:
                metadata_payload.update(metadata_overrides)
            metadata = PredictionDataTable.create_dataset(
                dataset_id=dataset_id,
                folder_id=folder_data["id"],
                original_filename=original_filename,
                stored_filename=stored_filename,
                file_extension=extension,
                file_path=str(dataset_path),
                file_size=int(file_size),
                mime_type=mime_type,
                file_hash=file_hash,
                rows=int(len(df)),
                schema=schema,
                metadata=metadata_payload,
            )
            PredictionDataTable.replace_dataset_rows(dataset_id=dataset_id, rows=row_payload, schema=schema)
            with_insights = self._compute_and_persist_dataset_insights(dataset_id=dataset_id)
            refreshed = PredictionDataTable.get_dataset_by_id(dataset_id)
            return with_insights or refreshed or metadata
        except Exception:
            if dataset_path.exists() and dataset_path.is_file():
                dataset_path.unlink(missing_ok=True)
            raise

    def _persist_uploaded_archive(
        self,
        archive_path: Path,
        folder_data: Dict[str, Any],
        archive_filename: str,
        source: str,
        metadata_overrides: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        imported: List[Dict[str, Any]] = []
        skipped_files: List[Dict[str, str]] = []
        archive_folder = self._resolve_or_create_folder(
            self._unique_archive_folder_path(folder_data.get("path", self.default_folder), archive_filename)
        )

        try:
            with zipfile.ZipFile(archive_path, "r") as archive:
                for member in archive.infolist():
                    if member.is_dir():
                        continue
                    member_name = Path(member.filename).name
                    if not member_name:
                        continue
                    extension = Path(member_name).suffix.lower()
                    if extension not in ALLOWED_DATASET_EXTENSIONS:
                        skipped_files.append({
                            "filename": member.filename,
                            "reason": "Unsupported file format",
                        })
                        continue

                    dataset_id = str(uuid.uuid4())
                    safe_member_name = re.sub(r"[^a-zA-Z0-9._-]", "_", member_name)
                    stored_name = f"{dataset_id}_{safe_member_name}"
                    dataset_path = self._get_dataset_folder_path(archive_folder["path"]) / stored_name
                    dataset_path.parent.mkdir(parents=True, exist_ok=True)

                    try:
                        with archive.open(member, "r") as src, dataset_path.open("wb") as dst:
                            shutil.copyfileobj(src, dst)
                        file_size = dataset_path.stat().st_size
                        file_hash = self._hash_file(dataset_path)
                        per_file_metadata = {
                            "archive_filename": archive_filename,
                            "archive_member": member.filename,
                        }
                        if metadata_overrides:
                            per_file_metadata.update(metadata_overrides)
                        metadata = self._persist_uploaded_dataset(
                            dataset_id=dataset_id,
                            dataset_path=dataset_path,
                            folder_data=archive_folder,
                            original_filename=member_name,
                            stored_filename=stored_name,
                            extension=extension,
                            mime_type=self._media_type_for_extension(extension),
                            file_size=file_size,
                            file_hash=file_hash,
                            source=source,
                            metadata_overrides=per_file_metadata,
                        )
                        imported.append(metadata)
                    except Exception as e:
                        skipped_files.append({
                            "filename": member.filename,
                            "reason": str(e),
                        })
                        if dataset_path.exists() and dataset_path.is_file():
                            dataset_path.unlink(missing_ok=True)

            if not imported:
                raise ValueError("ZIP archive does not contain any valid CSV, Excel, or JSON datasets.")

            primary = dict(imported[0])
            primary["archive_filename"] = archive_filename
            primary["archive_folder"] = archive_folder["path"]
            primary["imported_count"] = len(imported)
            primary["imported_datasets"] = imported
            primary["skipped_files"] = skipped_files
            return primary
        except zipfile.BadZipFile:
            raise ValueError("Invalid ZIP file.")
        finally:
            if archive_path.exists() and archive_path.is_file():
                archive_path.unlink(missing_ok=True)

    def _unique_archive_folder_path(self, parent_folder_path: str, archive_filename: str) -> str:
        base_parent = self._sanitize_folder_path(parent_folder_path or self.default_folder)
        archive_stem = Path(str(archive_filename or "").strip()).stem
        safe_stem = self._sanitize_folder_name(archive_stem or "archive")
        candidate = f"{base_parent}/{safe_stem}" if base_parent else safe_stem
        if not PredictionDataTable.get_folder_by_path(candidate):
            return candidate

        suffix = 2
        while True:
            next_candidate = f"{candidate}_{suffix}"
            if not PredictionDataTable.get_folder_by_path(next_candidate):
                return next_candidate
            suffix += 1

    def _upload_transfer_progress(self, uploaded_bytes: int, total_bytes: int) -> int:
        if total_bytes <= 0:
            return 0
        ratio = min(1.0, max(0.0, uploaded_bytes / total_bytes))
        return int(round(ratio * 85))

    def get_dataset_by_id(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        return PredictionDataTable.get_dataset_by_id(dataset_id)

    def get_dataset_download_payload(self, dataset_id: str) -> Dict[str, Any]:
        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")

        extension = str(dataset_meta.get("file_extension") or ".csv").strip().lower()
        if extension not in {".csv", ".xlsx", ".xls", ".json"}:
            extension = ".csv"
        original_name = str(dataset_meta.get("original_filename") or f"dataset_{dataset_id}{extension}").strip()
        if not original_name:
            original_name = f"dataset_{dataset_id}{extension}"
        if not original_name.lower().endswith(extension):
            original_name = f"{original_name}{extension}"

        media_type = (
            str(dataset_meta.get("mime_type") or "").strip()
            or self._media_type_for_extension(extension)
        )
        dataset_path = Path(str(dataset_meta.get("path", "")))
        if dataset_path.exists() and dataset_path.is_file():
            return {
                "mode": "file",
                "path": str(dataset_path),
                "filename": original_name,
                "media_type": media_type,
            }

        df = self._load_dataset_dataframe(dataset_meta)
        content_bytes = self._serialize_dataframe_bytes(df, extension)
        return {
            "mode": "memory",
            "content": content_bytes,
            "filename": original_name,
            "media_type": media_type,
        }

    def delete_dataset(self, dataset_id: str) -> Dict[str, Any]:
        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")

        dataset_path = Path(dataset_meta.get("path", ""))

        if dataset_path.exists() and dataset_path.is_file():
            dataset_path.unlink()
        PredictionDataTable.delete_dataset(dataset_id)

        stale_sessions = [
            sid for sid, session in self.prep_sessions.items()
            if session.get("dataset_id") == dataset_id
        ]
        for sid in stale_sessions:
            session = self.prep_sessions[sid]
            snapshot_path = Path(session.get("snapshot_path", ""))
            if snapshot_path.exists() and snapshot_path.is_file():
                snapshot_path.unlink()
            base_snapshot_path = Path(session.get("base_snapshot_path", ""))
            if base_snapshot_path.exists() and base_snapshot_path.is_file():
                base_snapshot_path.unlink()
            for cp in session.get("checkpoints", []):
                cp_path = Path(cp.get("path", ""))
                if cp_path.exists() and cp_path.is_file():
                    cp_path.unlink()
            self.prep_sessions.pop(sid, None)

        return {
            "dataset_id": dataset_id,
            "deleted": True,
            "original_filename": dataset_meta.get("original_filename"),
        }

    def delete_datasets(self, dataset_ids: List[str]) -> Dict[str, Any]:
        unique_ids: List[str] = []
        seen: set[str] = set()
        for raw_id in dataset_ids or []:
            dataset_id = str(raw_id or "").strip()
            if not dataset_id or dataset_id in seen:
                continue
            seen.add(dataset_id)
            unique_ids.append(dataset_id)

        results: List[Dict[str, Any]] = []
        deleted_count = 0
        for dataset_id in unique_ids:
            try:
                result = self.delete_dataset(dataset_id=dataset_id)
                deleted_count += 1
                results.append({
                    "dataset_id": dataset_id,
                    "deleted": True,
                    "original_filename": result.get("original_filename"),
                    "error": None,
                })
            except Exception as e:
                results.append({
                    "dataset_id": dataset_id,
                    "deleted": False,
                    "original_filename": None,
                    "error": str(e),
                })

        failed_count = len(unique_ids) - deleted_count
        return {
            "requested": len(unique_ids),
            "deleted_count": deleted_count,
            "failed_count": failed_count,
            "results": results,
        }

    def move_dataset(self, dataset_id: str, folder: str) -> Dict[str, Any]:
        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")

        current_folder = self._sanitize_folder_path(str(dataset_meta.get("folder") or self.default_folder))
        target_folder_data = self._resolve_or_create_folder(folder or self.default_folder)
        target_folder = self._sanitize_folder_path(str(target_folder_data.get("path") or self.default_folder))
        if current_folder == target_folder:
            return dataset_meta

        source_path = Path(str(dataset_meta.get("path", "")))
        if not source_path.exists() or not source_path.is_file():
            raise ValueError("Dataset file not found on disk.")

        destination_dir = self._get_dataset_folder_path(target_folder)
        destination_dir.mkdir(parents=True, exist_ok=True)

        stored_filename = str(dataset_meta.get("stored_filename") or source_path.name).strip() or source_path.name
        destination_path = destination_dir / stored_filename
        if destination_path.exists() and destination_path.resolve() != source_path.resolve():
            raise ValueError("A dataset file with this name already exists in the target folder.")

        shutil.move(str(source_path), str(destination_path))

        metadata_payload = dict(dataset_meta.get("metadata", {}))
        metadata_payload["moved_at"] = pd.Timestamp.utcnow().isoformat()
        metadata_payload["moved_from_folder"] = current_folder
        metadata_payload["moved_to_folder"] = target_folder

        updated = PredictionDataTable.update_dataset(
            dataset_id=dataset_id,
            folder_id=target_folder_data["id"],
            file_path=str(destination_path),
            file_size=destination_path.stat().st_size if destination_path.exists() else None,
            file_hash=self._hash_file(destination_path),
            metadata=metadata_payload,
        )
        if not updated:
            raise ValueError("Failed to move dataset.")

        for session in self.prep_sessions.values():
            if str(session.get("dataset_id") or "") == dataset_id:
                session["source_path"] = str(destination_path)
                session["source_folder"] = target_folder

        return updated

    def rename_dataset(self, dataset_id: str, filename: str) -> Dict[str, Any]:
        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")

        requested_name = str(filename or "").strip()
        if not requested_name:
            raise ValueError("Filename is required.")

        current_extension = str(dataset_meta.get("file_extension") or "").strip().lower()
        safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", requested_name)
        if not safe_name:
            raise ValueError("Filename is required.")

        requested_ext = Path(safe_name).suffix.lower()
        if not requested_ext:
            safe_name = f"{safe_name}{current_extension or ''}"
            requested_ext = Path(safe_name).suffix.lower()

        if current_extension and requested_ext and current_extension != requested_ext:
            raise ValueError("Changing file extension is not supported when renaming.")

        source_path = Path(str(dataset_meta.get("path", "")))
        if not source_path.exists() or not source_path.is_file():
            raise ValueError("Dataset file not found on disk.")

        stored_name = f"{dataset_id}_{safe_name}"
        destination_path = source_path.with_name(stored_name)
        if destination_path.exists() and destination_path.resolve() != source_path.resolve():
            raise ValueError("A dataset file with this name already exists in this folder.")

        if destination_path != source_path:
            shutil.move(str(source_path), str(destination_path))

        metadata_payload = dict(dataset_meta.get("metadata", {}))
        metadata_payload["renamed_at"] = pd.Timestamp.utcnow().isoformat()
        metadata_payload["renamed_from"] = str(dataset_meta.get("original_filename") or "")
        metadata_payload["renamed_to"] = safe_name

        updated = PredictionDataTable.update_dataset(
            dataset_id=dataset_id,
            original_filename=safe_name,
            stored_filename=stored_name,
            file_extension=(current_extension or requested_ext or ".csv"),
            file_path=str(destination_path),
            file_size=destination_path.stat().st_size if destination_path.exists() else None,
            file_hash=self._hash_file(destination_path),
            metadata=metadata_payload,
        )
        if not updated:
            raise ValueError("Failed to rename dataset.")

        for session in self.prep_sessions.values():
            if str(session.get("dataset_id") or "") == dataset_id:
                session["source_path"] = str(destination_path)

        return updated

    def start_prepare_session(self, dataset_id: str) -> Dict[str, Any]:
        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")
        df = self._load_dataset_dataframe(dataset_meta)
        source_path = Path(dataset_meta["path"])
        session_id = str(uuid.uuid4())
        snapshot_path = self.prep_dir / f"{session_id}.pkl"
        base_snapshot_path = self.prep_dir / f"{session_id}_base.pkl"
        df.to_pickle(snapshot_path)
        df.to_pickle(base_snapshot_path)

        self.prep_sessions[session_id] = {
            "session_id": session_id,
            "dataset_id": dataset_id,
            "dataset_name": dataset_meta.get("original_filename"),
            "source_path": str(source_path),
            "source_folder": dataset_meta.get("folder", self.default_folder),
            "snapshot_path": str(snapshot_path),
            "base_snapshot_path": str(base_snapshot_path),
            "operation_log": [],
            "operation_cursor": 0,
            "checkpoints": [],
            "checkpoint_serial": 0,
        }
        return {
            "session_id": session_id,
            "dataset_id": dataset_id,
            "dataset_name": dataset_meta.get("original_filename"),
            "rows": int(len(df)),
            "columns": [str(c) for c in df.columns.tolist()],
        }

    def get_prepare_table(self, session_id: str, limit: int = 200, offset: int = 0) -> Dict[str, Any]:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")

        df = self._load_session_df(session_id)
        total_rows = int(len(df))
        limit = max(1, min(int(limit), 1000))
        offset = max(0, int(offset))
        subset = df.iloc[offset:offset + limit]

        return {
            "session_id": session_id,
            "dataset_id": session["dataset_id"],
            "dataset_name": session["dataset_name"],
            "columns": [str(c) for c in df.columns.tolist()],
            "rows": self._serialize_rows(subset, start_index=offset),
            "total_rows": total_rows,
            "offset": offset,
            "limit": limit,
        }

    def update_prepare_cells(self, session_id: str, updates: List[Dict[str, Any]]) -> Dict[str, Any]:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")

        before_df = self._load_session_df(session_id)
        df = before_df.copy(deep=True)
        changed = 0
        for update in updates:
            row_index = int(update.get("row_index"))
            column = str(update.get("column"))
            value = update.get("value")
            if row_index < 0 or row_index >= len(df):
                continue
            if column not in df.columns:
                continue
            df.at[df.index[row_index], column] = value
            changed += 1

        if changed == 0:
            return {
                "session_id": session_id,
                "updated_cells": 0,
                "rows": int(len(df)),
                "columns": [str(c) for c in df.columns.tolist()],
            }

        self._push_undo_delta(
            session_id,
            before_df,
            df,
            label="update_cells",
            details={"updated_cells": changed},
        )
        self._save_session_df(session_id, df)
        return {
            "session_id": session_id,
            "updated_cells": changed,
            "rows": int(len(df)),
            "columns": [str(c) for c in df.columns.tolist()],
        }

    def apply_prepare_operation(self, session_id: str, operation: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")

        before_df = self._load_session_df(session_id)
        df = before_df.copy(deep=True)
        params = params or {}
        op = str(operation or "").strip().lower()
        before_rows = int(len(df))

        def _insert_column_after(source_col: str, new_col: str, values: Any) -> None:
            if source_col not in df.columns:
                df[new_col] = values
                return
            source_index = df.columns.get_loc(source_col)
            df.insert(source_index + 1, new_col, values)

        if op == "drop_duplicates":
            subset = params.get("subset")
            subset_cols = [str(c) for c in subset if str(c) in df.columns] if isinstance(subset, list) else None
            if isinstance(subset, list) and subset and not subset_cols:
                raise ValueError("No valid columns found in subset for drop_duplicates.")
            deduped, dedup_meta = self._drop_duplicates_robust(df=df, subset_cols=subset_cols, params=params)
            df = deduped
            params = {**params, **dedup_meta}
        elif op == "sort_rows":
            column = params.get("column") or params.get("by")
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for sort_rows.")
            ascending_raw = str(params.get("ascending", "true")).strip().lower()
            ascending = ascending_raw not in {"false", "0", "no"}
            df = df.sort_values(by=column, ascending=ascending, na_position="last")
        elif op == "drop_missing_rows":
            subset = params.get("subset")
            how = str(params.get("how", "any")).lower()
            how = "all" if how == "all" else "any"
            subset_cols = [c for c in (subset or []) if c in df.columns] if isinstance(subset, list) else None
            df = df.dropna(subset=subset_cols, how=how)
        elif op == "fill_missing":
            column = params.get("column")
            strategy = str(params.get("strategy", "value")).lower()
            fill_value = params.get("value")

            target_columns = [column] if column and column in df.columns else df.columns.tolist()
            for col in target_columns:
                if strategy == "mean":
                    numeric_series = pd.to_numeric(df[col], errors="coerce")
                    value = numeric_series.mean()
                    df[col] = df[col].fillna(value)
                elif strategy == "median":
                    numeric_series = pd.to_numeric(df[col], errors="coerce")
                    value = numeric_series.median()
                    df[col] = df[col].fillna(value)
                elif strategy == "mode":
                    mode_series = df[col].mode(dropna=True)
                    if not mode_series.empty:
                        df[col] = df[col].fillna(mode_series.iloc[0])
                elif strategy == "ffill":
                    df[col] = df[col].ffill()
                elif strategy == "bfill":
                    df[col] = df[col].bfill()
                else:
                    df[col] = df[col].fillna(fill_value)
        elif op == "replace_values":
            column = params.get("column")
            find_value = params.get("find")
            replace_value = params.get("replace")
            regex = bool(params.get("regex", False))
            case_sensitive = bool(params.get("case_sensitive", True))
            if find_value is None or str(find_value) == "":
                raise ValueError("find is required for replace_values.")
            target_columns = [column] if column and column in df.columns else df.columns.tolist()
            for col in target_columns:
                if regex:
                    flags = 0 if case_sensitive else re.IGNORECASE
                    df[col] = df[col].map(
                        lambda v: re.sub(str(find_value), str(replace_value), v, flags=flags) if isinstance(v, str) else v
                    )
                else:
                    if case_sensitive:
                        df[col] = df[col].replace(find_value, replace_value)
                    else:
                        find_token = str(find_value).lower()
                        df[col] = df[col].map(
                            lambda v: replace_value
                            if isinstance(v, str) and v.lower() == find_token
                            else (replace_value if v == find_value else v)
                        )
        elif op == "split_column":
            column = params.get("column")
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for split_column.")
            delimiter = str(params.get("delimiter", ","))
            maxsplit_raw = params.get("maxsplit")
            maxsplit = -1 if maxsplit_raw in (None, "", "none") else int(maxsplit_raw)
            drop_original = bool(params.get("drop_original", False))
            provided_columns = params.get("new_columns", [])
            new_columns = [str(c).strip() for c in provided_columns if str(c).strip()] if isinstance(provided_columns, list) else []

            split_df = df[column].astype("string").fillna("").str.split(delimiter, n=maxsplit, expand=True)
            parts = int(split_df.shape[1])
            if parts <= 1:
                raise ValueError("No split parts generated. Check delimiter.")
            if new_columns:
                if len(new_columns) != parts:
                    raise ValueError(f"new_columns count must match split parts ({parts}).")
                target_cols = new_columns
            else:
                target_cols = [f"{column}_part_{i + 1}" for i in range(parts)]
            source_index = df.columns.get_loc(column)
            inserted = 0
            for idx, name in enumerate(target_cols):
                final_name = name
                if final_name in df.columns and final_name != column:
                    suffix = 1
                    while f"{final_name}_{suffix}" in df.columns:
                        suffix += 1
                    final_name = f"{final_name}_{suffix}"
                insert_at = source_index + 1 + inserted
                df.insert(insert_at, final_name, split_df.iloc[:, idx])
                inserted += 1
            if drop_original:
                df = df.drop(columns=[column])
        elif op == "merge_columns":
            raw_columns = params.get("columns", [])
            target_columns = [str(c).strip() for c in raw_columns if str(c).strip()] if isinstance(raw_columns, list) else []
            if len(target_columns) < 2:
                raise ValueError("At least two valid columns are required for merge_columns.")
            for col in target_columns:
                if col not in df.columns:
                    raise ValueError(f"Column '{col}' not found.")
            new_name = str(params.get("new_name", "")).strip()
            if not new_name:
                raise ValueError("new_name is required for merge_columns.")
            separator = str(params.get("separator", " "))
            drop_source = bool(params.get("drop_source", False))
            skip_null = bool(params.get("skip_null", True))
            if new_name in df.columns and new_name not in target_columns:
                raise ValueError("Target merged column already exists.")

            def _merge_row(row: pd.Series) -> str:
                values: List[str] = []
                for col in target_columns:
                    value = row[col]
                    if pd.isna(value) or value is None:
                        if skip_null:
                            continue
                        values.append("")
                    else:
                        text = str(value).strip()
                        if skip_null and text == "":
                            continue
                        values.append(text)
                return separator.join(values)

            df[new_name] = df.apply(_merge_row, axis=1)
            if drop_source:
                drop_cols = [c for c in target_columns if c != new_name]
                if drop_cols:
                    df = df.drop(columns=drop_cols)
        elif op == "group_aggregate":
            group_by = params.get("group_by", [])
            if isinstance(group_by, str):
                group_cols = [c.strip() for c in group_by.split(",") if c.strip()]
            elif isinstance(group_by, list):
                group_cols = [str(c).strip() for c in group_by if str(c).strip()]
            else:
                group_cols = []
            if not group_cols:
                raise ValueError("group_by is required for group_aggregate.")
            for col in group_cols:
                if col not in df.columns:
                    raise ValueError(f"Group column '{col}' not found.")

            aggregations = params.get("aggregations", [])
            if not isinstance(aggregations, list) or not aggregations:
                raise ValueError("aggregations list is required for group_aggregate.")

            named_agg: Dict[str, Any] = {}
            valid_funcs = {"count", "nunique", "sum", "mean", "median", "min", "max", "std"}
            for item in aggregations:
                if not isinstance(item, dict):
                    continue
                src_col = str(item.get("column", "")).strip()
                func = str(item.get("func", "")).strip().lower()
                alias = str(item.get("alias", "")).strip()
                if not src_col or src_col not in df.columns:
                    continue
                if func not in valid_funcs:
                    continue
                if not alias:
                    alias = f"{src_col}_{func}"
                named_agg[alias] = (src_col, func)

            if not named_agg:
                raise ValueError("No valid aggregations provided.")

            grouped = (
                df.groupby(group_cols, dropna=False)
                .agg(**named_agg)
                .reset_index()
            )
            df = grouped
        elif op == "add_row":
            row_data = params.get("row_data")
            if not isinstance(row_data, dict):
                raise ValueError("row_data object is required for add_row.")
            insert_index_raw = params.get("insert_index")
            insert_index = None
            if insert_index_raw not in (None, ""):
                if isinstance(insert_index_raw, (int, float, str)) and str(insert_index_raw).strip().lstrip("-").isdigit():
                    insert_index = int(insert_index_raw)
                else:
                    raise ValueError("insert_index must be an integer when provided.")
            unknown_columns = [k for k in row_data.keys() if str(k) not in df.columns]
            if unknown_columns:
                raise ValueError(f"Unknown columns in row_data: {', '.join(map(str, unknown_columns))}")

            parsed_row: Dict[str, Any] = {}
            for col in df.columns:
                raw_value = row_data.get(col, None)
                if raw_value == "":
                    raw_value = None
                if raw_value is None:
                    parsed_row[col] = None
                    continue
                col_dtype = str(df[col].dtype).lower()
                if any(tok in col_dtype for tok in ["int", "float", "double"]):
                    numeric = pd.to_numeric(pd.Series([raw_value]), errors="coerce").iloc[0]
                    if pd.isna(numeric):
                        raise ValueError(f"Column '{col}' expects a numeric value.")
                    parsed_row[col] = numeric.item() if hasattr(numeric, "item") else numeric
                    continue
                if "datetime" in col_dtype:
                    dt_value = pd.to_datetime(pd.Series([raw_value]), errors="coerce").iloc[0]
                    if pd.isna(dt_value):
                        raise ValueError(f"Column '{col}' expects a datetime value.")
                    parsed_row[col] = dt_value
                    continue
                if "bool" in col_dtype:
                    b = self._parse_bool(raw_value)
                    if b is None:
                        raise ValueError(f"Column '{col}' expects a boolean value.")
                    parsed_row[col] = b
                    continue
                parsed_row[col] = raw_value

            new_row_df = pd.DataFrame([parsed_row], columns=df.columns)
            if insert_index is None:
                df = pd.concat([df, new_row_df], ignore_index=True)
            else:
                insert_at = max(0, min(int(insert_index), len(df)))
                top = df.iloc[:insert_at]
                bottom = df.iloc[insert_at:]
                df = pd.concat([top, new_row_df, bottom], ignore_index=True)
        elif op == "derive_column":
            new_name = str(params.get("new_name", "")).strip()
            expression = str(params.get("expression", "")).strip()
            if not new_name:
                raise ValueError("new_name is required for derive_column.")
            if not expression:
                raise ValueError("expression is required for derive_column.")
            try:
                df[new_name] = df.eval(expression, engine="python")
            except Exception as e:
                raise ValueError(f"Invalid formula expression: {e}")
        elif op == "trim_whitespace":
            column = params.get("column")
            target_columns = [column] if column and column in df.columns else df.columns.tolist()
            for col in target_columns:
                if df[col].dtype == "object":
                    df[col] = df[col].map(lambda v: v.strip() if isinstance(v, str) else v)
        elif op == "cast_column":
            column = params.get("column")
            dtype = str(params.get("dtype", "")).lower()
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for cast_column.")
            if dtype == "numeric":
                df[column] = pd.to_numeric(df[column], errors="coerce")
            elif dtype == "string":
                df[column] = df[column].astype("string")
            elif dtype == "datetime":
                df[column] = pd.to_datetime(df[column], errors="coerce")
            elif dtype == "boolean":
                df[column] = df[column].map(lambda v: self._parse_bool(v))
            else:
                raise ValueError("Unsupported dtype. Use numeric, string, datetime, or boolean.")
        elif op in {"unit_convert", "convert_units", "unit_conversion"}:
            column = params.get("column")
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for unit_convert.")
            from_unit_raw = params.get("from_unit")
            to_unit_raw = params.get("to_unit")
            if from_unit_raw in (None, "") or to_unit_raw in (None, ""):
                raise ValueError("from_unit and to_unit are required for unit_convert.")
            category_raw = str(params.get("category", "auto")).strip().lower()
            overwrite_raw = params.get("overwrite", False)
            overwrite = self._parse_bool(overwrite_raw)
            overwrite = bool(overwrite) if overwrite is not None else False
            requested_new_name = str(params.get("new_name", "")).strip()

            numeric_series = pd.to_numeric(df[column], errors="coerce")
            converted, resolved_category, canonical_from, canonical_to = self._convert_units_series(
                series=numeric_series,
                from_unit=from_unit_raw,
                to_unit=to_unit_raw,
                category=category_raw,
            )

            if requested_new_name:
                target_name = requested_new_name
            elif overwrite:
                target_name = str(column)
            else:
                target_name = f"{column}_{canonical_to}"

            if target_name in df.columns and target_name != column:
                raise ValueError("Target column name already exists.")
            if target_name == column:
                df[target_name] = converted
            else:
                _insert_column_after(str(column), target_name, converted)
            params = {
                **params,
                "category": resolved_category,
                "from_unit": canonical_from,
                "to_unit": canonical_to,
                "target_column": target_name,
            }
        elif op in {"bin_numeric_categories", "numeric_to_categories"}:
            column = params.get("column")
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for bin_numeric_categories.")
            numeric = pd.to_numeric(df[column], errors="coerce")
            rules = self._parse_numeric_category_rules(
                rules=params.get("rules"),
                rules_text=params.get("rules_text"),
            )
            if not rules:
                raise ValueError("At least one valid rule is required for bin_numeric_categories.")

            default_label_raw = params.get("default_label")
            default_label = None
            if default_label_raw not in (None, ""):
                default_label = str(default_label_raw)
            target_name = str(params.get("new_name", "")).strip() or f"{column}_category"
            if target_name in df.columns and target_name != column:
                raise ValueError("Target column name already exists.")

            result = pd.Series(pd.NA, index=df.index, dtype="object")
            assigned = pd.Series(False, index=df.index, dtype="bool")
            for rule in rules:
                mask = numeric.notna() & (~assigned)
                min_value = rule.get("min")
                max_value = rule.get("max")
                include_min = bool(rule.get("include_min", True))
                include_max = bool(rule.get("include_max", True))
                if min_value is not None:
                    mask &= (numeric >= min_value) if include_min else (numeric > min_value)
                if max_value is not None:
                    mask &= (numeric <= max_value) if include_max else (numeric < max_value)
                if mask.any():
                    result.loc[mask] = rule["label"]
                    assigned.loc[mask] = True

            if default_label is not None:
                result.loc[numeric.notna() & (~assigned)] = default_label

            if target_name == column:
                df[target_name] = result
            else:
                _insert_column_after(str(column), target_name, result)
            params = {
                **params,
                "rules_applied": len(rules),
                "default_label": default_label,
                "target_column": target_name,
            }
        elif op in {"auto_binning", "automatic_binning", "auto_bin"}:
            column = params.get("column")
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for auto_binning.")
            method = str(params.get("method", "equal_width")).strip().lower()
            bins_raw = params.get("bins", 5)
            bins = int(bins_raw) if bins_raw not in (None, "") else 5
            bins = max(2, bins)
            new_name = str(params.get("new_name", "")).strip() or f"{column}_binned"

            numeric = pd.to_numeric(df[column], errors="coerce")
            target_col = str(params.get("target_column", "")).strip()
            target_series = df[target_col] if target_col and target_col in df.columns else None

            result, method_meta = self._auto_bin_series(
                series=numeric,
                method=method,
                bins=bins,
                params=params,
                target_series=target_series,
            )

            if new_name in df.columns and new_name != column:
                raise ValueError("Target column name already exists.")
            if new_name == column:
                df[new_name] = result
            else:
                _insert_column_after(str(column), new_name, result)
            params = {
                **params,
                **method_meta,
                "method": method,
                "target_column_used": target_col or None,
            }
        elif op in {
            "min_max_scaling",
            "max_absolute_scaling",
            "mean_normalization",
            "unit_vector_scaling",
            "decimal_scaling",
            "z_score_scaling",
            "robust_scaling",
            "log_scaling",
            "quantile_transform",
        }:
            column = params.get("column")
            if not column or column not in df.columns:
                raise ValueError(f"Valid column is required for {op}.")
            numeric = pd.to_numeric(df[column], errors="coerce")
            new_name = str(params.get("new_name", "")).strip()

            if op == "min_max_scaling":
                min_v = numeric.min()
                max_v = numeric.max()
                if pd.isna(min_v) or pd.isna(max_v) or max_v == min_v:
                    result = numeric.map(lambda v: 0.0 if pd.notna(v) else pd.NA)
                else:
                    result = (numeric - min_v) / (max_v - min_v)
                target_name = new_name or f"{column}_minmax"
            elif op == "max_absolute_scaling":
                max_abs = numeric.abs().max()
                if pd.isna(max_abs) or max_abs == 0:
                    result = numeric.map(lambda v: 0.0 if pd.notna(v) else pd.NA)
                else:
                    result = numeric / max_abs
                target_name = new_name or f"{column}_maxabs"
            elif op == "mean_normalization":
                mean_v = numeric.mean()
                min_v = numeric.min()
                max_v = numeric.max()
                denom = max_v - min_v
                if pd.isna(mean_v) or pd.isna(denom) or denom == 0:
                    result = numeric.map(lambda v: 0.0 if pd.notna(v) else pd.NA)
                else:
                    result = (numeric - mean_v) / denom
                target_name = new_name or f"{column}_mean_norm"
            elif op == "unit_vector_scaling":
                norm = float(np.sqrt(np.nansum(np.square(numeric.to_numpy(dtype=float)))))
                if pd.isna(norm) or norm == 0:
                    result = numeric.map(lambda v: 0.0 if pd.notna(v) else pd.NA)
                else:
                    result = numeric / norm
                target_name = new_name or f"{column}_unit_vector"
            elif op == "decimal_scaling":
                max_abs = numeric.abs().max()
                if pd.isna(max_abs) or max_abs == 0:
                    result = numeric.map(lambda v: 0.0 if pd.notna(v) else pd.NA)
                    scale_power = 1
                else:
                    scale_power = int(math.ceil(math.log10(max_abs)))
                    scale_power = max(1, scale_power)
                    result = numeric / (10 ** scale_power)
                target_name = new_name or f"{column}_decimal_scaled"
                params = {**params, "decimal_power": scale_power}
            elif op == "z_score_scaling":
                mean_v = numeric.mean()
                std_v = numeric.std()
                if pd.isna(std_v) or std_v == 0:
                    result = numeric.map(lambda v: 0.0 if pd.notna(v) else pd.NA)
                else:
                    result = (numeric - mean_v) / std_v
                target_name = new_name or f"{column}_zscaled"
            elif op == "robust_scaling":
                median_v = numeric.median()
                q1 = numeric.quantile(0.25)
                q3 = numeric.quantile(0.75)
                iqr = q3 - q1
                if pd.isna(iqr) or iqr == 0:
                    result = numeric.map(lambda v: 0.0 if pd.notna(v) else pd.NA)
                else:
                    result = (numeric - median_v) / iqr
                target_name = new_name or f"{column}_robust"
            elif op == "log_scaling":
                base_raw = str(params.get("base", "e")).strip().lower()
                shift_mode = str(params.get("shift_mode", "auto")).strip().lower()
                custom_shift_raw = params.get("shift")
                min_v = numeric.min()
                if shift_mode == "custom":
                    shift = float(custom_shift_raw) if custom_shift_raw not in (None, "") else 0.0
                else:
                    shift = float(abs(min_v) + 1.0) if pd.notna(min_v) and min_v <= 0 else 0.0
                shifted = numeric + shift
                if base_raw in {"e", "ln", "natural"}:
                    result = shifted.map(lambda v: math.log(v) if pd.notna(v) and v > 0 else pd.NA)
                    base_token = "e"
                elif base_raw in {"10", "log10"}:
                    result = shifted.map(lambda v: math.log10(v) if pd.notna(v) and v > 0 else pd.NA)
                    base_token = "10"
                elif base_raw in {"2", "log2"}:
                    result = shifted.map(lambda v: math.log2(v) if pd.notna(v) and v > 0 else pd.NA)
                    base_token = "2"
                else:
                    raise ValueError("base must be one of: e, 10, 2.")
                target_name = new_name or f"{column}_log"
                params = {**params, "base": base_token, "applied_shift": shift}
            else:  # quantile_transform
                output_distribution = str(params.get("output_distribution", "uniform")).strip().lower()
                if output_distribution not in {"uniform", "normal"}:
                    raise ValueError("output_distribution must be either 'uniform' or 'normal'.")
                n_quantiles_raw = params.get("n_quantiles")
                non_null = numeric.dropna()
                if non_null.empty:
                    result = numeric.map(lambda _: pd.NA)
                else:
                    if n_quantiles_raw in (None, ""):
                        n_quantiles = min(1000, len(non_null))
                    else:
                        n_quantiles = int(n_quantiles_raw)
                    n_quantiles = max(2, min(n_quantiles, len(non_null)))
                    transformer = QuantileTransformer(
                        n_quantiles=n_quantiles,
                        output_distribution=output_distribution,
                        random_state=42,
                    )
                    transformed = transformer.fit_transform(non_null.to_frame()).reshape(-1)
                    result = pd.Series(np.nan, index=numeric.index, dtype="float64")
                    result.loc[non_null.index] = transformed
                    params = {**params, "n_quantiles": n_quantiles, "output_distribution": output_distribution}
                target_name = new_name or f"{column}_quantile"

            if target_name in df.columns and target_name != column:
                raise ValueError("Target column name already exists.")
            if target_name == column:
                df[target_name] = result
            else:
                _insert_column_after(str(column), target_name, result)
        elif op == "rename_column":
            old_name = params.get("column") or params.get("old_name")
            new_name = str(params.get("new_name", "")).strip()
            if not old_name or old_name not in df.columns:
                raise ValueError("Valid source column is required for rename_column.")
            if not new_name:
                raise ValueError("new_name is required for rename_column.")
            if new_name in df.columns and new_name != old_name:
                raise ValueError("Target column name already exists.")
            df = df.rename(columns={old_name: new_name})
        elif op == "clip_values":
            column = params.get("column")
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for clip_values.")
            min_value = params.get("min")
            max_value = params.get("max")
            if min_value in (None, "") and max_value in (None, ""):
                raise ValueError("At least one of min or max must be provided.")
            numeric_series = pd.to_numeric(df[column], errors="coerce")
            lower = float(min_value) if min_value not in (None, "") else None
            upper = float(max_value) if max_value not in (None, "") else None
            df[column] = numeric_series.clip(lower=lower, upper=upper)
        elif op == "remove_outliers_iqr":
            column = params.get("column")
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for remove_outliers_iqr.")
            numeric_series = pd.to_numeric(df[column], errors="coerce")
            mode = str(params.get("mode", "drop")).strip().lower()
            method_raw = str(params.get("method", "iqr")).strip().lower()
            method_aliases = {
                "iqr": "iqr",
                "box_plot": "iqr",
                "boxplot": "iqr",
                "box-plot": "iqr",
                "zscore": "zscore",
                "z_score": "zscore",
                "z-score": "zscore",
            }
            method = method_aliases.get(method_raw)
            if method is None:
                raise ValueError("Unsupported outlier method. Use iqr/box_plot or zscore.")

            lower, upper = self._compute_outlier_bounds(
                series=numeric_series,
                method=method,
                factor=params.get("factor", 1.5),
                z_threshold=params.get("z_threshold", 3.0),
            )
            if mode == "clip":
                df[column] = numeric_series.clip(lower=lower, upper=upper)
            else:
                keep_mask = numeric_series.isna() | ((numeric_series >= lower) & (numeric_series <= upper))
                df = df[keep_mask]
            params = {
                **params,
                "method": method,
                "mode": mode,
                "outlier_lower_bound": self._safe_float(lower),
                "outlier_upper_bound": self._safe_float(upper),
            }
        elif op == "encode_categorical":
            column = params.get("column")
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for encode_categorical.")
            method = str(params.get("method", "label")).lower()
            if method == "one_hot":
                dummies = pd.get_dummies(df[column], prefix=column, dummy_na=True)
                df = df.drop(columns=[column]).join(dummies)
            else:
                values = df[column].astype("string").fillna("__MISSING__")
                codes, _ = pd.factorize(values, sort=True)
                df[column] = codes
        elif op == "normalize_text_case":
            column = params.get("column")
            case_type = str(params.get("case", "lower")).lower()
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for normalize_text_case.")
            if case_type not in {"lower", "upper", "title"}:
                raise ValueError("Case must be one of: lower, upper, title.")

            def _normalize_case(v: Any):
                if not isinstance(v, str):
                    return v
                if case_type == "upper":
                    return v.upper()
                if case_type == "title":
                    return v.title()
                return v.lower()

            df[column] = df[column].map(_normalize_case)
        elif op == "extract_date_part":
            column = params.get("column")
            part = str(params.get("part", "year")).lower()
            new_name = str(params.get("new_name", "")).strip()
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for extract_date_part.")
            valid_parts = {"year", "quarter", "month", "week", "day", "dayofweek", "hour", "minute"}
            if part not in valid_parts:
                raise ValueError("Unsupported date part.")
            dt_series = pd.to_datetime(df[column], errors="coerce")
            if part == "year":
                values = dt_series.dt.year
            elif part == "quarter":
                values = dt_series.dt.quarter
            elif part == "month":
                values = dt_series.dt.month
            elif part == "week":
                values = dt_series.dt.isocalendar().week.astype("Int64")
            elif part == "day":
                values = dt_series.dt.day
            elif part == "dayofweek":
                values = dt_series.dt.dayofweek
            elif part == "hour":
                values = dt_series.dt.hour
            else:
                values = dt_series.dt.minute
            target_name = new_name or f"{column}_{part}"
            if target_name in df.columns and target_name != column:
                raise ValueError("Target column name already exists.")
            if target_name == column:
                df[column] = values
            else:
                _insert_column_after(column, target_name, values)
        elif op == "date_diff_days":
            column = params.get("column")
            new_name = str(params.get("new_name", "")).strip()
            reference_column = params.get("reference_column")
            reference_date = params.get("reference_date")
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for date_diff_days.")
            if not new_name:
                new_name = f"{column}_diff_days"
            if new_name in df.columns and new_name != column:
                raise ValueError("Target column name already exists.")
            left = pd.to_datetime(df[column], errors="coerce")
            if reference_column and reference_column in df.columns:
                right = pd.to_datetime(df[reference_column], errors="coerce")
            else:
                if reference_date in (None, ""):
                    raise ValueError("reference_column or reference_date is required for date_diff_days.")
                parsed_ref = pd.to_datetime(pd.Series([reference_date]), errors="coerce").iloc[0]
                if pd.isna(parsed_ref):
                    raise ValueError("Invalid reference_date.")
                right = parsed_ref
            diff_days = (left - right).dt.days
            if new_name == column:
                df[column] = diff_days
            else:
                _insert_column_after(column, new_name, diff_days)
        elif op == "datetime_floor":
            column = params.get("column")
            granularity = str(params.get("granularity", "day")).lower()
            new_name = str(params.get("new_name", "")).strip()
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for datetime_floor.")
            freq_map = {"day": "D", "week": "W", "month": "MS", "hour": "H", "minute": "min"}
            if granularity not in freq_map:
                raise ValueError("Unsupported granularity.")
            dt_series = pd.to_datetime(df[column], errors="coerce")
            floored = dt_series.dt.floor(freq_map[granularity])
            if granularity == "month":
                floored = dt_series.dt.to_period("M").dt.to_timestamp()
            target_name = new_name or column
            if target_name in df.columns and target_name != column:
                raise ValueError("Target column name already exists.")
            if target_name == column:
                df[target_name] = floored
            else:
                _insert_column_after(column, target_name, floored)
        elif op in {"shift_column", "column_shift"}:
            column = params.get("column")
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for shift_column.")
            direction_raw = str(params.get("direction", "down")).strip().lower()
            direction_aliases = {
                "down": "down",
                "d": "down",
                "lag": "down",
                "up": "up",
                "u": "up",
                "lead": "up",
            }
            direction = direction_aliases.get(direction_raw)
            if direction is None:
                raise ValueError("direction must be one of: up, down.")

            shifts_raw = params.get("shifts", params.get("periods", 1))
            shifts = abs(int(shifts_raw)) if shifts_raw not in (None, "") else 1
            signed_shifts = -shifts if direction == "up" else shifts
            shifted = df[column].shift(periods=signed_shifts)

            fill_value = params.get("fill_value", params.get("fill"))
            fill_provided = fill_value is not None and not (isinstance(fill_value, str) and fill_value == "")
            if fill_provided:
                shifted = shifted.fillna(fill_value)

            new_name = str(params.get("new_name", "")).strip()
            target_name = new_name or f"{column}_shift_{direction}_{shifts}"
            if target_name in df.columns and target_name != column:
                raise ValueError("Target column name already exists.")
            if target_name == column:
                df[target_name] = shifted
            else:
                _insert_column_after(column, target_name, shifted)

            params = {
                **params,
                "direction": direction,
                "shifts": shifts,
                "signed_shifts": signed_shifts,
                "target_column": target_name,
                "filled_missing": bool(fill_provided),
            }
        elif op in {"cyclical_encoding", "cyclical_encode"}:
            column = params.get("column")
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for cyclical_encoding.")
            value_source = str(params.get("value_source", "auto")).strip().lower()
            period_raw = params.get("period")
            offset_raw = params.get("offset", 0)
            prefix_raw = str(params.get("prefix", "")).strip()

            values = self._extract_cyclical_base_values(df=df, column=str(column), value_source=value_source)
            if period_raw in (None, ""):
                default_periods = {
                    "hour_of_day": 24.0,
                    "day_of_week": 7.0,
                    "day_of_month": 31.0,
                    "month_of_year": 12.0,
                    "week_of_year": 53.0,
                }
                period = default_periods.get(value_source)
                if period is None:
                    raise ValueError("period is required for cyclical_encoding when value_source is raw or auto-numeric.")
            else:
                period = float(period_raw)
            if period <= 0:
                raise ValueError("period must be greater than 0.")
            offset = float(offset_raw) if offset_raw not in (None, "") else 0.0

            angle = (2.0 * math.pi * (values - offset)) / period
            sin_values = np.sin(angle)
            cos_values = np.cos(angle)

            prefix = prefix_raw or f"{column}_{value_source if value_source != 'auto' else 'cyclical'}"
            sin_col = f"{prefix}_sin"
            cos_col = f"{prefix}_cos"
            for col_name in [sin_col, cos_col]:
                if col_name in df.columns and col_name != column:
                    raise ValueError(f"Target column name already exists: {col_name}")

            _insert_column_after(str(column), sin_col, sin_values)
            _insert_column_after(sin_col, cos_col, cos_values)
            params = {
                **params,
                "resolved_value_source": value_source,
                "resolved_period": period,
                "resolved_offset": offset,
                "output_columns": [sin_col, cos_col],
            }
        elif op in {"significant_lags_kendall", "kendall_lags"}:
            column = params.get("column")
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for significant_lags_kendall.")
            series = pd.to_numeric(df[column], errors="coerce")
            min_lag = int(params.get("min_lag", 1))
            max_lag = int(params.get("max_lag", 24))
            alpha = float(params.get("alpha", 0.05))
            top_k_raw = params.get("top_k")
            top_k = int(top_k_raw) if top_k_raw not in (None, "") else None
            include_negative = self._parse_bool(params.get("include_negative_tau"))
            include_negative = bool(include_negative) if include_negative is not None else True
            if min_lag < 1:
                min_lag = 1
            if max_lag < min_lag:
                raise ValueError("max_lag must be greater than or equal to min_lag.")
            if alpha <= 0 or alpha > 1:
                raise ValueError("alpha must be between 0 and 1.")

            lag_results: List[Dict[str, Any]] = []
            for lag in range(min_lag, max_lag + 1):
                lagged = series.shift(lag)
                valid = pd.DataFrame({"x": series, "y": lagged}).dropna()
                if len(valid) < 3:
                    continue
                tau, pvalue = kendalltau(valid["x"], valid["y"])
                if tau is None or pvalue is None or pd.isna(tau) or pd.isna(pvalue):
                    continue
                tau_f = float(tau)
                p_f = float(pvalue)
                if p_f <= alpha and (include_negative or tau_f >= 0):
                    lag_results.append({"lag": lag, "tau": tau_f, "pvalue": p_f})

            lag_results.sort(key=lambda item: abs(item["tau"]), reverse=True)
            if top_k is not None and top_k > 0:
                lag_results = lag_results[:top_k]
            if not lag_results:
                raise ValueError("No statistically significant lags found with current configuration.")

            created_cols: List[str] = []
            anchor_col = str(column)
            for item in sorted(lag_results, key=lambda x: x["lag"]):
                lag = int(item["lag"])
                lag_col = f"{column}_lag_{lag}"
                if lag_col in df.columns and lag_col != column:
                    raise ValueError(f"Target column name already exists: {lag_col}")
                _insert_column_after(anchor_col, lag_col, series.shift(lag))
                anchor_col = lag_col
                created_cols.append(lag_col)

            params = {
                **params,
                "selected_lags": [int(x["lag"]) for x in lag_results],
                "lag_stats": lag_results,
                "output_columns": created_cols,
            }
        elif op in {"rolling_window_stats_nested", "nested_rolling_stats"}:
            column = params.get("column")
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for rolling_window_stats_nested.")
            series = pd.to_numeric(df[column], errors="coerce")
            windows = self._parse_int_list_param(params.get("windows"), default=[3, 5, 10, 20])
            stats_list = self._parse_str_list_param(
                params.get("stats"),
                default=["mean", "std", "kurt"],
            )
            valid_stats = {"mean", "std", "kurt", "min", "max", "median", "var", "skew", "slope"}
            stats_clean = [s for s in stats_list if s in valid_stats]
            if not stats_clean:
                raise ValueError("At least one valid statistic is required.")
            min_periods_raw = params.get("min_periods")
            min_periods = int(min_periods_raw) if min_periods_raw not in (None, "") else 1
            min_periods = max(1, min_periods)
            prefix = str(params.get("prefix", "")).strip() or str(column)

            created_cols: List[str] = []
            anchor_col = str(column)
            for window in windows:
                if window <= 0:
                    continue
                roll = series.rolling(window=window, min_periods=min(min_periods, window))
                for stat_name in stats_clean:
                    if stat_name == "mean":
                        values = roll.mean()
                    elif stat_name == "std":
                        values = roll.std()
                    elif stat_name == "kurt":
                        values = roll.kurt()
                    elif stat_name == "min":
                        values = roll.min()
                    elif stat_name == "max":
                        values = roll.max()
                    elif stat_name == "median":
                        values = roll.median()
                    elif stat_name == "var":
                        values = roll.var()
                    elif stat_name == "slope":
                        def _window_slope(arr: np.ndarray) -> float:
                            vals = np.asarray(arr, dtype=float)
                            mask = np.isfinite(vals)
                            if int(mask.sum()) < 2:
                                return float("nan")
                            y = vals[mask]
                            x_full = np.arange(len(vals), dtype=float)
                            x = x_full[mask]
                            x_mean = float(x.mean())
                            y_mean = float(y.mean())
                            denom = float(np.sum((x - x_mean) ** 2))
                            if denom == 0:
                                return 0.0
                            numer = float(np.sum((x - x_mean) * (y - y_mean)))
                            return numer / denom
                        values = roll.apply(_window_slope, raw=True)
                    else:
                        values = roll.skew()
                    col_name = f"{prefix}_roll_{stat_name}_{window}"
                    if col_name in df.columns and col_name != column:
                        raise ValueError(f"Target column name already exists: {col_name}")
                    _insert_column_after(anchor_col, col_name, values)
                    anchor_col = col_name
                    created_cols.append(col_name)
            if not created_cols:
                raise ValueError("No rolling window features were created.")
            params = {
                **params,
                "windows": windows,
                "stats": stats_clean,
                "output_columns": created_cols,
            }
        elif op == "math_scalar":
            column = params.get("column")
            operator = str(params.get("operator", "add")).lower()
            value_raw = params.get("value")
            new_name = str(params.get("new_name", "")).strip()
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for math_scalar.")
            if value_raw in (None, ""):
                raise ValueError("value is required for math_scalar.")
            value = float(value_raw)
            numeric = pd.to_numeric(df[column], errors="coerce")
            if operator == "add":
                result = numeric + value
            elif operator == "subtract":
                result = numeric - value
            elif operator == "multiply":
                result = numeric * value
            elif operator == "divide":
                if value == 0:
                    raise ValueError("Cannot divide by zero.")
                result = numeric / value
            elif operator == "power":
                result = numeric.pow(value)
            else:
                raise ValueError("Unsupported math_scalar operator.")
            if new_name:
                if new_name in df.columns and new_name != column:
                    raise ValueError("Target column name already exists.")
                if new_name == column:
                    df[column] = result
                else:
                    _insert_column_after(column, new_name, result)
            else:
                df[column] = result
        elif op == "math_unary":
            column = params.get("column")
            func = str(params.get("func", "abs")).lower()
            decimals_raw = params.get("decimals")
            new_name = str(params.get("new_name", "")).strip()
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for math_unary.")
            numeric = pd.to_numeric(df[column], errors="coerce")
            if func == "abs":
                result = numeric.abs()
            elif func == "sqrt":
                result = numeric.map(lambda v: math.sqrt(v) if pd.notna(v) and v >= 0 else pd.NA)
            elif func == "log":
                result = numeric.map(lambda v: math.log(v) if pd.notna(v) and v > 0 else pd.NA)
            elif func == "log10":
                result = numeric.map(lambda v: math.log10(v) if pd.notna(v) and v > 0 else pd.NA)
            elif func == "exp":
                result = numeric.map(lambda v: math.exp(v) if pd.notna(v) else pd.NA)
            elif func == "round":
                decimals = int(decimals_raw) if decimals_raw not in (None, "") else 0
                result = numeric.round(decimals)
            elif func == "floor":
                result = numeric.map(lambda v: math.floor(v) if pd.notna(v) else pd.NA)
            elif func == "ceil":
                result = numeric.map(lambda v: math.ceil(v) if pd.notna(v) else pd.NA)
            elif func == "negate":
                result = -numeric
            else:
                raise ValueError("Unsupported math_unary func.")
            if new_name:
                if new_name in df.columns and new_name != column:
                    raise ValueError("Target column name already exists.")
                if new_name == column:
                    df[column] = result
                else:
                    _insert_column_after(column, new_name, result)
            else:
                df[column] = result
        elif op == "math_between_columns":
            left_column = params.get("left_column")
            right_column = params.get("right_column")
            operator = str(params.get("operator", "add")).lower()
            new_name = str(params.get("new_name", "")).strip()
            if not left_column or left_column not in df.columns:
                raise ValueError("Valid left_column is required for math_between_columns.")
            if not right_column or right_column not in df.columns:
                raise ValueError("Valid right_column is required for math_between_columns.")
            if not new_name:
                raise ValueError("new_name is required for math_between_columns.")
            if new_name in df.columns and new_name not in {left_column, right_column}:
                raise ValueError("Target column name already exists.")
            left = pd.to_numeric(df[left_column], errors="coerce")
            right = pd.to_numeric(df[right_column], errors="coerce")
            if operator == "add":
                result = left + right
            elif operator == "subtract":
                result = left - right
            elif operator == "multiply":
                result = left * right
            elif operator == "divide":
                result = left / right.replace({0: pd.NA})
            else:
                raise ValueError("Unsupported math_between_columns operator.")
            if new_name == left_column or new_name == right_column:
                df[new_name] = result
            else:
                _insert_column_after(left_column, new_name, result)
        elif op == "merge_datasets":
            mode = str(params.get("mode", "append")).strip().lower()

            if mode == "append":
                raw_source_ids = params.get("source_dataset_ids", [])
                source_dataset_ids: List[str] = []
                if isinstance(raw_source_ids, list):
                    source_dataset_ids.extend(str(item).strip() for item in raw_source_ids if str(item).strip())
                fallback_source_id = str(params.get("source_dataset_id", "")).strip()
                if fallback_source_id:
                    source_dataset_ids.append(fallback_source_id)

                deduped_source_ids: List[str] = []
                seen_source_ids = set()
                for source_id in source_dataset_ids:
                    if source_id in seen_source_ids:
                        continue
                    seen_source_ids.add(source_id)
                    deduped_source_ids.append(source_id)
                if not deduped_source_ids:
                    raise ValueError("source_dataset_ids is required for merge_datasets append mode.")

                # Union-by-name append; missing columns are filled with nulls.
                append_frames = [df]
                for source_dataset_id in deduped_source_ids:
                    source_meta = self.get_dataset_by_id(source_dataset_id)
                    if not source_meta:
                        raise ValueError(f"Source dataset '{source_dataset_id}' not found for merge_datasets.")
                    source_df = self._load_dataset_dataframe(source_meta)
                    append_frames.append(source_df)
                df = pd.concat(append_frames, ignore_index=True, sort=False)
            elif mode == "join_on_keys":
                source_dataset_id = str(params.get("source_dataset_id", "")).strip()
                if not source_dataset_id:
                    raise ValueError("source_dataset_id is required for merge_datasets join_on_keys mode.")
                source_meta = self.get_dataset_by_id(source_dataset_id)
                if not source_meta:
                    raise ValueError("Source dataset not found for merge_datasets.")
                source_df = self._load_dataset_dataframe(source_meta)
                left_keys_raw = params.get("left_keys", [])
                right_keys_raw = params.get("right_keys", [])
                join_how = str(params.get("join_how", "inner")).strip().lower()
                if join_how not in {"inner", "left", "right", "outer"}:
                    raise ValueError("join_how must be one of: inner, left, right, outer.")

                left_keys = [str(k).strip() for k in left_keys_raw if str(k).strip()] if isinstance(left_keys_raw, list) else []
                right_keys = [str(k).strip() for k in right_keys_raw if str(k).strip()] if isinstance(right_keys_raw, list) else []
                if not left_keys:
                    raise ValueError("left_keys is required for join_on_keys.")
                if not right_keys:
                    # Default to same key names on source dataset.
                    right_keys = left_keys[:]
                if len(left_keys) != len(right_keys):
                    raise ValueError("left_keys and right_keys must have same length.")
                for key in left_keys:
                    if key not in df.columns:
                        raise ValueError(f"Left key '{key}' not found in active dataset.")
                for key in right_keys:
                    if key not in source_df.columns:
                        raise ValueError(f"Right key '{key}' not found in source dataset.")

                df = df.merge(
                    source_df,
                    how=join_how,
                    left_on=left_keys,
                    right_on=right_keys,
                    suffixes=("", "_src"),
                )
            else:
                raise ValueError("mode must be 'append' or 'join_on_keys' for merge_datasets.")
        elif op == "stats_zscore":
            column = params.get("column")
            new_name = str(params.get("new_name", "")).strip()
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for stats_zscore.")
            numeric = pd.to_numeric(df[column], errors="coerce")
            mean = numeric.mean()
            std = numeric.std()
            if pd.isna(std) or std == 0:
                result = pd.Series([pd.NA] * len(df), index=df.index)
            else:
                result = (numeric - mean) / std
            target_name = new_name or f"{column}_zscore"
            if target_name in df.columns and target_name != column:
                raise ValueError("Target column name already exists.")
            if target_name == column:
                df[column] = result
            else:
                _insert_column_after(column, target_name, result)
        elif op == "stats_percentile_rank":
            column = params.get("column")
            new_name = str(params.get("new_name", "")).strip()
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for stats_percentile_rank.")
            numeric = pd.to_numeric(df[column], errors="coerce")
            result = numeric.rank(pct=True)
            target_name = new_name or f"{column}_pct_rank"
            if target_name in df.columns and target_name != column:
                raise ValueError("Target column name already exists.")
            if target_name == column:
                df[column] = result
            else:
                _insert_column_after(column, target_name, result)
        elif op == "stats_rolling_mean":
            column = params.get("column")
            window_raw = params.get("window")
            min_periods_raw = params.get("min_periods")
            new_name = str(params.get("new_name", "")).strip()
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for stats_rolling_mean.")
            if window_raw in (None, ""):
                raise ValueError("window is required for stats_rolling_mean.")
            window = int(window_raw)
            if window <= 0:
                raise ValueError("window must be > 0.")
            min_periods = int(min_periods_raw) if min_periods_raw not in (None, "") else window
            min_periods = max(1, min(min_periods, window))
            numeric = pd.to_numeric(df[column], errors="coerce")
            result = numeric.rolling(window=window, min_periods=min_periods).mean()
            target_name = new_name or f"{column}_roll_mean_{window}"
            if target_name in df.columns and target_name != column:
                raise ValueError("Target column name already exists.")
            if target_name == column:
                df[column] = result
            else:
                _insert_column_after(column, target_name, result)
        elif op == "stats_variance":
            column = params.get("column")
            new_name = str(params.get("new_name", "")).strip()
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for stats_variance.")
            numeric = pd.to_numeric(df[column], errors="coerce")
            value = numeric.var()
            target_name = new_name or f"{column}_variance"
            if target_name in df.columns and target_name != column:
                raise ValueError("Target column name already exists.")
            series_value = pd.Series([value] * len(df), index=df.index)
            if target_name == column:
                df[column] = series_value
            else:
                _insert_column_after(column, target_name, series_value)
        elif op == "stats_std":
            column = params.get("column")
            new_name = str(params.get("new_name", "")).strip()
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for stats_std.")
            numeric = pd.to_numeric(df[column], errors="coerce")
            value = numeric.std()
            target_name = new_name or f"{column}_std"
            if target_name in df.columns and target_name != column:
                raise ValueError("Target column name already exists.")
            series_value = pd.Series([value] * len(df), index=df.index)
            if target_name == column:
                df[column] = series_value
            else:
                _insert_column_after(column, target_name, series_value)
        elif op == "delete_rows":
            row_indices = params.get("row_indices", [])
            if not isinstance(row_indices, list) or not row_indices:
                raise ValueError("row_indices list is required for delete_rows.")
            normalized = sorted({
                int(i) for i in row_indices
                if isinstance(i, (int, float, str)) and str(i).strip().lstrip("-").isdigit()
            })
            valid = [i for i in normalized if 0 <= i < len(df)]
            if not valid:
                raise ValueError("No valid row indices to delete.")
            df = df.drop(df.index[valid])
        elif op == "delete_rows_condition":
            column = str(params.get("column", "")).strip()
            condition = str(params.get("condition", params.get("operator", "eq"))).strip().lower()
            value = params.get("value")
            case_sensitive = bool(params.get("case_sensitive", True))
            if not column or column not in df.columns:
                raise ValueError("Valid column is required for delete_rows_condition.")

            operator_map = {
                "==": "eq",
                "=": "eq",
                "equals": "eq",
                "eq": "eq",
                "!=": "ne",
                "<>": "ne",
                "not_equals": "ne",
                "ne": "ne",
                ">": "gt",
                "gt": "gt",
                ">=": "gte",
                "gte": "gte",
                "<": "lt",
                "lt": "lt",
                "<=": "lte",
                "lte": "lte",
                "contains": "contains",
                "not_contains": "not_contains",
                "starts_with": "starts_with",
                "ends_with": "ends_with",
                "is_null": "is_null",
                "is_not_null": "is_not_null",
                "in": "in",
                "not_in": "not_in",
            }
            normalized_condition = operator_map.get(condition)
            if not normalized_condition:
                raise ValueError("Unsupported condition for delete_rows_condition.")

            series = df[column]
            null_ops = {"is_null", "is_not_null"}
            if normalized_condition not in null_ops and value in (None, ""):
                raise ValueError("value is required for delete_rows_condition.")

            if normalized_condition == "is_null":
                match_mask = series.isna()
            elif normalized_condition == "is_not_null":
                match_mask = series.notna()
            elif normalized_condition in {"contains", "not_contains", "starts_with", "ends_with"}:
                text = str(value)
                base = series.astype("string")
                probe = text if case_sensitive else text.lower()
                haystack = base if case_sensitive else base.str.lower()
                if normalized_condition == "contains":
                    match_mask = haystack.str.contains(probe, regex=False, na=False)
                elif normalized_condition == "not_contains":
                    match_mask = ~haystack.str.contains(probe, regex=False, na=False)
                elif normalized_condition == "starts_with":
                    match_mask = haystack.str.startswith(probe, na=False)
                else:
                    match_mask = haystack.str.endswith(probe, na=False)
            elif normalized_condition in {"in", "not_in"}:
                if isinstance(value, list):
                    candidates = [str(v) for v in value]
                else:
                    candidates = [part.strip() for part in str(value).split(",") if part.strip()]
                if not candidates:
                    raise ValueError("value must provide at least one candidate for in/not_in.")
                haystack = series.astype("string")
                if case_sensitive:
                    match_mask = haystack.isin(candidates)
                else:
                    lowered = {c.lower() for c in candidates}
                    match_mask = haystack.str.lower().isin(lowered)
                if normalized_condition == "not_in":
                    match_mask = ~match_mask
            elif normalized_condition in {"gt", "gte", "lt", "lte"}:
                numeric_series = pd.to_numeric(series, errors="coerce")
                numeric_value = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
                if pd.notna(numeric_value):
                    if normalized_condition == "gt":
                        match_mask = numeric_series > numeric_value
                    elif normalized_condition == "gte":
                        match_mask = numeric_series >= numeric_value
                    elif normalized_condition == "lt":
                        match_mask = numeric_series < numeric_value
                    else:
                        match_mask = numeric_series <= numeric_value
                else:
                    dt_series = pd.to_datetime(series, errors="coerce")
                    dt_value = pd.to_datetime(pd.Series([value]), errors="coerce").iloc[0]
                    if pd.isna(dt_value):
                        raise ValueError("value must be numeric or datetime for comparison operators.")
                    if normalized_condition == "gt":
                        match_mask = dt_series > dt_value
                    elif normalized_condition == "gte":
                        match_mask = dt_series >= dt_value
                    elif normalized_condition == "lt":
                        match_mask = dt_series < dt_value
                    else:
                        match_mask = dt_series <= dt_value
            else:
                numeric_series = pd.to_numeric(series, errors="coerce")
                numeric_value = pd.to_numeric(pd.Series([value]), errors="coerce").iloc[0]
                if pd.notna(numeric_value):
                    match_mask = numeric_series == numeric_value
                else:
                    needle = str(value)
                    haystack = series.astype("string")
                    if case_sensitive:
                        match_mask = haystack == needle
                    else:
                        match_mask = haystack.str.lower() == needle.lower()
                if normalized_condition == "ne":
                    match_mask = ~match_mask

            df = df.loc[~match_mask.fillna(False)]
        elif op == "duplicate_rows":
            row_indices = params.get("row_indices", [])
            if not isinstance(row_indices, list) or not row_indices:
                raise ValueError("row_indices list is required for duplicate_rows.")
            normalized = sorted({
                int(i) for i in row_indices
                if isinstance(i, (int, float, str)) and str(i).strip().lstrip("-").isdigit()
            })
            valid = [i for i in normalized if 0 <= i < len(df)]
            if not valid:
                raise ValueError("No valid row indices to duplicate.")
            duplicate_set = set(valid)
            expanded_rows: List[Dict[str, Any]] = []
            for idx, row in df.iterrows():
                row_dict = row.to_dict()
                expanded_rows.append(row_dict)
                if idx in duplicate_set:
                    expanded_rows.append(dict(row_dict))
            df = pd.DataFrame(expanded_rows, columns=df.columns)
        elif op in {"duplicate_column", "duplicate_columns"}:
            source_column = str(params.get("column", "")).strip()
            if not source_column or source_column not in df.columns:
                raise ValueError("Valid column is required for duplicate_column.")
            requested_name = str(params.get("new_name", "")).strip()
            if requested_name:
                if requested_name in df.columns:
                    raise ValueError("Target column name already exists.")
                target_name = requested_name
            else:
                base_name = f"{source_column}_copy"
                target_name = base_name
                suffix = 2
                while target_name in df.columns:
                    target_name = f"{base_name}_{suffix}"
                    suffix += 1
            _insert_column_after(source_column, target_name, df[source_column])
        elif op in {"delete_column", "delete_columns"}:
            columns = params.get("columns")
            if columns is None:
                single = params.get("column")
                columns = [single] if single else []
            if not isinstance(columns, list) or not columns:
                raise ValueError("column/columns is required for delete_column(s).")
            valid_columns = [str(c) for c in columns if str(c) in df.columns]
            if not valid_columns:
                raise ValueError("No valid columns to delete.")
            if len(valid_columns) >= len(df.columns):
                raise ValueError("Cannot delete all columns from dataset.")
            df = df.drop(columns=valid_columns)
        else:
            raise ValueError("Unsupported operation.")

        df = df.reset_index(drop=True)
        self._push_undo_delta(
            session_id,
            before_df,
            df,
            label=f"apply:{op}",
            details=params,
        )
        self._save_session_df(session_id, df)
        return {
            "session_id": session_id,
            "operation": op,
            "rows_before": before_rows,
            "rows_after": int(len(df)),
            "columns": [str(c) for c in df.columns.tolist()],
        }

    def get_prepare_history(self, session_id: str) -> Dict[str, Any]:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")
        operation_log = session.get("operation_log", [])
        cursor = int(session.get("operation_cursor", 0))
        checkpoints = sorted(
            session.get("checkpoints", []),
            key=lambda item: item.get("created_at", ""),
            reverse=True,
        )
        return {
            "session_id": session_id,
            "can_undo": cursor > 0,
            "can_redo": cursor < len(operation_log),
            "undo_count": cursor,
            "redo_count": len(operation_log) - cursor,
            "checkpoint_count": len(session.get("checkpoints", [])),
            "checkpoints": checkpoints,
        }

    def create_prepare_checkpoint(self, session_id: str, label: Optional[str] = None) -> Dict[str, Any]:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")
        serial = int(session.get("checkpoint_serial", 0)) + 1
        session["checkpoint_serial"] = serial
        checkpoint_label = label.strip() if isinstance(label, str) and label.strip() else f"Checkpoint {serial}"
        checkpoint = {
            "checkpoint_id": str(uuid.uuid4()),
            "label": checkpoint_label,
            "kind": "marker",
            "operation_index": int(session.get("operation_cursor", 0)),
            "operation_label": "manual",
            "operation_details": "-",
            "serial_no": serial,
            "created_at": pd.Timestamp.utcnow().isoformat(),
        }
        session["checkpoints"].append(checkpoint)
        return {
            "session_id": session_id,
            "checkpoint": checkpoint,
            "history": self.get_prepare_history(session_id),
        }

    def undo_prepare_session(self, session_id: str) -> Dict[str, Any]:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")
        cursor = int(session.get("operation_cursor", 0))
        if cursor <= 0:
            raise ValueError("Nothing to undo.")
        cursor -= 1
        session["operation_cursor"] = cursor
        restore_df = self._replay_session_to_cursor(session_id, cursor)
        self._save_session_df(session_id, restore_df)
        return {
            "session_id": session_id,
            "rows": int(len(restore_df)),
            "columns": [str(c) for c in restore_df.columns.tolist()],
            "history": self.get_prepare_history(session_id),
        }

    def redo_prepare_session(self, session_id: str) -> Dict[str, Any]:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")
        operation_log = session.get("operation_log", [])
        cursor = int(session.get("operation_cursor", 0))
        if cursor >= len(operation_log):
            raise ValueError("Nothing to redo.")
        cursor += 1
        session["operation_cursor"] = cursor
        restore_df = self._replay_session_to_cursor(session_id, cursor)
        self._save_session_df(session_id, restore_df)
        return {
            "session_id": session_id,
            "rows": int(len(restore_df)),
            "columns": [str(c) for c in restore_df.columns.tolist()],
            "history": self.get_prepare_history(session_id),
        }

    def restore_prepare_checkpoint(self, session_id: str, checkpoint_id: str) -> Dict[str, Any]:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")
        checkpoints = session.get("checkpoints", [])
        checkpoint = next(
            (cp for cp in checkpoints if str(cp.get("checkpoint_id")) == str(checkpoint_id)),
            None,
        )
        if not checkpoint:
            raise ValueError("Checkpoint not found.")

        operation_log = session.get("operation_log", [])
        target_index = max(0, min(int(checkpoint.get("operation_index", 0)), len(operation_log)))
        session["operation_cursor"] = target_index
        restore_df = self._replay_session_to_cursor(session_id, target_index)
        self._save_session_df(session_id, restore_df)
        return {
            "session_id": session_id,
            "rows": int(len(restore_df)),
            "columns": [str(c) for c in restore_df.columns.tolist()],
            "restored_checkpoint": checkpoint,
            "history": self.get_prepare_history(session_id),
        }

    def save_prepare_session(
        self,
        session_id: str,
        mode: str = "overwrite",
        new_filename: Optional[str] = None,
        folder: Optional[str] = None,
    ) -> Dict[str, Any]:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")

        df = self._load_session_df(session_id)
        dataset_id = session["dataset_id"]
        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Source dataset metadata not found.")

        mode = (mode or "overwrite").lower()
        if mode == "overwrite":
            schema = self._infer_schema(df)
            records = self._records_from_dataframe(df)
            metadata_payload = dict(dataset_meta.get("metadata", {}))
            metadata_payload["last_prepared_save_mode"] = "overwrite"
            metadata_payload["schema_detected_at"] = pd.Timestamp.utcnow().isoformat()
            metadata_payload["raw_file_sync_status"] = "stale_after_overwrite"
            patch_result = PredictionDataTable.upsert_dataset_rows_incremental(
                dataset_id=dataset_id,
                rows=records,
                schema=schema,
            )
            updated_meta = PredictionDataTable.update_dataset(
                dataset_id=dataset_id,
                rows=int(len(df)),
                schema=schema,
                metadata=metadata_payload,
            )
            if not updated_meta:
                raise ValueError("Failed to update dataset.")
            refreshed = self._compute_and_persist_dataset_insights(dataset_id=dataset_id)
            self._reset_prepare_history(session_id)
            return {"mode": "overwrite", "dataset": refreshed or updated_meta, "patch": patch_result}

        if mode == "new":
            filename = (new_filename or "").strip()
            if not filename:
                raise ValueError("new_filename is required when mode='new'.")

            safe_name = re.sub(r"[^a-zA-Z0-9._-]", "_", filename)
            suffix = Path(safe_name).suffix.lower()
            if suffix not in {".csv", ".xlsx", ".xls", ".json"}:
                safe_name = f"{safe_name}.csv"
                suffix = ".csv"

            new_dataset_id = str(uuid.uuid4())
            target_folder = folder or session.get("source_folder") or self.default_folder
            folder_data = self._resolve_or_create_folder(target_folder)
            folder_path = self._get_dataset_folder_path(folder_data["path"])
            folder_path.mkdir(parents=True, exist_ok=True)
            stored_name = f"{new_dataset_id}_{safe_name}"
            target_path = folder_path / stored_name
            self._write_dataframe(target_path, df)
            schema = self._infer_schema(df)
            records = self._records_from_dataframe(df)
            new_meta = PredictionDataTable.create_dataset(
                dataset_id=new_dataset_id,
                folder_id=folder_data["id"],
                original_filename=safe_name,
                stored_filename=stored_name,
                file_extension=suffix,
                file_path=str(target_path),
                file_size=target_path.stat().st_size if target_path.exists() else None,
                mime_type=None,
                file_hash=self._hash_file(target_path),
                rows=int(len(df)),
                schema=schema,
                metadata={
                    "source": "prepare_session",
                    "source_dataset_id": dataset_id,
                    "schema_detected_at": pd.Timestamp.utcnow().isoformat(),
                },
            )
            PredictionDataTable.replace_dataset_rows(dataset_id=new_dataset_id, rows=records, schema=schema)
            refreshed = self._compute_and_persist_dataset_insights(dataset_id=new_dataset_id)
            self._reset_prepare_history(session_id)
            return {"mode": "new", "dataset": refreshed or new_meta}

        raise ValueError("Unsupported save mode. Use overwrite or new.")

    def start_training_job(
        self,
        dataset_id: str,
        target_column: str,
        feature_columns: Optional[List[str]],
        algorithm: str,
        algorithm_params: Dict[str, Any],
        test_size: float,
        random_state: int,
        use_cross_validation: bool = False,
        cross_validation_folds: int = 5,
        problem_type: str = "regression",
    ) -> str:
        job_id = str(uuid.uuid4())
        self.jobs[job_id] = {
            "status": "queued",
            "stage": "queued",
            "message": "Training queued",
            "progress": 0,
            "problem_type": problem_type,
            "metrics_history": [],
        }
        asyncio.create_task(
            self._run_training_job(
                job_id,
                dataset_id,
                target_column,
                feature_columns,
                algorithm,
                algorithm_params,
                test_size,
                random_state,
                use_cross_validation,
                cross_validation_folds,
                problem_type,
            )
        )
        return job_id

    def get_training_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        return self.jobs.get(job_id)

    async def _run_training_job(
        self,
        job_id: str,
        dataset_id: str,
        target_column: str,
        feature_columns: Optional[List[str]],
        algorithm: str,
        algorithm_params: Dict[str, Any],
        test_size: float,
        random_state: int,
        use_cross_validation: bool,
        cross_validation_folds: int,
        problem_type: str = "regression",
    ) -> None:
        self._set_job(job_id, status="running", stage="loading", message="Loading dataset", progress=10)
        try:
            result = await asyncio.to_thread(
                self._train_and_persist_model,
                dataset_id,
                target_column,
                feature_columns,
                algorithm,
                algorithm_params,
                test_size,
                random_state,
                use_cross_validation,
                cross_validation_folds,
                job_id,
                problem_type,
            )
            self._set_job(
                job_id,
                status="completed",
                stage="completed",
                message="Model training completed",
                progress=100,
                result=result,
            )
        except Exception as e:
            log.error(f"Training job failed ({job_id}): {e}")
            self._set_job(
                job_id,
                status="failed",
                stage="failed",
                message="Model training failed",
                progress=100,
                error=str(e),
            )

    def run_inference(self, model_id: str, rows: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not rows:
            raise ValueError("Provide at least one inference row.")

        model_path = self.models_dir / f"{model_id}.joblib"
        if not model_path.exists():
            raise ValueError("Model not found.")

        bundle = joblib.load(model_path)
        metadata = bundle["metadata"]
        feature_columns = metadata["feature_columns"]
        source = str(metadata.get("source") or "prediction_service")

        df = pd.DataFrame(rows)
        missing = [c for c in feature_columns if c not in df.columns]
        if missing:
            raise ValueError(f"Missing feature columns: {', '.join(missing)}")

        if source == "mljar_automl":
            results_path = str(metadata.get("results_path") or "").strip()
            if not results_path:
                raise ValueError("AutoML results path is missing for this saved model.")
            from supervised.automl import AutoML
            pipeline = AutoML(results_path=results_path)
            predictions = pipeline.predict(df[feature_columns])
        else:
            pipeline = bundle["pipeline"]
            predictions = pipeline.predict(df[feature_columns])

        if hasattr(predictions, "tolist"):
            predictions = predictions.tolist()
        return {
            "model_id": model_id,
            "predictions": [self._normalize_prediction_value(v) for v in list(predictions)],
        }

    def persist_external_model(
        self,
        metadata: Dict[str, Any],
        bundle: Optional[Dict[str, Any]] = None,
        activate_if_missing: bool = True,
    ) -> Dict[str, Any]:
        model_id = str(metadata.get("model_id") or uuid.uuid4())
        created_at = str(metadata.get("created_at") or pd.Timestamp.utcnow().isoformat())
        model_path = self.models_dir / f"{model_id}.joblib"

        persisted_metadata = dict(metadata)
        persisted_metadata["model_id"] = model_id
        persisted_metadata["created_at"] = created_at
        persisted_metadata["model_path"] = str(model_path)

        payload = dict(bundle or {"pipeline": None, "metadata": persisted_metadata})
        payload["metadata"] = persisted_metadata

        joblib.dump(payload, model_path)
        self._save_json(self.models_dir / f"{model_id}.meta.json", persisted_metadata)

        if activate_if_missing and not self.get_active_model_id():
            try:
                self.set_active_model(model_id)
            except Exception:
                pass

        return persisted_metadata

    def _train_and_persist_model(
        self,
        dataset_id: str,
        target_column: str,
        feature_columns: Optional[List[str]],
        algorithm: str,
        algorithm_params: Dict[str, Any],
        test_size: float,
        random_state: int,
        use_cross_validation: bool,
        cross_validation_folds: int,
        job_id: str,
        problem_type: str = "regression",
    ) -> Dict[str, Any]:
        algo_cfg = self.algorithms.get(algorithm)
        if not algo_cfg:
            raise ValueError(f"Unsupported algorithm '{algorithm}'.")
        resolved_problem_type = problem_type or algo_cfg.get("problem_type", "regression")

        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")
        df = self._load_dataset_dataframe(dataset_meta)

        if resolved_problem_type != "clustering":
            if target_column not in df.columns:
                raise ValueError(f"Target column '{target_column}' not found in dataset.")

        features = feature_columns or [c for c in df.columns if c != target_column]
        if not features:
            raise ValueError("No feature columns available.")
        for col in features:
            if col not in df.columns:
                raise ValueError(f"Feature column '{col}' not found in dataset.")

        self._set_job(job_id, status="running", stage="preparing", message="Preparing features", progress=25)

        X = df[features].copy()

        if resolved_problem_type == "clustering":
            y = None
            X_train = X_test = X
            y_train = y_test = None
        elif resolved_problem_type == "classification":
            y_raw = df[target_column].copy()
            valid_mask = y_raw.notna()
            X = X.loc[valid_mask]
            y = y_raw.loc[valid_mask]
            if len(X) < 10:
                raise ValueError("Not enough valid rows after cleaning target column. Need at least 10.")
            le = LabelEncoder()
            y = pd.Series(le.fit_transform(y.astype(str)), index=y.index)
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=random_state, stratify=y if y.nunique() > 1 else None,
            )
        else:
            y_raw = pd.to_numeric(df[target_column], errors="coerce")
            valid_mask = ~y_raw.isna()
            X = X.loc[valid_mask]
            y = y_raw.loc[valid_mask]
            if len(X) < 10:
                raise ValueError("Not enough valid rows after cleaning target column. Need at least 10.")
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=test_size, random_state=random_state,
            )

        numeric_features = X.select_dtypes(include=["number"]).columns.tolist()
        categorical_features = [c for c in features if c not in numeric_features]

        preprocessor = ColumnTransformer(
            transformers=[
                (
                    "num",
                    Pipeline(steps=[("imputer", SimpleImputer(strategy="median"))]),
                    numeric_features,
                ),
                (
                    "cat",
                    Pipeline(steps=[
                        ("imputer", SimpleImputer(strategy="most_frequent")),
                        ("encoder", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
                    ]),
                    categorical_features,
                ),
            ],
            remainder="drop",
        )

        estimator = self._build_estimator(algorithm, algorithm_params)
        step_name = "model"
        pipeline = Pipeline(steps=[("preprocessor", preprocessor), (step_name, estimator)])

        self._set_job(job_id, status="running", stage="training", message="Training model", progress=55)
        if y_train is not None:
            pipeline.fit(X_train, y_train)
        else:
            pipeline.fit(X_train)

        metrics_history: List[Dict[str, Any]] = []
        trained_model = pipeline.named_steps.get(step_name)
        if hasattr(trained_model, "train_score_"):
            for i, value in enumerate(getattr(trained_model, "train_score_")[:500], start=1):
                entry = {"epoch": i, "train_loss": float(value)}
                metrics_history.append(entry)
                self._append_job_metric(job_id, entry)

        cv_metrics: Dict[str, Any] = {}
        if use_cross_validation and y_train is not None:
            effective_folds = max(2, min(int(cross_validation_folds or 2), len(X_train)))
            if effective_folds >= 2:
                self._set_job(job_id, status="running", stage="cross_validation", message="Running cross-validation", progress=70)
                scoring = "r2" if resolved_problem_type == "regression" else "accuracy"
                try:
                    cv_scores = cross_val_score(pipeline, X_train, y_train, cv=effective_folds, scoring=scoring)
                    cv_metrics = {
                        "cv_folds": int(effective_folds),
                        f"cv_mean_{scoring}": float(cv_scores.mean()),
                        f"cv_std_{scoring}": float(cv_scores.std()),
                    }
                except Exception as e:
                    log.warning(f"Cross-validation failed: {e}")
                    cv_metrics = {"cv_folds": int(effective_folds), "cv_error": str(e)}

        self._set_job(job_id, status="running", stage="evaluating", message="Evaluating model", progress=80)

        loss_curve_points: List[Dict[str, float]] = []
        for entry in metrics_history:
            loss_curve_points.append({"step": float(entry["epoch"]), "value": entry["train_loss"]})

        important_features: List[Dict[str, Any]] = []
        vif_table: List[Dict[str, Any]] = []
        diagnostics: Dict[str, Any] = {}
        metrics: Dict[str, Any] = {}
        evaluation_method = f"Train/Test Split (test_size={float(test_size):.2f})"
        if cv_metrics.get("cv_folds"):
            evaluation_method = f"{evaluation_method} + {int(cv_metrics['cv_folds'])}-Fold Cross-Validation"

        if resolved_problem_type == "regression":
            y_pred = pipeline.predict(X_test)
            y_test_values = y_test.to_numpy()
            y_pred_values = y_pred.tolist()

            residual_points: List[Dict[str, float]] = []
            actual_vs_predicted_points: List[Dict[str, float]] = []
            for idx, (actual, predicted) in enumerate(zip(y_test_values.tolist(), y_pred_values)):
                if idx >= 200:
                    break
                actual_vs_predicted_points.append({"actual": float(actual), "predicted": float(predicted)})
                residual_points.append({"actual": float(actual), "predicted": float(predicted), "residual": float(actual - predicted)})

            qq_plot_points = self._build_qq_points(residual_points)
            important_features = self._extract_important_features(pipeline)
            if not important_features:
                important_features = self._fallback_feature_importance(X_train, y_train, features)
            vif_table = self._compute_vif_table(X_train, numeric_features)

            diagnostics = {
                "actual_vs_predicted_points": actual_vs_predicted_points,
                "residual_points": residual_points,
                "qq_plot_points": qq_plot_points,
                "loss_curve": loss_curve_points,
            }

            mse_value = float(mean_squared_error(y_test, y_pred))
            mae_value = float(mean_absolute_error(y_test, y_pred))
            rmse_value = float(mse_value ** 0.5)
            r2_value = float(r2_score(y_test, y_pred))
            safe_actual_mask = np.asarray(y_test_values) != 0
            if np.any(safe_actual_mask):
                mape_value = float(
                    np.mean(np.abs((np.asarray(y_test_values)[safe_actual_mask] - np.asarray(y_pred_values)[safe_actual_mask]) / np.asarray(y_test_values)[safe_actual_mask])) * 100
                )
            else:
                mape_value = None

            n_test = int(len(X_test))
            p_features = int(len(features))
            adjusted_r2 = None
            if n_test > p_features + 1:
                adjusted_r2 = float(1 - (1 - r2_value) * ((n_test - 1) / (n_test - p_features - 1)))

            business_meaning = self._business_error_meaning({"target_column": target_column}, {"rmse": rmse_value, "mae": mae_value})

            metrics = {
                "r2": r2_value, "adjusted_r2": adjusted_r2, "mae": mae_value, "mse": mse_value,
                "rmse": rmse_value, "mape": mape_value,
                "train_rows": int(len(X_train)), "test_rows": int(len(X_test)), **cv_metrics,
            }

        elif resolved_problem_type == "classification":
            y_pred = pipeline.predict(X_test)
            y_test_values = y_test.to_numpy()

            acc = float(accuracy_score(y_test_values, y_pred))
            f1_macro = float(f1_score(y_test_values, y_pred, average="macro", zero_division=0))
            precision_macro = float(precision_score(y_test_values, y_pred, average="macro", zero_division=0))
            recall_macro = float(recall_score(y_test_values, y_pred, average="macro", zero_division=0))
            cm = confusion_matrix(y_test_values, y_pred).tolist()

            diagnostics = {"confusion_matrix": cm, "loss_curve": loss_curve_points}

            important_features = self._extract_important_features(pipeline)
            if not important_features:
                important_features = self._fallback_feature_importance(X_train, y_train, features)

            metrics = {
                "accuracy": acc, "f1_macro": f1_macro, "precision_macro": precision_macro,
                "recall_macro": recall_macro,
                "train_rows": int(len(X_train)), "test_rows": int(len(X_test)), **cv_metrics,
            }

        elif resolved_problem_type == "clustering":
            if hasattr(trained_model, "labels_"):
                labels = trained_model.labels_
            else:
                labels = trained_model.predict(X_train)

            n_clusters = len(set(labels) - {-1})
            sil_score = None
            db_score = None
            inertia_val = None
            if n_clusters >= 2:
                try:
                    sil_score = float(silhouette_score(X_train, labels))
                except Exception:
                    pass
                try:
                    db_score = float(davies_bouldin_score(X_train, labels))
                except Exception:
                    pass
            if hasattr(trained_model, "inertia_"):
                inertia_val = float(trained_model.inertia_)

            diagnostics = {"loss_curve": loss_curve_points, "cluster_labels_sample": [int(l) for l in labels[:200]]}

            metrics = {
                "n_clusters": n_clusters, "silhouette_score": sil_score,
                "davies_bouldin_score": db_score, "inertia": inertia_val,
                "train_rows": int(len(X_train)), **cv_metrics,
            }

        model_id = str(uuid.uuid4())
        model_path = self.models_dir / f"{model_id}.joblib"
        model_metadata = {
            "model_id": model_id,
            "dataset_id": dataset_id,
            "problem_type": resolved_problem_type,
            "algorithm": algorithm,
            "algorithm_label": self.algorithms[algorithm]["label"],
            "target_column": target_column if resolved_problem_type != "clustering" else None,
            "feature_columns": features,
            "metrics": metrics,
            "diagnostics": diagnostics,
            "important_features": important_features,
            "vif_table": vif_table,
            "evaluation_method": evaluation_method,
            "report": {
                "model_id": model_id,
                "problem_type": resolved_problem_type,
                "algorithm_label": self.algorithms[algorithm]["label"],
                "target_column": target_column if resolved_problem_type != "clustering" else None,
                "feature_columns": features,
                "created_at": pd.Timestamp.utcnow().isoformat(),
                "evaluation_method": evaluation_method,
                "metrics": metrics,
                "diagnostics": diagnostics,
                "important_features": important_features,
                "vif_table": vif_table,
                "metric_explanations": self._metric_explanations_for_type(resolved_problem_type),
                "business_meaning": business_meaning if resolved_problem_type == "regression" else (
                    self._classification_business_meaning(metrics) if resolved_problem_type == "classification"
                    else self._clustering_business_meaning(metrics)
                ),
            },
            "accuracy_score": metrics.get("r2") or metrics.get("accuracy"),
            "created_at": pd.Timestamp.utcnow().isoformat(),
            "test_size": float(test_size),
            "use_cross_validation": bool(use_cross_validation),
            "cross_validation_folds": int(cross_validation_folds or 0),
            "model_path": str(model_path),
        }

        joblib.dump({"pipeline": pipeline, "metadata": model_metadata}, model_path)
        self._save_json(self.models_dir / f"{model_id}.meta.json", model_metadata)
        if not self.get_active_model_id():
            try:
                self.set_active_model(model_id)
            except Exception:
                pass
        return model_metadata

    def _build_estimator(self, algorithm: str, algorithm_params: Dict[str, Any]):
        if algorithm not in self.algorithms:
            raise ValueError("Unsupported algorithm.")

        config = self.algorithms[algorithm]
        raw_params = algorithm_params or {}
        typed_params: Dict[str, Any] = {}

        param_schema = {p["name"]: p for p in config["params"]}
        for key, value in raw_params.items():
            if key not in param_schema:
                raise ValueError(f"Parameter '{key}' is not supported for {algorithm}.")
            typed_params[key] = self._coerce_value(value, param_schema[key]["type"])

        return config["estimator"](**typed_params)

    def _normalize_prediction_value(self, value: Any) -> Any:
        if isinstance(value, np.generic):
            return value.item()
        return value

    def _coerce_value(self, value: Any, value_type: str) -> Any:
        if value_type == "float":
            return float(value)
        if value_type == "int":
            return int(value)
        if value_type == "bool":
            if isinstance(value, bool):
                return value
            if str(value).lower() in {"true", "1", "yes"}:
                return True
            if str(value).lower() in {"false", "0", "no"}:
                return False
            raise ValueError(f"Invalid boolean value: {value}")
        if value_type == "int_optional":
            if value is None or value == "" or str(value).lower() == "none":
                return None
            return int(value)
        return value

    def update_dataset_schema(self, dataset_id: str, schema: List[Dict[str, Any]]) -> Dict[str, Any]:
        dataset_meta = self.get_dataset_by_id(dataset_id)
        if not dataset_meta:
            raise ValueError("Dataset not found.")
        existing_schema = dataset_meta.get("schema", [])
        existing_storage_by_name = {
            str(item.get("name")): str(item.get("storage_name"))
            for item in existing_schema
            if item.get("name") and item.get("storage_name")
        }

        normalized: List[Dict[str, Any]] = []
        for item in schema:
            column_name = str(item.get("name", "")).strip()
            if not column_name:
                continue
            storage_name = str(item.get("storage_name", "")).strip() or existing_storage_by_name.get(column_name)
            if not storage_name:
                storage_name = self._sanitize_storage_name(column_name)
            normalized.append(
                {
                    "name": column_name,
                    "storage_name": storage_name,
                    "detected_dtype": str(item.get("detected_dtype", "object")),
                    "semantic_type": str(item.get("semantic_type", "categorical")),
                    "nullable": bool(item.get("nullable", True)),
                    "null_count": int(item.get("null_count", 0)),
                    "unique_count": int(item.get("unique_count", 0)),
                    "sample_values": list(item.get("sample_values", []))[:5],
                }
            )
        if not normalized:
            raise ValueError("Schema must contain at least one column.")

        metadata_payload = dict(dataset_meta.get("metadata", {}))
        metadata_payload["schema_manually_modified"] = True
        metadata_payload["schema_modified_at"] = pd.Timestamp.utcnow().isoformat()
        updated = PredictionDataTable.update_dataset(
            dataset_id=dataset_id,
            schema=normalized,
            metadata=metadata_payload,
        )
        if not updated:
            raise ValueError("Failed to update schema.")
        return updated

    def _infer_schema(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        schema: List[Dict[str, Any]] = []
        total_rows = int(len(df))
        for col in df.columns:
            series = df[col]
            detected_dtype, semantic_type = self._infer_column_type(series, str(col), total_rows)

            sample_values: List[Any] = []
            for value in series.dropna().head(5).tolist():
                sample_values.append(self._json_safe_value(value))

            schema.append(
                {
                    "name": str(col),
                    "storage_name": self._sanitize_storage_name(str(col)),
                    "detected_dtype": detected_dtype,
                    "semantic_type": semantic_type,
                    "nullable": bool(series.isna().any()),
                    "null_count": int(series.isna().sum()),
                    "unique_count": self._safe_unique_count(series),
                    "sample_values": sample_values,
                }
            )
        return schema

    def _infer_column_type(self, series: pd.Series, column_name: str, total_rows: int) -> tuple[str, str]:
        native_dtype = str(series.dtype)
        non_null = series.dropna()
        if non_null.empty:
            return "string", "unknown"
        lower_name = column_name.lower()

        unique_count = self._safe_unique_count(non_null)
        non_null_count = int(len(non_null))
        unique_ratio = float(unique_count) / float(non_null_count) if non_null_count else 0.0
        name_suggests_id = bool(
            lower_name == "id"
            or lower_name.endswith("_id")
            or lower_name.startswith("id_")
            or "uuid" in lower_name
            or "guid" in lower_name
            or "identifier" in lower_name
            or lower_name.endswith("_key")
            or lower_name.startswith("key_")
        )
        high_uniqueness = unique_ratio >= 0.97 and unique_count >= max(10, min(100, total_rows // 10 if total_rows else 10))

        if pd.api.types.is_bool_dtype(series):
            return "bool", "boolean"
        if pd.api.types.is_integer_dtype(series):
            if name_suggests_id and high_uniqueness:
                return "int64", "id"
            return "int64", "integer"
        if pd.api.types.is_float_dtype(series):
            return "float64", "float"
        if pd.api.types.is_datetime64_any_dtype(series):
            return "datetime64[ns]", "datetime"

        values = non_null.astype(str).map(lambda v: v.strip())
        valid_count = len(values)
        if valid_count == 0:
            return "string", "unknown"

        bool_ratio = float(values.map(self._parse_bool).notna().sum()) / valid_count

        numeric_series = pd.to_numeric(values, errors="coerce")
        numeric_ratio = float(numeric_series.notna().sum()) / valid_count
        int_ratio = 0.0
        valid_numeric = numeric_series.dropna()
        if not valid_numeric.empty:
            int_ratio = float(((valid_numeric % 1) == 0).sum()) / len(valid_numeric)

        with warnings.catch_warnings():
            warnings.simplefilter("ignore", category=UserWarning)
            datetime_series = pd.to_datetime(values, errors="coerce")
        datetime_ratio = float(datetime_series.notna().sum()) / valid_count

        time_ratio = float(values.map(self._parse_time).notna().sum()) / valid_count
        json_ratio = float(values.map(self._parse_json).notna().sum()) / valid_count

        if bool_ratio >= 0.95:
            return "bool", "boolean"
        if numeric_ratio >= 0.95:
            if int_ratio >= 0.98:
                if name_suggests_id and high_uniqueness:
                    return "int64", "id"
                return "int64", "integer"
            return "float64", "float"
        if datetime_ratio >= 0.9 and time_ratio < 0.8:
            return "datetime64[ns]", "datetime"
        if time_ratio >= 0.9 and any(k in lower_name for k in ["time", "hour", "minute", "clock"]):
            return "time", "time"
        if json_ratio >= 0.9:
            return "json", "json"

        uuid_pattern = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.IGNORECASE)
        uuid_ratio = float(values.map(lambda v: bool(uuid_pattern.match(v))).sum()) / valid_count if valid_count else 0.0
        if (name_suggests_id and high_uniqueness) or uuid_ratio >= 0.9:
            return "string", "id"

        if unique_count <= max(50, total_rows // 20):
            return native_dtype, "categorical"
        return "string", "text"

    def _parse_bool(self, value: Any) -> Optional[bool]:
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        token = str(value).strip().lower()
        if token in {"true", "1", "yes", "y", "t"}:
            return True
        if token in {"false", "0", "no", "n", "f"}:
            return False
        return None

    def _parse_time(self, value: Any) -> Optional[time]:
        if value is None:
            return None
        token = str(value).strip()
        if not token:
            return None
        patterns = ("%H:%M", "%H:%M:%S", "%I:%M %p", "%I:%M:%S %p")
        for pattern in patterns:
            try:
                return pd.to_datetime(token, format=pattern, errors="raise").time()
            except Exception:
                continue
        return None

    def _parse_json(self, value: Any) -> Optional[Any]:
        if value is None:
            return None
        if isinstance(value, (dict, list)):
            return value
        token = str(value).strip()
        if not token:
            return None
        if not (token.startswith("{") or token.startswith("[")):
            return None
        try:
            return json.loads(token)
        except Exception:
            return None

    def _records_from_dataframe(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        records: List[Dict[str, Any]] = []
        for record in df.to_dict(orient="records"):
            parsed: Dict[str, Any] = {}
            for key, value in record.items():
                if self._is_missing_value(value):
                    parsed[str(key)] = None
                else:
                    parsed[str(key)] = self._json_safe_value(value)
            records.append(parsed)
        return records

    def _is_missing_value(self, value: Any) -> bool:
        if value is None:
            return True
        if isinstance(value, (list, tuple, dict, set)):
            return False
        try:
            return bool(pd.isna(value))
        except Exception:
            return False

    def _normalize_for_unique(self, value: Any) -> Any:
        if isinstance(value, (list, tuple, dict, set)):
            try:
                return json.dumps(self._json_safe_value(value), sort_keys=True, default=str)
            except Exception:
                return str(value)
        try:
            hash(value)
            return value
        except Exception:
            return str(value)

    def _safe_unique_count(self, series: pd.Series) -> int:
        try:
            return int(series.nunique(dropna=True))
        except Exception:
            normalized = series.dropna().map(self._normalize_for_unique)
            return int(normalized.nunique(dropna=True))

    def _sanitize_storage_name(self, column_name: str) -> str:
        safe = re.sub(r"[^a-zA-Z0-9_]", "_", str(column_name).strip().lower())
        safe = re.sub(r"_+", "_", safe).strip("_")
        if not safe:
            safe = "col"
        if safe[0].isdigit():
            safe = f"c_{safe}"
        return safe[:55]

    def _json_safe_value(self, value: Any) -> Any:
        if value is None:
            return None
        try:
            if hasattr(value, "item"):
                value = value.item()
        except Exception:
            pass

        if isinstance(value, pd.Timestamp):
            if pd.isna(value):
                return None
            return value.to_pydatetime().isoformat()
        if isinstance(value, uuid.UUID):
            return str(value)
        if isinstance(value, (dt.datetime, dt.date, dt.time)):
            return value.isoformat()
        if isinstance(value, (list, tuple)):
            return [self._json_safe_value(v) for v in value]
        if isinstance(value, dict):
            return {str(k): self._json_safe_value(v) for k, v in value.items()}
        return value

    def _load_dataset_dataframe(self, dataset_meta: Dict[str, Any]) -> pd.DataFrame:
        dataset_id = dataset_meta["dataset_id"]
        db_rows = PredictionDataTable.get_dataset_rows(dataset_id)
        if db_rows:
            return pd.DataFrame(db_rows)

        dataset_path = Path(dataset_meta["path"])
        if not dataset_path.exists():
            raise ValueError("Dataset not found in database rows or filesystem.")
        return self._load_dataframe(dataset_path)

    def _hash_file(self, path: Path) -> Optional[str]:
        if not path.exists() or not path.is_file():
            return None
        hash_sha256 = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                hash_sha256.update(chunk)
        return hash_sha256.hexdigest()

    def _migrate_legacy_dataset_metadata(self) -> None:
        for meta_path in sorted(self.datasets_dir.glob("*.meta.json")):
            try:
                with meta_path.open("r", encoding="utf-8") as f:
                    legacy = json.load(f)
            except Exception as e:
                log.warning(f"Skipping invalid legacy metadata {meta_path}: {e}")
                continue

            dataset_id = str(legacy.get("dataset_id", "")).strip()
            if not dataset_id:
                continue
            if PredictionDataTable.get_dataset_by_id(dataset_id):
                continue
            dataset_path = Path(str(legacy.get("path", "")))
            if not dataset_path.exists():
                continue
            try:
                df = self._load_dataframe(dataset_path)
                if df.empty:
                    continue
                folder_data = self._resolve_or_create_folder(legacy.get("folder", self.default_folder))
                schema = self._infer_schema(df)
                metadata = PredictionDataTable.create_dataset(
                    dataset_id=dataset_id,
                    folder_id=folder_data["id"],
                    original_filename=str(legacy.get("original_filename", dataset_path.name)),
                    stored_filename=str(legacy.get("stored_filename", dataset_path.name)),
                    file_extension=dataset_path.suffix.lower(),
                    file_path=str(dataset_path),
                    file_size=dataset_path.stat().st_size if dataset_path.exists() else None,
                    mime_type=None,
                    file_hash=self._hash_file(dataset_path),
                    rows=int(len(df)),
                    schema=schema,
                    metadata={
                        "source": "legacy_meta_migration",
                        "migrated_at": pd.Timestamp.utcnow().isoformat(),
                    },
                )
                PredictionDataTable.replace_dataset_rows(
                    dataset_id=metadata["dataset_id"],
                    rows=self._records_from_dataframe(df),
                    schema=schema,
                )
            except Exception as e:
                log.warning(f"Failed to migrate legacy dataset metadata {meta_path}: {e}")

    def _load_dataframe(self, dataset_path: Path) -> pd.DataFrame:
        suffix = dataset_path.suffix.lower()
        if suffix == ".csv":
            return pd.read_csv(dataset_path)
        if suffix in {".xlsx", ".xls"}:
            return pd.read_excel(dataset_path)
        if suffix == ".json":
            try:
                return pd.read_json(dataset_path)
            except ValueError:
                return pd.read_json(dataset_path, lines=True)
        raise ValueError("Unsupported dataset format")

    def _write_dataframe(self, dataset_path: Path, df: pd.DataFrame) -> None:
        suffix = dataset_path.suffix.lower()
        if suffix == ".csv":
            df.to_csv(dataset_path, index=False)
            return
        if suffix in {".xlsx", ".xls"}:
            df.to_excel(dataset_path, index=False)
            return
        if suffix == ".json":
            df.to_json(dataset_path, orient="records", indent=2)
            return
        raise ValueError("Unsupported dataset format for writing")

    def _serialize_dataframe_bytes(self, df: pd.DataFrame, extension: str) -> bytes:
        suffix = str(extension or "").lower()
        if suffix == ".csv":
            return df.to_csv(index=False).encode("utf-8")
        if suffix in {".xlsx", ".xls"}:
            buffer = BytesIO()
            df.to_excel(buffer, index=False)
            return buffer.getvalue()
        if suffix == ".json":
            return df.to_json(orient="records", indent=2).encode("utf-8")
        return df.to_csv(index=False).encode("utf-8")

    def _media_type_for_extension(self, extension: str) -> str:
        suffix = str(extension or "").lower()
        if suffix == ".csv":
            return "text/csv"
        if suffix in {".xlsx", ".xls"}:
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if suffix == ".json":
            return "application/json"
        return "application/octet-stream"

    def _set_job(self, job_id: str, **updates: Any) -> None:
        if job_id not in self.jobs:
            return
        self.jobs[job_id].update(updates)

    def _append_job_metric(self, job_id: str, entry: Dict[str, Any]) -> None:
        if job_id not in self.jobs:
            return
        if "metrics_history" not in self.jobs[job_id]:
            self.jobs[job_id]["metrics_history"] = []
        self.jobs[job_id]["metrics_history"].append(entry)

    def _save_json(self, path: Path, payload: Dict[str, Any]) -> None:
        with path.open("w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)

    def _extract_cyclical_base_values(self, df: pd.DataFrame, column: str, value_source: str) -> pd.Series:
        series = df[column]
        if value_source in {"hour_of_day", "day_of_week", "day_of_month", "month_of_year", "week_of_year"}:
            dt_series = pd.to_datetime(series, errors="coerce")
            if value_source == "hour_of_day":
                return dt_series.dt.hour.astype("float64")
            if value_source == "day_of_week":
                return dt_series.dt.dayofweek.astype("float64")
            if value_source == "day_of_month":
                return dt_series.dt.day.astype("float64")
            if value_source == "month_of_year":
                return dt_series.dt.month.astype("float64")
            return dt_series.dt.isocalendar().week.astype("float64")

        numeric = pd.to_numeric(series, errors="coerce")
        if value_source == "auto":
            # Prefer datetime-derived hour when numeric parse is mostly empty.
            numeric_ratio = float(numeric.notna().sum()) / max(1, len(numeric))
            if numeric_ratio < 0.5:
                dt_series = pd.to_datetime(series, errors="coerce")
                if dt_series.notna().any():
                    return dt_series.dt.hour.astype("float64")
            return numeric
        if value_source in {"raw", "auto_numeric"}:
            return numeric
        raise ValueError("Unsupported value_source for cyclical_encoding.")

    def _compute_outlier_bounds(
        self,
        series: pd.Series,
        method: str,
        factor: Any = 1.5,
        z_threshold: Any = 3.0,
    ) -> Tuple[float, float]:
        clean = series.dropna()
        if clean.empty:
            raise ValueError("Column does not have enough numeric values for outlier detection.")

        if method == "zscore":
            mean = float(clean.mean())
            std = float(clean.std())
            if std == 0 or pd.isna(std):
                raise ValueError("Column standard deviation is zero; z-score outlier detection is not applicable.")
            threshold = float(z_threshold)
            if threshold <= 0:
                raise ValueError("z_threshold must be greater than 0.")
            return mean - threshold * std, mean + threshold * std

        # Box-plot rule using IQR.
        q1 = clean.quantile(0.25)
        q3 = clean.quantile(0.75)
        if pd.isna(q1) or pd.isna(q3):
            raise ValueError("Column does not have enough numeric values for outlier detection.")
        iqr = q3 - q1
        if pd.isna(iqr):
            raise ValueError("Column does not have enough numeric values for outlier detection.")
        scale = float(factor)
        if scale <= 0:
            raise ValueError("factor must be greater than 0.")
        return float(q1 - scale * iqr), float(q3 + scale * iqr)

    def _normalize_unit(self, unit: Any) -> str:
        token = str(unit or "").strip().lower()
        token = token.replace("°", "")
        token = token.replace(" ", "")
        token = token.replace("-", "")
        token = token.replace("_", "")
        canonical = UNIT_ALIASES.get(token)
        if canonical:
            return canonical
        return str(unit or "").strip().lower().replace(" ", "_").replace("-", "_")

    def _resolve_unit_category(self, from_unit: str, to_unit: str, requested_category: str) -> str:
        if requested_category and requested_category not in {"", "auto"}:
            if requested_category == "temperature":
                valid = {"c", "f", "k"}
                if from_unit not in valid or to_unit not in valid:
                    raise ValueError("Temperature conversions support only C, F, and K.")
                return "temperature"
            factor_map = UNIT_CONVERSION_FACTORS.get(requested_category)
            if not factor_map:
                raise ValueError("Unsupported unit category.")
            if from_unit not in factor_map or to_unit not in factor_map:
                raise ValueError(f"Units do not belong to category '{requested_category}'.")
            return requested_category

        if from_unit in {"c", "f", "k"} and to_unit in {"c", "f", "k"}:
            return "temperature"
        for category, factor_map in UNIT_CONVERSION_FACTORS.items():
            if from_unit in factor_map and to_unit in factor_map:
                return category
        raise ValueError("Unable to infer unit category. Provide a valid category and compatible units.")

    def _convert_temperature(self, series: pd.Series, from_unit: str, to_unit: str) -> pd.Series:
        if from_unit == to_unit:
            return series.copy(deep=True)
        if from_unit == "c":
            celsius = series
        elif from_unit == "f":
            celsius = (series - 32.0) * (5.0 / 9.0)
        elif from_unit == "k":
            celsius = series - 273.15
        else:
            raise ValueError("Unsupported source temperature unit.")

        if to_unit == "c":
            return celsius
        if to_unit == "f":
            return (celsius * (9.0 / 5.0)) + 32.0
        if to_unit == "k":
            return celsius + 273.15
        raise ValueError("Unsupported target temperature unit.")

    def _convert_units_series(
        self,
        series: pd.Series,
        from_unit: Any,
        to_unit: Any,
        category: str = "auto",
    ) -> Tuple[pd.Series, str, str, str]:
        canonical_from = self._normalize_unit(from_unit)
        canonical_to = self._normalize_unit(to_unit)
        resolved_category = self._resolve_unit_category(
            from_unit=canonical_from,
            to_unit=canonical_to,
            requested_category=str(category or "auto").strip().lower(),
        )

        if resolved_category == "temperature":
            converted = self._convert_temperature(series=series, from_unit=canonical_from, to_unit=canonical_to)
            return converted, resolved_category, canonical_from, canonical_to

        factors = UNIT_CONVERSION_FACTORS.get(resolved_category, {})
        if canonical_from not in factors or canonical_to not in factors:
            raise ValueError("Incompatible units for selected category.")
        base = series * float(factors[canonical_from])
        converted = base / float(factors[canonical_to])
        return converted, resolved_category, canonical_from, canonical_to

    def _auto_bin_series(
        self,
        series: pd.Series,
        method: str,
        bins: int,
        params: Optional[Dict[str, Any]] = None,
        target_series: Optional[pd.Series] = None,
    ) -> Tuple[pd.Series, Dict[str, Any]]:
        cfg = params or {}
        output = pd.Series(pd.NA, index=series.index, dtype="object")
        clean = series.dropna()
        if clean.empty:
            return output, {"bin_count": 0, "method_resolved": method}

        if method in {"equal_frequency", "equal_freq", "quantile"}:
            result, edges = self._bin_equal_frequency(series=series, bins=bins)
            return result, {"bin_count": max(0, len(edges) - 1), "edges": edges, "method_resolved": "equal_frequency"}
        if method in {"equal_width", "width"}:
            result, edges = self._bin_equal_width(series=series, bins=bins)
            return result, {"bin_count": max(0, len(edges) - 1), "edges": edges, "method_resolved": "equal_width"}
        if method in {"kmeans", "k_means"}:
            result, edges = self._bin_kmeans(series=series, bins=bins)
            return result, {"bin_count": max(0, len(edges) - 1), "edges": edges, "method_resolved": "kmeans"}
        if method in {"jenks", "natural_breaks"}:
            result, edges = self._bin_jenks(series=series, bins=bins)
            return result, {"bin_count": max(0, len(edges) - 1), "edges": edges, "method_resolved": "jenks"}
        if method in {"decision_tree", "tree"}:
            result, edges = self._bin_decision_tree(series=series, target_series=target_series, bins=bins)
            return result, {"bin_count": max(0, len(edges) - 1), "edges": edges, "method_resolved": "decision_tree"}
        if method in {"chimerge", "chi_merge"}:
            chi2_threshold = float(cfg.get("chi2_threshold", 3.841))
            result, edges = self._bin_chimerge(
                series=series,
                target_series=target_series,
                max_bins=bins,
                chi2_threshold=chi2_threshold,
            )
            return result, {"bin_count": max(0, len(edges) - 1), "edges": edges, "chi2_threshold": chi2_threshold, "method_resolved": "chimerge"}
        if method in {"mdlp"}:
            result, edges = self._bin_mdlp(series=series, target_series=target_series, bins=bins)
            return result, {"bin_count": max(0, len(edges) - 1), "edges": edges, "method_resolved": "mdlp"}
        if method in {"domain_threshold", "domain", "thresholds"}:
            result, edges = self._bin_domain_threshold(
                series=series,
                thresholds_raw=cfg.get("thresholds"),
                labels_raw=cfg.get("labels"),
            )
            return result, {"bin_count": max(0, len(edges) - 1), "edges": edges, "method_resolved": "domain_threshold"}
        raise ValueError("Unsupported auto_binning method.")

    def _cut_with_edges(self, series: pd.Series, edges: List[float], labels: Optional[List[str]] = None) -> pd.Series:
        if len(edges) < 2:
            return pd.Series(pd.NA, index=series.index, dtype="object")
        unique_edges = sorted(set(float(e) for e in edges))
        if len(unique_edges) < 2:
            return pd.Series(pd.NA, index=series.index, dtype="object")
        if labels and len(labels) != len(unique_edges) - 1:
            labels = None
        out = pd.cut(
            series,
            bins=unique_edges,
            labels=labels,
            include_lowest=True,
            duplicates="drop",
        )
        return out.astype("string").astype("object")

    def _bin_equal_width(self, series: pd.Series, bins: int) -> Tuple[pd.Series, List[float]]:
        clean = series.dropna()
        min_v = float(clean.min())
        max_v = float(clean.max())
        if min_v == max_v:
            edges = [min_v - 0.5, max_v + 0.5]
            return self._cut_with_edges(series, edges), edges
        edges = np.linspace(min_v, max_v, num=bins + 1).tolist()
        edges[0] = min_v
        edges[-1] = max_v
        return self._cut_with_edges(series, edges), [float(v) for v in edges]

    def _bin_equal_frequency(self, series: pd.Series, bins: int) -> Tuple[pd.Series, List[float]]:
        clean = series.dropna()
        q = min(bins, int(clean.nunique()))
        if q < 2:
            return self._bin_equal_width(series, bins=2)
        _, edges = pd.qcut(clean, q=q, retbins=True, duplicates="drop")
        out = self._cut_with_edges(series, [float(v) for v in edges.tolist()])
        return out, [float(v) for v in edges.tolist()]

    def _bin_kmeans(self, series: pd.Series, bins: int) -> Tuple[pd.Series, List[float]]:
        clean = series.dropna()
        values = clean.to_numpy(dtype=float).reshape(-1, 1)
        k = max(2, min(bins, len(np.unique(values))))
        if k < 2:
            return self._bin_equal_width(series, bins=2)
        model = KMeans(n_clusters=k, random_state=42, n_init=10)
        model.fit(values)
        centers = sorted(float(c) for c in model.cluster_centers_.reshape(-1))
        boundaries = []
        for i in range(len(centers) - 1):
            boundaries.append((centers[i] + centers[i + 1]) / 2.0)
        edges = [float("-inf"), *boundaries, float("inf")]
        return self._cut_with_edges(series, edges), edges

    def _bin_jenks(self, series: pd.Series, bins: int) -> Tuple[pd.Series, List[float]]:
        clean = np.sort(series.dropna().to_numpy(dtype=float))
        n = len(clean)
        k = max(2, min(bins, n))
        if k < 2:
            return self._bin_equal_width(series, bins=2)
        lower = [[0] * (k + 1) for _ in range(n + 1)]
        var = [[float("inf")] * (k + 1) for _ in range(n + 1)]
        for i in range(1, k + 1):
            lower[1][i] = 1
            var[1][i] = 0.0
        for l in range(2, n + 1):
            s1 = s2 = w = 0.0
            for m in range(1, l + 1):
                idx = l - m + 1
                val = clean[idx - 1]
                s1 += val
                s2 += val * val
                w += 1
                v = s2 - (s1 * s1) / w
                if idx > 1:
                    for j in range(2, k + 1):
                        if var[l][j] >= (v + var[idx - 1][j - 1]):
                            lower[l][j] = idx
                            var[l][j] = v + var[idx - 1][j - 1]
            lower[l][1] = 1
            var[l][1] = v
        breaks = [0.0] * (k + 1)
        breaks[k] = clean[-1]
        breaks[0] = clean[0]
        count = k
        idx = n
        while count > 1:
            idxt = int(lower[idx][count] - 2)
            breaks[count - 1] = clean[max(0, idxt)]
            idx = int(lower[idx][count] - 1)
            count -= 1
        edges = [float(v) for v in breaks]
        if len(set(edges)) < 2:
            return self._bin_equal_width(series, bins=2)
        edges[0] = min(edges[0], float(clean[0]))
        edges[-1] = max(edges[-1], float(clean[-1]))
        return self._cut_with_edges(series, edges), edges

    def _bin_decision_tree(
        self,
        series: pd.Series,
        target_series: Optional[pd.Series],
        bins: int,
        criterion: Optional[str] = None,
    ) -> Tuple[pd.Series, List[float]]:
        if target_series is None:
            raise ValueError("target_column is required for decision_tree binning.")
        df = pd.DataFrame({"x": series, "y": target_series}).dropna(subset=["x", "y"])
        if df.empty:
            return pd.Series(pd.NA, index=series.index, dtype="object"), []
        x = df["x"].to_numpy(dtype=float).reshape(-1, 1)
        y = df["y"]
        is_classification = y.dtype == "object" or y.nunique(dropna=True) <= 20
        if is_classification:
            model = DecisionTreeClassifier(
                max_leaf_nodes=max(2, bins),
                random_state=42,
                criterion=criterion or "gini",
            )
            model.fit(x, y.astype("string"))
        else:
            y_num = pd.to_numeric(y, errors="coerce")
            valid = y_num.notna().to_numpy()
            x = x[valid]
            y_num = y_num[valid]
            if len(y_num) == 0:
                raise ValueError("target_column must contain valid values for decision_tree binning.")
            model = DecisionTreeRegressor(
                max_leaf_nodes=max(2, bins),
                random_state=42,
                criterion=criterion or "squared_error",
            )
            model.fit(x, y_num)
        thresholds = [float(t) for t in model.tree_.threshold if t != -2]
        if not thresholds:
            return self._bin_equal_width(series, bins=2)
        edges = [float("-inf"), *sorted(set(thresholds)), float("inf")]
        return self._cut_with_edges(series, edges), edges

    def _chi2_for_adjacent(self, left_counts: Dict[str, int], right_counts: Dict[str, int]) -> float:
        categories = sorted(set(left_counts.keys()) | set(right_counts.keys()))
        left_total = sum(left_counts.get(c, 0) for c in categories)
        right_total = sum(right_counts.get(c, 0) for c in categories)
        grand = left_total + right_total
        if grand == 0:
            return 0.0
        chi2 = 0.0
        for c in categories:
            obs_l = float(left_counts.get(c, 0))
            obs_r = float(right_counts.get(c, 0))
            col_total = obs_l + obs_r
            exp_l = (left_total * col_total) / grand if grand else 0.0
            exp_r = (right_total * col_total) / grand if grand else 0.0
            if exp_l > 0:
                chi2 += ((obs_l - exp_l) ** 2) / exp_l
            if exp_r > 0:
                chi2 += ((obs_r - exp_r) ** 2) / exp_r
        return chi2

    def _bin_chimerge(
        self,
        series: pd.Series,
        target_series: Optional[pd.Series],
        max_bins: int,
        chi2_threshold: float,
    ) -> Tuple[pd.Series, List[float]]:
        if target_series is None:
            raise ValueError("target_column is required for chimerge binning.")
        df = pd.DataFrame({"x": series, "y": target_series}).dropna(subset=["x", "y"])
        if df.empty:
            return pd.Series(pd.NA, index=series.index, dtype="object"), []
        x = df["x"].to_numpy(dtype=float)
        # Pre-bin numeric target for contingency table if needed.
        y = df["y"]
        if pd.api.types.is_numeric_dtype(y):
            y_num = pd.to_numeric(y, errors="coerce")
            y_bins = min(10, max(2, int(y_num.nunique(dropna=True))))
            y_cat = pd.qcut(y_num, q=y_bins, duplicates="drop").astype("string")
        else:
            y_cat = y.astype("string")
        pre_bins = min(50, max_bins * 5, max(2, int(pd.Series(x).nunique())))
        x_bucket = pd.qcut(x, q=pre_bins, duplicates="drop")
        grouped = pd.DataFrame({"bucket": x_bucket, "y": y_cat}).dropna(subset=["bucket"])
        intervals = []
        for bucket, part in grouped.groupby("bucket"):
            counts = part["y"].value_counts(dropna=False).to_dict()
            intervals.append({
                "left": float(bucket.left),
                "right": float(bucket.right),
                "counts": {str(k): int(v) for k, v in counts.items()},
            })
        intervals = sorted(intervals, key=lambda i: i["left"])
        if len(intervals) < 2:
            return self._bin_equal_width(series, bins=2)

        while len(intervals) > max_bins:
            best_idx = None
            best_chi2 = None
            for i in range(len(intervals) - 1):
                c2 = self._chi2_for_adjacent(intervals[i]["counts"], intervals[i + 1]["counts"])
                if best_chi2 is None or c2 < best_chi2:
                    best_chi2 = c2
                    best_idx = i
            if best_idx is None:
                break
            if best_chi2 is not None and best_chi2 > chi2_threshold and len(intervals) <= max_bins:
                break
            left = intervals[best_idx]
            right = intervals[best_idx + 1]
            merged_counts = dict(left["counts"])
            for k, v in right["counts"].items():
                merged_counts[k] = merged_counts.get(k, 0) + v
            intervals[best_idx] = {
                "left": left["left"],
                "right": right["right"],
                "counts": merged_counts,
            }
            del intervals[best_idx + 1]
            if len(intervals) <= 2:
                break

        edges = [float("-inf")] + [float(iv["right"]) for iv in intervals[:-1]] + [float("inf")]
        return self._cut_with_edges(series, edges), edges

    def _bin_mdlp(
        self,
        series: pd.Series,
        target_series: Optional[pd.Series],
        bins: int,
    ) -> Tuple[pd.Series, List[float]]:
        # Practical MDLP approximation via entropy-driven decision tree thresholds.
        if target_series is None:
            raise ValueError("target_column is required for mdlp binning.")
        target = target_series
        if pd.api.types.is_numeric_dtype(target):
            target_num = pd.to_numeric(target, errors="coerce")
            non_null = target_num.dropna()
            if non_null.empty:
                raise ValueError("target_column must contain valid values for mdlp binning.")
            q = min(10, max(2, int(non_null.nunique())))
            target = pd.qcut(target_num, q=q, duplicates="drop").astype("string")
        else:
            target = target.astype("string")
        return self._bin_decision_tree(series=series, target_series=target, bins=bins, criterion="entropy")

    def _bin_domain_threshold(
        self,
        series: pd.Series,
        thresholds_raw: Any,
        labels_raw: Any,
    ) -> Tuple[pd.Series, List[float]]:
        if thresholds_raw in (None, "", []):
            raise ValueError("thresholds is required for domain_threshold binning.")
        if isinstance(thresholds_raw, list):
            thresholds = [float(v) for v in thresholds_raw if str(v).strip() != ""]
        else:
            thresholds = [float(v.strip()) for v in str(thresholds_raw).split(",") if v.strip()]
        thresholds = sorted(set(thresholds))
        if not thresholds:
            raise ValueError("At least one valid threshold is required.")
        edges = [float("-inf"), *thresholds, float("inf")]
        labels: Optional[List[str]] = None
        if labels_raw not in (None, "", []):
            if isinstance(labels_raw, list):
                labels = [str(v).strip() for v in labels_raw if str(v).strip()]
            else:
                labels = [v.strip() for v in str(labels_raw).split(",") if v.strip()]
            if len(labels) != len(edges) - 1:
                raise ValueError("labels count must equal thresholds count + 1.")
        if labels is None:
            labels = [f"bin_{i+1}" for i in range(len(edges) - 1)]
        return self._cut_with_edges(series, edges, labels=labels), edges

    def _parse_int_list_param(self, raw: Any, default: Optional[List[int]] = None) -> List[int]:
        values: List[int] = []
        if isinstance(raw, list):
            for item in raw:
                try:
                    values.append(int(item))
                except Exception:
                    continue
        elif raw not in (None, ""):
            for token in str(raw).split(","):
                token = token.strip()
                if not token:
                    continue
                try:
                    values.append(int(token))
                except Exception:
                    continue
        if not values and default is not None:
            values = list(default)
        return sorted({v for v in values if v > 0})

    def _parse_str_list_param(self, raw: Any, default: Optional[List[str]] = None) -> List[str]:
        values: List[str] = []
        if isinstance(raw, list):
            values = [str(v).strip().lower() for v in raw if str(v).strip()]
        elif raw not in (None, ""):
            values = [token.strip().lower() for token in str(raw).split(",") if token.strip()]
        if not values and default is not None:
            values = [str(v).strip().lower() for v in default if str(v).strip()]
        return values

    def _parse_numeric_category_rules(
        self,
        rules: Any = None,
        rules_text: Any = None,
    ) -> List[Dict[str, Any]]:
        parsed: List[Dict[str, Any]] = []

        if isinstance(rules, list):
            for raw in rules:
                if not isinstance(raw, dict):
                    continue
                label = str(raw.get("label", "")).strip()
                if not label:
                    continue
                parsed.append(
                    {
                        "min": self._parse_bound_token(raw.get("min")),
                        "max": self._parse_bound_token(raw.get("max")),
                        "include_min": bool(raw.get("include_min", True)),
                        "include_max": bool(raw.get("include_max", True)),
                        "label": label,
                    }
                )

        text = str(rules_text or "").strip()
        if text:
            for line in text.splitlines():
                token = line.strip()
                if not token:
                    continue
                rule = self._parse_numeric_category_rule_line(token)
                if rule is not None:
                    parsed.append(rule)

        return parsed

    def _parse_bound_token(self, value: Any) -> Optional[float]:
        if value in (None, ""):
            return None
        token = str(value).strip().lower()
        if token in {"-inf", "-infinity"}:
            return float("-inf")
        if token in {"+inf", "inf", "infinity", "+infinity"}:
            return float("inf")
        return float(token)

    def _parse_numeric_category_rule_line(self, line: str) -> Optional[Dict[str, Any]]:
        # Supported examples:
        # 0-3:toddler
        # 4-10:child
        # <0:negative
        # >=65:senior
        parts = line.split(":", 1)
        if len(parts) != 2:
            return None
        lhs = parts[0].strip()
        label = parts[1].strip()
        if not lhs or not label:
            return None

        comp = re.match(r"^(<=|>=|<|>)\s*([+-]?\d+(?:\.\d+)?)$", lhs)
        if comp:
            op, num = comp.groups()
            value = float(num)
            if op == "<":
                return {"min": None, "max": value, "include_min": True, "include_max": False, "label": label}
            if op == "<=":
                return {"min": None, "max": value, "include_min": True, "include_max": True, "label": label}
            if op == ">":
                return {"min": value, "max": None, "include_min": False, "include_max": True, "label": label}
            return {"min": value, "max": None, "include_min": True, "include_max": True, "label": label}

        rng = re.match(
            r"^([+-]?\d+(?:\.\d+)?|[-+]?inf)\s*-\s*([+-]?\d+(?:\.\d+)?|[-+]?inf)$",
            lhs.lower(),
        )
        if rng:
            lo, hi = rng.groups()
            return {
                "min": self._parse_bound_token(lo),
                "max": self._parse_bound_token(hi),
                "include_min": True,
                "include_max": True,
                "label": label,
            }
        return None

    def _load_session_df(self, session_id: str) -> pd.DataFrame:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")
        snapshot_path = Path(session["snapshot_path"])
        if not snapshot_path.exists():
            raise ValueError("Prepare session snapshot not found.")
        return pd.read_pickle(snapshot_path)

    def _drop_duplicates_robust(
        self,
        df: pd.DataFrame,
        subset_cols: Optional[List[str]],
        params: Optional[Dict[str, Any]] = None,
    ) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        config = params or {}
        subset = subset_cols or [str(c) for c in df.columns.tolist()]
        if not subset:
            return df.copy(deep=True), {"dedup_removed_rows": 0, "dedup_scope": []}

        keep_raw = config.get("keep", "first")
        keep_token = str(keep_raw).strip().lower() if keep_raw is not None else "first"
        keep: Any = "first"
        if keep_token in {"first", "last"}:
            keep = keep_token
        elif keep_token in {"false", "none", "drop_all"} or keep_raw is False:
            keep = False

        def _as_bool(value: Any, default: bool) -> bool:
            if value is None:
                return default
            if isinstance(value, bool):
                return value
            if isinstance(value, (int, float)):
                return value != 0
            token = str(value).strip().lower()
            if token in {"true", "1", "yes", "y", "on"}:
                return True
            if token in {"false", "0", "no", "n", "off"}:
                return False
            return default

        case_sensitive = _as_bool(config.get("case_sensitive"), False)
        trim_whitespace = _as_bool(config.get("trim_whitespace"), True)
        collapse_whitespace = _as_bool(config.get("collapse_whitespace"), True)
        normalize_null_tokens = _as_bool(config.get("normalize_null_tokens"), True)

        def _canonical(value: Any) -> Any:
            if hasattr(value, "item"):
                try:
                    value = value.item()
                except Exception:
                    pass

            try:
                if pd.isna(value):
                    return None
            except Exception:
                pass

            if isinstance(value, str):
                text = value
                if trim_whitespace:
                    text = text.strip()
                if collapse_whitespace:
                    text = re.sub(r"\s+", " ", text)
                if not case_sensitive:
                    text = text.casefold()
                if normalize_null_tokens and text in {"", "null", "none", "na", "n/a", "nan"}:
                    return None
                return text

            if isinstance(value, pd.Timestamp):
                return value.isoformat()
            if isinstance(value, dt.datetime):
                return value.isoformat()
            if isinstance(value, dt.date):
                return value.isoformat()
            if isinstance(value, dt.time):
                return value.isoformat()
            if isinstance(value, np.datetime64):
                try:
                    return pd.Timestamp(value).isoformat()
                except Exception:
                    return str(value)
            if isinstance(value, np.ndarray):
                return tuple(_canonical(v) for v in value.tolist())
            if isinstance(value, list):
                return tuple(_canonical(v) for v in value)
            if isinstance(value, tuple):
                return tuple(_canonical(v) for v in value)
            if isinstance(value, set):
                normalized = [_canonical(v) for v in value]
                return tuple(sorted(normalized, key=lambda item: repr(item)))
            if isinstance(value, dict):
                normalized_items = []
                for k in sorted(value.keys(), key=lambda item: str(item)):
                    normalized_items.append((str(k), _canonical(value[k])))
                return tuple(normalized_items)
            return value

        keys: List[Tuple[Any, ...]] = []
        for row in df[subset].itertuples(index=False, name=None):
            keys.append(tuple(_canonical(value) for value in row))

        if keep == "last":
            seen: set = set()
            keep_mask_rev: List[bool] = []
            for key in reversed(keys):
                if key in seen:
                    keep_mask_rev.append(False)
                else:
                    seen.add(key)
                    keep_mask_rev.append(True)
            keep_mask = list(reversed(keep_mask_rev))
        elif keep is False:
            counts: Dict[Tuple[Any, ...], int] = {}
            for key in keys:
                counts[key] = counts.get(key, 0) + 1
            keep_mask = [counts.get(key, 0) == 1 for key in keys]
        else:
            seen = set()
            keep_mask = []
            for key in keys:
                if key in seen:
                    keep_mask.append(False)
                else:
                    seen.add(key)
                    keep_mask.append(True)

        out = df.loc[keep_mask].copy(deep=True)
        removed = int(len(df) - len(out))
        meta = {
            "dedup_removed_rows": removed,
            "dedup_scope": subset,
            "dedup_keep": keep if keep is not False else "none",
            "dedup_case_sensitive": case_sensitive,
        }
        return out, meta

    def _save_session_df(self, session_id: str, df: pd.DataFrame) -> None:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")
        snapshot_path = Path(session["snapshot_path"])
        df.to_pickle(snapshot_path)

    def _create_checkpoint_file(self, session_id: str, df: pd.DataFrame, label: str, kind: str) -> Dict[str, Any]:
        checkpoint_id = str(uuid.uuid4())
        checkpoint_path = self.prep_dir / f"{session_id}_{kind}_{checkpoint_id}.pkl"
        df.to_pickle(checkpoint_path)
        return {
            "checkpoint_id": checkpoint_id,
            "label": label,
            "kind": kind,
            "path": str(checkpoint_path),
            "created_at": pd.Timestamp.utcnow().isoformat(),
        }

    def _push_undo_delta(
        self,
        session_id: str,
        before_df: pd.DataFrame,
        after_df: pd.DataFrame,
        label: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        session = self.prep_sessions.get(session_id)
        if not session:
            return
        delta = self._build_dataframe_delta(before_df, after_df)
        if not delta:
            return
        self._append_operation_delta(session_id, delta=delta, label=label, details=details)

    def _append_operation_delta(
        self,
        session_id: str,
        delta: Dict[str, Any],
        label: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        session = self.prep_sessions.get(session_id)
        if not session:
            return
        operation_log = session.setdefault("operation_log", [])
        cursor = int(session.get("operation_cursor", len(operation_log)))

        if cursor < len(operation_log):
            # New operation after undo branch: discard forward log and dependent checkpoints.
            del operation_log[cursor:]
            session["checkpoints"] = [
                cp for cp in session.get("checkpoints", [])
                if int(cp.get("operation_index", 0)) <= cursor
            ]

        entry = {
            "type": "delta",
            "op_id": str(uuid.uuid4()),
            "label": label,
            "created_at": pd.Timestamp.utcnow().isoformat(),
            "delta": delta,
            "details": details or {},
        }
        operation_log.append(entry)
        session["operation_cursor"] = len(operation_log)
        self._create_operation_checkpoint_marker(
            session_id=session_id,
            operation_label=label,
            operation_details=details or {},
        )

        # Cap operation log depth to control memory; fold oldest operations into base snapshot.
        max_depth = 50
        if len(operation_log) > max_depth:
            fold_count = len(operation_log) - max_depth
            self._fold_operation_log_prefix(session_id, fold_count)
            operation_log[:] = operation_log[fold_count:]
            session["operation_cursor"] = max(0, int(session.get("operation_cursor", 0)) - fold_count)
            for cp in session.get("checkpoints", []):
                cp["operation_index"] = max(0, int(cp.get("operation_index", 0)) - fold_count)

    def _create_operation_checkpoint_marker(
        self,
        session_id: str,
        operation_label: str,
        operation_details: Optional[Dict[str, Any]] = None,
    ) -> None:
        session = self.prep_sessions.get(session_id)
        if not session:
            return
        serial = int(session.get("checkpoint_serial", 0)) + 1
        session["checkpoint_serial"] = serial
        checkpoint = {
            "checkpoint_id": str(uuid.uuid4()),
            "label": f"Checkpoint {serial}",
            "kind": "marker",
            "operation_index": int(session.get("operation_cursor", 0)),
            "operation_label": str(operation_label or "operation"),
            "operation_details": self._summarize_operation_details(operation_details or {}),
            "serial_no": serial,
            "created_at": pd.Timestamp.utcnow().isoformat(),
        }
        session.setdefault("checkpoints", []).append(checkpoint)

    def _summarize_operation_details(self, details: Dict[str, Any]) -> str:
        if not details:
            return "-"
        pairs: List[str] = []
        for key, value in details.items():
            if value in (None, "", [], {}):
                continue
            if isinstance(value, list):
                if len(value) > 5:
                    display = f"[{', '.join(str(v) for v in value[:5])}, +{len(value) - 5} more]"
                else:
                    display = f"[{', '.join(str(v) for v in value)}]"
            elif isinstance(value, dict):
                inner = []
                for k2, v2 in list(value.items())[:5]:
                    inner.append(f"{k2}={v2}")
                if len(value) > 5:
                    inner.append(f"+{len(value) - 5} more")
                display = "{" + ", ".join(inner) + "}"
            else:
                display = str(value)
            pairs.append(f"{key}={display}")
        if not pairs:
            return "-"
        return "; ".join(pairs)

    def _build_dataframe_delta(self, before_df: pd.DataFrame, after_df: pd.DataFrame) -> Optional[Dict[str, Any]]:
        before_columns = [str(c) for c in before_df.columns.tolist()]
        after_columns = [str(c) for c in after_df.columns.tolist()]
        before_rows = self._records_from_dataframe(before_df)
        after_rows = self._records_from_dataframe(after_df)
        before_len = len(before_rows)
        after_len = len(after_rows)

        before_map: Dict[str, Dict[str, Any]] = {}
        after_map: Dict[str, Dict[str, Any]] = {}
        max_len = max(before_len, after_len)
        for idx in range(max_len):
            b = before_rows[idx] if idx < before_len else None
            a = after_rows[idx] if idx < after_len else None
            if b != a:
                if b is not None:
                    before_map[str(idx)] = b
                if a is not None:
                    after_map[str(idx)] = a

        if not before_map and not after_map and before_columns == after_columns and before_len == after_len:
            return None

        return {
            "columns_before": before_columns,
            "columns_after": after_columns,
            "rows_before": before_len,
            "rows_after": after_len,
            "before_rows": before_map,
            "after_rows": after_map,
        }

    def _apply_delta(self, current_df: pd.DataFrame, delta: Dict[str, Any], direction: str) -> pd.DataFrame:
        is_undo = direction == "undo"
        target_columns = list(delta.get("columns_before" if is_undo else "columns_after", []))
        target_len = int(delta.get("rows_before" if is_undo else "rows_after", 0))
        row_map = delta.get("before_rows" if is_undo else "after_rows", {}) or {}

        current_rows = self._records_from_dataframe(current_df)
        rows_out: List[Dict[str, Any]] = [{col: None for col in target_columns} for _ in range(max(0, target_len))]

        overlap = min(len(current_rows), target_len)
        for idx in range(overlap):
            rows_out[idx] = {col: current_rows[idx].get(col) for col in target_columns}

        for idx_str, row_payload in row_map.items():
            idx = int(idx_str)
            if 0 <= idx < target_len:
                rows_out[idx] = {col: row_payload.get(col) for col in target_columns}

        return pd.DataFrame(rows_out, columns=target_columns)

    def _replay_session_to_cursor(self, session_id: str, cursor: int) -> pd.DataFrame:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")
        base_snapshot_path = Path(session.get("base_snapshot_path", ""))
        if not base_snapshot_path.exists():
            raise ValueError("Prepare base snapshot not found.")
        df = pd.read_pickle(base_snapshot_path)
        operation_log = session.get("operation_log", [])
        upto = max(0, min(int(cursor), len(operation_log)))
        for entry in operation_log[:upto]:
            if entry.get("type") != "delta":
                continue
            df = self._apply_delta(df, entry.get("delta", {}), direction="redo")
        return df

    def _fold_operation_log_prefix(self, session_id: str, count: int) -> None:
        session = self.prep_sessions.get(session_id)
        if not session:
            return
        operation_log = session.get("operation_log", [])
        if count <= 0 or count > len(operation_log):
            return
        base_snapshot_path = Path(session.get("base_snapshot_path", ""))
        if not base_snapshot_path.exists():
            return
        df = pd.read_pickle(base_snapshot_path)
        for entry in operation_log[:count]:
            if entry.get("type") != "delta":
                continue
            df = self._apply_delta(df, entry.get("delta", {}), direction="redo")
        df.to_pickle(base_snapshot_path)

    def _reset_prepare_history(self, session_id: str) -> None:
        session = self.prep_sessions.get(session_id)
        if not session:
            return
        current_df = self._load_session_df(session_id)
        base_snapshot_path = Path(session.get("base_snapshot_path", ""))
        if base_snapshot_path:
            current_df.to_pickle(base_snapshot_path)
        for cp in session.get("checkpoints", []):
            p = Path(cp.get("path", "")) if cp.get("path") else None
            if p and p.exists() and p.is_file():
                p.unlink()
        session["operation_log"] = []
        session["operation_cursor"] = 0
        session["checkpoints"] = []
        session["checkpoint_serial"] = 0

    def _extract_json_payload(self, text: str) -> Dict[str, Any]:
        raw = str(text or "").strip()
        if not raw:
            raise ValueError("LLM returned empty response.")
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass

        fenced = re.search(r"```json\s*(\{.*?\})\s*```", raw, flags=re.DOTALL | re.IGNORECASE)
        if fenced:
            candidate = fenced.group(1).strip()
            try:
                parsed = json.loads(candidate)
                if isinstance(parsed, dict):
                    return parsed
            except Exception:
                pass

        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            candidate = raw[start:end + 1]
            parsed = json.loads(candidate)
            if isinstance(parsed, dict):
                return parsed
        raise ValueError("Unable to parse JSON plan from LLM response.")

    def _extract_mentions(self, text: str) -> Dict[str, List[str]]:
        source = str(text or "")
        datasets = [token.strip() for token in re.findall(r"@([A-Za-z0-9_.\-]+)", source) if token.strip()]
        columns = [token.strip() for token in re.findall(r"#([A-Za-z0-9_.\-]+)", source) if token.strip()]
        return {"datasets": datasets, "columns": columns}

    def _build_column_resolution_hints(self, columns: List[str], limit: int = 120) -> List[Dict[str, Any]]:
        hints: List[Dict[str, Any]] = []
        for col in columns[: max(1, int(limit))]:
            name = str(col)
            compact = re.sub(r"[^a-z0-9]+", "", name.lower())
            spaced = re.sub(r"[_\-]+", " ", name.lower()).strip()
            hints.append(
                {
                    "name": name,
                    "lower": name.lower(),
                    "compact": compact,
                    "spaced": spaced,
                }
            )
        return hints

    def _build_dataset_schema_context(
        self,
        dataset_meta: Dict[str, Any],
        fallback_df: Optional[pd.DataFrame] = None,
        limit: int = 120,
    ) -> List[Dict[str, Any]]:
        raw_schema = dataset_meta.get("schema", [])
        context: List[Dict[str, Any]] = []
        if isinstance(raw_schema, list):
            for col in raw_schema:
                if not isinstance(col, dict):
                    continue
                name = str(col.get("name") or "").strip()
                if not name:
                    continue
                context.append(
                    {
                        "name": name,
                        "detected_dtype": str(col.get("detected_dtype") or ""),
                        "semantic_type": str(col.get("semantic_type") or ""),
                        "storage_name": str(col.get("storage_name") or ""),
                    }
                )
                if len(context) >= max(1, int(limit)):
                    break
        if context:
            return context

        if fallback_df is None:
            return []
        fallback: List[Dict[str, Any]] = []
        for name, dtype in fallback_df.dtypes.items():
            fallback.append(
                {
                    "name": str(name),
                    "detected_dtype": str(dtype),
                    "semantic_type": "",
                    "storage_name": "",
                }
            )
            if len(fallback) >= max(1, int(limit)):
                break
        return fallback

    def _normalize_dataset_ref_token(self, value: str) -> str:
        token = str(value or "").strip().lower()
        token = token.replace(" ", "_")
        token = re.sub(r"[^a-z0-9_.-]", "", token)
        return token

    def _resolve_dataset_ref(self, ref: str, all_datasets: List[Dict[str, Any]]) -> Optional[str]:
        token = self._normalize_dataset_ref_token(ref)
        if not token:
            return None
        for ds in all_datasets:
            dataset_id = str(ds.get("dataset_id") or "")
            if token == self._normalize_dataset_ref_token(dataset_id):
                return dataset_id
            name = str(ds.get("original_filename") or "")
            stem = Path(name).stem
            if token in {
                self._normalize_dataset_ref_token(name),
                self._normalize_dataset_ref_token(stem),
            }:
                return dataset_id
        return None

    def _normalize_copilot_plan(
        self,
        plan_payload: Dict[str, Any],
        all_datasets: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        steps_raw = plan_payload.get("steps", [])
        if not isinstance(steps_raw, list):
            steps_raw = []

        normalized_steps: List[Dict[str, Any]] = []
        for idx, step in enumerate(steps_raw):
            if not isinstance(step, dict):
                continue
            operation = str(step.get("operation") or step.get("op") or "").strip().lower()
            operation = PREP_COPILOT_OPERATION_ALIASES.get(operation, operation)
            params = step.get("params")
            if not isinstance(params, dict):
                params = step.get("arguments") if isinstance(step.get("arguments"), dict) else {}
            normalized_params: Dict[str, Any] = {}
            for key, value in params.items():
                if isinstance(value, str) and value.startswith("#"):
                    normalized_params[str(key)] = value[1:]
                elif isinstance(value, list):
                    normalized_params[str(key)] = [
                        (item[1:] if isinstance(item, str) and item.startswith("#") else item)
                        for item in value
                    ]
                else:
                    normalized_params[str(key)] = value

            if operation == "merge_datasets":
                source_ref = normalized_params.get("source_dataset_ref")
                if source_ref and not normalized_params.get("source_dataset_id"):
                    resolved = self._resolve_dataset_ref(str(source_ref), all_datasets)
                    if resolved:
                        normalized_params["source_dataset_id"] = resolved

                refs = normalized_params.get("source_dataset_refs")
                if isinstance(refs, list) and not normalized_params.get("source_dataset_ids"):
                    resolved_ids = []
                    for item in refs:
                        resolved = self._resolve_dataset_ref(str(item), all_datasets)
                        if resolved:
                            resolved_ids.append(resolved)
                    if resolved_ids:
                        normalized_params["source_dataset_ids"] = resolved_ids

            normalized_steps.append(
                {
                    "index": idx + 1,
                    "operation": operation,
                    "params": normalized_params,
                    "description": str(step.get("description") or "").strip(),
                }
            )

        return {
            "name": str(plan_payload.get("name") or "Generated Prep Plan").strip(),
            "steps": normalized_steps,
        }

    def _validate_copilot_plan(self, session_id: str, plan: Dict[str, Any]) -> List[str]:
        session = self.prep_sessions.get(session_id)
        if not session:
            return ["Prepare session not found."]
        errors: List[str] = []
        steps = plan.get("steps", [])
        if not isinstance(steps, list) or not steps:
            return ["Plan must include at least one step."]

        df = self._load_session_df(session_id)
        active_columns = {str(c) for c in df.columns}
        all_datasets = self.list_datasets()

        for idx, step in enumerate(steps, start=1):
            op = str(step.get("operation") or "").strip().lower()
            params = step.get("params") if isinstance(step.get("params"), dict) else {}
            if not op:
                errors.append(f"Step {idx}: operation is required.")
                continue
            if op not in PREP_COPILOT_SUPPORTED_OPERATIONS:
                errors.append(f"Step {idx}: unsupported operation '{op}'.")
                continue
            op_catalog = PREP_COPILOT_OPERATION_CATALOG.get(op, {})
            required_params = op_catalog.get("required_params", [])
            if isinstance(required_params, list):
                for param_name in required_params:
                    value = params.get(param_name)
                    if value is None or (isinstance(value, str) and not value.strip()):
                        if op == "merge_datasets" and param_name == "mode":
                            continue
                        errors.append(f"Step {idx}: missing required param '{param_name}' for operation '{op}'.")

            single_column_keys = ["column", "left_column", "right_column", "reference_column", "target_column"]
            for key in single_column_keys:
                value = params.get(key)
                if isinstance(value, str) and value.strip() and value not in active_columns:
                    if op == "merge_datasets" and key == "target_column":
                        continue
                    errors.append(f"Step {idx}: column '{value}' for '{key}' not found in active dataset.")

            list_column_keys = ["subset", "columns", "group_by", "left_keys"]
            for key in list_column_keys:
                value = params.get(key)
                if isinstance(value, list):
                    for col in value:
                        if isinstance(col, str) and col.strip() and col not in active_columns:
                            if key == "columns" and op in {"delete_columns", "merge_columns"}:
                                continue
                            errors.append(f"Step {idx}: column '{col}' in '{key}' not found in active dataset.")

            if op == "merge_datasets":
                mode = str(params.get("mode") or "append").strip().lower()
                if mode not in {"append", "join_on_keys"}:
                    errors.append(f"Step {idx}: merge_datasets mode must be append or join_on_keys.")
                    continue
                if mode == "append":
                    source_ids = params.get("source_dataset_ids")
                    fallback_id = params.get("source_dataset_id")
                    flat_ids: List[str] = []
                    if isinstance(source_ids, list):
                        flat_ids.extend([str(v).strip() for v in source_ids if str(v).strip()])
                    if str(fallback_id or "").strip():
                        flat_ids.append(str(fallback_id).strip())
                    if not flat_ids:
                        errors.append(f"Step {idx}: source_dataset_ids is required for append mode.")
                    else:
                        known = {str(d.get("dataset_id") or "") for d in all_datasets}
                        for source_dataset_id in flat_ids:
                            if source_dataset_id not in known:
                                errors.append(f"Step {idx}: unknown source dataset '{source_dataset_id}'.")
                else:
                    source_dataset_id = str(params.get("source_dataset_id") or "").strip()
                    if not source_dataset_id:
                        errors.append(f"Step {idx}: source_dataset_id is required for join_on_keys mode.")
                    source_meta = self.get_dataset_by_id(source_dataset_id) if source_dataset_id else None
                    source_columns = set()
                    if source_meta:
                        source_df = self._load_dataset_dataframe(source_meta)
                        source_columns = {str(c) for c in source_df.columns}
                    elif source_dataset_id:
                        errors.append(f"Step {idx}: unknown source dataset '{source_dataset_id}'.")
                    right_keys = params.get("right_keys")
                    if isinstance(right_keys, list):
                        for col in right_keys:
                            if isinstance(col, str) and col.strip() and source_columns and col not in source_columns:
                                errors.append(f"Step {idx}: right key '{col}' not found in source dataset.")

        return errors

    def _resolve_active_column_name(self, raw_value: Any, columns: List[str]) -> Optional[str]:
        token = str(raw_value or "").strip()
        if not token:
            return None
        if token in columns:
            return token

        lower_map: Dict[str, str] = {}
        compact_map: Dict[str, str] = {}
        for col in columns:
            col_key = str(col)
            lower_map.setdefault(col_key.lower(), col_key)
            compact_key = re.sub(r"[^a-z0-9]+", "", col_key.lower())
            if compact_key:
                compact_map.setdefault(compact_key, col_key)

        lowered = token.lower()
        if lowered in lower_map:
            return lower_map[lowered]
        compacted = re.sub(r"[^a-z0-9]+", "", lowered)
        if compacted and compacted in compact_map:
            return compact_map[compacted]
        return None

    def _match_columns_in_text(self, text: str, columns: List[str]) -> List[str]:
        source = str(text or "").lower()
        if not source:
            return []
        matches: List[str] = []
        seen: set = set()
        for col in columns:
            c = str(col)
            lowered = c.lower()
            patterns = [lowered]
            spaced = lowered.replace("_", " ").replace("-", " ")
            if spaced != lowered:
                patterns.append(spaced)
            found = False
            for token in patterns:
                if not token:
                    continue
                pattern = rf"(?<![a-z0-9_]){re.escape(token)}(?![a-z0-9_])"
                if re.search(pattern, source):
                    found = True
                    break
            if found and c not in seen:
                seen.add(c)
                matches.append(c)
        return matches

    def _infer_normalize_case_from_text(self, text: str) -> Optional[str]:
        source = str(text or "").strip().lower()
        if not source:
            return None
        if any(token in source for token in ["upper case", "uppercase", "to upper", "to uppercase"]):
            return "upper"
        if any(token in source for token in ["title case", "capitalize", "capitalise"]):
            return "title"
        if any(token in source for token in ["lower case", "lowercase", "to lower", "to lowercase"]):
            return "lower"
        return None

    def _enrich_copilot_plan_columns(
        self,
        session_id: str,
        plan: Dict[str, Any],
        instruction: Optional[str] = None,
    ) -> Dict[str, Any]:
        session = self.prep_sessions.get(session_id)
        if not session:
            return plan
        df = self._load_session_df(session_id)
        active_columns = [str(c) for c in df.columns]
        if not active_columns:
            return plan

        mentions = self._extract_mentions(str(instruction or ""))
        mentioned_columns: List[str] = []
        for token in mentions.get("columns", []):
            resolved = self._resolve_active_column_name(token, active_columns)
            if resolved and resolved not in mentioned_columns:
                mentioned_columns.append(resolved)

        steps = plan.get("steps", [])
        if not isinstance(steps, list):
            return plan

        single_column_keys = ["column", "left_column", "right_column", "reference_column", "target_column"]
        list_column_keys = ["subset", "columns", "group_by", "left_keys"]

        for step in steps:
            if not isinstance(step, dict):
                continue
            op = str(step.get("operation") or "").strip().lower()
            params = step.get("params")
            if not isinstance(params, dict):
                params = {}
                step["params"] = params

            for key in single_column_keys:
                value = params.get(key)
                if isinstance(value, str) and value.strip():
                    resolved = self._resolve_active_column_name(value, active_columns)
                    if resolved:
                        params[key] = resolved

            for key in list_column_keys:
                value = params.get(key)
                if isinstance(value, list):
                    next_values = []
                    for item in value:
                        if isinstance(item, str) and item.strip():
                            resolved = self._resolve_active_column_name(item, active_columns)
                            next_values.append(resolved or item)
                        else:
                            next_values.append(item)
                    params[key] = next_values

            op_catalog = PREP_COPILOT_OPERATION_CATALOG.get(op, {})
            required = op_catalog.get("required_params", [])
            requires_column = isinstance(required, list) and "column" in required
            has_column = bool(isinstance(params.get("column"), str) and str(params.get("column")).strip())
            if not requires_column or has_column:
                continue

            if len(mentioned_columns) == 1:
                params["column"] = mentioned_columns[0]
                continue

            text_basis = " ".join([
                str(instruction or ""),
                str(step.get("description") or ""),
            ]).strip()
            matched = self._match_columns_in_text(text_basis, active_columns)
            if len(matched) == 1:
                params["column"] = matched[0]

            if op == "normalize_text_case":
                raw_case = str(params.get("case") or "").strip().lower()
                if raw_case not in {"lower", "upper", "title"}:
                    inferred_case = self._infer_normalize_case_from_text(text_basis)
                    if inferred_case:
                        params["case"] = inferred_case

        return plan

    def get_prepare_operation_catalog(self) -> Dict[str, Any]:
        operations = []
        for op in sorted(PREP_COPILOT_SUPPORTED_OPERATIONS):
            op_data = PREP_COPILOT_OPERATION_CATALOG.get(op, {})
            operations.append(
                {
                    "operation": op,
                    "description": str(op_data.get("description") or f"Apply `{op}`."),
                    "required_params": op_data.get("required_params", []),
                    "optional_params": op_data.get("optional_params", []),
                    "notes": str(op_data.get("notes") or ""),
                }
            )
        aliases = [
            {"alias": alias, "operation": mapped}
            for alias, mapped in sorted(PREP_COPILOT_OPERATION_ALIASES.items())
        ]
        return {"operations": operations, "aliases": aliases}

    def _create_prepare_session_from_dataframe(
        self,
        dataset_id: str,
        dataset_name: str,
        source_path: str,
        source_folder: str,
        df: pd.DataFrame,
    ) -> str:
        session_id = str(uuid.uuid4())
        snapshot_path = self.prep_dir / f"{session_id}.pkl"
        base_snapshot_path = self.prep_dir / f"{session_id}_base.pkl"
        df.to_pickle(snapshot_path)
        df.to_pickle(base_snapshot_path)
        self.prep_sessions[session_id] = {
            "session_id": session_id,
            "dataset_id": dataset_id,
            "dataset_name": dataset_name,
            "source_path": str(source_path),
            "source_folder": source_folder or self.default_folder,
            "snapshot_path": str(snapshot_path),
            "base_snapshot_path": str(base_snapshot_path),
            "operation_log": [],
            "operation_cursor": 0,
            "checkpoints": [],
            "checkpoint_serial": 0,
        }
        return session_id

    def _delete_prepare_session(self, session_id: str) -> None:
        session = self.prep_sessions.pop(session_id, None)
        if not session:
            return
        for key in ["snapshot_path", "base_snapshot_path"]:
            p = Path(str(session.get(key, "")))
            if p.exists() and p.is_file():
                p.unlink()

    async def generate_prepare_copilot_plan(
        self,
        session_id: str,
        instruction: str,
        feedback: Optional[str] = None,
        current_plan: Optional[Dict[str, Any]] = None,
        execution_error: Optional[str] = None,
    ) -> Dict[str, Any]:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")
        if not str(instruction or "").strip():
            raise ValueError("instruction is required.")

        active_df = self._load_session_df(session_id)
        all_datasets = self.list_datasets()
        mentions = self._extract_mentions(instruction)
        mentioned_dataset_ids: List[str] = []
        for token in mentions["datasets"]:
            resolved = self._resolve_dataset_ref(token, all_datasets)
            if resolved and resolved not in mentioned_dataset_ids:
                mentioned_dataset_ids.append(resolved)

        active_dataset_meta = self.get_dataset_by_id(session["dataset_id"]) or {}
        active_schema_context = self._build_dataset_schema_context(
            dataset_meta=active_dataset_meta,
            fallback_df=active_df,
            limit=140,
        )
        active_column_names = [str(c.get("name") or "") for c in active_schema_context if str(c.get("name") or "").strip()]
        if not active_column_names:
            active_column_names = [str(c) for c in active_df.columns]
        active_dataset_context = {
            "dataset_id": str(session.get("dataset_id") or ""),
            "dataset_name": str(session.get("dataset_name") or ""),
            "row_count": int(len(active_df)),
            "columns": active_column_names[:140],
            "schema": active_schema_context,
            "column_resolution_hints": self._build_column_resolution_hints(active_column_names, limit=140),
        }
        dataset_context: List[Dict[str, Any]] = []
        for dataset_id in mentioned_dataset_ids[:8]:
            ds = self.get_dataset_by_id(dataset_id)
            if not ds:
                continue
            schema_context = self._build_dataset_schema_context(dataset_meta=ds, fallback_df=None, limit=120)
            dataset_context.append(
                {
                    "dataset_id": dataset_id,
                    "name": ds.get("original_filename"),
                    "columns": [str(col.get("name") or "") for col in schema_context if str(col.get("name") or "").strip()][:120],
                    "schema": schema_context,
                    "column_resolution_hints": self._build_column_resolution_hints(
                        [str(col.get("name") or "") for col in schema_context if str(col.get("name") or "").strip()],
                        limit=120,
                    ),
                }
            )

        operation_catalog = self.get_prepare_operation_catalog()

        prompt_payload = {
            "instruction": instruction,
            "feedback": feedback or "",
            "execution_error": execution_error or "",
            "current_plan": current_plan or {},
            "active_dataset": active_dataset_context,
            "referenced_datasets": dataset_context,
            "dataset_mentions": mentions["datasets"],
            "column_mentions": mentions["columns"],
            "supported_operations": sorted(list(PREP_COPILOT_SUPPORTED_OPERATIONS)),
            "operation_catalog": operation_catalog,
        }

        system_prompt = (
            "You convert dataset prep instructions into STRICT JSON. "
            "Return JSON only, no prose. "
            "Schema: {\"name\": string, \"steps\": [{\"operation\": string, \"description\": string, \"params\": object}]}. "
            "Use ONLY operations from supported_operations. "
            "Use operation_catalog for exact params and requirements. "
            "Use active_dataset.schema and referenced_datasets.schema to resolve exact column names and required params. "
            "Always fill required params for each step from operation_catalog. "
            "Column names in params must exactly match provided schema names. "
            "Prefer small clear steps. "
            "When user mentions @dataset or #column, map to source_dataset_id/source_dataset_ids and raw column names without #. "
            "Do not invent columns or datasets."
        )
        llm_response = await llm_service.generate(
            prompt=json.dumps(prompt_payload, default=str, ensure_ascii=True),
            system_prompt=system_prompt,
            temperature=0.1,
            max_tokens=1800,
        )
        parsed_payload = self._extract_json_payload(str(llm_response))
        normalized_plan = self._normalize_copilot_plan(parsed_payload, all_datasets=all_datasets)
        normalized_plan = self._enrich_copilot_plan_columns(
            session_id=session_id,
            plan=normalized_plan,
            instruction=instruction,
        )
        validation_errors = self._validate_copilot_plan(session_id=session_id, plan=normalized_plan)

        return {
            "session_id": session_id,
            "plan": normalized_plan,
            "mentions": mentions,
            "validation_errors": validation_errors,
            "resolved_dataset_ids": mentioned_dataset_ids,
            "active_dataset": {
                "dataset_id": active_dataset_meta.get("dataset_id", session.get("dataset_id")),
                "dataset_name": active_dataset_meta.get("original_filename", session.get("dataset_name")),
            },
        }

    def run_prepare_copilot_plan(
        self,
        session_id: str,
        plan: Dict[str, Any],
        dry_run: bool = True,
        sample_rows: int = 200,
    ) -> Dict[str, Any]:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")

        normalized_plan = self._normalize_copilot_plan(plan or {}, all_datasets=self.list_datasets())
        normalized_plan = self._enrich_copilot_plan_columns(
            session_id=session_id,
            plan=normalized_plan,
        )
        validation_errors = self._validate_copilot_plan(session_id=session_id, plan=normalized_plan)
        if validation_errors:
            return {
                "session_id": session_id,
                "dry_run": bool(dry_run),
                "success": False,
                "plan": normalized_plan,
                "validation_errors": validation_errors,
                "steps": [],
                "error": "Plan validation failed.",
            }

        run_session_id = session_id
        created_temp_session = False
        if dry_run:
            source_df = self._load_session_df(session_id)
            sample_size = max(20, min(int(sample_rows or 200), 2000))
            sample_df = source_df.head(sample_size).copy(deep=True)
            run_session_id = self._create_prepare_session_from_dataframe(
                dataset_id=str(session.get("dataset_id") or ""),
                dataset_name=str(session.get("dataset_name") or ""),
                source_path=str(session.get("source_path") or ""),
                source_folder=str(session.get("source_folder") or self.default_folder),
                df=sample_df,
            )
            created_temp_session = True

        step_results: List[Dict[str, Any]] = []
        failed_step: Optional[Dict[str, Any]] = None
        try:
            for idx, step in enumerate(normalized_plan["steps"], start=1):
                op = str(step.get("operation") or "").strip().lower()
                params = step.get("params") if isinstance(step.get("params"), dict) else {}
                try:
                    op_result = self.apply_prepare_operation(
                        session_id=run_session_id,
                        operation=op,
                        params=params,
                    )
                    step_results.append(
                        {
                            "index": idx,
                            "operation": op,
                            "description": step.get("description"),
                            "params": params,
                            "status": "success",
                            "rows_before": op_result.get("rows_before"),
                            "rows_after": op_result.get("rows_after"),
                            "columns": op_result.get("columns"),
                        }
                    )
                except Exception as step_error:
                    failed_step = {
                        "index": idx,
                        "operation": op,
                        "description": step.get("description"),
                        "params": params,
                        "status": "failed",
                        "error": str(step_error),
                    }
                    break

            final_df = self._load_session_df(run_session_id)
            response: Dict[str, Any] = {
                "session_id": session_id,
                "dry_run": bool(dry_run),
                "success": failed_step is None,
                "plan": normalized_plan,
                "validation_errors": [],
                "steps": step_results + ([failed_step] if failed_step else []),
                "rows": int(len(final_df)),
                "columns": [str(c) for c in final_df.columns.tolist()],
                "preview_rows": self._serialize_rows(final_df.head(100), start_index=0),
            }
            if failed_step:
                response["error"] = failed_step.get("error")
                response["failed_step"] = failed_step
            return response
        finally:
            if created_temp_session:
                self._delete_prepare_session(run_session_id)

    def _load_prepare_plan_index(self) -> Dict[str, Any]:
        if self.prep_plan_index_path.exists():
            try:
                payload = json.loads(self.prep_plan_index_path.read_text(encoding="utf-8"))
                if isinstance(payload, dict) and isinstance(payload.get("plans"), list):
                    return payload
            except Exception:
                pass
        return {"plans": []}

    def _save_prepare_plan_index(self, payload: Dict[str, Any]) -> None:
        self.prep_plan_index_path.write_text(
            json.dumps(payload, ensure_ascii=True, indent=2, default=str),
            encoding="utf-8",
        )

    def save_prepare_copilot_plan(
        self,
        session_id: str,
        name: str,
        instruction: str,
        plan: Dict[str, Any],
        dry_run_result: Optional[Dict[str, Any]] = None,
        plan_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        session = self.prep_sessions.get(session_id)
        if not session:
            raise ValueError("Prepare session not found.")
        normalized_plan = self._normalize_copilot_plan(plan or {}, all_datasets=self.list_datasets())
        normalized_plan = self._enrich_copilot_plan_columns(
            session_id=session_id,
            plan=normalized_plan,
        )
        validation_errors = self._validate_copilot_plan(session_id=session_id, plan=normalized_plan)
        if validation_errors:
            raise ValueError("; ".join(validation_errors))

        index_payload = self._load_prepare_plan_index()
        plans = index_payload.get("plans", [])
        selected_plan_id = str(plan_id or "").strip() or str(uuid.uuid4())
        matching = next((p for p in plans if str(p.get("plan_id")) == selected_plan_id), None)
        version = int(matching.get("latest_version", 0)) + 1 if matching else 1

        plan_dir = self.prep_plans_dir / selected_plan_id
        plan_dir.mkdir(parents=True, exist_ok=True)
        version_payload = {
            "plan_id": selected_plan_id,
            "version": version,
            "name": str(name or normalized_plan.get("name") or "Prep Plan").strip() or "Prep Plan",
            "instruction": str(instruction or "").strip(),
            "dataset_id": str(session.get("dataset_id") or ""),
            "dataset_name": str(session.get("dataset_name") or ""),
            "session_id": str(session_id),
            "plan": normalized_plan,
            "dry_run_result": dry_run_result or {},
            "created_at": pd.Timestamp.utcnow().isoformat(),
            "status": "approved",
        }
        version_path = plan_dir / f"v{version}.json"
        version_path.write_text(
            json.dumps(version_payload, ensure_ascii=True, indent=2, default=str),
            encoding="utf-8",
        )

        if matching:
            matching["name"] = version_payload["name"]
            matching["dataset_id"] = version_payload["dataset_id"]
            matching["dataset_name"] = version_payload["dataset_name"]
            matching["latest_version"] = version
            matching["updated_at"] = version_payload["created_at"]
        else:
            plans.append(
                {
                    "plan_id": selected_plan_id,
                    "name": version_payload["name"],
                    "dataset_id": version_payload["dataset_id"],
                    "dataset_name": version_payload["dataset_name"],
                    "latest_version": version,
                    "created_at": version_payload["created_at"],
                    "updated_at": version_payload["created_at"],
                }
            )
        index_payload["plans"] = plans
        self._save_prepare_plan_index(index_payload)
        return {
            "plan_id": selected_plan_id,
            "version": version,
            "name": version_payload["name"],
            "dataset_id": version_payload["dataset_id"],
            "dataset_name": version_payload["dataset_name"],
            "created_at": version_payload["created_at"],
        }

    def list_prepare_copilot_plans(self, dataset_id: Optional[str] = None) -> List[Dict[str, Any]]:
        payload = self._load_prepare_plan_index()
        plans = payload.get("plans", [])
        if dataset_id:
            plans = [p for p in plans if str(p.get("dataset_id") or "") == str(dataset_id)]
        return sorted(plans, key=lambda item: str(item.get("updated_at") or ""), reverse=True)

    def get_prepare_copilot_plan(self, plan_id: str) -> Dict[str, Any]:
        selected_plan_id = str(plan_id or "").strip()
        if not selected_plan_id:
            raise ValueError("plan_id is required.")
        plan_dir = self.prep_plans_dir / selected_plan_id
        if not plan_dir.exists() or not plan_dir.is_dir():
            raise ValueError("Plan not found.")
        version_files = sorted(
            plan_dir.glob("v*.json"),
            key=lambda p: int(re.sub(r"[^0-9]", "", p.stem) or "0"),
        )
        versions: List[Dict[str, Any]] = []
        for file in version_files:
            try:
                payload = json.loads(file.read_text(encoding="utf-8"))
                if isinstance(payload, dict):
                    versions.append(payload)
            except Exception:
                continue
        if not versions:
            raise ValueError("Plan not found.")
        latest = versions[-1]
        return {
            "plan_id": selected_plan_id,
            "name": latest.get("name"),
            "dataset_id": latest.get("dataset_id"),
            "dataset_name": latest.get("dataset_name"),
            "latest_version": int(latest.get("version", len(versions))),
            "versions": versions,
        }

    def update_prepare_copilot_plan(
        self,
        plan_id: str,
        name: Optional[str] = None,
        instruction: Optional[str] = None,
    ) -> Dict[str, Any]:
        selected_plan_id = str(plan_id or "").strip()
        if not selected_plan_id:
            raise ValueError("plan_id is required.")
        next_name = str(name or "").strip()
        next_instruction = str(instruction or "").strip()
        if not next_name and not next_instruction:
            raise ValueError("At least one field (name or instruction) must be provided.")

        payload = self._load_prepare_plan_index()
        plans = payload.get("plans", [])
        matching = next((p for p in plans if str(p.get("plan_id")) == selected_plan_id), None)
        if not matching:
            raise ValueError("Plan not found.")

        plan_dir = self.prep_plans_dir / selected_plan_id
        if not plan_dir.exists() or not plan_dir.is_dir():
            raise ValueError("Plan not found.")

        version_files = sorted(
            plan_dir.glob("v*.json"),
            key=lambda p: int(re.sub(r"[^0-9]", "", p.stem) or "0"),
        )
        if not version_files:
            raise ValueError("Plan not found.")
        latest_file = version_files[-1]
        latest_payload = json.loads(latest_file.read_text(encoding="utf-8"))
        if not isinstance(latest_payload, dict):
            raise ValueError("Plan not found.")

        now = pd.Timestamp.utcnow().isoformat()
        if next_name:
            latest_payload["name"] = next_name
            matching["name"] = next_name
        if next_instruction:
            latest_payload["instruction"] = next_instruction
        latest_payload["updated_at"] = now
        matching["updated_at"] = now

        latest_file.write_text(
            json.dumps(latest_payload, ensure_ascii=True, indent=2, default=str),
            encoding="utf-8",
        )
        self._save_prepare_plan_index(payload)
        return {
            "plan_id": selected_plan_id,
            "name": str(latest_payload.get("name") or matching.get("name") or "Prep Plan"),
            "dataset_id": str(matching.get("dataset_id") or latest_payload.get("dataset_id") or ""),
            "dataset_name": str(matching.get("dataset_name") or latest_payload.get("dataset_name") or ""),
            "latest_version": int(matching.get("latest_version") or latest_payload.get("version") or 1),
            "updated_at": now,
        }

    def delete_prepare_copilot_plan(self, plan_id: str) -> Dict[str, Any]:
        selected_plan_id = str(plan_id or "").strip()
        if not selected_plan_id:
            raise ValueError("plan_id is required.")

        plan_dir = self.prep_plans_dir / selected_plan_id
        if not plan_dir.exists() or not plan_dir.is_dir():
            raise ValueError("Plan not found.")

        shutil.rmtree(plan_dir, ignore_errors=False)

        payload = self._load_prepare_plan_index()
        plans = payload.get("plans", [])
        payload["plans"] = [p for p in plans if str(p.get("plan_id")) != selected_plan_id]
        self._save_prepare_plan_index(payload)
        return {"plan_id": selected_plan_id, "deleted": True}

    def _serialize_rows(self, df: pd.DataFrame, start_index: int = 0) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        for local_idx, (_, row) in enumerate(df.iterrows()):
            row_dict: Dict[str, Any] = {"_row_index": start_index + local_idx}
            for col in df.columns:
                value = row[col]
                if pd.isna(value):
                    row_dict[str(col)] = None
                elif hasattr(value, "item"):
                    row_dict[str(col)] = value.item()
                else:
                    row_dict[str(col)] = value
            rows.append(row_dict)
        return rows

    # ---------------------------------------------------------------------------
    # Dashboard CRUD
    # ---------------------------------------------------------------------------

    def list_dashboards(self) -> List[Dict[str, Any]]:
        """List all dashboards for the default user."""
        dashboards = DashboardConfigTable.list_sync()
        return [
            {
                "id": str(d.get_config().get("id", str(d.id))),
                "name": d.name,
                "config": d.get_config(),
                "is_active": d.is_active,
                "created_on": d.created_on.isoformat() if d.created_on else None,
                "updated_on": d.updated_on.isoformat() if d.updated_on else None,
            }
            for d in dashboards
        ]

    def get_dashboard(self, dashboard_id: str) -> Dict[str, Any]:
        """Get a single dashboard by ID (supports both UUID and legacy string IDs)."""
        dashboard = DashboardConfigTable.get_sync_by_client_id(dashboard_id)
        if not dashboard:
            raise ValueError(f"Dashboard not found: {dashboard_id}")
        cfg = dashboard.get_config()
        return {
            "id": str(cfg.get("id", str(dashboard.id))),
            "name": dashboard.name,
            "config": cfg,
            "is_active": dashboard.is_active,
            "created_on": dashboard.created_on.isoformat() if dashboard.created_on else None,
            "updated_on": dashboard.updated_on.isoformat() if dashboard.updated_on else None,
        }

    def create_dashboard(self, name: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new dashboard."""
        existing = DashboardConfigTable.list_sync()
        is_active = len(existing) == 0  # first dashboard is active
        dashboard = DashboardConfigTable.create_sync(name=name, config=config, is_active=is_active)
        # Return the client's dashboard ID (from config) as the API id
        cfg = dashboard.get_config()
        return {
            "id": str(cfg.get("id", str(dashboard.id))),
            "name": dashboard.name,
            "config": cfg,
            "is_active": dashboard.is_active,
            "created_on": dashboard.created_on.isoformat() if dashboard.created_on else None,
            "updated_on": dashboard.updated_on.isoformat() if dashboard.updated_on else None,
        }

    def update_dashboard(
        self,
        dashboard_id: str,
        name: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        is_active: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Update an existing dashboard (supports both UUID and legacy string IDs)."""
        dashboard = DashboardConfigTable.update_sync_by_client_id(
            dashboard_id,
            name=name,
            config=config,
            is_active=is_active,
        )
        if not dashboard:
            raise ValueError(f"Dashboard not found: {dashboard_id}")
        cfg = dashboard.get_config()
        return {
            "id": str(cfg.get("id", str(dashboard.id))),
            "name": dashboard.name,
            "config": cfg,
            "is_active": dashboard.is_active,
            "created_on": dashboard.created_on.isoformat() if dashboard.created_on else None,
            "updated_on": dashboard.updated_on.isoformat() if dashboard.updated_on else None,
        }

    def delete_dashboard(self, dashboard_id: str) -> Dict[str, Any]:
        """Delete a dashboard (supports both UUID and legacy string IDs)."""
        dashboard = DashboardConfigTable.get_sync_by_client_id(dashboard_id)
        if not dashboard:
            raise ValueError(f"Dashboard not found: {dashboard_id}")
        DashboardConfigTable.delete_sync_by_client_id(dashboard_id)
        return {"id": dashboard_id, "deleted": True}

    def migrate_dashboards_from_local(self, dashboards: List[Dict[str, Any]], active_id: Optional[str]) -> List[Dict[str, Any]]:
        """Migrate dashboards from localStorage to DB. Returns migrated dashboards."""
        if not dashboards:
            return []
        migrated = []
        for i, dash in enumerate(dashboards):
            is_active = dash.get("id") == active_id if active_id else (i == 0)
            dashboard = DashboardConfigTable.create_sync(
                name=dash.get("title", f"Dashboard {i+1}"),
                config=dash,
                is_active=is_active,
            )
            migrated.append({
                "id": str(dashboard.get_config().get("id", str(dashboard.id))),
                "name": dashboard.name,
                "config": dashboard.get_config(),
                "is_active": dashboard.is_active,
                "created_on": dashboard.created_on.isoformat() if dashboard.created_on else None,
                "updated_on": dashboard.updated_on.isoformat() if dashboard.updated_on else None,
            })
        return migrated

    def _safe_float(self, value: Any) -> Optional[float]:
        try:
            if value is None or pd.isna(value):
                return None
            return float(value)
        except Exception:
            return None


prediction_service = PredictionService()
