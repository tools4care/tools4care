import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',  // <<--- Haz que los assets sean rutas relativas
  plugins: [react()],
})
