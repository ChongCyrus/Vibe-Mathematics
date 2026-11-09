// RUN 259 / P1-3 + P1-4: 记录面的恒等式必须是「可弄假的检查」，排序必须按真实时刻且不可排序的行要具名。
//
// 修复前（audit round14 量到的原文）：
//   const filteredTotal = live.length
//   const totalUniverse = filteredTotal + excluded.shapeMismatch + excluded.untracked
//   identity: { ..., holds: items.length + dropped + excluded.shapeMismatch + excluded.untracked === totalUniverse }
// 两边都是同一条算式：`live.length` 既进 totalUniverse 又进等式右边，任何输入都不可能让 holds:false —— 永远成立的
// 「判据」不是判据。现在 universeCounted 来自另一条路径（index ids 遍历 + 传进来的 external 行），accounted 来自这一页
// 的算术，两者不等就是有行无声消失，holds:false 真的会出现。
//   排序：`live.sort((a, b) => a.createdAt - b.createdAt)` 对 ISO 字符串做算术得 NaN，Array#sort 于是保持输入顺序，
// 而回执仍写 sort:"createdAt" —— 静默乱序。现在统一走 timeMsOf，读不出时刻的行进 orderUnknown 并排在最后。
//
// 判据量外部源：总数由测试自己数（两次 put、一次 remove、传入的 external 行数），不引用内核自报的数字。
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// TB-2681: the checkout is derived, never written down; VMU_REPO lets CI point at another clone.
const REPO = process.env.VMU_REPO || fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const SRC_PATH = join(REPO, 'vibe-math-vmu', 'kernel', 'records.js')

let passed = 0
let failed = 0
const ok = (cond, msg) => { if (cond) { passed += 1; return } failed += 1; console.log('FAIL: ' + msg) }
const isEmptyish = (v) => v === '' || v === null || v === undefined || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)
const eq = (a, b, msg) => {
  const bothEmpty = isEmptyish(a) && isEmptyish(b)
  ok(!bothEmpty, msg + ' (precondition: non-vacuous comparison)')
  ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')')
}

const SRC = await readFile(SRC_PATH, 'utf8')
const entry = await import(pathToFileURL(ENTRY).href)
const recordsMod = await import(pathToFileURL(SRC_PATH).href)

const base = await mkdtemp(join(tmpdir(), 'run259-suite-'))
const boot = async (config = {}) => {
  const specs = []
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => new Date('2026-11-09T09:00:00.000Z') }, config))
  await handle.ready()
  return handle
}

try {
  console.log('=== RUN-259 RECORDS IDENTITY + ORDER ===')

  // §0 源码 pin：新判据真的在代码里，旧的两条恒真/NaN 写法真的不在了。
  ok(SRC.includes('export function identityHoldsOf('), '§0 (1) identityHoldsOf is exported, so the negative case can be executed directly')
  ok(SRC.includes('const universeCounted = indexCounted + externalCounted'), '§0 (2) the counted universe comes from the index traversal + external rows, not from live.length')
  ok(SRC.includes('const timeMsOf = (raw) =>'), '§0 (3) one time resolver used by ordering (no raw subtraction)')
  ok(SRC.includes('orderUnknown.push({ id: String(r && r.id), field,'), '§0 (4) rows that cannot be ordered are NAMED with id + field')
  ok(!SRC.includes('? a.createdAt - b.createdAt : a.updatedAt - b.updatedAt'), '§0 (5) the ISO-string subtraction comparator is GONE')
  ok(SRC.includes('timeMsOf(a[field]) - timeMsOf(b[field])'), '§0 (5b) ordering compares resolved instants, not raw values')
  ok(!SRC.includes('holds: items.length + dropped + excluded.shapeMismatch'), '§0 (6) the tautological holds expression is GONE from the receipt')
  ok(SRC.includes('const indexCounted = ids.length') && SRC.includes('indexMissingIds.push') && SRC.includes('indexNonLiveIds.push'), '§0 (7) the index walk names missing and non-live rows instead of filtering them away in silence')
  ok(SRC.includes('identity: identityOf(items.length, dropped, 0, totalUniverse)'), '§0 (8) the unmuted receipt builds its identity through the one checked helper')
  ok(SRC.includes('questionDropped += 1'), '§0 (9) a row the question declines is counted, so "narrower question" and "lost row" are different readings')

  // §1 恒等式可弄假：直接喂两个不同的计数源，holds 必须真的为 false。
  const neg = recordsMod.identityHoldsOf({ page: 1, universeCounted: 2 })
  ok(neg.holds === false, '§1 (1) page 1 against a universe of 2 ⇒ holds:false (an identity that cannot fail is not a criterion)')
  eq(neg.accounted, 1, '§1 (2) accounted is the page arithmetic side')
  eq(neg.universeCounted, 2, '§1 (3) universeCounted is the independent side')
  const pos = recordsMod.identityHoldsOf({ page: 1, pageDropped: 1, universeCounted: 2 })
  ok(pos.holds === true, '§1 (4) page + pageDropped === universeCounted ⇒ holds:true')
  const deep = recordsMod.identityHoldsOf({ page: 2, excluded: 1, questionDropped: 1, indexMissing: 1, indexNonLive: 1, mergeDuplicates: 1, universeCounted: 7 })
  eq(deep.accounted, 7, '§1 (5) every named bucket participates in accounted')
  ok(deep.holds === true, '§1 (6) all seven named buckets add up to the counted side')
  eq(Object.keys(recordsMod.identityHoldsOf({})).sort(), ['accounted', 'holds', 'universeCounted'], '§1 (7) the helper answers exactly three readings, nothing inferred')

  // §2 产品路径：内部计数由测试自己数（2 次 put、1 次 remove），不引用内核自报的数字。
  const hA = await boot({ root: join(base, 'a') })
  const kA = hA.kernel
  await kA.records.put({ track: 'state', kind: 'finding', title: 'a', body: 'x', by: 'r-1', settled: true })
  await kA.records.put({ track: 'state', kind: 'finding', title: 'b', body: 'y', by: 'r-2', settled: true })
  const PLAIN_EXPECTED_UNIVERSE = 2
  const plain = kA.records.list({ track: 'state', limit: 0 })
  ok(plain.identity.holds === true, '§2 (1) a clean page satisfies the identity')
  eq(plain.identity.page, 2, '§2 (2) the page carries both rows')
  eq(plain.identity.universeCounted, PLAIN_EXPECTED_UNIVERSE, '§2 (3) the counted universe equals the number of records THIS TEST put (external source)')
  eq(plain.identity.accounted, PLAIN_EXPECTED_UNIVERSE, '§2 (4) the page arithmetic lands on the same number, from the other path')
  ok(/two paths/.test(String(plain.identity.means)) && /holds/.test(String(plain.identity.means)), '§2 (5) the means says the identity compares two paths and can be false')

  const capped = kA.records.list({ track: 'state', limit: 1 })
  eq([capped.identity.page, capped.identity.pageDropped], [1, 1], '§2 (6) a cap is named as pageDropped, not lost')
  ok(capped.identity.holds === true, '§2 (7) the identity holds on a capped page')

  await kA.records.remove({ id: 'rec-2', by: 'r-1' })
  const afterTrash = kA.records.list({ track: 'state', limit: 0 })
  eq(afterTrash.identity.indexNonLive, 1, '§2 (8) the trashed row is NAMED indexNonLive - it would otherwise vanish from live.length without a reading')
  eq(afterTrash.identity.indexNonLiveIds, ['rec-2'], '§2 (9) the named list carries the id itself')
  eq([afterTrash.identity.page, afterTrash.identity.universeCounted, afterTrash.identity.accounted], [1, 2, 2], '§2 (10) page 1 + indexNonLive 1 === universe 2 (test-side count: two puts, one trashed)')
  ok(afterTrash.identity.holds === true, '§2 (11) the identity holds when a named bucket accounts for the missing row')

  const withOne = kA.records.list({ limit: 0, external: [{ id: 'lib-1', track: 'state', title: 'lib', updatedAt: 3000 }], externalSource: 'library' })
  eq(withOne.identity.universeCounted, 3, '§2 (12) a merged external row joins the counted side (2 index ids + 1 external)')
  eq(withOne.identity.page, 2, '§2 (13) both the live record and the library head are on the page')
  ok(withOne.identity.holds === true, '§2 (14) the identity holds across two stores')

  const dup = kA.records.list({ limit: 0, external: [{ id: 'lib-1', track: 'state', title: 'lib', updatedAt: 3000 }, { id: 'lib-1', track: 'state', title: 'lib again', updatedAt: 3000 }], externalSource: 'library' })
  eq(dup.identity.mergeDuplicates, 1, '§2 (15) a duplicate external id is NAMED mergeDuplicates instead of disappearing in the dedupe')
  ok(dup.identity.holds === true, '§2 (16) the identity still holds with a merge duplicate counted')

  // §3 排序：混合数字戳与 ISO 戳按真实时刻排，读不出时刻的行具名且排最后。
  const hB = await boot({ root: join(base, 'b') })
  const kB = hB.kernel
  await kB.records.put({ track: 'state', kind: 'finding', title: 'a', body: 'x', by: 'r-1', settled: true })
  await kB.records.put({ track: 'state', kind: 'finding', title: 'b', body: 'y', by: 'r-2', settled: true })
  const mixed = kB.records.list({ limit: 0, external: [
    { id: 'lib-num', track: 'state', title: 'num', updatedAt: 1000 },
    { id: 'lib-iso', track: 'state', title: 'iso', updatedAt: '1970-01-01T00:00:02.000Z' },
    { id: 'lib-bad', track: 'state', title: 'bad', updatedAt: 'nope' },
    { id: 'lib-missing', track: 'state', title: 'missing' }
  ], externalSource: 'library' })
  eq(mixed.items.slice(0, 2).map((r) => r.id), ['lib-num', 'lib-iso'], '§3 (1) numeric 1000ms sorts BEFORE ISO 2000ms by real instant (no NaN comparator)')
  eq(mixed.orderUnknown.map((x) => [x.id, x.field, x.why]), [['lib-bad', 'updatedAt', 'unreadable'], ['lib-missing', 'updatedAt', 'missing']], '§3 (2) unreadable and missing stamps are NAMED with why, not treated as the epoch')
  eq(mixed.items.slice(-2).map((r) => r.id), ['lib-bad', 'lib-missing'], '§3 (3) unordered rows are placed LAST, never silently first')
  ok(mixed.identity.holds === true, '§3 (4) the identity holds while two rows cannot be ordered')
  ok(mixed.orderUnknownMeans !== undefined && /placed LAST/.test(String(mixed.orderUnknownMeans)), '§3 (5) the receipt says what placement the unordered rows got')
  ok(Array.isArray(plain.orderUnknown) && plain.orderUnknown.length === 0, '§3 (6) a clean page names nothing as unordered')

  const hC = await boot({ root: join(base, 'c'), 'vmu.records.head.sort': 'createdAt' })
  const kC = hC.kernel
  await kC.records.put({ track: 'state', kind: 'finding', title: 'a', body: 'x', by: 'r-1', settled: true })
  const byCreated = kC.records.list({ limit: 0, external: [
    { id: 'lib-num', track: 'state', title: 'num', createdAt: 1000, updatedAt: 100 },
    { id: 'lib-iso', track: 'state', title: 'iso', createdAt: '1970-01-01T00:00:02.000Z', updatedAt: 100 },
    { id: 'lib-bad', track: 'state', title: 'bad', createdAt: 'nope', updatedAt: 100 }
  ], externalSource: 'library' })
  eq(byCreated.items.map((r) => r.id), ['lib-num', 'lib-iso', 'rec-1', 'lib-bad'], '§3 (7) headSort createdAt orders by created instant and names the unreadable one last')
  eq(byCreated.orderUnknown.map((x) => x.field), ['createdAt'], '§3 (8) orderUnknown names WHICH field could not be read')
  ok(byCreated.identity.holds === true, '§3 (9) the createdAt page keeps the identity')

  // §4 muted 路：恒等式同样成立，mutedDropped 是被静音压住的那些行。
  const hD = await boot({ root: join(base, 'd'), 'vmu.records.pointerPropagation': false })
  const kD = hD.kernel
  await kD.records.put({ track: 'state', kind: 'finding', title: 'a', body: 'x', by: 'r-1', settled: true })
  const muted = kD.records.list({ limit: 0 })
  eq(muted.identity.mutedDropped, 1, '§4 (1) the mute names the rows it held back')
  eq(muted.identity.page, 0, '§4 (2) a muted page carries no rows')
  eq(muted.identity.universeCounted, 1, '§4 (3) the muted road still counts the universe independently')
  ok(muted.identity.holds === true, '§4 (4) the identity holds on the muted road too')
  ok(Array.isArray(muted.orderUnknown) && muted.orderUnknown.length === 0, '§4 (5) a muted page still names an empty orderUnknown (shape stays readable)')

  // §5 工具面 = kernel 面：宿主自建回执曾把 orderUnknown 挑掉，工具面于是看不见「有行排不了序」。
  // 判据量外部源：同一仓库、同一 external 输入（kernel.library.list 的 head 行），一次走工具面、一次直接调内核，
  // 两边 orderUnknown 逐项 deepEqual —— 不是「字段存在」，是「读数一致」。
  const specsE = []
  const ctxE = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { specsE.push(spec); return () => {} } } }
  const hE = entry.apply(ctxE, { root: join(base, 'e'), clock: () => new Date('2026-11-09T09:00:00.000Z') })
  await hE.ready()
  const kE = hE.kernel
  await kE.records.put({ track: 'state', kind: 'finding', title: 'a', body: 'x', by: 'r-1', settled: true })
  // 一张 library 卡片没有 updatedAt frontmatter ⇒ head 的 updatedAt 为 null ⇒ 内核只能按 id 把它排在最后并具名。
  await mkdir(join(base, 'e', 'Members', 'r-1', 'Propos'), { recursive: true })
  await writeFile(join(base, 'e', 'Members', 'r-1', 'Propos', 'p-bad.md'), '---\nid: p-bad\nkind: proposition\ntitle: bad card\n---\nbody\n', 'utf8')
  const recordSpec = specsE.find((s) => s.name === 'vibe_vmu_records')
  ok(recordSpec !== undefined, '§5 (1) the real entry registered the records tool face')
  const faceOut = await recordSpec.execute({ action: 'list', includeUntracked: true, limit: 0 }, {})
  const faceRow = typeof faceOut === 'string' ? JSON.parse(faceOut) : faceOut
  const directRows = await kE.library.list({ withWriter: true })
  const direct = kE.records.list({ external: directRows, externalSource: 'library', includeUntracked: true, limit: 0 })
  const faceOrder = Array.isArray(faceRow.orderUnknown) ? faceRow.orderUnknown : null
  ok(faceOrder !== null, '§5 (2) the tool face carries an orderUnknown reading at all')
  ok(faceOrder !== null && faceOrder.length === 1 && faceOrder[0].id === 'p-bad' && faceOrder[0].why === 'missing', '§5 (3) the tool face names the library card it could not order, with why')
  eq(faceOrder, direct.orderUnknown, '§5 (4) tool-face orderUnknown is DEEP-EQUAL to the kernel face for the same external rows')
  eq(String(faceRow.orderUnknownMeans), String(direct.orderUnknownMeans), '§5 (5) the explanation is the same sentence on both faces')
  eq(faceRow.records.slice(-1).map((r) => r.id), ['p-bad'], '§5 (6) the unordered card is placed LAST on the tool face too')
} catch (e) {
  console.log('FAIL: suite threw: ' + (e && e.stack ? e.stack : e))
  failed += 1
} finally {
  await rm(base, { recursive: true, force: true, maxRetries: 5 }).catch(() => {})
}

console.log('=== RUN-259 RECORDS IDENTITY + ORDER: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
