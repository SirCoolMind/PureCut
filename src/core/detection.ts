/**
 * Pixel algorithms behind subject detection, the magic wand and the cutout
 * outline. Every function works on a raw RGBA buffer plus its width and height:
 * no canvas, no DOM, so vitest can drive them with hand-built pixels.
 *
 * `detectionEngine.js` owns the canvas side (downscaling, thumbnails, mapping
 * back to full resolution) and calls into these.
 */

type Pixels = ArrayLike<number>

export interface Component {
  /** Union-find root label; stable within one call. */
  id: number
  minX: number
  minY: number
  maxX: number
  maxY: number
  pixelCount: number
}

/**
 * Two-pass 4-connected component labelling of the pixels whose alpha exceeds
 * `alphaThreshold`. Islands smaller than `minPixels` are dropped as noise; the
 * rest come back largest first.
 */
export function labelComponents(rgba: Pixels, w: number, h: number, alphaThreshold = 60, minPixels = 0): Component[] {
  const labels = new Int32Array(w * h)
  const parent: number[] = [0]
  let nextLabel = 1

  function find(i: number) {
    let root = i
    while (parent[root] > 0) root = parent[root]
    let curr = i
    while (curr !== root) {
      const nxt = parent[curr]
      parent[curr] = root
      curr = nxt
    }
    return root
  }

  // Pass 1: preliminary labels, recording equivalences between touching runs
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (rgba[idx * 4 + 3] <= alphaThreshold) continue

      const top = y > 0 ? labels[idx - w] : 0
      const left = x > 0 ? labels[idx - 1] : 0

      if (top && left) {
        labels[idx] = top
        if (top !== left) {
          const rootTop = find(top)
          const rootLeft = find(left)
          if (rootTop !== rootLeft) parent[rootLeft] = rootTop
        }
      } else if (top || left) {
        labels[idx] = top || left
      } else {
        labels[idx] = nextLabel++
        parent.push(0)
      }
    }
  }

  // Pass 2: resolve each label to its root and aggregate boxes and areas
  const components = new Map<number, Component>()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = labels[y * w + x]
      if (!l) continue
      const root = find(l)
      let comp = components.get(root)
      if (!comp) {
        comp = { id: root, minX: x, minY: y, maxX: x, maxY: y, pixelCount: 0 }
        components.set(root, comp)
      }
      if (x < comp.minX) comp.minX = x
      if (x > comp.maxX) comp.maxX = x
      if (y < comp.minY) comp.minY = y
      if (y > comp.maxY) comp.maxY = y
      comp.pixelCount++
    }
  }

  return Array.from(components.values())
    .filter((c) => c.pixelCount >= minPixels)
    .sort((a, b) => b.pixelCount - a.pixelCount)
}

export interface FloodRegion {
  /** 1 for every pixel in the region, row-major `w * h`. */
  visited: Uint8Array
  minX: number
  minY: number
  maxX: number
  maxY: number
  count: number
}

/**
 * 4-connected flood fill from (`sx`, `sy`) over pixels whose RGB Manhattan
 * distance to the seed colour is within `tolerance` percent (0-100 maps to
 * 0-765). Returns null for a seed outside the buffer.
 */
export function floodFillRegion(rgba: Pixels, w: number, h: number, sx: number, sy: number, tolerance = 25): FloodRegion | null {
  if (sx < 0 || sx >= w || sy < 0 || sy >= h) return null

  const seed = (sy * w + sx) * 4
  const targetR = rgba[seed]
  const targetG = rgba[seed + 1]
  const targetB = rgba[seed + 2]
  const maxDist = tolerance * 7.65

  const visited = new Uint8Array(w * h)
  const stack = [sx, sy]
  visited[sy * w + sx] = 1
  let minX = sx, maxX = sx, minY = sy, maxY = sy
  let count = 0

  const tryVisit = (nx: number, ny: number) => {
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) return
    const nIdx = ny * w + nx
    if (visited[nIdx]) return
    const p = nIdx * 4
    const dist = Math.abs(rgba[p] - targetR) + Math.abs(rgba[p + 1] - targetG) + Math.abs(rgba[p + 2] - targetB)
    if (dist <= maxDist) {
      visited[nIdx] = 1
      stack.push(nx, ny)
    }
  }

  while (stack.length > 0) {
    const cy = stack.pop()!
    const cx = stack.pop()!
    count++
    if (cx < minX) minX = cx
    if (cx > maxX) maxX = cx
    if (cy < minY) minY = cy
    if (cy > maxY) maxY = cy
    tryVisit(cx + 1, cy)
    tryVisit(cx - 1, cy)
    tryVisit(cx, cy + 1)
    tryVisit(cx, cy - 1)
  }

  return { visited, minX, minY, maxX, maxY, count }
}

export interface EdgePoint {
  x1: number
  x2: number
  y: number
}

/**
 * Left and right edge of every solid run (alpha > `threshold`) on each interior
 * row, scaled by `invScale` back to full-resolution coordinates. The first and
 * last rows are skipped, as the marching-ants overlay always has.
 */
export function scanlineEdges(rgba: Pixels, w: number, h: number, invScale = 1, threshold = 128): EdgePoint[] {
  const edges: EdgePoint[] = []
  const push = (x: number, y: number) => edges.push({ x1: x * invScale, x2: x * invScale, y: y * invScale })

  for (let y = 1; y < h - 1; y++) {
    let startX = -1
    for (let x = 0; x < w; x++) {
      const solid = rgba[(y * w + x) * 4 + 3] > threshold
      if (solid && startX === -1) {
        startX = x
      } else if (!solid && startX !== -1) {
        push(startX, y)
        push(x - 1, y)
        startX = -1
      }
    }
    if (startX !== -1) {
      push(startX, y)
      push(w - 1, y)
    }
  }
  return edges
}
