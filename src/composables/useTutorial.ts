/**
 * Guided-tour state: whether the overlay is open, which step is showing, and the
 * one-time "you can walk through this" hint on the Tutorial button.
 *
 * The step LIST is not state - it is the static {@link TUTORIAL_STEPS} in
 * `core/tutorial.ts`, and the displayed step is derived from `stepIndex` + the
 * chosen tutorial. `stepIndex` is a LOCAL index into that tutorial's steps, not
 * into the full list.
 *
 * Dependencies arrive as parameters rather than imports, matching the rest of the
 * composables:
 *  - `originalUrl` and `isProcessing` decide which named tutorial is available.
 *    Tutorial 2 only opens when the completed workspace is on screen, so every
 *    studio step has a real target.
 *
 * The hint lives here rather than in the button so "shown once, ever" is one
 * piece of state with one writer. It is written to `localStorage` through the
 * shared `STORAGE_KEYS.tutorialSeen` key, so a reload does not replay it.
 */

import { ref, computed, type Ref } from 'vue'
import { STORAGE_KEYS } from '../core/storageKeys.js'
import { stepsForStage, type TutorialStage } from '../core/tutorial.js'

interface TutorialDeps {
  /** Non-null once an image is loaded. */
  originalUrl: Ref<string | null>
  /** True while the AI pipeline runs; the studio is not on screen yet. */
  isProcessing: Ref<boolean>
}

export function useTutorial({ originalUrl, isProcessing }: TutorialDeps) {
  const tutorialOpen = ref(false)
  const stepIndex = ref(0)
  const tutorialStage = ref<TutorialStage>('landing')

  // The hint is an onboarding nudge, not a feature: once dismissed it never
  // returns, which is why it is read once at setup and written once on dismiss.
  const tutorialHintSeen = ref(readHintSeen())

  /** The studio is reachable only once an image is loaded AND processing is done. */
  const availableStage = computed<TutorialStage>(() =>
    originalUrl.value && !isProcessing.value ? 'studio' : 'landing'
  )

  /** Steps visible in the explicitly opened tutorial, in script order. */
  const visibleSteps = computed(() => stepsForStage(tutorialStage.value))

  /** Step being pointed at; null only if a stage somehow has no steps. */
  const currentStep = computed(() => visibleSteps.value[stepIndex.value] ?? null)

  const isLastStep = computed(() => stepIndex.value >= visibleSteps.value.length - 1)

  function openTutorial() {
    dismissHint()
    tutorialStage.value = availableStage.value
    stepIndex.value = 0
    tutorialOpen.value = true
  }

  function closeTutorial() {
    tutorialOpen.value = false
  }

  /**
   * Advance one step.
   *
    * The two named tutorials are deliberately independent: finishing either one
    * just closes the overlay. Loading the sample remains a separate, explicit
    * action on the upload page.
   */
  function nextStep() {
    if (!isLastStep.value) {
      stepIndex.value += 1
      return
    }
    closeTutorial()
  }

  function prevStep() {
    if (stepIndex.value > 0) stepIndex.value -= 1
  }

  /** Stage-independent jump to a named step (used by the dots). */
  function goToStep(index: number) {
    if (index >= 0 && index < visibleSteps.value.length) stepIndex.value = index
  }

  function dismissHint() {
    if (!tutorialHintSeen.value) {
      tutorialHintSeen.value = true
      try {
        localStorage.setItem(STORAGE_KEYS.tutorialSeen, 'true')
      } catch {
        /* private mode / storage disabled - the hint simply shows again next visit */
      }
    }
  }

  return {
    tutorialOpen,
    stepIndex,
    currentStep,
    visibleSteps,
    isLastStep,
    tutorialHintSeen,
    tutorialStage,
    openTutorial,
    closeTutorial,
    nextStep,
    prevStep,
    goToStep,
    dismissHint
  }
}

/** Reads the persisted hint flag, tolerating a disabled `localStorage`. */
function readHintSeen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.tutorialSeen) === 'true'
  } catch {
    return false
  }
}