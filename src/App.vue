<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { removeBackground } from '@imgly/background-removal'
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
  Image as ImageIcon
} from 'lucide-vue-next'

// State
const originalUrl = ref(null)
const resultUrl = ref(null)
const resultBlob = ref(null)
const fileName = ref('')
const fileSize = ref('')
const imageDimensions = ref({ width: 0, height: 0 })
const isProcessing = ref(false)
const statusMessage = ref('')
const progressPercent = ref(0)
const processingTime = ref(null)
const sliderPosition = ref(50)
const previewBg = ref('checkerboard') // 'checkerboard', 'white', 'black', 'gradient'
const copied = ref(false)
const fileInput = ref(null)

// Format file size
function formatBytes(bytes, decimals = 1) {
  if (!bytes) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

// Process Image
async function processImage(file) {
  if (!file || !file.type.startsWith('image/')) return

  fileName.value = file.name || 'image.png'
  fileSize.value = formatBytes(file.size)
  originalUrl.value = URL.createObjectURL(file)
  resultUrl.value = null
  resultBlob.value = null
  isProcessing.value = true
  progressPercent.value = 0
  statusMessage.value = 'Preparing image...'
  const startTime = performance.now()

  // Calculate image dimensions
  const img = new Image()
  img.onload = () => {
    imageDimensions.value = { width: img.naturalWidth, height: img.naturalHeight }
  }
  img.src = originalUrl.value

  try {
    const blob = await removeBackground(file, {
      progress: (key, current, total) => {
        if (key.includes('fetch')) {
          const pct = Math.min(100, Math.round((current / total) * 100) || 0)
          progressPercent.value = pct
          statusMessage.value = `Downloading AI model weights (${pct}%)...`
        } else {
          progressPercent.value = 100
          statusMessage.value = 'Extracting subject from background...'
        }
      }
    })

    resultBlob.value = blob
    resultUrl.value = URL.createObjectURL(blob)
    const endTime = performance.now()
    processingTime.value = ((endTime - startTime) / 1000).toFixed(1)
  } catch (error) {
    console.error('Processing error:', error)
    alert('Failed to remove background. Please try another image.')
  } finally {
    isProcessing.value = false
  }
}

// File picker handler
function onFileSelect(e) {
  const file = e.target.files?.[0]
  if (file) processImage(file)
}

// Drag & drop handler
function onDrop(e) {
  const file = e.dataTransfer.files?.[0]
  if (file) processImage(file)
}

// Paste handler (Ctrl+V / Cmd+V)
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

// Copy to clipboard
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

// Reset workspace
function reset() {
  originalUrl.value = null
  resultUrl.value = null
  resultBlob.value = null
  fileName.value = ''
  fileSize.value = ''
  processingTime.value = null
  sliderPosition.value = 50
  statusMessage.value = ''
}

onMounted(() => window.addEventListener('paste', onPaste))
onUnmounted(() => window.removeEventListener('paste', onPaste))
</script>

<template>
  <div class="app-shell">
    <!-- Navbar -->
    <header class="navbar">
      <div class="brand">
        <div class="brand-icon">
          <Sparkles :size="20" />
        </div>
        <span class="brand-name">Pure<span>Cut</span></span>
      </div>
      <div class="nav-pills">
        <span class="pill-secure"><ShieldCheck :size="14" /> 100% In-Browser & Private</span>
        <span class="pill-free"><Zap :size="14" /> Free · No Limits</span>
      </div>
    </header>

    <main class="main-content">
      <!-- Upload Dropzone View -->
      <section v-if="!originalUrl" class="hero-section">
        <div class="hero-badge">
          <Sparkles :size="14" />
          <span>Next-Gen Client-Side AI Removal</span>
        </div>

        <h1 class="hero-title">
          Isolate subjects.<br />
          <span class="gradient-text">Vanish backgrounds.</span>
        </h1>
        <p class="hero-subtitle">
          Instantly cutout portraits, products, and graphics. Your images stay strictly on your device.
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
            <UploadCloud :size="38" />
          </div>

          <div class="drop-text">
            <h3>Choose a photo or drag it here</h3>
            <p>Supports JPG, PNG, and WebP up to 30 MB</p>
          </div>

          <button type="button" class="btn-cta">
            <UploadCloud :size="18" /> Select Photo
          </button>

          <div class="paste-hint">
            or press <kbd>Ctrl</kbd> + <kbd>V</kbd> to paste from clipboard
          </div>
        </div>
      </section>

      <!-- Processing & Workspace View -->
      <section v-else class="workspace-section">
        <!-- Loading State -->
        <div v-if="isProcessing" class="loading-container">
          <div class="spinner-ring"></div>
          <h3 class="loading-title">{{ statusMessage }}</h3>
          <p class="loading-sub">
            The AI runs directly in your browser without uploading to any server.
          </p>
          <div class="progress-track" v-if="progressPercent > 0 && progressPercent < 100">
            <div class="progress-bar" :style="{ width: `${progressPercent}%` }"></div>
          </div>
        </div>

        <!-- Result / Comparison Screen -->
        <div v-else class="result-workspace">
          <!-- Top Info Bar -->
          <div class="info-bar">
            <div class="info-meta">
              <span class="file-tag"><ImageIcon :size="14" /> {{ fileName }}</span>
              <span v-if="imageDimensions.width" class="dim-tag">
                {{ imageDimensions.width }} × {{ imageDimensions.height }}px
              </span>
              <span v-if="processingTime" class="time-tag">
                ⚡ Processed in {{ processingTime }}s
              </span>
            </div>

            <!-- Background Backdrop Selector -->
            <div class="bg-selector">
              <span class="bg-selector-label"><SlidersHorizontal :size="13" /> Backdrop:</span>
              <button
                :class="['bg-btn', { active: previewBg === 'checkerboard' }]"
                @click="previewBg = 'checkerboard'"
                title="Transparent Checkerboard"
              >
                Grid
              </button>
              <button
                :class="['bg-btn', { active: previewBg === 'white' }]"
                @click="previewBg = 'white'"
                title="White Backdrop"
              >
                White
              </button>
              <button
                :class="['bg-btn', { active: previewBg === 'black' }]"
                @click="previewBg = 'black'"
                title="Dark Backdrop"
              >
                Dark
              </button>
              <button
                :class="['bg-btn', { active: previewBg === 'gradient' }]"
                @click="previewBg = 'gradient'"
                title="Gradient Backdrop"
              >
                Color
              </button>
            </div>
          </div>

          <!-- Comparison Viewport -->
          <div :class="['comparison-viewport', `bg-${previewBg}`]">
            <!-- Result Layer (Bottom) -->
            <img
              v-if="resultUrl"
              :src="resultUrl"
              alt="Transparent Cutout"
              class="viewport-img result-img"
              draggable="false"
            />

            <!-- Original Layer (Clipped Top) -->
            <div
              class="clipped-layer"
              :style="{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }"
            >
              <img
                :src="originalUrl"
                alt="Original Photo"
                class="viewport-img original-img"
                draggable="false"
              />
            </div>

            <!-- Badges -->
            <div class="badge-label before-badge" :style="{ opacity: sliderPosition > 15 ? 1 : 0 }">
              Original
            </div>
            <div class="badge-label after-badge" :style="{ opacity: sliderPosition < 85 ? 1 : 0 }">
              Cutout
            </div>

            <!-- Split Divider Line -->
            <div class="slider-divider" :style="{ left: `${sliderPosition}%` }">
              <div class="slider-thumb">
                <span>◀ ▶</span>
              </div>
            </div>

            <!-- Slider Control Range Input -->
            <input
              type="range"
              min="0"
              max="100"
              v-model="sliderPosition"
              class="range-overlay"
              aria-label="Before/After Split Comparison"
            />
          </div>

          <!-- Actions Bar -->
          <div class="action-bar">
            <button class="btn-secondary" @click="reset">
              <RotateCcw :size="16" /> New Photo
            </button>

            <button class="btn-secondary" @click="copyToClipboard" :disabled="!resultBlob">
              <component :is="copied ? Check : Copy" :size="16" />
              {{ copied ? 'Copied PNG!' : 'Copy Cutout' }}
            </button>

            <a
              v-if="resultUrl"
              :href="resultUrl"
              :download="`purecut_${fileName.replace(/\.[^/.]+$/, '')}.png`"
              class="btn-cta"
            >
              <Download :size="18" /> Download High-Res PNG
            </a>
          </div>
        </div>
      </section>
    </main>

    <!-- Footer -->
    <footer class="footer">
      <span>PureCut Studio · Runs 100% on device · Zero server uploads</span>
    </footer>
  </div>
</template>

<style>
/* Global resets */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: #0b0f19;
  color: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  min-height: 100vh;
}
</style>

<style scoped>
.app-shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: radial-gradient(circle at 50% 0%, #1e1b4b 0%, #0b0f19 50%, #060911 100%);
  color: #f1f5f9;
}

/* Navbar */
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 32px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  backdrop-filter: blur(12px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-icon {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.4);
}

.brand-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.5px;
}

.brand-name span {
  color: #818cf8;
}

.nav-pills {
  display: flex;
  gap: 10px;
}

.pill-secure, .pill-free {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 6px 12px;
  border-radius: 9999px;
  font-weight: 500;
}

.pill-secure {
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.pill-free {
  background: rgba(99, 102, 241, 0.12);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.25);
}

/* Main Content */
.main-content {
  flex: 1;
  max-width: 960px;
  width: 100%;
  margin: 0 auto;
  padding: 48px 24px;
}

/* Hero Section */
.hero-section {
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.3);
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 24px;
}

.hero-title {
  font-size: 52px;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -1.5px;
  margin-bottom: 16px;
}

.gradient-text {
  background: linear-gradient(135deg, #a5b4fc 0%, #c084fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subtitle {
  font-size: 18px;
  color: #94a3b8;
  max-width: 580px;
  margin-bottom: 40px;
  line-height: 1.5;
}

/* Dropzone Card */
.dropzone-card {
  width: 100%;
  max-width: 680px;
  background: rgba(30, 41, 59, 0.5);
  border: 2px dashed rgba(148, 163, 184, 0.25);
  border-radius: 24px;
  padding: 56px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: all 0.25s ease;
  backdrop-filter: blur(8px);
}

.dropzone-card:hover {
  border-color: #818cf8;
  background: rgba(30, 41, 59, 0.75);
  transform: translateY(-2px);
  box-shadow: 0 12px 32px -8px rgba(99, 102, 241, 0.25);
}

.drop-icon-wrapper {
  width: 72px;
  height: 72px;
  background: rgba(99, 102, 241, 0.15);
  color: #818cf8;
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.drop-text h3 {
  font-size: 19px;
  font-weight: 600;
  margin-bottom: 6px;
}

.drop-text p {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 24px;
}

.paste-hint {
  margin-top: 18px;
  font-size: 13px;
  color: #64748b;
}

kbd {
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 4px;
  padding: 3px 7px;
  font-size: 11px;
  color: #cbd5e1;
}

.sr-only {
  display: none;
}

/* CTA Buttons */
.btn-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  border: none;
  padding: 13px 28px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  box-shadow: 0 4px 16px rgba(99, 102, 241, 0.35);
  transition: all 0.2s ease;
}

.btn-cta:hover {
  opacity: 0.95;
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.45);
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 12px 20px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.14);
}

/* Loading State */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 24px;
  text-align: center;
}

.spinner-ring {
  width: 56px;
  height: 56px;
  border: 4px solid rgba(99, 102, 241, 0.2);
  border-top-color: #818cf8;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
  margin-bottom: 24px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-title {
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 8px;
}

.loading-sub {
  font-size: 14px;
  color: #94a3b8;
  max-width: 440px;
  margin-bottom: 24px;
}

.progress-track {
  width: 100%;
  max-width: 380px;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #c084fc);
  transition: width 0.3s ease;
}

/* Workspace Result */
.result-workspace {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.info-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.info-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #94a3b8;
}

.file-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #f1f5f9;
  font-weight: 500;
}

.dim-tag, .time-tag {
  background: rgba(255, 255, 255, 0.06);
  padding: 3px 8px;
  border-radius: 6px;
}

.time-tag {
  color: #34d399;
}

.bg-selector {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bg-selector-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #64748b;
  margin-right: 4px;
}

.bg-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.bg-btn.active {
  background: #6366f1;
  color: white;
  border-color: #6366f1;
}

/* Comparison Viewport */
.comparison-viewport {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  max-height: 520px;
  border-radius: 18px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

/* Preview background types */
.bg-checkerboard {
  background-color: #1e293b;
  background-image: linear-gradient(45deg, #0f172a 25%, transparent 25%),
                    linear-gradient(-45deg, #0f172a 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #0f172a 75%),
                    linear-gradient(-45deg, transparent 75%, #0f172a 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
}

.bg-white {
  background-color: #ffffff;
}

.bg-black {
  background-color: #05070d;
}

.bg-gradient {
  background: linear-gradient(135deg, #4f46e5 0%, #ec4899 100%);
}

.viewport-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
}

.clipped-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* Badges */
.badge-label {
  position: absolute;
  top: 14px;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
  pointer-events: none;
  backdrop-filter: blur(8px);
  transition: opacity 0.2s;
  z-index: 5;
}

.before-badge {
  left: 14px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.after-badge {
  right: 14px;
  background: rgba(99, 102, 241, 0.7);
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

/* Divider & Slider */
.slider-divider {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: #ffffff;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.6);
  pointer-events: none;
  z-index: 10;
}

.slider-thumb {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 38px;
  height: 38px;
  background: #ffffff;
  color: #1e1b4b;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 800;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
}

.range-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: ew-resize;
  margin: 0;
  z-index: 20;
}

/* Actions bar */
.action-bar {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
}

/* Footer */
.footer {
  text-align: center;
  padding: 24px;
  font-size: 13px;
  color: #64748b;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}
</style>
