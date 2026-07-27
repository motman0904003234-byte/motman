from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from app.api.routes import router
from app.api.cloud_routes import router as cloud_router
from app.config import get_settings
from app.db.cloud import get_cloud_store
from app.services.market import market_service


@asynccontextmanager
async def lifespan(_: FastAPI):
    await market_service.refresh()
    # Ensure cloud schema + a few starter traders for day-1 fieldwork
    cloud = get_cloud_store()
    cloud.seed_demo_traders()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=settings.app_name,
        version="0.2.0",
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

    dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if dist.exists():
        assets = dist / "assets"
        if assets.exists():
            app.mount("/assets", StaticFiles(directory=assets), name="assets")

        @app.get("/")
        async def spa_index():
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