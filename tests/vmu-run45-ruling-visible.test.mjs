// tests/vmu-run45-ruling-visible.test.mjs — LIVE RUN 45, DEFECT D: A MEMBER FILED ITS OWN RULING AND THEN COULD NOT
// SEE IT IN ITS OWN LIBRARY READ.
//
// WHAT THE RUN SAID (run 45, build fe98b36f). The researcher `r-2` answered the chair's final-ruling request:
//   vibe_v5_verdict { meeting:"m-r45b", proposition_id:"p-r45", verdict:0.4, reason:"…", member:"r-2" }
//   ⇒ { ok:true, channel:"ruling", submission:{ id:"ruling-m-r45b-p-r45-r-2-bac61307",
//                                               path:"…\\Members\\r-2\\Propos\\ruling-m-r45b-p-r45-r-2-bac61307.md" } }
// The chair then adopted it (`vibe_v5_verdict_final` ⇒ coverage.adoptedFromSubmissions:1, submissions.cards:4), so the
// card was really on disk. But the SAME member asked its own library:
//   vibe_v5_read_library { member:"r-2", track:"propositions" }  ⇒  { count:0, rows:[], notLibrary:false }
// and had no way left to answer "did I file a ruling?". Two ledgers never spoke to each other:
//   · `vibe_v5_verdict` files the ruling as a LIBRARY CARD under <root>/Members/<member>/Propos/ (packs/v5r/tools.js,
//     the RULING_* block) — durable, cross-kernel, the chair reads it;
//   · `vibe_v5_read_library` (kit/handlers.js `toolReadLibrary`) lists the RECORDS ledger ONLY, so a file card is
//     invisible to it by construction — and the empty answer never said so.
//
// WHAT THIS SUITE PINS (all through the real entry, a real kernel, a real durable root — a receipt is never the
// evidence that a mechanism ran):
//   D1-D5  the member CAN see its own filed ruling card in the library read: `libraryCards` / `libraryCardCount` name
//          the FILE card (id, status, title, owner, on-disk path), while `count` / `cards` keep listing records rows
//          ONLY — the new readout is added under new names, never silently folded into the old ones;
//   D6-D9  "no ruling" and "a ruling exists as a file card that this call does not list" are DISTINGUISHABLE: the
//          receipt always carries `libraryCardsMeans` (what the file-card readout is), and where the library face is
//          absent it says the empty `count` does NOT prove nothing was filed;
//   D10-D12 the verdict receipt itself teaches the read-back (`readBack` names the field to look at), so the member
//          that filed the card is told where it will appear — the idempotent repeat carries the same pointer;
//   D13-D15 ADJACENT SURFACES ARE UNTOUCHED: the chair still adopts the filed ruling (`adoptedFromSubmissions`), the
//          records `propositions` track still holds only real proposition cards (the P1/verified carrier is not
//          polluted by a ruling), and the `id:` read form is unchanged.
//
// RULE E: every "it worked" is read back from disk / records / the adoption receipt.
//
// Run: node tests/vmu-run45-ruling-visible.test.mjs
// Last line: === VMU RUN45 RULING VISIBLE: N passed, M failed ===

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const imp = (p) => import(pathToFileURL(resolve(REPO, p)).href)

const entry = await imp('vibe-math-vmu/vibe-math-vmu.js')
const packMod = await imp('vibe-math-vmu/packs/v5r/tools.js')
const V5R_PACK_TOOLS = packMod.default || packMod.V5R_PACK_TOOLS

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 500) + ']'))
  console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 500) + ']'))
  return false
}

console.log('=== VMU RUN45 RULING VISIBLE ===')

// ── HARNESS: the same shape the other vmu suites use (real entry, packs:['v5r'], real root, host spec) ─────────────
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}, exec = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: { ok: false, code: 'VMU_TEST_NO_SUCH_TOOL', message: 'tool ' + name + ' was not registered' }, missing: true }
  try { return { parsed: JSON.parse(await spec.execute(args, exec)) } } catch (e) {
    return { parsed: { ok: false, code: (e && e.code) || 'VMU_TEST_THROWN', message: (e && e.message) || String(e), hint: (e && e.hint) || null } }
  }
}
const R = async (b, name, args = {}, exec = {}) => (await call(b, name, args, exec)).parsed
const codeOf = (r) => (r && r.code ? String(r.code) : null)
const decl = (n) => V5R_PACK_TOOLS.filter((t) => t && t.name === n)[0] || null
const filingPath = (filed) => String((filed && filed.submission && filed.submission.path) || '')
const asArray = (v) => (Array.isArray(v) ? v : [])

const TMP = 'D:/_tmp/r45/teammate-library'
mkdirSync(TMP, { recursive: true })
const rootA = mkdtempSync(join(TMP, 'k-'))
const roots = [rootA]

try {
  // ── SETUP: the shape run 45 actually had (one proposition, one debate meeting, one member files a ruling) ────────
  const A = await boot({ root: rootA, packs: ['v5r'] })
  const kernel = A.handle.kernel
  const CHAIR = 'acad-01'
  const M1 = 'r-1'
  const M2 = 'r-2'
  for (const [id, slot] of [[CHAIR, 'chair'], [M1, 'member'], [M2, 'member']]) await kernel.members.hire({ id, slot })
  const roster = kernel.members.roster().map((m) => String(m.id))
  ok(roster.includes(CHAIR) && roster.includes(M1) && roster.includes(M2),
    '前置(RULE E)：三个真实成员在位（下面读的都是真记录/真文件，不是回执的自述）', roster)

  const card = await R(A, 'vibe_v5_record_proposition',
    { id: 'p-r45', statement: '1+1=2（run45 缺陷 D 复现卡，仅供验收）', value: 1, motive: 'run45 缺陷 D', p: 0.5, member: M1 })
  ok(card && card.ok === true, '前置：命题卡 p-r45 已记录（持有者 r-1，p=0.5）', card && { ok: card.ok, code: card.code })
  const m1 = await R(A, 'vibe_v5_meeting', { agenda: 'run45 缺陷 D 复现：p-r45 的辩论', kind: 'sync', member: CHAIR })
  ok(m1 && m1.ok === true && typeof m1.meeting === 'string', '前置：会议已召开（主席 acad-01）', m1 && { ok: m1.ok, meeting: m1.meeting })
  const MEET = m1.meeting

  // ★ r-1 owns the proposition RECORD (a records row) but has filed NO ruling — the "真的没有裁决" side of D6.
  const readM1 = await R(A, 'vibe_v5_read_library', { member: M1, track: 'propositions' })
  ok(readM1 && readM1.ok === true && readM1.count === 1 && asArray(readM1.cards).length === 1,
    '前置：r-1 的 records 命题行是 1 行（p-r45）—— 老的口径先立住', readM1 && { count: readM1.count, cards: asArray(readM1.cards).map((c) => c.id) })

  // ── THE MEMBER'S OWN ACT: r-2 files its final ruling (this half already works; run 45 measured it working) ───────
  const filed = await R(A, 'vibe_v5_verdict',
    { meeting: MEET, proposition_id: 'p-r45', verdict: 0.4, reason: '构造性证明成立但表述有歧义，取 0.4', member: M2 })
  ok(filed && filed.ok === true && filed.channel === 'ruling',
    '★★★ 前置：r-2 提交了自己的裁决 ⇒ channel:"ruling"（这一半 run 45 是好的）',
    filed && { ok: filed.ok, code: filed.code, message: filed.message, hint: filed.hint })
  const RULING_ID = String((filed && filed.submission && filed.submission.id) || '')
  const RULING_PATH = filingPath(filed)
  ok(RULING_ID.length > 0 && existsSync(RULING_PATH),
    '前置：裁决真的落成了磁盘上的一张卡（路径存在，不是回执自称已写）', { id: RULING_ID, path: RULING_PATH })

  // ── D1-D5: THE MEMBER CAN SEE ITS OWN FILED RULING CARD ─────────────────────────────────────────────────────────
  console.log('=== D1-D5. 成员用 read_library 看得到自己刚提交的裁决卡（run 45 缺陷 D 的那一句话）===')
  const read = await R(A, 'vibe_v5_read_library', { member: M2, track: 'propositions' })
  ok(read && read.ok === true, 'D0 前置：read_library { member:"r-2", track:"propositions" } 调用成功',
    read && { ok: read.ok, code: read.code, message: read.message })
  const libCards = asArray(read && read.libraryCards)
  ok(libCards.length === 1 && String(libCards[0] && libCards[0].id) === RULING_ID,
    '★★★ D1 成员看得到自己提交的裁决卡：libraryCards 里有那张卡（run 45 回执 count:0/rows:[]，无法回答"我提交过裁决吗"）',
    read && { keys: Object.keys(read), count: read.count, libraryCardCount: read.libraryCardCount,
      libraryCards: libCards.map((c) => ({ id: c.id, status: c.status, owner: c.owner })) })
  ok(read && read.libraryCardCount === 1,
    '★★ D2 libraryCardCount 单独给出文件卡的数量（新口径另起名，不动 count）', read && { libraryCardCount: read.libraryCardCount })
  const c0 = libCards[0] || {}
  ok(String(c0.status) === 'ruling' && String(c0.owner) === M2
    && String(c0.title || '').includes('RULING') && String(c0.title || '').includes('p-r45'),
    '★★ D3 卡上 expand 出 status:"ruling"、owner、以及可读的标题（谁对哪个命题裁的）',
    { status: c0.status, owner: c0.owner, title: c0.title })
  ok(String(c0.path || '').length > 0 && existsSync(String(c0.path)),
    '★★ D4 文件卡带一个可打开的真实地址（path 存在），不是只给一个 id', { path: c0.path })
  ok(read && read.count === 0 && asArray(read.cards).length === 0,
    '★★★ D5 语义没被静默改写：count/cards 仍是 **records 行**，r-2 没有 records 命题行 ⇒ 仍为 0（文件卡没有混进 cards）',
    read && { count: read.count, cards: asArray(read.cards).map((c) => c.id) })

  // ── D6-D9: "没有裁决" 与 "裁决在文件库而这次调用不列" 必须可区分 ─────────────────────────────────────────────────
  console.log('=== D6-D9. 两种口径必须能区分：真的没有裁决 / 有文件卡但这次读不到 ===')
  ok(read && read.libraryReadable === true,
    'D6 有 library face 时回执说清文件卡这一口径是**读得到**的（libraryReadable:true）', read && { libraryReadable: read.libraryReadable })
  ok(read && typeof read.libraryCardsMeans === 'string' && read.libraryCardsMeans.includes('libraryCards')
    && read.libraryCardsMeans.includes('records') && read.libraryCardsMeans.includes('track'),
    '★★★ D7 回执用一句话说清 libraryCards 是什么：文件卡、**不是 records 行**、且 track 收窄的是 records 行',
    read && String(read.libraryCardsMeans).slice(0, 400))
  ok(readM1 && readM1.libraryCardCount === 0 && asArray(readM1.libraryCards).length === 0
    && typeof readM1.libraryCardsMeans === 'string' && readM1.libraryCardsMeans.includes('records'),
    '★★ D8 r-1 没有提交裁决 ⇒ 文件卡 0，且同一句话在场 ⇒ "0 张文件卡"是事实，不是没查',
    readM1 && { libraryCardCount: readM1.libraryCardCount, means: String(readM1.libraryCardsMeans).slice(0, 200) })
  // ★ THE HONEST GAP: a kernel with no durable root publishes no library face at all. There the empty `count` MUST NOT
  //   be readable as "nothing was filed" — the receipt has to say the file cards could not be read at all.
  const readHandler = decl('vibe_v5_read_library') && decl('vibe_v5_read_library').handler
  ok(typeof readHandler === 'function' && !!kernel.records,
    'D9a 前置：能取到 read_library 的 handler 与一个真实的 records face（下面这次调用没有 library）', { handler: typeof readHandler })
  let noFace = null
  try { noFace = await readHandler({ member: M2 }, { kernel: { records: kernel.records } }) } catch (e) {
    noFace = { ok: false, code: (e && e.code) || 'VMU_TEST_THROWN', message: (e && e.message) || String(e) }
  }
  ok(noFace && noFace.ok === true && noFace.libraryCards === null && noFace.libraryReadable === false
    && typeof noFace.libraryWhy === 'string' && noFace.libraryWhy.includes('library face') && noFace.libraryWhy.includes('root'),
    '★★★ D9 没有 library face 时回执说清：count:0 **不等于**"没有裁决卡"——文件卡这一次根本读不到（并指认缺的是 root）',
    noFace && { ok: noFace.ok, libraryReadable: noFace.libraryReadable, libraryWhy: String(noFace.libraryWhy || '').slice(0, 300), count: noFace.count })

  // ── D10-D12: THE VERDICT RECEIPT TEACHES THE READ-BACK (so the filer is told where the card will appear) ─────────
  console.log('=== D10-D12. 裁决回执教成员去哪里读回自己那张卡 ===')
  const rb = (filed && filed.readBack) || null
  ok(rb && String(rb.field) === 'libraryCards' && String(rb.means || '').includes('libraryCards')
    && String(rb.means || '').includes('count') && String(rb.means || '').includes('records'),
    '★★★ D10 提交回执带 readBack：明说"看 libraryCards（不是 count/cards，那两处只有 records 行）"',
    rb && { field: rb.field, means: String(rb.means || '').slice(0, 300) })
  ok(rb && typeof rb.call === 'string' && rb.call.includes('vibe_v5_read_library') && rb.call.includes(M2),
    '★★ D11 readBack.call 是成员能直接照抄的那次调用（带自己的 member）', rb && { call: rb.call })
  const again = await R(A, 'vibe_v5_verdict',
    { meeting: MEET, proposition_id: 'p-r45', verdict: 0.4, reason: '构造性证明成立但表述有歧义，取 0.4', member: M2 })
  ok(again && again.ok === true && again.idempotent === true, 'D12a 前置：同一份裁决再提交一次仍是幂等',
    again && { ok: again.ok, idempotent: again.idempotent, code: again.code })
  ok(again && again.readBack && String(again.readBack.field) === 'libraryCards',
    '★★ D12 幂等回执带着同一个 readBack（"已经提交过"的回答也指得出那张卡在哪读）',
    again && { readBack: again.readBack && again.readBack.field })

  // ── D13-D15: ADJACENT SURFACES UNTOUCHED ────────────────────────────────────────────────────────────────────────
  console.log('=== D13-D15. 相邻面未受影响：主席采纳、P1 载体、id 读法 ===')
  const filedM1 = await R(A, 'vibe_v5_verdict',
    { meeting: MEET, proposition_id: 'p-r45', verdict: 1, reason: '我认为 1（构造性证明成立）', member: M1 })
  ok(filedM1 && filedM1.ok === true && filedM1.channel === 'ruling',
    'D13a 前置：r-1 也提交了自己的裁决（下面主席才收得齐）',
    filedM1 && { ok: filedM1.ok, code: filedM1.code, message: filedM1.message })
  const final = await R(A, 'vibe_v5_verdict_final', { meeting: MEET, proposition_id: 'p-r45', member: CHAIR })
  const cov = (final && final.coverage) || {}
  ok(final && final.ok === true && cov.adoptedFromSubmissions === 2 && cov.typedCount === 0,
    '★★★ D13 主席仍能采纳成员提交的裁决（adoptedFromSubmissions:2 / typed:0）—— 读面改动没有碰采纳路径',
    final && { ok: final.ok, code: final.code, coverage: { adopted: cov.adoptedFromSubmissions, typed: cov.typedCount, complete: cov.complete } })
  const props = kernel.records.list({ track: 'propositions', limit: 50 })
  const propItems = asArray(props && props.items)
  const rulingRows = propItems.filter((it) => /ruling/i.test(String((it && (it.kind || it.id)) || '')))
  ok(propItems.length >= 1 && rulingRows.length === 0,
    '★★★ D14 P1 相邻：裁决**没有**被写成 records 命题行（propositions 轨仍只有真命题卡，证明闸的载体没被污染）',
    { rows: propItems.map((it) => ({ id: it.id, kind: it.kind })).slice(0, 6), rulingRows: rulingRows.length })
  const byId = await R(A, 'vibe_v5_read_library', { id: 'p-r45' })
  ok(byId && byId.ok === true && byId.card && String(byId.card.id).includes('p-r45'),
    '★ D15 id: 读单卡的老口径未变（返回 { card }，没有混入文件卡口径）', byId && { ok: byId.ok, card: byId.card && byId.card.id })

  // ── D16: the unknown-track refusal is untouched (a declaration is still the only vocabulary) ─────────────────────
  const badTrack = await R(A, 'vibe_v5_read_library', { member: M2, track: 'no-such-track' })
  ok(badTrack && badTrack.ok === false && codeOf(badTrack) === 'VMU_INVALID_ARGUMENT' && Array.isArray(badTrack.declared),
    '★ D16 未声明的 track 仍是具名拒（VMU_INVALID_ARGUMENT + declared 名单），文件卡口径没有放宽词汇表',
    badTrack && { code: codeOf(badTrack), declared: badTrack.declared })
} finally {
  for (const r of roots) { try { rmSync(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log('')
if (failures.length > 0) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
console.log('=== VMU RUN45 RULING VISIBLE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exitCode = failed === 0 ? 0 : 1
