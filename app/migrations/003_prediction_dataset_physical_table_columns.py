"""Peewee migrations -- 003_prediction_dataset_physical_table_columns.py

Adds physical table metadata columns to prediction_datasets.
"""
import peewee as pw
from peewee_migrate import Migrator


def migrate(migrator: Migrator, database: pw.Database, *, fake=False):
    database.execute_sql(
        "ALTER TABLE prediction_datasets "
        "ADD COLUMN IF NOT EXISTS data_table_name VARCHAR(255)"
    )
    database.execute_sql(
        "ALTER TABLE prediction_datasets "
        "ADD COLUMN IF NOT EXISTS data_table_version INTEGER DEFAULT 1"
    )
    database.execute_sql(
        "CREATE UNIQUE INDEX IF NOT EXISTS prediction_datasets_data_table_name_uq "
        "ON prediction_datasets (data_table_name)"
    )


def rollback(migrator: Migrator, database: pw.Database, *, fake=False):
    database.execute_sql("DROP INDEX IF EXISTS prediction_datasets_data_table_name_uq")
    database.execute_sql(
        "ALTER TABLE prediction_datasets DROP COLUMN IF EXISTS data_table_name"
    )
    database.execute_sql(
        "ALTER TABLE prediction_datasets DROP COLUMN IF EXISTS data_table_version"
    )
