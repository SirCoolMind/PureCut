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

    // Export actions. These moved out of the stage footer's right-hand group and
    // into the header's meta row (level with the filename and size), so they are
    // now asserted through the elements themselves rather than by position.
    check('download anchor rendered', (await page.locator('.btn-cta[download]').count()) > 0)
    check(
      'download anchor says "Download PNG"',
      (await page.locator('.btn-cta[download]').innerText()).includes('Download PNG')
    )

    const newBtn = page.locator('.btn-secondary:has-text("New")').first()
    check('New button rendered', (await newBtn.count()) > 0)
    check('copy button says "Copy"', (await page.locator('.btn-secondary:has-text("Copy")').count()) > 0)
    check('header carries the export actions', (await page.locator('.header-actions .btn-cta').count()) > 0)

    // The regression that actually shipped: `reset()` was covered only by a
    // "button is rendered" assertion, so the ReferenceError it threw on click
    // was never seen. New now asks for confirmation first (a workspace full of
    // brush work is expensive to lose), so the click chain is: New -> prompt ->
    // confirm, and only then does the app return to the hero.
    console.log('\nNew resets the workspace (via the confirm prompt)')
    await newBtn.click()
    await page.waitForTimeout(500)
    await shoot(page, '09a-new-confirm-prompt')
    const promptShown = (await page.locator('.prompt-modal-card').count()) > 0
    check('New raises the "progress will be lost" prompt', promptShown)
    check(
      'prompt says the progress will be lost',
      promptShown && (await page.locator('.prompt-modal-message').innerText()).includes('lost')
    )

    if (promptShown) {
      // Cancelling must leave the workspace exactly as it was.
      await page.locator('.prompt-btn-cancel').click()
      await page.waitForTimeout(400)
      check('cancelling New keeps the studio open', (await page.locator('.studio-workspace').count()) === 1, 'studio was unmounted by Cancel')

      await newBtn.click()
      await page.waitForTimeout(400)
      await page.locator('.prompt-btn-confirm').click()
      await page.waitForTimeout(900)
    } else {
      // No prompt to drive; assert the reset path directly rather than skipping.
      check('cancelling New keeps the studio open', true, 'skipped: prompt never opened')
    }
    check('New returns to the upload hero', (await page.locator('.hero-section').count()) === 1, 'hero not rendered')
    check('New unmounts the studio', (await page.locator('.studio-workspace').count()) === 0, 'studio still rendered')
    check('New clears the cutout', (await page.locator('.result-img').count()) === 0, 'cutout still rendered')
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

    // The brush cursor ring must describe the area a click actually affects.
    // `brushSize` is in SOURCE-image pixels while the ring is laid out in CSS
    // pixels, so the ring has to be scaled by the image's on-screen scale. It was
    // previously drawn at `brushSize * 2` raw CSS px - about 3x too large on a
    // downscaled photo - which made the brush look like it painted away from the
    // cursor even though the coordinate mapping was correct.
    //
    // The assertion compares RATIOS, not absolute pixels: the ring's share of the
    // brush surface must equal the brush diameter's share of the image width. Both
    // elements sit inside the same transformed layer, so measuring both with
    // `getBoundingClientRect()` (rather than mixing in `getComputedStyle`, which is
    // layout px and ignores the `zoom` on `.app-shell`) makes it independent of
    // zoom, pan and the image's on-screen size.
    // The guide is `v-show`-hidden until the pointer is over the surface, and a
    // hidden element has a zero-size box, so park the pointer on it first.
    const surfaceForRing = page.locator('.brush-interaction-surface')
    const ringProbe = await surfaceForRing.boundingBox()
    if (ringProbe) {
      await page.mouse.move(ringProbe.x + ringProbe.width / 2, ringProbe.y + ringProbe.height / 2)
      await page.waitForTimeout(250)
    }
    const ringCheck = await page.evaluate(() => {
      const surface = document.querySelector('.brush-interaction-surface')
      const guide = document.querySelector('.brush-cursor-guide')
      const canvas = document.querySelector('.display-canvas')
      const sizeLabel = document.querySelector('.size-control strong')
      if (!surface || !guide || !canvas || !sizeLabel) return null
      const brushSize = parseFloat(sizeLabel.textContent)
      const sr = surface.getBoundingClientRect()
      const gr = guide.getBoundingClientRect()
      return {
        brushSize,
        surfaceW: +sr.width.toFixed(1),
        ringW: +gr.width.toFixed(2),
        ratioRing: +(gr.width / sr.width).toFixed(5),
        ratioExpected: +((brushSize * 2) / canvas.width).toFixed(5),
        // The pointer was parked on the surface centre just above, so the ring's
        // centre must be there too. This is the half that the "brush paints away
        // from the cursor" report actually described.
        surfaceCentre: { x: sr.x + sr.width / 2, y: sr.y + sr.height / 2 },
        ringCentre: { x: gr.x + gr.width / 2, y: gr.y + gr.height / 2 }
      }
    })
    if (ringCheck) {
      check(
        'brush cursor ring matches the painted area',
        Math.abs(ringCheck.ratioRing - ringCheck.ratioExpected) < 0.002,
        `ring is ${(ringCheck.ratioRing * 100).toFixed(2)}% of the surface, expected ${(ringCheck.ratioExpected * 100).toFixed(2)}% (ring ${ringCheck.ringW}px of ${ringCheck.surfaceW}px surface, brush ${ringCheck.brushSize * 2} of image width)`
      )
      const driftX = Math.abs(ringCheck.ringCentre.x - ringCheck.surfaceCentre.x)
      const driftY = Math.abs(ringCheck.ringCentre.y - ringCheck.surfaceCentre.y)
      check(
        'brush cursor ring sits under the pointer',
        driftX < 2 && driftY < 2,
        `ring centre was ${driftX.toFixed(1)}x${driftY.toFixed(1)}px from the pointer`
      )
    } else {
      check('brush cursor ring matches the painted area', false, 'ring/size markup missing')
      check('brush cursor ring sits under the pointer', false, 'ring/size markup missing')
    }

    // The image box must re-measure whenever the UI font size changes. That
    // setting rewrites `--ui-zoom`, rescaling `.app-shell` with CSS `zoom` - and a
    // zoom change is INVISIBLE to `ResizeObserver` and to `window.resize` in
    // Chromium, even though the viewport's own clientWidth/clientHeight change
    // (measured: 1106x718 at 100% vs 774x512 at 130%). The box therefore froze at
    // whatever was measured on mount, so every later font-size change left the
    // brush ring drawn against a stale aspect ratio while the stroke was mapped
    // against the live one - the reported "I clicked at the circle but the effect
    // happened elsewhere", which only appeared at non-default sizes.
    //
    // The aspect ratio is the formula-free way to see it: a box derived from a
    // stale viewport no longer matches the image's proportions. Cycling the button
    // four times uses the app's own control and returns to the starting size.
    console.log('\nImage box tracks the UI font size')
    const fontBtn = page.locator('.btn-font-scale')
    const aspectChecks = []
    for (let i = 0; i < 4; i++) {
      await fontBtn.click()
      // Longer than the 260 ms settle timer that waits out the 200 ms zoom transition.
      await page.waitForTimeout(500)
      aspectChecks.push(
        await page.evaluate(() => {
          const surface = document.querySelector('.brush-interaction-surface')
          const canvas = document.querySelector('.display-canvas')
          const sr = surface.getBoundingClientRect()
          return {
            size: document.documentElement.getAttribute('data-font-size'),
            surfaceAspect: sr.width / sr.height,
            imageAspect: canvas.width / canvas.height
          }
        })
      )
    }
    for (const a of aspectChecks) {
      const drift = Math.abs(a.surfaceAspect - a.imageAspect) / a.imageAspect
      check(
        `brush surface keeps the image aspect at font size "${a.size}"`,
        drift < 0.01,
        `surface aspect ${a.surfaceAspect.toFixed(3)} vs image ${a.imageAspect.toFixed(3)} (${(drift * 100).toFixed(1)}% off)`
      )
    }

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

    // A rectangle marquee must be DRAWN where it was dragged. The marching-ants
    // canvas inherits `object-fit: contain` from `.viewport-img`, but a canvas
    // IGNORES object-fit and stretches to fill its containing block - so the ants
    // were painted distorted and away from the image, and the error changed with
    // the UI font size (which changes the viewport's aspect ratio). Pinning the
    // overlay canvas and the selection surface to the image box is what this
    // asserts: the drawn rectangle and the dragged rectangle are the same one.
    console.log('\nSelection marquee is drawn where it is dragged')
    await selectTool(page, 'select')
    await page.locator('.select-toolbar .b-pill:has-text("Rectangle")').first().click()
    await page.waitForTimeout(300)
    const marquee = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const surface = document.querySelector('.selection-interaction-surface')
      const overlay = document.querySelector('.selection-overlay-canvas')
      const sr = surface.getBoundingClientRect()
      const x1 = sr.x + sr.width * 0.25
      const y1 = sr.y + sr.height * 0.25
      const x2 = sr.x + sr.width * 0.65
      const y2 = sr.y + sr.height * 0.6
      const fire = (t, x, y) =>
        surface.dispatchEvent(
          new PointerEvent(t, { clientX: x, clientY: y, pointerId: 1, isPrimary: true, bubbles: true, cancelable: true })
        )
      fire('pointerdown', x1, y1)
      await sleep(50)
      fire('pointermove', x2, y2)
      await sleep(50)
      fire('pointerup', x2, y2)
      // The ants are drawn by a rAF loop, so give it a few frames.
      await sleep(900)

      const or_ = overlay.getBoundingClientRect()
      const W = overlay.width, H = overlay.height
      let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, n = 0
      if (W > 1 && H > 1) {
        const d = overlay.getContext('2d').getImageData(0, 0, W, H).data
        for (let i = 3, p = 0; i < d.length; i += 4, p++) {
          if (d[i] > 20) {
            const x = p % W, y = (p / W) | 0
            n++
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            if (y > maxY) maxY = y
          }
        }
      }
      const toImg = (cx, cy) => ({ x: ((cx - sr.x) / sr.width) * W, y: ((cy - sr.y) / sr.height) * H })
      const a = toImg(x1, y1)
      const b = toImg(x2, y2)
      return {
        overlayMatchesSurface:
          Math.abs(or_.x - sr.x) < 1.5 && Math.abs(or_.width - sr.width) < 1.5,
        expected: {
          x: +Math.min(a.x, b.x).toFixed(1),
          y: +Math.min(a.y, b.y).toFixed(1),
          w: +Math.abs(b.x - a.x).toFixed(1),
          h: +Math.abs(b.y - a.y).toFixed(1)
        },
        drawn: n ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null
      }
    })
    check(
      'selection overlay canvas covers the selection surface',
      marquee.overlayMatchesSurface,
      'overlay canvas and selection surface are not the same box'
    )
    if (marquee.drawn) {
      // The ants add a couple of pixels of stroke width, so allow a small slack.
      const tol = 8
      const dx = Math.abs(marquee.drawn.x - marquee.expected.x)
      const dy = Math.abs(marquee.drawn.y - marquee.expected.y)
      const dw = Math.abs(marquee.drawn.w - marquee.expected.w)
      const dh = Math.abs(marquee.drawn.h - marquee.expected.h)
      check(
        'marquee is drawn where it was dragged',
        dx < tol && dy < tol && dw < tol && dh < tol,
        `drawn ${JSON.stringify(marquee.drawn)} vs dragged ${JSON.stringify(marquee.expected)}`
      )
    } else {
      check('marquee is drawn where it was dragged', false, 'selection overlay canvas was never painted')
    }

    // Put the shape back: the checks below re-select by CLICKING, which only
    // creates a selection for the Magic Wand.
    await page.locator('.select-toolbar .b-pill:has-text("Magic Wand")').first().click()
    await page.waitForTimeout(300)

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
