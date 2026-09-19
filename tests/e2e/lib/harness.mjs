/**
 * PureCut e2e harness core: result collection, reporting and the page helpers
 * every `checks/*.mjs` area uses.
 *
 * The harness guards the AI-context refactor. Run it BEFORE and AFTER every
 * structural change (moving code into composables or components) so a silent
 * behavioural regression is caught immediately instead of much later.
 *
 * It is deliberately split so an agent can read one area at a time:
 *   lib/constants.mjs   environment defaults, benign-noise allowlist, fixtures
 *   lib/harness.mjs     this file - Harness class + `check` / `skip` primitives
 *   checks/landing.mjs  app shell, navbar, model picker, dropzone
 *   checks/font-scale.mjs
 *   checks/modals.mjs   the three lazy-loaded modals
 *   checks/studio.mjs   upload + inference + tool surfaces + mask mutation
 *   checks/console.mjs  console/network noise classification and the summary
 *   regression.mjs      thin orchestrator: builds the Harness, runs the areas
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'
import {
  ARTIFACTS,
  BASE_URL,
  BENIGN_NOISE,
  MODEL_FETCH_FAILURE,
  PROFILE,
  TOOL_LABELS
} from './constants.mjs'

/**
 * Collects the outcome of one run and drives the browser.
 *
 * `check` and `skip` are the only ways to record a result, which keeps the
 * pass/fail accounting in one place (see `checks/console.mjs` for the summary).
 */
export class Harness {
  constructor({ skipModel, baseUrl = BASE_URL }) {
    this.skipModel = skipModel
    this.baseUrl = baseUrl
    /** @type {{ name: string, passed: boolean, skipped?: boolean, detail?: string }[]} */
    this.results = []
    this.consoleErrors = []
    /** URLs that returned 404, so a bare "Failed to load resource" can be attributed. */
    this.notFound = []
    /** Network-level failures: `${url} :: ${errorText}`. */
    this.failedRequests = []
    this.page = null
    this.context = null

    // `check` / `skip` / `checkVisible` / `shoot` are arrow properties on
    // purpose: the check modules destructure them out of the harness
    // (`const { page, check } = h`), and a prototype method would arrive
    // unbound, losing `this.results` the first time a check was recorded.
    this.check = (name, condition, detail = '') => {
      this.results.push({ name, passed: !!condition, detail })
      console.log(`  [${condition ? 'PASS' : 'FAIL'}] ${name}${detail && !condition ? ` -> ${detail}` : ''}`)
      return !!condition
    }

    this.skip = (name, reason) => {
      this.results.push({ name, passed: true, skipped: true, detail: reason })
      console.log(`  [SKIP] ${name} -> ${reason}`)
    }

    this.checkVisible = async (selector, name) => {
      const count = await this.page.locator(selector).count()
      this.check(name, count > 0, `no element matched "${selector}"`)
      return count > 0
    }

    this.shoot = async (name) => {
      fs.mkdirSync(ARTIFACTS, { recursive: true })
      await this.page.screenshot({ path: path.join(ARTIFACTS, `${name}.png`), fullPage: false })
    }
  }

  /** True when any check was skipped, i.e. inference did not really run. */
  get inferenceSkipped() {
    return this.results.some((r) => r.skipped)
  }

  /** Start the browser, wire the noise listeners and open the app. */
  async start() {
    fs.mkdirSync(ARTIFACTS, { recursive: true })
    console.log(`PureCut regression harness\n  target: ${this.baseUrl}\n  artifacts: ${ARTIFACTS}\n`)

    this.context = await chromium.launchPersistentContext(PROFILE, {
      headless: true,
      viewport: { width: 1440, height: 900 }
    })
    const { context } = this
    this.page = context.pages()[0] || (await context.newPage())

    this.page.on('console', (msg) => {
      if (msg.type() === 'error') this.consoleErrors.push(msg.text())
    })
    this.page.on('pageerror', (err) => this.consoleErrors.push(`pageerror: ${err.message}`))
    // A bare "Failed to load resource: 404" console entry does not say which URL is
    // missing, so record the offending URLs as well.
    this.page.on('response', (res) => {
      if (res.status() === 404) this.notFound.push(res.url())
    })
    // Network-level failures (ERR_CONNECTION_RESET and friends). transformers.js
    // retries downloads, so one of these can appear even on a successful run;
    // recording the URL is the only way to tell a transient reset from a real one.
    this.page.on('requestfailed', (req) => {
      this.failedRequests.push(`${req.url()} :: ${req.failure()?.errorText || 'unknown'}`)
    })

    await this.page.goto(this.baseUrl, { waitUntil: 'networkidle' })
  }

  async close() {
    await this.context?.close()
  }
}

/** True when a console/network message is on the known-benign allowlist. */
export const isBenign = (text) => BENIGN_NOISE.some((re) => re.test(text))

/**
 * Click a tool in the stage tool switcher and let the viewport settle.
 *
 * Shared by the mask-mutation checks, which have to leave and re-enter the
 * slider tool to read `.result-img` at a moment when the surface is not
 * capturing the pointer.
 */
export async function selectTool(page, tool) {
  await page.locator(`.tool-btn:has-text("${TOOL_LABELS[tool]}")`).first().click()
  await page.waitForTimeout(350)
}

/**
 * Read the three power-user tuning sliders and the de-fringe toggle.
 *
 * Those controls only exist in Power User mode, so this flips the mode switch
 * twice and always leaves the app back in Standard mode.
 */
export async function readTuning(page) {
  await page.locator('.mode-btn:has-text("Power User")').click()
  await page.waitForTimeout(250)
  const values = await page.locator('.tune-slider').evaluateAll((els) => els.map((el) => el.value))
  const deFringe = (await page.locator('.toggle-pill').innerText()).trim()
  await page.locator('.mode-btn:has-text("Standard")').click()
  await page.waitForTimeout(250)
  return { values, deFringe }
}

/**
 * Classify raw console/network noise into pass/fail for the "no unexpected
 * console errors" check, and print what was ignored.
 *
 * A "Failed to load resource" console entry does not include the URL, so it
 * cannot be matched against the allowlist directly. Attribute generic resource
 * errors to benign causes ONLY when a benign 404 was actually observed and no
 * non-benign one was. Otherwise they stay, and fail the run.
 */
export function classifyNoise({ notFound, failedRequests, consoleErrors, inferenceSkipped }) {
  const realNotFound = notFound.filter((u) => !isBenign(u))
  const realFailed = failedRequests.filter((u) => !isBenign(u))
  const genericResourceErrorIsExplained = notFound.length > 0 && realNotFound.length === 0

  const ignoredErrors = consoleErrors.filter(isBenign)
  const suppressedGeneric = genericResourceErrorIsExplained
    ? consoleErrors.filter((e) => /Failed to load resource/i.test(e) && !isBenign(e))
    : []
  const realErrors = consoleErrors.filter((e) => {
    if (isBenign(e)) return false
    if (genericResourceErrorIsExplained && /Failed to load resource/i.test(e)) return false
    // If inference could not run at all, model-download errors are a symptom of
    // the environment rather than a regression.
    if (inferenceSkipped && MODEL_FETCH_FAILURE.test(e)) return false
    return true
  })

  const ignored = [...new Set([...ignoredErrors, ...suppressedGeneric, ...notFound, ...failedRequests])]
  return { realNotFound, realFailed, realErrors, ignored, suppressedGeneric, genericResourceErrorIsExplained }
}

/** Print the ignored-noise block and the final tally. Returns the exit code. */
export function report({ results, consoleErrors, notFound, failedRequests, inferenceSkipped, baseUrl }) {
  const noise = classifyNoise({ notFound, failedRequests, consoleErrors, inferenceSkipped })

  if (noise.ignored.length) {
    console.log('\n  Ignored known-benign network noise (does not affect the app outcome):')
    for (const item of noise.ignored) console.log(`    ${item}`)
    if (noise.suppressedGeneric.length) {
      console.log('    (generic "Failed to load resource" entries above are attributed to these benign 404s)')
    }
  }
  if (inferenceSkipped) {
    console.log('\n  Inference was skipped, so model-download errors are not counted.')
  }

  const { realErrors, realNotFound, realFailed } = noise
  const ok = realErrors.length === 0 && realNotFound.length === 0 && realFailed.length === 0
  results.push({ name: 'no unexpected console errors', passed: ok })
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] no unexpected console errors`)
  if (!ok) {
    console.log(
      `       -> ${[...realErrors.slice(0, 2), ...realNotFound.slice(0, 2), ...realFailed.slice(0, 2)].join(' | ')}`
    )
  }

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
    console.log(`Target was ${baseUrl}`)
    return 1
  }
  console.log(`\nAll good. Screenshots: ${ARTIFACTS}`)
  return 0
}
