<script setup>
/**
 * The canvas viewport: the zoomed/panned stage surface plus every tool layer that
 * is drawn inside it, and the two floating overlays that sit on top of it (the
 * zoom toolbar and the subjects drawer).
 *
 * It is the widest component in the app, and deliberately so: this markup is one
 * absolutely-positioned stack, so splitting it further would mean forwarding
 * pointer coordinates and canvas refs through an extra layer for no gain.
 *
 * `object-fit: contain` letterboxes an `<img>` inside the viewport, and the
 * pointer→pixel maths in `core/geometry.ts` depends on that letterboxing. The
 * brush layer is a `<canvas>` though, and canvas IGNORES `object-fit` - it
 * stretches to fill the viewport, so a stroke landed away from the cursor and at
 * the wrong scale whenever the image's aspect ratio differed from the viewport's.
 * `useViewportSurface` measures the true box; both the display canvas and the
 * brush surface are sized to it, which is what makes the cursor ring, the painted
 * stroke and the pointer agree.
 *
 * Everything it shows arrives as a prop and every interaction leaves as an emit,
 * which keeps App.vue the single owner of the state:
 *  - `sliderPosition` is two-way via `update:sliderPosition`. The split slider
 *    has always been a plain `v-model` (no `.number`), so a dragged value is a
 *    STRING in App.vue and is only coerced where it is interpolated. The emit
 *    passes the raw value through to keep that exact behaviour.
 *  - `imageWidth` / `imageHeight` size the brush cursor guide and derive the box.
 *  - the two canvases are owned by App.vue (`useCompositor` reads the display
 *    canvas, `useSelectionOverlay` the selection canvas) and cannot be reached
 *    from here, so App.vue hands down STABLE function refs.
 *
 * `#outlineCanvas` is unreachable today - nothing ever sets `showOutline` to true
 * (see AGENTS.md known issues). It is carried over as-is.
 */
import { computed, ref, toRef, watch } from 'vue'
import { useViewportSurface } from '../composables/useViewportSurface.js'
import ZoomToolbar from './ZoomToolbar.vue'
import SubjectsDrawer from './SubjectsDrawer.vue'

const props = defineProps({
  /** 'checkerboard' | 'white' | 'black' | 'gradient' - the backdrop class. */
  previewBg: { type: String, required: true },
  /** 'slider' | 'brush' | 'select' | 'pan' */
  activeTool: { type: String, required: true },
  /** True while the pan drag is in progress; drops the transform transition. */
  isPanning: { type: Boolean, default: false },
  /** Object URL of the cutout, or null before one exists. */
  resultUrl: { type: String, default: null },
  /** Object URL of the source photo. */
  originalUrl: { type: String, default: null },
  /** Split-slider position, 0-100. Owned by App.vue. */
  sliderPosition: { type: [Number, String], required: true },
  /** Source-image width, used to size the brush cursor guide. */
  imageWidth: { type: Number, default: 0 },
  /** Source-image height, used to size the brush cursor guide. */
  imageHeight: { type: Number, default: 0 },
  /** Brush radius in source-image pixels; sizes the cursor guide. */
  brushSize: { type: Number, default: 35 },
  /** Whether a marquee selection currently exists. */
  hasSelection: { type: Boolean, default: false },
  /** True while the user is dragging out a selection. */
  isSelecting: { type: Boolean, default: false },
  /** Inert today (see the note above). */
  showOutline: { type: Boolean, default: false },
  /** Whether the subjects drawer is slid in. */
  subjectsDrawerOpen: { type: Boolean, default: false },
  /** Detected subjects shown in the drawer. */
  subjects: { type: Array, required: true },
  /** Current zoom scale factor; forwarded to the zoom toolbar. */
  zoomLevel: { type: Number, required: true },
  /** Current pan offset `{ x, y }`; forwarded to the zoom toolbar. */
  panOffset: { type: Object, required: true },
  /** Stable function ref for the GPU preview canvas. */
  setDisplayCanvas: { type: Function, required: true },
  /** Stable function ref for the marching-ants overlay canvas. */
  setSelectionCanvas: { type: Function, required: true }
})

const emit = defineEmits([
  'wheel',
  'update:sliderPosition',
  'brush-down',
  'brush-move',
  'brush-up',
  'select-down',
  'select-move',
  'select-up',
  'pan-start',
  'pan-move',
  'pan-end',
  'close-subjects',
  'toggle-subject',
  'erase-subject',
  'zoom-in',
  'zoom-out',
  'reset-zoom'
])

// Where the image sits inside the viewport, plus pointer→surface mapping. The
// pointer surface element is handed in so the cursor guide is positioned against
// the very element it lives in - exact under any zoom, border or pan.
const brushSurfaceRef = ref(null)
const { viewportRef, imageBox, cssPerImagePx, toSurfacePoint } = useViewportSurface({
  imageWidth: toRef(props, 'imageWidth'),
  imageHeight: toRef(props, 'imageHeight'),
  surfaceRef: brushSurfaceRef
})

/** Cursor guide centre, as a percentage of the (unzoomed) image box. */
const brushCursor = ref({ x: 50, y: 50 })

/** Guide visibility; hidden until the pointer is actually over the brush surface. */
const brushCursorVisible = ref(false)

/**
 * Last pointer position in client coordinates.
 *
 * Kept so the guide can be re-anchored when the stage MOVES rather than when the
 * pointer moves. Zooming or panning relocates the surface underneath a stationary
 * pointer without firing a single `pointermove`, which left the ring showing where
 * the surface used to be until the user moved the mouse again.
 */
let lastPointerClient = { x: 0, y: 0 }

/** Pin an element to the image's rendered box. Shared by the display canvas and
 *  the brush surface (a `<canvas>` ignores `object-fit` - see the header). */
const imageBoxStyle = computed(() =>
  imageBox.value
    ? {
        left: `${imageBox.value.left}%`,
        top: `${imageBox.value.top}%`,
        width: `${imageBox.value.width}%`,
        height: `${imageBox.value.height}%`
      }
    : {}
)

/** Guide diameter, in the surface's own (pre-transform) CSS pixels.
 *
 *  The brush paints with `lineWidth = brushSize * 2` in SOURCE-IMAGE pixels, but
 *  a photo is shown scaled to fit the viewport (a 1080px-wide photo in a 314px
 *  viewport is shown at ~0.29). Drawing `brushSize * 2` as raw CSS pixels made
 *  the ring ~3x bigger than the patch a click actually affects, which is why the
 *  brush looked like it painted away from the cursor. `cssPerImagePx` converts
 *  the brush's image-pixel diameter into the CSS pixels the guide is laid out in.
 */
const brushCursorSize = computed(() => props.brushSize * 2 * cssPerImagePx.value)

/** Guide position and size, in the brush surface's own percentages. */
const brushCursorStyle = computed(() => ({
  left: `${brushCursor.value.x}%`,
  top: `${brushCursor.value.y}%`,
  width: `${brushCursorSize.value}px`,
  height: `${brushCursorSize.value}px`
}))

/** Track the pointer for the guide AND forward the move to the painter. The guide
 *  follows every move (the user must see the paint area before committing); the
 *  painting itself is still gated on `isDrawing` inside `useBrush`. */
function handleBrushMove(e) {
  lastPointerClient = { x: e.clientX, y: e.clientY }
  brushCursor.value = toSurfacePoint(e.clientX, e.clientY)
  brushCursorVisible.value = true
  emit('brush-move', e)
}

/**
 * Anchor the guide before painting.
 *
 * `pointermove` is the only other source of the guide's position, so if a pointer
 * arrives without a preceding move (a tap, or a move that was swallowed by an
 * overlay) the ring would sit at its previous spot while the stroke landed under
 * the finger. Re-reading it here makes the ring and the stroke agree by
 * construction.
 */
function handleBrushDown(e) {
  lastPointerClient = { x: e.clientX, y: e.clientY }
  brushCursor.value = toSurfacePoint(e.clientX, e.clientY)
  brushCursorVisible.value = true
  emit('brush-down', e)
}

/**
 * Re-anchor the guide when the stage moves.
 *
 * `flush: 'post'` matters: the transform is applied to the DOM by this watcher's
 * render pass, so reading the surface's rect any earlier would measure the old
 * position and simply reproduce the staleness this exists to prevent.
 */
watch(
  [() => props.zoomLevel, () => props.panOffset.x, () => props.panOffset.y, imageBox],
  () => {
    if (!brushCursorVisible.value) return
    brushCursor.value = toSurfacePoint(lastPointerClient.x, lastPointerClient.y)
  },
  { flush: 'post' }
)

/** The guide is hidden off the surface, and the stroke is ended like a pointerup. */
function handleBrushLeave(e) {
  brushCursorVisible.value = false
  emit('brush-up', e)
}
</script>

<template>
  <div
    ref="viewportRef"
    :class="['comparison-viewport', `bg-${previewBg}`, { 'is-brush-active': activeTool === 'brush', 'is-select-active': activeTool === 'select', 'is-panning': isPanning, 'tool-pan': activeTool === 'pan' }]"
    @wheel="$emit('wheel', $event)"
  >
    <!-- Zoom & Pan Floating Controls -->
    <ZoomToolbar
      :zoom-level="zoomLevel"
      :pan-offset="panOffset"
      @zoom-in="$emit('zoom-in')"
      @zoom-out="$emit('zoom-out')"
      @reset="$emit('reset-zoom')"
    />

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

      <!-- Live GPU-composited display canvas (used during brush mode for real-time
           preview). Pinned to the image's rendered box because a <canvas> ignores
           `object-fit` and would otherwise stretch to fill the viewport. -->
      <canvas
        v-if="activeTool === 'brush' && resultUrl"
        :ref="setDisplayCanvas"
        class="viewport-img result-img display-canvas"
        :style="imageBoxStyle"
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
          :value="sliderPosition"
          @input="$emit('update:sliderPosition', $event.target.value)"
          class="range-overlay"
          aria-label="Before/After Split Slider"
        />
      </template>

      <!-- MODE 2: Magic Brush Interactive Painting Layer -->
      <template v-else-if="activeTool === 'brush'">
        <div
          ref="brushSurfaceRef"
          data-image-surface
          class="brush-interaction-surface"
          :style="imageBoxStyle"
          @pointerdown="handleBrushDown"
          @pointermove="handleBrushMove"
          @pointerup="$emit('brush-up', $event)"
          @pointerleave="handleBrushLeave"
        >
          <!-- Cursor guide: transparent ring showing the exact paint area. -->
          <div v-show="brushCursorVisible" class="brush-cursor-guide" :style="brushCursorStyle"></div>
        </div>
      </template>

      <!-- MODE 3: Dotted Marquee Selection Interactive Layer.
           Pinned to the image box for the same reason as the brush surface, and
           because the marching-ants canvas below is: the pointer has to be mapped
           against the same rectangle the ants are drawn in. -->
      <template v-else-if="activeTool === 'select'">
        <div
          data-image-surface
          class="selection-interaction-surface"
          :style="imageBoxStyle"
          @pointerdown="$emit('select-down', $event)"
          @pointermove="$emit('select-move', $event)"
          @pointerup="$emit('select-up', $event)"
          @pointerleave="$emit('select-up', $event)"
        ></div>
      </template>

      <!-- Dotted Marching Ants Selection Overlay Canvas (always rendered on top when selection is active).
           Also pinned to the image box: a <canvas> ignores the `object-fit:
           contain` it inherits from `.viewport-img` and would otherwise stretch to
           fill the viewport, drawing the ants distorted and away from the image. -->
      <canvas
        :ref="setSelectionCanvas"
        class="viewport-img selection-overlay-canvas"
        :style="[imageBoxStyle, { display: (activeTool === 'select' && (hasSelection || isSelecting)) ? 'block' : 'none' }]"
      ></canvas>

      <!-- Global Cutout Marching Ants Outline Canvas. Inert today (see the header
           note) but pinned for the same reason, so enabling it cannot reintroduce
           the stretched-canvas bug. -->
      <canvas
        id="outlineCanvas"
        class="viewport-img outline-overlay-canvas"
        :style="[imageBoxStyle, { display: showOutline ? 'block' : 'none' }]"
      ></canvas>
    </div>

    <!-- Multi-Subject Drawer Panel Overlay -->
    <SubjectsDrawer
      :subjects="subjects"
      :open="subjectsDrawerOpen"
      @close="$emit('close-subjects')"
      @toggle="$emit('toggle-subject', $event)"
      @erase="$emit('erase-subject', $event)"
    />

    <!-- Pan Drag Overlay when activeTool === 'pan' -->
    <div
      v-if="activeTool === 'pan'"
      class="pan-interaction-surface"
      @pointerdown="$emit('pan-start', $event)"
      @pointermove="$emit('pan-move', $event)"
      @pointerup="$emit('pan-end', $event)"
      @pointerleave="$emit('pan-end', $event)"
    ></div>
  </div>
</template>

<style scoped>
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
.comparison-viewport.is-brush-active .viewport-transform-layer,
.comparison-viewport.is-select-active .viewport-transform-layer {
  transition: none;
}

/* The three pointer-capture layers (brush / select / pan) share one box; they
   differ only in cursor and stacking.
   The brush layer is positioned over the image's rendered box rather than the
   whole viewport, so the pointer maths sees the same letterboxed geometry the
   <img> uses and a stroke lands under the cursor. */
.brush-interaction-surface,
.selection-interaction-surface,
.pan-interaction-surface {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 25;
  touch-action: none;
}

.brush-interaction-surface,
.selection-interaction-surface {
  cursor: crosshair;
}

.pan-interaction-surface {
  cursor: grab;
  z-index: 26;
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

/* Dotted selection overlay + the inert contour outline. Both are full-surface
   canvases drawn above the interaction layers; the outline is unreachable today
   (see AGENTS.md known issues). */
.selection-overlay-canvas,
.outline-overlay-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 26;
}
</style>
