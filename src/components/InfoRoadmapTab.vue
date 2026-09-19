<script setup>
/**
 * The Roadmap tab of the Info modal.
 *
 * Renders the `roadmap` array from `constants.js` — the same import the host
 * used — so the component needs no props at all.
 *
 * Extracted from `InfoModal.vue` (session 4) together with this tab's scoped
 * CSS. Each tab carries its own copy of `.tab-content` and `@keyframes tabFade`
 * because Vue rewrites both per component scope: a keyframe declared in the host
 * is renamed `tabFade-<hosthash>` and a child component can never reference it.
 * The host keeps the `v-if` that chooses the tab, and `.tab-content` sits on the
 * root here, so the fade-in animation still runs on every tab switch.
 */
import { roadmap } from '../constants.js'
</script>

<template>
  <div class="tab-content">
    <div class="roadmap-legend">
      <span class="legend-item"><span class="status-pip up-next"></span> Up Next</span>
      <span class="legend-item"><span class="status-pip planned"></span> Planned</span>
      <span class="legend-item"><span class="status-pip done"></span> Done</span>
    </div>
    <div v-for="group in roadmap" :key="group.category" class="roadmap-group">
      <div class="roadmap-category">{{ group.category }}</div>
      <ul class="roadmap-list">
        <li v-for="(item, idx) in group.items" :key="idx" class="roadmap-item">
          <span :class="['status-pip', item.status]"></span>
          <span class="roadmap-text">{{ item.text }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.tab-content {
  animation: tabFade 0.15s ease-out;
}

@keyframes tabFade {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}


/* ---- ROADMAP TAB ---- */
.roadmap-legend {
  display: flex;
  gap: 14px;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #94a3b8;
}

.status-pip {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-pip.up-next {
  background: #6366f1;
  box-shadow: 0 0 6px #6366f1;
}

.status-pip.planned {
  background: #64748b;
}

.status-pip.done {
  background: #10b981;
  box-shadow: 0 0 6px #10b981;
}

.roadmap-group {
  margin-bottom: 16px;
}

.roadmap-group:last-child {
  margin-bottom: 0;
}

.roadmap-category {
  font-size: 12px;
  font-weight: 700;
  color: #f1f5f9;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.roadmap-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.roadmap-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  line-height: 1.45;
}

.roadmap-text {
  color: #94a3b8;
}

</style>
