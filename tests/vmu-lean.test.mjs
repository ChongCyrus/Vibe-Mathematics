// vibe-math-vmu —— Lean 面（kernel/lean.js）独立测试。
// 不需要本机装 Lean：执行接缝 `spawn` 是注入的假实现 ✓；文件用临时目录里的真文件（哈希语义要真）。
// 运行：`node tests/vmu-lean.test.mjs`（末行 `ALL GREEN (passed=N, failed=0)`／失败则非 0 退出）。

import assert from 'node:assert/strict'
import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLeanFace, LEAN_KEYS, LEAN_JOB_LOG_MAX } from '../vibe-math-vmu/kernel/lean.js'

let passed = 0
let failed = 0
const cases = []
const test = (name, fn) => cases.push({ name, fn })

const mkSettings = (over) => {
  const vals = Object.assign({
    'vmu.math.formalVerify': 'off',
    'vmu.math.leanCommand': 'lean',
    'vmu.math.leanArgs': [],
    'vmu.math.leanTimeoutMs': 5000,
    'vmu.math.leanAsync': true,
    'vmu.math.leanInitiative': 'normal',
    'vmu.math.leanSearchPaths': [],
    'vmu.math.leanJobsMaxParallel': 1,
  }, over || {})
  const reads = []
  return {
    reads,
    get(k) { reads.push(k); return vals[k] },
    vals,
  }
}

const dir = await mkdtemp(join(tmpdir(), 'vmu-lean-'))
const leanFile = join(dir, 'Proof.lean')
await writeFile(leanFile, 'theorem t : True := trivial\n', 'utf8')

// ── 排队 → 结算（async 入队即返回；settle 取回执）────────────────────────────
test('async submit queues immediately, settle returns the receipt', async () => {
  const settings = mkSettings({ 'vmu.math.leanAsync': true })
  let resolveSpawn
  const spawn = () => new Promise((res) => { resolveSpawn = () => res({ exitCode: 0, stdout: 'ok' }) })
  const face = createLeanFace({ settings, spawn, root: dir, clock: () => 1, log: () => {} })
  const sub = await face.submit({ statement: 'True', file: leanFile })
  assert.equal(sub.ok, true)
  assert.equal(sub.state, 'queued')            // leanAsync=true ⇒ 入队即返回
  assert.match(sub.id, /^lean-\d+$/)
  await new Promise((r) => setTimeout(r, 10)) // 异步 pump：等作业真的起跑（spawn 已被调用）
  resolveSpawn()
  const s = await face.settle(sub.id)
  assert.equal(s.ok, true)
  assert.equal(s.passed, true, 'exit 0 + hash 未变 ⇒ passed')
  assert.equal(s.exitCode, 0)
  assert.equal(s.hashUnchanged, true)
  passed += 1
})

// ── 哈希变了就不算 passed（核心规则；**同步**路径）──────────────────────────
test('a file that changes during the run is NOT passed (hash changed)', async () => {
  const settings = mkSettings({ 'vmu.math.leanAsync': false })
  const spawn = async () => { await appendFile(leanFile, '-- mutated during compile\n', 'utf8'); return { exitCode: 0 } }
  const face = createLeanFace({ settings, spawn, root: dir, clock: () => 2, log: () => {} })
  const sub = await face.submit({ statement: 'True', file: leanFile })
  assert.equal(sub.state, 'failed', '同步路径：提交返回时已结算')
  const s = await face.settle(sub.id)
  assert.equal(s.passed, false)
  assert.equal(s.hashUnchanged, false)
  assert.equal(s.receipt.code, 'VMU_LEAN_HASH_CHANGED')
  passed += 1
})

// ── 超时 ⇒ 具名拒（VMU_* ＋ hint）──────────────────────────────────────────
test('a timed-out run is a named refusal', async () => {
  const settings = mkSettings({ 'vmu.math.leanAsync': false })
  const spawn = async () => ({ timedOut: true, exitCode: null })
  const face = createLeanFace({ settings, spawn, root: dir, clock: () => 3, log: () => {} })
  const sub = await face.submit({ statement: 'True', file: leanFile })
  const s = await face.settle(sub.id)
  assert.equal(s.passed, false)
  assert.equal(s.receipt.code, 'VMU_LEAN_TIMEOUT')
  assert.ok(s.receipt.hint && s.receipt.hint.length > 0, '拒绝必须带 hint')
  passed += 1
})

// ── 非法输入 ⇒ 具名拒 ───────────────────────────────────────────────────────
test('missing statement/file are named refusals', async () => {
  const settings = mkSettings({})
  const face = createLeanFace({ settings, spawn: async () => ({ exitCode: 0 }), root: dir, clock: () => 4 })
  assert.equal((await face.submit({ file: leanFile })).code, 'VMU_LEAN_STATEMENT_REQUIRED')
  assert.equal((await face.submit({ statement: 'True' })).code, 'VMU_LEAN_FILE_REQUIRED')
  assert.equal(face.status('lean-999').code, 'VMU_LEAN_NOT_FOUND')
  passed += 1
})

// ── 并发上限（默认 1 ⇒ 串行）：同时提交 3 个，任意时刻至多 1 个在飞 ──────────
test('leanJobsMaxParallel=1 keeps the queue serial', async () => {
  const settings = mkSettings({ 'vmu.math.leanAsync': true, 'vmu.math.leanJobsMaxParallel': 1 })
  let inFlight = 0
  let peak = 0
  const gates = []
  const spawn = () => {
    inFlight += 1
    peak = Math.max(peak, inFlight)
    return new Promise((res) => gates.push(() => { inFlight -= 1; res({ exitCode: 0 }) }))
  }
  const face = createLeanFace({ settings, spawn, root: dir, clock: () => 5 })
  const a = await face.submit({ statement: 'A', file: leanFile })
  const b = await face.submit({ statement: 'B', file: leanFile })
  const c = await face.submit({ statement: 'C', file: leanFile })
  await new Promise((r) => setTimeout(r, 10)) // 异步 pump：等第一个作业真的起跑
  assert.equal(gates.length, 1, '串行 ⇒ 只有 1 个作业真的起跑')
  for (const j of [a, b, c]) {
    // 串行队列：逐作业等它真的结算（期间放行假 spawn 的闸门）
    for (let i = 0; i < 400; i += 1) {
      const st = (face.status(j.id).job || {}).state
      if (st === 'settled' || st === 'failed') break
      const g = gates.shift()
      if (g) g()
      await new Promise((r) => setTimeout(r, 5))
    }
    const s = await face.settle(j.id)
    assert.equal(s.ok, true, '作业应已结算：' + j.id)
    assert.equal(s.passed, true, 'exit 0 + hash 未变 ⇒ passed：' + j.id)
  }
  assert.equal(peak, 1)
  assert.equal(face.jobsMaxParallel(), 1)
  passed += 1
})

// ── searchPaths：去重（保序）＋ 注入在**自动 VibMath 根之前** ─────────────────
test('searchPaths are deduped and injected before the automatic root', async () => {
  const settings = mkSettings({
    'vmu.math.leanSearchPaths': ['/extra/b', '/extra/a', '/extra/b', '  '],
    'vmu.math.leanArgs': ['--quiet'],
  })
  const face = createLeanFace({ settings, spawn: async () => ({ exitCode: 0 }), root: '/vibmath', clock: () => 6 })
  const cmd = face.commandFor('Members/r-1/Proof.lean')
  assert.deepEqual(cmd.args, ['-R', '/extra/b', '-R', '/extra/a', '-R', '/vibmath', '--quiet', 'Members/r-1/Proof.lean'])
  // 显式 -R/--root 已在 leanArgs ⇒ 不再追加自动根
  const settings2 = mkSettings({ 'vmu.math.leanArgs': ['-R', '/explicit'] })
  const face2 = createLeanFace({ settings: settings2, spawn: async () => ({ exitCode: 0 }), root: '/vibmath', clock: () => 6 })
  assert.deepEqual(face2.commandFor('P.lean').args, ['-R', '/explicit', 'P.lean'])
  passed += 1
})

// ── formalVerify=off ⇒ **零策略**（不要求、不提示）；encourage/require 正交于 initiative ─
test('formalVerify=off yields zero policy; initiative stays orthogonal', async () => {
  const off = createLeanFace({ settings: mkSettings({ 'vmu.math.formalVerify': 'off', 'vmu.math.leanInitiative': 'eager' }), spawn: async () => ({ exitCode: 0 }), root: dir })
  const p1 = off.policy()
  assert.equal(p1.formalVerify, 'off')
  assert.equal(p1.requireFormal, false)
  assert.equal(p1.encourageFormal, false)
  assert.equal(p1.initiative, 'eager', '日常主动性只如实回显，不受 formalVerify 影响')
  const req = createLeanFace({ settings: mkSettings({ 'vmu.math.formalVerify': 'require' }), spawn: async () => ({ exitCode: 0 }), root: dir })
  assert.equal(req.policy().requireFormal, true)
  passed += 1
})

// ── keysUsed()：本面**真读**了哪些键（8 键全读 ⇒ 与实现一致）────────────────
test('keysUsed() lists exactly the keys this face reads', async () => {
  const settings = mkSettings({})
  const face = createLeanFace({ settings, spawn: async () => ({ exitCode: 0 }), root: dir })
  face.submit({ statement: 'True', file: leanFile })
  const used = face.keysUsed()
  assert.deepEqual(used.slice().sort(), LEAN_KEYS.slice().sort())
  assert.equal(used.length, 8)
  for (const k of used) assert.ok(settings.reads.includes(k), 'keysUsed 里的键必须真的被读过：' + k)
  passed += 1
})

// ── 丢弃计数（截断必须计数）────────────────────────────────────────────────
test('the event log is capped and dropped events are counted', async () => {
  const settings = mkSettings({ 'vmu.math.leanAsync': false })
  const face = createLeanFace({ settings, spawn: async () => ({ exitCode: 0 }), root: dir, clock: () => 7 })
  for (let i = 0; i < LEAN_JOB_LOG_MAX + 5; i += 1) face.submit({ statement: 'S' + i, file: leanFile })
  const l = face.list()
  assert.ok(l.droppedEvents > 0, '超上限即计数丢弃：got ' + l.droppedEvents)
  assert.equal(l.jobs.length, LEAN_JOB_LOG_MAX + 5, '作业表本身完整；被丢的是事件日志')
  passed += 1
})

for (const c of cases) {
  try { await c.fn(); console.log('ok - ' + c.name) } catch (e) { failed += 1; console.log('FAIL - ' + c.name + ' :: ' + String((e && e.message) || e)) }
}
await rm(dir, { recursive: true, force: true })
console.log((failed === 0 ? 'ALL GREEN' : 'RED') + '  (passed=' + passed + ', failed=' + failed + ')')
process.exit(failed === 0 ? 0 : 1)
