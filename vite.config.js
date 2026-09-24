import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { rmbg2Lab } from './scripts/rmbg2-vite-plugin.mjs'

export default defineConfig({
  base: './',
  // `rmbg2Lab` is `apply: 'serve'`, so it adds /rmbg2 to `npm run dev` only and
  // never reaches a production build.
  plugins: [vue(), rmbg2Lab()],
  server: {
    port: 5173,
    open: true,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@huggingface/transformers')) {
            return 'transformers-engine'
          }
          if (id.includes('lucide-vue-next')) {
            return 'ui-icons'
          }
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        }
      }
    }
  }
})
