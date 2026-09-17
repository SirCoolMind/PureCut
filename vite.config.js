import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  base: './',
  plugins: [vue()],
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
