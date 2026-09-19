/**
 * The "marching ants" selection overlay.
 *
 * Draws the in-progress or committed selection onto its own `#selectionCanvas`
 * layer, above the cutout: a soft blue fill, a solid black underlay and an
 * animated white dashed outline. Line width and dash length are divided by
 * `zoomLevel`, so the ants keep a constant on-screen size as the user zooms.
 *
 * `startAntsAnimation` runs a rAF loop that advances `antsDashOffset` and
 * redraws. The loop is self-terminating: it only re-arms while the select tool is
 * active and there is something to show, so nothing needs to cancel it in the
 * normal case. `stopAntsAnimation` is the explicit teardown (called from the
 * selection tools and from `onUnmounted`) and also clears the layer.
 *
 * The selection *state* is owned elsewhere and arrives as refs, so this module is
 * purely a renderer:
 *  - `selectionCanvasRef` is the template-bound overlay layer
 *  - `activeSelection` / `isSelecting` / `selectShape` / `selectionBox` /
 *    `lassoPoints` describe the shape to draw
 *  - `hasSelection` and `activeTool` let the animation loop decide whether to
 *    keep going
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; no
 * behaviour was changed.
 */

import { ref, type Ref } from 'vue'

interface Point {
  x: number
  y: number
}

/** A committed selection. Which fields exist depends on `type`. */
interface Selection {
  type: 'rect' | 'lasso' | 'wand'
  x?: number
  y?: number
  width?: number
  height?: number
  points?: Point[]
}

interface SelectionBox {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface SelectionOverlayDeps {
  /** The template-bound overlay canvas. */
  selectionCanvasRef: Ref<HTMLCanvasElement | null>
  /** Live size of the loaded image; the overlay is sized to match. */
  imageDimensions: { width: number; height: number }
  /** Committed selection, or null when there is none. */
  activeSelection: Ref<Selection | null>
  /** True while a drag gesture is in progress. */
  isSelecting: Ref<boolean>
  /** 'magnetic' | 'lasso' | 'rect' | 'polygon' | 'wand' */
  selectShape: Ref<string>
  /** Corner positions of an in-progress rect drag. */
  selectionBox: SelectionBox
  /** Points accumulated by the lasso / magnetic / polygon tools. */
  lassoPoints: Ref<Point[]>
  /** Current viewport zoom; the ants scale inversely. */
  zoomLevel: Ref<number>
  /** The animation only keeps running while the select tool is active. */
  activeTool: Ref<string>
  /** True when there is a committed selection or a usable polygon path. */
  hasSelection: Ref<boolean>
}

export function useSelectionOverlay({
  selectionCanvasRef,
  imageDimensions,
  activeSelection,
  isSelecting,
  selectShape,
  selectionBox,
  lassoPoints,
  zoomLevel,
  activeTool,
  hasSelection
}: SelectionOverlayDeps) {
  /** rAF handle for the ants loop; null when idle. */
  let antsAnimationId: number | null = null
  /** Advances by -0.4 per frame, wrapped at 100. Drives `lineDashOffset`. */
  let antsDashOffset = 0

  function renderSelectionOverlay() {
    const canvas = selectionCanvasRef.value
    if (!canvas) return
    const width = imageDimensions.width
    const height = imageDimensions.height
    if (!width || !height) return

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, width, height)

    const sel = activeSelection.value
    if (!sel && !isSelecting.value) return

    ctx.save()

    // Define the selection path
    ctx.beginPath()
    if (isSelecting.value && selectShape.value === 'rect') {
      const x = Math.min(selectionBox.startX, selectionBox.currentX)
      const y = Math.min(selectionBox.startY, selectionBox.currentY)
      const w = Math.abs(selectionBox.currentX - selectionBox.startX)
      const h = Math.abs(selectionBox.currentY - selectionBox.startY)
      ctx.rect(x, y, w, h)
    } else if (isSelecting.value && (selectShape.value === 'lasso' || selectShape.value === 'magnetic') && lassoPoints.value.length > 1) {
      const pts = lassoPoints.value
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y)
      }
    } else if (isSelecting.value && selectShape.value === 'polygon' && lassoPoints.value.length > 0) {
      const pts = lassoPoints.value
      ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y)
      }
      // Draw guide line to current cursor
      ctx.lineTo(selectionBox.currentX, selectionBox.currentY)
    } else if (sel) {
      if (sel.type === 'rect') {
        ctx.rect(sel.x, sel.y, sel.width, sel.height)
      } else if ((sel.type === 'lasso' || sel.type === 'wand') && sel.points.length > 1) {
        ctx.moveTo(sel.points[0].x, sel.points[0].y)
        for (let i = 1; i < sel.points.length; i++) {
          ctx.lineTo(sel.points[i].x, sel.points[i].y)
        }
        ctx.closePath()
      }
    }

    // 1. Soft semi-transparent blue highlight fill
    ctx.fillStyle = 'rgba(99, 102, 241, 0.18)'
    ctx.fill()

    // 2. Dual-color "Marching Ants" outline (black base + animated white dashes)
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'miter'
    ctx.lineWidth = Math.max(1.5, Math.round(2 / zoomLevel.value))

    // Black solid underlay for strong contrast over bright areas
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
    ctx.setLineDash([])
    ctx.stroke()

    // White animated dashes on top
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
    const dashLen = Math.max(4, Math.round(6 / zoomLevel.value))
    ctx.setLineDash([dashLen, dashLen])
    ctx.lineDashOffset = antsDashOffset
    ctx.stroke()

    ctx.restore()
  }

  function startAntsAnimation() {
    if (antsAnimationId) return
    const loop = () => {
      antsDashOffset = (antsDashOffset - 0.4) % 100
      renderSelectionOverlay()
      if (activeTool.value === 'select' && (hasSelection.value || isSelecting.value)) {
        antsAnimationId = requestAnimationFrame(loop)
      } else {
        antsAnimationId = null
      }
    }
    antsAnimationId = requestAnimationFrame(loop)
  }

  function stopAntsAnimation() {
    if (antsAnimationId) {
      cancelAnimationFrame(antsAnimationId)
      antsAnimationId = null
    }
    const canvas = selectionCanvasRef.value
    if (canvas) {
      const ctx = canvas.getContext('2d')!
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  return { renderSelectionOverlay, startAntsAnimation, stopAntsAnimation }
}
