#!/usr/bin/env node
// tests/vmu-run177-final-rollback.test.mjs — RUN 177 (real machine, run 22 / FEEDBACK22 D1/D4).
//
// THE DEFECT THIS PINS (measured on the real machine, run 22, build 2c8ffef5 + RUN 176):
//   RUN 176 taught `kit/paper.js#recordFinal` to refuse to finalise a paper whose compile really ran and failed —
//   `finalized:false` + `rolledBack{from,to}` + `reviseAvailable:true`, then `final {decision:"revise"}` reopens
//   writing. On the real machine the paper finalised anyway. Root cause: the LaTeX face reports `tried` as STRUCTURED
//   entries (`{engine, phase, code}`), so the classification `String(t).includes(':compile')` was the string
//   `"[object Object]"` and NEVER matched — every real compile failure was read as "this assembly has no LaTeX face"
//   (the env-gap branch that is allowed to finalise). xelatex really exited 1 with `! Undefined control sequence.`
//   and the paper came back `finalized:true` with no `rolledBack` at all.
//   Second half of the same defect: even when the kit answered correctly, the TOOL projection dropped `rolledBack`
//   and `reviseAvailable`, so the receipt named neither the move nor the repair — the agent could only conclude the
//   old bug was back (FEEDBACK22 D1 measured exactly that reading).
//   D4: `final` takes `decision:"deliverable"|"revise"`, `review` takes `deliverable:true|false`; the first honest
//   `review {decision:"deliverable"}` attempt came back "deliverable must be true or false" — a sentence about a
//   parameter the caller never passed.
//
// WHAT RUN 177 CHANGES:
//   · `kit/paper.js`: `phaseOf(t)` reads `{phase}` from an object entry and keeps the old `engine:phase[:code]`
//     reading for a bare string; `reachedCompile` is `phaseOf(t) === 'compile'`. The env-gap branch (EXECUTOR_MISSING
//     / NO_ENGINE / probe-only) still finalises, and now says so with `pdfEnvironmentMissing`.
//   · `packs/v5r/tools.js`: the `final` projection carries `rolledBack{from,to,keptEarlierFinal}`, `reviseAvailable`,
//     `pdfEnvironmentMissing` + `pdfEnvironmentMeans`; `review` names its own parameter when the caller passes
//     `decision`.
//
// RULE E: every collection assertion states its non-emptiness in the same expression.
//
// Run: node tests/vmu-run177-final-rollback.test.mjs
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { mkdtemp, mkdir } from 'node:fs/promises'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const KIT = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')
const PACK_PAPER = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const KIT_SRC = readFileSync(KIT, 'utf8')
const TOOLS_SRC = readFileSync(TOOLS, 'utf8')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ✓ ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  console.log('  ✗ ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}

const pack = await import(pathToFileURL(PACK_PAPER).href)

// ── the kit harness (same shape as run 154: a Map-backed records face + an injectable LaTeX face) ────────────────
function makeKernel(settings, roster) {
  const rows = new Map()
  let seq = 0
  const kernel = {
    settingsSnapshot: () => ({ ...settings }),
    members: { roster: () => roster.slice() },
    records: {
      put(r) {
        const id = r.id || ('row-' + (++seq))
        const prev = rows.get(id) || {}
        seq += 1
        const row = { ...prev, ...r, id, rev: (prev.rev || 0) + 1, updatedAt: seq, fingerprint: 'fp-' + id + '-' + seq }
        rows.set(id, row)
        return { id, rev: row.rev, fingerprint: row.fingerprint }
      },
      get({ id }) { return { record: rows.get(id) || null } },
      list({ track, limit } = {}) {
        const items = [...rows.values()].filter((r) => !track || r.track === track)
        return { items: typeof limit === 'number' && limit > 0 ? items.slice(0, limit) : items }
      },
    },
  }
  return { kernel, rows }
}
const ROSTER = [
  { id: 'acad', slot: 'chair' },
  { id: 'r-1', slot: 'member' },
  { id: 'r-2', slot: 'member' },
]
const BASE = { 'vmu.records.tracks': ['paper'], 'vmu.paper.officeConsult': 'off' }
const bootKit = (extra = {}, latex = null) => {
  const settings = { ...BASE, ...extra }
  const { kernel, rows } = makeKernel(settings, ROSTER)
  if (latex) kernel.latex = latex
  // The quality gate (RUN 172/E3) demands each part carry >=1 evidence entry that RESOLVES to a real record with a
  // fingerprint — the same requirement the real machine enforces. Seed the proposition the parts cite, so these cases
  // judge the FINALISATION rule and not the evidence rule.
  kernel.records.put({ id: 'rec-1', track: 'propositions', kind: 'proposition', title: '前 n 个奇数之和 = n²',
    body: JSON.stringify({ p: 1, statement: '前 n 个奇数之和 = n²' }), by: 'r-acad' })
  const flow = pack.createPaperSubsystem({ kernel, clock: () => 1 })
  return { flow, kernel, rows }
}
const stateOf = (flow, T) => { const got = flow.state(T); return got && got.state ? got.state : null }
const refusalOf = async (fn) => { try { await fn(); return null } catch (e) { return e } }

/** Write one part per participant, cross-review both deliverable, and ADVANCE to awaiting-editor. */
function toAwaitingEditor(flow, T, mids = ['r-1', 'r-2']) {
  if (stateOf(flow, T) === null) flow.start({ target: T, participants: mids })
  for (const m of mids) flow.recordPart({ target: T, member: m, title: m + ' 的部分', solution: m + ' 的解', evidence: ['rec-1'] })
  flow.advance({ target: T })              // writing → reviewing
  for (const m of mids) flow.recordReview({ target: T, member: m, deliverable: true, comments: '可交付' })
  return flow.advance({ target: T })       // evaluating → awaiting-editor
}

/**
 * The LaTeX face the REAL assembly has: `check` answers structured `tried` entries.
 * `mode` is 'fail' | 'ok'; the kill switch lets one paper fail and a later paper succeed.
 */
function fakeLatex(mode) {
  const face = { calls: [], mode }
  face.check = async (req) => {
    face.calls.push(req)
    const tried = [
      { engine: 'xelatex', phase: 'probe', available: true },
      { engine: 'xelatex', phase: 'compile', available: true, exitCode: face.mode === 'fail' ? 1 : 0, stderr: face.mode === 'fail' ? '! Undefined control sequence.' : '' },
    ]
    if (face.mode === 'fail') {
      return { ok: false, code: 'VMU_PAPER_LATEX_FAILED', engine: 'xelatex', tried,
        argv: ['-interaction=nonstopmode', '-halt-on-error', '-output-directory=D:/x', 'D:/x/p.tex'],
        outDir: 'D:/x', stderr: '! Undefined control sequence.\n<recently read> \\zzznotacommand', stdout: '',
        message: 'the LaTeX compile exited 1' }
    }
    return { ok: true, engine: 'xelatex', tried, pdfPath: 'D:/x/p.pdf', pdfBytes: 4321, outDir: 'D:/x',
      argv: ['-interaction=nonstopmode', '-halt-on-error', '-output-directory=D:/x', 'D:/x/p.tex'] }
  }
  return face
}

// ── §0 the source says what this pins ────────────────────────────────────────────────────────────────────────────
{
  ok(/const phaseOf = \(t\) => \{/.test(KIT_SRC) && /phaseOf\(t\) === 'compile'/.test(KIT_SRC),
    '§0 the compile-phase test reads the OBJECT shape the face really returns (RUN 176 read `String(t)`, i.e. "[object Object]")')
  ok(/return String\(t\.phase === undefined \|\| t\.phase === null \? '' : t\.phase\)/.test(KIT_SRC),
    '§0 …by taking `phase` from a structured entry, so "an engine RAN" and "no engine exists" stay different facts')
  ok(/rolledBack: finalized\.rolledBack \? \{/.test(TOOLS_SRC) && /reviseAvailable: finalized\.reviseAvailable === true/.test(TOOLS_SRC) &&
    /pdfEnvironmentMissing: finalized\.pdfEnvironmentMissing === true/.test(TOOLS_SRC),
    '§0 the `final` receipt carries the rollback branch, the repair path and the env-gap disclosure')
  ok(/review takes `deliverable: true\|false`/.test(TOOLS_SRC),
    '§0 `review` names its own parameter instead of the kernel talking about a value the caller never passed')
}

// ── §1 a compile that really RAN and failed does NOT finalise, and revise is reachable ────────────────────────────
{
  const latex = fakeLatex('fail')
  const { flow } = bootKit({}, latex)
  const T = 'paper-r177-a'
  toAwaitingEditor(flow, T)
  ok(stateOf(flow, T).status === 'awaiting-editor', '§1 setup: the paper reached awaiting-editor', stateOf(flow, T).status)
  const fin = await flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable' })
  ok(latex.calls.length === 1, '§1 the compile really ran (the face was called once)', latex.calls.length)
  ok(fin && fin.ok === true, '§1 the call itself succeeds (a refused artefact is a named outcome, not a throw)', fin && fin.ok)
  ok(fin && fin.finalized === false, '§1 ★★ the paper is NOT finalised when the compile failed', fin && { finalized: fin.finalized, pdf: fin.pdf && fin.pdf.code })
  ok(fin && fin.pdf && fin.pdf.ok === false && fin.pdf.code === 'VMU_PACK_V5R_CORE_PAPER_PDF_FAILED',
    '§1 ★★ …and the receipt carries the compiler\'s own code', fin && fin.pdf && { ok: fin.pdf.ok, code: fin.pdf.code })
  ok(fin && fin.rolledBack && fin.rolledBack.from === 'finalized' && fin.rolledBack.to === 'awaiting-editor',
    '§1 ★★ the receipt names the move it undid', fin && fin.rolledBack)
  ok(fin && fin.reviseAvailable === true, '§1 ★★ …and names the call that repairs the body', fin && fin.reviseAvailable)
  ok(stateOf(flow, T).status === 'awaiting-editor', '§1 the durable state really went back (not only the receipt)', stateOf(flow, T).status)
  ok(!stateOf(flow, T).final, '§1 ★★ no `final` stamp survives a failed compile', stateOf(flow, T).final)

  const rev = await flow.recordFinal({ target: T, member: 'acad', decision: 'revise', note: '换个写法' })
  ok(rev && rev.finalized === false && rev.to === 'writing',
    '§1 ★★ `final {decision:"revise"}` really reopens writing after the rollback', rev && { finalized: rev.finalized, to: rev.to })
  ok(stateOf(flow, T).status === 'writing', '§1 …and the state agrees', stateOf(flow, T).status)
}

// ── §2 the SAME paper can be repaired and finalised once the body compiles ─────────────────────────────────────────
{
  const latex = fakeLatex('fail')
  const { flow } = bootKit({}, latex)
  const T = 'paper-r177-b'
  toAwaitingEditor(flow, T)
  const failed = await flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable' })
  ok(failed && failed.finalized === false, '§2 setup: the first finalisation rolled back', failed && failed.finalized)
  flow.recordFinal({ target: T, member: 'acad', decision: 'revise', note: '修掉坏命令' })
  latex.mode = 'ok'
  flow.recordPart({ target: T, member: 'r-1', title: 'r-1 的部分（修订）', solution: 'r-1 的解（无坏命令）', evidence: ['rec-1'] })
  flow.recordPart({ target: T, member: 'r-2', title: 'r-2 的部分（修订）', solution: 'r-2 的解', evidence: ['rec-1'] })
  flow.advance({ target: T })
  flow.recordReview({ target: T, member: 'r-1', deliverable: true, comments: '可交付' })
  flow.recordReview({ target: T, member: 'r-2', deliverable: true, comments: '可交付' })
  flow.advance({ target: T })
  const fin = await flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable' })
  ok(fin && fin.finalized === true && fin.pdf && fin.pdf.ok === true,
    '§2 ★★ the repaired paper finalises for real (fail → revise → fixed body → PDF)', fin && { finalized: fin.finalized, pdf: fin.pdf && fin.pdf.ok })
  ok(stateOf(flow, T).status === 'finalized', '§2 …and the durable state says finalized', stateOf(flow, T).status)
}

// ── §3 "no LaTeX face at all" is a DIFFERENT fact and still finalises, naming the gap ─────────────────────────────
{
  const { flow } = bootKit({}, null)   // no kernel.latex: the env gap, not a failed compile
  const T = 'paper-r177-c'
  toAwaitingEditor(flow, T)
  const fin = await flow.recordFinal({ target: T, member: 'acad', decision: 'deliverable' })
  ok(fin && fin.finalized === true, '§3 the env-gap branch still finalises (a missing seam is not a broken body)', fin && fin.finalized)
  ok(fin && fin.pdfEnvironmentMissing === true, '§3 ★★ …and says so by name instead of looking like a failed compile', fin && fin.pdfEnvironmentMissing)
  ok(fin && fin.pdf && fin.pdf.ok === false && fin.pdf.code === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING',
    '§3 …with the executor code, never a fake success', fin && fin.pdf && fin.pdf.code)
  ok(fin && !fin.rolledBack, '§3 the env gap is not a rollback (nothing was undone)', fin && fin.rolledBack)
}

// ── §4 the TOOL face: the projection carries the branch, and the env gap, and names `deliverable` ─────────────────
{
  const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
  const entry = await import(pathToFileURL(ENTRY).href)
  const mk = async (tag) => { await mkdir(__tmpRoot() + '/r177', { recursive: true }); return mkdtemp(join(__tmpRoot() + '/r177', tag + '-')) }
  let tick = 2000
  const bootTools = async () => {
    const root = await mk('tool')
    const specs = []
    const ctx = {
      effect(fn) { return fn() },
      on() { return () => {} },
      tools: { register: async (spec) => { specs.push(spec); return () => {} } },
    }
    // `settings` live at the TOP of the config object (a nested {settings:{…}} is silently ignored — RUN 166).
    const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => tick++, 'vmu.paper.officeConsult': 'off' })
    await handle.ready()
    const call = async (name, args) => {
      const spec = specs.filter((s) => s.name === name)[0]
      if (!spec) throw new Error('no tool ' + name)
      try { return JSON.parse(await spec.execute(args, {})) } catch (e) {
        return { ok: false, code: (e && e.code) || 'THROW', message: String((e && e.message) || e), hint: (e && e.hint) || null }
      }
    }
    return { handle, kernel: handle.kernel, call }
  }
  const A = await bootTools()
  for (const [id, slot] of [['acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await A.kernel.members.hire({ id, slot, institution: 'inst' })
  tick += 10
  const T = 'paper-r177-tool'
  // A real proposition card, so each part's evidence entry resolves against the real records face (the quality gate
  // requires >=1 resolving evidence entry per part — the same rule the real machine enforces).
  const card = await A.call('vibe_v5_record_proposition', { statement: '前 n 个奇数之和 = n²', value: 1, motive: 'run 177 §4',
    p: 0.6, member: 'r-1' })
  const cardId = String((card && (card.recordId || card.id)) || '')
  ok(cardId !== '', '§4 setup: a proposition card exists to cite', card && (card.code || Object.keys(card || {})))
  await A.call('vibe_v5_paper', { action: 'start', target: T, participants: ['r-1', 'r-2'] })
  for (const m of ['r-1', 'r-2']) await A.call('vibe_v5_paper', { action: 'part', target: T, member: m, part: m + ' 的部分', solution: m + ' 的解法', evidence: [cardId] })
  await A.call('vibe_v5_paper', { action: 'advance', target: T })
  for (const m of ['r-1', 'r-2']) await A.call('vibe_v5_paper', { action: 'review', target: T, member: m, deliverable: true, of: m === 'r-1' ? 'r-2' : 'r-1' })
  const adv = await A.call('vibe_v5_paper', { action: 'advance', target: T })
  ok(adv && adv.ok === true, '§4 setup: the paper reached awaiting-editor', adv && (adv.code || adv.moved || adv.status))
  const fin = await A.call('vibe_v5_paper', { action: 'final', target: T, member: 'acad', decision: 'deliverable' })
  const got = fin && fin.final ? fin.final : null
  ok(got && got.ok === true, '§4 the tool face answered', fin && (fin.code || 'ok'))
  ok(got && got.pdfEnvironmentMissing === true && typeof got.pdfEnvironmentMeans === 'string' && got.pdfEnvironmentMeans.length > 0,
    '§4 ★★ the env gap reaches the RECEIPT by name (RUN 177: the projection used to drop it)', got && { missing: got.pdfEnvironmentMissing })
  ok(got && Object.prototype.hasOwnProperty.call(got, 'rolledBack') && got.rolledBack === null,
    '§4 ★★ `rolledBack` is an explicit null here, not an absent key (value and absence are different statements)', got && got.rolledBack)
  ok(got && got.reviseAvailable === false, '§4 …and `reviseAvailable` is stated either way', got && got.reviseAvailable)

  // D4: `review` must name its own parameter.
  const T2 = 'paper-r177-tool-2'
  await A.call('vibe_v5_paper', { action: 'start', target: T2, participants: ['r-1', 'r-2'] })
  for (const m of ['r-1', 'r-2']) await A.call('vibe_v5_paper', { action: 'part', target: T2, member: m, part: m + ' 的部分', solution: m + ' 的解法', evidence: [cardId] })
  await A.call('vibe_v5_paper', { action: 'advance', target: T2 })
  const bad = await A.call('vibe_v5_paper', { action: 'review', target: T2, member: 'r-1', decision: 'deliverable', of: 'r-2' })
  ok(bad && bad.ok === false && bad.code === 'VMU_INVALID_ARGUMENT',
    '§4 ★★ `review {decision:"deliverable"}` is refused as an argument error', bad && { code: bad.code })
  ok(bad && /review takes `deliverable: true\|false`/.test(String(bad.message || '')) && /decision/.test(String(bad.message || '')),
    '§4 ★★ …and the message names BOTH parameters, not "deliverable must be true or false"', bad && bad.message)
  ok(bad && /deliverable:true/.test(String(bad.hint || '')),
    '§4 …the hint shows the call that works', bad && bad.hint)
  const good = await A.call('vibe_v5_paper', { action: 'review', target: T2, member: 'r-1', deliverable: true, of: 'r-2' })
  ok(good && good.ok === true && good.review && good.review.recorded === 'r-1',
    '§4 ★★ the corrected call is accepted (the refusal taught a reachable repair)', good && (good.code || good.review && good.review.recorded))
}

// ── §5 the prose is judged where it is typed: a pointer that names no record fails at `part`, not at `final` ───────
{
  const QUALITY = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')
  const qualitySrc = readFileSync(QUALITY, 'utf8')
  ok(/export function checkProsePointers/.test(qualitySrc) && /checkProsePointers\(\{ text, records: view && view\.records/.test(readFileSync(PACK_PAPER, 'utf8')),
    '§5 ★★ the pack resolves the prose pointers through the same records face as the evidence list')
  ok(/paper\.prosePointers\(proseText\)/.test(TOOLS_SRC),
    '§5 ★★ …and the `part` action actually calls it before recording a body')

  const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
  const entry = await import(pathToFileURL(ENTRY).href)
  let tick = 5000
  const root = await mkdtemp(join('D:/_tmp/r177', 'prose-'))
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => tick++, 'vmu.paper.officeConsult': 'off' })
  await handle.ready()
  const call = async (name, args) => {
    const spec = specs.filter((x) => x.name === name)[0]
    try { return JSON.parse(await spec.execute(args, {})) } catch (e) {
      return { ok: false, code: (e && e.code) || 'THROW', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  for (const [id, slot] of [['acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]) await handle.kernel.members.hire({ id, slot, institution: 'inst' })
  tick += 10
  const card = await call('vibe_v5_record_proposition', { statement: '偶数可以写成两个素数之和的弱形式', value: 1, motive: 'run 177 §5', p: 0.6, member: 'r-1' })
  const cardId = String((card && (card.recordId || card.id)) || '')
  ok(cardId !== '', '§5 setup: a real card exists to cite', card && card.code)
  const T = 'paper-r177-prose'
  await call('vibe_v5_paper', { action: 'start', target: T, participants: ['r-1', 'r-2'] })

  const bad = await call('vibe_v5_paper', { action: 'part', target: T, member: 'r-1', part: 'r-1 的部分',
    solution: '依据可寻址的一处：Members/r-1/Propos/run177-not-a-record.md#二 的说法。', evidence: [cardId] })
  ok(bad && bad.ok === false && bad.code === 'VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN',
    '§5 ★★ a prose pointer naming no record is refused AT THE WRITING STEP (run 22 failed only at render)', bad && { code: bad.code })
  ok(bad && /run177-not-a-record/.test(String(bad.message || '')) && /no-such-record/.test(String(bad.message || '')),
    '§5 ★★ …the message names the pointer and why it fails', bad && bad.message)
  ok(bad && /记录 id/.test(String(bad.hint || '')),
    '§5 …and the hint says the path is resolved by RECORD ID, not by file name', bad && bad.hint)

  const good = await call('vibe_v5_paper', { action: 'part', target: T, member: 'r-1', part: 'r-1 的部分（改正）',
    solution: '依据可寻址的一处：Members/r-1/Propos/' + cardId + '.md#二 的说法。', evidence: [cardId] })
  ok(good && good.ok === true && good.part && good.part.recorded === 'r-1',
    '§5 ★★ the same body written with the RECORD id is accepted (the refusal taught a reachable repair)', good && (good.code ? [good.code, good.message, good.hint] : good.recorded))
}

// ── §6 an UPDATE that restores an earlier body must be WRITTEN, not deduplicated away ────────────────────────────
// The rollback in §1 writes the pre-final body back. On the real machine that write hit the kernel's dedupe branch:
// `put` never refreshed `byFingerprint` when it REWROTE a row, so the OLD body's fingerprint still pointed at that
// same id, the restored body computed to that same fingerprint, and `put` answered `{deduplicated:true}` WITHOUT
// writing — the receipt said "not finalised" while the row on disk stayed `finalized`. This section pins the kernel
// half of the repair: an update names the row it rewrites, so it is always written; dedupe still applies to ADDS.
{
  const kernelSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
  ok(/if \(!isUpdate && fpIndex\.has\(fp\)\)/.test(kernelSrc),
    '§6 ★★ the source: dedupe is skipped for an UPDATE (`!isUpdate && fpIndex.has(fp)`)')
  ok(/if \(isUpdate && existingRow && existingRow\.fingerprint && fpIndex\.get\(existingRow\.fingerprint\) === existingRow\.id\) fpIndex\.delete/.test(kernelSrc),
    '§6 ★★ …and the rewritten row drops its OWN stale fingerprint from the index')

  const { mkdtemp } = await import('node:fs/promises')
  const entry = await import(pathToFileURL(ENTRY).href)
  const root = await mkdtemp(join('D:/_tmp', 'r177-dedupe-'))
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (s) => { specs.push(s); return () => {} } } }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => 7000 })
  await handle.ready()
  const rc = handle.kernel.records
  const first = rc.put({ track: 'propositions', kind: 'proposition', title: 'dedupe 探针', body: 'body v1', by: 'r-acad' })
  ok(!!first && !!first.id && first.deduplicated === false, '§6 前提：第一版写入成功（新行）', first && { id: first.id, dedup: first.deduplicated })
  const second = rc.put({ id: first.id, track: 'propositions', kind: 'proposition', title: 'dedupe 探针', body: 'body v2', by: 'r-acad' })
  ok(!!second && second.deduplicated === false, '§6 ★ an UPDATE to a new body is written (deduplicated:false)', second && second.deduplicated)
  ok(String(rc.get({ id: first.id }).record ? rc.get({ id: first.id }).record.body : rc.get({ id: first.id }).body).includes('body v2'),
    '§6 …and the row on disk carries it', rc.get({ id: first.id }))
  const back = rc.put({ id: first.id, track: 'propositions', kind: 'proposition', title: 'dedupe 探针', body: 'body v1', by: 'r-acad' })
  ok(!!back && back.deduplicated === false,
    '§6 ★★★ the UPDATE that restores the EARLIER body is still written (this is the write the rollback needs)', back && back.deduplicated)
  const fullBack = rc.get({ id: first.id })
  const bodyBack = fullBack && fullBack.record ? fullBack.record.body : (fullBack ? fullBack.body : null)
  ok(String(bodyBack).includes('body v1'), '§6 ★★★ …and the row really went back to v1 (the silent no-op is gone)', String(bodyBack).slice(0, 40))
  const added = rc.put({ track: 'propositions', kind: 'proposition', title: 'dedupe 探针 副本', body: 'body v1', by: 'r-acad' })
  ok(!!added && added.deduplicated === true, '§6 ★ dedupe STILL bites for an ADD of identical content (the policy is unchanged)', added && added.deduplicated)
}

// ── summary ──────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\n=== RUN 177 FINAL ROLLBACK: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failures:')
  for (const f of failures) console.log('  · ' + f)
  process.exit(1)
}
