/**
 * Safari and every iOS browser (all WebKit underneath) must run inference on WASM.
 * Transformers.js loads the plain `ort-wasm-simd-threaded` build on Safari, which has no
 * WebGPU execution provider at all - yet iOS 26 Safari exposes `navigator.gpu`, so probing
 * the adapter says "yes" and session creation then fails. iOS tabs also have a tight memory
 * budget, so we never want a doomed WebGPU session allocated before the WASM retry.
 */
export function isAppleWebKit(nav: Navigator | undefined = typeof navigator !== 'undefined' ? navigator : undefined): boolean {
  if (!nav) return false
  const ua = nav.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)
  const isSafari = (nav.vendor || '').includes('Apple') && !/Chrome|CriOS|FxiOS|EdgiOS|OPiOS|Android/i.test(ua)
  return isIOS || isSafari
}

export const FORCE_WASM_BROWSER = isAppleWebKit()

/** True when the browser can actually run the WebGPU execution provider. */
export const CAN_USE_WEBGPU = typeof navigator !== 'undefined' && !!(navigator as any).gpu && !FORCE_WASM_BROWSER
