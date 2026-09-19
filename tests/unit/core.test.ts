import { describe, it, expect } from 'vitest'
import { formatBytes } from '../../src/core/format.js'
import { STORAGE_KEYS, cachedModelKey, FONT_SIZES, DEFAULT_FONT_SIZE } from '../../src/core/storageKeys.js'

/**
 * The rest of `src/core/` is pure by contract ("framework-free, side-effect-free,
 * unit-testable in isolation"), so these two modules are the cheapest proof that
 * the contract holds and the start of the safety net `core/maskOps.ts` will need.
 *
 * These pin the string formats that other files depend on:
 *   - `STORAGE_KEYS` values are mirrored in `index.html` and in `aiEngine.js`;
 *     renaming one without updating them is silent data loss for a user.
 *   - `formatBytes` output is rendered straight into the navbar cache pill.
 */

describe('formatBytes', () => {
  it('formats binary units with one decimal by default', () => {
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.5 MB')
  })

  it('keeps whole bytes exact', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1)).toBe('1 B')
  })

  it('treats zero and falsy input as "0 B"', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
  })

  it('honours the decimals argument', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB')
    expect(formatBytes(1536, 3)).toBe('1.5 KB')
  })
})

describe('STORAGE_KEYS', () => {
  it('keeps the literal key names other files duplicate', () => {
    // index.html reads this one before any module loads; aiEngine.js and
    // SettingsModal.vue read the others. Changing a value here without changing
    // them is a silent behaviour change, so the literals are pinned.
    expect(STORAGE_KEYS.hfToken).toBe('purecut_hf_token')
    expect(STORAGE_KEYS.fontSize).toBe('purecut_font_size')
    expect(STORAGE_KEYS.promptModelChange).toBe('purecut_prompt_model_change')
  })
})

describe('cachedModelKey', () => {
  it('prefixes the model id it was given', () => {
    expect(cachedModelKey('briaai/RMBG-1.4')).toBe('purecut_cached_briaai/RMBG-1.4')
  })

  it('produces a distinct key per model', () => {
    const ids = ['briaai/RMBG-1.4', 'Xenova/modnet', 'onnx-community/isnet']
    const keys = ids.map(cachedModelKey)
    expect(new Set(keys).size).toBe(ids.length)
  })
})

describe('font size constants', () => {
  it('lists exactly the four values the UI cycles through', () => {
    expect([...FONT_SIZES]).toEqual(['compact', 'normal', 'medium', 'large'])
  })

  it('defaults to a value that is in the list', () => {
    expect(FONT_SIZES).toContain(DEFAULT_FONT_SIZE)
  })
})
