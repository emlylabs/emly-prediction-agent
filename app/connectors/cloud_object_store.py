from typing import List

from pydantic import BaseModel, Field, SecretStr

from app.connectors.base import BaseConnector, ConnectorHealth, ConnectorType


class CloudObjectStoreConnectorConfig(BaseModel):
    name: str
    provider: str = Field(description="Supported target providers: aws_s3, gcp_gcs, azure_blob")
    bucket_or_container: str
    region: str | None = None
    access_key: str | None = None
    secret_key: SecretStr | None = None


class CloudObjectStoreConnector(BaseConnector):
    """Connector skeleton for S3/GCS/Azure Blob integrations."""

    def __init__(self, config: CloudObjectStoreConnectorConfig) -> None:
        super().__init__(name=config.name)
        self.config = config

    @property
    def connector_type(self) -> ConnectorType:
        return ConnectorType.CLOUD_OBJECT_STORE

    def connect(self) -> None:
        raise NotImplementedError("Cloud object store connector is scaffolded but not implemented yet.")

    def close(self) -> None:
        return None

    def health_check(self) -> ConnectorHealth:
        return ConnectorHealth(healthy=False, details={"status": "not_implemented"})

    def capabilities(self) -> List[str]:
        return ["health_check"]
