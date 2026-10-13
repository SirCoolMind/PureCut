import { describe, it, expect } from 'vitest'
import { labelComponents, floodFillRegion, scanlineEdges } from '../../src/core/detection.js'

/**
 * Unit tests for the detection pixel algorithms. Masks are drawn as ASCII art:
 * '#' is an opaque pixel and '.' a transparent one, so each case reads as the
 * shape it tests.
 */

function maskFrom(rows: string[]) {
  const h = rows.length
  const w = rows[0].length
  const rgba = new Uint8ClampedArray(w * h * 4)
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) rgba[(y * w + x) * 4 + 3] = row[x] === '#' ? 255 : 0
  })
  return { rgba, w, h }
}

/** A w x h RGB image where `paint(x, y)` gives each pixel's colour. */
function imageFrom(w: number, h: number, paint: (x: number, y: number) => [number, number, number]) {
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      rgba.set([...paint(x, y), 255], (y * w + x) * 4)
    }
  }
  return rgba
}

describe('labelComponents', () => {
  it('separates islands and returns them largest first with tight boxes', () => {
    const { rgba, w, h } = maskFrom([
      '##.....',
      '##...##',
      '.....##',
      '.....##'
    ])
    const comps = labelComponents(rgba, w, h)
    expect(comps.map((c) => c.pixelCount)).toEqual([6, 4])
    expect(comps[0]).toMatchObject({ minX: 5, minY: 1, maxX: 6, maxY: 3 })
    expect(comps[1]).toMatchObject({ minX: 0, minY: 0, maxX: 1, maxY: 1 })
  })

  it('merges a U shape whose arms only meet at the bottom', () => {
    // The two arms get different provisional labels in pass 1; the bottom row
    // must union them into a single component.
    const { rgba, w, h } = maskFrom([
      '#...#',
      '#...#',
      '#####'
    ])
    const comps = labelComponents(rgba, w, h)
    expect(comps).toHaveLength(1)
    expect(comps[0].pixelCount).toBe(9)
  })

  it('treats diagonal neighbours as separate (4-connectivity)', () => {
    const { rgba, w, h } = maskFrom([
      '#.',
      '.#'
    ])
    expect(labelComponents(rgba, w, h)).toHaveLength(2)
  })

  it('drops islands below minPixels', () => {
    const { rgba, w, h } = maskFrom([
      '###..#',
      '###...'
    ])
    const comps = labelComponents(rgba, w, h, 60, 2)
    expect(comps).toHaveLength(1)
    expect(comps[0].pixelCount).toBe(6)
  })

  it('ignores pixels at or below the alpha threshold', () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 60, 0, 0, 0, 61])
    const comps = labelComponents(rgba, 2, 1, 60)
    expect(comps).toHaveLength(1)
    expect(comps[0]).toMatchObject({ minX: 1, maxX: 1, pixelCount: 1 })
  })

  it('returns nothing for an empty mask', () => {
    const { rgba, w, h } = maskFrom(['...', '...'])
    expect(labelComponents(rgba, w, h)).toEqual([])
  })
})

describe('floodFillRegion', () => {
  // Left half red, right half blue, with a slightly darker red column at x = 1.
  const w = 6
  const h = 4
  const rgba = imageFrom(w, h, (x) => (x < 3 ? (x === 1 ? [235, 0, 0] : [255, 0, 0]) : [0, 0, 255]))

  it('fills the contiguous region of similar colour and stops at an edge', () => {
    const region = floodFillRegion(rgba, w, h, 0, 0, 25)!
    expect(region).toMatchObject({ minX: 0, maxX: 2, minY: 0, maxY: 3, count: 12 })
    expect(region.visited[3]).toBe(0)
  })

  it('treats tolerance as a percentage of the RGB Manhattan range', () => {
    // A 20-level step is within tolerance 3 (3 * 7.65 = 22.95) but not tolerance 2.
    expect(floodFillRegion(rgba, w, h, 0, 0, 3)!.count).toBe(12)
    expect(floodFillRegion(rgba, w, h, 0, 0, 2)!.count).toBe(4)
  })

  it('returns null for a seed outside the image', () => {
    expect(floodFillRegion(rgba, w, h, -1, 0)).toBeNull()
    expect(floodFillRegion(rgba, w, h, 0, h)).toBeNull()
  })

  it('fills everything at tolerance 100', () => {
    expect(floodFillRegion(rgba, w, h, 5, 3, 100)!.count).toBe(w * h)
  })
})

describe('scanlineEdges', () => {
  it('reports the left and right edge of every run on interior rows only', () => {
    const { rgba, w, h } = maskFrom([
      '######',
      '.##.##',
      '......'
    ])
    // Row 0 and the last row are skipped; row 1 has two runs.
    expect(scanlineEdges(rgba, w, h)).toEqual([
      { x1: 1, x2: 1, y: 1 },
      { x1: 2, x2: 2, y: 1 },
      { x1: 4, x2: 4, y: 1 },
      { x1: 5, x2: 5, y: 1 }
    ])
  })

  it('scales coordinates back to full resolution', () => {
    const { rgba, w, h } = maskFrom([
      '...',
      '.#.',
      '...'
    ])
    expect(scanlineEdges(rgba, w, h, 4)).toEqual([
      { x1: 4, x2: 4, y: 4 },
      { x1: 4, x2: 4, y: 4 }
    ])
  })
})
