/**
 * Shared canvas handles for PureCut's editing pipeline.
 *
 * ## Why this exists
 *
 * `processImage()` builds two offscreen canvases (the untouched original, and
 * the greyscale mask every tool edits in place) and then the brush, selection,
 * outline and subject tools all mutate that same mask. Those four handles used
 * to be module-level `let` bindings inside `App.vue`'s `<script setup>`.
 *
 * Threading them through every extracted composable as parameters would not
 * work: a composable that captured the *value* of `maskCtx` would hold a stale
 * context as soon as the next image was processed, because `processImage()`
 * replaces the canvases wholesale. Passing getters everywhere makes every
 * signature noisier and every call site longer for no benefit.
 *
 * So the bindings live here instead, exported as ES module **live bindings**.
 * A reader that imports `maskCtx` always observes the current value, exactly as
 * the old closure over `App.vue`'s script scope did, and no existing call site
 * had to change.
 *
 * ## Do NOT make these reactive
 *
 * These are plain module state - never `ref()`, never `reactive()`. Wrapping a
 * canvas or a `CanvasRenderingContext2D` in a Vue proxy breaks the identity
 * checks behind `getImageData` / `putImageData` and destroys canvas
 * performance. Pass the raw values around; the same rule applies inside every
 * composable that touches them.
 *
 * ## Reading vs writing
 *
 * Importers may READ these bindings directly. They must not assign to them:
 * ES modules forbid assigning to an imported binding, which is deliberate here
 * - it forces the create/replace/clear paths through the functions below so
 * there is exactly one place per canvas where the handle changes.
 *
 * ## Scope note (deliberate trade-off)
 *
 * These bindings are per *module*, not per component instance, whereas the old
 * `let` declarations were per `App.vue` instance. PureCut has a single root
 * App instance, so this is not observable today. If App.vue is ever mounted
 * more than once, the instances would share one canvas pair.
 *
 * Extracted verbatim from `App.vue`'s script during the AI-context refactor; no
 * behaviour was changed.
 */

/** The photograph as loaded, drawn once at full resolution. Source of truth for the wand tool. */
export let originalCanvas: HTMLCanvasElement | null = null

/** 2D context of {@link originalCanvas}, created with `willReadFrequently`. */
export let originalCtx: CanvasRenderingContext2D | null = null

/** The editable greyscale mask. Every tool (brush, selection, subjects) mutates this in place. */
export let maskCanvas: HTMLCanvasElement | null = null

/** 2D context of {@link maskCanvas}, created with `willReadFrequently`. */
export let maskCtx: CanvasRenderingContext2D | null = null

/** Publish a newly created original canvas. Call before {@link setOriginalCtx}. */
export function setOriginalCanvas(canvas: HTMLCanvasElement | null): void {
  originalCanvas = canvas
}

/** Publish the context belonging to {@link setOriginalCanvas}'s canvas. */
export function setOriginalCtx(ctx: CanvasRenderingContext2D | null): void {
  originalCtx = ctx
}

/** Publish a newly created mask canvas. Call before {@link setMaskCtx}. */
export function setMaskCanvas(canvas: HTMLCanvasElement | null): void {
  maskCanvas = canvas
}

/** Publish the context belonging to {@link setMaskCanvas}'s canvas. */
export function setMaskCtx(ctx: CanvasRenderingContext2D | null): void {
  maskCtx = ctx
}

/**
 * Drop both canvases and their contexts, releasing the pixel buffers for GC.
 * Called by `reset()`; the next `processImage()` republishes new ones.
 */
export function clearCanvases(): void {
  originalCanvas = null
  originalCtx = null
  maskCanvas = null
  maskCtx = null
}
