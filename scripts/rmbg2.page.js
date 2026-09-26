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
const modelsOverviewEl = $('modelsOverview')
const confirmModal = $('confirmModal')

let stream = null
let files = []
const picked = new Set()
let checkpoints = []
let currentRunningCheckpoint = null

/* ------------------------------- log ------------------------------- */
let logPristine = true

function formatTimestamp() {
  const d = new Date()
  return d.toTimeString().split(' ')[0]
}

function detectTag(text, kind) {
  if (kind === 'err' || /FAILED|error|rejected/i.test(text)) return { tag: 'err', label: 'ERROR' }
  if (kind === 'ok' || /✓|done|finished|complete/i.test(text)) return { tag: 'ok', label: 'OK' }
  if (kind === 'warn' || /warn|blocked|skipped/i.test(text)) return { tag: 'warn', label: 'WARN' }
  if (/weights:/i.test(text)) return { tag: 'weights', label: 'WEIGHTS' }
  if (/running|runner:/i.test(text)) return { tag: 'run', label: 'RUN' }
  if (/session:/i.test(text)) return { tag: 'load', label: 'SESSION' }
  if (/-- \[|\bms\b|inference/i.test(text)) return { tag: 'infer', label: 'INFER' }
  return { tag: 'info', label: 'INFO' }
}

function appendLog(text, kind, isBanner = false) {
  if (logPristine) resetLog()
  const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40

  const row = document.createElement('div')
  row.className = 'log-row'

  const ts = document.createElement('span')
  ts.className = 'log-ts'
  ts.textContent = `[${formatTimestamp()}]`

  const { tag, label } = detectTag(text, kind)
  const tagEl = document.createElement('span')
  tagEl.className = `log-tag ${tag}`
  tagEl.textContent = label

  const msg = document.createElement('span')
  msg.className = 'log-msg'

  const isSuccess = isBanner || /all checkpoints finished|inference (is )?complete/i.test(text)
  const isRunning = kind === 'run' || /^running\b/i.test(text)
  const isErrBanner = kind === 'err' && isBanner

  if (isSuccess) {
    const banner = document.createElement('span')
    banner.className = 'log-banner success'
    banner.innerHTML = `<span class="banner-icon">✓</span> ${text}`
    msg.appendChild(banner)
  } else if (isRunning) {
    const banner = document.createElement('span')
    banner.className = 'log-banner running'
    banner.innerHTML = `<span class="banner-icon">▶</span> ${text}`
    msg.appendChild(banner)
  } else if (isErrBanner) {
    const banner = document.createElement('span')
    banner.className = 'log-banner error'
    banner.innerHTML = `<span class="banner-icon">✗</span> ${text}`
    msg.appendChild(banner)
  } else {
    msg.textContent = text
  }

  row.append(ts, tagEl, msg)
  log.appendChild(row)

  if (atBottom) log.scrollTop = log.scrollHeight
  logPristine = false
}

function resetLog() {
  log.textContent = ''
  logPristine = false
}

$('clearLog')?.addEventListener('click', () => {
  resetLog()
  appendLog('Activity log cleared.', 'info')
})

$('clearImages')?.addEventListener('click', async () => {
  if (running || !files.length) return
  picked.clear()
  try {
    await fetch('/rmbg2/clear', { method: 'POST' })
  } catch { /* ignored */ }
  await loadFiles()
  appendLog('Cleared all uploaded images.', 'info')
})

function human(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0, n = bytes
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

/* ------------------------- streams (SSE) --------------------------- */
function stopStream() {
  if (!stream) return
  const active = stream
  stream = null
  active.close()
}

let running = false

function beginJob() { running = true; applyDisabled() }
function endJob() { running = false; applyDisabled() }

function applyDisabled() {
  const idle = !running
  $('run').disabled = !idle || picked.size === 0
  $('runAll').disabled = !idle || picked.size === 0 || checkpoints.length === 0
  $('checkpoint').disabled = !idle
  if ($('preload')) $('preload').disabled = !idle
  if ($('preloadAll')) $('preloadAll').disabled = !idle
  if ($('clearImages')) $('clearImages').disabled = !idle || files.length === 0
  $('run').textContent = picked.size > 1 ? `Run ${picked.size} images` : 'Run'
}

/** Shared plumbing for the run and preload streams. */
function openStream(url, onDone, onFail) {
  stream = new EventSource(url)

  stream.onmessage = (event) => {
    const message = JSON.parse(event.data)
    if (message.type === 'log') {
      const isErr = /FAILED|error/i.test(message.text)
      appendLog(message.text, isErr ? 'err' : null)

      // Detect image progress: e.g. "-- [1/2] sample.png"
      const match = message.text.match(/-- \[(\d+)\/(\d+)\]/)
      if (match && currentRunningCheckpoint) {
        const cur = Number(match[1])
        const total = Number(match[2])
        updateModelProgress(currentRunningCheckpoint, cur, total, 'Inference running...')
      } else if (message.text.includes('weights: cached') || message.text.includes('weights: downloaded')) {
        if (currentRunningCheckpoint) updateModelStatusText(currentRunningCheckpoint, 'Weights ready')
      }
    } else if (message.type === 'stats') {
      if ($('resCpuPct')) $('resCpuPct').textContent = `${message.cpuPercent}%`
      if ($('resCpuFill')) $('resCpuFill').style.width = `${Math.min(100, Math.max(0, message.cpuPercent))}%`
      if ($('resEngineMb')) $('resEngineMb').textContent = message.engineMb
    } else if (message.type === 'ready') {
      appendLog(`Runner ready: ${message.model} → ${message.file} on ${message.provider}`, 'info')
    } else if (message.type === 'error') {
      appendLog(message.message, 'err')
      stopStream()
      if (onFail) onFail()
    } else {
      onDone(message)
    }
  }

  stream.onerror = () => {
    if (!stream) return
    appendLog('Stream session ended.', 'info')
    stopStream()
    if (onFail) onFail()
  }
}

/* ------------------------------ files ------------------------------ */
function renderFiles() {
  filesEl.textContent = ''

  if (!files.length) {
    filesEl.classList.add('is-empty')
    const p = document.createElement('p')
    p.className = 'empty'
    p.textContent = 'No images yet. Add some above. Nothing is kept between visits.'
    filesEl.appendChild(p)
  } else {
    filesEl.classList.remove('is-empty')
  }

  for (const file of files) {
    const isPicked = picked.has(file.name)
    const card = document.createElement('div')
    card.className = isPicked ? 'file picked' : 'file'
    card.title = `${file.name} — ${human(file.bytes)}`
    card.onclick = (e) => {
      if (e.target.closest('.del')) return
      if (picked.has(file.name)) picked.delete(file.name)
      else picked.add(file.name)
      renderFiles()
    }
    card.innerHTML = `
      <div class="tick">${isPicked ? '✓' : ''}</div>
      <button class="del" type="button" title="Remove ${file.name}">×</button>
      <img loading="lazy" alt="${file.name}" src="/rmbg2/input/${encodeURIComponent(file.name)}?v=${Math.round(file.mtimeMs || 0)}" onerror="this.style.visibility='hidden'">
      <div class="name">${file.name}</div>
    `
    card.querySelector('.del').onclick = async (e) => {
      e.stopPropagation()
      picked.delete(file.name)
      try { await fetch(`/rmbg2/delete?name=${encodeURIComponent(file.name)}`) } catch {}
      await loadFiles()
    }
    filesEl.appendChild(card)
  }

  const total = files.reduce((sum, f) => sum + (f.bytes || 0), 0)
  $('fileCount').textContent = files.length
    ? `· ${picked.size} of ${files.length} selected · ${human(total)}`
    : ''
  updateRunState()
  updateAllCardsPending()
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

  const known = new Set(files.map((f) => f.name))
  for (const name of [...picked]) if (!known.has(name)) picked.delete(name)
  if (!picked.size) for (const f of files) picked.add(f.name)

  renderFiles()
  renderCheckpoints()
  renderModelsOverview()
}

async function uploadFiles(list) {
  const raw = [...list]
  const gifs = raw.filter((f) => f.type === 'image/gif' || /\.gif$/i.test(f.name))
  if (gifs.length) {
    appendLog(
      `GIF upload blocked: ${gifs.map((f) => f.name).join(', ')}. RMBG-2.0 requires static images (PNG, JPEG, WebP, AVIF).`,
      'warn'
    )
  }

  const incoming = raw.filter(
    (f) => (f.type.startsWith('image/') || /\.(png|jpe?g|webp|avif|tiff?|bmp)$/i.test(f.name)) &&
           f.type !== 'image/gif' && !/\.gif$/i.test(f.name)
  )
  if (!incoming.length) {
    if (!gifs.length) appendLog('Nothing to upload (no supported image files found in drop).', 'warn')
    return
  }

  if (logPristine) resetLog()

  for (const file of incoming) {
    appendLog(`Uploading ${file.name} (${human(file.size)})…`, 'info')
    try {
      const res = await fetch(`/rmbg2/upload?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: file,
        headers: { 'Content-Type': 'application/octet-stream' }
      })
      const data = await res.json()
      if (!res.ok) { appendLog(`  Upload rejected: ${data.error}`, 'err'); continue }
      picked.add(data.name)
    } catch (error) {
      appendLog(`  Upload failed: ${error.message}`, 'err')
    }
  }
  await loadFiles()
  appendLog(`${files.length} image(s) ready for processing.`, 'ok')
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
}

function escapeId(file) {
  return String(file).replace(/[^a-zA-Z0-9_-]/g, '_')
}

async function clearModelCache(file) {
  appendLog(`Clearing cache for ${file}…`, 'info')
  try {
    const res = await fetch(`/rmbg2/clear-cache?file=${encodeURIComponent(file)}`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      appendLog(`Cache cleared for ${file} (${data.clearedCount || 1} file(s) removed)`, 'ok')
      await loadFiles()
    } else {
      appendLog(`Failed to clear cache: ${data.error}`, 'err')
    }
  } catch (err) {
    appendLog(`Clear cache error: ${err.message}`, 'err')
  }
}

function renderModelsOverview() {
  if (!modelsOverviewEl) return
  modelsOverviewEl.textContent = ''
  modelsOverviewEl.classList.toggle('multi-col', checkpoints.length > 3)

  for (const cp of checkpoints) {
    const card = document.createElement('div')
    card.className = 'model-card'
    card.id = `card-${escapeId(cp.file)}`

    const shortName = cp.label.replace(/\s*\(.*\)\s*$/, '')
    const arch = /BiRefNet|q4f16|fp16|fp32|RMBG-2/.test(cp.file) ? 'BiRefNet' : 'Segmentation'

    card.innerHTML = `
      <div class="model-card-head">
        <span class="model-card-title">${shortName} (${cp.approxSize})</span>
        <div class="model-card-actions">
          <span class="model-card-badge ${cp.cached ? 'cached' : 'not-cached'}">${cp.cached ? 'Cached ✓' : 'Not cached'}</span>
          ${cp.cached
            ? '<button type="button" class="btn-clear-cache" title="Clear cache">&times;</button>'
            : `<button type="button" class="btn-card-preload" title="Preload ${shortName}">Preload</button>`
          }
        </div>
      </div>
      <div class="model-card-desc">${arch} · 1024×1024 CPU · ${cp.note || ''}</div>
      <div class="model-card-footer">
        <span class="model-status-text" id="status-${escapeId(cp.file)}">Idle</span>
        <span class="model-progress-tag" id="prog-${escapeId(cp.file)}">${picked.size} images</span>
      </div>
    `
    const clearBtn = card.querySelector('.btn-clear-cache')
    if (clearBtn) {
      clearBtn.onclick = (e) => {
        e.stopPropagation()
        if (running) return
        if (confirm(`Clear cached weights for ${cp.label}?`)) clearModelCache(cp.file)
      }
    }
    const preloadBtn = card.querySelector('.btn-card-preload')
    if (preloadBtn) {
      preloadBtn.onclick = (e) => {
        e.stopPropagation()
        if (running) return
        preload(false, cp.file)
      }
    }
    modelsOverviewEl.appendChild(card)
  }
}

function updateModelProgress(file, processed, total, statusText) {
  const card = $(`card-${escapeId(file)}`), statusEl = $(`status-${escapeId(file)}`), progEl = $(`prog-${escapeId(file)}`)
  if (card && !card.classList.contains('active')) {
    document.querySelectorAll('.model-card.active').forEach((c) => c.classList.remove('active'))
    card.classList.add('active')
  }
  if (statusEl && statusText) statusEl.textContent = statusText
  if (progEl) progEl.textContent = `${processed} / ${total} images`
}

function updateModelStatusText(file, text) {
  const statusEl = $(`status-${escapeId(file)}`)
  if (statusEl) statusEl.textContent = text
}

function setModelCompleted(file, total) {
  const card = $(`card-${escapeId(file)}`), statusEl = $(`status-${escapeId(file)}`), progEl = $(`prog-${escapeId(file)}`)
  if (card) { card.classList.remove('active'); card.classList.add('completed') }
  if (statusEl) statusEl.textContent = 'Completed ✓'
  if (progEl) progEl.textContent = `${total} / ${total} images`
}

function resetAllModelCards() {
  const total = picked.size
  for (const cp of checkpoints) {
    const card = $(`card-${escapeId(cp.file)}`), statusEl = $(`status-${escapeId(cp.file)}`), progEl = $(`prog-${escapeId(cp.file)}`)
    if (card) card.classList.remove('active', 'completed')
    if (statusEl) statusEl.textContent = 'Queued'
    if (progEl) progEl.textContent = `0 / ${total} images`
  }
  const overall = $('overallProgress')
  if (overall) overall.textContent = ''
}

function updateAllCardsPending() {
  if (running) return
  const total = picked.size
  for (const cp of checkpoints) {
    const progEl = $(`prog-${escapeId(cp.file)}`)
    if (progEl) progEl.textContent = `${total} images`
  }
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
    head.appendChild(pill(`${result.width}×${result.height}`))
    if (result.tta) head.appendChild(pill('TTA refined', 'ok'))
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

  // Info chips placed above picture comparisons
  const metrics = document.createElement('div')
  metrics.className = 'result-metrics'
  for (const [k, v, hl] of [
    ['Model', result.checkpoint || '—', true],
    ['Device', result.timings.provider || 'cpu'],
    ['Inference', `${(result.timings.inferenceMs / 1000).toFixed(2)}s`, true],
    ['Preprocess', `${result.timings.preprocessMs}ms`],
    ['Coverage', `${(result.mask.coverage * 100).toFixed(1)}%`],
    ['Mean Alpha', `${(result.mask.meanAlpha * 100).toFixed(1)}%`],
    ['Separation', result.mask.separation],
    ['Range', `${result.mask.min} … ${result.mask.max}`]
  ]) {
    const chip = document.createElement('div')
    chip.className = 'metric-chip'
    chip.innerHTML = `<span class="m-k">${k}:</span> <span class="m-v${hl ? ' highlight' : ''}">${v}</span>`
    metrics.appendChild(chip)
  }
  card.appendChild(metrics)

  const compare = document.createElement('div')
  compare.className = 'compare'
  for (const [mime, base64, caption, isCutout] of [
    ['image/jpeg', result.previews.original, 'original', false],
    ['image/png', result.previews.cutout, 'cutout (transparent PNG)', true],
    ['image/png', result.previews.mask, 'raw mask', false]
  ]) {
    const figure = document.createElement('figure')
    const preview = document.createElement('div')
    preview.className = isCutout ? 'figure-preview is-cutout' : 'figure-preview'
    preview.title = 'Click to inspect in detail'

    const img = document.createElement('img')
    const src = `data:${mime};base64,${base64}`
    img.src = src
    img.alt = caption

    const overlay = document.createElement('div')
    overlay.className = 'figure-overlay'
    overlay.innerHTML = '<span class="view-icon">🔍</span><span>View Details</span>'

    preview.append(img, overlay)
    preview.onclick = () => openDetailModal(src, `${result.name} — ${caption}`, isCutout)

    const cap = document.createElement('figcaption')
    cap.textContent = caption
    figure.append(preview, cap)
    compare.appendChild(figure)
  }
  card.appendChild(compare)
  resultsEl.appendChild(card)
}

let runCounter = 0
const nextRunId = () => `run-${Date.now()}-${++runCounter}`

function runCheckpoint(checkpointFile, { release = false, clearReport = true, appendReport = false } = {}) {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      runId: nextRunId(),
      checkpoint: checkpointFile,
      inputs: [...picked].join(','),
      release: release ? '1' : '0',
      tta: $('tta')?.checked ? '1' : '0',
      clearReport: clearReport ? '1' : '0',
      appendReport: appendReport ? '1' : '0'
    })

    openStream(
      `/rmbg2/run?${params}`,
      (message) => {
        if (message.type !== 'result') return
        appendLog(
          message.replayed ? 'Inference retrieved from run cache.' : 'Inference is completed.',
          'ok',
          true
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
  if (!chosen) return
  resultsEl.textContent = ''
  resetLog()
  resetAllModelCards()
  $('report').disabled = true
  $('outHint').textContent = 'Running…'
  beginJob()

  currentRunningCheckpoint = chosen.file
  updateModelProgress(chosen.file, 0, picked.size, 'Running inference...')

  if (chosen) appendLog(`Running ${chosen.label} (${chosen.approxSize}) on ${picked.size} image(s)…`, 'run')
  const ok = await runCheckpoint(chosen.file, { release: false, clearReport: true, appendReport: false })

  if (ok) {
    setModelCompleted(chosen.file, picked.size)
    appendLog(`Inference is completed for ${chosen.label}.`, 'ok', true)
  } else {
    updateModelStatusText(chosen.file, 'Failed ✗')
    appendLog(`Inference failed for ${chosen.label}.`, 'err')
  }
  currentRunningCheckpoint = null

  endJob()
  $('outHint').textContent = 'Finished — scroll down to compare.'
  await loadFiles()
})

/* ---------- Confirmation modal for Run All Model ---------- */
$('runAll').addEventListener('click', () => {
  if (running || picked.size === 0 || checkpoints.length === 0) return
  const numCp = checkpoints.length
  const numImgs = picked.size
  const total = numCp * numImgs
  $('confirmStats').textContent = `${numCp} models × ${numImgs} image(s) = ${total} total sequential inferences on CPU`
  confirmModal.showModal()
})

$('cancelRunAll').addEventListener('click', () => confirmModal.close())
$('confirmRunAll').addEventListener('click', () => { confirmModal.close(); executeRunAll() })

async function executeRunAll() {
  resultsEl.textContent = ''
  resetLog()
  resetAllModelCards()
  $('report').disabled = true
  $('outHint').textContent = 'Running every model…'
  beginJob()

  appendLog(
    `Run All Models: starting batch across ${checkpoints.length} checkpoint(s) × ${picked.size} image(s) on CPU.`,
    'run'
  )
  appendLog(
    'Each model is loaded into a dedicated session, run over all selected images, then released before the next model loads.',
    'info'
  )
  appendLog('Sequential CPU execution: inference and model initialization may take some time.', 'warn')

  for (const [index, cp] of checkpoints.entries()) {
    const overall = $('overallProgress')
    if (overall) overall.textContent = `Running model ${index + 1} of ${checkpoints.length}…`

    currentRunningCheckpoint = cp.file
    updateModelProgress(cp.file, 0, picked.size, 'Starting model…')

    appendLog(`[${index + 1}/${checkpoints.length}] Active model: ${cp.label} (${cp.approxSize})`, 'run')

    const ok = await runCheckpoint(cp.file, {
      release: true,
      clearReport: index === 0,
      appendReport: index > 0
    })

    if (!ok) {
      appendLog(`  ${cp.label} did not finish; continuing with remaining models.`, 'warn')
      updateModelStatusText(cp.file, 'Failed ✗')
    } else {
      setModelCompleted(cp.file, picked.size)
    }
  }

  currentRunningCheckpoint = null
  const overall = $('overallProgress')
  if (overall) {
    overall.innerHTML = `<span class="status-badge-ok"><span>✓</span> All ${checkpoints.length} models finished</span>`
  }

  endJob()
  appendLog('All checkpoints finished successfully. Check results below.', 'ok', true)
  $('outHint').textContent = 'Finished — scroll down to compare the models.'
  await loadFiles()
}

/* ----------------------------- preload ----------------------------- */
function preload(all, targetCp) {
  resetLog()
  beginJob()
  const cpVal = targetCp || $('checkpoint')?.value
  appendLog(`Preload: fetching ${all ? 'all available checkpoints' : `checkpoint ${cpVal}`}…`, 'run')

  const params = new URLSearchParams({ checkpoint: cpVal, all: all ? '1' : '0' })

  openStream(
    `/rmbg2/preload?${params}`,
    (message) => {
      if (message.type !== 'preloaded') return
      for (const r of message.results) {
        if (r.ok) appendLog(`  ✓ ${r.label} — ${r.cached ? 'cached' : 'downloaded'} (${human(r.bytes)})`, 'ok')
        else appendLog(`  ✗ ${r.label} — download failed: ${r.error}`, 'err')
      }
      appendLog('Preload finished successfully.', 'ok')
      stopStream()
      endJob()
      loadFiles()
    },
    () => endJob()
  )
}

if ($('preload')) $('preload').addEventListener('click', () => preload(false))
$('preloadAll')?.addEventListener('click', () => preload(true))
$('report').addEventListener('click', () => window.open('/rmbg2/report', '_blank'))

/* ------------------------ detail modal & zoom ------------------------ */
const detailModal = $('detailModal')
const detailImg = $('detailImg')
const detailStage = $('detailStage')
const detailTitle = $('detailTitle')
const backdropGroup = $('backdropGroup')
const zoomLevel = $('zoomLevel')
let currentZoom = 1

function applyZoom(z) {
  currentZoom = Math.min(5, Math.max(0.2, Math.round(z * 100) / 100))
  if (detailImg) detailImg.style.transform = `scale(${currentZoom})`
  if (zoomLevel) zoomLevel.textContent = `${Math.round(currentZoom * 100)}%`
}

function openDetailModal(src, title, isCutout = false) {
  if (!detailModal || !detailImg) return
  detailImg.src = src
  detailTitle.textContent = title || 'Image Detail'
  applyZoom(1)
  if (backdropGroup) backdropGroup.style.display = isCutout ? 'inline-flex' : 'none'
  if (isCutout) {
    setBackdrop('grid')
  } else if (detailStage) {
    detailStage.className = 'detail-stage'
    detailStage.style.backgroundColor = ''
  }
  detailModal.showModal()
}

function setBackdrop(bg, customColor) {
  if (!detailStage) return
  detailStage.className = `detail-stage bg-${bg}`
  detailStage.style.backgroundColor = bg === 'color' ? (customColor || $('bgColorPicker')?.value || '#2563eb') : ''
  backdropGroup?.querySelectorAll('.bg-btn').forEach((b) => b.classList.toggle('active', b.dataset.bg === bg))
}

$('closeDetail')?.addEventListener('click', () => detailModal?.close())
detailModal?.addEventListener('click', (e) => { if (e.target === detailModal) detailModal.close() })
$('zoomIn')?.addEventListener('click', () => applyZoom(currentZoom + 0.25))
$('zoomOut')?.addEventListener('click', () => applyZoom(currentZoom - 0.25))
$('zoomReset')?.addEventListener('click', () => applyZoom(1))

backdropGroup?.addEventListener('click', (e) => {
  const btn = e.target.closest('.bg-btn')
  if (btn) {
    if (btn.dataset.bg === 'color') $('bgColorPicker')?.click()
    setBackdrop(btn.dataset.bg)
  }
})
$('bgColorPicker')?.addEventListener('input', (e) => setBackdrop('color', e.target.value))

detailStage?.addEventListener('wheel', (e) => {
  e.preventDefault()
  applyZoom(currentZoom + (e.deltaY < 0 ? 0.15 : -0.15))
}, { passive: false })

/* -------------------------- system monitor -------------------------- */
async function fetchSystemInfo() {
  try {
    const res = await fetch('/rmbg2/system')
    if (!res.ok) return
    const sys = await res.json()
    if ($('resCpuPct')) $('resCpuPct').textContent = `${sys.cpu.loadPercent}%`
    if ($('resCpuFill')) $('resCpuFill').style.width = `${Math.min(100, Math.max(0, sys.cpu.loadPercent))}%`
    if ($('resRamVal')) $('resRamVal').textContent = `${sys.ram.totalMb} MB`
    const ramFillPct = Math.min(100, Math.round((sys.ram.totalMb / 4096) * 100))
    if ($('resRamFill')) $('resRamFill').style.width = `${ramFillPct}%`
    if ($('resServerMb')) $('resServerMb').textContent = sys.ram.serverMb
    if ($('resEngineMb')) $('resEngineMb').textContent = sys.ram.engineMb

    const badge = $('engineStatusBadge')
    if (badge) {
      if (running) {
        badge.className = 'engine-badge running'
        badge.textContent = 'Engine: Running'
      } else if (sys.ram.engineWarm) {
        badge.className = 'engine-badge warm'
        badge.textContent = `Engine: Warm (${sys.ram.activeModel || 'loaded'})`
      } else {
        badge.className = 'engine-badge'
        badge.textContent = 'Engine: Idle'
      }
    }
  } catch {}
}

/* ---------------------------- upload UI ---------------------------- */
const drop = $('drop')
drop.onclick = () => $('picker').click()
drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('picker').click() } }
$('picker').onchange = (e) => { uploadFiles(e.target.files); e.target.value = '' }
;['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over') }))
;['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over') }))
drop.addEventListener('drop', (e) => { if (e.dataTransfer?.files?.length) uploadFiles(e.dataTransfer.files) })

window.addEventListener('paste', (e) => {
  const items = [...(e.clipboardData?.items || [])].filter((i) => i.type.startsWith('image/'))
  if (!items.length) return
  if (items.some((i) => i.type === 'image/gif')) appendLog('Pasting GIF images is not supported. Please paste static images.', 'warn')
  const pasted = items.filter((i) => i.type !== 'image/gif').map((item, i) => {
    const blob = item.getAsFile()
    if (!blob) return null
    const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
    const named = blob.name && /\.\w+$/.test(blob.name) ? blob.name : `pasted-${Date.now()}-${i}.${ext}`
    return new File([blob], named, { type: blob.type })
  }).filter(Boolean)
  if (pasted.length) uploadFiles(pasted)
})

/* ------------------------------ boot ------------------------------- */
await fetch('/rmbg2/clear', { method: 'POST' }).catch(() => {})
await loadFiles()
await fetchSystemInfo()
setInterval(fetchSystemInfo, 2500)
updateRunState()
