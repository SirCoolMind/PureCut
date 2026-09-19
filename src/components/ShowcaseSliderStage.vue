<script setup>
/**
 * ShowcaseSliderStage — the interactive before/after split-comparison stage of
 * the Showcase modal, plus its action strip.
 *
 * Extracted from `ShowcaseModal.vue` (session 4) with its scoped CSS verbatim.
 * The only rewrites are mechanical: `sliderPos` is a `defineModel()` instead of
 * a host ref (so the host keeps owning the value), and the two
 * `modelsData[activeModel]` reads became the `model` prop. The markup and every
 * declaration are otherwise byte-identical, which is what the CSS-parity check
 * verifies.
 *
 * The backdrop rules (`.bg-checkerboard` / `.bg-white` / `.bg-dark`) live here
 * AND in `ShowcaseGallery.vue` on purpose: scoped styles do not cross a
 * component boundary, so each surface that paints a backdrop must carry the
 * rules it uses.
 *
 * `.stage-grid` is deliberately NOT here even though it used to sit in the same
 * block: it lays out this component's root element and the `ShowcaseDiagnosis`
 * sibling, so only the host can style it. The rule moved up to
 * `ShowcaseModal.vue`'s own style block, and a scoped copy here would be dead
 * CSS that never matches anything.
 */
import { SplitSquareVertical, Download } from 'lucide-vue-next'

defineProps({
  /** Vite BASE_URL, used to resolve the demo assets. */
  baseUrl: {
    type: String,
    required: true
  },
  /** 'checkerboard' | 'white' | 'dark' — the host's backdrop choice. */
  backdropBg: {
    type: String,
    required: true
  },
  /** Key of the model currently selected in the host: rmbg | isnet | modnet. */
  activeModel: {
    type: String,
    required: true
  },
  /** The metadata entry for `activeModel` (name, cutoutSrc, ...). */
  model: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['download'])

/** Split position, 0-100. Two-way bound: the host renders nothing from it. */
const sliderPos = defineModel({ type: Number, required: true })
</script>

<template>
        <!-- Interactive Split Slider Viewport -->
        <div class="comparison-stage-card">
          <div class="card-bar">
            <div class="card-bar-left">
              <SplitSquareVertical :size="14" />
              <span>Interactive Split Comparison (Drag or Hover slider)</span>
            </div>
            <div class="card-bar-right">
              <span class="orig-label">Original: 1080 × 1440px</span>
            </div>
          </div>

          <div :class="['slider-stage-viewport', `bg-${backdropBg}`]">
            <!-- Base Cutout Image (Layer 0) -->
            <img
              :src="model.cutoutSrc"
              alt="Model Cutout Result"
              class="viewport-media cutout-layer"
            />

            <!-- Clipped Original Image (Layer 1) -->
            <div
              class="clipped-original-wrapper"
              :style="{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }"
            >
              <img
                :src="`${baseUrl}giselle-original.jpg`"
                alt="Original Photo"
                class="viewport-media original-layer"
              />
            </div>

            <!-- Visual Divider Handle -->
            <div class="slider-divider-line" :style="{ left: `${sliderPos}%` }">
              <div class="slider-pill-handle">
                <span>◀ ▶</span>
              </div>
            </div>

            <!-- Labels -->
            <div class="stage-badge badge-orig" :style="{ opacity: sliderPos > 15 ? 1 : 0 }">
              Original Input
            </div>
            <div class="stage-badge badge-cutout" :style="{ opacity: sliderPos < 85 ? 1 : 0 }">
              {{ model.name }} Cutout
            </div>

            <!-- Native Range Overlay for Smooth Dragging -->
            <input
              type="range"
              min="0"
              max="100"
              v-model="sliderPos"
              class="slider-touch-range"
              aria-label="Before/After Split Slider"
            />
          </div>

          <!-- Bottom Action Strip -->
          <div class="stage-footer-actions">
            <div class="slider-quick-buttons">
              <button class="btn-subtle" @click="sliderPos = 0">Cutout Only</button>
              <button class="btn-subtle" @click="sliderPos = 50">50 / 50 Split</button>
              <button class="btn-subtle" @click="sliderPos = 100">Original Only</button>
            </div>
            <button class="btn-download-cutout" @click="emit('download')">
              <Download :size="14" /> Download This Cutout PNG
            </button>
          </div>
        </div>
</template>

<style scoped>
/* Comparison Stage Card */
.comparison-stage-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.card-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: #131d31;
  border-bottom: 1px solid #1e293b;
  font-size: 0.8rem;
  color: #94a3b8;
}

.card-bar-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #e2e8f0;
  font-weight: 500;
}

.slider-stage-viewport {
  position: relative;
  width: 100%;
  height: 520px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Backgrounds */
.bg-checkerboard {
  background-color: #0b0f19;
  background-image: 
    linear-gradient(45deg, #161f30 25%, transparent 25%),
    linear-gradient(-45deg, #161f30 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #161f30 75%),
    linear-gradient(-45deg, transparent 75%, #161f30 75%);
  background-size: 24px 24px;
  background-position: 0 0, 0 12px, 12px -12px, -12px 0px;
}

.bg-white {
  background: #ffffff;
}

.bg-dark {
  background: #0b0f19;
}

.viewport-media {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  user-select: none;
  pointer-events: none;
}

.clipped-original-wrapper {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.slider-divider-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #38bdf8;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 20;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.8);
}

.slider-pill-handle {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #0f172a;
  border: 2px solid #38bdf8;
  color: #38bdf8;
  border-radius: 9999px;
  padding: 0.35rem 0.6rem;
  font-size: 0.65rem;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
}

.stage-badge {
  position: absolute;
  top: 1rem;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  z-index: 20;
  pointer-events: none;
  backdrop-filter: blur(8px);
  transition: opacity 0.2s ease;
}

.badge-orig {
  left: 1rem;
  background: rgba(15, 23, 42, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e2e8f0;
}

.badge-cutout {
  right: 1rem;
  background: rgba(16, 185, 129, 0.85);
  color: #ffffff;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.slider-touch-range {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: ew-resize;
  z-index: 30;
  margin: 0;
}

/* Stage Actions */
.stage-footer-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: #0d1322;
  border-top: 1px solid #1e293b;
}

.slider-quick-buttons {
  display: flex;
  gap: 0.5rem;
}

.btn-subtle {
  background: #1e293b;
  border: 1px solid #334155;
  color: #94a3b8;
  font-size: 0.75rem;
  border-radius: 6px;
  padding: 0.35rem 0.65rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-subtle:hover {
  color: #f1f5f9;
  background: #334155;
}

.btn-download-cutout {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0.4rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-download-cutout:hover {
  background: #1d4ed8;
}
</style>
