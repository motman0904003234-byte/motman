from httpx import ASGITransport, AsyncClient
import pytest

from app.main import app


@pytest.mark.asyncio
async def test_mobile_day_plan_and_download_info():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        plan = await client.get("/api/v1/mobile/day-plan")
        assert plan.status_code == 200
        assert "steps" in plan.json()
        info = await client.get("/api/v1/mobile/download-info")
        assert info.status_code == 200
        body = info.json()
        assert "apk_url" in body
        assert body["package"] == "com.motman.fx"