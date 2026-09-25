/* ==========================================================================
   rmbg2.page.js — behaviour for the RMBG-2.0 lab page.

   Split out of rmbg2.page.html when the single file crossed the repo's 800-line
   budget. Loaded as a module from /rmbg2/app.js, so it runs after the markup is
   parsed - the same timing the previous inline `<script type="module">` had.
   ========================================================================== */

const $ = (id) => document.getElementById(id)
const log = $('log')
const resultsEl = $('results')
const filesEl = $('files')

let stream = null
let files = []
const picked = new Set()
let checkpoints = []

/* ------------------------------- log ------------------------------- */
// The log starts with a placeholder line. The first real message replaces it, so
// "Idle" does not linger above upload progress.
let logPristine = true

function appendLog(text, kind) {
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40
  const line = document.createElement('div')
  if (kind) line.className = kind
  line.textContent = text
  log.appendChild(line)
  if (atBottom) log.scrollTop = log.scrollHeight
  logPristine = false
}
function resetLog() { log.textContent = ''; logPristine = false }

function human(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, n = bytes
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

/* ------------------------- streams (SSE) --------------------------- */
/**
 * Close a progress stream permanently.
 *
 * `.close()` is REQUIRED. An EventSource reconnects by itself when the server ends
 * the response, and these urls start work - so merely dropping the reference left
 * it re-opening the same url and repeating the job every few seconds.
 */
function stopStream() {
  if (!stream) return
  const active = stream
  stream = null
  active.close()
}

/**
 * Job state, kept separate from the stream.
 *
 * `Run All Model` runs several checkpoints back to back. If the buttons were
 * re-enabled whenever a single stream closed, the controls would unlock between
 * checkpoints and the whole run would look finished after the first one.
 */
let running = false

function beginJob() { running = true; applyDisabled() }
function endJob() { running = false; applyDisabled() }

function applyDisabled() {
  const idle = !running
  $('run').disabled = !idle || picked.size === 0
  $('runAll').disabled = !idle || picked.size === 0 || checkpoints.length === 0
  $('checkpoint').disabled = !idle
  $('preload').disabled = !idle
  $('preloadAll').disabled = !idle
  $('run').textContent = picked.size > 1 ? `Run ${picked.size} images` : 'Run'
}

/** Shared plumbing for the run and preload streams. */
function openStream(url, onDone, onFail) {
  stream = new EventSource(url)

  stream.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.type === 'log') {
      appendLog(message.text, /FAILED|error/i.test(message.text) ? 'err' : null)
    } else if (message.type === 'ready') {
      appendLog(`runner ready — ${message.model} → ${message.file} on ${message.provider}`, 'dim')
    } else if (message.type === 'error') {
      appendLog(message.message, 'err')
      stopStream()
      if (onFail) onFail()
    } else {
      onDone(message)
    }
  }

  // Fires on a normal server close as well as a real failure. Either way this job is
  // over, so close for good instead of letting EventSource reconnect.
  stream.onerror = () => {
    if (!stream) return
    appendLog('stream closed.', 'dim')
    stopStream()
    if (onFail) onFail()
  }
}

/* ------------------------------ files ------------------------------ */
function renderFiles() {
  filesEl.textContent = ''

  if (!files.length) {
    const p = document.createElement('p')
    p.className = 'empty'
    p.textContent = 'No images yet. Add some above — nothing is kept between visits.'
    filesEl.appendChild(p)
  }

  for (const file of files) {
    const card = document.createElement('div')
    card.className = picked.has(file.name) ? 'file picked' : 'file'
    card.title = `${file.name} — ${human(file.bytes)}`
    card.addEventListener('click', (e) => {
      if (e.target.closest('.del')) return
      if (picked.has(file.name)) picked.delete(file.name)
      else picked.add(file.name)
      renderFiles()
    })

    const tick = document.createElement('div')
    tick.className = 'tick'
    tick.textContent = picked.has(file.name) ? '✓' : ''
    card.appendChild(tick)

    const del = document.createElement('button')
    del.className = 'del'
    del.type = 'button'
    del.textContent = '×'
    del.title = `Remove ${file.name}`
    del.addEventListener('click', async (e) => {
      e.stopPropagation()
      picked.delete(file.name)
      try { await fetch(`/rmbg2/delete?name=${encodeURIComponent(file.name)}`) } catch { /* refresh shows the truth */ }
      await loadFiles()
    })
    card.appendChild(del)

    const img = document.createElement('img')
    img.loading = 'lazy'
    img.alt = file.name
    img.src = `/rmbg2/input/${encodeURIComponent(file.name)}?v=${Math.round(file.mtimeMs || 0)}`
    img.onerror = () => { img.style.visibility = 'hidden' }
    card.appendChild(img)

    const name = document.createElement('div')
    name.className = 'name'
    name.textContent = file.name
    card.appendChild(name)

    filesEl.appendChild(card)
  }

  const total = files.reduce((sum, f) => sum + (f.bytes || 0), 0)
  $('fileCount').textContent = files.length
    ? `· ${picked.size} of ${files.length} selected · ${human(total)}`
    : ''
  updateRunState()
}

function updateRunState() {
  if (running) return
  applyDisabled()
}

async function loadFiles() {
  const res = await fetch('/rmbg2/list')
  if (!res.ok) { appendLog(`Could not list images (HTTP ${res.status})`, 'err'); return }
  const data = await res.json()

  files = data.files || []
  checkpoints = data.checkpoints || []

  // Keep the selection sensible across refreshes; default to all of what is there.
  const known = new Set(files.map((f) => f.name))
  for (const name of [...picked]) if (!known.has(name)) picked.delete(name)
  if (!picked.size) for (const f of files) picked.add(f.name)

  renderFiles()
  renderCheckpoints()
}

async function uploadFiles(list) {
  const incoming = [...list].filter(
    (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|avif|tiff?|gif|bmp)$/i.test(f.name)
  )
  if (!incoming.length) { appendLog('Nothing to upload (no image files in that drop).', 'warn'); return }

  if (logPristine) resetLog()

  for (const file of incoming) {
    appendLog(`uploading ${file.name} (${human(file.size)})…`, 'dim')
    try {
      const res = await fetch(`/rmbg2/upload?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: file,             // raw bytes; the name travels in the query string
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      const data = await res.json()
      if (!res.ok) { appendLog(`  rejected: ${data.error}`, 'err'); continue }
      picked.add(data.name)
    } catch (error) {
      appendLog(`  failed: ${error.message}`, 'err')
    }
  }
  await loadFiles()
  appendLog(`${files.length} image(s) ready.`, 'ok')
}

/* --------------------------- checkpoints --------------------------- */
function renderCheckpoints() {
  const select = $('checkpoint')
  const previous = select.value
  select.textContent = ''

  for (const cp of checkpoints) {
    const option = document.createElement('option')
    option.value = cp.file
    option.textContent = `${cp.label} — ${cp.approxSize}${cp.cached ? ' ✓' : ''}`
    option.title = cp.note || ''
    select.appendChild(option)
  }
  if (previous && checkpoints.some((c) => c.file === previous)) select.value = previous

  showModelInfo()
  select.onchange = showModelInfo
}

/**
 * The model explanation panel, which now occupies the slot the execution-provider
 * dropdown used to.
 *
 * The provider picker was removed on purpose. DirectML is the only GPU provider this
 * runtime bundles, and measuring it showed it was both ~4x SLOWER on this graph and
 * returned an empty mask; offering a broken choice as a dropdown is worse than not
 * offering it. Every run uses CPU. The provider plumbing still exists for the CLI
 * (`--provider=`) and for `npm run rmbg2:bench`, which is how that finding is kept
 * reproducible.
 */
function showModelInfo() {
  const box = $('modelInfo')
  const chosen = checkpoints.find((c) => c.file === $('checkpoint').value)

  if (!chosen) { box.textContent = ''; return }

  const shortName = chosen.label.replace(/\s*\(.*\)\s*$/, '')
  $('preload').textContent = `↓ Preload ${shortName}`

  const arch = /BiRefNet|q4f16|fp16|fp32|RMBG-2/.test(chosen.file)
    ? 'BiRefNet (the architecture behind BRIA RMBG-2.0)'
    : 'segmentation model'

  box.innerHTML =
    `<span class="title">${escapeHtml(shortName)} &middot; ${escapeHtml(chosen.approxSize)}</span>` +
    `<span class="meta">${escapeHtml(arch)}, run on CPU at a 1024×1024 network input. ` +
    `${escapeHtml(chosen.note || '')}</span> ` +
    (chosen.cached
      ? '<span class="ok">Weights downloaded — ready to run.</span>'
      : `<span class="warn">Not downloaded yet: ${
          escapeHtml(chosen.approxSize)
        } will be fetched before the first run.</span>`)
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
}

/* ------------------------------ run ------------------------------- */
function pill(text, kind) {
  const span = document.createElement('span')
  span.className = kind ? `pill ${kind}` : 'pill'
  span.textContent = text
  return span
}

function renderResult(result) {
  const card = document.createElement('section')
  card.className = 'result'

  const head = document.createElement('div')
  head.className = 'card-head'
  const title = document.createElement('h3')
  title.textContent = result.name
  head.appendChild(title)

  if (result.error) {
    head.appendChild(pill('failed', 'bad'))
  } else {
    // Lead with the checkpoint: "Run All Model" produces several cards per image,
    // and which model made which is the whole point of comparing them.
    const cp = checkpoints.find((c) => c.file === result.checkpoint)
    const model = pill(cp ? cp.label.replace(/\s*\(.*\)\s*$/, '') : (result.checkpoint || 'model'))
    model.title = result.checkpoint || ''
    head.appendChild(model)

    head.appendChild(pill(`${result.width}×${result.height}`))
    head.appendChild(pill(`inference ${(result.timings.inferenceMs / 1000).toFixed(1)}s`))
    const weak = result.mask.separation !== 'strong'
    const coverage = pill(`coverage ${(result.mask.coverage * 100).toFixed(1)}%`, weak ? 'warn' : '')
    coverage.title = 'Fraction of pixels the mask calls subject (alpha ≥ 0.5). Mean alpha is ' +
      `${(result.mask.meanAlpha * 100).toFixed(1)}% — they differ when the mask does not saturate.`
    head.appendChild(coverage)
    const sep = pill(`${result.mask.separation} separation`, weak ? 'warn' : '')
    sep.title = `Mask range ${result.mask.min} … ${result.mask.max}. "Strong" means it reaches near 0 and near 1.`
    head.appendChild(sep)
  }
  card.appendChild(head)

  if (result.error) {
    const pre = document.createElement('pre')
    pre.className = 'fail-msg'
    pre.textContent = result.error
    card.appendChild(pre)
    resultsEl.appendChild(card)
    return
  }

  const compare = document.createElement('div')
  compare.className = 'compare'
  for (const [mime, base64, caption] of [
    ['image/jpeg', result.previews.original, 'original'],
    ['image/png', result.previews.cutout, 'cutout (alpha over checkerboard)'],
    ['image/png', result.previews.mask, 'raw mask']
  ]) {
    const figure = document.createElement('figure')
    const img = document.createElement('img')
    img.src = `data:${mime};base64,${base64}`
    img.alt = caption
    const cap = document.createElement('figcaption')
    cap.textContent = caption
    figure.append(img, cap)
    compare.appendChild(figure)
  }
  card.appendChild(compare)

  const stats = document.createElement('dl')
  stats.className = 'stats'
  for (const [key, value] of [
    ['checkpoint', result.checkpoint || '—'],
    ['provider', result.timings.provider || 'cpu'],
    ['preprocess', `${result.timings.preprocessMs} ms`],
    ['inference', `${(result.timings.inferenceMs / 1000).toFixed(2)} s`],
    ['output tensor', `${result.mask.outputName} ${JSON.stringify(result.mask.dims)}`],
    ['mask range', `${result.mask.min} … ${result.mask.max}`],
    ['coverage (α ≥ 0.5)', `${(result.mask.coverage * 100).toFixed(1)}%`],
    ['mean alpha', `${(result.mask.meanAlpha * 100).toFixed(1)}%`],
    ['file', result.files.cutout]
  ]) {
    const row = document.createElement('div')
    const dt = document.createElement('dt')
    dt.textContent = key
    const dd = document.createElement('dd')
    dd.textContent = value
    row.append(dt, dd)
    stats.appendChild(row)
  }
  card.appendChild(stats)
  resultsEl.appendChild(card)
}

let runCounter = 0
const nextRunId = () => `run-${Date.now()}-${++runCounter}`

/**
 * Run one checkpoint over the selected images. Resolves when the result arrives.
 *
 * The checkpoint is passed explicitly rather than read from the dropdown, so
 * `Run All Model` can drive the same code for each one in turn.
 *
 * `release` asks the runner to CLOSE the model once every image is done. Run All
 * Model sets it so the model is unloaded before the next one loads - only one is
 * ever resident, and the memory goes back between models rather than at the end.
 * A plain Run leaves it off, because a warm session is what makes a second run fast.
 */
function runCheckpoint(checkpointFile, { release = false } = {}) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      runId: nextRunId(),
      checkpoint: checkpointFile,
      inputs: [...picked].join(','),
      release: release ? '1' : '0'
    })

    openStream(
      `/rmbg2/run?${params}`,
      (message) => {
        if (message.type !== 'result') return
        appendLog(
          message.replayed ? 'done (this job had already finished).' : 'done.',
          'ok'
        )
        $('report').disabled = false
        for (const r of message.results) renderResult(r)
        stopStream()
        resolve(true)
      },
      () => resolve(false)
    )
  })
}

$('run').addEventListener('click', async () => {
  const chosen = checkpoints.find((c) => c.file === $('checkpoint').value)
  resultsEl.textContent = ''
  resetLog()
  $('report').disabled = true
  $('outHint').textContent = 'Running…'
  beginJob()

  if (chosen) appendLog(`running ${chosen.label} (${chosen.approxSize})…`, 'dim')
  await runCheckpoint($('checkpoint').value)

  endJob()
  $('outHint').textContent = 'Finished — scroll down to compare.'
  await loadFiles()
})

/**
 * Run the selected images through EVERY checkpoint, one after another.
 *
 * Sequential on purpose: the runner holds one warm session at a time, and switching
 * checkpoint drops it, so overlapping runs would fight over a multi-GB model. The
 * cost is a fresh session load per checkpoint - worth saying up front rather than
 * leaving the user staring at a stalled log.
 */
$('runAll').addEventListener('click', async () => {
  resultsEl.textContent = ''
  resetLog()
  $('report').disabled = true
  $('outHint').textContent = 'Running every model…'
  beginJob()

  appendLog(
    `Run All Model: ${checkpoints.length} checkpoint(s) × ${picked.size} image(s), one after another.`,
    'dim'
  )
  appendLog(
    'Each model is loaded, run over every selected image, then closed before the next one loads.',
    'dim'
  )
  appendLog('That means a session load per model, so expect this to take a while.', 'warn')

  for (const [index, cp] of checkpoints.entries()) {
    appendLog(`[${index + 1}/${checkpoints.length}] ${cp.label} (${cp.approxSize})`, 'dim')
    // release: close this model as soon as its images are done, before the next loads.
    const ok = await runCheckpoint(cp.file, { release: true })
    if (!ok) appendLog(`  ${cp.label} did not finish; continuing with the rest.`, 'warn')
  }

  endJob()
  appendLog('all checkpoints finished.', 'ok')
  $('outHint').textContent = 'Finished — scroll down to compare the models.'
  await loadFiles()
})

/* ----------------------------- preload ----------------------------- */
function preload(all) {
  resetLog()
  beginJob()
  appendLog(`preload: fetching ${all ? 'every checkpoint' : 'the selected checkpoint'}…`, 'dim')

  const params = new URLSearchParams({ checkpoint: $('checkpoint').value, all: all ? '1' : '0' })

  openStream(
    `/rmbg2/preload?${params}`,
    (message) => {
      if (message.type !== 'preloaded') return
      for (const r of message.results) {
        if (r.ok) appendLog(`  ✓ ${r.label} — ${r.cached ? 'already cached' : 'downloaded'} (${human(r.bytes)})`, 'ok')
        else appendLog(`  ✗ ${r.label} — ${r.error}`, 'err')
      }
      appendLog('preload finished.', 'ok')
      stopStream()
      endJob()
      loadFiles()
    },
    () => endJob()
  )
}

$('preload').addEventListener('click', () => preload(false))
$('preloadAll').addEventListener('click', () => preload(true))
$('report').addEventListener('click', () => window.open('/rmbg2/report', '_blank'))

/* ---------------------------- upload UI ---------------------------- */
const drop = $('drop')
drop.addEventListener('click', () => $('picker').click())
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('picker').click() }
})
$('picker').addEventListener('change', (e) => {
  uploadFiles(e.target.files)
  e.target.value = ''       // so the same file can be picked again
})

for (const type of ['dragenter', 'dragover']) {
  drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.add('over') })
}
for (const type of ['dragleave', 'drop']) {
  drop.addEventListener(type, (e) => { e.preventDefault(); drop.classList.remove('over') })
}
drop.addEventListener('drop', (e) => {
  if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files)
})

// Paste: window-level so it works without focusing the dropzone first.
window.addEventListener('paste', (e) => {
  const items = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/'))
  if (!items.length) return
  const pasted = items.map((item, i) => {
    const blob = item.getAsFile()
    if (!blob) return null
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    const named = blob.name && /\.\w+$/.test(blob.name) ? blob.name : `pasted-${Date.now()}-${i}.${ext}`
    return new File([blob], named, { type: blob.type })
  }).filter(Boolean)
  if (pasted.length) uploadFiles(pasted)
})

/* ------------------------------ boot ------------------------------- */
// Start clean: the lab runs only what you upload in this visit, and nothing piles
// up between visits. This touches the uploads folder ONLY - never the CLI's
// inputs/ folder, which may hold a batch staged for the terminal.
await fetch('/rmbg2/clear', { method: 'POST' }).catch(() => {})
await loadFiles()
updateRunState()
