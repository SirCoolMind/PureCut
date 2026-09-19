#!/usr/bin/env node
/**
 * context-report.mjs
 *
 * Reports the "AI context cost" of this repository: how many lines and roughly
 * how many tokens an agent must read to load each file.
 *
 * Purpose: give the AI-context refactor a measurable success metric. Run it
 * before and after each stage and compare the summary block.
 *
 * Usage:
 *   node scripts/context-report.mjs           # human-readable table
 *   node scripts/context-report.mjs --json    # machine-readable, for diffing
 *   node scripts/context-report.mjs --check   # exit 1 if any file exceeds budget
 *
 * Token estimates use chars/4, which is a reasonable approximation for source
 * code under BPE tokenizers. Treat them as relative indicators, not exact counts.
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, extname, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Directories that never belong in an AI context window. */
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.git',
  '.refactor-baseline',
  'graphify-out',
  'artifacts',
  'coverage',
  '.vite'
])

/** Only text files are worth reporting; binaries just inflate the numbers. */
const TEXT_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.mts', '.cts',
  '.vue', '.json', '.html', '.css', '.scss',
  '.md', '.txt', '.yml', '.yaml', '.bat', '.sh'
])

/** Extra root-level files worth tracking (config + docs an agent may read). */
const EXTRA_ROOT_FILES = ['index.html', 'vite.config.js', 'package.json', 'README.md', 'AGENTS.md']

/**
 * Budgets enforced by --check. Keep in sync with the plan and AGENTS.md.
 * The point of the refactor is to keep the largest readable unit small.
 */
const BUDGET = {
  maxFileLines: 450,
  targetAppVueLines: 400
}

async function collectTextFiles(dir, acc = []) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return acc // directory absent; nothing to collect
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && entry.isDirectory()) continue
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      await collectTextFiles(join(dir, entry.name), acc)
      continue
    }
    if (TEXT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      acc.push(join(dir, entry.name))
    }
  }
  return acc
}

async function measure(absPath) {
  const [content, info] = await Promise.all([readFile(absPath, 'utf8'), stat(absPath)])
  const lines = content.split('\n').length
  // chars/4 approximates BPE token count for source code
  const tokens = Math.ceil(content.length / 4)
  return {
    path: relative(ROOT, absPath).split(sep).join('/'),
    lines,
    bytes: info.size,
    tokens,
    sections: absPath.endsWith('.vue') ? sectionBreakdown(content) : null
  }
}

/**
 * Split an SFC into its `<script>` / `<template>` / `<style>` block sizes.
 *
 * A single 450-line budget applied to a .vue file is misleading on its own: a
 * file can be 60% scoped CSS, which behaves nothing like 450 lines of logic. The
 * breakdown is what makes the number actionable - it says which of the three
 * blocks to split.
 */
function sectionBreakdown(content) {
  const sections = []
  const re = /^<(script|template|style)([^>]*)>\s*$/gm
  let match
  const starts = []
  while ((match = re.exec(content)) !== null) {
    starts.push({ tag: match[1], selfClosing: match[2].includes('src='), line: content.slice(0, match.index).split('\n').length })
  }
  const closing = /^<\/(script|template|style)>\s*$/gm
  const ends = []
  while ((match = closing.exec(content)) !== null) {
    ends.push(content.slice(0, match.index).split('\n').length)
  }
  for (let i = 0; i < starts.length; i++) {
    const end = ends[i] ?? starts[i].line
    const extra = starts[i].selfClosing ? ' (external src)' : ''
    sections.push(`${starts[i].tag}${extra} ${end - starts[i].line + 1}`)
  }
  return sections.join(', ')
}

function formatRow(file, isLargest) {
  const flag = isLargest ? ' <-- largest' : ''
  return `${file.path.padEnd(42)} ${String(file.lines).padStart(6)} ${String(file.tokens).padStart(8)}${flag}`
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const asJson = args.has('--json')
  const check = args.has('--check')

  const srcFiles = await collectTextFiles(join(ROOT, 'src'))
  const rootFiles = []
  for (const name of EXTRA_ROOT_FILES) {
    try {
      const info = await stat(join(ROOT, name))
      if (info.isFile()) rootFiles.push(join(ROOT, name))
    } catch {
      // optional file, not present
    }
  }
  // scripts/ and tests/ are tracked too, since agents read them: the budget is
  // about every file an agent must read, not only shipped source.
  const scriptFiles = await collectTextFiles(join(ROOT, 'scripts'))
  const testFiles = await collectTextFiles(join(ROOT, 'tests'))

  const all = [...srcFiles, ...scriptFiles, ...testFiles, ...rootFiles]
  const measured = (await Promise.all(all.map(measure))).sort((a, b) => b.tokens - a.tokens)

  const totalLines = measured.reduce((sum, f) => sum + f.lines, 0)
  const totalTokens = measured.reduce((sum, f) => sum + f.tokens, 0)
  const largest = measured[0]
  const appVue = measured.find((f) => f.path === 'src/App.vue')

  if (asJson) {
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      files: measured,
      summary: {
        fileCount: measured.length,
        totalLines,
        totalTokens,
        largestFile: largest?.path ?? null,
        largestFileLines: largest?.lines ?? 0,
        appVueLines: appVue?.lines ?? 0
      }
    }, null, 2))
    return
  }

  console.log('AI context report - PureCut')
  console.log('='.repeat(62))
  console.log(`${'FILE'.padEnd(42)} ${'LINES'.padStart(6)} ${'~TOKENS'.padStart(8)}`)
  console.log('-'.repeat(62))
  for (const file of measured) {
    console.log(formatRow(file, file === largest))
  }
  console.log('-'.repeat(62))
  console.log(`Files: ${measured.length}   Lines: ${totalLines}   ~Tokens: ${totalTokens}`)
  console.log(`Largest single read: ${largest.path} (${largest.lines} lines, ~${largest.tokens} tokens)`)
  console.log(`App.vue: ${appVue ? appVue.lines : 0} lines`)
  console.log('')
  console.log(`Budget: no file over ${BUDGET.maxFileLines} lines; App.vue target <= ${BUDGET.targetAppVueLines}`)

  // Where an oversized .vue keeps its lines: the number alone does not say
  // whether to split logic, markup or styles.
  const sfcOverBudget = measured.filter((f) => f.sections && f.lines > BUDGET.maxFileLines)
  if (sfcOverBudget.length) {
    console.log('')
    console.log('Oversized .vue files - which block is to blame:')
    for (const f of sfcOverBudget) console.log(`  - ${f.path}: ${f.lines} total  [${f.sections}]`)
  }

  if (check) {
    const violations = measured.filter((f) => f.lines > BUDGET.maxFileLines)
    const appVueOver = appVue && appVue.lines > BUDGET.targetAppVueLines
    if (violations.length || appVueOver) {
      console.log('')
      console.log('BUDGET VIOLATIONS:')
      for (const v of violations) console.log(`  - ${v.path}: ${v.lines} lines${v.sections ? `  [${v.sections}]` : ''}`)
      if (appVueOver) console.log(`  - src/App.vue exceeds its target: ${appVue.lines} lines${appVue?.sections ? `  [${appVue.sections}]` : ''}`)
      process.exit(1)
    }
    console.log('')
    console.log('Budget check passed.')
  }
}

main().catch((err) => {
  console.error('context-report failed:', err.message)
  process.exit(1)
})
