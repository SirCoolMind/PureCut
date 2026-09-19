<script setup>
/**
 * The multi-subject drawer: a slide-in panel over the canvas that lists the
 * subjects `useSubjects` detected, with per-subject hide and erase actions.
 *
 * It is always mounted; the `open` prop only toggles the CSS class that slides it
 * in, exactly as before. `close` is emitted by the header's ✕, and `toggle` /
 * `erase` re-emit the subject the user clicked so App.vue can call the
 * composable's handlers.
 *
 * `subjects` items are mutated in place (`subject.visible = ...`), which works
 * because the array is deeply reactive in App.vue - do not make it a shallowRef.
 *
 * Known bug carried over unchanged (see AGENTS.md): `eraseSubject` erases the
 * subject's bounding box, so erasing one subject also wipes overlapping pixels
 * of its neighbours.
 *
 * The drawer styles moved here from app.css with the markup, because scoped
 * styles do not cross component boundaries. `.icon-btn` has no rule anywhere in
 * the app, so those two buttons remain unstyled, as they were.
 *
 * Extracted verbatim from App.vue's template during the AI-context refactor; no
 * behaviour was changed.
 */
import { Eye, EyeOff, Eraser } from 'lucide-vue-next'

defineProps({
  /** Detected subjects (owned by useSubjects). */
  subjects: { type: Array, required: true },
  /** Whether the drawer is slid in. */
  open: { type: Boolean, default: false }
})

defineEmits(['close', 'toggle', 'erase'])
</script>

<template>
  <div :class="['subjects-drawer', { open }]">
    <div class="drawer-header">
      <h3>Detected Subjects ({{ subjects.length }})</h3>
      <button class="drawer-close" @click="$emit('close')">✕</button>
    </div>
    <div class="drawer-body">
      <div v-if="subjects.length === 0" class="empty-state">
        No distinct subjects found.
      </div>
      <div v-for="subject in subjects" :key="subject.id" class="subject-item">
        <div class="subject-thumb">
          <img :src="subject.thumbnail" :alt="subject.label" />
        </div>
        <div class="subject-info">
          <span class="subject-label">{{ subject.label }}</span>
          <span class="subject-meta">Area: {{ (subject.pixelRatio * 100).toFixed(1) }}%</span>
        </div>
        <div class="subject-actions">
          <button class="icon-btn" @click="$emit('toggle', subject)" :title="subject.visible ? 'Hide subject' : 'Show subject'">
            <component :is="subject.visible ? Eye : EyeOff" :size="14" />
          </button>
          <button class="icon-btn danger" @click="$emit('erase', subject)" title="Erase subject permanently">
            <Eraser :size="14" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Subjects Drawer */
.subjects-drawer {
  position: absolute;
  top: 0;
  right: -300px;
  width: 280px;
  height: 100%;
  background: rgba(30, 41, 59, 0.95);
  backdrop-filter: blur(10px);
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: -4px 0 20px rgba(0, 0, 0, 0.3);
  transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  z-index: 50; /* Ensure it stays above tools and selection actions */
  pointer-events: auto; /* Ensure clicks work */
}

.subjects-drawer.open {
  right: 0;
}

.drawer-header {
  padding: 12px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.drawer-header h3 {
  font-size: 13px;
  font-weight: 600;
  color: #f1f5f9;
  margin: 0;
}

.drawer-close {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 16px;
  padding: 4px;
}

.drawer-close:hover {
  color: #f87171;
}

.drawer-body {
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.subject-item {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(0, 0, 0, 0.2);
  padding: 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: border-color 0.2s;
}

.subject-item:hover {
  border-color: rgba(99, 102, 241, 0.3);
}

.subject-thumb {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
  flex-shrink: 0;
}

.subject-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.subject-info {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.subject-label {
  font-size: 12px;
  font-weight: 600;
  color: #e2e8f0;
}

.subject-meta {
  font-size: 10.5px;
  color: #94a3b8;
}

.subject-actions {
  display: flex;
  gap: 4px;
}

.empty-state {
  font-size: 12px;
  color: #94a3b8;
  text-align: center;
  margin-top: 20px;
}
</style>
