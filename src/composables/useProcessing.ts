/**
 * Running the model: the AI pipeline itself, the pre-download flow, and the
 * "the model changed - re-run?" confirmation that guards switching models.
 *
 * `processImage()` is the orchestrator. It takes a file and, in order: resets the
 * per-image state, loads the bitmap to learn the true pixel dimensions, builds the
 * offscreen `originalCanvas`, runs the model, builds the offscreen `maskCanvas`
 * from the returned mask blob, records telemetry, triggers the first composite,
 * and finally kicks off subject detection on a 50ms timer so it never blocks the
 * first paint.
 *
 * Two details that matter:
 *  - The canvas handles go through the canvas store (`setOriginalCanvas` /
 *    `setMaskCanvas`), because a captured value would go stale on the next image.
 *  - If the model reports it fell back to WASM while the user had selected GPU,
 *    `selectedDevice` is corrected to 'cpu' so the UI stops claiming GPU.
 *
 * `handleModelSelectChange` / `confirmModelRerun` / `cancelModelRerun` are the
 * confirmation prompt. `reRunModel()` is the shared tail: re-run the *current*
 * file with the newly selected model.
 *
 * It owns the transient per-run state (`isProcessing`, `isPreloading`,
 * `downloadProgress`, `fileName`, `fileSize` and the prompt's own refs). Everything
 * else it only reads and writes, so it arrives as a parameter - deliberately not
 * owned, because `imageDimensions`, `statusMessage` and `resultUrl`/`resultBlob`
 * are shared with useCompositor, useUndoRedo, useSubjects and useModelCache, and
 * owning them here would make the wiring cyclic.
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; no
 * behaviour was changed.
 */

import { reactive, ref, type Ref } from 'vue'
import { runTransformersModel, preloadTransformersModel } from '../aiEngine.js'
import { detectSubjects } from '../detectionEngine.js'
import { STORAGE_KEYS, cachedModelKey } from '../core/storageKeys.js'
import { formatBytes } from '../core/format.js'
import {
  maskCanvas,
  maskCtx,
  originalCanvas,
  originalCtx,
  setMaskCanvas,
  setMaskCtx,
  setOriginalCanvas,
  setOriginalCtx
} from '../core/canvasStore.js'

interface ProcessingDeps {
  /** The file currently loaded; set here, re-used by reRunModel(). */
  currentFileBlob: Ref<any>
  /** Object URL of the loaded photo; gates the workspace view. */
  originalUrl: Ref<string | null>
  /** Object URL of the cutout; cleared at the start of every run. */
  resultUrl: Ref<string | null>
  /** PNG blob of the cutout; cleared at the start of every run. */
  resultBlob: Ref<Blob | null>
  /** Mask history; cleared at the start of every run. */
  undoHistory: Ref<any[]>
  /** Transient status line shown over the canvas. */
  statusMessage: Ref<string>
  /** Live image size; written here once the bitmap loads. */
  imageDimensions: { width: number; height: number }
  /** Selected model id. */
  selectedModel: Ref<string>
  /** 'gpu' | 'cpu'. Corrected to 'cpu' if the model falls back to WASM. */
  selectedDevice: Ref<string>
  /** `{ [modelId]: downloaded }`; flipped to true after a successful run. */
  cachedModels: Record<string, boolean>
  /** Whether the selected model is already cached (drives the initial status text). */
  currentModelCached: { value: boolean }
  /** Metadata row for the selected model (dtype, size, optimisation flag). */
  currentModelMeta: { value: any }
  /** Inference telemetry, filled in once the model returns. */
  telemetry: any
  /** Detection result; seeded here on a 50ms timer. */
  detectedSubjects: Ref<any[]>
  /** Opened automatically when more than one subject is detected. */
  showSubjectsDrawer: Ref<boolean>
  /** Kick off the first composite. */
  recompositeCanvas: (immediateBlob?: boolean) => void
  /** Snapshot the freshly built mask as undo state 0. */
  saveUndoState: () => void
}

export function useProcessing({
  currentFileBlob,
  originalUrl,
  resultUrl,
  resultBlob,
  undoHistory,
  statusMessage,
  imageDimensions,
  selectedModel,
  selectedDevice,
  cachedModels,
  currentModelCached,
  currentModelMeta,
  telemetry,
  detectedSubjects,
  showSubjectsDrawer,
  recompositeCanvas,
  saveUndoState
}: ProcessingDeps) {
  /** True for the whole of processImage(); drives the processing overlay. */
  const isProcessing = ref(false)
  /** True while preloading weights. */
  const isPreloading = ref(false)
  /** Progress of a weight download, shown in the overlay. */
  const downloadProgress = reactive({ loadedMB: 0, totalMB: 0, percent: 0, isDownloading: false })

  const fileName = ref('')
  const fileSize = ref('')

  // Model-change prompt state
  const showModelChangePrompt = ref(false)
  const pendingModelId = ref<string | null>(null)
  const dontAskModelChangeAgain = ref(false)

  // TTA Flip Fusion: enabled by default, changeable in Power User mode
  const ttaFlipFusion = ref(localStorage.getItem(STORAGE_KEYS.ttaFlipFusion) !== 'false')

  function toggleTtaFlipFusion() {
    ttaFlipFusion.value = !ttaFlipFusion.value
    localStorage.setItem(STORAGE_KEYS.ttaFlipFusion, String(ttaFlipFusion.value))
    if (currentFileBlob.value) {
      reRunModel()
    }
  }

  // Preload handler
  async function handlePreload() {
    if (isPreloading.value || isProcessing.value) return
    isPreloading.value = true
    downloadProgress.isDownloading = true
    downloadProgress.percent = 0
    statusMessage.value = `Downloading ${currentModelMeta.value.name.split(' ')[0]} weights (${currentModelMeta.value.size})...`

    try {
      await preloadTransformersModel(selectedModel.value, currentModelMeta.value.dtype, currentModelMeta.value.disableOptimization, selectedDevice.value, (progress) => {
        if (progress && (progress.progress !== undefined || progress.pct !== undefined)) {
          const raw = progress.pct !== undefined ? progress.pct : progress.progress
          const pct = Math.min(100, Math.max(0, Math.round(raw > 1 ? raw : raw * 100)))
          downloadProgress.percent = pct
          statusMessage.value = `Downloading ${currentModelMeta.value.name.split(' ')[0]} weights: ${pct}%...`
        }
      })
      cachedModels[selectedModel.value] = true
      localStorage.setItem(cachedModelKey(selectedModel.value), 'true')
      statusMessage.value = 'AI Model cached & ready!'
      setTimeout(() => { downloadProgress.isDownloading = false }, 1500)
    } catch (err) {
      console.error('Preload failed:', err)
      alert('Failed to pre-download model. Please check your internet connection.')
    } finally {
      isPreloading.value = false
    }
  }

  // Main AI Processing Function
  async function processImage(file: File) {
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

    const startHeap = (typeof window !== 'undefined' && window.performance && (window.performance as any).memory)
      ? (window.performance as any).memory.usedJSHeapSize
      : 0
    const startTime = performance.now()

    // Load original image into memory
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise((resolve) => {
      img.onload = () => {
        imageDimensions.width = img.naturalWidth
        imageDimensions.height = img.naturalHeight
        resolve(true)
      }

      img.src = originalUrl.value
    })

    // Initialize offscreen original canvas
    const originalCanvasEl = document.createElement('canvas')
    originalCanvasEl.width = imageDimensions.width
    originalCanvasEl.height = imageDimensions.height
    setOriginalCanvas(originalCanvasEl)
    setOriginalCtx(originalCanvasEl.getContext('2d', { willReadFrequently: true }))
    originalCtx!.drawImage(img, 0, 0)

    try {
      let rawMaskBlob: Blob | null = null

      // Run transformers.js model
      const result = await runTransformersModel(
        file,
        selectedModel.value,
        currentModelMeta.value.dtype,
        currentModelMeta.value.disableOptimization,
        selectedDevice.value,
        (p) => {
          if (p.message) statusMessage.value = p.message
          if (p && (p.progress !== undefined || p.pct !== undefined)) {
            const raw = p.pct !== undefined ? p.pct : p.progress
            downloadProgress.percent = Math.min(100, Math.max(0, Math.round(raw > 1 ? raw : raw * 100)))
          }
        },
        { tta: ttaFlipFusion.value }
      )
      rawMaskBlob = result.maskBlob

      cachedModels[selectedModel.value] = true
      localStorage.setItem(cachedModelKey(selectedModel.value), 'true')

      // Initialize mask canvas
      const maskImg = new Image()
      maskImg.crossOrigin = 'anonymous'
      const maskUrl = URL.createObjectURL(rawMaskBlob as Blob)
      await new Promise((resolve) => {
        maskImg.onload = () => resolve(true)
        maskImg.src = maskUrl
      })

      const maskCanvasEl = document.createElement('canvas')
      maskCanvasEl.width = imageDimensions.width
      maskCanvasEl.height = imageDimensions.height
      setMaskCanvas(maskCanvasEl)
      setMaskCtx(maskCanvasEl.getContext('2d', { willReadFrequently: true }))
      maskCtx!.drawImage(maskImg, 0, 0)
      saveUndoState()

      // Telemetry stats
      const endTime = performance.now()
      const elapsed = endTime - startTime
      telemetry.durationMs = Math.round(elapsed)
      telemetry.durationSec = (elapsed / 1000).toFixed(2)

      const endHeap = (typeof window !== 'undefined' && window.performance && (window.performance as any).memory)
        ? (window.performance as any).memory.usedJSHeapSize
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
      const actualDevice = result.deviceUsed || (selectedDevice.value === 'gpu' ? 'webgpu' : 'wasm')
      telemetry.deviceUsed = actualDevice === 'webgpu' ? 'WebGPU (Hardware GPU)' : 'WASM SIMD Multi-threaded'
      if (actualDevice === 'wasm' && selectedDevice.value === 'gpu') {
        selectedDevice.value = 'cpu'
      }

      recompositeCanvas()

      // Analyze and extract separate objects/subjects asynchronously
      setTimeout(() => {
        detectedSubjects.value = detectSubjects(maskCanvas, originalCanvas)
        if (detectedSubjects.value.length > 1) {
          showSubjectsDrawer.value = true // automatically open drawer if multiple subjects found
        }
      }, 50)

    } catch (error: any) {
      console.error('Processing error:', error)
      alert(error.message || 'Failed to process image. Try selecting another model or device.')
    } finally {
      isProcessing.value = false
      downloadProgress.isDownloading = false
    }
  }

  // Model change confirmation logic
  function handleModelSelectChange(e: Event) {
    const newModelId = (e.target as HTMLSelectElement).value
    if (!originalUrl.value || !currentFileBlob.value) {
      selectedModel.value = newModelId
      return
    }
    const promptPref = localStorage.getItem(STORAGE_KEYS.promptModelChange)
    const shouldPrompt = promptPref === null ? true : promptPref === 'true'
    if (!shouldPrompt) {
      selectedModel.value = newModelId
      reRunModel()
      return
    }
    // Prompt the user
    pendingModelId.value = newModelId
    dontAskModelChangeAgain.value = false
    // Revert select display until confirmed
    ;(e.target as HTMLSelectElement).value = selectedModel.value
    showModelChangePrompt.value = true
  }

  function confirmModelRerun() {
    if (dontAskModelChangeAgain.value) {
      localStorage.setItem(STORAGE_KEYS.promptModelChange, 'false')
    }
    if (pendingModelId.value) {
      selectedModel.value = pendingModelId.value
    }
    showModelChangePrompt.value = false
    pendingModelId.value = null
    reRunModel()
  }

  function cancelModelRerun() {
    if (dontAskModelChangeAgain.value) {
      localStorage.setItem(STORAGE_KEYS.promptModelChange, 'false')
    }
    showModelChangePrompt.value = false
    pendingModelId.value = null
  }

  // Re-run AI model
  function reRunModel() {
    if (currentFileBlob.value) {
      processImage(currentFileBlob.value)
    }
  }

  return {
    isProcessing,
    isPreloading,
    downloadProgress,
    fileName,
    fileSize,
    showModelChangePrompt,
    pendingModelId,
    dontAskModelChangeAgain,
    handlePreload,
    processImage,
    handleModelSelectChange,
    confirmModelRerun,
    cancelModelRerun,
    reRunModel,
    ttaFlipFusion,
    toggleTtaFlipFusion
  }
}
