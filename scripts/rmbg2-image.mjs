/**
 * rmbg2-image.mjs — ALL `sharp` usage for the RMBG-2.0 lab.
 *
 * Sharp is only needed once actual image work starts, which is why it lives behind
 * `importSharp()` rather than at module scope: `npm run rmbg2 -- --list` and
 * `--help` then work on a clone that never ran the native install step.
 *
 * Owns four jobs, in pipeline order:
 *   1. input discovery + synthetic exemplars  (listInputs / ensureExemplars)
 *   2. preprocessing, mirroring BRIA's reference transforms exactly
 *   3. mask post-processing (sigmoid, statistics, PNG encoding)
 *   4. previews for the report (checkerboard composite, JPEG/PNG downscales)
 *
 * Split out of `rmbg2.mjs` when that file crossed the repo's 800-line budget; the
 * seam is real (everything here takes `sharp` as its first argument and knows
 * nothing about ONNX or the CLI).
 */

import { mkdir, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { INPUT_DIR, INPUT_SIZE, NORMALIZE } from './rmbg2.config.mjs'

/** Loaded on demand so a missing native install cannot break `--list` / `--help`. */
export async function importSharp() {
  try {
    const mod = await import('sharp')
    return mod.default ?? mod
  } catch {
    throw new Error('sharp is not installed.\nRun:  npm install -D sharp')
  }
}

/* ------------------------------------------------------------------ *
 * Input discovery
 * ------------------------------------------------------------------ */

const IMAGE_EXT = /\.(png|jpe?g|webp|avif|tiff?|bmp)$/i

export async function listInputs(filters) {
  let names = []
  try {
    names = (await readdir(INPUT_DIR)).filter((n) => IMAGE_EXT.test(n))
  } catch {
    // A missing folder is fine: absolute paths below do not need it. The GUI keeps
    // its uploads in `rmbg2-lab/uploads/` and passes full paths, so this path must
    // work even when the CLI's `inputs/` folder does not exist.
  }

  if (!filters.length) return names.map((n) => path.join(INPUT_DIR, n)).sort()

  const matched = []
  for (const filter of filters) {
    if (path.isAbsolute(filter)) {
      if (IMAGE_EXT.test(filter)) matched.push(filter)
      continue
    }
    const needle = filter.toLowerCase()
    for (const name of names) {
      if (name.toLowerCase().includes(needle)) matched.push(path.join(INPUT_DIR, name))
    }
  }
  return [...new Set(matched)]
}

/**
 * Zero-input path: build four synthetic exemplars so the first run has something
 * to chew on. A centred disc, a person-ish silhouette (the case portrait matting
 * models are actually trained for), a soft radial gradient (torque test: does the
 * mask come back as a continuous ramp rather than a hard threshold), and a
 * 2x2 checkerboard of low-contrast quadrants (tests whether the model invents
 * object boundaries where there are none).
 *
 * They are written to disk so the report can show a real "original".
 *
 * The disc earns its place: `pi*300^2/1024^2 = 26.96%`, and the model returns
 * 26.9%. That one number validates resize, channel order, normalisation, sigmoid
 * and resize-back simultaneously - keep it.
 */
export async function ensureExemplars(sharp) {
  const specs = [
    { name: 'sample-01-circle.png', kind: 'circle', size: 1024, bg: '#1b2430', fg: '#e8b04b' },
    { name: 'sample-02-silhouette.png', kind: 'silhouette', size: 1024, bg: '#141a22', fg: '#c9d4e0' },
    { name: 'sample-03-radial.png', kind: 'radial', size: 1024, bg: '#0d1117', fg: '#5aa9e6' },
    { name: 'sample-04-quadrants.png', kind: 'quadrants', size: 1024, bg: '#101418', fg: '#2c3a4a' }
  ]

  await mkdir(INPUT_DIR, { recursive: true })
  const created = []

  for (const spec of specs) {
    const target = path.join(INPUT_DIR, spec.name)
    try {
      await readFile(target)
      continue // already there; never overwrite a user file
    } catch {
      // missing -> create
    }

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${spec.size}" height="${spec.size}" viewBox="0 0 ${spec.size} ${spec.size}">
  <defs>
    <radialGradient id="g" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${spec.fg}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${spec.bg}" stop-opacity="1"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="${spec.bg}"/>
  ${spec.kind === 'circle' ? `<circle cx="512" cy="512" r="300" fill="${spec.fg}"/>` : ''}
  ${spec.kind === 'silhouette' ? `<g fill="${spec.fg}"><circle cx="512" cy="330" r="118"/><rect x="330" y="470" width="364" height="330" rx="120"/></g>` : ''}
  ${spec.kind === 'radial' ? `<circle cx="512" cy="512" r="460" fill="url(#g)"/>` : ''}
  ${spec.kind === 'quadrants' ? `<g fill="${spec.fg}"><rect x="0" y="0" width="512" height="512"/><rect x="512" y="512" width="512" height="512"/></g>` : ''}
</svg>`

    await sharp(Buffer.from(svg)).png().toFile(target)
    created.push(spec.name)
  }

  return created
}

/* ------------------------------------------------------------------ *
 * Preprocessing  (mirrors briaai's reference implementation exactly)
 * ------------------------------------------------------------------ */

const EXIF_SWAP = new Set([5, 6, 7, 8])

/**
 * Source image -> the model's expected NCHW float32 input.
 *
 * `fit: 'fill'` is deliberate: torchvision's `Resize((1024, 1024))` stretches
 * rather than letterboxes, so a non-square photo is distorted on the way in and
 * the mask is stretched back on the way out. Matching that quirk is the point -
 * we are testing THIS model, not an idealised version of it.
 */
export async function preprocess(sharp, sourcePath) {
  const buffer = await readFile(sourcePath)
  const meta = await sharp(buffer).metadata()

  let sourceWidth = meta.width
  let sourceHeight = meta.height
  if (meta.orientation && EXIF_SWAP.has(meta.orientation)) {
    ;[sourceWidth, sourceHeight] = [sourceHeight, sourceWidth]
  }

  const { data, info } = await sharp(buffer)
    .rotate()
    .resize(INPUT_SIZE, INPUT_SIZE, { fit: 'fill' })
    .removeAlpha()
    .toColourspace('bgr') // the ONNX graph was trained on OpenCV-order BGR
    .raw()
    .toBuffer({ resolveWithObject: true })

  const channels = info.channels
  const plane = INPUT_SIZE * INPUT_SIZE
  const input = new Float32Array(3 * plane)
  const { mean, std } = NORMALIZE

  for (let c = 0; c < 3; c++) {
    const offset = c * plane
    for (let i = 0; i < plane; i++) {
      const raw = data[i * channels + c] / 255
      input[offset + i] = (raw - mean[c]) / std[c]
    }
  }

  return {
    buffer,
    sourceWidth,
    sourceHeight,
    tensor: { data: input, dims: [1, 3, INPUT_SIZE, INPUT_SIZE] }
  }
}

/* ------------------------------------------------------------------ *
 * Mask post-processing
 * ------------------------------------------------------------------ */

/** Pull the mask plane out of the session outputs, normalising to 0..1. */
export function extractMask(outputs, outputNames) {
  const name = outputNames[0]
  const tensor = outputs[name] ?? outputs[Object.keys(outputs)[0]]
  if (!tensor) throw new Error('Model returned no output tensors.')

  const dims = tensor.dims
  const values = tensor.data
  const height = dims[dims.length - 2]
  const width = dims[dims.length - 1]

  const plane = height * width
  const mask = new Float32Array(plane)
  let min = Infinity
  let max = -Infinity

  for (let i = 0; i < plane; i++) {
    const v = values[i]
    mask[i] = v
    if (v < min) min = v
    if (v > max) max = v
  }

  // The reference applies `.sigmoid()`. An exported graph may already have it, so
  // only transform when the range says the raw logits survived.
  if (min < 0 || max > 1) {
    for (let i = 0; i < plane; i++) mask[i] = 1 / (1 + Math.exp(-mask[i]))
    min = Infinity
    max = -Infinity
    for (let i = 0; i < plane; i++) {
      if (mask[i] < min) min = mask[i]
      if (mask[i] > max) max = mask[i]
    }
  }

  let sum = 0
  let aboveHalf = 0
  const bytes = new Uint8Array(plane)
  for (let i = 0; i < plane; i++) {
    const clamped = mask[i] < 0 ? 0 : mask[i] > 1 ? 1 : mask[i]
    bytes[i] = Math.round(clamped * 255)
    sum += clamped
    if (clamped >= 0.5) aboveHalf++
  }

  // `meanAlpha` and `coverage` answer different questions, and they only agree
  // when the mask saturates. The default sample set proves it: sample-01's mask is
  // a clean 0/255 split, so both read ~27% and match the drawn circle exactly.
  // sample-02's mask never leaves 0.50-0.73, so the SAME 14%-foreground
  // segmentation reads 53% mean alpha and 100% coverage. Reporting one number
  // alone would let a low-confidence mask look decisive, which is the opposite of
  // what a quality lab is for.
  const meanAlpha = sum / plane
  const coverage = aboveHalf / plane
  // Does the mask actually span the range a confident decision needs?
  const separation = min < 0.25 && max > 0.75 ? 'strong' : min > 0.25 && max < 0.75 ? 'weak' : 'partial'

  return {
    width,
    height,
    bytes,
    stats: {
      outputName: name,
      dims,
      min: Number(min.toFixed(5)),
      max: Number(max.toFixed(5)),
      meanAlpha: Number(meanAlpha.toFixed(5)),
      coverage: Number(coverage.toFixed(5)),
      separation
    }
  }
}

/** Encode a mask plane as a single-channel PNG. */
export async function maskToPng(sharp, mask) {
  return sharp(Buffer.from(mask.bytes), {
    raw: { width: mask.width, height: mask.height, channels: 1 }
  })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/* ------------------------------------------------------------------ *
 * Cutout + previews
 * ------------------------------------------------------------------ */

/** A simple visual stand-in for transparency, so masks are readable in a report. */
function checkerboard(width, height, cell = 14) {
  const px = new Uint8Array(width * height * 4)
  const light = [214, 220, 229]
  const dark = [139, 149, 165]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? light : dark
      const i = (y * width + x) * 4
      px[i] = c[0]
      px[i + 1] = c[1]
      px[i + 2] = c[2]
      px[i + 3] = 255
    }
  }
  return { data: px, info: { width, height, channels: 4 } }
}

/**
 * Apply the mask as the image's alpha channel and export a PNG.
 *
 * Multiplying into an existing alpha (rather than overwriting it) keeps any
 * transparency the source already had, for the PNG inputs that have some.
 */
export async function composeCutout(sharp, sourceBuffer, maskBytes, maskW, maskH) {
  const { data, info } = await sharp(sourceBuffer)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Read the mask back at the source resolution.
  //
  // The channel count is READ, never assumed. sharp promotes a 1-channel raw
  // input to 3 channels (sRGB) on output unless told otherwise, so a loop that
  // indexes a 3-channel buffer as if it were 1 consumes only the first third of
  // the mask and leaves the rest unread. The symptom is nasty: the mask PNG is
  // perfect (it is written by a separate path), the RGB survives untouched, and
  // only the alpha is wrong - so the cutout comes out mostly transparent while
  // every number in the report still looks right.
  // (Measured: sample-01 read 12.8% opaque instead of 26.9%; the real photo lost
  // the subject entirely, keeping a correct RGB value at alpha 0.)
  const { data: scaled, info: maskInfo } = await sharp(Buffer.from(maskBytes), {
    raw: { width: maskW, height: maskH, channels: 1 }
  })
    .resize(info.width, info.height, { fit: 'fill' })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true })

  const channels = info.channels
  const maskChannels = maskInfo.channels
  const pixels = info.width * info.height

  const rgba = Buffer.from(data)
  for (let i = 0; i < pixels; i++) {
    const mask = scaled[i * maskChannels]
    rgba[i * channels + 3] = Math.round((rgba[i * channels + 3] * mask) / 255)
  }

  return sharp(rgba, {
    raw: { width: info.width, height: info.height, channels }
  })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

/** Downscaled transparent preview for cutout with alpha preserved. */
export async function previewCutout(sharp, cutoutPng, maxDim = 1200) {
  return sharp(cutoutPng)
    .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 6 })
    .toBuffer()
}

/** Downscaled preview over a checkerboard, for embedding in report.html. */
export async function previewOverChecker(sharp, cutoutPng, maxDim = 1200) {
  const meta = await sharp(cutoutPng).metadata()
  const scale = Math.min(1, maxDim / Math.max(meta.width, meta.height))
  const width = Math.max(1, Math.round(meta.width * scale))
  const height = Math.max(1, Math.round(meta.height * scale))

  const cut = await sharp(cutoutPng).resize(width, height, { fit: 'fill' }).png().toBuffer()
  const board = checkerboard(width, height)

  return sharp(board.data, { raw: board.info })
    .composite([{ input: cut, top: 0, left: 0 }])
    .png({ compressionLevel: 9 })
    .toBuffer()
}

export async function previewJpeg(sharp, sourceBuffer, maxDim = 1200) {
  return sharp(sourceBuffer)
    .rotate()
    .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 84 })
    .toBuffer()
}

export async function previewMask(sharp, maskBytes, width, height, maxDim = 1200) {
  const scale = Math.min(1, maxDim / Math.max(width, height))
  return sharp(Buffer.from(maskBytes), { raw: { width, height, channels: 1 } })
    .resize(Math.round(width * scale), Math.round(height * scale), { fit: 'fill' })
    .png({ compressionLevel: 9 })
    .toBuffer()
}