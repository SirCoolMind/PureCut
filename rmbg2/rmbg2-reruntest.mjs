/**
 * One-off: proves the repeat-run bug is fixed, at the protocol level.
 *
 * It deliberately behaves like the OLD page: it does NOT close the stream, and it
 * re-requests the same runId after the server ends the response (which is exactly
 * what EventSource does on its own). Before the fix that started another full run
 * every time. After it, the second and third requests must REPLAY the first
 * result and never touch the runner again.
 */
const BASE = 'http://localhost:5173/rmbg2'
const runId = `test-${Date.now()}`

// The GUI runs what IT uploaded, so upload one first and use that name. Using a
// name from the CLI's inputs/ folder would (correctly) no longer resolve.
const photo = await (await import('node:fs/promises')).readFile('tests/fixtures/giselle-original.jpg')
const image = 'reruntest.jpg'
const uploaded = await fetch(`${BASE}/upload?name=${image}`, {
  method: 'POST',
  body: photo,
  headers: { 'Content-Type': 'application/octet-stream' }
})
if (!uploaded.ok) {
  console.error(`could not upload the test image: HTTP ${uploaded.status}`)
  process.exit(1)
}

/** One SSE request. Resolves with every message received before the stream ends. */
async function streamOnce(runIdValue) {
  const params = new URLSearchParams({ runId: runIdValue, checkpoint: 'onnx/model_q4f16.onnx', provider: 'cpu', inputs: image })
  const res = await fetch(`${BASE}/run?${params}`)
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const messages = []

  let done = false
  while (!done) {
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
      messages.push(message)
      if (message.type === 'result' || message.type === 'error') done = true
    }
  }
  // NOTE: no reader.cancel() and no close - mimicking the old client on purpose.
  return messages
}

let failures = 0
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures++
}

console.log(`image=${image}  runId=${runId}\n`)

console.log('request 1 (the real run)...')
const first = await streamOnce(runId)
const firstResult = first.find((m) => m.type === 'result')
check('request 1 produced a result', Boolean(firstResult))
check('request 1 was NOT a replay', firstResult && !firstResult.replayed,
  firstResult ? `replayed=${Boolean(firstResult.replayed)}` : '')

console.log('\nrequest 2 (simulating an EventSource reconnect)...')
const second = await streamOnce(runId)
const secondResult = second.find((m) => m.type === 'result')
check('request 2 returned a result', Boolean(secondResult))
check('request 2 was REPLAYED, not re-run', secondResult && secondResult.replayed === true,
  secondResult ? `replayed=${secondResult.replayed}` : '')
const secondRanAgain = second.some((m) => m.type === 'log' && /-- \[1\/1\]/.test(m.text))
check('request 2 did NOT start a new batch', !secondRanAgain)

console.log('\nrequest 3 (a third reconnect)...')
const third = await streamOnce(runId)
const thirdResult = third.find((m) => m.type === 'result')
check('request 3 also replayed', thirdResult && thirdResult.replayed === true)
check('request 3 did NOT start a new batch',
  !third.some((m) => m.type === 'log' && /-- \[1\/1\]/.test(m.text)))

console.log('\na different runId must still run for real...')
const other = await streamOnce(`${runId}-other`)
const otherResult = other.find((m) => m.type === 'result')
check('a new runId runs (not a replay)', otherResult && !otherResult.replayed)
check('the new run actually processed the image',
  other.some((m) => m.type === 'log' && /-- \[1\/1\]/.test(m.text)))

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'repeat-run bug is fixed'}`)
process.exit(failures ? 1 : 0)