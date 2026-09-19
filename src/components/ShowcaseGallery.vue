<script setup>
/**
 * ShowcaseGallery — the bottom "All Models Side-by-Side Comparison" 4-column
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
  /** The host's full model metadata table (only `name` is used here). */
  modelsData: {
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
        <h3>All Models Side-by-Side Comparison</h3>
        <p>Direct comparison of the test photo across the input and all 3 model cutouts.</p>
      </div>
    </div>

    <div class="side-by-side-grid">
      <!-- Column 1: Original Input -->
      <div class="gallery-card original-card">
        <div class="gcard-header">
          <span class="gcard-title">Original Input Photo</span>
          <span class="gcard-tag">1080 × 1440</span>
        </div>
        <div class="gcard-media-box bg-dark">
          <img :src="`${baseUrl}giselle-original.jpg`" alt="Original Giselle Photo" />
        </div>
        <div class="gcard-caption">
          Seated pose inside elevator with brushed steel walls, denim boots, and loose sweatpants.
        </div>
      </div>

      <!-- Column 2: RMBG-1.4 -->
      <div :class="['gallery-card', { highlight: activeModel === 'rmbg' }]" @click="emit('select', 'rmbg')">
        <div class="gcard-header">
          <span class="gcard-title">BRIA RMBG-1.4</span>
          <span class="gcard-tag tag-sota">SOTA Cutout</span>
        </div>
        <div :class="['gcard-media-box', `bg-${backdropBg}`]">
          <img :src="`${baseUrl}giselle-rmbg.png`" alt="RMBG-1.4 Cutout" />
        </div>
        <div class="gcard-caption">
          <strong>100% full pose preserved</strong>: Boots, pants, black long-sleeve, hair strands, and cap.
        </div>
      </div>

      <!-- Column 3: IS-Net -->
      <div :class="['gallery-card', { highlight: activeModel === 'isnet' }]" @click="emit('select', 'isnet')">
        <div class="gcard-header">
          <span class="gcard-title">DIS / IS-Net</span>
          <span class="gcard-tag tag-isnet">Salient Cutout</span>
        </div>
        <div :class="['gcard-media-box', `bg-${backdropBg}`]">
          <img :src="`${baseUrl}giselle-isnet.png`" alt="IS-Net Cutout" />
        </div>
        <div class="gcard-caption">
          Clean head and boot boundaries. Slight alpha feathering on grey sweatpants.
        </div>
      </div>

      <!-- Column 4: MODNet -->
      <div :class="['gallery-card', { highlight: activeModel === 'modnet' }]" @click="emit('select', 'modnet')">
        <div class="gcard-header">
          <span class="gcard-title">MODNet</span>
          <span class="gcard-tag tag-modnet">Portrait Matting</span>
        </div>
        <div :class="['gcard-media-box', `bg-${backdropBg}`]">
          <img :src="`${baseUrl}giselle-modnet.png`" alt="MODNet Cutout" />
        </div>
        <div class="gcard-caption">
          Portrait model captures upper face and lower boots; torso omitted due to pose orientation.
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
  margin-top: 1rem;
}

.gallery-title-row h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1.15rem;
  color: #f8fafc;
}

.gallery-title-row p {
  margin: 0;
  font-size: 0.85rem;
  color: #94a3b8;
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
</style>
