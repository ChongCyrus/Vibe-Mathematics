#!/usr/bin/env node
// generate-seam-table.mjs — EXTRACT the seam-reachability table from kernel sources. Never hand-written.
//
// Seams are the injected capabilities a service may receive at construction time. The point of this table
// is the root cause the reviewer hit three times in one stage: a seam was WIRED but its consumer never used
// it (clock guard / audit anchor), and four capability seams were hard-coded to `null` (signer / deliver /
// fetchFn / timer) — with `deliver` wired to members/meetings but NOT to notify.
//
// Output (stdout):   seam -> construction site (file:line) -> consumers -> factory default
//                    every `null` default MUST carry a reason string (ABSENT_REASONS)
// Flags:
//   --kernel <path>   parse another kernel/index.js (used by the gate's fault-injection proofs)
//   --out <path>      table file for --check (default: <tmp>/vmu-seam-table.md)
//   --write           (re)write the table file
//   --check           report drift between the table file and the current extraction
//   --json            machine-readable rows
//   --no-fingerprint  omit `head=`/`dirty=` from the conclusion line (D4 fault-injection proof)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SEAMS = ['clock', 'log', 'settings', 'bus', 'store', 'members', 'tasks', 'metrics', 'signer', 'deliver', 'fetchFn', 'timer', 'random', 'now', 'policy']
// Reasons for a `null` factory default. The gate refuses a null seam that has no reason HERE — the reason
// text lives gate-side on purpose: this task must not edit kernel/** (see the task's red lines).
const ABSENT_REASONS = {
  'notify.deliver': 'no host transport is produced in this build; without it notify refuses by name and never pretends to deliver (kernel/notify.js)',
  'notify.signer': 'notification payloads are not signed in this build; signing is an optional capability seam',
  'notify.fetchFn': 'notify does not fetch remote content in this build',
  'notify.timer': 'notify never schedules: digests are delivered by an explicit flush(), so no timer is injected',
  'idempotency.signer': 'projection documents are not signed in this build',
  'idempotency.fetchFn': 'the idempotency ledger never fetches remote content',
  'idempotency.timer': 'the ledger is pull-based: no timer drives it',
  'alerts.signer': 'alerts are not signed in this build',
  'bidding.signer': 'bids are not signed in this build',
  'skills.signer': 'capability claims are not signed in this build',
  'topology.signer': 'topology declarations are not signed in this build',
  'trust.signer': 'reputation signals are not signed in this build',
  'stateversion.signer': 'state migrations are not signed in this build',
  'projmigrate.signer': 'projection migrations are not signed in this build',
  'projectionMigrator.bus': 'bus is ADVISORY-ONLY for this module: it emits an event when present and works without one, so absence is explicitly supported',
}
// Differences that are acceptable BY DESIGN and therefore never raise the inconsistency finding.
// Every entry must justify itself; anything not listed here and not explained by a reason is the defect.
const OPTIONAL_BY_DESIGN = {
  'projectionMigrator.bus': 'advisory-only seam: the module is fully functional without a bus',
}
// A seam may legitimately differ across services ONLY through OPTIONAL_BY_DESIGN below (per service.seam,
// each entry carrying its own justification). A blanket per-seam exemption is deliberately NOT used here:
// the historical `deliver` defect was exactly "wired for A, silently null for B", so an exemption keyed
// on the seam name alone would hide the very class this table exists to catch.
const CONSISTENCY_EXEMPT = {}
const args = process.argv.slice(2)
const opt = (name, def = null) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : (i >= 0 ? true : def) }
const KERNEL = String(opt('--kernel', join(REPO, 'vibe-math-vmu/kernel/index.js')))
const OUT = String(opt('--out', join(tmpdir(), 'vmu-seam-table.md')))
const wantJson = args.includes('--json')
const wantWrite = args.includes('--write')
const wantCheck = args.includes('--check')
const noFp = args.includes('--no-fingerprint')

function fingerprint() {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim()
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' }).split('\n').filter((l) => l.trim()).length
    return { head, dirty }
  } catch (e) { return { head: 'unknown', dirty: -1 } }
}

/** Extract `createX({ ... })` construction sites and their seam arguments, with line numbers. */
function extract(path) {
  const src = readFileSync(path, 'utf8')
  const lines = src.split('\n')
  const rows = []
  const ctorRe = /create([A-Z][A-Za-z0-9_]*)\s*\(\s*\{/g
  let m
  while ((m = ctorRe.exec(src))) {
    const service = m[1].charAt(0).toLowerCase() + m[1].slice(1)
    // find the matching closing brace of the argument object (shallow but adequate for this codebase)
    let depth = 0, i = m.index + m[0].length - 1, end = -1
    for (; i < src.length; i++) {
      const ch = src[i]
      if (ch === '{') depth += 1
      else if (ch === '}') { depth -= 1; if (depth === 0) { end = i; break } }
    }
    const body = end > 0 ? src.slice(m.index, end + 1) : src.slice(m.index, m.index + 400)
    const line = src.slice(0, m.index).split('\n').length
    const props = body.slice(body.indexOf('{') + 1)
    for (const seam of SEAMS) {
      const re = new RegExp('(^|[{,\\s])' + seam + '\\s*:\\s*([^,}\\n]+)')
      const hit = re.exec(props)
      if (!hit) continue
      const value = hit[2].trim()
      const isNull = /^null\b/.test(value)
      const bodyStart = src.split('\n').slice(0, m.index).join('\n').length
      const preceded = src.slice(0, m.index).split('\n').length
      rows.push({ service, seam, site: 'kernel/index.js:' + line, value, isNull, file: path.split(/[\\/]/).pop(), at: preceded })
    }
  }
  rows.sort((a, b) => (a.seam < b.seam ? -1 : a.seam > b.seam ? 1 : (a.service < b.service ? -1 : 1)))
  return rows
}

function consumersOf(rows, seam) {
  const got = rows.filter((r) => r.seam === seam && !r.isNull).map((r) => r.service)
  return got.length ? got.join(', ') : '(none)'
}
function findings(rows) {
  const out = []
  for (const r of rows) {
    if (r.isNull && !ABSENT_REASONS[r.service + '.' + r.seam]) {
      out.push('ABSENT_REASON_MISSING ' + r.service + '.' + r.seam + ' (' + r.site + '): a null seam must carry a reason')
    }
  }
  const bySeam = new Map()
  for (const r of rows) { if (!bySeam.has(r.seam)) bySeam.set(r.seam, []); bySeam.get(r.seam).push(r) }
  for (const [seam, list] of bySeam) {
    const withValue = list.filter((r) => !r.isNull).map((r) => r.service)
    const nulls = list.filter((r) => r.isNull).map((r) => r.service)
    const unexplained = nulls.filter((svc) => !OPTIONAL_BY_DESIGN[svc + '.' + seam])
    if (withValue.length && unexplained.length && !CONSISTENCY_EXEMPT[seam]) {
      out.push('SEAM_INCONSISTENT ' + seam + ': wired to [' + withValue.join(', ') + '] but null for [' + unexplained.join(', ') + '] — a capability reachable by one consumer must be reachable by the others (or the table must say why)')
    }
  }
  return out
}
function render(rows) {
  const head = ['| seam | construction site | consumers | factory default |', '|---|---|---|---|']
  const body = rows.map((r) => '| `' + r.seam + '` | `' + r.site + '` (' + r.service + ') | ' + consumersOf(rows, r.seam) + ' | `' + r.value + '`' + (r.isNull ? ' — ' + (ABSENT_REASONS[r.service + '.' + r.seam] || '**NO REASON**') : '') + ' |')
  const fx = findings(rows)
  const fp = fingerprint()
  return head.concat(body).join('\n') + '\n\n' + (fx.length ? fx.map((f) => '- ' + f).join('\n') + '\n' : '') +
    '\nSEAM TABLE: rows=' + rows.length + ' seams=' + new Set(rows.map((r) => r.seam)).size + ' null=' + rows.filter((r) => r.isNull).length +
    ' findings=' + fx.length + (noFp ? '' : ' head=' + fp.head + ' dirty=' + fp.dirty) + '\n' +
    'SEAM REACHABILITY: ' + (fx.length ? 'FAIL' : 'PASS') + (noFp ? '' : ' head=' + fp.head + ' dirty=' + fp.dirty) + '\n'
}

const rows = extract(KERNEL)
const text = render(rows)
if (wantJson) console.log(JSON.stringify({ kernel: KERNEL, rows, findings: findings(rows), fingerprint: fingerprint() }, null, 2))
else if (wantCheck) {
  if (!existsSync(OUT)) { console.log('SEAM TABLE DRIFT: no table file at ' + OUT + ' (run --write first)'); process.exit(1) }
  const prev = readFileSync(OUT, 'utf8')
  const a = prev.split('\n').filter((l) => l.startsWith('|') || l.startsWith('- ')).join('\n')
  const b = text.split('\n').filter((l) => l.startsWith('|') || l.startsWith('- ')).join('\n')
  if (a !== b) { console.log('SEAM TABLE DRIFT: the table is STALE — regenerate with --write'); process.exit(1) }
  if (wantCheck) { /* drift is the only red this mode reports; findings are reported by the normal run */ }
  console.log('SEAM TABLE: up to date' + (noFp ? '' : ' head=' + fingerprint().head + ' dirty=' + fingerprint().dirty))
} else if (wantWrite) { writeFileSync(OUT, text, 'utf8'); process.stdout.write(text); console.log('SEAM TABLE WRITTEN: ' + OUT) }
else process.stdout.write(text)
const fx = findings(rows)
process.exit(wantCheck ? 0 : (fx.length ? 1 : 0))
