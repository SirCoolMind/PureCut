/**
 * Viewport surface geometry: where the image actually sits inside the canvas
 * viewport, and where the pointer is relative to it.
 *
 * ## Why this module exists
 *
 * `object-fit: contain` letterboxes an `<img>` inside the viewport, and the
 * pointer→pixel maths in `core/geometry.ts` depends on that letterboxing. The
 * brush layer, however, is a `<canvas>` - and canvas is a replaced element that
 * **ignores `object-fit`**, so it stretches to fill the viewport instead of
 * preserving the image's aspect ratio. The visible symptom was a brush stroke
 * landing somewhere other than under the cursor whenever the image's aspect ratio
 * differed from the viewport's, and a stroke drawn at the wrong scale.
 *
 * So the surface is measured rather than assumed: this composable reports the
 * image's rendered box, and the viewport sizes both the display canvas and the
 * brush surface to it. The cursor guide then shares that same box, which is what
 * makes the ring, the painted stroke and the pointer agree.
 *
 * ## Percentages, not pixels
 *
 * The box is expressed as a percentage of the viewport because the consumers sit
 * inside `.viewport-transform-layer`, whose own size the CSS transform does not
 * change - so a percentage of the layer is exactly a percentage of the unzoomed
 * viewport, and the box stays correct at every zoom level and pan offset.
 *
 * `imageWidth` / `imageHeight` arrive as refs so a new image re-derives the box
 * without the caller re-creating the composable.
 */

import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import { containBox, type ContainBox } from '../core/geometry.js'

interface SurfaceDeps {
  /** Source-image width; 0 until an image loads. */
  imageWidth: Ref<number>
  /** Source-image height; 0 until an image loads. */
  imageHeight: Ref<number>
  /**
   * The element the pointer surface itself is drawn on - i.e. the element a
   * cursor guide is positioned INSIDE. When supplied, pointer→surface mapping is
   * measured against this element's own box, which is exact under any CSS `zoom`,
   * border width, pan or viewport zoom level. Optional so the composable still
   * works for callers that only need the image box.
   */
  surfaceRef?: Ref<HTMLElement | null>
}

export function useViewportSurface({ imageWidth, imageHeight, surfaceRef }: SurfaceDeps) {
  /** Bound in the template via `ref="viewportRef"`. */
  const viewportRef = ref<HTMLElement | null>(null)
  /** Live viewport size, measured rather than assumed. */
  const viewportSize = ref({ width: 0, height: 0 })
  let resizeObserver: ResizeObserver | null = null
  let fontObserver: MutationObserver | null = null
  /** Stored so the same reference can be removed on unmount. */
  let remeasure: (() => void) | null = null
  /** Trailing re-measure that waits out the `zoom` transition. See `onMounted`. */
  let settleTimer: ReturnType<typeof setTimeout> | null = null

  /** The image's rendered box in container CSS pixels, or null before layout. */
  const boxPx = computed<ContainBox | null>(() => {
    const { width, height } = viewportSize.value
    if (!width || !height || !imageWidth.value || !imageHeight.value) return null
    return containBox(width, height, imageWidth.value, imageHeight.value)
  })

  /**
   * The image's rendered box as percentages of the viewport.
   *
   * `{ width, height, left, top }`, or null until the viewport is measured and an
   * image is loaded. Used directly as a `:style` binding.
   */
  const imageBox = computed(() => {
    const box = boxPx.value
    const { width, height } = viewportSize.value
    if (!box) return null
    return {
      width: (box.renderW / width) * 100,
      height: (box.renderH / height) * 100,
      left: (box.offsetX / width) * 100,
      top: (box.offsetY / height) * 100
    }
  })

  /**
   * CSS pixels of rendered image per source-image pixel, in the stage's own
   * (untransformed) coordinate space.
   *
   * A photo is almost never shown at 1:1 - a 1080px-wide photo in a 314px-wide
   * viewport is shown at ~0.29. Anything that has to draw a size expressed in
   * SOURCE pixels - the brush cursor guide is the one consumer - must multiply by
   * this, or it renders ~3x too large. It is the pre-transform scale, which is
   * what the guide needs: the guide lives inside the zoom transform, so the zoom
   * cancels out on both sides.
   */
  const cssPerImagePx = computed(() => {
    const box = boxPx.value
    if (!box || !imageWidth.value) return 1
    return box.renderW / imageWidth.value
  })

  /**
   * Map a pointer event to a point on the pointer surface, as a percentage:
   * `(0,0)` is the surface's top-left corner and `(100,100)` its bottom-right.
   *
   * Measured against the SURFACE's own box, because that is the element the
   * cursor guide is positioned inside. Both operands are client-space numbers
   * taken from the same rect, so the result is a pure ratio: it cannot drift when
   * an ancestor has a CSS `zoom`, when the viewport has a border, or when the
   * stage is panned/scaled - all of which made the earlier version (which mixed a
   * client-space pointer position with content-box layout measurements) place the
   * guide progressively further from the cursor.
   */
  function toSurfacePoint(clientX: number, clientY: number) {
    const surface = surfaceRef?.value
    if (surface) {
      const rect = surface.getBoundingClientRect()
      if (!rect.width || !rect.height) return { x: 0, y: 0 }
      return {
        x: ((clientX - rect.left) / rect.width) * 100,
        y: ((clientY - rect.top) / rect.height) * 100
      }
    }

    // Fallback for callers with no surface element: derive the box from the
    // viewport instead. Same coordinate space on both sides (content box).
    const el = viewportRef.value
    const box = boxPx.value
    if (!el || !box) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const x = (clientX - rect.left - el.clientLeft - box.offsetX) / box.renderW
    const y = (clientY - rect.top - el.clientTop - box.offsetY) / box.renderH
    return { x: x * 100, y: y * 100 }
  }

  onMounted(() => {
    const el = viewportRef.value
    if (!el) return
    const measure = () => {
      viewportSize.value = { width: el.clientWidth, height: el.clientHeight }
    }
    remeasure = measure
    measure()

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure)
      resizeObserver.observe(el)
    }

    // Belt and braces. A change to the UI font size rewrites `--ui-zoom`, which
    // rescales `.app-shell` via CSS `zoom` - and that is INVISIBLE to
    // `ResizeObserver` and to `window.resize` in Chromium, even though this
    // viewport's own `clientWidth`/`clientHeight` change (measured: 1106x718 at
    // 100% vs 774x512 at 130%). Relying on the observer alone froze the box at
    // whatever was measured on mount, so every later font-size change left the
    // image geometry - and therefore the brush cursor ring - derived from a stale
    // aspect ratio. Watching the attribute that drives the zoom is the reliable
    // signal, because `useDisplayScale` always sets it.
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)

    if (typeof MutationObserver !== 'undefined') {
      fontObserver = new MutationObserver(() => {
        // Measure now for responsiveness, then again once the animation has
        // settled. `.app-shell` declares `transition: zoom 0.2s ease`, so an
        // immediate read captures a MID-TRANSITION size - which is how a settled
        // 200ms-later box ended up 10 image px away from the pointer. ResizeObserver
        // cannot help here because it does not fire for `zoom` changes at all.
        measure()
        if (settleTimer) clearTimeout(settleTimer)
        settleTimer = setTimeout(measure, 260)
      })
      fontObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-font-size']
      })
    }
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    fontObserver?.disconnect()
    fontObserver = null
    if (settleTimer) {
      clearTimeout(settleTimer)
      settleTimer = null
    }
    if (remeasure) {
      window.removeEventListener('resize', remeasure)
      window.visualViewport?.removeEventListener('resize', remeasure)
      remeasure = null
    }
  })

  return { viewportRef, imageBox, cssPerImagePx, toSurfacePoint }
}