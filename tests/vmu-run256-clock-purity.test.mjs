// RUN 256 / TB-2623 — 时钟纯净（clock purity）
//
// WHAT THIS SUITE PINS (and why it is not a shape test):
//   The defect was MIXED STAMPS: a kernel booted with an injected clock wrote `scheduledFor`-style numbers from that
//   clock while `authors[].at` came from the wall clock, in the same product, sometimes in the same receipt. So the
//   criterion is not "the field exists" and not "the value is a number" — it is: with a clock ten-plus years away from
//   the wall clock, EVERY stamp that lands on disk or in a receipt is near the injected instant, and NO stamp is near
//   the wall clock. Both directions are asserted, because either one alone can pass by accident (a field omitted ⇒
//   nothing is near the wall clock; a field copied ⇒ nothing is near the injected instant).
//
//   Shapes covered: ① numeric-millisecond injected kernel clock (the normal case) ② an ISO-8601 string supplied at the
//   MODULE level (`proposeBlueprint({ at })`) ③ a clock that ADVANCES, so "two instants differ by the advance" is
//   measured rather than assumed ④ the kernel refusing an ISO-string CLOCK by name (clockguard normalises to numbers;
//   that is the declared boundary, not a silent wall-clock fallback) ⑤ the single named wall-clock fallback, counted
//   and reported by `atSource:"wall-clock"` / `paper.clockSource()`, so a fallback stamp can never be read as injected.
//
//   The static side is pinned too: `tests/audit-clock-purity.mjs` enumerates every product wall-clock read, and its
//   mutant proves the scanner is not blind (a synthetic Date.now() must be reported).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { spawnSync } from 'node:child_process'
import { auditClockPurity } from './audit-clock-purity.mjs'

const REPO = join(import.meta.dirname, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const ENTRY = join(VMU, 'vibe-math-vmu.js')
const INJECTED = 1_000_000_000_000 // 2001-09-09T01:46:40.000Z — more than ten years from any run of this suite
const INJECTED_ISO = '2001-09-09T01:46:40.000Z'
const WALL_YEAR = String(new Date().getUTCFullYear())

const BP = await import(pathToFileURL(join(VMU, 'packs/v5r/blueprint.js')).href)
const PAPER = await import(pathToFileURL(join(VMU, 'packs/v5r/paper.js')).href)

let assertions = 0
const ok = (cond, msg) => { assertions += 1; assert.ok(cond, msg) }
const eq = (a, b, msg) => { assertions += 1; assert.deepEqual(a, b, msg) }

function stampMs(value) {
  const text = String(value)
  const ms = text.indexOf('T') > 0 ? Date.parse(text) : Number(text)
  return Number.isFinite(ms) ? ms : NaN
}

function wallYearIn(text) {
  return String(text).indexOf(WALL_YEAR) >= 0
}

async function boot({ clock, root }) {
  const entry = await import(pathToFileURL(ENTRY).href)
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { clock, packs: ['v5r'], root })
  await handle.ready()
  const kernel = handle.kernel
  await kernel.store.open()
  await kernel.members.hire({ id: 'acad-01', slot: 'chair', institution: 'sim' })
  await kernel.members.hire({ id: 'r-1', slot: 'member', institution: 'sim' })
  const call = async (name, args) => {
    const spec = specs.filter((row) => row.name === name)[0]
    if (!spec) throw new Error('no tool declared: ' + name)
    const out = await spec.execute(args, { kernel })
    return typeof out === 'string' ? JSON.parse(out) : out
  }
  return { handle, kernel, call, root }
}

test('RUN 256 clock purity', async (t) => {
  const dirs = []
  const mk = (tag) => {
    const dir = mkdtempSync(join(tmpdir(), 'vmu-run256-' + tag + '-'))
    dirs.push(dir)
    return dir
  }

  try {
    // ── §1 codesign/adopt write path: the stamps are the INJECTED instants, not the wall clock ─────────────────────
    const a = await boot({ clock: () => INJECTED, root: mk('a') })
    const p1 = await a.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'acad-01', text: '院士的设计', materialize: true })
    ok(p1.ok === true, '§1a start a draft')
    ok(p1.atSource === 'kernel-clock', '§1b the draft receipt names the kernel clock as the stamp source, got ' + String(p1.atSource))
    eq(p1.authors[0].at, INJECTED_ISO, '§1c authors[0].at is the injected instant')
    ok(p1.clockSources.wallClockReads === 0, '§1d zero wall-clock reads on the injected path')
    const p1Text = JSON.stringify(p1)
    ok(!wallYearIn(p1Text), '§1e no ' + WALL_YEAR + ' stamp anywhere in the draft receipt (mixed stamps would show here)')
    ok(p1Text.indexOf(INJECTED_ISO) >= 0, '§1f the injected instant is actually printed (not merely absent from the wall year)')

    const p2 = await a.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Protocol.md', member: 'r-1', text: '研究员的补充', materialize: true })
    ok(p2.ok === true, '§1g the continuation files')
    eq(p2.authors[1].at, INJECTED_ISO, '§1h the second author is stamped with the injected instant too')
    eq(p2.authors[1].updatedAt, INJECTED_ISO, '§1i the author revision stamp follows the same clock')

    const adopted = await a.call('vibe_v5_blueprint', { action: 'adopt', path: 'Shared/Protocol.md', member: 'acad-01', draft: p2.id })
    ok(adopted.ok === true, '§1j adopt succeeds')
    eq(adopted.adoptedAt, INJECTED, '§1k adoptedAt is the injected instant, in milliseconds')
    ok(adopted.atSource === 'kernel-clock', '§1l the adopt receipt names the kernel clock')
    ok(adopted.clockSources.wallClockReads === 0, '§1m adopt read no wall clock')
    ok(!wallYearIn(JSON.stringify(adopted)), '§1n no ' + WALL_YEAR + ' value in the adopt receipt')
    // The draft md is the durable artifact the corpus replays: its bytes must not carry a wall stamp either.
    const draftBytes = readFileSync(join(a.root, 'VibeMath', 'Shared', 'Drafts', 'Protocol-r1.md'), 'utf8')
    ok(!wallYearIn(draftBytes), '§1o the draft md on disk carries no ' + WALL_YEAR + ' stamp')
    ok(draftBytes.indexOf(INJECTED_ISO) >= 0, '§1p the draft md on disk carries the injected instant')

    // ── §2 state read face ─────────────────────────────────────────────────────────────────────────────────────────
    const state = await a.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Protocol.md' })
    eq(state.stamp, INJECTED, '§2a state.stamp is the injected instant')
    ok(state.stampSource === 'kernel-clock', '§2b state names the kernel clock as the stamp source, got ' + String(state.stampSource))
    ok(!wallYearIn(JSON.stringify(state)), '§2c no ' + WALL_YEAR + ' value in the state receipt')

    // ── §3 records write path: the ledger row is stamped by the same clock ────────────────────────────────────────
    const rec = await a.call('vibe_v5_record_proposition', { member: 'r-1', statement: '命题一', value: 'objects', motive: '动机一', p: 0.5 })
    ok(rec.ok === true, '§3a the ledger row is filed')
    const recId = rec.recordId || (rec.record && rec.record.id) || null
    const got = await a.kernel.records.get({ id: recId })
    eq(got.at, INJECTED, '§3b records row at is the injected instant')
    ok(!wallYearIn(JSON.stringify(got)), '§3c the stored row carries no ' + WALL_YEAR + ' value')

    // ── §4 paper write path (the fourth measured path; it used to ignore the kernel clock silently) ───────────────
    const started = await a.call('vibe_v5_paper', { action: 'start', title: 'Paper P1', participants: ['acad-01', 'r-1'], member: 'acad-01' })
    ok(started.ok === true, '§4a the paper starts')
    const paperState = await a.call('vibe_v5_paper', { action: 'status', target: 'Paper P1', member: 'acad-01' })
    ok(paperState.ok === true, '§4b the paper status is readable')
    ok(paperState.paperClock && paperState.paperClock.injected === true, '§4c the paper face reports an INJECTED clock')
    ok(paperState.paperClock.source === 'kernel-clock', '§4d the paper face names the kernel clock, got ' + String(paperState.paperClock && paperState.paperClock.source))
    ok(paperState.paperClock.wallClockReads === 0, '§4e the paper face read the wall clock zero times')
    const paperRow = await a.kernel.records.get({ id: paperState.paper.stateRecordId })
    eq(paperRow.at, INJECTED, '§4f the paper state row at is the injected instant')
    ok(!wallYearIn(JSON.stringify(paperState)), '§4g no ' + WALL_YEAR + ' value in the paper status receipt')
    // A part write stamps a row too; the same clock must reach it.
    const part = await a.call('vibe_v5_paper', { action: 'part', target: 'Paper P1', member: 'acad-01', part: '引言', body: '引言正文' })
    ok(part.ok === true, '§4h a paper part is written')
    ok(!wallYearIn(JSON.stringify(part)), '§4i no ' + WALL_YEAR + ' value in the part receipt')

    // ── §5 advancing clock: the DIFFERENCE between two stamps equals the advance (not merely "both near") ────────
    let nowMs = 1_500_000_000_000
    const b = await boot({ clock: () => nowMs, root: mk('b') })
    const q1 = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Advance.md', member: 'acad-01', text: '第一版', materialize: true })
    nowMs += 60_000
    const q1b = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Advance.md', member: 'r-1', text: '第二版', materialize: true })
    nowMs += 60_000
    const q2 = await b.call('vibe_v5_blueprint', { action: 'adopt', path: 'Shared/Advance.md', member: 'acad-01', draft: q1b.id })
    ok(q2.ok === true, '§5a the advancing-clock adopt succeeds')
    const advance = stampMs(q2.adoptedAt)
    const firstStamp = stampMs(q1.authors[0].at)
    eq(advance - firstStamp, 120_000, '§5b the two instants differ by exactly the injected advance')
    eq(stampMs(q1b.authors[1].at) - firstStamp, 60_000, '§5c the intermediate author stamp tracks the intermediate advance')
    ok(!wallYearIn(JSON.stringify(q2)), '§5d the advancing-clock receipt carries no ' + WALL_YEAR + ' value')

    // ── §6 ISO-8601 supplied at the MODULE level is honoured as a clock, not treated as garbage ──────────────────
    const c = await boot({ clock: () => INJECTED, root: mk('c') })
    const iso = BP.proposeBlueprint({ records: c.kernel.records, path: 'Shared/Iso.md', by: 'acad-01', seat: 'chair', text: 'ISO 正文', materialize: true, at: INJECTED_ISO })
    ok(iso.ok === true, '§6a module-level propose with an ISO instant succeeds')
    eq(iso.authors[0].at, INJECTED_ISO, '§6b the ISO instant is stored verbatim')
    ok(iso.atSource === 'kernel-clock', '§6c an ISO instant is NOT a wall-clock read')
    ok(iso.clockSources.wallClockReads === 0, '§6d the ISO path read the wall clock zero times')

    // ── §7 the kernel REFUSES an ISO-string CLOCK by name (clockguard normalises to numbers) ─────────────────────
    let isoKernel = null
    try {
      isoKernel = await boot({ clock: () => INJECTED_ISO, root: mk('d') })
    } catch (e) {
      isoKernel = { refused: { code: e && e.code, message: String(e && e.message) } }
    }
    let isoNow = null
    if (isoKernel && isoKernel.kernel) {
      try { isoNow = isoKernel.kernel.clockguard.now() } catch (e) { isoNow = { code: e && e.code } }
    }
    const isoRefusal = isoKernel && isoKernel.refused ? isoKernel.refused.code : (isoNow && isoNow.code)
    ok(isoRefusal === 'VMU_CLOCK_UNGUARDED', '§7a an ISO-string kernel clock is refused by name, got ' + String(isoRefusal))

    // ── §8 the single named wall-clock fallback is COUNTED and NAMED (never silent) ───────────────────────────────
    // RUN 259 / P1-2 (AUDIT-14): an unusable instant is NO LONGER silently replaced by the wall clock. The fallback
    // covers an ABSENT instant (no `at` at all); a garbage string must be refused BY NAME and must not read the wall
    // clock, because a clock defect has to LOOK DIFFERENT from a clock reading (§8x below pins that).
    const fallback = BP.proposeBlueprint({ records: c.kernel.records, path: 'Shared/Fallback.md', by: 'acad-01', seat: 'chair', text: '无钟正文', materialize: true })
    ok(fallback.ok === true, '§8a a propose with NO instant at all still files (the fallback is allowed to exist)')
    ok(fallback.atSource === 'wall-clock', '§8b the receipt NAMES the wall clock, got ' + String(fallback.atSource))
    ok(fallback.clockSources.wallClockReads >= 1, '§8c the fallback read is counted')
    ok(fallback.clockSources.sites.indexOf('proposeBlueprint') >= 0, '§8d the fallback names the site that read it')
    ok(stampMs(fallback.authors[0].at) > Date.parse('2020-01-01T00:00:00.000Z'), '§8e the fallback stamp is a real wall instant (so a reader can tell it apart)')
    // The paper subsystem has the same rule: no clock, no readable kernel clock ⇒ reported, not silent. The kit needs a
    // records face, so the fallback case uses the same kernel minus its clockguard (a prototype view) — the ONLY thing
    // missing is the clock, which is exactly the situation the fallback exists for.
    const noClockKernel = Object.create(c.kernel)
    Object.defineProperty(noClockKernel, 'clockguard', { value: null, enumerable: false })
    const wallPaper = PAPER.createPaperSubsystem({ kernel: noClockKernel })
    const wallPaperSource = wallPaper.clockSource()
    ok(wallPaperSource.injected === false, '§8f a paper subsystem with no clock and no readable kernel clock reports injected:false')
    ok(wallPaperSource.source === 'wall-clock', '§8g and names the wall clock')
    ok(wallPaperSource.means.indexOf('wall-clock') >= 0, '§8h and says in words that its stamps are not reproducible')
    const kernelPaper = PAPER.createPaperSubsystem({ kernel: c.kernel })
    ok(kernelPaper.clockSource().injected === true, '§8i the same factory WITH a kernel clock resolves it')
    ok(kernelPaper.clockSource().source === 'kernel-clock', '§8j and names it')

    // ── §8x an UNUSABLE instant is refused by name and does NOT silently become the wall clock (RUN 259 / P1-2) ────
    const readsBefore = BP.blueprintClockSourcesOf().wallClockReads
    let garbage = null
    try {
      garbage = BP.proposeBlueprint({ records: c.kernel.records, path: 'Shared/Garbage.md', by: 'acad-01', seat: 'chair', text: '坏钟正文', materialize: true, at: 'not-an-instant' })
    } catch (e) {
      garbage = { refused: { code: e && e.code, message: String(e && e.message), hint: String(e && e.hint) } }
    }
    ok(garbage && garbage.refused && garbage.refused.code === 'VMU_V5R_CLOCK_VALUE_INVALID', '§8x1 a garbage instant is refused by NAME, got ' + JSON.stringify(garbage && (garbage.refused ? garbage.refused.code : garbage.atSource ? garbage.atSource : garbage.ok)))
    ok(String(garbage.refused.message).indexOf('not-an-instant') >= 0, '§8x2 the refusal names the offending value')
    eq(BP.blueprintClockSourcesOf().wallClockReads, readsBefore, '§8x3 the refused call did NOT touch the wall clock (a broken clock must not look like a clock reading)')
    ok(existsSync(join(c.root, 'VibeMath', 'Shared', 'Drafts', 'Garbage-r1.md')) === false, '§8x4 the refused call wrote no draft file')

    // ── §9 two runs under the same clock are byte-identical on the durable artifact ──────────────────────────────
    const runOnce = async (tag) => {
      const k = await boot({ clock: () => INJECTED, root: mk(tag) })
      const one = await k.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Same.md', member: 'acad-01', text: '同样的正文', materialize: true })
      const two = await k.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Same.md', member: 'r-1', text: '同样的补充', materialize: true })
      const three = await k.call('vibe_v5_blueprint', { action: 'adopt', path: 'Shared/Same.md', member: 'acad-01', draft: two.id })
      return { one, two, three, md: readFileSync(join(k.root, 'VibeMath', 'Shared', 'Drafts', 'Same-r1.md'), 'utf8') }
    }
    const first = await runOnce('e1')
    const second = await runOnce('e2')
    eq(first.md, second.md, '§9a the draft md is byte-identical across two runs under one clock')
    eq(JSON.stringify(first.one.authors), JSON.stringify(second.one.authors), '§9b the author stamps are identical across runs')
    eq(first.three.adoptedAt, second.three.adoptedAt, '§9c the adopt instant is identical across runs')
    ok(!wallYearIn(first.md) && !wallYearIn(second.md), '§9d neither run leaked a ' + WALL_YEAR + ' stamp into the artifact')

    // ── §10 static enumeration: every remaining product wall-clock read is explained, and the scanner is not blind ─
    const audit = auditClockPurity({ repo: REPO })
    ok(audit.findings.length === 0, '§10a no unexplained product wall-clock read, got ' + audit.findings.length)
    ok(audit.scannedFiles >= 150, '§10b the scan really walked the product tree, got ' + String(audit.scannedFiles))
    ok(audit.ok === true, '§10c the audit verdict agrees with its findings list')
    // The mutant is the scanner's own negative control: it plants a Date.now() and demands the scanner report it, so a
    // broken regex cannot masquerade as a clean tree. It runs in the CLI (where a silent scanner exits non-zero).
    const cliRun = spawnSync(process.execPath, ['tests/audit-clock-purity.mjs'], { cwd: REPO, encoding: 'utf8' })
    ok(cliRun.status === 0, '§10d the audit CLI exits 0 on the current tree, got ' + String(cliRun.status))
    ok(String(cliRun.stdout).indexOf('mutant: a synthetic Date.now() IS reported') >= 0, '§10e the CLI mutant proves the scanner is not blind')
    ok(audit.allowed.some((row) => row.file === 'vibe-math-vmu/packs/v5r/blueprint.js'), '§10f the one blueprint fallback is an EXPLAINED allowed read')
    ok(audit.allowed.some((row) => row.file === 'vibe-math-vmu/packs/v5r/paper.js'), '§10g the one paper fallback is an EXPLAINED allowed read')
    ok(audit.legacy.some((row) => row.file === 'vibe-math-vmu/kernel/turn/index.js'), '§10h the forbidden-file reads are enumerated as legacy, not silently ignored')

    console.log('[run256-clock] assertions=' + String(assertions))
  } finally {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
  }
})

