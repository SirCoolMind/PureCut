/**
 * rmbg2-serve.mjs — the `--serve` protocol for the RMBG-2.0 lab.
 *
 * Newline-delimited JSON over stdin/stdout, driven by the dev-only page's Vite
 * plugin (`rmbg2-vite-plugin.mjs`), which spawns this file as a child process.
 *
 * stdout is a PROTOCOL CHANNEL. Every log line must go out as a JSON message -
 * a stray `console.log` corrupts the stream and the page silently stops updating.
 *
 * Split out of `rmbg2.mjs` when that file crossed the repo's 800-line budget.
 */

import { CHECKPOINTS } from './rmbg2.config.mjs'
import { listInputs } from './rmbg2-image.mjs'
import { Rmbg2Session, runBatch } from './rmbg2-session.mjs'

export async function serve(session, sharp) {
  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
  session.onLog = (text) => send({ type: 'log', text })

  let queue = Promise.resolve()
  let buffered = ''
  let accumulatedReportResults = []

  let lastCpu = process.cpuUsage()
  let lastCpuTime = Date.now()
  const statsTimer = setInterval(() => {
    const now = Date.now()
    const dtMicros = (now - lastCpuTime) * 1000
    const cpuDiff = process.cpuUsage(lastCpu)
    lastCpu = process.cpuUsage()
    lastCpuTime = now
    const cpuPercent = dtMicros > 0 ? Math.round(((cpuDiff.user + cpuDiff.system) / dtMicros) * 100) : 0
    const mem = process.memoryUsage()

    send({
      type: 'stats',
      rss: mem.rss,
      cpuPercent,
      model: session.file,
      warm: Boolean(session.session)
    })
  }, 1000)
  statsTimer.unref()

  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    buffered += chunk
    let index
    while ((index = buffered.indexOf('\n')) !== -1) {
      const line = buffered.slice(0, index).trim()
      buffered = buffered.slice(index + 1)
      if (!line) continue

      // Serialise: one heavy CPU run at a time.
      queue = queue.then(() => handle(JSON.parse(line))).catch((error) => {
        send({ type: 'error', message: error.message })
      })
    }
  })

  async function handle(request) {
    if (request.action === 'ping') {
      send({
        type: 'ready',
        model: session.model,
        file: session.file,
        provider: session.provider,
        loaded: Boolean(session.session),
        // Boolean only - never the token itself. It exists so a test can prove the
        // token actually reached this child process: it is constructed by the CLI's
        // main(), so a branch that returns before `resolveToken()` runs would
        // silently hand the session an empty token and 401 on any fresh download.
        hasToken: Boolean(session.token)
      })
      return
    }
    if (request.action === 'preload') {
      // Fetch the weights only - no inference. Kept here (rather than spawning the
      // CLI again) so the download shares this process's cache checks and reports
      // progress over the same stream.
      const targets = request.all
        ? CHECKPOINTS.map((c) => ({ model: c.model, file: c.file, label: c.label }))
        : [{ model: session.model, file: request.checkpoint || session.file, label: request.checkpoint || session.file }]

      const results = []
      for (const target of targets) {
        const targetSession = new Rmbg2Session({
          token: session.token,
          provider: session.provider,
          model: target.model,
          file: target.file,
          onLog: session.onLog
        })
        try {
          const status = await targetSession.preload()
          results.push({ file: target.file, label: target.label, ok: true, cached: status.cached, bytes: status.bytes })
        } catch (error) {
          results.push({ file: target.file, label: target.label, ok: false, error: error.message })
        }
      }
      send({ type: 'preloaded', results })
      return
    }

    if (request.action === 'release') {
      const released = session.release()
      send({ type: 'released', released })
      return
    }

    if (request.action !== 'run') {
      send({ type: 'error', message: `Unknown action: ${request.action}` })
      return
    }

    // Switching checkpoint drops the warm session rather than holding two
    // multi-GB models at once. `release()` (not just nulling) hands the native
    // allocation back, which is what keeps a Run All Model cycle from accumulating
    // every model's memory.
    if (request.checkpoint && request.checkpoint !== session.file) {
      session.file = request.checkpoint
      session.release()
      send({ type: 'log', text: `session: released, will load ${session.file}` })
    }

    // Same for the provider: a dml session and a cpu session are different
    // sessions, and reusing one for the other would misreport every timing.
    if (session.setProvider(request.provider)) {
      send({ type: 'log', text: `session: unloaded, will reload on ${session.provider}` })
    }

    // An empty list must be refused, NOT passed on: `listInputs([])` means
    // "everything in the CLI's inputs folder", and the GUI has no business running
    // a batch the user staged for the terminal.
    if (!request.inputs || !request.inputs.length) {
      send({ type: 'error', message: 'No images were selected for this run.' })
      return
    }

    const inputs = await listInputs(request.inputs)
    if (!inputs.length) {
      send({ type: 'error', message: 'None of the selected files could be read.' })
      return
    }

    if (request.clearReport || !request.appendReport) {
      accumulatedReportResults = []
    }

    const { results, reportPath } = await runBatch({
      session,
      sharp,
      inputs,
      onLog: session.onLog,
      tta: Boolean(request.tta),
      existingResults: accumulatedReportResults
    })

    accumulatedReportResults.push(...results)

    // `Run All Model` asks for this: every image for this checkpoint is done, so the
    // model can be closed before the next one loads. Releasing here (rather than at
    // the next load) means only ONE model is ever resident, and the machine gets its
    // memory back between models instead of at the end of the whole cycle.
    //
    // This MUST happen before the result is sent. The plugin ends the SSE response as
    // soon as it sees the result, so anything emitted afterwards is written to a
    // closed stream and lost (and writing after `end()` is not safe).
    //
    // The GUI releases after every run by default, because the native session can
    // occupy many GB even while idle. Other clients may opt into a warm session by
    // omitting `release` when they have sufficient RAM and need repeat-run speed.
    if (request.release) {
      const closed = session.release()
      send({
        type: 'log',
        text: closed
          ? `session: ${request.checkpoint || session.file} closed - memory released`
          : 'session: nothing to close'
      })
    }

    send({
      type: 'result',
      reportPath,
      provider: session.provider,
      results: results.map((r) => ({
        name: r.name,
        error: r.error || null,
        checkpoint: r.checkpoint || null,
        width: r.width,
        height: r.height,
        tta: Boolean(r.tta),
        timings: r.timings || null,
        mask: r.mask || null,
        files: r.files || null,
        previews: r.previews || null
      }))
    })
  }

  send({
    type: 'ready',
    model: session.model,
    file: session.file,
    provider: session.provider,
    loaded: false,
    hasToken: Boolean(session.token)
  })
  process.stdin.resume()
}