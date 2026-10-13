/**
 * PureCut Selection & Detection Helper Engine
 * In-browser computer vision & segmentation analysis utilities:
 * 1. Multi-Subject Connected Components & Contour Extraction
 * 2. Magic Wand (Color Distance Flood Fill)
 * 3. Cutout Marching Ants Boundary Tracing
 *
 * This file is the canvas side: downscaling, thumbnails and mapping results back
 * to full resolution. The pixel algorithms themselves live in core/detection.ts,
 * where they are unit-tested without a DOM.
 */

import { labelComponents, floodFillRegion, scanlineEdges } from './core/detection.js'

/**
 * Multi-Subject Island Detection
 * Runs 2D Connected Component Labeling on the mask
 * Returns a list of segmented subjects with bounding boxes, area, and preview thumbnails
 */
export function detectSubjects(maskCanvas, originalCanvas) {
  if (!maskCanvas || !originalCanvas) return []
  const w = maskCanvas.width
  const h = maskCanvas.height
  if (!w || !h) return []

  // Scale down for rapid labeling (~180px)
  const maxDim = 220
  const scale = Math.min(maxDim / w, maxDim / h, 1)
  const sw = Math.max(1, Math.floor(w * scale))
  const sh = Math.max(1, Math.floor(h * scale))

  const smallCanvas = document.createElement('canvas')
  smallCanvas.width = sw
  smallCanvas.height = sh
  const sCtx = smallCanvas.getContext('2d')
  sCtx.drawImage(maskCanvas, 0, 0, sw, sh)
  const maskData = sCtx.getImageData(0, 0, sw, sh).data

  // Drop tiny noise islands (< 0.3% of the downscaled frame, and never under 35 px)
  const totalPixels = sw * sh
  const minThreshold = Math.max(35, Math.floor(totalPixels * 0.003))
  const validComponents = labelComponents(maskData, sw, sh, 60, minThreshold)

  // Map to original resolution coordinates and create preview thumbnails
  const invScale = 1 / scale
  return validComponents.map((comp, i) => {
    const origX = Math.max(0, Math.floor(comp.minX * invScale))
    const origY = Math.max(0, Math.floor(comp.minY * invScale))
    const origW = Math.min(w - origX, Math.ceil((comp.maxX - comp.minX + 1) * invScale))
    const origH = Math.min(h - origY, Math.ceil((comp.maxY - comp.minY + 1) * invScale))

    // Create thumbnail
    const thumbCanvas = document.createElement('canvas')
    const tw = 48
    const th = 48
    thumbCanvas.width = tw
    thumbCanvas.height = th
    const tCtx = thumbCanvas.getContext('2d')

    // Draw masked original slice into thumb
    const sliceCanvas = document.createElement('canvas')
    sliceCanvas.width = origW
    sliceCanvas.height = origH
    const slCtx = sliceCanvas.getContext('2d')
    slCtx.drawImage(originalCanvas, origX, origY, origW, origH, 0, 0, origW, origH)
    slCtx.globalCompositeOperation = 'destination-in'
    slCtx.drawImage(maskCanvas, origX, origY, origW, origH, 0, 0, origW, origH)

    // Aspect fit to thumbnail
    const tRatio = Math.min(tw / origW, th / origH)
    const dw = origW * tRatio
    const dh = origH * tRatio
    const dx = (tw - dw) / 2
    const dy = (th - dh) / 2
    tCtx.drawImage(sliceCanvas, dx, dy, dw, dh)

    return {
      id: comp.id,
      index: i + 1,
      label: `Subject ${i + 1}`,
      x: origX,
      y: origY,
      width: origW,
      height: origH,
      pixelRatio: (comp.pixelCount / totalPixels).toFixed(3),
      thumbnail: thumbCanvas.toDataURL(),
      visible: true
    }
  })
}

/**
 * Magic Wand: Color Distance Flood Fill
 * Selects contiguous pixels starting from (startX, startY) within a given tolerance
 */
export function magicWandFloodFill(originalCanvas, startX, startY, tolerance = 25) {
  if (!originalCanvas) return null
  const w = originalCanvas.width
  const h = originalCanvas.height
  if (startX < 0 || startX >= w || startY < 0 || startY >= h) return null

  // Sample on scaled down canvas if image is massive for interactive responsiveness
  const maxDim = 800
  const scale = Math.min(maxDim / w, maxDim / h, 1)
  const sw = Math.max(1, Math.floor(w * scale))
  const sh = Math.max(1, Math.floor(h * scale))

  const smallCanvas = document.createElement('canvas')
  smallCanvas.width = sw
  smallCanvas.height = sh
  const sCtx = smallCanvas.getContext('2d')
  sCtx.drawImage(originalCanvas, 0, 0, sw, sh)
  const imgData = sCtx.getImageData(0, 0, sw, sh)
  const pixels = imgData.data

  const sx = Math.floor(startX * scale)
  const sy = Math.floor(startY * scale)
  const region = floodFillRegion(pixels, sw, sh, sx, sy, tolerance)
  if (!region) return null
  const { visited, minX, maxX, minY, maxY, count: selectedCount } = region

  if (selectedCount < 4) return null

  // Extract outline boundary points
  const invScale = 1 / scale
  const points = []

  // Trace bounding box perimeter samples or convex hull points
  const step = Math.max(1, Math.floor(sw / 120))
  for (let y = minY; y <= maxY; y += step) {
    let firstX = -1
    let lastX = -1
    for (let x = minX; x <= maxX; x += step) {
      if (visited[y * sw + x]) {
        if (firstX === -1) firstX = x
        lastX = x
      }
    }
    if (firstX !== -1) {
      points.push({ x: firstX * invScale, y: y * invScale })
      if (lastX !== firstX) {
        points.push({ x: lastX * invScale, y: y * invScale })
      }
    }
  }

  // Also include exact bounding rect info and full mask for high accuracy erasing
  return {
    type: 'wand',
    points,
    visitedMask: visited,
    sw,
    sh,
    scale,
    x: Math.floor(minX * invScale),
    y: Math.floor(minY * invScale),
    width: Math.ceil((maxX - minX + 1) * invScale),
    height: Math.ceil((maxY - minY + 1) * invScale)
  }
}

// Extract marching ants outline segments from a binary alpha mask
export function extractMaskContourSegments(maskCanvas) {
  const w = maskCanvas.width
  const h = maskCanvas.height

  // To keep UI responsive, we process a scaled down version
  const scale = Math.min(1, 400 / Math.max(w, h))
  const sw = Math.floor(w * scale)
  const sh = Math.floor(h * scale)
  if (!sw || !sh) return []

  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = sw
  tempCanvas.height = sh
  const tCtx = tempCanvas.getContext('2d')
  tCtx.drawImage(maskCanvas, 0, 0, sw, sh)

  return scanlineEdges(tCtx.getImageData(0, 0, sw, sh).data, sw, sh, 1 / scale, 128)
}
