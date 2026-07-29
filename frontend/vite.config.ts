import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'downloads/motman-qr.png', 'downloads/motman-apk-qr.png'],
      manifest: {
        name: 'مطمن — مؤشر الصرف الشفاف',
        short_name: 'مطمن',
        description: 'أسعار Bankak وMTN MoMo المرجعية دون دمج مضلل',
        theme_color: '#0b1f17',
        background_color: '#0b1f17',
        display: 'standalone',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/?v=5',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/downloads\//, /\/apk$/, /\.apk$/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /\/(api\/v1\/mobile\/apk|downloads\/.*\.apk)$/,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})