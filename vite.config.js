// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const API_TARGET = process.env.VITE_DEV_API || 'http://127.0.0.1:8000'
// Use relative paths for Electron build, absolute for Vercel
const isElectron = process.env.BUILD_TARGET === 'electron'

export default defineConfig({
  base: isElectron ? './' : '/',   // './' for Electron, '/' for Vercel
  plugins: [react()],
  server: {
    port: parseInt(process.env.PORT) || 5173,
    proxy: {
      '/cxc':         { target: API_TARGET, changeOrigin: true },
      '/health':      { target: API_TARGET, changeOrigin: true },
      '/docs':        { target: API_TARGET, changeOrigin: true },
      '/openapi.json':{ target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'charts';
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('lucide')) return 'icons';
            if (id.includes('react-dom') || id.includes('react-router')) return 'react-vendor';
            if (id.includes('localforage') || id.includes('idb')) return 'storage';
            return 'vendor';
          }
        }
      }
    }
  },
})
