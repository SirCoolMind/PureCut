/**
 * Canvas compositing: turning the editable mask plus the original photo into the
 * exported cutout, and keeping a live preview in sync while the user works.
 *
 * Two deliberately separate paths, and the distinction is load-bearing:
 *
 *  - `renderFastPreview()` is the cheap one. It draws the original into the
 *    visible `displayCanvasRef` and applies the mask with GPU composite ops
 *    (`destination-in`, plus an optional CSS `blur()` filter for feather), so it
 *    costs well under a millisecond and has no pixel loop and no PNG encode.
 *    `schedulePreview()` wraps it in a `requestAnimationFrame` batch so a burst of
 *    pointer events paints at most once per frame.
 *  - `recompositeCanvas(immediate)` is the heavy one: a full-resolution pixel loop
 *    applying trim / threshold / de-fringe, then `toBlob` PNG encoding. It is
 *    debounced ~120 ms (or forced synchronously by `immediate === true`), and it
 *    always calls `renderFastPreview()` first so the UI responds immediately.
 *
 * Live UI must never call the heavy path directly; that is why brush strokes call
 * `schedulePreview()` while the stroke *ends* with `recompositeCanvas()`.
 *
 * `tuning` lives here because it is the compositor's input. `applyPreset()` is the
 * template's preset cards writing to it.
 *
 * `originalCanvas` / `originalCtx` / `maskCanvas` / `maskCtx` come from the canvas
 * store as live bindings. `displayCanvasRef` is template markup and `resultUrl` /
 * `resultBlob` are the compositor's output, so both arrive as refs.
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; no
 * behaviour was changed.
 */

import { reactive, type Ref } from 'vue'
import { maskCanvas, maskCtx, originalCanvas, originalCtx } from '../core/canvasStore.js'

interface Tuning {
  preset: string
  threshold: number
  feather: number
  trim: number
  deFringe: boolean
}

interface CompositorDeps {
  /** Live size of the loaded image. */
  imageDimensions: { width: number; height: number }
  /** Object URL of the current cutout; replaced (and revoked) by the heavy path. */
  resultUrl: Ref<string | null>
  /** PNG blob of the current cutout; the download link and clipboard read it. */
  resultBlob: Ref<Blob | null>
  /** The visible preview canvas, bound in the template. */
  displayCanvasRef: Ref<HTMLCanvasElement | null>
}

export function useCompositor({ imageDimensions, resultUrl, resultBlob, displayCanvasRef }: CompositorDeps) {
  // Tuning Parameters
  const tuning = reactive<Tuning>({
    preset: 'balanced',
    threshold: 0.5,
    feather: 1,
    trim: 0,
    deFringe: true
  })

  /** Guard so only one preview frame is queued at a time. */
  let rAFPending = false
  /** Timer for debouncing heavy PNG blob encoding. */
  let recompositeDebounceTimer: ReturnType<typeof setTimeout> | null = null

  // Preset Handlers
  function applyPreset(presetName: string) {
    tuning.preset = presetName
    if (presetName === 'balanced') {
      tuning.threshold = 0.5; tuning.feather = 1; tuning.trim = 0; tuning.deFringe = true
    } else if (presetName === 'hair') {
      tuning.threshold = 0.4; tuning.feather = 2; tuning.trim = -1; tuning.deFringe = false
    } else if (presetName === 'product') {
      tuning.threshold = 0.6; tuning.feather = 0; tuning.trim = 1; tuning.deFringe = true
    } else if (presetName === 'aggressive') {
      tuning.threshold = 0.75; tuning.feather = 0; tuning.trim = 2; tuning.deFringe = true
    }
    recompositeCanvas()
  }

  // Fast GPU-composited preview - no pixel loop, no PNG encode, runs in <1ms
  function renderFastPreview() {
    if (!originalCanvas || !maskCanvas) return
    const canvas = displayCanvasRef.value
    if (!canvas) return
    const width = imageDimensions.width
    const height = imageDimensions.height
    if (!width || !height) return

    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')!

    // Step 1: Draw original photo
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(originalCanvas, 0, 0)

    // Step 2: Apply feathered mask using GPU composite ops (no pixel loop!)
    if (tuning.feather > 0) {
      const tempMask = document.createElement('canvas')
      tempMask.width = width
      tempMask.height = height
      const tmpCtx = tempMask.getContext('2d')!
      tmpCtx.filter = `blur(${tuning.feather}px)`
      tmpCtx.drawImage(maskCanvas, 0, 0)
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(tempMask, 0, 0)
    } else {
      ctx.globalCompositeOperation = 'destination-in'
      ctx.drawImage(maskCanvas, 0, 0)
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  // Schedule a fast preview on the next animation frame (batched to screen refresh)
  function schedulePreview() {
    if (rAFPending) return
    rAFPending = true
    requestAnimationFrame(() => {
      rAFPending = false
      renderFastPreview()
    })
  }

  // Canvas Compositing Engine: Full-quality compositing with threshold, trim, de-fringe + PNG export
  function recompositeCanvas(immediateBlob = false) {
    if (!originalCtx || !maskCtx) return
    const width = imageDimensions.width
    const height = imageDimensions.height
    if (!width || !height) return

    // 1. Immediately update fast GPU preview (<1ms) so the UI responds instantly
    renderFastPreview()

    // 2. Debounce heavy full-resolution pixel loop and PNG toBlob encoding
    if (recompositeDebounceTimer) {
      clearTimeout(recompositeDebounceTimer)
      recompositeDebounceTimer = null
    }

    const runHeavyExport = () => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!

      // Draw original image
      ctx.drawImage(originalCanvas, 0, 0)
      const imgData = ctx.getImageData(0, 0, width, height)
      const imgPixels = imgData.data

      // Apply feather (blur) if requested
      const tempMaskCanvas = document.createElement('canvas')
      tempMaskCanvas.width = width
      tempMaskCanvas.height = height
      const tempMaskCtx = tempMaskCanvas.getContext('2d', { willReadFrequently: true })!

      // If trim is used but feather is 0, we need a slight blur to allow morphological edge shifting
      let applyBlur = tuning.feather;
      if (tuning.trim !== 0 && applyBlur === 0) {
        applyBlur = Math.abs(tuning.trim) * 1.5;
      }
      if (applyBlur > 0) {
        tempMaskCtx.filter = `blur(${applyBlur}px)`
      }

      tempMaskCtx.drawImage(maskCanvas, 0, 0)
      const maskData = tempMaskCtx.getImageData(0, 0, width, height)
      const maskPixels = maskData.data

      const totalPixels = width * height
      const thresholdVal = tuning.threshold * 255
      const trimShift = tuning.trim * 20 // scale trim impact

      for (let i = 0; i < totalPixels; i++) {
        const idx = i * 4
        let rawAlpha = maskPixels[idx + 3]

        // Trim (Erode/Dilate) via Alpha Level Adjustment
        if (trimShift > 0) {
          // Erode: push alpha down, but rescale max back to 255 so the interior remains completely solid
          rawAlpha = Math.max(0, (rawAlpha - trimShift) * (255 / (255 - trimShift)))
        } else if (trimShift < 0) {
          // Dilate: boost alpha to push the edge outwards
          rawAlpha = Math.min(255, rawAlpha - trimShift)
        }

        // Apply Threshold (Smooth Step)
        let finalAlpha = 0
        if (rawAlpha >= thresholdVal) {
          const range = 255 - thresholdVal
          finalAlpha = range > 0 ? Math.min(255, Math.round(((rawAlpha - thresholdVal) / range) * 255)) : 255
        } else {
          finalAlpha = 0
        }

        imgPixels[idx + 3] = finalAlpha

        // De-fringe color halo
        if (tuning.deFringe && finalAlpha > 0 && finalAlpha < 240) {
          const r = imgPixels[idx]
          const g = imgPixels[idx + 1]
          const b = imgPixels[idx + 2]
          const avg = (r + g + b) / 3
          imgPixels[idx] = Math.round(r * 0.85 + avg * 0.15)
          imgPixels[idx + 1] = Math.round(g * 0.85 + avg * 0.15)
          imgPixels[idx + 2] = Math.round(b * 0.85 + avg * 0.15)
        }
      }

      ctx.putImageData(imgData, 0, 0)

      canvas.toBlob((blob) => {
        if (blob) {
          resultBlob.value = blob
          if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
          resultUrl.value = URL.createObjectURL(blob)
        }
      }, 'image/png')
    }

    if (immediateBlob) {
      runHeavyExport()
    } else {
      recompositeDebounceTimer = setTimeout(runHeavyExport, 120)
    }
  }

  /**
   * Clear the "a preview frame is already queued" guard.
   *
   * `reset()` used to assign the module-level flag directly; now that the flag
   * lives here it needs an accessor. Behaviour is unchanged: any frame that is
   * already queued still fires, and `renderFastPreview()` returns early because
   * the canvases are gone.
   */
  function clearPendingPreview() {
    rAFPending = false
  }

  return { tuning, applyPreset, renderFastPreview, schedulePreview, recompositeCanvas, clearPendingPreview }
}
