/**
 * Global keyboard shortcuts.
 *
 * One window-level `keydown` listener, and the two shortcut groups the app has:
 *
 *  - Undo / redo: `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, `Ctrl/Cmd+Y`.
 *  - Selection editing, and only while the **select** tool is active:
 *    `Delete` / `Backspace` erases the selection, `Enter` restores it, `Escape`
 *    clears it. `Escape` also abandons an in-progress polygon before it is
 *    closed, which is the one case that is reachable without a finished
 *    selection.
 *
 * Every branch that acts calls `preventDefault()`, so the browser's own
 * Backspace-navigates-back and Escape-stops-loading behaviour never fires while
 * the app has a selection.
 *
 * Dependencies arrive as parameters, so this module's signature is its contract:
 * refs are read (never replaced), and `applySelectionAction` /
 * `clearSelection` are the selection composable's own callbacks. The listener is
 * still added and removed by `App.vue`'s lifecycle hooks - this module only
 * decides what a keypress means.
 *
 * Extracted verbatim from App.vue's `onKeyDown` during the AI-context refactor;
 * no behaviour was changed.
 */

import { type Ref } from 'vue'

/** The shape of the selection tool's state this module reads. */
interface KeyboardShortcutsDeps {
  /** Undo the last mask edit. Bound to Ctrl/Cmd+Z. */
  handleUndo: () => void
  /** Redo the last undone mask edit. Bound to Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y. */
  handleRedo: () => void
  /** Which tool is active. The selection keys only fire when this is 'select'. */
  activeTool: Ref<string>
  /** True once a wand / rect / lasso selection exists. */
  hasSelection: Ref<boolean>
  /** Apply 'erase' or 'restore' to the current selection. */
  applySelectionAction: (action: 'erase' | 'restore') => void
  /** Drop the current selection (and any in-progress polygon). */
  clearSelection: () => void
  /** True while a rect / lasso / polygon drag is in progress. */
  isSelecting: Ref<boolean>
  /** 'rect' | 'lasso' | 'wand' | 'polygon'. Escape only abandons a polygon. */
  selectShape: Ref<string>
}

export function useKeyboardShortcuts({
  handleUndo,
  handleRedo,
  activeTool,
  hasSelection,
  applySelectionAction,
  clearSelection,
  isSelecting,
  selectShape
}: KeyboardShortcutsDeps) {
  function onKeyDown(e: KeyboardEvent) {
    // Undo/Redo: Ctrl + Z, Ctrl + Shift + Z, Ctrl + Y
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) {
        handleRedo()
      } else {
        handleUndo()
      }
      return
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      handleRedo()
      return
    }

    // If user has a selection active, support Delete/Backspace to erase, Enter to restore, Esc to clear
    if (activeTool.value === 'select' && hasSelection.value) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        applySelectionAction('erase')
      } else if (e.key === 'Enter') {
        e.preventDefault()
        applySelectionAction('restore')
      } else if (e.key === 'Escape') {
        e.preventDefault()
        clearSelection()
      }
    } else if (
      activeTool.value === 'select' &&
      isSelecting.value &&
      selectShape.value === 'polygon' &&
      e.key === 'Escape'
    ) {
      e.preventDefault()
      clearSelection()
    }
  }

  return { onKeyDown }
}
