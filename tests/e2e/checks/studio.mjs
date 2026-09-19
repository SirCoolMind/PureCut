/**
 * Upload + inference + the mask-mutation paths (brush stroke, wand selection,
 * erase region, presets, reset).
 *
 * Part of the PureCut e2e suite. Extracted verbatim from
 * `tests/e2e/regression.mjs` (session 4); `h` is the `Harness` from
 * `lib/harness.mjs`, which supplies `check` / `skip` / `checkVisible` / `shoot`
 * and the page. The in-body section banners are the originals.
 *
 * The original guarded everything below the inference step with
 * `if (hasResult) { ... } else { skip(...) }`. The two mutation blocks keep
 * their own copy of that guard verbatim; the long tail (power-user sliders,
 * presets, zoom, export, New Photo) keeps it too, so the structure is the same
 * one-for-one.
 *
 * The stage-viewport checks in `checks/viewport.mjs` run from here, at the end,
 * because the tool and backdrop buttons only exist while the studio is mounted.
 */
import { BASE_URL, FIXTURE, INFERENCE_TIMEOUT } from '../lib/constants.mjs'
import { readTuning, selectTool } from '../lib/harness.mjs'
import { checkBackdrops, checkToolSwitching } from './viewport.mjs'

export async function checkStudio(h) {
  const { page, check, checkVisible, shoot } = h
  // -------------------------------------------------------- inference + studio
  if (h.skipModel) {
    console.log('\nSkipping upload/inference (--no-model)')
    return
  }
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
    await checkVisible('.zoom-floating-toolbar', 'zoom toolbar rendered')

    await checkToolSwitching(h)
    await checkBackdrops(h)

    await checkMaskMutation(h, hasResult)
    await checkKeyboardShortcuts(h, hasResult)
    await checkSelectionTools(h, hasResult)

    if (!hasResult) return

    // Power user sliders
    console.log('\nSidebar / power user mode')
    await page.locator('.mode-btn:has-text("Power User")').click()
    await page.waitForTimeout(300)
    check('power sliders revealed', (await page.locator('.tune-slider').count()) >= 3)
    await shoot(page, '07-power-user')
    await page.locator('.mode-btn:has-text("Standard")').click()
    await page.waitForTimeout(300)
    check('preset cards revealed', (await page.locator('.preset-card').count()) === 4)

    // A preset is only useful if it writes through to the tuning sliders, and
    // the cards are Standard-mode-only while the sliders are Power-mode-only.
    // Apply each card, flip to Power User, read the three range inputs back,
    // and compare against the values applyPreset() promises.
    console.log('\nPresets write through to the power sliders')
    const PRESETS = [
      ['Fine Hair & Fur', ['0.4', '2', '-1'], 'Off'],
      ['Clean Product', ['0.6', '0', '1'], 'Active'],
      ['Deep / Cluttered BG', ['0.75', '0', '2'], 'Active'],
      ['Balanced', ['0.5', '1', '0'], 'Active']
    ]
    for (const [label, expected, deFringe] of PRESETS) {
      await page.locator(`.preset-card:has-text("${label}")`).click()
      await page.waitForTimeout(500)
      const activeCard = (await page.locator('.preset-card.active').innerText()).trim()
      check(
        `preset "${label}" marked active`,
        activeCard.includes(label),
        `active card was "${activeCard}"`
      )
      const applied = await readTuning(page)
      check(
        `preset "${label}" sets threshold/feather/trim`,
        JSON.stringify(applied.values) === JSON.stringify(expected),
        `expected ${JSON.stringify(expected)}, got ${JSON.stringify(applied.values)}`
      )
      check(
        `preset "${label}" sets de-fringe to ${deFringe}`,
        applied.deFringe === deFringe,
        `got "${applied.deFringe}"`
      )
    }
    // No preset may leave the tuning untouched, otherwise the checks above
    // would pass on a stale read rather than a real write.
    const balanced = await readTuning(page)
    await page.locator('.preset-card:has-text("Clean Product")').click()
    await page.waitForTimeout(500)
    const product = await readTuning(page)
    check(
      'applying a preset moves the sliders',
      JSON.stringify(product.values) !== JSON.stringify(balanced.values),
      `sliders did not move (${JSON.stringify(product.values)})`
    )

    // Zoom controls
    await page.locator('.zoom-btn').first().click()
    await page.waitForTimeout(250)
    check('zoom readout present', (await page.locator('.zoom-level-badge').count()) > 0)
    await page.locator('.zoom-level-badge').click()
    await page.waitForTimeout(250)

    // Export actions
    check('download anchor rendered', (await page.locator('.btn-cta[download]').count()) > 0)

    const newPhoto = page.locator('.btn-secondary:has-text("New Photo")')
    check('new photo button rendered', (await newPhoto.count()) > 0)

    // The regression that actually shipped: `reset()` was covered only by a
    // "button is rendered" assertion, so the ReferenceError it threw on click
    // was never seen. Click it and assert the app really returns to the hero.
    console.log('\nNew Photo resets the workspace')
    await newPhoto.click()
    await page.waitForTimeout(900)
    check('New Photo returns to the upload hero', (await page.locator('.hero-section').count()) === 1, 'hero not rendered')
    check('New Photo unmounts the studio', (await page.locator('.studio-workspace').count()) === 0, 'studio still rendered')
    check('New Photo clears the cutout', (await page.locator('.result-img').count()) === 0, 'cutout still rendered')
    await shoot(page, '09-after-reset')
  }
}

export async function checkMaskMutation(h, hasResult) {
  const { page, check, checkVisible, shoot } = h
  // ------------------------------------------------------- mask mutation
  // The suite's original weakness: nearly every control was asserted to be
  // *rendered* and left unclicked, so handlers that threw stayed invisible.
  // A brush stroke is the cheapest way to drive the mask canvas through the
  // whole pipeline, and it has two observable consequences: Undo becomes
  // available (`undoHistory.length` grows) and the cutout gets re-encoded
  // (the export blob and its object URL are replaced).
  if (hasResult) {
    console.log('\nMask mutation (brush stroke)')
    await selectTool(page, 'slider')
    const srcBefore = await page.locator('.result-img').getAttribute('src')
    await selectTool(page, 'brush')
    const surface = page.locator('.brush-interaction-surface')
    const strokeArea = await surface.boundingBox()
    if (strokeArea) {
      await page.mouse.move(strokeArea.x + strokeArea.width * 0.4, strokeArea.y + strokeArea.height * 0.4)
      await page.mouse.down()
      await page.mouse.move(strokeArea.x + strokeArea.width * 0.5, strokeArea.y + strokeArea.height * 0.5, { steps: 8 })
      await page.mouse.move(strokeArea.x + strokeArea.width * 0.6, strokeArea.y + strokeArea.height * 0.6, { steps: 8 })
      await page.mouse.up()
    } else {
      check('brush interaction surface has a layout box', false, 'no bounding box')
    }
    // Pointer up triggers the debounced full-quality recomposite (~120 ms)
    // plus PNG encoding.
    await page.waitForTimeout(1500)
    check(
      'brush stroke enabled Undo',
      !(await page.locator('.btn-mini:has-text("Undo")').isDisabled()),
      'Undo still disabled after a stroke'
    )
    await selectTool(page, 'slider')
    const srcAfter = await page.locator('.result-img').getAttribute('src')
    check(
      'brush stroke re-encoded the cutout',
      !!srcAfter && srcAfter !== srcBefore,
      `result src unchanged (${srcAfter})`
    )
    await shoot(page, '08-after-brush-stroke')
  } else {
    skip('brush stroke enabled Undo', 'no cutout to paint on (model weights unavailable)')
    skip('brush stroke re-encoded the cutout', 'no cutout to paint on (model weights unavailable)')
  }
}

export async function checkKeyboardShortcuts(h, hasResult) {
  const { page, check } = h
  // --------------------------------------------- keyboard shortcuts (undo/redo)
  // `useKeyboardShortcuts` is the only way to reach redo: there is no Redo
  // button in the UI (`StageFooter` renders Undo only, and the sidecar toolbars
  // have none), so a broken Ctrl+Shift+Z would be invisible to every other
  // check. Undo is the observable proxy - its disabled state tracks
  // `undoHistory.length <= 1`.
  //
  // This runs immediately after checkMaskMutation on purpose: the brush stroke
  // it just made is what gives us a history entry to move through. A Ctrl+Z
  // here pops back to the pristine mask, which disables Undo again.
  if (hasResult) {
    console.log('\nKeyboard shortcuts (undo / redo)')
    // The Undo button only exists in Magic Brush mode, and checkMaskMutation
    // leaves the slider tool selected, so go back to the brush first.
    await selectTool(page, 'brush')
    const undoBtn = page.locator('.btn-mini:has-text("Undo")').first()
    check('Undo is available after the stroke', !(await undoBtn.isDisabled()), 'Undo disabled before Ctrl+Z')

    await page.keyboard.press('Control+z')
    await page.waitForTimeout(1200)
    check('Ctrl+Z undoes the stroke', await undoBtn.isDisabled(), 'Undo still enabled after Ctrl+Z (history did not move)')

    await page.keyboard.press('Control+Shift+z')
    await page.waitForTimeout(1200)
    check('Ctrl+Shift+Z redoes the stroke', !(await undoBtn.isDisabled()), 'Undo still disabled - redo did not restore the entry')

    // Ctrl+Y is the second redo binding. Undo first so its effect is observable
    // rather than a no-op on an already-empty redo stack.
    await page.keyboard.press('Control+z')
    await page.waitForTimeout(1200)
    await page.keyboard.press('Control+y')
    await page.waitForTimeout(1200)
    check('Ctrl+Y is accepted as redo', !(await undoBtn.isDisabled()), 'undo history empty after Ctrl+Y')
  } else {
    skip('Ctrl+Z undoes the stroke', 'no cutout to undo on (model weights unavailable)')
    skip('Ctrl+Shift+Z redoes the stroke', 'no cutout to redo on (model weights unavailable)')
    skip('Ctrl+Y is accepted as redo', 'no cutout to redo on (model weights unavailable)')
  }
}

export async function checkSelectionTools(h, hasResult) {
  const { page, check, checkVisible, shoot } = h
  // ------------------------------------------------- selection + erase
  // A magic-wand click is the only selection path that starts the
  // marching-ants loop, so it is also the only path that exercises the
  // selection canvas. "Erase Region" then mutates the mask through a third
  // code path (applySelectionAction). Neither was clicked before.
  if (hasResult) {
    console.log('\nSelection tools (magic wand + erase region)')
    await selectTool(page, 'select')
    await page.locator('.select-toolbar .b-pill:has-text("Magic Wand")').first().click()
    await page.waitForTimeout(300)
    const selSurface = page.locator('.selection-interaction-surface')
    const selBox = await selSurface.boundingBox()
    if (selBox) {
      await page.mouse.click(selBox.x + selBox.width * 0.5, selBox.y + selBox.height * 0.45)
    } else {
      check('selection surface has a layout box', false, 'no bounding box')
    }
    await page.waitForTimeout(900)
    check(
      'wand click created a selection',
      (await page.locator('.selection-actions-group').count()) > 0,
      'no selection action buttons appeared'
    )
    // The ants loop sizes this canvas to the image on its first frame. An
    // untouched canvas keeps the browser's 300x150 default, which means
    // neither the animation loop nor the canvas ref is doing its job.
    const antsSize = await page.locator('.selection-overlay-canvas').evaluate((el) => `${el.width}x${el.height}`)
    check('marching-ants canvas sized to the image', antsSize !== '300x150', `canvas was ${antsSize}`)
    await shoot(page, '08b-wand-selection')

    // The other half of useKeyboardShortcuts: Escape must drop the selection.
    // There is no "dismiss selection" button, so this key is the only affordance.
    // Done before the erase click so the erase path below still gets a selection.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(600)
    check('Escape cleared the selection', (await page.locator('.selection-actions-group').count()) === 0, 'selection actions still visible after Escape')

    // Re-select, so the erase-region path below still has something to act on.
    await page.mouse.click(selBox.x + selBox.width * 0.5, selBox.y + selBox.height * 0.45)
    await page.waitForTimeout(900)

    const srcBeforeErase = await page.locator('.result-img').getAttribute('src')
    const eraseBtn = page.locator('.btn-sel-action.erase-btn')
    if (await eraseBtn.count()) {
      await eraseBtn.click()
      await page.waitForTimeout(1500)
      check('erase region cleared the selection', (await page.locator('.selection-actions-group').count()) === 0)
      check(
        'erase region re-encoded the cutout',
        (await page.locator('.result-img').getAttribute('src')) !== srcBeforeErase,
        'result src unchanged'
      )
    }
  } else {
    skip('wand click created a selection', 'no cutout to select on (model weights unavailable)')
    skip('marching-ants canvas sized to the image', 'no cutout to select on (model weights unavailable)')
    skip('Escape cleared the selection', 'no cutout to select on (model weights unavailable)')
    skip('erase region re-encoded the cutout', 'no cutout to select on (model weights unavailable)')
    skip('erase region re-encoded the cutout', 'no cutout to select on (model weights unavailable)')
  }
}
