<script setup>
/**
 * ShowcaseDiagnosis — the right-hand model scorecard of the
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
import { Check } from 'lucide-vue-next'

defineProps({
  /** Key of the model currently selected in the host. */
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
      <div class="eval-section">
        <h4>Memory Profile</h4>
        <ul class="eval-list pros">
          <li>
            <Check :size="13" />
            <span>{{ modelsData[model].memoryProfile }}</span>
          </li>
        </ul>
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
  gap: 1rem;
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

.diagnosis-body {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.eval-section h4 {
  margin: 0 0 0.5rem 0;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #94a3b8;
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

@media (max-width: 767px) {
  .model-diagnosis-card {
    gap: 1rem;
    padding: 1rem;
  }

  .diagnosis-header h3 {
    font-size: 1.05rem;
  }

  .model-arch {
    line-height: 1.4;
  }

  .score-badge {
    flex-shrink: 0;
    padding: 0.3rem 0.5rem;
  }

  .eval-list li {
    font-size: 0.82rem;
  }
}
</style>
