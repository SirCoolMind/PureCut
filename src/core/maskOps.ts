/**
 * Mask-mutation primitives: pure functions over pixel buffers.
 *
 * These are the maths that used to sit inline in the composables. They are here
 * so vitest can exercise them directly: no canvas, no DOM, no Vue - just typed
 * arrays in and out. The composables keep the canvas plumbing (getImageData,
 * putImageData, fillRect) and call in for the arithmetic.
 *
 * Every function is a VERBATIM lift of the loop it replaces. The operators,
 * clamps and rounding are unchanged on purpose - several of them are load
 * bearing for how the cutout looks (the trim rescale, in particular), and one of
 * them pins a KNOWN BUG rather than fixing it. See the notes on each function.
 *
 * Nothing here reads `document`, so `npm test` can run it under plain node with
 * hand-built `Uint8ClampedArray`s.
 */

/**
 * The subset of the compositor's `tuning` object this module needs.
 * Structurally compatible with `useCompositor`'s private `Tuning` interface, so
 * the composable can pass its object straight through.
 */
export interface TrimThresholdOptions {
  /** 0..1. Alphas below this are cut to 0; at or above it they ramp to 255. */
  threshold: number
  /** Pixels of blur already applied to the mask before this runs. */
  feather: number
  /** -N..N. Positive erodes the edge, negative dilates it. */
  trim: number
  /** Pull partially transparent pixels toward their local average colour. */
  deFringe: boolean
}

/**
 * A pixel buffer that is only READ. `getImageData().data` is a
 * `Uint8ClampedArray`, but the detection engine hands out `Uint8Array`, and the
 * two are interchangeable for reads - so read-only parameters accept both.
 */
export type ReadonlyPixels = Uint8Array | Uint8ClampedArray

/**
 * Apply trim, threshold and de-fringe to the alpha channel, in the order
 * `recompositeCanvas` has always applied them.
 *
 * `imgPixels` and `maskPixels` are the RGBA buffers of the composited original
 * and of the feathered mask. Alpha in `imgPixels` is written in place:
 *
 *   1. **Trim** moves the edge by scaling alpha. `trimShift > 0` (erode) pushes
 *      alpha down but rescales the maximum back to 255 so the interior stays
 *      fully opaque. `trimShift < 0` (dilate) just lifts every alpha toward 255.
 *      NOTE: with a large trim the `255 / (255 - trimShift)` factor can exceed 1,
 *      so this is not a true erode - it is the behaviour the app has always had.
 *   2. **Threshold** is a smooth step: below `threshold * 255` the pixel becomes
 *      fully transparent, at or above it alpha is stretched linearly to 255.
 *   3. **De-fringe** pulls the RGB of semi-transparent pixels (alpha 1..239)
 *      toward their own average by 15%, which hides the halo the background
 *      leaves on anti-aliased edges.
 *
 * @param imgPixels  RGBA buffer mutated in place (alpha, and RGB when de-fringing).
 * @param maskPixels RGBA buffer of the mask; only its alpha channel is read.
 * @param totalPixels width * height. NOT derived from the buffer length.
 * @param tuning     threshold / trim / deFringe. `feather` is unused here - the
 *                   blur happened on the canvas before the read.
 */
export function applyTrimThresholdDefringe(
  imgPixels: Uint8ClampedArray,
  maskPixels: ReadonlyPixels,
  totalPixels: number,
  tuning: TrimThresholdOptions
): void {
  const thresholdVal = tuning.threshold * 255
  const trimShift = tuning.trim * 20 // scale trim impact

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4
    let rawAlpha = maskPixels[idx + 3]!

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
      const r = imgPixels[idx]!
      const g = imgPixels[idx + 1]!
      const b = imgPixels[idx + 2]!
      const avg = (r + g + b) / 3
      imgPixels[idx] = Math.round(r * 0.85 + avg * 0.15)
      imgPixels[idx + 1] = Math.round(g * 0.85 + avg * 0.15)
      imgPixels[idx + 2] = Math.round(b * 0.85 + avg * 0.15)
    }
  }
}

/** One full-resolution `fillRect` for a wand region on the mask. */
export interface EraserRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Map a magic wand's low-resolution `visitedMask` back to full-resolution fill
 * rectangles.
 *
 * The wand detects at a reduced scale (`scale`), so each visited cell in the
 * `sw` x `sh` working grid becomes a block of `ceil(1/scale)` pixels in the real
 * mask. This is the exact inverse mapping `applySelectionAction` has always
 * used - the eight calls to `Math.floor` / `Math.ceil` per cell are the point of
 * the extraction, because getting them wrong shifts the erased region.
 *
 * @param visited 1 byte per working-grid cell; non-zero means "selected".
 * @param sw      Working-grid width.
 * @param sh      Working-grid height.
 * @param scale   Working-grid pixels per real pixel (`< 1`).
 */
export function* wandEraserRects(
  visited: ReadonlyPixels,
  sw: number,
  sh: number,
  scale: number
): Generator<EraserRect> {
  const invScale = 1 / scale

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (visited[y * sw + x]) {
        yield {
          x: Math.floor(x * invScale),
          y: Math.floor(y * invScale),
          w: Math.ceil(invScale),
          h: Math.ceil(invScale)
        }
      }
    }
  }
}

/**
 * The region `toggleSubjectVisibility` clips to before filling.
 *
 * This deliberately returns the subject's BOUNDING BOX, not its per-component
 * mask. KNOWN BUG, REPORTED NOT FIXED: erasing one subject therefore wipes any
 * overlapping pixels of its neighbours (see the subjects composable and
 * `AGENTS.md` known issue 1). The function exists in this shape so the behaviour
 * is pinned by a test - a future fix has to change this function and its test
 * on purpose rather than by accident.
 */
export function subjectEraseRect(subject: {
  x: number
  y: number
  width: number
  height: number
}): EraserRect {
  return { x: subject.x, y: subject.y, w: subject.width, h: subject.height }
}

/**
 * Would a subject's bounding-box erase touch a pixel?
 *
 * This is the subject-eraser equivalent of walking the canvas: it answers the
 * question the composable's `fillRect` answers, without a canvas. Used by the
 * unit tests to pin the known overlap bug, and available to the app if it ever
 * needs to compute an erase region ahead of painting it.
 *
 * Coordinates are treated as left-inclusive, and the box covers `width` x
 * `height` pixels, matching `CanvasRenderingContext2D.rect` / `fill`.
 */
export function rectContains(
  rect: EraserRect,
  px: number,
  py: number
): boolean {
  return px >= rect.x && px < rect.x + rect.w && py >= rect.y && py < rect.y + rect.h
}

/**
 * Magnetic-lasso snap: pick the mask edge nearest the cursor inside a patch.
 *
 * The caller samples a square patch of the mask around the cursor with
 * `getImageData`; this scores every other pixel of that patch (step 2, for
 * speed) and returns the best one **in image coordinates**.
 *
 * The score is `gradient / (1 + distance * 0.7)` over a central-difference
 * alpha gradient, so a strong edge wins but a weak edge right at the cursor can
 * beat a strong one further away. Only gradients above 25 count, which is what
 * keeps flat mask interiors from claiming the snap.
 *
 * Falls back to the untouched cursor when no candidate clears the threshold -
 * the caller relies on getting `{ x, y }` back rather than `null`.
 *
 * @param patch  RGBA buffer from `getImageData(x0, y0, patchW, patchH)`.
 * @param patchW Patch width in pixels (patch is `patchW * patchH` pixels).
 * @param patchH Patch height in pixels.
 * @param x0     Image-space x of the patch's top-left corner.
 * @param y0     Image-space y of the patch's top-left corner.
 * @param x      Cursor x, in the same space as `x0`.
 * @param y      Cursor y, in the same space as `y0`.
 */
export function snapToNearestEdge(
  patch: ReadonlyPixels,
  patchW: number,
  patchH: number,
  x0: number,
  y0: number,
  x: number,
  y: number
): { x: number; y: number } {
  let bestX = x
  let bestY = y
  let maxScore = -1

  // Scan pixels in the patch to find high-gradient mask transitions (alpha ~ 128 or sharp delta)
  const step = 2 // sample every 2px for high performance
  for (let py = 1; py < patchH - 1; py += step) {
    for (let px = 1; px < patchW - 1; px += step) {
      // Alpha gradient magnitude (Sobel / central differences)
      const aRight = patch[(py * patchW + (px + 1)) * 4 + 3]!
      const aLeft = patch[(py * patchW + (px - 1)) * 4 + 3]!
      const aDown = patch[((py + 1) * patchW + px) * 4 + 3]!
      const aUp = patch[((py - 1) * patchW + px) * 4 + 3]!

      const gx = Math.abs(aRight - aLeft)
      const gy = Math.abs(aDown - aUp)
      const gradient = gx + gy

      // Transition score: combination of edge gradient and distance to cursor
      if (gradient > 25) {
        const curPxX = x0 + px
        const curPxY = y0 + py
        const dist = Math.hypot(curPxX - x, curPxY - y)
        // Score favors strong gradients closer to the cursor
        const score = gradient / (1 + dist * 0.7)
        if (score > maxScore) {
          maxScore = score
          bestX = curPxX
          bestY = curPxY
        }
      }
    }
  }

  return { x: bestX, y: bestY }
}
