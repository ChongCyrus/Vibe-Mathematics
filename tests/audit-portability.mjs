// tests/audit-portability.mjs — TB-2681: portability, line endings and skip-as-pass as a JUDGE.
//
// WHY THIS FILE EXISTS (TB-2677 measured it, 2026-11-09): the exit audit found 31 BLOCKERs that were all the
// same mistake in three costumes — (a) executable lines that hardcode THIS machine (absolute `file:///D:/...`
// imports, `const REPO = 'D:/wd/...'`, `C:/Users/<author>` fallbacks): they are green here and ERR_MODULE_NOT_FOUND
// on any other checkout; (b) whole-file CRLF in a repo whose convention is LF; (c) suites that print SKIP and
// exit 0 when a D:/_tmp corpus is gone — the gate reads "passed" because the MEASUREMENT DID NOT HAPPEN.
//
// A one-off cleanup would be undone by the next commit; this round already proved that things without a guard
// grow back. So the deliverable is the criterion, not the cleanup.
//
// THE RULES (docs/AUDIT-CHECKLIST.md §11):
//   P1  absolute machine paths on executable lines, in tests/**/*.mjs and scripts/sim/**/*.{mjs,js}
//       (file:///<drive>:/, <drive>:\Users\, <drive>:/_tmp, absolute vibemath checkout, slvpNNN-ws).
//       Only exemption: a trailing `// PORTABLE-ALLOW: <why>` on the SAME line, with why >= 24 chars.
//   P2  .mjs/.js/.json/.md must be LF and BOM-free/NUL-free; .ps1 must KEEP its BOM.
//   P3  skip-as-pass: a suite that prints SKIP and returns is BLOCKER, unless it imports requireCorpusDir from
//       tests/_lib/corpus.mjs (the ONE way to name a corpus; it throws when the corpus is missing) or the SKIP
//       line carries a PORTABLE-ALLOW with a real reason. tests/run-tests.mjs is the runner, not a suite: its
//       incremental SKIP reporting is not a measurement claim (named here so nobody widens P3 to silence it).
//
// SCOPE OF THE VERDICT (the honest part): lines this round ADDED (untracked files wholesale, plus new-side lines
// of `git diff HEAD`) are BLOCKERs; violations that already exist in tracked, unmodified lines are counted as
// LEGACY and printed with counts only. The 31 were all added lines; a judge that reds forever on the pre-existing
// backlog would be switched off within a week, which is the same as not having one.
//
// EXCEPTION, and it is not negotiable (TB-2709): inside tests/** the two machine-path shapes — `<drive>:\Users\`
// (p1-drive-users) and an absolute vibemath checkout (p1-absolute-checkout) — are BLOCKERs WHETHER OR NOT the line
// is new. A tracked, unmodified hard-coded checkout is exactly what made `tests/vmu-b4-stale-window-setting.test.mjs`
// green for a mutation it never ran: the suite imported the ORIGINAL repo while the mutation device rewrote a tmp
// copy. "It was already there" is not a reason for a criterion to stay blind, so the backlog in tests/** is red
// until it is derived (or carries a real PORTABLE-ALLOW). scripts/sim/** keeps the added-line rule: it belongs to
// another lane, and a judge does not widen its own scope into a neighbour's write set.
//
// USAGE: node tests/audit-portability.mjs [--json] [--all]
//   default  exit 0 iff no BLOCKER this round (LEGACY is reported, never silently dropped)
//   --all    every hit is a BLOCKER (whole-tree reading, for one-off audits)
//   --json   machine-readable results
//
// The criteria live in ONE place: this script. tests/audit-portability.selftest.mjs proves it bites, by planting
// probe files and requiring each of the four failure shapes to be named.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

// Single source for the checkout root (TB-2709); a second `../..` here would drift from the one suites use.
import { REPO } from './_lib/repo-root.mjs'

export { REPO }

const SCAN_ROOTS = ['tests', join('scripts', 'sim')]
const SKIP_DIRS = new Set(['node_modules', '.git', 'fixtures'])
const TEXT_EXTS = new Set(['.mjs', '.js', '.json', '.md'])
const MIN_WHY = 24
const GIT_MAX_BUFFER = 64 * 1024 * 1024
const P3_EXEMPT_FILES = new Set(['tests/run-tests.mjs'])

const P1_PATTERNS = [
  { id: 'p1-file-url-absolute', re: /file:\/\/\/[A-Za-z]:\//, what: 'absolute file:// URL (breaks on another checkout)' },
  { id: 'p1-drive-users', re: /[A-Za-z]:[\\/]Users[\\/]/, what: 'Windows user profile path' },
  { id: 'p1-drive-tmp', re: /[A-Za-z]:[\\/]_tmp(?:[\\/]|$)/, what: 'scratch directory on a fixed drive' },
  { id: 'p1-absolute-checkout', re: /[A-Za-z]:[\\/][^\s'"`]*vibemath/i, what: 'absolute checkout path' },
  { id: 'p1-session-workspace', re: /\bslvp\d+-ws\b/, what: 'session workspace name from this machine' },
]
const ALLOW_RE = /\/\/\s*PORTABLE-ALLOW:\s*(.*)$/
// TB-2709: these two shapes are BLOCKERs in tests/** even on untouched tracked lines (see the EXCEPTION note at
// the top): a hard-coded checkout there makes a mutation run green against the wrong tree, which is a lying green.
const STRICT_P1_IDS = new Set(['p1-drive-users', 'p1-absolute-checkout'])
const CORPUS_REF_RE = /(real-fields|pairs|receipts)\.jsonl|[A-Za-z]:[\\/]_tmp/

// Comment-aware view of a whole file: strings and comments do not leak into each other. Returns one code string
// per raw line (same length, so a hit can be reported with its line number) — a line inside a block comment or
// after `//` becomes empty. This is deliberately small: it must not need a parser to be trustworthy.
export function codeLinesOf(text) {
  const out = []
  let current = ''
  let quote = null
  let block = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '\n') { out.push(current); current = ''; continue }
    if (block) {
      if (ch === '*' && text[i + 1] === '/') { block = false; i += 1 }
      continue
    }
    if (quote !== null) {
      current += ch
      if (ch === '\\') { current += text[i + 1] || ''; i += 1; continue }
      if (ch === quote) quote = null
      continue
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
      if (i < text.length) { out.push(current); current = '' }
      continue
    }
    if (ch === '/' && text[i + 1] === '*') { block = true; i += 1; continue }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; current += ch; continue }
    current += ch
  }
  out.push(current)
  return out
}

function walk(root) {
  const files = []
  const visit = (dir) => {
    let entries = []
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(full)
        continue
      }
      if (!entry.isFile()) continue
      const ext = extname(entry.name)
      if (ext === '.mjs' || ext === '.js') files.push(full)
    }
  }
  for (const rel of SCAN_ROOTS) {
    const dir = join(root, rel)
    if (existsSync(dir)) visit(dir)
  }
  return files
}

function gitTouchedLines(root) {
  const touched = new Map()
  const r = spawnSync('git', ['diff', '--unified=0', '--no-color', 'HEAD'], { cwd: root, encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER })
  if (r.status !== 0) return { ok: false, reason: String(r.stderr || r.error || '').slice(0, 200), touched }
  let current = null
  for (const line of String(r.stdout || '').split('\n')) {
    if (line.startsWith('+++ b/')) { current = line.slice(6); if (!touched.has(current)) touched.set(current, new Set()); continue }
    const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (m && current) {
      const start = Number(m[1])
      const count = m[2] === undefined ? 1 : Number(m[2])
      const set = touched.get(current)
      for (let i = 0; i < count; i += 1) set.add(start + i)
    }
  }
  return { ok: true, touched }
}

function gitUntracked(root) {
  const r = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8', maxBuffer: GIT_MAX_BUFFER })
  if (r.status !== 0) return { ok: false, untracked: new Set() }
  return { ok: true, untracked: new Set(String(r.stdout || '').split('\n').filter(Boolean).map((p) => p.split('\\').join('/'))) }
}

export function scanTree({ root = REPO, all = false, useGit = true } = {}) {
  const blockers = []
  const legacy = []
  const warnings = []
  const git = useGit && existsSync(join(root, '.git')) ? { touched: gitTouchedLines(root), untracked: gitUntracked(root) } : null
  const gitOk = git !== null && git.touched.ok && git.untracked.ok

  const files = walk(root)
  for (const full of files) {
    const rel = relative(root, full).split(sep).join('/')
    const text = readFileSync(full, 'utf8')
    const rawLines = text.split('\n')
    const codeLines = codeLinesOf(text)
    const relTouched = gitOk ? git.touched.touched.get(rel) : undefined
    const added = !gitOk || all || git.untracked.untracked.has(rel) || relTouched !== undefined
    const lineAdded = (lineNo) => !gitOk || all || git.untracked.untracked.has(rel) || (relTouched !== undefined && relTouched.has(lineNo))
    const corpusDependent = CORPUS_REF_RE.test(codeLines.join('\n'))

    for (let i = 0; i < rawLines.length; i += 1) {
      const raw = rawLines[i].replace(/\r$/, '')
      const code = codeLines[i] || ''
      for (const p of P1_PATTERNS) {
        if (!p.re.test(code)) continue
        const allow = ALLOW_RE.exec(raw)
        if (allow && allow[1].trim().length >= MIN_WHY) continue
        const hit = {
          rule: 'P1',
          id: allow ? 'p1-allow-why-too-short' : p.id,
          file: rel,
          line: i + 1,
          snippet: raw.trim().slice(0, 160),
          why: allow ? 'PORTABLE-ALLOW needs a reason of at least ' + MIN_WHY + ' characters' : p.what,
        }
        const strict = rel.startsWith('tests/') && STRICT_P1_IDS.has(p.id)
        ;(strict || lineAdded(i + 1) ? blockers : legacy).push(hit)
      }
    }

    const ext = extname(rel)
    if (TEXT_EXTS.has(ext) || ext === '.ps1') {
      if (ext === '.ps1') {
        if (!text.startsWith('\uFEFF')) {
          const hit = { rule: 'P2', id: 'p2-ps1-bom-missing', file: rel, line: 1, snippet: rel, why: 'PowerShell scripts must keep their BOM' }
          ;(added ? blockers : legacy).push(hit)
        }
      } else {
        const crlfAt = text.search(/\r\n|\r/)
        if (crlfAt !== -1) {
          const lineNo = text.slice(0, crlfAt).split('\n').length
          const hit = { rule: 'P2', id: 'p2-crlf', file: rel, line: lineNo, snippet: 'CR at line ' + lineNo, why: 'repository convention is LF' }
          ;(added ? blockers : legacy).push(hit)
        }
        if (text.includes('\u0000')) {
          const hit = { rule: 'P2', id: 'p2-nul', file: rel, line: 1, snippet: 'NUL byte in text file', why: 'text files must not contain NUL' }
          ;(added ? blockers : legacy).push(hit)
        }
        if (text.startsWith('\uFEFF')) {
          const hit = { rule: 'P2', id: 'p2-bom', file: rel, line: 1, snippet: 'BOM before first line', why: 'only .ps1 keeps a BOM' }
          ;(added ? blockers : legacy).push(hit)
        }
      }
    }

    // P3: a suite that prints SKIP is claiming a measurement it did not make.
    if (!P3_EXEMPT_FILES.has(rel)) {
      const code = codeLines.join('\n')
      const skipLines = []
      for (let i = 0; i < codeLines.length; i += 1) {
        if (/console\.log\(\s*['"`]SKIP/.test(codeLines[i])) skipLines.push(i)
      }
      if (skipLines.length > 0) {
        const importsCorpus = /from\s+['"][^'"]*_lib[\\/]corpus\.mjs['"]/.test(code) && /\brequireCorpusDir\b/.test(code)
        const allowed = skipLines.every((i) => {
          const allow = ALLOW_RE.exec(rawLines[i] || '')
          return allow !== null && allow[1].trim().length >= MIN_WHY
        })
        if (importsCorpus) {
          warnings.push({ rule: 'P3', id: 'p3-skip-with-corpus-helper', file: rel, line: skipLines[0] + 1, snippet: 'prints SKIP while also using requireCorpusDir', why: 'the helper throws on a missing corpus, so this skip is about another input' })
        } else if (!allowed) {
          const hit = {
            rule: 'P3',
            id: corpusDependent ? 'p3-skip-on-missing-corpus' : 'p3-skip-as-pass',
            file: rel,
            line: skipLines[0] + 1,
            snippet: 'prints SKIP and exits 0 (line ' + (skipLines[0] + 1) + ')',
            why: corpusDependent
              ? 'corpus-dependent suite must import requireCorpusDir; a missing corpus must throw, never print SKIP and pass'
              : 'a skipped measurement is not a passed measurement; throw instead, or carry a PORTABLE-ALLOW with a real reason',
          }
          ;(added ? blockers : legacy).push(hit)
        }
      }
    }

    // vacuous assertions: the P3 cousin. WARN only (Lead: do not hard-fail while ambiguous).
    for (let i = 0; i < codeLines.length; i += 1) {
      if (!/\bok\(\s*true\s*,/.test(codeLines[i])) continue
      warnings.push({ rule: 'P3', id: 'p3-vacuous-ok-true', file: rel, line: i + 1, snippet: rawLines[i].trim().slice(0, 160), why: 'assertion body is constant true, so it cannot fail' })
    }
  }

  return { repo: root, scanned: files.length, blockers, legacy, warnings, gitUsed: gitOk }
}

function render(result) {
  const out = []
  out.push('PORTABILITY AUDIT (TB-2681) — P1 absolute paths / P2 line endings / P3 skip-as-pass')
  out.push('scanned ' + result.scanned + ' files under tests/** and scripts/sim/**' + (result.gitUsed ? '' : ' (no git: every line treated as added)'))
  const group = (title, list) => {
    out.push('')
    out.push(title + ': ' + list.length)
    const byId = new Map()
    for (const hit of list) byId.set(hit.id, (byId.get(hit.id) || 0) + 1)
    for (const [id, n] of byId) out.push('  ' + id + ' x' + n)
    for (const hit of list.slice(0, 40)) out.push('  ' + hit.file + ':' + hit.line + '  [' + hit.id + ']  ' + hit.snippet)
    if (list.length > 40) out.push('  ... and ' + (list.length - 40) + ' more (see --json)')
  }
  group('BLOCKER (added this round)', result.blockers)
  group('LEGACY (tracked, unchanged — counted, not a gate failure)', result.legacy)
  group('WARN', result.warnings)
  out.push('')
  out.push('VERDICT: ' + (result.blockers.length === 0 ? 'PASS (0 blockers)' : 'FAIL (' + result.blockers.length + ' blockers)')
    + ' | legacy ' + result.legacy.length + ' | warn ' + result.warnings.length)
  return out.join('\n')
}

const isMain = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  // ★ --selftest / --self-test: RUN the sibling self-proof (tests/audit-portability.selftest.mjs) and propagate its
  // verdict. This is the entry point tests/audit-scanner-selfproof.test.mjs demands before it stops treating this
  // scanner as unproven: a gate whose "0 findings" cannot be shown to go red is only a comment. It is a real
  // delegation, not a name: the sibling plants probe files that MUST be named, and its exit status becomes this
  // exit status. (The sibling stays runnable standalone - docs and preflight already call it that way.)
  if (process.argv.includes('--selftest') || process.argv.includes('--self-test')) {
    const r = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'audit-portability.selftest.mjs')], { stdio: 'inherit' })
    process.exit(r.status === null ? 1 : r.status)
  }
  const JSON_OUT = process.argv.includes('--json')
  const ALL = process.argv.includes('--all')
  const result = scanTree({ root: REPO, all: ALL })
  if (JSON_OUT) console.log(JSON.stringify(result, null, 2))
  else console.log(render(result))
  process.exit(result.blockers.length === 0 ? 0 : 1)
}
