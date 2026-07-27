#!/usr/bin/env python3
"""Local-only Binance C2C trade history connector.

SECURITY CONTRACT:
- API secret NEVER leaves this machine.
- Only COMPLETED anonymized fields are POSTed to Motman.
- Read-only intent: do not request withdraw/trade permissions.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode

import httpx


ALLOWED_FIELDS = {
    "traded_at",
    "base_asset",
    "quote_asset",
    "side",
    "quantity",
    "price",
    "total_amount",
    "payment_method",
    "fees",
    "status",
    "trader_anon_id",
}


def anon_id(local_salt: str, user_hint: str) -> str:
    return "t_" + hashlib.sha256(f"{local_salt}:{user_hint}".encode()).hexdigest()[:16]


def sign(secret: str, query: str) -> str:
    return hmac.new(secret.encode(), query.encode(), hashlib.sha256).hexdigest()


def fetch_binance_c2c(api_key: str, api_secret: str) -> list[dict]:
    """Best-effort C2C history pull. If endpoint/permissions unavailable, return []."""
    base = "https://api.binance.com"
    # Binance C2C endpoints vary; connector keeps failure soft and local.
    timestamp = int(time.time() * 1000)
    params = {"timestamp": timestamp, "recvWindow": 5000}
    query = urlencode(params)
    params["signature"] = sign(api_secret, query)
    headers = {"X-MBX-APIKEY": api_key}
    try:
        with httpx.Client(timeout=20.0) as client:
            # Placeholder endpoint — operators should configure a working read-only route.
            r = client.get(f"{base}/sapi/v1/c2c/orderMatch/listUserOrderHistory", params=params, headers=headers)
            if r.status_code != 200:
                return []
            data = r.json()
            rows = data.get("data") or data.get("rows") or []
            return rows if isinstance(rows, list) else []
    except Exception:
        return []


def normalize_rows(rows: list[dict], trader_anon_id: str) -> list[dict]:
    out = []
    for row in rows:
        status = str(row.get("orderStatus") or row.get("status") or "").upper()
        if status not in {"COMPLETED", "FINISHED", "SUCCESS"} and status != "COMPLETED":
            # accept only completed synonyms
            if status != "COMPLETED":
                continue
        try:
            trade = {
                "traded_at": datetime.fromtimestamp(
                    int(row.get("createTime") or row.get("time") or time.time() * 1000) / 1000,
                    tz=timezone.utc,
                ).isoformat(),
                "base_asset": row.get("asset") or row.get("baseAsset") or "USDT",
                "quote_asset": row.get("fiat") or row.get("quoteAsset") or "SDG",
                "side": "BUY" if str(row.get("tradeType") or row.get("side") or "").upper() in {"BUY", "B"} else "SELL",
                "quantity": float(row.get("amount") or row.get("quantity") or 0),
                "price": float(row.get("price") or 0),
                "total_amount": float(row.get("totalPrice") or row.get("total_amount") or 0),
                "payment_method": str(row.get("payType") or row.get("payment_method") or "Unknown"),
                "fees": float(row.get("commission") or row.get("fees") or 0),
                "status": "COMPLETED",
                "trader_anon_id": trader_anon_id,
            }
        except Exception:
            continue
        if trade["quantity"] <= 0 or trade["price"] <= 0:
            continue
        # strip anything outside allowlist
        out.append({k: trade[k] for k in ALLOWED_FIELDS})
    return out


def load_fixture(path: Path, trader_anon_id: str) -> list[dict]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    for row in rows:
        row["trader_anon_id"] = trader_anon_id
        row["status"] = "COMPLETED"
    return [{k: r[k] for k in ALLOWED_FIELDS if k in r} for r in rows]


def main() -> None:
    parser = argparse.ArgumentParser(description="Motman local C2C connector")
    parser.add_argument("--api-url", default="http://127.0.0.1:8000/api/v1/traders/completed")
    parser.add_argument("--fixture", type=Path, default=None, help="Local JSON fixture instead of live Binance")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    api_key = os.getenv("BINANCE_API_KEY", "")
    api_secret = os.getenv("BINANCE_API_SECRET", "")
    salt = os.getenv("MOTMAN_LOCAL_SALT", "local-dev-salt")
    hint = os.getenv("MOTMAN_TRADER_HINT", "local-trader")
    tid = anon_id(salt, hint)

    if args.fixture:
        trades = load_fixture(args.fixture, tid)
    elif api_key and api_secret:
        raw = fetch_binance_c2c(api_key, api_secret)
        trades = normalize_rows(raw, tid)
        # secret used only locally for signing; never serialized
        del api_secret
    else:
        print("No fixture or API keys. Refusing to invent trades.")
        return

    payload = {"trades": trades}
    print(json.dumps({"count": len(trades), "sample": trades[:2]}, ensure_ascii=False, indent=2))
    if args.dry_run:
        return
    with httpx.Client(timeout=20.0) as client:
        r = client.post(args.api_url, json=payload)
        print(r.status_code, r.text)


if __name__ == "__main__":
    main()