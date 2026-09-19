/**
 * The three lazy-loaded modals and their prop/emit wiring.
 *
 * Part of the PureCut e2e suite. Extracted verbatim from
 * `tests/e2e/regression.mjs` (session 4); `h` is the `Harness` from
 * `lib/harness.mjs`, which supplies `check` / `skip` / `checkVisible` / `shoot`
 * and the page. The in-body section banners are the originals.
 */

export async function checkModals(h) {
  const { page, check, checkVisible, shoot } = h
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
}
