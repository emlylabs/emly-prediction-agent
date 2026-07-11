"""Peewee migrations -- 001_initial_setup.py

This migration:
1. Creates pgvector extension for vector storage
2. Creates documents table for file metadata (with unique filename and file_hash)
3. Creates import_status table for tracking vectorization jobs
"""
import uuid

import peewee as pw
from peewee_migrate import Migrator


def migrate(migrator: Migrator, database: pw.Database, *, fake=False):
    """Write your migrations here."""
    
    # Step 1: Enable pgvector extension
    database.execute_sql('CREATE EXTENSION IF NOT EXISTS vector')
    
    # Step 2: Create Documents table
    @migrator.create_model
    class Documents(pw.Model):
        id = pw.UUIDField(primary_key=True, default=uuid.uuid4)
        filename = pw.CharField(null=False, max_length=255, unique=True)
        file_extension = pw.CharField(null=False, max_length=50)
        file_path = pw.TextField(null=False)
        file_size = pw.IntegerField(null=True)
        file_hash = pw.CharField(null=True, max_length=64)  # SHA256 hash of file content
        metadata = pw.TextField(null=True)
        created_on = pw.DateTimeField()
        updated_on = pw.DateTimeField()

        class Meta:
            table_name = "documents"
    
    # Step 3: Create ImportStatus table (for tracking vectorization jobs)
    @migrator.create_model
    class ImportStatus(pw.Model):
        id = pw.UUIDField(primary_key=True, default=uuid.uuid4)
        status = pw.CharField(null=False, max_length=50, default="pending")
        total_files = pw.IntegerField(default=0)
        processed_files = pw.IntegerField(default=0)
        failed_files = pw.IntegerField(default=0)
        message = pw.TextField(null=True)
        error = pw.TextField(null=True)
        metadata = pw.TextField(null=True)
        created_on = pw.DateTimeField()
        updated_on = pw.DateTimeField()

        class Meta:
            table_name = "import_status"


def rollback(migrator: Migrator, database: pw.Database, *, fake=False):
    """Rollback migrations."""
    migrator.remove_model("import_status")
    migrator.remove_model("documents")
    # Note: We don't drop the pgvector extension as it may be used by other tables
