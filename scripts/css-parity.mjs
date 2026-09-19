/**
 * Normalise the CSS emitted by `npm run build` into a sorted set of
 * "selector | declaration" pairs so two builds can be compared for lost styling.
 *
 * This is the ONLY guard against lost styling during the AI-context refactor.
 * Every component extraction moves rules between stylesheets; the regression
 * harness clicks through the app and cannot see a rule that silently vanished.
 * Session 3 caught exactly one real mistake this way: a missing
 * `import Navbar` left the tag unresolved, `npm run build` still exited 0,
 * and 235 declarations disappeared from the bundle.
 *
 * Normalisation exists because the refactor legitimately changes two things
 * that are pure noise here:
 *   - Vue scoped CSS adds `[data-v-<hash>]` to every selector and renames
 *     `@keyframes` per component scope. Both hashes change whenever a file's
 *     content changes.
 *   - Rule ORDER changes when rules move between components (the cascade only
 *     cares about order for equal-specificity ties, which this refactor does not
 *     create, so a set comparison is the right granularity).
 *
 * Usage:
 *   node scripts/css-parity.mjs <dist-dir> > snapshot.txt   # take a snapshot
 *   node scripts/css-parity.mjs --compare a.txt b.txt       # diff two snapshots
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const normalizeScope = (s) =>
  s
    .replace(/\[data-v-[0-9a-f]+\]/g, '')
    .replace(/-[0-9a-f]{8}\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()

/** Collect every "selector | declaration" pair in a stylesheet, normalised. */
function collect(buildDir) {
  const assetsDir = join(buildDir, 'assets')
  const files = readdirSync(assetsDir).filter((f) => f.endsWith('.css'))

  const out = new Set()

  /** Split a stylesheet into top-level rules, keeping @media bodies as one unit. */
  function walk(css, prefix = '') {
    let i = 0
    while (i < css.length) {
      const open = css.indexOf('{', i)
      if (open === -1) break
      const prelude = css.slice(i, open)
      // find matching close brace
      let depth = 1
      let j = open + 1
      while (j < css.length && depth > 0) {
        if (css[j] === '{') depth++
        else if (css[j] === '}') depth--
        j++
      }
      const body = css.slice(open + 1, j - 1)
      const head = prelude.trim()
      if (/^@(media|supports|layer)/.test(head)) {
        walk(body, `${prefix}${normalizeScope(head)} `)
      } else if (/^@keyframes/.test(head)) {
        const name = normalizeScope(head.replace(/^@keyframes\s*/, ''))
        for (const frame of body.split('}')) {
          const [pos, decls] = frame.split('{')
          if (!decls) continue
          for (const d of decls.split(';')) {
            if (d.trim()) out.add(`${prefix}@keyframes ${name} ${pos.trim()} | ${normalizeScope(d)}`)
          }
        }
      } else {
        for (const decl of body.split(';')) {
          if (!decl.trim()) continue
          out.add(`${prefix}${normalizeScope(head)} | ${normalizeScope(decl)}`)
        }
      }
      i = j
    }
  }

  for (const file of files) {
    walk(readFileSync(join(assetsDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''))
  }
  return { out, files }
}

function snapshot(buildDir) {
  const { out, files } = collect(buildDir)
  for (const line of [...out].sort()) console.log(line)
  console.log(`# ${out.size} declarations from ${files.length} stylesheet(s)`)
}

/**
 * Compare two snapshot files. Prints every difference and exits 1 when they are
 * not identical, so this can gate a commit in a shell pipeline.
 */
function compare(fileA, fileB) {
  const read = (p) => readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('# '))
  const a = new Set(read(fileA))
  const b = new Set(read(fileB))

  const lost = [...a].filter((l) => !b.has(l))
  const added = [...b].filter((l) => !a.has(l))

  if (!lost.length && !added.length) {
    console.log(`CSS PARITY: identical (${a.size} declarations)`)
    return 0
  }
  if (lost.length) {
    console.log(`CSS PARITY: ${lost.length} declaration(s) LOST:`)
    for (const l of lost) console.log(`  - ${l}`)
  }
  if (added.length) {
    console.log(`CSS PARITY: ${added.length} declaration(s) ADDED:`)
    for (const l of added) console.log(`  + ${l}`)
  }
  return 1
}

const args = process.argv.slice(2)
if (args[0] === '--compare') {
  process.exit(compare(args[1], args[2]))
} else {
  if (!args[0]) {
    console.error('usage: node scripts/css-parity.mjs <dist-dir> | --compare <a> <b>')
    process.exit(2)
  }
  snapshot(args[0])
}
