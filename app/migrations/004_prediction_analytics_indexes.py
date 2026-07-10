"""Peewee migrations -- 004_prediction_analytics_indexes.py

Creates indexes for prediction analytics tables.
"""
import peewee as pw
from peewee_migrate import Migrator


def migrate(migrator: Migrator, database: pw.Database, *, fake=False):
    database.execute_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS prediction_folders_parent_name_uq "
        "ON prediction_folders (parent_id, normalized_name)"
    )
    database.execute_sql(
        "CREATE INDEX IF NOT EXISTS prediction_folders_created_on_idx "
        "ON prediction_folders (created_on)"
    )
    database.execute_sql(
        "CREATE INDEX IF NOT EXISTS prediction_datasets_folder_created_idx "
        "ON prediction_datasets (folder_id, created_on)"
    )
    database.execute_sql(
        "CREATE INDEX IF NOT EXISTS prediction_datasets_file_hash_idx "
        "ON prediction_datasets (file_hash)"
    )
    database.execute_sql(
        "CREATE INDEX IF NOT EXISTS prediction_datasets_original_filename_idx "
        "ON prediction_datasets (original_filename)"
    )
    database.execute_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS prediction_dataset_rows_dataset_row_uq "
        "ON prediction_dataset_rows (dataset_id, row_index)"
    )
    database.execute_sql(
        "CREATE INDEX IF NOT EXISTS prediction_dataset_rows_dataset_idx "
        "ON prediction_dataset_rows (dataset_id)"
    )


def rollback(migrator: Migrator, database: pw.Database, *, fake=False):
    database.execute_sql("DROP INDEX IF EXISTS prediction_dataset_rows_dataset_idx")
    database.execute_sql("DROP INDEX IF EXISTS prediction_dataset_rows_dataset_row_uq")
    database.execute_sql("DROP INDEX IF EXISTS prediction_datasets_original_filename_idx")
    database.execute_sql("DROP INDEX IF EXISTS prediction_datasets_file_hash_idx")
    database.execute_sql("DROP INDEX IF EXISTS prediction_datasets_folder_created_idx")
    database.execute_sql("DROP INDEX IF EXISTS prediction_folders_created_on_idx")
    database.execute_sql("DROP INDEX IF EXISTS prediction_folders_parent_name_uq")
