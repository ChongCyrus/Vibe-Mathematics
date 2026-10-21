// vibe-math-vmu —— Lean 面（kernel/lean.js）独立测试。
// 不需要本机装 Lean：执行接缝 `spawn` 是注入的假实现 ✓；文件用临时目录里的真文件（哈希语义要真）。
// 运行：`node tests/vmu-lean.test.mjs`（末行 `ALL GREEN (passed=N, failed=0)`／失败则非 0 退出）。

import assert from 'node:assert/strict'
import { mkdtemp, writeFile, appendFile, mkdir, rm } from 'node:fs/promises'
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
// ★ PHASE 9 / round 5: readHash MUST resolve against root, not the process cwd (real machine: VMU_LEAN_FILE_UNREADABLE).
test('file paths are resolved against root, not the process cwd', async () => {
  const root = join(dir, 'workspace-root')
  await mkdir(join(root, 'Formal'), { recursive: true })
  await writeFile(join(root, 'Formal', 'X.lean'), 'theorem x : True := trivial\n', 'utf8')
  const face = createLeanFace({ settings: mkSettings({ 'vmu.math.leanAsync': false }), spawn: async () => ({ exitCode: 0 }), root, clock: () => 3, log: () => {} })
  const sub = await face.submit({ statement: 'True', file: 'Formal/X.lean' })
  const s2 = await face.settle(sub.id)
  assert.equal(s2.passed, true, 'ROOT-relative file was read and its hash was unchanged')
  assert.equal(s2.receipt && s2.receipt.code, undefined)
  passed += 1
})

// ★ 反：a same-named file in the PROCESS CWD must NOT be read when root is set (the old bug).
test('a file in the process cwd is not used when root points elsewhere', async () => {
  const cwdElsewhere = join(dir, 'cwd-elsewhere')
  await mkdir(join(cwdElsewhere, 'Formal'), { recursive: true })
  await writeFile(join(cwdElsewhere, 'Formal', 'Y.lean'), 'theorem y : True := trivial\n', 'utf8')
  const emptyRoot = join(dir, 'empty-root')
  await mkdir(emptyRoot, { recursive: true })
  const previous = process.cwd()
  try {
    process.chdir(cwdElsewhere)
    const face = createLeanFace({ settings: mkSettings({ 'vmu.math.leanAsync': false }), spawn: async () => ({ exitCode: 0 }), root: emptyRoot, clock: () => 4, log: () => {} })
    const sub = await face.submit({ statement: 'True', file: 'Formal/Y.lean' })
    const s2 = await face.settle(sub.id)
    assert.equal(s2.receipt.code, 'VMU_LEAN_FILE_UNREADABLE', 'root (not cwd) is the base: the cwd file must be invisible')
  } finally {
    process.chdir(previous)
  }
  passed += 1
})

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

// ── ★ exitCode 缺失 ≠ 退出码非零：具名分开（正/反）────────────────────────────
test('spawn returning NO exitCode is VMU_LEAN_SPAWN_FAILED, not EXIT_NONZERO', async () => {
  const settings = mkSettings({ 'vmu.math.leanAsync': false })
  const spawn = async () => ({ exitCode: null, stdout: 'no code' })
  const face = createLeanFace({ settings, spawn, root: dir, clock: () => 5, log: () => {} })
  const sub = await face.submit({ statement: 'True', file: leanFile })
  const s = await face.settle(sub.id)
  assert.equal(s.passed, false)
  assert.equal(s.receipt.code, 'VMU_LEAN_SPAWN_FAILED')
  assert.match(s.receipt.message, /spawn 未返回退出码/)
  assert.ok(s.receipt.hint && /spawn/.test(s.receipt.hint))
  assert.equal(s.exitCode, null)
  const job = face.list().jobs.find((j) => j.id === sub.id)
  assert.equal(job.code, 'VMU_LEAN_SPAWN_FAILED', 'job view must CARRY the code (not a bare failed)')
  passed += 1
})

// ★ PHASE 9 / round 6: hadHandle + no exit code + no error fields is its own direction (typically a sandbox exec denial),
// not the generic spawn failure. Reverse: a numeric exit code still goes to EXIT_NONZERO (test below).
test('hadHandle + undefined exitCode + no error is VMU_LEAN_EXIT_UNOBSERVED', async () => {
  const settings = mkSettings({ 'vmu.math.leanAsync': false })
  const spawnHandle = async (req, onHandle) => {
    onHandle({ kill: () => {} })
    return { exitCode: undefined, resolved: 'D:\\.elan\\bin\\lean.EXE', doneError: null, spawnError: null, resolveError: null }
  }
  const face = createLeanFace({ settings, spawn: async () => ({ exitCode: 0 }), spawnHandle, root: dir, clock: () => 5, log: () => {} })
  const sub = await face.submit({ statement: 'True', file: leanFile })
  const s = await face.settle(sub.id)
  assert.equal(s.receipt.code, 'VMU_LEAN_EXIT_UNOBSERVED')
  assert.match(s.receipt.message, /已解析|退出码/)
  assert.match(s.receipt.hint, /沙箱|workspace-write|权限/)
  assert.equal(s.receipt.resolved, 'D:\\.elan\\bin\\lean.EXE')
  passed += 1
})

test('a real non-zero exit is still VMU_LEAN_EXIT_NONZERO', async () => {
  const settings = mkSettings({ 'vmu.math.leanAsync': false })
  const spawn = async () => ({ exitCode: 1, stderr: 'error: unknown identifier' })
  const face = createLeanFace({ settings, spawn, root: dir, clock: () => 6, log: () => {} })
  const sub = await face.submit({ statement: 'True', file: leanFile })
  const s = await face.settle(sub.id)
  assert.equal(s.passed, false)
  assert.equal(s.receipt.code, 'VMU_LEAN_EXIT_NONZERO')
  assert.equal(s.exitCode, 1)
  passed += 1
})

// ★ PHASE 9 / round 1: the failure must carry EVIDENCE and distinguish "command not found" from "ran but failed".
test('spawn resolve/ENOENT is VMU_LEAN_COMMAND_NOT_FOUND and carries resolved/doneError/pathPrefix', async () => {
  const settings = mkSettings({ 'vmu.math.leanAsync': false })
  const spawn = async () => {
    const e = new Error('spawn lean ENOENT')
    e.code = 'ENOENT'
    e.commandNotFound = true
    e.resolved = null
    e.doneError = null
    e.path = 'C:\\host\\bin;C:\\Windows\\system32'
    throw e
  }
  const face = createLeanFace({ settings, spawn, root: dir, clock: () => 7, log: () => {} })
  const sub = await face.submit({ statement: 'True', file: leanFile })
  const s = await face.settle(sub.id)
  assert.equal(s.passed, false)
  assert.equal(s.receipt.code, 'VMU_LEAN_COMMAND_NOT_FOUND')
  assert.equal(s.receipt.resolved, null, 'the resolved field is PRESENT (null), not only mentioned in message')
  assert.equal(s.receipt.doneError, null)
  assert.match(String(s.receipt.pathPrefix), /host/)
  assert.match(String(s.receipt.message), /resolved=/)
  assert.match(String(s.receipt.hint), /leanCommand/)
  passed += 1
})

test('done rejection is SPAWN_FAILED with doneError, never COMMAND_NOT_FOUND; exit 1 stays EXIT_NONZERO', async () => {
  const settings = mkSettings({ 'vmu.math.leanAsync': false })
  const spawn = async () => {
    const e = new Error('spawn failed')
    e.resolved = 'C:\\lean\\lean.exe'
    e.doneError = { code: 'EACCES', message: 'access denied', signal: null }
    e.path = 'C:\\host\\bin'
    throw e
  }
  const face = createLeanFace({ settings, spawn, root: dir, clock: () => 8, log: () => {} })
  const sub = await face.submit({ statement: 'True', file: leanFile })
  const s = await face.settle(sub.id)
  assert.equal(s.receipt.code, 'VMU_LEAN_SPAWN_FAILED')
  assert.equal(s.receipt.resolved, 'C:\\lean\\lean.exe')
  assert.equal(s.receipt.doneError && s.receipt.doneError.code, 'EACCES')
  assert.match(String(s.receipt.message), /doneError=/)
  const settings2 = mkSettings({ 'vmu.math.leanAsync': false })
  const face2 = createLeanFace({ settings: settings2, spawn: async () => ({ exitCode: 1 }), root: dir, clock: () => 9, log: () => {} })
  const sub2 = await face2.submit({ statement: 'True', file: leanFile })
  const s2 = await face2.settle(sub2.id)
  assert.equal(s2.receipt.code, 'VMU_LEAN_EXIT_NONZERO', 'a found command with non-zero exit is NOT a command-not-found')
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
  // non-vacuous (RULE E): the key list must really be non-empty, or "keysUsed covers everything" is vacuous.
  assert.ok(LEAN_KEYS.length > 0, 'LEAN_KEYS must be non-empty (got ' + LEAN_KEYS.length + ')')
  assert.ok(settings.reads.length > 0, 'the settings seam must really have been read (got ' + settings.reads.length + ')')
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

// ── ROUND 131：归档三动词（v5r 的 lean_archive / lean_read / lean_lib）────────────────────────
test('archive registers a named reference, lib lists it, read returns it VERBATIM', async () => {
  const original = 'theorem reusable : True := trivial\n'
  const f = join(dir, 'Reusable.lean')
  await writeFile(f, original, 'utf8')
  const face = createLeanFace({ settings: mkSettings({}), spawn: async () => ({ exitCode: 0 }), root: dir, clock: () => 8 })
  const a = await face.archive({ name: 'reusable', kind: 'def', file: f, statement: 'reusable truth' })
  assert.equal(a.ok, true, '归档应当成功：' + JSON.stringify(a).slice(0, 120))
  assert.match(a.hash, /^[0-9a-f]{64}$/, '归档登记的是内容哈希（只引不复制）')
  const l = face.lib()
  assert.equal(l.count, 1)
  assert.deepEqual(l.kinds, ['def'])
  assert.equal(l.entries[0].name, 'reusable')
  const r = await face.read({ name: 'reusable' })
  assert.equal(r.ok, true, 'read 应当成功：' + JSON.stringify(r).slice(0, 120))
  assert.equal(r.content, original, 'read 返回的是**逐字**原文')
  assert.equal(r.hash, a.hash)
  assert.equal(r.dropped.bytes, 0)
  passed += 1
})

test('archive refuses a duplicate name instead of silently overwriting', async () => {
  const f = join(dir, 'Dup.lean')
  await writeFile(f, 'theorem dup : True := trivial\n', 'utf8')
  const face = createLeanFace({ settings: mkSettings({}), spawn: async () => ({ exitCode: 0 }), root: dir, clock: () => 9 })
  const first = await face.archive({ name: 'dup', file: f })
  assert.equal(first.ok, true, '第一次（kind 缺省 def）成功')
  const again = await face.archive({ name: 'dup', file: f })
  assert.equal(again.ok, false)
  assert.equal(again.code, 'VMU_LEAN_ARCHIVE_NAME_TAKEN', '重名必须具名拒：' + JSON.stringify(again).slice(0, 120))
  assert.equal(face.lib().count, 1, '被拒的归档不得进入库（不静默覆盖）')
  passed += 1
})

test('archive refuses an unknown kind, a missing name and a missing file, each by name', async () => {
  const f = join(dir, 'Kinds.lean')
  await writeFile(f, 'theorem k : True := trivial\n', 'utf8')
  const face = createLeanFace({ settings: mkSettings({}), spawn: async () => ({ exitCode: 0 }), root: dir, clock: () => 10 })
  const kind = await face.archive({ name: 'x', kind: 'poem', file: f })
  assert.equal(kind.code, 'VMU_LEAN_KIND_UNKNOWN', '未知 kind 具名拒：' + JSON.stringify(kind).slice(0, 120))
  const noName = await face.archive({ file: f })
  assert.equal(noName.code, 'VMU_LEAN_ARCHIVE_NAME_REQUIRED')
  const noFile = await face.archive({ name: 'y' })
  assert.equal(noFile.code, 'VMU_LEAN_FILE_REQUIRED')
  const gone = await face.read({ name: 'never-archived' })
  assert.equal(gone.code, 'VMU_LEAN_ARCHIVE_NOT_FOUND')
  assert.equal(face.lib().count, 0, '四次被拒之后库仍为空')
  passed += 1
})

test('read refuses when the referenced file DRIFTED (cite-not-copy is enforced)', async () => {
  const f = join(dir, 'Drift.lean')
  await writeFile(f, 'theorem stable : True := trivial\n', 'utf8')
  const face = createLeanFace({ settings: mkSettings({}), spawn: async () => ({ exitCode: 0 }), root: dir, clock: () => 11 })
  assert.equal((await face.archive({ name: 'drift', kind: 'lemma', file: f })).ok, true)
  assert.equal((await face.read({ name: 'drift' })).ok, true, '★ 先证明未变时【能】读（否则下面的拒说明不了问题）')
  await appendFile(f, '-- the file moved under the reference\n', 'utf8')
  const after = await face.read({ name: 'drift' })
  assert.equal(after.ok, false)
  assert.equal(after.code, 'VMU_LEAN_ARCHIVE_DRIFT', '内容变了必须具名拒：' + JSON.stringify(after).slice(0, 140))
  assert.equal(after.content, undefined, '★ 拒的时候【不得】返回旧内容（否则就变成复制了）')
  passed += 1
})

for (const c of cases) {
  try { await c.fn(); console.log('ok - ' + c.name) } catch (e) { failed += 1; console.log('FAIL - ' + c.name + ' :: ' + String((e && e.message) || e)) }
}
await rm(dir, { recursive: true, force: true })
console.log((failed === 0 ? 'ALL GREEN' : 'RED') + '  (passed=' + passed + ', failed=' + failed + ')')
process.exit(failed === 0 ? 0 : 1)
