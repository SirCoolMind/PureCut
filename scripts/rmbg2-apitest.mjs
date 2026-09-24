import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const BASE = 'http://localhost:5173/rmbg2'
let failures = 0

function check(label, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  ${detail}` : ''}`)
  if (!ok) failures++
}

async function upload(name, body) {
  const res = await fetch(`${BASE}/upload?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/octet-stream' }
  })
  let json = null
  try { json = await res.json() } catch { /* empty body */ }
  return { status: res.status, json }
}

// ---- 1. a REAL photo, the case that actually matters -------------------------
const photo = await readFile('tests/fixtures/giselle-original.jpg')
const real = await upload('giselle-original.jpg', photo)
check('upload real photo', real.status === 200 && real.json.name === 'giselle-original.jpg',
  `HTTP ${real.status}`)

// ---- 2. path traversal must not escape inputs/ -------------------------------
for (const evil of ['../evil.png', '..\\evil.png', '../../etc/passwd.png', 'sub/dir/x.png']) {
  const res = await upload(evil, photo)
  const landed = res.json?.name || ''
  const safe = res.status === 400 || (!landed.includes('..') && !landed.includes('/') && !landed.includes('\\'))
  check(`traversal rejected/sanitised: ${evil}`, safe, `-> ${res.status} ${landed || res.json?.error || ''}`)
}

// ---- 3. non-image extension must be refused ---------------------------------
const bad = await upload('payload.exe', Buffer.from('MZ'))
check('non-image refused', bad.status === 400, `HTTP ${bad.status} ${bad.json?.error || ''}`)

// ---- 4. empty body refused ---------------------------------------------------
const empty = await upload('empty.png', Buffer.alloc(0))
check('empty upload refused', empty.status === 400, `HTTP ${empty.status}`)

// ---- 5. the upload is really on disk with the right size ---------------------
const info = await stat(path.join('rmbg2-lab', 'inputs', 'giselle-original.jpg')
  .replace(/\\/g, path.sep))
check('file on disk matches byte count', info.size === photo.length, `${info.size} vs ${photo.length}`)

// ---- 6. nothing escaped the folder ------------------------------------------
try {
  await stat(path.join('rmbg2-lab', 'evil.png'))
  check('no traversal artefact written', false, 'evil.png exists in rmbg2-lab/')
} catch {
  check('no traversal artefact written', true)
}

// ---- 7. /input/ serves it, and refuses traversal -----------------------------
const served = await fetch(`${BASE}/input/giselle-original.jpg`)
check('/input serves uploaded image', served.status === 200 && served.headers.get('content-type') === 'image/jpeg',
  `HTTP ${served.status} ${served.headers.get('content-type')}`)

const out = await fetch(`${BASE}/input/%2e%2e%2fpackage.json`)
const outText = await out.text()
check('/input refuses traversal', out.status !== 200 || !outText.includes('"name"'),
  `HTTP ${out.status}`)

// ---- 8. list reflects everything --------------------------------------------
const list = await (await fetch(`${BASE}/list`)).json()
check('list includes the upload', list.inputs.includes('giselle-original.jpg'),
  `${list.inputs.length} inputs`)
check('list exposes 3 checkpoints (incl. fp16)', list.checkpoints.length === 3,
  list.checkpoints.map((c) => c.approxSize).join(' / '))

// ---- 9. delete works ---------------------------------------------------------
const dirty = await upload('delete-me.png', photo)
const del = await fetch(`${BASE}/delete?name=delete-me.png`)
const after = await (await fetch(`${BASE}/list`)).json()
check('delete removes the file',
  dirty.status === 200 && del.status === 200 && !after.inputs.includes('delete-me.png'))

console.log(`\n${failures ? `${failures} FAILURE(S)` : 'all API checks passed'}`)
process.exit(failures ? 1 : 0)