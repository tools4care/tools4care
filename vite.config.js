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
          // Vite's internal dynamic-import helper (a virtual module, not in
          // node_modules) was landing inside whichever vendor chunk Rollup
          // picked by default — which happened to be the heavy 'pdf' chunk,
          // forcing every route with a lazy import (including the public
          // storefront) to fetch jsPDF/html2canvas just to load its own code.
          // Giving it its own tiny chunk decouples it from that.
          if (id === '\0vite/preload-helper.js') return 'vite-helpers';
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-') || id.includes('victory')) return 'charts';
            if (id.includes('@supabase')) return 'supabase';
            if (id.includes('lucide')) return 'icons';
            if (id.includes('react-dom') || id.includes('react-router')) return 'react-vendor';
            if (id.includes('localforage') || id.includes('idb')) return 'storage';
            if (id.includes('jspdf') || id.includes('html2canvas')) return 'pdf';
            if (id.includes('@stripe')) return 'stripe';
            if (id.includes('qrcode') || id.includes('@zxing') || id.includes('quagga')) return 'scanning';
            if (id.includes('tesseract.js')) return 'ocr';
            if (id.includes('framer-motion')) return 'animation';
            if (id.includes('date-fns') || id.includes('dayjs')) return 'dates';
            if (id.includes('downshift')) return 'search-ui';
            if (id.includes('/uuid/')) return 'uuid';
            return 'vendor';
          }
        }
      }
    }
  },
})
