<script setup>
/**
 * The right-hand tuning sidebar: quick presets in Standard mode, the power-user
 * sliders plus the engine/model selectors in Power mode, and the telemetry card.
 *
 * `tuning` is the compositor's own reactive object (from useCompositor) and is
 * deliberately passed by reference, not copied: the sliders and the de-fringe
 * toggle write straight through to it, exactly as they did when both lived in
 * App.vue. Everything else is props + emits, so App.vue keeps owning the refs
 * (`userMode`, `selectedModel`, `selectedDevice`).
 *
 * Two call shapes are preserved on purpose, because `recompositeCanvas` behaves
 * differently for them:
 *  - the three sliders re-emit the raw `input` EVENT, so it arrives as
 *    `recompositeCanvas(event)` and `immediateBlob` is truthy. That is how the
 *    sliders have always behaved - every slider tick runs the heavy
 *    full-resolution export synchronously instead of being debounced.
 *  - the de-fringe toggle emits with no payload, i.e. `recompositeCanvas()` and
 *    the ~120 ms debounce.
 * Both are pre-existing behaviour and are carried over unchanged rather than
 * "fixed" - see AGENTS.md known issues.
 *
 * Extracted verbatim (markup + its scoped CSS) from App.vue's template during the
 * AI-context refactor; no behaviour was changed.
 */
import { SlidersHorizontal, Wrench, Layers, Cpu } from 'lucide-vue-next'
import { modelOptions } from '../constants.js'

defineProps({
  /** 'standard' | 'power' */
  userMode: { type: String, required: true },
  /** The compositor's live tuning object; written through by the controls. */
  tuning: { type: Object, required: true },
  /** Currently selected model id. */
  selectedModel: { type: String, required: true },
  /** 'gpu' | 'cpu' */
  selectedDevice: { type: String, required: true },
  /** Hardware telemetry rendered in the card at the bottom. */
  telemetry: { type: Object, required: true },
  /** Two-pass TTA Flip Fusion setting */
  ttaFlipFusion: { type: Boolean, default: true }
})

defineEmits(['apply-preset', 'recomposite', 'model-change', 'device-change', 'tta-toggle'])
</script>

<template>
  <aside class="sidebar-column">
    <!-- Tuning Header -->
    <div class="sidebar-header">
      <div class="sidebar-title">
        <SlidersHorizontal v-if="userMode === 'standard'" :size="14" />
        <Wrench v-else :size="14" />
        <span>{{ userMode === 'standard' ? 'Quick Presets' : 'Power User Studio' }}</span>
      </div>
      <span class="sidebar-sub">{{ userMode === 'standard' ? '1-Click Adjust' : 'Live Canvas Controls' }}</span>
    </div>

    <!-- Standard Mode Presets -->
    <div v-if="userMode === 'standard'" class="presets-container">
      <button
        :class="['preset-card', { active: tuning.preset === 'balanced' }]"
        @click="$emit('apply-preset', 'balanced')"
      >
        <div class="preset-name">⚖️ Balanced (Default)</div>
        <div class="preset-desc">Smooth edges, natural all-around cutoff.</div>
      </button>
      <button
        :class="['preset-card', { active: tuning.preset === 'hair' }]"
        @click="$emit('apply-preset', 'hair')"
      >
        <div class="preset-name">💇 Fine Hair & Fur</div>
        <div class="preset-desc">Preserves wisps, soft fur, and delicate strands.</div>
      </button>
      <button
        :class="['preset-card', { active: tuning.preset === 'product' }]"
        @click="$emit('apply-preset', 'product')"
      >
        <div class="preset-name">📦 Clean Product</div>
        <div class="preset-desc">Crisp boundary with inward trim to eliminate halos.</div>
      </button>
      <button
        :class="['preset-card', { active: tuning.preset === 'aggressive' }]"
        @click="$emit('apply-preset', 'aggressive')"
      >
        <div class="preset-name">✂️ Deep / Cluttered BG</div>
        <div class="preset-desc">Aggressive cutoff for busy, difficult backgrounds.</div>
      </button>
    </div>

    <!-- Power User Sliders & Settings -->
    <div v-else class="power-container">
      <!-- Slider 1: Alpha Cutoff -->
      <div class="tune-group">
        <div class="tune-label">
          <span>Alpha Sensitivity (Cutoff):</span>
          <strong>{{ Math.round(tuning.threshold * 100) }}%</strong>
        </div>
        <input
          type="range"
          min="0.10"
          max="0.90"
          step="0.05"
          v-model.number="tuning.threshold"
          @input="$emit('recomposite', $event)"
          class="tune-slider ui-range"
        />
      </div>

      <!-- Slider 2: Edge Softness / Feather -->
      <div class="tune-group">
        <div class="tune-label">
          <span>Edge Softness (Feather):</span>
          <strong>{{ tuning.feather }}px</strong>
        </div>
        <input
          type="range"
          min="0"
          max="6"
          step="1"
          v-model.number="tuning.feather"
          @input="$emit('recomposite', $event)"
          class="tune-slider ui-range"
        />
      </div>

      <!-- Slider 3: Edge Shift / Trim -->
      <div class="tune-group">
        <div class="tune-label">
          <span>Edge Shift (Trim / Expand):</span>
          <strong>{{ tuning.trim > 0 ? `+${tuning.trim}px` : `${tuning.trim}px` }}</strong>
        </div>
        <input
          type="range"
          min="-3"
          max="3"
          step="1"
          v-model.number="tuning.trim"
          @input="$emit('recomposite', $event)"
          class="tune-slider ui-range"
        />
      </div>

      <!-- Toggle: De-fringing -->
      <div class="tune-group row-group">
        <span>De-fringe Color Spill:</span>
        <button
          :class="['toggle-pill', { active: tuning.deFringe }]"
          @click="tuning.deFringe = !tuning.deFringe; $emit('recomposite')"
        >
          {{ tuning.deFringe ? 'Active' : 'Off' }}
        </button>
      </div>

      <!-- Toggle: TTA Flip Fusion -->
      <div class="tune-group row-group">
        <span title="Test-Time Augmentation: two-pass flip fusion to refine tricky fingers and edges">TTA Flip Fusion:</span>
        <button
          :class="['toggle-pill', { active: ttaFlipFusion }]"
          @click="$emit('tta-toggle')"
        >
          {{ ttaFlipFusion ? 'Active' : 'Off' }}
        </button>
      </div>

      <!-- AI Engine & Model Selector -->
      <div class="engine-box">
        <div class="engine-row">
          <label><Layers :size="12" /> Model:</label>
          <select :value="selectedModel" class="sidebar-select" @change="$emit('model-change', $event)">
            <option v-for="m in modelOptions" :key="m.id" :value="m.id">
              {{ m.name }}
            </option>
          </select>
        </div>
        <div class="engine-row">
          <label><Cpu :size="12" /> Engine:</label>
          <select :value="selectedDevice" class="sidebar-select" @change="$emit('device-change', $event.target.value)">
            <option value="gpu">WebGPU (Hardware GPU)</option>
            <option value="cpu">CPU (WASM Multi-thread)</option>
          </select>
        </div>
      </div>
    </div>

    <!-- Telemetry & Hardware Utilization Card -->
    <div class="telemetry-card">
      <div class="telemetry-header">
        <span>⚡ System Telemetry</span>
        <span class="live-dot"></span>
      </div>
      <div class="telemetry-grid">
        <div class="tele-item">
          <span class="tele-k">Duration</span>
          <span class="tele-v">{{ telemetry.durationSec }}s</span>
        </div>
        <div class="tele-item">
          <span class="tele-k">RAM Heap</span>
          <span class="tele-v">~{{ telemetry.ramAllocatedMB }} MB</span>
        </div>
        <div class="tele-item">
          <span class="tele-k">Throughput</span>
          <span class="tele-v">{{ telemetry.throughputMps }} MP/s</span>
        </div>
        <div class="tele-item">
          <span class="tele-k">Threads</span>
          <span class="tele-v">{{ telemetry.threads }} Cores</span>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
/* Sidebar Column (Right) */
.sidebar-column {
  width: var(--sidebar-width, 310px);
  max-width: 20vw;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  background: rgba(30, 41, 59, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px;
  backdrop-filter: blur(12px);
  overflow-y: auto;
  transition: width 0.2s ease;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.sidebar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: #e2e8f0;
}

.sidebar-sub {
  font-size: 10.5px;
  color: #64748b;
}

/* Presets */
.presets-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.preset-card {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 10px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s;
}

.preset-card:hover {
  background: rgba(255, 255, 255, 0.08);
}

.preset-card.active {
  background: rgba(99, 102, 241, 0.2);
  border-color: #6366f1;
  box-shadow: 0 0 10px rgba(99, 102, 241, 0.25);
}

.preset-name {
  font-size: 12px;
  font-weight: 600;
  color: #f1f5f9;
  margin-bottom: 2px;
}

.preset-desc {
  font-size: 10.5px;
  color: #94a3b8;
  line-height: 1.3;
}

/* Power Sliders */
.power-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.tune-group {
  background: rgba(0, 0, 0, 0.2);
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tune-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #94a3b8;
}

.tune-label strong {
  color: #818cf8;
}

/* The rail, handle, hover and focus styling all come from the shared
   `input[type="range"].ui-range` rules in src/styles/global.css - scoped styles
   could not reach the child pseudo-elements consistently, and TuningSidebar and
   StageFooter must render identical sliders. Do not set height / accent-color
   here; it would override the shared control. */
.tune-slider {
  width: 100%;
}

.row-group {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #94a3b8;
}

.toggle-pill {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.toggle-pill.active {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.4);
}

.engine-box {
  background: rgba(0, 0, 0, 0.2);
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.engine-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #94a3b8;
}

.engine-row label {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sidebar-select {
  background: #1e293b;
  color: #f1f5f9;
  border: 1px solid #475569;
  padding: 3px 6px;
  border-radius: 5px;
  font-size: 10.5px;
  outline: none;
  max-width: 160px;
}

/* Telemetry Card */
.telemetry-card {
  background: rgba(16, 185, 129, 0.06);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 8px;
  padding: 8px 10px;
  flex-shrink: 0;
}

.telemetry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  color: #34d399;
  margin-bottom: 6px;
}

.live-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #34d399;
  box-shadow: 0 0 5px #34d399;
}

.telemetry-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 10px;
}

.tele-item {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
}

.tele-k { color: #94a3b8; }
.tele-v { font-weight: 600; color: #f1f5f9; }
</style>
