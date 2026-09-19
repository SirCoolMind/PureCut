<script setup>
/**
 * The stage's top bar: the file/dimension tags on the left, the tool switcher in
 * the middle, and the backdrop switcher on the right.
 *
 * Presentational. It reads `activeTool`, `previewBg`, the subject count and the
 * drawer's open state, and reports changes upward (`update:activeTool`,
 * `update:previewBg`, `toggle-subjects`) so App.vue keeps owning the state.
 *
 * `imageDimensions` arrives as the live reactive object rather than two numbers,
 * so the tag's title and body stay reactive to image changes.
 *
 * Extracted verbatim (markup + its scoped CSS) from App.vue's template during the
 * AI-context refactor; no behaviour was changed.
 */
import { Image as ImageIcon, Users, SplitSquareVertical, Paintbrush, BoxSelect, Move } from 'lucide-vue-next'

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
  previewBg: { type: String, required: true }
})

defineEmits(['toggle-subjects', 'update:activeTool', 'update:previewBg'])
</script>

<template>
  <div class="stage-header">
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
</template>

<style scoped>
.stage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
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
</style>
