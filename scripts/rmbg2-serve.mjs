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

import { listInputs } from './rmbg2-image.mjs'
import { runBatch } from './rmbg2-session.mjs'

export async function serve(session, sharp) {
  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)
  session.onLog = (text) => send({ type: 'log', text })

  let queue = Promise.resolve()
  let buffered = ''

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
    if (request.action !== 'run') {
      send({ type: 'error', message: `Unknown action: ${request.action}` })
      return
    }

    // Switching checkpoint drops the warm session rather than holding two
    // multi-GB models at once. The page says so, so the next run's delay reads as
    // expected rather than as a hang.
    if (request.checkpoint && request.checkpoint !== session.file) {
      session.file = request.checkpoint
      session.session = null
      send({ type: 'log', text: `session: unloaded, will reload with ${session.file}` })
    }

    // Same for the provider: a dml session and a cpu session are different
    // sessions, and reusing one for the other would misreport every timing.
    if (session.setProvider(request.provider)) {
      send({ type: 'log', text: `session: unloaded, will reload on ${session.provider}` })
    }

    const inputs = await listInputs(request.inputs || [])
    if (!inputs.length) {
      send({ type: 'error', message: 'No matching images in rmbg2-lab/inputs.' })
      return
    }

    const { results, reportPath } = await runBatch({ session, sharp, inputs, onLog: session.onLog })
    send({
      type: 'result',
      reportPath,
      provider: session.provider,
      results: results.map((r) => ({
        name: r.name,
        error: r.error || null,
        width: r.width,
        height: r.height,
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