<script setup>
/**
 * The interface font-scale cycler: a small "Type" glyph plus the current size
 * badge (S / M / L / XL).
 *
 * Extracted from Navbar.vue when the Model Showcase page needed the same control:
 * the showcase is a fixed full-screen page outside `.app-shell`, so without its
 * own copy the user would land there with no way to change the text size. Both
 * hosts pass the same `fontSize` ref and re-emit `cycle`, so there is one
 * definition of the badge mapping rather than two.
 *
 * Presentational: `fontSize` is read, the click is re-emitted.
 */
import { Type } from 'lucide-vue-next'

defineProps({
  /** 'compact' | 'normal' | 'medium' | 'large' */
  fontSize: { type: String, required: true }
})

defineEmits(['cycle'])
</script>

<template>
  <button
    class="btn-font-scale"
    @click="$emit('cycle')"
    :title="`Interface Font Size: ${fontSize.toUpperCase()} (Click to cycle: Small, Medium, Large, Extra Large)`"
  >
    <Type :size="13" />
    <span class="font-scale-tag">{{ fontSize === 'compact' ? 'S' : fontSize === 'normal' ? 'M' : fontSize === 'medium' ? 'L' : 'XL' }}</span>
  </button>
</template>

<style scoped>
.btn-font-scale {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #a5b4fc;
  padding: 3px 7px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-font-scale:hover {
  background: rgba(99, 102, 241, 0.2);
  border-color: rgba(99, 102, 241, 0.4);
  color: #ffffff;
}

.font-scale-tag {
  font-size: 9.5px;
  font-weight: 700;
  background: #6366f1;
  color: white;
  padding: 1px 4px;
  border-radius: 4px;
  line-height: 1;
}
</style>