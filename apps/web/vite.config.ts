import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "مؤمن — مؤشر الصرف",
        short_name: "مؤمن",
        description: "مؤشر مرجعي شفاف لأسعار Bankak-SDG و MTN-MoMo-RWF",
        lang: "ar",
        dir: "rtl",
        theme_color: "#0B3D2E",
        background_color: "#071A14",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/v1": "http://127.0.0.1:8787",
      "/health": "http://127.0.0.1:8787",
    },
  },
  preview: {
    host: true,
    port: 4173,
  },
});
