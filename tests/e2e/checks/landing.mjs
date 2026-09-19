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
  'model picker has all 3 models',
  (await page.locator('.model-picker-select option').count()) === 3,
  `found ${await page.locator('.model-picker-select option').count()}`
  )
  await checkVisible('.hero-section', 'hero/dropzone view rendered')
  await checkVisible('.dropzone-card', 'dropzone card rendered')
  await shoot(page, '01-hero')
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
