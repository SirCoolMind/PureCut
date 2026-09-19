<script setup>
/**
 * The centre pill of the navbar: model picker, cached/not-cached indicator, the
 * preload button and the storage-cache pill with its clear button.
 *
 * Presentational: state comes in as props, actions leave as emits. It is nested
 * inside Navbar.vue, which forwards the six props and three emits it owns.
 *
 * `.spin` + `@keyframes spin` live here rather than in Navbar.vue because both
 * animated icons (preload, clear-cache) are in this component, and Vue renames
 * keyframes per component scope - a sibling scope cannot reach them.
 * ProcessingOverlay and InfoModal each declare their own copy for the same reason.
 *
 * `.cached-text` / `.uncached-text` below have no markup anywhere in the app; they
 * were already dead before this extraction and moved with the block rather than
 * deleted (see AGENTS.md known issues).
 *
 * Extracted verbatim (markup + its scoped CSS) from App.vue's template during the
 * AI-context refactor; no behaviour was changed.
 */
import { RefreshCw, HardDrive, Trash2 } from 'lucide-vue-next'
import { modelOptions } from '../constants.js'

defineProps({
  /** True while the AI pipeline runs; disables the picker, preload and clear. */
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
  isClearingCache: { type: Boolean, default: false }
})

defineEmits(['model-change', 'preload', 'clear-cache'])
</script>

<template>
  <div class="model-status-bar">
    <div class="model-picker-wrapper">
      <select 
        class="model-picker-select" 
        :value="selectedModel"
        :disabled="isProcessing || isPreloading"
        @change="$emit('model-change', $event)"
      >
        <option v-for="model in modelOptions" :key="model.id" :value="model.id">
          {{ model.name }} ({{ model.size }})
        </option>
      </select>
      <div class="model-picker-chevron">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </div>
    </div>

    <div class="model-indicator" :class="{ 'is-cached': currentModelCached }" :title="currentModelCached ? 'Model cached locally in browser' : 'Model weights not downloaded yet'">
      <span class="status-dot"></span>
      <span class="model-status-text">{{ currentModelCached ? 'Ready' : 'Not Cached' }}</span>
    </div>

    <button
      v-if="!currentModelCached"
      class="btn-preload"
      :disabled="isPreloading || isProcessing"
      @click="$emit('preload')"
      :title="isPreloading ? 'Downloading weights...' : 'Preload model weights now'"
    >
      <RefreshCw :size="11" :class="{ spin: isPreloading }" />
      <span class="btn-preload-text">{{ isPreloading ? 'Loading...' : 'Preload' }}</span>
    </button>

    <!-- Cache storage size indicator & clear cache trigger -->
    <div class="cache-status-pill" :title="`Total AI model storage used: ${formattedCacheUsage}`">
      <HardDrive :size="11" />
      <span>{{ formattedCacheUsage }}</span>
      <button
        class="btn-clear-cache"
        :disabled="isClearingCache || isProcessing"
        @click="$emit('clear-cache')"
        title="Clear downloaded AI models & storage cache"
      >
        <Trash2 :size="11" :class="{ spin: isClearingCache }" />
        {{ isClearingCache ? 'Clearing...' : 'Clear' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Model Status Bar */
.model-status-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.04);
  padding: 4px 10px;
  border-radius: 9999px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 1;
  min-width: 0;
}

.model-indicator {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 11px;
  color: #94a3b8;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f59e0b;
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
}

.model-indicator.is-cached .status-dot {
  background: #10b981;
  box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);
}

.model-indicator.is-cached {
  color: #34d399;
}

.model-picker-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.model-picker-select {
  appearance: none;
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 3px 26px 3px 10px;
  font-size: 11px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  transition: all 0.2s ease;
}

.model-picker-select:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.3);
}

.model-picker-select:focus {
  border-color: #818cf8;
  box-shadow: 0 0 0 2px rgba(129, 140, 248, 0.2);
}

.model-picker-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.model-picker-select option {
  background: #1e293b;
  color: #f8fafc;
}

.model-picker-chevron {
  position: absolute;
  right: 8px;
  pointer-events: none;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-preload {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.4);
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 10.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-preload:hover:not(:disabled) {
  background: rgba(99, 102, 241, 0.35);
}

.cache-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 9999px;
  font-size: 10.5px;
  color: #94a3b8;
  margin-left: 2px;
}

.btn-clear-cache {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.3);
  padding: 1px 6px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-clear-cache:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.3);
  color: #fee2e2;
  border-color: rgba(239, 68, 68, 0.5);
}

.btn-clear-cache:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Unreferenced - see the note in the script block. */
.cached-text { color: #34d399; }
.uncached-text { color: #fbbf24; }

/* Owned here: both animated icons live in this component, and Vue renames
   keyframes per component scope. */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
