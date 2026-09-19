<script setup>
/**
 * VIEW 1 of the main content area: the upload hero / dropzone, shown whenever no
 * image is loaded yet.
 *
 * The hidden file input stays inside the dropzone card, because the card's click
 * opens the picker and drag & drop lands on the card. The input ELEMENT itself
 * belongs to `useImageInput` in App.vue, so App.vue hands down a function ref and
 * this component emits the two events that need the raw event object. That keeps
 * the composable's contract, and the regression harness's
 * `.dropzone-card input[type=file]` selector, exactly as they were.
 *
 * Extracted verbatim (markup + its scoped CSS) from App.vue's template during the
 * AI-context refactor; no behaviour was changed.
 *
 * `.btn-cta` is deliberately duplicated from app.css: scoped styles do not cross
 * component boundaries, and the stage footer's download link still needs the copy
 * that stays there.
 *
 * `.demo-showcase-trigger` and `.model-notice-pill` were deleted here. They had no
 * markup anywhere in the app: they arrived with the hero block already dead, were
 * carried through two extractions with a note each time, and have now been
 * dropped rather than carried a third time. The showcase modal they were once
 * wired to is reachable from the navbar's Model Lab button.
 */
import { ShieldCheck, UploadCloud } from 'lucide-vue-next'

defineProps({
  /** Function ref that hands the file input element back to `useImageInput`. */
  inputRef: { type: Function, required: true }
})

defineEmits(['browse', 'drop', 'select'])
</script>

<template>
  <section class="hero-section">
    <div class="hero-badge">
      <ShieldCheck :size="13" />
      <span>BRIA RMBG-1.4 Neural Engine · 100% On-Device</span>
    </div>

    <h1 class="hero-title">
      Cutout anything.<br />
      <span class="gradient-text">Zero data sent to servers.</span>
    </h1>
    <p class="hero-subtitle">
      Next-gen background removal powered by BRIA RMBG-1.4. Handles tough hair, camouflaged clothing, and metallic reflections.
    </p>

    <!-- Dropzone Card -->
    <div
      class="dropzone-card"
      @dragover.prevent
      @drop.prevent="$emit('drop', $event)"
      @click="$emit('browse')"
    >
      <input
        :ref="inputRef"
        type="file"
        accept="image/png, image/jpeg, image/webp"
        class="sr-only"
        @change="$emit('select', $event)"
      />

      <div class="drop-icon-wrapper">
        <UploadCloud :size="36" />
      </div>

      <div class="drop-text">
        <h3>Drop your photo here, or browse</h3>
        <p>JPG, PNG, WebP up to 35 MB</p>
      </div>

      <button type="button" class="btn-cta">
        <UploadCloud :size="16" /> Choose Image
      </button>

      <div class="paste-hint">
        or press <kbd>Ctrl</kbd> + <kbd>V</kbd> anywhere to paste from clipboard
      </div>
    </div>
  </section>
</template>

<style scoped>
/* HERO / DROPZONE VIEW */
.hero-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  max-width: 660px;
  margin: 0 auto;
}

.hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(99, 102, 241, 0.12);
  color: #a5b4fc;
  border: 1px solid rgba(99, 102, 241, 0.25);
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-weight: 500;
  margin-bottom: 12px;
}

.hero-title {
  font-size: 38px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -1px;
  margin-bottom: 8px;
}

.gradient-text {
  background: linear-gradient(135deg, #818cf8 0%, #c084fc 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero-subtitle {
  font-size: 14.5px;
  color: #94a3b8;
  margin-bottom: 22px;
  line-height: 1.4;
}

.dropzone-card {
  width: 100%;
  background: rgba(30, 41, 59, 0.4);
  border: 2px dashed rgba(148, 163, 184, 0.25);
  border-radius: 20px;
  padding: 38px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  transition: all 0.25s ease;
  backdrop-filter: blur(8px);
}

.dropzone-card:hover {
  border-color: #818cf8;
  background: rgba(30, 41, 59, 0.65);
  transform: translateY(-2px);
}

.drop-icon-wrapper {
  width: 56px;
  height: 56px;
  background: rgba(99, 102, 241, 0.12);
  color: #818cf8;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  border: 1px solid rgba(99, 102, 241, 0.25);
}

.drop-text h3 {
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 4px;
}

.drop-text p {
  font-size: 12.5px;
  color: #64748b;
  margin-bottom: 16px;
}

.paste-hint {
  margin-top: 12px;
  font-size: 11.5px;
  color: #64748b;
}

kbd {
  background: #1e293b;
  border: 1px solid #475569;
  border-radius: 4px;
  padding: 2px 5px;
  font-size: 10px;
  color: #cbd5e1;
}

.sr-only { display: none; }

/* Also lives in app.css for the stage footer's download link. */
.btn-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  border: none;
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  box-shadow: 0 3px 12px rgba(99, 102, 241, 0.35);
  transition: all 0.2s ease;
}

.btn-cta:hover {
  opacity: 0.95;
  transform: translateY(-1px);
}
</style>
