<script setup>
/**
 * ShowcaseGallery — the bottom "All Models Side-by-Side Comparison" gallery
 * gallery of the Showcase modal.
 *
 * Extracted from `ShowcaseModal.vue` (session 4) together with its scoped CSS,
 * including the `@media (max-width: 900px)` rule that collapses the grid to two
 * columns. Scoped styles do not cross a component boundary (except for the
 * child's root element), so the gallery rules had to travel with this markup.
 *
 * Presentational: clicking a card emits `select` so the host can highlight that
 * model and re-point the diagnosis card and the split slider at it. The backdrop
 * is passed down because the cutout previews must sit on the same backdrop as
 * the slider stage.
 */

defineProps({
  /** Key of the model currently highlighted by the host. */
  activeModel: {
    type: String,
    required: true
  },
  /** 'checkerboard' | 'white' | 'dark' — the host's backdrop choice. */
  backdropBg: {
    type: String,
    required: true
  },
  /** Vite BASE_URL, used to resolve the demo assets. */
  baseUrl: {
    type: String,
    required: true
  },
  /** The host's full model metadata table. */
  modelsData: {
    type: Object,
    required: true
  },
  /** The selected exhibit's source image and result descriptions. */
  exhibit: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['select'])
</script>

<template>
  <div class="gallery-overview-section">
    <div class="gallery-title-row">
      <div>
        <h3>{{ exhibit.name }}: browser-model cutouts</h3>
      </div>
    </div>

    <div class="side-by-side-grid">
      <!-- Column 1: Original Input -->
      <div class="gallery-card original-card">
        <div class="gcard-header">
          <span class="gcard-title">{{ exhibit.name }} original</span>
          <span class="gcard-tag">Input</span>
        </div>
        <div class="gcard-media-box bg-dark">
          <img :src="exhibit.originalSrc" :alt="`Original ${exhibit.name} photo`" />
        </div>
        <div class="gcard-caption">
          {{ exhibit.originalResult }}
        </div>
      </div>

      <div
        v-for="(model, key) in modelsData"
        :key="key"
        :class="['gallery-card', { highlight: activeModel === key }]"
        @click="emit('select', key)"
      >
        <div class="gcard-header">
          <span class="gcard-title">{{ model.name }}</span>
          <span :class="['gcard-tag', model.badgeClass]">{{ model.badge }}</span>
        </div>
        <div :class="['gcard-media-box', `bg-${backdropBg}`]">
          <img
            v-if="exhibit.cutoutSources?.[key]"
            :src="exhibit.cutoutSources[key]"
            :alt="`${model.name} cutout`"
          />
          <span v-else class="result-pending">Result image pending</span>
        </div>
        <div class="gcard-caption">
          {{ exhibit.results[key] }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.gallery-overview-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 0;
  padding-top: 1.5rem;
  border-top: 1px solid #263247;
}

.gallery-title-row h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1.15rem;
  color: #f8fafc;
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

.badge-recommended {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
}

.badge-precision {
  background: rgba(56, 189, 248, 0.2);
  color: #38bdf8;
}

.badge-portrait {
  background: rgba(168, 85, 247, 0.2);
  color: #c084fc;
}

.badge-quality {
  background: rgba(245, 158, 11, 0.18);
  color: #fbbf24;
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

.result-pending {
  padding: 0.6rem;
  color: #64748b;
  font-size: 0.78rem;
  text-align: center;
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

@media (max-width: 767px) {
  .gallery-overview-section {
    gap: 0.75rem;
    margin-top: 0;
  }

  .gallery-title-row h3 {
    font-size: 1rem;
    line-height: 1.3;
  }

  .side-by-side-grid {
    grid-template-columns: 1fr;
    gap: 0.8rem;
  }

  .gcard-header {
    padding: 0.65rem 0.75rem;
  }

  .gcard-title {
    font-size: 0.85rem;
  }

  .gcard-media-box {
    height: min(105vw, 400px);
  }

  .gcard-caption {
    padding: 0.7rem 0.75rem;
    font-size: 0.8rem;
    line-height: 1.45;
  }
}
</style>
