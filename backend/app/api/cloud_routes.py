from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.db.cloud import get_cloud_store

router = APIRouter(prefix="/cloud", tags=["cloud"])


class DeviceIn(BaseModel):
    name: str = "هاتف مطمن"


class TraderIn(BaseModel):
    id: str | None = None
    display_name: str = Field(min_length=1)
    city: str = "Unknown"
    area: str = ""
    map_query: str = ""
    rails: list[str] = Field(default_factory=list)
    payment_methods: list[str] = Field(default_factory=list)
    telegram: str = ""
    whatsapp: str = ""
    phone_note: str = ""
    anon_id: str = ""
    status: str = "lead"
    trust_score: float = 50
    notes: str = ""
    source: str = "manual"


class OutreachIn(BaseModel):
    trader_id: str
    channel: str = "telegram"
    message: str = ""
    outcome: str = "sent"


class BackupIn(BaseModel):
    note: str = ""


class RestoreIn(BaseModel):
    backup_id: str


def _device(device_id: str | None, device_token: str | None) -> str:
    settings = get_settings()
    cloud = get_cloud_store()
    if not settings.require_device_auth:
        # Day-1 mode: allow anonymous cloud writes bound to optional device id.
        return device_id or "anon_device"
    if not device_id or not device_token or not cloud.auth_device(device_id, device_token):
        raise HTTPException(401, detail="device auth required")
    return device_id


@router.post("/devices/register")
async def register_device(body: DeviceIn) -> dict[str, Any]:
    cloud = get_cloud_store()
    return cloud.register_device(body.name)


@router.get("/status")
async def cloud_status() -> dict[str, Any]:
    cloud = get_cloud_store()
    traders = cloud.list_traders()
    settings = get_settings()
    return {
        "cloud": "up",
        "storage": settings.cloud_database_url.split(":", 1)[0],
        "n_traders": len(traders),
        "require_device_auth": settings.require_device_auth,
        "public_base_url": settings.public_base_url or None,
        "phase": "data_alerts_traders_crm",
        "custody": False,
        "execution": False,
    }


@router.post("/seed")
async def seed_demo() -> dict[str, Any]:
    cloud = get_cloud_store()
    n = cloud.seed_demo_traders()
    dedupe = cloud.dedupe_traders()
    return {"seeded": n, "dedupe": dedupe}


@router.post("/dedupe")
async def dedupe_traders() -> dict[str, Any]:
    return get_cloud_store().dedupe_traders()


@router.get("/traders")
async def list_traders(q: str = "", status: str = "", city: str = "") -> dict[str, Any]:
    items = get_cloud_store().list_traders(q=q, status=status, city=city)
    return {"items": items, "count": len(items)}


@router.post("/traders")
async def upsert_trader(
    body: TraderIn,
    x_device_id: str | None = Header(default=None),
    x_device_token: str | None = Header(default=None),
) -> dict[str, Any]:
    owner = _device(x_device_id, x_device_token)
    row = get_cloud_store().upsert_trader(body.model_dump(), owner_device_id=owner)
    return {"ok": True, "trader": row}


@router.get("/traders/{trader_id}")
async def get_trader(trader_id: str) -> dict[str, Any]:
    row = get_cloud_store().get_trader(trader_id)
    if not row:
        raise HTTPException(404, detail="trader_not_found")
    return row


@router.delete("/traders/{trader_id}")
async def delete_trader(trader_id: str) -> dict[str, Any]:
    ok = get_cloud_store().delete_trader(trader_id)
    if not ok:
        raise HTTPException(404, detail="trader_not_found")
    return {"ok": True}


@router.post("/outreach")
async def add_outreach(
    body: OutreachIn,
    x_device_id: str | None = Header(default=None),
    x_device_token: str | None = Header(default=None),
) -> dict[str, Any]:
    owner = _device(x_device_id, x_device_token)
    try:
        row = get_cloud_store().add_outreach(
            body.trader_id, body.channel, body.message, body.outcome, owner
        )
    except KeyError:
        raise HTTPException(404, detail="trader_not_found") from None
    return {"ok": True, "outreach": row}


@router.get("/outreach")
async def list_outreach(trader_id: str | None = None) -> dict[str, Any]:
    return {"items": get_cloud_store().list_outreach(trader_id)}


@router.post("/backup")
async def backup(
    body: BackupIn,
    x_device_id: str | None = Header(default=None),
    x_device_token: str | None = Header(default=None),
) -> dict[str, Any]:
    owner = _device(x_device_id, x_device_token)
    return get_cloud_store().create_backup(owner, note=body.note)


@router.post("/restore")
async def restore(
    body: RestoreIn,
    x_device_id: str | None = Header(default=None),
    x_device_token: str | None = Header(default=None),
) -> dict[str, Any]:
    owner = _device(x_device_id, x_device_token)
    try:
        return get_cloud_store().restore_backup(body.backup_id, owner_device_id=owner)
    except KeyError:
        raise HTTPException(404, detail="backup_not_found") from None


@router.get("/export")
async def export_all() -> dict[str, Any]:
    return get_cloud_store().export_all()