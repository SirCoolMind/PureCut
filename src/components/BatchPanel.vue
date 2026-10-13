<script setup>
/**
 * Batch progress panel, teleported to <body>. Shown when several images are
 * picked or dropped at once; `useBatch` owns every piece of state it renders.
 *
 * Reuses the unscoped `prompt-modal-*` / `prompt-btn-*` styles from global.css so
 * it reads as one of the app's prompts. While the queue runs, the backdrop click
 * and the close button do nothing: closing mid-run would hide a job that keeps
 * going. Cancel stops after the image in flight instead.
 */
import { computed } from 'vue'
import { Layers, Download, CheckCircle2, XCircle, Loader2, Circle, MinusCircle } from 'lucide-vue-next'

const props = defineProps({
  /** `useBatch().batch`. */
  batch: { type: Object, required: true },
  /** `{ name }` of the selected model. */
  currentModelMeta: { type: Object, required: true }
})

defineEmits(['close', 'cancel', 'download'])

const doneCount = computed(() => props.batch.items.filter((i) => i.status === 'done').length)
const finishedCount = computed(() => props.batch.items.filter((i) => i.status !== 'queued' && i.status !== 'running').length)
const percent = computed(() => props.batch.items.length ? Math.round((finishedCount.value / props.batch.items.length) * 100) : 0)
const statusIcon = { queued: Circle, running: Loader2, done: CheckCircle2, error: XCircle, skipped: MinusCircle }
</script>

<template>
  <Teleport to="body">
    <div v-if="batch.open" class="prompt-modal-overlay" @click.self="!batch.running && $emit('close')">
      <div class="prompt-modal-card batch-card" role="dialog" aria-labelledby="batch-title">
        <div class="prompt-modal-header">
          <div class="prompt-modal-title-wrap">
            <div class="prompt-icon-badge"><Layers :size="15" /></div>
            <h2 id="batch-title" class="prompt-modal-title">Batch Cutout</h2>
          </div>
          <button class="prompt-btn-close" :disabled="batch.running" title="Close" @click="$emit('close')">✕</button>
        </div>

        <div class="prompt-modal-body">
          <p class="prompt-modal-message">
            <template v-if="batch.running">
              Processing {{ finishedCount + 1 }} of {{ batch.items.length }} with
              <strong>{{ currentModelMeta.name }}</strong> and your current tuning.
            </template>
            <template v-else>
              {{ doneCount }} of {{ batch.items.length }} cutouts ready{{ batch.zipUrl ? ' — the ZIP has been downloaded.' : '.' }}
            </template>
          </p>

          <div class="batch-progress" role="progressbar" :aria-valuenow="percent" aria-valuemin="0" aria-valuemax="100">
            <div class="batch-progress-fill" :style="{ transform: `scaleX(${percent / 100})` }" />
          </div>
          <p v-if="batch.running && batch.message" class="batch-status">{{ batch.message }}</p>

          <ul class="batch-list">
            <li v-for="(item, i) in batch.items" :key="i" :class="['batch-item', `is-${item.status}`]">
              <component :is="statusIcon[item.status]" :size="14" :class="{ 'batch-spin': item.status === 'running' }" />
              <span class="batch-name" :title="item.name">{{ item.name }}</span>
              <span v-if="item.error" class="batch-error" :title="item.error">{{ item.error }}</span>
            </li>
          </ul>
        </div>

        <div class="prompt-modal-footer">
          <button v-if="batch.running" class="prompt-btn-cancel" :disabled="batch.cancelRequested" @click="$emit('cancel')">
            {{ batch.cancelRequested ? 'Stopping…' : 'Cancel' }}
          </button>
          <template v-else>
            <button class="prompt-btn-cancel" @click="$emit('close')">Close</button>
            <button v-if="batch.zipUrl" class="prompt-btn-confirm" @click="$emit('download')">
              <Download :size="12" />
              <span>Download ZIP again</span>
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.batch-card {
  width: min(460px, calc(100vw - 32px));
}

.batch-progress {
  height: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
  margin: 12px 0 6px;
}

.batch-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #a855f7);
  transform-origin: left center;
  transition: transform 0.3s ease;
}

.batch-status {
  font-size: 11px;
  color: #94a3b8;
  margin: 0 0 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-list {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  max-height: 220px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.batch-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #cbd5e1;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.02);
  min-width: 0;
}

.batch-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.batch-error {
  max-width: 45%;
  color: #f87171;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.is-queued, .is-skipped { color: #64748b; }
.is-running { color: #a5b4fc; }
.is-done :first-child { color: #34d399; }
.is-error :first-child { color: #f87171; }

.batch-spin {
  animation: batch-spin 1s linear infinite;
}

@keyframes batch-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .batch-spin { animation: none; }
}
</style>
