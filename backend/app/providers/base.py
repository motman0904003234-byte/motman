from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from typing import Iterable

from app.domain.enums import City, QuoteKind, Rail, Side
from app.domain.models import Quote


class ProviderAdapter(ABC):
    name: str
    tos_note: str = ""

    @abstractmethod
    async def fetch_quotes(self) -> list[Quote]:
        raise NotImplementedError

    def source_health(self, quotes: list[Quote], now: datetime | None = None) -> dict:
        now = now or datetime.now(timezone.utc)
        if not quotes:
            return {"provider": self.name, "status": "DOWN", "age_seconds": None}
        last = max(q.observed_at for q in quotes)
        age = (now - last).total_seconds()
        status = "LIVE" if age <= 120 else "STALE" if age <= 600 else "DOWN"
        return {"provider": self.name, "status": status, "age_seconds": age, "n": len(quotes)}


class BinanceP2PAdapter(ProviderAdapter):
    """Public ads adapter.

    Uses official Binance P2P public market endpoint when network/ToS allow.
    Falls back to injected snapshots; never relies on unofficial scrapers as sole source.
    """

    name = "binance_p2p"
    tos_note = "Respect Binance API ToS; read-only market data only."

    def __init__(self, snapshot: Iterable[Quote] | None = None, enable_live: bool = False):
        self.snapshot = list(snapshot or [])
        self.enable_live = enable_live

    async def fetch_quotes(self) -> list[Quote]:
        if self.enable_live:
            live = await self._fetch_live()
            if live:
                return live
        return list(self.snapshot)

    async def _fetch_live(self) -> list[Quote]:
        # Optional live pull — disabled by default in CI/offline.
        try:
            import httpx

            out: list[Quote] = []
            specs = [
                ("USDT", "SDG", "Bank of Khartoum", Rail.BANKAK_SDG),
                ("USDT", "RWF", "MTN Mobile Money", Rail.MTN_MOMO_RWF),
            ]
            async with httpx.AsyncClient(timeout=8.0) as client:
                for asset, fiat, pay, rail in specs:
                    for trade_type in ("BUY", "SELL"):
                        payload = {
                            "asset": asset,
                            "fiat": fiat,
                            "merchantCheck": False,
                            "page": 1,
                            "rows": 10,
                            "tradeType": trade_type,
                            "payTypes": [pay] if fiat == "RWF" else [],
                        }
                        r = await client.post(
                            "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
                            json=payload,
                        )
                        if r.status_code != 200:
                            continue
                        data = r.json().get("data") or []
                        for row in data:
                            adv = row.get("adv") or {}
                            advertiser = row.get("advertiser") or {}
                            try:
                                price = float(adv.get("price"))
                                surplus = float(adv.get("surplusAmount") or adv.get("tradableQuantity") or 0)
                            except (TypeError, ValueError):
                                continue
                            if surplus <= 0:
                                continue
                            anon = f"bnz-{advertiser.get('userNo', 'x')[:10]}"
                            out.append(
                                Quote(
                                    provider=self.name,
                                    kind=QuoteKind.PUBLIC_AD,
                                    base_rail=Rail.USDT,
                                    quote_rail=rail,
                                    side=Side.BUY if trade_type == "BUY" else Side.SELL,
                                    price=price,
                                    amount_base=surplus,
                                    available_amount_base=surplus,
                                    payment_method=pay if fiat == "RWF" else "Bankak",
                                    trader_anon_id=anon,
                                    completion_rate=float(advertiser.get("monthFinishRate") or 0) or None,
                                    rating=None,
                                    observed_at=datetime.now(timezone.utc),
                                    raw_ref=str(adv.get("advNo")),
                                )
                            )
            return out
        except Exception:
            return []


class OfficialBankAdapter(ProviderAdapter):
    """Official rates for anomaly detection only — never forced as executable price."""

    name = "official_rates"
    tos_note = "Official CBOS/BNR/bank pages; used for QA gates only."

    def __init__(self, sdg_per_usd: float | None = None, rwf_per_usd: float | None = None):
        self.sdg_per_usd = sdg_per_usd
        self.rwf_per_usd = rwf_per_usd

    async def fetch_quotes(self) -> list[Quote]:
        now = datetime.now(timezone.utc)
        out: list[Quote] = []
        if self.sdg_per_usd:
            out.append(
                Quote(
                    provider="cbos_bok",
                    kind=QuoteKind.OFFICIAL,
                    base_rail=Rail.USD,
                    quote_rail=Rail.BANKAK_SDG,
                    side=Side.SELL,
                    price=self.sdg_per_usd,
                    amount_base=1,
                    available_amount_base=1,
                    payment_method="Official",
                    observed_at=now,
                )
            )
        if self.rwf_per_usd:
            out.append(
                Quote(
                    provider="bnr",
                    kind=QuoteKind.OFFICIAL,
                    base_rail=Rail.USD,
                    quote_rail=Rail.BANK_RWF,
                    side=Side.SELL,
                    price=self.rwf_per_usd,
                    amount_base=1,
                    available_amount_base=1,
                    payment_method="Official",
                    observed_at=now,
                )
            )
        return out


class ParallelMarketAdapter(ProviderAdapter):
    name = "parallel_sdg"
    tos_note = "Trusted parallel market feeds only; never sole executable source."

    def __init__(self, quotes: Iterable[Quote] | None = None):
        self.quotes = list(quotes or [])

    async def fetch_quotes(self) -> list[Quote]:
        return list(self.quotes)


class TraderRFQAdapter(ProviderAdapter):
    name = "trader_rfq"

    def __init__(self):
        self._quotes: list[Quote] = []

    def upsert(self, quotes: Iterable[Quote]) -> None:
        # Replace same trader+side+rail set
        incoming = list(quotes)
        keys = {(q.trader_anon_id, q.side, q.base_rail, q.quote_rail, q.payment_method) for q in incoming}
        self._quotes = [
            q
            for q in self._quotes
            if (q.trader_anon_id, q.side, q.base_rail, q.quote_rail, q.payment_method) not in keys
        ] + incoming

    async def fetch_quotes(self) -> list[Quote]:
        now = datetime.now(timezone.utc)
        return [q for q in self._quotes if (now - q.observed_at) <= timedelta(minutes=30)]


class TraderCompletedAdapter(ProviderAdapter):
    name = "trader_completed"

    def __init__(self):
        self._quotes: list[Quote] = []

    def ingest(self, quotes: Iterable[Quote]) -> int:
        n = 0
        existing = {q.raw_ref for q in self._quotes if q.raw_ref}
        for q in quotes:
            if q.kind != QuoteKind.COMPLETED_TRADE:
                continue
            if q.raw_ref and q.raw_ref in existing:
                continue
            self._quotes.append(q)
            n += 1
        return n

    async def fetch_quotes(self) -> list[Quote]:
        return list(self._quotes)


class CalibrationSeedAdapter(ProviderAdapter):
    name = "calibration_seed"

    async def fetch_quotes(self) -> list[Quote]:
        # Dated historical sample — NOT live.
        ts = datetime(2026, 7, 27, 12, 0, tzinfo=timezone.utc)
        # Theoretical cross components approximating 25587.78 RWF per 100k SDG
        # => 0.2558778 RWF per SDG. If SDG/USDT ask = 600 and RWF/USDT bid = 1535.2668
        # then 1535.2668/600 = 0.2558778.
        return [
            Quote(
                provider=self.name,
                kind=QuoteKind.CALIBRATION_SEED,
                base_rail=Rail.USDT,
                quote_rail=Rail.BANKAK_SDG,
                side=Side.SELL,
                price=600.0,
                amount_base=200,
                available_amount_base=200,
                payment_method="Bankak",
                city=City.KHARTOUM,
                trader_anon_id="calib-sdg",
                observed_at=ts,
                is_synthetic=False,
                raw_ref="calib-2026-07-27-sdg",
            ),
            Quote(
                provider=self.name,
                kind=QuoteKind.CALIBRATION_SEED,
                base_rail=Rail.USDT,
                quote_rail=Rail.MTN_MOMO_RWF,
                side=Side.BUY,
                price=1535.2668,
                amount_base=200,
                available_amount_base=200,
                payment_method="MTN Mobile Money",
                city=City.KIGALI,
                trader_anon_id="calib-rwf",
                observed_at=ts,
                raw_ref="calib-2026-07-27-rwf",
            ),
        ]


class CompositeProvider:
    def __init__(self, adapters: list[ProviderAdapter]):
        self.adapters = adapters

    async def fetch_all(self) -> tuple[list[Quote], list[dict]]:
        all_quotes: list[Quote] = []
        health: list[dict] = []
        for adapter in self.adapters:
            try:
                qs = await adapter.fetch_quotes()
            except Exception as exc:  # noqa: BLE001
                health.append({"provider": adapter.name, "status": "DOWN", "error": str(exc)})
                continue
            all_quotes.extend(qs)
            health.append({**adapter.source_health(qs), "tos": adapter.tos_note})
        return all_quotes, health