import json
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import peewee as pw

from app.database.db import DB


class DashboardConfig(pw.Model):
    id = pw.UUIDField(primary_key=True, default=uuid.uuid4)
    name = pw.CharField(null=False, max_length=255, default="Dashboard")
    config_json = pw.TextField(null=False)
    is_active = pw.BooleanField(default=False)
    user_id = pw.UUIDField(null=True)
    created_on = pw.DateTimeField(default=datetime.utcnow)
    updated_on = pw.DateTimeField(default=datetime.utcnow)

    class Meta:
        database = DB
        table_name = "dashboard_configs"
        indexes = (
            (("user_id", "is_active"), False),
            (("user_id", "created_on"), False),
        )

    def get_config(self) -> Dict[str, Any]:
        if self.config_json:
            try:
                return json.loads(self.config_json)
            except Exception:
                return {}
        return {}

    def set_config(self, config: Dict[str, Any]) -> None:
        self.config_json = json.dumps(config)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": str(self.id),
            "name": self.name,
            "config": self.get_config(),
            "is_active": self.is_active,
            "user_id": str(self.user_id) if self.user_id else None,
            "created_on": self.created_on.isoformat() if self.created_on else None,
            "updated_on": self.updated_on.isoformat() if self.updated_on else None,
        }


class DashboardConfigManager:
    def __init__(self) -> None:
        self.db = DB
        with DB.allow_sync():
            DB.create_tables([DashboardConfig], safe=True)
        self.default_user_id: Optional[uuid.UUID] = None

    def set_default_user(self, user_id: Optional[uuid.UUID]) -> None:
        self.default_user_id = user_id

    async def create_dashboard(
        self,
        name: str = "Dashboard",
        config: Optional[Dict[str, Any]] = None,
        is_active: bool = False,
        user_id: Optional[uuid.UUID] = None,
    ) -> DashboardConfig:
        if config is None:
            config = {"widgets": []}
        dashboard = DashboardConfig(
            id=uuid.uuid4(),
            name=name,
            config_json=json.dumps(config),
            is_active=is_active,
            user_id=user_id or self.default_user_id,
            created_on=datetime.utcnow(),
            updated_on=datetime.utcnow(),
        )
        await dashboard.save()
        return dashboard

    async def get_dashboard(self, dashboard_id: uuid.UUID) -> Optional[DashboardConfig]:
        try:
            return await DashboardConfig.objects().where(DashboardConfig.id == dashboard_id).first()
        except Exception:
            return None

    async def get_active_dashboard(self, user_id: Optional[uuid.UUID] = None) -> Optional[DashboardConfig]:
        uid = user_id or self.default_user_id
        try:
            return await DashboardConfig.objects().where(
                DashboardConfig.user_id == uid,
                DashboardConfig.is_active == True,  # noqa: E712
            ).first()
        except Exception:
            return None

    async def list_dashboards(
        self,
        user_id: Optional[uuid.UUID] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[DashboardConfig]:
        uid = user_id or self.default_user_id
        try:
            return list(
                await DashboardConfig.objects()
                .where(DashboardConfig.user_id == uid)
                .order_by(DashboardConfig.created_on.desc())
                .offset(offset)
                .limit(limit)
                .execute()
            )
        except Exception:
            return []

    async def update_dashboard(
        self,
        dashboard_id: uuid.UUID,
        name: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        is_active: Optional[bool] = None,
    ) -> Optional[DashboardConfig]:
        dashboard = await self.get_dashboard(dashboard_id)
        if not dashboard:
            return None
        if name is not None:
            dashboard.name = name
        if config is not None:
            dashboard.config_json = json.dumps(config)
        if is_active is not None:
            if is_active:
                await self.unset_active_for_user(dashboard.user_id)
            dashboard.is_active = is_active
        dashboard.updated_on = datetime.utcnow()
        await dashboard.save()
        return dashboard

    async def set_active(self, dashboard_id: uuid.UUID) -> Optional[DashboardConfig]:
        dashboard = await self.get_dashboard(dashboard_id)
        if not dashboard:
            return None
        await self.unset_active_for_user(dashboard.user_id)
        dashboard.is_active = True
        dashboard.updated_on = datetime.utcnow()
        await dashboard.save()
        return dashboard

    async def unset_active_for_user(self, user_id: Optional[uuid.UUID] = None) -> None:
        uid = user_id or self.default_user_id
        try:
            await DashboardConfig.objects().where(
                DashboardConfig.user_id == uid,
                DashboardConfig.is_active == True,  # noqa: E712
            ).update(is_active=False)
        except Exception:
            pass

    async def delete_dashboard(self, dashboard_id: uuid.UUID) -> bool:
        dashboard = await self.get_dashboard(dashboard_id)
        if not dashboard:
            return False
        await dashboard.delete_instance()
        return True

    async def get_all_config_json_for_user(
        self,
        user_id: Optional[uuid.UUID] = None,
    ) -> List[Dict[str, Any]]:
        dashboards = await self.list_dashboards(user_id=user_id, limit=1000)
        return [d.get_config() for d in dashboards]

    # ---------------------------------------------------------------------------
    # Synchronous wrappers (for use from sync PredictionService methods)
    # ---------------------------------------------------------------------------

    def list_sync(self) -> List[DashboardConfig]:
        with self.db.allow_sync():
            query = DashboardConfig.select().order_by(DashboardConfig.created_on.desc())
            return list(query.execute())

    def get_sync(self, dashboard_id: uuid.UUID) -> Optional[DashboardConfig]:
        with self.db.allow_sync():
            try:
                return DashboardConfig.get(DashboardConfig.id == dashboard_id)
            except Exception:
                return None

    def create_sync(
        self,
        name: str = "Dashboard",
        config: Optional[Dict[str, Any]] = None,
        is_active: bool = False,
    ) -> DashboardConfig:
        if config is None:
            config = {"widgets": []}
        # Use client's dashboard ID from config if it's a valid UUID, otherwise generate new UUID
        client_id = config.get("id") if config else None
        try:
            dashboard_id = uuid.UUID(client_id) if client_id else uuid.uuid4()
        except (ValueError, TypeError):
            dashboard_id = uuid.uuid4()
        with self.db.allow_sync():
            dashboard = DashboardConfig.create(
                id=dashboard_id,
                name=name,
                config_json=json.dumps(config),
                is_active=is_active,
                created_on=datetime.utcnow(),
                updated_on=datetime.utcnow(),
            )
            return dashboard

    def update_sync(
        self,
        dashboard_id: uuid.UUID,
        name: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        is_active: Optional[bool] = None,
    ) -> Optional[DashboardConfig]:
        with self.db.allow_sync():
            try:
                dashboard = DashboardConfig.get(DashboardConfig.id == dashboard_id)
            except Exception:
                # Upsert: create if doesn't exist
                if config is None:
                    config = {"widgets": []}
                dashboard = DashboardConfig.create(
                    id=dashboard_id,
                    name=name or "Dashboard",
                    config_json=json.dumps(config),
                    is_active=is_active or False,
                    created_on=datetime.utcnow(),
                    updated_on=datetime.utcnow(),
                )
                return dashboard
            if name is not None:
                dashboard.name = name
            if config is not None:
                dashboard.config_json = json.dumps(config)
            if is_active is not None:
                if is_active:
                    # Unset active on all other dashboards for this user
                    DashboardConfig.update(is_active=False).where(
                        DashboardConfig.user_id == dashboard.user_id,
                        DashboardConfig.is_active == True,  # noqa: E712
                    ).execute()
                dashboard.is_active = is_active
            dashboard.updated_on = datetime.utcnow()
            dashboard.save()
            return dashboard

    def update_sync_by_client_id(
        self,
        client_id: str,
        name: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
        is_active: Optional[bool] = None,
    ) -> Optional[DashboardConfig]:
        """Update a dashboard by its client-side ID (e.g. 'dashboard-xxx')."""
        with self.db.allow_sync():
            # Try to find by UUID
            try:
                uid = uuid.UUID(client_id)
                return self.update_sync(uid, name=name, config=config, is_active=is_active)
            except (ValueError, TypeError):
                pass
            # Fall back: look up by config_json id field
            rows = list(DashboardConfig.select().execute())
            for row in rows:
                cfg = row.get_config()
                if cfg.get("id") == client_id:
                    # Found it - update using the UUID-based method
                    return self.update_sync(
                        row.id,
                        name=name,
                        config=config,
                        is_active=is_active,
                    )
            # Not found: upsert with a new UUID, storing client_id in config
            if config is None:
                config = {"widgets": []}
            config["id"] = client_id
            new_id = uuid.uuid4()
            DashboardConfig.create(
                id=new_id,
                name=name or "Dashboard",
                config_json=json.dumps(config),
                is_active=is_active or False,
                created_on=datetime.utcnow(),
                updated_on=datetime.utcnow(),
            )
            return DashboardConfig.get(DashboardConfig.id == new_id)

    def delete_sync(self, dashboard_id: uuid.UUID) -> bool:
        with self.db.allow_sync():
            try:
                dashboard = DashboardConfig.get(DashboardConfig.id == dashboard_id)
                dashboard.delete_instance()
                return True
            except Exception:
                return False

    def get_sync_by_client_id(self, client_id: str) -> Optional[DashboardConfig]:
        """Get a dashboard by its client-side ID (e.g. 'dashboard-xxx')."""
        with self.db.allow_sync():
            try:
                uid = uuid.UUID(client_id)
                return self.get_sync(uid)
            except (ValueError, TypeError):
                pass
            rows = list(DashboardConfig.select().execute())
            for row in rows:
                cfg = row.get_config()
                if cfg.get("id") == client_id:
                    return row
            return None

    def delete_sync_by_client_id(self, client_id: str) -> bool:
        """Delete a dashboard by its client-side ID (e.g. 'dashboard-xxx')."""
        with self.db.allow_sync():
            try:
                uid = uuid.UUID(client_id)
                return self.delete_sync(uid)
            except (ValueError, TypeError):
                pass
            dashboard = self.get_sync_by_client_id(client_id)
            if dashboard:
                dashboard.delete_instance()
                return True
            return False


DashboardConfigTable = DashboardConfigManager()
