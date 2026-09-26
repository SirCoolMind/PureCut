/**
 * rmbg2-vite-plugin.mjs — the dev-only RMBG-2.0 lab route.
 *
 * Adds to `npm run dev` and nothing else:
 *
 *   /rmbg2                    the lab page (localhost-only)
 *   /rmbg2/list               available input images
 *   /rmbg2/run                run inference (SSE progress stream)
 *   /rmbg2/out/<file>         serve the generated PNGs
 *   /rmbg2/report             serve the generated report.html
 *
 * Dev-only, three ways over. It is registered from `apply: 'serve'` in
 * vite.config.js, so `npm run build` never sees it; every request is rejected
 * unless the socket came from the loopback interface; and the page itself is
 * absent from `dist/`. Nothing here can end up in the published site.
 *
 * Inference is delegated to `scripts/rmbg2.mjs` as a CHILD PROCESS, never
 * imported. Two reasons, and the second is the important one:
 *   1. A 1024x1024 RMBG-2.0 run is a multi-GB working set; if it dies it should
 *      die alone, not take the dev server with it.
 *   2. `onnxruntime-node` cannot coexist with Vite's module graph - Vite tries to
 *      pre-bundle its native bindings and fails. A child process sidesteps that
 *      entirely.
 *
 * The child is long-lived so the loaded session is reused between runs - loading
 * the model costs minutes, and paying it once per image would be unbearable.
 */

import { spawn } from 'node:child_process'
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  ROOT,
  OUTPUT_DIR,
  UPLOAD_DIR,
  PAGE_PATH,
  PAGE_URI,
  CHECKPOINTS,
  PROVIDERS,
  DEFAULT_PROVIDER
} from './rmbg2.config.mjs'
import { weightsStatus, cachePaths } from './rmbg2-session.mjs'

const RUNNER = fileURLToPath(new URL('./rmbg2.mjs', import.meta.url))
const IMAGE_EXT = /\.(png|jpe?g|webp|avif|tiff?|bmp)$/i

/** Uploads are bounded: a multi-MB photo is fine, a 4 GB file is a mistake. */
const MAX_UPLOAD_BYTES = 40 * 1024 * 1024

/**
 * Content types the browser can render in the results grid. Anything else is
 * refused rather than served as octet-stream, so a mislabelled upload cannot
 * turn this route into a generic file host.
 */
const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff'
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

/** Loopback only. The dev server is on localhost, but never rely on that. */
function isLocal(request) {
  const address = request.socket?.remoteAddress || ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function deny(response) {
  response.statusCode = 403
  response.setHeader('Content-Type', 'text/plain; charset=utf-8')
  response.end('The RMBG-2.0 lab is only reachable from this machine.')
}

/** The child process, started lazily and kept warm for the life of the server. */
class Runner {
  constructor() {
    this.child = null
    this.pending = []
    this.buffer = ''
    this.listeners = new Set()
    this.lastStats = null
  }

  start() {
    if (this.child) return

    this.child = spawn(process.execPath, [RUNNER, '--serve'], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env, // carries HF_TOKEN when it was exported rather than in .env
      windowsHide: true
    })

    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk) => this.consume(chunk))

    this.child.stderr.setEncoding('utf8')
    this.child.stderr.on('data', (text) => this.emit({ type: 'log', text: text.trimEnd() }))

    this.child.on('exit', (code) => {
      this.emit({ type: 'log', text: `runner exited (code ${code})` })
      this.child = null
      this.pending = []
      this.lastStats = null
    })
  }

  consume(chunk) {
    this.buffer += chunk
    let index
    while ((index = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, index).trim()
      this.buffer = this.buffer.slice(index + 1)
      if (!line) continue
      try {
        this.emit(JSON.parse(line))
      } catch {
        this.emit({ type: 'log', text: line })
      }
    }
  }

  emit(message) {
    if (message.type === 'stats') {
      this.lastStats = { ...message, at: Date.now() }
      return
    }
    // `ready` announces a freshly started child; anything still waiting on one
    // can now send its request.
    if (message.type === 'ready') {
      const waiting = this.pending
      this.pending = []
      for (const send of waiting) send()
    }
    for (const listener of this.listeners) listener(message)
  }

  onMessage(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Resolves once the child has announced itself. */
  whenReady() {
    this.start()
    return new Promise((resolve) => {
      if (this.child) return resolve()
      this.pending.push(resolve)
    })
  }

  send(request) {
    this.start()
    this.child?.stdin.write(`${JSON.stringify(request)}\n`)
  }

  dispose() {
    this.child?.kill()
    this.child = null
    this.lastStats = null
  }
}

export function rmbg2Lab() {
  const runner = new Runner()

  return {
    name: 'purecut:rmbg2-lab',
    apply: 'serve',

    configureServer(server) {
      // The page is dev-only, so point the route straight at the on-disk file.
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url, 'http://localhost')
        if (url.pathname !== `/${PAGE_PATH}`) return next()

        if (!isLocal(request)) return deny(response)
        try {
          const html = await readFile(fileURLToPath(new URL('./rmbg2.page.html', import.meta.url)), 'utf8')
          response.setHeader('Content-Type', 'text/html; charset=utf-8')
          response.end(html)
        } catch (error) {
          response.statusCode = 500
          response.end(`Could not read the lab page: ${error.message}`)
        }
      })

      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url, 'http://localhost')
        if (!url.pathname.startsWith(PAGE_URI)) return next()

        if (!isLocal(request)) return deny(response)
        const route = url.pathname.slice(PAGE_URI.length) || '/'

        try {
          if (route === '/' || route === '') {
            const html = await readFile(fileURLToPath(new URL('./rmbg2.page.html', import.meta.url)), 'utf8')
            response.setHeader('Content-Type', 'text/html; charset=utf-8')
            return response.end(html)
          }

          // The page's own assets. Served from disk rather than through Vite's
          // module graph because the page itself is a plain file this middleware
          // returns; keeping them together means one place to look.
          if (route === '/app.css') {
            return sendFile(response, fileURLToPath(new URL('./rmbg2.page.css', import.meta.url)), 'text/css')
          }
          if (route === '/app.js') {
            return sendFile(response, fileURLToPath(new URL('./rmbg2.page.js', import.meta.url)), 'text/javascript')
          }
          if (route === '/list') return await handleList(response)
          if (route === '/providers') return await handleProviders(response)
          if (route === '/system') return handleSystem(runner, response)
          if (route === '/clear-cache') return await handleClearCache(runner, response, url)
          if (route === '/upload') return await handleUpload(request, response, url)
          if (route === '/delete') return await handleDelete(response, url)
          if (route === '/clear') return await handleClear(response)
          if (route === '/preload') return await handlePreload(runner, response, url)
          if (route === '/run') return await handleRun(runner, response, url)
          if (route === '/report') return await sendFile(response, path.join(OUTPUT_DIR, 'report.html'), 'text/html')
          if (route.startsWith('/out/')) return await handleOutput(response, route)
          if (route.startsWith('/input/')) return await handleUploadedImage(response, route)
        } catch (error) {
          return json(response, 500, { error: error.message })
        }

        next()
      })

      server.httpServer?.once('close', () => runner.dispose())
    }
  }
}

async function handleList(response) {
  let files = []
  try {
    const names = (await readdir(UPLOAD_DIR)).filter((n) => IMAGE_EXT.test(n)).sort()
    files = await Promise.all(
      names.map(async (name) => {
        const info = await stat(path.join(UPLOAD_DIR, name))
        return { name, bytes: info.size, mtimeMs: info.mtimeMs, path: path.join(UPLOAD_DIR, name) }
      })
    )
  } catch {
    // folder not created yet
  }

  json(response, 200, {
    inputs: files.map((f) => f.name),
    files,
    // `cached` lets the page say "already downloaded" up front, so a first run on a
    // new checkpoint is a known cost rather than a surprise 977 MB wait.
    checkpoints: await Promise.all(
      CHECKPOINTS.map(async ({ label, file, approxSize, note, model }) => {
        const status = await weightsStatus(model, file)
        return { label, file, approxSize, note, cached: status.cached, cachedBytes: status.bytes }
      })
    )
  })
}

/** Which providers the installed onnxruntime-node can actually run. */
async function handleProviders(response) {
  let supported = []
  try {
    const ort = await import('onnxruntime-node')
    const api = ort.default && ort.default.InferenceSession ? ort.default : ort
    supported = (api.listSupportedBackends?.() || []).map((b) => b.name)
  } catch {
    // Not installed yet - report the options as unavailable rather than 500.
  }

  json(response, 200, {
    supported,
    // CUDA is deliberately absent: onnxruntime-node bundles no CUDA provider, so
    // it is not offered as a choice that would fail.
    providers: PROVIDERS.map(({ id, label, note, available }) => ({
      id,
      label,
      note,
      available: available && supported.includes(id)
    })),
    default: DEFAULT_PROVIDER
  })
}

let prevServerCpu = process.cpuUsage()
let prevServerTime = Date.now()

function getDevServerMetrics() {
  const now = Date.now()
  const dtMicros = (now - prevServerTime) * 1000
  const cpuDiff = process.cpuUsage(prevServerCpu)
  prevServerCpu = process.cpuUsage()
  prevServerTime = now
  const cpuPercent = dtMicros > 0 ? Math.round(((cpuDiff.user + cpuDiff.system) / dtMicros) * 100) : 0
  const rss = process.memoryUsage().rss
  return { cpuPercent, rss }
}

function handleSystem(runner, response) {
  const numCores = os.cpus().length || 1
  const server = getDevServerMetrics()
  const engineStats = runner?.lastStats && (Date.now() - runner.lastStats.at < 3500)
    ? runner.lastStats
    : null

  const engineRss = engineStats ? engineStats.rss : 0
  const serverCpu = server.cpuPercent
  const engineCpu = engineStats ? engineStats.cpuPercent : 0
  const totalProcessCpu = Math.min(100, Math.round((serverCpu + engineCpu) / numCores))
  const totalRss = server.rss + engineRss

  return json(response, 200, {
    cpu: {
      loadPercent: totalProcessCpu,
      serverCpuPercent: Math.min(100, Math.round(serverCpu / numCores)),
      engineCpuPercent: Math.min(100, Math.round(engineCpu / numCores))
    },
    ram: {
      totalMb: Math.round(totalRss / 1048576),
      serverMb: Math.round(server.rss / 1048576),
      engineMb: Math.round(engineRss / 1048576),
      engineWarm: Boolean(engineStats?.warm),
      activeModel: engineStats?.model || null
    }
  })
}

async function handleClearCache(runner, response, url) {
  const file = url.searchParams.get('file') || url.searchParams.get('checkpoint') || ''
  const cp = CHECKPOINTS.find((c) => c.file === file)
  if (!cp) return json(response, 404, { error: 'Unknown checkpoint' })

  // Kill running runner process so it unloads session from RAM
  runner?.dispose()

  const { weights, meta } = cachePaths(cp.model, cp.file)
  let deleted = false
  try {
    await unlink(weights)
    deleted = true
  } catch { /* absent */ }
  try {
    await unlink(meta)
  } catch { /* absent */ }

  return json(response, 200, { cleared: true, file, deleted })
}

/**
 * Accept one image as a raw request body, with the filename in the query string.
 *
 * Raw-body rather than multipart on purpose: parsing multipart correctly needs a
 * dependency or a lot of edge cases, and the page has the File object in hand so
 * it can just POST the bytes. The name is sanitised to a basename and the
 * extension whitelisted, so a crafted `?name=` cannot escape the input folder.
 */
async function handleUpload(request, response, url) {
  if (request.method !== 'POST') return json(response, 405, { error: 'POST only.' })

  const raw = url.searchParams.get('name') || ''
  const name = sanitizeImageName(raw)
  if (!name) {
    return json(response, 400, { error: `Unsupported name or extension: ${raw || '(empty)'}` })
  }

  const declared = Number(request.headers['content-length'] || 0)
  if (declared > MAX_UPLOAD_BYTES) {
    return json(response, 413, {
      error: `Too large: ${(declared / 1048576).toFixed(1)} MB (limit ${MAX_UPLOAD_BYTES / 1048576} MB).`
    })
  }

  let body
  try {
    body = await readBody(request, MAX_UPLOAD_BYTES)
  } catch (error) {
    return json(response, 413, { error: error.message })
  }

  if (!body.length) return json(response, 400, { error: 'Empty upload.' })

  try {
    await mkdir(UPLOAD_DIR, { recursive: true })
    await writeFile(path.join(UPLOAD_DIR, name), body)
  } catch (error) {
    return json(response, 500, { error: `Could not save: ${error.message}` })
  }

  return json(response, 200, { name, bytes: body.length, path: path.join(UPLOAD_DIR, name) })
}

/** Remove an image from the uploads folder. Name is sanitised the same way. */
async function handleDelete(response, url) {
  const name = sanitizeImageName(url.searchParams.get('name') || '')
  if (!name) return json(response, 400, { error: 'Unsupported name.' })

  try {
    await unlink(path.join(UPLOAD_DIR, name))
    return json(response, 200, { removed: name })
  } catch {
    return json(response, 404, { error: `Not found: ${name}` })
  }
}

/**
 * Empty the uploads folder.
 *
 * The page calls this on load so a visit starts clean: the lab runs only what you
 * upload in that session, and nothing piles up between visits. It deliberately
 * touches `uploads/` only - never the CLI's `inputs/`, which may hold a staged
 * batch that is none of the GUI's business.
 */
async function handleClear(response) {
  let removed = 0
  try {
    const names = (await readdir(UPLOAD_DIR)).filter((n) => IMAGE_EXT.test(n))
    for (const name of names) {
      await unlink(path.join(UPLOAD_DIR, name))
      removed++
    }
  } catch {
    // Nothing to clear.
  }
  return json(response, 200, { removed })
}

/**
 * Download weights without running inference.
 *
 * Exists so a several-hundred-MB fetch is something you choose to do, rather than
 * a surprise stall in the middle of your first run.
 */
async function handlePreload(runner, response, url) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  const send = (payload) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
  const off = runner.onMessage(send)

  const checkpoint = url.searchParams.get('checkpoint') || ''
  const all = url.searchParams.get('all') === '1'

  const finish = (message) => {
    if (message.type === 'preloaded' || message.type === 'error') {
      off()
      response.end()
    }
  }
  runner.onMessage(finish)

  await runner.whenReady()
  runner.send({ action: 'preload', checkpoint, all })
}

/** Serve an uploaded image so the page can show a thumbnail of it. */
async function handleUploadedImage(response, route) {
  const name = sanitizeImageName(decodeURIComponent(route.slice('/input/'.length)))
  if (!name) return json(response, 400, { error: 'Unsupported name.' })

  const target = path.join(UPLOAD_DIR, name)
  if (!target.startsWith(UPLOAD_DIR)) return json(response, 403, { error: 'Outside the uploads folder.' })

  return sendFile(response, target, MIME[path.extname(name).toLowerCase()] || 'application/octet-stream')
}

/**
 * Reduce any incoming name to a safe `<base>.<known extension>`.
 *
 * Returns null when it cannot be made safe. `path.basename` strips directory
 * components, but a Windows-style `..\\evil.png` is not a separator on POSIX, so
 * any remaining separator characters are removed explicitly rather than trusted.
 */
function sanitizeImageName(raw) {
  const base = path.basename(String(raw)).replace(/[\\/:\u0000]/g, '')
  if (!base || base === '.' || base === '..') return null
  const ext = path.extname(base).toLowerCase()
  if (!IMAGE_EXT.test(base)) return null
  // Strip anything that is not a conservative filename character.
  const stem = path.basename(base, path.extname(base)).replace(/[^\w.\- ]+/g, '_').slice(0, 80)
  if (!stem) return null
  return `${stem}${ext}`
}

/** Collect a request body, refusing to buffer past `limit`. */
function readBody(request, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let seen = 0
    request.on('data', (chunk) => {
      seen += chunk.length
      if (seen > limit) {
        reject(new Error(`Upload exceeded ${limit / 1048576} MB.`))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks)))
    request.on('error', reject)
  })
}

/**
 * Runs already seen, keyed by the page's per-click run id.
 *
 * WHY THIS EXISTS. `EventSource` RECONNECTS on its own whenever the server ends the
 * response, and this endpoint is a one-shot job - so ending the stream after a
 * result made the browser re-request the same URL and start the whole run again,
 * indefinitely. The page now closes its stream (that is the primary fix); this map
 * is the safety net for a client that cannot close: a tab reloaded mid-run, a
 * crashed page, or a reconnect that slips through. A repeat request replays the
 * stored result instead of starting a second multi-minute job.
 *
 * Bounded, because it holds full base64 previews per entry.
 */
const runs = new Map()
const MAX_REMEMBERED_RUNS = 6

function rememberRun(runId, entry) {
  if (!runId) return
  runs.set(runId, entry)
  while (runs.size > MAX_REMEMBERED_RUNS) {
    runs.delete(runs.keys().next().value)
  }
}

/**
 * Progress is streamed as SSE because the first run downloads the weights and
 * loads the session - minutes of silence otherwise, which reads as a hang.
 */
async function handleRun(runner, response, url) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  const send = (payload) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
  const off = runner.onMessage(send)

  // The page chooses what to run; an empty `inputs` means "everything in the folder".
  const runId = url.searchParams.get('runId') || ''
  const checkpoint = url.searchParams.get('checkpoint') || ''
  const provider = url.searchParams.get('provider') || ''
  const tta = url.searchParams.get('tta') === '1'
  // "Close the model once every image is done" - used by Run All Model so only one
  // checkpoint is ever resident.
  const release = url.searchParams.get('release') === '1'
  // The page sends the NAMES it uploaded; the absolute path is built here, so a
  // request can never aim the runner at an arbitrary file on disk. Each name is
  // re-sanitised rather than trusted.
  //
  // An empty list must NOT fall through to the runner's "no filters = everything
  // in inputs/" behaviour: that folder belongs to the CLI and may hold a staged
  // batch, which the GUI has no business running.
  const requested = (url.searchParams.get('inputs') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const inputs = requested
    .map((name) => sanitizeImageName(name))
    .filter(Boolean)
    .map((name) => path.join(UPLOAD_DIR, name))

  const invalid = requested.length - inputs.length

  if (!inputs.length) {
    send({ type: 'error', message: 'No images selected - upload one first.' })
    off()
    return response.end()
  }
  if (invalid > 0) {
    send({ type: 'log', text: `${invalid} selected name(s) were rejected as unsafe and skipped.` })
  }

  const previous = runId ? runs.get(runId) : null

  // Already finished: replay it. Never start the work again.
  if (previous && previous.status === 'done') {
    send({ type: 'log', text: 'this job already finished - replaying its result instead of re-running' })
    send({ type: 'result', ...previous.payload, replayed: true })
    off()
    return response.end()
  }

  // Still running (a reconnect mid-job): follow it, do not restart it.
  if (previous && previous.status === 'running') {
    send({ type: 'log', text: 'this job is already running - following it, not restarting' })
    const follow = (message) => {
      if (message.type === 'result' || message.type === 'error') {
        off()
        response.end()
      }
    }
    runner.onMessage(follow)
    return
  }

  const clearReport = url.searchParams.get('clearReport') === '1'
  const appendReport = url.searchParams.get('appendReport') === '1'

  rememberRun(runId, { status: 'running' })

  // Warm-up is announced so a first-time run says "starting the runner" rather
  // than nothing at all.
  send({ type: 'log', text: 'runner: starting (first run also downloads the checkpoint)' })
  await runner.whenReady()
  runner.send({ action: 'run', inputs, checkpoint, provider, release, tta, clearReport, appendReport })

  // The batch is one request/one result, so close the stream when it lands.
  const finish = (message) => {
    if (message.type === 'result' || message.type === 'error') {
      off()
      rememberRun(runId, { status: 'done', payload: message })
      response.end()
    }
  }
  runner.onMessage(finish)
}

async function handleOutput(response, route) {
  // Resolve then verify containment - never trust a path straight off the wire.
  const name = decodeURIComponent(route.slice('/out/'.length))
  const target = path.join(OUTPUT_DIR, path.basename(name))
  if (!target.startsWith(OUTPUT_DIR)) return json(response, 403, { error: 'Outside the output folder.' })

  const type = /\.html$/.test(target)
    ? 'text/html'
    : /\.png$/.test(target)
      ? 'image/png'
      : 'application/octet-stream'
  return sendFile(response, target, type)
}

async function sendFile(response, target, contentType) {
  try {
    const info = await stat(target)
    if (!info.isFile()) throw new Error('not a file')
    const body = await readFile(target)
    // A charset is only meaningful for text. Appending it to `image/png` (or any
    // binary type) is wrong, so it is added only where it belongs.
    const needsCharset = contentType.startsWith('text/') || contentType.startsWith('application/json')
    response.setHeader('Content-Type', needsCharset ? `${contentType}; charset=utf-8` : contentType)
    response.end(body)
  } catch {
    response.statusCode = 404
    response.end(`Not found: ${path.basename(target)}`)
  }
}

function json(response, status, payload) {
  response.statusCode = status
  response.setHeader('Content-Type', JSON_HEADERS['Content-Type'])
  response.end(JSON.stringify(payload))
}