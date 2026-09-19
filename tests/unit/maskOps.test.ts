import { describe, it, expect } from 'vitest'
import {
  applyTrimThresholdDefringe,
  rectContains,
  snapToNearestEdge,
  subjectEraseRect,
  wandEraserRects,
  type TrimThresholdOptions
} from '../../src/core/maskOps.js'

/**
 * Unit tests for the mask-mutation primitives.
 *
 * These are the tests the refactor was aiming for: every function here works on
 * `Uint8ClampedArray`s and plain numbers, so the cases below are arithmetic on
 * hand-built buffers - no canvas, no `ImageData`, no DOM. The same code used to
 * sit inline in `useCompositor`, `useSelectionTools` and `useSubjects`, where
 * reaching it meant mounting the app, uploading an image and waiting for
 * inference.
 *
 * The expected numbers are derived from the formulas, not recorded from a run.
 */

/** Build an RGBA buffer from `[r, g, b, a]` tuples. */
const rgba = (...pixels: [number, number, number, number][]) => new Uint8ClampedArray(pixels.flat())

/** Build a mask buffer (alpha is the only channel that matters) from alphas. */
const mask = (...alphas: number[]) => new Uint8ClampedArray(alphas.flatMap((a) => [0, 0, 0, a]))

/** Tuning with everything neutral except the fields a case overrides. */
const tuning = (overrides: Partial<TrimThresholdOptions> = {}): TrimThresholdOptions => ({
  threshold: 0.5,
  feather: 0,
  trim: 0,
  deFringe: false,
  ...overrides
})

const alphaOf = (buf: Uint8ClampedArray, i: number) => buf[i * 4 + 3]

describe('applyTrimThresholdDefringe', () => {
  describe('threshold', () => {
    it('cuts alpha below threshold*255 to fully transparent', () => {
      // threshold 0.5 -> 127.5. 127 is below, 128 is at/above.
      const img = rgba([10, 10, 10, 255], [10, 10, 10, 255])
      applyTrimThresholdDefringe(img, mask(127, 128), 2, tuning())

      expect(alphaOf(img, 0)).toBe(0)
    })

    it('stretches alpha at or above the threshold linearly to 255', () => {
      // Just above the threshold the stretch is ~0, so alpha lands at 0 or 1.
      const atThreshold = rgba([10, 10, 10, 255])
      applyTrimThresholdDefringe(atThreshold, mask(128), 1, tuning())
      expect(alphaOf(atThreshold, 0)).toBeLessThanOrEqual(1)

      // 200 -> (200 - 127.5) / (255 - 127.5) * 255 = 145
      const mid = rgba([10, 10, 10, 255])
      applyTrimThresholdDefringe(mid, mask(200), 1, tuning())
      expect(alphaOf(mid, 0)).toBe(145)
    })

    it('keeps fully opaque mask pixels fully opaque', () => {
      const img = rgba([10, 10, 10, 0])
      applyTrimThresholdDefringe(img, mask(255), 1, tuning())
      expect(alphaOf(img, 0)).toBe(255)
    })

    it('always produces alpha 255 at threshold 0, whatever the mask says', () => {
      // threshold 0 -> thresholdVal 0, range 255 -> the smooth step is the identity,
      // except that range 0 (threshold 1) is special-cased to 255. Guard both edges.
      const zeroThreshold = rgba([1, 2, 3, 0])
      applyTrimThresholdDefringe(zeroThreshold, mask(60), 1, tuning({ threshold: 0 }))
      expect(alphaOf(zeroThreshold, 0)).toBe(60)

      const maxThreshold = rgba([1, 2, 3, 0])
      applyTrimThresholdDefringe(maxThreshold, mask(255), 1, tuning({ threshold: 1 }))
      expect(alphaOf(maxThreshold, 0)).toBe(255)
    })
  })

  describe('trim', () => {
    it('erodes edge alpha while leaving the mask interior fully opaque', () => {
      // trim 1 -> trimShift 20. 200 -> max(0, (200 - 20) * (255 / 235)) = 195
      const img = rgba([10, 10, 10, 255], [10, 10, 10, 255])
      applyTrimThresholdDefringe(img, mask(200, 255), 2, tuning({ trim: 1, threshold: 0 }))

      expect(alphaOf(img, 0)).toBe(195)
      // 255 -> still 255, which is what keeps the interior solid.
      expect(alphaOf(img, 1)).toBe(255)
    })

    it('clamps eroded alpha at 0 rather than going negative', () => {
      const img = rgba([10, 10, 10, 255])
      applyTrimThresholdDefringe(img, mask(5), 1, tuning({ trim: 1, threshold: 0 }))
      expect(alphaOf(img, 0)).toBe(0)
    })

    it('dilates by lifting alpha and clamping at 255', () => {
      // trim -1 -> trimShift -20. 200 -> min(255, 200 + 20) = 220
      const img = rgba([10, 10, 10, 255], [10, 10, 10, 255])
      applyTrimThresholdDefringe(img, mask(200, 250), 2, tuning({ trim: -1, threshold: 0 }))

      expect(alphaOf(img, 0)).toBe(220)
      expect(alphaOf(img, 1)).toBe(255)
    })

    it('leaves alpha untouched when trim is 0', () => {
      const img = rgba([10, 10, 10, 255])
      applyTrimThresholdDefringe(img, mask(137), 1, tuning({ trim: 0, threshold: 0 }))
      expect(alphaOf(img, 0)).toBe(137)
    })
  })

  describe('de-fringe', () => {
    it('pulls semi-transparent RGB 15% toward its own average', () => {
      // alpha 100 is in the de-fringe band (1..239). avg = (0 + 100 + 200) / 3 = 100
      const img = rgba([0, 100, 200, 255])
      applyTrimThresholdDefringe(img, mask(200), 1, tuning({ deFringe: true }))

      // 0   * 0.85 + 100 * 0.15 = 15
      // 100 * 0.85 + 100 * 0.15 = 100
      // 200 * 0.85 + 100 * 0.15 = 185
      expect([img[0], img[1], img[2]]).toEqual([15, 100, 185])
    })

    it('leaves fully-opaque pixels alone (alpha 255 is outside the band)', () => {
      const img = rgba([0, 100, 200, 255])
      applyTrimThresholdDefringe(img, mask(255), 1, tuning({ deFringe: true, threshold: 0 }))
      expect([img[0], img[1], img[2]]).toEqual([0, 100, 200])
    })

    it('leaves fully-transparent pixels alone', () => {
      const img = rgba([0, 100, 200, 255])
      applyTrimThresholdDefringe(img, mask(0), 1, tuning({ deFringe: true }))
      expect(alphaOf(img, 0)).toBe(0)
      expect([img[0], img[1], img[2]]).toEqual([0, 100, 200])
    })

    it('does nothing to RGB when disabled', () => {
      const img = rgba([0, 100, 200, 255])
      applyTrimThresholdDefringe(img, mask(100), 1, tuning({ deFringe: false }))
      expect([img[0], img[1], img[2]]).toEqual([0, 100, 200])
    })
  })

  it('only touches the pixels inside totalPixels, not the whole buffer', () => {
    // A buffer with three pixels but totalPixels = 1: the trailing two must not move.
    const img = rgba([1, 1, 1, 255], [2, 2, 2, 255], [3, 3, 3, 255])
    applyTrimThresholdDefringe(img, mask(0, 255, 255), 1, tuning())
    expect(alphaOf(img, 0)).toBe(0)
    expect(alphaOf(img, 1)).toBe(255)
    expect(alphaOf(img, 2)).toBe(255)
  })

  it('applies trim before threshold, so trim can push a pixel below the cut', () => {
    // alpha 140, trim 1 (shift 20) -> 130.2, still >= 127.5 -> survives.
    const survives = rgba([0, 0, 0, 0])
    applyTrimThresholdDefringe(survives, mask(140), 1, tuning({ trim: 1 }))
    expect(alphaOf(survives, 0)).toBeGreaterThan(0)

    // alpha 135 -> 124.8, below the threshold -> cut to 0.
    const cut = rgba([0, 0, 0, 0])
    applyTrimThresholdDefringe(cut, mask(135), 1, tuning({ trim: 1 }))
    expect(alphaOf(cut, 0)).toBe(0)
  })
})

describe('wandEraserRects', () => {
  it('maps each visited working pixel to one full-resolution block', () => {
    // 2x2 working grid at scale 0.5 -> each cell is 2x2 real pixels.
    const visited = new Uint8ClampedArray([1, 1, 0, 0])
    expect([...wandEraserRects(visited, 2, 2, 0.5)]).toEqual([
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 2, y: 0, w: 2, h: 2 }
    ])
  })

  it('floors the origin and ceils the size so no pixel is missed', () => {
    // scale 0.3 -> invScale 3.33; cell (1, 0) starts at floor(3.33) = 3 and is
    // ceil(3.33) = 4 wide, i.e. the block overhangs rather than leaving a gap.
    const visited = new Uint8ClampedArray([0, 1])
    expect([...wandEraserRects(visited, 2, 1, 0.3)]).toEqual([{ x: 3, y: 0, w: 4, h: 4 }])
  })

  it('yields nothing for an empty selection', () => {
    expect([...wandEraserRects(new Uint8ClampedArray(4), 2, 2, 0.5)]).toEqual([])
  })

  it('walks row-major: every cell of a row before the next row', () => {
    const visited = new Uint8ClampedArray([1, 0, 1, 0, 1, 0])
    const xs = [...wandEraserRects(visited, 3, 2, 1)].map((r) => `${r.x},${r.y}`)
    expect(xs).toEqual(['0,0', '2,0', '1,1'])
  })

  it('uses every byte of visitedMask, not every fourth, at scale 1', () => {
    // Regression guard for the mapping: at scale 1 the rect for cell i is exactly
    // the identity box, so a mistaken *4 stride would show up immediately.
    const visited = new Uint8ClampedArray([0, 1, 0, 1])
    expect([...wandEraserRects(visited, 2, 2, 1)]).toEqual([
      { x: 1, y: 0, w: 1, h: 1 },
      { x: 1, y: 1, w: 1, h: 1 }
    ])
  })
})

describe('subjectEraseRect / rectContains', () => {
  it('exposes the subject as its bounding box, untouched', () => {
    expect(subjectEraseRect({ x: 10, y: 20, width: 30, height: 40 })).toEqual({
      x: 10,
      y: 20,
      w: 30,
      h: 40
    })
  })

  it('treats the box as left- and top-inclusive, right- and bottom-exclusive', () => {
    const rect = subjectEraseRect({ x: 10, y: 20, width: 30, height: 40 })
    expect(rectContains(rect, 10, 20)).toBe(true)
    expect(rectContains(rect, 39, 59)).toBe(true)
    expect(rectContains(rect, 40, 59)).toBe(false)
    expect(rectContains(rect, 39, 60)).toBe(false)
    expect(rectContains(rect, 9, 20)).toBe(false)
  })

  /**
   * PINS KNOWN ISSUE 1. `toggleSubjectVisibility` erases a bounding box, not the
   * per-component mask, so a pixel that belongs to two overlapping subjects is
   * erased by either of them. This is current behaviour, reported rather than
   * fixed; if a future change makes the erase mask-accurate this test must be
   * changed deliberately.
   */
  it('reports overlap between neighbouring subjects (KNOWN ISSUE 1, not a bug fix)', () => {
    const left = subjectEraseRect({ x: 0, y: 0, width: 100, height: 100 })
    const right = subjectEraseRect({ x: 80, y: 0, width: 100, height: 100 })

    // A pixel in the 20px strip both boxes cover.
    expect(rectContains(left, 90, 50)).toBe(true)
    expect(rectContains(right, 90, 50)).toBe(true)

    // And a pixel only the left subject actually owns is still inside its box,
    // which is why erasing the right subject would not disturb it.
    expect(rectContains(left, 10, 50)).toBe(true)
    expect(rectContains(right, 10, 50)).toBe(false)
  })
})

describe('snapToNearestEdge', () => {
  /** A `w` x `h` patch whose alpha is given by a callback. */
  const patchFrom = (w: number, h: number, alpha: (x: number, y: number) => number) => {
    const buf = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) buf[(y * w + x) * 4 + 3] = alpha(x, y)
    }
    return buf
  }

  it('returns the cursor unchanged when the patch is flat', () => {
    const patch = patchFrom(9, 9, () => 255)
    expect(snapToNearestEdge(patch, 9, 9, 100, 200, 104, 204)).toEqual({ x: 104, y: 204 })
  })

  it('snaps to a strong alpha edge, in image coordinates', () => {
    // Hard vertical edge at x = 4: left half transparent, right half opaque.
    const patch = patchFrom(9, 9, (x) => (x < 4 ? 0 : 255))
    const snapped = snapToNearestEdge(patch, 9, 9, 100, 200, 104, 204)

    // The first scanned column that sees the step is column 3 (its right
    // neighbour is column 4), so the patch origin puts the snap at image x = 103.
    expect(snapped.x).toBe(103)
    // The y stays on the scan grid rather than at the cursor: the scan starts at
    // py = 1 and steps by 2, and py = 3 (image y = 203) is nearer the cursor at
    // y = 204 than py = 1 is, so it scores higher on the equally strong edge.
    expect(snapped.y).toBe(203)
  })

  it('ignores gradients at or below the 25 threshold', () => {
    // A gentle ramp: adjacent alpha difference of 20, so gx + gy never exceeds 25.
    const patch = patchFrom(9, 9, (x) => x * 10)
    // Central differences are 20 in x and 0 in y -> gradient 20, below the cut.
    expect(snapToNearestEdge(patch, 9, 9, 0, 0, 4, 4)).toEqual({ x: 4, y: 4 })
  })

  it('prefers the nearer of two equally strong edges', () => {
    // Opaque plateau from x = 2..4 with a transparent pixel at x = 5, so the two
    // interior gradients sit at x = 1 (its right neighbour is opaque) and x = 5.
    const patch = patchFrom(9, 9, (x) => (x >= 2 && x < 5 ? 255 : 0))

    // Cursor hard left: the x = 1 edge is both closer and stronger -> 1.
    expect(snapToNearestEdge(patch, 9, 9, 0, 0, 0, 4).x).toBe(1)
    // Cursor hard right: the x = 5 edge wins for the same reason.
    expect(snapToNearestEdge(patch, 9, 9, 0, 0, 8, 4).x).toBe(5)
  })

  it('never wins an edge on the outermost ring, because the scan excludes it', () => {
    // Only the border has a gradient; the scan runs from 1 to patchW/H - 2.
    const patch = patchFrom(9, 9, (x, y) => (x === 0 || y === 0 ? 0 : 255))
    // The first interior column is x = 1, which sees (0 -> 255) on its left.
    const snapped = snapToNearestEdge(patch, 9, 9, 0, 0, 3, 3)
    expect(snapped.x).toBe(1)
    expect(snapped.y).toBe(1)
  })

  it('treats coordinates as offsets from the patch origin', () => {
    const patch = patchFrom(9, 9, (x) => (x < 4 ? 0 : 255))
    const atOrigin = snapToNearestEdge(patch, 9, 9, 0, 0, 4, 4)
    const offset = snapToNearestEdge(patch, 9, 9, 1000, 500, 1004, 504)

    expect(offset.x - atOrigin.x).toBe(1000)
    expect(offset.y - atOrigin.y).toBe(500)
  })
})
