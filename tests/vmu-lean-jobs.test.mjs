// vibe-math-vmu —— ROUND 2 目标 5 B（N2）：**Lean 作业的镜像 / 六态 / 恢复四分支**（kernel/lean.js）。
// 运行：`node tests/vmu-lean-jobs.test.mjs`（末行 `=== VMU LEAN JOBS: N passed, M failed ===`）。
//
// 非空过原则：
//   · 一切接缝都注入（假 fs 内存盘、假 spawn、注入 clock、注入 kernel/ids.js 实例）；
//   · 每个恢复分支都断言**具体计数 + 具体状态 + 是否真的重跑**（不是"大概没坏"）；
//   · "重启"= 同一份镜像目录上换一个**新的 face 实例**（这正是进程重启的形状）；
//   · 文件哈希语义用**真文件**（临时目录），因为"内容未变"这件事不能用假数据糊过去。

import assert from 'node:assert/strict'
import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLeanFace, LEAN_KEYS, LEAN_JOB_SCHEMA, LEAN_JOB_STATES, LEAN_TERMINAL_STATES } from '../vibe-math-vmu/kernel/lean.js'
import { createIds } from '../vibe-math-vmu/kernel/ids.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })

/** In-memory fs seam mirroring the host shape (writeText/readText/listDir + optional removeText). */
function memFs(seed = {}) {
  const store = new Map(Object.entries(seed))
  return {
    store,
    writeText: async (rel, text) => { store.set(String(rel).replace(/\\/g, '/'), String(text)); return true },
    readText: async (rel) => { const v = store.get(String(rel).replace(/\\/g, '/')); return v === undefined ? undefined : v },
    exists: async (rel) => store.has(String(rel).replace(/\\/g, '/')),
    listDir: async (rel) => {
      const prefix = String(rel).replace(/\\/g, '/').replace(/\/+$/, '') + '/'
      const seen = new Map()
      for (const k of store.keys()) {
        if (!k.startsWith(prefix)) continue
        const rest = k.slice(prefix.length)
        const head = rest.split('/')[0]
        if (rest.indexOf('/') === -1) seen.set(head, 'file')
        else if (!seen.has(head)) seen.set(head, 'directory')
      }
      return [...seen.entries()].map(([name, type]) => ({ name, type }))
    },
  }
}

const mkSettings = (over) => {
  const vals = Object.assign({
    'vmu.math.leanCommand': 'lean',
    'vmu.math.leanArgs': [],
    'vmu.math.leanTimeoutMs': 5000,
    'vmu.math.leanAsync': false,          // 同步：每个断言拿到终态
    'vmu.math.leanInitiative': 'normal',
    'vmu.math.leanSearchPaths': [],
    'vmu.math.leanJobsMaxParallel': 1,
    'vmu.math.jobs.persist': true,
    'vmu.math.jobs.dir': '',              // 空 ⇒ Formal/Jobs（v5r 的路径拼写）
  }, over || {})
  const reads = []
  const get = (k) => { reads.push(k); return vals[k] }
  return { vals, reads, settings: { get } }
}
const mirrorPath = (id) => 'Formal/Jobs/' + id + '.json'
const readMirror = (fs, id) => JSON.parse(fs.store.get(mirrorPath(id)))
const writeMirror = (fs, id, rec) => fs.store.set(mirrorPath(id), JSON.stringify(rec))

const dir = await mkdtemp(join(tmpdir(), 'vmu-leanjobs-'))
const clean = 'theorem t : True := trivial\n'
const leanFile = join(dir, 'Proof.lean')
await writeFile(leanFile, clean, 'utf8')
const okSpawn = async () => ({ exitCode: 0, stdout: 'ok' })

// ── 0. 状态全集没有 `passed`（它只是结论，不是状态）＋ 镜像 schema ───────────────────────────
test('there is no "passed" STATE: settled is a state, passed is a conclusion about it', async () => {
  assert.equal(LEAN_JOB_STATES.indexOf('passed'), -1)
  assert.deepEqual(LEAN_JOB_STATES.slice(0, 3), ['queued', 'running', 'settled'])
  assert.ok(LEAN_TERMINAL_STATES.indexOf('interrupted') !== -1)
  const fs = memFs()
  const face = createLeanFace({ settings: mkSettings().settings, spawn: okSpawn, root: dir, clock: () => 1, fs })
  const sub = await face.submit({ statement: 'True', file: leanFile })
  const rec = readMirror(fs, sub.id)
  assert.equal(rec.schema, LEAN_JOB_SCHEMA)
  assert.equal(rec.state, 'settled')
  assert.equal(rec.passed, true)
  assert.equal(rec.hashUnchanged, true)
  assert.match(rec.contextHash, /^ctx:[0-9a-f]{24}$/)
  assert.ok(rec.receipt && rec.receipt.passed === true)
  assert.equal(LEAN_KEYS.length > 0, true, 'the settings list must be non-empty (got ' + LEAN_KEYS.length + ')')
  passed += 1
})

// ── 1. 分支 ①：重启后 `queued` ⇒ 重新入队并真的重跑（attempts 不变：0 ⇒ 第 1 次）─────────────
test('recover branch 1 — a queued mirror is requeued and really re-run after a restart', async () => {
  const fs = memFs()
  const spawnCalls = []
  const spawn = async (cmd) => { spawnCalls.push(cmd); return { exitCode: 0 } }
  const face1 = createLeanFace({ settings: mkSettings().settings, spawn, root: dir, clock: () => 2, fs })
  const sub = await face1.submit({ statement: 'True', file: leanFile })
  const rec = readMirror(fs, sub.id)
  rec.state = 'queued'; rec.startedAt = 0; rec.settledAt = 0; rec.receipt = null; rec.passed = false; rec.attempts = 0
  writeMirror(fs, sub.id, rec)
  const before = spawnCalls.length
  const face2 = createLeanFace({ settings: mkSettings().settings, spawn, root: dir, clock: () => 3, fs })
  const rep = await face2.recover()
  assert.equal(rep.ok, true)
  assert.equal(rep.requeued, 1, 'queued 必须重排：' + JSON.stringify(rep))
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(spawnCalls.length, before + 1, '重排必须**真的再跑一次**（不是只改状态）')
  const s = await face2.settle(sub.id)
  assert.equal(s.ok, true)
  assert.equal(readMirror(fs, sub.id).attempts, 1, '从未开始的作业重排后仍是第 1 次')
  passed += 1
})

// ── 2. 分支 ②：`running` ＋ 文件内容仍未变 ⇒ interrupted 后重排（attempts+1）────────────────
test('recover branch 2 — running + unchanged file content is interrupted then requeued (attempts+1)', async () => {
  const fs = memFs()
  const spawnCalls = []
  const spawn = async (cmd) => { spawnCalls.push(cmd); return { exitCode: 0 } }
  const face1 = createLeanFace({ settings: mkSettings().settings, spawn, root: dir, clock: () => 4, fs })
  const sub = await face1.submit({ statement: 'True', file: leanFile })
  const rec = readMirror(fs, sub.id)
  rec.state = 'running'; rec.receipt = null; rec.passed = false; rec.attempts = 1
  writeMirror(fs, sub.id, rec)
  const before = spawnCalls.length
  const face2 = createLeanFace({ settings: mkSettings().settings, spawn, root: dir, clock: () => 5, fs })
  const rep = await face2.recover()
  assert.equal(rep.interrupted, 1, 'running 必须先计一次 interrupted：' + JSON.stringify(rep))
  assert.equal(rep.requeued, 1, '内容未变 ⇒ 允许重排')
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(spawnCalls.length, before + 1)
  const after = readMirror(fs, sub.id)
  assert.equal(after.attempts, 2, '重排必须 attempts+1')
  assert.equal(after.state, 'settled')
  passed += 1
})

// ── 3. 分支 ③：`running` ＋ 文件已变 ⇒ **只 interrupted，绝不重跑旧内容** ────────────────────
test('recover branch 3 — running + changed content is interrupted and NOT re-run', async () => {
  const fs = memFs()
  const spawnCalls = []
  const spawn = async (cmd) => { spawnCalls.push(cmd); return { exitCode: 0 } }
  const file2 = join(dir, 'Changed.lean')
  await writeFile(file2, clean, 'utf8')
  const face1 = createLeanFace({ settings: mkSettings().settings, spawn, root: dir, clock: () => 6, fs })
  const sub = await face1.submit({ statement: 'True', file: file2 })
  const rec = readMirror(fs, sub.id)
  rec.state = 'running'; rec.receipt = null; rec.passed = false
  rec.hashBefore = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'   // ≠ current
  writeMirror(fs, sub.id, rec)
  const before = spawnCalls.length
  const face2 = createLeanFace({ settings: mkSettings().settings, spawn, root: dir, clock: () => 7, fs })
  const rep = await face2.recover()
  assert.equal(rep.interrupted, 1)
  assert.equal(rep.requeued, 0, '内容变了 ⇒ **不得**自动重排')
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(spawnCalls.length, before, '不得再跑')
  const j = face2.status(sub.id).job
  assert.equal(j.state, 'interrupted')
  assert.equal(j.passed, false, 'interrupted 绝不是 passed')
  assert.ok(rep.results.some((x) => x.action === 'interrupted-no-rerun' && x.why === 'hash-mismatch'))
  passed += 1
})

// ── 4. 分支 ④：`settled` ＋ exit 0 ＋ 哈希未变 ＋ 回执 ＋ 上下文一致 ⇒ 采纳 ──────────────────
test('recover branch 4 — a settled mirror is adopted only when every tool fact still holds', async () => {
  const fs = memFs()
  const face1 = createLeanFace({ settings: mkSettings().settings, spawn: okSpawn, root: dir, clock: () => 8, fs })
  const sub = await face1.submit({ statement: 'True', file: leanFile })
  // A NEW instance over the SAME mirror directory = a restart.
  const face2 = createLeanFace({ settings: mkSettings().settings, spawn: okSpawn, root: dir, clock: () => 9, fs })
  const rep = await face2.recover()
  assert.equal(rep.adopted, 1, 'settled+exit0+哈希未变+回执+上下文一致 ⇒ 采纳：' + JSON.stringify(rep))
  const s = await face2.settle(sub.id)
  assert.equal(s.ok, true)
  assert.equal(s.passed, true, '采纳后 passed 必须恢复')
  assert.equal(s.state, 'settled')
  assert.equal(s.isRefutation, false)
  assert.ok(s.receipt && s.receipt.stdout === 'ok')
  passed += 1
})

// ── 5. **永不静默 passed**：settled 但缺回执 ⇒ 不采纳；上下文变了 ⇒ 不采纳 ───────────────────
test('a settled mirror WITHOUT a receipt is never adopted (no silent passed)', async () => {
  const fs = memFs()
  const face1 = createLeanFace({ settings: mkSettings().settings, spawn: okSpawn, root: dir, clock: () => 10, fs })
  const sub = await face1.submit({ statement: 'True', file: leanFile })
  const rec = readMirror(fs, sub.id)
  rec.receipt = null
  writeMirror(fs, sub.id, rec)
  const face2 = createLeanFace({ settings: mkSettings().settings, spawn: okSpawn, root: dir, clock: () => 11, fs })
  const rep = await face2.recover()
  assert.equal(rep.adopted, 0, '没有回执就不能采纳（settled ≠ 可证明）')
  assert.equal(rep.left, 1)
  assert.ok(rep.results.some((x) => x.why === 'settled-without-receipt'), JSON.stringify(rep.results))
  const j = face2.status(sub.id).job
  assert.equal(j.passed, false)
  assert.ok(!(j.passed === true), 'left 分支永远不得变成 passed')
  passed += 1
})

test('a settled mirror whose BUILD CONTEXT changed is not adopted (named reason)', async () => {
  const fs = memFs()
  const face1 = createLeanFace({ settings: mkSettings().settings, spawn: okSpawn, root: dir, clock: () => 12, fs })
  const sub = await face1.submit({ statement: 'True', file: leanFile })
  // Same mirror, DIFFERENT build context (an extra -R ⇒ a different argv fingerprint).
  const face2 = createLeanFace({
    settings: mkSettings({ 'vmu.math.leanArgs': ['-R', '/somewhere/else'], 'vmu.math.leanSearchPaths': ['/extra'] }).settings,
    spawn: okSpawn, root: dir, clock: () => 13, fs,
  })
  const rep = await face2.recover()
  assert.equal(rep.adopted, 0, '构建上下文变了 ⇒ 不得采纳')
  assert.ok(rep.results.some((x) => x.why === 'build-context-changed'), JSON.stringify(rep.results))
  passed += 1
})

// ── 6. 终态保持原样（failed/timeout 不自动重跑）────────────────────────────────────────────
test('terminal mirrors (failed/timeout) are kept as they are — never auto-rerun', async () => {
  const fs = memFs()
  const spawnCalls = []
  const spawn = async (cmd) => { spawnCalls.push(cmd); return { exitCode: 1, stderr: 'boom' } }
  const face1 = createLeanFace({ settings: mkSettings().settings, spawn, root: dir, clock: () => 14, fs })
  const sub = await face1.submit({ statement: 'True', file: leanFile })
  assert.equal(readMirror(fs, sub.id).state, 'failed')
  const before = spawnCalls.length
  const face2 = createLeanFace({ settings: mkSettings().settings, spawn, root: dir, clock: () => 15, fs })
  const rep = await face2.recover()
  assert.equal(rep.left, 1)
  assert.equal(rep.requeued, 0)
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(spawnCalls.length, before)
  assert.equal(face2.status(sub.id).job.state, 'failed')
  passed += 1
})

// ── 7. 超时是一个**终态**（timeout），且 settle 仍可读回执 ─────────────────────────────────
test('a timeout is terminal (state=timeout) and keeps its named receipt', async () => {
  const fs = memFs()
  const face = createLeanFace({ settings: mkSettings().settings, spawn: async () => ({ timedOut: true, exitCode: null }), root: dir, clock: () => 16, fs })
  const sub = await face.submit({ statement: 'True', file: leanFile })
  const s = await face.settle(sub.id)
  assert.equal(s.ok, true, '超时也是终态，必须可结算（否则只能空等）')
  assert.equal(s.state, 'timeout')
  assert.equal(s.passed, false)
  assert.equal(s.receipt.code, 'VMU_LEAN_TIMEOUT')
  passed += 1
})

// ── 8. id 计数器经 kernel/ids.js：恢复时水合取 max+1（重启后不复用编号）────────────────────
test('job ids come from kernel/ids.js and recovery hydrates the counter to max+1', async () => {
  const fs = memFs()
  const mem = {}
  const store = { read: (k) => mem[k], patch: async (k, fn) => { mem[k] = fn(mem[k]); return mem[k] } }
  const ids = createIds({ store, clock: () => 0 })
  await ids.hydrate()
  // A pre-existing mirror from a PREVIOUS session (the crash left it behind, state=failed ⇒ kept, not re-run).
  const stale = {
    schema: LEAN_JOB_SCHEMA, jobId: 'lean-7', statement: 'old', file: leanFile, state: 'failed',
    attempts: 1, enqueuedAt: 1, startedAt: 1, settledAt: 2, exitCode: 1,
    hashBefore: 'x', hashAfter: 'x', hashUnchanged: false, passed: false,
    contextHash: 'ctx:000000000000000000000000', receipt: null, reason: '',
  }
  writeMirror(fs, 'lean-7', stale)
  const face = createLeanFace({ settings: mkSettings().settings, spawn: okSpawn, root: dir, clock: () => 17, fs, ids })
  const rep = await face.recover()
  assert.equal(rep.left, 1, '旧终态作业原样保留：' + JSON.stringify(rep))
  const next = await face.submit({ statement: 'True', file: leanFile })
  assert.equal(next.id, 'lean-8', '水合取 max+1：已存在 lean-7 ⇒ 下一个是 lean-8（绝不复用编号）')
  assert.equal(ids.counter('lean'), 8)
  assert.equal(ids.status().observations > 0, true, 'observe() 必须真的被告知过既有 id')
  passed += 1
})

// ── 9. admission()：跨进程/子进程终止的**能力边界如实登记** ────────────────────────────────
test('admission() names the real limits instead of pretending', async () => {
  const fs = memFs()
  const face = createLeanFace({ settings: mkSettings().settings, spawn: okSpawn, root: dir, clock: () => 18, fs })
  const a = face.admission()
  assert.equal(a.ok, true)
  assert.equal(a.persist, true)
  assert.equal(a.fileMirror, true)
  assert.equal(a.jobsDir, 'Formal/Jobs', '默认目录与 v5r 的 Formal/Jobs 一致')
  assert.equal(a.exclusiveCreate, false)
  assert.equal(a.crossProcess, 'not-enforced')
  assert.equal(a.canTerminateChild, false, 'promise 接缝没有 handle ⇒ 必须如实说不能 terminate')
  assert.ok(a.notes.length > 0, 'notes 必须非空（否则"登记"是空的）')
  const bare = createLeanFace({ settings: mkSettings().settings, spawn: okSpawn, root: dir, clock: () => 19 })
  assert.equal(bare.admission().fileMirror, false, '没有 fs 接缝 ⇒ 具名不可用')
  passed += 1
})

// ── 10. dispose()：在跑作业 ⇒ interrupted（绝不 passed），且**不能假装 kill 了子进程** ────────
test('dispose() marks a running job interrupted (never passed) and admits it cannot kill the child', async () => {
  const fs = memFs()
  let release
  const gate = new Promise((r) => { release = r })
  const spawn = async () => { await gate; return { exitCode: 0 } }
  const face = createLeanFace({ settings: mkSettings({ 'vmu.math.leanAsync': true }).settings, spawn, root: dir, clock: () => 20, fs })
  const sub = await face.submit({ statement: 'True', file: leanFile })
  await new Promise((r) => setTimeout(r, 10))       // let the pump really start it
  assert.equal(face.status(sub.id).job.state, 'running')
  const d = await face.dispose()
  assert.equal(d.interrupted, 1)
  assert.equal(d.killed, 0)
  assert.equal(d.canTerminateChild, false)
  const rec = readMirror(fs, sub.id)
  assert.equal(rec.state, 'interrupted')
  assert.equal(rec.passed, false, 'dispose 之后绝不是 passed')
  release()
  passed += 1
})

// ── 11. 保留上限：无 removeText ⇒ 到上限停写并计数（不静默、不假装淘汰）──────────────────────
test('retention without removeText stops writing and COUNTS the skips', async () => {
  const fs = memFs()
  const face = createLeanFace({ settings: mkSettings({ 'vmu.math.jobs.keepMirrors': 1 }).settings, spawn: okSpawn, root: dir, clock: () => 21, fs })
  const a = await face.submit({ statement: 'A', file: leanFile })
  const b = await face.submit({ statement: 'B', file: leanFile })
  assert.equal(fs.store.has(mirrorPath(a.id)), true)
  assert.equal(fs.store.has(mirrorPath(b.id)), false, '到上限必须停写（没有删除接缝时不假装淘汰）')
  const adm = face.admission()
  assert.ok(adm.mirrorSkipped >= 1, '停写必须计数：' + JSON.stringify(adm))
  assert.equal(adm.retention, 'append-only-refuse-after-cap')
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
await rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
console.log('=== VMU LEAN JOBS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
