from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.cloud_routes import router as cloud_router
from app.api.mobile_routes import router as mobile_router
from app.api.routes import router
from app.config import get_settings
from app.db.cloud import get_cloud_store
from app.services.market import market_service


@asynccontextmanager
async def lifespan(_: FastAPI):
    await market_service.refresh()
    cloud = get_cloud_store()
    cloud.seed_demo_traders()
    cloud.dedupe_traders()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.4.0",
        lifespan=lifespan,
        description=(
            "مؤشر مرجعي شفاف لمسارات الصرف Bankak-SDG / Cash-SDG / "
            "MTN-MoMo-RWF / Bank-RWF دون دمج مضلل — مع سحابة تجار للجوال."
        ),
    )
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router, prefix=settings.api_prefix)
    app.include_router(cloud_router, prefix=settings.api_prefix)
    app.include_router(mobile_router, prefix=settings.api_prefix)

    @app.get("/healthz")
    @app.get("/health")
    async def healthz():
        return {"ok": True, "service": "motman", "version": "0.4.0"}

    dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    downloads_public = Path(__file__).resolve().parents[2] / "frontend" / "public" / "downloads"
    downloads_dist = dist / "downloads"
    downloads_dir = downloads_dist if downloads_dist.exists() else downloads_public
    artifact_apk = Path("/opt/cursor/artifacts/motman-debug.apk")

    def _resolve_apk() -> Path | None:
        for p in [
            downloads_public / "motman.apk",
            downloads_dist / "motman.apk",
            artifact_apk,
        ]:
            if p.exists() and p.stat().st_size > 1_000_000:
                return p
        return None

    @app.get("/download")
    @app.get("/download/apk")
    @app.get("/motman.apk")
    async def download_apk_short():
        from fastapi import HTTPException

        path = _resolve_apk()
        if not path:
            raise HTTPException(404, detail="apk_not_ready")
        return FileResponse(
            path,
            media_type="application/vnd.android.package-archive",
            filename="motman.apk",
            headers={
                "Content-Disposition": 'attachment; filename="motman.apk"',
                "Cache-Control": "no-store",
            },
        )

    if downloads_dir.exists():
        app.mount("/downloads", StaticFiles(directory=downloads_dir), name="downloads")

    if dist.exists():
        assets = dist / "assets"
        if assets.exists():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/")
        async def spa_index():
            return FileResponse(dist / "index.html")

        @app.get("/download.html")
        async def download_page():
            page = dist / "download.html"
            if page.exists():
                return FileResponse(page)
            return FileResponse(dist / "index.html")

        @app.get("/favicon.svg")
        async def favicon():
            return FileResponse(dist / "favicon.svg")

        @app.get("/manifest.webmanifest")
        async def manifest():
            return FileResponse(dist / "manifest.webmanifest")

        @app.get("/runtime-config.json")
        async def runtime_config():
            cfg = dist / "runtime-config.json"
            if cfg.exists():
                return FileResponse(cfg)
            return {"apiBase": "/api/v1"}

        sw = dist / "sw.js"
        if sw.exists():

            @app.get("/sw.js")
            async def service_worker():
                return FileResponse(sw)

    return app


app = create_app()
