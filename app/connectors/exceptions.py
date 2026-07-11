class ConnectorError(Exception):
    """Base exception for all connector failures."""


class ConnectorConfigurationError(ConnectorError):
    """Raised when connector configuration is missing or invalid."""


class ConnectorConnectionError(ConnectorError):
    """Raised when a connector cannot establish a connection."""


class ConnectorQueryError(ConnectorError):
    """Raised when a query/operation fails at runtime."""


class ConnectorSecurityError(ConnectorError):
    """Raised when a query violates connector security constraints."""
