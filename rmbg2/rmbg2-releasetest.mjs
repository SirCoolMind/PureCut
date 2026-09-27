/**
 * One-off: verify that `release=1` closes the model after its images are finished,
 * and that the next run therefore loads a fresh session. The GUI uses this safe
 * behavior by default; `release=0` remains available for controlled warm-session
 * tests.
 *
 * This is the "Run All Model" contract: load a model -> run every image -> CLOSE it
 * -> move on. Without the release, cycling checkpoints keeps every model's native
 * memory alive and the machine starts swapping.
 */
import { readFile } from 'node:fs/promises'

const BASE = 'http://localhost:5173/rmbg2'

/** Reads an SSE response to its terminal result message. */
async function runOnce(tag, { release }) {
  const params = new URLSearchParams({
    runId: `rel-${Date.now()}-${tag}`,
    checkpoint: 'onnx/model_q4f16.onnx',
    inputs: 'probe.jpg',
    release: release ? '1' : '0'
  })

  const res = await fetch(`${BASE}/run?${params}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const logs = []

  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    let index
    while ((index = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)
      const line = block.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      const message = JSON.parse(line.slice(6))
      if (message.type === 'log') logs.push(message.text)
      if (message.type === 'result' || message.type === 'error') {
        reader.cancel().catch(() => {})
        return { logs, done: true, error: message.type === 'error' ? message.message : null }
      }
    }
  }
  return { logs, done: false }
}

const photo = await readFile('tests/fixtures/giselle-original.jpg')
await fetch(`${BASE}/upload?name=probe.jpg`, {
  method: 'POST',
  body: photo,
  headers: { 'Content-Type': 'application/octet-stream' }
})

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures++
}

console.log('run 1 — release=0 (a plain Run should keep the session warm)')
const first = await runOnce('a', { release: false })
check('run 1 completed', first.done && !first.error)
check('run 1 loaded a session', first.logs.some((l) => l.includes('session: ready')))
check('run 1 did NOT close the model', !first.logs.some((l) => l.includes('memory released')))

console.log('\nrun 2 — release=0 again (session must be REUSED, not reloaded)')
const second = await runOnce('b', { release: false })
check('run 2 completed', second.done && !second.error)
check(
  'run 2 reused the warm session',
  !second.logs.some((l) => l.includes('session: creating')),
  second.logs.find((l) => l.includes('session:')) || ''
)

console.log('\nrun 3 — release=1 (Run All Model closes the model afterwards)')
const third = await runOnce('c', { release: true })
check('run 3 completed', third.done && !third.error)
check(
  'run 3 CLOSED the model and released memory',
  third.logs.some((l) => /closed.*memory released/.test(l)),
  third.logs.find((l) => /released|closed/.test(l)) || ''
)

console.log('\nrun 4 — release=1 again (must load a FRESH session, proving it was closed)')
const fourth = await runOnce('d', { release: true })
check('run 4 completed', fourth.done && !fourth.error)
check(
  'run 4 had to create a new session',
  fourth.logs.some((l) => l.includes('session: creating')),
  fourth.logs.find((l) => l.includes('session:')) || ''
)

await fetch(`${BASE}/delete?name=probe.jpg`)

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'model release behaves correctly'}`)
process.exit(failures ? 1 : 0)