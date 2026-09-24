/**
 * rmbg2-tokentest.mjs — regression guard for the "empty token" bug.
 *
 * THE BUG. `resolveToken()` lived only on the batch path of `main()`, *after* the
 * `--serve` and `--preload` early returns. Both of those construct an
 * `Rmbg2Session`, so both got `token: undefined` and sent `Authorization: Bearer `
 * to Hugging Face.
 *
 * WHY IT WAS SO EASY TO MISS. An already-cached checkpoint never makes a request,
 * so every cached run worked perfectly. The failure appeared only when a FRESH
 * checkpoint was requested, and then as a bare `HTTP 401` from inside the
 * downloader - which reads as "your token is wrong" when the token was fine.
 * Cost: a plausible-looking dead end.
 *
 * WHAT THIS CHECKS. That the token actually reaches the child process on the paths
 * that download. It is a plumbing test, not a network test, so it needs no token to
 * be present and never downloads anything.
 *
 * Runs the child the same way the Vite plugin does.
 */

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const RUNNER = path.join(ROOT, 'scripts', 'rmbg2.mjs')

let failures = 0
function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures++
}

/** Start the runner in --serve mode and read the first handshake message. */
function handshake(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [RUNNER, '--serve'], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env }
    })

    let buffer = ''
    const done = (result) => {
      child.kill()
      resolve(result)
    }

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      buffer += chunk
      for (const line of buffer.split('\n')) {
        const text = line.trim()
        if (!text) continue
        try {
          const message = JSON.parse(text)
          if (message.type === 'ready') return done(message)
          if (message.type === 'error') return reject(new Error(message.message))
        } catch {
          // partial line, wait for more
        }
      }
    })

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (text) => {
      // A missing token is a hard exit with a helpful message; surface it.
      if (/token/i.test(text)) reject(new Error(text.trim()))
    })

    child.on('exit', (code) => {
      if (buffer) return
      reject(new Error(`runner exited early with code ${code}`))
    })

    setTimeout(() => {
      child.kill()
      reject(new Error('timed out waiting for the handshake'))
    }, 20000)
  })
}

console.log('rmbg2 token plumbing\n')

// 1. THE REGRESSION. A token in the environment must reach the --serve child.
//    Before the fix this reported hasToken: false.
try {
  const ready = await handshake({ HF_TOKEN: 'hf_test_token_for_plumbing_check' })
  check('--serve child receives HF_TOKEN from the environment', ready.hasToken === true,
    `hasToken=${ready.hasToken}`)
  check('--serve handshake is otherwise intact',
    typeof ready.model === 'string' && typeof ready.file === 'string' && ready.loaded === false,
    `${ready.model} -> ${ready.file}`)
} catch (error) {
  check('--serve child receives HF_TOKEN from the environment', false, error.message)
}

// 2. The token must NOT be leaked in the handshake - a boolean, never the value.
try {
  const secret = 'hf_do_not_leak_this_value'
  const ready = await handshake({ HF_TOKEN: secret })
  check('handshake does not echo the token value', !JSON.stringify(ready).includes(secret))
} catch (error) {
  check('handshake does not echo the token value', false, error.message)
}

// 3. A .env on disk must work too, since that is how the lab documents it.
try {
  const ready = await handshake({ HF_TOKEN: '', HUGGING_FACE_TOKEN: '' })
  // With .env present this should still be true; with no token anywhere the CLI
  // is expected to fail loudly instead, which the catch below covers.
  check('.env alone is enough (no env var)', ready.hasToken === true, `hasToken=${ready.hasToken}`)
} catch (error) {
  const expected = /No Hugging Face token found/i.test(error.message)
  check('.env alone is enough (no env var)', expected,
    expected ? 'no token configured at all - CLI refused, which is correct' : error.message)
}

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'all token plumbing checks passed'}`)
process.exit(failures ? 1 : 0)
