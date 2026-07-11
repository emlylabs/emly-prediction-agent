from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ConnectorType(str, Enum):
    SQL = "sql"
    CLOUD_OBJECT_STORE = "cloud_object_store"
    SFTP = "sftp"


class ConnectorHealth(BaseModel):
    healthy: bool
    details: Dict[str, Any] = Field(default_factory=dict)


class ConnectorConfig(BaseModel):
    name: str
    connector_type: ConnectorType
    options: Dict[str, Any] = Field(default_factory=dict)


class BaseConnector(ABC):
    """Base contract for all data connectors."""

    def __init__(self, name: str) -> None:
        self.name = name

    @property
    @abstractmethod
    def connector_type(self) -> ConnectorType:
        ...

    @abstractmethod
    def connect(self) -> None:
        ...

    @abstractmethod
    def close(self) -> None:
        ...

    @abstractmethod
    def health_check(self) -> ConnectorHealth:
        ...

    @abstractmethod
    def capabilities(self) -> List[str]:
        ...

    def __enter__(self):
        self.connect()
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()
        return False
