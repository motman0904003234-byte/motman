import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_health_and_quote_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/v1/health")
        assert r.status_code == 200
        assert r.json()["custody"] is False

        m = await client.get("/api/v1/methodology")
        assert "ExecutableBid_RWF_USDT" in m.json()["executable_formula"]

        q = await client.post(
            "/api/v1/quote",
            json={
                "amount": 100000,
                "from_rail": "Bankak-SDG",
                "to_rail": "MTN-MoMo-RWF",
                "from_payment": "Bankak",
                "to_payment": "MTN Mobile Money",
            },
        )
        assert q.status_code == 200
        body = q.json()
        assert "display" in body
        assert body["display"]["confidence"] >= 0
        assert body["label"] in {
            "EXECUTABLE",
            "ESTIMATED_NON_EXECUTABLE",
            "NO_EXECUTABLE_LIQUIDITY",
        }


@pytest.mark.asyncio
async def test_reject_secretish_completed_payload():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.post(
            "/api/v1/traders/completed",
            json={
                "trades": [
                    {
                        "traded_at": "2026-07-27T12:00:00Z",
                        "base_asset": "USDT",
                        "quote_asset": "SDG",
                        "side": "SELL",
                        "quantity": 10,
                        "price": 600,
                        "total_amount": 6000,
                        "payment_method": "Bankak password=secret",
                        "status": "COMPLETED",
                        "trader_anon_id": "t_abc",
                    }
                ]
            },
        )
        assert r.status_code == 400


@pytest.mark.asyncio
async def test_business_forbids_paid_ranking():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/v1/business")
        assert "paid_influence_on_index_weight_or_ranking" in r.json()["forbidden"]