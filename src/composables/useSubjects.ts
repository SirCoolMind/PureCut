/**
 * Detected subjects: the per-object list the detection engine produces, plus the
 * drawer that lets each one be hidden or erased.
 *
 * `processImage()` seeds `detectedSubjects` once inference finishes and auto-opens
 * the drawer when more than one subject is found. `refreshDetectionData()` re-runs
 * detection after a manual mask edit, but only while the drawer is open - the
 * pixel analysis is expensive and pointless when nobody is looking at the result.
 *
 * KNOWN BEHAVIOUR, REPORTED NOT FIXED: `toggleSubjectVisibility` / `eraseSubject`
 * clip to and fill the subject's *bounding box*, not its per-component mask, so
 * erasing one subject also wipes any overlapping pixels of its neighbours. The
 * in-code comment acknowledged this before the extraction; it still does.
 *
 * `maskCtx` / `maskCanvas` / `originalCanvas` are read from the canvas store as
 * live bindings, so they always refer to the image currently loaded.
 * `saveUndoState` and `recompositeCanvas` arrive as parameters.
 *
 * Extracted verbatim from App.vue's script during the AI-context refactor; no
 * behaviour was changed.
 */

import { ref } from 'vue'
import { detectSubjects } from '../detectionEngine.js'
import { maskCanvas, maskCtx, originalCanvas } from '../core/canvasStore.js'

/** One connected component found by the detection engine. Mutated in place. */
export interface DetectedSubject {
  id: number | string
  x: number
  y: number
  width: number
  height: number
  /** Toggled in place by toggleSubjectVisibility; read by the drawer's icons. */
  visible: boolean
}

interface SubjectsDeps {
  /** Snapshot the mask before mutating it, for undo. */
  saveUndoState: () => void
  /** Full-quality re-composite; `true` forces an immediate PNG encode. */
  recompositeCanvas: (immediateBlob?: boolean) => void
}

export function useSubjects({ saveUndoState, recompositeCanvas }: SubjectsDeps) {
  /** Empty until inference completes, then one entry per detected object. */
  const detectedSubjects = ref<DetectedSubject[]>([])
  /** Drives the slide-in subjects panel. */
  const showSubjectsDrawer = ref(false)

  function toggleSubjectVisibility(subject: DetectedSubject, forceErase = false) {
    if (forceErase) {
      subject.visible = false
    } else {
      subject.visible = !subject.visible
    }

    // Restore if turning on, erase if turning off
    const action = subject.visible ? 'restore' : 'erase'

    if (maskCtx) {
      maskCtx.save()
      maskCtx.beginPath()
      maskCtx.rect(subject.x, subject.y, subject.width, subject.height)
      maskCtx.clip()

      if (action === 'erase') {
        maskCtx.globalCompositeOperation = 'destination-out'
        maskCtx.fillStyle = 'rgba(0, 0, 0, 1)'
      } else {
        maskCtx.globalCompositeOperation = 'source-over'
        maskCtx.fillStyle = 'rgba(255, 255, 255, 1)'
      }

      // Draw only the exact alpha mask belonging to this connected component? 
      // Wait, we don't have the exact mask of just this component mapped back.
      // We'll fill the bounding box. It's a rough bounding box erase.
      // For a perfect erase, we should really use the pixel binary mask. But filling the rect works for isolated islands.
      maskCtx.fill()
      maskCtx.restore()

      saveUndoState()
      recompositeCanvas(true)
    }
  }

  function eraseSubject(subject: DetectedSubject) {
    toggleSubjectVisibility(subject, true)
    // and remove it from array
    detectedSubjects.value = detectedSubjects.value.filter(s => s.id !== subject.id)
  }

  // Refresh subjects and outline after manual mask edits (brush/selection)
  function refreshDetectionData() {
    if (showSubjectsDrawer.value && maskCanvas && originalCanvas) {
      detectedSubjects.value = detectSubjects(maskCanvas, originalCanvas)
    }
  }

  return { detectedSubjects, showSubjectsDrawer, toggleSubjectVisibility, eraseSubject, refreshDetectionData }
}
