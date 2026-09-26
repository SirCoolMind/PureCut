/**
 * rmbg2-session.mjs — the ONNX session and the batch loop for the RMBG-2.0 lab.
 *
 * CPU ONLY. `executionProviders: ['cpu']`, always. Not a preference: this is a CPU
 * tester. RMBG-2.0 at 1024x1024 needs a multi-GB working set; the machine will
 * swap. That is the cost of running the full model rather than the 512px BiRefNet
 * the studio ships, and it is deliberate - not a bug to be optimised away.
 *
 * `briaai/RMBG-2.0` cannot load in a browser at all: its ONNX export fails at
 * session creation under `onnxruntime-web` (`ShapeInferenceError ... inferred=4
 * declared=6`) and the WASM build hardcodes strict shape inference. The identical
 * bytes load fine here, which is the whole reason this lab exists outside `src/`.
 * See AGENTS.md, "Testing RMBG-2.0 anyway".
 *
 * Split out of `rmbg2.mjs` when that file crossed the repo's 800-line budget.
 */

import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { ROOT, OUTPUT_DIR, INPUT_SIZE, NORMALIZE, providerChain, resolveToken } from './rmbg2.config.mjs'
import {
  composeCutout,
  extractMask,
  maskToPng,
  previewJpeg,
  previewMask,
  previewOverChecker,
  preprocess
} from './rmbg2-image.mjs'
import { buildReport } from './rmbg2-report.mjs'

/** Loaded on demand so the install hint is the error, not a bare module-not-found. */
export async function importOrt() {
  let mod
  try {
    mod = await import('onnxruntime-node')
  } catch {
    throw new Error(
      'onnxruntime-node is not installed.\n' +
        'Run:  npm install -D onnxruntime-node --cpu\n' +
        'It is large; the --cpu flag skips the GPU binary.'
    )
  }
  return mod.default && mod.default.InferenceSession ? mod.default : mod
}

export const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

/** Where one checkpoint's weights live. Kept in one place so cache and reports agree. */
export function cachePaths(model, file) {
  const dir = path.join(ROOT, 'rmbg2-lab', '.cache', model.replace('/', '__'))
  const weights = path.join(dir, path.basename(file))
  return { dir, weights, meta: `${weights}.meta.json` }
}

/**
 * Cache state for one checkpoint, without instantiating a session or touching
 * onnxruntime - so the GUI can label what is already downloaded.
 */
export async function weightsStatus(model, file) {
  const { weights, meta } = cachePaths(model, file)
  try {
    const { size } = await stat(weights)
    if (size < 1024 * 1024) return { cached: false, bytes: 0 }
    try {
      const recorded = JSON.parse(await readFile(meta, 'utf8'))
      if (typeof recorded.bytes === 'number' && recorded.bytes !== size) {
        return { cached: false, bytes: size, partial: true }
      }
    } catch {
      // No sidecar: treat a plausible-looking file as cached rather than forcing a
      // several-hundred-MB re-download over a missing metadata file.
    }
    return { cached: true, bytes: size }
  } catch {
    return { cached: false, bytes: 0 }
  }
}

/**
 * A warm session, reused across images. Loading is a one-off cost measured in
 * tens of seconds to minutes; re-creating it per image would dominate the run.
 */
export class Rmbg2Session {
  constructor({ token, model, file, onLog, provider }) {
    this.token = token
    this.model = model
    this.file = file
    this.provider = provider || 'cpu'
    this.onLog = onLog || (() => {})
    this.session = null
    this.loadMs = 0
    // The provider is part of the cache key: a dml session and a cpu session are
    // different sessions, and reusing one for the other would silently report the
    // wrong timings.
    this.cacheDir = path.join(ROOT, 'rmbg2-lab', '.cache', model.replace('/', '__'))
  }

  /** Changing provider must drop the warm session, exactly like changing checkpoint. */
  setProvider(provider) {
    if (!provider || provider === this.provider) return false
    this.provider = provider
    this.release()
    return true
  }

  /**
   * Drop the warm session and hand its memory back.
   *
   * Setting `this.session = null` is NOT enough on its own. An ONNX InferenceSession
   * owns a large native allocation - fp32 at a 1024x1024 input measured ~11.5 GB
   * resident - which is only returned when `release()` is called or the process
   * exits. Cycling checkpoints would otherwise keep every model's memory alive at
   * once, so "Run All Model" would build up until the machine swapped.
   *
   * Returns true when there was something to release.
   */
  release() {
    if (!this.session) return false
    try {
      this.session.release?.()
    } catch {
      // Already released or never fully created; dropping the reference is enough.
    }
    this.session = null
    return true
  }

  get url() {
    return `https://huggingface.co/${this.model}/resolve/main/${this.file}`
  }

  get localPath() {
    return path.join(this.cacheDir, path.basename(this.file))
  }

  /** Sidecar recording how many bytes a COMPLETE download has. */
  get metaPath() {
    return `${this.localPath}.meta.json`
  }

  /**
   * Is the cached copy complete, and how big is it? Returns 0 when there is no
   * usable cache.
   *
   * A truncated download is worse than none at all: it surfaces much later as
   * `protobuf parsing failed`, which reads like a corrupt checkpoint rather than an
   * interrupted one. So the byte count is written next to the file at download time
   * and re-checked on every run, and a mismatch counts as absent.
   */
  async cachedBytes() {
    try {
      const { size } = await stat(this.localPath)
      if (size < 1024 * 1024) return 0

      try {
        const meta = JSON.parse(await readFile(this.metaPath, 'utf8'))
        if (typeof meta.bytes === 'number' && meta.bytes !== size) return 0
      } catch {
        // No sidecar: written by an older version. Adopt the current size and record
        // it, so truncation from here on IS detectable.
        await writeFile(this.metaPath, JSON.stringify({ file: this.file, bytes: size }, null, 2))
      }
      return size
    } catch {
      return 0
    }
  }

  /**
   * Download once, then reuse for every later run. This is what makes a second
   * `npm run rmbg2` instant instead of another multi-hundred-MB fetch.
   */
  async ensureWeights() {
    await mkdir(this.cacheDir, { recursive: true })

    const cached = await this.cachedBytes()
    if (cached) {
      this.onLog(`weights: cached and complete (${mb(cached)}) - no download needed`)
      return this.localPath
    }

    // Never resume from or keep a partial file: it would load as a corrupt graph.
    await rm(this.localPath, { force: true })
    await rm(this.metaPath, { force: true })

    // Resolve the token HERE, at the point of use, rather than trusting the
    // constructor to have been handed one.
    //
    // The GUI drives this module through `--serve`, and that path returns from
    // `main()` BEFORE the CLI's `resolveToken()` call - so `this.token` stayed ''
    // and the request went out as `Authorization: Bearer ` (empty). Hugging Face
    // answers that with 401, which the error handler then reported as "licence not
    // accepted" - a misleading message for a bug that was entirely ours. Resolving
    // lazily makes every entry point (CLI, --serve, future ones) work by default.
    const token = resolveToken(this.token)
    this.token = token

    this.onLog(`weights: not cached - downloading ${this.file} (this is the long part)`)
    this.onLog(`weights: ${this.url}`)

    const response = await fetch(this.url, {
      headers: { Authorization: `Bearer ${token}` }
    })

    // The repo is `gated: "auto"`, so this is the expected first-run failure and
    // it deserves an actionable message rather than a bare HTTP code.
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Hugging Face refused the download (HTTP ${response.status}).\n` +
          'Accept the licence at https://huggingface.co/briaai/RMBG-2.0 and check\n' +
          'that .env has a READ token for that same account.\n' +
          `Token in use: ${token.length} characters, starting "${token.slice(0, 3)}".`
      )
    }
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`)
    }

    const total = Number(response.headers.get('content-length') || 0)
    const chunks = []
    let seen = 0
    let nextTick = Date.now()

    for await (const chunk of response.body) {
      chunks.push(chunk)
      seen += chunk.length
      if (Date.now() > nextTick) {
        nextTick = Date.now() + 3000
        const pct = total ? ` ${((seen / total) * 100).toFixed(1)}%` : ''
        this.onLog(`weights: ${mb(seen)}${total ? ` / ${mb(total)}` : ''}${pct}`)
      }
    }

    const buffer = Buffer.concat(chunks)
    if (total && buffer.length !== total) {
      await rm(this.localPath, { force: true })
      throw new Error(`Truncated download: got ${buffer.length} of ${total} bytes. Retry.`)
    }

    await writeFile(this.localPath, buffer)
    // Record the size so a future truncated copy is detected rather than loaded.
    await writeFile(
      this.metaPath,
      JSON.stringify(
        { model: this.model, file: this.file, bytes: buffer.length, downloadedAt: new Date().toISOString() },
        null,
        2
      )
    )
    this.onLog(`weights: saved ${mb(buffer.length)} to rmbg2-lab/.cache - future runs reuse it`)
    return this.localPath
  }

  /**
   * Fetch the weights without running anything, so the download cost is paid once,
   * deliberately, instead of on the first inference.
   */
  async preload() {
    const bytes = await this.cachedBytes()
    if (bytes) {
      this.onLog(`preload: ${this.file} already cached (${mb(bytes)})`)
      return { cached: true, bytes }
    }
    await this.ensureWeights()
    return { cached: false, bytes: await this.cachedBytes() }
  }

  async load() {
    if (this.session) return this.session

    const ort = await importOrt()
    const weights = await this.ensureWeights()

    ort.env.logLevel = 'error'
    // Thread count is deliberately left at the ORT default: CPU inference is
    // intra-op parallel across all cores, and this graph needs every one of them.
    // The real constraint on a laptop is RAM, not thread contention.

    const chain = providerChain(this.provider)
    this.onLog(`session: creating on ${this.provider} (CPU-only default; this can take a while)`)
    const started = Date.now()
    try {
      this.session = await ort.InferenceSession.create(weights, {
        executionProviders: chain,
        graphOptimizationLevel: 'all',
        logSeverityLevel: 3
      })
    } catch (error) {
      // A GPU provider that cannot handle this graph must not lose the run. Fall
      // back to CPU, but SAY SO - a silent downgrade would make every timing
      // afterwards a lie.
      if (this.provider !== 'cpu') {
        this.onLog(`session: ${this.provider} failed (${error.message.split('\n')[0]})`)
        this.onLog('session: falling back to cpu - timings below are CPU timings')
        this.provider = 'cpu'
        this.session = await ort.InferenceSession.create(weights, {
          executionProviders: ['cpu'],
          graphOptimizationLevel: 'all',
          logSeverityLevel: 3
        })
      } else {
        throw error
      }
    }
    this.loadMs = Date.now() - started
    this.onLog(
      `session: ready in ${(this.loadMs / 1000).toFixed(1)}s on ${this.provider} ` +
        `(inputs: ${this.session.inputNames.join(', ')})`
    )
    return this.session
  }

  async run(sourcePath, sharp, { tta = false } = {}) {
    const ort = await importOrt()
    const session = await this.load()

    this.onLog(`preprocess: ${path.basename(sourcePath)} -> ${INPUT_SIZE}x${INPUT_SIZE}`)
    let started = Date.now()
    const pre = await preprocess(sharp, sourcePath)
    const preprocessMs = Date.now() - started

    const feeds = {
      [session.inputNames[0]]: new ort.Tensor('float32', pre.tensor.data, pre.tensor.dims)
    }

    this.onLog('inference: running the graph (minutes on CPU is normal)')
    started = Date.now()
    const outputs = await session.run(feeds)
    let inferenceMs = Date.now() - started

    started = Date.now()
    const mask = extractMask(outputs, session.outputNames)
    let postprocessMs = Date.now() - started

    if (tta) {
      this.onLog('inference: running flip pass (TTA) to refine tricky fingers and edges')
      started = Date.now()
      const { data: flopData } = await sharp(pre.buffer)
        .rotate()
        .flop()
        .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })

      const plane = INPUT_SIZE * INPUT_SIZE
      const tensorFlop = new Float32Array(3 * plane)
      const { mean, std } = NORMALIZE
      for (let c = 0; c < 3; c++) {
        const offset = c * plane
        for (let i = 0; i < plane; i++) {
          tensorFlop[offset + i] = (flopData[i * 3 + c] / 255 - mean[c]) / std[c]
        }
      }
      const flopOutputs = await session.run({
        [session.inputNames[0]]: new ort.Tensor('float32', tensorFlop, [1, 3, INPUT_SIZE, INPUT_SIZE])
      })
      inferenceMs += Date.now() - started

      started = Date.now()
      const maskFlop = extractMask(flopOutputs, session.outputNames)
      const unfloppedBytes = (await sharp(Buffer.from(maskFlop.bytes), {
        raw: { width: INPUT_SIZE, height: INPUT_SIZE, channels: 1 }
      })
        .flop()
        .toColourspace('b-w')
        .raw()
        .toBuffer({ resolveWithObject: true })).data

      let sum = 0
      let aboveHalf = 0
      for (let i = 0; i < plane; i++) {
        const merged = Math.max(mask.bytes[i], unfloppedBytes[i])
        mask.bytes[i] = merged
        sum += merged / 255
        if (merged >= 128) aboveHalf++
      }
      mask.stats.meanAlpha = Number((sum / plane).toFixed(5))
      mask.stats.coverage = Number((aboveHalf / plane).toFixed(5))
      postprocessMs += Date.now() - started
    }

    return { pre, mask, timings: { preprocessMs, inferenceMs, postprocessMs }, tta }
  }
}

/* ------------------------------------------------------------------ *
 * Batch -> files + report
 * ------------------------------------------------------------------ */

export async function runBatch({ session, sharp, inputs, onLog, writeReport = true, tta = false }) {
  await mkdir(OUTPUT_DIR, { recursive: true })
  const results = []

  for (const [index, sourcePath] of inputs.entries()) {
    const base = path.basename(sourcePath).replace(/\.[^.]+$/, '')
    onLog(`-- [${index + 1}/${inputs.length}] ${path.basename(sourcePath)}${tta ? ' (TTA)' : ''}`)

    try {
      const { pre, mask, timings } = await session.run(sourcePath, sharp, { tta })
      const maskPng = await maskToPng(sharp, mask)
      const cutoutPng = await composeCutout(
        sharp,
        pre.buffer,
        mask.bytes,
        mask.width,
        mask.height
      )

      const cutoutPath = path.join(OUTPUT_DIR, `${base}-cutout.png`)
      const maskPath = path.join(OUTPUT_DIR, `${base}-mask.png`)
      await writeFile(cutoutPath, cutoutPng)
      await writeFile(maskPath, maskPng)

      results.push({
        name: path.basename(sourcePath),
        base,
        sourcePath,
        cutoutPath,
        maskPath,
        width: pre.sourceWidth,
        height: pre.sourceHeight,
        // The checkpoint is recorded per result: "Run all models" produces several
        // cards for the same image, and without this they would be indistinguishable.
        checkpoint: session.file,
        timings: { ...timings, provider: session.provider },
        tta: Boolean(tta),
        mask: mask.stats,
        files: { cutout: `${base}-cutout.png`, mask: `${base}-mask.png` },
        previews: {
          original: (await previewJpeg(sharp, pre.buffer)).toString('base64'),
          cutout: (await previewOverChecker(sharp, cutoutPng)).toString('base64'),
          mask: (await previewMask(sharp, mask.bytes, mask.width, mask.height)).toString('base64')
        }
      })

      const { meanAlpha, coverage, separation, min, max } = mask.stats
      onLog(
        `   ok  ${(timings.inferenceMs / 1000).toFixed(1)}s inference, ` +
          `mask mean=${(meanAlpha * 100).toFixed(1)}% coverage=${(coverage * 100).toFixed(1)}% ` +
          `range=${min}..${max} (${separation} separation)`
      )
    } catch (error) {
      onLog(`   FAILED: ${error.message}`)
      results.push({ name: path.basename(sourcePath), sourcePath, error: error.message })
    }
  }

  let reportPath = null
  if (writeReport) {
    reportPath = path.join(OUTPUT_DIR, 'report.html')
    await writeFile(reportPath, buildReport({ session, results }), 'utf8')
    onLog(`report: ${path.relative(ROOT, reportPath).replace(/\\/g, '/')}`)
  }

  return { results, reportPath }
}