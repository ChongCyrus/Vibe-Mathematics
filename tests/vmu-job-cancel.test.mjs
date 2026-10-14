// vibe-math-vmu —— ROUND 6 · jobId 级取消：**取消要能真的终止**（F17 的延伸），不能终止时必须**具名**。
// 运行：`node tests/vmu-job-cancel.test.mjs`（末行 `=== VMU JOB CANCEL: N passed, M failed ===`）。
//
// 为什么单独一套：v5r 的 Lean 面**没有取消**（`dispose` 只标 interrupted），计算面更没有；本轮把它补上后
// "取消"必须同时满足四件事：① 状态落终态且**落镜像**（否则崩溃恢复会把已取消的作业当 running 重排）；
// ② 拿到活 handle 时**真的 `terminate()`**；③ 拿不到 handle 时**不许暗示进程已死**；
// ④ **排队中被取消的作业一次都不许被 spawn**（否则是另一种"静默复活"）。

import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMathJobs } from '../vibe-math-vmu/kernel/mathjobs.js'
import { createLeanFace } from '../vibe-math-vmu/kernel/lean.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })

const dir = await mkdtemp(join(tmpdir(), 'vmu-cancel-'))
const leanFile = join(dir, 'C.lean')
await writeFile(leanFile, 'theorem c : True := trivial\n', 'utf8')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const until = async (fn, label) => { for (let i = 0; i < 400; i += 1) { if (fn()) return true; await sleep(2) } throw new Error('timeout waiting for ' + label) }

function memFs() {
  const store = new Map()
  return {
    store,
    writeText: async (rel, text) => { store.set(String(rel).replace(/\\/g, '/'), String(text)); return true },
    readText: async (rel) => store.get(String(rel).replace(/\\/g, '/')),
    listDir: async () => [...store.keys()],
    removeText: async (rel) => { store.delete(String(rel).replace(/\\/g, '/')) },
  }
}
function mkTimer() {
  const q = []
  const timer = (cb, ms) => { const item = { cb, ms, dead: false }; q.push(item); return () => { item.dead = true } }
  return { timer, pending: () => q.filter((i) => !i.dead).length, fire: () => { const live = q.filter((i) => !i.dead); q.length = 0; for (const i of live) i.cb(); return live.length } }
}
const mathSettings = (over) => {
  const vals = Object.assign({
    'vmu.math.computation': 'auto', 'vmu.math.engines': ['sympy'], 'vmu.math.mode': 'typed+shell',
    'vmu.math.jobs.persist': true, 'vmu.math.jobs.dir': '', 'vmu.math.jobs.recover': 'manual', 'vmu.math.jobs.keepMirrors': 50,
    'vmu.math.maxParallel': 1, 'vmu.math.timeoutMs': 60000,
  }, over || {})
  return { get: (k) => vals[k] }
}
const leanSettings = (over) => {
  const vals = Object.assign({
    'vmu.math.formalVerify': 'off', 'vmu.math.leanCommand': 'lean', 'vmu.math.leanArgs': [],
    'vmu.math.leanTimeoutMs': 60000, 'vmu.math.leanAsync': true, 'vmu.math.leanInitiative': 'normal',
    'vmu.math.leanSearchPaths': [], 'vmu.math.leanJobsMaxParallel': 1,
    'vmu.math.jobs.persist': true, 'vmu.math.jobs.dir': '', 'vmu.math.jobs.recover': 'manual', 'vmu.math.jobs.keepMirrors': 50,
  }, over || {})
  return { get: (k) => vals[k] }
}
/** A host-native handle whose `done` NEVER settles (so only cancel or the budget can end it). */
const hangingHandle = (onTerminate) => (spawn) => ({
  terminate() { onTerminate() },
  done: new Promise(() => {}),
  collected: { stdout: { readFrom: () => ({ text: '', lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) } },
})
const mjSubmitAsync = (mj, args) => mj.submit(Object.assign({ async: true }, args))

// ── 1. 计算面：running ＋ 有 handle ⇒ 取消**真的 terminate**，且状态/镜像落 cancelled ──────────
test('math: cancelling a running job with a handle REALLY terminates it and lands in the mirror', async () => {
  const t = mkTimer()
  const fs = memFs()
  let killed = 0
  const mj = createMathJobs({ settings: mathSettings(), clock: () => 0, spawn: hangingHandle(() => { killed += 1 }), fs, timer: t.timer })
  const sub = await mjSubmitAsync(mj, { engine: 'sympy', argv: ['-c', '1'], jobId: 'mj-c1' })
  assert.equal(sub.ok, true, JSON.stringify(sub))
  await until(() => t.pending() > 0, 'budget armed (handle live)')
  const c = mj.cancel({ jobId: 'mj-c1', reason: 'user asked' })
  assert.equal(c.ok, true, JSON.stringify(c))
  assert.equal(c.state, 'cancelled')
  assert.equal(c.terminated, true, '★ 有 handle ⇒ 取消必须真的 terminate')
  assert.equal(killed, 1, '★ terminate() 必须被调用一次（实测计数，不是自述）')
  await sleep(20)
  const mirrorText = [...fs.store.entries()].map(([, v]) => v).join('\n')
  assert.ok(mirrorText.indexOf('cancelled') !== -1, '★ 取消必须落镜像（否则恢复会把它当 running 重排）')
  passed += 1
})

// ── 2. 计算面：running ＋ 只有 promise 接缝 ⇒ **不许暗示进程已死** ──────────────────────────
test('math: without a handle the cancel is recorded but NAMED as unable-to-terminate', async () => {
  const t = mkTimer()
  const mj = createMathJobs({ settings: mathSettings(), clock: () => 0, spawn: () => new Promise(() => {}), fs: memFs(), timer: t.timer })
  await mjSubmitAsync(mj, { engine: 'sympy', argv: ['-c', '1'], jobId: 'mj-c2' })
  await until(() => t.pending() > 0, 'budget armed (c2)')
  const c = mj.cancel({ jobId: 'mj-c2' })
  assert.equal(c.ok, true, JSON.stringify(c))
  assert.equal(c.state, 'cancelled')
  assert.equal(c.terminated, false)
  assert.equal(c.hadHandle, false)
  assert.ok(String(c.note).indexOf('无法 terminate') !== -1, '★ 回执必须具名：' + c.note)
  passed += 1
})

// ── 3. 计算面：queued 也能取消，且**一次都不该被 spawn**（并发上限 1 时排队中）──────────────
test('math: a QUEUED job can be cancelled and is then NEVER started', async () => {
  const t = mkTimer()
  let spawns = 0
  const spawn = () => { spawns += 1; return { terminate() {}, done: new Promise(() => {}), collected: { stdout: { readFrom: () => ({ text: '', lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) } } } }
  const mj = createMathJobs({ settings: mathSettings(), clock: () => 0, spawn, fs: memFs(), timer: t.timer })
  await mjSubmitAsync(mj, { engine: 'sympy', argv: ['-c', '1'], jobId: 'mj-blocker' })
  await until(() => t.pending() > 0, 'blocker budget armed')
  const q = await mjSubmitAsync(mj, { engine: 'sympy', argv: ['-c', '2'], jobId: 'mj-queued' })
  assert.equal(q.ok, true, JSON.stringify(q))
  assert.equal(mj.status({ jobId: 'mj-queued' }).job.state, 'queued', '并发上限 1 ⇒ 第二个必须先排队')
  const c = mj.cancel({ jobId: 'mj-queued' })
  assert.equal(c.ok, true, 'queued 作业必须能取消：' + JSON.stringify(c))
  assert.equal(c.state, 'cancelled')
  // 让 blocker 结束 ⇒ 排队席位被释放；被取消的作业**绝不能**因此启动
  mj.cancel({ jobId: 'mj-blocker' })
  await sleep(40)
  assert.equal(spawns, 1, '★ 被取消的排队作业**一次都不该被 spawn**（实测 spawn 次数）')
  assert.equal(mj.status({ jobId: 'mj-queued' }).job.state, 'cancelled')
  passed += 1
})

// ── 4. 计算面：终态作业不可取消（具名拒）＋ 并发上限**精确**（不允许多跑一个）────────────────
test('math: terminal cancel is refused by name, and maxParallel is EXACT under concurrency', async () => {
  const t = mkTimer()
  let live = 0
  let peak = 0
  const resolvers = []
  const spawn = () => {
    live += 1; peak = Math.max(peak, live)
    return { terminate() {}, done: new Promise((r) => resolvers.push(() => { live -= 1; r({ exitCode: 0 }) })), collected: { stdout: { readFrom: () => ({ text: 'ok', lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) } } }
  }
  const mj = createMathJobs({ settings: mathSettings(), clock: () => 0, spawn, fs: memFs(), timer: t.timer })
  await mjSubmitAsync(mj, { engine: 'sympy', argv: ['-c', '1'], jobId: 'mj-p1' })
  await mjSubmitAsync(mj, { engine: 'sympy', argv: ['-c', '2'], jobId: 'mj-p2' })
  await until(() => t.pending() > 0, 'p1 budget armed')
  await sleep(20)
  assert.equal(live, 1, '★ 上限 1 ⇒ 同时只能有 1 个子进程（旧实现用 `running() > maxParallel` 会放 2 个）')
  assert.equal(mj.status({ jobId: 'mj-p2' }).job.state, 'queued')
  resolvers[0]()
  await until(() => mj.status({ jobId: 'mj-p2' }).job.state === 'running', 'p2 running')
  assert.equal(peak, 1, '★ 峰值并发必须是 1：' + peak)
  resolvers[1]()
  await until(() => mj.status({ jobId: 'mj-p2' }).job.state === 'settled', 'p2 settled')
  // 终态取消具名拒（另起一面，用立即结算的接缝，避免排队干扰）
  const mj2 = createMathJobs({ settings: mathSettings(), clock: () => 0, spawn: async () => ({ exitCode: 0, stdout: 'ok', stderr: '' }), fs: memFs(), timer: t.timer })
  const done = await mj2.submit({ engine: 'sympy', argv: ['-c', '3'] })
  assert.equal(done.ok, true)
  const c = mj2.cancel({ jobId: done.jobId })
  assert.equal(c.ok, false)
  assert.equal(c.code, 'VMU_JOB_CANCELLED', '终态取消必须具名拒：' + JSON.stringify(c))
  passed += 1
})

// ── 5. Lean 面：取消 ⇒ interrupted（不新增状态，保持 v5r 状态集）＋ 真 terminate ＋ 镜像 ──────
test('lean: cancel terminates the handle, lands as interrupted+cancelled, and does NOT re-run on recover', async () => {
  const t = mkTimer()
  const fs = memFs()
  let killed = 0
  const face = createLeanFace({ settings: leanSettings(), clock: () => 0, spawn: hangingHandle(() => { killed += 1 }), fs, root: dir, timer: t.timer })
  const sub = await face.submit({ statement: 'True', file: leanFile, member: 'r-9' })
  await until(() => t.pending() > 0, 'lean budget armed (handle live)')
  const c = await face.cancel({ jobId: sub.id, reason: 'superseded' })
  assert.equal(c.ok, true, JSON.stringify(c))
  assert.equal(c.state, 'interrupted', '不新增状态（与 v5r 的 Lean 状态集一致）')
  assert.equal(c.terminated, true, '★ 有 handle ⇒ 取消必须真的 terminate')
  assert.equal(killed, 1)
  assert.ok(c.reason.indexOf('cancelled') !== -1, '取消原因必须可见：' + c.reason)
  const notice = face.takeNoticesFor('r-9')
  assert.ok(notice.some((n) => n.indexOf('已取消') !== -1), '取消也要公告（一次性）：' + JSON.stringify(notice))
  // 崩溃恢复口径：interrupted ＋ 非"可重排"原因 ⇒ 不自动重跑（v4r 分支③同形）
  let spawns2 = 0
  const face2 = createLeanFace({ settings: leanSettings(), clock: () => 0, spawn: () => { spawns2 += 1; return { exitCode: 0 } }, fs, root: dir, timer: mkTimer().timer })
  const rec = await face2.recover()
  assert.equal(rec.ok, true)
  await sleep(20)
  assert.equal(spawns2, 0, '★ 已取消的作业**不许**被恢复重跑')
  passed += 1
})

// ── 6. Lean 面：找不到 jobId ⇒ 具名拒；终态不可取消 ⇒ 具名拒 ──────────────────────────────
test('lean: cancel names the two refusals (not-found / already-ended)', async () => {
  const t = mkTimer()
  // SYNCHRONOUS submit (`leanAsync:false`): by the time submit returns the job is already terminal.
  const face = createLeanFace({ settings: leanSettings({ 'vmu.math.leanAsync': false }), clock: () => 0, spawn: async () => ({ exitCode: 0 }), fs: memFs(), root: dir, timer: t.timer })
  const nf = await face.cancel({ jobId: 'lean-9999' })
  assert.equal(nf.ok, false, JSON.stringify(nf))
  assert.equal(nf.code, 'VMU_NOT_FOUND', JSON.stringify(nf))
  const sub = await face.submit({ statement: 'True', file: leanFile })
  assert.equal(sub.state, 'settled', JSON.stringify(sub))
  const done = await face.cancel({ jobId: sub.id })
  assert.equal(done.ok, false, JSON.stringify(done))
  assert.equal(done.code, 'VMU_JOB_CANCELLED', JSON.stringify(done))
  passed += 1
})

// ── 7. dispose()：现在有 handle ⇒ 真的杀，并且**数出来**（旧实现无条件 killed:0）───────────
test('lean: dispose() terminates live handles and counts them honestly', async () => {
  const t = mkTimer()
  let killed = 0
  const face = createLeanFace({ settings: leanSettings(), clock: () => 0, spawn: hangingHandle(() => { killed += 1 }), fs: memFs(), root: dir, timer: t.timer })
  await face.submit({ statement: 'True', file: leanFile })
  await until(() => t.pending() > 0, 'lean budget armed for dispose')
  const d = await face.dispose()
  assert.equal(d.interrupted, 1)
  assert.equal(d.killed, 1, '★ dispose 必须真的 terminate 并计数（旧实现无条件写 killed:0）')
  assert.equal(d.canTerminateChild, true, '运行时证过 handle ⇒ 该字段必须翻真')
  assert.equal(killed, 1)
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
await rm(dir, { recursive: true, force: true })
console.log('=== VMU JOB CANCEL: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
