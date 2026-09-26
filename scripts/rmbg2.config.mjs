/**
 * rmbg2.config.mjs — the CPU-only oath.
 *
 * PureCut is 100% client-side, no server, no deps. The RMBG-2.0 lab below is the
 * deliberate exception: a local Node-side CPU tester for a checkpoint the browser
 * physically cannot load.
 *
 * `briaai/RMBG-2.0` fails at ORT *session creation* in `onnxruntime-web`
 * (`[ShapeInferenceError] Mismatch between number of inferred and declared
 * dimensions. inferred=4 declared=6`), and the WASM build hardcodes strict shape
 * inference, so no browser runtime can be talked out of it. The same bytes load
 * fine under `onnxruntime-node`. That is why the lab exists outside the app, and
 * why it is a lab folder (Next 3) rather than part of the studio (Next 1).
 *
 * Everything here is CPU. "a CPU-only oath" is the rule this file enforces:
 * no GPU / WebGPU backend, and no device selection anywhere in the lab.
 *
 * Shared by:
 *   - scripts/rmbg2.mjs          (the Node CLI)
 *   - scripts/rmbg2-vite-plugin.mjs (the dev-only `/rmbg2` route + API and page)
 *
 * Plain `.mjs`, no dependencies, importable from a plain Node script.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root (this file lives in `scripts/`). */
export const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Where input images live and where cutouts + the report are written. */
export const INPUT_DIR = path.join(ROOT, 'rmbg2-lab', 'inputs')
export const OUTPUT_DIR = path.join(ROOT, 'rmbg2-lab', 'outputs')

/**
 * Scratch folder for images uploaded through the GUI.
 *
 * Kept separate from INPUT_DIR on purpose. `inputs/` is the CLI's working folder -
 * a user may have a batch staged there - so the GUI must not list or clear it. The
 * page uploads here, passes ABSOLUTE paths to the runner, and empties this folder
 * when it loads, so a run only ever covers what was uploaded in that session and
 * nothing is accumulated between visits.
 */
export const UPLOAD_DIR = path.join(ROOT, 'rmbg2-lab', 'uploads')

/** The dev-only route. Registered by the plugin, absent from a production build. */
export const PAGE_PATH = 'rmbg2.html'
export const PAGE_URI = '/rmbg2'

/**
 * Checkpoints, cheapest-qualifying first.
 *
 * All three are the same network. `model_q4f16.onnx` is a 4-bit quantisation of
 * the official `model.onnx`; it is the only one worth downloading over a home
 * connection, and it is enough to judge whether the model is worth using.
 *
 * Sizes were read from the live repo (Content-Range on a ranged GET), not guessed.
 *
 * They live in the app's `modelOptions` catalog for the studio, not here - this
 * is just the lab's shortlist.
 */
export const CHECKPOINTS = [
  {
    label: 'RMBG-2.0 q4f16 (default)',
    model: 'briaai/RMBG-2.0',
    file: 'onnx/model_q4f16.onnx',
    approxSize: '223 MB',
    note: '4-bit quantised checkpoint. Smallest option that still is RMBG-2.0.',
    estimatedPeakRamMb: 9000,
    minimumFreeRamMb: 12000
  },
  {
    label: 'RMBG-2.0 fp16',
    model: 'briaai/RMBG-2.0',
    file: 'onnx/model_fp16.onnx',
    approxSize: '490 MB',
    note: 'Half precision. Bigger download, marginally cleaner edges.',
    estimatedPeakRamMb: 14000,
    minimumFreeRamMb: 20000
  },
  {
    label: 'RMBG-2.0 fp32 (reference)',
    model: 'briaai/RMBG-2.0',
    file: 'onnx/model.onnx',
    approxSize: '977 MB',
    note: 'The uncompressed export. Slowest and largest; use to sanity-check a quantisation.',
    estimatedPeakRamMb: 16000,
    minimumFreeRamMb: 24000
  }
]

/**
 * Preprocessing, verified against the model's own reference implementation
 * (`spaces/briaai/BRIA-RMBG-2.0/app.py`):
 *
 *   transforms.Resize((1024, 1024))
 *   transforms.ToTensor()                       -> /255, CHW
 *   transforms.Normalize([0.485,0.456,0.406], [0.229,0.224,0.225])
 *
 * The 1024x1024 resize is NOT optional and NOT the same knob as the app's
 * `maxDimension` downscale ladder. RMBG-2.0's processor always resizes the
 * network input to 1024x1024 regardless of the source image - which is exactly
 * why `BiRefNet-ONNX` / `BiRefNet_lite-ONNX` died with `std::bad_alloc` in the
 * browser (1024^2 activations exceed the 32-bit WASM heap). On native Node the
 * same 1024x1024 input is routine; the heap is not the constraint here.
 *
 * The mask is later resized back to the SOURCE image size, matching the reference.
 */
export const INPUT_SIZE = 1024

/**
 * Upper bound for decoded source images used to create full-resolution cutouts.
 *
 * RMBG-2.0 itself always sees a 1024px image, but the final PNG is composed at
 * the original dimensions. A highly compressed photo can therefore be small on
 * disk while requiring hundreds of MB of raw RGBA memory. Keep the lab from
 * exhausting the machine by rejecting such images before their full-size pixels
 * are decoded. 32 MP is ample for high-resolution photos and keeps the
 * composition buffers within a predictable range.
 */
export const MAX_SOURCE_PIXELS = 32 * 1024 * 1024

export const NORMALIZE = {
  mean: [0.485, 0.456, 0.406],
  std: [0.229, 0.224, 0.225]
}

/**
 * Read a `KEY=value` `/.env` without a dependency.
 *
 * The studio reads its token from `localStorage` (unreachable from Node), so the
 * lab reads it from the file instead. Real environment variables always win, so
 * `$env:HF_TOKEN = 'hf_...'` or a CI secret works without touching the file.
 */
export function loadDotEnv() {
  const values = {}
  try {
    const text = readFileSync(path.join(ROOT, '.env'), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (!match) continue
      values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '')
    }
  } catch {
    // No .env file: fine, the environment may carry the token instead.
  }
  return values
}

/* ------------------------------------------------------------------ *
 * Execution providers
 * ------------------------------------------------------------------ */

/**
 * What the installed `onnxruntime-node` can ACTUALLY run - measured, not assumed.
 *
 * `ort.listSupportedBackends()` on the default npm package returns:
 *
 *     cpu (bundled), dml (bundled), webgpu (bundled)      <- and NOT cuda
 *
 * So the widely-repeated advice to "just set the CUDAExecutionProvider" is wrong
 * for this package. `onnxruntime-node` has NO CUDA provider: `node_modules/
 * onnxruntime-node/bin/**` ships `DirectML.dll` on Windows and no
 * `onnxruntime_providers_cuda.dll`. Asking for `cuda` throws
 * `no available backend found` at session creation. Getting CUDA needs a
 * different package (`onnxruntime-node-gpu`) or a custom build.
 *
 * On Windows, `dml` (DirectML) is the realistic GPU path and it is already here.
 * On Linux/macOS there is no dml either, so CPU is the only honest option.
 *
 * The lab stays CPU-first on purpose: this is a correctness reviewer, and a mask
 * is only comparable across runs if the provider is held constant. GPU is an
 * opt-in speed-up, and the numbers must be re-checked when it is on.
 */
export const PROVIDERS = [
  {
    id: 'cpu',
    label: 'CPU (default · matches the verified numbers)',
    available: true,
    note: 'The provider every figure in this repo was measured with.'
  },
  {
    id: 'dml',
    label: 'DirectML · GPU (Windows only · measure first)',
    available: process.platform === 'win32',
    note:
      'Bundled with onnxruntime-node. On the machine this lab was built on it was SLOWER and ' +
      'returned an empty mask - run `npm run rmbg2:bench` before trusting it.'
  }
]

/** The provider to use when nothing is requested: CPU, so numbers stay comparable. */
export const DEFAULT_PROVIDER = 'cpu'

/**
 * Turn a provider id into an `executionProviders` argument, with a CPU fallback
 * appended so an unsupported GPU never turns a working run into a hard failure.
 */
export function providerChain(id) {
  const wanted = String(id || DEFAULT_PROVIDER).toLowerCase()
  if (wanted === 'cpu') return ['cpu']
  if (wanted === 'dml' || wanted === 'directml') {
    // `cpu` last means a node DirectML cannot handle still runs instead of throwing.
    return [{ name: 'dml', deviceId: 0 }, 'cpu']
  }
  if (wanted === 'cuda') {
    throw new Error(
      'CUDA is not available in onnxruntime-node.\n' +
        'That package has no CUDA provider (only cpu, dml and webgpu are bundled),\n' +
        'so asking for it fails at session creation with "no available backend found".\n' +
        'Use --provider=dml on Windows, or install a CUDA-capable build.'
    )
  }
  throw new Error(`Unknown provider: ${id}. Use one of: cpu, dml.`)
}

/**
 * Resolve the Hugging Face token.
 *
 * `briaai/RMBG-2.0` is `gated: "auto"`, so weights cannot be fetched anonymously
 * - the model page returns 401 and the model card asks you to accept the
 * non-commercial licence first. This throws a message that says exactly that,
 * rather than letting an opaque 401 surface from deep inside the downloader.
 */
export function resolveToken(explicit) {
  if (explicit) return explicit.trim()

  const fromEnv = process.env.HF_TOKEN || process.env.HUGGING_FACE_TOKEN
  if (fromEnv) return fromEnv.trim()

  const fromFile = loadDotEnv().HF_TOKEN
  if (fromFile) return fromFile.trim()

  throw new Error(
    [
      'No Hugging Face token found, and briaai/RMBG-2.0 is gated.',
      '',
      '  1. Open https://huggingface.co/briaai/RMBG-2.0 and accept the licence',
      '     (non-commercial use - personal / academy / non-profit).',
      '  2. Create a READ token: https://huggingface.co/settings/tokens',
      '  3. Put it in .env at the repo root (gitignored):',
      '         HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxx',
      '     or pass --token=hf_... , or set $env:HF_TOKEN.',
      '',
      'The token is only sent to huggingface.co and never leaves this machine.'
    ].join('\n')
  )
}