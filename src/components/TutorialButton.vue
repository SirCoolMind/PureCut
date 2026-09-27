<script setup>
/**
 * The navbar's "Tutorial" trigger: a small help button that starts the guided
 * tour, with a gentle one-time pulse until the user has opened it.
 *
 * Presentational. `hint` (whether the pulse should play) and the click are both
 * owned by `useTutorial` / App.vue, so "shown once, ever" stays in one place.
 *
 * Sized and shaped to match the neighbouring version badge and font-scale button
 * so it reads as part of the same control cluster on desktop, and collapses to an
 * icon-only button on phones exactly like the Model Showcase button does.
 */
import { Compass } from 'lucide-vue-next'

defineProps({
  /** Play the attention pulse (true until the tour has been opened once). */
  hint: { type: Boolean, default: false },
  /** Context-specific title, supplied by the navbar. */
  label: { type: String, default: 'Tutorial' }
})

defineEmits(['open'])
</script>

<template>
  <button
    :class="['btn-tutorial', { hint }]"
    type="button"
    :title="label"
    :aria-label="label"
    @click="$emit('open')"
  >
    <Compass :size="12" />
    <span class="btn-tutorial-text">{{ label }}</span>
  </button>
</template>

<style scoped>
.btn-tutorial {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.32);
  color: #6ee7b7;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  margin: 2px 0 0 4px;
  border-radius: 6px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

.btn-tutorial:hover {
  background: rgba(16, 185, 129, 0.26);
  border-color: #34d399;
  color: #ffffff;
}

/* The one-time nudge. Pauses on hover so the label stays steady once noticed. */
.btn-tutorial.hint {
  animation: tutorialPulse 2s ease-in-out infinite;
}

.btn-tutorial.hint:hover {
  animation-play-state: paused;
}

@keyframes tutorialPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.45); }
  50% { box-shadow: 0 0 0 4px rgba(52, 211, 153, 0); }
}

@media (max-width: 767px) {
  .btn-tutorial {
    width: 28px;
    height: 28px;
    justify-content: center;
    padding: 0;
    margin: 0;
    border-radius: 7px;
    gap: 0;
  }

  .btn-tutorial-text {
    display: none;
  }

  .btn-tutorial :deep(svg) {
    width: 15px;
    height: 15px;
  }
}
</style>