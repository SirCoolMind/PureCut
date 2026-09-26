/**
 * src/composables/useVersionCheck.ts
 *
 * Checks for newly deployed application versions via `version.json`.
 *
 * When CI/CD deploys a fresh commit to GitHub Pages, active browser sessions
 * will detect the mismatch between the embedded `appBuildHash` and the remote
 * `version.json` hash, triggering an update prompt for the user.
 */

import { ref, onMounted, onUnmounted } from 'vue'
import { appBuildHash, appVersion } from '../constants.js'

export interface RemoteVersionInfo {
  version: string
  hash: string
  buildTime?: string
}

export function useVersionCheck() {
  const currentHash = appBuildHash
  const currentVersion = appVersion

  const hasNewVersion = ref(false)
  const newVersionHash = ref('')
  const newVersionNumber = ref('')
  const newBuildTime = ref('')
  const isChecking = ref(false)
  const showPrompt = ref(false)

  let checkTimer: ReturnType<typeof setInterval> | null = null
  let lastCheckTime = 0
  const MIN_CHECK_INTERVAL_MS = 60 * 1000 // Throttle visibility checks to at most once per minute
  const PERIODIC_CHECK_MS = 10 * 60 * 1000 // Check every 10 minutes

  async function checkForUpdates(): Promise<boolean> {
    // Skip if running in dev without a valid git hash
    if (!currentHash || currentHash === 'dev') return false

    const now = Date.now()
    if (isChecking.value) return false
    isChecking.value = true
    lastCheckTime = now

    try {
      // Query with cache-busting timestamp and no-cache headers to bypass browser/CDN caches
      const response = await fetch(`./version.json?t=${now}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache'
        }
      })

      if (!response.ok) return false
      const data: RemoteVersionInfo = await response.json()

      if (data && data.hash && data.hash !== currentHash) {
        hasNewVersion.value = true
        newVersionHash.value = data.hash
        newVersionNumber.value = data.version || currentVersion
        newBuildTime.value = data.buildTime || ''
        showPrompt.value = true
        return true
      }
    } catch (_) {
      // Silent error: user might be offline or network request interrupted
    } finally {
      isChecking.value = false
    }

    return false
  }

  function applyUpdate() {
    // Force a fresh reload of the page
    window.location.reload()
  }

  function dismissPrompt() {
    showPrompt.value = false
  }

  function openPrompt() {
    if (hasNewVersion.value) {
      showPrompt.value = true
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      const elapsed = Date.now() - lastCheckTime
      if (elapsed > MIN_CHECK_INTERVAL_MS) {
        checkForUpdates()
      }
    }
  }

  onMounted(() => {
    // Initial check delayed by 5 seconds to not compete with initial startup/model load
    const initialTimer = setTimeout(() => {
      checkForUpdates()
    }, 5000)

    // Periodic check every 10 minutes
    checkTimer = setInterval(() => {
      checkForUpdates()
    }, PERIODIC_CHECK_MS)

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    onUnmounted(() => {
      clearTimeout(initialTimer)
      if (checkTimer) clearInterval(checkTimer)
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    })
  })

  return {
    currentHash,
    currentVersion,
    hasNewVersion,
    newVersionHash,
    newVersionNumber,
    newBuildTime,
    isChecking,
    showPrompt,
    checkForUpdates,
    applyUpdate,
    dismissPrompt,
    openPrompt
  }
}
