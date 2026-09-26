/**
 * scripts/version.mjs
 *
 * Resolves CI/CD and local build versioning metadata (version, git commit hash,
 * and build timestamp) for PureCut.
 *
 * Used by vite.config.js to define build-time constants and emit `version.json`
 * for live client-side update prompts.
 */

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

export function resolveVersionInfo() {
  let version = '1.4.0'
  try {
    const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'))
    if (pkg.version) version = pkg.version
  } catch (_) {}

  let hash = ''
  if (process.env.GITHUB_SHA) {
    hash = process.env.GITHUB_SHA.slice(0, 7)
  } else if (process.env.VITE_APP_BUILD_HASH) {
    hash = process.env.VITE_APP_BUILD_HASH
  } else {
    try {
      hash = execSync('git rev-parse --short HEAD', {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim()
    } catch (_) {
      hash = Date.now().toString(36)
    }
  }

  const buildTime = new Date().toISOString()
  return { version, hash, buildTime }
}

export function writePublicVersionFile() {
  const info = resolveVersionInfo()
  const publicDir = path.join(rootDir, 'public')
  mkdirSync(publicDir, { recursive: true })
  const targetPath = path.join(publicDir, 'version.json')
  writeFileSync(targetPath, JSON.stringify(info, null, 2) + '\n', 'utf8')
  return { targetPath, info }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { targetPath, info } = writePublicVersionFile()
  console.log(`[PureCut Version] Written to ${targetPath}:`)
  console.log(JSON.stringify(info, null, 2))
}
