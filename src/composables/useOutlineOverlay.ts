/**
 * Animated dashed outline drawn along the cutout's mask contour.
 *
 * `updateOutlineOverlay()` asks the detection engine for the mask's contour
 * segments, then runs a `requestAnimationFrame` loop drawing a black base line
 * plus a white dashed line whose dash offset advances every frame. Line width and
 * dash length are divided by `zoomLevel`, so the outline keeps a constant
 * on-screen thickness as the user zooms.
 *
 * That work is currently unreachable: `showOutline` is only ever written by
 * `toggleOutline()`, and nothing calls it (see the "known issues" list in
 * AGENTS.md). Moved verbatim rather than deleted, because deleting it is a
 * product decision, not a refactor.
 *
 * `maskCanvas` is read from the canvas store as a live binding - it is a default
 * parameter, so it resolves per call, and `processImage()` may have replaced the
 * canvas since the last one. `zoomLevel` arrives as a parameter for the same
 * reason: the animation loop re-reads it on every frame.
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; no
 * behaviour was changed.
 */

import { ref, type Ref } from 'vue'
import { extractMaskContourSegments } from '../detectionEngine.js'
import { maskCanvas } from '../core/canvasStore.js'

interface OutlineOverlayDeps {
  /** Live size of the loaded image; the overlay canvas is resized to match. */
  imageDimensions: { width: number; height: number }
  /** Current viewport zoom; the outline scales inversely so it looks constant. */
  zoomLevel: Ref<number>
}

export function useOutlineOverlay({ imageDimensions, zoomLevel }: OutlineOverlayDeps) {
  /** Whether the outline overlay is visible. Only `toggleOutline()` writes it. */
  const showOutline = ref(false)
  /** rAF handle for the dash animation; null when stopped. */
  let globalOutlineAnimationId: number | null = null
  /** Advances by -0.5 per frame, wrapped at 100. Drives `lineDashOffset`. */
  let outlineDashOffset = 0

  function toggleOutline() {
    showOutline.value = !showOutline.value
    if (showOutline.value) {
      updateOutlineOverlay()
    } else {
      stopOutlineAnimation()
    }
  }

  function updateOutlineOverlay(sourceMask: HTMLCanvasElement | null = maskCanvas) {
    if (!sourceMask || !showOutline.value) return
    const segments = extractMaskContourSegments(sourceMask)

    if (globalOutlineAnimationId) cancelAnimationFrame(globalOutlineAnimationId)

    const canvas = document.getElementById('outlineCanvas') as HTMLCanvasElement | null
    if (!canvas) return
    canvas.width = imageDimensions.width
    canvas.height = imageDimensions.height
    const ctx = canvas.getContext('2d')!

    const loop = () => {
      if (!showOutline.value) {
        stopOutlineAnimation()
        return
      }
      outlineDashOffset = (outlineDashOffset - 0.5) % 100
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      ctx.lineCap = 'round'
      ctx.lineWidth = Math.max(1.5, Math.round(2 / zoomLevel.value))

      ctx.beginPath()
      for (const seg of segments) {
        ctx.moveTo(seg.x1, seg.y)
        ctx.lineTo(seg.x2, seg.y)
      }

      // Black base
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'
      ctx.setLineDash([])
      ctx.stroke()

      // White animated dash
      ctx.strokeStyle = 'rgba(255,255,255,0.95)'
      const dashLen = Math.max(3, Math.round(5 / zoomLevel.value))
      ctx.setLineDash([dashLen, dashLen])
      ctx.lineDashOffset = outlineDashOffset
      ctx.stroke()

      globalOutlineAnimationId = requestAnimationFrame(loop)
    }

    loop()
  }

  function stopOutlineAnimation() {
    if (globalOutlineAnimationId) {
      cancelAnimationFrame(globalOutlineAnimationId)
      globalOutlineAnimationId = null
    }
    const canvas = document.getElementById('outlineCanvas') as HTMLCanvasElement | null
    if (canvas) {
      canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  return { showOutline, toggleOutline, updateOutlineOverlay, stopOutlineAnimation }
}
