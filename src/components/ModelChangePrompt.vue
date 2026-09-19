<script setup>
/**
 * The "Switch AI Model?" confirmation prompt, teleported to <body>.
 *
 * Shown when the user picks a different model while a cutout is on screen:
 * switching models means re-running inference, so `useProcessing` stages the
 * choice and asks first. The staged id arrives as `pendingModelId`, and the
 * "don't show this prompt again" checkbox is two-way bound (`useProcessing` owns
 * and persists the underlying ref).
 *
 * The `prompt-modal-*` styles live in src/styles/global.css and are UNSCOPED, so
 * unlike the hero there was no CSS to move with this markup.
 *
 * Extracted verbatim from App.vue's template during the AI-context refactor; no
 * behaviour was changed.
 */
import { RefreshCw, Settings } from 'lucide-vue-next'
import { modelOptions } from '../constants.js'

defineProps({
  /** Whether the prompt is open (owned by useProcessing). */
  show: { type: Boolean, default: false },
  /** Model the user picked but has not confirmed yet. */
  pendingModelId: { type: String, default: '' },
  /** Two-way bound: "Don't show this prompt again". */
  dontAskModelChangeAgain: { type: Boolean, default: false }
})

defineEmits(['close', 'confirm', 'update:dontAskModelChangeAgain'])
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="prompt-modal-overlay" @click.self="$emit('close')">
      <div class="prompt-modal-card">
        <!-- Header -->
        <div class="prompt-modal-header">
          <div class="prompt-modal-title-wrap">
            <div class="prompt-icon-badge">
              <RefreshCw :size="15" />
            </div>
            <h2 class="prompt-modal-title">Switch AI Model?</h2>
          </div>
          <button class="prompt-btn-close" @click="$emit('close')" title="Cancel">✕</button>
        </div>

        <!-- Body -->
        <div class="prompt-modal-body">
          <p class="prompt-modal-message">
            Rerun the process using
            <span class="prompt-model-tag">{{ (modelOptions.find(m => m.id === pendingModelId) || {}).name || pendingModelId }}</span>?
          </p>

          <!-- One-liner Checkbox -->
          <label class="prompt-checkbox-row">
            <input
              type="checkbox"
              :checked="dontAskModelChangeAgain"
              class="prompt-checkbox"
              @change="$emit('update:dontAskModelChangeAgain', $event.target.checked)"
            />
            <span class="prompt-checkbox-text">Don't show this prompt again</span>
          </label>

          <!-- Yellow Hint when ticked -->
          <transition name="fade-hint">
            <div v-if="dontAskModelChangeAgain" class="prompt-settings-hint">
              <Settings :size="13" class="hint-settings-icon" />
              <span>Can be adjusted in Settings <Settings :size="11" class="inline-settings-icon" /></span>
            </div>
          </transition>
        </div>

        <!-- Footer -->
        <div class="prompt-modal-footer">
          <button class="prompt-btn-cancel" @click="$emit('close')">No</button>
          <button class="prompt-btn-confirm" @click="$emit('confirm')">
            <RefreshCw :size="12" />
            <span>Yes, Re-run</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
