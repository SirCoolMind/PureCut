<script setup>
/**
 * The Changelog tab of the Info modal.
 *
 * Renders the `changelog` array from `constants.js` — the same import the
 * host used — so the component needs no props at all.
 *
 * Extracted from `InfoModal.vue` (session 4) together with this tab's scoped
 * CSS. Each tab carries its own copy of `.tab-content` and `@keyframes tabFade`
 * because Vue rewrites both per component scope: a keyframe declared in the host
 * is renamed `tabFade-<hosthash>` and a child component can never reference it.
 * The host keeps the `v-if` that chooses the tab, and `.tab-content` sits on the
 * root here, so the fade-in animation still runs on every tab switch.
 */
import { changelog } from '../constants.js'
</script>

<template>
  <div class="tab-content">
    <div v-for="release in changelog" :key="release.version" class="release-block">
      <div class="release-header">
        <span class="release-version">v{{ release.version }}</span>
        <span :class="['release-tag', release.tag.toLowerCase()]">{{ release.tag }}</span>
        <span class="release-date">{{ release.date }}</span>
      </div>
      <ul class="change-list">
        <li v-for="(change, idx) in release.changes" :key="idx" class="change-item">
          <span :class="['change-badge', change.type]">
            {{ change.type === 'new' ? '✨ NEW' : change.type === 'fix' ? '🐛 FIX' : '⚡ PERF' }}
          </span>
          <span class="change-text">{{ change.text }}</span>
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


/* ---- CHANGELOG TAB ---- */
.release-block {
  margin-bottom: 20px;
}

.release-block:last-child {
  margin-bottom: 0;
}

.release-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.release-version {
  font-size: 15px;
  font-weight: 700;
  color: #f1f5f9;
}

.release-tag {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  padding: 1px 7px;
  border-radius: 9999px;
  letter-spacing: 0.5px;
}

.release-tag.latest {
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.3);
}

.release-tag.previous,
.release-tag.initial {
  background: rgba(100, 116, 139, 0.15);
  color: #94a3b8;
  border: 1px solid rgba(100, 116, 139, 0.25);
}

.release-date {
  font-size: 11px;
  color: #64748b;
  margin-left: auto;
}

.change-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.change-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  line-height: 1.45;
}

.change-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 0;
  border-radius: 4px;
  flex-shrink: 0;
  margin-top: 2px;
  width: 54px;
  text-align: center;
  display: inline-block;
}

.change-badge.new {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.change-badge.perf {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.change-badge.fix {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
  border: 1px solid rgba(59, 130, 246, 0.3);
}

.change-text {
  color: #cbd5e1;
}

</style>
