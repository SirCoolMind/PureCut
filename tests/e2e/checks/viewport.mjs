/**
 * Stage viewport interactions: tool switching and the backdrop switcher.
 *
 * Part of the PureCut e2e suite. Extracted verbatim from
 * `tests/e2e/regression.mjs` (session 4); `h` is the `Harness` from
 * `lib/harness.mjs`, which supplies `check` / `skip` / `checkVisible` / `shoot`
 * and the page. The in-body section banners are the originals.
 */
import { TOOL_LABELS } from '../lib/constants.mjs'
import { selectTool } from '../lib/harness.mjs'

export async function checkToolSwitching(h) {
  const { page, check, checkVisible, shoot } = h
  // The tool switcher only exists inside the studio, which the inference step
  // creates - so there is nothing to drive in --no-model mode.
  if (h.skipModel) return
  // Tool switching: each tool swaps the interaction surface in the viewport.
  console.log('\nTool switching')
  const tools = [
   ['brush', '.brush-interaction-surface'],
   ['select', '.selection-interaction-surface'],
   ['pan', '.pan-interaction-surface'],
   ['slider', '.slider-divider']
  ]
  for (const [tool, surface] of tools) {
   await selectTool(page, tool)
   check(`${tool} tool shows ${surface}`, (await page.locator(surface).count()) > 0)
   // The surface appearing only proves half of it: if `activeTool` stops
   // reaching the switcher, the old button stays highlighted while the new
   // surface renders. Assert exactly one button is marked, and that it is
   // the one that was just clicked.
   const active = (await page.locator('.tool-btn.active').allInnerTexts()).map((t) => t.trim())
   check(
     `${tool} tool is the only active tool`,
     active.length === 1 && active[0].includes(TOOL_LABELS[tool]),
     `active buttons: ${JSON.stringify(active)}`
   )
   await shoot(page, `06-tool-${tool}`)
  }
}

export async function checkBackdrops(h) {
  const { page, check, checkVisible, shoot } = h
  // Same reason as checkToolSwitching: no studio without inference.
  if (h.skipModel) return
  // Backdrop switcher
  console.log('\nBackdrop switcher')
  for (const bg of ['white', 'black', 'gradient', 'checkerboard']) {
   const label = bg === 'gradient' ? 'Color' : bg === 'black' ? 'Dark' : bg === 'checkerboard' ? 'Grid' : 'White'
   await page.locator(`.bg-btn:has-text("${label}")`).first().click()
   await page.waitForTimeout(250)
   const cls = await page.locator('.comparison-viewport').getAttribute('class')
   check(`backdrop ${bg} applied`, cls.includes(`bg-${bg}`), `class was "${cls}"`)
  }
}
