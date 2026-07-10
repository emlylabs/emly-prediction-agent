import re
import sqlite3
from typing import Any, Dict, Generator, List, Optional, Sequence, Union

from pydantic import BaseModel, Field, SecretStr, model_validator

from app.connectors.base import BaseConnector, ConnectorHealth, ConnectorType
from app.connectors.exceptions import (
    ConnectorConfigurationError,
    ConnectorConnectionError,
    ConnectorQueryError,
    ConnectorSecurityError,
)

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except Exception:  # pragma: no cover
    psycopg2 = None
    RealDictCursor = None

try:
    import pymysql
    from pymysql.cursors import DictCursor as PyMySQLDictCursor
except Exception:  # pragma: no cover
    pymysql = None
    PyMySQLDictCursor = None

try:
    import pyodbc
except Exception:  # pragma: no cover
    pyodbc = None

try:
    import oracledb
except Exception:  # pragma: no cover
    oracledb = None

_READ_QUERY_PATTERN = re.compile(r"^\s*(select|with|explain)\b", re.IGNORECASE)
_MUTATION_PATTERN = re.compile(
    r"\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|comment|merge|call|copy)\b",
    re.IGNORECASE,
)
_IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class SQLConnectorConfig(BaseModel):
    name: str
    driver: str = Field(description="Supported: 'postgresql', 'sqlite', 'mysql', 'mssql', 'oracle'")
    database: str = Field(description="Database name, service name, or sqlite file path")
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[SecretStr] = None
    connect_timeout_seconds: int = 10
    read_only: bool = True
    odbc_driver: str = "ODBC Driver 18 for SQL Server"
    trust_server_certificate: bool = True
    encrypt: bool = False
    mysql_ssl_mode: str = "disable"
    mysql_ssl_ca: Optional[str] = None
    mysql_ssl_cert: Optional[str] = None
    mysql_ssl_key: Optional[str] = None
    mysql_ssl_check_hostname: bool = False

    @model_validator(mode="after")
    def validate_driver_requirements(self):
        driver = self.driver.lower()
        supported = {"postgresql", "sqlite", "mysql", "mssql", "oracle"}
        if driver not in supported:
            raise ValueError(
                "Unsupported SQL driver. Supported values: 'postgresql', 'sqlite', 'mysql', 'mssql', 'oracle'."
            )

        if driver != "sqlite":
            missing = [
                field_name
                for field_name in ("host", "port", "username", "password")
                if getattr(self, field_name) in (None, "")
            ]
            if missing:
                raise ValueError(f"Missing required {driver} fields: {', '.join(missing)}")

        ssl_mode = str(self.mysql_ssl_mode or "disable").strip().lower()
        valid_ssl_modes = {"disable", "preferred", "required", "verify_ca", "verify_identity"}
        if ssl_mode not in valid_ssl_modes:
            raise ValueError(
                "Invalid mysql_ssl_mode. Supported values: disable, preferred, required, verify_ca, verify_identity."
            )

        return self


class SQLConnector(BaseConnector):
    def __init__(self, config: SQLConnectorConfig) -> None:
        super().__init__(name=config.name)
        self.config = config
        self._connection = None

    @property
    def connector_type(self) -> ConnectorType:
        return ConnectorType.SQL

    def capabilities(self) -> List[str]:
        return ["health_check", "list_tables", "table_schema", "query", "stream_query"]

    def connect(self) -> None:
        if self._connection is not None:
            return

        driver = self.config.driver.lower()
        try:
            if driver == "sqlite":
                conn = sqlite3.connect(self.config.database)
                conn.row_factory = sqlite3.Row
                self._connection = conn
                return

            if driver == "postgresql":
                if psycopg2 is None:
                    raise ConnectorConfigurationError(
                        "psycopg2 is not available. Install dependency to use PostgreSQL connector."
                    )
                self._connection = psycopg2.connect(
                    host=self.config.host,
                    port=self.config.port,
                    dbname=self.config.database,
                    user=self.config.username,
                    password=self.config.password.get_secret_value() if self.config.password else None,
                    connect_timeout=self.config.connect_timeout_seconds,
                )
                return

            if driver == "mysql":
                if pymysql is None:
                    raise ConnectorConfigurationError(
                        "pymysql is not available. Install dependency to use MySQL connector."
                    )
                ssl_mode = str(self.config.mysql_ssl_mode or "disable").strip().lower()
                ssl_options = None
                if ssl_mode != "disable":
                    ssl_options = {}
                    if self.config.mysql_ssl_ca:
                        ssl_options["ca"] = self.config.mysql_ssl_ca
                    if self.config.mysql_ssl_cert:
                        ssl_options["cert"] = self.config.mysql_ssl_cert
                    if self.config.mysql_ssl_key:
                        ssl_options["key"] = self.config.mysql_ssl_key
                    ssl_options["check_hostname"] = bool(
                        self.config.mysql_ssl_check_hostname or ssl_mode == "verify_identity"
                    )
                    if ssl_mode in {"verify_ca", "verify_identity"} and not self.config.mysql_ssl_ca:
                        raise ConnectorConfigurationError(
                            "mysql_ssl_ca is required for verify_ca/verify_identity."
                        )
                    if ssl_mode == "preferred" and not ssl_options:
                        ssl_options = None
                self._connection = pymysql.connect(
                    host=self.config.host,
                    port=int(self.config.port or 3306),
                    user=self.config.username,
                    password=self.config.password.get_secret_value() if self.config.password else None,
                    database=self.config.database,
                    connect_timeout=int(self.config.connect_timeout_seconds),
                    cursorclass=PyMySQLDictCursor,
                    autocommit=True,
                    ssl=ssl_options,
                )
                return

            if driver == "mssql":
                if pyodbc is None:
                    raise ConnectorConfigurationError(
                        "pyodbc is not available. Install dependency to use MSSQL connector."
                    )
                conn_str = (
                    f"DRIVER={{{self.config.odbc_driver}}};"
                    f"SERVER={self.config.host},{int(self.config.port or 1433)};"
                    f"DATABASE={self.config.database};"
                    f"UID={self.config.username};"
                    f"PWD={self.config.password.get_secret_value() if self.config.password else ''};"
                    f"Encrypt={'yes' if self.config.encrypt else 'no'};"
                    f"TrustServerCertificate={'yes' if self.config.trust_server_certificate else 'no'};"
                )
                self._connection = pyodbc.connect(conn_str, timeout=int(self.config.connect_timeout_seconds))
                return

            if driver == "oracle":
                if oracledb is None:
                    raise ConnectorConfigurationError(
                        "oracledb is not available. Install dependency to use Oracle connector."
                    )
                dsn = oracledb.makedsn(
                    self.config.host,
                    int(self.config.port or 1521),
                    service_name=self.config.database,
                )
                self._connection = oracledb.connect(
                    user=self.config.username,
                    password=self.config.password.get_secret_value() if self.config.password else None,
                    dsn=dsn,
                )
                return

            raise ConnectorConfigurationError(f"Unsupported SQL driver '{self.config.driver}'.")
        except Exception as exc:
            raise ConnectorConnectionError(
                f"Failed to connect with SQL connector '{self.name}': {exc}"
            ) from exc

    def close(self) -> None:
        if self._connection is None:
            return
        self._connection.close()
        self._connection = None

    def health_check(self) -> ConnectorHealth:
        try:
            ping_sql = "SELECT 1 as ok" if self.config.driver.lower() != "oracle" else "SELECT 1 as ok FROM dual"
            rows = self.query(ping_sql)
            return ConnectorHealth(healthy=True, details={"ping": rows[0].get("ok") if rows else None})
        except Exception as exc:
            return ConnectorHealth(healthy=False, details={"error": str(exc)})

    def list_tables(self, schema: Optional[str] = None) -> List[str]:
        self.connect()
        driver = self.config.driver.lower()

        if driver == "sqlite":
            rows = self.query(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
            return [str(row.get("name")) for row in rows if row.get("name")]

        if driver == "postgresql":
            schema_name = schema or "public"
            rows = self.query(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = %s
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """,
                params=(schema_name,),
                enforce_read_only=False,
            )
            return [str(row.get("table_name")) for row in rows if row.get("table_name")]

        if driver == "mysql":
            schema_name = schema or self.config.database
            rows = self.query(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = %s
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """,
                params=(schema_name,),
                enforce_read_only=False,
            )
            return [str(row.get("table_name")) for row in rows if row.get("table_name")]

        if driver == "mssql":
            schema_name = schema or "dbo"
            rows = self.query(
                """
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = ?
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name
                """,
                params=(schema_name,),
                enforce_read_only=False,
            )
            return [str(row.get("table_name")) for row in rows if row.get("table_name")]

        if driver == "oracle":
            if schema:
                rows = self.query(
                    """
                    SELECT table_name
                    FROM all_tables
                    WHERE owner = :1
                    ORDER BY table_name
                    """,
                    params=(schema.upper(),),
                    enforce_read_only=False,
                )
            else:
                rows = self.query(
                    "SELECT table_name FROM user_tables ORDER BY table_name",
                    enforce_read_only=False,
                )
            return [str(row.get("table_name")) for row in rows if row.get("table_name")]

        return []

    def get_table_schema(self, table: str, schema: Optional[str] = None) -> List[Dict[str, Any]]:
        self.connect()
        driver = self.config.driver.lower()

        if driver == "sqlite":
            if not _IDENTIFIER_PATTERN.match(table):
                raise ConnectorQueryError(f"Invalid table name '{table}'.")
            rows = self.query(f"PRAGMA table_info('{table}')", enforce_read_only=False)
            return [
                {
                    "column_name": row.get("name"),
                    "data_type": row.get("type"),
                    "nullable": not bool(row.get("notnull")),
                    "default": row.get("dflt_value"),
                    "primary_key": bool(row.get("pk")),
                }
                for row in rows
            ]

        if driver == "postgresql":
            schema_name = schema or "public"
            rows = self.query(
                """
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = %s
                  AND table_name = %s
                ORDER BY ordinal_position
                """,
                params=(schema_name, table),
                enforce_read_only=False,
            )
            for row in rows:
                row["nullable"] = str(row.pop("is_nullable", "")).upper() == "YES"
                row["default"] = row.pop("column_default", None)
            return rows

        if driver == "mysql":
            schema_name = schema or self.config.database
            rows = self.query(
                """
                SELECT column_name, data_type, is_nullable, column_default, column_key
                FROM information_schema.columns
                WHERE table_schema = %s
                  AND table_name = %s
                ORDER BY ordinal_position
                """,
                params=(schema_name, table),
                enforce_read_only=False,
            )
            for row in rows:
                row["nullable"] = str(row.pop("is_nullable", "")).upper() == "YES"
                row["default"] = row.pop("column_default", None)
                row["primary_key"] = str(row.pop("column_key", "")).upper() == "PRI"
            return rows

        if driver == "mssql":
            schema_name = schema or "dbo"
            rows = self.query(
                """
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_schema = ?
                  AND table_name = ?
                ORDER BY ordinal_position
                """,
                params=(schema_name, table),
                enforce_read_only=False,
            )
            for row in rows:
                row["nullable"] = str(row.pop("is_nullable", "")).upper() == "YES"
                row["default"] = row.pop("column_default", None)
            return rows

        if driver == "oracle":
            owner = (schema or self.config.username or "").upper()
            rows = self.query(
                """
                SELECT column_name, data_type, nullable, data_default
                FROM all_tab_columns
                WHERE owner = :1
                  AND table_name = :2
                ORDER BY column_id
                """,
                params=(owner, table.upper()),
                enforce_read_only=False,
            )
            for row in rows:
                row["nullable"] = str(row.pop("nullable", "")).upper() == "Y"
                row["default"] = row.pop("data_default", None)
            return rows

        return []

    def query(
        self,
        sql: str,
        params: Optional[Union[Sequence[Any], Dict[str, Any]]] = None,
        enforce_read_only: bool = True,
    ) -> List[Dict[str, Any]]:
        self.connect()
        if enforce_read_only and self.config.read_only:
            self._validate_read_only_query(sql)

        try:
            cursor = self._cursor()
            try:
                if params is None:
                    cursor.execute(sql)
                else:
                    cursor.execute(sql, params)
                if cursor.description is None:
                    return []
                rows = cursor.fetchall()
                return self._rows_to_dicts(rows, cursor.description)
            finally:
                cursor.close()
        except ConnectorSecurityError:
            raise
        except Exception as exc:
            raise ConnectorQueryError(f"SQL query failed: {exc}") from exc

    def stream_query(
        self,
        sql: str,
        params: Optional[Union[Sequence[Any], Dict[str, Any]]] = None,
        batch_size: int = 1000,
    ) -> Generator[List[Dict[str, Any]], None, None]:
        self.connect()
        if self.config.read_only:
            self._validate_read_only_query(sql)

        try:
            cursor = self._cursor()
            try:
                if params is None:
                    cursor.execute(sql)
                else:
                    cursor.execute(sql, params)
                while True:
                    batch = cursor.fetchmany(batch_size)
                    if not batch:
                        break
                    yield self._rows_to_dicts(batch, cursor.description)
            finally:
                cursor.close()
        except ConnectorSecurityError:
            raise
        except Exception as exc:
            raise ConnectorQueryError(f"Streaming SQL query failed: {exc}") from exc

    def _validate_read_only_query(self, sql: str) -> None:
        if not _READ_QUERY_PATTERN.search(sql):
            raise ConnectorSecurityError("Only read-only queries are allowed (SELECT/WITH/EXPLAIN).")
        if _MUTATION_PATTERN.search(sql):
            raise ConnectorSecurityError("Mutation keywords are not allowed in read-only mode.")

    def _cursor(self):
        driver = self.config.driver.lower()
        if driver == "postgresql":
            return self._connection.cursor(cursor_factory=RealDictCursor)
        return self._connection.cursor()

    def _rows_to_dicts(self, rows: List[Any], description: Optional[List[Any]]) -> List[Dict[str, Any]]:
        if not rows:
            return []

        first = rows[0]
        if isinstance(first, dict):
            return [dict(row) for row in rows]

        if isinstance(first, sqlite3.Row):
            return [dict(row) for row in rows]

        if description:
            columns = [str(col[0]) for col in description]
            output: List[Dict[str, Any]] = []
            for row in rows:
                if isinstance(row, (list, tuple)):
                    output.append({columns[i]: row[i] for i in range(min(len(columns), len(row)))})
                else:
                    try:
                        output.append({columns[i]: getattr(row, columns[i], None) for i in range(len(columns))})
                    except Exception:
                        output.append({"value": row})
            return output

        raise ConnectorQueryError("Unsupported row type returned by SQL driver.")
