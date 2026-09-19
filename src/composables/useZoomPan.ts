/**
 * Zoom & pan for the cutout viewport.
 *
 * The viewport is a CSS transform layer (`translate(panOffset) scale(zoomLevel)`),
 * so this composable owns the numbers that drive it. Note that `onWheelZoom`
 * overloads the wheel to mean three different things depending on modifiers:
 * Ctrl+Alt zooms, Ctrl/Shift/horizontal-delta pans horizontally, plain scroll
 * pans vertically.
 *
 * Dependencies are passed in rather than imported, so this module has no hidden
 * coupling: `resultUrl` gates the handler (there is nothing to zoom without a
 * cutout) and `activeTool` gates panning.
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; no
 * behaviour was changed.
 */

import { reactive, ref, type Ref } from 'vue'

interface ZoomPanDeps {
  /** Presence of a cutout; zooming is a no-op until one exists. */
  resultUrl: Ref<string | null>
  /** The pan gesture only applies while the pan tool is selected. */
  activeTool: Ref<string>
}

export function useZoomPan({ resultUrl, activeTool }: ZoomPanDeps) {
  const zoomLevel = ref(1) // 1 = 100%
  const panOffset = reactive({ x: 0, y: 0 })
  const isPanning = ref(false)
  let panStartPoint = { x: 0, y: 0 }
  let initialPan = { x: 0, y: 0 }

  function zoomIn() {
    zoomLevel.value = Math.min(4, +(zoomLevel.value + 0.25).toFixed(2))
  }

  function zoomOut() {
    zoomLevel.value = Math.max(0.5, +(zoomLevel.value - 0.25).toFixed(2))
    if (zoomLevel.value <= 1 && panOffset.x === 0 && panOffset.y === 0) {
      resetZoom()
    }
  }

  function resetZoom() {
    zoomLevel.value = 1
    panOffset.x = 0
    panOffset.y = 0
  }

  function onWheelZoom(e: WheelEvent) {
    if (!resultUrl.value) return
    e.preventDefault()

    // Zoom: Ctrl + Alt + Scroll
    if (e.ctrlKey && e.altKey) {
      const delta = e.deltaY > 0 ? -0.15 : 0.15
      const newZoom = Math.min(4, Math.max(0.5, +(zoomLevel.value + delta).toFixed(2)))
      zoomLevel.value = newZoom
      if (newZoom === 1) {
        panOffset.x = 0
        panOffset.y = 0
      }
    }
    // Pan X: Ctrl + Scroll
    else if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const dx = e.deltaX !== 0 ? e.deltaX : (e.deltaY !== 0 ? e.deltaY : 0)
      panOffset.x -= dx
    }
    // Pan Y: Standard Scroll
    else {
      panOffset.y -= e.deltaY
    }
  }

  function onPanStart(e: PointerEvent) {
    if (activeTool.value !== 'pan') return
    isPanning.value = true
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    panStartPoint = { x: e.clientX, y: e.clientY }
    initialPan = { x: panOffset.x, y: panOffset.y }
  }

  function onPanMove(e: PointerEvent) {
    if (!isPanning.value) return
    const dx = e.clientX - panStartPoint.x
    const dy = e.clientY - panStartPoint.y
    panOffset.x = initialPan.x + dx
    panOffset.y = initialPan.y + dy
  }

  function onPanEnd() {
    isPanning.value = false
  }

  return {
    zoomLevel,
    panOffset,
    isPanning,
    zoomIn,
    zoomOut,
    resetZoom,
    onWheelZoom,
    onPanStart,
    onPanMove,
    onPanEnd
  }
}
