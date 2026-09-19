/**
 * Inference telemetry: the numbers behind the "System Telemetry" card and the
 * hardware grid.
 *
 * A single reactive object. `processImage()` fills it in once inference has
 * finished (duration, approximate heap growth, megapixels/second and which
 * backend actually ran), and the template reads it. Nothing here computes
 * anything - the module exists so the shape has one owner instead of being
 * declared inline in the monolith and written from three places.
 *
 * `threads` is read once at creation from `navigator.hardwareConcurrency`,
 * which is why this is a composable rather than a plain constant: it must be
 * created after `navigator` exists.
 *
 * Extracted verbatim from `App.vue`'s script during the AI-context refactor; no
 * behaviour was changed.
 */

import { reactive } from 'vue'

export function useTelemetry() {
  const telemetry = reactive({
    durationMs: 0,
    durationSec: '0.0',
    ramAllocatedMB: 0,
    ramTotalMB: 0,
    throughputMps: '0.0',
    threads: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4,
    deviceUsed: 'WebGPU (Hardware Accelerated)'
  })

  return { telemetry }
}
