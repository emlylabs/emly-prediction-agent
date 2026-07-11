import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from app.services.prediction_service import prediction_service
from app.services.automl_service import automl_service
from app.config import VITE_GOOGLE_MAPS_API_KEY, VITE_GOOGLE_MAPS_MAP_ID

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["prediction"])


class DatasetUploadResponse(BaseModel):
    success: bool
    dataset_id: str
    original_filename: str
    folder: str
    rows: int
    columns: List[str]


class UploadInitRequest(BaseModel):
    filename: str
    file_size: int
    folder: Optional[str] = "default"
    content_type: Optional[str] = None
    chunk_size: Optional[int] = 5 * 1024 * 1024
    resume_key: Optional[str] = None


class UploadSessionResponse(BaseModel):
    success: bool
    upload_id: str
    status: str
    message: str
    progress: int
    original_filename: str
    folder: str
    total_bytes: int
    uploaded_bytes: int
    next_chunk_index: int
    chunk_size: int
    dataset_id: Optional[str] = None
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class AlgorithmsResponse(BaseModel):
    success: bool
    algorithms: List[Dict[str, Any]]


class DatasetsResponse(BaseModel):
    success: bool
    datasets: List[Dict[str, Any]]


class FoldersResponse(BaseModel):
    success: bool
    folders: List[Dict[str, Any]]


class CreateFolderRequest(BaseModel):
    name: str
    parent_folder_id: Optional[str] = None


class CreateFolderResponse(BaseModel):
    success: bool
    folder: Dict[str, Any]


class RenameFolderRequest(BaseModel):
    name: str


class RenameFolderResponse(BaseModel):
    success: bool
    folder: Dict[str, Any]


class DeleteFolderResponse(BaseModel):
    success: bool
    folder_id: str
    path: str
    deleted: bool
    deleted_folders_count: int
    deleted_datasets_count: int
    failed_datasets_count: int
    failed_datasets: List[Dict[str, Any]]


class DatasetInsightsResponse(BaseModel):
    success: bool
    insights: Dict[str, Any]


class DatasetDeleteResponse(BaseModel):
    success: bool
    dataset_id: str
    deleted: bool
    original_filename: Optional[str] = None


class BulkDatasetDeleteRequest(BaseModel):
    dataset_ids: List[str] = Field(default_factory=list)


class BulkDatasetDeleteItem(BaseModel):
    dataset_id: str
    deleted: bool
    original_filename: Optional[str] = None
    error: Optional[str] = None


class BulkDatasetDeleteResponse(BaseModel):
    success: bool
    requested: int
    deleted_count: int
    failed_count: int
    results: List[BulkDatasetDeleteItem]


class UpdateDatasetSchemaRequest(BaseModel):
    schema: List[Dict[str, Any]]


class UpdateDatasetSchemaResponse(BaseModel):
    success: bool
    dataset: Dict[str, Any]


class MoveDatasetRequest(BaseModel):
    folder: str


class MoveDatasetResponse(BaseModel):
    success: bool
    dataset: Dict[str, Any]


class RenameDatasetRequest(BaseModel):
    filename: str


class RenameDatasetResponse(BaseModel):
    success: bool
    dataset: Dict[str, Any]


class PrepareSessionStartRequest(BaseModel):
    dataset_id: str


class PrepareSessionStartResponse(BaseModel):
    success: bool
    session_id: str
    dataset_id: str
    dataset_name: str
    rows: int
    columns: List[str]


class PrepareTableResponse(BaseModel):
    success: bool
    session_id: str
    dataset_id: str
    dataset_name: str
    columns: List[str]
    rows: List[Dict[str, Any]]
    total_rows: int
    offset: int
    limit: int


class PrepareUpdateCellsRequest(BaseModel):
    updates: List[Dict[str, Any]]


class PrepareUpdateCellsResponse(BaseModel):
    success: bool
    session_id: str
    updated_cells: int
    rows: int
    columns: List[str]


class PrepareApplyOperationRequest(BaseModel):
    operation: str
    params: Dict[str, Any] = Field(default_factory=dict)


class PrepareApplyOperationResponse(BaseModel):
    success: bool
    session_id: str
    operation: str
    rows_before: int
    rows_after: int
    columns: List[str]


class PrepareSaveRequest(BaseModel):
    mode: str = Field(default="overwrite", description="overwrite or new")
    new_filename: Optional[str] = None
    folder: Optional[str] = None


class PrepareSaveResponse(BaseModel):
    success: bool
    mode: str
    dataset: Dict[str, Any]


class PrepareHistoryResponse(BaseModel):
    success: bool
    session_id: str
    can_undo: bool
    can_redo: bool
    undo_count: int
    redo_count: int
    checkpoint_count: int
    checkpoints: List[Dict[str, Any]] = Field(default_factory=list)


class PrepareCheckpointResponse(BaseModel):
    success: bool
    session_id: str
    checkpoint: Dict[str, Any]
    history: Dict[str, Any]


class PrepareUndoRedoResponse(BaseModel):
    success: bool
    session_id: str
    rows: int
    columns: List[str]
    history: Dict[str, Any]
    restored_checkpoint: Optional[Dict[str, Any]] = None


class PrepareCheckpointCreateRequest(BaseModel):
    label: Optional[str] = None


class PrepareCopilotGenerateRequest(BaseModel):
    instruction: str
    feedback: Optional[str] = None
    current_plan: Optional[Dict[str, Any]] = None
    execution_error: Optional[str] = None


class PrepareCopilotGenerateResponse(BaseModel):
    success: bool
    session_id: str
    plan: Dict[str, Any]
    mentions: Dict[str, List[str]]
    validation_errors: List[str] = Field(default_factory=list)
    resolved_dataset_ids: List[str] = Field(default_factory=list)
    active_dataset: Dict[str, Any]


class PrepareCopilotRunRequest(BaseModel):
    plan: Dict[str, Any]
    sample_rows: Optional[int] = 200


class PrepareCopilotRunResponse(BaseModel):
    success: bool
    session_id: str
    dry_run: bool
    plan: Dict[str, Any]
    validation_errors: List[str] = Field(default_factory=list)
    steps: List[Dict[str, Any]] = Field(default_factory=list)
    rows: Optional[int] = None
    columns: List[str] = Field(default_factory=list)
    preview_rows: List[Dict[str, Any]] = Field(default_factory=list)
    error: Optional[str] = None
    failed_step: Optional[Dict[str, Any]] = None


class PrepareCopilotSavePlanRequest(BaseModel):
    name: str
    instruction: str
    plan: Dict[str, Any]
    dry_run_result: Optional[Dict[str, Any]] = None
    plan_id: Optional[str] = None


class PrepareCopilotSavePlanResponse(BaseModel):
    success: bool
    plan_id: str
    version: int
    name: str
    dataset_id: str
    dataset_name: str
    created_at: str


class PrepareCopilotPlansResponse(BaseModel):
    success: bool
    plans: List[Dict[str, Any]]


class PrepareCopilotPlanDetailResponse(BaseModel):
    success: bool
    plan: Dict[str, Any]


class PrepareCopilotUpdatePlanRequest(BaseModel):
    name: Optional[str] = None
    instruction: Optional[str] = None


class PrepareCopilotUpdatePlanResponse(BaseModel):
    success: bool
    plan_id: str
    name: str
    dataset_id: str
    dataset_name: str
    latest_version: int
    updated_at: str


class PrepareCopilotDeletePlanResponse(BaseModel):
    success: bool
    plan_id: str
    deleted: bool


class PrepareOperationsCatalogResponse(BaseModel):
    success: bool
    operations: List[Dict[str, Any]] = Field(default_factory=list)
    aliases: List[Dict[str, Any]] = Field(default_factory=list)


class DashboardResponse(BaseModel):
    success: bool
    dashboard: Dict[str, Any]


class DashboardsResponse(BaseModel):
    success: bool
    dashboards: List[Dict[str, Any]]


class DashboardDeleteResponse(BaseModel):
    success: bool
    dashboard_id: str
    deleted: bool


class DashboardMigrateRequest(BaseModel):
    dashboards: List[Dict[str, Any]]
    active_dashboard_id: Optional[str] = None


class DashboardMigrateResponse(BaseModel):
    success: bool
    migrated: List[Dict[str, Any]]


class ModelsResponse(BaseModel):
    success: bool
    models: List[Dict[str, Any]]

class ActivateModelResponse(BaseModel):
    success: bool
    model_id: str

class DeleteModelResponse(BaseModel):
    success: bool
    model_id: str
    deleted: bool

class ModelReportResponse(BaseModel):
    success: bool
    report: Dict[str, Any]


class TrainStartRequest(BaseModel):
    dataset_id: str
    target_column: str
    feature_columns: Optional[List[str]] = None
    algorithm: str = Field(..., description="Algorithm id from /prediction/algorithms")
    algorithm_params: Dict[str, Any] = Field(default_factory=dict)
    test_size: float = Field(default=0.2, ge=0.1, le=0.5)
    random_state: int = Field(default=42)
    use_cross_validation: bool = Field(default=False)
    cross_validation_folds: int = Field(default=5, ge=2, le=10)
    problem_type: str = Field(default="regression", description="regression, classification, or clustering")


class TrainStartResponse(BaseModel):
    success: bool
    job_id: str


class TrainStatusResponse(BaseModel):
    success: bool
    job_id: str
    status: str
    stage: str
    message: str
    progress: int
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class InferenceRequest(BaseModel):
    model_id: str
    rows: List[Dict[str, Any]]


class InferenceResponse(BaseModel):
    success: bool
    model_id: str
    predictions: List[Any]


class AnalyzeDatasetRequest(BaseModel):
    dataset_id: str
    user_instruction: str


class AnalyzeDatasetResponse(BaseModel):
    success: bool
    problem_type: str
    target_column: str
    feature_columns: List[str]
    excluded_columns: List[str] = Field(default_factory=list)
    message: str
    data_quality_notes: List[str] = Field(default_factory=list)
    preprocessing_suggestion: Dict[str, Any] = Field(default_factory=dict)
    dataset_summary: Dict[str, Any] = Field(default_factory=dict)


class RecommendAlgorithmsRequest(BaseModel):
    dataset_id: str
    problem_type: str
    target_column: str
    feature_columns: Optional[List[str]] = None
    user_preferences: Optional[str] = ""


class AlgorithmRecommendation(BaseModel):
    algorithm: str
    label: str
    reason: str
    params: Dict[str, Any]
    expected_performance: str
    training_time_estimate: str


class RecommendAlgorithmsResponse(BaseModel):
    success: bool
    recommendations: List[AlgorithmRecommendation]
    preprocessing_notes: List[str] = Field(default_factory=list)
    message: str


class TrainingMetricsResponse(BaseModel):
    success: bool
    job_id: str
    status: str
    metrics_history: List[Dict[str, Any]]


class FrontendConfigResponse(BaseModel):
    success: bool
    google_maps_api_key: str
    google_maps_map_id: str


class ConnectorResponse(BaseModel):
    success: bool
    connector: Dict[str, Any]

class DeleteConnectorResponse(BaseModel):
    success: bool
    connector_id: str
    name: str
    deleted: bool


class ConnectorsResponse(BaseModel):
    success: bool
    connectors: List[Dict[str, Any]]


class SaveSQLConnectorRequest(BaseModel):
    name: str
    driver: str = Field(default="postgresql", description="postgresql or sqlite")
    database: str
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None
    read_only: bool = True
    connect_timeout_seconds: int = 10
    mysql_ssl_mode: str = "disable"
    mysql_ssl_ca: Optional[str] = None
    mysql_ssl_cert: Optional[str] = None
    mysql_ssl_key: Optional[str] = None
    mysql_ssl_check_hostname: bool = False


class SaveSFTPConnectorRequest(BaseModel):
    name: str
    host: str
    port: int = 22
    username: str
    password: Optional[str] = None
    private_key_path: Optional[str] = None
    private_key_passphrase: Optional[str] = None
    remote_path: str = "."
    connect_timeout_seconds: int = 15
    recursive: bool = True
    strict_host_key_check: bool = False
    known_hosts_path: Optional[str] = None


class ConnectorTestResponse(BaseModel):
    success: bool
    connector: Dict[str, Any]
    health: Dict[str, Any]
    tables: List[str]


class ConnectorTableMapping(BaseModel):
    source_table: str
    dataset_name: str
    folder: Optional[str] = None
    enabled: bool = False
    dataset_id: Optional[str] = None
    last_synced_at: Optional[str] = None
    last_error: Optional[str] = None
    file_count: Optional[int] = None
    folder_count: Optional[int] = None
    depth: Optional[int] = None
    parent_path: Optional[str] = None


class ConnectorTablesResponse(BaseModel):
    success: bool
    connector: Dict[str, Any]
    tables: List[str]
    table_mappings: List[ConnectorTableMapping]


class SaveConnectorTablesRequest(BaseModel):
    table_mappings: List[ConnectorTableMapping] = Field(default_factory=list)


class SaveConnectorTablesResponse(BaseModel):
    success: bool
    connector: Dict[str, Any]


class SyncConnectorRequest(BaseModel):
    max_rows_per_table: int = Field(default=500000, ge=1, le=2000000)


class SyncConnectorResponse(BaseModel):
    success: bool
    connector: Dict[str, Any]
    results: List[Dict[str, Any]]
    synced_count: int
    failed_count: int


class RunSQLConnectorRequest(BaseModel):
    query: str
    filename: str
    folder: Optional[str] = None
    max_rows: int = Field(default=200000, ge=1, le=1000000)


class RunConnectorResponse(BaseModel):
    success: bool
    connector: Dict[str, Any]
    dataset: Dict[str, Any]
    rows: int
    columns: List[str]


@router.get("/prediction/algorithms", response_model=AlgorithmsResponse)
async def list_algorithms(problem_type: Optional[str] = None):
    return AlgorithmsResponse(success=True, algorithms=prediction_service.list_algorithms(problem_type=problem_type))


@router.get("/prediction/connectors", response_model=ConnectorsResponse)
async def list_connectors():
    return ConnectorsResponse(success=True, connectors=prediction_service.list_connectors())


@router.post("/prediction/connectors/sql", response_model=ConnectorResponse)
async def save_sql_connector(request: SaveSQLConnectorRequest):
    try:
        connector = prediction_service.save_sql_connector(
            name=request.name,
            driver=request.driver,
            database=request.database,
            host=request.host,
            port=request.port,
            username=request.username,
            password=request.password,
            read_only=request.read_only,
            connect_timeout_seconds=request.connect_timeout_seconds,
            mysql_ssl_mode=request.mysql_ssl_mode,
            mysql_ssl_ca=request.mysql_ssl_ca,
            mysql_ssl_cert=request.mysql_ssl_cert,
            mysql_ssl_key=request.mysql_ssl_key,
            mysql_ssl_check_hostname=request.mysql_ssl_check_hostname,
        )
        return ConnectorResponse(success=True, connector=connector)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("Save SQL connector failed")
        raise HTTPException(status_code=500, detail=f"Failed to save connector: {e}")


@router.put("/prediction/connectors/{connector_id}/sql", response_model=ConnectorResponse)
async def update_sql_connector(connector_id: str, request: SaveSQLConnectorRequest):
    try:
        connector = prediction_service.update_sql_connector(
            connector_id=connector_id,
            name=request.name,
            driver=request.driver,
            database=request.database,
            host=request.host,
            port=request.port,
            username=request.username,
            password=request.password,
            read_only=request.read_only,
            connect_timeout_seconds=request.connect_timeout_seconds,
            mysql_ssl_mode=request.mysql_ssl_mode,
            mysql_ssl_ca=request.mysql_ssl_ca,
            mysql_ssl_cert=request.mysql_ssl_cert,
            mysql_ssl_key=request.mysql_ssl_key,
            mysql_ssl_check_hostname=request.mysql_ssl_check_hostname,
        )
        return ConnectorResponse(success=True, connector=connector)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("Update SQL connector failed")
        raise HTTPException(status_code=500, detail=f"Failed to update connector: {e}")


@router.post("/prediction/connectors/sftp", response_model=ConnectorResponse)
async def save_sftp_connector(request: SaveSFTPConnectorRequest):
    try:
        connector = prediction_service.save_sftp_connector(
            name=request.name,
            host=request.host,
            port=request.port,
            username=request.username,
            password=request.password,
            private_key_path=request.private_key_path,
            private_key_passphrase=request.private_key_passphrase,
            remote_path=request.remote_path,
            connect_timeout_seconds=request.connect_timeout_seconds,
            recursive=request.recursive,
            strict_host_key_check=request.strict_host_key_check,
            known_hosts_path=request.known_hosts_path,
        )
        return ConnectorResponse(success=True, connector=connector)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("Save SFTP connector failed")
        raise HTTPException(status_code=500, detail=f"Failed to save connector: {e}")


@router.put("/prediction/connectors/{connector_id}/sftp", response_model=ConnectorResponse)
async def update_sftp_connector(connector_id: str, request: SaveSFTPConnectorRequest):
    try:
        connector = prediction_service.update_sftp_connector(
            connector_id=connector_id,
            name=request.name,
            host=request.host,
            port=request.port,
            username=request.username,
            password=request.password,
            private_key_path=request.private_key_path,
            private_key_passphrase=request.private_key_passphrase,
            remote_path=request.remote_path,
            connect_timeout_seconds=request.connect_timeout_seconds,
            recursive=request.recursive,
            strict_host_key_check=request.strict_host_key_check,
            known_hosts_path=request.known_hosts_path,
        )
        return ConnectorResponse(success=True, connector=connector)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("Update SFTP connector failed")
        raise HTTPException(status_code=500, detail=f"Failed to update connector: {e}")


@router.delete("/prediction/connectors/{connector_id}", response_model=DeleteConnectorResponse)
async def delete_connector(connector_id: str):
    try:
        result = prediction_service.delete_connector(connector_id)
        return DeleteConnectorResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("Delete connector failed")
        raise HTTPException(status_code=500, detail=f"Failed to delete connector: {e}")


@router.post("/prediction/connectors/{connector_id}/test", response_model=ConnectorTestResponse)
async def test_connector(connector_id: str):
    try:
        result = prediction_service.test_connector(connector_id)
        return ConnectorTestResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("Connector test failed")
        raise HTTPException(status_code=500, detail=f"Failed to test connector: {e}")


@router.get("/prediction/connectors/{connector_id}/tables", response_model=ConnectorTablesResponse)
async def list_connector_tables(connector_id: str):
    try:
        result = prediction_service.list_sql_connector_tables(connector_id=connector_id)
        return ConnectorTablesResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("Connector table listing failed")
        raise HTTPException(status_code=500, detail=f"Failed to list connector tables: {e}")


@router.put("/prediction/connectors/{connector_id}/tables", response_model=SaveConnectorTablesResponse)
async def save_connector_tables(connector_id: str, request: SaveConnectorTablesRequest):
    try:
        connector = prediction_service.save_sql_connector_table_mappings(
            connector_id=connector_id,
            table_mappings=[row.model_dump() for row in request.table_mappings],
        )
        return SaveConnectorTablesResponse(success=True, connector=connector)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("Connector table mapping save failed")
        raise HTTPException(status_code=500, detail=f"Failed to save connector tables: {e}")


@router.post("/prediction/connectors/{connector_id}/sync", response_model=SyncConnectorResponse)
async def sync_connector_tables(connector_id: str, request: SyncConnectorRequest):
    try:
        result = prediction_service.sync_sql_connector_tables(
            connector_id=connector_id,
            max_rows_per_table=request.max_rows_per_table,
        )
        return SyncConnectorResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("Connector table sync failed")
        raise HTTPException(status_code=500, detail=f"Failed to sync connector tables: {e}")


@router.post("/prediction/connectors/{connector_id}/run-sql", response_model=RunConnectorResponse)
async def run_sql_connector(connector_id: str, request: RunSQLConnectorRequest):
    try:
        result = prediction_service.run_sql_connector_query(
            connector_id=connector_id,
            query=request.query,
            filename=request.filename,
            folder=request.folder,
            max_rows=request.max_rows,
        )
        return RunConnectorResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.exception("Run SQL connector failed")
        raise HTTPException(status_code=500, detail=f"Failed to run connector: {e}")


@router.get("/prediction/datasets", response_model=DatasetsResponse)
async def list_datasets():
    return DatasetsResponse(success=True, datasets=prediction_service.list_datasets())


@router.get("/prediction/folders", response_model=FoldersResponse)
async def list_folders():
    return FoldersResponse(success=True, folders=prediction_service.list_folders())


@router.post("/prediction/folders", response_model=CreateFolderResponse)
async def create_folder(request: CreateFolderRequest):
    try:
        folder = prediction_service.create_folder(request.name, parent_folder_id=request.parent_folder_id)
        return CreateFolderResponse(success=True, folder=folder)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Folder creation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create folder")


@router.delete("/prediction/folders/{folder_id}", response_model=DeleteFolderResponse)
async def delete_folder(folder_id: str):
    try:
        result = prediction_service.delete_folder(folder_id)
        return DeleteFolderResponse(success=True, **result)
    except ValueError as e:
        message = str(e)
        status_code = 404 if "not found" in message.lower() else 400
        raise HTTPException(status_code=status_code, detail=message)
    except Exception as e:
        log.error(f"Folder delete failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete folder")


@router.put("/prediction/folders/{folder_id}/rename", response_model=RenameFolderResponse)
async def rename_folder(folder_id: str, request: RenameFolderRequest):
    try:
        folder = prediction_service.rename_folder(folder_id=folder_id, name=request.name)
        return RenameFolderResponse(success=True, folder=folder)
    except ValueError as e:
        message = str(e)
        status_code = 404 if "not found" in message.lower() else 400
        raise HTTPException(status_code=status_code, detail=message)
    except Exception as e:
        log.error(f"Folder rename failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to rename folder")


@router.get("/prediction/datasets/{dataset_id}/insights", response_model=DatasetInsightsResponse)
async def dataset_insights(dataset_id: str):
    try:
        insights = prediction_service.get_dataset_insights_from_metadata(dataset_id=dataset_id)
        return DatasetInsightsResponse(success=True, insights=insights)
    except ValueError as e:
        message = str(e)
        status_code = 404 if "not available" in message.lower() or "not found" in message.lower() else 400
        raise HTTPException(status_code=status_code, detail=message)
    except Exception as e:
        log.error(f"Dataset insights failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze dataset")


@router.post("/prediction/datasets/{dataset_id}/insights/recompute", response_model=DatasetInsightsResponse)
async def recompute_dataset_insights(dataset_id: str):
    try:
        insights = await prediction_service.recompute_dataset_insights_with_llm_summary(dataset_id=dataset_id)
        return DatasetInsightsResponse(success=True, insights=insights)
    except ValueError as e:
        message = str(e)
        status_code = 404 if "not found" in message.lower() else 400
        raise HTTPException(status_code=status_code, detail=message)
    except Exception as e:
        log.error(f"Dataset insights recompute failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to recompute dataset insights")


@router.put("/prediction/datasets/{dataset_id}/schema", response_model=UpdateDatasetSchemaResponse)
async def update_dataset_schema(dataset_id: str, request: UpdateDatasetSchemaRequest):
    try:
        dataset = prediction_service.update_dataset_schema(dataset_id=dataset_id, schema=request.schema)
        return UpdateDatasetSchemaResponse(success=True, dataset=dataset)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Update dataset schema failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to update dataset schema")


@router.put("/prediction/datasets/{dataset_id}/move", response_model=MoveDatasetResponse)
async def move_dataset(dataset_id: str, request: MoveDatasetRequest):
    try:
        dataset = prediction_service.move_dataset(dataset_id=dataset_id, folder=request.folder)
        return MoveDatasetResponse(success=True, dataset=dataset)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Move dataset failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to move dataset")


@router.put("/prediction/datasets/{dataset_id}/rename", response_model=RenameDatasetResponse)
async def rename_dataset(dataset_id: str, request: RenameDatasetRequest):
    try:
        dataset = prediction_service.rename_dataset(dataset_id=dataset_id, filename=request.filename)
        return RenameDatasetResponse(success=True, dataset=dataset)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Rename dataset failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to rename dataset")


@router.delete("/prediction/datasets/{dataset_id}", response_model=DatasetDeleteResponse)
async def delete_dataset(dataset_id: str):
    try:
        result = prediction_service.delete_dataset(dataset_id=dataset_id)
        return DatasetDeleteResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        log.error(f"Dataset delete failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete dataset")


@router.post("/prediction/datasets/delete-bulk", response_model=BulkDatasetDeleteResponse)
async def delete_datasets_bulk(request: BulkDatasetDeleteRequest):
    dataset_ids = [str(dataset_id or "").strip() for dataset_id in request.dataset_ids]
    dataset_ids = [dataset_id for dataset_id in dataset_ids if dataset_id]
    if not dataset_ids:
        raise HTTPException(status_code=400, detail="At least one dataset_id is required")

    try:
        result = prediction_service.delete_datasets(dataset_ids=dataset_ids)
        return BulkDatasetDeleteResponse(success=True, **result)
    except Exception as e:
        log.error(f"Bulk dataset delete failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete datasets")


@router.get("/prediction/datasets/{dataset_id}/download")
async def download_dataset(dataset_id: str):
    try:
        payload = prediction_service.get_dataset_download_payload(dataset_id=dataset_id)
        if payload.get("mode") == "file":
            return FileResponse(
                path=payload["path"],
                filename=payload["filename"],
                media_type=payload["media_type"],
            )
        return Response(
            content=payload["content"],
            media_type=payload["media_type"],
            headers={"Content-Disposition": f'attachment; filename="{payload["filename"]}"'},
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        log.error(f"Dataset download failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to download dataset")


@router.post("/prediction/prepare/start", response_model=PrepareSessionStartResponse)
async def start_prepare_session(request: PrepareSessionStartRequest):
    try:
        result = prediction_service.start_prepare_session(request.dataset_id)
        return PrepareSessionStartResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Prepare session start failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to start prepare session")


@router.get("/prediction/prepare/{session_id}/table", response_model=PrepareTableResponse)
async def get_prepare_table(session_id: str, limit: int = 200, offset: int = 0):
    try:
        result = prediction_service.get_prepare_table(session_id=session_id, limit=limit, offset=offset)
        return PrepareTableResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Get prepare table failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch prepare table")


@router.post("/prediction/prepare/{session_id}/update-cells", response_model=PrepareUpdateCellsResponse)
async def update_prepare_cells(session_id: str, request: PrepareUpdateCellsRequest):
    try:
        result = prediction_service.update_prepare_cells(session_id=session_id, updates=request.updates)
        return PrepareUpdateCellsResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Update prepare cells failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to update cells")


@router.post("/prediction/prepare/{session_id}/apply", response_model=PrepareApplyOperationResponse)
async def apply_prepare_operation(session_id: str, request: PrepareApplyOperationRequest):
    try:
        result = prediction_service.apply_prepare_operation(
            session_id=session_id,
            operation=request.operation,
            params=request.params,
        )
        return PrepareApplyOperationResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Apply prepare operation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to apply operation")


@router.post("/prediction/prepare/{session_id}/save", response_model=PrepareSaveResponse)
async def save_prepare_session(session_id: str, request: PrepareSaveRequest):
    try:
        result = prediction_service.save_prepare_session(
            session_id=session_id,
            mode=request.mode,
            new_filename=request.new_filename,
            folder=request.folder,
        )
        return PrepareSaveResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Save prepare session failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to save prepared dataset")


@router.get("/prediction/prepare/{session_id}/history", response_model=PrepareHistoryResponse)
async def get_prepare_history(session_id: str):
    try:
        result = prediction_service.get_prepare_history(session_id=session_id)
        return PrepareHistoryResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Get prepare history failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch prepare history")


@router.post("/prediction/prepare/{session_id}/checkpoint", response_model=PrepareCheckpointResponse)
async def create_prepare_checkpoint(session_id: str, request: Optional[PrepareCheckpointCreateRequest] = None):
    try:
        result = prediction_service.create_prepare_checkpoint(
            session_id=session_id,
            label=request.label if request else None,
        )
        return PrepareCheckpointResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Create checkpoint failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create checkpoint")


@router.post("/prediction/prepare/{session_id}/undo", response_model=PrepareUndoRedoResponse)
async def undo_prepare_session(session_id: str):
    try:
        result = prediction_service.undo_prepare_session(session_id=session_id)
        return PrepareUndoRedoResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Undo prepare failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to undo")


@router.post("/prediction/prepare/{session_id}/redo", response_model=PrepareUndoRedoResponse)
async def redo_prepare_session(session_id: str):
    try:
        result = prediction_service.redo_prepare_session(session_id=session_id)
        return PrepareUndoRedoResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Redo prepare failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to redo")


@router.post("/prediction/prepare/{session_id}/checkpoint/{checkpoint_id}/restore", response_model=PrepareUndoRedoResponse)
async def restore_prepare_checkpoint(session_id: str, checkpoint_id: str):
    try:
        result = prediction_service.restore_prepare_checkpoint(
            session_id=session_id,
            checkpoint_id=checkpoint_id,
        )
        return PrepareUndoRedoResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Restore checkpoint failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to restore checkpoint")


@router.post("/prediction/prepare/{session_id}/copilot/generate", response_model=PrepareCopilotGenerateResponse)
async def prepare_copilot_generate(session_id: str, request: PrepareCopilotGenerateRequest):
    try:
        result = await prediction_service.generate_prepare_copilot_plan(
            session_id=session_id,
            instruction=request.instruction,
            feedback=request.feedback,
            current_plan=request.current_plan,
            execution_error=request.execution_error,
        )
        return PrepareCopilotGenerateResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Prepare copilot generate failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate prep plan")


@router.post("/prediction/prepare/{session_id}/copilot/run-dry", response_model=PrepareCopilotRunResponse)
async def prepare_copilot_run_dry(session_id: str, request: PrepareCopilotRunRequest):
    try:
        result = prediction_service.run_prepare_copilot_plan(
            session_id=session_id,
            plan=request.plan,
            dry_run=True,
            sample_rows=int(request.sample_rows or 200),
        )
        return PrepareCopilotRunResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Prepare copilot dry run failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to run dry-run plan")


@router.post("/prediction/prepare/{session_id}/copilot/run-full", response_model=PrepareCopilotRunResponse)
async def prepare_copilot_run_full(session_id: str, request: PrepareCopilotRunRequest):
    try:
        result = prediction_service.run_prepare_copilot_plan(
            session_id=session_id,
            plan=request.plan,
            dry_run=False,
            sample_rows=int(request.sample_rows or 200),
        )
        return PrepareCopilotRunResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Prepare copilot full run failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to run full plan")


@router.post("/prediction/prepare/{session_id}/copilot/save-plan", response_model=PrepareCopilotSavePlanResponse)
async def prepare_copilot_save_plan(session_id: str, request: PrepareCopilotSavePlanRequest):
    try:
        result = prediction_service.save_prepare_copilot_plan(
            session_id=session_id,
            name=request.name,
            instruction=request.instruction,
            plan=request.plan,
            dry_run_result=request.dry_run_result,
            plan_id=request.plan_id,
        )
        return PrepareCopilotSavePlanResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Prepare copilot save plan failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to save plan")


@router.get("/prediction/prepare/copilot/plans", response_model=PrepareCopilotPlansResponse)
async def prepare_copilot_list_plans(dataset_id: Optional[str] = None):
    try:
        plans = prediction_service.list_prepare_copilot_plans(dataset_id=dataset_id)
        return PrepareCopilotPlansResponse(success=True, plans=plans)
    except Exception as e:
        log.error(f"Prepare copilot list plans failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to list plans")


@router.get("/prediction/prepare/copilot/plans/{plan_id}", response_model=PrepareCopilotPlanDetailResponse)
async def prepare_copilot_get_plan(plan_id: str):
    try:
        plan = prediction_service.get_prepare_copilot_plan(plan_id=plan_id)
        return PrepareCopilotPlanDetailResponse(success=True, plan=plan)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        log.error(f"Prepare copilot get plan failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to get plan")


@router.put("/prediction/prepare/copilot/plans/{plan_id}", response_model=PrepareCopilotUpdatePlanResponse)
async def prepare_copilot_update_plan(plan_id: str, request: PrepareCopilotUpdatePlanRequest):
    try:
        result = prediction_service.update_prepare_copilot_plan(
            plan_id=plan_id,
            name=request.name,
            instruction=request.instruction,
        )
        return PrepareCopilotUpdatePlanResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Prepare copilot update plan failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to update plan")


@router.delete("/prediction/prepare/copilot/plans/{plan_id}", response_model=PrepareCopilotDeletePlanResponse)
async def prepare_copilot_delete_plan(plan_id: str):
    try:
        result = prediction_service.delete_prepare_copilot_plan(plan_id=plan_id)
        return PrepareCopilotDeletePlanResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        log.error(f"Prepare copilot delete plan failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete plan")


@router.get("/prediction/prepare/operations", response_model=PrepareOperationsCatalogResponse)
async def prepare_operations_catalog():
    try:
        payload = prediction_service.get_prepare_operation_catalog()
        return PrepareOperationsCatalogResponse(success=True, **payload)
    except Exception as e:
        log.error(f"Prepare operations catalog failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to load prepare operations catalog")


@router.get("/prediction/models", response_model=ModelsResponse)
async def list_models():
    return ModelsResponse(success=True, models=prediction_service.list_models())


@router.post("/prediction/models/{model_id}/activate", response_model=ActivateModelResponse)
async def activate_model(model_id: str):
    try:
        result = prediction_service.set_active_model(model_id)
        return ActivateModelResponse(success=True, model_id=result["model_id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Failed to activate model: {e}")
        raise HTTPException(status_code=500, detail="Failed to activate model")


@router.delete("/prediction/models/{model_id}", response_model=DeleteModelResponse)
async def delete_model(model_id: str):
    try:
        result = prediction_service.delete_model(model_id)
        return DeleteModelResponse(success=True, model_id=result["model_id"], deleted=result["deleted"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Failed to delete model: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete model")


@router.get("/prediction/models/{model_id}/report", response_model=ModelReportResponse)
async def model_report(model_id: str):
    try:
        report = prediction_service.get_model_report(model_id)
        return ModelReportResponse(success=True, report=report)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Failed to generate model report: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate model report")


@router.post("/prediction/upload", response_model=DatasetUploadResponse)
async def upload_dataset(file: UploadFile = File(...), folder: str = Form("default")):
    try:
        metadata = await prediction_service.save_uploaded_dataset(file, folder=folder)
        return DatasetUploadResponse(
            success=True,
            dataset_id=metadata["dataset_id"],
            original_filename=metadata["original_filename"],
            folder=metadata["folder"],
            rows=metadata["rows"],
            columns=metadata["columns"],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Dataset upload failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload dataset")


@router.post("/prediction/upload/init", response_model=UploadSessionResponse)
async def init_upload_session(request: UploadInitRequest):
    try:
        session = prediction_service.start_chunked_upload(
            filename=request.filename,
            file_size=request.file_size,
            folder=request.folder,
            content_type=request.content_type,
            chunk_size=int(request.chunk_size or 5 * 1024 * 1024),
            resume_key=request.resume_key,
        )
        return UploadSessionResponse(success=True, **session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Upload session initialization failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to initialize upload session")


@router.post("/prediction/upload/chunk/{upload_id}", response_model=UploadSessionResponse)
async def upload_dataset_chunk(upload_id: str, chunk_index: int = Form(...), chunk: UploadFile = File(...)):
    try:
        session = await prediction_service.append_upload_chunk(upload_id=upload_id, chunk_index=chunk_index, chunk_file=chunk)
        return UploadSessionResponse(success=True, **session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Chunk upload failed for {upload_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload file chunk")


@router.get("/prediction/upload/status/{upload_id}", response_model=UploadSessionResponse)
async def upload_dataset_status(upload_id: str):
    try:
        session = prediction_service.get_upload_status(upload_id=upload_id)
        return UploadSessionResponse(success=True, **session)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        log.error(f"Upload status fetch failed for {upload_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch upload status")


@router.post("/prediction/upload/complete/{upload_id}", response_model=UploadSessionResponse)
async def complete_upload_session(upload_id: str):
    try:
        session = await prediction_service.finalize_chunked_upload(upload_id=upload_id)
        return UploadSessionResponse(success=True, **session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Upload completion failed for {upload_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete upload")


@router.post("/prediction/train/start", response_model=TrainStartResponse)
async def start_training(request: TrainStartRequest):
    try:
        job_id = prediction_service.start_training_job(
            dataset_id=request.dataset_id,
            target_column=request.target_column,
            feature_columns=request.feature_columns,
            algorithm=request.algorithm,
            algorithm_params=request.algorithm_params,
            test_size=request.test_size,
            random_state=request.random_state,
            use_cross_validation=request.use_cross_validation,
            cross_validation_folds=request.cross_validation_folds,
            problem_type=request.problem_type,
        )
        return TrainStartResponse(success=True, job_id=job_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Failed to start training: {e}")
        raise HTTPException(status_code=500, detail="Failed to start training")


@router.get("/prediction/train/status/{job_id}", response_model=TrainStatusResponse)
async def training_status(job_id: str):
    job = prediction_service.get_training_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
    return TrainStatusResponse(
        success=True,
        job_id=job_id,
        status=job.get("status", "unknown"),
        stage=job.get("stage", "unknown"),
        message=job.get("message", ""),
        progress=int(job.get("progress", 0)),
        result=job.get("result"),
        error=job.get("error"),
    )


@router.post("/prediction/infer", response_model=InferenceResponse)
async def run_inference(request: InferenceRequest):
    try:
        result = prediction_service.run_inference(request.model_id, request.rows)
        return InferenceResponse(
            success=True,
            model_id=result["model_id"],
            predictions=result["predictions"],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Inference failed: {e}")
        raise HTTPException(status_code=500, detail="Inference failed")


@router.post("/prediction/analyze-dataset", response_model=AnalyzeDatasetResponse)
async def analyze_dataset(request: AnalyzeDatasetRequest):
    try:
        result = await prediction_service.analyze_dataset_with_llm(
            dataset_id=request.dataset_id,
            user_instruction=request.user_instruction,
        )
        return AnalyzeDatasetResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Dataset analysis failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to analyze dataset")


@router.post("/prediction/recommend-algorithms", response_model=RecommendAlgorithmsResponse)
async def recommend_algorithms(request: RecommendAlgorithmsRequest):
    try:
        result = await prediction_service.recommend_algorithms_with_llm(
            dataset_id=request.dataset_id,
            problem_type=request.problem_type,
            target_column=request.target_column,
            feature_columns=request.feature_columns,
            user_preferences=request.user_preferences or "",
        )
        return RecommendAlgorithmsResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"Algorithm recommendation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to recommend algorithms")


@router.get("/prediction/train/status/{job_id}/metrics", response_model=TrainingMetricsResponse)
async def training_metrics(job_id: str):
    job = prediction_service.get_training_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
    return TrainingMetricsResponse(
        success=True,
        job_id=job_id,
        status=job.get("status", "unknown"),
        metrics_history=job.get("metrics_history", []),
    )


@router.get("/prediction/dashboards", response_model=DashboardsResponse)
async def list_dashboards():
    return DashboardsResponse(success=True, dashboards=prediction_service.list_dashboards())


@router.get("/prediction/dashboards/{dashboard_id}", response_model=DashboardResponse)
async def get_dashboard(dashboard_id: str):
    try:
        dashboard = prediction_service.get_dashboard(dashboard_id)
        return DashboardResponse(success=True, dashboard=dashboard)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/prediction/dashboards", response_model=DashboardResponse)
async def create_dashboard(request: Dict[str, Any]):
    try:
        dashboard = prediction_service.create_dashboard(
            name=request.get("name", "Dashboard"),
            config=request.get("config", {}),
        )
        return DashboardResponse(success=True, dashboard=dashboard)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/prediction/dashboards/{dashboard_id}", response_model=DashboardResponse)
async def update_dashboard(dashboard_id: str, request: Dict[str, Any]):
    try:
        dashboard = prediction_service.update_dashboard(
            dashboard_id=dashboard_id,
            name=request.get("name"),
            config=request.get("config"),
            is_active=request.get("is_active"),
        )
        return DashboardResponse(success=True, dashboard=dashboard)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/prediction/dashboards/{dashboard_id}", response_model=DashboardDeleteResponse)
async def delete_dashboard(dashboard_id: str):
    try:
        result = prediction_service.delete_dashboard(dashboard_id)
        return DashboardDeleteResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/prediction/dashboards/migrate", response_model=DashboardMigrateResponse)
async def migrate_dashboards(request: DashboardMigrateRequest):
    migrated = prediction_service.migrate_dashboards_from_local(
        dashboards=request.dashboards,
        active_id=request.active_dashboard_id,
    )
    return DashboardMigrateResponse(success=True, migrated=migrated)


@router.get("/prediction/frontend-config", response_model=FrontendConfigResponse)
async def frontend_config():
    return FrontendConfigResponse(
        success=True,
        google_maps_api_key=VITE_GOOGLE_MAPS_API_KEY,
        google_maps_map_id=VITE_GOOGLE_MAPS_MAP_ID,
    )


# ── AutoML (MLJAR) endpoints ──────────────────────────────────────────


class AutoMLDetectRequest(BaseModel):
    dataset_id: str
    user_instruction: str


class AutoMLDetectResponse(BaseModel):
    success: bool
    problem_type: str
    target_column: str
    feature_columns: List[str]
    excluded_columns: List[str] = Field(default_factory=list)
    message: str
    dataset_summary: Dict[str, Any] = Field(default_factory=dict)


class AutoMLRecommendRequest(BaseModel):
    dataset_id: str
    problem_type: str
    target_column: str
    feature_columns: Optional[List[str]] = None
    time_budget_minutes: int = Field(default=5, ge=1, le=180)


class AutoMLRecommendResponse(BaseModel):
    success: bool
    mode: str
    algorithms: List[str]
    algorithm_details: List[Dict[str, Any]] = Field(default_factory=list)
    time_budget_minutes: int
    message: str


class AutoMLTrainStartRequest(BaseModel):
    dataset_id: str
    problem_type: str
    target_column: str
    feature_columns: Optional[List[str]] = None
    mode: str = Field(default="Perform")
    algorithms: Optional[List[str]] = None
    time_budget_minutes: int = Field(default=5, ge=1, le=180)


class AutoMLTrainStartResponse(BaseModel):
    success: bool
    job_id: str


class AutoMLProgressResponse(BaseModel):
    success: bool
    job_id: str
    status: str
    current_step: str
    completed_models: List[Dict[str, Any]]
    leaderboard: List[Dict[str, Any]]
    best_model: Optional[str] = None
    best_model_report: Optional[str] = None
    best_model_visuals: List[Dict[str, str]] = Field(default_factory=list)
    model_visuals: Dict[str, List[Dict[str, str]]] = Field(default_factory=dict)
    registered_model_id: Optional[str] = None
    error: Optional[str] = None
    stdout_lines: List[str] = Field(default_factory=list)


class AutoMLModelReportResponse(BaseModel):
    success: bool
    model_name: str
    readme: Optional[str] = None
    framework: Optional[Dict[str, Any]] = None
    visuals: List[Dict[str, str]] = Field(default_factory=list)


@router.post("/prediction/automl/detect-problem", response_model=AutoMLDetectResponse)
async def automl_detect_problem(request: AutoMLDetectRequest):
    try:
        result = await automl_service.detect_problem_type(
            dataset_id=request.dataset_id,
            user_instruction=request.user_instruction,
        )
        return AutoMLDetectResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"AutoML detect problem failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to detect problem type")


@router.post("/prediction/automl/recommend", response_model=AutoMLRecommendResponse)
async def automl_recommend(request: AutoMLRecommendRequest):
    try:
        result = await automl_service.recommend_algorithms(
            dataset_id=request.dataset_id,
            problem_type=request.problem_type,
            target_column=request.target_column,
            feature_columns=request.feature_columns,
            time_budget_minutes=request.time_budget_minutes,
        )
        return AutoMLRecommendResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"AutoML recommend failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to recommend algorithms")


@router.post("/prediction/automl/train/start", response_model=AutoMLTrainStartResponse)
async def automl_train_start(request: AutoMLTrainStartRequest):
    try:
        job_id = automl_service.start_automl_training(
            dataset_id=request.dataset_id,
            problem_type=request.problem_type,
            target_column=request.target_column,
            feature_columns=request.feature_columns,
            mode=request.mode,
            algorithms=request.algorithms,
            time_budget_minutes=request.time_budget_minutes,
        )
        return AutoMLTrainStartResponse(success=True, job_id=job_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"AutoML train start failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to start AutoML training")


@router.get("/prediction/automl/train/{job_id}/progress", response_model=AutoMLProgressResponse)
async def automl_train_progress(job_id: str):
    job = automl_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="AutoML job not found")
    if job.get("status") == "completed":
        automl_service.ensure_registered_model(job_id)
    best_visuals = automl_service.get_top_visuals(job_id) if job.get("status") == "completed" else []
    return AutoMLProgressResponse(
        success=True,
        job_id=job_id,
        status=job.get("status", "unknown"),
        current_step=job.get("current_step", ""),
        completed_models=job.get("completed_models", []),
        leaderboard=job.get("leaderboard", []),
        best_model=job.get("best_model"),
        best_model_report=automl_service.get_best_model_report(job_id),
        best_model_visuals=best_visuals,
        model_visuals=job.get("model_visuals", {}),
        registered_model_id=job.get("registered_model_id"),
        error=job.get("error"),
        stdout_lines=job.get("stdout_lines", [])[-50:],
    )


@router.get("/prediction/automl/train/{job_id}/model/{model_name}/report", response_model=AutoMLModelReportResponse)
async def automl_model_report(job_id: str, model_name: str):
    report = automl_service.get_model_report(job_id, model_name)
    if not report:
        log.warning(f"AutoML model report not found: job_id={job_id}, model_name={model_name}, jobs={list(automl_service.jobs.keys())}")
        raise HTTPException(status_code=404, detail="Model report not found")
    log.info(f"AutoML model report: job_id={job_id}, model_name={model_name}, visuals={len(report.get('visuals', []))}, readme={'yes' if report.get('readme') else 'no'}")
    return AutoMLModelReportResponse(success=True, **report)


@router.get("/prediction/automl/train/{job_id}/model/{model_name}/visual/{filename}")
async def automl_model_visual(job_id: str, model_name: str, filename: str):
    file_path = automl_service.get_visual_file(job_id, model_name, filename)
    if not file_path:
        log.warning(f"AutoML visual not found: job_id={job_id}, model_name={model_name}, filename={filename}")
        raise HTTPException(status_code=404, detail="Visual file not found")
    if filename.endswith(".svg"):
        return FileResponse(file_path, media_type="image/svg+xml")
    return FileResponse(file_path, media_type="image/png")


@router.get("/prediction/automl/train/{job_id}/asset/{filename}")
async def automl_job_asset(job_id: str, filename: str):
    file_path = automl_service.get_job_asset_file(job_id, filename)
    if not file_path:
        log.warning(f"AutoML asset not found: job_id={job_id}, filename={filename}")
        raise HTTPException(status_code=404, detail="Asset file not found")
    if filename.endswith(".svg"):
        return FileResponse(file_path, media_type="image/svg+xml")
    return FileResponse(file_path, media_type="image/png")


class AutoMLModelsResponse(BaseModel):
    success: bool
    models: List[Dict[str, Any]]


class AutoMLJobsResponse(BaseModel):
    success: bool
    jobs: List[Dict[str, Any]]


class AutoMLPredictRequest(BaseModel):
    model_id: str
    rows: List[Dict[str, Any]]


class AutoMLPredictResponse(BaseModel):
    success: bool
    model_id: str
    predictions: Any


@router.get("/prediction/automl/jobs", response_model=AutoMLJobsResponse)
async def list_automl_jobs():
    return AutoMLJobsResponse(success=True, jobs=automl_service.list_jobs())


@router.get("/prediction/automl/models", response_model=AutoMLModelsResponse)
async def list_automl_models():
    models = automl_service.list_mljar_models()
    return AutoMLModelsResponse(success=True, models=models)


@router.post("/prediction/automl/predict", response_model=AutoMLPredictResponse)
async def automl_predict(request: AutoMLPredictRequest):
    try:
        result = automl_service.predict_with_mljar(request.model_id, request.rows)
        return AutoMLPredictResponse(success=True, **result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log.error(f"AutoML predict failed: {e}")
        raise HTTPException(status_code=500, detail="Prediction failed")
