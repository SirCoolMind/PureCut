<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container">
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <Settings :size="18" class="text-indigo-400" />
          <h2 class="modal-title">App Settings & Accessibility</h2>
        </div>
        <button class="btn-close" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
        <!-- Accessibility & UI Scale -->
        <div class="settings-group">
          <div class="group-header-row">
            <label>Interface Font & Scale Size</label>
            <span class="scale-badge">{{ currentScalePercentage }}</span>
          </div>
          <p class="settings-desc">
            Adjust the text and interface sizing to match your viewing preference. Everything scales responsively without breaking the editor layout.
          </p>
          <div class="font-size-selector">
            <button
              v-for="opt in fontSizeOptions"
              :key="opt.key"
              type="button"
              :class="['font-size-btn', { active: fontSize === opt.key }]"
              @click="setFontSize(opt.key)"
            >
              <span class="font-size-label">{{ opt.label }}</span>
              <span class="font-size-sub">{{ opt.percentage }}</span>
            </button>
          </div>
        </div>
        <div class="divider"></div>

        <!-- Confirm Model Switch Setting -->
        <div class="settings-group">
          <div class="group-header-row">
            <label for="promptModelChange" style="cursor: pointer;">Model Change Confirmation</label>
            <input
              type="checkbox"
              id="promptModelChange"
              v-model="promptOnModelChange"
              class="settings-checkbox"
            />
          </div>
          <p class="settings-desc">
            Show a confirmation prompt asking to re-run the cutout before switching AI models when an image is currently loaded.
          </p>
        </div>
        <div class="divider"></div>

        <!-- Hugging Face Token -->
        <div class="settings-group">
          <label for="hfToken">Hugging Face Access Token (Optional)</label>
          <p class="settings-desc">
            Provide your READ access token if you encounter a <code>429 Too Many Requests</code> error when downloading AI models. 
            This token is saved securely in your browser's local storage and is never sent anywhere except directly to Hugging Face.
          </p>
          <input 
            type="password" 
            id="hfToken" 
            v-model="token" 
            placeholder="hf_..." 
            class="settings-input"
          />
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn-primary" @click="save">Done</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { Settings } from 'lucide-vue-next'

const props = defineProps({
  show: Boolean,
  currentFontSize: {
    type: String,
    default: 'normal'
  }
})
const emit = defineEmits(['close', 'update-font-size'])

const token = ref('')
const fontSize = ref(props.currentFontSize || 'normal')
const promptOnModelChange = ref(true)

const fontSizeOptions = [
  { key: 'compact', label: 'Compact', percentage: '88%' },
  { key: 'normal', label: 'Standard', percentage: '100%' },
  { key: 'medium', label: 'Medium', percentage: '115%' },
  { key: 'large', label: 'Large', percentage: '130%' }
]
const currentScalePercentage = computed(() => {
  const opt = fontSizeOptions.find(o => o.key === fontSize.value)
  return opt ? opt.percentage : '100%'
})

watch(() => props.currentFontSize, (newVal) => {
  if (newVal) {
    fontSize.value = newVal
  }
})
function setFontSize(val) {
  fontSize.value = val
  emit('update-font-size', val)
}

watch(() => props.show, (newVal) => {
  if (newVal) {
    token.value = localStorage.getItem('purecut_hf_token') || ''
    fontSize.value = localStorage.getItem('purecut_font_size') || 'normal'
    const storedPrompt = localStorage.getItem('purecut_prompt_model_change')
    promptOnModelChange.value = storedPrompt === null ? true : storedPrompt === 'true'
  }
})

function save() {
  localStorage.setItem('purecut_hf_token', token.value.trim())
  localStorage.setItem('purecut_prompt_model_change', promptOnModelChange.value ? 'true' : 'false')
  emit('close')
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.modal-container {
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 16px;
  width: 100%;
  max-width: 500px;
  box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 18px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-title {
  font-size: 16px;
  font-weight: 600;
  color: white;
  margin: 0;
}
.text-indigo-400 {
  color: #818cf8;
}
.btn-close {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 18px;
  cursor: pointer;
}
.btn-close:hover {
  color: white;
}
.modal-body {
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.settings-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.group-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.settings-group label {
  font-size: 13.5px;
  font-weight: 600;
  color: #e2e8f0;
}
.scale-badge {
  background: rgba(99, 102, 241, 0.18);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.35);
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 700;
}
.settings-desc {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
  margin: 0 0 4px 0;
}
.settings-desc code {
  background: rgba(255,255,255,0.1);
  padding: 2px 4px;
  border-radius: 4px;
  color: #fca5a5;
}

/* Font Size Selector */
.font-size-selector {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 4px;
}
.font-size-btn {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  padding: 10px 6px;
  color: #cbd5e1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  cursor: pointer;
  transition: all 0.2s ease;
}
.font-size-btn:hover {
  background: rgba(30, 41, 59, 0.8);
  border-color: rgba(99, 102, 241, 0.4);
  color: #ffffff;
}
.font-size-btn.active {
  background: rgba(99, 102, 241, 0.25);
  border-color: #6366f1;
  color: #ffffff;
  box-shadow: 0 0 12px rgba(99, 102, 241, 0.3);
}
.font-size-label {
  font-size: 12.5px;
  font-weight: 600;
}
.font-size-sub {
  font-size: 10.5px;
  color: #94a3b8;
}
.font-size-btn.active .font-size-sub {
  color: #c7d2fe;
}
.divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
}

.settings-input {
  background: #0f172a;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  padding: 10px 14px;
  color: white;
  font-size: 13.5px;
  outline: none;
  transition: border-color 0.2s;
}
.settings-input:focus {
  border-color: #818cf8;
}
.settings-checkbox {
  width: 18px;
  height: 18px;
  accent-color: #6366f1;
  cursor: pointer;
}
.modal-footer {
  padding: 14px 24px;
  border-top: 1px solid rgba(255,255,255,0.08);
  display: flex;
  justify-content: flex-end;
}
.btn-primary {
  background: #6366f1;
  color: white;
  border: none;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover {
  background: #4f46e5;
}
</style>
