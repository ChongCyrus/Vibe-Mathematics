// scripts/sim/redteam/run.mjs — the red team, in the repo.
//
// WHAT THIS IS: the 23 attacks from the 2026-11-09 red team session (their write-up lived in a scratch directory that
// expressed as data files + a runner that rebuilds each attack, spawns the release gate against it, and judges the
// gate's ANSWER: which code it refused with, what its message names, and whether the refusal is about the thing the
// attack did. "It refused" is not a pass -- a refusal for the wrong reason (masked) is worse than a leak, because a
// leaked bypass is at least honest about itself. "It did not refuse and the forgery is truly indistinguishable"
// is recorded as NEUTRALIZED with the evidence, never counted as a win.
//
// WHY IT IS IN THE REPO (TB-2689): the 2026-11-10 evidence audit found the gate's own closure evidence (the 23-vector
// matrix) living only in that scratch directory, which a 3-hour cleanup deletes. A conclusion whose evidence
// reproduces only outside the repo is rehearsed, not proven. This file has NO out-of-repo dependency: the corpus it
// attacks is committed under data/ (frozen real receipts from run 2026-11-09T18-19-38-756Z-6116), and every temp dir comes from
// os.tmpdir() and is removed in a `finally`.
//
// USAGE
//   node scripts/sim/redteam/run.mjs                 # all 23 vectors, exit 0 iff masked/half/leaked/wrong-code == 0
//   node scripts/sim/redteam/run.mjs --only=A11,A16  # a subset (the roster is still validated)
//   node scripts/sim/redteam/run.mjs --json          # machine-readable payload on stdout
//   node scripts/sim/redteam/run.mjs --keep          # keep the built tree and print its path (debugging)
//   node scripts/sim/redteam/run.mjs --verbose       # also print every reason code and its message per vector
//
// THE JUDGEMENT (judge === "code", the default):
//   READY                          -> leaked   (the forgery passed the gate)
//   primaryReason not among codes  -> masked   (refused, but not because of this attack)
//   exit !== expectExit            -> half     (the right code, the wrong contract)
//   any expectCodesAbsent present  -> masked   (two answers to two questions collapsed)
//   expectMessagePattern missing   -> half     (refused by name, but the name is not in the message)
//   duplicateDigestIn(messages)    -> half     (a digest sentence printed next to itself; reads as evidence, proves nothing)
//   expectFields mismatch          -> half     (a recorded fact the attack changes is not recorded correctly)
//   otherwise                               named
// judge === "field": READY -> leaked; expectFields all equal -> named, else leaked (the bypass was RECORDED, so the
// gate knew and said so -- that is the one shape where passing is the judgement being tested).
// judge === "neutralized": a forgeryDetectionCodes hit -> masked (the "neutralized" vector was actually caught, so the
// claim that it is undetectable is false); the claimed and recomputed fidelity triples must be EQUAL -> neutralized,
// else half.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { copyCorpus } from './corpus-copy.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(HERE, '..', '..', '..')
const GATE = path.join(REPO, 'scripts', 'sim', 'audit', 'release-ready.mjs')
const DATA = path.join(HERE, 'data')
const CORPUS = path.join(DATA, 'corpus')
const RICH = path.join(DATA, 'rich-fields.jsonl')
const DECLARED = path.join(DATA, 'fidelity-declared.json')
const STUB = path.join(DATA, 'stub-gate.mjs')
const NL = String.fromCharCode(10)
const FUTURE = new Date('2030-01-01T00:00:00Z')
const OLD = new Date('2026-11-01T00:00:00Z')

// The gate reads its rich-corpus default at import time; point it at the committed fixture corpus BEFORE importing it,
// so the harness recompute and the gate child process use the same ruler. The child gets the same value through env
// (see gateEnv()) plus --declared, because a fixture whose two rulers disagree measures nothing.
process.env.VMU_RICH_REAL = RICH

const argv = process.argv.slice(2)
const hasFlag = (name) => argv.some((a) => a === name)
const flagValue = (name, fallback = null) => {
  const hit = argv.find((a) => a === name || a.startsWith(name + '='))
  if (!hit) return fallback
  const at = hit.indexOf('=')
  return at < 0 ? '' : hit.slice(at + 1)
}

const die = (message) => {
  console.error('REDTEAM ERROR: ' + message)
  process.exit(2)
}

// ── fixture roster ────────────────────────────────────────────────────────────────────────────────────────────────
/** Load fixtures from a directory and validate the roster against fixtures/INDEX.json.
 *
 * The roster is a LIST, not a count derived from the directory: deleting a fixture file must be a named failure
 * ("MISSING FIXTURE A15"), not a smaller suite that still says all-green. Adding an undeclared file is the same
 * mistake in the other direction, and is refused too. */
function loadRoster(dir) {
  const indexPath = path.join(dir, 'INDEX.json')
  if (!fs.existsSync(indexPath)) die('fixture roster missing at ' + indexPath + ' — without it, a deleted fixture is a quieter suite, not a failure')
  let index
  try { index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) } catch (e) { die('fixture roster is not JSON: ' + e.message) }
  const ids = Array.isArray(index.fixtures) ? index.fixtures.map(String) : null
  if (!ids || !ids.length) die('fixture roster names no fixtures: ' + indexPath)
  const onDisk = fs.readdirSync(dir).filter((n) => /^A[0-9]+[A-Za-z]*\.json$/.test(n)).map((n) => n.slice(0, -5)).sort()
  const missing = ids.filter((id) => !onDisk.includes(id))
  const undeclared = onDisk.filter((id) => !ids.includes(id))
  if (missing.length || undeclared.length) {
    const parts = []
    if (missing.length) parts.push('MISSING FIXTURE ' + missing.join(', ') + ' (listed in fixtures/INDEX.json, file(s) not found)')
    if (undeclared.length) parts.push('UNDECLARED FIXTURE ' + undeclared.join(', ') + ' (file exists, not in fixtures/INDEX.json)')
    die(parts.join('; '))
  }
  const fixtures = ids.map((id) => {
    const file = path.join(dir, id + '.json')
    let fx
    try { fx = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { die('fixture ' + id + ' is not JSON: ' + e.message) }
    if (String(fx.id) !== id) die('fixture file ' + file + ' claims id ' + JSON.stringify(fx.id) + ', roster says ' + JSON.stringify(id))
    if (!fx.expects || typeof fx.expects !== 'object') die('fixture ' + id + ' has no expects object')
    return fx
  })
  const expectedVectors = Number(index.vectors)
  if (!Number.isInteger(expectedVectors) || expectedVectors <= 0) die('fixture roster does not declare vector count')
  return { fixtures, expectedVectors }
}

// ── the context: one frozen corpus, measured once ────────────────────────────────────────────────────────────────
const sha = (body) => 'sha256:' + createHash('sha256').update(body).digest('hex')

/** A local port of the gate's tree hash, used only when the gate's own export is unavailable (it never should be). */
function localTreeHash() {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' })
  if (head.status !== 0) return { ok: false, hash: null, head: null, changed: [], why: 'git rev-parse HEAD failed' }
  const headSha = String(head.stdout || '').trim()
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: REPO, encoding: 'utf8' })
  if (status.status !== 0) return { ok: false, hash: null, head: headSha, changed: [], why: 'git status --porcelain failed' }
  const changed = String(status.stdout || '').split(NL).map((l) => l.trim()).filter(Boolean).map((l) => l.slice(3).trim())
  const digest = createHash('sha256')
  digest.update(headSha + NL)
  for (const p of changed.slice().sort()) {
    const blob = spawnSync('git', ['hash-object', p], { cwd: REPO, encoding: 'utf8' })
    digest.update(p + ':' + String(blob.stdout || '(unreadable)').trim() + NL)
  }
  return { ok: true, hash: 'sha256:' + digest.digest('hex'), head: headSha, changed, why: null }
}

/** The tree as the GATE sees it right now (its own export, with a local port as the fallback). */
function treeNow(gate) {
  try {
    const got = gate.treeHashOf(REPO)
    if (got && got.ok) return got
  } catch { /* fall through to the local port */ }
  return localTreeHash()
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

/** The tree hash must be SAMPLED, not assumed: other lanes commit and edit this same checkout while the suite runs, and a
 * report stamped with a hash that was true two seconds ago is (correctly) refused as AUDIT_TREE_CHANGED. So wait until
 * two consecutive samples agree before stamping anything — and if it never settles, say so instead of pretending. */
function stableTree(gate, { tries = 8, gapMs = 1200 } = {}) {
  let prev = treeNow(gate)
  if (!prev.ok) return prev
  for (let i = 0; i < tries; i += 1) {
    sleep(gapMs)
    const next = treeNow(gate)
    if (!next.ok) return next
    if (next.hash === prev.hash && next.head === prev.head) return next
    prev = next
  }
  return { ...prev, ok: false, why: 'the working tree did not hold still for ' + tries + ' samples — another lane is committing or editing; refusing to stamp fixtures with a hash that is already stale' }
}

/** Build the one context every fixture shares: the frozen corpus, its digest, and what the gate's own ruler reads on it.
 * Nothing here is a guess: every number comes from the gate's exported functions, so a fixture that lies about the
 * reading is lying against the same ruler that will judge it. */
async function loadContext(gate, tmp) {
  const files = gate.corpusFilesIn(CORPUS)
  if (!files.length) die('committed fixture corpus is missing or empty: ' + CORPUS)
  const unreadable = files.filter((f) => f.sha256 === null)
  if (unreadable.length) die('committed fixture corpus has unreadable receipts: ' + unreadable.map((f) => f.scenario).join(', '))
  const corpusId = gate.corpusDigestOf(files)
  const fidelity = gate.recomputeFidelity(files, { richPath: RICH, declaredPath: DECLARED })
  if (!fidelity.ok) die('the committed fixture corpus cannot be scored by the gate ruler: ' + String(fidelity.why))
  const tree = stableTree(gate)
  if (!tree.ok) die('cannot bind fixtures to a tree: ' + String(tree.why))
  const root = path.join(tmp, 'ctx-root')
  fs.mkdirSync(root, { recursive: true })
  const generatedAt = new Date().toISOString()
  writePointer(root, CORPUS, corpusId, generatedAt)
  return {
    root,
    tree,
    corpus: {
      dir: CORPUS,
      corpusId,
      corpusFiles: files.map((f) => ({ scenario: f.scenario, path: f.receiptsPath, bytes: f.bytes, sha256: f.sha256 })),
    },
    fidelity: { liveToolsWithFieldList: fidelity.liveToolsWithFieldList, compared: fidelity.compared, gaps: fidelity.gaps },
    generatedAt,
  }
}

function writePointer(root, dir, corpusId, generatedAt) {
  const body = {
    dir,
    corpusId: corpusId || null,
    auditId: null,
    generatedAt: generatedAt || new Date().toISOString(),
    pid: process.pid,
    at: new Date().toISOString(),
    by: 'scripts/sim/redteam/run.mjs fixture',
  }
  fs.mkdirSync(root, { recursive: true })
  fs.writeFileSync(path.join(root, 'current-layer.json'), JSON.stringify(body, null, 2) + NL)
}

// ── report construction ──────────────────────────────────────────────────────────────────────────────────────────
const SECTIONS = [
  '## 1. scenarios',
  '## 2. receipt audit',
  '## 3. rule coverage',
  '## 4. action coverage',
  '## 5. fidelity vs live receipts',
]

/** The audit-report block. `over` replaces top-level keys; `fidelityOver` merges into the fidelity reading. */
function manifestOf(ctx, over = {}, fidelityOver = {}) {
  const man = {
    tool: 'scripts/sim/audit/all.mjs',
    auditId: undefined,
    generatedAt: ctx.generatedAt,
    tree: { head: ctx.tree.head, hash: ctx.tree.hash, changed: ctx.tree.changed },
    corpus: { ...ctx.corpus },
    fidelity: { ...ctx.fidelity },
    checks: { verdict: 'PASS', failures: 0, warnings: 0 },
    p0: [],
  }
  for (const [key, value] of Object.entries(over)) {
    if (key === 'corpus') man.corpus = { ...man.corpus, ...value }
    else if (key === 'fidelity') Object.assign(man.fidelity, value)
    else man[key] = value
  }
  Object.assign(man.fidelity, fidelityOver)
  if (!man.auditId) {
    // The id is DERIVED from (corpus id, tree hash), exactly as all.mjs derives it. A fixture that wants a different
    // id passes one in `over` (that is what A3/A4 attack); every other fixture must carry the honest derivation, or
    // it would be caught by AUDIT_ID_MISMATCH for a reason the vector is not testing.
    man.auditId = deriveAuditId(String(man.corpus.corpusId), String(man.tree.hash))
  }
  return man
}

function deriveAuditId(corpusId, treeHash) {
  return 'aid-' + createHash('sha256').update(String(corpusId) + '|' + String(treeHash || '(no tree)')).digest('hex').slice(0, 32)
}

function reportText({ verdict = 'PASS', failures = 0, warnings = 0, manifest = null, note = null, fidelity = null }) {
  const fid = fidelity || (manifest ? manifest.fidelity : null)
  const lines = ['AUDIT: ' + verdict + ' — ' + failures + ' failure(s), ' + warnings + ' warning(s)', '']
  if (note) lines.push(note, '')
  for (const heading of SECTIONS) lines.push(heading, '- (fixture: nothing measured here)', '')
  if (fid) lines.push('- live tools with a field list: ' + fid.liveToolsWithFieldList + '; compared: ' + fid.compared + '; gaps: ' + fid.gaps, '')
  if (manifest) lines.push('```json audit-report', JSON.stringify(manifest, null, 2), '```', '')
  return lines.join(NL)
}

/** Write a fixture's report. The mtime is pushed into the future on purpose: freshness against HEAD is a different
 * check (AUDIT_STALE) and is not what any of these vectors attacks -- a report from 2030 cannot be "older than HEAD",
 * so a vector that fails does so for its own reason and not because the tree moved while the fixtures were built. */
function writeReport(dir, text, ledger) {
  fs.mkdirSync(dir, { recursive: true })
  const audit = path.join(dir, 'AUDIT.md')
  fs.writeFileSync(audit, text)
  fs.utimesSync(audit, FUTURE, FUTURE)
  const ledgerPath = path.join(dir, 'open-items.json')
  fs.writeFileSync(ledgerPath, JSON.stringify({ updatedAt: new Date().toISOString(), items: ledger || [] }, null, 2) + NL)
  return { dir, audit, ledgerPath }
}

// ── corpus helpers for the fixtures that must own a layer ────────────────────────────────────────────────────────
// A REBUILD MUST START FROM NOTHING. When a vector is retried (the tree moved while the suite ran), building into the
// directory the previous attempt left behind silently keeps that attempt's mutations: A15's "extra corpus dir" then
// appears in the rebuilt report's own list, the gate correctly sees no difference, and the vector reads as a half-pass
// for a reason that has nothing to do with the gate. Clearing first makes a rebuild mean the same thing every time.
// The copy itself lives in ./corpus-copy.mjs because it must BACKDATE the receipts: fs.cpSync stamps a copy with NOW on
// POSIX, which would make the layer look newer than the report about to describe it and mask A3/A4/A16/A16b on CI.

function addExtraScenario(layer, scenario) {
  const dir = path.join(layer, 'corpus-' + scenario)
  fs.mkdirSync(dir, { recursive: true })
  const row = JSON.stringify({ tool: 'fixture-extra-tool', receipt: { note: 'a corpus dir born after the report', scenario } })
  fs.writeFileSync(path.join(dir, 'receipts.jsonl'), row + NL)
  return dir
}

function ageLayer(layer, when) {
  for (const name of fs.readdirSync(layer)) {
    const file = path.join(layer, name, 'receipts.jsonl')
    // Loud on purpose: a layer we just built must carry receipts in every corpus dir. Skipping a missing one would
    // age "nothing" and still report success (audit-no-silent-reads: a missing file is never an empty value).
    if (!fs.existsSync(file)) throw new Error('ageLayer: ' + file + ' is missing — a layer built without receipts cannot be aged')
    fs.utimesSync(file, when, when)
  }
}

// ── builders: one function per fixture that cannot share the base context ───────────────────────────────────────
const P0_ROW = { id: 'p0-fixture', severity: 'P0', status: 'fixed', title: 'fixture P0 whose evidence is a sentence', owner: 'fixture-owner' }

function baseDir(tmp, id) {
  return path.join(tmp, 'fx', id)
}

/** A fixture whose report is the base context, honestly measured, with `over` applied to the block. */
function honest(ctx, tmp, id, over = {}, opts = {}) {
  const man = manifestOf(ctx, over, opts.fidelityOver || {})
  const dir = baseDir(tmp, id)
  const ledger = opts.ledger || []
  return writeReport(dir, reportText({ verdict: opts.verdict || 'PASS', failures: opts.failures || 0, warnings: opts.warnings || 0, manifest: man, note: opts.note }), ledger)
}

const BUILD = {
  // A1: a hand-typed PASS with no provenance block at all.
  A1(ctx, tmp) {
    const dir = baseDir(tmp, 'A1')
    const text = ['AUDIT: PASS — 0 failure(s), 0 warning(s)', '', ...SECTIONS.flatMap((h) => [h, '- (hand-typed: nothing measured here)', '']), 'looks clean to me'].join(NL)
    return writeReport(dir, text, [])
  },
  // A2: a block that measures nothing (compared: 0) and says PASS.
  A2(ctx, tmp) {
    return honest(ctx, tmp, 'A2', {}, { fidelityOver: { compared: 0 } })
  },
  // A3: a genuine block borrowed from another tree.
  A3(ctx, tmp) {
    const foreign = 'sha256:' + '0'.repeat(64)
    const man = manifestOf(ctx, { tree: { head: ctx.tree.head, hash: foreign, changed: [] }, auditId: deriveAuditId(String(ctx.corpus.corpusId), foreign) })
    return writeReport(baseDir(tmp, 'A3'), reportText({ manifest: man }), [])
  },
  // A4: an old corpus id with a past generatedAt.
  A4(ctx, tmp) {
    const oldId = 'sha256:' + 'a'.repeat(64)
    const man = manifestOf(ctx, { corpus: { corpusId: oldId }, generatedAt: OLD.toISOString(), auditId: deriveAuditId(oldId, ctx.tree.hash) })
    return writeReport(baseDir(tmp, 'A4'), reportText({ manifest: man }), [])
  },
  // A5: report names a P0; the ledger says fixed with no proof at all.
  A5(ctx, tmp) {
    return honest(ctx, tmp, 'A5', { p0: [{ id: P0_ROW.id, title: P0_ROW.title, severity: 'P0', owner: P0_ROW.owner }] }, { ledger: [{ ...P0_ROW }] })
  },
  // A6: a red report with a placeholder override reason.
  A6(ctx, tmp) {
    return honest(ctx, tmp, 'A6', {}, { fidelityOver: { compared: 0 }, verdict: 'FAIL', failures: 1 })
  },
  // A7: the block claims 7 gaps (named) where the recompute finds 0.
  A7(ctx, tmp) {
    const names = ['vibe_vmu_turn.receipt.gapOne', 'vibe_vmu_turn.receipt.gapTwo', 'vibe_vmu_turn.receipt.gapThree', 'vibe_vmu_turn.receipt.gapFour', 'vibe_vmu_turn.receipt.gapFive', 'vibe_vmu_turn.receipt.gapSix', 'vibe_vmu_turn.receipt.gapSeven']
    return honest(ctx, tmp, 'A7', {}, { fidelityOver: { gaps: names.length, gapList: names } })
  },
  // A8a: a real stamp over a fidelity reading that is off by one compared.
  A8a(ctx, tmp) {
    return honest(ctx, tmp, 'A8a', {}, { fidelityOver: { compared: ctx.fidelity.compared + 1 } })
  },
  // A8b: a hand-typed block whose numbers are TRUE. The gate cannot tell the author apart from all.mjs, and it should
  // not pretend to -- this vector is recorded as neutralized with the triple equality as its evidence.
  A8b(ctx, tmp) {
    return honest(ctx, tmp, 'A8b')
  },
  // A9: prose PASS, machine block FAIL.
  A9(ctx, tmp) {
    return honest(ctx, tmp, 'A9', { checks: { verdict: 'FAIL', failures: 1, warnings: 0 } })
  },
  // A10: the layer the report names is edited after the report was written (bytes change, the list does not).
  A10(ctx, tmp) {
    const root = path.join(tmp, 'sim-A10')
    const layer = copyCorpus(path.join(root, 'layer'), CORPUS, ctx.generatedAt)
    const dir = baseDir(tmp, 'A10')
    const files = gateCorpusFiles(layer)
    const man = manifestOf({ ...ctx, corpus: { dir: layer, corpusId: corpusDigest(files), corpusFiles: files } })
    const written = writeReport(dir, reportText({ manifest: man }), [])
    writePointer(root, layer, man.corpus.corpusId, man.generatedAt)
    const victim = files[0].scenario
    fs.appendFileSync(files[0].receiptsPath, NL)
    return { ...written, root }
  },
  // A10extra: a corpus dir appears in the named layer after the report was written.
  A10extra(ctx, tmp) {
    const root = path.join(tmp, 'sim-A10extra')
    const layer = copyCorpus(path.join(root, 'layer'), CORPUS, ctx.generatedAt)
    const dir = baseDir(tmp, 'A10extra')
    const files = gateCorpusFiles(layer)
    const man = manifestOf({ ...ctx, corpus: { dir: layer, corpusId: corpusDigest(files), corpusFiles: files } })
    const written = writeReport(dir, reportText({ manifest: man }), [])
    writePointer(root, layer, man.corpus.corpusId, man.generatedAt)
    addExtraScenario(layer, 'appeared-after-audit')
    return { ...written, root }
  },
  // A11: the pre-file-list stamp (no corpusFiles) replayed onto a layer that has since grown.
  A11(ctx, tmp) {
    const root = path.join(tmp, 'sim-A11')
    const layer = copyCorpus(path.join(root, 'old-layer'), CORPUS, ctx.generatedAt)
    const dir = baseDir(tmp, 'A11')
    const files = gateCorpusFiles(layer)
    const man = manifestOf({ ...ctx, corpus: { dir: layer, corpusId: corpusDigest(files) }, generatedAt: OLD.toISOString() })
    delete man.corpus.corpusFiles
    man.auditId = deriveAuditId(man.corpus.corpusId, man.tree.hash)
    const written = writeReport(dir, reportText({ manifest: man }), [])
    writePointer(root, layer, man.corpus.corpusId, new Date().toISOString())
    addExtraScenario(layer, 'added-after-the-audit')
    return { ...written, root }
  },
  // A12: the report's file list misstates one file's hash while its corpus id is the true one.
  A12(ctx, tmp) {
    const root = path.join(tmp, 'sim-A12')
    const layer = copyCorpus(path.join(root, 'layer'), CORPUS, ctx.generatedAt)
    const dir = baseDir(tmp, 'A12')
    const files = gateCorpusFiles(layer)
    const claimed = files.map((f) => ({ ...f }))
    const other = files[files.length - 1]
    claimed[0].sha256 = other.sha256
    claimed[0].bytes = other.bytes
    const man = manifestOf({ ...ctx, corpus: { dir: layer, corpusId: corpusDigest(files), corpusFiles: claimed } })
    const written = writeReport(dir, reportText({ manifest: man }), [])
    writePointer(root, layer, man.corpus.corpusId, man.generatedAt)
    return { ...written, root }
  },
  // A13: the list omits a scenario the layer holds, while the corpus id is the full one.
  A13(ctx, tmp) {
    const root = path.join(tmp, 'sim-A13')
    const layer = copyCorpus(path.join(root, 'layer'), CORPUS, ctx.generatedAt)
    const dir = baseDir(tmp, 'A13')
    const files = gateCorpusFiles(layer)
    const short = files.slice(0, -1)
    const man = manifestOf({ ...ctx, corpus: { dir: layer, corpusId: corpusDigest(files), corpusFiles: short } })
    const written = writeReport(dir, reportText({ manifest: man }), [])
    writePointer(root, layer, man.corpus.corpusId, man.generatedAt)
    return { ...written, root }
  },
  // A13b: the same omission, but every stamp is self-consistent with the SHORT list -- the only tell is the extra dir.
  A13b(ctx, tmp) {
    const root = path.join(tmp, 'sim-A13b')
    const layer = copyCorpus(path.join(root, 'layer'), CORPUS, ctx.generatedAt)
    const dir = baseDir(tmp, 'A13b')
    const files = gateCorpusFiles(layer)
    const short = files.slice(0, -1)
    const shortId = corpusDigest(short)
    const man = manifestOf({ ...ctx, corpus: { dir: layer, corpusId: shortId, corpusFiles: short }, auditId: deriveAuditId(shortId, ctx.tree.hash) })
    const written = writeReport(dir, reportText({ manifest: man }), [])
    writePointer(root, layer, shortId, man.generatedAt)
    return { ...written, root }
  },
  // A14: the named layer does not exist.
  A14(ctx, tmp) {
    const root = path.join(tmp, 'sim-A14')
    const ghost = path.join(root, 'no-such-layer')
    const dir = baseDir(tmp, 'A14')
    const man = manifestOf({ ...ctx, corpus: { dir: ghost, corpusId: ctx.corpus.corpusId, corpusFiles: ctx.corpus.corpusFiles } })
    const written = writeReport(dir, reportText({ manifest: man }), [])
    writePointer(root, ghost, man.corpus.corpusId, man.generatedAt)
    return { ...written, root }
  },
  // A15: a corpus dir appears in the named layer; the report's list and digest are both true for the older set.
  A15(ctx, tmp) {
    const root = path.join(tmp, 'sim-A15')
    const layer = copyCorpus(path.join(root, 'layer'), CORPUS, ctx.generatedAt)
    const dir = baseDir(tmp, 'A15')
    const files = gateCorpusFiles(layer)
    const man = manifestOf({ ...ctx, corpus: { dir: layer, corpusId: corpusDigest(files), corpusFiles: files } })
    const written = writeReport(dir, reportText({ manifest: man }), [])
    writePointer(root, layer, man.corpus.corpusId, man.generatedAt)
    addExtraScenario(layer, 'appeared-in-the-named-layer')
    return { ...written, root }
  },
  // A16: an honest report about an OLD layer, while the pointer names a NEW one. Nothing is forged; the report is
  // simply not about the corpus this machine is on -- which is precisely the sentence the gate did not used to have.
  A16(ctx, tmp) {
    const root = path.join(tmp, 'sim-A16')
    const oldLayer = copyCorpus(path.join(root, 'run-2026-11-01-1'), CORPUS, ctx.generatedAt)
    ageLayer(oldLayer, OLD)
    const newLayer = copyCorpus(path.join(root, 'run-2026-11-09-2'), CORPUS, ctx.generatedAt)
    const dir = baseDir(tmp, 'A16')
    const files = gateCorpusFiles(oldLayer)
    const man = manifestOf({ ...ctx, corpus: { dir: oldLayer, corpusId: corpusDigest(files), corpusFiles: files } })
    const written = writeReport(dir, reportText({ manifest: man }), [])
    writePointer(root, newLayer, corpusDigest(gateCorpusFiles(newLayer)), new Date().toISOString())
    return { ...written, root }
  },
  // A16b: two directories with identical bytes; the report names the copy, the pointer names the other. Nothing but
  // directory IDENTITY can tell them apart -- which is why "same digest" was never a substitute for "current layer".
  A16b(ctx, tmp) {
    const root = path.join(tmp, 'sim-A16b')
    const named = copyCorpus(path.join(root, 'run-copy-named-by-report'), CORPUS, ctx.generatedAt)
    const current = copyCorpus(path.join(root, 'run-copy-current'), CORPUS, ctx.generatedAt)
    const dir = baseDir(tmp, 'A16b')
    const files = gateCorpusFiles(named)
    const man = manifestOf({ ...ctx, corpus: { dir: named, corpusId: corpusDigest(files), corpusFiles: files } })
    const written = writeReport(dir, reportText({ manifest: man }), [])
    writePointer(root, current, corpusDigest(gateCorpusFiles(current)), new Date().toISOString())
    return { ...written, root }
  },
}

function gateCorpusFiles(layer) {
  return corpusFilesOf(layer)
}
function corpusFilesOf(layer) {
  // No existsSync-ternary here on purpose: a fixture layer that cannot be read is a BROKEN FIXTURE, not an empty corpus.
  // Letting readdirSync throw keeps that loud (audit-no-silent-reads: a missing file must never become an empty value).
  const dirs = fs.readdirSync(layer).filter((n) => n.startsWith('corpus-'))
  const files = []
  for (const name of dirs) {
    const receiptsPath = path.join(layer, name, 'receipts.jsonl')
    // A corpus dir without receipts is a broken fixture, not a corpus with zero rows: let requireFile-style loudness
    // win (readFileSync throws with the path) instead of `continue`, which would silently shrink the measured set.
    const body = fs.readFileSync(receiptsPath)
    files.push({ scenario: name.slice('corpus-'.length), receiptsPath, bytes: body.length, sha256: sha(body) })
  }
  files.sort((a, b) => (a.scenario < b.scenario ? -1 : a.scenario > b.scenario ? 1 : 0))
  return files
}
function corpusDigest(files) {
  const ordered = [...files].sort((a, b) => (a.scenario < b.scenario ? -1 : a.scenario > b.scenario ? 1 : 0))
  const digest = createHash('sha256')
  for (const f of ordered) digest.update(f.scenario + ' ' + String(f.sha256).slice('sha256:'.length) + NL)
  return 'sha256:' + digest.digest('hex')
}

// ── gate invocation ──────────────────────────────────────────────────────────────────────────────────────────────
function gateEnv() {
  return { ...process.env, VMU_RICH_REAL: RICH }
}

function runGate(vector, built) {
  const args = [GATE, '--json', '--audit=' + built.audit, '--gate-script=' + STUB, '--open-items=' + built.ledgerPath, '--declared=' + DECLARED]
  if (!built.root) args.push('--root=' + built.rootDefault)
  else args.push('--root=' + built.root)
  for (const extra of vector.cliArgs || []) args.push(String(extra).replace('@root', built.root || built.rootDefault))
  const started = process.hrtime.bigint()
  const res = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', timeout: 300000, maxBuffer: 64 * 1024 * 1024, env: gateEnv() })
  const wallMs = Number(process.hrtime.bigint() - started) / 1e6
  let payload = null
  let parseError = null
  const out = String(res.stdout || '')
  try {
    payload = JSON.parse(out.trim())
  } catch (e) {
    parseError = 'gate stdout is not JSON: ' + e.message + (out ? ' | first line: ' + out.trim().split(NL)[0].slice(0, 200) : '')
  }
  return {
    exit: typeof res.status === 'number' ? res.status : null,
    signal: res.signal || null,
    wallMs,
    payload,
    parseError,
    stderrTail: String(res.stderr || '').trim().split(NL).slice(-3).join(' | '),
  }
}

const codesOf = (payload) => ((payload && payload.reasons) || []).map((r) => String(r.code))
const messagesOf = (payload) => ((payload && payload.reasons) || []).map((r) => String(r.message))
const SHA_RE = /sha256:[0-9a-f]{16,}/g

/** True when one message prints the same digest twice: it reads as a comparison but both sides are the same value. */
function duplicateDigestIn(messages) {
  for (const message of messages) {
    const seen = new Set()
    for (const hit of String(message).match(SHA_RE) || []) {
      if (seen.has(hit)) return message
      seen.add(hit)
    }
  }
  return null
}

function deepGet(value, dotted) {
  let cursor = value
  for (const part of String(dotted).split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined
    cursor = cursor[part]
  }
  return cursor
}

/** Judge one vector's gate answer. Returns {status, why, codes, leakedInto?}. */
function judge(vector, got) {
  const expects = vector.expects || {}
  const judgeKind = String(expects.judge || 'code')
  if (got.parseError) return { status: 'error', why: got.parseError }
  const payload = got.payload
  if (!payload || typeof payload !== 'object') return { status: 'error', why: 'gate printed no JSON payload' }
  const codes = codesOf(payload)
  const messages = messagesOf(payload)
  const ready = payload.ready === true
  if (judgeKind === 'neutralized') {
    const forged = (expects.forgeryDetectionCodes || []).filter((code) => codes.includes(code))
    if (forged.length) return { status: 'masked', why: 'the "neutralized" forgery was CAUGHT by ' + forged.join(', ') + ' — the claim that it is undetectable is false', codes }
    // Evidence for a neutralized vector takes one of two shapes: the fidelity triple (the forgery states a TRUE reading,
    // so there is nothing false to catch), or explicit field equality when the attack dissolved into a different, honest
    // shape (an empty override reason parses as no override at all — nothing to refuse, and nothing bypassed either).
    if (Array.isArray(expects.expectFields) && expects.expectFields.length) {
      const badFields = []
      for (const check of expects.expectFields) {
        const actual = deepGet(payload, check.path)
        const equal = Object.prototype.hasOwnProperty.call(check, 'equals') ? JSON.stringify(actual) === JSON.stringify(check.equals) : Boolean(actual)
        if (!equal) badFields.push(check.path + ' is ' + JSON.stringify(actual) + ', expected ' + (Object.prototype.hasOwnProperty.call(check, 'equals') ? JSON.stringify(check.equals) : 'truthy'))
      }
      if (badFields.length) return { status: 'half', why: 'not neutralized: the recorded facts do not show the dissolved shape: ' + badFields.join('; '), codes }
      return { status: 'neutralized', why: expects.neutralizedWhy || 'the attack dissolved into an honestly recorded shape; there was nothing to catch', codes }
    }
    const claimed = deepGet(payload, 'facts.audit.report.manifest.fidelity') || {}
    const recomputed = deepGet(payload, 'facts.fidelityRecomputed') || {}
    const fields = ['liveToolsWithFieldList', 'compared', 'gaps']
    const differ = fields.filter((f) => Number(claimed[f]) !== Number(recomputed[f]))
    if (differ.length) return { status: 'half', why: 'the claimed and recomputed readings disagree on ' + differ.join(', ') + ' (' + fields.map((f) => f + ' claimed ' + String(claimed[f]) + ' vs ' + String(recomputed[f])).join('; ') + ')', codes }
    return { status: 'neutralized', why: expects.neutralizedWhy || 'forgery is indistinguishable from a genuine report; the reading it states is true', codes }
  }
  if (judgeKind === 'field') {
    if (ready) return { status: 'leaked', why: 'the gate returned READY with the bypass in place; the bypass was never recorded', codes }
    const bad = []
    for (const check of expects.expectFields || []) {
      const actual = deepGet(payload, check.path)
      const equal = Object.prototype.hasOwnProperty.call(check, 'equals') ? JSON.stringify(actual) === JSON.stringify(check.equals) : Boolean(actual)
      if (!equal) bad.push(check.path + ' is ' + JSON.stringify(actual) + ', expected ' + (Object.prototype.hasOwnProperty.call(check, 'equals') ? JSON.stringify(check.equals) : 'truthy'))
    }
    if (bad.length) return { status: 'leaked', why: 'refused, but the recorded facts do not show the bypass: ' + bad.join('; '), codes }
    return { status: 'named', why: 'refused, and the recorded facts show the bypass as chosen-then-rejected', codes }
  }
  if (ready) return { status: 'leaked', why: 'the gate returned READY: the forgery passed', codes }
  if (!codes.includes(String(expects.primaryReason))) {
    // Two different failures hide here, and they must not be flattened: if some code the vector itself declared as its
    // own consequence DID fire while the primary did not, the vector's predictions contradict each other — wrong-code,
    // the matrix entry is stale (keeping it green would be measuring an expectation, not the gate). If nothing the
    // vector declared fired, the refusal belongs to some other reason entirely — masked, and masked is the worst status
    // because a refusal for an unowned reason is not evidence that this attack was caught.
    // Counter-light: tests/redteam-gate.test.mjs changes A13b's expected code and requires WRONG-CODE, named, from here.
    const declared = expects.allowedSecondary && typeof expects.allowedSecondary === 'object' ? Object.keys(expects.allowedSecondary) : []
    const declaredFired = declared.filter((code) => codes.includes(code))
    if (codes.length && declaredFired.length) {
      return { status: 'wrong-code', why: 'the vector predicted ' + String(expects.primaryReason) + ' but the gate refused with its declared consequence(s) ' + declaredFired.join(', ') + ' and not the predicted code — the expectation no longer matches the gate', codes }
    }
    return { status: 'masked', why: 'primary ' + String(expects.primaryReason) + ' did not fire; the gate refused with ' + (codes.length ? codes.join(', ') + ' (' + messages.slice(0, 2).join(' | ') + ')' : 'no code at all'), codes }
  }
  if (got.exit !== expects.expectExit) return { status: 'half', why: 'correct code, wrong exit: ' + String(got.exit) + ' instead of ' + String(expects.expectExit), codes }
  const absent = (expects.expectCodesAbsent || []).filter((code) => codes.includes(code))
  if (absent.length) return { status: 'masked', why: absent.join(', ') + ' also fired: two answers to two questions collapsed (the report is not ' + absent.join('/') + '; it is ' + String(expects.primaryReason) + ')', codes }
  // A refusal this vector did not earn is not a pass. `allowedSecondary` must carry a REASON per code, so the list is a
  // sentence about consequences ("this fires because the claim is missing") and never a bin for whatever showed up.
  const allowed = expects.allowedSecondary && typeof expects.allowedSecondary === 'object' ? expects.allowedSecondary : {}
  const unexpected = codes.filter((code) => code !== expects.primaryReason && !Object.prototype.hasOwnProperty.call(allowed, code))
  if (unexpected.length) {
    return {
      status: 'masked',
      why: 'refused with code(s) this vector did not earn: ' + unexpected.join(', ') + ' (earned: ' + String(expects.primaryReason) + '; declared consequences: ' + (Object.keys(allowed).join(', ') || 'none') + ') — a refusal for an unowned reason is not evidence that this attack was caught',
      codes,
    }
  }
  const pattern = expects.expectMessagePattern
  if (pattern) {
    const re = new RegExp(pattern)
    if (!messages.some((m) => re.test(m))) return { status: 'half', why: 'refused by name, but no message matches ' + String(pattern) + ' — the reader cannot tell what was refused: ' + (messages[0] || '(no message)').slice(0, 300), codes }
  }
  const duplicate = duplicateDigestIn(messages)
  if (duplicate) return { status: 'half', why: 'a message prints the same digest twice: ' + String(duplicate).slice(0, 220), codes }
  const badFields = []
  for (const check of expects.expectFields || []) {
    const actual = deepGet(payload, check.path)
    const equal = Object.prototype.hasOwnProperty.call(check, 'equals') ? JSON.stringify(actual) === JSON.stringify(check.equals) : actual !== undefined
    if (!equal) badFields.push(check.path + ' is ' + JSON.stringify(actual))
  }
  if (badFields.length) return { status: 'half', why: 'wrong code fired but the recorded facts are off: ' + badFields.join('; '), codes }
  if (expects.primaryReason && expects.expectReady === false && !codes.length) return { status: 'masked', why: 'no reason code at all' , codes }
  return { status: 'named', why: expects.namedWhy || 'refused with the code this attack is about, and the message names it', codes }
}

/** AUDIT_TREE_CHANGED means the tree moved between stamping a report and spawning the gate (other lanes edit this same
 * checkout while the suite runs). It can arrive ALONE (nothing else was wrong) or ALONGSIDE the real refusal — the
 * latter is the dangerous case, because judging it would report a genuine catch as "masked for an unowned reason".
 * So: retry whenever it appears, unless it IS the expected code (A3 borrows a foreign tree hash on purpose). Rebuild
 * with a freshly sampled tree each time; three strikes is the same budget the old harness used. */
function retryable(got, expects) {
  const codes = codesOf(got.payload)
  if (got.exit !== 7 || !codes.includes('AUDIT_TREE_CHANGED')) return false
  return String(expects && expects.primaryReason) !== 'AUDIT_TREE_CHANGED'
}

// ── main ────────────────────────────────────────────────────────────────────────────────────────────────────────
async function main() {
  const fixturesDir = flagValue('--fixtures-dir', path.join(HERE, 'fixtures'))
  const roster = loadRoster(fixturesDir)
  const gate = await import(pathToFileURL(GATE).href)
  for (const required of ['corpusFilesIn', 'corpusDigestOf', 'recomputeFidelity', 'treeHashOf']) {
    if (typeof gate[required] !== 'function') die('the gate no longer exports ' + required + '(); the harness reads it from there so the two cannot drift')
  }
  const only = String(flagValue('--only', '')).split(',').map((s) => s.trim()).filter(Boolean)
  const unknown = only.filter((id) => !roster.fixtures.some((f) => f.id === id || (f.variants || []).some((v) => v.id === id)))
  if (unknown.length) die('--only names vector(s) that are not in the roster: ' + unknown.join(', '))
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vmu-redteam-'))
  const startedAll = Date.now()
  const rows = []
  try {
    const ctx = await loadContext(gate, tmp)
    const built = {}
    // Build every fixture that owns a layer once, and the shared report directory per fixture.
    for (const fx of roster.fixtures) {
      const build = BUILD[fx.id]
      if (!build) die('fixture ' + fx.id + ' has no builder in run.mjs — a data file no runner can build is not a test')
      const out = build(ctx, tmp)
      // The ledger a fixture ships with is the BASELINE, kept in memory: a variant spreads its own item over a fresh
      // copy, so one vector's ledger cannot leak into the next (that is how a suite starts testing its own history).
      // The builder just wrote this ledger; read it, never substitute an empty one — an empty fallback would let a
      // fixture whose ledger failed to be written look like "no open items", which is the pass this suite forbids.
      const ledgerSource = fs.readFileSync(out.ledgerPath, 'utf8')
      built[fx.id] = { ...out, rootDefault: ctx.root, ledgerSource }
      if (out.dir) fs.mkdirSync(out.dir, { recursive: true })
    }
    const vectors = []
    for (const fx of roster.fixtures) {
      vectors.push({ fx, vector: { id: fx.id, expects: fx.expects, cliArgs: fx.cliArgs || [] } })
      for (const variant of Array.isArray(fx.variants) ? fx.variants : []) {
        if (!variant || !variant.id) die('fixture ' + fx.id + ' has a variant with no id')
        vectors.push({ fx, vector: { id: String(variant.id), expects: { ...fx.expects, ...(variant.expects || {}) }, cliArgs: variant.cliArgs || fx.cliArgs || [], ledgerItem: variant.ledgerItem } })
      }
    }
    if (vectors.length !== roster.expectedVectors) {
      die('vector count ' + vectors.length + ' does not match fixtures/INDEX.json (' + roster.expectedVectors + ') — a suite that shrinks quietly is the failure this roster exists to catch')
    }
    for (const { fx, vector } of vectors) {
      if (only.length && !only.includes(vector.id) && !only.includes(fx.id)) continue
      const base = built[fx.id]
      const builtFor = { ...base }
      const items = JSON.parse(base.ledgerSource)
      if (vector.ledgerItem) for (const item of items.items || []) Object.assign(item, vector.ledgerItem)
      fs.writeFileSync(base.ledgerPath, JSON.stringify(items, null, 2) + NL)
      if (vector.reportDir) builtFor.dir = vector.reportDir
      let got = runGate({ ...fx, cliArgs: vector.cliArgs || fx.cliArgs || [] }, builtFor)
      let attempts = 1
      while (retryable(got, vector.expects) && attempts < 6) {
        attempts += 1
        // Re-stamp with the tree as it is NOW: the retry exists because another lane moved the tree, so rebuilding from
        // the old ctx would stamp the same stale hash and fail again for exactly the same reason. A short settle gap
        // keeps a commit-in-progress from being sampled half-applied.
        sleep(400)
        const now = treeNow(gate)
        if (now.ok) ctx.tree = now
        const rebuilt = BUILD[fx.id](ctx, tmp)
        Object.assign(builtFor, rebuilt)
        got = runGate({ ...fx, cliArgs: vector.cliArgs || fx.cliArgs || [] }, builtFor)
      }
      const verdict = judge({ ...fx, expects: vector.expects }, got)
      rows.push({ id: vector.id, fixture: fx.id, status: verdict.status, why: verdict.why, codes: verdict.codes, exit: got.exit, wallMs: Math.round(got.wallMs), attempts, expected: vector.expects })
      const label = verdict.status.toUpperCase().padEnd(11)
      console.log(fx.id.padEnd(9) + label + ' exit ' + String(got.exit).padEnd(3) + ' ' + String(Math.round(got.wallMs)).padStart(5) + ' ms  codes=[' + verdict.codes.join(',') + ']')
      if (hasFlag('--verbose') || verdict.status !== 'named' && verdict.status !== 'neutralized') console.log('         why: ' + verdict.why)
    }
  } finally {
    if (hasFlag('--keep')) console.log('kept fixture tree: ' + tmp)
    else fs.rmSync(tmp, { recursive: true, force: true })
  }
  const tally = { named: 0, neutralized: 0, masked: 0, half: 0, leaked: 0, error: 0, 'wrong-code': 0 }
  for (const row of rows) tally[row.status] = (tally[row.status] || 0) + 1
  const bad = tally.masked + tally.half + tally.leaked + tally.error + (tally['wrong-code'] || 0)
  const totalMs = Date.now() - startedAll
  const summary = 'VECTORS ' + rows.length + ' | named ' + tally.named + ' | neutralized ' + tally.neutralized + ' | masked ' + tally.masked + ' | half ' + tally.half + ' | leaked ' + tally.leaked + (tally.error ? ' | error ' + tally.error : '') + ' | wrong-code ' + (tally['wrong-code'] || 0)
  console.log('')
  console.log(summary)
  console.log('wall ' + (totalMs / 1000).toFixed(1) + ' s (' + rows.length + ' gate spawns; ' + (rows.reduce((n, r) => n + r.attempts - 1, 0)) + ' tree-changed retries)')
  if (hasFlag('--json')) {
    const payload = { summary, vectors: rows.length, named: tally.named, neutralized: tally.neutralized, masked: tally.masked, half: tally.half, leaked: tally.leaked, error: tally.error, wrongCode: tally['wrong-code'] || 0, wallMs: totalMs, rows: rows.map((r) => ({ id: r.id, status: r.status, exit: r.exit, codes: r.codes, ms: r.wallMs, why: r.why })) }
    console.log('```json redteam')
    console.log(JSON.stringify(payload, null, 2))
    console.log('```')
  }
  // A subset (--only) is a legitimate, shorter run: the roster check above already proved the fixture set is complete,
  // so the exit contract here is "every vector that RAN was named or justified-neutralized". The full-run count is
  // enforced by the roster (INDEX.json vs the files on disk), not by asking every invocation to spend 45 seconds.
  const complete = only.length ? rows.length > 0 : rows.length === roster.expectedVectors
  process.exit(bad === 0 && complete && tally.named + tally.neutralized === rows.length ? 0 : 1)
}

main().catch((e) => {
  console.error('REDTEAM ERROR: ' + (e && e.stack ? e.stack : String(e)))
  process.exit(2)
})
