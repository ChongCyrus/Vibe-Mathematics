// tests/sim-redteam-copy-mtime.test.mjs — TB-2748/B: a copied corpus must be OLDER than the report that judges it.
//
// THE DEFECT THIS PINS. The red team builds each fixture layer by copying the committed corpus. `fs.cpSync` preserves
// mtimes on Windows but NOT on POSIX: on Linux every copied file gets NOW. The release gate refuses a report whose
// generatedAt + 1000 ms is older than the newest receipts mtime (AUDIT_CORPUS_STALE, "its generatedAt ... predates the
// newest receipt"). So on the CI shard a layer copied seconds earlier looked NEWER than the report about to describe
// it, and A3/A4/A16/A16b were masked by an artefact of the platform: green on Windows, red on CI.
//
// THE FIX, pinned here:
//   §0  the copy the suite really makes is backdated, byte-identical, and leaves the committed corpus untouched;
//   §0b the real gate judge (`release-ready.mjs#assess`) calls that layer NOT stale, and only after re-reading it;
//   §1  a copy stamped NOW (what POSIX cpSync produces) is called STALE, with the CI sentence verbatim;
//   §2  LAMP A: keep the copy but skip the backdate (stamp NOW) => the module REFUSES with its named pin;
//   §3  LAMP B: the pre-fix shape (no backdate, no pin) reproduces the CI why text through the same judge;
//   §4  integration: run.mjs imports this module and no call site omits (CORPUS, generatedAt).
//
// Every fixture is built under os.tmpdir() and removed in after(); no repo file is written by any lamp.
import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const DATA = join(ROOT, 'scripts', 'sim', 'redteam', 'data')
const CORPUS = join(DATA, 'corpus')
const RICH = join(DATA, 'rich-fields.jsonl')
const DECLARED = join(DATA, 'fidelity-declared.json')
const COPY_MOD = join(ROOT, 'scripts', 'sim', 'redteam', 'corpus-copy.mjs')
const RUN_MOD = join(ROOT, 'scripts', 'sim', 'redteam', 'run.mjs')
const GATE_MOD = join(ROOT, 'scripts', 'sim', 'audit', 'release-ready.mjs')
const SCRATCH = join(tmpdir(), 'sim-redteam-copy-mtime-' + process.pid)
const NL = String.fromCharCode(10)

const rr = await import(pathToFileURL(GATE_MOD).href)
const copyMod = await import(pathToFileURL(COPY_MOD).href)
const { copyCorpus, BACKDATE_MS } = copyMod

mkdirSync(SCRATCH, { recursive: true })
after(() => rmSync(SCRATCH, { recursive: true, force: true }))

const sha256Of = (file) => 'sha256:' + createHash('sha256').update(readFileSync(file)).digest('hex')
const receiptsIn = (layer) =>
  readdirSync(layer)
    .filter((n) => n.startsWith('corpus-'))
    .map((n) => ({ scenario: n, file: join(layer, n, 'receipts.jsonl') }))
    .filter((r) => existsSync(r.file))
const newestMtimeMs = (layer) => Math.max(...receiptsIn(layer).map((r) => statSync(r.file).mtimeMs))
const agoIso = (ms) => new Date(Date.now() - ms).toISOString()
const stampNow = (layer) => {
  const when = new Date()
  for (const r of receiptsIn(layer)) utimesSync(r.file, when, when)
  return layer
}

/** Write a report the gate can parse: prose verdict + the five sections + the machine-readable block. */
function writeReportFixture(name, layer, generatedAt) {
  const files = rr.corpusFilesIn(layer)
  const corpusId = rr.corpusDigestOf(files)
  const tree = rr.treeHashOf(ROOT)
  const fidelity = rr.recomputeFidelity(files, { richPath: RICH, declaredPath: DECLARED })
  const manifest = {
    tool: 'scripts/sim/audit/all.mjs',
    auditId: rr.deriveAuditId(corpusId, tree.hash),
    generatedAt,
    tree: { head: tree.head, hash: tree.hash, changed: (tree.changed || []).length },
    corpus: {
      dir: layer,
      corpusId,
      corpusFiles: files.map((f) => ({ scenario: f.scenario, path: f.receiptsPath, bytes: f.bytes, sha256: f.sha256 })),
    },
    fidelity: {
      liveToolsWithFieldList: fidelity.liveToolsWithFieldList,
      compared: fidelity.compared,
      gaps: fidelity.gaps,
    },
    checks: { verdict: 'PASS', failures: 0, warnings: 0 },
    p0: [],
  }
  const lines = ['AUDIT: PASS — 0 failure(s), 0 warning(s)', '']
  for (const heading of ['## 1. scenarios', '## 2. receipt audit', '## 3. rule coverage', '## 4. action coverage', '## 5. fidelity vs live receipts']) {
    lines.push(heading, '- (fixture: nothing measured here besides the corpus timing under test)', '')
  }
  lines.push('- live tools with a field list: ' + fidelity.liveToolsWithFieldList + '; compared: ' + fidelity.compared + '; gaps: ' + fidelity.gaps, '')
  lines.push('```json audit-report', JSON.stringify(manifest, null, 2), '```', '')
  const dir = join(SCRATCH, 'report-' + name)
  mkdirSync(dir, { recursive: true })
  const auditPath = join(dir, 'AUDIT.md')
  writeFileSync(auditPath, lines.join(NL))
  writeFileSync(join(dir, 'current-layer.json'), JSON.stringify({ dir: layer, corpusId, generatedAt, pid: process.pid, at: new Date().toISOString(), by: 'tests/sim-redteam-copy-mtime.test.mjs fixture' }, null, 2) + NL)
  return { dir, auditPath, manifest }
}

/** Judge a fixture with the SAME function the release gate runs in production (no CLI, no prose parsing of our own). */
function judge(fixture, generatedAt) {
  const report = rr.parseAuditReport(readFileSync(fixture.auditPath, 'utf8'))
  assert.ok(report.manifest, 'the fixture report must parse (' + String(report.manifestError) + ')')
  const facts = {
    gate: { ran: true, exitCode: 0, wallMs: 1 },
    audit: { path: fixture.auditPath, mtimeMs: statSync(fixture.auditPath).mtimeMs, report },
    head: { commitMs: Date.now() - 86_400_000, iso: new Date(Date.now() - 86_400_000).toISOString() },
    drift: { ok: true, changed: [], newestMs: null, newestPath: null, why: null },
    treeHash: rr.treeHashOf(ROOT),
    corpus: rr.resolveReportCorpus(report.manifest),
    currentLayer: rr.readCurrentLayer(fixture.dir),
    openItems: { ok: true, items: [], bad: [], why: null },
    override: null,
  }
  const verdict = rr.assess(facts)
  return {
    corpus: facts.corpus,
    currentLayer: facts.currentLayer,
    codes: verdict.reasons.map((r) => r.code),
    stale: verdict.reasons.find((r) => r.code === 'AUDIT_CORPUS_STALE') || null,
  }
}

test('§0 the real copyCorpus backdates every receipt, preserves bytes, and leaves the committed corpus untouched', () => {
  const generatedAt = agoIso(60_000)
  const layer = join(SCRATCH, 'layer-backdated')
  const source = receiptsIn(CORPUS)
  assert.ok(source.length >= 4, 'the committed fixture corpus has the four replayed corpora (a copy test over an empty corpus proves nothing)')
  const before = source.map((r) => ({ scenario: r.scenario, mtimeMs: statSync(r.file).mtimeMs, sha256: sha256Of(r.file) }))
  copyCorpus(layer, CORPUS, generatedAt)
  const copies = receiptsIn(layer)
  assert.deepEqual(copies.map((r) => r.scenario).sort(), source.map((r) => r.scenario).sort(), 'the copy has exactly the corpus directories it copied')
  assert.ok(copies.length > 0, 'the copy is non-empty (a per-receipt loop over zero copies would prove nothing about backdating)')
  const generatedMs = Date.parse(generatedAt)
  for (const r of copies) {
    const st = statSync(r.file)
    assert.ok(st.mtimeMs < generatedMs, 'copied receipts are strictly OLDER than generatedAt: ' + r.scenario + ' mtime ' + st.mtimeMs + ' vs ' + generatedMs)
    assert.ok(Math.abs(st.mtimeMs - (generatedMs - BACKDATE_MS)) < 2000, 'the backdate is the declared ' + BACKDATE_MS + ' ms before generatedAt (not an arbitrary past): ' + r.scenario + ' ' + st.mtimeMs)
  }
  for (const b of before) {
    const copySha = sha256Of(join(layer, b.scenario, 'receipts.jsonl'))
    assert.equal(copySha, b.sha256, 'the backdate changes mtime only, never bytes: ' + b.scenario)
    assert.equal(statSync(join(layer, b.scenario, 'receipts.jsonl')).isFile(), true, 'the copy is a file: ' + b.scenario)
  }
  const after = receiptsIn(CORPUS).map((r) => ({ scenario: r.scenario, mtimeMs: statSync(r.file).mtimeMs, sha256: sha256Of(r.file) }))
  assert.deepEqual(after, before, 'copying for a fixture never touches the committed corpus it copied from')
})

test('§0b the real gate judge calls a backdated layer NOT stale, and it re-read the corpus to say so', () => {
  const generatedAt = agoIso(60_000)
  const layer = join(SCRATCH, 'layer-backdated')
  const fixture = writeReportFixture('backdated', layer, generatedAt)
  const verdict = judge(fixture, generatedAt)
  assert.equal(verdict.corpus.ok, true, 'the judge re-read the layer the report names (an unread corpus would make "not stale" silence): ' + JSON.stringify(verdict.corpus.why))
  assert.equal(verdict.currentLayer.ok, true, 'the layer pointer is readable: ' + JSON.stringify(verdict.currentLayer.why))
  assert.equal(verdict.stale, null, 'a backdated copy is not AUDIT_CORPUS_STALE: ' + JSON.stringify(verdict.codes))
  assert.ok(!verdict.codes.includes('AUDIT_CORPUS_STALE'), 'no stale code at all: ' + JSON.stringify(verdict.codes))
})

test('§1 a copy stamped NOW (what fs.cpSync produces on POSIX) is called STALE, with the CI sentence', () => {
  const layer = join(SCRATCH, 'layer-posix-now')
  cpSync(CORPUS, layer, { recursive: true })
  // On POSIX the copy itself is stamped NOW; on Windows cpSync preserves the source mtime, so the test applies the
  // POSIX behaviour explicitly. This is the CI precondition, stated instead of inherited from the host OS.
  stampNow(layer)
  const generatedAt = agoIso(60_000)
  const generatedMs = Date.parse(generatedAt)
  assert.ok(newestMtimeMs(layer) > generatedMs + 1000, 'precondition: the copy is newer than generatedAt by more than the gate tolerance')
  const fixture = writeReportFixture('posix-now', layer, generatedAt)
  const verdict = judge(fixture, generatedAt)
  assert.ok(verdict.stale, 'a layer newer than the report is AUDIT_CORPUS_STALE, not a pass: ' + JSON.stringify(verdict.codes))
  assert.match(verdict.stale.message, /predates the newest receipt/, 'the refusal carries the gate sentence a CI reader saw: ' + verdict.stale.message)
  assert.match(verdict.stale.message, /the report measured a corpus that is no longer this one/, 'the refusal says WHY it is stale, not only that it is: ' + verdict.stale.message)
})

test('§2 LAMP A: skipping the backdate makes the module REFUSE with its named pin', async () => {
  const source = readFileSync(COPY_MOD, 'utf8')
  const utimesLine = '      fs.utimesSync(file, when, when)' + NL
  assert.ok(source.includes(utimesLine), 'the lamp edits the line that actually exists (an unapplied lamp proves nothing)')
  // Simulate POSIX cpSync by stamping NOW instead of the backdate; the pin must catch it on any platform.
  const mutated = source.replace(utimesLine, '      fs.utimesSync(file, Date.now() / 1000, Date.now() / 1000)' + NL)
  assert.notEqual(mutated, source, 'the lamp mutation really changed the module')
  const mutant = join(SCRATCH, 'lamp-a.mjs')
  writeFileSync(mutant, mutated)
  const mod = await import(pathToFileURL(mutant).href)
  const generatedAt = agoIso(60_000)
  let error = null
  try {
    mod.copyCorpus(join(SCRATCH, 'lamp-a-layer'), CORPUS, generatedAt)
  } catch (e) {
    error = e
  }
  assert.ok(error, 'the pin refuses a copy that is not older than generatedAt (without it, CI only finds out at the gate)')
  assert.match(String(error.message), /copied receipts are not older than generatedAt/, 'the pin names the violated ordering: ' + String(error.message))
  assert.match(String(error.message), /fs\.cpSync on POSIX stamps the copy with NOW/, 'the pin records the platform reason, so the next reader does not debug Windows: ' + String(error.message))
})

test('§3 LAMP B: the pre-fix shape (no backdate, no pin) reproduces the CI why text through the real judge', async () => {
  const source = readFileSync(COPY_MOD, 'utf8')
  const mutated = source
    .replace('      fs.utimesSync(file, when, when)' + NL, '      fs.utimesSync(file, Date.now() / 1000, Date.now() / 1000)' + NL)
    .replace('  if (newer.length) {', '  if (false) {')
  assert.notEqual(mutated, source, 'the lamp mutation really changed the module')
  assert.ok(!mutated.includes('fs.utimesSync(file, when, when)'), 'LAMP B removed the backdate')
  const mutant = join(SCRATCH, 'lamp-b.mjs')
  writeFileSync(mutant, mutated)
  const mod = await import(pathToFileURL(mutant).href)
  const layer = join(SCRATCH, 'lamp-b-layer')
  const generatedAt = agoIso(60_000)
  mod.copyCorpus(layer, CORPUS, generatedAt)
  const fixture = writeReportFixture('lamp-b', layer, generatedAt)
  const verdict = judge(fixture, generatedAt)
  assert.ok(verdict.stale, 'the pre-fix copy is judged stale: this is the CI red, reproduced without a Linux box: ' + JSON.stringify(verdict.codes))
  assert.match(verdict.stale.message, /predates the newest receipt/, 'the reproduced refusal is the CI one, sentence for sentence: ' + verdict.stale.message)
})

test('§4 run.mjs consumes the module and no call site can forget (CORPUS, generatedAt)', () => {
  const src = readFileSync(RUN_MOD, 'utf8')
  assert.ok(src.includes("from './corpus-copy.mjs'"), 'run.mjs imports the dated copy instead of keeping a local cpSync')
  assert.ok(!/function\s+copyCorpus\s*\(/.test(src), 'run.mjs no longer defines its own copyCorpus (a local copy would drift from the pin)')
  const calls = src.split(NL).filter((line) => line.includes('copyCorpus('))
  assert.ok(calls.length >= 10, 'there are copy call sites to check: ' + calls.length)
  for (const line of calls) {
    assert.match(line.trim(), /copyCorpus\(.*, CORPUS, ctx\.generatedAt\)$/, 'every call passes the corpus and the generatedAt the report will carry: ' + line.trim())
  }
  assert.equal(typeof copyCorpus, 'function', 'the module exports the copy the runner imports')
})
