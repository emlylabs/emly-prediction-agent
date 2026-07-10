"""Peewee migrations -- 002_prediction_analytics_tables.py

Adds analytics dataset storage:
1. Hierarchical folders
2. Dataset metadata + schema
3. Dataset rows table for structured analytics access
"""
import uuid

import peewee as pw
from peewee_migrate import Migrator


def migrate(migrator: Migrator, database: pw.Database, *, fake=False):
    @migrator.create_model
    class PredictionFolders(pw.Model):
        id = pw.UUIDField(primary_key=True, default=uuid.uuid4)
        name = pw.CharField(null=False, max_length=255)
        normalized_name = pw.CharField(null=False, max_length=255)
        parent_id = pw.UUIDField(null=True)
        path = pw.TextField(null=False, unique=True)
        metadata_json = pw.TextField(null=True)
        created_on = pw.DateTimeField()
        updated_on = pw.DateTimeField()

        class Meta:
            table_name = "prediction_folders"

    @migrator.create_model
    class PredictionDatasets(pw.Model):
        id = pw.UUIDField(primary_key=True, default=uuid.uuid4)
        folder_id = pw.UUIDField(null=True)
        original_filename = pw.CharField(null=False, max_length=255)
        stored_filename = pw.CharField(null=False, max_length=255, unique=True)
        file_extension = pw.CharField(null=False, max_length=20)
        file_path = pw.TextField(null=False, unique=True)
        file_size = pw.BigIntegerField(null=True)
        mime_type = pw.CharField(null=True, max_length=255)
        file_hash = pw.CharField(null=True, max_length=64)
        rows = pw.IntegerField(default=0)
        columns_count = pw.IntegerField(default=0)
        schema_json = pw.TextField(null=True)
        metadata_json = pw.TextField(null=True)
        created_on = pw.DateTimeField()
        updated_on = pw.DateTimeField()

        class Meta:
            table_name = "prediction_datasets"

    @migrator.create_model
    class PredictionDatasetRows(pw.Model):
        id = pw.BigAutoField(primary_key=True)
        dataset_id = pw.UUIDField(null=False)
        row_index = pw.IntegerField(null=False)
        row_data_json = pw.TextField(null=False)
        created_on = pw.DateTimeField()

        class Meta:
            table_name = "prediction_dataset_rows"


def rollback(migrator: Migrator, database: pw.Database, *, fake=False):
    migrator.remove_model("prediction_dataset_rows")
    migrator.remove_model("prediction_datasets")
    migrator.remove_model("prediction_folders")
