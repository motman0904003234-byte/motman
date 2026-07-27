from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, MappedAsDataclass, Session, mapped_column, sessionmaker


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class DeviceRow(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), default="phone")
    token_hash: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TraderRow(Base):
    __tablename__ = "traders"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(128))
    city: Mapped[str] = mapped_column(String(64), default="Unknown")
    rails: Mapped[str] = mapped_column(Text, default="[]")  # JSON list
    payment_methods: Mapped[str] = mapped_column(Text, default="[]")
    telegram: Mapped[str] = mapped_column(String(128), default="")
    whatsapp: Mapped[str] = mapped_column(String(64), default="")
    phone_note: Mapped[str] = mapped_column(String(128), default="")  # optional, avoid full PII if possible
    anon_id: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(32), default="lead")  # lead|contacted|active|paused|blocked
    trust_score: Mapped[float] = mapped_column(Float, default=50)
    notes: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(64), default="manual")
    owner_device_id: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    synced: Mapped[bool] = mapped_column(Boolean, default=True)


class OutreachRow(Base):
    __tablename__ = "outreach"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    trader_id: Mapped[str] = mapped_column(String(64), index=True)
    channel: Mapped[str] = mapped_column(String(32), default="telegram")
    message: Mapped[str] = mapped_column(Text, default="")
    outcome: Mapped[str] = mapped_column(String(64), default="sent")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    owner_device_id: Mapped[str] = mapped_column(String(64), default="")


class CloudQuoteRow(Base):
    __tablename__ = "cloud_quotes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    from_rail: Mapped[str] = mapped_column(String(64))
    to_rail: Mapped[str] = mapped_column(String(64))
    amount: Mapped[float] = mapped_column(Float)
    label: Mapped[str] = mapped_column(String(64))
    fair_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    payload_json: Mapped[str] = mapped_column(Text)
    owner_device_id: Mapped[str] = mapped_column(String(64), default="")


class BackupRow(Base):
    __tablename__ = "backups"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    owner_device_id: Mapped[str] = mapped_column(String(64), default="")
    payload_json: Mapped[str] = mapped_column(Text)
    note: Mapped[str] = mapped_column(String(256), default="")


class CloudStore:
    """Durable app cloud. Uses DATABASE_URL (Postgres) when set, else local SQLite file."""

    def __init__(self, url: str = "sqlite:///./motman_cloud.db"):
        if url.startswith("sqlite+aiosqlite"):
            url = url.replace("sqlite+aiosqlite", "sqlite", 1)
        connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
        self.engine = create_engine(url, future=True, connect_args=connect_args)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(self.engine, expire_on_commit=False, future=True)

    @staticmethod
    def hash_token(token: str) -> str:
        return hashlib.sha256(token.encode()).hexdigest()

    def register_device(self, name: str = "phone") -> dict[str, str]:
        device_id = f"dev_{uuid4().hex[:12]}"
        token = secrets.token_urlsafe(24)
        with self.Session() as s:
            s.add(
                DeviceRow(
                    id=device_id,
                    name=name[:120],
                    token_hash=self.hash_token(token),
                )
            )
            s.commit()
        return {"device_id": device_id, "device_token": token, "name": name}

    def auth_device(self, device_id: str, token: str) -> bool:
        with self.Session() as s:
            row = s.get(DeviceRow, device_id)
            if not row:
                return False
            ok = secrets.compare_digest(row.token_hash, self.hash_token(token))
            if ok:
                row.last_seen = utcnow()
                s.commit()
            return ok

    def upsert_trader(self, data: dict[str, Any], owner_device_id: str = "") -> dict:
        tid = data.get("id") or f"tr_{uuid4().hex[:12]}"
        with self.Session() as s:
            row = s.get(TraderRow, tid)
            fields = {
                "display_name": data.get("display_name") or data.get("name") or "تاجر",
                "city": data.get("city") or "Unknown",
                "rails": json.dumps(data.get("rails") or [], ensure_ascii=False),
                "payment_methods": json.dumps(data.get("payment_methods") or [], ensure_ascii=False),
                "telegram": data.get("telegram") or "",
                "whatsapp": data.get("whatsapp") or "",
                "phone_note": data.get("phone_note") or "",
                "anon_id": data.get("anon_id") or "",
                "status": data.get("status") or "lead",
                "trust_score": float(data.get("trust_score") or 50),
                "notes": data.get("notes") or "",
                "source": data.get("source") or "manual",
                "owner_device_id": owner_device_id or data.get("owner_device_id") or "",
                "updated_at": utcnow(),
                "synced": True,
            }
            if row is None:
                row = TraderRow(id=tid, created_at=utcnow(), **fields)
                s.add(row)
            else:
                for k, v in fields.items():
                    setattr(row, k, v)
            s.commit()
            return self._trader_dict(row)

    def list_traders(self, q: str = "", status: str = "", city: str = "") -> list[dict]:
        with self.Session() as s:
            rows = s.scalars(select(TraderRow).order_by(TraderRow.updated_at.desc())).all()
            out = []
            for r in rows:
                if status and r.status != status:
                    continue
                if city and city.lower() not in r.city.lower():
                    continue
                if q:
                    blob = f"{r.display_name} {r.telegram} {r.whatsapp} {r.notes} {r.city}".lower()
                    if q.lower() not in blob:
                        continue
                out.append(self._trader_dict(r))
            return out

    def get_trader(self, trader_id: str) -> dict | None:
        with self.Session() as s:
            row = s.get(TraderRow, trader_id)
            return self._trader_dict(row) if row else None

    def delete_trader(self, trader_id: str) -> bool:
        with self.Session() as s:
            row = s.get(TraderRow, trader_id)
            if not row:
                return False
            s.delete(row)
            s.commit()
            return True

    def add_outreach(self, trader_id: str, channel: str, message: str, outcome: str, owner_device_id: str) -> dict:
        oid = f"out_{uuid4().hex[:12]}"
        with self.Session() as s:
            if not s.get(TraderRow, trader_id):
                raise KeyError("trader_not_found")
            row = OutreachRow(
                id=oid,
                trader_id=trader_id,
                channel=channel,
                message=message,
                outcome=outcome,
                owner_device_id=owner_device_id,
            )
            s.add(row)
            trader = s.get(TraderRow, trader_id)
            if trader and trader.status == "lead":
                trader.status = "contacted"
                trader.updated_at = utcnow()
            s.commit()
            return {
                "id": oid,
                "trader_id": trader_id,
                "channel": channel,
                "message": message,
                "outcome": outcome,
                "created_at": row.created_at.isoformat(),
            }

    def list_outreach(self, trader_id: str | None = None) -> list[dict]:
        with self.Session() as s:
            stmt = select(OutreachRow).order_by(OutreachRow.created_at.desc())
            rows = s.scalars(stmt).all()
            out = []
            for r in rows:
                if trader_id and r.trader_id != trader_id:
                    continue
                out.append(
                    {
                        "id": r.id,
                        "trader_id": r.trader_id,
                        "channel": r.channel,
                        "message": r.message,
                        "outcome": r.outcome,
                        "created_at": r.created_at.isoformat(),
                    }
                )
            return out

    def save_cloud_quote(self, request: dict, result: dict, owner_device_id: str = "") -> None:
        with self.Session() as s:
            s.add(
                CloudQuoteRow(
                    from_rail=str(request.get("from_rail") or ""),
                    to_rail=str(request.get("to_rail") or ""),
                    amount=float(request.get("amount") or 0),
                    label=str(result.get("label") or ""),
                    fair_rate=result.get("fair_rate"),
                    confidence=float(result.get("confidence") or 0),
                    payload_json=json.dumps({"request": request, "result": result}, ensure_ascii=False),
                    owner_device_id=owner_device_id,
                )
            )
            s.commit()

    def create_backup(self, owner_device_id: str, note: str = "") -> dict:
        with self.Session() as s:
            traders = [self._trader_dict(r) for r in s.scalars(select(TraderRow)).all()]
            outreach = [
                {
                    "id": r.id,
                    "trader_id": r.trader_id,
                    "channel": r.channel,
                    "message": r.message,
                    "outcome": r.outcome,
                    "created_at": r.created_at.isoformat(),
                }
                for r in s.scalars(select(OutreachRow)).all()
            ]
            payload = {
                "version": 1,
                "created_at": utcnow().isoformat(),
                "traders": traders,
                "outreach": outreach,
            }
            bid = f"bk_{uuid4().hex[:12]}"
            s.add(
                BackupRow(
                    id=bid,
                    owner_device_id=owner_device_id,
                    payload_json=json.dumps(payload, ensure_ascii=False),
                    note=note[:250],
                )
            )
            s.commit()
            return {"backup_id": bid, "n_traders": len(traders), "n_outreach": len(outreach)}

    def restore_backup(self, backup_id: str, owner_device_id: str = "") -> dict:
        with self.Session() as s:
            row = s.get(BackupRow, backup_id)
            if not row:
                raise KeyError("backup_not_found")
            payload = json.loads(row.payload_json)
        restored = 0
        for t in payload.get("traders") or []:
            self.upsert_trader(t, owner_device_id=owner_device_id)
            restored += 1
        return {"restored_traders": restored, "backup_id": backup_id}

    def export_all(self) -> dict:
        with self.Session() as s:
            traders = [self._trader_dict(r) for r in s.scalars(select(TraderRow)).all()]
            outreach = self.list_outreach()
            return {
                "version": 1,
                "exported_at": utcnow().isoformat(),
                "traders": traders,
                "outreach": outreach,
            }

    def seed_demo_traders(self) -> int:
        samples = [
            {
                "display_name": "تاجر خرطوم Bankak",
                "city": "Khartoum",
                "rails": ["Bankak-SDG", "USDT"],
                "payment_methods": ["Bankak"],
                "telegram": "@khartoum_p2p_demo",
                "status": "lead",
                "source": "seed",
                "notes": "عرض تجريبي — استبدله بتجار حقيقيين",
                "trust_score": 55,
            },
            {
                "display_name": "تاجر كيغالي MoMo",
                "city": "Kigali",
                "rails": ["MTN-MoMo-RWF", "USDT"],
                "payment_methods": ["MTN Mobile Money"],
                "telegram": "@kigali_momo_demo",
                "whatsapp": "+2507XXXXXXX",
                "status": "lead",
                "source": "seed",
                "notes": "عرض تجريبي للبحث والمراسلة",
                "trust_score": 60,
            },
            {
                "display_name": "Corridor Desk",
                "city": "Kigali",
                "rails": ["Bankak-SDG", "MTN-MoMo-RWF", "USDT"],
                "payment_methods": ["Bankak", "MTN Mobile Money"],
                "telegram": "@corridor_desk_demo",
                "status": "active",
                "source": "seed",
                "notes": "مسار كامل SDG→RWF",
                "trust_score": 70,
            },
        ]
        n = 0
        for s in samples:
            # avoid dupes by telegram
            existing = self.list_traders(q=s["telegram"])
            if existing:
                continue
            self.upsert_trader(s)
            n += 1
        return n

    @staticmethod
    def _trader_dict(r: TraderRow) -> dict:
        return {
            "id": r.id,
            "display_name": r.display_name,
            "city": r.city,
            "rails": json.loads(r.rails or "[]"),
            "payment_methods": json.loads(r.payment_methods or "[]"),
            "telegram": r.telegram,
            "whatsapp": r.whatsapp,
            "phone_note": r.phone_note,
            "anon_id": r.anon_id,
            "status": r.status,
            "trust_score": r.trust_score,
            "notes": r.notes,
            "source": r.source,
            "owner_device_id": r.owner_device_id,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }


_cloud_singleton: CloudStore | None = None


def get_cloud_store(url: str | None = None) -> CloudStore:
    global _cloud_singleton
    if _cloud_singleton is None:
        from app.config import get_settings

        settings = get_settings()
        _cloud_singleton = CloudStore(url or settings.cloud_database_url)
    return _cloud_singleton