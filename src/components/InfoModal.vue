<script setup>
import { ref } from 'vue'
import {
  Sparkles,
  BookOpen,
  Map,
  Info,
  HardDrive,
  Trash2,
  X
} from 'lucide-vue-next'
import { appVersion, changelog, roadmap, modelOptions } from '../constants.js'

const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  formattedCacheUsage: {
    type: String,
    default: '0 MB'
  },
  cachedModels: {
    type: Object,
    default: () => ({})
  },
  isClearingCache: {
    type: Boolean,
    default: false
  },
  isProcessing: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close', 'clear-cache'])

const infoTab = ref('changelog') // 'changelog' | 'roadmap' | 'about' | 'storage'
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="modal-overlay" @click.self="emit('close')">
      <div class="info-modal">
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="modal-title">
            <img src="/purecut-icon.png" alt="PureCut" class="modal-title-img" />
            <span>Pure<strong>Cut</strong></span>
            <span class="modal-version">v{{ appVersion }}</span>
          </div>
          <button class="modal-close" @click="emit('close')">
            <X :size="16" />
          </button>
        </div>

        <!-- Tab Switcher -->
        <div class="modal-tabs">
          <button
            :class="['modal-tab', { active: infoTab === 'changelog' }]"
            @click="infoTab = 'changelog'"
          >
            <BookOpen :size="13" /> Changelog
          </button>
          <button
            :class="['modal-tab', { active: infoTab === 'roadmap' }]"
            @click="infoTab = 'roadmap'"
          >
            <Map :size="13" /> Roadmap
          </button>
          <button
            :class="['modal-tab', { active: infoTab === 'about' }]"
            @click="infoTab = 'about'"
          >
            <Info :size="13" /> About
          </button>
          <button
            :class="['modal-tab', { active: infoTab === 'storage' }]"
            @click="infoTab = 'storage'"
          >
            <HardDrive :size="13" /> Storage & Cache
          </button>
        </div>

        <!-- Tab Content -->
        <div class="modal-body">
          <!-- CHANGELOG TAB -->
          <div v-if="infoTab === 'changelog'" class="tab-content">
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

          <!-- ROADMAP TAB -->
          <div v-if="infoTab === 'roadmap'" class="tab-content">
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

          <!-- ABOUT TAB -->
          <div v-if="infoTab === 'about'" class="tab-content about-content">
            <div class="about-logo">
              <div class="about-icon">
                <img src="/purecut-icon.png" alt="PureCut" class="about-icon-img" />
              </div>
              <div>
                <h2>PureCut</h2>
                <p class="about-ver">Version {{ appVersion }}</p>
              </div>
            </div>
            <p class="about-desc">
              Private, client-side AI background removal studio. Images never leave your device — 
              zero data is sent to any server. Powered by BRIA RMBG-1.4 neural engine running 
              entirely in your browser via WebGPU & WebAssembly.
            </p>
            <div class="about-stats">
              <div class="about-stat">
                <span class="about-stat-label">Engine</span>
                <span class="about-stat-value">BRIA RMBG-1.4 + ISNet</span>
              </div>
              <div class="about-stat">
                <span class="about-stat-label">Framework</span>
                <span class="about-stat-value">Vue 3 + Vite</span>
              </div>
              <div class="about-stat">
                <span class="about-stat-label">Runtime</span>
                <span class="about-stat-value">Transformers.js + ONNX</span>
              </div>
              <div class="about-stat">
                <span class="about-stat-label">Privacy</span>
                <span class="about-stat-value">100% On-Device</span>
              </div>
            </div>
            <p class="about-footer">
              Built with ❤️ — All processing happens locally in your browser.
            </p>
          </div>

          <!-- STORAGE & CACHE TAB -->
          <div v-if="infoTab === 'storage'" class="tab-content storage-content">
            <div class="storage-summary-card">
              <div class="storage-summary-icon">
                <HardDrive :size="24" />
              </div>
              <div class="storage-summary-info">
                <span class="storage-summary-label">Total On-Device AI Storage Used</span>
                <div class="storage-summary-val">{{ formattedCacheUsage }}</div>
              </div>
              <button
                class="btn-danger-clear"
                :disabled="isClearingCache || isProcessing"
                @click="emit('clear-cache')"
              >
                <Trash2 :size="13" :class="{ spin: isClearingCache }" />
                {{ isClearingCache ? 'Clearing Storage...' : 'Clear All Cache' }}
              </button>
            </div>

            <div class="storage-desc">
              AI model weights are stored inside your browser's local Cache Storage and IndexedDB so they don't need to be re-downloaded every visit.
            </div>

            <div class="storage-models-list">
              <div class="storage-models-title">Available Neural Models</div>
              <div v-for="m in modelOptions" :key="m.id" class="storage-model-row">
                <div class="storage-model-details">
                  <div class="storage-model-name">
                    {{ m.name }}
                    <span v-if="m.id === 'briaai/RMBG-1.4'" class="mini-tag-sota">Default</span>
                  </div>
                  <div class="storage-model-sub">
                    Size: {{ m.size }} · Engine: {{ m.engine === 'rmbg' ? 'Transformers.js' : '@imgly' }}
                  </div>
                </div>
                <div class="storage-model-status">
                  <span :class="['cache-pill-tag', cachedModels[m.id] ? 'cached' : 'empty']">
                    {{ cachedModels[m.id] ? '✓ Cached Locally' : 'Not Cached' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
/* Modal Overlay */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.info-modal {
  width: 560px;
  max-width: 92vw;
  min-height: 70vh;
  max-height: 70vh;
  background: #0f1729;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(99, 102, 241, 0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: modalSlideIn 0.2s ease-out;
}

@keyframes modalSlideIn {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* Modal Header */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.modal-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  color: #f1f5f9;
}

.modal-title-img {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  object-fit: cover;
  display: block;
}

.modal-title strong {
  color: #818cf8;
}

.modal-version {
  background: rgba(99, 102, 241, 0.15);
  color: #a5b4fc;
  padding: 1px 8px;
  margin: 2px 0px 0px 0px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid rgba(99, 102, 241, 0.25);
}

.modal-close {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  width: 28px;
  height: 28px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.modal-close:hover {
  background: rgba(255, 255, 255, 0.12);
  color: #f1f5f9;
}

/* Tab Switcher */
.modal-tabs {
  display: flex;
  gap: 2px;
  padding: 8px 18px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.modal-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  color: #64748b;
  padding: 8px 14px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.15s;
  margin-bottom: -1px;
}

.modal-tab:hover {
  color: #94a3b8;
}

.modal-tab.active {
  color: #a5b4fc;
  border-bottom-color: #6366f1;
}

/* Modal Body */
.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px;
  min-height: 0;
}

.modal-body::-webkit-scrollbar {
  width: 5px;
}

.modal-body::-webkit-scrollbar-track {
  background: transparent;
}

.modal-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

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

/* ---- ABOUT TAB ---- */
.about-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.about-logo {
  display: flex;
  align-items: center;
  gap: 14px;
}

.about-icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.35);
  flex-shrink: 0;
}

.about-icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 14px;
  display: block;
}

.about-logo h2 {
  font-size: 22px;
  font-weight: 800;
  color: #f1f5f9;
  margin: 0;
  letter-spacing: -0.5px;
}

.about-ver {
  font-size: 12px;
  color: #818cf8;
  margin: 2px 0 0 0;
  font-weight: 600;
}

.about-desc {
  font-size: 13px;
  line-height: 1.6;
  color: #94a3b8;
  margin: 0;
}

.about-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.about-stat {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 8px 12px;
}

.about-stat-label {
  font-size: 11px;
  color: #64748b;
  font-weight: 500;
}

.about-stat-value {
  font-size: 11px;
  color: #e2e8f0;
  font-weight: 600;
}

.about-footer {
  text-align: center;
  font-size: 12px;
  color: #475569;
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* ---- STORAGE & CACHE TAB ---- */
.storage-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.storage-summary-card {
  display: flex;
  align-items: center;
  gap: 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
}

.storage-summary-icon {
  width: 44px;
  height: 44px;
  background: rgba(99, 102, 241, 0.15);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #818cf8;
  flex-shrink: 0;
}

.storage-summary-info {
  flex: 1;
}

.storage-summary-label {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 500;
}

.storage-summary-val {
  font-size: 20px;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: -0.5px;
}

.btn-danger-clear {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.35);
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-danger-clear:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.3);
  color: #fee2e2;
  border-color: rgba(239, 68, 68, 0.6);
}

.btn-danger-clear:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.storage-desc {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
}

.storage-models-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.storage-models-title {
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
  margin-bottom: 2px;
}

.storage-model-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 10px 14px;
}

.storage-model-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #f1f5f9;
  display: flex;
  align-items: center;
  gap: 6px;
}

.mini-tag-sota {
  font-size: 9.5px;
  font-weight: 700;
  background: rgba(99, 102, 241, 0.2);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.4);
  padding: 1px 5px;
  border-radius: 4px;
}

.storage-model-sub {
  font-size: 11px;
  color: #64748b;
  margin-top: 2px;
}

.cache-pill-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 9999px;
}

.cache-pill-tag.cached {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.cache-pill-tag.empty {
  background: rgba(255, 255, 255, 0.04);
  color: #64748b;
  border: 1px solid rgba(255, 255, 255, 0.08);
}
</style>
