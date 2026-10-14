// vibe-math-vmu —— ROUND 2 目标 5 B：数学作业的**镜像 / 四态 / 恢复四分支**（kernel/mathjobs.js）。
// 运行：`node tests/vmu-mathjobs-persist.test.mjs`（末行 `=== VMU MATHJOBS PERSIST: N passed, M failed ===`）。
//
// 本套件的目的是**非空过**：每个恢复分支都断言"具体计数 + 具体状态 + spawn 是否真的被再调用"，
// 并有一条"永不静默 passed"的横切断言（本面没有 `passed` 这个词；`settled` 只表示工具事实）。
// 一切接缝都注入：没有真引擎、没有真磁盘（内存 fs）、没有真实时间（注入 clock）。

import assert from 'node:assert/strict'
import { createMathJobs, MATH_KEYS, JOB_STATES, TERMINAL_STATES, JOB_SCHEMA, safeRelDir } from '../vibe-math-vmu/kernel/mathjobs.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })

/** In-memory fs seam (root-relative paths), mirroring the host fs shape (writeText/readText/exists/listDir). */
function memFs(files = {}) {
  const store = new Map(Object.entries(files))
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

const mkSettings = (over = {}) => {
  const vals = Object.assign({
    'vmu.math.engines': ['sympy'], 'vmu.math.computation': 'auto',
    'vmu.math.jobs.persist': true,
  }, over)
  const reads = []
  const get = (k) => { reads.push(k); return vals[k] }
  return { vals, reads, settings: { get } }
}
const fakeSpawn = (res, log) => async (a) => { if (log) log.push(a); return (typeof res === 'function' ? res(a) : res) }
const OK = { exitCode: 0, stdout: 'ok\n', stderr: '' }
const mkJob = (id, engine = 'sympy', argv = ['-c', 'x']) => ({
  schema: JOB_SCHEMA, jobId: id, engine, state: 'settled', attempts: 1,
  enqueuedAt: 5, startedAt: 5, settledAt: 9, exitCode: 0, timedOut: false, interrupted: false, cancelled: false,
  seed: '', random: false, argvHash: 'fp:0', inputHash: '', request: { engine, argv, stdin: '', timeoutMs: 1000, seed: '', random: false },
  run: { ok: true, exitCode: 0, timedOut: false, ms: 4, stderrTail: '', droppedBytes: 0 }, receipt: null, reason: '',
})

// ── 0. 词法安全：镜像目录只接受 root 相对路径 ────────────────────────────────────────────────
test('safeRelDir rejects absolute/drive/.. and defaults to Math/Jobs', () => {
  assert.equal(safeRelDir(''), 'Math/Jobs')
  assert.equal(safeRelDir('Math/Jobs'), 'Math/Jobs')
  assert.equal(safeRelDir('./Math//Jobs/'), 'Math/Jobs')
  assert.equal(safeRelDir('/abs/jobs'), null)
  assert.equal(safeRelDir('C:/jobs'), null)
  assert.equal(safeRelDir('../escape'), null)
  passed += 1
})

// ── 1. 镜像写入：提交＋结算各写一次，schema/四类事实齐 ─────────────────────────────────────
test('a submitted job writes a durable mirror (schema + state + attempts + receipt)', async () => {
  const fs = memFs()
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 7, spawn: fakeSpawn(OK), fs })
  const r = await gov.submit({ engine: 'sympy', argv: ['-c', '1+1'] })
  assert.equal(r.ok, true)
  const rel = 'Math/Jobs/' + r.jobId + '.json'
  assert.ok(fs.store.has(rel), '镜像必须落在 ' + rel)
  const rec = JSON.parse(fs.store.get(rel))
  assert.equal(rec.schema, JOB_SCHEMA)
  assert.equal(rec.state, 'settled')
  assert.equal(rec.attempts, 1)
  assert.ok(rec.receipt && rec.receipt.outputFingerprint, '镜像必须带回执（断点续算要看它）')
  assert.deepEqual(rec.request.argv, ['-c', '1+1'], '镜像必须带原始请求，重排才有依据')
  assert.equal(rec.inputHash, r.receipt.inputFingerprint)
  passed += 1
})

// ── 2. admission()：诚实登记（跨进程不强制；无 removeText ⇒ append-only）──────────────────
test('admission() reports the real capability limits instead of pretending', async () => {
  const fs = memFs()
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: fakeSpawn(OK), fs })
  const a = gov.admission()
  assert.equal(a.ok, true)
  assert.equal(a.persist, true)
  assert.equal(a.fileMirror, true)
  assert.equal(a.exclusiveCreate, false, '没有宿主独占创建原语 ⇒ 必须如实说 false')
  assert.equal(a.crossProcess, 'not-enforced')
  assert.equal(a.removeText, false)
  assert.equal(a.retention, 'append-only-refuse-after-cap')
  assert.ok(a.notes.some((n) => n.indexOf('独占') !== -1))
  // no fs seam ⇒ named unavailability, never a silent "fine"
  const bare = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: fakeSpawn(OK) })
  assert.equal(bare.admission().fileMirror, false)
  assert.ok(bare.admission().notes.some((n) => n.indexOf('未注入 fs') !== -1))
  passed += 1
})

// ── 3. 恢复分支 ①：queued ⇒ 重新入队并**真的重跑** ─────────────────────────────────────────
test('recover branch 1 — a queued job is requeued and actually re-run', async () => {
  const fs = memFs()
  const spawns = []
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: fakeSpawn(OK, spawns), fs })
  // Submit once (so the mirror carries the module's OWN inputHash), then rewrite the state to the
  // crash shape a real crash would leave behind: queued, never started, no receipt.
  const first = await gov.submit({ engine: 'sympy', argv: ['-c', 'first'], jobId: 'mj-q1' })
  assert.equal(first.ok, true)
  const rel = 'Math/Jobs/mj-q1.json'
  const rec = JSON.parse(fs.store.get(rel))
  rec.state = 'queued'; rec.startedAt = 0; rec.settledAt = 0; rec.receipt = null; rec.attempts = 0
  fs.store.set(rel, JSON.stringify(rec))
  const before = spawns.length
  const rep = await gov.recover()
  assert.equal(rep.ok, true)
  assert.equal(rep.requeued, 1, 'queued 必须重排一次：' + JSON.stringify(rep))
  assert.equal(spawns.length, before + 1, '重排必须**真的再跑一次**（不是只改状态）')
  assert.equal(gov.status({ jobId: 'mj-q1' }).job.state, 'settled')
  assert.equal(JSON.parse(fs.store.get(rel)).attempts, 1, '从未开始的作业重排后 attempts 仍是第 1 次（Lean 口径）')
  passed += 1
})

// ── 4. 恢复分支 ②：running ＋ 指纹一致 ⇒ interrupted 后重排（attempts+1）─────────────────
test('recover branch 2 — running + intact fingerprint is interrupted then requeued with attempts+1', async () => {
  const fs = memFs()
  const spawns = []
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: fakeSpawn(OK, spawns), fs })
  await gov.submit({ engine: 'sympy', argv: ['-c', 'second'], jobId: 'mj-r2' })
  const rel = 'Math/Jobs/mj-r2.json'
  const rec = JSON.parse(fs.store.get(rel))
  rec.state = 'running'; rec.settledAt = 0; rec.receipt = null; rec.attempts = 1
  fs.store.set(rel, JSON.stringify(rec))
  const before = spawns.length
  const rep = await gov.recover()
  assert.equal(rep.interrupted, 1, 'running 必须先计一次 interrupted')
  assert.equal(rep.requeued, 1, '指纹一致 ⇒ 允许重排')
  assert.equal(spawns.length, before + 1)
  const after = JSON.parse(fs.store.get(rel))
  assert.equal(after.attempts, 2, '重排必须 attempts+1')
  assert.equal(after.state, 'settled')
  passed += 1
})

// ── 5. 恢复分支 ③：running ＋ 指纹不一致 ⇒ 只 interrupted，**不自动重排** ──────────────────
test('recover branch 3 — running with a corrupted fingerprint is interrupted and NOT auto-rerun', async () => {
  const fs = memFs()
  const spawns = []
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: fakeSpawn(OK, spawns), fs })
  await gov.submit({ engine: 'sympy', argv: ['-c', 'third'], jobId: 'mj-r3' })
  const rel = 'Math/Jobs/mj-r3.json'
  const rec = JSON.parse(fs.store.get(rel))
  rec.state = 'running'; rec.inputHash = 'fp:deadbeef'; rec.receipt = null
  fs.store.set(rel, JSON.stringify(rec))
  const before = spawns.length
  const rep = await gov.recover()
  assert.equal(rep.interrupted, 1)
  assert.equal(rep.requeued, 0, '指纹不一致 ⇒ **不得**自动重排')
  assert.equal(spawns.length, before, '不得再跑')
  const j = gov.status({ jobId: 'mj-r3' }).job
  assert.equal(j.state, 'interrupted')
  assert.ok(rep.results.some((x) => x.action === 'interrupted-no-rerun' && x.why === 'fingerprint-mismatch'))
  passed += 1
})

// ── 6. 恢复分支 ④：settled ＋ exit 0 ＋ 指纹一致 ＋ 带回执 ⇒ 采纳（回执回到内存）───────────
test('recover branch 4 — a settled job with a receipt is adopted (receipt readable again)', async () => {
  const fs = memFs()
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: fakeSpawn(OK), fs })
  const first = await gov.submit({ engine: 'sympy', argv: ['-c', 'fourth'], jobId: 'mj-r4' })
  // Simulate a fresh process: a NEW service instance over the SAME mirror directory.
  const gov2 = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: fakeSpawn(OK), fs })
  const rep = await gov2.recover()
  assert.equal(rep.adopted, 1, 'settled+exit0+回执 ⇒ 采纳：' + JSON.stringify(rep))
  const rr = gov2.receipt({ jobId: 'mj-r4' })
  assert.equal(rr.ok, true, '采纳后回执必须可读')
  assert.equal(rr.receipt.outputFingerprint, first.receipt.outputFingerprint)
  assert.equal(gov2.status({ jobId: 'mj-r4' }).job.state, 'settled')
  passed += 1
})

// ── 7. 其余终态：保持原状，不自动重跑 ────────────────────────────────────────────────────
test('recover keeps failed/timeout/cancelled mirrors as they are (no auto-rerun)', async () => {
  const fs = memFs()
  const spawns = []
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: fakeSpawn(OK, spawns), fs })
  await gov.submit({ engine: 'sympy', argv: ['-c', 'fifth'], jobId: 'mj-k1' })
  const rel = 'Math/Jobs/mj-k1.json'
  const rec = JSON.parse(fs.store.get(rel))
  rec.state = 'failed'; rec.exitCode = 3
  fs.store.set(rel, JSON.stringify(rec))
  const before = spawns.length
  const rep = await gov.recover()
  assert.equal(rep.left, 1)
  assert.equal(rep.requeued, 0)
  assert.equal(spawns.length, before)
  assert.equal(gov.status({ jobId: 'mj-k1' }).job.state, 'failed')
  passed += 1
})

// ── 8. settle 但**没有回执** ⇒ 不采纳（"永不静默 passed"的镜像侧）───────────────────────────
test('a settled mirror WITHOUT a receipt is not adopted (nothing is silently trusted)', async () => {
  const fs = memFs()
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: fakeSpawn(OK), fs })
  await gov.submit({ engine: 'sympy', argv: ['-c', 'sixth'], jobId: 'mj-nr' })
  const rel = 'Math/Jobs/mj-nr.json'
  const rec = JSON.parse(fs.store.get(rel))
  rec.state = 'settled'; rec.exitCode = 0; rec.receipt = null
  fs.store.set(rel, JSON.stringify(rec))
  const gov2 = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: fakeSpawn(OK), fs })
  const rep = await gov2.recover()
  assert.equal(rep.adopted, 0, '没有回执就不能采纳')
  assert.equal(rep.left, 1)
  assert.ok(rep.results.some((x) => x.why === 'settled-without-receipt'))
  passed += 1
})

// ── 9. cancel 也落镜像（否则恢复会把已取消的作业"静默复活"）───────────────────────────────
test('cancel writes the mirror so recovery cannot resurrect a cancelled job', async () => {
  const fs = memFs()
  let release
  const gate = new Promise((r) => { release = r })
  const gov = createMathJobs({
    settings: mkSettings({ 'vmu.math.maxParallel': 2 }).settings, clock: () => 0, fs,
    spawn: async () => { await gate; return OK },
  })
  const p = gov.submit({ engine: 'sympy', argv: ['-c', 'slow'], jobId: 'mj-c1' })
  await new Promise((r) => setTimeout(r, 0))
  const c = gov.cancel({ jobId: 'mj-c1', reason: 'user' })
  assert.equal(c.ok, true)
  assert.equal(c.state, 'cancelled')
  const rec = JSON.parse(fs.store.get('Math/Jobs/mj-c1.json'))
  assert.equal(rec.state, 'cancelled')
  release()
  await p
  passed += 1
})

// ── 10. 保留上限：无 removeText ⇒ 到上限**停写并计数**（不无界、不静默）────────────────────
test('retention without removeText stops writing and COUNTS the skips', async () => {
  const fs = memFs()
  const gov = createMathJobs({ settings: mkSettings({ 'vmu.math.jobs.keepMirrors': 1 }).settings, clock: () => 0, spawn: fakeSpawn(OK), fs })
  await gov.submit({ engine: 'sympy', argv: ['-c', 'm1'], jobId: 'mj-p1' })
  await gov.submit({ engine: 'sympy', argv: ['-c', 'm2'], jobId: 'mj-p2' })
  assert.equal(fs.store.has('Math/Jobs/mj-p1.json'), true)
  assert.equal(fs.store.has('Math/Jobs/mj-p2.json'), false, '到上限必须停写（没有删除接缝时不假装淘汰）')
  const s = gov.statusAll()
  assert.ok(s.mirrorSkipped >= 1, '停写必须计数：' + JSON.stringify(s))
  assert.equal(gov.admission().retention, 'append-only-refuse-after-cap')
  passed += 1
})

// ── 11. 有 removeText ⇒ 真淘汰 ＋ droppedMirrors 计数 ────────────────────────────────────
test('retention WITH removeText evicts the oldest and counts droppedMirrors', async () => {
  const fs = memFs()
  fs.removeText = async (rel) => fs.store.delete(String(rel).replace(/\\/g, '/'))
  const gov = createMathJobs({ settings: mkSettings({ 'vmu.math.jobs.keepMirrors': 1 }).settings, clock: () => 0, spawn: fakeSpawn(OK), fs })
  await gov.submit({ engine: 'sympy', argv: ['-c', 'e1'], jobId: 'mj-e1' })
  await gov.submit({ engine: 'sympy', argv: ['-c', 'e2'], jobId: 'mj-e2' })
  const s = gov.statusAll()
  assert.equal(s.droppedMirrors, 1)
  assert.equal(fs.store.has('Math/Jobs/mj-e1.json'), false, '最旧镜像必须被真删')
  assert.equal(gov.admission().retention, 'evict-oldest-counted')
  passed += 1
})

// ── 12. 目录不安全 ⇒ 具名拒（不静默改成默认目录）────────────────────────────────────────
test('an unsafe jobs dir is refused by name (never silently replaced)', async () => {
  const fs = memFs()
  const gov = createMathJobs({ settings: mkSettings({ 'vmu.math.jobs.dir': '../escape' }).settings, clock: () => 0, spawn: fakeSpawn(OK), fs })
  const lm = await gov.listMirrors()
  assert.equal(lm.ok, false)
  assert.equal(lm.code, 'VMU_MATH_JOBS_DIR_UNSAFE')
  assert.equal(gov.admission().fileMirror, false)
  assert.ok(gov.admission().notes.some((n) => n.indexOf('安全路径') !== -1))
  passed += 1
})

// ── 13. recoverMode=off ⇒ 明确关闭（不是"扫了个空"）──────────────────────────────────────
test('recover mode off disables recovery explicitly', async () => {
  const fs = memFs()
  const gov = createMathJobs({ settings: mkSettings({ 'vmu.math.jobs.recover': 'off' }).settings, clock: () => 0, spawn: fakeSpawn(OK), fs })
  await gov.submit({ engine: 'sympy', argv: ['-c', 'x'], jobId: 'mj-off' })
  const rep = await gov.recover()
  assert.equal(rep.disabled, true)
  assert.equal(rep.reason, 'vmu.math.jobs.recover=off')
  assert.equal(rep.scanned, 0)
  passed += 1
})

// ── 14. 横切：**永不静默 passed** + 四态全集 + 只读面纯 ────────────────────────────────
test('no "passed" anywhere: states, settled result, and read purity', async () => {
  assert.equal(JOB_STATES.indexOf('passed'), -1, '作业状态里不得有 passed（settled≠命题成立）')
  assert.deepEqual(JOB_STATES.slice(0, 4), ['queued', 'running', 'settled', 'failed'])
  assert.ok(TERMINAL_STATES.indexOf('settled') !== -1 && TERMINAL_STATES.indexOf('queued') === -1)
  const fs = memFs()
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 3, spawn: fakeSpawn(OK), fs })
  const r = await gov.submit({ engine: 'sympy', argv: ['-c', 'y'] })
  assert.equal(r.settled, true)
  assert.equal(r.isRefutation, false, '计算/编译结果永远不能构成反证')
  const before = JSON.stringify({ l: gov.list(), s: gov.statusAll(), t: gov.trail(), r: gov.receipt({ jobId: r.jobId }), m: gov.mirrors(), a: gov.admission() })
  const after = JSON.stringify({ l: gov.list(), s: gov.statusAll(), t: gov.trail(), r: gov.receipt({ jobId: r.jobId }), m: gov.mirrors(), a: gov.admission() })
  assert.equal(before, after, '读面必须纯（不含 recover/mirror 写入）')
  passed += 1
})

// ── 15. keysUsed() 与真读一致（新增 5 键含 jobs.*）─────────────────────────────────────
test('keysUsed() covers the durable-job keys and every one is really read', async () => {
  const s = mkSettings()
  const gov = createMathJobs({ settings: s.settings, clock: () => 0, spawn: fakeSpawn(OK), fs: memFs() })
  await gov.submit({ engine: 'sympy', argv: ['-c', 'z'] })
  const used = gov.keysUsed()
  assert.equal(used.length, MATH_KEYS.length)
  for (const k of ['vmu.math.jobs.persist', 'vmu.math.jobs.dir', 'vmu.math.jobs.recover', 'vmu.math.jobs.keepMirrors', 'vmu.math.jobs.logMax']) {
    assert.ok(used.indexOf(k) !== -1, 'MATH_KEYS 缺：' + k)
    assert.ok(s.reads.indexOf(k) !== -1, '必须真读：' + k)
  }
  passed += 1
})

// ── 16. 总线事件：**NAME-first**（单对象形状会被总线具名拒并被 try/catch 吞掉）────────────
test('events reach the bus NAME-first (a single object would be refused and swallowed)', async () => {
  const bus = { calls: [], emit(name, payload) { this.calls.push({ name, payload }); return Promise.resolve({ ok: true }) } }
  const fs = memFs()
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: fakeSpawn(OK), fs, bus })
  await gov.submit({ engine: 'sympy', argv: ['-c', 'h1'], jobId: 'mj-h1' })
  gov.cancel({ jobId: 'mj-h1', reason: 'late' })     // already settled ⇒ refused, no event
  await gov.recover()
  const names = bus.calls.map((c) => c.name)
  assert.ok(names.indexOf('math/job-submitted') !== -1, '缺 submitted：' + names.join(','))
  assert.ok(names.indexOf('math/job-settled') !== -1, '缺 settled：' + names.join(','))
  assert.ok(names.indexOf('math/job-recovered') !== -1, '缺 recovered：' + names.join(','))
  // non-vacuous (RULE E): the loop below must really see events — a bus that received NOTHING is a defect,
  // not an empty-compliant case (the three name assertions above are what prove it; this prints the count).
  assert.ok(bus.calls.length > 0, 'the bus received NO events at all (got ' + bus.calls.length + '), so the loop below would assert nothing')
  for (const c of bus.calls) {
    assert.equal(typeof c.name, 'string')
    assert.ok(c.payload && typeof c.payload === 'object')
  }
  await new Promise((r) => setTimeout(r, 0))          // 让 fire-and-forget 的 promise 落定
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU MATHJOBS PERSIST: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
