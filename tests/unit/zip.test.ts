import { describe, it, expect } from 'vitest'
import { crc32, createZip, uniqueNames } from '../../src/core/zip.js'

/**
 * Unit tests for the batch-export ZIP writer. The archive is parsed back by hand
 * from its own headers, so a wrong offset or size fails here rather than as a
 * "corrupt archive" in the user's unzip tool.
 */

const bytes = (s: string) => new TextEncoder().encode(s)

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926)
  })

  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('uniqueNames', () => {
  it('suffixes duplicates before the extension, case-insensitively', () => {
    expect(uniqueNames(['a.png', 'b.png', 'A.png', 'a.png'])).toEqual(['a.png', 'b.png', 'A (2).png', 'a (3).png'])
  })

  it('handles names without an extension', () => {
    expect(uniqueNames(['x', 'x'])).toEqual(['x', 'x (2)'])
  })
})

describe('createZip', () => {
  const entries = [
    { name: 'one.png', data: bytes('first file') },
    { name: 'dir/twö.png', data: bytes('second') }
  ]
  const zip = createZip(entries, new Date(2026, 9, 13, 12, 30, 10))
  const view = new DataView(zip.buffer)

  it('ends with an end-of-central-directory record that counts every entry', () => {
    const eocd = zip.length - 22
    expect(view.getUint32(eocd, true)).toBe(0x06054b50)
    expect(view.getUint16(eocd + 10, true)).toBe(2)
  })

  it('stores each entry verbatim behind a local header the central directory points at', () => {
    const eocd = zip.length - 22
    let central = view.getUint32(eocd + 16, true)
    const decoder = new TextDecoder()

    entries.forEach((entry) => {
      expect(view.getUint32(central, true)).toBe(0x02014b50)
      const nameLen = view.getUint16(central + 28, true)
      expect(decoder.decode(zip.subarray(central + 46, central + 46 + nameLen))).toBe(entry.name)
      expect(view.getUint32(central + 16, true)).toBe(crc32(entry.data))

      const local = view.getUint32(central + 42, true)
      expect(view.getUint32(local, true)).toBe(0x04034b50)
      expect(view.getUint16(local + 8, true)).toBe(0) // STORE
      const size = view.getUint32(local + 18, true)
      const dataStart = local + 30 + view.getUint16(local + 26, true)
      expect(Array.from(zip.subarray(dataStart, dataStart + size))).toEqual(Array.from(entry.data))

      central += 46 + nameLen
    })
  })

  it('produces a valid empty archive', () => {
    const empty = createZip([])
    expect(empty.length).toBe(22)
    expect(new DataView(empty.buffer).getUint32(0, true)).toBe(0x06054b50)
  })
})
