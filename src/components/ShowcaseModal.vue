<script setup>
import { ref } from 'vue'
import {
  Sparkles,
  ArrowLeft,
  SplitSquareVertical,
  Layers,
  Zap,
  Download,
  Check,
  ShieldAlert,
  Info,
  ExternalLink,
  ChevronRight
} from 'lucide-vue-next'

const emit = defineEmits(['back', 'open-in-studio'])

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
    cutoutSrc: '/giselle-rmbg.png',
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
    cutoutSrc: '/giselle-isnet.png',
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
    cutoutSrc: '/giselle-modnet.png',
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
              :src="modelsData[activeModel].cutoutSrc"
              alt="Model Cutout Result"
              class="viewport-media cutout-layer"
            />

            <!-- Clipped Original Image (Layer 1) -->
            <div
              class="clipped-original-wrapper"
              :style="{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }"
            >
              <img
                src="/giselle-original.jpg"
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
              {{ modelsData[activeModel].name }} Cutout
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
            <button class="btn-download-cutout" @click="downloadCutout(activeModel)">
              <Download :size="14" /> Download This Cutout PNG
            </button>
          </div>
        </div>

        <!-- Right Side: Model Scorecard & Diagnosis -->
        <div class="model-diagnosis-card">
          <div class="diagnosis-header">
            <div>
              <h3>{{ modelsData[activeModel].name }}</h3>
              <p class="model-arch">{{ modelsData[activeModel].architecture }}</p>
            </div>
            <div class="score-badge">
              <span class="score-title">Pose Score</span>
              <span class="score-val">{{ modelsData[activeModel].rating }}</span>
            </div>
          </div>

          <div class="diagnosis-body">
            <div class="telemetry-row">
              <div class="tele-item">
                <span class="tele-label">Typical Latency</span>
                <span class="tele-val">{{ modelsData[activeModel].executionTime }}</span>
              </div>
              <div class="tele-item">
                <span class="tele-label">RAM Heap Peak</span>
                <span class="tele-val">~180 MB (Protected)</span>
              </div>
            </div>

            <div class="eval-section">
              <h4>Cutout Analysis on Test Pose</h4>
              <p class="summary-text">{{ modelsData[activeModel].summary }}</p>
            </div>

            <div class="eval-section">
              <h4>Key Strengths</h4>
              <ul class="eval-list pros">
                <li v-for="(pro, i) in modelsData[activeModel].pros" :key="i">
                  <Check :size="13" />
                  <span>{{ pro }}</span>
                </li>
              </ul>
            </div>

            <div class="eval-section" v-if="modelsData[activeModel].cons.length">
              <h4>Limitations</h4>
              <ul class="eval-list cons">
                <li v-for="(con, i) in modelsData[activeModel].cons" :key="i">
                  <ShieldAlert :size="13" />
                  <span>{{ con }}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom: Side-by-Side 4-Column Gallery Comparison -->
      <div class="gallery-overview-section">
        <div class="gallery-title-row">
          <div>
            <h3>All Models Side-by-Side Comparison</h3>
            <p>Direct comparison of the test photo across the input and all 3 model cutouts.</p>
          </div>
        </div>

        <div class="side-by-side-grid">
          <!-- Column 1: Original Input -->
          <div class="gallery-card original-card">
            <div class="gcard-header">
              <span class="gcard-title">Original Input Photo</span>
              <span class="gcard-tag">1080 × 1440</span>
            </div>
            <div class="gcard-media-box bg-dark">
              <img src="/giselle-original.jpg" alt="Original Giselle Photo" />
            </div>
            <div class="gcard-caption">
              Seated pose inside elevator with brushed steel walls, denim boots, and loose sweatpants.
            </div>
          </div>

          <!-- Column 2: RMBG-1.4 -->
          <div :class="['gallery-card', { highlight: activeModel === 'rmbg' }]" @click="activeModel = 'rmbg'">
            <div class="gcard-header">
              <span class="gcard-title">BRIA RMBG-1.4</span>
              <span class="gcard-tag tag-sota">SOTA Cutout</span>
            </div>
            <div :class="['gcard-media-box', `bg-${backdropBg}`]">
              <img src="/giselle-rmbg.png" alt="RMBG-1.4 Cutout" />
            </div>
            <div class="gcard-caption">
              <strong>100% full pose preserved</strong>: Boots, pants, black long-sleeve, hair strands, and cap.
            </div>
          </div>

          <!-- Column 3: IS-Net -->
          <div :class="['gallery-card', { highlight: activeModel === 'isnet' }]" @click="activeModel = 'isnet'">
            <div class="gcard-header">
              <span class="gcard-title">DIS / IS-Net</span>
              <span class="gcard-tag tag-isnet">Salient Cutout</span>
            </div>
            <div :class="['gcard-media-box', `bg-${backdropBg}`]">
              <img src="/giselle-isnet.png" alt="IS-Net Cutout" />
            </div>
            <div class="gcard-caption">
              Clean head and boot boundaries. Slight alpha feathering on grey sweatpants.
            </div>
          </div>

          <!-- Column 4: MODNet -->
          <div :class="['gallery-card', { highlight: activeModel === 'modnet' }]" @click="activeModel = 'modnet'">
            <div class="gcard-header">
              <span class="gcard-title">MODNet</span>
              <span class="gcard-tag tag-modnet">Portrait Matting</span>
            </div>
            <div :class="['gcard-media-box', `bg-${backdropBg}`]">
              <img src="/giselle-modnet.png" alt="MODNet Cutout" />
            </div>
            <div class="gcard-caption">
              Portrait model captures upper face and lower boots; torso omitted due to pose orientation.
            </div>
          </div>
        </div>
      </div>
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

/* Stage Grid */
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

/* Right Diagnosis Card */
.model-diagnosis-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.diagnosis-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 1px solid #1e293b;
  padding-bottom: 1rem;
}

.diagnosis-header h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1.2rem;
  color: #f8fafc;
}

.model-arch {
  margin: 0;
  font-size: 0.75rem;
  color: #94a3b8;
}

.score-badge {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  background: #131d31;
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  border: 1px solid #1e293b;
}

.score-title {
  font-size: 0.65rem;
  color: #94a3b8;
  text-transform: uppercase;
  font-weight: 600;
}

.score-val {
  font-size: 1.1rem;
  font-weight: 800;
  color: #10b981;
}

.telemetry-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.tele-item {
  background: #131d31;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 0.65rem 0.75rem;
  display: flex;
  flex-direction: column;
}

.tele-label {
  font-size: 0.7rem;
  color: #64748b;
  margin-bottom: 0.2rem;
}

.tele-val {
  font-size: 0.85rem;
  font-weight: 600;
  color: #e2e8f0;
}

.eval-section h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
}

.summary-text {
  margin: 0;
  font-size: 0.85rem;
  color: #cbd5e1;
  line-height: 1.5;
}

.eval-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.eval-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.82rem;
  line-height: 1.4;
}

.eval-list.pros li {
  color: #e2e8f0;
}

.eval-list.pros svg {
  color: #10b981;
  flex-shrink: 0;
  margin-top: 2px;
}

.eval-list.cons li {
  color: #e2e8f0;
}

.eval-list.cons svg {
  color: #f59e0b;
  flex-shrink: 0;
  margin-top: 2px;
}

/* 4-Column Side-by-Side Gallery */
.gallery-overview-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}

.gallery-title-row h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1.15rem;
  color: #f8fafc;
}

.gallery-title-row p {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

.side-by-side-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}

@media (max-width: 900px) {
  .side-by-side-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

.gallery-card {
  background: #0f172a;
  border: 1px solid #1e293b;
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: all 0.2s ease;
}

.gallery-card:hover {
  border-color: #334155;
  transform: translateY(-2px);
}

.gallery-card.highlight {
  border-color: #3b82f6;
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.25);
}

.gcard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.65rem 0.85rem;
  background: #131d31;
  border-bottom: 1px solid #1e293b;
}

.gcard-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: #f1f5f9;
}

.gcard-tag {
  font-size: 0.68rem;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  background: #1e293b;
  color: #94a3b8;
}

.tag-sota {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.tag-isnet {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
}

.tag-modnet {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
}

.gcard-media-box {
  width: 100%;
  height: 320px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.gcard-media-box img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.gcard-caption {
  padding: 0.75rem 0.85rem;
  font-size: 0.78rem;
  color: #94a3b8;
  line-height: 1.4;
  border-top: 1px solid #1e293b;
  background: #0d1322;
}

.gcard-caption strong {
  color: #e2e8f0;
}
</style>
