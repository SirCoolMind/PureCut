/**
 * The guided-tour step model.
 *
 * Pure data + two pure helpers, so the interesting logic (which stage are we in,
 * when did the step list change) is unit-testable without a DOM. The overlay that
 * renders these steps and the composable that advances them both stay in the Vue
 * layer; nothing here touches `window`.
 *
 * A step's `id` is matched against `[data-tutorial-id="<id>"]` in the DOM. Keeping
 * that contract as a plain string means a step whose target is missing is simply
 * SKIPPED by the overlay rather than pointing at the wrong element - the markup
 * can be reorganised without the tour silently misbehaving.
 */

export type TutorialStage = 'landing' | 'studio'

export const TUTORIAL_NAMES: Record<TutorialStage, string> = {
  landing: 'Tutorial 1 - Front',
  studio: 'Tutorial 2 - Process'
}

/**
 * Which stage a step belongs to. Landing steps cover the upload page (where only
 * the navbar and the dropzone exist); studio steps cover an image that is already
 * loaded. The "docked" callout (no target) works in both.
 */
export interface TutorialStep {
  /** Matches `[data-tutorial-id="<id>"]`; an empty string means a docked callout. */
  id: string
  /** Which stage must be open for this step to be shown. */
  stage: TutorialStage
  title: string
  body: string
}

/**
 * The tour script. Order matters: it is the click order.
 *
 * Tutorial 1 covers the landing page. Tutorial 2 is available once an image has
 * finished processing and walks the workspace: modes, tuning, tools, and export.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  // ---------------------------------------------------------------- landing
  {
    id: '',
    stage: 'landing',
    title: 'Tutorial 1 - Front',
    body:
      'A 30-second tour of the essentials. Everything runs on your device, so nothing you load ever leaves the browser.'
  },
  {
    id: 'model',
    stage: 'landing',
    title: 'Pick your model',
    body:
      'Different checkpoints trade speed for quality. RMBG-1.4 is the recommended all-rounder; BiRefNet 512 is the highest quality but the slowest.'
  },
  {
    id: 'cache',
    stage: 'landing',
    title: 'Preload or clear the cache',
    body:
      'Preload downloads the selected weights ahead of time. The storage pill shows how much is cached, and Clear frees it again.'
  },
  {
    id: 'font-size',
    stage: 'landing',
    title: 'Scale the interface',
    body: 'Cycle the UI text size through S, M, L and XL to suit your screen and eyesight.'
  },
  {
    id: 'version',
    stage: 'landing',
    title: 'Version, changelog and roadmap',
    body: 'Click the version badge for release notes, the planned roadmap and this project\'s details.'
  },
  {
    id: 'showcase',
    stage: 'landing',
    title: 'See the model showcase',
    body: 'Compare the same photo cut out by every model before committing to a long download.'
  },
  {
    id: 'dropzone',
    stage: 'landing',
    title: 'Try a photo',
    body:
      'Use the built-in sample for a quick result, drop your own photo here, or paste one with Ctrl + V. Once processing is complete, Tutorial 2 explains the editor.'
  },

  // ----------------------------------------------------------------- studio
  {
    id: '',
    stage: 'studio',
    title: 'Tutorial 2 - Process',
    body:
      'This tour explains the editing workspace after your image has been processed. Start with Standard mode for presets, or use Power User for detailed controls.'
  },
  {
    id: 'mode',
    stage: 'studio',
    title: 'Standard or Power User',
    body:
      'Standard gives you one-click presets. Power User unlocks the live tuning sliders and engine controls. Try Power User now.'
  },
  {
    id: 'tuning',
    stage: 'studio',
    title: 'Fine-tune the cutout',
    body:
      'Cutoff, edge softness and trim shape the mask, and the TTA toggle tightens tricky edges. Every change re-renders the preview.'
  },
  {
    id: 'tools',
    stage: 'studio',
    title: 'Compare, Magic Brush and more',
    body:
      'Compare drags a before/after slider, Magic Brush erases or restores by hand, Select adds lasso and wand selection, and Pan moves the canvas.'
  },
  {
    id: 'export',
    stage: 'studio',
    title: 'New, Copy and Download',
    body: 'Start over with New, copy the cutout straight to your clipboard, or download the full-resolution PNG.'
  }
] as const

/** Steps that belong to one stage, in script order. */
export function stepsForStage(stage: TutorialStage): TutorialStep[] {
  return TUTORIAL_STEPS.filter((step) => step.stage === stage)
}

/** Stage of the step at `index`; lands on the last step's stage if out of range. */
export function stageAt(index: number): TutorialStage {
  const step = TUTORIAL_STEPS[Math.max(0, Math.min(index, TUTORIAL_STEPS.length - 1))]
  return step ? step.stage : 'landing'
}