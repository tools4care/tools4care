// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = process.env.VITE_DEV_API || 'http://127.0.0.1:8000'

export default defineConfig({
  base: './',                 // assets relativos: útil para servir estático en FastAPI o subrutas
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/cxc':         { target: API_TARGET, changeOrigin: true },
      '/health':      { target: API_TARGET, changeOrigin: true },
      '/docs':        { target: API_TARGET, changeOrigin: true },
      '/openapi.json':{ target: API_TARGET, changeOrigin: true },
    },
  },
})
