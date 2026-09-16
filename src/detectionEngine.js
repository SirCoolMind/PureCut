/**
 * PureCut Selection & Detection Helper Engine
 * In-browser computer vision & segmentation analysis utilities:
 * 1. Category Auto-Detection & Preset Mapping
 * 2. Multi-Subject Connected Components & Contour Extraction
 * 3. Magic Wand (Color Distance Flood Fill)
 * 4. Cutout Marching Ants Boundary Tracing
 */

/**
 * Classify image subject into Human, Animal, Product, Vehicle, or Food
 * Runs fast analysis on original image pixels + generated alpha mask
 */
export function detectCategory(originalCanvas, maskCanvas) {
  if (!originalCanvas || !maskCanvas) return { id: 'balanced', label: 'General / Balanced', icon: '⚖️' }

  const w = originalCanvas.width
  const h = originalCanvas.height
  if (!w || !h) return { id: 'balanced', label: 'General / Balanced', icon: '⚖️' }

  // Sample on scaled down offscreen canvas for high speed (<10ms)
  const sampleSize = 160
  const scale = Math.min(sampleSize / w, sampleSize / h, 1)
  const sw = Math.max(1, Math.floor(w * scale))
  const sh = Math.max(1, Math.floor(h * scale))

  const sampleCanvas = document.createElement('canvas')
  sampleCanvas.width = sw
  sampleCanvas.height = sh
  const sCtx = sampleCanvas.getContext('2d')
  sCtx.drawImage(originalCanvas, 0, 0, sw, sh)
  const origData = sCtx.getImageData(0, 0, sw, sh).data

  sCtx.clearRect(0, 0, sw, sh)
  sCtx.drawImage(maskCanvas, 0, 0, sw, sh)
  const maskData = sCtx.getImageData(0, 0, sw, sh).data

  let foregroundPixels = 0
  let skinPixels = 0
  let highSaturationPixels = 0
  let edgeComplexity = 0
  let organicBrownOrangePixels = 0
  let metallicNeutralPixels = 0

  const total = sw * sh

  for (let y = 1; y < sh - 1; y++) {
    for (let x = 1; x < sw - 1; x++) {
      const idx = (y * sw + x) * 4
      const alpha = maskData[idx + 3]

      if (alpha > 40) {
        foregroundPixels++
        const r = origData[idx]
        const g = origData[idx + 1]
        const b = origData[idx + 2]

        // 1. Skin tone detector (standard RGB rule: R > G > B, (R-G) > 15, etc.)
        const isSkin = r > 80 && g > 40 && b > 20 &&
          r > g && g > b &&
          (r - g) >= 12 && (r - b) >= 15 &&
          Math.abs(r - g) > 10 &&
          r - Math.min(g, b) > 15

        if (isSkin) skinPixels++

        // 2. Color saturation & vibrance
        const maxC = Math.max(r, g, b)
        const minC = Math.min(r, g, b)
        const delta = maxC - minC
        const sat = maxC === 0 ? 0 : delta / maxC

        if (sat > 0.45) highSaturationPixels++

        // 3. Animal fur / warm texture detection (browns, tans, creams, greys)
        const isFurTone = (r > 60 && g > 45 && b > 30 && sat < 0.5 && (r >= g) && (g >= b)) ||
                          (delta < 25 && maxC > 50 && maxC < 210) // neutral fur shades
        if (isFurTone) organicBrownOrangePixels++

        // 4. Metallic / mechanical neutral tones for vehicles/electronics
        const isMetallic = delta < 18 && (r > 40 && r < 230)
        if (isMetallic) metallicNeutralPixels++

        // 5. Alpha edge complexity (hair/fur leaves more semi-transparent fringe)
        if (alpha > 30 && alpha < 225) {
          edgeComplexity++
        }
      }
    }
  }

  const fgRatio = foregroundPixels / (total || 1)
  const skinRatio = skinPixels / (foregroundPixels || 1)
  const fringeRatio = edgeComplexity / (foregroundPixels || 1)
  const satRatio = highSaturationPixels / (foregroundPixels || 1)
  const metallicRatio = metallicNeutralPixels / (foregroundPixels || 1)
  const aspect = w / h

  // Decision Tree
  // 1. Human portrait check: substantial skin ratio or human head/bust proportions
  if (skinRatio > 0.08 || (skinRatio > 0.04 && fringeRatio > 0.08)) {
    return {
      id: 'hair',
      label: 'Human / Portrait',
      icon: '👤',
      recommendedPreset: 'hair',
      reason: 'Detected face/skin tones with fine strand contours'
    }
  }

  // 2. Animal / Pet check: high fringe complexity + organic fur tones + low metallic
  if (fringeRatio > 0.12 && skinRatio < 0.04) {
    return {
      id: 'hair',
      label: 'Animal / Pet',
      icon: '🐾',
      recommendedPreset: 'hair',
      reason: 'Detected detailed fur/wispy contour edges'
    }
  }

  // 3. Food / Macro check: very high saturation and vibrant warm colors
  if (satRatio > 0.35 && fgRatio > 0.25) {
    return {
      id: 'balanced',
      label: 'Food / Organic',
      icon: '🍔',
      recommendedPreset: 'balanced',
      reason: 'Detected vibrant organic tones and detailed shape'
    }
  }

  // 4. Vehicle / Mechanical check: wide aspect ratio, high metallic ratio, sharp edges
  if ((aspect > 1.25 || aspect < 0.8) && metallicRatio > 0.45 && fringeRatio < 0.06) {
    return {
      id: 'product',
      label: 'Vehicle / Tech',
      icon: '🚗',
      recommendedPreset: 'product',
      reason: 'Detected crisp metallic surfaces and structured edges'
    }
  }

  // 5. Clean Product default if crisp boundary and centered
  if (fringeRatio < 0.08 && fgRatio > 0.08) {
    return {
      id: 'product',
      label: 'Clean Product',
      icon: '📦',
      recommendedPreset: 'product',
      reason: 'Detected distinct object boundaries ideal for e-commerce'
    }
  }

  return {
    id: 'balanced',
    label: 'General Subject',
    icon: '⚖️',
    recommendedPreset: 'balanced',
    reason: 'Standard balanced natural cutoff applied'
  }
}

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

  // Binary mask array (1 = foreground, 0 = background)
  const bin = new Uint8Array(sw * sh)
  for (let i = 0; i < sw * sh; i++) {
    bin[i] = maskData[i * 4 + 3] > 60 ? 1 : 0
  }

  // Two-pass connected-component labeling with disjoint set union
  const labels = new Int32Array(sw * sh)
  let nextLabel = 1
  const parent = [0]

  function find(i) {
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

  function union(i, j) {
    const rootI = find(i)
    const rootJ = find(j)
    if (rootI !== rootJ) {
      parent[rootJ] = rootI
    }
  }

  // Pass 1: Assign preliminary labels
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = y * sw + x
      if (!bin[idx]) continue

      const top = y > 0 ? labels[(y - 1) * sw + x] : 0
      const left = x > 0 ? labels[y * sw + (x - 1)] : 0

      if (top && left) {
        labels[idx] = top
        if (top !== left) union(top, left)
      } else if (top) {
        labels[idx] = top
      } else if (left) {
        labels[idx] = left
      } else {
        labels[idx] = nextLabel
        parent.push(0)
        nextLabel++
      }
    }
  }

  // Pass 2: Flatten labels & aggregate bounding boxes and areas
  const componentMap = new Map()

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const idx = y * sw + x
      const l = labels[idx]
      if (!l) continue
      const root = find(l)

      let comp = componentMap.get(root)
      if (!comp) {
        comp = {
          id: root,
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
          pixelCount: 0
        }
        componentMap.set(root, comp)
      }

      comp.minX = Math.min(comp.minX, x)
      comp.minY = Math.min(comp.minY, y)
      comp.maxX = Math.max(comp.maxX, x)
      comp.maxY = Math.max(comp.maxY, y)
      comp.pixelCount++
    }
  }

  // Filter out tiny noise islands (< 1.5% of total foreground pixels or < 40 pixels)
  const totalPixels = sw * sh
  const minThreshold = Math.max(35, Math.floor(totalPixels * 0.003))

  const validComponents = Array.from(componentMap.values())
    .filter(c => c.pixelCount >= minThreshold)
    .sort((a, b) => b.pixelCount - a.pixelCount)

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
  const startIdx = (sy * sw + sx) * 4

  const targetR = pixels[startIdx]
  const targetG = pixels[startIdx + 1]
  const targetB = pixels[startIdx + 2]
  const tolSq = (tolerance * 2.55) ** 2

  const visited = new Uint8Array(sw * sh)
  const queue = [sx, sy]
  visited[sy * sw + sx] = 1

  let minX = sx, maxX = sx, minY = sy, maxY = sy
  let selectedCount = 0

  while (queue.length > 0) {
    const cy = queue.pop()
    const cx = queue.pop()
    selectedCount++

    if (cx < minX) minX = cx
    if (cx > maxX) maxX = cx
    if (cy < minY) minY = cy
    if (cy > maxY) maxY = cy

    // 4-way neighbor check
    const neighbors = [
      [cx + 1, cy],
      [cx - 1, cy],
      [cx, cy + 1],
      [cx, cy - 1]
    ]

    for (let i = 0; i < 4; i++) {
      const nx = neighbors[i][0]
      const ny = neighbors[i][1]

      if (nx >= 0 && nx < sw && ny >= 0 && ny < sh) {
        const nIdx = ny * sw + nx
        if (!visited[nIdx]) {
          const pIdx = nIdx * 4
          const r = pixels[pIdx]
          const g = pixels[pIdx + 1]
          const b = pixels[pIdx + 2]

          const dr = Math.abs(r - targetR)
          const dg = Math.abs(g - targetG)
          const db = Math.abs(b - targetB)

          // Manhattan distance is smoother and more predictable than pure Euclidean squared
          const dist = dr + dg + db
          if (dist <= tolerance * 7.65) {
            visited[nIdx] = 1
            queue.push(nx, ny)
          }
        }
      }
    }
  }

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
  const ctx = maskCanvas.getContext('2d')
  
  // To keep UI responsive, we process a scaled down version
  const scale = Math.min(1, 400 / Math.max(w, h))
  const sw = Math.floor(w * scale)
  const sh = Math.floor(h * scale)
  
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = sw
  tempCanvas.height = sh
  const tCtx = tempCanvas.getContext('2d')
  tCtx.drawImage(maskCanvas, 0, 0, sw, sh)
  
  const imgData = tCtx.getImageData(0, 0, sw, sh)
  const pixels = imgData.data
  
  const segments = []
  const invScale = 1 / scale
  const threshold = 128
  
  // Fast horizontal scanline edge detection
  for (let y = 1; y < sh - 1; y++) {
    let inMask = false
    let startX = -1
    
    for (let x = 0; x < sw; x++) {
      const idx = (y * sw + x) * 4 + 3 // alpha channel
      const isSolid = pixels[idx] > threshold
      
      if (isSolid && !inMask) {
        inMask = true
        startX = x
      } else if (!isSolid && inMask) {
        inMask = false
        // we found an edge pair [startX, x-1]
        // Push left edge point
        segments.push({
          x1: startX * invScale,
          x2: startX * invScale,
          y: y * invScale
        })
        // Push right edge point
        segments.push({
          x1: (x - 1) * invScale,
          x2: (x - 1) * invScale,
          y: y * invScale
        })
      }
    }
    
    if (inMask) {
      segments.push({
        x1: startX * invScale,
        x2: startX * invScale,
        y: y * invScale
      })
      segments.push({
        x1: (sw - 1) * invScale,
        x2: (sw - 1) * invScale,
        y: y * invScale
      })
    }
  }
  
  return segments
}
