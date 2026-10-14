// vibe-math-vmu —— ROUND 4 · F17（子进程**真的可终止** + `maxBytes`）/ F44（一次性公告）/ F45（去重与 settle 同源）。
// 运行：`node tests/vmu-lean-killable.test.mjs`（末行 `=== VMU LEAN KILLABLE: N passed, M failed ===`）。
//
// 非空过原则：定时器是**注入的**（测试自己"到点"），所以"超时"不是等出来的、是**控制出来的**；
// 三种 seam 形状各有一条实测：① 宿主原生 handle（spawn 同步返回 `{done, terminate, collected}`）
// ② 显式 `spawnHandle(spec,onHandle)` ③ 旧 promise 接缝（无 handle ⇒ 必须**具名说自己不能终止**）。

import assert from 'node:assert/strict'
import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLeanFace, LEAN_NOTICE_MAX } from '../vibe-math-vmu/kernel/lean.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })

/** Deterministic timer: the test decides when the budget fires. */
function mkTimer() {
  const q = []
  const timer = (cb, ms) => { const item = { cb, ms, dead: false }; q.push(item); return () => { item.dead = true } }
  return {
    timer,
    pending: () => q.filter((i) => !i.dead).length,
    fire: () => { const live = q.filter((i) => !i.dead); q.length = 0; for (const i of live) i.cb(); return live.length },
  }
}
const mkSettings = (over) => {
  const vals = Object.assign({
    'vmu.math.formalVerify': 'off', 'vmu.math.leanCommand': 'lean', 'vmu.math.leanArgs': [],
    'vmu.math.leanTimeoutMs': 5000, 'vmu.math.leanAsync': false, 'vmu.math.leanInitiative': 'normal',
    'vmu.math.leanSearchPaths': [], 'vmu.math.leanJobsMaxParallel': 1,
  }, over || {})
  const reads = []
  const get = (k) => { reads.push(k); return vals[k] }
  return { vals, reads, settings: { get } }
}
const dir = await mkdtemp(join(tmpdir(), 'vmu-lean-killable-'))
const fileA = join(dir, 'A.lean')
await writeFile(fileA, 'theorem a : True := trivial\n', 'utf8')

// ── 1. 宿主原生 handle：spawn 同步返回 handle ⇒ 我们用它的 done/collected，且终止能力=真 ─────────
test('a host-native handle seam is used as-is (killable, and `done`/`collected` are read)', async () => {
  const t = mkTimer()
  let terminated = 0
  const spawn = (spec) => ({
    terminate() { terminated += 1 },
    done: Promise.resolve({ exitCode: 0, signal: null }),
    collected: { stdout: { readFrom: () => ({ text: 'ok\n', lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) } },
    spec,
  })
  const face = createLeanFace({ settings: mkSettings().settings, spawn, root: dir, clock: () => 1, timer: t.timer })
  const sub = await face.submit({ statement: 'True', file: fileA, member: 'r-1' })
  const s = await face.settle(sub.id)
  assert.equal(s.ok, true)
  assert.equal(s.passed, true, 'exit 0 + 哈希未变 ⇒ passed（走的是 handle.done，不是 promise 接缝）')
  assert.equal(face.status(sub.id).job.hadHandle, true, '★ 运行时事实：这一次 spawn 给了 handle')
  assert.equal(face.admission().canTerminateChild, true, '运行时证明过 ⇒ admission 必须说 true')
  assert.equal(face.admission().subprocess.lastSpawnHadHandle, true)
  assert.equal(terminated, 0, '正常结束不得 terminate')
  assert.equal(t.pending(), 0, '结束后定时器必须被清理（每个分支都清）')
  passed += 1
})

// ── 2. 到点**真的 terminate**（handle 的 done 永不结算）────────────────────────────────────
test('when the budget fires, the handle is TERMINATED and the job settles as timeout', async () => {
  const t = mkTimer()
  let terminated = 0
  const spawn = (spec) => ({
    terminate() { terminated += 1 },
    done: new Promise(() => {}),                     // never settles: only the budget can end this
    collected: { stdout: { readFrom: () => ({ text: '', lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) } },
    spec,
  })
  const face = createLeanFace({ settings: mkSettings({ 'vmu.math.leanAsync': true }).settings, spawn, root: dir, clock: () => 2, timer: t.timer })
  const sub = await face.submit({ statement: 'True', file: fileA })
  assert.equal(sub.state, 'queued', '异步入队 ⇒ submit 立即返回（否则本地预算根本没机会到点）')
  // The pump reaches the budget after the async file read; wait for the timer to be ARMED (bounded poll, so
  // the assertion below is real rather than a timing accident).
  for (let i = 0; i < 200 && t.pending() === 0; i += 1) await new Promise((r) => setTimeout(r, 1))
  assert.equal(t.pending() > 0, true, '注入的定时器必须真的被挂上（否则这条测试是空的）')
  assert.equal(t.fire() >= 1, true)
  await new Promise((r) => setTimeout(r, 0))
  const s = await face.settle(sub.id)
  assert.equal(s.state, 'timeout')
  assert.equal(terminated, 1, '★ graceMs 到点必须**真的 terminate**')
  assert.equal(face.status(sub.id).job.terminated, true)
  assert.equal(s.receipt.terminated, true)
  assert.ok(String(s.receipt.message).indexOf('terminate') !== -1, '回执必须说清"已终止"：' + s.receipt.message)
  assert.equal(face.admission().canTerminateChild, true)
  passed += 1
})

// ── 3. 旧 promise 接缝：不挂死，但必须**具名说不能终止**（这就是 F17 抓到的谎）───────────────
test('a promise-only seam settles as timeout and NAMES the fact that it could not terminate', async () => {
  const t = mkTimer()
  const spawn = () => new Promise(() => {})          // never settles, no handle
  const face = createLeanFace({ settings: mkSettings({ 'vmu.math.leanAsync': true }).settings, spawn, root: dir, clock: () => 3, timer: t.timer })
  const sub = await face.submit({ statement: 'True', file: fileA })
  assert.equal(sub.state, 'queued')
  for (let i = 0; i < 200 && t.pending() === 0; i += 1) await new Promise((r) => setTimeout(r, 1))
  t.fire()
  await new Promise((r) => setTimeout(r, 0))
  const s = await face.settle(sub.id)
  assert.equal(s.state, 'timeout', '★ 不能终止也必须结算，**绝不挂死**')
  assert.equal(face.status(sub.id).job.terminated, false)
  assert.equal(face.status(sub.id).job.hadHandle, false)
  assert.ok(String(s.receipt.message).indexOf('无法 terminate') !== -1, '回执必须具名：' + s.receipt.message)
  assert.equal(face.admission().canTerminateChild, false, '没有 handle ⇒ admission 不许说 true')
  assert.ok(face.admission().notes.some((n) => /无法终止|terminate/.test(n)), 'notes 必须写清缺了会怎样')
  passed += 1
})

// ── 4. graceMs 作为**请求**传给宿主（真中止仍靠本地预算）────────────────────────────────────
test('graceMs is sent to the host as a request (the local budget is what binds)', async () => {
  const t = mkTimer()
  const seen = []
  const spawn = (spec) => { seen.push(spec); return { terminate() {}, done: Promise.resolve({ exitCode: 0 }), collected: { stdout: { readFrom: () => ({ text: 'ok', lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) } } } }
  const face = createLeanFace({ settings: mkSettings().settings, spawn, root: dir, clock: () => 4, timer: t.timer })
  const sub = await face.submit({ statement: 'True', file: fileA })
  await face.settle(sub.id)
  assert.equal(seen.length > 0, true, 'seam 必须真的被调用过')
  assert.equal(seen[0].graceMs, seen[0].timeoutMs, 'graceMs 必须等于单次预算：' + JSON.stringify(seen[0]))
  assert.equal(face.admission().subprocess.graceMsSent, true)
  passed += 1
})

// ── 5. maxBytes：本地**计数**截断 + 宿主自己的 lossy/spill 报告 ─────────────────────────────
test('output is capped and counted, and the host own lossy/spill report is carried through', async () => {
  const t = mkTimer()
  const big = 'x'.repeat(5000)
  const spawn = () => ({
    terminate() {},
    done: Promise.resolve({ exitCode: 1, signal: null }),
    collected: {
      stdout: { readFrom: () => ({ text: big, lossy: true, spillPath: '/spill/stdout-1' }) },
      stderr: { readFrom: () => ({ text: 'boom', lossy: false }) },
    },
  })
  const face = createLeanFace({ settings: mkSettings({ 'vmu.math.captureStdoutBytes': 50 }).settings, spawn, root: dir, clock: () => 5, timer: t.timer })
  const sub = await face.submit({ statement: 'True', file: fileA })
  const s = await face.settle(sub.id)
  assert.equal(s.state, 'failed')
  assert.equal(s.receipt.hostLossy, true, '宿主说它截断了 ⇒ 必须原样带出')
  assert.equal(s.receipt.spillPath, '/spill/stdout-1', '宿主给的 spill 路径必须带出（大结果的可达引用）')
  assert.ok(s.receipt.stdoutDroppedBytes > 0, '本地上限也必须计数：' + JSON.stringify(s.receipt.stdoutDroppedBytes))
  const v = face.status(sub.id).job
  assert.equal(v.outputLossy, true)
  assert.ok(v.outputDroppedBytes > 0)
  assert.equal(face.admission().outputMaxBytes, 50, '上限必须来自设置（一个旋钮）')
  passed += 1
})

// ── 6. F44：一次性公告（取一次就没了）＋上限计数；长期查询路径另有其人 ──────────────────────
test('the announcement is ONE-SHOT per member, and the queue is capped with counted drops', async () => {
  const t = mkTimer()
  const spawn = () => ({ terminate() {}, done: Promise.resolve({ exitCode: 0 }), collected: { stdout: { readFrom: () => ({ text: 'ok', lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) } } })
  const face = createLeanFace({ settings: mkSettings().settings, spawn, root: dir, clock: () => 6, timer: t.timer })
  const a = await face.submit({ statement: 'True', file: fileA, member: 'r-1' })
  await face.settle(a.id)
  const first = face.takeNoticesFor('r-1')
  assert.equal(first.length, 1, '公告必须恰好一条')
  assert.ok(first[0].indexOf(a.id) !== -1)
  assert.equal(face.takeNoticesFor('r-1').length, 0, '★ 取过一次就没了（one-shot），不许重复注入')
  assert.equal(face.takeNoticesFor('r-2').length, 0, '别人的公告不能被取走')
  // cap: submit more than the cap (each gets its own mirror-less notice) and check the drop counter
  for (let i = 0; i < LEAN_NOTICE_MAX + 3; i += 1) await face.submit({ statement: 'T' + i, file: fileA, member: 'r-3' })
  await new Promise((r) => setTimeout(r, 5))
  const nv = face.notices()
  assert.ok(nv.count <= LEAN_NOTICE_MAX, '队列不得超过上限：' + nv.count)
  assert.ok(nv.droppedNotices > 0, '丢弃必须计数：' + JSON.stringify(nv))
  // long-term query paths still exist (this is the half F44 said was missing)
  assert.equal(face.status(a.id).ok, true)
  assert.equal(typeof face.mirrors, 'function')
  passed += 1
})

// ── 7. F45：去重与 settle **同源**（内容哈希 + 构建上下文）；改内容/改上下文都会重编译 ─────────
test('dedupe uses the SAME key as settle (content hash + build context)', async () => {
  const t = mkTimer()
  let spawns = 0
  const spawn = () => { spawns += 1; return { terminate() {}, done: Promise.resolve({ exitCode: 0 }), collected: { stdout: { readFrom: () => ({ text: 'ok', lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) } } } }
  const fileB = join(dir, 'B.lean')
  await writeFile(fileB, 'theorem b : True := trivial\n', 'utf8')
  const face = createLeanFace({ settings: mkSettings().settings, spawn, root: dir, clock: () => 7, timer: t.timer })
  const one = await face.submit({ statement: 'True', file: fileB })
  await face.settle(one.id)
  assert.equal(spawns, 1)
  const two = await face.submit({ statement: 'True', file: fileB })
  const s2 = await face.settle(two.id)
  assert.equal(s2.passed, true)
  assert.equal(s2.receipt.deduped, true, '同内容同上下文 ⇒ 去重（不重编译）')
  assert.equal(s2.receipt.of, one.id)
  assert.equal(spawns, 1, '★ 去重必须真的**不跑**第二次编译')
  assert.equal(face.status(two.id).job.dedupedOf, one.id)
  // same content, DIFFERENT build context ⇒ the key changes ⇒ it must compile again
  const face2 = createLeanFace({ settings: mkSettings({ 'vmu.math.leanArgs': ['-DautoImplicit=false'] }).settings, spawn, root: dir, clock: () => 8, timer: t.timer })
  const three = await face2.submit({ statement: 'True', file: fileB })
  await face2.settle(three.id)
  assert.equal(spawns, 2, '构建上下文变了 ⇒ 不得复用（dedupeKey 含 contextHash）')
  // changed content ⇒ compile again
  const face3 = createLeanFace({ settings: mkSettings().settings, spawn, root: dir, clock: () => 9, timer: t.timer })
  await appendFile(fileB, '-- changed\n', 'utf8')
  const four = await face3.submit({ statement: 'True', file: fileB })
  await face3.settle(four.id)
  assert.equal(spawns, 3, '内容变了 ⇒ 不得复用')
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
await rm(dir, { recursive: true, force: true })
console.log('=== VMU LEAN KILLABLE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
