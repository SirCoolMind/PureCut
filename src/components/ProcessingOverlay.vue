<script setup>
/**
 * VIEW 2 of the main content area: the processing overlay, shown while the AI
 * pipeline runs and while model weights are downloading.
 *
 * Presentational only. The pipeline's progress state (statusMessage,
 * downloadProgress, telemetry) is owned elsewhere and arrives as props, so this
 * component has no logic and no dependencies beyond its two icons.
 *
 * Extracted verbatim (markup + its scoped CSS) from App.vue's template during
 * the AI-context refactor; no behaviour was changed.
 *
 * The spinner needs its OWN `@keyframes spin`: Vue rewrites keyframes names per
 * scope, so the `spin` declared for the navbar's icons is not visible here. See
 * AGENTS.md constraint 5.
 */
import { Cpu, HardDrive } from 'lucide-vue-next'

defineProps({
  /** Headline text while the pipeline runs (owned by useProcessing). */
  statusMessage: { type: String, default: '' },
  /** `{ isDownloading, percent }`, filled in while weights download. */
  downloadProgress: { type: Object, required: true },
  /** Hardware telemetry rendered in the two live tiles. */
  telemetry: { type: Object, required: true }
})
</script>

<template>
  <section class="processing-section">
    <div class="processing-card">
      <div class="spinner-ring"></div>
      <h2 class="processing-title">{{ statusMessage }}</h2>

      <!-- Download Progress Indicator -->
      <div v-if="downloadProgress.isDownloading" class="progress-box">
        <div class="progress-labels">
          <span>Model Weight Download</span>
          <span>{{ downloadProgress.percent }}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${downloadProgress.percent}%` }"></div>
        </div>
      </div>

      <!-- Real-Time Hardware Telemetry Grid (Redesigned & Distinct) -->
      <div class="telemetry-live-grid">
        <div class="telemetry-live-tile">
          <div class="tile-header">
            <span class="tile-badge cpu-badge"><Cpu :size="12" /> CPU</span>
            <span class="tile-category">Compute Cores</span>
          </div>
          <div class="tile-main-value">
            {{ telemetry.threads }} <span class="val-unit">Logical Threads</span>
          </div>
        </div>

        <div class="telemetry-live-tile">
          <div class="tile-header">
            <span class="tile-badge ram-badge"><HardDrive :size="12" /> RAM</span>
            <span class="tile-category">Heap Allocation</span>
          </div>
          <div class="tile-main-value">
            ~180 <span class="val-unit">MB Estimated</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* PROCESSING OVERLAY (REDESIGNED TILES) */
.processing-section {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.processing-card {
  width: 100%;
  max-width: 520px;
  background: rgba(30, 41, 59, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  padding: 34px 28px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  backdrop-filter: blur(14px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
}

.spinner-ring {
  width: 44px;
  height: 44px;
  border: 3px solid rgba(99, 102, 241, 0.2);
  border-top-color: #818cf8;
  border-radius: 50%;
  animation: spin 0.9s linear infinite;
  margin-bottom: 16px;
}

.processing-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 18px;
}

.progress-box {
  width: 100%;
  margin-bottom: 20px;
}

.progress-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #94a3b8;
  margin-bottom: 5px;
}

.progress-track {
  width: 100%;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 9999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #6366f1, #a855f7);
  transition: width 0.3s ease;
}

/* Clear, distinct metric tiles (Never overlap) */
.telemetry-live-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  width: 100%;
}

.telemetry-live-tile {
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 12px;
  padding: 12px 14px;
  text-align: left;
  display: flex;
  flex-direction: column;
}

.tile-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.tile-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  border-radius: 4px;
}

.cpu-badge {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
}

.ram-badge {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.tile-category {
  font-size: 10.5px;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 500;
}

.tile-main-value {
  font-size: 15px;
  font-weight: 700;
  color: #f1f5f9;
}

.val-unit {
  font-size: 11px;
  font-weight: 400;
  color: #94a3b8;
  margin-left: 2px;
}

/* Declared here as well as in the navbar's scope, because .spinner-ring above
   animates `spin` and scoped keyframes do not cross component boundaries. */
@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
