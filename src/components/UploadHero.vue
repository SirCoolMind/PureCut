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
  inputRef: { type: Function, required: true },
  /**
   * URL of the bundled demo photo. Shown as a quick-try card when set; leave it
   * empty and the hero stays a plain dropzone. Resolved by App.vue against Vite's
   * BASE_URL so it works from a sub-path deploy (GitHub Pages) too.
   */
  sampleSrc: { type: String, default: '' }
})

defineEmits(['browse', 'drop', 'select', 'load-sample'])
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
      data-tutorial-id="dropzone"
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

    <!-- Quick try: runs the bundled sample through the full pipeline as-is -->
    <div v-if="sampleSrc" class="sample-try">
      <button class="sample-try-btn" type="button" @click="$emit('load-sample')">
        <img class="sample-thumb" :src="sampleSrc" alt="" aria-hidden="true" />
        <span class="sample-try-text">
          <span class="sample-try-title">Try the sample photo</span>
          <span class="sample-try-sub">One click to run a real cutout</span>
        </span>
        <span class="sample-try-go">Run</span>
      </button>
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

/* Quick-try sample card, sitting under the dropzone. */
.sample-try {
  margin-top: 14px;
  width: 100%;
}

.sample-try-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px 8px 8px;
  background: rgba(30, 41, 59, 0.45);
  border: 1px solid rgba(129, 140, 248, 0.28);
  border-radius: 14px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.sample-try-btn:hover {
  border-color: #818cf8;
  background: rgba(30, 41, 59, 0.7);
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(99, 102, 241, 0.22);
}

.sample-thumb {
  width: 54px;
  height: 54px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  background: #0f1729;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.sample-try-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.sample-try-title {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
}

.sample-try-sub {
  font-size: 11.5px;
  color: #64748b;
}

.sample-try-go {
  flex-shrink: 0;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-size: 11.5px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 8px;
  box-shadow: 0 3px 12px rgba(99, 102, 241, 0.35);
}

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

@media (max-width: 767px) {
  .hero-title {
    font-size: 29px;
  }

  .dropzone-card {
    padding: 26px 16px;
  }

  .drop-icon-wrapper {
    width: 48px;
    height: 48px;
  }

  .sample-thumb {
    width: 46px;
    height: 46px;
  }

  .sample-try-go {
    padding-inline: 12px;
  }
}
</style>
