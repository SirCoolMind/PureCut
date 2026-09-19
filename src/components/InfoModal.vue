<script setup>
import { ref } from 'vue'
import {
  Sparkles,
  BookOpen,
  Map,
  Info,
  HardDrive,
  X
} from 'lucide-vue-next'
import { appVersion } from '../constants.js'
// One component per tab (session 4). Each carries its own markup and its own
// scoped CSS, which is what took this file from 789 lines to ~230. The host
// still owns `infoTab` and therefore keeps the four `v-if`s.
import InfoChangelogTab from './InfoChangelogTab.vue'
import InfoRoadmapTab from './InfoRoadmapTab.vue'
import InfoAboutTab from './InfoAboutTab.vue'
import InfoStorageTab from './InfoStorageTab.vue'

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
          <!-- The four tabs are separate components (see the imports above). The
               v-if stays here so only the selected tab is mounted, which is what
               fires each tab's tabFade animation on switch. -->
          <InfoChangelogTab v-if="infoTab === 'changelog'" />
          <InfoRoadmapTab v-if="infoTab === 'roadmap'" />
          <InfoAboutTab v-if="infoTab === 'about'" />
          <InfoStorageTab
            v-if="infoTab === 'storage'"
            :formatted-cache-usage="formattedCacheUsage"
            :cached-models="cachedModels"
            :is-clearing-cache="isClearingCache"
            :is-processing="isProcessing"
            @clear-cache="emit('clear-cache')"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/*
 * Scoped since session 4. This block was the only UNSCOPED style block in the
 * repo, which meant its `.modal-overlay`, `.modal-header`, `.modal-body` and
 * `.modal-title` rules applied globally - including to SettingsModal, which
 * defines the same class names itself. That looked like a deliberate override
 * but was not one: a scoped selector carries an extra attribute
 * (`.modal-overlay[data-v-x]`), which outranks the plain class every time, so
 * SettingsModal has always been styled by its own rules and never by these.
 * Scoping them therefore changes nothing on screen - verified by diffing the
 * `02-infomodal` and `03-settingsmodal` harness screenshots before and after.
 * The tab rules that used to live below now sit in the four tab components.
 */
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


</style>
