<script setup>
/**
 * ShowcaseDiagnosis — the right-hand "Model Scorecard & Diagnosis" card of the
 * Showcase modal.
 *
 * Extracted from `ShowcaseModal.vue` (session 4) together with its scoped CSS.
 * Scoped styles never cross a component boundary except for the child's ROOT
 * element, so the `.model-diagnosis-card` rules had to travel with this markup
 * or they would have been dropped from the bundle silently.
 *
 * Purely presentational: it renders `modelsData[model]` and holds no state of
 * its own. `modelsData` is passed whole (rather than the resolved entry) so the
 * markup stays byte-identical to the version that lived in the host, and so the
 * child stays reactive if the host ever replaces the object.
 */
import { Check, ShieldAlert } from 'lucide-vue-next'

defineProps({
  /** Key of the model currently selected in the host: rmbg | isnet | modnet. */
  model: {
    type: String,
    required: true
  },
  /** The host's full model metadata table, keyed by model id. */
  modelsData: {
    type: Object,
    required: true
  }
})
</script>

<template>
  <div class="model-diagnosis-card">
    <div class="diagnosis-header">
      <div>
        <h3>{{ modelsData[model].name }}</h3>
        <p class="model-arch">{{ modelsData[model].architecture }}</p>
      </div>
      <div class="score-badge">
        <span class="score-title">Pose Score</span>
        <span class="score-val">{{ modelsData[model].rating }}</span>
      </div>
    </div>

    <div class="diagnosis-body">
      <div class="telemetry-row">
        <div class="tele-item">
          <span class="tele-label">Typical Latency</span>
          <span class="tele-val">{{ modelsData[model].executionTime }}</span>
        </div>
        <div class="tele-item">
          <span class="tele-label">RAM Heap Peak</span>
          <span class="tele-val">~180 MB (Protected)</span>
        </div>
      </div>

      <div class="eval-section">
        <h4>Cutout Analysis on Test Pose</h4>
        <p class="summary-text">{{ modelsData[model].summary }}</p>
      </div>

      <div class="eval-section">
        <h4>Key Strengths</h4>
        <ul class="eval-list pros">
          <li v-for="(pro, i) in modelsData[model].pros" :key="i">
            <Check :size="13" />
            <span>{{ pro }}</span>
          </li>
        </ul>
      </div>

      <div class="eval-section" v-if="modelsData[model].cons.length">
        <h4>Limitations</h4>
        <ul class="eval-list cons">
          <li v-for="(con, i) in modelsData[model].cons" :key="i">
            <ShieldAlert :size="13" />
            <span>{{ con }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
</style>
