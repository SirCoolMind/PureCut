/**
 * Pointer → image-pixel geometry for the canvas viewport.
 *
 * This module is framework-free on purpose. The maths was the reason `App.vue`
 * had to hand `getCanvasCoords` around as a callback to the brush and the
 * selection tools; as a pure function over plain numbers it can be unit-tested
 * without a DOM, a canvas, or a mounted component.
 *
 * The arithmetic is a verbatim move from `App.vue` (see the AI-context refactor
 * history) with exactly two changes: the live viewport rect and the view state
 * arrive as arguments instead of being read from the event and from refs. No
 * behaviour was changed - including the clamping at the end, which keeps a
 * pointer that lands outside the image inside its bounds.
 *
 * Chain of reasoning, kept from the original:
 *   pointer (clientX/Y) → offset inside the viewport → offset from the viewport
 *   centre → undo the CSS transform (pan then zoom, both centred at 50% 50%) →
 *   back to the top-left of the container → subtract the letterbox/pillarbox
 *   offset → scale from the rendered box to the source image's pixels.
 */

/** The viewport's client-space box. A DOMRect satisfies this structurally. */
export interface ViewportRect {
  left: number
  top: number
  width: number
  height: number
}

/** Where the image sits inside the viewport, and how it is transformed. */
export interface ViewGeometry {
  /** Source image width in pixels. */
  imageWidth: number
  /** Source image height in pixels. */
  imageHeight: number
  /** CSS scale factor applied to the stage surface (1 === 100%). */
  zoom: number
  /** Horizontal pan offset in CSS pixels, applied before the scale. */
  panX: number
  /** Vertical pan offset in CSS pixels, applied before the scale. */
  panY: number
}

/** A point in source-image pixel coordinates, clamped to the image bounds. */
export interface ImagePoint {
  x: number
  y: number
}

/** Where an `object-fit: contain` media box sits inside its container. */
export interface ContainBox {
  /** Rendered width of the media, in container CSS pixels. */
  renderW: number
  /** Rendered height of the media, in container CSS pixels. */
  renderH: number
  /** Left edge of the media inside the container, in CSS pixels. */
  offsetX: number
  /** Top edge of the media inside the container, in CSS pixels. */
  offsetY: number
}

/**
 * Resolve the letterboxed / pillarboxed box an `object-fit: contain` element
 * occupies inside its container.
 *
 * Shared by the pointer→pixel mapping and by the viewport's brush-cursor guide,
 * which both need the image's on-screen rectangle: one subtracts it, the other
 * draws on top of it. Keeping the arithmetic in one place is what guarantees the
 * cursor circle and the painted stroke agree.
 */
export function containBox(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number
): ContainBox {
  const imgRatio = imageWidth / imageHeight
  const contRatio = containerWidth / containerHeight

  if (imgRatio > contRatio) {
    // Image is wider - pillarboxed vertically
    const renderH = containerWidth / imgRatio
    return { renderW: containerWidth, renderH, offsetX: 0, offsetY: (containerHeight - renderH) / 2 }
  }
  // Image is taller - letterboxed horizontally
  const renderW = containerHeight * imgRatio
  return { renderW, renderH: containerHeight, offsetX: (containerWidth - renderW) / 2, offsetY: 0 }
}

/**
 * Map a pointer position to the source image's pixel coordinates.
 *
 * `object-fit: contain` means the image is letterboxed or pillarboxed inside the
 * viewport, so the rendered box has to be recomputed from the aspect ratios
 * before the transform can be undone.
 */
export function toImageCoords(
  clientX: number,
  clientY: number,
  viewportRect: ViewportRect,
  geometry: ViewGeometry
): ImagePoint {
  const containerW = viewportRect.width
  const containerH = viewportRect.height

  const { renderW, renderH, offsetX, offsetY } = containBox(
    containerW,
    containerH,
    geometry.imageWidth,
    geometry.imageHeight
  )

  // Pointer position relative to viewport center
  const centerRelX = (clientX - viewportRect.left) - containerW / 2
  const centerRelY = (clientY - viewportRect.top) - containerH / 2

  // Invert CSS transforms (panOffset and zoomLevel centered at 50% 50%)
  const unzoomedCenterX = (centerRelX - geometry.panX) / geometry.zoom
  const unzoomedCenterY = (centerRelY - geometry.panY) / geometry.zoom

  const unzoomedX = unzoomedCenterX + containerW / 2
  const unzoomedY = unzoomedCenterY + containerH / 2

  // Map from unzoomed image layout box to original image pixel coordinates
  const pixelX = (unzoomedX - offsetX) * (geometry.imageWidth / renderW)
  const pixelY = (unzoomedY - offsetY) * (geometry.imageHeight / renderH)

  return {
    x: Math.max(0, Math.min(geometry.imageWidth, pixelX)),
    y: Math.max(0, Math.min(geometry.imageHeight, pixelY))
  }
}
