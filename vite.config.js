import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cesium from 'vite-plugin-cesium'; // 追加

export default defineConfig({
  plugins: [
    react(), 
    cesium() // 追加
  ],
})