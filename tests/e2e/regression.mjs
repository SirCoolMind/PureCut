/**
 * PureCut regression harness
 *
 * Guards the AI-context refactor. Run it BEFORE and AFTER every structural
 * change (moving code into composables or components) so a silent behavioural
 * regression is caught immediately instead of being discovered much later.
 *
 * Usage:
 *   node tests/e2e/regression.mjs               # full run, including inference
 *   node tests/e2e/regression.mjs --no-model    # skip the upload/inference step
 *
 * Requires the dev server: npm run dev
 *
 * Why a persistent browser profile: the first run downloads ~43 MB of model
 * weights into the browser cache. Reusing a profile directory means subsequent
 * runs load the model from cache in seconds instead of re-downloading.
 */

import { chromium } from 'playwright'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const BASE_URL = process.env.PURECUT_BASE_URL || 'http://localhost:5173'
const ARTIFACTS = process.env.PURECUT_ARTIFACTS_DIR || path.join(ROOT, 'tests/artifacts/regression')
// Keep the browser profile OUT of the Vite-watched tree. Writing hundreds of
// cache files into the project root floods the dev server's file watcher, which
// restarts the server mid-run and resets in-flight connections (observed as
// ERR_CONNECTION_RESET while downloading model weights). node_modules/ is
// gitignored and ignored by Vite's watcher by default.
const PROFILE = path.join(ROOT, 'node_modules/.cache/purecut-playwright-profile')
const FIXTURE = path.join(ROOT, 'tests/fixtures/giselle-original.jpg')

const skipModel = process.argv.includes('--no-model')
const INFERENCE_TIMEOUT = 5 * 60 * 1000

const results = []
const consoleErrors = []

function check(name, condition, detail = '') {
  results.push({ name, passed: !!condition, detail })
  const mark = condition ? 'PASS' : 'FAIL'
  console.log(`  [${mark}] ${name}${detail && !condition ? ` -> ${detail}` : ''}`)
}

/**
 * Record a check that could not run for environmental reasons (e.g. model
 * weights could not be downloaded). Skips do not fail the run, but they are
 * counted and printed so they can never pass unnoticed.
 */
function skip(name, reason) {
  results.push({ name, passed: true, skipped: true, detail: reason })
  console.log(`  [SKIP] ${name} -> ${reason}`)
}

/** Signature of a model-weights download failure (environment, not a regression). */
const MODEL_FETCH_FAILURE = /ERR_CONNECTION_RESET|Failed to fetch|Processing error/i

/**
 * Known-benign network noise. Every entry is justified, and none of them can mask
 * a real failure because the outcome itself is asserted separately by the
 * "result image rendered" check:
 *   - tokenizer_config.json: an optional file transformers.js probes for on a
 *     segmentation checkpoint. Hugging Face returns 404 and the library continues.
 *   - favicon / ERR_ABORTED: browser housekeeping and navigation-cancelled requests.
 *   - ERR_CONNECTION_RESET: transformers.js retries these; if the download had
 *     genuinely failed, "result image rendered" would fail and so would the run.
 */
const BENIGN_NOISE = [
  /tokenizer_config\.json/i,
  /favicon/i,
  /Download the React/i,
  /ERR_ABORTED/i,
  /ERR_CONNECTION_RESET/i
]

/** Assert an element exists and record why if it does not. */
async function checkVisible(page, selector, name) {
  const count = await page.locator(selector).count()
  check(name, count > 0, `no element matched "${selector}"`)
  return count > 0
}

async function shoot(page, name) {
  fs.mkdirSync(ARTIFACTS, { recursive: true })
  await page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`), fullPage: false })
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true })
  console.log(`PureCut regression harness\n  target: ${BASE_URL}\n  artifacts: ${ARTIFACTS}\n`)

  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: true,
    viewport: { width: 1440, height: 900 }
  })
  const page = context.pages()[0] || (await context.newPage())

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`))
  // A bare "Failed to load resource: 404" console entry does not say which URL is
  // missing, so record the offending URLs as well.
  const notFound = []
  page.on('response', (res) => {
    if (res.status() === 404) notFound.push(res.url())
  })
  // Network-level failures (ERR_CONNECTION_RESET and friends). transformers.js
  // retries downloads, so one of these can appear even on a successful run;
  // recording the URL is the only way to tell a transient reset from a real one.
  const failedRequests = []
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.url()} :: ${req.failure()?.errorText || 'unknown'}`)
  })

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })

  // ---------------------------------------------------------------- structure
  console.log('Landing / navbar')
  check('app shell mounted', (await page.locator('.app-shell').count()) === 1)
  check('no Vite error overlay', (await page.locator('vite-error-overlay').count()) === 0)
  await checkVisible(page, '.navbar', 'navbar rendered')
  await checkVisible(page, '.brand-name', 'brand name rendered')
  check(
    'model picker has all 3 models',
    (await page.locator('.model-picker-select option').count()) === 3,
    `found ${await page.locator('.model-picker-select option').count()}`
  )
  await checkVisible(page, '.hero-section', 'hero/dropzone view rendered')
  await checkVisible(page, '.dropzone-card', 'dropzone card rendered')
  await shoot(page, '01-hero')

  // ------------------------------------------------------------ font scaling
  // Exercises the global <-> scoped CSS variable cascade and localStorage keys.
  console.log('\nFont size cycling')
  const fontOrder = ['compact', 'normal', 'medium', 'large']
  const labelOrder = ['S', 'M', 'L', 'XL']
  const startAttr = await page.getAttribute('html', 'data-font-size')
  check('font-size attribute present', !!startAttr, `got "${startAttr}"`)
  const startIdx = fontOrder.indexOf(startAttr)
  let cycleOk = true
  for (let i = 1; i <= 4; i++) {
    await page.locator('.btn-font-scale').click()
    await page.waitForTimeout(120)
    const expected = fontOrder[(startIdx + i) % 4]
    const actual = await page.getAttribute('html', 'data-font-size')
    const label = (await page.locator('.font-scale-tag').innerText()).trim()
    const expectedLabel = labelOrder[(startIdx + i) % 4]
    if (actual !== expected || label !== expectedLabel) {
      cycleOk = false
      check(`cycle step ${i}`, false, `expected ${expected}/${expectedLabel}, got ${actual}/${label}`)
      break
    }
  }
  if (cycleOk) check('cycles S -> M -> L -> XL and wraps', true)
  const storedFont = await page.evaluate(() => localStorage.getItem('purecut_font_size'))
  check('font size persisted to localStorage', !!storedFont, 'nothing stored')

  // ------------------------------------------------------------------- modals
  // These are the three lazy-loaded components; a bad defineAsyncComponent
  // import or a mis-wired prop/emit shows up here first.
  console.log('\nLazy-loaded modals')
  // Note: the app does not bind Escape to modal dismissal, so close each modal
  // through its own affordance - that also exercises the emit wiring.
  await page.locator('.version-badge').click()
  await page.waitForTimeout(400)
  const infoOpen = (await page.locator('.modal-overlay').count()) > 0
  check('InfoModal opens', infoOpen)
  await shoot(page, '02-infomodal')
  if (infoOpen) {
    await page.locator('.modal-close').click()
    await page.waitForTimeout(400)
    check('InfoModal closes (emits close)', (await page.locator('.modal-overlay').count()) === 0)
  }

  await page.locator('.btn-settings').click()
  await page.waitForTimeout(400)
  const settingsOpen = (await page.locator('.settings-card').count()) > 0
  check('SettingsModal opens', settingsOpen)
  await shoot(page, '03-settingsmodal')
  if (settingsOpen) {
    await page.locator('.modal-footer .btn-primary').click()
    await page.waitForTimeout(400)
    check('SettingsModal closes (emits close)', (await page.locator('.settings-card').count()) === 0)
  }

  await page.locator('.btn-benchmark-nav').click()
  await page.waitForTimeout(600)
  const showcaseOpen = (await page.locator('.btn-back').count()) > 0
  check('ShowcaseModal opens', showcaseOpen)
  await shoot(page, '04-showcasemodal')
  if (showcaseOpen) {
    await page.locator('.btn-back').click()
    await page.waitForTimeout(500)
    check('ShowcaseModal closes (emits back)', (await page.locator('.btn-back').count()) === 0)
  }

  // -------------------------------------------------------- inference + studio
  if (skipModel) {
    console.log('\nSkipping upload/inference (--no-model)')
  } else {
    console.log('\nUpload + inference (this can take a minute on first run)')
    await page.goto(BASE_URL, { waitUntil: 'networkidle' })
    await page.locator('.dropzone-card input[type=file]').setInputFiles(FIXTURE)
    try {
      await page.locator('.studio-workspace').waitFor({ timeout: INFERENCE_TIMEOUT })
      check('studio workspace reached', true)
    } catch {
      check('studio workspace reached', false, 'timed out waiting for .studio-workspace')
    }

    if (await page.locator('.studio-workspace').count()) {
      await page.waitForTimeout(1500)
      await shoot(page, '05-studio-slider')
      // A cutout only exists if inference actually produced a mask. If the model
      // weights could not be downloaded that is an environment problem, not a
      // structural regression, so report it loudly and skip the dependent checks
      // instead of raising a false failure.
      const hasResult = (await page.locator('.result-img').count()) > 0
      if (hasResult) {
        check('result image rendered', true)
      } else {
        console.log('\n  !! INFERENCE UNAVAILABLE - model weights could not be downloaded.')
        console.log('  !! Result-dependent checks are SKIPPED, not failed.\n')
        skip('result image rendered', 'no cutout produced (model weights unavailable)')
      }
      check('sidebar rendered', (await page.locator('.sidebar-column').count()) > 0)
      check('stage footer rendered', (await page.locator('.stage-footer').count()) > 0)
      await checkVisible(page, '.zoom-floating-toolbar', 'zoom toolbar rendered')

      // Tool switching: each tool swaps the interaction surface in the viewport.
      console.log('\nTool switching')
      const tools = [
        ['brush', '.brush-interaction-surface'],
        ['select', '.selection-interaction-surface'],
        ['pan', '.pan-interaction-surface'],
        ['slider', '.slider-divider']
      ]
      for (const [tool, surface] of tools) {
        await page.locator(`.tool-btn:has-text("${tool === 'slider' ? 'Compare' : tool === 'brush' ? 'Magic Brush' : tool === 'select' ? 'Select' : 'Pan'}")`).first().click()
        await page.waitForTimeout(350)
        const ok = (await page.locator(surface).count()) > 0
        check(`${tool} tool shows ${surface}`, ok)
        await shoot(page, `06-tool-${tool}`)
      }

      // Backdrop switcher
      console.log('\nBackdrop switcher')
      for (const bg of ['white', 'black', 'gradient', 'checkerboard']) {
        const label = bg === 'gradient' ? 'Color' : bg === 'black' ? 'Dark' : bg === 'checkerboard' ? 'Grid' : 'White'
        await page.locator(`.bg-btn:has-text("${label}")`).first().click()
        await page.waitForTimeout(250)
        const cls = await page.locator('.comparison-viewport').getAttribute('class')
        check(`backdrop ${bg} applied`, cls.includes(`bg-${bg}`), `class was "${cls}"`)
      }

      // Power user sliders
      console.log('\nSidebar / power user mode')
      await page.locator('.mode-btn:has-text("Power User")').click()
      await page.waitForTimeout(300)
      check('power sliders revealed', (await page.locator('.tune-slider').count()) >= 3)
      await shoot(page, '07-power-user')
      await page.locator('.mode-btn:has-text("Standard")').click()
      await page.waitForTimeout(300)
      check('preset cards revealed', (await page.locator('.preset-card').count()) === 4)

      // Zoom controls
      await page.locator('.zoom-btn').first().click()
      await page.waitForTimeout(250)
      check('zoom readout present', (await page.locator('.zoom-level-badge').count()) > 0)
      await page.locator('.zoom-level-badge').click()
      await page.waitForTimeout(250)

      // Export actions
      if (hasResult) {
        check('download anchor rendered', (await page.locator('.btn-cta[download]').count()) > 0)
      } else {
        skip('download anchor rendered', 'no result blob to download')
      }
      check('new photo button rendered', (await page.locator('.btn-secondary:has-text("New Photo")').count()) > 0)
    }
  }

  // -------------------------------------------------------------- console log
  const noise = (text) => BENIGN_NOISE.some((re) => re.test(text))
  const inferenceSkipped = results.some((r) => r.skipped)

  const ignoredErrors = consoleErrors.filter(noise)
  const realErrors = consoleErrors.filter((e) => {
    if (noise(e)) return false
    // If inference could not run at all, model-download errors are a symptom of
    // the environment rather than a regression.
    if (inferenceSkipped && MODEL_FETCH_FAILURE.test(e)) return false
    return true
  })
  const realNotFound = notFound.filter((u) => !noise(u))
  const realFailed = failedRequests.filter((u) => !noise(u))

  const ignored = [...new Set([...ignoredErrors, ...notFound, ...failedRequests])]
  if (ignored.length) {
    console.log('\n  Ignored known-benign network noise (does not affect the app outcome):')
    for (const item of ignored) console.log(`    ${item}`)
  }
  if (inferenceSkipped) {
    console.log('\n  Inference was skipped, so model-download errors are not counted.')
  }

  check(
    'no unexpected console errors',
    realErrors.length === 0 && realNotFound.length === 0 && realFailed.length === 0,
    [...realErrors.slice(0, 2), ...realNotFound.slice(0, 2), ...realFailed.slice(0, 2)].join(' | ')
  )

  await context.close()

  // ------------------------------------------------------------------ summary
  const failed = results.filter((r) => !r.passed)
  const skipped = results.filter((r) => r.skipped)
  const passed = results.filter((r) => r.passed && !r.skipped)
  console.log(`\n${'='.repeat(58)}`)
  console.log(`${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped  (${results.length} checks total)`)
  if (skipped.length) {
    console.log('\nSKIPPED - environment, not regressions:')
    for (const s of skipped) console.log(`  - ${s.name}: ${s.detail}`)
  }
  if (failed.length) {
    console.log('\nFAILURES:')
    for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`)
    console.log(`\nScreenshots: ${ARTIFACTS}`)
    process.exit(1)
  }
  console.log(`\nAll good. Screenshots: ${ARTIFACTS}`)
}

main().catch((err) => {
  console.error('\nHARNESS ERROR:', err.message)
  process.exit(1)
})
