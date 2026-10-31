#!/usr/bin/env node
// tests/vmu-run165-quota-reachable.test.mjs — ★ RUN 165：第十三次真机跑（tarball `f90d8cce`，jsonl
// `full-1031-164158.jsonl`）暴露的唯一机制缺陷：**配额拒绝语许诺了一个做不到的修法**。
//
// 真机证据（run 13）：代理拿 `paper` 轨 200/200 的 `VMU_QUOTA_EXCEEDED`，hint 写「…or compact/remove
// records — the ledger never evicts silently」，于是它去 `grep`、试 `vibe_vmu_records`、最后 `ask_user_question`
// 请示「要不要抬配额」，3000 秒耗尽、第 3–6 项全部空白。
//
// 事实：`kernel/records.js` **有** remove/purge/compact/supersede 的实现（带 trash、审计、恢复期），但
// **没有任何工具面暴露它们**（记录面的 action enum 只有 list|expand|append|status；全仓唯一调用
// `records.remove(` 的是 v3 中间件的内部清理）。⇒ 那句话是**假承诺**；而且「抬上限」是唯一的出路，
// 意味着**默认配置下记录一满，整条轨就没有任何不依赖改设置的操作可做**。
//
// 修法（本轮）：把假承诺变成真能力，并让拒绝语同时给出两条真路。
//   §A `vibe_vmu_records` 新增 `action:"prune"`：把**某一轨最旧的若干行移入回收站**（restorable，
//      `vmu.records.trash.retainDays` 天内可恢复；到期由内核 COUNTED 地清，不静默），回执给
//      `liveBefore/liveAfter/wouldPruneCount/prunedCount/pruned/pinned/means/restoreMeans`；
//      `dryRun:true` 只预告、不动数据；`keep` 缺省 0（清空该轨活行）；`permanent` 行不动、进 `pinned`。
//   §B 两处配额拒绝语的 hint 改成「TWO reachable repairs」：先 `prune`，或抬对应设置（写时热读）。
//
// Run: node tests/vmu-run165-quota-reachable.test.mjs
// Last line: === RUN 165 QUOTA REACHABLE: N passed, M failed ===
import { readFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const RECORDS = join(REPO, 'vibe-math-vmu', 'kernel', 'records.js')
const HOST = join(REPO, 'vibe-math-vmu', 'host.js')
const RECORDS_SRC = readFileSync(RECORDS, 'utf8')
const HOST_SRC = readFileSync(HOST, 'utf8')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ✓ ' + label); return true }
  failed += 1; failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  console.log('  ✗ ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}
const entry = await import(ENTRY)
const TOOL = (specs, name) => specs.find((s) => s.name === name)
const parse = (res) => (typeof res === 'string' ? JSON.parse(res) : res)
const call = async (b, name, args) => {
  const spec = TOOL(b.specs, name)
  if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', message: name }
  try { return parse(await spec.execute(args, {})) } catch (e) {
    return { ok: false, code: (e && e.code) || null, message: (e && e.message) || String(e), hint: (e && e.hint) || null }
  }
}
const boot = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run165-'))
  process.chdir(root)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
    get() { return undefined },
  }
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000, deliverMode: 'caller' }, settings))
  await handle.ready()
  return { specs: state.specs, kernel: handle.kernel, root }
}
const putRow = (b, args) => {
  try { return { ok: true, id: b.kernel.records.put(args).id } } catch (e) {
    return { ok: false, code: (e && e.code) || null, message: (e && e.message) || String(e), hint: (e && e.hint) || null }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§0 源码口径：拒绝语许诺的修法是工具面真能做的')
{
  ok(/TWO reachable repairs/.test(RECORDS_SRC),
    '(0) 两处配额拒绝语都改写成「TWO reachable repairs」（一条是 prune，一条是抬设置）', null)
  ok(/\{action:"prune", track:"<this track>", keep:<how many newest rows to keep>, why:"why these rows may go"\}/.test(RECORDS_SRC),
    '(0) hint 给出 prune 的**确切形参**（track/keep/why），代理不用猜', null)
  ok(!/or compact\/remove/.test(RECORDS_SRC) && !/NO tool face exposes remove\/compact/.test(RECORDS_SRC),
    '(0) ★ 旧短语「or compact/remove records」「NO tool face exposes remove/compact」都已消失', null)
  ok(/this limit is read at WRITE time, so raising it with vibe_v5_set \{key:"vmu\.records\.head\.maxItems"/.test(RECORDS_SRC),
    '(0) 第二条路仍在：`vibe_v5_set` 抬 `vmu.records.head.maxItems`（写时热读）', null)
  ok(/'list', 'expand', 'append', 'status', 'prune'/.test(HOST_SRC) && /if \(action === 'prune'\) \{/.test(HOST_SRC),
    '(0) 记录面的 action enum 真有 prune，且真有 prune 分支', null)
  ok(/rc\.list\(\{ track: pruneTrack, limit: 0 \}\)/.test(HOST_SRC) && /rc\.remove\(\{ id: row\.id, reason: pruneWhy, by: callerBy \}\)/.test(HOST_SRC),
    '(0) prune 走内核已有的 list+remove（审计与回收站是内核算的，不是工具面重造）', null)
  ok(/const isUpdate = !!\(existingRow && existingRow\.state === 'live' && existingRow\.track === track\)/.test(RECORDS_SRC) &&
    /!isUpdate && headMaxItems > 0 && liveIds\(track\)\.length >= headMaxItems/.test(RECORDS_SRC),
  '(0) ★ 配额闸认得「更新同一行」：isUpdate 时不算新增（否则 paper start 的第二次写会被配额拒、留下幽灵行）', null)
  ok(/const billedBytes = isUpdate \? \(trackBytes\(track\) - existingRow\.bytes \+ bytes\)/.test(RECORDS_SRC),
    '(0) 体积预算对更新按 delta 计（替换，不是叠加）', null)
  ok(/VMU_RETENTION_CONFLICT/.test(HOST_SRC) && /pinned/.test(HOST_SRC),
    '(0) permanent 行的 `VMU_RETENTION_CONFLICT` 被收进 `pinned`，不会中断整次 prune', null)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§1 run 13 现场：paper 轨满 ⇒ 拒绝语给两条真路，prune 一步腾出名额')
{
  const b = await boot({ 'vmu.records.head.maxItems': 2 })
  ok(putRow(b, { track: 'paper', kind: 'paper-state', title: 'q165-a', body: 'p-a' }).ok === true &&
    putRow(b, { track: 'paper', kind: 'paper-state', title: 'q165-b', body: 'p-b' }).ok === true,
  '(1) 上限 2 时 paper 轨前两条写成功（前置）', null)
  const blocked = await call(b, 'vibe_v5_paper', { action: 'start', target: 'q165-addr', title: '一六五号：论文轨满以后怎么继续', member: 'r-acad', participants: ['r-1'] })
  ok(blocked.ok === false && String(blocked.code) === 'VMU_QUOTA_EXCEEDED',
    '(1) ★ run 13 现场复现：paper 轨满 ⇒ `paper start` 被 `VMU_QUOTA_EXCEEDED` 拒', { code: blocked.code })
  const hint = String(blocked.hint || '')
  ok(/prune/.test(hint) && /vmu\.records\.head\.maxItems/.test(hint),
    '(1) 拒绝语同时点名 prune 与抬上限这两条路（代理不用 grep 猜）', hint.slice(0, 200))
  ok(/restorable/.test(hint) && /never evicts silently/.test(hint),
    '(1) 并说清 prune 是「移到回收站、可恢复、不静默」，不是删除', null)

  const preview = await call(b, 'vibe_vmu_records', { action: 'prune', track: 'paper', keep: 1, dryRun: true, why: '先看图' })
  ok(preview.ok === true && preview.dryRun === true,
    '(1) `dryRun:true` 的 prune 成功（先看会移哪些）', preview.ok === false ? preview : undefined)
  ok(preview.liveBefore === 2 && preview.wouldPruneCount === 1 && preview.prunedCount === 0 && preview.liveAfter === 2,
    '(1) ★ 预演不动数据：liveBefore 2、wouldPruneCount 1、prunedCount 0、liveAfter 仍 2',
    { liveBefore: preview.liveBefore, wouldPruneCount: preview.wouldPruneCount, prunedCount: preview.prunedCount, liveAfter: preview.liveAfter })
  ok(/DRY RUN/.test(String(preview.means || '')),
    '(1) 回执 self-report 说是预演', String(preview.means || '').slice(0, 120))

  const stillBlocked = await call(b, 'vibe_v5_paper', { action: 'start', target: 'q165-addr', title: '一六五号：论文轨满以后怎么继续', member: 'r-acad', participants: ['r-1'] })
  ok(stillBlocked.ok === false && String(stillBlocked.code) === 'VMU_QUOTA_EXCEEDED',
    '(1) 预演之后仍然被拒（预演不腾名额）', { code: stillBlocked.code })

  const pruned = await call(b, 'vibe_vmu_records', { action: 'prune', track: 'paper', keep: 1, why: '论文轨满了，最旧的一行移入回收站' })
  ok(pruned.ok === true && pruned.prunedCount === 1 && pruned.liveBefore === 2 && pruned.liveAfter === 1,
    '(1) ★ 真 prune：2 → 1 行活记录，移走 1 行', { liveBefore: pruned.liveBefore, liveAfter: pruned.liveAfter, prunedCount: pruned.prunedCount })
  const moved = Array.isArray(pruned.pruned) ? pruned.pruned[0] : null
  ok(moved && String(moved.state) === 'trashed' && typeof moved.purgeAt === 'number',
    '(1) 回执逐行给出 id/state:"trashed"/purgeAt（什么时候到期可查）', moved)
  ok(/TRASH/.test(String(pruned.means || '')) && /restorable/.test(String(pruned.means || '')),
    '(1) 回执说清「在回收站、不是删除、到期前可恢复」', String(pruned.means || '').slice(0, 160))

  const status = await call(b, 'vibe_vmu_records', { action: 'status' })
  ok(status.ok === true && status.foldedYet !== undefined,
    '(1) status 仍可用（records.trashed 是可查的）', status.ok === false ? status : undefined)

  const retried = await call(b, 'vibe_v5_paper', { action: 'start', target: 'q165-addr', title: '一六五号：论文轨满以后怎么继续', member: 'r-acad', participants: ['r-1'] })
  ok(retried.ok === true,
    '(1) ★★ prune 之后**同一次会话**里再 `paper start` 成功 —— 3000 秒的死路变成一步',
    retried.ok === false ? { code: retried.code, message: String(retried.message || '').slice(0, 200) } : undefined)

  // 恢复路径：被移走的行不是「消失」，restore 之后它回到 live，名额也会重新占住
  const back = (() => { try { return b.kernel.records.restore({ id: moved.id, by: 'r-acad' }) } catch (e) { return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) } } })()
  ok(back.ok === true && back.state === 'live',
    '(1) ★ 被 prune 的行能 restore 回 live（回收站是真的，不是删除）', back.ok === false ? back : undefined)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§2 prune 的具名拒与 permanent 保护')
{
  const b = await boot({ 'vmu.records.head.maxItems': 4 })
  const noTrack = await call(b, 'vibe_vmu_records', { action: 'prune', keep: 0 })
  ok(noTrack.ok === false && String(noTrack.code) === 'VMU_INVALID_ARGUMENT' && /needs the `track`/.test(String(noTrack.message || '')),
    '(2) 不带 track 的 prune 被具名拒（「action prune needs the `track` to prune」）', { code: noTrack.code, message: noTrack.message })
  ok(/per track/.test(String(noTrack.hint || '')),
    '(2) 拒绝语解释为什么：prune 是按轨的，不能跨整个账本', String(noTrack.hint || '').slice(0, 160))

  ok(putRow(b, { track: 'obstacles', kind: 'lesson', title: '永久的一课', body: 'keep me', permanent: true }).ok === true,
    '(2) 写一条 permanent 记录（前置）', null)
  ok(putRow(b, { track: 'obstacles', kind: 'lesson', title: '普通的障碍', body: 'go away' }).ok === true,
    '(2) 写一条普通记录（前置）', null)
  const pinnedRun = await call(b, 'vibe_vmu_records', { action: 'prune', track: 'obstacles', keep: 0, why: '清空障碍轨的普通行' })
  ok(pinnedRun.ok === true && pinnedRun.prunedCount === 1 && Array.isArray(pinnedRun.pinned) && pinnedRun.pinned.length === 1,
    '(2) ★ permanent 行进 `pinned` 被跳过，普通行照常移走（一次 prune 不因保护行中断）',
    { prunedCount: pinnedRun.prunedCount, pinned: pinnedRun.pinned })
  ok(/permanent/.test(String(pinnedRun.pinnedMeans || '')),
    '(2) `pinnedMeans` 说明 permanent 受保护（docs/20 §6）', String(pinnedRun.pinnedMeans || '').slice(0, 140))

  const nothing = await call(b, 'vibe_vmu_records', { action: 'prune', track: 'paper', keep: 5, why: '没有可移的' })
  ok(nothing.ok === true && nothing.prunedCount === 0 && /nothing to do/.test(String(nothing.hint || '')),
    '(2) 轨里行数不超过 keep 时是 no-op，且 hint 说「nothing to do」',
    { prunedCount: nothing.prunedCount, hint: nothing.hint })

  const unknownTrack = await call(b, 'vibe_vmu_records', { action: 'prune', track: 'no-such-track', keep: 0, why: 'x' })
  ok(unknownTrack.ok === false || unknownTrack.prunedCount === 0,
    '(2) 未知轨不会静默「成功移走 0 行」而误导代理',
    unknownTrack.ok === false ? { code: unknownTrack.code } : { prunedCount: unknownTrack.prunedCount })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('§3 满轨仍可更新同一行（否则 prune 之后的下一次写会留下幽灵行）')
{
  const b = await boot({ 'vmu.records.head.maxItems': 2 })
  const first = putRow(b, { track: 'paper', kind: 'paper-state', title: 'q165-x', body: 'x1' })
  const second = putRow(b, { track: 'paper', kind: 'paper-state', title: 'q165-y', body: 'y1' })
  ok(first.ok === true && second.ok === true, '(3) 两条写满 paper 轨（前置）', null)
  const addBlocked = putRow(b, { track: 'paper', kind: 'paper-state', title: 'q165-z', body: 'z' })
  ok(addBlocked.ok === false && String(addBlocked.code) === 'VMU_QUOTA_EXCEEDED',
    '(3) 满轨时**新增**仍被 `VMU_QUOTA_EXCEEDED` 拒（闸还在）', { code: addBlocked.code })
  const updated = (() => {
    try {
      const row = b.kernel.records.put({ id: first.id, track: 'paper', kind: 'paper-state', title: 'q165-x', body: 'x2-much-longer-body' })
      return { ok: true, id: row.id, rev: row.rev }
    } catch (e) { return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) } }
  })()
  ok(updated.ok === true && updated.id === first.id,
    '(3) ★ 满轨时**更新同一行**成功（更新不占新名额）', updated.ok === false ? updated : undefined)
  const rows = b.kernel.records.list({ track: 'paper', limit: 0 }).items
  const reread = b.kernel.records.get({ id: first.id }) || {}
  ok(rows.filter((r) => r.title === 'q165-x').length === 1 && String(reread.body || '').includes('x2-much-longer-body'),
    '(3) 更新后仍是一行（没有留下第二份/幽灵行），且正文是新版本', { rowsSameTitle: rows.filter((r) => r.title === 'q165-x').length, body: String(reread.body || '').slice(0, 40) })
  ok(String(reread.slug || '') === 'q165-x',
    '(3) ★ 同一行的 slug 在更新时不漂移（否则 paper 的 state 行每写一次就多一个 -2/-3 后缀）', { slug: reread.slug })
}

console.log('')
console.log('=== RUN 165 QUOTA REACHABLE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { for (const f of failures) console.log('FAILED :: ' + f); process.exit(1) }
