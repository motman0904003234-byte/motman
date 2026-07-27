from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import DateTime, Float, Integer, String, Text, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


class Base(DeclarativeBase):
    pass


class QuoteHistoryRow(Base):
    __tablename__ = "quote_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    from_rail: Mapped[str] = mapped_column(String(64))
    to_rail: Mapped[str] = mapped_column(String(64))
    amount: Mapped[float] = mapped_column(Float)
    label: Mapped[str] = mapped_column(String(64))
    fair_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    payload_json: Mapped[str] = mapped_column(Text)


class AuditRow(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    event: Mapped[str] = mapped_column(String(128))
    payload_json: Mapped[str] = mapped_column(Text)


class Store:
    def __init__(self, url: str = "sqlite:///./motman.db"):
        # sync engine for simplicity/reliability in this phase
        if url.startswith("sqlite+aiosqlite"):
            url = url.replace("sqlite+aiosqlite", "sqlite", 1)
        self.engine = create_engine(url, future=True)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(self.engine, expire_on_commit=False)

    def save_quote(self, request: dict, result: dict) -> None:
        with self.Session() as s:
            s.add(
                QuoteHistoryRow(
                    from_rail=request.get("from_rail", ""),
                    to_rail=request.get("to_rail", ""),
                    amount=float(request.get("amount") or 0),
                    label=str(result.get("label") or ""),
                    fair_rate=result.get("fair_rate"),
                    confidence=float(result.get("confidence") or 0),
                    payload_json=json.dumps({"request": request, "result": result}, ensure_ascii=False),
                )
            )
            s.commit()

    def save_audit(self, event: str, payload: dict | None = None) -> None:
        with self.Session() as s:
            s.add(
                AuditRow(
                    event=event,
                    payload_json=json.dumps(payload or {}, ensure_ascii=False),
                )
            )
            s.commit()

    def list_history(self, limit: int = 100) -> list[dict]:
        with self.Session() as s:
            rows = (
                s.query(QuoteHistoryRow)
                .order_by(QuoteHistoryRow.id.desc())
                .limit(limit)
                .all()
            )
            out = []
            for r in reversed(rows):
                payload = json.loads(r.payload_json)
                out.append({"ts": r.ts.isoformat(), **payload})
            return out

    def list_audit(self, limit: int = 200) -> list[dict]:
        with self.Session() as s:
            rows = s.query(AuditRow).order_by(AuditRow.id.desc()).limit(limit).all()
            return [
                {
                    "ts": r.ts.isoformat(),
                    "event": r.event,
                    "payload": json.loads(r.payload_json),
                }
                for r in reversed(rows)
            ]