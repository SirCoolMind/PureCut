/**
 * The selection tools: magnetic lasso, freehand lasso, rectangle, polygon and
 * magic wand.
 *
 * All five share one pattern - a pointer gesture builds up a selection, which is
 * committed to `activeSelection` and then applied to the mask by
 * `applySelectionAction` (erase or restore). The overlay that paints the ants is
 * `useSelectionOverlay`; this module drives it through `startAntsAnimation` /
 * `stopAntsAnimation`, which arrive as callbacks.
 *
 * ## Why the selection state is a dependency rather than owned here
 *
 * The overlay needs the state (`selectShape`, `isSelecting`, `selectionBox`,
 * `lassoPoints`, `activeSelection`) and this module needs the overlay's animation
 * callbacks. Owning the state here would make that a setup-time cycle, so the
 * state stays declared in App.vue and is handed to both modules.
 *
 * `maskCtx` and `originalCanvas` come from the canvas store as live bindings.
 * `magicWandFloodFill` is a pure function imported from the detection engine.
 *
 * ## Gesture notes
 *
 * - `onSelectPointerDown` returns early for the wand: that is a single click, not
 *   a drag, and it commits the flood-fill result immediately.
 * - Polygon is click-to-add-vertex: `onSelectPointerUp` deliberately ignores it,
 *   and clicking near the first vertex closes the path.
 * - Magnetic mode snaps each sample to the nearest mask edge via
 *   `findNearestObjectEdge`, which scans a small patch for the strongest alpha
 *   gradient within the search radius.
 * - A gesture that ends too small (< 5px rect, < 5 points of lasso) is discarded
 *   and the ants are stopped.
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; no
 * behaviour was changed.
 */

import { type Ref } from 'vue'
import { magicWandFloodFill } from '../detectionEngine.js'
import { maskCtx, originalCanvas } from '../core/canvasStore.js'
import { snapToNearestEdge, wandEraserRects } from '../core/maskOps.js'

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
  /** Magic wand only: scale factor of the local mask it was computed at. */
  scale?: number
  /** Magic wand only: local mask width. */
  sw?: number
  /** Magic wand only: local mask height. */
  sh?: number
  /** Magic wand only: one byte per local-mask pixel, 1 = selected. */
  visitedMask?: Uint8Array
}

interface SelectionBox {
  startX: number
  startY: number
  currentX: number
  currentY: number
}

interface SelectionToolsDeps {
  /** Live size of the loaded image; used to size the edge-search patch. */
  imageDimensions: { width: number; height: number }
  /** Only the 'select' tool handles gestures. */
  activeTool: Ref<string>
  /** Current zoom; the polygon close-hit radius scales inversely. */
  zoomLevel: Ref<number>
  /** Pointer event -> image-pixel coordinate. */
  getCanvasCoords: (e: PointerEvent) => Point
  /** Start the marching-ants animation (owned by useSelectionOverlay). */
  startAntsAnimation: () => void
  /** Stop it and clear the overlay layer. */
  stopAntsAnimation: () => void
  /** Snapshot the mask before it is mutated. */
  saveUndoState: () => void
  /** Full-quality re-composite; `true` forces an immediate PNG encode. */
  recompositeCanvas: (immediateBlob?: boolean) => void
  /** Re-run subject detection after a manual mask edit. */
  refreshDetectionData: () => void
  /** 'magnetic' | 'lasso' | 'rect' | 'polygon' | 'wand' */
  selectShape: Ref<string>
  /** True while a drag gesture is in progress. */
  isSelecting: Ref<boolean>
  /** Corner positions of an in-progress rect drag. */
  selectionBox: SelectionBox
  /** Points accumulated by the lasso / magnetic / polygon tools. */
  lassoPoints: Ref<Point[]>
  /** The committed selection, or null. */
  activeSelection: Ref<Selection | null>
  /** Magic-wand RGB tolerance. */
  wandTolerance: Ref<number>
}

export function useSelectionTools({
  imageDimensions,
  activeTool,
  zoomLevel,
  getCanvasCoords,
  startAntsAnimation,
  stopAntsAnimation,
  saveUndoState,
  recompositeCanvas,
  refreshDetectionData,
  selectShape,
  isSelecting,
  selectionBox,
  lassoPoints,
  activeSelection,
  wandTolerance
}: SelectionToolsDeps) {
  // Edge-detection snapping function for Magnetic Lasso
  function findNearestObjectEdge(x: number, y: number, searchRadius = 18) {
    if (!maskCtx) return { x, y }
    const w = imageDimensions.width
    const h = imageDimensions.height

    // Sample a local bounding patch around (x, y)
    const x0 = Math.max(0, Math.floor(x - searchRadius))
    const y0 = Math.max(0, Math.floor(y - searchRadius))
    const x1 = Math.min(w - 1, Math.ceil(x + searchRadius))
    const y1 = Math.min(h - 1, Math.ceil(y + searchRadius))
    const patchW = x1 - x0 + 1
    const patchH = y1 - y0 + 1
    if (patchW <= 2 || patchH <= 2) return { x, y }

    const patch = maskCtx.getImageData(x0, y0, patchW, patchH).data

    // The snap itself is pure maths over that patch - see core/maskOps.ts.
    return snapToNearestEdge(patch, patchW, patchH, x0, y0, x, y)
  }

  // Selection Pointer Handlers
  function onSelectPointerDown(e: PointerEvent) {
    if (activeTool.value !== 'select') return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    let coords = getCanvasCoords(e)

    if (selectShape.value === 'wand') {
      // Magic wand click: instantaneous flood fill
      const result = magicWandFloodFill(originalCanvas, coords.x, coords.y, wandTolerance.value)
      if (result) {
        // The detection engine types `type` as string; it only ever produces 'wand'.
        activeSelection.value = result as Selection
        startAntsAnimation()
      } else {
        clearSelection()
      }
      return
    }

    isSelecting.value = true

    if (selectShape.value === 'polygon') {
      // Click-to-add vertex polygon logic
      if (lassoPoints.value.length === 0) {
        lassoPoints.value = [coords]
        startAntsAnimation()
      } else {
        const first = lassoPoints.value[0]
        const dist = Math.hypot(coords.x - first.x, coords.y - first.y)
        // Close polygon if clicked near the start point
        if (dist < 25 / zoomLevel.value && lassoPoints.value.length > 2) {
          activeSelection.value = { type: 'lasso', points: [...lassoPoints.value] }
          isSelecting.value = false
        } else {
          lassoPoints.value.push(coords)
        }
      }
      return
    }

    if (selectShape.value === 'rect') {
      selectionBox.startX = coords.x
      selectionBox.startY = coords.y
      selectionBox.currentX = coords.x
      selectionBox.currentY = coords.y
      activeSelection.value = null
    } else {
      if (selectShape.value === 'magnetic') {
        coords = findNearestObjectEdge(coords.x, coords.y, 24)
      }
      lassoPoints.value = [coords]
      activeSelection.value = null
    }
    startAntsAnimation()
  }

  function onSelectPointerMove(e: PointerEvent) {
    if (!isSelecting.value) return
    let coords = getCanvasCoords(e)

    if (selectShape.value === 'polygon') {
      // Live preview to cursor is handled by the render overlay
      selectionBox.currentX = coords.x
      selectionBox.currentY = coords.y
      return
    }

    if (selectShape.value === 'rect') {
      selectionBox.currentX = coords.x
      selectionBox.currentY = coords.y
    } else {
      // If magnetic snapping is active, snap coords to the nearest subject contour
      if (selectShape.value === 'magnetic') {
        coords = findNearestObjectEdge(coords.x, coords.y, 22)
      }

      const pts = lassoPoints.value
      const last = pts[pts.length - 1]
      const dist = Math.hypot(coords.x - last.x, coords.y - last.y)
      if (dist >= (selectShape.value === 'magnetic' ? 4 : 3)) {
        lassoPoints.value.push(coords)
      }
    }
  }

  function onSelectPointerUp(e: PointerEvent) {
    if (!isSelecting.value || selectShape.value === 'polygon') return
    isSelecting.value = false

    if (selectShape.value === 'rect') {
      const x = Math.min(selectionBox.startX, selectionBox.currentX)
      const y = Math.min(selectionBox.startY, selectionBox.currentY)
      const w = Math.abs(selectionBox.currentX - selectionBox.startX)
      const h = Math.abs(selectionBox.currentY - selectionBox.startY)

      if (w > 5 && h > 5) {
        activeSelection.value = { type: 'rect', x, y, width: w, height: h }
      } else {
        activeSelection.value = null
        stopAntsAnimation()
      }
    } else {
      if (lassoPoints.value.length > 5) {
        activeSelection.value = { type: 'lasso', points: [...lassoPoints.value] }
      } else {
        activeSelection.value = null
        stopAntsAnimation()
      }
    }
  }

  function clearSelection() {
    activeSelection.value = null
    lassoPoints.value = []
    isSelecting.value = false
    stopAntsAnimation()
  }

  function applySelectionAction(action: 'erase' | 'restore') {
    // If actively drawing a polygon, auto-close it before applying
    if (isSelecting.value && selectShape.value === 'polygon' && lassoPoints.value.length > 2) {
      activeSelection.value = { type: 'lasso', points: [...lassoPoints.value] }
      isSelecting.value = false
    }

    if (!activeSelection.value || !maskCtx || !originalCanvas) return
    const sel = activeSelection.value

    maskCtx.save()

    if (sel.type === 'wand') {
      // For wand, we apply the precise visited mask mapped back to full resolution
      const wandW = sel.sw

      maskCtx.beginPath()
      maskCtx.rect(sel.x, sel.y, sel.width, sel.height)
      maskCtx.clip() // restrict to bounding box for performance

      // Draw the binary mask block directly
      if (action === 'erase') {
        maskCtx.globalCompositeOperation = 'destination-out'
        maskCtx.fillStyle = 'rgba(0,0,0,1)'
      } else {
        maskCtx.globalCompositeOperation = 'source-over'
        maskCtx.fillStyle = 'rgba(255,255,255,1)'
      }

      // High performance fill of matching pixels. The working-grid -> full
      // resolution mapping is pure maths, so it lives in core/maskOps.ts.
      for (const r of wandEraserRects(sel.visitedMask, wandW, sel.sh, sel.scale)) {
        maskCtx.fillRect(r.x, r.y, r.w, r.h)
      }
    } else {
      // Trace the active vector selection path onto the mask
      maskCtx.beginPath()
      if (sel.type === 'rect') {
        maskCtx.rect(sel.x, sel.y, sel.width, sel.height)
      } else if (sel.type === 'lasso' && sel.points.length > 1) {
        maskCtx.moveTo(sel.points[0].x, sel.points[0].y)
        for (let i = 1; i < sel.points.length; i++) {
          maskCtx.lineTo(sel.points[i].x, sel.points[i].y)
        }
        maskCtx.closePath()
      }

      if (action === 'erase') {
        // Erase enclosed area cleanly
        maskCtx.globalCompositeOperation = 'destination-out'
        maskCtx.fillStyle = 'rgba(0, 0, 0, 1)'
        maskCtx.fill()
      } else if (action === 'restore') {
        // Restore enclosed area directly as visible foreground
        maskCtx.globalCompositeOperation = 'source-over'
        maskCtx.fillStyle = 'rgba(255, 255, 255, 1)'
        maskCtx.fill()
      }
    }

    maskCtx.restore()

    // Save undo history and trigger instant re-composite
    saveUndoState()
    recompositeCanvas(true)
    refreshDetectionData()
    clearSelection()
  }

  return { onSelectPointerDown, onSelectPointerMove, onSelectPointerUp, clearSelection, applySelectionAction }
}
