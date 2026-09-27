/**
 * App shell, navbar, model picker, upload hero and the font-scale cycle.
 *
 * Part of the PureCut e2e suite. Extracted verbatim from
 * `tests/e2e/regression.mjs` (session 4); `h` is the `Harness` from
 * `lib/harness.mjs`, which supplies `check` / `skip` / `checkVisible` / `shoot`
 * and the page. The in-body section banners are the originals.
 */

export async function checkLanding(h) {
  const { page, check, checkVisible, shoot } = h
  // ---------------------------------------------------------------- structure
  console.log('Landing / navbar')
  check('app shell mounted', (await page.locator('.app-shell').count()) === 1)
  check('no Vite error overlay', (await page.locator('vite-error-overlay').count()) === 0)
  await checkVisible('.navbar', 'navbar rendered')
  await checkVisible('.brand-name', 'brand name rendered')
  check(
  'model picker has all 4 active models',
  (await page.locator('.model-picker-select option').count()) === 4,
  `found ${await page.locator('.model-picker-select option').count()}`
  )
  await checkVisible('.hero-section', 'hero/dropzone view rendered')
  await checkVisible('.dropzone-card', 'dropzone card rendered')
  await shoot(page, '01-hero')

  // The Standard / Power User toggle only means something with a workspace open,
  // so it must be inert on the upload page and enabled once an image is loaded
  // (the studio checks assert the enabled half).
  check(
    'Standard mode button disabled on the upload page',
    await page.locator('.mode-btn:has-text("Standard")').isDisabled(),
    'Standard was clickable with no image loaded'
  )
  check(
    'Power User mode button disabled on the upload page',
    await page.locator('.mode-btn:has-text("Power User")').isDisabled(),
    'Power User was clickable with no image loaded'
  )
}

export async function checkFontScale(h) {
  const { page, check, checkVisible, shoot } = h
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
}

/**
 * The guided tour, exercised on the clean landing page (no image loaded, so the
 * sample never runs). The tour is visual-only, so this asserts the separately
 * named front-page tutorial opens, its landing steps advance, every target anchor
 * is present, and Skip closes it without changing the page.
 */
export async function checkTutorial(h) {
  const { page, check, checkVisible, shoot } = h
  console.log('\nGuided tour')

  await checkVisible('.btn-tutorial', 'Tutorial 1 button rendered in navbar')
  check(
    'front-page trigger uses the requested Tutorial 1 name',
    (await page.locator('.btn-tutorial').textContent()).trim() === 'Tutorial 1 - Front'
  )

  // Every landing anchor the tour points at must exist, or its step silently docks.
  const anchors = ['model', 'cache', 'font-size', 'version', 'showcase', 'dropzone']
  for (const id of anchors) {
    check(
      `tutorial anchor present: ${id}`,
      (await page.locator(`[data-tutorial-id="${id}"]`).count()) >= 1,
      `[data-tutorial-id="${id}"] not found in the landing DOM`
    )
  }

  await page.locator('.btn-tutorial').click()
  await page.waitForSelector('.tour-root', { timeout: 3000 })
  // `textContent`, not `innerText`: the counter is uppercased by CSS
  // `text-transform`, and innerText reports the rendered casing.
  const count = () => page.locator('.tour-count').textContent().then((t) => t.trim())
  check('front tutorial opens on step 1', (await count()) === 'Step 1 of 7', `got "${await count()}"`)
  await shoot(page, '08-tutorial')

  // Walk to the final front-page step by pressing Next six times.
  for (let i = 0; i < 6; i++) {
    await page.locator('.tour-primary').click()
    await page.waitForTimeout(80)
  }
  check('reaches the final front-page step', (await count()) === 'Step 7 of 7', `got "${await count()}"`)
  check(
    'final front-page step reads Finish',
    (await page.locator('.tour-primary').textContent()).trim() === 'Finish'
  )

  // Skip must dismiss without loading anything: the studio must still be absent.
  await page.locator('.tour-skip').click()
  await page.waitForTimeout(150)
  check('tour closes on Skip', (await page.locator('.tour-root').count()) === 0)
  check(
    'Skip did not start processing',
    (await page.locator('.hero-section').count()) === 1 &&
      (await page.locator('.studio-workspace').count()) === 0,
    'the workspace appeared after skipping the tour'
  )
}
