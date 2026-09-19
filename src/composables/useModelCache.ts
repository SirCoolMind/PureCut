/**
 * Model cache bookkeeping: which model weights are already in the browser, how
 * much space they take, and the "clear everything" escape hatch.
 *
 * Transformers.js caches weights in three separate places, and clearing has to hit
 * all of them, in order:
 *   1. the in-memory model instances (`resetLoadedModels`)
 *   2. the CacheStorage API
 *   3. the IndexedDB databases used by ONNX
 * plus the per-model `localStorage` flags this app maintains itself.
 *
 * `cachedModels` is a flat `{ [modelId]: boolean }` map. It is deeply reactive on
 * purpose - `processImage()` and `handlePreload()` both flip entries in place
 * (`cachedModels[id] = true`) rather than reassigning the object.
 *
 * `checkModelCacheStatus()` is called on mount and after a clear; it reads the
 * `localStorage` flags and then asks `navigator.storage.estimate()` for the real
 * usage, which is why it is async and why its failures are only warned about -
 * the estimate is a nicety, not a requirement.
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; no
 * behaviour was changed.
 */

import { computed, reactive, ref, type Ref } from 'vue'
import { resetLoadedModels } from '../aiEngine.js'
import { modelOptions } from '../constants.js'
import { cachedModelKey } from '../core/storageKeys.js'
import { formatBytes } from '../core/format.js'

interface ModelCacheDeps {
  /** Transient status line; clearAllCache() reports success through it. */
  statusMessage: Ref<string>
  /** Which model's cache state `currentModelCached` / `currentModelMeta` describe. */
  selectedModel: Ref<string>
}

export function useModelCache({ statusMessage, selectedModel }: ModelCacheDeps) {
  /** `{ [modelId]: alreadyDownloaded }`. Mutated in place by processImage/handlePreload. */
  const cachedModels = reactive<Record<string, boolean>>(
    modelOptions.reduce((acc: Record<string, boolean>, m: any) => {
      acc[m.id] = false;
      return acc;
    }, {})
  )

  /** Real bytes used by the CacheStorage/IndexedDB caches, as reported by the browser. */
  const cacheUsageBytes = ref(0)
  /** Guards against a second clear while one is running. */
  const isClearingCache = ref(false)

  async function checkModelCacheStatus() {
    modelOptions.forEach(m => {
      const isCached = localStorage.getItem(cachedModelKey(m.id)) === 'true'
      cachedModels[m.id] = isCached
    })

    // Measure actual browser storage usage if supported
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate()
        cacheUsageBytes.value = estimate.usage || 0
      } catch (e) {
        console.warn('Storage estimate failed:', e)
      }
    }
  }

  /**
   * Storage estimate, unless it is too small to be meaningful - browsers report
   * tens of KB of unrelated overhead even with nothing cached, so under 50 KB the
   * answer is derived from the cache flags instead.
   */
  const formattedCacheUsage = computed(() => {
    if (!cacheUsageBytes.value || cacheUsageBytes.value < 50000) { // Ignore < 50KB overhead
      const anyCached = Object.values(cachedModels).some(v => v)
      return anyCached ? '~45 MB' : '0 MB'
    }
    return formatBytes(cacheUsageBytes.value)
  })

  async function clearAllCache() {
    if (isClearingCache.value) return
    const confirmClear = window.confirm('Are you sure you want to clear all downloaded AI models and cached storage? You can re-download them anytime.')
    if (!confirmClear) return

    isClearingCache.value = true
    try {
      // 1. Reset in-memory instances
      resetLoadedModels()

      // 2. Clear Cache Storage API
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map(name => caches.delete(name)))
      }

      // 3. Clear IndexedDB databases used by Transformers.js / ONNX
      if (typeof window !== 'undefined' && window.indexedDB && window.indexedDB.databases) {
        try {
          const dbs = await window.indexedDB.databases()
          for (const db of dbs) {
            if (db.name) {
              window.indexedDB.deleteDatabase(db.name)
            }
          }
        } catch (err) {
          console.warn('Could not enumerate IndexedDB databases:', err)
        }
      }

      // 4. Clear model cache flags in localStorage
      modelOptions.forEach(m => {
        localStorage.removeItem(cachedModelKey(m.id))
        cachedModels[m.id] = false
      })

      // 5. Update cache size
      cacheUsageBytes.value = 0
      await checkModelCacheStatus()

      statusMessage.value = 'Model cache cleared successfully.'
      setTimeout(() => {
        if (statusMessage.value === 'Model cache cleared successfully.') statusMessage.value = ''
      }, 2500)
    } catch (err) {
      console.error('Failed to clear cache:', err)
      alert('An error occurred while clearing cache: ' + (err.message || err))
    } finally {
      isClearingCache.value = false
    }
  }

  /** Is the currently selected model already downloaded? Drives the "Ready" pill. */
  const currentModelCached = computed(() => !!cachedModels[selectedModel.value])

  /** Full metadata row for the selected model (size, dtype, optimisation flag). */
  const currentModelMeta = computed(() => modelOptions.find(m => m.id === selectedModel.value) || modelOptions[0])

  return {
    cachedModels,
    cacheUsageBytes,
    isClearingCache,
    checkModelCacheStatus,
    formattedCacheUsage,
    clearAllCache,
    currentModelCached,
    currentModelMeta
  }
}
