// vite.config.js

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // これだけだと弱い場合がある
      
      // ★追加: 積極的な更新設定
      workbox: {
        cleanupOutdatedCaches: true, // 古いキャッシュを削除
        skipWaiting: true,           // 待機せずに新しいSWを適用
        clientsClaim: true,          // 即座にページを制御
      },

      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'GeoVoice',
        short_name: 'GeoVoice',
        description: 'AIと音声で巡る、地球儀の旅',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})