import { describe, it, expect } from 'vitest'
import { toImageCoords } from '../../src/core/geometry.js'

/**
 * Unit tests for the pointer → pixel mapping.
 *
 * These are the tests the AI-context refactor was aiming for: `toImageCoords` is
 * pure (no DOM, no refs), so every case below is plain arithmetic on numbers - no
 * canvas, no viewport, no fake timers. The same code used to sit inside `App.vue`
 * reading `imageDimensions`, `zoomLevel` and `panOffset` out of its closure, which
 * made it untestable without mounting the whole app.
 *
 * The expected numbers are derived, not recorded: for a viewport and an image that
 * agree on aspect ratio the mapping is a plain scale, and everything else is that
 * scale plus the letterbox/pillarbox offset.
 */

/** A 400x400 viewport with no zoom and no pan. */
const square = { left: 0, top: 0, width: 400, height: 400 }
/** A 1000x500 image (2:1) in a square viewport gets letterboxed vertically. */
const wide = { imageWidth: 1000, imageHeight: 500, zoom: 1, panX: 0, panY: 0 }
/** A 1000x2000 image (1:2) in a square viewport gets pillarboxed horizontally. */
const tall = { imageWidth: 1000, imageHeight: 2000, zoom: 1, panX: 0, panY: 0 }

describe('toImageCoords', () => {
  it('maps the viewport centre to the image centre for a matching aspect ratio', () => {
    const geometry = { imageWidth: 800, imageHeight: 800, zoom: 1, panX: 0, panY: 0 }
    expect(toImageCoords(200, 200, square, geometry)).toEqual({ x: 400, y: 400 })
  })

  it('maps the viewport corners to the image corners for a matching aspect ratio', () => {
    const geometry = { imageWidth: 800, imageHeight: 800, zoom: 1, panX: 0, panY: 0 }
    expect(toImageCoords(0, 0, square, geometry)).toEqual({ x: 0, y: 0 })
    expect(toImageCoords(400, 400, square, geometry)).toEqual({ x: 800, y: 800 })
  })

  it('subtracts the viewport offset so it does not matter where the stage sits', () => {
    const geometry = { imageWidth: 800, imageHeight: 800, zoom: 1, panX: 0, panY: 0 }
    const shifted = { left: 120, top: 90, width: 400, height: 400 }
    expect(toImageCoords(320, 290, shifted, geometry)).toEqual({ x: 400, y: 400 })
  })

  it('accounts for the pillarbox band when the image is wider than the viewport', () => {
    // 2:1 image in a square viewport: it is 400 wide and 200 tall, centred, so the
    // top quarter of the viewport is empty and the image's left edge is at y=100.
    expect(toImageCoords(0, 100, square, wide)).toEqual({ x: 0, y: 0 })
    expect(toImageCoords(400, 300, square, wide)).toEqual({ x: 1000, y: 500 })
    expect(toImageCoords(200, 200, square, wide)).toEqual({ x: 500, y: 250 })
  })

  it('accounts for the letterbox band when the image is taller than the viewport', () => {
    // 1:2 image in a square viewport: it is 200 wide and 400 tall, so the side
    // bands are 100px each and the image's top-left corner is at (100, 0).
    expect(toImageCoords(100, 0, square, tall)).toEqual({ x: 0, y: 0 })
    expect(toImageCoords(300, 400, square, tall)).toEqual({ x: 1000, y: 2000 })
  })

  it('divides the pointer offset by the zoom factor', () => {
    // At 200% the viewport shows the middle half of the image, so the viewport's
    // top-left corner is the image's quarter point.
    const geometry = { imageWidth: 800, imageHeight: 800, zoom: 2, panX: 0, panY: 0 }
    expect(toImageCoords(0, 0, square, geometry)).toEqual({ x: 200, y: 200 })
    expect(toImageCoords(400, 400, square, geometry)).toEqual({ x: 600, y: 600 })
  })

  it('inverts the pan offset after the zoom, matching the CSS transform order', () => {
    // translate then scale: panning the image right by 100px means the same screen
    // point now sits further LEFT in image space. In this viewport one screen pixel
    // is two image pixels (800 source pixels across a 400px box).
    const panned = { imageWidth: 800, imageHeight: 800, zoom: 1, panX: 100, panY: 0 }
    expect(toImageCoords(200, 200, square, panned)).toEqual({ x: 200, y: 400 })

    // The pan is divided by the zoom, so at 200% it is worth half as many image
    // pixels: 400 - (100 / 2) * 2 = 300.
    const zoomedPan = { imageWidth: 800, imageHeight: 800, zoom: 2, panX: 100, panY: 0 }
    expect(toImageCoords(200, 200, square, zoomedPan)).toEqual({ x: 300, y: 400 })
  })

  it('clamps a pointer outside the image to the image bounds', () => {
    const geometry = { imageWidth: 800, imageHeight: 800, zoom: 1, panX: 0, panY: 0 }
    expect(toImageCoords(-500, -500, square, geometry)).toEqual({ x: 0, y: 0 })
    expect(toImageCoords(900, 900, square, geometry)).toEqual({ x: 800, y: 800 })
  })

  it('clamps to the image, not the viewport, in the letterboxed axis', () => {
    // y = 50 is inside the viewport but inside the top letterbox band; it must
    // clamp to the image's first row rather than going negative.
    expect(toImageCoords(200, 50, square, wide).y).toBe(0)
    expect(toImageCoords(200, 350, square, wide).y).toBe(500)
  })
})
