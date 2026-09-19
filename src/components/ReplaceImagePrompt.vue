<script setup>
/**
 * The "Replace Current Image?" confirmation prompt, teleported to <body>.
 *
 * Shown when a new image arrives (file picker, drop or paste) while a cutout is
 * already on screen. `useImageInput` stages the candidate file and its object URL
 * and shows this prompt instead of destroying the current workspace.
 *
 * The `prompt-modal-*` / `pasted-*` styles live in src/styles/global.css and are
 * UNSCOPED, so unlike the hero there was no CSS to move with this markup.
 * `text-indigo-400` on the Sparkles icon has no rule in this app at all - it is
 * carried over unchanged.
 *
 * Extracted verbatim from App.vue's template during the AI-context refactor; no
 * behaviour was changed.
 */
import { Image as ImageIcon, Sparkles } from 'lucide-vue-next'

defineProps({
  /** Whether the prompt is open (owned by useImageInput). */
  show: { type: Boolean, default: false },
  /** Object URL thumbnail of the staged file. */
  pendingNewImageThumbnail: { type: String, default: null },
  /** The staged file; null until one is chosen. */
  pendingNewImageFile: { type: Object, default: null },
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
            <h2 class="prompt-modal-title">Replace Current Image?</h2>
          </div>
          <button class="prompt-btn-close" @click="$emit('close')" title="Cancel">✕</button>
        </div>

        <!-- Body -->
        <div class="prompt-modal-body">
          <p class="prompt-modal-message">
            You pasted a new image. Would you like to discard the current workspace and process this image?
          </p>

          <!-- Thumbnail & Model Info Card -->
          <div class="pasted-preview-card">
            <!-- Top Row: Thumbnail + Model Box (Name & Size inside same box) -->
            <div class="pasted-top-row">
              <div class="pasted-thumb-box">
                <img :src="pendingNewImageThumbnail" alt="Pasted Thumbnail" class="pasted-thumb-img" />
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

            <!-- Bottom Row: Filename spanning long under both picture and model box -->
            <div v-if="pendingNewImageFile" class="pasted-filename-row" :title="`Filename: ${pendingNewImageFile.name || 'clipboard_image.png'}`">
              <span class="pasted-filename-label">Filename:</span>
              <span class="pasted-filename-val">{{ pendingNewImageFile.name || 'clipboard_image.png' }}</span>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="prompt-modal-footer">
          <button class="prompt-btn-cancel" @click="$emit('close')">Cancel</button>
          <button class="prompt-btn-confirm" @click="$emit('confirm')">
            <Sparkles :size="12" />
            <span>Replace & Process</span>
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
