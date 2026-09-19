/**
 * The interactive magic brush: pointer painting applied straight onto the mask
 * canvas.
 *
 * `onPointerDown` samples where the press landed and paints a single round dot
 * (so a click without a drag still does something), then resets the path so
 * `onPointerMove` can `lineTo`/`stroke` a native vector path - one GPU draw call
 * per move event, no pixel loop. A cheap rAF-batched preview is scheduled while
 * painting; the full-quality PNG re-composite happens exactly once, on
 * `onPointerUp`.
 *
 * `maskCtx` is read from the canvas store as a live binding, so it always refers
 * to the image currently loaded. Everything else arrives as a parameter:
 *  - `activeTool` gates the whole gesture (only the brush tool paints)
 *  - `getCanvasCoords` maps a pointer event to image pixels - it lives in App.vue
 *    until the pure `core/geometry.ts` layer exists
 *  - `schedulePreview` is the cheap GPU path, `recompositeCanvas` the heavy one
 *  - `saveUndoState` snapshots the mask on stroke completion
 *
 * `brushMode` and `brushSize` are returned because the template binds to them
 * (`v-model.number` on the size slider), so they must stay writable refs.
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; no
 * behaviour was changed.
 */

import { ref, type Ref } from 'vue'
import { maskCtx } from '../core/canvasStore.js'

interface Point {
  x: number
  y: number
}

interface BrushDeps {
  /** Only the 'brush' tool paints. */
  activeTool: Ref<string>
  /** Pointer event -> image-pixel coordinate, clamped to the image. */
  getCanvasCoords: (e: PointerEvent) => Point
  /** rAF-batched, GPU-composited preview. Never the heavy path. */
  schedulePreview: () => void
  /** Snapshot the mask so the stroke can be undone. */
  saveUndoState: () => void
  /** Full-quality re-composite; called once per stroke, on pointerup. */
  recompositeCanvas: (immediateBlob?: boolean) => void
}

export function useBrush({
  activeTool,
  getCanvasCoords,
  schedulePreview,
  saveUndoState,
  recompositeCanvas
}: BrushDeps) {
  /** 'erase' | 'restore'. Template-bound to the brush-mode pills. */
  const brushMode = ref('erase')
  /** Brush radius in image pixels. Template-bound (`v-model.number`). */
  const brushSize = ref(35)
  /** True between pointerdown and pointerup. */
  const isDrawing = ref(false)
  /** Last point of the current stroke; null when not painting. */
  let lastPoint: Point | null = null

  function onPointerDown(e: PointerEvent) {
    if (activeTool.value !== 'brush' || !maskCtx) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    isDrawing.value = true
    lastPoint = getCanvasCoords(e)

    // Begin a new continuous path on the mask
    maskCtx.lineCap = 'round'
    maskCtx.lineJoin = 'round'
    maskCtx.lineWidth = brushSize.value * 2
    if (brushMode.value === 'erase') {
      maskCtx.globalCompositeOperation = 'destination-out'
      maskCtx.strokeStyle = 'rgba(0, 0, 0, 1)'
    } else {
      maskCtx.globalCompositeOperation = 'source-over'
      maskCtx.strokeStyle = 'rgba(255, 255, 255, 1)'
    }
    maskCtx.beginPath()
    maskCtx.moveTo(lastPoint.x, lastPoint.y)

    // Draw a dot for single-click
    maskCtx.fillStyle = maskCtx.strokeStyle
    maskCtx.save()
    maskCtx.globalCompositeOperation = maskCtx.globalCompositeOperation
    maskCtx.beginPath()
    maskCtx.arc(lastPoint.x, lastPoint.y, brushSize.value, 0, Math.PI * 2)
    maskCtx.fill()
    maskCtx.restore()

    // Restart path for subsequent lineTo
    maskCtx.beginPath()
    maskCtx.moveTo(lastPoint.x, lastPoint.y)

    schedulePreview()
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDrawing.value || !maskCtx) return
    const currentPoint = getCanvasCoords(e)

    // Native vector path stroke - GPU-accelerated, single draw call
    maskCtx.lineTo(currentPoint.x, currentPoint.y)
    maskCtx.stroke()

    // Keep path going for smooth continuous stroke
    maskCtx.beginPath()
    maskCtx.moveTo(currentPoint.x, currentPoint.y)
    lastPoint = currentPoint

    // Schedule rAF-batched preview (coalesceses multiple move events per frame)
    schedulePreview()
  }

  function onPointerUp() {
    if (isDrawing.value) {
      isDrawing.value = false
      lastPoint = null
      saveUndoState()
      // Full quality PNG export only once, on stroke completion
      recompositeCanvas()
    }
  }

  return { brushMode, brushSize, onPointerDown, onPointerMove, onPointerUp }
}
