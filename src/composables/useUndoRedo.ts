/**
 * Undo / redo history for the editable mask.
 *
 * Snapshots are full-resolution `ImageData` copies of the mask canvas, capped at
 * 15 entries by `saveUndoState()`. Entry 0 is the pristine AI mask, which is what
 * `resetBrush()` ("reset to raw AI mask") restores.
 *
 * `maskCtx` is read from the canvas store as a live binding at call time, so a
 * snapshot always belongs to the image currently loaded. It is deliberately not a
 * parameter: `processImage()` replaces the canvas wholesale, so a captured value
 * would go stale.
 *
 * Dependencies arrive as parameters, so this module's signature is its contract:
 *  - `imageDimensions` sizes each snapshot to match the mask canvas exactly
 *  - `recompositeCanvas(immediate)` re-renders the cutout after a history move
 *
 * `undoHistory` is also read by the template, to disable the Undo button.
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; no
 * behaviour was changed.
 */

import { ref } from 'vue'
import { maskCtx } from '../core/canvasStore.js'

interface UndoRedoDeps {
  /** Live size of the loaded image; a mask snapshot covers exactly this rect. */
  imageDimensions: { width: number; height: number }
  /** Full-quality re-composite; `true` forces an immediate PNG encode. */
  recompositeCanvas: (immediateBlob?: boolean) => void
}

export function useUndoRedo({ imageDimensions, recompositeCanvas }: UndoRedoDeps) {
  /** Oldest first. Entry 0 is always the raw AI mask. Capped at 16 by saveUndoState. */
  const undoHistory = ref([])
  /** States popped by handleUndo, oldest first. Cleared by every new action. */
  const redoHistory = ref([])

  function saveUndoState() {
    if (!maskCtx) return
    if (undoHistory.value.length > 15) undoHistory.value.shift()
    const snapshot = maskCtx.getImageData(0, 0, imageDimensions.width, imageDimensions.height)
    undoHistory.value.push(snapshot)
    redoHistory.value = [] // clear redo on new action
  }

  function handleUndo() {
    if (undoHistory.value.length <= 1 || !maskCtx) return
    const currentState = undoHistory.value.pop() // remove current state
    redoHistory.value.push(currentState) // add to redo

    const previousState = undoHistory.value[undoHistory.value.length - 1]
    maskCtx.putImageData(previousState, 0, 0)
    recompositeCanvas(true)
  }

  function handleRedo() {
    if (redoHistory.value.length === 0 || !maskCtx) return
    const nextState = redoHistory.value.pop()
    undoHistory.value.push(nextState)
    maskCtx.putImageData(nextState, 0, 0)
    recompositeCanvas(true)
  }

  function resetBrush() {
    if (undoHistory.value.length > 0 && maskCtx) {
      const originalState = undoHistory.value[0]
      maskCtx.putImageData(originalState, 0, 0)
      undoHistory.value = [originalState]
      redoHistory.value = []
      recompositeCanvas(true)
    }
  }

  return { undoHistory, redoHistory, saveUndoState, handleUndo, handleRedo, resetBrush }
}
