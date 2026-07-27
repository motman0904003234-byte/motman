import { createApp } from "./app.js";

const { market } = createApp();
market.seedDemoMarket();
market.seedExecutableDemo();
console.log("Seeded demo + executable markets (synthetic, labeled).");
console.log(JSON.stringify(market.snapshot(), null, 2));
