<script setup>
import { ref } from 'vue'
import {
  Sparkles,
  ArrowLeft,
  Download,
  Check,
  ShieldAlert,
  ExternalLink,
  ChevronRight
} from 'lucide-vue-next'
// The three largest blocks of this modal's markup each carry their own scoped
// CSS, which is what made this file 1000 lines. They are ordinary static imports
// (not defineAsyncComponent): the modal itself is already lazy-loaded by App.vue,
// and the children are pure markup, so a second dynamic-import boundary would
// only add a waterfall without shrinking the initial bundle.
import ShowcaseSliderStage from './ShowcaseSliderStage.vue'
import ShowcaseDiagnosis from './ShowcaseDiagnosis.vue'
import ShowcaseGallery from './ShowcaseGallery.vue'

// `open-in-studio` was declared here and never emitted - no `emit('open-in-studio')`
// call ever existed, so removing it cannot change behaviour. It is gone because
// the declaration misled readers into thinking a caller existed. The intent (jump
// from a showcase cutout into the studio) is still unimplemented; if it is built,
// declare the event then, together with the listener.
const emit = defineEmits(['back'])

const baseUrl = import.meta.env.BASE_URL || './'

const activeModel = ref('rmbg') // 'rmbg' | 'isnet' | 'modnet'
const sliderPos = ref(50)
const backdropBg = ref('checkerboard') // 'checkerboard' | 'white' | 'dark'

const modelsData = {
  rmbg: {
    id: 'briaai/RMBG-1.4',
    name: 'BRIA RMBG-1.4',
    badge: 'Recommended · SOTA',
    badgeClass: 'badge-recommended',
    architecture: 'Segformer / BiSeNet Backbone (43 MB)',
    rating: '9.8 / 10',
    executionTime: '~6.8s (WASM SIMD) / ~1.8s (WebGPU)',
    cutoutSrc: `${baseUrl}giselle-rmbg.png`,
    pros: [
      'Preserves complete seated body pose with zero gaps',
      'Flawless separation of oversized grey sweatpants and denim boots',
      'Accurate hair wisps, cap rim, sunglasses, and hands',
      'Extremely clean edge boundaries without metallic wall bleed'
    ],
    cons: [
      'Slightly higher compute requirement than MODNet'
    ],
    summary: 'The top-tier choice for general e-commerce, complex fashion poses, and challenging studio photography. Completely preserved Giselle’s whole outfit and background elevator walls.'
  },
  isnet: {
    id: 'onnx-community/ISNet-ONNX',
    name: 'DIS / IS-Net',
    badge: 'High-Precision Salient (42 MB)',
    badgeClass: 'badge-precision',
    architecture: 'Dichotomous Image Segmentation (U-Net DIS)',
    rating: '8.7 / 10',
    executionTime: '~2.8s (WASM SIMD) / ~0.9s (WebGPU)',
    cutoutSrc: `${baseUrl}giselle-isnet.png`,
    pros: [
      'Very fast and memory-efficient (zero WASM memory leaks)',
      'Sharp face, hair, cap, and boot contours',
      'Great separation between high-contrast subjects and backgrounds'
    ],
    cons: [
      'Minor softening on low-contrast light grey fabric against reflective stainless steel',
      'Lower torso fabric exhibits partial transparency without tuning'
    ],
    summary: 'A fast, lightweight salient object segmentation model. Ideal for snappy workflows and devices with constrained RAM.'
  },
  modnet: {
    id: 'Xenova/modnet',
    name: 'MODNet',
    badge: 'Portrait Matting (20 MB)',
    badgeClass: 'badge-portrait',
    architecture: 'Objective-Decomposed Portrait Matting',
    rating: '7.0 / 10 (Pose Dependent)',
    executionTime: '~4.5s (WASM SIMD) / ~0.7s (WebGPU)',
    cutoutSrc: `${baseUrl}giselle-modnet.png`,
    pros: [
      'Ultra-lightweight (only 20 MB download)',
      'Clean alpha gradient along hair strands and head silhouette',
      'Runs quickly on low-end CPUs'
    ],
    cons: [
      'Trained strictly on upright human portraits; misses torso/lower body in sitting/non-standard poses',
      'Split subjects detected due to occlusion'
    ],
    summary: 'Specialized for webcam, passport, and upright head-and-shoulder portrait photography. For full-body sitting fashion shots, RMBG-1.4 or IS-Net is recommended.'
  }
}

function downloadCutout(modelKey) {
  const m = modelsData[modelKey]
  const a = document.createElement('a')
  a.href = m.cutoutSrc
  a.download = `giselle-${modelKey}-cutout.png`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
</script>

<template>
  <div class="showcase-page">
    <!-- Showcase Header -->
    <div class="showcase-header">
      <div class="header-left">
        <button class="btn-back" @click="emit('back')">
          <ArrowLeft :size="16" />
          <span>Back to PureCut Studio</span>
        </button>
        <div class="header-divider"></div>
        <div class="showcase-title-box">
          <div class="showcase-tag">
            <Sparkles :size="12" /> Model Showcase
          </div>
          <h2>Input vs. Output Comparison Showcase</h2>
        </div>
      </div>

      <div class="header-right">
        <div class="backdrop-picker">
          <span class="picker-label">Backdrop:</span>
          <button
            :class="['btn-bg-choice', { active: backdropBg === 'checkerboard' }]"
            @click="backdropBg = 'checkerboard'"
          >
            Grid
          </button>
          <button
            :class="['btn-bg-choice', { active: backdropBg === 'white' }]"
            @click="backdropBg = 'white'"
          >
            White
          </button>
          <button
            :class="['btn-bg-choice', { active: backdropBg === 'dark' }]"
            @click="backdropBg = 'dark'"
          >
            Dark
          </button>
        </div>
      </div>
    </div>

    <!-- Main Comparison Workspace -->
    <div class="showcase-content">
      <!-- Top: Model Switcher Pills -->
      <div class="model-selector-nav">
        <button
          v-for="(meta, key) in modelsData"
          :key="key"
          :class="['model-nav-btn', { active: activeModel === key }]"
          @click="activeModel = key"
        >
          <span class="model-nav-name">{{ meta.name }}</span>
          <span :class="['model-nav-badge', meta.badgeClass]">{{ meta.badge }}</span>
        </button>
      </div>

      <!-- Center Split: Interactive Comparison Stage + Model Diagnosis Card -->
      <div class="stage-grid">
        <!-- Interactive Split Slider Viewport -->
        <ShowcaseSliderStage
          v-model="sliderPos"
          :base-url="baseUrl"
          :backdrop-bg="backdropBg"
          :active-model="activeModel"
          :model="modelsData[activeModel]"
          @download="downloadCutout(activeModel)"
        />

        <!-- Right Side: Model Scorecard & Diagnosis -->
        <ShowcaseDiagnosis :model="activeModel" :models-data="modelsData" />
      </div>

      <!-- Bottom: Side-by-Side 4-Column Gallery Comparison -->
      <ShowcaseGallery
        :active-model="activeModel"
        :backdrop-bg="backdropBg"
        :base-url="baseUrl"
        :models-data="modelsData"
        @select="activeModel = $event"
      />
    </div>
  </div>
</template>

<style scoped>
.showcase-page {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: #080c14;
  color: #f1f5f9;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

/* Header */
.showcase-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.5rem;
  background: #0d1322;
  border-bottom: 1px solid #1e293b;
  position: sticky;
  top: 0;
  z-index: 50;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.btn-back {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0.45rem 0.85rem;
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-back:hover {
  background: #334155;
  color: #fff;
  border-color: #475569;
}

.header-divider {
  width: 1px;
  height: 24px;
  background: #1e293b;
}

.showcase-title-box {
  display: flex;
  flex-direction: column;
}

.showcase-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.7rem;
  font-weight: 600;
  color: #38bdf8;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.showcase-title-box h2 {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0;
  color: #f8fafc;
}

.backdrop-picker {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: #131d31;
  padding: 0.25rem 0.4rem;
  border-radius: 8px;
  border: 1px solid #1e293b;
}

.picker-label {
  font-size: 0.75rem;
  color: #94a3b8;
  padding-left: 0.3rem;
}

.btn-bg-choice {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.6rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-bg-choice.active {
  background: #3b82f6;
  color: #fff;
}

/* Content Container */
.showcase-content {
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Model Selector Pills */
.model-selector-nav {
  display: flex;
  gap: 0.75rem;
}

.model-nav-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 10px;
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.2s ease;
}

.model-nav-btn:hover {
  border-color: #334155;
  background: #131d31;
}

.model-nav-btn.active {
  background: #172554;
  border-color: #3b82f6;
  color: #fff;
  box-shadow: 0 0 15px rgba(59, 130, 246, 0.2);
}

.model-nav-name {
  font-weight: 600;
  font-size: 0.95rem;
}

.model-nav-badge {
  font-size: 0.7rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
}

.badge-recommended {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.badge-precision {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.4);
}

.badge-portrait {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
  border: 1px solid rgba(168, 85, 247, 0.4);
}

/*
 * The two-column stage layout. This rule belongs to the HOST, not to
 * ShowcaseSliderStage: it lays out that child's root element AND the
 * ShowcaseDiagnosis sibling, so a scoped copy inside either child could not
 * match both. (It lived in the stage block of the old single-file modal, which
 * is why it looks like it belongs there.)
 */
.stage-grid {
  display: grid;
  grid-template-columns: 1fr 420px;
  gap: 1.5rem;
}

@media (max-width: 1024px) {
  .stage-grid {
    grid-template-columns: 1fr;
  }
}

</style>
