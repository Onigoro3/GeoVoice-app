import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 依存関係の最適化設定を追加
  optimizeDeps: {
    include: ['mapbox-gl', 'react-map-gl'],
  },
  resolve: {
    alias: {
      // Mapboxを正しく認識させるためのエイリアス
      'mapbox-gl': 'mapbox-gl',
    }
  }
})