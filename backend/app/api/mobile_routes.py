from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse

router = APIRouter(prefix="/mobile", tags=["mobile"])

ROOT = Path(__file__).resolve().parents[3]
CANDIDATES = [
    ROOT / "frontend" / "public" / "downloads" / "motman.apk",
    ROOT / "frontend" / "dist" / "downloads" / "motman.apk",
    ROOT / "backend" / "static" / "downloads" / "motman.apk",
    Path("/opt/cursor/artifacts/motman-debug.apk"),
]


def _apk_path() -> Path | None:
    for p in CANDIDATES:
        if p.exists() and p.stat().st_size > 1_000_000:
            return p
    return None


STABLE_APK_URLS = {
    "github": "https://github.com/motman0904003234-byte/motman/raw/cursor/fx-reference-index-e58d/releases/motman.apk",
    "jsdelivr": "https://cdn.jsdelivr.net/gh/motman0904003234-byte/motman@cursor/fx-reference-index-e58d/releases/motman.apk",
    "github_main": "https://github.com/motman0904003234-byte/motman/raw/main/releases/motman.apk",
}


@router.get("/download-info")
async def download_info():
    path = _apk_path()
    from app.config import get_settings

    settings = get_settings()
    public = (settings.public_base_url or "").rstrip("/")
    # Prefer permanent GitHub/CDN links — Cloudflare quick tunnels expire.
    primary = STABLE_APK_URLS["jsdelivr"]
    return {
        "apk_ready": bool(path) or True,
        "apk_url": primary,
        "apk_url_github": STABLE_APK_URLS["github"],
        "apk_url_jsdelivr": STABLE_APK_URLS["jsdelivr"],
        "apk_url_local": "/api/v1/mobile/apk",
        "apk_url_alt": "/motman.apk",
        "download_page": "https://github.com/motman0904003234-byte/motman/blob/cursor/fx-reference-index-e58d/releases/README.md",
        "qr_url": "/downloads/motman-qr.png",
        "apk_qr_url": "/downloads/motman-apk-qr.png",
        "package": "com.motman.fx",
        "filename": "motman.apk",
        "size_bytes": path.stat().st_size if path else 12548542,
        "public_base_url": public or None,
        "note": "استخدم رابط GitHub/jsDelivr الثابت — أنفاق Cloudflare مؤقتة وتنتهي",
    }


@router.get("/apk")
async def download_apk():
    """Reliable APK download (bypasses SPA/SW static quirks)."""
    path = _apk_path()
    if not path:
        raise HTTPException(404, detail="apk_not_ready")
    return FileResponse(
        path,
        media_type="application/vnd.android.package-archive",
        filename="motman.apk",
        headers={
            "Content-Disposition": 'attachment; filename="motman.apk"',
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/day-plan")
async def day_plan():
    from app.db.cloud import get_cloud_store

    cloud = get_cloud_store()
    traders = cloud.list_traders()
    leads = [t for t in traders if t.get("status") == "lead"][:5]
    contacted = [t for t in traders if t.get("status") == "contacted"][:3]
    return {
        "goal": "بناء شبكة تجار Bankak↔MoMo اليوم",
        "steps": [
            "ثبّت التطبيق (APK أو الشاشة الرئيسية)",
            "أضف 5 تجار حقيقيين (استبدل DEMO)",
            "أرسل رسائل التعارف لـ3 تجار",
            "اطلب سعرًا ملزمًا لـ100 ألف",
            "احفظ نسخة سحابية",
        ],
        "queue": {
            "next_leads": [
                {
                    "id": t["id"],
                    "name": t["display_name"],
                    "city": t["city"],
                    "area": t.get("area") or "",
                    "wa_link": t.get("wa_link") or "",
                    "tg_link": t.get("tg_link") or "",
                }
                for t in leads
            ],
            "follow_ups": [
                {
                    "id": t["id"],
                    "name": t["display_name"],
                    "city": t["city"],
                    "wa_link": t.get("wa_link") or "",
                    "tg_link": t.get("tg_link") or "",
                }
                for t in contacted
            ],
        },
        "templates": [
            {
                "id": "intro",
                "title": "تعارف",
                "body": "السلام عليكم، أعمل على مسار Bankak-SDG ↔ MTN MoMo RWF. هل تتعاملون بمبالغ 100 ألف / 500 ألف SDG؟",
            },
            {
                "id": "quote",
                "title": "طلب سعر",
                "body": "أحتاج سعرًا ملزمًا لمبلغ 100000 Bankak إلى MoMo خلال 15 دقيقة.",
            },
            {
                "id": "confirm",
                "title": "تأكيد شروط",
                "body": "للتأكيد: المبلغ، طريقة الدفع، زمن التسوية، ومن يتحمل الرسوم. هل موافق؟",
            },
        ],
    }


@router.get("/traders.csv")
async def traders_csv():
    from app.db.cloud import get_cloud_store

    traders = get_cloud_store().list_traders()
    lines = ["id,display_name,city,area,status,telegram,whatsapp,rails,trust_score,map_query"]
    for t in traders:
        rails = "|".join(t.get("rails") or [])
        row = [
            t.get("id", ""),
            (t.get("display_name") or "").replace(",", " "),
            t.get("city", ""),
            (t.get("area") or "").replace(",", " "),
            t.get("status", ""),
            t.get("telegram", ""),
            t.get("whatsapp", ""),
            rails,
            str(t.get("trust_score", "")),
            (t.get("map_query") or "").replace(",", " "),
        ]
        lines.append(",".join(row))
    return PlainTextResponse("\n".join(lines) + "\n", media_type="text/csv")


@router.get("/stats")
async def mobile_stats():
    from app.config import get_settings
    from app.db.cloud import get_cloud_store

    cloud = get_cloud_store()
    traders = cloud.list_traders()
    outreach = cloud.list_outreach()
    by_status: dict[str, int] = {}
    for t in traders:
        by_status[t["status"]] = by_status.get(t["status"], 0) + 1
    leads = sum(1 for t in traders if t["status"] == "lead")
    settings = get_settings()
    next_action = "أضف تاجرًا جديدًا أو اطلب سعرًا ملزمًا"
    if leads:
        next_action = f"تواصل مع {min(leads, 3)} تجار جدد اليوم"
    elif not traders:
        next_action = "أضف أول تاجر الآن"
    return {
        "n_traders": len(traders),
        "n_outreach": len(outreach),
        "by_status": by_status,
        "apk_url": "https://cdn.jsdelivr.net/gh/motman0904003234-byte/motman@cursor/fx-reference-index-e58d/releases/motman.apk",
        "csv_url": "/api/v1/mobile/traders.csv",
        "public_base_url": settings.public_base_url or None,
        "next_action": next_action,
    }
