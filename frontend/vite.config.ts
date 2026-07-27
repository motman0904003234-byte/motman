import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'مطمن — مؤشر الصرف الشفاف',
        short_name: 'مطمن',
        description: 'أسعار Bankak وMTN MoMo المرجعية دون دمج مضلل',
        theme_color: '#0b1f17',
        background_color: '#0b1f17',
        display: 'standalone',
        lang: 'ar',
        dir: 'rtl',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
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