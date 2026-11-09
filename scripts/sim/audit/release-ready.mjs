// scripts/sim/audit/release-ready.mjs — TB-2609: the MACHINE answers "may we spend tokens on a real run?".
//
// WHY: the loop the user asked for is  sim (0 token) -> read the sim corpus + audit it -> fix/refactor -> sim -> ...
// until the audit reports nothing left, and ONLY THEN a real run. Every round of that loop existed, but "is the audit
// clean?" lived in a human's head: a run could start on a stale audit, on a red sim gate, or on an open P0 queue,
// and nothing refused. This file turns that sentence into four facts a machine can read and a verdict.
//
// FOUR FACTS (all must hold for READY):
//   1. SIM GATE      `node tests/sim-gate.test.mjs` exits 0 (TB-2605). A remembered green is not a gate: unless the
//                    caller explicitly asks for `--no-gate`, the gate is RUN here, now. `--no-gate` can only ever
//                    produce NOT READY — skipping the proof is a reason, not a pass.
//   2. AUDIT FRESH   the newest `AUDIT.md` under the sim output root must be NEWER than the last commit, AND newer
//                    than the newest edit in the working tree. HEAD alone is not enough: this repo runs with many lanes
//                    editing uncommitted files, so "newer than the last commit" can be true while the report predates
//                    the code a real run would load. An audit of code nobody is about to run proves nothing.
//   3. AUDIT CLEAN   that report says `AUDIT: PASS`, its five sections are present, and the fidelity section reports
//                    `gaps: 0` (the "unattributed differences = 0" reading, in the shape all.mjs actually prints).
//   4. P0 QUEUE      `docs/acceptance/sim-audit-open-items.json` has no P0 with status `open`. P1 may stay open when
//                    it carries an owner and a named condition — the risk note of the taskbook: do not build a gate
//                    that can never open; open P0 is what blocks.
//
// EXIT: 0 READY, 1 NOT READY, 2 the checker itself misused (bad flag). The live driver maps "not 0" to exit 7 and
// only continues when a human passes `-OverrideReleaseGate "<reason>"`, which is recorded next to the run.
//
// Run: node scripts/sim/audit/release-ready.mjs [--json] [--no-gate] [--audit=<AUDIT.md>] [--head-iso=<iso>]
//      [--open-items=<json>] [--gate-script=<run.mjs-compatible test>] [--gate-timeout-ms=<n>] [--root=<sim root>]
//
// This file is read-only with respect to the repository: it writes nothing except (optionally) a JSON summary when
// asked with `--json`, so it can be called from a release script without leaving traces.

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
// ONE RULER (TB-2653 R3): the gate recomputes the fidelity reading with the SAME module all.mjs prints with. A report
// that says "gaps: 0" is a claim; this import is how the gate checks the claim instead of believing it.
import { RICH_REAL, loadRich, loadSimFields, withoutGlossary, readBaseline, measureFidelity } from './fidelity-measure.mjs'
// ONE RULER (TB-2609 / corpus-stale): the enumeration AND the digest of "which receipts did this audit measure" live
// in corpus-files.mjs, shared with all.mjs. They used to be two loops that disagreed about which directory the corpus
// lives in, so a clean tree was refused with AUDIT_CORPUS_STALE. Re-exported below for existing import sites.
import { resolveReportCorpus } from './corpus-files.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..', '..', '..')
const SIM_ROOT = 'D:/_tmp/sim' // PORTABLE-ALLOW: dev audit root; overridable with --root, and a missing AUDIT.md becomes a named refusal (AUDIT_MISSING), never a skip
const OPEN_ITEMS = join(REPO, 'docs', 'acceptance', 'sim-audit-open-items.json')
const GATE_SCRIPT = join(REPO, 'tests', 'sim-gate.test.mjs')

const argv = process.argv.slice(2)
const flagValue = (name, fallback = null) => {
  const hit = argv.find((a) => a === name || a.startsWith(name + '='))
  if (!hit) return fallback
  if (hit === name) return argv[argv.indexOf(name) + 1] || fallback
  return hit.slice(name.length + 1) || fallback
}
const hasFlag = (name) => argv.includes(name)

if (hasFlag('--help') || hasFlag('-h')) {
  console.log('usage: node scripts/sim/audit/release-ready.mjs [--json] [--no-gate] [--audit=<AUDIT.md>]')
  console.log('       [--head-iso=<iso>] [--open-items=<json>] [--gate-script=<test>] [--gate-timeout-ms=<n>]')
  process.exit(0)
}

// ── fact collectors ───────────────────────────────────────────────────────────────────────────────────────────────
/** The newest AUDIT.md written by scripts/sim/audit/all.mjs: the root one, or any per-run directory under it. */
export function newestAudit(root = SIM_ROOT) {
  if (!existsSync(root)) return null
  const found = []
  const consider = (p) => {
    if (!existsSync(p)) return
    const st = statSync(p)
    if (st.isFile()) found.push({ path: p, mtimeMs: st.mtimeMs, size: st.size })
  }
  consider(join(root, 'AUDIT.md'))
  for (const name of readdirSync(root)) {
    const dir = join(root, name)
    try {
      if (statSync(dir).isDirectory()) consider(join(dir, 'AUDIT.md'))
    } catch {
      /* a vanished entry is not a report */
    }
  }
  if (!found.length) return null
  found.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return found[0]
}

/** What the report says, in the exact shapes all.mjs prints (measured, not guessed).
 *
 * AUDIT-14 / P0-2: prose alone cannot prove a report came from all.mjs. A hand-typed 12-line file with the same
 * verdict line and section headers used to satisfy this parser. The proof of origin is the machine-readable
 * `json audit-report` block all.mjs writes at the end: audit id, the content-bound tree hash, the corpus counts and
 * the fidelity counts. No block (or an unparseable one) is `manifest: null`, and the gate refuses to read that as
 * clean. */
export function parseAuditReport(text) {
  const verdict = text.match(/^AUDIT: (PASS|FAIL) — (\d+) failure\(s\), (\d+) warning\(s\)/m)
  const sections = ['## 1. scenarios', '## 2. receipt audit', '## 3. rule coverage', '## 4. action coverage', '## 5. fidelity vs live receipts']
  const gaps = text.match(/- live tools with a field list: (\d+); compared: (\d+); gaps: (\d+)/)
  const block = text.match(/```json audit-report\r?\n([\s\S]*?)\r?\n```/)
  let manifest = null
  let manifestError = block ? null : 'no ```json audit-report block: prose cannot prove the report came from all.mjs'
  if (block) {
    try {
      manifest = JSON.parse(block[1])
    } catch (e) {
      manifestError = 'the audit-report block is not JSON: ' + e.message
    }
  }
  return {
    verdict: verdict ? verdict[1] : null,
    failures: verdict ? Number(verdict[2]) : null,
    warnings: verdict ? Number(verdict[3]) : null,
    sections: sections.filter((s) => text.includes(s)),
    missingSections: sections.filter((s) => !text.includes(s)),
    gaps: gaps ? Number(gaps[3]) : null,
    compared: gaps ? Number(gaps[2]) : null,
    manifest,
    manifestError,
  }
}

/** HEAD's commit time as ms, from git; null when git cannot answer (then freshness cannot be proved). */
export function headCommitMs(repo = REPO) {
  const r = spawnSync('git', ['-C', repo, 'log', '-1', '--format=%cI'], { encoding: 'utf8', timeout: 20000 })
  if (r.status !== 0 || !r.stdout || !r.stdout.trim()) return null
  const ms = Date.parse(r.stdout.trim())
  return Number.isFinite(ms) ? ms : null
}

/**
 * The newest edit time among files a run would actually LOAD: tracked files changed since HEAD plus untracked files
 * that git does not ignore, under CODE_ROOTS. The audit reads the working tree, so this is the newest input it can
 * have covered. Docs are excluded on purpose: a real run does not load them, and counting them would make every
 * ledger edit look like unaudited code (the exact false positive that teaches people to bypass the gate).
 * Returns { ok, newestMs, newestPath, changed, why }: !ok means "cannot prove freshness" and must NOT read as fresh.
 */
const CODE_ROOTS = ['vibe-math-vmu/', 'scripts/', 'tests/']
export function worktreeDriftMs(repo = REPO) {
  const list = (args) => {
    const r = spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8', timeout: 30000 })
    if (r.status !== 0) return null
    return String(r.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)
  }
  const changed = list(['diff', '--name-only', 'HEAD'])
  const untracked = list(['ls-files', '--others', '--exclude-standard'])
  if (changed === null || untracked === null) return { ok: false, newestMs: null, newestPath: null, changed: [], why: 'git could not list the working tree' }
  const paths = Array.from(new Set(changed.concat(untracked)))
    .filter((p) => CODE_ROOTS.some((root) => p.startsWith(root)))
  let newestMs = null
  let newestPath = null
  for (const p of paths) {
    const abs = join(repo, p)
    try {
      const st = statSync(abs)
      if (!st.isFile()) continue
      if (newestMs === null || st.mtimeMs > newestMs) { newestMs = st.mtimeMs; newestPath = p }
    } catch {
      /* a deleted file contributes no edit time; its deletion time is not the code a run loads */
    }
  }
  return { ok: true, newestMs, newestPath, changed: paths, why: null }
}

/**
 * A digest of the working tree a report claims to be about: HEAD + every dirty path's `git hash-object` blob id.
 *
 * WHY NOT `git status --porcelain | sha256sum`: the audit itself proved that hash is blind to content. During one
 * audit the diff grew from +5947 to +6486 lines while the dirty-path list (and therefore that sha) stayed identical,
 * so a report could be attached to code nobody had audited and the hash would not notice. Hashing each blob binds the
 * report to the CONTENT: any edit -- same set of paths -- changes the digest.
 *
 * Returns { ok, head, hash, changed, why }: !ok means "cannot prove what tree this is", and a gate that cannot prove
 * that must NOT read as fresh.
 */
export function treeHashOf(repo = REPO) {
  const git = (args, input) => spawnSync('git', ['-C', repo, ...args], { input, timeout: 120000, maxBuffer: 256 * 1024 * 1024 })
  const headRun = git(['rev-parse', 'HEAD'])
  if (headRun.status !== 0) return { ok: false, head: null, hash: null, changed: 0, why: 'git rev-parse HEAD failed in ' + repo }
  const head = String(headRun.stdout || '').trim()
  const st = git(['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  if (st.status !== 0) return { ok: false, head, hash: null, changed: 0, why: 'git status --porcelain failed in ' + repo }
  // NUL-separated entries: "XY <path>" plus, for renames/copies, the original path as the following token.
  const tokens = String(st.stdout || '').split('\u0000')
  const entries = []
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (!token) continue
    const xy = token.slice(0, 2)
    const path = token.slice(3)
    if (!path) continue
    entries.push({ xy, path })
    if (xy[0] === 'R' || xy[0] === 'C') i += 1 // the next token is the ORIGINAL path; the new path is what we hash
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const present = entries.filter((e) => e.xy !== 'D ' && e.xy !== ' D' && existsSync(join(repo, e.path)))
  let blobIds = []
  if (present.length) {
    const listing = present.map((e) => e.path).join('\n') + '\n'
    const obj = git(['hash-object', '--stdin-paths'], listing)
    if (obj.status !== 0) return { ok: false, head, hash: null, changed: entries.length, why: 'git hash-object --stdin-paths failed in ' + repo }
    blobIds = String(obj.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean)
    if (blobIds.length !== present.length) return { ok: false, head, hash: null, changed: entries.length, why: 'git hash-object returned ' + blobIds.length + ' id(s) for ' + present.length + ' path(s)' }
  }
  const byPath = new Map()
  present.forEach((e, i) => byPath.set(e.path, blobIds[i]))
  const digest = createHash('sha256')
  digest.update('head ' + head + '\n')
  for (const e of entries) digest.update(e.xy + ' ' + e.path + ' ' + (byPath.get(e.path) || '<deleted>') + '\n')
  return { ok: true, head, hash: 'sha256:' + digest.digest('hex'), changed: entries.length, why: null }
}

// ── R1: the corpus the report measured, re-read by the gate ───────────────────────────────────────────────────────
// Enumeration and digest are NOT implemented here: both live in scripts/sim/audit/corpus-files.mjs, the same module
// all.mjs uses. Two loops that "looked the same" were exactly the defect: all.mjs hashed `<base>/corpus-<s>` while this
// file scanned only CHILD directories of the sim root, so the gate re-hashed an older `--out` layer and refused a
// clean tree. The layer rule (the sim root itself is a layer, the newest receipts mtime wins, and the report says
// why) and the digest (`scenario + ' ' + sha256(bytes)`, sorted inside the one implementation) now have one ruler.
export { corpusLayers, corpusDigestOf, manifestCorpusFiles, newestCorpusDir, resolveReportCorpus } from './corpus-files.mjs'

/** The audit id all.mjs derives: sha256(corpusId | tree hash). Public on purpose — it BINDS, it does not hide. */
export function deriveAuditId(corpusId, treeHash) {
  return 'aid-' + createHash('sha256').update(String(corpusId) + '|' + String(treeHash || '(no tree)')).digest('hex').slice(0, 32)
}

/**
 * R3: recompute the fidelity reading from the corpus on disk, the rich live corpus, the declaration ledger and the
 * baseline. Returns { ok, liveToolsWithFieldList, compared, gaps, gapList, why }. `ok:false` means the gate could not
 * measure -- never that the report was right.
 */
export function recomputeFidelity(files, opts = {}) {
  const rich = loadRich(opts.richPath || RICH_REAL, readFileSync)
  if (!rich.ok) return { ok: false, why: rich.why, liveToolsWithFieldList: null, compared: null, gaps: null, gapList: [] }
  const simFields = loadSimFields(files, readFileSync)
  const declaredRaw = JSON.parse(readFileSync(opts.declaredPath || join(REPO, 'scripts', 'sim', 'audit', 'fidelity-declared.json'), 'utf8'))
  const baselineRaw = JSON.parse(readFileSync(opts.baselinePath || join(REPO, 'docs', 'acceptance', 'fidelity-branch-baseline.json'), 'utf8'))
  const reading = measureFidelity({ rich, simFields, declared: withoutGlossary(declaredRaw), baseline: readBaseline(baselineRaw) })
  return { ok: true, why: null, liveToolsWithFieldList: reading.liveToolsWithFieldList, compared: reading.compared, gaps: reading.gaps, gapList: reading.gapList }
}

/** R5: a gap refusal must NAME the gaps (tool.field), not just count them. First ten, then the remainder as a count. */
export function gapRefusalMessage(gapList) {
  const named = gapList.slice(0, 10).map((g) => String(g.tool) + '.' + String(g.field))
  const rest = gapList.length - named.length
  return 'fidelity gaps = ' + gapList.length + ': ' + named.join(', ') + (rest > 0 ? ' (+' + rest + ' more)' : '')
}

const PROOF_CMD = /^node\s+(tests|scripts)\/[A-Za-z0-9._/-]+\.mjs$/

/**
 * R2: the ledger's `fixed` P0/P1 rows carry `proof:{cmd,expect}`. Shape alone is not proof — the red team's A5 attack
 * (a fixed P0 whose evidence is the sentence "see last round") stayed READY when only the shape was checked. So the
 * gate RUNS the command: `node <path under tests/ or scripts/>`, no shell, 120 s, exit code must equal `expect`.
 * Returns { ok, ran:[], missing:[], failed:[] }.
 */
export function runLedgerProofs(items, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs || 300000) // one proof runs the full gate suite (+red team) ~130 s; 120 s was a self-inflicted timeout
  // `root` exists so a test can point proofs at fixture scripts it just wrote. It does NOT loosen the command shape:
  // the cmd must still be `node tests|scripts/…mjs`, and the file must exist under the chosen root.
  const root = String(opts.root || REPO)
  const missing = []
  const failed = []
  const ran = []
  for (const it of items || []) {
    const status = String((it && it.status) || '')
    const severity = String((it && it.severity) || '')
    if (status !== 'fixed' || !(severity === 'P0' || severity === 'P1')) continue
    const id = String((it && it.id) || '(no id)')
    const proof = it && it.proof
    const cmd = proof && typeof proof.cmd === 'string' ? proof.cmd.trim() : ''
    const expect = proof && Number.isInteger(proof.expect) ? proof.expect : null
    if (!cmd || expect === null) { missing.push({ id, why: 'fixed ' + severity + ' has no proof:{cmd,expect} — a closed item without a runnable proof is a sentence, not evidence' }); continue }
    if (!PROOF_CMD.test(cmd)) { missing.push({ id, why: 'proof.cmd must be `node <tests|scripts>/…mjs`, got ' + JSON.stringify(cmd) + ' (no shell, no arbitrary binaries)' }); continue }
    const rel = cmd.replace(/^node\s+/, '')
    const abs = join(root, rel)
    if (!existsSync(abs)) { missing.push({ id, why: 'proof.cmd points at a missing file: ' + rel }); continue }
    let code = null
    try {
      execFileSync(process.execPath, [abs], { cwd: root, timeout: timeoutMs, stdio: 'ignore' })
      code = 0
    } catch (e) {
      code = typeof e.status === 'number' ? e.status : null
      if (e.killed || e.signal) code = 'timeout/signal'
    }
    ran.push({ id, cmd, expect, actual: code })
    if (code !== expect) failed.push({ id, cmd, expect, actual: code })
  }
  return { ok: missing.length === 0 && failed.length === 0, ran, missing, failed }
}

/** R6: an override reason must say something a person could act on: >=24 non-space chars, and not yesterday's. */
export function validateOverride(reason, previousReason) {
  const text = String(reason === null || reason === undefined ? '' : reason).trim()
  if (!text) return { ok: false, why: 'no reason given' }
  if (text.replace(/\s+/g, '').length < 24) return { ok: false, why: 'the reason is ' + text.replace(/\s+/g, '').length + ' non-space character(s); at least 24 are required because a bypass must say what is known and why it is acceptable now' }
  if (previousReason && text === String(previousReason).trim()) return { ok: false, why: 'the reason is identical to the previous override; a copy-pasted reason documents nothing about THIS run' }
  return { ok: true, reason: text, why: null }
}

/** The last accepted override reason, so R6 can refuse a verbatim repeat. Lives under the sim root, never in the repo. */
export function readLastOverride(root = SIM_ROOT) {
  try { return JSON.parse(readFileSync(join(root, 'release-ready-last-override.json'), 'utf8')) } catch { return null }
}

/** The open-items ledger: { items: [...] } or a bare array. Validation is part of the verdict, not a footnote. */
export function readOpenItems(file = OPEN_ITEMS) {  if (!existsSync(file)) return { ok: false, why: 'missing open-items ledger: ' + file, items: [] }
  let raw
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    return { ok: false, why: 'open-items ledger is not JSON: ' + e.message, items: [] }
  }
  const items = Array.isArray(raw) ? raw : Array.isArray(raw && raw.items) ? raw.items : null
  if (!items) return { ok: false, why: 'open-items ledger has no `items` array', items: [] }
  const allowedStatus = ['open', 'fixed', 'taskbook', 'accepted', 'not-a-defect']
  const allowedSeverity = ['P0', 'P1', 'P2']
  const bad = []
  for (const it of items) {
    const id = it && it.id ? String(it.id) : '(no id)'
    if (!it || typeof it !== 'object') { bad.push(id + ': not an object'); continue }
    if (!allowedSeverity.includes(String(it.severity))) bad.push(id + ': severity must be one of ' + allowedSeverity.join('/'))
    if (!allowedStatus.includes(String(it.status))) bad.push(id + ': status must be one of ' + allowedStatus.join('/'))
    if (!String(it.title || '').trim()) bad.push(id + ': no title')
    if (!String(it.owner || '').trim()) bad.push(id + ': no owner (an item nobody owns cannot be closed)')
    if (String(it.status) === 'open' && !String(it.condition || '').trim()) bad.push(id + ': an OPEN item must name its condition (what would close it)')
  }
  return { ok: true, items, bad, updatedAt: raw && raw.updatedAt ? raw.updatedAt : null }
}

/** Run TB-2605's gate right now. A test suite can point this at a fixture script, which is how the red cases of
 *  tests/release-ready.test.mjs are produced without waiting on the real 70 s gate. */
export function runSimGate(script = GATE_SCRIPT, timeoutMs = 180000) {
  if (!existsSync(script)) return { ran: false, exitCode: null, wallMs: 0, error: 'gate script missing: ' + script }
  const started = Date.now()
  const r = spawnSync(process.execPath, [script], { cwd: REPO, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  const wallMs = Date.now() - started
  if (r.error && r.error.code === 'ETIMEDOUT') return { ran: false, exitCode: null, wallMs, error: 'gate timed out after ' + timeoutMs + ' ms' }
  return {
    ran: true,
    exitCode: typeof r.status === 'number' ? r.status : null,
    wallMs,
    tail: String(r.stdout || '').trim().split('\n').slice(-3).join(' | '),
    error: r.status === null ? 'gate process did not report an exit code' : null,
  }
}

// ── the verdict ──────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Who is on the hook for each refusal, and what would make it green. A NOT READY that only says WHAT is missing
 * leaves the reader to guess whom to wait for -- on this tree the usual answer is "the lanes still editing", and
 * without that line the gate reads as a machine that hates everyone equally. The pair is output contract, not
 * decoration: it does not widen any check, it only makes "who owes this" readable.
 */
const REMEDY = {
  SIM_GATE_NOT_RUN: { owner: 'sim-lane (gate owner), or whoever passed --no-gate', readyIf: 'run `node tests/sim-gate.test.mjs` to green: a remembered green is not a gate' },
  SIM_GATE_FAILED: { owner: 'sim-lane (tests/sim-gate.test.mjs) unless the failing segment names another lane', readyIf: 'the failing segment exits 0 with advisory 0 and mechanism 0; if the drift check fired, find what got slower before touching a cap' },
  AUDIT_UNVERIFIABLE: { owner: 'sim-lane (scripts/sim/audit/all.mjs must stamp the report)', readyIf: 'AUDIT.md carries a parseable ```json audit-report block naming tool=scripts/sim/audit/all.mjs, an audit id and the tree hash: a report nobody can attribute is not evidence' },
  AUDIT_TREE_UNMEASURED: { owner: 'sim-lane (treeHashOf must be able to run git in this checkout)', readyIf: 'git rev-parse / status / hash-object succeed, so the report can be bound to the tree' },
  AUDIT_TREE_CHANGED: { owner: 'the lanes that edited code after the audit ran', readyIf: 'the audit is re-run on the current tree: report tree hash and recomputed tree hash are equal (same dirty PATH set is not enough -- the content must match)' },
  AUDIT_FIDELITY_MEASURED_NOTHING: { owner: 'run-lane (scripts/sim/harvest/real.mjs) unless liveToolsWithFieldList is really 0', readyIf: 'the fidelity section compared at least one live tool: "compared 0; gaps 0" means nothing was measured, not that nothing is wrong' },
  AUDIT_FIDELITY_COUNTS_INCONSISTENT: { owner: 'sim-lane (scripts/sim/audit/all.mjs fidelity section)', readyIf: 'compared === liveToolsWithFieldList: every live tool with a field list was actually compared' },
  AUDIT_P0_UNLEDGERED: { owner: 'sim-lane (docs/acceptance/sim-audit-open-items.json)', readyIf: 'every P0 the report names has a ledger row (owner + condition): an audit finding nobody tracks is how "open P0 = 0" becomes an empty claim' },
  AUDIT_MISSING: { owner: 'sim-lane (scripts/sim/audit/all.mjs)', readyIf: '`node scripts/sim/audit/all.mjs --out <dir>` produced an AUDIT.md for this tree' },
  AUDIT_STALE: { owner: 'whoever last committed: an audit of old code proves nothing', readyIf: 'AUDIT.md is newer than the HEAD commit time' },
  AUDIT_DRIFT_UNMEASURED: { owner: 'sim-lane (worktreeDriftMs must be able to run git in this checkout)', readyIf: 'git diff / git ls-files succeed, so the audit can be compared with the working tree' },
  AUDIT_PREDATES_WORKTREE: { owner: 'the lanes that still hold uncommitted edits under vibe-math-vmu/, scripts/ or tests/', readyIf: 'no code edit is newer than AUDIT.md: the tree goes quiet and the audit is re-run once after the last edit' },
  AUDIT_FAILED: { owner: 'the section the audit names (A1-A5 = sim-lane; rules/actions = prompt-lane; fidelity = compare lane)', readyIf: 'that section reports no failure, and the audit is re-run after the fix' },
  AUDIT_INCOMPLETE: { owner: 'sim-lane (all.mjs writes the five sections)', readyIf: 'AUDIT.md carries all five section headers' },
  AUDIT_FIDELITY_UNMEASURED: { owner: 'run-lane (scripts/sim/harvest/real.mjs)', readyIf: 'D:/_tmp/sim/real-fieldset.json exists, so the fidelity section can compare field lists' }, // PORTABLE-ALLOW: in refusal text (readyIf), not an execution path
  AUDIT_FIDELITY_GAPS: { owner: 'whoever owns the tool face the gap names (coverage debt is a scenario task; only a measured-unreachable field may be declared)', readyIf: 'a scenario drives that path and the field appears in sim receipts; a genuinely unreachable field goes into the open-items ledger with owner + condition, never into fidelity-declared.json as a guess' },
  OPEN_ITEMS_INVALID: { owner: 'sim-lane (docs/acceptance/sim-audit-open-items.json)', readyIf: 'every item has severity/status/title/owner and every open item names a condition' },
  OPEN_P0: { owner: 'the owner named on each OPEN P0 (see the ledger)', readyIf: 'each P0 is fixed with evidence, or re-graded with a written reason: never deleted to go green' },
  OPEN_NO_OWNER: { owner: 'sim-lane (the ledger)', readyIf: 'every open item names an owner' },
  AUDIT_CORPUS_UNMEASURED: { owner: 'sim-lane (the audit run that wrote the corpus)', readyIf: 'the corpus-*/receipts.jsonl files the report names still exist under the sim root, so the gate can re-hash them' },
  AUDIT_CORPUS_STALE: { owner: 'whoever re-ran the simulator after the audit', readyIf: 'the report and the receipts on disk agree: same corpus id, and a generatedAt no earlier than the newest receipt' },
  AUDIT_ID_MISMATCH: { owner: 'sim-lane (scripts/sim/audit/all.mjs must derive the id, not mint one)', readyIf: 'auditId === sha256(corpusId|treeHash) recomputed by the gate, so the stamp is a binding and not a label' },
  AUDIT_CHECKS_ABSENT: { owner: 'sim-lane (the audit-report block)', readyIf: 'the block carries checks{verdict,failures} that the gate can compare with the prose' },
  AUDIT_VERDICT_CONTRADICTION: { owner: 'sim-lane (the report writer)', readyIf: 'prose verdict and machine verdict say the same thing; a report that argues with itself is unread, not clean' },
  AUDIT_FIDELITY_RECOMPUTE_UNMEASURED: { owner: 'run-lane (the rich live corpus) or sim-lane (the receipts)', readyIf: 'the gate can load real-fields.jsonl plus the corpus and recompute compared/gaps itself' },
  AUDIT_FIDELITY_MISMATCH: { owner: 'sim-lane (scripts/sim/audit/all.mjs fidelity section vs the shared ruler)', readyIf: 'the recomputed compared/gaps equal the stamped ones; the message names the differing tool.field paths' },
  AUDIT_EVIDENCE_MISSING: { owner: 'the owner of each fixed-but-unproven ledger row', readyIf: 'every fixed P0/P1 row carries proof:{cmd,expect} naming a node script under tests/ or scripts/' },
  AUDIT_EVIDENCE_FAILED: { owner: 'the owner of the ledger row whose proof failed', readyIf: 'running the proof command reproduces the recorded exit code; a claim that does not reproduce is not evidence' },
  OVERRIDE_REASON_INVALID: { owner: 'whoever passed -OverrideReleaseGate', readyIf: 'the reason names what is known and why it is acceptable now (>=24 non-space characters, not a verbatim repeat of the previous override)' },
}

/**
 * assess(facts) -> { ready, reasons: [{code, message, owner, wouldBeReadyIf}], checks }. Pure: every input is a
 * measured fact, so the same function answers for the real repo and for a fixture in a test. `reasons` is the whole
 * output contract: NOT READY without a reason would be the same "trust me" the gate exists to replace.
 */
export function assess(facts) {
  const reasons = []
  const checks = []
  const add = (code, message, ok, extra) => {
    checks.push({ code, ok })
    if (ok) return
    const remedy = REMEDY[code] || {}
    const owner = String((extra && extra.owner) || remedy.owner || 'unassigned')
    const readyIf = String((extra && extra.readyIf) || remedy.readyIf || 'the condition this check measures becomes true')
    reasons.push({ code, message, owner, wouldBeReadyIf: readyIf })
  }

  const gate = facts.gate || { ran: false, exerror: 'not run' }
  if (!gate.ran) {
    add('SIM_GATE_NOT_RUN', 'sim gate was not run: ' + (gate.error || 'the caller asked to skip it') + ' — a release gate that trusts a remembered green is not a gate', false)
  } else {
    add('SIM_GATE_FAILED', 'sim gate exited ' + gate.exitCode + ' after ' + gate.wallMs + ' ms' + (gate.tail ? ' [' + gate.tail + ']' : ''), gate.exitCode === 0)
  }

  let auditManifest = null
  const audit = facts.audit
  if (!audit || !audit.path) {
    add('AUDIT_MISSING', 'no AUDIT.md under ' + (facts.root || SIM_ROOT) + ' — the sim corpus has not been audited', false)
  } else {
    add('AUDIT_STALE', 'audit report ' + audit.path + ' is older than HEAD (' + (facts.head && facts.head.iso ? facts.head.iso : 'unknown commit time') + '): an audit of old code proves nothing about this tree', Boolean(facts.head && audit.mtimeMs > facts.head.commitMs))
    const drift = facts.drift || { ok: false, why: 'working-tree drift not measured', changed: [] }
    add('AUDIT_DRIFT_UNMEASURED', 'cannot prove the audit covers the working tree: ' + (drift.why || 'unknown'), Boolean(drift.ok))
    const driftPaths = Array.isArray(drift.changed) ? drift.changed.length : 0
    // Only a MEASURED edit newer than the report convicts. An unmeasured drift is a separate reason above, never a pass.
    const driftNewer = drift.ok && driftPaths > 0 && drift.newestMs !== null && !(audit.mtimeMs >= drift.newestMs)
    add('AUDIT_PREDATES_WORKTREE', 'audit report ' + audit.path + ' predates ' + driftPaths + ' uncommitted change(s); newest edit: ' + String(drift.newestPath || '(unknown)') + ' — the audit did not read the code a real run would load', !driftNewer)
    const rep = audit.report || {}
    // P0-2: a verdict line and five headings are typable in twelve lines, so prose cannot prove where a report came
    // from. The provenance is the machine-readable block all.mjs appends: tool name, audit id and the tree hash it ran
    // against. No block => AUDIT_UNVERIFIABLE, and a hand-typed PASS is never read as clean.
    const man = rep.manifest && typeof rep.manifest === 'object' ? rep.manifest : null
    const claimedTool = man && typeof man.tool === 'string' ? man.tool : '(none)'
    const auditId = man && typeof man.auditId === 'string' ? man.auditId : ''
    const claimedTree = man && man.tree && typeof man.tree.hash === 'string' ? String(man.tree.hash) : ''
    const claimsOrigin = Boolean(man && claimedTool === 'scripts/sim/audit/all.mjs' && auditId.length >= 8 && /^sha256:[0-9a-f]{16,}$/.test(claimedTree))
    add('AUDIT_UNVERIFIABLE', 'audit report ' + audit.path + ' cannot prove it came from all.mjs: ' + String(rep.manifestError || 'report names tool=' + claimedTool + ' with audit id ' + (auditId ? JSON.stringify(auditId) : '(missing)') + (claimedTree ? '' : ' and no tree hash')) + ' — a hand-typed verdict is not evidence', claimsOrigin)
    const tree = facts.treeHash || { ok: false, why: 'working-tree hash not measured' }
    add('AUDIT_TREE_UNMEASURED', 'cannot recompute the tree hash, so the report cannot be bound to this tree: ' + String(tree.why || 'unknown'), Boolean(tree.ok && tree.hash))
    const headMoved = Boolean(tree.head && man && man.tree && man.tree.head && man.tree.head !== tree.head)
    // Content equality alone would let a report travel across a HEAD move; the digest is only meaningful together
    // with the commit it was taken at, so both must agree.
    const sameTree = Boolean(claimsOrigin && tree.ok && claimedTree === tree.hash && !headMoved)
    add('AUDIT_TREE_CHANGED', 'audit report claims tree ' + (claimsOrigin ? claimedTree : '(unproven)') + ' but this tree hashes to ' + String(tree.hash || '(unmeasured)') + (headMoved ? ' (HEAD moved ' + String(man.tree.head).slice(0, 8) + ' -> ' + String(tree.head).slice(0, 8) + ')' : '') + ' — the audit did not read the code a real run would load', sameTree)
    add('AUDIT_FAILED', 'audit report says ' + String(rep.verdict) + ' (' + String(rep.failures) + ' failure(s)); the five sections must be green', rep.verdict === 'PASS' && rep.failures === 0)
    add('AUDIT_INCOMPLETE', 'audit report is missing section(s): ' + (rep.missingSections || []).join(', '), Boolean(rep.missingSections) && rep.missingSections.length === 0)
    // Two numbers, two questions: `compared` counts what was measured, `gaps` counts what differed. "compared 0;
    // gaps 0" means NOTHING was measured, so it can never be read as clean (P0-2 defect 2).
    const fidelity = man && man.fidelity && typeof man.fidelity === 'object' ? man.fidelity : null
    const liveTools = Number(fidelity && fidelity.liveToolsWithFieldList)
    const compared = Number(fidelity && fidelity.compared)
    const gaps = Number(fidelity && fidelity.gaps)
    const measured = Boolean(fidelity) && Number.isFinite(liveTools) && Number.isFinite(compared) && Number.isFinite(gaps)
    // R3: recompute the fidelity reading from the same corpus with the same module. A report that says "gaps: 0" is a
    // claim; the recomputation is the check. R5: when it fails, name the gaps, not just the count.
    const recomputed = facts.fidelityRecomputed || { ok: false, why: 'the gate did not recompute the fidelity reading', compared: null, gaps: null, liveToolsWithFieldList: null, gapList: [] }
    add('AUDIT_FIDELITY_UNMEASURED', 'audit report has no fidelity counts in its audit-report block: run `node scripts/sim/audit/all.mjs --out <dir>` with D:/_tmp/sim/real-fieldset.json present', measured) // PORTABLE-ALLOW: in refusal text, not an execution path
    add('AUDIT_FIDELITY_MEASURED_NOTHING', 'fidelity section compared ' + String(compared) + ' live tool(s): "compared 0; gaps 0" means nothing was measured, not that nothing is wrong', measured && compared > 0)
    add('AUDIT_FIDELITY_COUNTS_INCONSISTENT', 'fidelity compared ' + String(compared) + ' of ' + String(liveTools) + ' live tool(s) with a field list: every tool must be compared for the section to mean anything', measured && compared === liveTools)
    const claimedGapNames = Array.isArray(fidelity && fidelity.gapList) ? fidelity.gapList.map((x) => String(x)) : []
    const gapsAreNamed = Number.isFinite(gaps) && gaps > 0 && claimedGapNames.length === gaps
    // A count is not actionable. When the block claims gaps it must NAME them (fidelity.gapList); when it does not, the
    // refusal names the missing field instead -- an unnamed gap is one nobody can be assigned.
    const gapDetail = gaps > 0
      ? (gapsAreNamed
          ? ' — ' + claimedGapNames.slice(0, 10).join(', ') + (claimedGapNames.length > 10 ? ' (+' + (claimedGapNames.length - 10) + ' more)' : '')
          : ' — the block names ' + String(claimedGapNames.length) + ' of them, so fidelity.gapList is missing or short: an unnamed gap cannot be assigned')
      : ''
    add('AUDIT_FIDELITY_GAPS', 'fidelity gaps = ' + String(gaps) + ': live receipts carry fields the simulator never produces' + gapDetail, measured && gaps === 0)
    // R1: the corpus is the thing the report measured. `resolveReportCorpus` is the ONE ruler shared with all.mjs: it
    // picks the layer, re-reads the files the report NAMES, and keeps three failures apart that used to collapse into
    // one number -- a file that is gone, a file whose bytes changed, and a corpus dir that appeared AFTER the report ran.
    const corpus = facts.corpus || { ok: false, why: 'the gate did not re-read the corpus', files: [], corpusId: null, newestMs: null, missing: [], mismatched: [], extras: [] }
    add('AUDIT_CORPUS_UNMEASURED', 'cannot re-read the corpus the report measured: ' + String(corpus.why || 'unknown') + ' — a report about receipts nobody has is a report about nothing', Boolean(corpus.ok))
    const manCorpus = man && man.corpus && typeof man.corpus === 'object' ? man.corpus : null
    const claimedCorpusId = manCorpus && typeof manCorpus.corpusId === 'string' ? manCorpus.corpusId : ''
    const layerNotes = [
      (corpus.missing || []).length ? 'missing from the layer: ' + corpus.missing.map((m) => m.scenario).slice(0, 5).join(', ') : '',
      (corpus.mismatched || []).length ? 'changed after the report was written: ' + corpus.mismatched.map((m) => m.scenario).slice(0, 5).join(', ') : '',
      (corpus.extras || []).length ? 'corpus dirs that appeared after the report was written: ' + corpus.extras.map((m) => m.scenario).slice(0, 5).join(', ') : '',
    ].filter(Boolean).join('; ')
    const corpusMatches = Boolean(corpus.ok && claimsOrigin && claimedCorpusId && claimedCorpusId === corpus.corpusId && !layerNotes)
    const generatedMs = man && typeof man.generatedAt === 'string' ? Date.parse(man.generatedAt) : NaN
    // A stamp older than the receipts it claims to have measured is a report from an earlier corpus wearing the new
    // corpus id: the id only binds if the writing time and the files agree about WHEN.
    const generatedFresh = corpus.ok && Number.isFinite(generatedMs) && corpus.newestMs !== null && generatedMs + 1000 >= corpus.newestMs
    add('AUDIT_CORPUS_STALE', 'audit report claims corpus ' + (claimedCorpusId ? claimedCorpusId.slice(0, 20) : '(missing)') + ' but the layer ' + String(corpus.dir || '(none)') + ' hashes to ' + String(corpus.corpusId || '(unread)').slice(0, 20) + (layerNotes ? ' [' + layerNotes + ']' : '') + (generatedFresh ? '' : '; and its generatedAt ' + String(man && man.generatedAt) + ' predates the newest receipt — the report measured a corpus that is no longer this one'), corpusMatches && generatedFresh)
    // R1b: the audit id is DERIVED from (corpus id, tree hash). If the gate recomputes a different id, the report's
    // stamp was not produced by the formula it claims -- either hand-edited or copied from another run.
    const derivedId = claimsOrigin && claimedCorpusId ? deriveAuditId(claimedCorpusId, claimedTree) : null
    add('AUDIT_ID_MISMATCH', 'audit id ' + JSON.stringify(auditId) + ' is not sha256(corpusId|treeHash) of the inputs it names (derived: ' + JSON.stringify(derivedId) + ') — a stamp that cannot be recomputed is decoration', Boolean(derivedId && auditId === derivedId))
    // R4: a verdict is TRUE only if the prose and the machine block say the same thing, and both say PASS with zero
    // findings. A contradiction (prose PASS, block FAIL) is worse than a FAIL: it means one of the two is unread.
    const checksBlock = man && man.checks && typeof man.checks === 'object' ? man.checks : null
    add('AUDIT_CHECKS_ABSENT', 'audit-report block carries no checks{verdict,failures}: a report without a machine verdict cannot be compared with its own prose', Boolean(checksBlock && typeof checksBlock.verdict === 'string' && Number.isFinite(Number(checksBlock.failures))))
    const prosePass = rep.verdict === 'PASS' && rep.failures === 0
    const blockPass = Boolean(checksBlock && checksBlock.verdict === 'PASS' && Number(checksBlock.failures) === 0)
    add('AUDIT_VERDICT_CONTRADICTION', 'the report verdicts disagree: prose says ' + String(rep.verdict) + '/' + String(rep.failures) + ' failure(s), the audit-report block says ' + String(checksBlock && checksBlock.verdict) + '/' + String(checksBlock && checksBlock.failures) + ' — one of the two is not being read', prosePass === blockPass)
    add('AUDIT_FIDELITY_RECOMPUTE_UNMEASURED', 'cannot recompute the fidelity reading from the corpus on disk: ' + String(recomputed.why || 'unknown') + ' — an unverifiable claim of "gaps 0" is not a measurement', Boolean(recomputed.ok))
    const fidAgrees = Boolean(recomputed.ok && measured && Number(recomputed.gaps) === gaps && Number(recomputed.compared) === compared && Number(recomputed.liveToolsWithFieldList) === liveTools)
    add('AUDIT_FIDELITY_MISMATCH', 'the report claims ' + String(compared) + ' compared / ' + String(gaps) + ' gap(s); recomputing from the receipts gives ' + String(recomputed.compared) + ' compared / ' + String(recomputed.gaps) + ' gap(s)' + (recomputed.ok && recomputed.gapList.length ? ' — ' + gapRefusalMessage(recomputed.gapList) : ''), fidAgrees)
    auditManifest = man
  }

  const items = facts.openItems || { ok: false, why: 'open-items ledger not read', items: [] }
  add('OPEN_ITEMS_INVALID', 'open-items ledger is unusable: ' + (items.why || (items.bad || []).join('; ')), Boolean(items.ok) && (!items.bad || items.bad.length === 0))
  const openP0 = (items.items || []).filter((it) => String(it.severity) === 'P0' && String(it.status) === 'open')
  add('OPEN_P0', 'open P0 item(s): ' + openP0.map((it) => it.id + ' (' + it.title + ')').join('; '), openP0.length === 0,
    { owner: openP0.map((it) => String(it.id) + ' -> ' + String(it.owner || '(no owner)')).join('; ') })
  const openMissingOwner = (items.items || []).filter((it) => String(it.status) === 'open' && !String(it.owner || '').trim())
  add('OPEN_NO_OWNER', 'open item(s) with no owner: ' + openMissingOwner.map((it) => it.id).join('; '), openMissingOwner.length === 0)
  // O-2: "no open P0 in the ledger" is vacuous while nothing forces the report's own P0s into the ledger. Every P0 the
  // report names must have a row (by id or by title), so a finding cannot live only in a prose paragraph.
  const reportP0 = (auditManifest && Array.isArray(auditManifest.p0)) ? auditManifest.p0 : []
  const ledgerRows = items.items || []
  const ledgerIds = new Set(ledgerRows.map((it) => String(it && it.id)))
  const ledgerTitles = new Set(ledgerRows.map((it) => String((it && it.title) || '').trim().toLowerCase()).filter(Boolean))
  const unledgered = reportP0.filter((p) => {
    const id = String((p && p.id) || '')
    const title = String((p && p.title) || '').trim().toLowerCase()
    return !(id && ledgerIds.has(id)) && !(title && ledgerTitles.has(title))
  })
  add('AUDIT_P0_UNLEDGERED', 'audit report names P0 finding(s) with no ledger row: ' + (unledgered.length ? unledgered.map((p) => String((p && p.id) || (p && p.title) || '(unnamed)')).join('; ') : '(none)') + ' — an untracked P0 is how "open P0 = 0" stays empty', unledgered.length === 0, { owner: (unledgered.map((p) => String((p && p.owner) || 'unassigned')).join('; ') || 'sim-lane (the ledger)') })

  // R2: a `fixed` P0/P1 is a claim that something was fixed. The gate RUNS the ledger's proof command, because a
  // sentence like "see last round" is exactly the evidence a leaked bypass looks like when it is typed into a ledger.
  const proofs = facts.ledgerProofs || { ok: false, ran: [], missing: [{ id: '(ledger)', why: 'the gate did not run the ledger proofs' }], failed: [] }
  const fixedClosed = (items.items || []).filter((it) => String(it.status) === 'fixed' && (String(it.severity) === 'P0' || String(it.severity) === 'P1'))
  add('AUDIT_EVIDENCE_MISSING', fixedClosed.length === 0 ? 'no fixed P0/P1 rows to prove' : 'fixed P0/P1 row(s) without a runnable proof: ' + (proofs.missing || []).map((m) => m.id + ' (' + m.why + ')').join('; '), (proofs.missing || []).length === 0)
  add('AUDIT_EVIDENCE_FAILED', 'proof command(s) did not exit as the ledger says: ' + (proofs.failed || []).map((f) => f.id + ' `' + f.cmd + '` expected ' + String(f.expect) + ' got ' + String(f.actual)).join('; '), (proofs.failed || []).length === 0)
  // R6: an override is a claim about THIS run. A reason that says nothing, or the same paragraph as last time, is a
  // rubber stamp; it is refused as a bypass too (the original reasons stay listed either way).
  const override = facts.override || null
  if (override) {
    add('OVERRIDE_REASON_INVALID', 'the override reason is not acceptable: ' + String((facts.overrideCheck && facts.overrideCheck.why) || 'unknown') + ' — a bypass is allowed to be chosen, not to be silent', Boolean(facts.overrideCheck && facts.overrideCheck.ok))
  }

  // An override is not a clean gate: the JSON keeps the original reasons next to {reason, at, by}, so a bypass is
  // documented as "knew it was red and let it through", never as "nothing was wrong".
  return { ready: reasons.length === 0, reasons, checks, override: facts.override || null, overrideRejected: Boolean(facts.overrideRejected), overrideCheck: facts.overrideCheck || null }
}

// ── CLI ─────────────────────────────────────────────────────────────────────────────────────────────────────────
function collectFacts() {
  const root = flagValue('--root', SIM_ROOT)
  const auditPath = flagValue('--audit', null)
  let audit = null
  const auditedAt = auditPath ? { path: auditPath, mtimeMs: existsSync(auditPath) ? statSync(auditPath).mtimeMs : NaN, size: existsSync(auditPath) ? statSync(auditPath).size : 0 } : newestAudit(root)
  if (auditedAt && Number.isFinite(auditedAt.mtimeMs)) {
    audit = { ...auditedAt, report: parseAuditReport(readFileSync(auditedAt.path, 'utf8')) }
  }
  const headIso = flagValue('--head-iso', null)
  const commitMs = headIso ? Date.parse(headIso) : headCommitMs()
  const head = { commitMs: Number.isFinite(commitMs) ? commitMs : null, iso: headIso || (commitMs ? new Date(commitMs).toISOString() : 'unknown') }
  const gate = hasFlag('--no-gate')
    ? { ran: false, exitCode: null, wallMs: 0, error: 'the caller passed --no-gate' }
    : runSimGate(flagValue('--gate-script', GATE_SCRIPT), Number(flagValue('--gate-timeout-ms', '180000')))
  const openItems = readOpenItems(flagValue('--open-items', OPEN_ITEMS))
  const drift = worktreeDriftMs(REPO)
  const treeHash = treeHashOf(REPO)
  // R1/R3: re-read the corpus the newest report measured and recompute the fidelity reading from it. Neither is
  // optional: "unmeasured" is a refusal, never a pass. The corpus object comes from resolveReportCorpus (one ruler,
  // shared with all.mjs): it names the layer it picked, the files it re-read, and the three ways the report can be
  // stale. Fidelity is recomputed from THOSE files -- the report's own list -- not from every foreign corpus that
  // happens to live in the same layer (those predate the audit and were never its measurement).
  const manifestForCorpus = audit && audit.report ? audit.report.manifest : null
  const corpus = resolveReportCorpus(root, manifestForCorpus)
  const corpusId = corpus.corpusId
  const corpusFilesForFidelity = corpus.files.length ? corpus.files : (corpus.layer && corpus.layer.files) || []
  const fidelityRecomputed = corpusFilesForFidelity.length ? recomputeFidelity(corpusFilesForFidelity, { declaredPath: flagValue('--declared', undefined), richPath: flagValue('--rich', undefined) }) : { ok: false, why: corpus.why || 'no corpus files to measure', compared: null, gaps: null, liveToolsWithFieldList: null, gapList: [] }
  // R2: run the ledger proofs unless a fixture test explicitly asks not to (the fixture scripts complete in ms).
  const ledgerProofs = hasFlag('--no-proofs')
    ? { ok: false, ran: [], missing: [{ id: '(ledger)', why: 'the caller passed --no-proofs' }], failed: [] }
    : runLedgerProofs(openItems.items || [], { timeoutMs: Number(flagValue('--proof-timeout-ms', '300000')), root: flagValue('--proof-root', REPO) })
  // The driver passes the override reason through, so the JSON a bypass produces says WHY it was let through while
  // still listing the reasons it overrode. R6 validates the reason before it counts as a bypass.
  const overrideReason = flagValue('--override-reason', null)
  const overrideCheck = overrideReason === null ? null : validateOverride(overrideReason, (readLastOverride(root) || {}).reason || null)
  const override = overrideReason !== null && overrideCheck && overrideCheck.ok
    ? { reason: String(overrideReason).trim(), at: new Date().toISOString(), by: flagValue('--override-by', String(process.env.USERNAME || process.env.USER || 'unknown')) }
    : null
  if (override) {
    try {
      if (!existsSync(root)) mkdirSync(root, { recursive: true })
      writeFileSync(join(root, 'release-ready-last-override.json'), JSON.stringify({ reason: override.reason, at: override.at, by: override.by }, null, 2))
    } catch { /* recording the bypass is best-effort; refusing it is not */ }
  }
  return { root, audit, head, gate, openItems, drift, treeHash, corpus: { ...corpus, corpusId }, fidelityRecomputed, ledgerProofs, override, overrideCheck, overrideRejected: overrideReason !== null && !(overrideCheck && overrideCheck.ok) }
}

// Only run when executed directly; importing this file (tests import assess/parseAuditReport) must have no side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const facts = collectFacts()
  const verdict = assess(facts)
  if (hasFlag('--json')) {
    console.log(JSON.stringify({ ...verdict, facts: { root: facts.root, audit: facts.audit && { path: facts.audit.path, mtimeMs: facts.audit.mtimeMs, report: facts.audit.report }, head: facts.head, gate: facts.gate, drift: facts.drift && { ok: facts.drift.ok, changed: (facts.drift.changed || []).length, newestMs: facts.drift.newestMs, newestPath: facts.drift.newestPath, why: facts.drift.why || null }, tree: facts.treeHash && { ok: facts.treeHash.ok, head: facts.treeHash.head, hash: facts.treeHash.hash, changed: facts.treeHash.changed, why: facts.treeHash.why || null }, corpus: facts.corpus && { ok: facts.corpus.ok, dir: facts.corpus.dir, files: (facts.corpus.files || []).length, corpusId: facts.corpus.corpusId, newestMs: facts.corpus.newestMs, why: facts.corpus.why || null }, fidelityRecomputed: facts.fidelityRecomputed && { ok: facts.fidelityRecomputed.ok, liveToolsWithFieldList: facts.fidelityRecomputed.liveToolsWithFieldList, compared: facts.fidelityRecomputed.compared, gaps: facts.fidelityRecomputed.gaps, why: facts.fidelityRecomputed.why || null }, ledgerProofs: facts.ledgerProofs && { ok: facts.ledgerProofs.ok, ran: (facts.ledgerProofs.ran || []).length, missing: facts.ledgerProofs.missing || [], failed: facts.ledgerProofs.failed || [] }, override: facts.override, overrideRejected: facts.overrideRejected || false, overrideCheck: facts.overrideCheck || null, openItems: { ok: facts.openItems.ok, why: facts.openItems.why || null, bad: facts.openItems.bad || [], count: (facts.openItems.items || []).length } } }, null, 2))
  } else if (verdict.ready) {
    console.log('READY: sim gate green, audit fresh and clean, no open P0 — a real run may start')
  } else {
    console.log('NOT READY: ' + verdict.reasons.length + ' reason(s)')
    for (const r of verdict.reasons) {
      console.log('- [' + r.code + '] ' + r.message)
      console.log('    owner: ' + r.owner)
      console.log('    would be ready if: ' + r.wouldBeReadyIf)
    }
    console.log('')
    if (verdict.overrideRejected) console.log('OVERRIDE REFUSED: ' + String(verdict.overrideCheck && verdict.overrideCheck.why) + ' — the bypass was not allowed (the reasons above still stand)')
    if (verdict.override) console.log('OVERRIDDEN at ' + verdict.override.at + ' by ' + verdict.override.by + ': ' + verdict.override.reason + ' — the reasons above were known and bypassed, not cleared')
    console.log('A real run spends tokens; fix the reasons above, or (last resort) pass -OverrideReleaseGate "<reason>"')
    console.log('to the live driver, which records the reason next to the run it let through.')
  }
  // R7: the verdict must BE the exit code, not just prose. 7 mirrors the live driver (slv-p14-cc.ps1 exit 7 for NOT READY).
  process.exit(verdict.ready ? 0 : 7)
}
