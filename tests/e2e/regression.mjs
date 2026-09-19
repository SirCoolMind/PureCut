/**
 * PureCut regression harness - the orchestrator.
 *
 * Guards the AI-context refactor: it clicks through the whole app, including
 * inference, and asserts the same checks it always has. Run it BEFORE and AFTER
 * every structural change (moving code into composables or components) so a
 * silent behavioural regression is caught immediately instead of being
 * discovered much later.
 *
 * Usage:
 *   node tests/e2e/regression.mjs               # full run, including inference
 *   node tests/e2e/regression.mjs --no-model    # skip the upload/inference step
 *   npm run test:regression / test:regression:fast
 *
 * Requires the dev server: npm run dev
 *
 * The suite is split so a reader can open one area at a time:
 *   lib/constants.mjs    environment defaults, benign-noise allowlist, fixtures
 *   lib/harness.mjs      Harness class, check/skip, screenshots, noise reporting
 *   checks/landing.mjs   app shell, navbar, model picker, dropzone, font scale
 *   checks/modals.mjs    the three lazy-loaded modals
 *   checks/viewport.mjs  tool switching + the backdrop switcher (run by studio)
 *   checks/studio.mjs    upload + inference + the mask-mutation paths
 *
 * Why a persistent browser profile: the first run downloads ~43 MB of model
 * weights into the browser cache. Reusing a profile directory means subsequent
 * runs load the model from cache in seconds instead of re-downloading.
 */
import { Harness, report } from './lib/harness.mjs'
import { checkFontScale, checkLanding } from './checks/landing.mjs'
import { checkModals } from './checks/modals.mjs'
import { checkStudio } from './checks/studio.mjs'

const skipModel = process.argv.includes('--no-model')

async function main() {
  const h = new Harness({ skipModel })
  await h.start()

  await checkLanding(h)
  await checkFontScale(h)
  await checkModals(h)
  // checkStudio owns the upload + inference step, and therefore also drives the
  // stage viewport checks: `.tool-btn` and `.bg-btn` only exist inside the
  // studio, and the New Photo step at the end of checkStudio returns the app to
  // the landing page.
  await checkStudio(h)

  await h.close()

  process.exit(
    report({
      results: h.results,
      consoleErrors: h.consoleErrors,
      notFound: h.notFound,
      failedRequests: h.failedRequests,
      inferenceSkipped: h.inferenceSkipped,
      baseUrl: h.baseUrl
    })
  )
}

main().catch((err) => {
  console.error('\nHARNESS ERROR:', err.message)
  process.exit(1)
})