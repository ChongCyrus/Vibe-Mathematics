// vibe-math-vmu —— ROUND 130 · F-130a：**一个内核里的计数器不是共享目录里的名字**。
// 运行：`node tests/vmu-run130-lean-remint.test.mjs`（末行 `=== VMU RUN130 LEAN ID REMAKE: N passed, M failed ===`）。
//
// 真机证据（run 130，§225.3）：一所刚开张的研究所，主席第一次 `vibe_v5_lean_run` 就被
// `VMU_MATH_JOB_ID_TAKEN` 拒了——因为同一个根目录上**另一个内核**早先铸过 `lean-1`，镜像目录是两边唯一的共同事实，
// 而自动编号只在各自内核内存里数。调用方**没有点名**这个号，它只是我们的猜测；猜错了就该换一个，而且要说出来。
//
// 不变式：
//   ① 自动编号撞上盘上已有的号 ⇒ 换下一个号、提交成功、回执 `idReMinted` 说明（不静默、不覆盖别人）；
//   ② **调用方点名**的号撞上 ⇒ 仍旧具名拒（那是它的选择，不是我们的猜测），别人的镜像逐字未动；
//   ③ 连续撞 5 次 ⇒ 具名拒并说「自动编号连续撞了 N 次」，不是假装成功；
//   ④ 水合（listMirrors）仍然把盘上的号吃进计数器（重启后不复用）。

import assert from 'node:assert/strict'
import { createLeanFace } from '../vibe-math-vmu/kernel/lean.js'
import { createIds } from '../vibe-math-vmu/kernel/ids.js'

let passed = 0
let failed = 0
const cases = []
const test = (n, f) => cases.push({ n, f })

function memFs({ seed = {} } = {}) {
  const store = new Map(Object.entries(seed))
  const key = (rel) => String(rel).replace(/\\/g, '/')
  const fs = {
    store,
    writeText: async (rel, text) => { store.set(key(rel), String(text)); return true },
    readText: async (rel) => store.get(key(rel)),
    exists: async (rel) => store.has(key(rel)),
    listDir: async (rel) => {
      const prefix = key(rel).replace(/\/+$/, '') + '/'
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
    removeText: async (rel) => { store.delete(key(rel)) },
    // the REAL exclusive-create semantics the host provides ({flag:'wx'}): refuse when present, never overwrite
    writeTextExclusive: async (rel, text) => {
      const k = key(rel)
      if (store.has(k)) { const e = new Error('EEXIST: file already exists, open ' + k); e.code = 'EEXIST'; throw e }
      store.set(k, String(text))
      return true
    },
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
  return { get: (k) => vals[k] }
}
const spawnOk = async () => ({ exitCode: 0, stdout: 'ok', stderr: '' })

/** One kernel's Lean face: its OWN ids service, the way two kernels each assemble their own. */
const mkFace = (fs) => createLeanFace({
  settings: mkSettings(), clock: () => 0, spawn: spawnOk, fs, root: 'VibeMath', ids: createIds({ clock: () => 0 }),
})

// ── ① 自动编号撞号 ⇒ 换号，成功，并且说清楚 ───────────────────────────────────────────────
test('an AUTO id already on disk is re-minted, and the receipt says so', async () => {
  const fs = memFs()
  const a = mkFace(fs)
  const b = mkFace(fs)
  const first = await a.submit({ statement: 'True', file: 'Formal/a.lean' })
  assert.equal(first.ok, true, JSON.stringify(first))
  assert.equal(first.id, 'lean-1')
  const mirrorA = fs.store.get('Formal/Jobs/lean-1.json')
  assert.ok(typeof mirrorA === 'string' && mirrorA.length > 0)

  const second = await b.submit({ statement: 'True', file: 'Formal/b.lean' })
  assert.equal(second.ok, true, 'the second kernel must not be refused for a number it never asked for: ' + JSON.stringify(second))
  assert.equal(second.id, 'lean-2', 'the next free number was taken')
  assert.equal(second.idReMinted, 1, 'and the receipt counts the re-mint: ' + JSON.stringify(second))
  assert.match(String(second.idReMintedMeans), /shared mirror directory/)
  assert.equal(fs.store.get('Formal/Jobs/lean-1.json'), mirrorA, "★ the other kernel's mirror is byte-identical")
  assert.equal(b.list().count, 1, 'only the job we minted is ours')
})

// ── ② 调用方点名的号撞上 ⇒ 仍旧具名拒，别人的镜像逐字未动 ─────────────────────────────────
test('an id the CALLER named stays refused (that was its choice, not our guess)', async () => {
  const fs = memFs()
  const otherMirror = '{"schema":"vmu/lean-job@1","jobId":"lean-42","member":"someone-else"}'
  fs.store.set('Formal/Jobs/lean-42.json', otherMirror)
  const face = mkFace(fs)
  const r = await face.submit({ statement: 'True', file: 'Formal/x.lean', jobId: 'lean-42' })
  assert.equal(r.ok, false, JSON.stringify(r))
  assert.equal(r.code, 'VMU_MATH_JOB_ID_TAKEN')
  assert.equal(fs.store.get('Formal/Jobs/lean-42.json'), otherMirror, '★ 别人占的镜像必须逐字未动')
  assert.equal(face.list().count, 0, '被拒的作业不得留在队列里')
})

// ── ③ 连续撞号 ⇒ 具名拒，且说清「连续几次」（种子 1..6：五个换号位全被占 ⇒ 第六次仍是撞）────
test('five re-mints that all collide end in a refusal that says so (never a fake success)', async () => {
  const seed = {}
  for (let i = 1; i <= 6; i += 1) seed['Formal/Jobs/lean-' + i + '.json'] = '{"jobId":"lean-' + i + '"}'
  const fs = memFs({ seed })
  const face = mkFace(fs)
  const r = await face.submit({ statement: 'True', file: 'Formal/y.lean' })
  assert.equal(r.ok, false, JSON.stringify(r))
  assert.equal(r.code, 'VMU_MATH_JOB_ID_TAKEN')
  assert.match(String(r.message), /连续 5 次/, 'the refusal names the number of attempts: ' + r.message)
  assert.ok(String(r.hint).indexOf('jobId') !== -1, 'and it tells the caller how to proceed')
  assert.equal(face.list().count, 0)
})

// ── ④ 水合仍旧吃掉盘上的号（重启后不复用）────────────────────────────────────────────────
test('hydration still observes the numbers on disk', async () => {
  const seed = { 'Formal/Jobs/lean-7.json': '{"jobId":"lean-7"}', 'Formal/Jobs/lean-9.json': '{"jobId":"lean-9"}' }
  const fs = memFs({ seed })
  const face = mkFace(fs)
  const mirrors = await face.listMirrors()
  assert.equal(mirrors.ok, true, JSON.stringify(mirrors))
  const next = await face.submit({ statement: 'True', file: 'Formal/z.lean' })
  assert.equal(next.ok, true, JSON.stringify(next))
  assert.equal(next.id, 'lean-10', 'the counter took max+1 after hydration (got ' + next.id + ')')
})

// ── runner ────────────────────────────────────────────────────────────────────────────
for (const c of cases) {
  try {
    await c.f()
    console.log('  ok   ' + c.n)
  } catch (e) {
    failed += 1
    console.log('  FAIL ' + c.n + ' - ' + (e && e.message))
  }
}
console.log('\n=== VMU RUN130 LEAN ID REMAKE: ' + cases.length + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exitCode = 1
