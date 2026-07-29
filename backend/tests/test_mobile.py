from httpx import ASGITransport, AsyncClient
import pytest

from app.main import app


@pytest.mark.asyncio
async def test_mobile_day_plan_and_download_info():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        plan = await client.get("/api/v1/mobile/day-plan")
        assert plan.status_code == 200
        body = plan.json()
        assert "steps" in body
        assert "queue" in body
        info = await client.get("/api/v1/mobile/download-info")
        assert info.status_code == 200
        body = info.json()
        assert "apk_url" in body
        assert body["apk_url"].startswith("http")
        assert "github" in body.get("apk_url_github", "") or "jsdelivr" in body["apk_url"]
        assert body["package"] == "com.motman.fx"
        stats = await client.get("/api/v1/mobile/stats")
        assert stats.status_code == 200
        assert "next_action" in stats.json()
        health = await client.get("/healthz")
        assert health.status_code == 200
        assert health.json()["ok"] is True
        # APK route must exist (200 if file present, 404 if not in CI without artifact)
        apk = await client.get("/api/v1/mobile/apk")
        assert apk.status_code in (200, 404)
        if apk.status_code == 200:
            assert apk.headers.get("content-type", "").startswith("application/")
            assert "motman.apk" in (apk.headers.get("content-disposition") or "")
