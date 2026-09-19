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
 * Everything it shows arrives as a prop and every interaction leaves as an emit,
 * which keeps App.vue the single owner of the state:
 *  - `sliderPosition` is two-way via `update:sliderPosition`. The split slider
 *    has always been a plain `v-model` (no `.number`), so a dragged value is a
 *    STRING in App.vue and is only coerced where it is interpolated. The emit
 *    passes the raw value through to keep that exact behaviour.
 *  - the two canvases are owned by App.vue (`useCompositor` reads the display
 *    canvas, `useSelectionOverlay` the selection canvas) and cannot be reached
 *    from here, so App.vue hands down STABLE function refs.
 *  - the drawer and the zoom toolbar are rendered here, with their props and
 *    emits forwarded from App.vue.
 *
 * `#outlineCanvas` is unreachable today - nothing ever sets `showOutline` to true
 * (see AGENTS.md known issues). It is carried over as-is.
 *
 * Extracted verbatim (markup + its scoped CSS) from App.vue's template during the
 * AI-context refactor; no behaviour was changed.
 */
import ZoomToolbar from './ZoomToolbar.vue'
import SubjectsDrawer from './SubjectsDrawer.vue'

defineProps({
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

defineEmits([
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
</script>

<template>
  <div
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

      <!-- Live GPU-composited display canvas (used during brush mode for real-time preview) -->
      <canvas
        v-if="activeTool === 'brush' && resultUrl"
        :ref="setDisplayCanvas"
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
          :value="sliderPosition"
          @input="$emit('update:sliderPosition', $event.target.value)"
          class="range-overlay"
          aria-label="Before/After Split Slider"
        />
      </template>

      <!-- MODE 2: Magic Brush Interactive Painting Layer -->
      <template v-else-if="activeTool === 'brush'">
        <div
          class="brush-interaction-surface"
          @pointerdown="$emit('brush-down', $event)"
          @pointermove="$emit('brush-move', $event)"
          @pointerup="$emit('brush-up', $event)"
          @pointerleave="$emit('brush-up', $event)"
        >
          <div class="brush-cursor-guide"></div>
        </div>
      </template>

      <!-- MODE 3: Dotted Marquee Selection Interactive Layer -->
      <template v-else-if="activeTool === 'select'">
        <div
          class="selection-interaction-surface"
          @pointerdown="$emit('select-down', $event)"
          @pointermove="$emit('select-move', $event)"
          @pointerup="$emit('select-up', $event)"
          @pointerleave="$emit('select-up', $event)"
        ></div>
      </template>

      <!-- Dotted Marching Ants Selection Overlay Canvas (always rendered on top when selection is active) -->
      <canvas
        :ref="setSelectionCanvas"
        class="viewport-img selection-overlay-canvas"
        :style="{ display: (activeTool === 'select' && (hasSelection || isSelecting)) ? 'block' : 'none' }"
      ></canvas>

      <!-- Global Cutout Marching Ants Outline Canvas -->
      <canvas
        id="outlineCanvas"
        class="viewport-img outline-overlay-canvas"
        :style="{ display: showOutline ? 'block' : 'none' }"
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

/* Dotted Selection Surface & Canvas */
.selection-interaction-surface {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  z-index: 25;
  touch-action: none;
}

.selection-overlay-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 26;
}
</style>
