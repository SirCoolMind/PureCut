/**
 * rmbg2.mjs — PureCut local (Node) tester for Bria RMBG-2.0.
 *
 *   npm run rmbg2                 # every image in rmbg2-lab/inputs
 *   npm run rmbg2 -- photo.jpg    # one image, or a substring filter
 *   npm run rmbg2 -- --list       # show what would run, touch nothing
 *   npm run rmbg2:help
 *
 * WHY NODE AND NOT THE BROWSER. This is not a preference, it is a constraint.
 * `briaai/RMBG-2.0` fails at ORT *session creation* under `onnxruntime-web`
 * (`[ShapeInferenceError] Mismatch between number of inferred and declared
 * dimensions. inferred=4 declared=6`); the WASM build hardcodes strict shape
 * inference, so no flag or workaround helps. The identical bytes create a session
 * happily under `onnxruntime-node`. So the model can only be evaluated outside the
 * browser - which is the whole reason this lab sits beside the app instead of
 * inside it. Do not try to port this to `aiEngine.js`; see AGENTS.md, "Model
 * catalogue".
 *
 * This file is the CLI only. The pipeline is split so each piece has one job:
 *
 *   rmbg2.config.mjs    paths, checkpoints, preprocessing constants, token
 *   rmbg2-image.mjs     all `sharp` usage: inputs, preprocess, mask, previews
 *   rmbg2-session.mjs   the ONNX session + the batch loop
 *   rmbg2-report.mjs    the standalone HTML report
 *   rmbg2-serve.mjs     the `--serve` JSON protocol for the dev-only page
 *
 * (The split happened when this file crossed the repo's 800-line budget. The seam
 * is real, not cosmetic: nothing in `rmbg2-image.mjs` knows about ONNX, and
 * nothing in `rmbg2-serve.mjs` knows about sharp.)
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CHECKPOINTS, DEFAULT_PROVIDER, PROVIDERS, providerChain, resolveToken } from './rmbg2.config.mjs'
import { ensureExemplars, importSharp, listInputs } from './rmbg2-image.mjs'
import { Rmbg2Session, runBatch } from './rmbg2-session.mjs'
import { serve } from './rmbg2-serve.mjs'

/* ------------------------------------------------------------------ *
 * Arguments
 * ------------------------------------------------------------------ */

function parseArgs(argv) {
  const opts = {
    filters: [],
    model: CHECKPOINTS[0].model,
    file: CHECKPOINTS[0].file,
    token: '',
    provider: DEFAULT_PROVIDER,
    report: true,
    list: false,
    help: false,
    serve: false,
    preload: false,
    allCheckpoints: false,
    checkProviders: false,
    tta: false
  }

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') opts.help = true
    else if (arg === '--list') opts.list = true
    else if (arg === '--serve') opts.serve = true
    else if (arg === '--preload') opts.preload = true
    else if (arg === '--all') opts.allCheckpoints = true
    else if (arg === '--tta') opts.tta = true
    else if (arg === '--check-providers') opts.checkProviders = true
    else if (arg === '--no-report') opts.report = false
    else if (arg.startsWith('--token=')) opts.token = arg.slice(8)
    else if (arg.startsWith('--model=')) opts.model = arg.slice(8)
    else if (arg.startsWith('--checkpoint=')) opts.file = arg.slice(13)
    else if (arg.startsWith('--provider=')) opts.provider = arg.slice(11)
    else if (arg.startsWith('-')) throw new Error(`Unknown flag: ${arg}`)
    else opts.filters.push(arg)
  }

  return opts
}

const HELP = `
PureCut x RMBG-2.0 local lab (native CPU, not the browser)

  npm run rmbg2                       process every image in rmbg2-lab/inputs
  npm run rmbg2 -- photo.jpg          process one image (substring filter)
  npm run rmbg2 -- a.jpg b.png        several
  npm run rmbg2 -- --list             list inputs, download nothing

Flags
  --model=<hf id>        default ${CHECKPOINTS[0].model}
  --checkpoint=<path>    default ${CHECKPOINTS[0].file}
  --token=<hf_token>     otherwise $env:HF_TOKEN, then .env
  --provider=cpu|dml     default ${DEFAULT_PROVIDER}; dml is the GPU path on Windows
  --preload              download the checkpoint and stop - no inference
  --all                  with --preload: fetch every checkpoint
  --tta                  two-pass flip fusion (TTA) to refine tricky fingers and edges
  --check-providers      print which providers this install can actually use
  --no-report            skip report.html
  --serve                JSON protocol for the dev-only page (see npm run dev)

Output
  rmbg2-lab/outputs/<name>-cutout.png     transparent cutout
  rmbg2-lab/outputs/<name>-mask.png       raw alpha mask
  rmbg2-lab/outputs/report.html           side-by-side visual report

The token is required because briaai/RMBG-2.0 is a gated repo. Accept the
licence at https://huggingface.co/briaai/RMBG-2.0 first, then put the token in
.env (gitignored):  HF_TOKEN=hf_...
`.trim()

/* ------------------------------------------------------------------ *
 * Provider capability report
 * ------------------------------------------------------------------ */

/**
 * Answers "can I use the GPU?" with the runtime's own answer rather than advice.
 *
 * Worth having as a command because the common online guidance is to set
 * `CUDAExecutionProvider`, which `onnxruntime-node` cannot honour - it bundles no
 * CUDA provider at all. Printing what the install actually supports ends that
 * dead end immediately.
 */
async function checkProviders() {
  const ort = await importOrt()
  const supported = ort.listSupportedBackends ? ort.listSupportedBackends() : []
  const names = supported.map((b) => b.name)

  process.stdout.write('Providers reported by this onnxruntime-node install:\n')
  for (const backend of supported) {
    process.stdout.write(`  ${backend.name.padEnd(10)} bundled=${backend.bundled}\n`)
  }

  process.stdout.write('\nLab options:\n')
  for (const provider of PROVIDERS) {
    const usable = names.includes(provider.id)
    const state = !provider.available
      ? `unavailable on ${process.platform}`
      : usable
        ? 'ready'
        : 'NOT supported by this build'
    process.stdout.write(`  --provider=${provider.id.padEnd(5)} ${state}\n`)
  }

  if (!names.includes('cuda')) {
    process.stdout.write(
      '\nNote: CUDA is NOT available here, and that is expected.\n' +
        'onnxruntime-node bundles only cpu, dml and webgpu. `--provider=cuda` will\n' +
        'fail, and no setting changes that - it needs a CUDA-capable build\n' +
        '(e.g. onnxruntime-node-gpu) plus matching CUDA/cuDNN libraries.\n'
    )
  }
  if (names.includes('dml')) {
    process.stdout.write(
      '\nDirectML is available: `--provider=dml` uses the GPU on Windows.\n' +
        'Treat it as opt-in - it changes timings and can change mask values slightly.\n'
    )
  }
}

/* ------------------------------------------------------------------ *
 * Preload
 * ------------------------------------------------------------------ */

async function preloadWeights(opts) {
  const log = (text) => process.stdout.write(`${text}\n`)
  const targets = opts.allCheckpoints
    ? CHECKPOINTS.map((c) => ({ model: c.model, file: c.file, label: c.label }))
    : [{ model: opts.model, file: opts.file, label: opts.file }]

  log(`token: ${opts.token ? 'found' : 'MISSING - the download will 401'}`)

  let failed = 0
  for (const target of targets) {
    log(`\n${target.label}`)
    const session = new Rmbg2Session({ ...opts, model: target.model, file: target.file, onLog: log })
    try {
      await session.preload()
    } catch (error) {
      failed++
      log(`  FAILED: ${error.message}`)
    }
  }

  log('')
  log(failed ? `${failed} checkpoint(s) failed.` : 'All weights cached - runs will not re-download.')
  process.exitCode = failed ? 1 : 0
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

async function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.help) {
    process.stdout.write(`${HELP}\n`)
    return
  }

  if (opts.checkProviders) {
    await checkProviders()
    return
  }

  // `--list` is deliberately handled before sharp is imported, so it stays a
  // zero-dependency way to check what is in the folder. It is also above the token
  // lookup on purpose: listing files touches no network, so it must not be able to
  // fail on a missing token.
  if (opts.list) {
    const inputs = await listInputs(opts.filters)
    process.stdout.write(`${inputs.length} input image(s) in rmbg2-lab/inputs\n`)
    for (const file of inputs) process.stdout.write(`  ${path.basename(file)}\n`)
    return
  }

  // Resolve the token ONCE, here, before any branch that can download.
  //
  // This used to happen only on the batch path. `--preload` and the GUI's
  // `--serve` child therefore built their session with an EMPTY token, which sent
  // `Authorization: Bearer ` to Hugging Face. An already-cached checkpoint still
  // worked (no request is made at all), so the fault only appeared the moment a
  // fresh checkpoint was requested - as a bare `HTTP 401` from inside the
  // downloader, which reads as "your token is wrong" even when it is perfectly
  // good. Resolving up front makes it impossible for a new download path to forget.
  //
  // `--help`, `--check-providers` and `--list` sit ABOVE this deliberately: none of
  // them touch the network, so none of them should fail on a missing token.
  const token = resolveToken(opts.token)
  const withToken = { ...opts, token }

  // Fetch weights and exit. Exists so the several-hundred-MB download can be paid
  // once, deliberately, instead of stalling the first inference - and so a slow
  // connection never looks like a hang.
  if (opts.preload) {
    await preloadWeights(withToken)
    return
  }

  if (opts.serve) {
    const sharp = await importSharp()
    await serve(new Rmbg2Session(withToken), sharp)
    return
  }

  const sharp = await importSharp()
  const inputs = await listInputs(opts.filters)

  if (!inputs.length) {
    // An empty folder is the first-run experience, so fill it instead of erroring.
    if (opts.filters.length) {
      throw new Error(`No image matched: ${opts.filters.join(', ')}\nLooked in: rmbg2-lab/inputs`)
    }
    const created = await ensureExemplars(sharp)
    process.stdout.write(`rmbg2-lab/inputs was empty; created ${created.length} synthetic sample(s).\n`)
    process.stdout.write('Drop your own images in there to test them.\n\n')
    inputs.push(...(await listInputs([])))
  }

  const log = (text) => process.stdout.write(`${text}\n`)
  log(`model: ${opts.model} -> ${opts.file}`)
  log(`provider: ${opts.provider}`)
  log(`inputs: ${inputs.length} image(s)`)

  const session = new Rmbg2Session({ ...withToken, onLog: log })
  const { results } = await runBatch({ session, sharp, inputs, onLog: log, writeReport: opts.report, tta: opts.tta })

  const failed = results.filter((r) => r.error).length
  log('')
  log(`done: ${results.length - failed} ok, ${failed} failed`)
  log('next: open rmbg2-lab/outputs/report.html')
}

// Only run the CLI when this file *is* the entry point. Without this guard,
// importing anything from here would kick off a second batch run against whatever
// argv the host process happened to have.
const isEntryPoint =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntryPoint) {
  main().catch((error) => {
    process.stderr.write(`\n[rmbg2] ${error.message}\n`)
    process.exit(1)
  })
}