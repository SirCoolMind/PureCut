/**
 * Minimal ZIP writer for batch export: STORE (no compression) entries only.
 *
 * Every entry is an already-compressed PNG, so DEFLATE would buy almost nothing
 * and would pull in a dependency. The output follows APPNOTE 6.3: a local header
 * plus data per entry, then the central directory and the end-of-central-directory
 * record. Framework-free so vitest can check the bytes directly.
 */

export interface ZipEntry {
  /** Path inside the archive; forward slashes, UTF-8. */
  name: string
  data: Uint8Array
}

let crcTable: Uint32Array | null = null

/** CRC-32 (IEEE 802.3), as every ZIP header requires. */
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = crcTable[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** DOS time/date fields for `date`. */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  }
}

/**
 * Make archive names unique ("a.png", "a (2).png", ...) so two inputs with the
 * same base name cannot overwrite each other when extracted.
 */
export function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>()
  return names.map((name) => {
    let candidate = name
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    for (let i = 2; seen.has(candidate.toLowerCase()); i++) candidate = `${stem} (${i})${ext}`
    seen.add(candidate.toLowerCase())
    return candidate
  })
}

/** Build a STORE-only ZIP archive from `entries`. */
export function createZip(entries: ZipEntry[], modified: Date = new Date()): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder()
  const { time, date } = dosDateTime(modified)
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const size = entry.data.length

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true) // local file header signature
    lv.setUint16(4, 20, true) // version needed (2.0)
    lv.setUint16(6, 0x0800, true) // flags: UTF-8 names
    lv.setUint16(8, 0, true) // method: STORE
    lv.setUint16(10, time, true)
    lv.setUint16(12, date, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, size, true) // compressed size
    lv.setUint32(22, size, true) // uncompressed size
    lv.setUint16(26, name.length, true)
    lv.setUint16(28, 0, true) // extra field length
    local.set(name, 30)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true) // central directory signature
    cv.setUint16(4, 20, true) // version made by
    cv.setUint16(6, 20, true) // version needed
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, 0, true)
    cv.setUint16(12, time, true)
    cv.setUint16(14, date, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, size, true)
    cv.setUint32(24, size, true)
    cv.setUint16(28, name.length, true)
    // extra length, comment length, disk number, internal + external attrs stay 0
    cv.setUint32(42, offset, true) // offset of the local header
    central.set(name, 46)

    locals.push(local, entry.data)
    centrals.push(central)
    offset += local.length + size
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true) // end of central directory signature
  ev.setUint16(8, entries.length, true) // entries on this disk
  ev.setUint16(10, entries.length, true) // entries total
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true) // central directory offset

  const parts = [...locals, ...centrals, end]
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let pos = 0
  for (const part of parts) {
    out.set(part, pos)
    pos += part.length
  }
  return out
}
