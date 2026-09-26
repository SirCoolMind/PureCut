import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { rmbg2Lab } from './scripts/rmbg2-vite-plugin.mjs'
import { resolveVersionInfo } from './scripts/version.mjs'

const versionInfo = resolveVersionInfo()

function versionJsonPlugin(info) {
  const payload = JSON.stringify(info, null, 2)
  return {
    name: 'purecut-version-json',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0] === '/version.json') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
          return res.end(payload)
        }
        next()
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload
      })
    }
  }
}

export default defineConfig({
  base: './',
  define: {
    __APP_BUILD_HASH__: JSON.stringify(versionInfo.hash),
    __APP_BUILD_TIME__: JSON.stringify(versionInfo.buildTime),
    __APP_VERSION__: JSON.stringify(versionInfo.version)
  },
  // `rmbg2Lab` is `apply: 'serve'`, so it adds /rmbg2 to `npm run dev` only and
  // never reaches a production build.
  plugins: [vue(), rmbg2Lab(), versionJsonPlugin(versionInfo)],
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
