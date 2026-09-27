<script setup>
import { nextTick, ref } from 'vue'
import {
  Sparkles,
  ArrowLeft,
  ChevronLeft,
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
import FontSizeButton from './FontSizeButton.vue'

// The showcase is a fixed full-screen page rendered OUTSIDE `.app-shell`, so it
// does not inherit the shell's zoom. It needs its own font-scale affordance
// (rendered in the header, top right) and the `fontSize` prop to feed it; the
// cycle itself is re-emitted to App.vue, which owns `useDisplayScale`.
defineProps({
  /** 'compact' | 'normal' | 'medium' | 'large' - drives the size badge. */
  fontSize: { type: String, default: 'normal' }
})

// `open-in-studio` was declared here and never emitted - no `emit('open-in-studio')`
// call ever existed, so removing it cannot change behaviour. It is gone because
// the declaration misled readers into thinking a caller existed. The intent (jump
// from a showcase cutout into the studio) is still unimplemented; if it is built,
// declare the event then, together with the listener.
const emit = defineEmits(['back', 'cycle-font-size'])

const baseUrl = import.meta.env.BASE_URL || './'

const activeModel = ref('rmbg') // 'rmbg' | 'isnet' | 'modnet' | 'birefnet'
const activeExhibit = ref('winter')
const sliderPos = ref(50)
const backdropBg = ref('checkerboard') // 'checkerboard' | 'white' | 'dark'
const modelStrip = ref(null)

const modelsData = {
  rmbg: {
    id: 'briaai/RMBG-1.4',
    name: 'BRIA RMBG-1.4',
    badge: 'Recommended · SOTA',
    badgeClass: 'badge-recommended',
    architecture: 'Segformer / BiSeNet Backbone (43 MB)',
    rating: '9.8 / 10',
    memoryProfile: '~180 MB protected WASM heap',
    cutoutSrc: `${baseUrl}giselle-rmbg-tta.png`,
    pros: [
      'Preserves complete seated body pose with zero gaps',
      'Flawless separation of oversized grey sweatpants and denim boots',
      'Accurate hair wisps, cap rim, sunglasses, and hands',
      'Extremely clean edge boundaries without metallic wall bleed'
    ],
    cons: []
  },
  isnet: {
    id: 'onnx-community/ISNet-ONNX',
    name: 'DIS / IS-Net',
    badge: 'High-Precision Salient (42 MB)',
    badgeClass: 'badge-precision',
    architecture: 'Dichotomous Image Segmentation (U-Net DIS)',
    rating: '8.7 / 10',
    memoryProfile: 'Lightweight browser WASM workload',
    cutoutSrc: `${baseUrl}giselle-isnet-tta.png`,
    pros: [
      'Very fast and memory-efficient (zero WASM memory leaks)',
      'Sharp face, hair, cap, and boot contours',
      'Great separation between high-contrast subjects and backgrounds'
    ],
    cons: []
  },
  modnet: {
    id: 'Xenova/modnet',
    name: 'MODNet',
    badge: 'Portrait Matting (20 MB)',
    badgeClass: 'badge-portrait',
    architecture: 'Objective-Decomposed Portrait Matting',
    rating: '7.0 / 10 (Pose Dependent)',
    memoryProfile: 'Smallest model; suited to modest devices',
    cutoutSrc: `${baseUrl}giselle-modnet-tta.png`,
    pros: [
      'Ultra-lightweight (only 20 MB download)',
      'Clean alpha gradient along hair strands and head silhouette',
      'Runs quickly on low-end CPUs'
    ],
    cons: []
  },
  birefnet: {
    id: 'onnx-community/BiRefNet_512x512-ONNX',
    name: 'BiRefNet 512',
    badge: 'Highest Quality · CPU WASM',
    badgeClass: 'badge-quality',
    architecture: 'BiRefNet 512 × 512 · Two-Pass TTA Flip Fusion',
    rating: '9.9 / 10',
    memoryProfile: 'Large WASM workload; allow ample free memory',
    cutoutSrc: `${baseUrl}giselle-birefnet-tta.png`,
    pros: [
      'Highest-detail TTA result in the browser model catalogue',
      'Preserves the full seated pose, including hands, hair, shoes, and clothing edges',
      'Two-pass flip fusion refines difficult asymmetric details and fine boundaries',
      'Runs fully on-device with the browser-safe 512 × 512 BiRefNet checkpoint'
    ],
    cons: []
  }
}

const exhibits = {
  winter: {
    name: 'Exhibit A: Winter',
    label: 'Original: 3024 × 4032px',
    originalSrc: `${baseUrl}Example1.jpg`,
    originalResult: 'Original Winter photograph.',
    results: {
      rmbg: 'Complete portrait with clean clothing and hair boundaries.',
      isnet: 'Strong silhouette separation with defined facial edges.',
      modnet: 'Soft portrait matte with a smooth hair outline.',
      birefnet: 'Detailed full-subject cutout with refined clothing edges.'
    },
    cutoutSources: {
      rmbg: `${baseUrl}winter-rmbg-tta.png`,
      isnet: `${baseUrl}winter-isnet-tta.png`,
      modnet: `${baseUrl}winter-modnet-tta.png`,
      birefnet: `${baseUrl}winter-birefnet-tta.png`
    }
  },
  giselle: {
    name: 'Exhibit B: Giselle',
    label: 'Original: 1080 × 1440px',
    originalSrc: `${baseUrl}giselle-original.jpg`,
    originalResult: 'Complete seated pose against a detailed elevator background.',
    results: {
      rmbg: 'Complete subject with clean clothing and accessory edges.',
      isnet: 'Strong facial and boot contours with a lighter lower-body edge.',
      modnet: 'Clean head and hair result; the seated lower body is less complete.',
      birefnet: 'Most complete full-pose result with detailed clothing boundaries.'
    },
    cutoutSources: {
      rmbg: `${baseUrl}giselle-rmbg-tta.png`,
      isnet: `${baseUrl}giselle-isnet-tta.png`,
      modnet: `${baseUrl}giselle-modnet-tta.png`,
      birefnet: `${baseUrl}giselle-birefnet-tta.png`
    }
  }
}

function scrollModels(direction) {
  modelStrip.value?.scrollBy({ left: direction * 240, behavior: 'smooth' })
}

async function selectExhibit(exhibitKey) {
  activeExhibit.value = exhibitKey
  sliderPos.value = 50
  await nextTick()
}

function downloadCutout(modelKey) {
  const cutoutSrc = exhibits[activeExhibit.value].cutoutSources[modelKey]
  if (!cutoutSrc) return
  const a = document.createElement('a')
  a.href = cutoutSrc
  a.download = `${activeExhibit.value}-${modelKey}-cutout.png`
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
          <h2><Sparkles :size="14" /> Model Showcase</h2>
        </div>
      </div>

      <div class="header-right">
        <!-- Interface font scale. The showcase sits outside the app shell, so it
             needs its own copy of this control; the click is re-emitted to App.vue. -->
        <FontSizeButton :font-size="fontSize" @cycle="emit('cycle-font-size')" />

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
      <section class="exhibit-section" aria-labelledby="exhibit-heading">
        <div class="section-heading">
          <p class="section-kicker">Choose an example</p>
          <h3 id="exhibit-heading">Exhibit</h3>
        </div>
        <div class="exhibit-toggle" role="group" aria-label="Choose a showcase exhibit">
          <button
            v-for="(exhibit, key) in exhibits"
            :key="key"
            :class="{ active: activeExhibit === key }"
            @click="selectExhibit(key)"
          >
            {{ exhibit.name }}
          </button>
        </div>
      </section>

      <section class="model-section" aria-labelledby="model-heading">
        <div class="section-heading model-heading-row">
          <div>
            <p class="section-kicker">Choose a cutout model</p>
            <h3 id="model-heading">Model</h3>
          </div>
          <div class="model-scroll-actions" aria-label="Scroll model options">
            <button title="Previous models" aria-label="Previous models" @click="scrollModels(-1)"><ChevronLeft :size="18" /></button>
            <button title="Next models" aria-label="Next models" @click="scrollModels(1)"><ChevronRight :size="18" /></button>
          </div>
        </div>
        <div ref="modelStrip" class="model-selector-nav">
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
      </section>

      <section class="comparison-section" aria-labelledby="interactive-heading">
        <div class="section-heading">
          <p class="section-kicker">Interactive comparison</p>
          <h3 id="interactive-heading">Before and after</h3>
        </div>
        <div class="stage-grid">
        <!-- Interactive Split Slider Viewport -->
        <ShowcaseSliderStage
          v-model="sliderPos"
          :base-url="baseUrl"
          :backdrop-bg="backdropBg"
          :active-model="activeModel"
          :model="modelsData[activeModel]"
          :exhibit="exhibits[activeExhibit]"
          :result-src="exhibits[activeExhibit].cutoutSources[activeModel]"
          @download="downloadCutout(activeModel)"
        />

        <!-- Right Side: Model Scorecard & Diagnosis -->
        <ShowcaseDiagnosis :model="activeModel" :models-data="modelsData" />
        </div>
      </section>

      <!-- Bottom: Side-by-Side 4-Column Gallery Comparison -->
      <ShowcaseGallery
        :active-model="activeModel"
        :backdrop-bg="backdropBg"
        :base-url="baseUrl"
        :models-data="modelsData"
        :exhibit="exhibits[activeExhibit]"
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
}

.showcase-title-box h2 {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0;
  color: #f8fafc;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.6rem;
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

.exhibit-section,
.model-section,
.comparison-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.comparison-section {
  padding-top: 1.5rem;
  border-top: 1px solid #263247;
}

.section-heading {
  display: flex;
  align-items: baseline;
  gap: 0.55rem;
}

.section-heading h3,
.section-kicker {
  margin: 0;
}

.section-heading h3 {
  color: #f8fafc;
  font-size: 1rem;
}

.section-kicker {
  color: #64748b;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.exhibit-toggle {
  display: flex;
  width: fit-content;
  padding: 0.25rem;
  gap: 0.25rem;
  border: 1px solid #1e293b;
  border-radius: 9px;
  background: #0f172a;
}

.exhibit-toggle button,
.model-scroll-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
}

.exhibit-toggle button {
  min-height: 34px;
  padding: 0.4rem 0.75rem;
}

.exhibit-toggle button:hover,
.model-scroll-actions button:hover {
  color: #f8fafc;
  background: #1e293b;
}

.exhibit-toggle button.active {
  color: #fff;
  background: #2563eb;
  box-shadow: 0 2px 8px rgba(37, 99, 235, 0.35);
}

.model-heading-row {
  justify-content: space-between;
}

.model-scroll-actions {
  display: flex;
  gap: 0.35rem;
}

.model-scroll-actions button {
  width: 32px;
  height: 32px;
  border: 1px solid #334155;
}

/* Model Selector Pills */
.model-selector-nav {
  display: flex;
  gap: 0.75rem;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  padding-bottom: 0.55rem;
  scrollbar-color: #475569 #0f172a;
  scrollbar-width: thin;
}

.model-selector-nav::-webkit-scrollbar {
  height: 8px;
}

.model-selector-nav::-webkit-scrollbar-track {
  background: #0f172a;
  border-radius: 999px;
}

.model-selector-nav::-webkit-scrollbar-thumb {
  background: #475569;
  border-radius: 999px;
}

.model-nav-btn {
  flex: 1 0 235px;
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

.badge-quality {
  background: rgba(245, 158, 11, 0.18);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.45);
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

@media (max-width: 767px) {
  .showcase-header {
    align-items: stretch;
    gap: 0.65rem;
    padding: 0.7rem 0.8rem;
  }

  .header-left {
    min-width: 0;
    gap: 0.65rem;
  }

  .btn-back {
    flex-shrink: 0;
    padding: 0.55rem;
  }

  .btn-back span,
  .header-divider,
  .picker-label,
  .header-right > .btn-font-scale {
    display: none;
  }

  .header-right {
    margin-left: auto;
  }

  .backdrop-picker {
    gap: 0.1rem;
    padding: 0.2rem;
  }

  .btn-bg-choice {
    min-height: 32px;
    padding: 0.35rem 0.5rem;
    font-size: 0.72rem;
  }

  .showcase-content {
    padding: 0.9rem;
    gap: 1rem;
  }

  .exhibit-toggle {
    width: 100%;
  }

  .exhibit-toggle button {
    flex: 1;
  }

  .model-selector-nav {
    margin: 0 -0.9rem;
    padding: 0 0.9rem;
    gap: 0.55rem;
  }

  .model-heading-row {
    align-items: flex-end;
  }

  .model-nav-btn {
    flex: 0 0 150px;
    min-height: 76px;
    align-items: flex-start;
    justify-content: center;
    flex-direction: column;
    gap: 0.45rem;
    padding: 0.7rem 0.8rem;
  }

  .model-nav-name {
    font-size: 0.84rem;
  }

  .model-nav-badge {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stage-grid {
    gap: 1rem;
  }

  .comparison-section {
    padding-top: 1rem;
  }
}

</style>
