import uuid
import json
import hashlib
from datetime import datetime
from typing import List, Optional

import peewee as pw
from peewee_async import AioModel
from playhouse.shortcuts import model_to_dict

from app.database.db import DB


def calculate_file_hash(file_path: str) -> str:
    """Calculate SHA256 hash of a file"""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


class Documents(AioModel):
    id = pw.UUIDField(primary_key=True, default=uuid.uuid4)
    filename = pw.CharField(null=False, max_length=255, unique=True)  # Unique constraint
    file_extension = pw.CharField(null=False, max_length=50)
    file_path = pw.TextField(null=False)
    file_size = pw.IntegerField(null=True)
    file_hash = pw.CharField(null=True, max_length=64)  # SHA256 hash of file content
    metadata = pw.TextField(null=True)  # JSON string for additional metadata
    created_on = pw.DateTimeField(default=datetime.now)
    updated_on = pw.DateTimeField(default=datetime.now)

    class Meta:
        database = DB
        table_name = "documents"

    @staticmethod
    def compute_file_hash(file_path: str) -> str:
        """Calculate SHA256 hash of a file"""
        return calculate_file_hash(file_path)

    def get_metadata(self) -> dict:
        """Parse and return metadata as dictionary"""
        if self.metadata:
            return json.loads(self.metadata)
        return {}

    def set_metadata(self, data: dict):
        """Set metadata from dictionary"""
        self.metadata = json.dumps(data)


class DocumentsTableManager:
    def __init__(self, db):
        self.db = db
        with self.db.allow_sync():
            self.db.create_tables([Documents])

    async def add_document(
        self,
        filename: str,
        file_extension: str,
        file_path: str,
        file_size: Optional[int] = None,
        file_hash: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> Documents:
        """Add a new document to the database"""
        metadata_str = json.dumps(metadata) if metadata else None
        return await Documents.aio_create(
            filename=filename,
            file_extension=file_extension,
            file_path=file_path,
            file_size=file_size,
            file_hash=file_hash,
            metadata=metadata_str,
            created_on=datetime.now(),
            updated_on=datetime.now()
        )

    async def get_document_by_id(self, doc_id: uuid.UUID) -> Optional[Documents]:
        """Get a document by its ID"""
        try:
            result = await Documents.select().where(
                Documents.id == doc_id
            ).aio_execute(self.db)
            documents = list(result)
            if documents:
                return Documents(**model_to_dict(documents[0]))
            return None
        except Exception:
            return None

    async def get_documents(
        self,
        skip: int = 0,
        limit: int = 50,
        file_extension: Optional[str] = None
    ) -> List[Documents]:
        """Get documents with optional filtering"""
        query = Documents.select()
        
        if file_extension:
            query = query.where(Documents.file_extension == file_extension)
        
        query = query.order_by(Documents.created_on.desc()).limit(limit).offset(skip)
        
        result = await query.aio_execute(self.db)
        return [Documents(**model_to_dict(doc)) for doc in result]

    async def update_document(
        self,
        doc_id: uuid.UUID,
        **kwargs
    ) -> Optional[Documents]:
        """Update a document"""
        kwargs['updated_on'] = datetime.now()
        
        if 'metadata' in kwargs and isinstance(kwargs['metadata'], dict):
            kwargs['metadata'] = json.dumps(kwargs['metadata'])
        
        await Documents.update(**kwargs).where(
            Documents.id == doc_id
        ).aio_execute(self.db)
        
        return await self.get_document_by_id(doc_id)

    async def delete_document(self, doc_id: uuid.UUID) -> bool:
        """Delete a document by its ID"""
        try:
            await Documents.delete().where(
                Documents.id == doc_id
            ).aio_execute(self.db)
            return True
        except Exception:
            return False

    async def get_document_by_filename(self, filename: str) -> Optional[Documents]:
        """Get a document by its filename (unique)"""
        try:
            result = await Documents.select().where(
                Documents.filename == filename
            ).aio_execute(self.db)
            documents = list(result)
            if documents:
                return Documents(**model_to_dict(documents[0]))
            return None
        except Exception:
            return None

    async def get_documents_by_filenames(self, filenames: List[str]) -> List[Documents]:
        """Get multiple documents by their filenames"""
        try:
            result = await Documents.select().where(
                Documents.filename.in_(filenames)
            ).aio_execute(self.db)
            return [Documents(**model_to_dict(doc)) for doc in result]
        except Exception:
            return []

    async def delete_document_by_filename(self, filename: str) -> bool:
        """Delete a document by its filename"""
        try:
            await Documents.delete().where(
                Documents.filename == filename
            ).aio_execute(self.db)
            return True
        except Exception:
            return False

    async def delete_documents_by_filenames(self, filenames: List[str]) -> int:
        """Delete multiple documents by their filenames. Returns count of deleted."""
        try:
            query = Documents.delete().where(
                Documents.filename.in_(filenames)
            )
            result = await query.aio_execute(self.db)
            return result  # Returns number of deleted rows
        except Exception:
            return 0

    async def update_document_hash(
        self,
        doc_id: uuid.UUID,
        file_hash: str
    ) -> Optional[Documents]:
        """Update the file hash and updated_on timestamp for a document"""
        await Documents.update(
            file_hash=file_hash,
            updated_on=datetime.now()
        ).where(
            Documents.id == doc_id
        ).aio_execute(self.db)
        
        return await self.get_document_by_id(doc_id)

    async def check_and_update_if_changed(
        self,
        filename: str,
        new_hash: str
    ) -> tuple:
        """
        Check if a document exists and if its hash has changed.
        Returns (existing_doc, needs_update) tuple.
        - If document doesn't exist: (None, False)
        - If document exists with same hash: (doc, False)
        - If document exists with different hash: (doc, True)
        """
        existing_doc = await self.get_document_by_filename(filename)
        
        if existing_doc is None:
            return (None, False)
        
        if existing_doc.file_hash == new_hash:
            return (existing_doc, False)
        
        return (existing_doc, True)


DocumentsTable = DocumentsTableManager(DB)
