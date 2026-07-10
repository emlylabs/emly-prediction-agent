from typing import Any, Dict

from app.connectors.base import ConnectorType
from app.connectors.cloud_object_store import (
    CloudObjectStoreConnector,
    CloudObjectStoreConnectorConfig,
)
from app.connectors.exceptions import ConnectorConfigurationError
from app.connectors.registry import connector_registry
from app.connectors.sftp import SFTPConnector, SFTPConnectorConfig
from app.connectors.sql import SQLConnector, SQLConnectorConfig


connector_registry.register(ConnectorType.SQL, SQLConnector)
connector_registry.register(ConnectorType.CLOUD_OBJECT_STORE, CloudObjectStoreConnector)
connector_registry.register(ConnectorType.SFTP, SFTPConnector)


def create_connector(connector_type: ConnectorType | str, config: Dict[str, Any]):
    if isinstance(connector_type, str):
        connector_type = ConnectorType(connector_type)

    connector_cls = connector_registry.get(connector_type)

    if connector_type == ConnectorType.SQL:
        return connector_cls(SQLConnectorConfig(**config))
    if connector_type == ConnectorType.CLOUD_OBJECT_STORE:
        return connector_cls(CloudObjectStoreConnectorConfig(**config))
    if connector_type == ConnectorType.SFTP:
        return connector_cls(SFTPConnectorConfig(**config))

    raise ConnectorConfigurationError(f"Unsupported connector type '{connector_type}'.")
