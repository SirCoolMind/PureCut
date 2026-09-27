<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch, defineAsyncComponent } from 'vue'
// Canvas handles are live module bindings, not refs - see src/core/canvasStore.ts.
// Read directly; replaced only through that module's setters.
import { maskCanvas, originalCanvas, clearCanvases } from './core/canvasStore.js'
import { toImageCoords } from './core/geometry.js'
import { useDisplayScale } from './composables/useDisplayScale.js'
import { useWorkspaceUi } from './composables/useWorkspaceUi.js'
import { useZoomPan } from './composables/useZoomPan.js'
import { useTelemetry } from './composables/useTelemetry.js'
import { useUndoRedo } from './composables/useUndoRedo.js'
import { useImageInput } from './composables/useImageInput.js'
import { useOutlineOverlay } from './composables/useOutlineOverlay.js'
import { useSubjects } from './composables/useSubjects.js'
import { useBrush } from './composables/useBrush.js'
import { useSelectionOverlay } from './composables/useSelectionOverlay.js'
import { useSelectionTools } from './composables/useSelectionTools.js'
import { useCompositor } from './composables/useCompositor.js'
import { useModelCache } from './composables/useModelCache.js'
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js'
import { useProcessing } from './composables/useProcessing.js'
import { useTutorial } from './composables/useTutorial.js'
import ProcessingOverlay from './components/ProcessingOverlay.vue'
import UploadHero from './components/UploadHero.vue'
import ModelChangePrompt from './components/ModelChangePrompt.vue'
import ReplaceImagePrompt from './components/ReplaceImagePrompt.vue'
import NewImageConfirmPrompt from './components/NewImageConfirmPrompt.vue'
import SubjectsDrawer from './components/SubjectsDrawer.vue'
import ZoomToolbar from './components/ZoomToolbar.vue'
import StageHeader from './components/StageHeader.vue'
import StageFooter from './components/StageFooter.vue'
import TuningSidebar from './components/TuningSidebar.vue'
import Navbar from './components/Navbar.vue'
import CanvasViewport from './components/CanvasViewport.vue'
import TutorialOverlay from './components/TutorialOverlay.vue'

// Lazy-loaded modals for optimal initial bundle size and instantaneous first load
const InfoModal = defineAsyncComponent(() => import('./components/InfoModal.vue'))
const SettingsModal = defineAsyncComponent(() => import('./components/SettingsModal.vue'))
const ShowcaseModal = defineAsyncComponent(() => import('./components/ShowcaseModal.vue'))

const showBenchmarkPage = ref(false)
const originalUrl = ref(null)
const resultUrl = ref(null)
const resultBlob = ref(null)

const imageDimensions = reactive({ width: 0, height: 0 })

const statusMessage = ref('')
const { telemetry } = useTelemetry()

const selectedModel = ref('briaai/RMBG-1.4')
const selectedDevice = ref('gpu') // 'gpu' | 'cpu'

const {
  cachedModels,
  isClearingCache,
  checkModelCacheStatus,
  formattedCacheUsage,
  clearAllCache,
  currentModelCached,
  currentModelMeta
} = useModelCache({ statusMessage, selectedModel })

const showSettingsModal = ref(false)

const { userMode, activeTool, sliderPosition, previewBg, copied } = useWorkspaceUi()
const displayCanvasRef = ref(null)
const selectionCanvasRef = ref(null)

const selectShape = ref('magnetic')
const isSelecting = ref(false)
const selectionBox = reactive({ startX: 0, startY: 0, currentX: 0, currentY: 0 })
const lassoPoints = ref([])
const activeSelection = ref(null)
const hasSelection = computed(() => !!activeSelection.value || (selectShape.value === 'polygon' && isSelecting.value && lassoPoints.value.length > 0))
const wandTolerance = ref(25)

const {
  zoomLevel,
  panOffset,
  isPanning,
  zoomIn,
  zoomOut,
  resetZoom,
  onWheelZoom,
  onPanStart,
  onPanMove,
  onPanEnd
} = useZoomPan({ resultUrl, activeTool })

const {
  fontSize,
  applyFontSize,
  cycleFontSize,
  browserZoomLevel,
  isBrowserZoomed,
  updateBrowserZoom,
  resetBrowserZoom
} = useDisplayScale()

const { tuning, applyPreset, renderFastPreview, schedulePreview, recompositeCanvas, clearPendingPreview } =
  useCompositor({ imageDimensions, resultUrl, resultBlob, displayCanvasRef })

const { undoHistory, redoHistory, saveUndoState, handleUndo, handleRedo, resetBrush } =
  useUndoRedo({ imageDimensions, recompositeCanvas })

const { detectedSubjects, showSubjectsDrawer, toggleSubjectVisibility, eraseSubject, refreshDetectionData } =
  useSubjects({ saveUndoState, recompositeCanvas })

const currentFileBlob = ref(null)

const {
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
} = useProcessing({
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
})

const {
  fileInput,
  showReplaceImagePrompt,
  showNewImagePrompt,
  pendingNewImageFile,
  pendingNewImageThumbnail,
  confirmAndProcessImage,
  confirmReplaceImage,
  cancelReplaceImage,
  requestNewImage,
  confirmNewImage,
  cancelNewImage,
  onFileSelect,
  onDrop,
  onPaste,
  copyToClipboard
} = useImageInput({ originalUrl, resultBlob, copied, processImage })

// Captures the hero's hidden file input for useImageInput. Has to be a stable
// function: an inline arrow would be re-created on every render, and Vue
// re-invokes a changed function ref (null first, then the element again).
function setFileInput(el) {
  fileInput.value = el
}

function setDisplayCanvas(el) {
  displayCanvasRef.value = el
}

function setSelectionCanvas(el) {
  selectionCanvasRef.value = el
}

// Bundled demo photo, resolved against Vite's BASE_URL so it also works from the
// GitHub Pages sub-path. It is prefixed with the base by the same convention the
// showcase assets use; processing then follows the normal upload path.
const sampleSrc = `${import.meta.env.BASE_URL}Example1.jpg`

/** Fetch the bundled sample and run it through the UI's own intake path. */
async function loadSampleImage() {
  try {
    const res = await fetch(sampleSrc)
    if (!res.ok) return
    const blob = await res.blob()
    const file = new File([blob], 'Example1.jpg', { type: blob.type || 'image/jpeg' })
    confirmAndProcessImage(file)
  } catch (err) {
    console.error('Sample image load failed:', err)
  }
}

const { showOutline } = useOutlineOverlay({ imageDimensions, zoomLevel })

const { brushMode, brushSize, onPointerDown, onPointerMove, onPointerUp } =
  useBrush({ activeTool, getCanvasCoords, schedulePreview, saveUndoState, recompositeCanvas })

const { startAntsAnimation, stopAntsAnimation } =
  useSelectionOverlay({
    selectionCanvasRef,
    imageDimensions,
    activeSelection,
    isSelecting,
    selectShape,
    selectionBox,
    lassoPoints,
    zoomLevel,
    activeTool,
    hasSelection
  })

const { onSelectPointerDown, onSelectPointerMove, onSelectPointerUp, clearSelection, applySelectionAction } =
  useSelectionTools({
    imageDimensions,
    activeTool,
    zoomLevel,
    getCanvasCoords,
    startAntsAnimation,
    stopAntsAnimation,
    saveUndoState,
    recompositeCanvas,
    refreshDetectionData,
    selectShape,
    isSelecting,
    selectionBox,
    lassoPoints,
    activeSelection,
    wandTolerance
  })

const { onKeyDown } = useKeyboardShortcuts({
  handleUndo,
  handleRedo,
  activeTool,
  hasSelection,
  applySelectionAction,
  clearSelection,
  isSelecting,
  selectShape
})

const showInfoModal = ref(false)

const {
  tutorialOpen,
  stepIndex,
  currentStep,
  visibleSteps,
  isLastStep,
  tutorialHintSeen,
  openTutorial,
  closeTutorial,
  nextStep,
  prevStep,
  goToStep
} = useTutorial({ originalUrl, isProcessing })

// Pointer → image-pixel mapping. The maths lives in src/core/geometry.ts so it can
// be unit-tested without a DOM; this adapter only reads the live viewport box and
// the current view state.
//
// Both the brush and the selection tools hit `[data-image-surface]` layers, which
// CanvasViewport pins to the image's rendered box. So the pointer can be mapped
// straight against that element's own rectangle - deliberately the SAME rectangle
// the visible layer (preview canvas, marching-ants canvas, cursor ring) is drawn
// in, which makes "what you see is where it acts" true by construction rather than
// by two independent calculations that happen to agree. It also means a stale
// measured viewport size can never desynchronise the two.
//
// `toImageCoords` remains the fallback for any surface that spans the whole
// viewport, and derives the letterbox box from the viewport's CONTENT box -
// `getBoundingClientRect()` includes the 1px border, while the transform layer is
// `inset: 0` inside it.
function getCanvasCoords(e) {
  const imageSurface = e.currentTarget?.closest?.('[data-image-surface]')
  if (imageSurface) {
    const rect = imageSurface.getBoundingClientRect()
    if (rect.width && rect.height) {
      const x = ((e.clientX - rect.left) / rect.width) * imageDimensions.width
      const y = ((e.clientY - rect.top) / rect.height) * imageDimensions.height
      return {
        x: Math.max(0, Math.min(imageDimensions.width, x)),
        y: Math.max(0, Math.min(imageDimensions.height, y))
      }
    }
  }

  const el = e.currentTarget.closest('.comparison-viewport') || e.currentTarget
  const rect = el.getBoundingClientRect()

  return toImageCoords(e.clientX, e.clientY, {
    left: rect.left + (el.clientLeft || 0),
    top: rect.top + (el.clientTop || 0),
    width: el.clientWidth || rect.width,
    height: el.clientHeight || rect.height
  }, {
    imageWidth: imageDimensions.width,
    imageHeight: imageDimensions.height,
    zoom: zoomLevel.value,
    panX: panOffset.x,
    panY: panOffset.y
  })
}

function reset() {
  originalUrl.value = null
  resultUrl.value = null
  resultBlob.value = null
  currentFileBlob.value = null
  clearCanvases()
  clearPendingPreview()
  clearSelection()
  resetZoom()
  fileName.value = ''
  fileSize.value = ''
  sliderPosition.value = 50
  statusMessage.value = ''
  undoHistory.value = []
  redoHistory.value = []
}

function confirmStartOver() {
  confirmNewImage()
  reset()
}

watch(activeTool, (newTool) => {
  if (newTool === 'brush' && originalCanvas && maskCanvas) {
    nextTick(() => {
      renderFastPreview()
    })
  }
  if (newTool !== 'select') {
    clearSelection()
  }
})

onMounted(() => {
  applyFontSize(fontSize.value)
  checkModelCacheStatus()
  window.addEventListener('paste', onPaste)
  window.addEventListener('keydown', onKeyDown)
  updateBrowserZoom()
  window.addEventListener('resize', updateBrowserZoom)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateBrowserZoom)
  }
})

onUnmounted(() => {
  window.removeEventListener('paste', onPaste)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', updateBrowserZoom)
  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', updateBrowserZoom)
  }
  stopAntsAnimation()
})
</script>

<template>
  <div class="app-shell" :class="{ 'in-workspace': !!originalUrl }">
    <Navbar
      :is-processing="isProcessing"
      :is-preloading="isPreloading"
      :selected-model="selectedModel"
      :current-model-cached="currentModelCached"
      :formatted-cache-usage="formattedCacheUsage"
      :is-clearing-cache="isClearingCache"
      :is-browser-zoomed="isBrowserZoomed"
      :browser-zoom-level="browserZoomLevel"
      :font-size="fontSize"
      :user-mode="userMode"
      :is-workspace-open="!!originalUrl"
      :tutorial-hint="!tutorialOpen && !tutorialHintSeen"
      @model-change="handleModelSelectChange"
      @preload="handlePreload"
      @clear-cache="clearAllCache"
      @reset-browser-zoom="resetBrowserZoom"
      @cycle-font-size="cycleFontSize"
      @open-info="showInfoModal = true"
      @open-showcase="showBenchmarkPage = true"
      @open-settings="showSettingsModal = true"
      @open-tutorial="openTutorial"
      @update:user-mode="userMode = $event"
    />

    <main class="main-content">
      <UploadHero
        v-if="!originalUrl"
        :input-ref="setFileInput"
        :sample-src="sampleSrc"
        @browse="fileInput.click()"
        @drop="onDrop"
        @select="onFileSelect"
        @load-sample="loadSampleImage"
      />

      <ProcessingOverlay
        v-else-if="isProcessing"
        :status-message="statusMessage"
        :download-progress="downloadProgress"
        :telemetry="telemetry"
      />

      <section v-else class="studio-workspace">
        <div class="stage-column">
          <StageHeader
            :file-name="fileName"
            :image-dimensions="imageDimensions"
            :file-size="fileSize"
            :subject-count="detectedSubjects.length"
            :subjects-drawer-open="showSubjectsDrawer"
            :active-tool="activeTool"
            :preview-bg="previewBg"
            :copied="copied"
            :can-copy="!!resultBlob"
            :result-url="resultUrl"
            @toggle-subjects="showSubjectsDrawer = !showSubjectsDrawer"
            @update:active-tool="activeTool = $event"
            @update:preview-bg="previewBg = $event"
            @reset="requestNewImage"
            @copy="copyToClipboard"
          />

          <CanvasViewport
            :preview-bg="previewBg"
            :active-tool="activeTool"
            :is-panning="isPanning"
            :result-url="resultUrl"
            :original-url="originalUrl"
            :slider-position="sliderPosition"
            :image-width="imageDimensions.width"
            :image-height="imageDimensions.height"
            :brush-size="brushSize"
            :has-selection="hasSelection"
            :is-selecting="isSelecting"
            :show-outline="showOutline"
            :subjects-drawer-open="showSubjectsDrawer"
            :subjects="detectedSubjects"
            :zoom-level="zoomLevel"
            :pan-offset="panOffset"
            :set-display-canvas="setDisplayCanvas"
            :set-selection-canvas="setSelectionCanvas"
            @wheel="onWheelZoom"
            @update:slider-position="sliderPosition = $event"
            @brush-down="onPointerDown"
            @brush-move="onPointerMove"
            @brush-up="onPointerUp"
            @select-down="onSelectPointerDown"
            @select-move="onSelectPointerMove"
            @select-up="onSelectPointerUp"
            @pan-start="onPanStart"
            @pan-move="onPanMove"
            @pan-end="onPanEnd"
            @close-subjects="showSubjectsDrawer = false"
            @toggle-subject="toggleSubjectVisibility"
            @erase-subject="eraseSubject"
            @zoom-in="zoomIn"
            @zoom-out="zoomOut"
            @reset-zoom="resetZoom"
          />

          <StageFooter
            :active-tool="activeTool"
            :brush-mode="brushMode"
            :brush-size="brushSize"
            :undo-history-length="undoHistory.length"
            :select-shape="selectShape"
            :wand-tolerance="wandTolerance"
            :has-selection="hasSelection"
            @update:brush-mode="brushMode = $event"
            @update:brush-size="brushSize = $event"
            @undo="handleUndo"
            @reset-brush="resetBrush"
            @select-shape="selectShape = $event; clearSelection()"
            @update:wand-tolerance="wandTolerance = $event"
            @apply-selection="applySelectionAction"
            @clear-selection="clearSelection"
          />
        </div>

        <TuningSidebar
          :user-mode="userMode"
          :tuning="tuning"
          :selected-model="selectedModel"
          :selected-device="selectedDevice"
          :telemetry="telemetry"
          :tta-flip-fusion="ttaFlipFusion"
          @apply-preset="applyPreset"
          @recomposite="recompositeCanvas"
          @model-change="handleModelSelectChange"
          @device-change="selectedDevice = $event; reRunModel()"
          @tta-toggle="toggleTtaFlipFusion"
        />
      </section>
    </main>

    <ModelChangePrompt
      :show="showModelChangePrompt"
      :pending-model-id="pendingModelId"
      :dont-ask-model-change-again="dontAskModelChangeAgain"
      @update:dont-ask-model-change-again="dontAskModelChangeAgain = $event"
      @close="cancelModelRerun"
      @confirm="confirmModelRerun"
    />

    <ReplaceImagePrompt
      :show="showReplaceImagePrompt"
      :pending-new-image-thumbnail="pendingNewImageThumbnail"
      :pending-new-image-file="pendingNewImageFile"
      :current-model-meta="currentModelMeta"
      @close="cancelReplaceImage"
      @confirm="confirmReplaceImage"
    />

    <NewImageConfirmPrompt
      :show="showNewImagePrompt"
      :current-image-thumbnail="originalUrl"
      :current-file-name="fileName"
      :current-model-meta="currentModelMeta"
      @close="cancelNewImage"
      @confirm="confirmStartOver"
    />

    <SettingsModal
      :show="showSettingsModal"
      @close="showSettingsModal = false"
      :current-font-size="fontSize"
      @update-font-size="applyFontSize"
    />

    <InfoModal
      :show="showInfoModal"
      :formatted-cache-usage="formattedCacheUsage"
      :cached-models="cachedModels"
      :is-clearing-cache="isClearingCache"
      :is-processing="isProcessing"
      @close="showInfoModal = false"
      @clear-cache="clearAllCache"
    />

    <ShowcaseModal
      v-if="showBenchmarkPage"
      :font-size="fontSize"
      @back="showBenchmarkPage = false"
      @cycle-font-size="cycleFontSize"
    />

    <TutorialOverlay
      :show="tutorialOpen"
      :step="currentStep"
      :index="stepIndex"
      :total="visibleSteps.length"
      :is-last="isLastStep"
      @close="closeTutorial"
      @next="nextStep"
      @prev="prevStep"
      @goto="goToStep"
    />
  </div>
</template>

<style src="./styles/global.css">
</style>

<style scoped src="./styles/app.css">
</style>
