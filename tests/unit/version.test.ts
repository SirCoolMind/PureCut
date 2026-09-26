import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveVersionInfo } from '../../scripts/version.mjs'

describe('resolveVersionInfo', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns valid version, hash and ISO build timestamp', () => {
    const info = resolveVersionInfo()
    expect(info).toBeDefined()
    expect(typeof info.version).toBe('string')
    expect(info.version.length).toBeGreaterThan(0)
    expect(typeof info.hash).toBe('string')
    expect(info.hash.length).toBeGreaterThan(0)
    expect(typeof info.buildTime).toBe('string')
    // Valid ISO date
    expect(new Date(info.buildTime).toISOString()).toBe(info.buildTime)
  })

  it('prefers GITHUB_SHA from CI/CD environment when present', () => {
    process.env.GITHUB_SHA = 'abcdef1234567890abcdef'
    const info = resolveVersionInfo()
    expect(info.hash).toBe('abcdef1')
  })

  it('prefers VITE_APP_BUILD_HASH if set explicitly', () => {
    delete process.env.GITHUB_SHA
    process.env.VITE_APP_BUILD_HASH = 'custom-hash-99'
    const info = resolveVersionInfo()
    expect(info.hash).toBe('custom-hash-99')
  })
})
