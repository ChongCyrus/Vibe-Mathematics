// vibe-math-vmu —— ROUND 3 · N5：**跨进程独占创建**（kernel/mathjobs.js 的 `createJobMirror`，Lean 面同用）。
// 运行：`node tests/vmu-mathjobs-exclusive.test.mjs`（末行 `=== VMU MATHJOBS EXCLUSIVE: N passed, M failed ===`）。
//
// 这条不变式要证的是：**两个进程铸出同一个 jobId 时，后来者绝不静默覆盖前者的镜像**。
// 做法是把 `fs.writeTextExclusive`（宿主用 `{flag:'wx'}` / `O_EXCL` 实现）注入进来：
//   · 没有该接缝 ⇒ admission() 必须**具名**说 `exclusiveCreate:false` / `crossProcess:'not-enforced'`（降级不撒谎）；
//   · 有该接缝   ⇒ 首次写镜像**原子占号**；同号 ⇒ `VMU_MATH_JOB_ID_TAKEN`，且**前者的文件逐字未动**。

import assert from 'node:assert/strict'
import { createMathJobs } from '../vibe-math-vmu/kernel/mathjobs.js'
import { createLeanFace } from '../vibe-math-vmu/kernel/lean.js'
import { createIds } from '../vibe-math-vmu/kernel/ids.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })

/** In-memory fs seam. `exclusive` adds `writeTextExclusive` with the REAL semantics: refuse when present. */
function memFs({ exclusive = false, seed = {} } = {}) {
  const store = new Map(Object.entries(seed))
  const fs = {
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
    removeText: async (rel) => { store.delete(String(rel).replace(/\\/g, '/')) },
  }
  if (exclusive) {
    fs.writeTextExclusive = async (rel, text) => {
      const key = String(rel).replace(/\\/g, '/')
      if (store.has(key)) { const e = new Error('EEXIST: file already exists, open ' + key); e.code = 'EEXIST'; throw e }
      store.set(key, String(text))
      return true
    }
  }
  return fs
}

const mkSettings = (over) => {
  const vals = Object.assign({
    'vmu.math.computation': 'auto', 'vmu.math.engines': ['sympy'], 'vmu.math.mode': 'typed+shell',
    'vmu.math.jobs.persist': true, 'vmu.math.jobs.dir': '', 'vmu.math.jobs.recover': 'on-load', 'vmu.math.jobs.keepMirrors': 200,
    'vmu.math.leanAsync': false, 'vmu.math.leanCommand': 'lean', 'vmu.math.leanArgs': [], 'vmu.math.leanTimeoutMs': 5000,
    'vmu.math.leanSearchPaths': [], 'vmu.math.leanJobsMaxParallel': 1, 'vmu.math.formalVerify': 'off', 'vmu.math.leanInitiative': 'normal',
  }, over || {})
  const reads = []
  const get = (k) => { reads.push(k); return vals[k] }
  return { vals, reads, settings: { get } }
}
const spawnOk = async () => ({ exitCode: 0, stdout: 'ok', stderr: '' })

// ── 1. 没有独占接缝 ⇒ 降级必须**具名**（不是假装有）────────────────────────────────────────
test('without the exclusive seam the face degrades BY NAME (exclusiveCreate:false)', async () => {
  const fs = memFs({ exclusive: false })
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: spawnOk, fs })
  const a = gov.admission()
  assert.equal(a.exclusiveCreate, false)
  assert.equal(a.crossProcess, 'not-enforced')
  assert.ok(a.notes.some((n) => /未暴露|not-enforced/.test(n)), 'notes 必须说清降级：' + JSON.stringify(a.notes))
  await gov.submit({ engine: 'sympy', argv: ['-c', '1'], jobId: 'mj-a' })
  // Documented degraded behaviour: without the primitive a same-id write is an ordinary overwrite.
  const second = await gov.submit({ engine: 'sympy', argv: ['-c', '2'], jobId: 'mj-a' })
  assert.equal(second.ok, true, '没有独占原语时不会假装拒绝（它只是覆盖）')
  assert.ok(String(fs.store.get('Math/Jobs/mj-a.json')).indexOf('"-c"') !== -1)
  passed += 1
})

// ── 2. 有独占接缝 ⇒ admission 翻转，且首次写入真的走了独占通道 ──────────────────────────────
test('with the exclusive seam admission() flips and the first write claims the id', async () => {
  const fs = memFs({ exclusive: true })
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: spawnOk, fs })
  const a = gov.admission()
  assert.equal(a.exclusiveCreate, true)
  assert.equal(a.crossProcess, 'enforced-by-exclusive-create')
  assert.ok(a.notes.some((n) => /原子占号|wx\/O_EXCL/.test(n)), 'notes 必须说明它是怎么强制的：' + JSON.stringify(a.notes))
  const r = await gov.submit({ engine: 'sympy', argv: ['-c', '1'], jobId: 'mj-b' })
  assert.equal(r.ok, true)
  const st = gov.statusAll()
  assert.equal(st.exclusiveWrites >= 1, true, '独占写入必须计数')
  passed += 1
})

// ── 3. 同号（模拟另一个进程先占）⇒ `VMU_MATH_JOB_ID_TAKEN`，且**前者镜像逐字未动** ────────────
test('a second owner of the same jobId is refused by name and never overwrites the first mirror', async () => {
  const otherProcessMirror = JSON.stringify({ schema: 'vmu/math-job@1', jobId: 'mj-c', state: 'running', owner: 'the-other-process' }) + '\n'
  const fs = memFs({ exclusive: true, seed: { 'Math/Jobs/mj-c.json': otherProcessMirror } })
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: spawnOk, fs })
  const r = await gov.submit({ engine: 'sympy', argv: ['-c', 'mine'], jobId: 'mj-c' })
  assert.equal(r.ok, false, '同号提交必须被拒：' + JSON.stringify(r))
  assert.equal(r.code, 'VMU_MATH_JOB_ID_TAKEN')
  assert.deepEqual(r.enforced, ['vmu.math.jobs.persist', 'vmu.math.jobs.dir'], '拒绝必须带作用域')
  assert.equal(r.enforcedScope, 'evaluated-so-far')
  assert.equal(fs.store.get('Math/Jobs/mj-c.json'), otherProcessMirror, '★ 前者的镜像必须逐字未动（绝不静默覆盖）')
  assert.equal(gov.statusAll().mirrors, 0, '被拒的提交不得在内存里留下作业')
  assert.equal(gov.list().count, 0)
  assert.equal(gov.statusAll().idTaken >= 1, true, '占号失败必须计数')
  assert.equal(gov.admission().exclusiveCreate, true)
  passed += 1
})

// ── 4. 同一进程内的**更新**仍然走普通覆写（独占只在首次占号）───────────────────────────────
test('updates by the SAME process still overwrite (exclusivity is only the first claim)', async () => {
  const fs = memFs({ exclusive: true })
  const gov = createMathJobs({ settings: mkSettings().settings, clock: () => 0, spawn: spawnOk, fs })
  const r = await gov.submit({ engine: 'sympy', argv: ['-c', 'u'], jobId: 'mj-d' })
  assert.equal(r.ok, true)
  assert.equal(JSON.parse(fs.store.get('Math/Jobs/mj-d.json')).state, 'settled', '结算写必须覆盖自己的 running 镜像')
  assert.equal(gov.statusAll().idTaken || 0, 0, '自己的更新不得被当成"占号失败"')
  passed += 1
})

// ── 5. Lean 面同形：注入 ids 让下一个号可预知，预置别人占了的镜像 ⇒ 具名拒 ────────────────────
test('the Lean face refuses the same collision by name (and leaves the other mirror untouched)', async () => {
  const ids = createIds({ clock: () => 0 })
  ids.observe('lean', ['lean-41'])                       // hydrate: the next mint is lean-42
  const otherMirror = JSON.stringify({ schema: 'vmu/lean-job@1', jobId: 'lean-42', state: 'running', owner: 'other' }) + '\n'
  const fs = memFs({ exclusive: true, seed: { 'Formal/Jobs/lean-42.json': otherMirror } })
  const face = createLeanFace({ settings: mkSettings().settings, clock: () => 0, spawn: spawnOk, fs, ids })
  const r = await face.submit({ statement: 'True', file: '/tmp/x.lean' })
  assert.equal(r.ok, false, '同号提交必须被拒：' + JSON.stringify(r))
  assert.equal(r.code, 'VMU_MATH_JOB_ID_TAKEN')
  assert.equal(r.enforcedScope, 'evaluated-so-far')
  assert.equal(fs.store.get('Formal/Jobs/lean-42.json'), otherMirror, '★ 别人占的镜像必须逐字未动')
  assert.equal(face.list().count, 0, '被拒的作业不得留在队列里')
  assert.equal(face.admission().exclusiveCreate, true)
  assert.equal(face.admission().crossProcess, 'enforced-by-exclusive-create')
  // …and without the seam the Lean face also degrades BY NAME:
  const bare = createLeanFace({ settings: mkSettings().settings, clock: () => 0, spawn: spawnOk, fs: memFs({ exclusive: false }), ids })
  assert.equal(bare.admission().exclusiveCreate, false)
  assert.equal(bare.admission().crossProcess, 'not-enforced')
  passed += 1
})

for (const c of cases) {
  try { await c.f(); console.log('ok - ' + c.n) } catch (e) { failed += 1; console.log('FAIL - ' + c.n + ' :: ' + String((e && e.message) || e)) }
}
console.log('=== VMU MATHJOBS EXCLUSIVE: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
