/**
 * rmbg2-bench.mjs — measure execution providers against each other, on this machine.
 *
 *   npm run rmbg2:bench                 # cpu vs dml on the anchor image
 *   npm run rmbg2:bench -- cpu          # just one
 *   npm run rmbg2:bench -- cpu dml --checkpoint=onnx/model_fp16.onnx
 *
 * WHY THIS EXISTS. The usual advice for slow ONNX inference is "use the GPU
 * provider". For `onnxruntime-node` that advice is misleading twice over:
 *
 *   1. There is no CUDA provider in the package at all - `listSupportedBackends()`
 *      returns only cpu, dml and webgpu. `--provider=cuda` cannot work.
 *   2. On at least one machine (RTX 4050 Laptop, 6 GB, 2026-09-25) DirectML
 *      created its session FASTER (10.9 s vs 23.4 s) but ran this graph 4x
 *      SLOWER (85.9 s vs 19.6 s per image) and returned an EMPTY mask
 *      (mean alpha 0.0000 instead of the expected 0.2695).
 *
 * That second point is why the lab still defaults to CPU and why this script
 * checks the MASK VALUE and not just the clock. A faster wrong answer is worse
 * than a slower right one, and a benchmark that only times the run would have
 * reported the GPU as a win.
 *
 * The correctness anchor: `sample-01-circle.png` is a disc of radius 300 in a
 * 1024x1024 frame, so a correct mask must have mean alpha approximately
 * pi*300^2/1024^2 = 0.2696. Anything far from that is a failed run, not a fast one.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { ROOT, INPUT_SIZE, DEFAULT_PROVIDER, PROVIDERS, providerChain } from './rmbg2.config.mjs'
import { importSharp, preprocess } from './rmbg2-image.mjs'
import { importOrt } from './rmbg2-session.mjs'

/** Ground truth for the default anchor image. */
const EXPECTED_MEAN_ALPHA = (Math.PI * 300 * 300) / (INPUT_SIZE * INPUT_SIZE)

function parseArgs(argv) {
  const opts = { providers: [], checkpoint: 'onnx/model_q4f16.onnx', image: 'sample-01-circle.png', runs: 2 }
  for (const arg of argv) {
    if (arg.startsWith('--checkpoint=')) opts.checkpoint = arg.slice(13)
    else if (arg.startsWith('--image=')) opts.image = arg.slice(8)
    else if (arg.startsWith('--runs=')) opts.runs = Math.max(1, Number(arg.slice(7)))
    else if (arg.startsWith('-')) throw new Error(`Unknown flag: ${arg}`)
    else opts.providers.push(arg)
  }
  if (!opts.providers.length) opts.providers = [DEFAULT_PROVIDER, ...PROVIDERS.map((p) => p.id).filter((id) => id !== DEFAULT_PROVIDER)]
  return opts
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const ort = await importOrt()
  const sharp = await importSharp()

  const supported = (ort.listSupportedBackends?.() || []).map((b) => b.name)
  const checkpointPath = path.join(
    ROOT,
    'rmbg2-lab',
    '.cache',
    'briaai__RMBG-2.0',
    path.basename(opts.checkpoint)
  )

  process.stdout.write(`checkpoint : ${opts.checkpoint}\n`)
  process.stdout.write(`image      : ${opts.image}\n`)
  process.stdout.write(`backends   : ${supported.join(', ')}\n`)
  process.stdout.write(`expected   : mean alpha ~= ${EXPECTED_MEAN_ALPHA.toFixed(4)} on the anchor\n\n`)

  const pre = await preprocess(sharp, path.join(ROOT, 'rmbg2-lab', 'inputs', opts.image))
  const planes = INPUT_SIZE * INPUT_SIZE

  const rows = []
  for (const id of opts.providers) {
    const label = id.padEnd(5)
    if (!supported.includes(id)) {
      process.stdout.write(`${label} skipped - not supported by this build\n`)
      rows.push({ provider: id, note: 'unsupported' })
      continue
    }

    process.stdout.write(`${label} creating session… `)
    let session
    const loadStart = Date.now()
    try {
      session = await ort.InferenceSession.create(checkpointPath, {
        executionProviders: providerChain(id),
        graphOptimizationLevel: 'all',
        logSeverityLevel: 3
      })
    } catch (error) {
      process.stdout.write(`FAILED (${error.message.split('\n')[0]})\n`)
      rows.push({ provider: id, note: `session failed: ${error.message.split('\n')[0]}` })
      continue
    }
    const loadMs = Date.now() - loadStart
    process.stdout.write(`${(loadMs / 1000).toFixed(1)}s\n`)

    const feeds = {
      [session.inputNames[0]]: new ort.Tensor('float32', pre.tensor.data, pre.tensor.dims)
    }

    // Warm-up: first call absorbs allocation and (on a GPU) shader compilation.
    // Timing the first call would flatter CPU and unfairly punish the GPU.
    let warmError = null
    try {
      await session.run(feeds)
    } catch (error) {
      warmError = error.message.split('\n')[0]
    }

    if (warmError) {
      process.stdout.write(`${label}   inference FAILED: ${warmError}\n`)
      rows.push({ provider: id, loadMs, note: `inference failed: ${warmError}` })
      await session.release?.()
      continue
    }

    const times = []
    let meanAlpha = null
    for (let i = 0; i < opts.runs; i++) {
      const started = Date.now()
      const out = await session.run(feeds)
      times.push(Date.now() - started)

      // Sanity-check the OUTPUT, not just the clock - see the header.
      const raw = out[session.outputNames[0]].data
      let sum = 0
      for (let j = 0; j < planes; j++) sum += raw[j]
      meanAlpha = sum / planes
      process.stdout.write(
        `${label}   run ${i + 1}: ${(times[i] / 1000).toFixed(2)}s  meanAlpha=${meanAlpha.toFixed(4)}\n`
      )
    }

    const best = Math.min(...times)
    const verdict =
      meanAlpha === null
        ? 'no result'
        : Math.abs(meanAlpha - EXPECTED_MEAN_ALPHA) < 0.02
          ? 'correct'
          : meanAlpha < 0.01
            ? 'EMPTY MASK - do not trust'
            : 'MASK DIFFERS from reference'

    rows.push({ provider: id, loadMs, best, meanAlpha, verdict })
    await session.release?.()
    process.stdout.write('\n')
  }

  process.stdout.write('provider  session   inference   meanAlpha   verdict\n')
  process.stdout.write('-'.repeat(62) + '\n')
  for (const row of rows) {
    if (row.note) {
      process.stdout.write(`${row.provider.padEnd(9)} ${row.note}\n`)
      continue
    }
    process.stdout.write(
      `${row.provider.padEnd(9)} ` +
        `${(row.loadMs / 1000).toFixed(1).padStart(6)}s   ` +
        `${(row.best / 1000).toFixed(2).padStart(7)}s   ` +
        `${String(row.meanAlpha.toFixed(4)).padStart(9)}   ${row.verdict}\n`
    )
  }
  process.stdout.write(`\n(expected meanAlpha ~= ${EXPECTED_MEAN_ALPHA.toFixed(4)} on this image)\n`)
}

main().catch((error) => {
  process.stderr.write(`\n[rmbg2:bench] ${error.message}\n`)
  process.exit(1)
})