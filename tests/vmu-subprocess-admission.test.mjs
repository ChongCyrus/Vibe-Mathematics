// vibe-math-vmu —— ROUND 4 · C：`admission()` 的**能力自述必须与实现一致**（`exclusiveCreate` /
// `crossProcess` / `canTerminateChild`）。运行：`node tests/vmu-subprocess-admission.test.mjs`
// （末行 `=== VMU SUBPROCESS ADMISSION: N passed, M failed ===`）。
//
// 为什么单独一套：这三个字段是"读者据此部署"的承诺。它们曾经是硬编码（`exclusiveCreate:false` /
// `canTerminateChild:false`）；本轮实现落地后，任何人把 seam 接上，**三字段必须跟着翻**，不能出现
// "接了独占创建但 admission 还说 not-enforced" 这种陈旧自述。每条都对着**同一次注入**断言。

import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMathJobs } from '../vibe-math-vmu/kernel/mathjobs.js'
import { createLeanFace } from '../vibe-math-vmu/kernel/lean.js'

const dir = await mkdtemp(join(tmpdir(), 'vmu-adm-'))
const leanFile = join(dir, 'X.lean')
await writeFile(leanFile, 'theorem x : True := trivial\n', 'utf8')

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })

function memFs({ exclusive = false } = {}) {
  const store = new Map()
  const fs = {
    writeText: async (rel, text) => { store.set(String(rel).replace(/\\/g, '/'), String(text)); return true },
    readText: async (rel) => store.get(String(rel).replace(/\\/g, '/')),
    listDir: async () => [],
    removeText: async (rel) => { store.delete(String(rel).replace(/\\/g, '/')) },
  }
  if (exclusive) {
    fs.writeTextExclusive = async (rel, text) => {
      const k = String(rel).replace(/\\/g, '/')
      if (store.has(k)) { const e = new Error('EEXIST'); e.code = 'EEXIST'; throw e }
      store.set(k, String(text)); return true
    }
  }
  return fs
}
const mkSettings = (over) => {
  const vals = Object.assign({
    'vmu.math.computation': 'auto', 'vmu.math.engines': ['sympy'], 'vmu.math.mode': 'typed+shell',
    'vmu.math.jobs.persist': true, 'vmu.math.jobs.dir': '', 'vmu.math.jobs.recover': 'on-load', 'vmu.math.jobs.keepMirrors': 200,
    'vmu.math.formalVerify': 'off', 'vmu.math.leanCommand': 'lean', 'vmu.math.leanArgs': [], 'vmu.math.leanTimeoutMs': 5000,
    'vmu.math.leanAsync': false, 'vmu.math.leanSearchPaths': [], 'vmu.math.leanJobsMaxParallel': 1, 'vmu.math.leanInitiative': 'normal',
  }, over || {})
  const reads = []
  const get = (k) => { reads.push(k); return vals[k] }
  return { vals, reads, settings: { get } }
}
const promiseSeam = async () => ({ exitCode: 0, stdout: 'ok', stderr: '' })
const handleSeam = () => ({
  terminate() {},
  done: Promise.resolve({ exitCode: 0, signal: null }),
  collected: { stdout: { readFrom: () => ({ text: 'ok', lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) } },
})
const timerNeverFires = () => () => {}

// ── 1. 无任何接缝 ⇒ 三个承诺都是"缺"，且 notes 说清后果 ────────────────────────────────────
test('with no optional seams all three claims are honestly negative', async () => {
  const mj = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: promiseSeam, fs: memFs(), timer: timerNeverFires() })
  const a = mj.admission()
  assert.equal(a.exclusiveCreate, false)
  assert.equal(a.crossProcess, 'not-enforced')
  assert.equal(a.canTerminateChild, false)
  assert.equal(a.subprocess.lastSpawnHadHandle, null, '还没跑过 ⇒ 运行时事实必须是 null，不是 false（不许猜）')
  const lf = createLeanFace({ settings: mkSettings().settings, clock: () => 0, spawn: promiseSeam, fs: memFs(), timer: timerNeverFires() })
  assert.equal(lf.admission().exclusiveCreate, false)
  assert.equal(lf.admission().crossProcess, 'not-enforced')
  assert.equal(lf.admission().canTerminateChild, false)
  passed += 1
})

// ── 2. 独占创建接上 ⇒ 两个字段必须同时翻（不许半翻）─────────────────────────────────────
test('an injected exclusive-create seam flips BOTH exclusiveCreate and crossProcess', () => {
  const fs = memFs({ exclusive: true })
  const mj = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: promiseSeam, fs, timer: timerNeverFires() })
  const a = mj.admission()
  assert.equal(a.exclusiveCreate, true)
  assert.equal(a.crossProcess, 'enforced-by-exclusive-create')
  const lf = createLeanFace({ settings: mkSettings().settings, clock: () => 0, spawn: promiseSeam, fs, timer: timerNeverFires() })
  assert.equal(lf.admission().exclusiveCreate, true)
  assert.equal(lf.admission().crossProcess, 'enforced-by-exclusive-create')
  passed += 1
})

// ── 3. 声明式可终止 seam（spawnHandle）⇒ 没跑过也必须说 true ──────────────────────────────
test('the DECLARED killable seam is enough to claim canTerminateChild', () => {
  const mj = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: promiseSeam, spawnHandle: async () => ({ exitCode: 0 }), fs: memFs(), timer: timerNeverFires() })
  assert.equal(mj.admission().canTerminateChild, true)
  assert.equal(mj.admission().subprocess.declaredKillableSeam, true)
  const lf = createLeanFace({ settings: mkSettings().settings, clock: () => 0, spawn: promiseSeam, spawnHandle: async () => ({ exitCode: 0 }), fs: memFs(), timer: timerNeverFires() })
  assert.equal(lf.admission().canTerminateChild, true)
  passed += 1
})

// ── 4. 宿主原生 handle：跑过一次之后，运行时事实把承诺从 false 翻成 true ───────────────────
test('a host-native handle flips canTerminateChild only AFTER the runtime proves it', async () => {
  const mj = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: handleSeam, fs: memFs(), timer: timerNeverFires() })
  assert.equal(mj.admission().canTerminateChild, false, '跑之前不许声称能终止（spawn 形状是运行时才知道的）')
  const r = await mj.submit({ engine: 'sympy', argv: ['-c', '1'], jobId: 'mj-adm-1' })
  assert.equal(r.ok, true)
  const a = mj.admission()
  assert.equal(a.subprocess.lastSpawnHadHandle, true, '★ 运行时事实：宿主原生 spawn 给了 handle')
  assert.equal(a.canTerminateChild, true, '★ 承诺必须跟着事实翻')
  const lf = createLeanFace({ settings: mkSettings().settings, clock: () => 0, spawn: handleSeam, fs: memFs(), timer: timerNeverFires() })
  const sub = await lf.submit({ statement: 'True', file: leanFile })
  await lf.settle(sub.id)
  assert.equal(lf.admission().canTerminateChild, true)
  assert.equal(lf.admission().subprocess.lastSpawnHadHandle, true)
  passed += 1
})

// ── 5. 冷声明的三字段与**实际行为**一致（用超时那一轮反证）────────────────────────────────
test('the claims match behaviour: a handle seam really kills, a promise seam really cannot', async () => {
  // (a) killable: handle never settles ⇒ budget fires (timer injected) ⇒ terminated
  let terminated = 0
  const killable = () => ({ terminate() { terminated += 1 }, done: new Promise(() => {}), collected: { stdout: { readFrom: () => ({ text: '', lossy: false }) }, stderr: { readFrom: () => ({ text: '', lossy: false }) } } })
  let fire = null
  const timer = (cb) => { fire = cb; return () => { fire = null } }
  const lf1 = createLeanFace({ settings: mkSettings({ 'vmu.math.leanAsync': true, 'vmu.math.leanTimeoutMs': 1 }).settings, clock: () => 0, spawn: killable, fs: memFs(), timer })
  const s1 = await lf1.submit({ statement: 'True', file: leanFile })
  for (let i = 0; i < 200 && !fire; i += 1) await new Promise((r) => setTimeout(r, 1))
  assert.ok(fire, 'budget 必须被挂上')
  fire()
  await new Promise((r) => setTimeout(r, 0))
  await lf1.settle(s1.id)
  assert.equal(terminated, 1, '声称能终止 ⇒ 行为上必须真的 terminate')
  assert.equal(lf1.admission().canTerminateChild, true)
  // (b) promise-only: cannot kill, and says so
  const lf2 = createLeanFace({ settings: mkSettings({ 'vmu.math.leanAsync': true, 'vmu.math.leanTimeoutMs': 1 }).settings, clock: () => 0, spawn: () => new Promise(() => {}), fs: memFs(), timer })
  const s2 = await lf2.submit({ statement: 'True', file: leanFile })
  for (let i = 0; i < 200 && !fire; i += 1) await new Promise((r) => setTimeout(r, 1))
  fire()
  await new Promise((r) => setTimeout(r, 0))
  const settled = await lf2.settle(s2.id)
  assert.equal(settled.state, 'timeout')
  assert.equal(lf2.admission().canTerminateChild, false, '声称不能终止 ⇒ 行为上确实没终止')
  assert.equal(settled.receipt.terminated, false)
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
await rm(dir, { recursive: true, force: true })
console.log('=== VMU SUBPROCESS ADMISSION: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
