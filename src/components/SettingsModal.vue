<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('close')">
    <div class="modal-container">
      <div class="modal-header">
        <div style="display: flex; align-items: center; gap: 8px;">
          <Settings :size="18" class="text-indigo-400" />
          <h2 class="modal-title">App Settings</h2>
        </div>
        <button class="btn-close" @click="$emit('close')">✕</button>
      </div>

      <div class="modal-body">
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
        <button class="btn-primary" @click="save">Save Changes</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Settings } from 'lucide-vue-next'

const props = defineProps({
  show: Boolean
})
const emit = defineEmits(['close'])

const token = ref('')

watch(() => props.show, (newVal) => {
  if (newVal) {
    token.value = localStorage.getItem('purecut_hf_token') || ''
  }
})

function save() {
  localStorage.setItem('purecut_hf_token', token.value.trim())
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
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-title {
  font-size: 18px;
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
  padding: 24px;
}
.settings-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.settings-group label {
  font-size: 14px;
  font-weight: 600;
  color: #e2e8f0;
}
.settings-desc {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.5;
  margin: 0 0 8px 0;
}
.settings-desc code {
  background: rgba(255,255,255,0.1);
  padding: 2px 4px;
  border-radius: 4px;
  color: #fca5a5;
}
.settings-input {
  background: #0f172a;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 8px;
  padding: 10px 14px;
  color: white;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}
.settings-input:focus {
  border-color: #818cf8;
}
.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid rgba(255,255,255,0.08);
  display: flex;
  justify-content: flex-end;
}
.btn-primary {
  background: #6366f1;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-primary:hover {
  background: #4f46e5;
}
</style>
