<script setup>
/**
 * The fixed top navbar: brand + version badge + showcase button on the left, the
 * model status pill in the centre, and the browser-zoom / font-size / mode
 * controls on the right.
 *
 * Presentational: every value is a prop and every action is an emit, so App.vue
 * keeps owning the refs and the composable handlers. `appVersion` is imported
 * straight from constants.js, the way InfoModal already does.
 *
 * The centre block is ModelStatusBar.vue (its own file, because together this
 * component would have crossed the 450-line budget); the six props and three
 * emits it needs are forwarded unchanged.
 *
 * Extracted verbatim (markup + its scoped CSS) from App.vue's template during the
 * AI-context refactor; no behaviour was changed.
 */
import { Sparkles, RotateCcw, Wrench, Monitor, Settings, Type } from 'lucide-vue-next'
import { appVersion } from '../constants.js'
import ModelStatusBar from './ModelStatusBar.vue'

defineProps({
  /** True while the AI pipeline runs; disables the model picker and preload. */
  isProcessing: { type: Boolean, default: false },
  /** True while model weights are downloading. */
  isPreloading: { type: Boolean, default: false },
  /** Currently selected model id. */
  selectedModel: { type: String, required: true },
  /** Whether the current model's weights are already cached. */
  currentModelCached: { type: Boolean, default: false },
  /** Human-readable total cache size, e.g. "64.9 MB". */
  formattedCacheUsage: { type: String, default: '' },
  /** True while the storage cache is being cleared. */
  isClearingCache: { type: Boolean, default: false },
  /** Whether the browser page is zoomed away from 100%. */
  isBrowserZoomed: { type: Boolean, default: false },
  /** Detected browser zoom percentage. */
  browserZoomLevel: { type: Number, default: 100 },
  /** 'compact' | 'normal' | 'medium' | 'large' */
  fontSize: { type: String, required: true },
  /** 'standard' | 'power' */
  userMode: { type: String, required: true }
})

defineEmits([
  'model-change',
  'preload',
  'clear-cache',
  'reset-browser-zoom',
  'cycle-font-size',
  'open-info',
  'open-showcase',
  'open-settings',
  'update:userMode'
])
</script>

<template>
  <header class="navbar">
    <div class="brand">
      <div class="brand-icon">
        <img src="/purecut-icon.png" alt="PureCut" class="brand-img" />
      </div>
      <div class="brand-title">
        <span class="brand-name">Pure<span>Cut</span></span>
        <button class="version-badge" @click="$emit('open-info')" title="Version, Changelog & Roadmap">
          v{{ appVersion }}
        </button>
        <button 
          class="btn-benchmark-nav" 
          @click="$emit('open-showcase')" 
          title="Inspect Model Benchmark & Cutout Comparison for Test Image"
        >
          <Sparkles :size="11" /> Model Showcase
        </button>
      </div>
    </div>

    <!-- Center: Model Status & Preload Pill -->
    <ModelStatusBar
      :is-processing="isProcessing"
      :is-preloading="isPreloading"
      :selected-model="selectedModel"
      :current-model-cached="currentModelCached"
      :formatted-cache-usage="formattedCacheUsage"
      :is-clearing-cache="isClearingCache"
      @model-change="$emit('model-change', $event)"
      @preload="$emit('preload')"
      @clear-cache="$emit('clear-cache')"
    />

    <!-- Right: Browser Zoom Reset & Mode Switcher -->
    <div class="navbar-right-actions">
      <button
        v-if="isBrowserZoomed"
        class="btn-browser-zoom"
        @click="$emit('reset-browser-zoom')"
        :title="`Browser zoom is ${browserZoomLevel}%. Click to reset.`"
      >
        <Monitor :size="12" />
        <span>Page {{ browserZoomLevel }}%</span>
        <RotateCcw :size="11" />
      </button>

      <div class="mode-toggle-group">
        <button
          class="btn-font-scale"
          @click="$emit('cycle-font-size')"
          :title="`Interface Font Size: ${fontSize.toUpperCase()} (Click to cycle: Small, Medium, Large, Extra Large)`"
        >
          <Type :size="13" />
          <span class="font-scale-tag">{{ fontSize === 'compact' ? 'S' : fontSize === 'normal' ? 'M' : fontSize === 'medium' ? 'L' : 'XL' }}</span>
        </button>
        <button
          class="btn-settings"
          @click="$emit('open-settings')"
          title="App Settings & Accessibility"
          style="background: transparent; border: none; color: #94a3b8; cursor: pointer; display: flex; align-items: center; padding: 0 6px; margin-right: 4px;"
        >
          <Settings :size="14" />
        </button>
        <button
          :class="['mode-btn', { active: userMode === 'standard' }]"
          @click="$emit('update:userMode', 'standard')"
        >
          Standard
        </button>
        <button
          :class="['mode-btn', { active: userMode === 'power' }]"
          @click="$emit('update:userMode', 'power')"
        >
          <Wrench :size="12" /> Power User
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
/* Navbar (Dynamic accessible height) */
.navbar {
  height: var(--navbar-height, 48px);
  min-height: var(--navbar-height, 48px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(16px);
  background: rgba(8, 12, 20, 0.85);
  flex-shrink: 0;
  z-index: 50;
  transition: height 0.2s ease, min-height 0.2s ease;
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.brand-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.4);
  flex-shrink: 0;
}

.brand-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 7px;
  display: block;
}

.brand-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  line-height: 1;
}

.brand-name {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.5px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
}

.brand-name span {
  color: #818cf8;
}

/* Model Status Bar (and .cached-text / .uncached-text / .spin)
   - moved to src/components/ModelStatusBar.vue */

.navbar-right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-browser-zoom {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.35);
  padding: 3px 9px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-browser-zoom:hover {
  background: rgba(245, 158, 11, 0.25);
  color: #fde68a;
  border-color: rgba(245, 158, 11, 0.5);
}

/* Mode Switcher */
.mode-toggle-group {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.06);
  padding: 2px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.btn-font-scale {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #a5b4fc;
  padding: 3px 7px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  margin-right: 3px;
  transition: all 0.2s ease;
}
.btn-font-scale:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.4);
  color: #ffffff;
}
.font-scale-tag {
  font-size: 9.5px;
  font-weight: 700;
  background: #6366f1;
  color: white;
  padding: 1px 4px;
  border-radius: 4px;
  line-height: 1;
}

.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.mode-btn.active {
  background: #6366f1;
  color: white;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
}

.btn-benchmark-nav {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(56, 189, 248, 0.12);
  border: 1px solid rgba(56, 189, 248, 0.3);
  color: #38bdf8;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  margin: 2px 0px 0px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-benchmark-nav:hover {
  background: rgba(56, 189, 248, 0.25);
  border-color: #38bdf8;
  color: #ffffff;
}

/* .spin + @keyframes spin - moved to src/components/ModelStatusBar.vue */

/* Version Badge in Navbar */
.version-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.3);
  padding: 1px 7px 1px 7px;
  margin: 2px 0px 0px 0px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.3px;
  height: 19px;
  box-sizing: border-box;
}

.version-badge:hover {
  background: rgba(99, 102, 241, 0.3);
  color: #c7d2fe;
  border-color: rgba(99, 102, 241, 0.5);
}
</style>
