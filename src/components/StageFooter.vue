<script setup>
/**
 * The stage footer: the per-tool hint / controls on the left, and the export
 * actions (New Photo, Copy Cutout, Download) on the right.
 *
 * Presentational and stateless. Every value it shows arrives as a prop and every
 * interaction leaves as an emit, so App.vue keeps owning the refs - including the
 * two tiny two-way bindings (brush size, wand tolerance), which are plain
 * `:value` + an `update:` emit rather than `v-model` because a ref cannot be
 * handed to a child. The `.number` cast that `v-model.number` applied is
 * preserved explicitly (`Number(...)`), since brushSize is arithmetic input.
 *
 * `selectShape`'s pills did two things at once (`selectShape = x; clearSelection()`);
 * the clearing now belongs to the parent's handler for `select-shape`, which keeps
 * "changing shape drops the old selection" in one place.
 *
 * Extracted verbatim (markup + its scoped CSS) from App.vue's template during the
 * AI-context refactor; no behaviour was changed.
 */
import { Eraser, Paintbrush, Undo2, Magnet, Lasso, PenTool, BoxSelect, Wand2, RotateCcw, Check, Copy, Download } from 'lucide-vue-next'

defineProps({
  /** 'slider' | 'brush' | 'select' | 'pan' */
  activeTool: { type: String, required: true },
  /** 'erase' | 'restore' - the brush's current paint mode. */
  brushMode: { type: String, required: true },
  /** Brush radius in pixels. */
  brushSize: { type: Number, required: true },
  /** `undoHistory.length`; the Undo button disables at <= 1. */
  undoHistoryLength: { type: Number, required: true },
  /** 'magnetic' | 'lasso' | 'polygon' | 'rect' | 'wand' */
  selectShape: { type: String, required: true },
  /** Magic wand colour tolerance. */
  wandTolerance: { type: Number, required: true },
  /** Whether an area is currently selected. */
  hasSelection: { type: Boolean, default: false },
  /** "Copied!" flag driving the copy button's label. */
  copied: { type: Boolean, default: false },
  /** True once a cutout blob exists and can be copied. */
  canCopy: { type: Boolean, default: false },
  /** Object URL of the cutout; the download link only exists once it is set. */
  resultUrl: { type: String, default: null },
  /** Loaded file's name, used to build the download filename. */
  fileName: { type: String, default: '' }
})

defineEmits([
  'update:brushMode',
  'update:brushSize',
  'undo',
  'reset-brush',
  'select-shape',
  'update:wandTolerance',
  'apply-selection',
  'clear-selection',
  'reset',
  'copy'
])
</script>

<template>
  <div class="stage-footer">
    <!-- Left Info -->
    <div class="footer-info">
      <span v-if="activeTool === 'slider'" class="slider-hint">
        ↔ Drag slider to compare cutout with original
      </span>
      <div v-else-if="activeTool === 'brush'" class="brush-toolbar">
        <div class="brush-mode-pills">
          <button
            :class="['b-pill', { active: brushMode === 'erase' }]"
            @click="$emit('update:brushMode', 'erase')"
          >
            <Eraser :size="12" /> Erase Extra Background
          </button>
          <button
            :class="['b-pill', { active: brushMode === 'restore' }]"
            @click="$emit('update:brushMode', 'restore')"
          >
            <Paintbrush :size="12" /> Restore Subject
          </button>
        </div>

        <div class="size-control">
          <span>Size: <strong>{{ brushSize }}px</strong></span>
          <input type="range" min="8" max="100" :value="brushSize" @input="$emit('update:brushSize', Number($event.target.value))" class="mini-range" />
        </div>

        <button class="btn-mini" @click="$emit('undo')" :disabled="undoHistoryLength <= 1" title="Undo stroke">
          <Undo2 :size="13" /> Undo
        </button>
        <button class="btn-mini" @click="$emit('reset-brush')" title="Reset to raw AI mask">
          Reset
        </button>
      </div>

      <!-- Selection Tool Footer Controls -->
      <div v-else-if="activeTool === 'select'" class="select-toolbar">
        <div class="brush-mode-pills">
          <button
            :class="['b-pill', { active: selectShape === 'magnetic' }]"
            @click="$emit('select-shape', 'magnetic')"
            title="Smart Magnetic Lasso: Snaps to detected object contours"
          >
            <Magnet :size="12" /> Magnetic Lasso
          </button>
          <button
            :class="['b-pill', { active: selectShape === 'lasso' }]"
            @click="$emit('select-shape', 'lasso')"
            title="Freehand Lasso Selection"
          >
            <Lasso :size="12" /> Freehand
          </button>
          <button
            :class="['b-pill', { active: selectShape === 'polygon' }]"
            @click="$emit('select-shape', 'polygon')"
            title="Click points to draw a precise polygonal perimeter"
          >
            <PenTool :size="12" /> Polygon
          </button>
          <button
            :class="['b-pill', { active: selectShape === 'rect' }]"
            @click="$emit('select-shape', 'rect')"
            title="Rectangle Marquee"
          >
            <BoxSelect :size="12" /> Rectangle
          </button>
          <button
            :class="['b-pill', { active: selectShape === 'wand' }]"
            @click="$emit('select-shape', 'wand')"
            title="Magic Wand: Click to select regions by color similarity"
          >
            <Wand2 :size="12" /> Magic Wand
          </button>
        </div>

        <div v-if="selectShape === 'wand'" class="size-control">
          <span>Tolerance: <strong>{{ wandTolerance }}</strong></span>
          <input type="range" min="1" max="100" :value="wandTolerance" @input="$emit('update:wandTolerance', Number($event.target.value))" class="mini-range" />
        </div>

        <!-- Action Buttons: Visible when an area is selected -->
        <div v-if="hasSelection" class="selection-actions-group">
          <button
            class="btn-sel-action erase-btn"
            @click="$emit('apply-selection', 'erase')"
            title="Erase background inside selected area (Delete key)"
          >
            <Eraser :size="12" /> Erase Region
          </button>
          <button
            class="btn-sel-action restore-btn"
            @click="$emit('apply-selection', 'restore')"
            title="Restore subject inside selected area (Enter key)"
          >
            <Paintbrush :size="12" /> Restore Region
          </button>
          <button
            class="btn-sel-action cancel-btn"
            @click="$emit('clear-selection')"
            title="Deselect area (Esc key)"
          >
            Deselect
          </button>
        </div>
        <span v-else class="select-hint">
          <span v-if="selectShape === 'magnetic'">🧲 Draw around any object — line snaps automatically to its detected edge</span>
          <span v-else-if="selectShape === 'lasso'">✏️ Draw freehand selection around any area</span>
          <span v-else-if="selectShape === 'polygon'">📍 Click points to draw a polygon. Click near start point to close.</span>
          <span v-else-if="selectShape === 'wand'">🪄 Click any area on the image to select similar colors</span>
          <span v-else>⬚ Drag a rectangle box around any area</span>
        </span>
      </div>
      <span v-else-if="activeTool === 'pan'" class="slider-hint">
        ✋ Click and drag anywhere to pan the canvas
      </span>
    </div>

    <!-- Right Action Buttons -->
    <div class="action-buttons">
      <button class="btn-secondary" @click="$emit('reset')" title="Upload another photo">
        <RotateCcw :size="14" /> New Photo
      </button>

      <button class="btn-secondary" @click="$emit('copy')" :disabled="!canCopy">
        <component :is="copied ? Check : Copy" :size="14" />
        {{ copied ? 'Copied!' : 'Copy Cutout' }}
      </button>

      <a
        v-if="resultUrl"
        :href="resultUrl"
        :download="`purecut_${fileName.replace(/\.[^/.]+$/, '')}.png`"
        class="btn-cta"
      >
        <Download :size="15" /> Download High-Res PNG
      </a>
    </div>
  </div>
</template>

<style scoped>
/* Select Mode Footer Toolbar */
.select-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}

.select-hint {
  font-size: 11.5px;
  color: #64748b;
}

.selection-actions-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-sel-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-sel-action.erase-btn {
  background: rgba(239, 68, 68, 0.18);
  color: #fca5a5;
  border: 1px solid rgba(239, 68, 68, 0.4);
}

.btn-sel-action.erase-btn:hover {
  background: rgba(239, 68, 68, 0.3);
  color: #fecaca;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.25);
}

.btn-sel-action.restore-btn {
  background: rgba(16, 185, 129, 0.18);
  color: #6ee7b7;
  border: 1px solid rgba(16, 185, 129, 0.4);
}

.btn-sel-action.restore-btn:hover {
  background: rgba(16, 185, 129, 0.3);
  color: #a7f3d0;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.25);
}

.btn-sel-action.cancel-btn {
  background: rgba(255, 255, 255, 0.08);
  color: #94a3b8;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.btn-sel-action.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #f1f5f9;
}

/* Stage Footer Bar */
.stage-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  padding-top: 2px;
}

.slider-hint {
  font-size: 11.5px;
  color: #64748b;
}

.brush-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brush-mode-pills {
  display: flex;
  gap: 4px;
}

.b-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.b-pill.active {
  background: #6366f1;
  color: white;
  border-color: #6366f1;
}

.size-control {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #94a3b8;
}

.size-control strong {
  color: #818cf8;
}

.mini-range {
  width: 70px;
  height: 4px;
  accent-color: #6366f1;
  cursor: pointer;
}

.btn-mini {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #94a3b8;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
}

.btn-mini:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

/* Duplicated in src/components/UploadHero.vue, where the hero's "Choose Image"
   button needs the same look in its own scope. */
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

.btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.07);
  color: #e2e8f0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 7px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.12);
}
</style>
