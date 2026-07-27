from httpx import ASGITransport, AsyncClient
import pytest

from app.main import app


@pytest.mark.asyncio
async def test_cloud_traders_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        st = await client.get("/api/v1/cloud/status")
        assert st.status_code == 200
        assert st.json()["cloud"] == "up"

        reg = await client.post("/api/v1/cloud/devices/register", json={"name": "test-phone"})
        assert reg.status_code == 200
        device = reg.json()

        created = await client.post(
            "/api/v1/cloud/traders",
            headers={
                "X-Device-Id": device["device_id"],
                "X-Device-Token": device["device_token"],
            },
            json={
                "display_name": "تاجر اختبار",
                "city": "Kigali",
                "rails": ["MTN-MoMo-RWF", "USDT"],
                "payment_methods": ["MTN Mobile Money"],
                "telegram": "@test_trader",
                "status": "lead",
            },
        )
        assert created.status_code == 200
        trader_id = created.json()["trader"]["id"]

        listed = await client.get("/api/v1/cloud/traders", params={"q": "اختبار"})
        assert listed.status_code == 200
        assert listed.json()["count"] >= 1

        out = await client.post(
            "/api/v1/cloud/outreach",
            headers={
                "X-Device-Id": device["device_id"],
                "X-Device-Token": device["device_token"],
            },
            json={
                "trader_id": trader_id,
                "channel": "telegram",
                "message": "hello",
                "outcome": "sent",
            },
        )
        assert out.status_code == 200

        bak = await client.post(
            "/api/v1/cloud/backup",
            headers={
                "X-Device-Id": device["device_id"],
                "X-Device-Token": device["device_token"],
            },
            json={"note": "test"},
        )
        assert bak.status_code == 200
        assert bak.json()["backup_id"].startswith("bk_")