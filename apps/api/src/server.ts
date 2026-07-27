import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8787);
const { app } = createApp();

app.listen(port, "0.0.0.0", () => {
  console.log(`Motman FX API listening on http://0.0.0.0:${port}`);
  console.log("Phase 1: data & alerts only — no custody, no auto-FX");
});
