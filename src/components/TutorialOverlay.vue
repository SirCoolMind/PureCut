<script setup>
/**
 * The guided-tour overlay: a dimmed backdrop with a spotlight cut around one
 * element and a small callout that explains it.
 *
 * Presentational. It receives the step to show and reports Back / Next / Skip
 * upward; `useTutorial` owns the state. The overlay is teleported to `<body>` so
 * it sits above the navbar (z 50) and the async modals (z 9999) regardless of
 * where it is placed in the tree.
 *
 * The spotlight is an SVG mask: a white full-screen rect with a black rounded
 * rect punched where the target is, so the target shows through unclipped. That
 * is what avoids cloning nodes or fighting `document` DOM - the real element is
 * simply left visible.
 *
 * Tracking: the app scales the whole UI with CSS `zoom` when the font size is
 * cycled, and AGENTS.md records that this fires NEITHER `ResizeObserver` NOR
 * `window.resize`. A `requestAnimationFrame` loop that re-reads the target rect
 * is therefore the only reliable way to keep the spotlight glued to its element
 * through that transition. The loop only writes refs when a measured value
 * actually changed, so a settled step costs reads and nothing else.
 *
 * A step whose target is not in the DOM (wrong stage, or a renamed anchor) is
 * shown DOCKED - a centered callout with no hole - rather than pointing at the
 * wrong element.
 */
import { ref, computed, watch, onBeforeUnmount, nextTick, useId } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps({
  /** Whether the overlay is on screen. */
  show: { type: Boolean, default: false },
  /** The step to display; null while closed. */
  step: { type: Object, default: null },
  /** Zero-based index of the step, for the counter and dots. */
  index: { type: Number, default: 0 },
  /** How many steps are visible in the current stage. */
  total: { type: Number, default: 0 },
  /** True when this is the final step, so the primary action reads "Finish". */
  isLast: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'next', 'prev', 'goto'])

// Unique mask id per instance so a future second overlay cannot collide.
const maskId = `purecut-tour-mask-${useId()}`

const calloutRef = ref(null)

/** Hole drawn for the spotlight, in viewport (client) coordinates. */
const spot = ref(null)
/** Callout box position in viewport coordinates. */
const callout = ref({ left: 0, top: 0, docked: false })

const PAD = 8 // breathing room around the spotlighted element
const GAP = 14 // distance between the spotlight and the callout
const MARGIN = 14 // keep the callout this far from the viewport edges

const hasSpot = computed(() => !!spot.value)

const isFirst = computed(() => props.index <= 0)

/** Reads the viewport size, tolerant of exotic embeds. */
function viewport() {
  return {
    w: window.innerWidth || document.documentElement.clientWidth || 0,
    h: window.innerHeight || document.documentElement.clientHeight || 0
  }
}

/** Bounding box of the current step's target, or null when it is not on screen. */
function targetRect() {
  const id = props.step?.id
  if (!id) return null
  const el = document.querySelector(`[data-tutorial-id="${id}"]`)
  if (!el) return null
  const rect = el.getBoundingClientRect()
  // A zero-sized or fully off-screen element has nothing to highlight.
  if (!rect.width || !rect.height) return null
  return rect
}

/** Assign only on a real change, so the rAF loop does not thrash the renderer. */
function setSpot(next) {
  const cur = spot.value
  if (
    cur &&
    next &&
    cur.x === next.x &&
    cur.y === next.y &&
    cur.w === next.w &&
    cur.h === next.h
  ) {
    return
  }
  if (!cur && !next) return
  spot.value = next
}

function setCallout(next) {
  const cur = callout.value
  if (
    cur.left === next.left &&
    cur.top === next.top &&
    cur.docked === next.docked
  ) {
    return
  }
  callout.value = next
}

/**
 * Recompute the spotlight and the callout box from the live layout.
 *
 * Reached every animation frame while the tour is open, which is how the hole
 * keeps up with font-size zoom, window resizes and scrolling.
 */
function measure() {
  const { w: vw, h: vh } = viewport()
  const rect = targetRect()

  if (!rect) {
    setSpot(null)
    // Docked: centered when there is no target, bottom sheet on narrow screens.
    const el = calloutRef.value
    const cw = el ? el.offsetWidth : 320
    const ch = el ? el.offsetHeight : 200
    const narrow = vw < 768
    if (narrow) {
      setCallout({ left: MARGIN, top: vh - ch - MARGIN, docked: true })
    } else {
      setCallout({ left: Math.max(MARGIN, (vw - cw) / 2), top: Math.max(MARGIN, (vh - ch) / 2), docked: true })
    }
    return
  }

  const x = Math.max(0, rect.left - PAD)
  const y = Math.max(0, rect.top - PAD)
  setSpot({
    x,
    y,
    w: Math.min(vw, rect.width + PAD * 2),
    h: Math.min(vh, rect.height + PAD * 2)
  })

  const el = calloutRef.value
  const cw = el ? el.offsetWidth : 320
  const ch = el ? el.offsetHeight : 200
  const narrow = vw < 768

  // On phones the keyboard of controls is short, so dock the sheet at the bottom
  // instead of trying to fit a bubble beside a target that may fill the width.
  if (narrow) {
    setCallout({ left: MARGIN, top: vh - ch - MARGIN, docked: true })
    return
  }

  const sp = spot.value
  const left = Math.min(Math.max(MARGIN, sp.x + sp.w / 2 - cw / 2), Math.max(MARGIN, vw - cw - MARGIN))
  let top = sp.y + sp.h + GAP
  if (top + ch > vh - MARGIN) {
    const above = sp.y - ch - GAP
    top = above >= MARGIN ? above : Math.max(MARGIN, vh - ch - MARGIN)
  }
  setCallout({ left, top, docked: false })
}

// rAF loop, live only while the overlay is shown.
let rafId = 0
function loop() {
  if (!props.show) return
  measure()
  rafId = requestAnimationFrame(loop)
}
function startLoop() {
  cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(loop)
}
function stopLoop() {
  cancelAnimationFrame(rafId)
  rafId = 0
}

watch(
  () => props.show,
  async (open) => {
    if (!open) {
      stopLoop()
      return
    }
    // Reset first so a new step never shows the previous step's hole for a frame.
    spot.value = null
    await nextTick()
    measure()
    startLoop()
    // Move focus to the primary action so Enter and Escape behave predictably.
    nextTick(() => calloutRef.value?.querySelector('.tour-primary')?.focus())
  }
)

// A step change with the overlay already open must re-measure immediately (the
// loop covers it a frame later, but this removes the visible lag).
watch(
  () => [props.step?.id, props.index],
  async () => {
    if (!props.show) return
    await nextTick()
    measure()
  }
)

function onKeydown(e) {
  if (!props.show) return
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}
window.addEventListener('keydown', onKeydown)
window.addEventListener('resize', measure)

onBeforeUnmount(() => {
  stopLoop()
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="show && step" class="tour-root" role="dialog" aria-modal="true" :aria-label="`Tutorial: ${step.title}`">
      <!-- Dimmer + spotlight hole. The mask leaves the target fully visible. -->
      <svg class="tour-svg" aria-hidden="true">
        <defs>
          <mask :id="maskId">
            <rect x="0" y="0" width="100%" height="100%" fill="#fff" />
            <rect
              v-if="spot"
              :x="spot.x"
              :y="spot.y"
              :width="spot.w"
              :height="spot.h"
              rx="10"
              ry="10"
              fill="#000"
            />
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(2, 6, 16, 0.74)" :mask="`url(#${maskId})`" />
        <rect
          v-if="spot"
          class="tour-ring"
          :x="spot.x"
          :y="spot.y"
          :width="spot.w"
          :height="spot.h"
          rx="10"
          ry="10"
        />
      </svg>

      <!-- Callout card -->
      <div
        ref="calloutRef"
        :class="['tour-callout', { docked: !hasSpot }]"
        :style="{ left: callout.left + 'px', top: callout.top + 'px' }"
      >
        <div class="tour-head">
          <span class="tour-count">Step {{ index + 1 }} of {{ total }}</span>
          <button class="tour-close" type="button" title="Skip the tutorial" @click="emit('close')">
            <X :size="14" />
          </button>
        </div>

        <h3 class="tour-title">{{ step.title }}</h3>
        <p class="tour-body">{{ step.body }}</p>

        <div class="tour-dots" role="tablist" aria-label="Tutorial steps">
          <button
            v-for="(s, i) in total"
            :key="i"
            :class="['tour-dot', { active: i === index, done: i < index }]"
            type="button"
            :aria-label="`Go to step ${i + 1}`"
            @click="emit('goto', i)"
          ></button>
        </div>

        <div class="tour-actions">
          <button class="tour-skip" type="button" @click="emit('close')">Skip</button>
          <div class="tour-nav">
            <button v-if="!isFirst" class="tour-back" type="button" @click="emit('prev')">Back</button>
            <button class="tour-primary" type="button" @click="emit('next')">
              {{ isLast ? 'Finish' : 'Next' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.tour-root {
  position: fixed;
  inset: 0;
  z-index: 10050;
}

.tour-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}

/* The glow around the punched hole. */
.tour-ring {
  fill: none;
  stroke: #818cf8;
  stroke-width: 2;
  filter: drop-shadow(0 0 10px rgba(129, 140, 248, 0.65));
}

.tour-callout {
  position: absolute;
  width: 340px;
  max-width: calc(100vw - 28px);
  box-sizing: border-box;
  background: #0f1729;
  border: 1px solid rgba(129, 140, 248, 0.4);
  border-radius: 14px;
  padding: 14px 16px 12px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(99, 102, 241, 0.15);
  color: #e2e8f0;
  animation: tourPop 0.16s ease-out;
}

@keyframes tourPop {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.tour-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.tour-count {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #818cf8;
}

.tour-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  transition: all 0.15s;
}

.tour-close:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}

.tour-title {
  margin: 0 0 5px;
  font-size: 15px;
  font-weight: 700;
  color: #f1f5f9;
  letter-spacing: -0.2px;
}

.tour-body {
  margin: 0;
  font-size: 12.5px;
  line-height: 1.55;
  color: #94a3b8;
}

.tour-dots {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 12px 0 10px;
}

.tour-dot {
  width: 7px;
  height: 7px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: rgba(148, 163, 184, 0.35);
  cursor: pointer;
  transition: all 0.15s;
}

.tour-dot.done {
  background: rgba(129, 140, 248, 0.5);
}

.tour-dot.active {
  background: #818cf8;
  transform: scale(1.35);
}

.tour-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tour-nav {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tour-skip,
.tour-back {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  padding: 7px 8px;
  border-radius: 7px;
  transition: all 0.15s;
}

.tour-skip:hover,
.tour-back:hover {
  color: #e2e8f0;
  background: rgba(255, 255, 255, 0.06);
}

.tour-primary {
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  border: none;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 18px;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
  transition: all 0.15s ease;
}

.tour-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(99, 102, 241, 0.5);
}

/* Phones: full-width bottom sheet, so it never covers a full-width target. */
@media (max-width: 767px) {
  .tour-callout {
    width: auto;
    right: 14px;
    left: 14px !important;
    border-radius: 16px;
  }

  .tour-primary,
  .tour-skip,
  .tour-back {
    min-height: 38px;
  }

  .tour-primary {
    flex: 1;
  }
}
</style>