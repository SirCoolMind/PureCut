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
import { Github } from 'lucide-vue-next'
import { appVersion, appBuildHash } from '../constants.js'
</script>

<template>
  <div class="tab-content about-content">
    <div class="about-logo">
      <div class="about-icon">
        <img src="/purecut-icon.png" alt="PureCut" class="about-icon-img" />
      </div>
      <div>
        <h2>PureCut</h2>
        <p class="about-ver">
          Version {{ appVersion }}
          <span v-if="appBuildHash && appBuildHash !== 'dev'" class="about-hash">• {{ appBuildHash.slice(0, 7) }}</span>
        </p>
      </div>
    </div>
    <p class="about-desc">
      Private, client-side AI background removal studio. Images never leave your device.
      Zero data is sent to any server. Powered by curated ONNX models running entirely in
      your browser via WebGPU and WebAssembly.
    </p>
    <section class="project-details" aria-label="Project details">
      <p class="section-label">Open-source project</p>
      <p>
        Created and maintained by
        <a href="https://github.com/SirCoolMind" target="_blank" rel="noopener noreferrer">Hafiz Ruslan (SirCoolMind)</a>.
        The full source code and local setup instructions are at
        <a href="https://github.com/SirCoolMind/PureCut" target="_blank" rel="noopener noreferrer">github.com/SirCoolMind/PureCut</a>.
      </p>
      <p class="project-local-note">
        You can set it up locally too for more powerful models such as RMBG-2.0. Visit GitHub,
        ask AI to set it up for you, and don't forget to give it a star.
      </p>
      <a class="github-button" href="https://github.com/SirCoolMind/PureCut" target="_blank" rel="noopener noreferrer">
        <Github :size="14" aria-hidden="true" /> GitHub PureCut
      </a>
    </section>
    <div class="about-stats">
      <div class="about-stat">
        <span class="about-stat-label">Engine</span>
        <span class="about-stat-value">RMBG-1.4 + ISNet + MODNet</span>
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
    <section class="engine-sources" aria-labelledby="engine-sources-heading">
      <p id="engine-sources-heading" class="section-label">Engines &amp; model sources</p>
      <ul class="source-list">
        <li><a href="https://huggingface.co/docs/transformers.js" target="_blank" rel="noopener noreferrer">Transformers.js</a><span>Browser inference pipeline engine</span></li>
        <li><a href="https://onnxruntime.ai/docs/get-started/with-javascript/web.html" target="_blank" rel="noopener noreferrer">ONNX Runtime Web</a><span>WebGPU and WebAssembly execution engine</span></li>
        <li><a href="https://huggingface.co/briaai/RMBG-1.4" target="_blank" rel="noopener noreferrer">BRIA RMBG-1.4</a><span>Recommended background-removal model</span></li>
        <li><a href="https://huggingface.co/onnx-community/ISNet-ONNX" target="_blank" rel="noopener noreferrer">ISNet-ONNX</a><span>Salient-object segmentation model</span></li>
        <li><a href="https://huggingface.co/Xenova/modnet" target="_blank" rel="noopener noreferrer">MODNet</a><span>Portrait matting model</span></li>
        <li><a href="https://huggingface.co/onnx-community/BiRefNet_512x512-ONNX" target="_blank" rel="noopener noreferrer">BiRefNet 512 ONNX</a><span>High-quality CPU/WASM model</span></li>
      </ul>
    </section>
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

.project-details,
.engine-sources {
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
  padding: 12px;
}

.section-label {
  color: #a5b4fc;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.09em;
  margin: 0 0 6px;
  text-transform: uppercase;
}

.project-details p {
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.55;
  margin: 0;
}

.project-details a,
.source-list a {
  color: #a5b4fc;
  text-decoration: none;
}

.project-details a:hover,
.source-list a:hover {
  text-decoration: underline;
}

.project-local-note {
  margin-top: 10px !important;
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

.engine-sources {
  padding-bottom: 8px;
}

.source-list {
  display: grid;
  gap: 7px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.source-list li {
  align-items: baseline;
  display: flex;
  gap: 7px;
  justify-content: space-between;
  line-height: 1.35;
}

.source-list a {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;
}

.source-list span {
  color: #64748b;
  font-size: 11px;
  text-align: right;
}

.github-button {
  align-items: center;
  background: linear-gradient(135deg, #a5b4fc, #818cf8);
  border: 1px solid rgba(199, 210, 254, 0.9);
  border-radius: 9px;
  box-shadow: 0 6px 16px rgba(79, 70, 229, 0.28), inset 0 1px rgba(255, 255, 255, 0.35);
  color: #1e1b4b;
  display: inline-flex;
  font-size: 12px;
  font-weight: 700;
  justify-content: center;
  letter-spacing: 0.01em;
  margin-top: 12px;
  padding: 10px 14px;
  gap: 6px;
  text-decoration: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  width: 100%;
  box-sizing: border-box;
}

.project-details .github-button {
  color: #1e1b4b;
  text-decoration: none;
}

.github-button :deep(svg) {
  filter: drop-shadow(0 1px 1px rgba(255, 255, 255, 0.35));
}

.github-button:hover {
  background: linear-gradient(135deg, #c4b5fd, #a5b4fc);
  border-color: #e0e7ff;
  box-shadow: 0 9px 22px rgba(79, 70, 229, 0.38), 0 0 18px rgba(129, 140, 248, 0.35), inset 0 1px rgba(255, 255, 255, 0.45);
  transform: translateY(-2px);
}

</style>
