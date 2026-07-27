# تشغيل محلي

```bash
npm install
npm run build -w @motman/shared
npm run build -w @motman/core
npm run build -w @motman/adapters
npm run seed -w @motman/api
npm run dev:api
npm run dev:web
```

بوت Telegram:

```bash
export TELEGRAM_BOT_TOKEN=...
export MOTMAN_API_BASE=http://127.0.0.1:8787
npm run dev:bot
```

موصل التاجر المحلي:

```bash
cd apps/trader-connector
npx tsx src/index.ts init --key READ_ONLY_KEY --secret READ_ONLY_SECRET
npx tsx src/index.ts sync
# أو
npx tsx src/index.ts import-file ./sample-trades.json
```
