"""Peewee migrations -- 005_dashboard_configs.py

Creates dashboard_configs table for persisting dashboards to DB:
1. Stores each dashboard as a separate row
2. Supports multiple dashboards per user (user_id nullable for now)
3. Full dashboard config stored as JSONB in config_json column
"""
import uuid

import peewee as pw
from peewee_migrate import Migrator


def migrate(migrator: Migrator, database: pw.Database, *, fake=False):
    @migrator.create_model
    class DashboardConfig(pw.Model):
        id = pw.UUIDField(primary_key=True, default=uuid.uuid4)
        name = pw.CharField(null=False, max_length=255, default="Dashboard")
        config_json = pw.TextField(null=False)
        is_active = pw.BooleanField(default=False)
        user_id = pw.UUIDField(null=True)
        created_on = pw.DateTimeField()
        updated_on = pw.DateTimeField()

        class Meta:
            table_name = "dashboard_configs"
            indexes = (
                (("user_id", "is_active"), False),
                (("user_id", "created_on"), False),
            )


def rollback(migrator: Migrator, database: pw.Database, *, fake=False):
    migrator.remove_model("dashboard_configs")
