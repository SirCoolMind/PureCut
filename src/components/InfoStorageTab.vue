<script setup>
/**
 * The Storage & Cache tab of the Info modal.
 *
 * The only stateful tab: it reports how much on-device model storage is in use
 * and offers the cache-clearing action. It holds no state of its own — the host
 * owns `isClearingCache` (the clearing work lives in `useModelCache`) and is
 * told to act through the `clear-cache` emit.
 *
 * Extracted from `InfoModal.vue` (session 4) together with this tab's scoped
 * CSS. Each tab carries its own copy of `.tab-content` and `@keyframes tabFade`
 * because Vue rewrites both per component scope: a keyframe declared in the host
 * is renamed `tabFade-<hosthash>` and a child component can never reference it.
 * The host keeps the `v-if` that chooses the tab, and `.tab-content` sits on the
 * root here, so the fade-in animation still runs on every tab switch.
 */
import { HardDrive, Trash2 } from 'lucide-vue-next'
import { modelOptions } from '../constants.js'

defineProps({
  /** Human-readable total of the on-device model cache. */
  formattedCacheUsage: {
    type: String,
    default: '0 MB'
  },
  /** Map of model id -> whether its weights are cached on this device. */
  cachedModels: {
    type: Object,
    default: () => ({})
  },
  isClearingCache: {
    type: Boolean,
    default: false
  },
  isProcessing: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['clear-cache'])
</script>

<template>
  <div class="tab-content storage-content">
    <div class="storage-summary-card">
      <div class="storage-summary-icon">
        <HardDrive :size="24" />
      </div>
      <div class="storage-summary-info">
        <span class="storage-summary-label">Total On-Device AI Storage Used</span>
        <div class="storage-summary-val">{{ formattedCacheUsage }}</div>
      </div>
      <button
        class="btn-danger-clear"
        :disabled="isClearingCache || isProcessing"
        @click="emit('clear-cache')"
      >
        <Trash2 :size="13" :class="{ spin: isClearingCache }" />
        {{ isClearingCache ? 'Clearing Storage...' : 'Clear All Cache' }}
      </button>
    </div>

    <div class="storage-desc">
      AI model weights are stored inside your browser's local Cache Storage and IndexedDB so they don't need to be re-downloaded every visit.
    </div>

    <div class="storage-models-list">
      <div class="storage-models-title">Available Neural Models</div>
      <div v-for="m in modelOptions" :key="m.id" class="storage-model-row">
        <div class="storage-model-details">
          <div class="storage-model-name">
            {{ m.name }}
            <span v-if="m.id === 'briaai/RMBG-1.4'" class="mini-tag-sota">Default</span>
          </div>
          <div class="storage-model-sub">
            Size: {{ m.size }} · Engine: {{ m.engine === 'rmbg' ? 'Transformers.js' : '@imgly' }}
          </div>
        </div>
        <div class="storage-model-status">
          <span :class="['cache-pill-tag', cachedModels[m.id] ? 'cached' : 'empty']">
            {{ cachedModels[m.id] ? '✓ Cached Locally' : 'Not Cached' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-content {
  animation: tabFade 0.15s ease-out;
}

@keyframes tabFade {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}


/* ---- STORAGE & CACHE TAB ---- */
.storage-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.storage-summary-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
}

.storage-summary-icon {
  width: 44px;
  height: 44px;
  background: rgba(99, 102, 241, 0.15);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #818cf8;
  flex-shrink: 0;
}

.storage-summary-info {
  flex: 1;
}

.storage-summary-label {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.storage-summary-val {
  font-size: 20px;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: -0.5px;
}

.btn-danger-clear {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.35);
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-danger-clear:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.3);
  color: #fee2e2;
  border-color: rgba(239, 68, 68, 0.6);
}

.btn-danger-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.storage-desc {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}

.storage-models-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.storage-models-title {
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
  margin-bottom: 2px;
}

.storage-model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 10px 14px;
}

.storage-model-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #f1f5f9;
  display: flex;
  align-items: center;
  gap: 6px;
}

.mini-tag-sota {
  font-size: 9.5px;
  font-weight: 700;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.4);
  padding: 1px 5px;
  border-radius: 4px;
}

.storage-model-sub {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.cache-pill-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 9999px;
}

.cache-pill-tag.cached {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.cache-pill-tag.empty {
  background: rgba(255, 255, 255, 0.04);
  color: #64748b;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
