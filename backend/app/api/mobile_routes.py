from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/mobile", tags=["mobile"])

ROOT = Path(__file__).resolve().parents[3]
CANDIDATES = [
    ROOT / "frontend" / "public" / "downloads" / "motman.apk",
    ROOT / "backend" / "static" / "downloads" / "motman.apk",
    Path("/opt/cursor/artifacts/motman-debug.apk"),
]


def _apk_path() -> Path | None:
    for p in CANDIDATES:
        if p.exists():
            return p
    return None


@router.get("/download-info")
async def download_info():
    path = _apk_path()
    return {
        "apk_ready": bool(path),
        "apk_url": "/downloads/motman.apk",
        "qr_url": "/downloads/motman-qr.png",
        "apk_qr_url": "/downloads/motman-apk-qr.png",
        "package": "com.motman.fx",
        "size_bytes": path.stat().st_size if path else 0,
        "note": "debug APK for sideload — not Play Store signed",
    }


@router.get("/day-plan")
async def day_plan():
    return {
        "goal": "بناء شبكة تجار Bankak↔MoMo اليوم",
        "steps": [
            "ثبّت التطبيق (APK أو الشاشة الرئيسية)",
            "أضف 5 تجار حقيقيين",
            "أرسل رسائل التعارف لـ3 تجار",
            "اطلب سعرًا ملزمًا لـ100 ألف",
            "احفظ نسخة سحابية",
        ],
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
        ],
    }