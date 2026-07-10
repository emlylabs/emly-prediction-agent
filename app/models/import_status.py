import uuid
import json
from datetime import datetime
from typing import List, Optional
from enum import Enum

import peewee as pw
from peewee_async import AioModel
from playhouse.shortcuts import model_to_dict

from app.database.db import DB


class ImportStatusEnum(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ImportStatus(AioModel):
    id = pw.UUIDField(primary_key=True, default=uuid.uuid4)
    status = pw.CharField(null=False, max_length=50, default=ImportStatusEnum.PENDING.value)
    total_files = pw.IntegerField(default=0)
    processed_files = pw.IntegerField(default=0)
    failed_files = pw.IntegerField(default=0)
    message = pw.TextField(null=True)
    error = pw.TextField(null=True)
    metadata = pw.TextField(null=True)  # JSON string for additional info
    created_on = pw.DateTimeField(default=datetime.now)
    updated_on = pw.DateTimeField(default=datetime.now)

    class Meta:
        database = DB
        table_name = "import_status"

    def get_metadata(self) -> dict:
        """Parse and return metadata as dictionary"""
        if self.metadata:
            return json.loads(self.metadata)
        return {}

    def set_metadata(self, data: dict):
        """Set metadata from dictionary"""
        self.metadata = json.dumps(data)


class ImportStatusTableManager:
    def __init__(self, db):
        self.db = db
        with self.db.allow_sync():
            self.db.create_tables([ImportStatus])

    async def create_import(
        self,
        total_files: int,
        metadata: Optional[dict] = None
    ) -> ImportStatus:
        """Create a new import with pending status"""
        metadata_str = json.dumps(metadata) if metadata else None
        return await ImportStatus.aio_create(
            status=ImportStatusEnum.PENDING.value,
            total_files=total_files,
            processed_files=0,
            failed_files=0,
            message="Import created, waiting to start",
            metadata=metadata_str,
            created_on=datetime.now(),
            updated_on=datetime.now()
        )

    async def get_import_by_id(self, import_id: uuid.UUID) -> Optional[ImportStatus]:
        """Get an import by its ID"""
        try:
            result = await ImportStatus.select().where(
                ImportStatus.id == import_id
            ).aio_execute(self.db)
            imports = list(result)
            if imports:
                return ImportStatus(**model_to_dict(imports[0]))
            return None
        except Exception:
            return None

    async def update_import_status(
        self,
        import_id: uuid.UUID,
        status: Optional[str] = None,
        processed_files: Optional[int] = None,
        failed_files: Optional[int] = None,
        message: Optional[str] = None,
        error: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> Optional[ImportStatus]:
        """Update import status"""
        update_data = {"updated_on": datetime.now()}
        
        if status is not None:
            update_data["status"] = status
        if processed_files is not None:
            update_data["processed_files"] = processed_files
        if failed_files is not None:
            update_data["failed_files"] = failed_files
        if message is not None:
            update_data["message"] = message
        if error is not None:
            update_data["error"] = error
        if metadata is not None:
            update_data["metadata"] = json.dumps(metadata)
        
        await ImportStatus.update(**update_data).where(
            ImportStatus.id == import_id
        ).aio_execute(self.db)
        
        return await self.get_import_by_id(import_id)

    async def set_processing(self, import_id: uuid.UUID, message: str = "Processing files...") -> Optional[ImportStatus]:
        """Set import to processing status"""
        return await self.update_import_status(
            import_id=import_id,
            status=ImportStatusEnum.PROCESSING.value,
            message=message
        )

    async def set_completed(self, import_id: uuid.UUID, processed_files: int, message: str = "Import completed successfully") -> Optional[ImportStatus]:
        """Set import to completed status"""
        return await self.update_import_status(
            import_id=import_id,
            status=ImportStatusEnum.COMPLETED.value,
            processed_files=processed_files,
            message=message
        )

    async def set_failed(self, import_id: uuid.UUID, error: str, failed_files: int = 0) -> Optional[ImportStatus]:
        """Set import to failed status"""
        return await self.update_import_status(
            import_id=import_id,
            status=ImportStatusEnum.FAILED.value,
            failed_files=failed_files,
            error=error,
            message="Import failed"
        )

    async def increment_processed(self, import_id: uuid.UUID) -> Optional[ImportStatus]:
        """Increment processed files count"""
        import_job = await self.get_import_by_id(import_id)
        if import_job:
            return await self.update_import_status(
                import_id=import_id,
                processed_files=import_job.processed_files + 1
            )
        return None

    async def increment_failed(self, import_id: uuid.UUID, error: str = None) -> Optional[ImportStatus]:
        """Increment failed files count"""
        import_job = await self.get_import_by_id(import_id)
        if import_job:
            return await self.update_import_status(
                import_id=import_id,
                failed_files=import_job.failed_files + 1,
                error=error
            )
        return None

    async def get_imports(
        self,
        skip: int = 0,
        limit: int = 50,
        status: Optional[str] = None
    ) -> List[ImportStatus]:
        """Get imports with optional filtering"""
        query = ImportStatus.select()
        
        if status:
            query = query.where(ImportStatus.status == status)
        
        query = query.order_by(ImportStatus.created_on.desc()).limit(limit).offset(skip)
        
        result = await query.aio_execute(self.db)
        return [ImportStatus(**model_to_dict(imp)) for imp in result]


ImportStatusTable = ImportStatusTableManager(DB)
