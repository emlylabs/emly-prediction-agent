import json
import re
import uuid
from datetime import datetime, time
from typing import Any, Dict, List, Optional, Tuple

import peewee as pw

from app.database.db import DB


class PredictionFolder(pw.Model):
    id = pw.UUIDField(primary_key=True, default=uuid.uuid4)
    name = pw.CharField(null=False, max_length=255)
    normalized_name = pw.CharField(null=False, max_length=255)
    parent_id = pw.UUIDField(null=True)
    path = pw.TextField(null=False, unique=True)
    metadata_json = pw.TextField(null=True)
    created_on = pw.DateTimeField(default=datetime.utcnow)
    updated_on = pw.DateTimeField(default=datetime.utcnow)

    class Meta:
        database = DB
        table_name = "prediction_folders"
        indexes = (
            (("parent_id", "normalized_name"), True),
            (("created_on",), False),
        )


class PredictionDataset(pw.Model):
    id = pw.UUIDField(primary_key=True, default=uuid.uuid4)
    folder_id = pw.UUIDField(null=True)
    original_filename = pw.CharField(null=False, max_length=255)
    stored_filename = pw.CharField(null=False, max_length=255, unique=True)
    file_extension = pw.CharField(null=False, max_length=20)
    file_path = pw.TextField(null=False, unique=True)
    file_size = pw.BigIntegerField(null=True)
    mime_type = pw.CharField(null=True, max_length=255)
    file_hash = pw.CharField(null=True, max_length=64)
    rows = pw.IntegerField(default=0)
    columns_count = pw.IntegerField(default=0)
    data_table_name = pw.CharField(null=True, max_length=255, unique=True)
    data_table_version = pw.IntegerField(default=1)
    schema_json = pw.TextField(null=True)
    metadata_json = pw.TextField(null=True)
    created_on = pw.DateTimeField(default=datetime.utcnow)
    updated_on = pw.DateTimeField(default=datetime.utcnow)

    class Meta:
        database = DB
        table_name = "prediction_datasets"
        indexes = (
            (("folder_id", "created_on"), False),
            (("file_hash",), False),
            (("original_filename",), False),
            (("created_on",), False),
            (("data_table_name",), False),
        )


class PredictionDatasetRow(pw.Model):
    # Legacy fallback table. New datasets use per-dataset physical tables.
    id = pw.BigAutoField(primary_key=True)
    dataset_id = pw.UUIDField(null=False)
    row_index = pw.IntegerField(null=False)
    row_data_json = pw.TextField(null=False)
    created_on = pw.DateTimeField(default=datetime.utcnow)

    class Meta:
        database = DB
        table_name = "prediction_dataset_rows"
        indexes = (
            (("dataset_id", "row_index"), True),
            (("dataset_id",), False),
        )


class PredictionDataManager:
    def __init__(self) -> None:
        with DB.allow_sync():
            DB.create_tables([PredictionFolder, PredictionDataset, PredictionDatasetRow], safe=True)
        self.default_folder = self.ensure_root_folder("default")

    @staticmethod
    def _to_json(data: Optional[Dict[str, Any]]) -> Optional[str]:
        if data is None:
            return None
        return json.dumps(data)

    @staticmethod
    def _from_json(data: Optional[str], fallback: Any) -> Any:
        if not data:
            return fallback
        try:
            return json.loads(data)
        except Exception:
            return fallback

    @staticmethod
    def _folder_row(folder: PredictionFolder, file_count: int = 0) -> Dict[str, Any]:
        return {
            "id": str(folder.id),
            "name": folder.name,
            "normalized_name": folder.normalized_name,
            "parent_id": str(folder.parent_id) if folder.parent_id else None,
            "path": folder.path,
            "metadata": PredictionDataManager._from_json(folder.metadata_json, {}),
            "file_count": int(file_count),
            "created_on": folder.created_on.isoformat(),
            "updated_on": folder.updated_on.isoformat(),
        }

    @staticmethod
    def _quote_ident(identifier: str) -> str:
        if not re.fullmatch(r"[a-z_][a-z0-9_]*", identifier):
            raise ValueError(f"Invalid SQL identifier: {identifier}")
        return f'"{identifier}"'

    @staticmethod
    def _sanitize_column_name(name: str) -> str:
        cleaned = re.sub(r"[^a-zA-Z0-9_]", "_", str(name).strip().lower())
        cleaned = re.sub(r"_+", "_", cleaned).strip("_")
        if not cleaned:
            cleaned = "col"
        if cleaned[0].isdigit():
            cleaned = f"c_{cleaned}"
        return cleaned[:55]

    @staticmethod
    def _sql_type_from_dtype(dtype_value: str, semantic_type: str) -> str:
        dt = (dtype_value or "").lower()
        semantic = (semantic_type or "").lower()
        if semantic == "datetime" or "datetime" in dt:
            return "TIMESTAMP"
        if semantic == "time" or dt == "time":
            return "TIME"
        if semantic == "boolean" or "bool" in dt:
            return "BOOLEAN"
        if semantic == "integer" or any(token in dt for token in ["int", "int64", "int32"]):
            return "BIGINT"
        if semantic == "float" or any(token in dt for token in ["float", "double", "decimal"]):
            return "DOUBLE PRECISION"
        if semantic == "json" or dt == "json":
            return "JSONB"
        return "TEXT"

    @staticmethod
    def _coerce_bool(value: Any) -> Optional[bool]:
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

    @staticmethod
    def _coerce_time(value: Any) -> Optional[time]:
        if value is None:
            return None
        if isinstance(value, time):
            return value
        token = str(value).strip()
        if not token:
            return None
        patterns = ("%H:%M", "%H:%M:%S", "%I:%M %p", "%I:%M:%S %p")
        for pattern in patterns:
            try:
                return datetime.strptime(token, pattern).time()
            except Exception:
                continue
        return None

    @staticmethod
    def _coerce_datetime(value: Any) -> Optional[datetime]:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        token = str(value).strip()
        if not token:
            return None
        normalized = token.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except Exception:
            pass
        formats = (
            "%Y-%m-%d",
            "%Y/%m/%d",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%m/%d/%Y",
            "%m/%d/%Y %H:%M:%S",
            "%m/%d/%Y %H:%M",
        )
        for pattern in formats:
            try:
                return datetime.strptime(token, pattern)
            except Exception:
                continue
        return None

    def _coerce_value_for_schema(self, value: Any, col: Dict[str, Any]) -> Any:
        if value is None:
            return None
        try:
            if hasattr(value, "item"):
                value = value.item()
        except Exception:
            pass
        if isinstance(value, float):
            if value != value:  # NaN
                return None

        semantic = str(col.get("semantic_type", "")).lower()
        dtype = str(col.get("detected_dtype", "")).lower()

        if semantic == "boolean" or "bool" in dtype:
            return self._coerce_bool(value)
        if semantic == "integer" or any(token in dtype for token in ["int", "int64", "int32"]):
            try:
                return int(float(str(value).strip()))
            except Exception:
                return None
        if semantic == "float" or any(token in dtype for token in ["float", "double", "decimal"]):
            try:
                return float(str(value).strip())
            except Exception:
                return None
        if semantic == "datetime" or "datetime" in dtype:
            return self._coerce_datetime(value)
        if semantic == "time" or dtype == "time":
            return self._coerce_time(value)
        if semantic == "json" or dtype == "json":
            if isinstance(value, (dict, list)):
                return json.dumps(value)
            token = str(value).strip()
            if not token:
                return None
            try:
                parsed = json.loads(token)
                return json.dumps(parsed)
            except Exception:
                return None
        return str(value)

    @staticmethod
    def _table_name_for_dataset(dataset_id: str, version: int = 1) -> str:
        uid = dataset_id.replace("-", "").lower()
        return f"ds_{uid}_v{int(version)}"

    def _schema_with_storage_names(self, schema: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        output: List[Dict[str, Any]] = []
        used: set[str] = set()
        for idx, col in enumerate(schema):
            col_name = str(col.get("name", "")).strip() or f"column_{idx + 1}"
            suggested = str(col.get("storage_name", "")).strip().lower() or self._sanitize_column_name(col_name)
            storage_name = suggested
            seq = 1
            while storage_name in used or storage_name in {"_row_id", "_row_index"}:
                seq += 1
                storage_name = f"{suggested[:48]}_{seq}"
            used.add(storage_name)
            normalized = dict(col)
            normalized["name"] = col_name
            normalized["storage_name"] = storage_name
            normalized["detected_dtype"] = str(col.get("detected_dtype", "object"))
            normalized["semantic_type"] = str(col.get("semantic_type", "categorical"))
            output.append(normalized)
        return output

    @staticmethod
    def _schema_from_db_type(data_type: str, udt_name: str) -> Tuple[str, str]:
        token = (udt_name or data_type or "").lower()
        if token in {"bool"}:
            return "bool", "boolean"
        if token in {"int2", "int4", "int8", "smallint", "integer", "bigint"}:
            return "int64", "integer"
        if token in {"float4", "float8", "numeric", "decimal", "real", "double precision"}:
            return "float64", "float"
        if token in {"date", "time", "timetz", "timestamp", "timestamptz"}:
            return "datetime64[ns]", "datetime"
        if token in {"json", "jsonb"}:
            return "object", "json"
        return "object", "categorical"

    def _fetch_table_schemas(self, table_names: List[str]) -> Dict[str, List[Dict[str, Any]]]:
        unique_tables: List[str] = []
        seen: set[str] = set()
        for table_name in table_names:
            safe_name = str(table_name or "").strip()
            if not safe_name or safe_name in seen:
                continue
            # Reject unknown identifiers even for metadata queries.
            self._quote_ident(safe_name)
            seen.add(safe_name)
            unique_tables.append(safe_name)

        if not unique_tables:
            return {}

        sql = (
            "SELECT table_name, column_name, data_type, udt_name "
            "FROM information_schema.columns "
            "WHERE table_schema = 'public' "
            "AND table_name = ANY(%s::text[]) "
            "ORDER BY table_name ASC, ordinal_position ASC"
        )
        with DB.allow_sync():
            conn = DB.connection()
            with conn.cursor() as cursor:
                cursor.execute(sql, (unique_tables,))
                rows = cursor.fetchall()

        output: Dict[str, List[Dict[str, Any]]] = {}
        for table_name, column_name, data_type, udt_name in rows:
            col_name = str(column_name)
            if col_name == "_row_index":
                continue
            detected_dtype, semantic_type = self._schema_from_db_type(str(data_type), str(udt_name))
            output.setdefault(str(table_name), []).append(
                {
                    "name": col_name,
                    "storage_name": col_name,
                    "detected_dtype": detected_dtype,
                    "semantic_type": semantic_type,
                }
            )
        return output

    def _dataset_payload(
        self,
        dataset: PredictionDataset,
        folder_path: str,
        schema_override: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        schema_payload = self._from_json(dataset.schema_json, {"columns": []})
        schema_cols = schema_payload.get("columns", []) if isinstance(schema_payload, dict) else []
        if schema_override is not None:
            schema_cols = schema_override
        metadata_payload = self._from_json(dataset.metadata_json, {})
        columns = [str(col.get("name")) for col in schema_cols if col.get("name")]
        return {
            "dataset_id": str(dataset.id),
            "folder_id": str(dataset.folder_id) if dataset.folder_id else None,
            "folder": folder_path,
            "original_filename": dataset.original_filename,
            "stored_filename": dataset.stored_filename,
            "path": dataset.file_path,
            "file_extension": dataset.file_extension,
            "file_size": dataset.file_size,
            "mime_type": dataset.mime_type,
            "file_hash": dataset.file_hash,
            "rows": int(dataset.rows or 0),
            "columns_count": int(dataset.columns_count or len(schema_cols) or 0),
            "columns": columns,
            "schema": schema_cols,
            "metadata": metadata_payload,
            "data_table_name": dataset.data_table_name,
            "data_table_version": int(dataset.data_table_version or 1),
            "created_on": dataset.created_on.isoformat(),
            "updated_on": dataset.updated_on.isoformat(),
        }

    @staticmethod
    def _schema_signature(schema_cols: List[Dict[str, Any]]) -> List[Tuple[str, str, str, str]]:
        signature: List[Tuple[str, str, str, str]] = []
        for col in schema_cols:
            signature.append(
                (
                    str(col.get("name", "")),
                    str(col.get("storage_name", "")),
                    str(col.get("detected_dtype", "")),
                    str(col.get("semantic_type", "")),
                )
            )
        return signature

    def ensure_root_folder(self, name: str) -> Dict[str, Any]:
        now = datetime.utcnow()
        normalized_name = name.strip().lower()
        with DB.allow_sync():
            folder = (
                PredictionFolder.select()
                .where(
                    (PredictionFolder.parent_id.is_null(True))
                    & (PredictionFolder.normalized_name == normalized_name)
                )
                .first()
            )
            if not folder:
                folder = PredictionFolder.create(
                    name=name,
                    normalized_name=normalized_name,
                    parent_id=None,
                    path=normalized_name,
                    created_on=now,
                    updated_on=now,
                )
            count = PredictionDataset.select().where(PredictionDataset.folder_id == folder.id).count()
        return self._folder_row(folder, count)

    def get_folder_by_id(self, folder_id: str) -> Optional[Dict[str, Any]]:
        with DB.allow_sync():
            folder = PredictionFolder.select().where(PredictionFolder.id == folder_id).first()
            if not folder:
                return None
            count = PredictionDataset.select().where(PredictionDataset.folder_id == folder.id).count()
        return self._folder_row(folder, count)

    def get_folder_by_path(self, path: str) -> Optional[Dict[str, Any]]:
        with DB.allow_sync():
            folder = PredictionFolder.select().where(PredictionFolder.path == path).first()
            if not folder:
                return None
            count = PredictionDataset.select().where(PredictionDataset.folder_id == folder.id).count()
        return self._folder_row(folder, count)

    def list_folders(self) -> List[Dict[str, Any]]:
        output: List[Dict[str, Any]] = []
        with DB.allow_sync():
            folders = list(PredictionFolder.select().order_by(PredictionFolder.path.asc()))
            counts = {
                str(row.folder_id): int(row.total)
                for row in (
                    PredictionDataset
                    .select(PredictionDataset.folder_id, pw.fn.COUNT(PredictionDataset.id).alias("total"))
                    .group_by(PredictionDataset.folder_id)
                )
            }
        for folder in folders:
            output.append(self._folder_row(folder, counts.get(str(folder.id), 0)))
        return output

    def create_folder(
        self,
        name: str,
        normalized_name: str,
        parent_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        now = datetime.utcnow()
        with DB.allow_sync():
            parent_path = None
            if parent_id:
                parent = PredictionFolder.select().where(PredictionFolder.id == parent_id).first()
                if not parent:
                    raise ValueError("Parent folder not found.")
                parent_path = parent.path
            path = f"{parent_path}/{normalized_name}" if parent_path else normalized_name

            exists = (
                PredictionFolder.select()
                .where(
                    (PredictionFolder.parent_id == parent_id)
                    & (PredictionFolder.normalized_name == normalized_name)
                )
                .first()
            )
            if exists:
                raise ValueError("Folder already exists at this location.")

            folder = PredictionFolder.create(
                name=name,
                normalized_name=normalized_name,
                parent_id=parent_id,
                path=path,
                metadata_json=self._to_json(metadata),
                created_on=now,
                updated_on=now,
            )
        return self._folder_row(folder, 0)

    def list_folder_subtree(self, folder_id: str) -> List[Dict[str, Any]]:
        with DB.allow_sync():
            root = PredictionFolder.select().where(PredictionFolder.id == folder_id).first()
            if not root:
                return []
            prefix = f"{root.path}/"
            folders = list(
                PredictionFolder.select()
                .where(
                    (PredictionFolder.path == root.path)
                    | (PredictionFolder.path.startswith(prefix))
                )
                .order_by(PredictionFolder.path.asc())
            )
            counts = {
                str(row.folder_id): int(row.total)
                for row in (
                    PredictionDataset
                    .select(PredictionDataset.folder_id, pw.fn.COUNT(PredictionDataset.id).alias("total"))
                    .group_by(PredictionDataset.folder_id)
                )
            }
        return [self._folder_row(folder, counts.get(str(folder.id), 0)) for folder in folders]

    def delete_folders_by_ids(self, folder_ids: List[str]) -> int:
        normalized_ids = [str(folder_id) for folder_id in folder_ids if str(folder_id).strip()]
        if not normalized_ids:
            return 0
        with DB.allow_sync():
            return (
                PredictionFolder
                .delete()
                .where(PredictionFolder.id.in_(normalized_ids))
                .execute()
            )

    def rename_folder(
        self,
        folder_id: str,
        *,
        name: str,
        normalized_name: str,
    ) -> Optional[Dict[str, Any]]:
        now = datetime.utcnow()
        with DB.allow_sync():
            folder = PredictionFolder.select().where(PredictionFolder.id == folder_id).first()
            if not folder:
                return None

            parent_path = None
            if folder.parent_id:
                parent = PredictionFolder.select().where(PredictionFolder.id == folder.parent_id).first()
                if not parent:
                    raise ValueError("Parent folder not found.")
                parent_path = parent.path

            new_base_path = f"{parent_path}/{normalized_name}" if parent_path else normalized_name
            old_base_path = str(folder.path)

            existing = (
                PredictionFolder.select()
                .where(
                    (PredictionFolder.parent_id == folder.parent_id)
                    & (PredictionFolder.normalized_name == normalized_name)
                    & (PredictionFolder.id != folder.id)
                )
                .first()
            )
            if existing:
                raise ValueError("Folder already exists at this location.")

            subtree_prefix = f"{old_base_path}/"
            subtree = list(
                PredictionFolder.select()
                .where(
                    (PredictionFolder.path == old_base_path)
                    | (PredictionFolder.path.startswith(subtree_prefix))
                )
                .order_by(PredictionFolder.path.asc())
            )

            for node in subtree:
                node_path = str(node.path)
                suffix = node_path[len(old_base_path):] if node_path.startswith(old_base_path) else ""
                node.path = f"{new_base_path}{suffix}"
                if str(node.id) == str(folder.id):
                    node.name = name
                    node.normalized_name = normalized_name
                node.updated_on = now
                node.save()

        return self.get_folder_by_id(folder_id)

    def create_dataset(
        self,
        *,
        dataset_id: str,
        folder_id: Optional[str],
        original_filename: str,
        stored_filename: str,
        file_extension: str,
        file_path: str,
        file_size: Optional[int],
        mime_type: Optional[str],
        file_hash: Optional[str],
        rows: int,
        schema: List[Dict[str, Any]],
        metadata: Dict[str, Any],
    ) -> Dict[str, Any]:
        now = datetime.utcnow()
        normalized_schema = self._schema_with_storage_names(schema)
        with DB.allow_sync():
            dataset = PredictionDataset.create(
                id=dataset_id,
                folder_id=folder_id,
                original_filename=original_filename,
                stored_filename=stored_filename,
                file_extension=file_extension,
                file_path=file_path,
                file_size=file_size,
                mime_type=mime_type,
                file_hash=file_hash,
                rows=rows,
                columns_count=len(normalized_schema),
                data_table_name=None,
                data_table_version=1,
                schema_json=self._to_json({"columns": normalized_schema}),
                metadata_json=self._to_json(metadata),
                created_on=now,
                updated_on=now,
            )
            folder = PredictionFolder.select().where(PredictionFolder.id == folder_id).first() if folder_id else None
            folder_path = folder.path if folder else "default"
        return self._dataset_payload(dataset, folder_path)

    def _create_or_replace_dataset_table(
        self,
        dataset: PredictionDataset,
        schema_cols: List[Dict[str, Any]],
        bump_version: bool,
    ) -> Tuple[str, int]:
        current_version = int(dataset.data_table_version or 1)
        target_version = current_version + 1 if bump_version else current_version
        target_table = self._table_name_for_dataset(str(dataset.id), target_version)

        quoted_table = self._quote_ident(target_table)
        col_defs: List[str] = []
        for col in schema_cols:
            storage = self._quote_ident(str(col["storage_name"]))
            sql_type = self._sql_type_from_dtype(str(col.get("detected_dtype", "object")), str(col.get("semantic_type", "")))
            col_defs.append(f"{storage} {sql_type} NULL")

        with DB.allow_sync():
            DB.execute_sql(f"DROP TABLE IF EXISTS {quoted_table}")
            create_sql = (
                f"CREATE TABLE {quoted_table} ("
                "_row_id BIGSERIAL PRIMARY KEY, "
                "_row_index INTEGER NOT NULL, "
                + ", ".join(col_defs)
                + ")"
            )
            DB.execute_sql(create_sql)
            DB.execute_sql(f"CREATE INDEX IF NOT EXISTS {target_table}_row_idx ON {quoted_table} (_row_index)")
            DB.execute_sql(f"CREATE UNIQUE INDEX IF NOT EXISTS {target_table}_row_uq ON {quoted_table} (_row_index)")
        return target_table, target_version

    def _ensure_row_index_unique(self, table_name: str) -> None:
        quoted_table = self._quote_ident(table_name)
        unique_idx_name = f"{table_name}_row_uq"
        with DB.allow_sync():
            # Keep one row per index in legacy tables created before unique constraint existed.
            DB.execute_sql(
                f"DELETE FROM {quoted_table} t "
                f"USING {quoted_table} d "
                f"WHERE t._row_index = d._row_index AND t._row_id < d._row_id"
            )
            DB.execute_sql(
                f"CREATE UNIQUE INDEX IF NOT EXISTS {unique_idx_name} "
                f"ON {quoted_table} (_row_index)"
            )

    def replace_dataset_rows(
        self,
        dataset_id: str,
        rows: List[Dict[str, Any]],
        schema: Optional[List[Dict[str, Any]]] = None,
        bump_version: bool = False,
    ) -> int:
        with DB.allow_sync():
            dataset = PredictionDataset.select().where(PredictionDataset.id == dataset_id).first()
            if not dataset:
                raise ValueError("Dataset not found.")

            schema_payload = self._from_json(dataset.schema_json, {"columns": []})
            current_schema = schema_payload.get("columns", []) if isinstance(schema_payload, dict) else []
            schema_cols = self._schema_with_storage_names(schema or current_schema)

            table_name, table_version = self._create_or_replace_dataset_table(dataset, schema_cols, bump_version=bump_version)
            quoted_table = self._quote_ident(table_name)

            if rows:
                insert_columns = ["_row_index"] + [str(col["storage_name"]) for col in schema_cols]
                quoted_insert_columns = ", ".join(self._quote_ident(col) for col in insert_columns)
                placeholders = ", ".join(["%s"] * len(insert_columns))
                insert_sql = f"INSERT INTO {quoted_table} ({quoted_insert_columns}) VALUES ({placeholders})"

                conn = DB.connection()
                with conn.cursor() as cursor:
                    batch: List[Tuple[Any, ...]] = []
                    for idx, row in enumerate(rows):
                        values: List[Any] = [int(idx)]
                        for col in schema_cols:
                            raw_value = row.get(str(col["name"]))
                            values.append(self._coerce_value_for_schema(raw_value, col))
                        batch.append(tuple(values))
                        if len(batch) >= 1000:
                            cursor.executemany(insert_sql, batch)
                            batch = []
                    if batch:
                        cursor.executemany(insert_sql, batch)

            dataset.data_table_name = table_name
            dataset.data_table_version = table_version
            dataset.schema_json = self._to_json({"columns": schema_cols})
            dataset.columns_count = len(schema_cols)
            dataset.rows = len(rows)
            dataset.updated_on = datetime.utcnow()
            dataset.save()

            # keep legacy table clean for migrated datasets
            PredictionDatasetRow.delete().where(PredictionDatasetRow.dataset_id == dataset_id).execute()

        return len(rows)

    def upsert_dataset_rows_incremental(
        self,
        dataset_id: str,
        rows: List[Dict[str, Any]],
        schema: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        with DB.allow_sync():
            dataset = PredictionDataset.select().where(PredictionDataset.id == dataset_id).first()
            if not dataset:
                raise ValueError("Dataset not found.")

            schema_payload = self._from_json(dataset.schema_json, {"columns": []})
            current_schema = schema_payload.get("columns", []) if isinstance(schema_payload, dict) else []
            target_schema = self._schema_with_storage_names(schema or current_schema)

            # Schema change requires table rebuild.
            if self._schema_signature(target_schema) != self._schema_signature(current_schema):
                self.replace_dataset_rows(dataset_id=dataset_id, rows=rows, schema=target_schema, bump_version=True)
                return {
                    "rebuilt": True,
                    "upserted_rows": len(rows),
                    "deleted_rows": 0,
                    "total_rows": len(rows),
                }

            if not dataset.data_table_name:
                self.replace_dataset_rows(dataset_id=dataset_id, rows=rows, schema=target_schema, bump_version=False)
                return {
                    "rebuilt": True,
                    "upserted_rows": len(rows),
                    "deleted_rows": 0,
                    "total_rows": len(rows),
                }

            table_name = str(dataset.data_table_name)
            quoted_table = self._quote_ident(table_name)
            self._ensure_row_index_unique(table_name)
            storage_cols = [str(col["storage_name"]) for col in target_schema]
            projected = ["_row_index"] + storage_cols
            quoted_projected = ", ".join(self._quote_ident(c) for c in projected)

            conn = DB.connection()
            with conn.cursor() as cursor:
                cursor.execute(f"SELECT {quoted_projected} FROM {quoted_table} ORDER BY _row_index ASC")
                db_rows = cursor.fetchall()

            existing_by_index: Dict[int, Tuple[Any, ...]] = {
                int(row[0]): tuple(row[1:]) for row in db_rows
            }

            to_upsert: List[Tuple[Any, ...]] = []
            for idx, row in enumerate(rows):
                coerced_values: List[Any] = []
                for col in target_schema:
                    raw_value = row.get(str(col["name"]))
                    coerced_values.append(self._coerce_value_for_schema(raw_value, col))
                coerced_tuple = tuple(coerced_values)
                if existing_by_index.get(idx) != coerced_tuple:
                    to_upsert.append((idx, *coerced_tuple))

            new_index_set = set(range(len(rows)))
            existing_index_set = set(existing_by_index.keys())
            to_delete = sorted(existing_index_set - new_index_set)

            if to_upsert:
                insert_columns = ["_row_index"] + storage_cols
                quoted_insert_columns = ", ".join(self._quote_ident(c) for c in insert_columns)
                placeholders = ", ".join(["%s"] * len(insert_columns))
                updates = ", ".join(
                    f"{self._quote_ident(col)} = EXCLUDED.{self._quote_ident(col)}"
                    for col in storage_cols
                )
                upsert_sql = (
                    f"INSERT INTO {quoted_table} ({quoted_insert_columns}) VALUES ({placeholders}) "
                    f"ON CONFLICT (_row_index) DO UPDATE SET {updates}"
                )
                with conn.cursor() as cursor:
                    batch: List[Tuple[Any, ...]] = []
                    for record in to_upsert:
                        batch.append(record)
                        if len(batch) >= 1000:
                            cursor.executemany(upsert_sql, batch)
                            batch = []
                    if batch:
                        cursor.executemany(upsert_sql, batch)

            if to_delete:
                with conn.cursor() as cursor:
                    chunk_size = 1000
                    for i in range(0, len(to_delete), chunk_size):
                        chunk = to_delete[i:i + chunk_size]
                        placeholders = ", ".join(["%s"] * len(chunk))
                        delete_sql = f"DELETE FROM {quoted_table} WHERE _row_index IN ({placeholders})"
                        cursor.execute(delete_sql, tuple(chunk))

            dataset.rows = len(rows)
            dataset.columns_count = len(target_schema)
            dataset.schema_json = self._to_json({"columns": target_schema})
            dataset.updated_on = datetime.utcnow()
            dataset.save()

        return {
            "rebuilt": False,
            "upserted_rows": len(to_upsert),
            "deleted_rows": len(to_delete),
            "total_rows": len(rows),
        }

    def get_dataset_rows(self, dataset_id: str, limit: Optional[int] = None, offset: int = 0) -> List[Dict[str, Any]]:
        with DB.allow_sync():
            dataset = PredictionDataset.select().where(PredictionDataset.id == dataset_id).first()
            if not dataset:
                return []

            schema_payload = self._from_json(dataset.schema_json, {"columns": []})
            schema_cols = schema_payload.get("columns", []) if isinstance(schema_payload, dict) else []

            if dataset.data_table_name:
                table_name = str(dataset.data_table_name)
                quoted_table = self._quote_ident(table_name)
                projected_cols = ["_row_index"] + [str(c.get("storage_name")) for c in schema_cols if c.get("storage_name")]
                quoted_cols = ", ".join(self._quote_ident(c) for c in projected_cols)

                sql = f"SELECT {quoted_cols} FROM {quoted_table} ORDER BY _row_index ASC"
                params: List[Any] = []
                if limit is not None:
                    sql += " LIMIT %s OFFSET %s"
                    params.extend([max(1, int(limit)), max(0, int(offset))])
                elif offset:
                    sql += " OFFSET %s"
                    params.append(max(0, int(offset)))

                conn = DB.connection()
                with conn.cursor() as cursor:
                    cursor.execute(sql, tuple(params))
                    rows = cursor.fetchall()

                output: List[Dict[str, Any]] = []
                for db_row in rows:
                    row_dict: Dict[str, Any] = {}
                    for idx, col_meta in enumerate(schema_cols, start=1):
                        row_dict[str(col_meta.get("name"))] = db_row[idx]
                    output.append(row_dict)
                return output

            # fallback for old records if needed
            query = (
                PredictionDatasetRow.select()
                .where(PredictionDatasetRow.dataset_id == dataset_id)
                .order_by(PredictionDatasetRow.row_index.asc())
                .offset(max(0, int(offset)))
            )
            if limit is not None:
                query = query.limit(max(1, int(limit)))
            fallback_rows = list(query)

        output_fallback: List[Dict[str, Any]] = []
        for row in fallback_rows:
            try:
                output_fallback.append(json.loads(row.row_data_json))
            except Exception:
                output_fallback.append({})
        return output_fallback

    def get_dataset_by_id(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        with DB.allow_sync():
            dataset = PredictionDataset.select().where(PredictionDataset.id == dataset_id).first()
            if not dataset:
                return None
            folder = PredictionFolder.select().where(PredictionFolder.id == dataset.folder_id).first() if dataset.folder_id else None
            folder_path = folder.path if folder else "default"
        return self._dataset_payload(dataset, folder_path)

    def list_datasets(self) -> List[Dict[str, Any]]:
        output: List[Dict[str, Any]] = []
        with DB.allow_sync():
            datasets = list(PredictionDataset.select().order_by(PredictionDataset.created_on.desc()))
            folder_map = {str(f.id): f.path for f in PredictionFolder.select(PredictionFolder.id, PredictionFolder.path)}

        fallback_schema_tables: List[str] = []
        for dataset in datasets:
            schema_payload = self._from_json(dataset.schema_json, {"columns": []})
            schema_cols = schema_payload.get("columns", []) if isinstance(schema_payload, dict) else []
            if schema_cols:
                continue
            if dataset.data_table_name:
                fallback_schema_tables.append(str(dataset.data_table_name))

        schema_map = self._fetch_table_schemas(fallback_schema_tables)
        for dataset in datasets:
            folder_path = folder_map.get(str(dataset.folder_id), "default")
            schema_payload = self._from_json(dataset.schema_json, {"columns": []})
            schema_cols = schema_payload.get("columns", []) if isinstance(schema_payload, dict) else []
            schema_override = None
            if not schema_cols and dataset.data_table_name:
                schema_override = schema_map.get(str(dataset.data_table_name))
            output.append(self._dataset_payload(dataset, folder_path, schema_override=schema_override))
        return output

    def update_dataset(
        self,
        dataset_id: str,
        *,
        folder_id: Optional[str] = None,
        original_filename: Optional[str] = None,
        stored_filename: Optional[str] = None,
        file_extension: Optional[str] = None,
        file_path: Optional[str] = None,
        file_size: Optional[int] = None,
        mime_type: Optional[str] = None,
        rows: Optional[int] = None,
        schema: Optional[List[Dict[str, Any]]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        file_hash: Optional[str] = None,
        data_table_name: Optional[str] = None,
        data_table_version: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        with DB.allow_sync():
            dataset = PredictionDataset.select().where(PredictionDataset.id == dataset_id).first()
            if not dataset:
                return None
            if folder_id is not None:
                dataset.folder_id = folder_id
            if original_filename is not None:
                dataset.original_filename = original_filename
            if stored_filename is not None:
                dataset.stored_filename = stored_filename
            if file_extension is not None:
                dataset.file_extension = file_extension
            if file_path is not None:
                dataset.file_path = file_path
            if file_size is not None:
                dataset.file_size = int(file_size)
            if mime_type is not None:
                dataset.mime_type = mime_type
            if rows is not None:
                dataset.rows = rows
            if schema is not None:
                normalized_schema = self._schema_with_storage_names(schema)
                dataset.schema_json = self._to_json({"columns": normalized_schema})
                dataset.columns_count = len(normalized_schema)
            if metadata is not None:
                dataset.metadata_json = self._to_json(metadata)
            if file_hash is not None:
                dataset.file_hash = file_hash
            if data_table_name is not None:
                dataset.data_table_name = data_table_name
            if data_table_version is not None:
                dataset.data_table_version = int(data_table_version)
            dataset.updated_on = datetime.utcnow()
            dataset.save()
        return self.get_dataset_by_id(dataset_id)

    def delete_dataset(self, dataset_id: str) -> Optional[Dict[str, Any]]:
        dataset = self.get_dataset_by_id(dataset_id)
        if not dataset:
            return None

        table_name = dataset.get("data_table_name")
        if table_name:
            quoted_table = self._quote_ident(str(table_name))
            with DB.allow_sync():
                DB.execute_sql(f"DROP TABLE IF EXISTS {quoted_table}")

        with DB.allow_sync():
            PredictionDatasetRow.delete().where(PredictionDatasetRow.dataset_id == dataset_id).execute()
            PredictionDataset.delete().where(PredictionDataset.id == dataset_id).execute()
        return dataset


PredictionDataTable = PredictionDataManager()
