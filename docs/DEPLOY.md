# Deploy Motman (API + Arabic PWA)

## Quick local / demo tunnel
```bash
./scripts/start_mobile.sh   # or keepalive
# PUBLIC URL written to /opt/cursor/artifacts/MOBILE_URLS.txt
```

## Docker (recommended for a VPS)
```bash
docker compose -f docker-compose.prod.yml up -d --build
# optional Postgres:
# CLOUD_DATABASE_URL=postgresql+psycopg://motman:motman@db:5432/motman \
#   docker compose -f docker-compose.prod.yml --profile postgres up -d --build
```

## Environment
| Variable | Purpose |
|---|---|
| `PUBLIC_BASE_URL` | Public https origin for QR / status |
| `CLOUD_DATABASE_URL` | Traders CRM (SQLite or Postgres) |
| `DATABASE_URL` | Quotes / audit store |
| `REQUIRE_DEVICE_AUTH` | `true` after day-1 |
| `USE_DEMO_MARKET` | Synthetic books when live C2C unavailable |
| `ENABLE_LIVE_BINANCE` | Optional live P2P ads (still no custody) |

## Phone
1. Open `PUBLIC_BASE_URL` → Add to Home Screen, or install APK from `/downloads/motman.apk`
2. Settings → set API base to `PUBLIC_BASE_URL/api/v1`
3. Today tab → contact queue → WhatsApp traders
