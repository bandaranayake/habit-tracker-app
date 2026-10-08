import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: resolve(root, 'src/renderer'),
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': resolve(root, 'src/renderer/src'),
      '@': resolve(root, 'src/renderer/src')
    }
  },
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true
  },
  server: {
    port: 5173,
    strictPort: true
  },
  clearScreen: false
})
