import posixpath
import stat
from typing import List, Optional

from pydantic import BaseModel, SecretStr, model_validator

from app.connectors.base import BaseConnector, ConnectorHealth, ConnectorType
from app.connectors.exceptions import ConnectorConfigurationError, ConnectorConnectionError, ConnectorQueryError

try:
    import paramiko
except Exception:  # pragma: no cover
    paramiko = None


class SFTPConnectorConfig(BaseModel):
    name: str
    host: str
    port: int = 22
    username: str
    password: SecretStr | None = None
    private_key_path: str | None = None
    private_key_passphrase: SecretStr | None = None
    remote_path: str = "."
    connect_timeout_seconds: int = 15
    recursive: bool = True
    strict_host_key_check: bool = False
    known_hosts_path: str | None = None

    @model_validator(mode="after")
    def validate_auth(self):
        if not str(self.host or "").strip():
            raise ValueError("host is required.")
        if not str(self.username or "").strip():
            raise ValueError("username is required.")
        if not self.password and not self.private_key_path:
            raise ValueError("Either password or private_key_path is required.")
        return self


class SFTPConnector(BaseConnector):
    def __init__(self, config: SFTPConnectorConfig) -> None:
        super().__init__(name=config.name)
        self.config = config
        self._client = None
        self._sftp = None

    @property
    def connector_type(self) -> ConnectorType:
        return ConnectorType.SFTP

    def connect(self) -> None:
        if self._sftp is not None:
            return
        if paramiko is None:
            raise ConnectorConfigurationError(
                "paramiko is not available. Install dependency to use SFTP connector."
            )

        try:
            client = paramiko.SSHClient()
            if self.config.strict_host_key_check:
                if self.config.known_hosts_path:
                    client.load_host_keys(self.config.known_hosts_path)
                else:
                    client.load_system_host_keys()
            else:
                client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

            client.connect(
                hostname=self.config.host,
                port=int(self.config.port or 22),
                username=self.config.username,
                password=self.config.password.get_secret_value() if self.config.password else None,
                key_filename=self.config.private_key_path or None,
                passphrase=self.config.private_key_passphrase.get_secret_value() if self.config.private_key_passphrase else None,
                timeout=int(self.config.connect_timeout_seconds or 15),
                look_for_keys=False,
                allow_agent=False,
            )
            self._client = client
            self._sftp = client.open_sftp()
        except Exception as exc:
            raise ConnectorConnectionError(
                f"Failed to connect with SFTP connector '{self.name}': {exc}"
            ) from exc

    def close(self) -> None:
        if self._sftp is not None:
            try:
                self._sftp.close()
            finally:
                self._sftp = None
        if self._client is not None:
            try:
                self._client.close()
            finally:
                self._client = None

    def health_check(self) -> ConnectorHealth:
        try:
            self.connect()
            remote_path = str(self.config.remote_path or ".")
            self._sftp.listdir(remote_path)
            return ConnectorHealth(healthy=True, details={"remote_path": remote_path})
        except Exception as exc:
            return ConnectorHealth(healthy=False, details={"error": str(exc)})

    def capabilities(self) -> List[str]:
        return ["health_check", "list_files", "list_directories", "read_file"]

    def list_directories(self, root: Optional[str] = None, recursive: bool = True) -> List[dict]:
        self.connect()
        start_dir = str(root or self.config.remote_path or ".")
        results: List[dict] = []

        def walk(current: str, depth: int) -> None:
            entries = self._sftp.listdir_attr(current)
            child_dirs: List[str] = []
            file_count = 0
            for entry in entries:
                name = str(getattr(entry, "filename", "") or "")
                if not name:
                    continue
                full_path = posixpath.join(current, name)
                if stat.S_ISDIR(entry.st_mode):
                    child_dirs.append(full_path)
                else:
                    file_count += 1
            results.append(
                {
                    "path": current,
                    "parent_path": posixpath.dirname(current) if current not in {".", "/"} else None,
                    "depth": int(depth),
                    "file_count": int(file_count),
                    "folder_count": int(len(child_dirs)),
                }
            )
            if recursive:
                for child in sorted(child_dirs):
                    walk(child, depth + 1)

        try:
            walk(start_dir, 0)
            return results
        except Exception as exc:
            raise ConnectorQueryError(f"Failed to list directories via SFTP: {exc}") from exc

    def list_files(self, directory: Optional[str] = None, recursive: Optional[bool] = None) -> List[str]:
        self.connect()
        start_dir = str(directory or self.config.remote_path or ".")
        should_recurse = self.config.recursive if recursive is None else bool(recursive)
        try:
            results: List[str] = []
            stack: List[str] = [start_dir]
            while stack:
                current = stack.pop()
                for entry in self._sftp.listdir_attr(current):
                    name = str(getattr(entry, "filename", "") or "")
                    if not name:
                        continue
                    full_path = posixpath.join(current, name)
                    if stat.S_ISDIR(entry.st_mode):
                        if should_recurse:
                            stack.append(full_path)
                        continue
                    results.append(full_path)
            return sorted(set(results))
        except Exception as exc:
            raise ConnectorQueryError(f"Failed to list files via SFTP: {exc}") from exc

    def read_file(self, remote_path: str) -> bytes:
        self.connect()
        path = str(remote_path or "").strip()
        if not path:
            raise ConnectorQueryError("remote_path is required.")
        try:
            with self._sftp.open(path, "rb") as handle:
                return handle.read()
        except Exception as exc:
            raise ConnectorQueryError(f"Failed to read file '{path}': {exc}") from exc
