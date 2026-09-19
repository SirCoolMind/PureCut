<script setup>
/**
 * The stage's top bar, which is now two rows:
 *  - row 1: the file / dimension / subject tags on the left, with the export
 *    actions (New, Copy, Download PNG) pushed to the trailing edge of the SAME
 *    row, so they sit level with the filename and size they act on.
 *  - row 2: the tool switcher on the left, the backdrop switcher on the right,
 *    so the two "pick one" control groups share one row.
 *
 * Presentational. It reads `activeTool`, `previewBg`, the subject count, the
 * drawer's open state and the three export-state props, and reports changes
 * upward (`update:activeTool`, `update:previewBg`, `toggle-subjects`, `reset`,
 * `copy`) so App.vue keeps owning the state and the handlers.
 *
 * The export actions used to be StageFooter's right-hand group. They moved here
 * because the row that already carries the file meta is where they belong, and
 * the footer keeps only the per-tool controls. `reset` no longer resets on its
 * own: App.vue intercepts it and asks for confirmation before discarding work.
 *
 * `imageDimensions` arrives as the live reactive object rather than two numbers,
 * so the tag's title and body stay reactive to image changes.
 */
import { Image as ImageIcon, Users, SplitSquareVertical, Paintbrush, BoxSelect, Move, RotateCcw, Check, Copy, Download } from 'lucide-vue-next'

defineProps({
  /** Loaded file's name, shown in the file tag. */
  fileName: { type: String, default: '' },
  /** Live `{ width, height }` of the loaded image. */
  imageDimensions: { type: Object, required: true },
  /** Human-readable file size, shown next to the dimensions. */
  fileSize: { type: String, default: '' },
  /** How many subjects detection found; the tag only appears above 1. */
  subjectCount: { type: Number, default: 0 },
  /** Whether the subjects drawer is slid in. */
  subjectsDrawerOpen: { type: Boolean, default: false },
  /** 'slider' | 'brush' | 'select' | 'pan' */
  activeTool: { type: String, required: true },
  /** 'checkerboard' | 'white' | 'black' | 'gradient' */
  previewBg: { type: String, required: true },
  /** "Copied!" flag driving the copy button's label. */
  copied: { type: Boolean, default: false },
  /** True once a cutout blob exists and can be copied. */
  canCopy: { type: Boolean, default: false },
  /** Object URL of the cutout; the download link only exists once it is set. */
  resultUrl: { type: String, default: null }
})

defineEmits(['toggle-subjects', 'update:activeTool', 'update:previewBg', 'reset', 'copy'])
</script>

<template>
  <div class="stage-header">
    <!-- Row 1: file meta on the left, export actions flush to the right edge -->
    <div class="stage-header-row meta-row">
      <div class="meta-tags">
        <span class="tag file-tag" :title="fileName">
          <ImageIcon :size="13" />
          <span class="file-tag-name">{{ fileName }}</span>
        </span>
        <span class="tag info-combined-tag" :title="`Dimensions: ${imageDimensions.width} × ${imageDimensions.height}px | Size: ${fileSize}`">
          {{ imageDimensions.width }}×{{ imageDimensions.height }} · {{ fileSize }}
        </span>
        <button 
          v-if="subjectCount > 1" 
          :class="['tag subject-tag btn', { active: subjectsDrawerOpen }]" 
          @click="$emit('toggle-subjects')"
          title="Toggle subjects panel"
        >
          <Users :size="13" /> {{ subjectCount }} Subjects
        </button>
      </div>

      <!-- Export actions: New / Copy / Download PNG -->
      <div class="header-actions">
        <button class="btn-secondary" @click="$emit('reset')" title="Start over with another photo">
          <RotateCcw :size="14" /> New
        </button>

        <button class="btn-secondary" @click="$emit('copy')" :disabled="!canCopy" title="Copy the cutout to the clipboard">
          <component :is="copied ? Check : Copy" :size="14" />
          {{ copied ? 'Copied!' : 'Copy' }}
        </button>

        <a
          v-if="resultUrl"
          :href="resultUrl"
          :download="`purecut_${fileName.replace(/\.[^/.]+$/, '')}.png`"
          class="btn-cta"
          title="Download the full-resolution cutout as a PNG"
        >
          <Download :size="15" /> Download PNG
        </a>
      </div>
    </div>

    <!-- Row 2: tool switcher on the left, backdrop switcher on the right -->
    <div class="stage-header-row controls-row">
      <!-- Tool Switcher: Compare Slider vs Magic Brush vs Select vs Pan -->
      <div class="tool-switch-bar">
        <button
          :class="['tool-btn', { active: activeTool === 'slider' }]"
          @click="$emit('update:activeTool', 'slider')"
          title="Split Comparison Slider"
        >
          <SplitSquareVertical :size="14" /> Compare
        </button>
        <button
          :class="['tool-btn', { active: activeTool === 'brush' }]"
          @click="$emit('update:activeTool', 'brush')"
          title="Erase or Restore Brush"
        >
          <Paintbrush :size="14" /> Magic Brush
        </button>
        <button
          :class="['tool-btn', { active: activeTool === 'select' }]"
          @click="$emit('update:activeTool', 'select')"
          title="Dotted Marquee Selection (Rectangle & Lasso)"
        >
          <BoxSelect :size="14" /> Select
        </button>
        <button
          :class="['tool-btn', { active: activeTool === 'pan' }]"
          @click="$emit('update:activeTool', 'pan')"
          title="Drag to Pan canvas"
        >
          <Move :size="14" /> Pan
        </button>
      </div>

      <!-- Backdrop Switcher -->
      <div class="backdrop-controls">
        <button
          :class="['bg-btn', { active: previewBg === 'checkerboard' }]"
          @click="$emit('update:previewBg', 'checkerboard')"
          title="Transparent Grid"
        >
          Grid
        </button>
        <button
          :class="['bg-btn', { active: previewBg === 'white' }]"
          @click="$emit('update:previewBg', 'white')"
          title="White"
        >
          White
        </button>
        <button
          :class="['bg-btn', { active: previewBg === 'black' }]"
          @click="$emit('update:previewBg', 'black')"
          title="Dark"
        >
          Dark
        </button>
        <button
          :class="['bg-btn', { active: previewBg === 'gradient' }]"
          @click="$emit('update:previewBg', 'gradient')"
          title="Gradient"
        >
          Color
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stage-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
}

/* Both rows stack to a single column when the stage gets narrow, so nothing
   overflows the column instead of wrapping inside it. */
.stage-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.meta-tags {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.tag {
  background: rgba(255, 255, 255, 0.05);
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 5px;
  color: #94a3b8;
  white-space: nowrap;
}

.file-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #f1f5f9;
  font-weight: 600;
  max-width: 170px;
}

.file-tag-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info-combined-tag {
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}

.subject-tag {
  background: rgba(99, 102, 241, 0.15);
  border: 1px solid rgba(99, 102, 241, 0.3);
  color: #a5b4fc;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  transition: all 0.2s;
}

.subject-tag:hover {
  background: rgba(99, 102, 241, 0.25);
  color: white;
}

.subject-tag.active {
  background: #6366f1;
  color: white;
}

/* Tool switch buttons */
.tool-switch-bar {
  display: flex;
  background: rgba(255, 255, 255, 0.06);
  padding: 2px;
  border-radius: 7px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: transparent;
  border: none;
  color: #94a3b8;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.tool-btn.active {
  background: #6366f1;
  color: white;
}

.backdrop-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.bg-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}

.bg-btn.active {
  background: #6366f1;
  color: white;
  border-color: #6366f1;
}

/* Export actions, moved here from StageFooter so they share the meta row.
   These rules travelled with the markup: scoped styles do not cross a
   component boundary, so the copies that stayed in StageFooter/UploadHero
   cannot reach these buttons. */
.header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.07);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 5px 11px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.13);
  border-color: rgba(255, 255, 255, 0.18);
}

.btn-secondary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: white;
  border: none;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  box-shadow: 0 3px 12px rgba(99, 102, 241, 0.35);
  transition: all 0.2s ease;
}

.btn-cta:hover {
  opacity: 0.95;
  transform: translateY(-1px);
}
</style>
