/**
 * Number formatting helpers.
 *
 * Framework-free and side-effect-free, so it is unit-testable in isolation - the
 * shape every module in `src/core/` must keep.
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; no
 * behaviour was changed.
 */

/**
 * Human-readable byte size, binary units (1 KB = 1024 B).
 *
 * @example formatBytes(1536) // '1.5 KB'
 */
export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
}
