#!/usr/bin/env node
// vmu RUN 49 — THE VERIFIED TRACK IS A PLACE, NOT A LABEL.
//
// THE OBSERVED DEFECT (live run 49, the chair's report in chat msg-7 + feedback rec-14 and the receipts around it):
// the chair could read the verified row it had just written; the MEMBER looking at its own proposition
// (`vibe_v5_read_library{member:"r-1"}`) had no readiness field at all, so "is my proposition verified?" had no
// answer the member could read — the fact lived in the chair's head and in a row the member had to find by eye.
//
// THE MECHANISM: `toolReadLibrary` (vibe-math-vmu/kit/handlers.js) listed rows verbatim. Readiness is decided by the
// verified track (its one write path is `promoteVerified`), but the read face never joined the two: `ready` did not
// exist, so ABSENT and FALSE were the same observable.
//
// WHAT THIS SUITE PROVES: (1) a member's proposition whose claim a verified row states reads `ready:true`, naming
// that row and its conclusion; (2) a proposition with no verified row over it reads `ready:false` WITH the reason;
// (3) reading changes nothing (verified count and the row's rev are stable); (4) other tracks are not decorated;
// (5) the receipt says whether it could read the verified track at all.
//
// NOTE ON THE FIXTURE: the verified row is written with `composeVerifiedBody` — the same composer `promoteVerified`
// uses (its write face has its own suite, tests/vmu-verified-track). This suite is about the READ side, so it puts
// that row in place directly instead of re-running a debate.
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const VERIFIED = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verified.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const verified = await import(pathToFileURL(VERIFIED).href)
let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, ctx) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
const byId = (cards, id) => (Array.isArray(cards) ? cards.find((c) => c && String(c.id) === String(id)) || null : null)

const root = await mkdtemp(join('D:/_tmp', 'vmu-run49-verified-ready-'))
try {
  const b = await boot({ root })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })

  const CLAIM = '对任意正整数 m，|G| 整除 |X|（自由作用的轨道整除性）。\n\n【范围声明】只讨论有限群作用。\n\n【执行语义】见 Formal/p49-freeorbit.lean。'
  const OTHER = '对任意整数 n，n^2+n 是偶数。\n\n【范围声明】只用归纳法。\n\n【执行语义】见 Formal/p49-even.lean。'

  // ── r-1 files its proposition (the row the member will look at) ────────────────────────────────────────────
  const mine = await callJSON(b, 'vibe_v5_record_proposition', { member: 'r-1', statement: CLAIM, value: 0.8, motive: '第49轮：verified 轨是地方不是标签', p: 0.9 }, { kernel })
  const mineId = mine.parsed && mine.parsed.recordId
  ok(!!mineId, 'the member filed a proposition', mine)

  // ── the verified row that states the same claim (composed by the writer's own composer) ────────────────────
  const verifiedRow = kernel.records.put({
    track: 'verified', kind: verified.VERIFIED_KIND, settled: true, by: 'r-acad',
    title: verified.VERIFIED_TITLE_PREFIX + '自由作用的轨道整除性',
    body: verified.composeVerifiedBody({
      cardId: 'rec-chair49', p: 1, warrant: 'm-49-ruling', source: 'debate-unanimous', at: '1793000000000',
      by: 'r-acad', title: '自由作用的轨道整除性', statement: CLAIM,
      basis: 'warrant m-49-ruling (debate-unanimous) subject rec-chair49; conclusion 真 (p=1)',
    }),
  })
  const verifiedId = verifiedRow && verifiedRow.id
  ok(!!verifiedId, 'a verified row states the same claim', verifiedRow)

  // ── ① the member's own proposition now reads ready, naming the verified row and its conclusion ─────────────
  const read1 = await callJSON(b, 'vibe_v5_read_library', { member: 'r-1', track: 'propositions' }, { kernel })
  const row1 = read1.parsed && byId(read1.parsed.cards, mineId)
  ok(!!row1, 'the member can read its own proposition row', read1.parsed && read1.parsed.cards)
  ok(row1 && row1.ready === true, 'the proposition reads ready:true (a verified row states the same claim)', row1 && row1.ready)
  ok(row1 && String(row1.readyOn) === String(verifiedId), 'and names WHICH verified row', row1 && row1.readyOn)
  ok(row1 && row1.readyConclusion === true, 'and states its conclusion (true = concluded 真)', row1 && row1.readyConclusion)
  ok(row1 && typeof row1.readyMeans === 'string' && /同一个命题/.test(row1.readyMeans), 'the readout says what ready means, in words', row1 && row1.readyMeans)
  ok(read1.parsed && read1.parsed.readyCount === 1, 'the receipt counts the ready rows', read1.parsed && read1.parsed.readyCount)
  ok(read1.parsed && read1.parsed.verifiedReadable === true && read1.parsed.verifiedClaimsSeen === 1, 'and reports that it COULD read the verified track (1 claim)', read1.parsed && { readable: read1.parsed.verifiedReadable, seen: read1.parsed.verifiedClaimsSeen })

  // ── ② a proposition no verified row states says so, with the reason ────────────────────────────────────────
  const other = await callJSON(b, 'vibe_v5_record_proposition', { member: 'r-2', statement: OTHER, value: 0.6, motive: '第49轮：未被证明的命题', p: 0.5 }, { kernel })
  const otherId = other.parsed && other.parsed.recordId
  ok(!!otherId, 'r-2 filed a proposition nothing has verified', other)
  const read2 = await callJSON(b, 'vibe_v5_read_library', { member: 'r-2', track: 'propositions' }, { kernel })
  const row2 = read2.parsed && byId(read2.parsed.cards, otherId)
  ok(row2 && row2.ready === false, 'its proposition reads ready:false', row2 && row2.ready)
  ok(row2 && typeof row2.readyWhy === 'string' && /还没有在任何一条/.test(row2.readyWhy), 'and the false carries a reason (not a bare false)', row2 && row2.readyWhy)
  ok(row2 && row2.readyOn === undefined, 'and names no verified row', row2 && row2.readyOn)

  // ── ③ reading changed nothing ─────────────────────────────────────────────────────────────────────────────
  const beforeRev = kernel.records.get({ id: mineId }).rev
  const beforeVerified = kernel.records.list({ track: 'verified', limit: 0 }).items.length
  await callJSON(b, 'vibe_v5_read_library', { member: 'r-1', track: 'propositions' }, { kernel })
  const afterRev = kernel.records.get({ id: mineId }).rev
  const afterVerified = kernel.records.list({ track: 'verified', limit: 0 }).items.length
  ok(afterRev === beforeRev, 'the read did not touch the row (rev unchanged)', { beforeRev, afterRev })
  ok(afterVerified === beforeVerified, 'the read did not write a verified row', { beforeVerified, afterVerified })

  // ── ④ other tracks are not decorated (the field means one thing) ──────────────────────────────────────────
  const prog = await callJSON(b, 'vibe_v5_record_progress', { member: 'r-1', content: '<p>第49轮：进度可见性</p>', title: '第49轮进度行' }, { kernel })
  ok(prog.parsed && prog.parsed.ok === true, 'r-1 filed a progress row', prog)
  const read4 = await callJSON(b, 'vibe_v5_read_library', { member: 'r-1', track: 'progress' }, { kernel })
  const progRow = read4.parsed && read4.parsed.cards && read4.parsed.cards[0]
  ok(progRow && progRow.ready === undefined, 'progress rows carry no readiness field', progRow && progRow.ready)
  ok(read4.parsed && read4.parsed.readyCount === 0 && read4.parsed.readyMeans === '这一批里没有 propositions 行（`ready` 只对 propositions 行计算）', 'and the receipt explains why the count is 0', read4.parsed && read4.parsed.readyMeans)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

console.log('\n=== VMU RUN 49 VERIFIED READY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.log('failures:'); for (const f of failures) console.log('  - ' + f); process.exitCode = 1 }
