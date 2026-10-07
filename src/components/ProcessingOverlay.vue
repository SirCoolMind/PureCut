<script setup>
/** Presentational processing card driven by useProcessing's explicit phase. */
import { computed, ref } from 'vue'
import { Check, Cpu, HardDrive } from 'lucide-vue-next'
import scissorGif from '../assets/scissor-colored-fill.gif'
import { CAN_USE_WEBGPU } from '../core/platform'

const props = defineProps({
  currentStep: { type: Number, default: 0 },
  statusMessage: { type: String, default: '' },
  downloadProgress: { type: Object, required: true },
  telemetry: { type: Object, required: true }
})

const steps = ['Analyzing Image', 'Segmenting Subject', 'Refining Edges', 'Finalizing Output']
const scissorIcon = scissorGif
const runtimeLabel = ref(CAN_USE_WEBGPU ? 'WebGPU' : 'CPU (WASM)')
const visibleStep = computed(() => Math.max(1, props.currentStep))
// Grid items are centered in four equal columns (12.5%, 37.5%, 62.5%, 87.5%),
// so progress targets those centers rather than the track's two outer edges.
const progressWidth = computed(() => ((visibleStep.value - 0.5) / steps.length) * 100)
const phaseDescription = computed(() => {
  if (!props.currentStep) return 'Preparing the AI pipeline...'
  if (props.currentStep === steps.length) return 'Cutout ready — finishing up...'
  return props.statusMessage || `Step ${props.currentStep} of ${steps.length}`
})
</script>

<template>
  <section class="processing-section" aria-busy="true" aria-live="polite">
    <div class="processing-card">
      <header class="processing-header">
        <h2 class="processing-title">Executing Neural Segmentation</h2>
        <p class="processing-subtitle">(Pass 1/2: Standard) ({{ runtimeLabel }})</p>
      </header>

      <div class="processing-stepper">
        <div class="scissor-carriage" :style="{ left: `${progressWidth}%` }" aria-hidden="true">
          <img :src="scissorIcon" class="scissor-icon" alt="" />
        </div>
        <div class="stepper-track"><div class="stepper-fill" :style="{ width: `${progressWidth}%` }"></div></div>
        <div class="step-grid">
          <div v-for="(step, index) in steps" :key="step" class="step-item">
            <span class="stepper-node" :class="{ complete: index + 1 < currentStep, active: index + 1 === visibleStep }">
              <Check v-if="index + 1 < currentStep" :size="8" :stroke-width="4" />
            </span>
            <span class="step-label" :class="{ complete: index + 1 < currentStep, active: index + 1 === visibleStep }">{{ step }}</span>
            <span class="step-status">{{ index + 1 < currentStep ? 'Done' : index + 1 === visibleStep ? 'Active' : 'Pending' }}</span>
          </div>
        </div>
      </div>

      <p class="processing-status">{{ phaseDescription }}</p>
      <div v-if="downloadProgress.isDownloading" class="progress-box">
        <div class="progress-labels"><span>Model Weight Download</span><span>{{ downloadProgress.percent }}%</span></div>
        <div class="progress-track"><div class="progress-fill" :style="{ width: `${downloadProgress.percent}%` }"></div></div>
      </div>

      <div class="telemetry-live-grid">
        <div class="telemetry-live-tile"><div class="tile-header"><span class="tile-badge cpu-badge"><Cpu :size="12" /> CPU</span><span class="tile-category">Compute Cores</span></div><div class="tile-main-value">{{ telemetry.threads }} <span class="val-unit">Logical Threads</span></div></div>
        <div class="telemetry-live-tile"><div class="tile-header"><span class="tile-badge ram-badge"><HardDrive :size="12" /> RAM</span><span class="tile-category">Heap Allocation</span></div><div class="tile-main-value">~180 <span class="val-unit">MB Estimated</span></div></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.processing-section { flex: 1; display: flex; align-items: center; justify-content: center; }
.processing-card { width: min(100%, 610px); padding: 28px 32px; border: 1px solid #1e293b; border-radius: 16px; background: #0f172a; box-shadow: 0 20px 40px rgba(0,0,0,.5); -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
.processing-header { height: 58px; text-align: center; }.processing-title { color: #fff; font-size: 18px; font-weight: 600; letter-spacing: .02em; }.processing-subtitle { height: 20px; margin-top: 6px; color: #94a3b8; font-size: 14px; font-weight: 500; }
.processing-stepper { position: relative; padding-top: 37px; }.scissor-carriage { position: absolute; top: 38.5px; z-index: 2; width: 50px; height: 50px; transform: translate(-50%,-50%); transition: left .7s cubic-bezier(.22,1,.36,1); will-change: left; }.scissor-icon { display: block; width: 50px; height: 50px; object-fit: contain; }.stepper-track { position: relative; height: 3px; background: repeating-linear-gradient(90deg,#475569 0 5px,transparent 5px 10px); }.stepper-fill { height: 100%; background: repeating-linear-gradient(90deg,#60a5fa 0 5px,transparent 5px 10px); transition: width .7s cubic-bezier(.22,1,.36,1); }.step-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); margin-top: -8px; }.step-item { display: grid; justify-items: center; min-width: 0; }.stepper-node { z-index: 1; display: grid; place-items: center; width: 12px; height: 12px; border: 2px solid #475569; border-radius: 50%; background: #0f172a; color: #fff; transition: background-color .3s,border-color .3s,box-shadow .3s; }.stepper-node.complete { border-color: #3b82f6; background: #3b82f6; }.stepper-node.active { border-color: #3b82f6; background: #fff; box-shadow: 0 0 10px #3b82f6; animation: nodePulse 1.4s ease-in-out infinite; }.step-label { min-height: 30px; margin-top: 12px; color: #64748b; font-size: 12px; line-height: 1.2; text-align: center; }.step-label.active { color: #60a5fa; font-weight: 600; }.step-label.complete { color: #94a3b8; }.step-status { min-height: 15px; margin-top: 2px; color: #64748b; font-size: 10px; }.step-item:has(.step-label.active) .step-status { color: #60a5fa; }
.processing-status { height: 22px; margin: 20px 0 16px; overflow: hidden; color: #94a3b8; font-size: 12px; line-height: 22px; text-align: center; text-overflow: ellipsis; white-space: nowrap; }.progress-box { margin: -4px 0 16px; }.progress-labels { display: flex; justify-content: space-between; margin-bottom: 5px; color: #94a3b8; font-size: 11px; }.progress-track { height: 6px; overflow: hidden; border-radius: 999px; background: #334155; }.progress-fill { height: 100%; background: linear-gradient(90deg,#6366f1,#a855f7); transition: width .3s ease; }
.telemetry-live-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }.telemetry-live-tile { min-width: 0; padding: 12px 14px; border: 1px solid #334155; border-radius: 12px; background: #1e293b; }.tile-header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }.tile-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 4px; font-size: 9.5px; font-weight: 700; letter-spacing: .5px; }.cpu-badge { color: #a5b4fc; background: rgba(99,102,241,.2); }.ram-badge { color: #34d399; background: rgba(16,185,129,.2); }.tile-category { min-width: 0; overflow: hidden; color: #94a3b8; font-size: 10.5px; font-weight: 600; text-overflow: ellipsis; text-transform: uppercase; white-space: nowrap; }.tile-main-value { color: #f1f5f9; font-size: 15px; font-weight: 700; }.val-unit { color: #94a3b8; font-size: 11px; font-weight: 400; }
@keyframes nodePulse { 0%,100% { box-shadow: 0 0 5px #3b82f6; } 50% { box-shadow: 0 0 12px #60a5fa; } }
@media (max-width: 520px) { .processing-card { min-width: 0; padding: 24px 10px; }.processing-stepper { margin: 0 2px; }.step-label { font-size: clamp(8px,2.3vw,10px); overflow-wrap: anywhere; }.step-status { font-size: 8px; }.telemetry-live-grid { gap: 8px; }.telemetry-live-tile { padding: 10px; }.tile-category { display: none; } } @media (prefers-reduced-motion: reduce) { .stepper-node.active { animation: none; }.scissor-carriage,.stepper-fill { transition: none; } }
</style>
