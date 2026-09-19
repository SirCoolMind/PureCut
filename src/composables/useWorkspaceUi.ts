/**
 * Workspace UI state: which mode and tool the user is in, and the small pieces
 * of view state that belong to the studio shell.
 *
 * Everything here is plain UI state with no logic attached, which is why it can
 * be extracted with no dependencies and returned to App.vue as a flat object.
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; the
 * declarations are unchanged, they simply live together now instead of being
 * scattered across two blocks of the monolith.
 *
 * Declared BEFORE useZoomPan, which needs `activeTool`.
 */

import { ref } from 'vue'

export function useWorkspaceUi() {
  const userMode = ref('standard') // 'standard' | 'power'
  const activeTool = ref('slider') // 'slider' | 'brush' | 'select' | 'pan'
  const sliderPosition = ref(50)
  const previewBg = ref('checkerboard') // 'checkerboard' | 'white' | 'black' | 'gradient'
  const copied = ref(false)

  return { userMode, activeTool, sliderPosition, previewBg, copied }
}
