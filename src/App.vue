<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { runRMBG, runISNet, preloadRMBG, resetLoadedModels } from './aiEngine.js'
import { preload as imglyPreload } from '@imgly/background-removal'
import {
  UploadCloud,
  Sparkles,
  Download,
  Copy,
  Check,
  RotateCcw,
  ShieldCheck,
  Zap,
  SlidersHorizontal,
  Image as ImageIcon,
  Cpu,
  HardDrive,
  Layers,
  Wrench,
  RefreshCw,
  Eraser,
  Paintbrush,
  Undo2,
  SplitSquareVertical,
  Maximize2,
  Trash2,
  ZoomIn,
  ZoomOut,
  Move,
  Monitor
} from 'lucide-vue-next'
import { appVersion, modelOptions } from './constants.js'
import InfoModal from './components/InfoModal.vue'

// --- State ---
const originalUrl = ref(null)
const originalImageEl = ref(null)
const resultUrl = ref(null)
const resultBlob = ref(null)

// Mask canvases for non-destructive editing & brush
let maskCanvas = null
let maskCtx = null
let originalCanvas = null
let originalCtx = null
const undoHistory = ref([])

const fileName = ref('')
const fileSize = ref('')
const imageDimensions = reactive({ width: 0, height: 0 })

// Processing & Telemetry
const isProcessing = ref(false)
const isPreloading = ref(false)
const statusMessage = ref('')
const downloadProgress = reactive({ loadedMB: 0, totalMB: 0, percent: 0, isDownloading: false })
const telemetry = reactive({
  durationMs: 0,
  durationSec: '0.0',
  ramAllocatedMB: 0,
  ramTotalMB: 0,
  throughputMps: '0.0',
  threads: typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4,
  deviceUsed: 'WebGPU (Hardware Accelerated)'
})

const selectedModel = ref('briaai/RMBG-1.4')
const selectedDevice = ref('gpu') // 'gpu' | 'cpu'
const cachedModels = reactive({
  'briaai/RMBG-1.4': false,
  'isnet_quint8': false,
  'isnet_fp16': false,
  'isnet': false
})

// UI Modes & Tools
const userMode = ref('standard') // 'standard' | 'power'
const activeTool = ref('slider') // 'slider' | 'brush' | 'pan'
const brushMode = ref('erase') // 'erase' | 'restore'
const brushSize = ref(35)
const isDrawing = ref(false)
const brushCanvasRef = ref(null)
const displayCanvasRef = ref(null) // Live GPU-composited preview canvas
let rAFPending = false // requestAnimationFrame batching flag

// Zoom & Pan System
const zoomLevel = ref(1) // 1 = 100%
const panOffset = reactive({ x: 0, y: 0 })
const isPanning = ref(false)
let panStartPoint = { x: 0, y: 0 }
let initialPan = { x: 0, y: 0 }

function zoomIn() {
  zoomLevel.value = Math.min(4, +(zoomLevel.value + 0.25).toFixed(2))
}

function zoomOut() {
  zoomLevel.value = Math.max(0.5, +(zoomLevel.value - 0.25).toFixed(2))
  if (zoomLevel.value <= 1 && panOffset.x === 0 && panOffset.y === 0) {
    resetZoom()
  }
}

function resetZoom() {
  zoomLevel.value = 1
  panOffset.x = 0
  panOffset.y = 0
}

function onWheelZoom(e) {
  if (!resultUrl.value) return
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.15 : 0.15
  const newZoom = Math.min(4, Math.max(0.5, +(zoomLevel.value + delta).toFixed(2)))
  zoomLevel.value = newZoom
  if (newZoom === 1) {
    panOffset.x = 0
    panOffset.y = 0
  }
}

function onPanStart(e) {
  if (activeTool.value !== 'pan') return
  isPanning.value = true
  e.currentTarget.setPointerCapture(e.pointerId)
  panStartPoint = { x: e.clientX, y: e.clientY }
  initialPan = { x: panOffset.x, y: panOffset.y }
}

function onPanMove(e) {
  if (!isPanning.value) return
  const dx = e.clientX - panStartPoint.x
  const dy = e.clientY - panStartPoint.y
  panOffset.x = initialPan.x + dx
  panOffset.y = initialPan.y + dy
}

function onPanEnd() {
  isPanning.value = false
}

// Browser Page Zoom Detection & Reset State
const browserZoomLevel = ref(100)
const isBrowserZoomed = computed(() => browserZoomLevel.value !== 100)

function updateBrowserZoom() {
  if (typeof window === 'undefined') return
  let ratio = 1
  if (window.visualViewport && window.visualViewport.scale && window.visualViewport.scale !== 1) {
    ratio = window.visualViewport.scale
  } else if (window.outerWidth && window.innerWidth) {
    // Zoom in browser scales window.innerWidth relative to outerWidth
    const calculated = window.outerWidth / window.innerWidth
    if (Math.abs(calculated - 1) > 0.05) {
      ratio = calculated
    }
  }
  browserZoomLevel.value = Math.round(ratio * 100)
}

function resetBrowserZoom() {
  // If pinch/visual viewport zoomed, reset scroll and notify
  if (window.visualViewport) {
    window.scrollTo(0, 0)
  }
  // For standard browser zoom, prompt shortcut
  const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
  const shortcut = isMac ? 'Cmd + 0' : 'Ctrl + 0'
  alert(`To reset your browser zoom to 100%, press ${shortcut} on your keyboard.`)
}

const sliderPosition = ref(50)
const previewBg = ref('checkerboard') // 'checkerboard', 'white', 'black', 'gradient'
const copied = ref(false)
const fileInput = ref(null)
const currentFileBlob = ref(null)

// Tuning Parameters
const tuning = reactive({
  preset: 'balanced',
  threshold: 0.5,
  feather: 1,
  trim: 0,
  deFringe: true
})

// Modal State
const showInfoModal = ref(false)

const cacheUsageBytes = ref(0)
const isClearingCache = ref(false)

async function checkModelCacheStatus() {
  modelOptions.forEach(m => {
    const isCached = localStorage.getItem(`purecut_cached_${m.id}`) === 'true'
    cachedModels[m.id] = isCached
  })

  // Measure actual browser storage usage if supported
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate()
      cacheUsageBytes.value = estimate.usage || 0
    } catch (e) {
      console.warn('Storage estimate failed:', e)
    }
  }
}

const formattedCacheUsage = computed(() => {
  if (!cacheUsageBytes.value) {
    const anyCached = Object.values(cachedModels).some(v => v)
    return anyCached ? '~45 MB' : '0 MB'
  }
  return formatBytes(cacheUsageBytes.value)
})

async function clearAllCache() {
  if (isClearingCache.value) return
  const confirmClear = window.confirm('Are you sure you want to clear all downloaded AI models and cached storage? You can re-download them anytime.')
  if (!confirmClear) return

  isClearingCache.value = true
  try {
    // 1. Reset in-memory instances
    resetLoadedModels()

    // 2. Clear Cache Storage API
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cacheNames = await caches.keys()
      await Promise.all(cacheNames.map(name => caches.delete(name)))
    }

    // 3. Clear IndexedDB databases used by Transformers.js / ONNX
    if (typeof window !== 'undefined' && window.indexedDB && window.indexedDB.databases) {
      try {
        const dbs = await window.indexedDB.databases()
        for (const db of dbs) {
          if (db.name) {
            window.indexedDB.deleteDatabase(db.name)
          }
        }
      } catch (err) {
        console.warn('Could not enumerate IndexedDB databases:', err)
      }
    }

    // 4. Clear model cache flags in localStorage
    modelOptions.forEach(m => {
      localStorage.removeItem(`purecut_cached_${m.id}`)
      cachedModels[m.id] = false
    })

    // 5. Update cache size
    cacheUsageBytes.value = 0
    await checkModelCacheStatus()

    statusMessage.value = 'Model cache cleared successfully.'
    setTimeout(() => {
      if (statusMessage.value === 'Model cache cleared successfully.') statusMessage.value = ''
    }, 2500)
  } catch (err) {
    console.error('Failed to clear cache:', err)
    alert('An error occurred while clearing cache: ' + (err.message || err))
  } finally {
    isClearingCache.value = false
  }
}

const currentModelCached = computed(() => !!cachedModels[selectedModel.value])
const currentModelMeta = computed(() => modelOptions.find(m => m.id === selectedModel.value) || modelOptions[0])

// Preload handler
async function handlePreload() {
  if (isPreloading.value || isProcessing.value) return
  isPreloading.value = true
  downloadProgress.isDownloading = true
  downloadProgress.percent = 0
  statusMessage.value = `Downloading ${currentModelMeta.value.name.split(' ')[0]} weights (${currentModelMeta.value.size})...`

  try {
    if (currentModelMeta.value.engine === 'rmbg') {
      await preloadRMBG((progress) => {
        if (progress && (progress.progress !== undefined || progress.pct !== undefined)) {
          const raw = progress.pct !== undefined ? progress.pct : progress.progress
          const pct = Math.min(100, Math.max(0, Math.round(raw > 1 ? raw : raw * 100)))
          downloadProgress.percent = pct
          statusMessage.value = `Downloading RMBG-1.4 weights: ${pct}%...`
        }
      })
    } else {
      await imglyPreload({
        model: selectedModel.value,
        device: selectedDevice.value
      })
    }
    cachedModels[selectedModel.value] = true
    localStorage.setItem(`purecut_cached_${selectedModel.value}`, 'true')
    statusMessage.value = 'AI Model cached & ready!'
    setTimeout(() => { downloadProgress.isDownloading = false }, 1500)
  } catch (err) {
    console.error('Preload failed:', err)
    alert('Failed to pre-download model. Please check your internet connection.')
  } finally {
    isPreloading.value = false
  }
}

// Preset Handlers
function applyPreset(presetName) {
  tuning.preset = presetName
  if (presetName === 'balanced') {
    tuning.threshold = 0.5; tuning.feather = 1; tuning.trim = 0; tuning.deFringe = true
  } else if (presetName === 'hair') {
    tuning.threshold = 0.4; tuning.feather = 2; tuning.trim = -1; tuning.deFringe = false
  } else if (presetName === 'product') {
    tuning.threshold = 0.6; tuning.feather = 0; tuning.trim = 1; tuning.deFringe = true
  } else if (presetName === 'aggressive') {
    tuning.threshold = 0.75; tuning.feather = 0; tuning.trim = 2; tuning.deFringe = true
  }
  recompositeCanvas()
}

function formatBytes(bytes, decimals = 1) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i]
}

// Main AI Processing Function
async function processImage(file) {
  if (!file || !file.type.startsWith('image/')) return
  currentFileBlob.value = file

  fileName.value = file.name || 'photo.png'
  fileSize.value = formatBytes(file.size)
  originalUrl.value = URL.createObjectURL(file)
  resultUrl.value = null
  resultBlob.value = null
  undoHistory.value = []
  isProcessing.value = true
  downloadProgress.percent = 0
  downloadProgress.isDownloading = !currentModelCached.value
  statusMessage.value = currentModelCached.value
    ? 'Analyzing image with AI...'
    : `Downloading ${currentModelMeta.value.name.split(' ')[0]} model (${currentModelMeta.value.size})...`

  const startHeap = (typeof window !== 'undefined' && window.performance && window.performance.memory)
    ? window.performance.memory.usedJSHeapSize
    : 0
  const startTime = performance.now()

  // Load original image into memory
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise((resolve) => {
    img.onload = () => {
      imageDimensions.width = img.naturalWidth
      imageDimensions.height = img.naturalHeight
      originalImageEl.value = img
      resolve(true)
    }
    img.src = originalUrl.value
  })

  // Initialize offscreen original canvas
  originalCanvas = document.createElement('canvas')
  originalCanvas.width = imageDimensions.width
  originalCanvas.height = imageDimensions.height
  originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true })
  originalCtx.drawImage(img, 0, 0)

  try {
    let rawMaskBlob = null

    if (currentModelMeta.value.engine === 'rmbg') {
      // Run State-of-the-Art BRIA RMBG-1.4
      const result = await runRMBG(file, selectedDevice.value, (p) => {
        if (p.message) statusMessage.value = p.message
        if (p && (p.progress !== undefined || p.pct !== undefined)) {
          const raw = p.pct !== undefined ? p.pct : p.progress
          downloadProgress.percent = Math.min(100, Math.max(0, Math.round(raw > 1 ? raw : raw * 100)))
        }
      })
      rawMaskBlob = result.maskBlob
    } else {
      // Run ISNet (legacy)
      const result = await runISNet(file, selectedModel.value, selectedDevice.value, (p) => {
        if (p.message) statusMessage.value = p.message
        if (p.pct !== undefined || p.progress !== undefined) {
          const raw = p.pct !== undefined ? p.pct : p.progress
          const pct = Math.min(100, Math.max(0, Math.round(raw > 1 ? raw : raw * 100)))
          downloadProgress.isDownloading = true
          downloadProgress.percent = pct
          if (p.loadedMB) downloadProgress.loadedMB = p.loadedMB
          if (p.totalMB) downloadProgress.totalMB = p.totalMB
        }
      })
      rawMaskBlob = result.maskBlob
    }

    cachedModels[selectedModel.value] = true
    localStorage.setItem(`purecut_cached_${selectedModel.value}`, 'true')

    // Initialize mask canvas
    const maskImg = new Image()
    maskImg.crossOrigin = 'anonymous'
    const maskUrl = URL.createObjectURL(rawMaskBlob)
    await new Promise((resolve) => {
      maskImg.onload = () => resolve(true)
      maskImg.src = maskUrl
    })

    maskCanvas = document.createElement('canvas')
    maskCanvas.width = imageDimensions.width
    maskCanvas.height = imageDimensions.height
    maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true })
    maskCtx.drawImage(maskImg, 0, 0)
    saveUndoState()

    // Telemetry stats
    const endTime = performance.now()
    const elapsed = endTime - startTime
    telemetry.durationMs = Math.round(elapsed)
    telemetry.durationSec = (elapsed / 1000).toFixed(2)

    const endHeap = (typeof window !== 'undefined' && window.performance && window.performance.memory)
      ? window.performance.memory.usedJSHeapSize
      : 0
    if (endHeap > 0 && startHeap > 0) {
      telemetry.ramAllocatedMB = Math.max(25, Math.round((endHeap - startHeap) / (1024 * 1024)))
      telemetry.ramTotalMB = Math.round(endHeap / (1024 * 1024))
    } else {
      const estimated = Math.round(35 + (imageDimensions.width * imageDimensions.height * 4 * 2) / (1024 * 1024))
      telemetry.ramAllocatedMB = estimated
      telemetry.ramTotalMB = estimated + 110
    }

    const megapixels = (imageDimensions.width * imageDimensions.height) / 1000000
    telemetry.throughputMps = (megapixels / (elapsed / 1000)).toFixed(2)
    telemetry.deviceUsed = selectedDevice.value === 'gpu' ? 'WebGPU (Hardware GPU)' : 'WASM SIMD Multi-threaded'

    recompositeCanvas()
  } catch (error) {
    console.error('Processing error:', error)
    alert('Failed to process image. Try selecting another model or device.')
  } finally {
    isProcessing.value = false
    downloadProgress.isDownloading = false
  }
}

// Re-run AI model
function reRunModel() {
  if (currentFileBlob.value) {
    processImage(currentFileBlob.value)
  }
}

// Fast GPU-composited preview — no pixel loop, no PNG encode, runs in <1ms
function renderFastPreview() {
  if (!originalCanvas || !maskCanvas) return
  const canvas = displayCanvasRef.value
  if (!canvas) return
  const width = imageDimensions.width
  const height = imageDimensions.height
  if (!width || !height) return

  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  // Step 1: Draw original photo
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(originalCanvas, 0, 0)

  // Step 2: Apply feathered mask using GPU composite ops (no pixel loop!)
  if (tuning.feather > 0) {
    const tempMask = document.createElement('canvas')
    tempMask.width = width
    tempMask.height = height
    const tmpCtx = tempMask.getContext('2d')
    tmpCtx.filter = `blur(${tuning.feather}px)`
    tmpCtx.drawImage(maskCanvas, 0, 0)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(tempMask, 0, 0)
  } else {
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(maskCanvas, 0, 0)
  }
  ctx.globalCompositeOperation = 'source-over'
}

// Schedule a fast preview on the next animation frame (batched to screen refresh)
function schedulePreview() {
  if (rAFPending) return
  rAFPending = true
  requestAnimationFrame(() => {
    rAFPending = false
    renderFastPreview()
  })
}

// Timer for debouncing heavy PNG blob encoding
let recompositeDebounceTimer = null

// Canvas Compositing Engine: Full-quality compositing with threshold, trim, de-fringe + PNG export
function recompositeCanvas(immediateBlob = false) {
  if (!originalCtx || !maskCtx) return
  const width = imageDimensions.width
  const height = imageDimensions.height
  if (!width || !height) return

  // 1. Immediately update fast GPU preview (<1ms) so the UI responds instantly
  renderFastPreview()

  // 2. Debounce heavy full-resolution pixel loop and PNG toBlob encoding
  if (recompositeDebounceTimer) {
    clearTimeout(recompositeDebounceTimer)
    recompositeDebounceTimer = null
  }

  const runHeavyExport = () => {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    // Draw original image
    ctx.drawImage(originalCanvas, 0, 0)
    const imgData = ctx.getImageData(0, 0, width, height)
    const imgPixels = imgData.data

    // Apply feather (blur) if requested
    const tempMaskCanvas = document.createElement('canvas')
    tempMaskCanvas.width = width
    tempMaskCanvas.height = height
    const tempMaskCtx = tempMaskCanvas.getContext('2d', { willReadFrequently: true })
    if (tuning.feather > 0) {
      tempMaskCtx.filter = `blur(${tuning.feather}px)`
    }
    tempMaskCtx.drawImage(maskCanvas, 0, 0)
    const maskData = tempMaskCtx.getImageData(0, 0, width, height)
    const maskPixels = maskData.data

    const totalPixels = width * height
    const thresholdVal = tuning.threshold * 255
    const trimShift = tuning.trim * 15

    for (let i = 0; i < totalPixels; i++) {
      const idx = i * 4
      let rawAlpha = maskPixels[idx + 3]

      if (trimShift !== 0) {
        rawAlpha = Math.max(0, Math.min(255, rawAlpha - trimShift))
      }

      let finalAlpha = 0
      if (rawAlpha >= thresholdVal) {
        const range = 255 - thresholdVal
        finalAlpha = range > 0 ? Math.min(255, Math.round(((rawAlpha - thresholdVal) / range) * 255)) : 255
      } else {
        finalAlpha = 0
      }

      imgPixels[idx + 3] = finalAlpha

      // De-fringe color halo
      if (tuning.deFringe && finalAlpha > 0 && finalAlpha < 220) {
        const r = imgPixels[idx]
        const g = imgPixels[idx + 1]
        const b = imgPixels[idx + 2]
        const avg = (r + g + b) / 3
        imgPixels[idx] = Math.round(r * 0.85 + avg * 0.15)
        imgPixels[idx + 1] = Math.round(g * 0.85 + avg * 0.15)
        imgPixels[idx + 2] = Math.round(b * 0.85 + avg * 0.15)
      }
    }

    ctx.putImageData(imgData, 0, 0)

    canvas.toBlob((blob) => {
      if (blob) {
        resultBlob.value = blob
        if (resultUrl.value) URL.revokeObjectURL(resultUrl.value)
        resultUrl.value = URL.createObjectURL(blob)
      }
    }, 'image/png')
  }

  if (immediateBlob) {
    runHeavyExport()
  } else {
    recompositeDebounceTimer = setTimeout(runHeavyExport, 120)
  }
}

// --- INTERACTIVE MAGIC BRUSH ENGINE ---
function saveUndoState() {
  if (!maskCtx) return
  if (undoHistory.value.length > 15) undoHistory.value.shift()
  const snapshot = maskCtx.getImageData(0, 0, imageDimensions.width, imageDimensions.height)
  undoHistory.value.push(snapshot)
}

function handleUndo() {
  if (undoHistory.value.length <= 1 || !maskCtx) return
  undoHistory.value.pop() // remove current state
  const previousState = undoHistory.value[undoHistory.value.length - 1]
  maskCtx.putImageData(previousState, 0, 0)
  recompositeCanvas(true)
}

function resetBrush() {
  if (undoHistory.value.length > 0 && maskCtx) {
    const originalState = undoHistory.value[0]
    maskCtx.putImageData(originalState, 0, 0)
    undoHistory.value = [originalState]
    recompositeCanvas(true)
  }
}

// Coordinate mapping: accurately maps pointer events from the transformed container to exact canvas pixels
function getCanvasCoords(e) {
  // Use the enclosing viewport for the true unscaled container boundary
  const viewport = e.currentTarget.closest('.comparison-viewport')
  const viewportRect = viewport ? viewport.getBoundingClientRect() : e.currentTarget.getBoundingClientRect()
  
  const containerW = viewportRect.width
  const containerH = viewportRect.height
  const imgRatio = imageDimensions.width / imageDimensions.height
  const contRatio = containerW / containerH

  let renderW = containerW, renderH = containerH
  let offsetX = 0, offsetY = 0

  if (imgRatio > contRatio) {
    // Image is wider — pillarboxed vertically
    renderH = containerW / imgRatio
    offsetY = (containerH - renderH) / 2
  } else {
    // Image is taller — letterboxed horizontally
    renderW = containerH * imgRatio
    offsetX = (containerW - renderW) / 2
  }

  // Pointer position relative to viewport center
  const centerRelX = (e.clientX - viewportRect.left) - containerW / 2
  const centerRelY = (e.clientY - viewportRect.top) - containerH / 2

  // Invert CSS transforms (panOffset and zoomLevel centered at 50% 50%)
  const unzoomedCenterX = (centerRelX - panOffset.x) / zoomLevel.value
  const unzoomedCenterY = (centerRelY - panOffset.y) / zoomLevel.value

  const unzoomedX = unzoomedCenterX + containerW / 2
  const unzoomedY = unzoomedCenterY + containerH / 2

  // Map from unzoomed image layout box to original image pixel coordinates
  const pixelX = (unzoomedX - offsetX) * (imageDimensions.width / renderW)
  const pixelY = (unzoomedY - offsetY) * (imageDimensions.height / renderH)

  return {
    x: Math.max(0, Math.min(imageDimensions.width, pixelX)),
    y: Math.max(0, Math.min(imageDimensions.height, pixelY))
  }
}

let lastPoint = null

function onPointerDown(e) {
  if (activeTool.value !== 'brush' || !maskCtx) return
  e.currentTarget.setPointerCapture(e.pointerId)
  isDrawing.value = true
  lastPoint = getCanvasCoords(e)

  // Begin a new continuous path on the mask
  maskCtx.lineCap = 'round'
  maskCtx.lineJoin = 'round'
  maskCtx.lineWidth = brushSize.value * 2
  if (brushMode.value === 'erase') {
    maskCtx.globalCompositeOperation = 'destination-out'
    maskCtx.strokeStyle = 'rgba(0, 0, 0, 1)'
  } else {
    maskCtx.globalCompositeOperation = 'source-over'
    maskCtx.strokeStyle = 'rgba(255, 255, 255, 1)'
  }
  maskCtx.beginPath()
  maskCtx.moveTo(lastPoint.x, lastPoint.y)

  // Draw a dot for single-click
  maskCtx.fillStyle = maskCtx.strokeStyle
  maskCtx.save()
  maskCtx.globalCompositeOperation = maskCtx.globalCompositeOperation
  maskCtx.beginPath()
  maskCtx.arc(lastPoint.x, lastPoint.y, brushSize.value, 0, Math.PI * 2)
  maskCtx.fill()
  maskCtx.restore()

  // Restart path for subsequent lineTo
  maskCtx.beginPath()
  maskCtx.moveTo(lastPoint.x, lastPoint.y)

  schedulePreview()
}

function onPointerMove(e) {
  if (!isDrawing.value || !maskCtx) return
  const currentPoint = getCanvasCoords(e)

  // Native vector path stroke — GPU-accelerated, single draw call
  maskCtx.lineTo(currentPoint.x, currentPoint.y)
  maskCtx.stroke()

  // Keep path going for smooth continuous stroke
  maskCtx.beginPath()
  maskCtx.moveTo(currentPoint.x, currentPoint.y)
  lastPoint = currentPoint

  // Schedule rAF-batched preview (coalesceses multiple move events per frame)
  schedulePreview()
}

function onPointerUp() {
  if (isDrawing.value) {
    isDrawing.value = false
    lastPoint = null
    saveUndoState()
    // Full quality PNG export only once, on stroke completion
    recompositeCanvas()
  }
}

// Event Handlers
function onFileSelect(e) {
  const file = e.target.files?.[0]
  if (file) processImage(file)
}

function onDrop(e) {
  const file = e.dataTransfer.files?.[0]
  if (file) processImage(file)
}

function onPaste(e) {
  const items = e.clipboardData?.items
  if (!items) return
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        processImage(file)
        break
      }
    }
  }
}

async function copyToClipboard() {
  if (!resultBlob.value) return
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': resultBlob.value })
    ])
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch (err) {
    console.error('Clipboard copy failed:', err)
  }
}

function reset() {
  originalUrl.value = null
  originalImageEl.value = null
  resultUrl.value = null
  resultBlob.value = null
  currentFileBlob.value = null
  maskCanvas = null
  maskCtx = null
  originalCanvas = null
  originalCtx = null
  rAFPending = false
  resetZoom()
  fileName.value = ''
  fileSize.value = ''
  sliderPosition.value = 50
  statusMessage.value = ''
  undoHistory.value = []
}

// When switching to brush mode, initialize display canvas with current result
watch(activeTool, (newTool) => {
  if (newTool === 'brush' && originalCanvas && maskCanvas) {
    nextTick(() => {
      renderFastPreview()
    })
  }
})

onMounted(() => {
  checkModelCacheStatus()
  window.addEventListener('paste', onPaste)
  updateBrowserZoom()
  window.addEventListener('resize', updateBrowserZoom)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateBrowserZoom)
  }
})

onUnmounted(() => {
  window.removeEventListener('paste', onPaste)
  window.removeEventListener('resize', updateBrowserZoom)
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', updateBrowserZoom)
  }
})
</script>

<template>
  <div class="app-shell" :class="{ 'in-workspace': !!originalUrl }">
    <!-- Navbar (Fixed 48px height) -->
    <header class="navbar">
      <div class="brand">
        <div class="brand-icon">
          <Sparkles :size="18" />
        </div>
        <div class="brand-title">
          <span class="brand-name">Pure<span>Cut</span></span>
          <button class="version-badge" @click="showInfoModal = true" title="Version, Changelog & Roadmap">
            v{{ appVersion }}
          </button>
        </div>
      </div>

      <!-- Center: Model Status & Preload Pill -->
      <div class="model-status-bar">
        <div class="model-indicator" :class="{ 'is-cached': currentModelCached }">
          <span class="status-dot"></span>
          <span class="model-label">
            {{ currentModelMeta.name.split(' ')[0] }} ({{ currentModelMeta.size }}):
            <strong>{{ currentModelCached ? 'Cached & Ready' : 'Not Downloaded' }}</strong>
          </span>
        </div>

        <button
          v-if="!currentModelCached"
          class="btn-preload"
          :disabled="isPreloading || isProcessing"
          @click="handlePreload"
        >
          <RefreshCw :size="11" :class="{ spin: isPreloading }" />
          {{ isPreloading ? 'Preloading...' : 'Preload' }}
        </button>

        <!-- Cache storage size indicator & clear cache trigger -->
        <div class="cache-status-pill" :title="`Total AI model storage used: ${formattedCacheUsage}`">
          <HardDrive :size="11" />
          <span>{{ formattedCacheUsage }}</span>
          <button
            class="btn-clear-cache"
            :disabled="isClearingCache || isProcessing"
            @click="clearAllCache"
            title="Clear downloaded AI models & storage cache"
          >
            <Trash2 :size="11" :class="{ spin: isClearingCache }" />
            {{ isClearingCache ? 'Clearing...' : 'Clear' }}
          </button>
        </div>
      </div>

      <!-- Right: Browser Zoom Reset & Mode Switcher -->
      <div class="navbar-right-actions">
        <button
          v-if="isBrowserZoomed"
          class="btn-browser-zoom"
          @click="resetBrowserZoom"
          :title="`Browser zoom is ${browserZoomLevel}%. Click to reset.`"
        >
          <Monitor :size="12" />
          <span>Page {{ browserZoomLevel }}%</span>
          <RotateCcw :size="11" />
        </button>

        <div class="mode-toggle-group">
          <button
            :class="['mode-btn', { active: userMode === 'standard' }]"
            @click="userMode = 'standard'"
          >
            Standard
          </button>
          <button
            :class="['mode-btn', { active: userMode === 'power' }]"
            @click="userMode = 'power'"
          >
            <Wrench :size="12" /> Power User
          </button>
        </div>
      </div>
    </header>

    <!-- Main Content Area (Zero Window Scroll) -->
    <main class="main-content">
      <!-- VIEW 1: Upload Dropzone -->
      <section v-if="!originalUrl" class="hero-section">
        <div class="hero-badge">
          <ShieldCheck :size="13" />
          <span>BRIA RMBG-1.4 Neural Engine · 100% On-Device</span>
        </div>

        <h1 class="hero-title">
          Cutout anything.<br />
          <span class="gradient-text">Zero data sent to servers.</span>
        </h1>
        <p class="hero-subtitle">
          Next-gen background removal powered by BRIA RMBG-1.4. Handles tough hair, camouflaged clothing, and metallic reflections.
        </p>

        <!-- Dropzone Card -->
        <div
          class="dropzone-card"
          @dragover.prevent
          @drop.prevent="onDrop"
          @click="fileInput.click()"
        >
          <input
            ref="fileInput"
            type="file"
            accept="image/png, image/jpeg, image/webp"
            class="sr-only"
            @change="onFileSelect"
          />

          <div class="drop-icon-wrapper">
            <UploadCloud :size="36" />
          </div>

          <div class="drop-text">
            <h3>Drop your photo here, or browse</h3>
            <p>JPG, PNG, WebP up to 35 MB</p>
          </div>

          <button type="button" class="btn-cta">
            <UploadCloud :size="16" /> Choose Image
          </button>

          <div class="paste-hint">
            or press <kbd>Ctrl</kbd> + <kbd>V</kbd> anywhere to paste from clipboard
          </div>
        </div>
      </section>

      <!-- VIEW 2: Processing Overlay (Clean, Non-overlapping UI) -->
      <section v-else-if="isProcessing" class="processing-section">
        <div class="processing-card">
          <div class="spinner-ring"></div>
          <h2 class="processing-title">{{ statusMessage }}</h2>

          <!-- Download Progress Indicator -->
          <div v-if="downloadProgress.isDownloading" class="progress-box">
            <div class="progress-labels">
              <span>Model Weight Download</span>
              <span>{{ downloadProgress.percent }}%</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" :style="{ width: `${downloadProgress.percent}%` }"></div>
            </div>
          </div>

          <!-- Real-Time Hardware Telemetry Grid (Redesigned & Distinct) -->
          <div class="telemetry-live-grid">
            <div class="telemetry-live-tile">
              <div class="tile-header">
                <span class="tile-badge cpu-badge"><Cpu :size="12" /> CPU</span>
                <span class="tile-category">Compute Cores</span>
              </div>
              <div class="tile-main-value">
                {{ telemetry.threads }} <span class="val-unit">Logical Threads</span>
              </div>
            </div>

            <div class="telemetry-live-tile">
              <div class="tile-header">
                <span class="tile-badge ram-badge"><HardDrive :size="12" /> RAM</span>
                <span class="tile-category">Heap Allocation</span>
              </div>
              <div class="tile-main-value">
                ~180 <span class="val-unit">MB Estimated</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- VIEW 3: Studio Workspace (2-Column Zero-Scroll Layout) -->
      <section v-else class="studio-workspace">
        <!-- LEFT COLUMN: Canvas Stage -->
        <div class="stage-column">
          <!-- Top Info & Tool Selector Bar -->
          <div class="stage-header">
            <div class="meta-tags">
              <span class="tag file-tag"><ImageIcon :size="13" /> {{ fileName }}</span>
              <span class="tag">{{ imageDimensions.width }} × {{ imageDimensions.height }}px</span>
              <span class="tag">{{ fileSize }}</span>
            </div>

            <!-- Tool Switcher: Compare Slider vs Magic Brush vs Pan -->
            <div class="tool-switch-bar">
              <button
                :class="['tool-btn', { active: activeTool === 'slider' }]"
                @click="activeTool = 'slider'"
                title="Split Comparison Slider"
              >
                <SplitSquareVertical :size="14" /> Compare
              </button>
              <button
                :class="['tool-btn', { active: activeTool === 'brush' }]"
                @click="activeTool = 'brush'"
                title="Erase or Restore Brush"
              >
                <Paintbrush :size="14" /> Magic Brush
              </button>
              <button
                :class="['tool-btn', { active: activeTool === 'pan' }]"
                @click="activeTool = 'pan'"
                title="Drag to Pan canvas"
              >
                <Move :size="14" /> Pan
              </button>
            </div>

            <!-- Backdrop Switcher -->
            <div class="backdrop-controls">
              <button
                :class="['bg-btn', { active: previewBg === 'checkerboard' }]"
                @click="previewBg = 'checkerboard'"
                title="Transparent Grid"
              >
                Grid
              </button>
              <button
                :class="['bg-btn', { active: previewBg === 'white' }]"
                @click="previewBg = 'white'"
                title="White"
              >
                White
              </button>
              <button
                :class="['bg-btn', { active: previewBg === 'black' }]"
                @click="previewBg = 'black'"
                title="Dark"
              >
                Dark
              </button>
              <button
                :class="['bg-btn', { active: previewBg === 'gradient' }]"
                @click="previewBg = 'gradient'"
                title="Gradient"
              >
                Color
              </button>
            </div>
          </div>

          <!-- Dynamic Viewport with Wheel Zoom & Pan Support -->
          <div
            :class="['comparison-viewport', `bg-${previewBg}`, { 'is-brush-active': activeTool === 'brush', 'is-panning': isPanning, 'tool-pan': activeTool === 'pan' }]"
            @wheel="onWheelZoom"
          >
            <!-- Zoom & Pan Floating Controls -->
            <div class="zoom-floating-toolbar">
              <button
                v-if="zoomLevel !== 1 || panOffset.x !== 0 || panOffset.y !== 0"
                class="zoom-btn reset-btn"
                @click="resetZoom"
                title="Reset Zoom & Pan"
              >
                <RotateCcw :size="12" /> Reset
              </button>
              <button class="zoom-btn" @click="zoomIn" title="Zoom In (+25%)">
                <ZoomIn :size="13" />
              </button>
              <button
                class="zoom-level-badge"
                @click="resetZoom"
                :title="zoomLevel !== 1 || panOffset.x !== 0 || panOffset.y !== 0 ? 'Click to Reset Zoom & Position' : '100% Zoom'"
              >
                {{ Math.round(zoomLevel * 100) }}%
              </button>
              <button class="zoom-btn" @click="zoomOut" title="Zoom Out (-25%)">
                <ZoomOut :size="13" />
              </button>
            </div>

            <!-- Scalable & Pannable Stage Surface Container -->
            <div
              class="viewport-transform-layer"
              :style="{
                transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})`,
                transformOrigin: 'center center'
              }"
            >
              <!-- Cutout Result Image (Bottom Layer) — hidden during brush mode, canvas takes over -->
              <img
                v-if="resultUrl && activeTool !== 'brush'"
                :src="resultUrl"
                alt="Cutout Result"
                class="viewport-img result-img"
                draggable="false"
              />

              <!-- Live GPU-composited display canvas (used during brush mode for real-time preview) -->
              <canvas
                v-if="activeTool === 'brush' && resultUrl"
                ref="displayCanvasRef"
                class="viewport-img result-img display-canvas"
              ></canvas>

              <!-- MODE 1: Split Comparison Viewport -->
              <template v-if="activeTool === 'slider'">
                <!-- Original Layer (Clipped Top) -->
                <div
                  class="clipped-layer"
                  :style="{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }"
                >
                  <img
                    :src="originalUrl"
                    alt="Original Image"
                    class="viewport-img original-img"
                    draggable="false"
                  />
                </div>

                <!-- Badges -->
                <div class="badge-tag before-badge" :style="{ opacity: sliderPosition > 15 ? 1 : 0 }">
                  Original
                </div>
                <div class="badge-tag after-badge" :style="{ opacity: sliderPosition < 85 ? 1 : 0 }">
                  Cutout
                </div>

                <!-- Divider Slider Handle -->
                <div class="slider-divider" :style="{ left: `${sliderPosition}%` }">
                  <div class="slider-thumb">
                    <span>◀ ▶</span>
                  </div>
                </div>

                <!-- Range Overlay for drag interaction -->
                <input
                  type="range"
                  min="0"
                  max="100"
                  v-model="sliderPosition"
                  class="range-overlay"
                  aria-label="Before/After Split Slider"
                />
              </template>

              <!-- MODE 2: Magic Brush Interactive Painting Layer -->
              <template v-else-if="activeTool === 'brush'">
                <div
                  class="brush-interaction-surface"
                  @pointerdown="onPointerDown"
                  @pointermove="onPointerMove"
                  @pointerup="onPointerUp"
                  @pointerleave="onPointerUp"
                >
                  <div class="brush-cursor-guide"></div>
                </div>
              </template>
            </div>

            <!-- Pan Drag Overlay when activeTool === 'pan' -->
            <div
              v-if="activeTool === 'pan'"
              class="pan-interaction-surface"
              @pointerdown="onPanStart"
              @pointermove="onPanMove"
              @pointerup="onPanEnd"
              @pointerleave="onPanEnd"
            ></div>
          </div>

          <!-- Stage Footer: Hint & Actions -->
          <div class="stage-footer">
            <!-- Left Info -->
            <div class="footer-info">
              <span v-if="activeTool === 'slider'" class="slider-hint">
                ↔ Drag slider to compare cutout with original
              </span>
              <div v-else class="brush-toolbar">
                <div class="brush-mode-pills">
                  <button
                    :class="['b-pill', { active: brushMode === 'erase' }]"
                    @click="brushMode = 'erase'"
                  >
                    <Eraser :size="12" /> Erase Extra Background
                  </button>
                  <button
                    :class="['b-pill', { active: brushMode === 'restore' }]"
                    @click="brushMode = 'restore'"
                  >
                    <Paintbrush :size="12" /> Restore Subject
                  </button>
                </div>

                <div class="size-control">
                  <span>Size: <strong>{{ brushSize }}px</strong></span>
                  <input type="range" min="8" max="100" v-model.number="brushSize" class="mini-range" />
                </div>

                <button class="btn-mini" @click="handleUndo" :disabled="undoHistory.length <= 1" title="Undo stroke">
                  <Undo2 :size="13" /> Undo
                </button>
                <button class="btn-mini" @click="resetBrush" title="Reset to raw AI mask">
                  Reset
                </button>
              </div>
            </div>

            <!-- Right Action Buttons -->
            <div class="action-buttons">
              <button class="btn-secondary" @click="reset" title="Upload another photo">
                <RotateCcw :size="14" /> New Photo
              </button>

              <button class="btn-secondary" @click="copyToClipboard" :disabled="!resultBlob">
                <component :is="copied ? Check : Copy" :size="14" />
                {{ copied ? 'Copied!' : 'Copy Cutout' }}
              </button>

              <a
                v-if="resultUrl"
                :href="resultUrl"
                :download="`purecut_${fileName.replace(/\.[^/.]+$/, '')}.png`"
                class="btn-cta"
              >
                <Download :size="15" /> Download High-Res PNG
              </a>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: Tuning Sidebar -->
        <aside class="sidebar-column">
          <!-- Tuning Header -->
          <div class="sidebar-header">
            <div class="sidebar-title">
              <SlidersHorizontal v-if="userMode === 'standard'" :size="14" />
              <Wrench v-else :size="14" />
              <span>{{ userMode === 'standard' ? 'Quick Presets' : 'Power User Studio' }}</span>
            </div>
            <span class="sidebar-sub">{{ userMode === 'standard' ? '1-Click Adjust' : 'Live Canvas Controls' }}</span>
          </div>

          <!-- Standard Mode Presets -->
          <div v-if="userMode === 'standard'" class="presets-container">
            <button
              :class="['preset-card', { active: tuning.preset === 'balanced' }]"
              @click="applyPreset('balanced')"
            >
              <div class="preset-name">⚖️ Balanced (Default)</div>
              <div class="preset-desc">Smooth edges, natural all-around cutoff.</div>
            </button>
            <button
              :class="['preset-card', { active: tuning.preset === 'hair' }]"
              @click="applyPreset('hair')"
            >
              <div class="preset-name">💇 Fine Hair & Fur</div>
              <div class="preset-desc">Preserves wisps, soft fur, and delicate strands.</div>
            </button>
            <button
              :class="['preset-card', { active: tuning.preset === 'product' }]"
              @click="applyPreset('product')"
            >
              <div class="preset-name">📦 Clean Product</div>
              <div class="preset-desc">Crisp boundary with inward trim to eliminate halos.</div>
            </button>
            <button
              :class="['preset-card', { active: tuning.preset === 'aggressive' }]"
              @click="applyPreset('aggressive')"
            >
              <div class="preset-name">✂️ Deep / Cluttered BG</div>
              <div class="preset-desc">Aggressive cutoff for busy, difficult backgrounds.</div>
            </button>
          </div>

          <!-- Power User Sliders & Settings -->
          <div v-else class="power-container">
            <!-- Slider 1: Alpha Cutoff -->
            <div class="tune-group">
              <div class="tune-label">
                <span>Alpha Sensitivity (Cutoff):</span>
                <strong>{{ Math.round(tuning.threshold * 100) }}%</strong>
              </div>
              <input
                type="range"
                min="0.10"
                max="0.90"
                step="0.05"
                v-model.number="tuning.threshold"
                @input="recompositeCanvas"
                class="tune-slider"
              />
            </div>

            <!-- Slider 2: Edge Softness / Feather -->
            <div class="tune-group">
              <div class="tune-label">
                <span>Edge Softness (Feather):</span>
                <strong>{{ tuning.feather }}px</strong>
              </div>
              <input
                type="range"
                min="0"
                max="6"
                step="1"
                v-model.number="tuning.feather"
                @input="recompositeCanvas"
                class="tune-slider"
              />
            </div>

            <!-- Slider 3: Edge Shift / Trim -->
            <div class="tune-group">
              <div class="tune-label">
                <span>Edge Shift (Trim / Expand):</span>
                <strong>{{ tuning.trim > 0 ? `+${tuning.trim}px` : `${tuning.trim}px` }}</strong>
              </div>
              <input
                type="range"
                min="-3"
                max="3"
                step="1"
                v-model.number="tuning.trim"
                @input="recompositeCanvas"
                class="tune-slider"
              />
            </div>

            <!-- Toggle: De-fringing -->
            <div class="tune-group row-group">
              <span>De-fringe Color Spill:</span>
              <button
                :class="['toggle-pill', { active: tuning.deFringe }]"
                @click="tuning.deFringe = !tuning.deFringe; recompositeCanvas()"
              >
                {{ tuning.deFringe ? 'Active' : 'Off' }}
              </button>
            </div>

            <!-- AI Engine & Model Selector -->
            <div class="engine-box">
              <div class="engine-row">
                <label><Layers :size="12" /> Model:</label>
                <select v-model="selectedModel" class="sidebar-select" @change="reRunModel">
                  <option v-for="m in modelOptions" :key="m.id" :value="m.id">
                    {{ m.name }}
                  </option>
                </select>
              </div>
              <div class="engine-row">
                <label><Cpu :size="12" /> Engine:</label>
                <select v-model="selectedDevice" class="sidebar-select" @change="reRunModel">
                  <option value="gpu">WebGPU (Hardware GPU)</option>
                  <option value="cpu">CPU (WASM Multi-thread)</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Telemetry & Hardware Utilization Card -->
          <div class="telemetry-card">
            <div class="telemetry-header">
              <span>⚡ System Telemetry</span>
              <span class="live-dot"></span>
            </div>
            <div class="telemetry-grid">
              <div class="tele-item">
                <span class="tele-k">Duration</span>
                <span class="tele-v">{{ telemetry.durationSec }}s</span>
              </div>
              <div class="tele-item">
                <span class="tele-k">RAM Heap</span>
                <span class="tele-v">~{{ telemetry.ramAllocatedMB }} MB</span>
              </div>
              <div class="tele-item">
                <span class="tele-k">Throughput</span>
                <span class="tele-v">{{ telemetry.throughputMps }} MP/s</span>
              </div>
              <div class="tele-item">
                <span class="tele-k">Threads</span>
                <span class="tele-v">{{ telemetry.threads }} Cores</span>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </main>

    <!-- Version / Changelog / Roadmap / Storage Modal -->
    <InfoModal
      :show="showInfoModal"
      :formatted-cache-usage="formattedCacheUsage"
      :cached-models="cachedModels"
      :is-clearing-cache="isClearingCache"
      :is-processing="isProcessing"
      @close="showInfoModal = false"
      @clear-cache="clearAllCache"
    />
  </div>
</template>

<style>
/* Global resets */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  overflow: hidden; /* Zero page scroll */
  background-color: #080c14;
  color: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
</style>

<style scoped>
/* Full App Shell */
.app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: radial-gradient(circle at 50% -20%, #1e1b4b 0%, #080c14 60%, #04070d 100%);
  color: #f1f5f9;
  overflow: hidden;
}

/* Navbar (Compact 48px) */
.navbar {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px);
  background: rgba(8, 12, 20, 0.85);
  flex-shrink: 0;
  z-index: 50;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-icon {
  width: 28px;
  height: 28px;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
}

.brand-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  line-height: 1;
}

.brand-name {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.5px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
}

.brand-name span {
  color: #818cf8;
}

/* Model Status Bar */
.model-status-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 255, 255, 0.04);
  padding: 4px 12px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.model-indicator {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: #94a3b8;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
}

.model-indicator.is-cached .status-dot {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
}

.model-indicator.is-cached {
  color: #34d399;
}

.btn-preload {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.4);
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-preload:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.35);
}

.cache-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 9999px;
  font-size: 10.5px;
  color: #94a3b8;
  margin-left: 2px;
}

.btn-clear-cache {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 1px 6px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-clear-cache:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.3);
  color: #fee2e2;
  border-color: rgba(239, 68, 68, 0.5);
}

.btn-clear-cache:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.navbar-right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-browser-zoom {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.35);
  padding: 3px 9px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-browser-zoom:hover {
  background: rgba(245, 158, 11, 0.25);
  color: #fde68a;
  border-color: rgba(245, 158, 11, 0.5);
}

/* Mode Switcher */
.mode-toggle-group {
  display: flex;
  background: rgba(255, 255, 255, 0.06);
  padding: 2px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn.active {
  background: #6366f1;
  color: white;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
}

/* Main Content Area */
.main-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 10px 16px;
  overflow: hidden;
}

/* HERO / DROPZONE VIEW */
.hero-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  max-width: 660px;
  margin: 0 auto;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(99, 102, 241, 0.12);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.25);
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 500;
  margin-bottom: 12px;
}

.hero-title {
  font-size: 38px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -1px;
  margin-bottom: 8px;
}

.gradient-text {
  background: linear-gradient(135deg, #818cf8 0%, #c084fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subtitle {
  font-size: 14.5px;
  color: #94a3b8;
  margin-bottom: 22px;
  line-height: 1.4;
}

.dropzone-card {
  width: 100%;
  background: rgba(30, 41, 59, 0.4);
  border: 2px dashed rgba(148, 163, 184, 0.25);
  border-radius: 20px;
  padding: 38px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: all 0.25s ease;
  backdrop-filter: blur(8px);
}

.dropzone-card:hover {
  border-color: #818cf8;
  background: rgba(30, 41, 59, 0.65);
  transform: translateY(-2px);
}

.drop-icon-wrapper {
  width: 56px;
  height: 56px;
  background: rgba(99, 102, 241, 0.12);
  color: #818cf8;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  border: 1px solid rgba(99, 102, 241, 0.25);
}

.drop-text h3 {
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 4px;
}

.drop-text p {
  font-size: 12.5px;
  color: #64748b;
  margin-bottom: 16px;
}

.paste-hint {
  margin-top: 12px;
  font-size: 11.5px;
  color: #64748b;
}

kbd {
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 4px;
  padding: 2px 5px;
  font-size: 10px;
  color: #cbd5e1;
}

.model-notice-pill {
  margin-top: 14px;
  font-size: 11px;
  padding: 5px 12px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
}

.cached-text { color: #34d399; }
.uncached-text { color: #fbbf24; }
.sr-only { display: none; }

/* PROCESSING OVERLAY (REDESIGNED TILES) */
.processing-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.processing-card {
  width: 100%;
  max-width: 520px;
  background: rgba(30, 41, 59, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 34px 28px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  backdrop-filter: blur(14px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
}

.spinner-ring {
  width: 44px;
  height: 44px;
  border: 3px solid rgba(99, 102, 241, 0.2);
  border-top-color: #818cf8;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
  margin-bottom: 16px;
}

.processing-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 18px;
}

.progress-box {
  width: 100%;
  margin-bottom: 20px;
}

.progress-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 5px;
}

.progress-track {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #a855f7);
  transition: width 0.3s ease;
}

/* Clear, distinct metric tiles (Never overlap) */
.telemetry-live-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
}

.telemetry-live-tile {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 12px;
  padding: 12px 14px;
  text-align: left;
  display: flex;
  flex-direction: column;
}

.tile-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.tile-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  border-radius: 4px;
}

.cpu-badge {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
}

.ram-badge {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.tile-category {
  font-size: 10.5px;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 500;
}

.tile-main-value {
  font-size: 15px;
  font-weight: 700;
  color: #f1f5f9;
}

.val-unit {
  font-size: 11px;
  font-weight: 400;
  color: #94a3b8;
  margin-left: 2px;
}

/* 2-COLUMN ZERO-SCROLL STUDIO WORKSPACE */
.studio-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  height: 100%;
  overflow: hidden;
}

/* Stage Column (Left) */
.stage-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
}

.stage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.meta-tags {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tag {
  background: rgba(255, 255, 255, 0.05);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 5px;
  color: #94a3b8;
}

.file-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #f1f5f9;
  font-weight: 600;
}

/* Tool switch buttons */
.tool-switch-bar {
  display: flex;
  background: rgba(255, 255, 255, 0.06);
  padding: 2px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn.active {
  background: #6366f1;
  color: white;
}

.backdrop-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.bg-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}

.bg-btn.active {
  background: #6366f1;
  color: white;
  border-color: #6366f1;
}

/* Viewport */
.comparison-viewport {
  flex: 1;
  min-height: 0;
  width: 100%;
  height: 100%;
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}

.bg-checkerboard {
  background-color: #1e293b;
  background-image: linear-gradient(45deg, #0f172a 25%, transparent 25%),
                    linear-gradient(-45deg, #0f172a 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #0f172a 75%),
                    linear-gradient(-45deg, transparent 75%, #0f172a 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

.bg-white { background-color: #ffffff; }
.bg-black { background-color: #05070d; }
.bg-gradient { background: linear-gradient(135deg, #4f46e5 0%, #ec4899 100%); }

.viewport-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.display-canvas {
  image-rendering: auto;
  touch-action: none;
}

/* Transform container for zoom and pan */
.viewport-transform-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transition: transform 0.06s cubic-bezier(0.2, 0, 0, 1);
  will-change: transform;
}

.comparison-viewport.is-panning .viewport-transform-layer,
.comparison-viewport.is-brush-active .viewport-transform-layer {
  transition: none;
}

/* Floating Zoom Toolbar */
.zoom-floating-toolbar {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(15, 23, 42, 0.82);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  padding: 3px 5px;
  z-index: 30;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.zoom-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #cbd5e1;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s;
}

.zoom-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.zoom-btn.reset-btn {
  width: auto;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 10.5px;
  font-weight: 600;
  gap: 4px;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.35);
  margin-right: 2px;
}

.zoom-btn.reset-btn:hover {
  background: rgba(99, 102, 241, 0.35);
  color: #c7d2fe;
}

.zoom-level-badge {
  background: transparent;
  border: none;
  font-size: 11px;
  font-weight: 700;
  color: #f1f5f9;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
  letter-spacing: 0.2px;
  transition: all 0.15s;
}

.zoom-level-badge:hover {
  color: #818cf8;
  background: rgba(99, 102, 241, 0.15);
}

/* Pan Interaction Layer */
.pan-interaction-surface {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: grab;
  z-index: 26;
  touch-action: none;
}

.comparison-viewport.is-panning .pan-interaction-surface,
.pan-interaction-surface:active {
  cursor: grabbing;
}

.clipped-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.badge-tag {
  position: absolute;
  top: 10px;
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 5px;
  pointer-events: none;
  backdrop-filter: blur(8px);
  z-index: 5;
}

.before-badge {
  left: 10px;
  background: rgba(0, 0, 0, 0.65);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.after-badge {
  right: 10px;
  background: rgba(99, 102, 241, 0.8);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.slider-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #ffffff;
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  z-index: 10;
}

.slider-thumb {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 32px;
  height: 32px;
  background: #ffffff;
  color: #1e1b4b;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 800;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
}

.range-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: ew-resize;
  margin: 0;
  z-index: 20;
}

/* Magic Brush Surface */
.brush-interaction-surface {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  z-index: 25;
}

/* Stage Footer Bar */
.stage-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  padding-top: 2px;
}

.slider-hint {
  font-size: 11.5px;
  color: #64748b;
}

.brush-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brush-mode-pills {
  display: flex;
  gap: 4px;
}

.b-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.b-pill.active {
  background: #6366f1;
  color: white;
  border-color: #6366f1;
}

.size-control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #94a3b8;
}

.size-control strong {
  color: #818cf8;
}

.mini-range {
  width: 70px;
  height: 4px;
  accent-color: #6366f1;
  cursor: pointer;
}

.btn-mini {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}

.btn-mini:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.btn-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  border: none;
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  box-shadow: 0 3px 12px rgba(99, 102, 241, 0.35);
  transition: all 0.2s ease;
}

.btn-cta:hover {
  opacity: 0.95;
  transform: translateY(-1px);
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.07);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* Sidebar Column (Right) */
.sidebar-column {
  width: 310px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  background: rgba(30, 41, 59, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px;
  backdrop-filter: blur(12px);
  overflow-y: auto;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.sidebar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: #e2e8f0;
}

.sidebar-sub {
  font-size: 10.5px;
  color: #64748b;
}

/* Presets */
.presets-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.preset-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-card:hover {
  background: rgba(255, 255, 255, 0.08);
}

.preset-card.active {
  background: rgba(99, 102, 241, 0.2);
  border-color: #6366f1;
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.25);
}

.preset-name {
  font-size: 12px;
  font-weight: 600;
  color: #f1f5f9;
  margin-bottom: 2px;
}

.preset-desc {
  font-size: 10.5px;
  color: #94a3b8;
  line-height: 1.3;
}

/* Power Sliders */
.power-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.tune-group {
  background: rgba(0, 0, 0, 0.2);
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tune-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #94a3b8;
}

.tune-label strong {
  color: #818cf8;
}

.tune-slider {
  accent-color: #6366f1;
  cursor: pointer;
  height: 4px;
}

.row-group {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #94a3b8;
}

.toggle-pill {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-pill.active {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.4);
}

.engine-box {
  background: rgba(0, 0, 0, 0.2);
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.engine-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #94a3b8;
}

.engine-row label {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sidebar-select {
  background: #1e293b;
  color: #f1f5f9;
  border: 1px solid #475569;
  padding: 3px 6px;
  border-radius: 5px;
  font-size: 10.5px;
  outline: none;
  max-width: 160px;
}

/* Telemetry Card */
.telemetry-card {
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 8px;
  padding: 8px 10px;
  flex-shrink: 0;
}

.telemetry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  color: #34d399;
  margin-bottom: 6px;
}

.live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 5px #34d399;
}

.telemetry-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 10px;
}

.tele-item {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
}

.tele-k { color: #94a3b8; }
.tele-v { font-weight: 600; color: #f1f5f9; }

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Version Badge in Navbar */
.version-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.3);
  padding: 3px 7px 1px 7px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.3px;
  height: 19px;
  box-sizing: border-box;
}

.version-badge:hover {
  background: rgba(99, 102, 241, 0.3);
  color: #c7d2fe;
  border-color: rgba(99, 102, 241, 0.5);
}
</style>
