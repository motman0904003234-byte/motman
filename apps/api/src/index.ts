import { buildServer } from "./server.js";

const port = Number(process.env.PORT ?? 8787);
const app = await buildServer();
await app.listen({ port, host: "0.0.0.0" });
console.log(`Motman API on http://0.0.0.0:${port}`);
