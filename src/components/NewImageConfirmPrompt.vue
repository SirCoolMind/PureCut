<script setup>
/**
 * The "Start Over?" confirmation prompt, teleported to <body>.
 *
 * Shown when New is pressed while an image is open, because a new image would
 * discard the current cutout and every brush / selection edit on it. It reuses
 * the `prompt-modal-*` and `pasted-*` design that ReplaceImagePrompt and
 * ModelChangePrompt use - those classes live in src/styles/global.css and are
 * UNSCOPED, so there is no local CSS to move with this markup.
 *
 * Unlike ReplaceImagePrompt there is nothing *staged* here: the image at risk is
 * the one already on screen, so the preview shows `currentImageThumbnail`
 * (`originalUrl`) and the filename of the loaded file.
 */
import { Image as ImageIcon, RotateCcw, Sparkles } from 'lucide-vue-next'

defineProps({
  /** Whether the prompt is open (owned by useImageInput). */
  show: { type: Boolean, default: false },
  /** Object URL of the image currently loaded; the one that would be discarded. */
  currentImageThumbnail: { type: String, default: null },
  /** Name of the loaded file, shown in the filename row. */
  currentFileName: { type: String, default: '' },
  /** `{ name, size }` of the currently selected model. */
  currentModelMeta: { type: Object, required: true }
})

defineEmits(['close', 'confirm'])
</script>

<template>
  <Teleport to="body">
    <div v-if="show" class="prompt-modal-overlay" @click.self="$emit('close')">
      <div class="prompt-modal-card">
        <!-- Header -->
        <div class="prompt-modal-header">
          <div class="prompt-modal-title-wrap">
            <div class="prompt-icon-badge">
              <ImageIcon :size="15" />
            </div>
            <h2 class="prompt-modal-title">Start Over?</h2>
          </div>
          <button class="prompt-btn-close" @click="$emit('close')" title="Cancel">✕</button>
        </div>

        <!-- Body -->
        <div class="prompt-modal-body">
          <p class="prompt-modal-message">
            Your current progress will be lost. Continue?
          </p>

          <!-- Thumbnail & Model Info Card -->
          <div class="pasted-preview-card">
            <div class="pasted-top-row">
              <div class="pasted-thumb-box">
                <img :src="currentImageThumbnail" alt="Current Image Thumbnail" class="pasted-thumb-img" />
              </div>
              <div class="pasted-model-box">
                <div class="pasted-meta-title">Selected AI Model</div>
                <div class="pasted-model-card">
                  <div class="pasted-model-name-line">
                    <Sparkles :size="13" class="text-indigo-400" />
                    <span class="pasted-model-name-text">{{ currentModelMeta.name }}</span>
                  </div>
                  <div class="pasted-model-size-line">
                    Size: {{ currentModelMeta.size }}
                  </div>
                </div>
              </div>
            </div>

            <div v-if="currentFileName" class="pasted-filename-row" :title="`Filename: ${currentFileName}`">
              <span class="pasted-filename-label">Filename:</span>
              <span class="pasted-filename-val">{{ currentFileName }}</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="prompt-modal-footer">
          <button class="prompt-btn-cancel" @click="$emit('close')">Cancel</button>
          <button class="prompt-btn-confirm" @click="$emit('confirm')">
            <RotateCcw :size="12" />
            <span>Discard & Start Over</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>