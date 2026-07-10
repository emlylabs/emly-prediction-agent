from typing import Dict, Type

from app.connectors.base import BaseConnector, ConnectorType
from app.connectors.exceptions import ConnectorConfigurationError


class ConnectorRegistry:
    """Central registry for connector implementations."""

    def __init__(self) -> None:
        self._connector_types: Dict[ConnectorType, Type[BaseConnector]] = {}

    def register(self, connector_type: ConnectorType, connector_cls: Type[BaseConnector]) -> None:
        self._connector_types[connector_type] = connector_cls

    def get(self, connector_type: ConnectorType) -> Type[BaseConnector]:
        connector_cls = self._connector_types.get(connector_type)
        if connector_cls is None:
            raise ConnectorConfigurationError(f"No connector registered for type '{connector_type}'.")
        return connector_cls


connector_registry = ConnectorRegistry()
