<script setup>
/**
 * The About tab of the Info modal.
 *
 * The only external input is the app version badge, which is read straight
 * from `constants.js` exactly as the host did.
 *
 * Extracted from `InfoModal.vue` (session 4) together with this tab's scoped
 * CSS. Each tab carries its own copy of `.tab-content` and `@keyframes tabFade`
 * because Vue rewrites both per component scope: a keyframe declared in the host
 * is renamed `tabFade-<hosthash>` and a child component can never reference it.
 * The host keeps the `v-if` that chooses the tab, and `.tab-content` sits on the
 * root here, so the fade-in animation still runs on every tab switch.
 */
import { appVersion } from '../constants.js'
</script>

<template>
  <div class="tab-content about-content">
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
</template>

<style scoped>
.tab-content {
  animation: tabFade 0.15s ease-out;
}

@keyframes tabFade {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
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

</style>
