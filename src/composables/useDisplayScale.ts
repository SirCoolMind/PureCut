/**
 * Display scaling for the PureCut interface.
 *
 * Two related concerns, both about how large the UI is rendered:
 *  - Font scale: a user preference stored in localStorage and applied as
 *    `html[data-font-size]`. The global stylesheet (src/styles/global.css) turns
 *    that attribute into custom properties which the scoped styles consume, so
 *    setting the attribute is what actually scales the interface.
 *  - Browser zoom: detected, purely so the navbar can offer a reset shortcut.
 *    The app cannot change the browser's own zoom, hence the alert().
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; no
 * behaviour was changed. Depends only on the DOM and localStorage, not on any
 * other composable.
 */

import { computed, ref } from 'vue'
import { STORAGE_KEYS, FONT_SIZES, DEFAULT_FONT_SIZE, type FontSize } from '../core/storageKeys.js'

export function useDisplayScale() {
  // -------------------------------------------------------------- font scale
  const fontSize = ref<FontSize>(
    typeof localStorage !== 'undefined'
      ? ((localStorage.getItem(STORAGE_KEYS.fontSize) as FontSize | null) || DEFAULT_FONT_SIZE)
      : DEFAULT_FONT_SIZE
  )

  function applyFontSize(size: FontSize) {
    fontSize.value = size
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.fontSize, size)
    }
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-font-size', size)
    }
  }

  /** Advance S -> M -> L -> XL, wrapping. Unknown values start the cycle at 'compact'. */
  function cycleFontSize() {
    const nextIdx = (FONT_SIZES.findIndex((s) => s === fontSize.value) + 1) % FONT_SIZES.length
    applyFontSize(FONT_SIZES[nextIdx])
  }

  // ------------------------------------------- browser page zoom detection
  const browserZoomLevel = ref(100)
  const isBrowserZoomed = computed(() => browserZoomLevel.value !== 100)

  function updateBrowserZoom() {
    if (typeof window === 'undefined') return
    let ratio = 1
    if (window.visualViewport && window.visualViewport.scale && window.visualViewport.scale !== 1) {
      ratio = window.visualViewport.scale
    } else if (window.outerWidth && window.innerWidth) {
      // Zoom in browser scales window.innerWidth relative to outerWidth
      const calculated = window.outerWidth / window.innerWidth
      if (Math.abs(calculated - 1) > 0.05) {
        ratio = calculated
      }
    }
    browserZoomLevel.value = Math.round(ratio * 100)
  }

  function resetBrowserZoom() {
    // If pinch/visual viewport zoomed, reset scroll and notify
    if (window.visualViewport) {
      window.scrollTo(0, 0)
    }
    // For standard browser zoom, prompt shortcut
    const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    const shortcut = isMac ? 'Cmd + 0' : 'Ctrl + 0'
    alert(`To reset your browser zoom to 100%, press ${shortcut} on your keyboard.`)
  }

  return {
    fontSize,
    applyFontSize,
    cycleFontSize,
    browserZoomLevel,
    isBrowserZoomed,
    updateBrowserZoom,
    resetBrowserZoom
  }
}
