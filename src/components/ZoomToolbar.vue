<script setup>
/**
 * The floating zoom & pan toolbar pinned inside the canvas viewport.
 *
 * Purely presentational: it renders the current zoom level and the reset
 * affordance's visibility from `zoomLevel` / `panOffset`, and re-emits the three
 * actions (owned by useZoomPan in App.vue) upward.
 *
 * Extracted verbatim (markup + its scoped CSS) from App.vue's template during the
 * AI-context refactor; no behaviour was changed.
 */
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-vue-next'

defineProps({
  /** Current scale factor; 1 === 100%. */
  zoomLevel: { type: Number, required: true },
  /** Current pan offset in CSS pixels: `{ x, y }`. */
  panOffset: { type: Object, required: true }
})

defineEmits(['zoom-in', 'zoom-out', 'reset'])
</script>

<template>
  <div class="zoom-floating-toolbar">
    <button
      v-if="zoomLevel !== 1 || panOffset.x !== 0 || panOffset.y !== 0"
      class="zoom-btn reset-btn"
      @click="$emit('reset')"
      title="Reset Zoom & Pan"
    >
      <RotateCcw :size="12" /> Reset
    </button>
    <button class="zoom-btn" @click="$emit('zoom-in')" title="Zoom In (+25%)">
      <ZoomIn :size="13" />
    </button>
    <button
      class="zoom-level-badge"
      @click="$emit('reset')"
      :title="zoomLevel !== 1 || panOffset.x !== 0 || panOffset.y !== 0 ? 'Click to Reset Zoom & Position' : '100% Zoom'"
    >
      {{ Math.round(zoomLevel * 100) }}%
    </button>
    <button class="zoom-btn" @click="$emit('zoom-out')" title="Zoom Out (-25%)">
      <ZoomOut :size="13" />
    </button>
  </div>
</template>

<style scoped>
/* Floating Zoom Toolbar */
.zoom-floating-toolbar {
  position: absolute;
  bottom: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 3px;
  background: rgba(15, 23, 42, 0.82);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  padding: 3px 5px;
  z-index: 30;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.zoom-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #cbd5e1;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s;
}

.zoom-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.zoom-btn.reset-btn {
  width: auto;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 10.5px;
  font-weight: 600;
  gap: 4px;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.35);
  margin-right: 2px;
}

.zoom-btn.reset-btn:hover {
  background: rgba(99, 102, 241, 0.35);
  color: #c7d2fe;
}

.zoom-level-badge {
  background: transparent;
  border: none;
  font-size: 11px;
  font-weight: 700;
  color: #f1f5f9;
  padding: 2px 6px;
  border-radius: 6px;
  cursor: pointer;
  letter-spacing: 0.2px;
  transition: all 0.15s;
}

.zoom-level-badge:hover {
  color: #818cf8;
  background: rgba(99, 102, 241, 0.15);
}
</style>
