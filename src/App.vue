<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch, defineAsyncComponent } from 'vue'
// Canvas handles are live module bindings, not refs - see src/core/canvasStore.ts.
// Read directly; replaced only through that module's setters.
import { maskCanvas, originalCanvas, clearCanvases } from './core/canvasStore.js'
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
import { useProcessing } from './composables/useProcessing.js'
import ProcessingOverlay from './components/ProcessingOverlay.vue'
import UploadHero from './components/UploadHero.vue'
import ModelChangePrompt from './components/ModelChangePrompt.vue'
import ReplaceImagePrompt from './components/ReplaceImagePrompt.vue'
import SubjectsDrawer from './components/SubjectsDrawer.vue'
import ZoomToolbar from './components/ZoomToolbar.vue'
import StageHeader from './components/StageHeader.vue'
import StageFooter from './components/StageFooter.vue'
import TuningSidebar from './components/TuningSidebar.vue'
import Navbar from './components/Navbar.vue'
import CanvasViewport from './components/CanvasViewport.vue'

// Lazy-loaded modals for optimal initial bundle size and instantaneous first load
const InfoModal = defineAsyncComponent(() => import('./components/InfoModal.vue'))
const SettingsModal = defineAsyncComponent(() => import('./components/SettingsModal.vue'))
const ShowcaseModal = defineAsyncComponent(() => import('./components/ShowcaseModal.vue'))

// --- State ---
const showBenchmarkPage = ref(false)
const originalUrl = ref(null)
const resultUrl = ref(null)
const resultBlob = ref(null)

// Mask canvases for non-destructive editing & brush. The handles live in
// src/core/canvasStore.ts as non-reactive module bindings, so extracted tools can
// reach the live canvas without threading it through every function signature.

// fileName / fileSize are owned by useProcessing (wired below).
const imageDimensions = reactive({ width: 0, height: 0 })

// Processing & telemetry. isProcessing / isPreloading / downloadProgress are owned
// by useProcessing (wired below); statusMessage stays declared here because
// useModelCache, useProcessing and the template all read or write it.
const statusMessage = ref('')
// Filled in by processImage() once inference completes. See useTelemetry.
const { telemetry } = useTelemetry()

const selectedModel = ref('briaai/RMBG-1.4')
const selectedDevice = ref('gpu') // 'gpu' | 'cpu'

// Model cache state + the "clear cached models" flow. See useModelCache.
// cachedModels is flipped in place by processImage/handlePreload below.
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

// UI Modes & Tools
const { userMode, activeTool, sliderPosition, previewBg, copied } = useWorkspaceUi()
const displayCanvasRef = ref(null) // Live GPU-composited preview canvas
const selectionCanvasRef = ref(null) // Dotted marching ants selection overlay

// Selection (Marching Ants) Tool System
const selectShape = ref('magnetic') // 'magnetic' | 'lasso' | 'rect' | 'polygon' | 'wand'
const isSelecting = ref(false)
const selectionBox = reactive({ startX: 0, startY: 0, currentX: 0, currentY: 0 })
const lassoPoints = ref([])
const activeSelection = ref(null) // { type: 'rect', x, y, width, height } | { type: 'lasso', points: [] } | { type: 'wand', points: [], visitedMask: Uint8Array, ... }
const hasSelection = computed(() => !!activeSelection.value || (selectShape.value === 'polygon' && isSelecting.value && lassoPoints.value.length > 0))
const wandTolerance = ref(25)

// Zoom & pan for the viewport. See useZoomPan.

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

// Display scaling: font size (persisted) and browser zoom. See useDisplayScale.
const {
  fontSize,
  applyFontSize,
  cycleFontSize,
  browserZoomLevel,
  isBrowserZoomed,
  updateBrowserZoom,
  resetBrowserZoom
} = useDisplayScale()

// Canvas compositing: fast GPU preview + debounced full-quality export, and the
// tuning parameters they read. See useCompositor. Wired before the tool
// composables below, which take these as callbacks.
const { tuning, applyPreset, renderFastPreview, schedulePreview, recompositeCanvas, clearPendingPreview } =
  useCompositor({ imageDimensions, resultUrl, resultBlob, displayCanvasRef })

// Mask history: undo / redo / reset-to-raw-AI-mask. See useUndoRedo.
const { undoHistory, redoHistory, saveUndoState, handleUndo, handleRedo, resetBrush } =
  useUndoRedo({ imageDimensions, recompositeCanvas })

// Detected subjects + the drawer that hides/erases them. See useSubjects.
// processImage() seeds detectedSubjects and may auto-open the drawer.
const { detectedSubjects, showSubjectsDrawer, toggleSubjectVisibility, eraseSubject, refreshDetectionData } =
  useSubjects({ saveUndoState, recompositeCanvas })

// The file currently loaded. Declared here rather than inside useImageInput because
// the intake composable needs processImage (so useProcessing must be wired first)
// and useProcessing needs the file.
const currentFileBlob = ref(null)

// The AI pipeline plus the preload and model-change-prompt flows. See useProcessing.
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
  reRunModel
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

// Image intake: picker, drag & drop, paste, copy, and the replace-image prompt.
const {
  fileInput,
  showReplaceImagePrompt,
  pendingNewImageFile,
  pendingNewImageThumbnail,
  confirmAndProcessImage,
  confirmReplaceImage,
  cancelReplaceImage,
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

// Same trick for the viewport's two canvases: useCompositor owns the display
// canvas and useSelectionOverlay the selection canvas, and both read the refs
// App.vue created, so the element has to be handed back here.
function setDisplayCanvas(el) {
  displayCanvasRef.value = el
}

function setSelectionCanvas(el) {
  selectionCanvasRef.value = el
}

// The animated contour outline is currently inert - nothing calls toggleOutline(),
// so showOutline is only ever read (by the template). See AGENTS.md known issues.
const { showOutline } = useOutlineOverlay({ imageDimensions, zoomLevel })

// Brush: pointer painting straight onto the mask. See useBrush.
const { brushMode, brushSize, onPointerDown, onPointerMove, onPointerUp } =
  useBrush({ activeTool, getCanvasCoords, schedulePreview, saveUndoState, recompositeCanvas })

// Marching-ants overlay renderer. It owns only the ants animation; the selection
// state it draws belongs to the selection tools. See useSelectionOverlay.
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

// Selection tools: magnetic lasso, freehand lasso, rect, polygon, magic wand.
// See useSelectionTools - it shares the selection state above with the overlay.
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

// Modal State
const showInfoModal = ref(false)

// Model cache status, storage-size reporting and clearing now live in
// src/composables/useModelCache.ts.

// The preload flow now lives in src/composables/useProcessing.ts.

// Preset handling (`applyPreset`) lives in src/composables/useCompositor.ts, and
// formatBytes in src/core/format.ts (imported above).

// The AI pipeline (processImage) now lives in src/composables/useProcessing.ts.

// The model-change confirmation prompt now lives in
// src/composables/useProcessing.ts.

// The compositing engine (fast GPU preview, debounced full-quality export) now
// lives in src/composables/useCompositor.ts.

// The contour-outline renderer now lives in src/composables/useOutlineOverlay.ts

// Subject visibility / erase now live in src/composables/useSubjects.ts.
// Known bug moved verbatim with it: erasing clips to the bounding box, so
// overlapping neighbours lose pixels too.

// Undo / redo / reset-to-raw-AI-mask now live in src/composables/useUndoRedo.ts.
// saveUndoState() is called from the brush, selection and subject tools below.

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

// The brush engine now lives in src/composables/useBrush.ts. Its handlers are
// wired to the brush interaction surface in the template.

// The marching-ants overlay renderer now lives in
// src/composables/useSelectionOverlay.ts.

// The selection tools (magnetic lasso, lasso, rect, polygon, magic wand) now
// live in src/composables/useSelectionTools.ts.

// Image intake (picker / drop / paste / copy) and the replace-image prompt now
// live in src/composables/useImageInput.ts.

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

function onKeyDown(e) {
  // Undo/Redo: Ctrl + Z, Ctrl + Shift + Z, Ctrl + Y
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (e.shiftKey) {
      handleRedo()
    } else {
      handleUndo()
    }
    return
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    handleRedo()
    return
  }

  // If user has a selection active, support Delete/Backspace to erase, Enter to restore, Esc to clear
  if (activeTool.value === 'select' && hasSelection.value) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      applySelectionAction('erase')
    } else if (e.key === 'Enter') {
      e.preventDefault()
      applySelectionAction('restore')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      clearSelection()
    }
  } else if (activeTool.value === 'select' && isSelecting.value && selectShape.value === 'polygon' && e.key === 'Escape') {
    e.preventDefault()
    clearSelection()
  }
}

// When switching modes, initialize preview or manage selection state
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
    <!-- Navbar (Fixed 48px height) -->
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
      @model-change="handleModelSelectChange"
      @preload="handlePreload"
      @clear-cache="clearAllCache"
      @reset-browser-zoom="resetBrowserZoom"
      @cycle-font-size="cycleFontSize"
      @open-info="showInfoModal = true"
      @open-showcase="showBenchmarkPage = true"
      @open-settings="showSettingsModal = true"
      @update:user-mode="userMode = $event"
    />

    <!-- Main Content Area (Zero Window Scroll) -->
    <main class="main-content">
      <!-- VIEW 1: Upload Dropzone -->
      <UploadHero
        v-if="!originalUrl"
        :input-ref="setFileInput"
        @browse="fileInput.click()"
        @drop="onDrop"
        @select="onFileSelect"
      />

      <!-- VIEW 2: Processing Overlay (Clean, Non-overlapping UI) -->
      <ProcessingOverlay
        v-else-if="isProcessing"
        :status-message="statusMessage"
        :download-progress="downloadProgress"
        :telemetry="telemetry"
      />

      <!-- VIEW 3: Studio Workspace (2-Column Zero-Scroll Layout) -->
      <section v-else class="studio-workspace">
        <!-- LEFT COLUMN: Canvas Stage -->
        <div class="stage-column">
          <!-- Top Info & Tool Selector Bar -->
          <StageHeader
            :file-name="fileName"
            :image-dimensions="imageDimensions"
            :file-size="fileSize"
            :subject-count="detectedSubjects.length"
            :subjects-drawer-open="showSubjectsDrawer"
            :active-tool="activeTool"
            :preview-bg="previewBg"
            @toggle-subjects="showSubjectsDrawer = !showSubjectsDrawer"
            @update:active-tool="activeTool = $event"
            @update:preview-bg="previewBg = $event"
          />

          <!-- Dynamic Viewport with Wheel Zoom & Pan Support -->
          <CanvasViewport
            :preview-bg="previewBg"
            :active-tool="activeTool"
            :is-panning="isPanning"
            :result-url="resultUrl"
            :original-url="originalUrl"
            :slider-position="sliderPosition"
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

          <!-- Stage Footer: Hint & Actions -->
          <StageFooter
            :active-tool="activeTool"
            :brush-mode="brushMode"
            :brush-size="brushSize"
            :undo-history-length="undoHistory.length"
            :select-shape="selectShape"
            :wand-tolerance="wandTolerance"
            :has-selection="hasSelection"
            :copied="copied"
            :can-copy="!!resultBlob"
            :result-url="resultUrl"
            :file-name="fileName"
            @update:brush-mode="brushMode = $event"
            @update:brush-size="brushSize = $event"
            @undo="handleUndo"
            @reset-brush="resetBrush"
            @select-shape="selectShape = $event; clearSelection()"
            @update:wand-tolerance="wandTolerance = $event"
            @apply-selection="applySelectionAction"
            @clear-selection="clearSelection"
            @reset="reset"
            @copy="copyToClipboard"
          />
        </div>

        <!-- RIGHT COLUMN: Tuning Sidebar -->
        <TuningSidebar
          :user-mode="userMode"
          :tuning="tuning"
          :selected-model="selectedModel"
          :selected-device="selectedDevice"
          :telemetry="telemetry"
          @apply-preset="applyPreset"
          @recomposite="recompositeCanvas"
          @model-change="handleModelSelectChange"
          @device-change="selectedDevice = $event; reRunModel()"
        />
      </section>
    </main>

    <!-- Model Change Confirmation Prompt Modal -->
    <ModelChangePrompt
      :show="showModelChangePrompt"
      :pending-model-id="pendingModelId"
      :dont-ask-model-change-again="dontAskModelChangeAgain"
      @update:dont-ask-model-change-again="dontAskModelChangeAgain = $event"
      @close="cancelModelRerun"
      @confirm="confirmModelRerun"
    />

    <!-- Paste / Replace Image Confirmation Prompt Modal -->
    <ReplaceImagePrompt
      :show="showReplaceImagePrompt"
      :pending-new-image-thumbnail="pendingNewImageThumbnail"
      :pending-new-image-file="pendingNewImageFile"
      :current-model-meta="currentModelMeta"
      @close="cancelReplaceImage"
      @confirm="confirmReplaceImage"
    />

    <!-- Version / Changelog / Roadmap / Storage Modal -->
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

    <!-- Giselle Model Benchmark Showcase Page -->
    <ShowcaseModal
      v-if="showBenchmarkPage"
      @back="showBenchmarkPage = false"
    />
  </div>
</template>

<style src="./styles/global.css">
</style>

<style scoped src="./styles/app.css">
</style>
