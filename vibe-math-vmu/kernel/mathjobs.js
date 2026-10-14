// vibe-math-vmu — 数学作业与回执（09 卷回执／15 卷引擎与复现）：**服务化**的作业生命周期。
//
// 硬不变式：
//   ① `spawn` 是**注入接缝**：未注入 ⇒ 具名拒（**绝不假装跑过** ✗）；
//   ② 超时 ⇒ 共享模块码 MATH_TIMEOUT（**无 VMU_ 前缀**：03-§8 里就是这个名 ✓），**保留部分输出**并**报丢弃字节**（不静默截断 ✗）；
//   ③ 非零退出 ⇒ 共享模块码 MATH_NONZERO_EXIT，回执**保留退出码与 stderr 尾部** ✓；
//   ④ 回执必须含：引擎／argv 指纹／输入指纹／退出码／时长／输出指纹（**缺一 ⇒ 具名拒** ✗）；
//   ⑤ 随机作业必须带种子（`requireSeedForRandom` 默认 true ✗✓）；
//   ⑥ 并发／总量上限 ⇒ **计数式截断**（`droppedReceipts`／`droppedLog`／`droppedBytes`／`droppedMirrors`／`mirrorSkipped` ✓）；
//   ⑦ 只走注入 `clock`（**不读真实时间** ✗）；⑧ 零机制：无引擎声明 ⇒ 提交即具名拒 ✓；⑨ `list/status` 纯读 ✓。
//
// ── ROUND 2 · 目标 5 B：作业**持久化 / 断点续算**（对照 Lean 的 `Formal/Jobs/*.json`）───────────────
//   ⑩ **镜像**：每个作业在 `<vmu.math.jobs.dir || 'Math/Jobs'>/<jobId>.json` 有一份**耐久镜像**，
//      含 `schema:'vmu/math-job@1'`、四类事实（状态／尝试次数／时间／退出码）＋**原始请求**（重排要用）；
//      写点是：提交、结算、取消、恢复转移 —— **每次状态变化都写**，best-effort 但**失败即计数并具名报告**。
//   ⑪ **四态 ＋ 恢复四分支**（`recover()`；**绝不静默 passed** —— 本面根本没有 "passed" 这个词，
//      `settled` 只表示"进程干净退出且输入未变"，它是**工具事实**，不是数学结论；`isRefutation` 恒 false）：
//        ① `queued`            ⇒ 重新入队并真的重跑（attempts 不变）；
//        ② `running` ＋ 请求指纹**仍一致** ⇒ 标 `interrupted` 后**重排**（attempts+1）；
//        ③ `running` ＋ 指纹不一致（镜像被改坏） ⇒ **只标 interrupted，不自动重排**（具名原因）；
//        ④ `settled` ＋ exit 0 ＋ 指纹一致 ＋ **带回执** ⇒ **采纳**（把回执放回内存，`recovered:true`）；
//           其余（failed/timeout/interrupted/cancelled/settled 但无回执）⇒ **保持原状，不自动重跑**。
//   ⑬ **跨进程／保留的诚实登记**（`admission()`）：本面**没有**宿主独占创建原语 ⇒
//      `exclusiveCreate:false`、`crossProcess:'not-enforced'`（**具名**，不假装）；镜像淘汰需要
//      `fs.removeText`，没有该接缝时**到达上限即停止写盘并计数**（`mirrorSkipped`），不无界增长也不静默。
//
// 注入：`createMathJobs({ clock, log, settings, bus, spawn, fs, root, ids })`
//   · spawn —— `({ engine, argv, stdin, timeoutMs, env }) => { exitCode, stdout, stderr, timedOut?, signal? }`
//   · fs    —— `{ writeText(rel,text), readText(rel), exists(rel), listDir(rel), removeText?(rel) }`（可选；
//              缺它 ⇒ 镜像面**具名不可用**：`admission().fileMirror=false`，submit 照常工作但不落盘）
//   · root  —— 镜像目录的基准（默认 '.'）
//   · ids   —— 可选：`kernel/ids.js` 的实例（缺省用模块级单例）⇒ 作业号经**唯一铸号者**、恢复时水合取 max+1

import { mint as mintId, observeIds } from './ids.js'

export const MATH_KEYS = Object.freeze([
  'vmu.math.computation',
  'vmu.math.mode',
  'vmu.math.engines',
  'vmu.math.timeoutMs',
  'vmu.math.maxParallel',
  'vmu.math.maxJobs',
  'vmu.math.keepReceipts',
  'vmu.math.requireSeedForRandom',
  'vmu.math.denyNetwork',
  'vmu.math.workspaceOnly',
  'vmu.math.captureStdoutBytes',
  // ROUND 2 (目标 5 B): the durable-job face.
  'vmu.math.jobs.persist',
  'vmu.math.jobs.dir',
  'vmu.math.jobs.recover',
  'vmu.math.jobs.keepMirrors',
  'vmu.math.jobs.logMax',
])

/** 作业状态全集（四态 ＋ 排队/中断/取消）：`queued|running|settled|failed|timeout|interrupted|cancelled`。 */
export const JOB_STATES = Object.freeze(['queued', 'running', 'settled', 'failed', 'timeout', 'interrupted', 'cancelled'])

/** 终态（不会再变）：`settled` 只 = 干净退出，**不是**"命题成立"。 */
export const TERMINAL_STATES = Object.freeze(['settled', 'failed', 'timeout', 'interrupted', 'cancelled'])

/** 镜像 schema 版本（docs/15 引用）。 */
export const JOB_SCHEMA = 'vmu/math-job@1'

/**
 * THE scope marker every receipt AND every refusal carries (repo D3: a result is never scope-less).
 * Defined ONCE here; the Lean face and the adapter face import it ⇒ one meaning, one name.
 */
export const ENFORCED_SCOPE = 'evaluated-so-far'

const DEFAULT_JOBS_DIR = 'Math/Jobs'
/**
 * A named refusal. `enforced` lists the SETTINGS KEYS whose value took part in this refusal — an empty
 * array when the decision came from the arguments, the injected seams or a static registry (that is the
 * honest answer, never a missing one). `enforcedScope` says how far the evaluation got.
 */
const refuse = (code, message, hint, enforced) => ({
  ok: false, code, message, hint,
  enforced: Array.isArray(enforced) ? enforced.slice() : [],
  enforcedScope: ENFORCED_SCOPE,
})

/** 镜像目录只接受 root 相对、无 `..`/盘符/绝对路径的词法路径（越界 ⇒ 具名拒，不猜）。 */
export function safeRelDir(rel) {
  const raw = String(rel == null ? '' : rel).trim().replace(/\\/g, '/')
  if (!raw) return DEFAULT_JOBS_DIR
  if (raw.charAt(0) === '/' || /^[a-z]:/i.test(raw)) return null
  const parts = []
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') return null
    parts.push(seg)
  }
  return parts.length ? parts.join('/') : DEFAULT_JOBS_DIR
}

/**
 * THE ONE JOB-MIRROR primitive (Round 2 · target 5): the durable `<dir>/<jobId>.json` ledger shared by the
 * computation face (`createMathJobs`) and the Lean face (`kernel/lean.js`). Extracted so retention and the
 * honest capability report exist ONCE (a second copy would be two authorities for one rule).
 *
 * Contract:
 *   · `write(jobId, rec)` — best-effort; the caller COUNTS failures. Returns
 *     `{ok:true, rel}` | `{ok:false, code:'VMU_MATH_JOBS_MIRROR_UNWIRED'}` |
 *     `{ok:false, reason:'retention-cap-without-removeText'}` (cap reached and no `removeText` seam: stop
 *     writing rather than grow without bound — counted, never silent) and reports `evicted` when it removed
 *     the oldest entry instead.
 *   · `list()` — reads the directory; a file whose JSON is unreadable or carries a foreign `schema` is
 *     reported `corrupt:true` (never silently dropped).
 *   · `status()` — the capability facts an `admission()` can quote verbatim.
 */
export function createJobMirror({ fs = null, dir = null, keep = 0, clock = () => 0, onNote = () => {}, schema = null } = {}) {
  const records = new Map()
  const stats = { written: 0, failed: 0, skipped: 0, evicted: 0, listed: 0, corrupt: 0 }
  const enabled = () => !!(fs && typeof fs.writeText === 'function' && typeof fs.readText === 'function' && dir)
  const relOf = (jobId) => String(dir).replace(/\/+$/, '') + '/' + String(jobId) + '.json'

  async function remove(jobId) {
    if (!enabled() || typeof fs.removeText !== 'function') return false
    try { await fs.removeText(relOf(jobId)); records.delete(String(jobId)); return true } catch (e) { return false }
  }

  async function write(jobId, rec) {
    const id = String(jobId)
    if (!enabled()) { stats.failed += 1; return { ok: false, code: 'VMU_MATH_JOBS_MIRROR_UNWIRED', message: '未注入 fs 接缝或镜像目录不可用' } }
    if (keep > 0 && !records.has(id) && records.size >= keep) {
      if (typeof fs.removeText !== 'function') {
        stats.skipped += 1
        onNote('mirror-skipped', id, { reason: 'retention-cap-without-removeText', cap: keep })
        return { ok: false, code: 'VMU_MATH_JOBS_MIRROR_UNWIRED', reason: 'retention-cap-without-removeText' }
      }
      const oldest = [...records.keys()][0]
      await remove(oldest)
      stats.evicted += 1
    }
    const payload = Object.assign({}, rec, { at: clock() })
    try {
      const okWrite = await fs.writeText(relOf(id), JSON.stringify(payload, null, 1) + '\n')
      if (okWrite === false) throw new Error('writeText returned false')
      records.set(id, payload)
      stats.written += 1
      return { ok: true, rel: relOf(id) }
    } catch (e) {
      stats.failed += 1
      onNote('mirror-failed', id, { error: String((e && e.message) || e) })
      return { ok: false, code: 'VMU_MATH_JOBS_MIRROR_UNWIRED', error: String((e && e.message) || e) }
    }
  }

  async function read(jobId) {
    if (!enabled()) return null
    try { return JSON.parse((await fs.readText(relOf(jobId))) || 'null') } catch (e) { return null }
  }

  async function list() {
    if (!enabled()) return []
    let entries = []
    try { entries = (await fs.listDir(dir)) || [] } catch (e) { entries = [] }
    const out = []
    for (const e of entries) {
      if (!e || e.type !== 'file' || !/\.json$/.test(String(e.name))) continue
      const jobId = String(e.name).replace(/\.json$/, '')
      const rec = await read(jobId)
      stats.listed += 1
      if (!rec || (schema && rec.schema !== schema)) { stats.corrupt += 1; out.push({ jobId, corrupt: true, rec: null }); continue }
      records.set(jobId, rec)
      out.push({ jobId, corrupt: false, rec })
    }
    return out
  }

  const status = () => ({
    enabled: enabled(),
    dir,
    keep,
    removeText: !!(fs && typeof fs.removeText === 'function'),
    retention: (fs && typeof fs.removeText === 'function') ? 'evict-oldest-counted' : 'append-only-refuse-after-cap',
    count: records.size,
    written: stats.written, failed: stats.failed, skipped: stats.skipped, evicted: stats.evicted,
    listed: stats.listed, corrupt: stats.corrupt,
  })

  return { write, read, list, remove, status, enabled, relOf, records }
}

export function createMathJobs(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  // bus.emit takes (NAME, payload) — a single object was silently swallowed by the try/catch in the
  // earlier shape (the bus refuses a non-string hook by name). Fire-and-forget, never awaited.
  const emit = (name, payload) => {
    try {
      if (!o.bus || typeof o.bus.emit !== 'function') return
      const r = o.bus.emit(String(name), payload || {})
      if (r && typeof r.catch === 'function') r.catch(() => {})
    } catch (e) { /* 广播不改结果 */ }
  }
  const spawn = o.spawn
  const fsSeam = (o.fs && typeof o.fs.writeText === 'function' && typeof o.fs.readText === 'function') ? o.fs : null
  const root = String(o.root || '.')

  const cfg = () => {
    const n = (k, d) => { const v = Number(readKey(k)); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d }
    const enginesRaw = readKey('vmu.math.engines')
    const dirRaw = readKey('vmu.math.jobs.dir')
    return {
      computation: String(readKey('vmu.math.computation') || 'auto'),   // off|auto|on
      mode: String(readKey('vmu.math.mode') || 'typed'),
      engines: Array.isArray(enginesRaw) ? enginesRaw.map(String) : [],
      timeoutMs: n('vmu.math.timeoutMs', 120000),
      maxParallel: Math.max(1, n('vmu.math.maxParallel', 1)),
      maxJobs: n('vmu.math.maxJobs', 0),                                // 0＝不限
      keepReceipts: n('vmu.math.keepReceipts', 50),
      requireSeedForRandom: readKey('vmu.math.requireSeedForRandom') !== false,
      denyNetwork: readKey('vmu.math.denyNetwork') !== false,
      workspaceOnly: readKey('vmu.math.workspaceOnly') !== false,
      captureStdoutBytes: n('vmu.math.captureStdoutBytes', 20000),
      // ROUND 2
      persist: readKey('vmu.math.jobs.persist') === true,
      jobsDir: safeRelDir(String(dirRaw == null ? '' : dirRaw)),
      jobsDirRaw: String(dirRaw == null ? '' : dirRaw),
      recoverMode: (function () { const m = String(readKey('vmu.math.jobs.recover') || 'on-load'); return ['on-load', 'manual', 'off'].indexOf(m) === -1 ? 'on-load' : m })(),
      keepMirrors: n('vmu.math.jobs.keepMirrors', 200),
      logMax: Math.max(1, n('vmu.math.jobs.logMax', 200)),
    }
  }
  const keysUsed = () => MATH_KEYS.slice()

  const jobs = new Map()
  const receipts = new Map()
  let droppedReceipts = 0
  let droppedLog = 0
  let lastRecovery = null
  const trail = []
  const note = (what, id, extra) => {
    trail.push(Object.assign({ at: clock(), what, id: String(id || '') }, extra || {}))
    const cap = cfg().logMax
    if (trail.length > cap) { trail.shift(); droppedLog += 1 }
  }
  const fp = (x) => { const s = typeof x === 'string' ? x : JSON.stringify(x); let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0; return 'fp:' + h.toString(16) }

  /** 尾部保留 ＋ **丢弃字节计数**（不变式 ②／⑥）。 */
  const tail = (s, cap) => {
    const str = String(s === undefined || s === null ? '' : s)
    const bytes = Buffer.byteLength(str, 'utf8')
    if (cap <= 0 || bytes <= cap) return { text: str, droppedBytes: 0 }
    let cut = str
    while (Buffer.byteLength(cut, 'utf8') > cap && cut.length > 0) cut = cut.slice(1)
    return { text: cut, droppedBytes: Buffer.byteLength(str, 'utf8') - Buffer.byteLength(cut, 'utf8') }
  }

  const running = () => [...jobs.values()].filter((j) => j.state === 'running').length

  // ── id 计数器（kernel/ids.js：唯一铸号者，D-15）───────────────────────────────────────────────
  const mintJobId = () => (o.ids && typeof o.ids.mint === 'function' ? o.ids.mint('mathjob', 'mj-') : mintId('mathjob', 'mj-'))
  const observeJobIds = (list) => {
    const arr = (list || []).map(String)
    if (!arr.length) return
    try {
      if (o.ids && typeof o.ids.observe === 'function') o.ids.observe('mathjob', arr)
      else observeIds('mathjob', arr)
    } catch (e) { /* hydration is best-effort: a failure must not break recovery */ }
  }

  // ── 镜像面（ROUND 2）：实现在 `createJobMirror`（本文件顶部，Lean 面共用同一原语）──────────────
  // The helper is (re)built when the dir/keep policy changes, and the counters are folded so the reported
  // totals stay monotonic across a hot re-configuration.
  let mirrorInst = null
  let mirrorKey = ''
  let mirrorBase = { evicted: 0, skipped: 0, failed: 0 }
  let droppedMirrors = 0
  let mirrorSkipped = 0
  let mirrorFailures = 0
  const syncMirrorCounters = () => {
    const st = mirrorInst ? mirrorInst.status() : { evicted: 0, skipped: 0, failed: 0 }
    droppedMirrors = mirrorBase.evicted + st.evicted
    mirrorSkipped = mirrorBase.skipped + st.skipped
    mirrorFailures = mirrorBase.failed + st.failed
  }
  const mirrorFor = () => {
    const c = cfg()
    const key = String(c.jobsDir) + '|' + String(c.keepMirrors)
    if (!mirrorInst || mirrorKey !== key) {
      if (mirrorInst) {
        const st = mirrorInst.status()
        mirrorBase = { evicted: mirrorBase.evicted + st.evicted, skipped: mirrorBase.skipped + st.skipped, failed: mirrorBase.failed + st.failed }
      }
      mirrorInst = createJobMirror({
        fs: fsSeam, dir: c.jobsDir, keep: c.keepMirrors, clock, schema: JOB_SCHEMA,
        onNote: (what, id, extra) => note('math.mirror.' + what, id, extra),
      })
      mirrorKey = key
    }
    syncMirrorCounters()
    return mirrorInst
  }
  const mirrorRel = (jobId) => (cfg().jobsDir === null ? null : cfg().jobsDir + '/' + String(jobId) + '.json')
  const mirrorEnabled = () => {
    const c = cfg()
    return c.persist === true && c.jobsDir !== null && !!fsSeam
  }
  /** 把作业**原样**（含请求）写进镜像；返回写入结果（失败**计数**，不抛）。 */
  const writeMirror = async (job) => {
    if (!mirrorEnabled()) {
      if (cfg().persist === true && cfg().jobsDir === null) mirrorFailures += 1
      return { ok: false, code: 'VMU_MATH_JOBS_MIRROR_UNWIRED' }
    }
    const rec = Object.assign({}, job.mirror || {}, {
      schema: JOB_SCHEMA, jobId: job.id, engine: job.engine, state: job.state,
      attempts: Number(job.attempts) || 0, enqueuedAt: job.enqueuedAt || 0,
      startedAt: job.startedAt || 0, settledAt: job.settledAt || 0,
      exitCode: job.exitCode === undefined ? null : job.exitCode,
      timedOut: !!job.timedOut, interrupted: !!job.interrupted, cancelled: !!job.cancelled,
      seed: job.seed || '', random: !!job.random,
      argvHash: fp(job.argv || []), inputHash: job.inputHash || fp({ argv: job.argv || [], stdin: job.stdin || '', seed: job.seed || '' }),
      request: { engine: job.engine, argv: (job.argv || []).slice(), stdin: job.stdin || '', timeoutMs: job.timeoutMs || 0, seed: job.seed || '', random: !!job.random },
      run: job.run || null,
      receipt: receipts.has(job.id) ? receipts.get(job.id) : null,
      reason: job.reason || '',
    })
    const out = await mirrorFor().write(job.id, rec)
    syncMirrorCounters()
    if (out.ok === true) job.mirror = rec
    return out
  }
  const env = () => ({ denyNetwork: cfg().denyNetwork, workspaceOnly: cfg().workspaceOnly })

  /** 执行一个作业的请求体（提交与恢复重排共用同一条路径 —— 两条路的行为不可能漂移）。 */
  const execute = async (job) => {
    const c = cfg()
    try {
      const waitStart = clock()
      while (running() > c.maxParallel) await Promise.resolve()
      job.queueWaitMs = clock() - waitStart
      job.state = 'running'
      job.startedAt = clock()
      await writeMirror(job)
      const out = await spawn({ engine: job.engine, argv: (job.argv || []).slice(), stdin: job.stdin || '', timeoutMs: job.timeoutMs, env: env() })
      const r = out || {}
      job.settledAt = clock()
      const so = tail(r.stdout, c.captureStdoutBytes)
      const se = tail(r.stderr, c.captureStdoutBytes)
      const timedOut = r.timedOut === true
      const exitCode = timedOut ? null : Number(r.exitCode)
      const stderrTail = se.text.split('\n').slice(-5).join('\n')
      const receipt = {
        jobId: job.id, engine: job.engine, argvFingerprint: fp(job.argv || []), inputFingerprint: job.inputHash, outputFingerprint: fp({ stdout: so.text, stderr: se.text }),
        exitCode, durationMs: job.settledAt - job.startedAt, timedOut, seed: job.seed || '',
        stdout: so.text, stderr: se.text, stderrTail, droppedBytes: so.droppedBytes + se.droppedBytes,
      }
      job.exitCode = exitCode
      job.timedOut = timedOut
      job.run = { ok: !timedOut && exitCode === 0, exitCode, timedOut, ms: receipt.durationMs, stderrTail, droppedBytes: receipt.droppedBytes }
      const missing = ['engine', 'argvFingerprint', 'inputFingerprint', 'exitCode', 'durationMs', 'outputFingerprint'].filter((k) => receipt[k] === undefined || receipt[k] === '')
      if (missing.length) {
        job.state = 'failed'
        job.reason = 'incomplete-receipt'
        await writeMirror(job)
        return refuse('VMU_FORMAL_REPRO_INCOMPLETE', '回执不完整：缺 ' + missing.join('、'), '回执必含引擎/argv 指纹/输入指纹/退出码/时长/输出指纹')
      }
      receipts.set(job.id, receipt)
      if (receipts.size > c.keepReceipts) { const oldest = [...receipts.keys()][0]; receipts.delete(oldest); droppedReceipts += 1 }
      if (timedOut) {
        job.state = 'timeout'
        note('math.timeout', job.id, { droppedBytes: receipt.droppedBytes })
        await writeMirror(job)
        emit('math/job-timeout', { jobId: job.id, engine: job.engine, timeoutMs: job.timeoutMs, droppedBytes: receipt.droppedBytes })
        // INTEGRATOR RULING: the SHARED module code is the one already registered in 03-§8 (`MATH_TIMEOUT`,
        // no VMU_ prefix). One meaning, one name.
        return Object.assign(refuse('MATH_TIMEOUT', '作业超时（>' + job.timeoutMs + ' ms）：已保留部分输出', '见 receipt.stdout/stderr 尾部；丢弃字节已计数 ' + receipt.droppedBytes, ['vmu.math.timeoutMs']), { receipt })
      }
      if (exitCode !== 0) {
        job.state = 'failed'
        note('math.nonzero', job.id, { exitCode })
        await writeMirror(job)
        emit('math/job-failed', { jobId: job.id, engine: job.engine, exitCode, code: 'MATH_NONZERO_EXIT' })
        return Object.assign(refuse('MATH_NONZERO_EXIT', '引擎非零退出：' + exitCode, 'stderr 尾部：' + stderrTail.slice(0, 200)), { receipt })
      }
      job.state = 'settled'
      note('math.done', job.id)
      await writeMirror(job)
      emit('math/job-settled', { jobId: job.id, engine: job.engine, exitCode: 0, durationMs: receipt.durationMs, droppedBytes: receipt.droppedBytes })
      // `settled` is a TOOLING fact (clean exit). It is never "the claim is true" and never a refutation.
      return { ok: true, jobId: job.id, receipt, settled: true, isRefutation: false }
    } catch (e) {
      job.state = 'failed'; job.settledAt = clock()
      job.reason = 'spawn-threw'
      await writeMirror(job)
      return refuse('VMU_EXTERNAL_UNAVAILABLE', 'spawn 抛出：' + String((e && e.message) || e), '宿主接缝异常；本面不假装成功')
    }
  }

  const submit = async (a) => {
    const args = a || {}
    const c = cfg()
    // ⑧ 零机制：无引擎声明（或计算面关闭）⇒ 提交即具名拒
    if (c.computation === 'off') return refuse('VMU_MATH_UNSUPPORTED_OP', '数学计算面已关闭（vmu.math.computation=off）', '打开它，或不要提交作业', ['vmu.math.computation'])
    const engine = String(args.engine || '').trim()
    if (!engine) return refuse('VMU_MATH_INVALID_INPUT', 'submit 需要 engine', '声明引擎名（见 vmu.math.engines）', [])
    if (c.engines.length === 0) return refuse('VMU_MATH_UNSUPPORTED_OP', '未声明任何引擎（vmu.math.engines 为空）', '先在设置里声明引擎；零机制不允许"猜一个引擎"', ['vmu.math.engines'])
    if (c.engines.indexOf(engine) === -1) return refuse('VMU_MATH_UNSUPPORTED_OP', '引擎未声明：' + engine, '已声明：' + c.engines.join('、'), ['vmu.math.engines'])
    if (c.mode === 'typed' && String(args.shell) === 'true') return refuse('VMU_MATH_SANDBOX_DENIED', 'typed 模式拒绝 shell（vmu.math.mode=typed）', '用 argv 传参，不要走 shell', ['vmu.math.mode'])
    if (c.maxJobs > 0 && jobs.size >= c.maxJobs) return refuse('VMU_MATH_RESOURCE_LIMIT', '作业总量已达上限 ' + c.maxJobs, '清掉旧作业或调大 vmu.math.maxJobs', ['vmu.math.maxJobs'])
    const isRandom = args.random === true || args.seed !== undefined
    const seed = (args.seed === undefined || args.seed === null || args.seed === '') ? '' : String(args.seed)
    // ⑤ 随机作业必须有种子（默认 requireSeedForRandom=true）
    if (isRandom && !seed && c.requireSeedForRandom) return refuse('VMU_MATH_SEED_REQUIRED', '随机作业缺种子（requireSeedForRandom=true）', '给 seed；不许写"应该能复现"', ['vmu.math.requireSeedForRandom'])
    // ① spawn 未注入 ⇒ 具名拒（**绝不假装跑过**）
    if (typeof spawn !== 'function') return refuse('VMU_EXTERNAL_UNAVAILABLE', 'spawn 接缝未注入（本机未接真引擎）', '由宿主注入 spawn；本面绝不假跑 ✗', [])

    const argv = Array.isArray(args.argv) ? args.argv.map(String) : []
    const stdin = String(args.stdin === undefined ? '' : args.stdin)
    const timeoutMs = Number(args.timeoutMs) > 0 ? Math.floor(Number(args.timeoutMs)) : c.timeoutMs
    const id = String(args.jobId || mintJobId())
    const job = {
      id, engine, argv: argv.slice(), stdin, seed, random: isRandom, state: 'queued', attempts: 0,
      startedAt: 0, settledAt: 0, queueWaitMs: 0, timeoutMs, reason: '',
      enqueuedAt: clock(),
      inputHash: fp({ argv, stdin, seed }),
    }
    jobs.set(id, job)
    note('math.submit', id)
    emit('math/job-submitted', { jobId: id, engine, argvHash: job.inputHash })
    job.attempts = 1
    return await execute(job)
  }

  const status = (q) => {
    const id = String((q && (q.jobId || q.id)) || '')
    const j = jobs.get(id)
    if (!j) {
      const m = mirrorInst ? mirrorInst.records.get(id) : null
      if (m) return { ok: true, job: { id: m.jobId, engine: m.engine, state: m.state, startedAt: m.startedAt, endedAt: m.settledAt, timeoutMs: m.request ? m.request.timeoutMs : 0, hasReceipt: !!m.receipt, fromMirror: true } }
      return refuse('VMU_NOT_FOUND', '找不到作业 ' + id, '先 list() 取 id')
    }
    return { ok: true, job: { id: j.id, engine: j.engine, state: j.state, startedAt: j.startedAt, endedAt: j.settledAt, timeoutMs: j.timeoutMs, hasReceipt: receipts.has(j.id) } }
  }
  const cancel = (q) => {
    const id = String((q && q.jobId) || '')
    const j = jobs.get(id)
    if (!j) return refuse('VMU_NOT_FOUND', '找不到作业 ' + id, '先 list() 取 id')
    if (j.state !== 'running') return refuse('VMU_JOB_CANCELLED', '作业已结束，不能取消（state=' + j.state + '）', '取消只对 running 生效')
    j.state = 'cancelled'
    j.cancelled = true
    j.reason = String((q && q.reason) || '')
    note('math.cancel', id, { reason: j.reason })
    // 取消也必须落镜像（否则崩溃恢复会把已取消的作业当成 running 重排 —— 那是"静默复活"）
    void writeMirror(j)
    emit('math/job-cancelled', { jobId: id, reason: j.reason })
    return { ok: true, jobId: id, state: j.state, reason: j.reason }
  }
  const receipt = (q) => {
    const id = String((q && q.jobId) || '')
    const r = receipts.get(id)
    if (!r) return refuse('VMU_NOT_FOUND', '找不到回执 ' + id, '回执只保留最近 ' + cfg().keepReceipts + ' 条')
    return { ok: true, receipt: r }
  }
  /** 回执完整性自查（**只读**）：缺字段即报缺哪些 ✗。 */
  const checkReceipt = (r) => {
    const need = ['engine', 'argvFingerprint', 'inputFingerprint', 'exitCode', 'durationMs', 'outputFingerprint']
    const missing = need.filter((k) => !r || r[k] === undefined || r[k] === '')
    return missing.length ? refuse('VMU_FORMAL_REPRO_INCOMPLETE', '回执不完整：缺 ' + missing.join('、'), '回执字段表：' + need.join('、')) : { ok: true }
  }
  const list = () => ({ ok: true, count: jobs.size, dropped: droppedLog + droppedReceipts, jobs: [...jobs.values()].map((j) => ({ id: j.id, engine: j.engine, state: j.state, hasReceipt: receipts.has(j.id) })) })
  const summary = () => {
    const st = mirrorInst ? mirrorInst.status() : { count: 0 }
    return {
      ok: true, count: jobs.size, running: running(), receipts: receipts.size,
      droppedReceipts, droppedLog, droppedMirrors, mirrorSkipped, mirrorFailures, mirrors: st.count,
      engines: cfg().engines.slice(), timeoutMs: cfg().timeoutMs,
    }
  }

  // ── 恢复（ROUND 2 · 四分支）────────────────────────────────────────────────────────────────────
  /** 列出镜像目录里的作业（只读；缺 fs 接缝 ⇒ 具名不可用）。 */
  const listMirrors = async () => {
    if (!fsSeam) return { ok: false, code: 'VMU_MATH_JOBS_MIRROR_UNWIRED', message: '未注入 fs 接缝：镜像面不可用', hint: '注入 fs{writeText,readText,exists,listDir} 后镜像与恢复才成立', enforced: ['vmu.math.jobs.persist', 'vmu.math.jobs.dir'], enforcedScope: ENFORCED_SCOPE }
    const c = cfg()
    if (c.jobsDir === null) return { ok: false, code: 'VMU_MATH_JOBS_DIR_UNSAFE', message: 'vmu.math.jobs.dir 不是 root 相对的安全路径：' + c.jobsDirRaw, hint: '用 root 相对、无 .. 的目录；空＝Math/Jobs', enforced: ['vmu.math.jobs.dir'], enforcedScope: ENFORCED_SCOPE }
    const rows = await mirrorFor().list()
    observeJobIds(rows.map((r) => r.jobId))   // hydrate: the counter takes max+1, so a restart never reuses an id
    return { ok: true, dir: c.jobsDir, count: rows.length, mirrors: rows.map((r) => (r.corrupt ? { jobId: r.jobId, corrupt: true } : { jobId: r.jobId, corrupt: false, state: r.rec.state, attempts: r.rec.attempts })) }
  }

  /**
   * 启动/手动恢复。**绝不静默 passed**：本面不存在 "passed"；`settled` 只采纳"exit 0 ＋ 指纹一致 ＋ 带回执"。
   * 返回逐类计数（recovered 的四分支可从计数直接断言）。
   */
  const recover = async () => {
    const c = cfg()
    if (c.recoverMode === 'off') {
      lastRecovery = { at: clock(), skipped: 'recover-mode-off' }
      return { ok: true, disabled: true, reason: 'vmu.math.jobs.recover=off', scanned: 0, requeued: 0, adopted: 0, interrupted: 0, left: 0 }
    }
    if (!fsSeam) {
      return refuse('VMU_MATH_JOBS_MIRROR_UNWIRED', '未注入 fs 接缝：无法恢复作业镜像', '注入 fs{writeText,readText,exists,listDir}；或用 vmu.math.jobs.persist=false 明确关掉镜像面', ['vmu.math.jobs.persist', 'vmu.math.jobs.dir'])
    }
    const listed = await listMirrors()
    if (listed.ok !== true) return listed
    let scanned = 0, requeued = 0, adopted = 0, interrupted = 0, left = 0, corrupt = 0
    const results = []
    for (const row of listed.mirrors) {
      if (row.corrupt) { corrupt += 1; results.push({ jobId: row.jobId, action: 'corrupt-ignored' }); continue }
      const rec = mirrorFor().records.get(row.jobId)
      if (!rec) { corrupt += 1; results.push({ jobId: row.jobId, action: 'corrupt-ignored' }); continue }
      scanned += 1
      const req = rec.request || {}
      const recomputed = fp({ argv: req.argv || [], stdin: req.stdin || '', seed: req.seed || '' })
      const intact = recomputed === rec.inputHash
      const mk = (state, extra) => Object.assign({
        id: rec.jobId, engine: rec.engine, argv: (req.argv || []).slice(), stdin: req.stdin || '', seed: req.seed || '',
        random: !!rec.random, timeoutMs: Number(req.timeoutMs) || c.timeoutMs, state,
        attempts: Number(rec.attempts) || 0, enqueuedAt: rec.enqueuedAt || 0, startedAt: rec.startedAt || 0,
        settledAt: rec.settledAt || 0, exitCode: rec.exitCode, timedOut: !!rec.timedOut,
        inputHash: rec.inputHash, reason: rec.reason || '', mirror: rec,
      }, extra || {})
      if (rec.state === 'queued') {
        // ① 从未开始 ⇒ 重新入队并真的重跑（attempts 不变）
        const j = mk('queued')
        jobs.set(j.id, j)
        if (rec.receipt) receipts.set(j.id, rec.receipt)
        requeued += 1
        results.push({ jobId: j.id, action: 'requeued', attempts: j.attempts })
        note('math.recover.requeue', j.id, { from: 'queued' })
        // Lean's rule: a job that never STARTED keeps its attempt number (0 only becomes a real 1st attempt).
        j.attempts = Math.max(1, Number(j.attempts) || 0)
        await execute(j)
        continue
      }
      if (rec.state === 'running') {
        if (intact) {
          // ② running ＋ 指纹一致 ⇒ interrupted 后重排（attempts+1）
          const j = mk('interrupted', { interrupted: true, reason: 'crash-recovery: previous run never reported (request intact)' })
          jobs.set(j.id, j)
          interrupted += 1
          j.attempts = (Number(j.attempts) || 0) + 1
          j.state = 'queued'
          await writeMirror(j)
          note('math.recover.requeue', j.id, { from: 'running' })
          requeued += 1
          results.push({ jobId: j.id, action: 'interrupted-then-requeued', attempts: j.attempts })
          await execute(j)
        } else {
          // ③ running ＋ 指纹不一致 ⇒ **只标 interrupted，不自动重排**
          const j = mk('interrupted', { interrupted: true, reason: 'crash-recovery: request fingerprint mismatch — not auto-rerun' })
          jobs.set(j.id, j)
          await writeMirror(j)
          interrupted += 1
          results.push({ jobId: j.id, action: 'interrupted-no-rerun', why: 'fingerprint-mismatch' })
          note('math.recover.interrupted', j.id, { why: 'fingerprint-mismatch' })
        }
        continue
      }
      if (rec.state === 'settled' && Number(rec.exitCode) === 0 && intact && rec.receipt) {
        // ④ settled ＋ exit 0 ＋ 指纹一致 ＋ 带回执 ⇒ 采纳（回执放回内存；**不是** "passed"）
        const j = mk('settled', { recovered: true, settledAt: rec.settledAt || clock() })
        jobs.set(j.id, j)
        receipts.set(j.id, rec.receipt)
        adopted += 1
        results.push({ jobId: j.id, action: 'adopted', exitCode: 0 })
        note('math.recover.adopt', j.id)
        continue
      }
      // 其余：failed / timeout / interrupted / cancelled / settled 但无回执或指纹不符 ⇒ 原样保留，**不自动重跑**
      const why = rec.state === 'settled' ? (rec.receipt ? 'fingerprint-mismatch' : 'settled-without-receipt') : 'terminal-state-kept'
      const j = mk(TERMINAL_STATES.indexOf(rec.state) === -1 ? 'interrupted' : rec.state, { reason: rec.reason || why, recovered: true, kept: true })
      jobs.set(j.id, j)
      if (rec.receipt) receipts.set(j.id, rec.receipt)
      left += 1
      results.push({ jobId: j.id, action: 'kept', state: j.state, why })
      note('math.recover.kept', j.id, { why })
    }
    lastRecovery = { at: clock(), scanned, requeued, adopted, interrupted, left, corrupt }
    log('math/jobs: recover scanned=' + scanned + ' requeued=' + requeued + ' adopted=' + adopted + ' interrupted=' + interrupted + ' kept=' + left + ' corrupt=' + corrupt)
    emit('math/job-recovered', { scanned, requeued, adopted, interrupted, left, corrupt })
    return { ok: true, dir: listed.dir, scanned, requeued, adopted, interrupted, left, corrupt, results, lastRecovery }
  }

  /**
   * 跨进程／保留的**能力与限制**（只读；诚实登记，不假装强制）。
   * `exclusiveCreate:false` ＝ 本面没有宿主独占创建原语 ⇒ 同名 jobId 的跨进程并发写盘不保证唯一。
   */
  const admission = () => {
    const c = cfg()
    const ms = mirrorInst ? mirrorInst.status() : { count: 0 }
    const notes = []
    if (!fsSeam) notes.push('未注入 fs 接缝 ⇒ 镜像/恢复具名不可用（admission.fileMirror=false）')
    if (c.jobsDir === null) notes.push('vmu.math.jobs.dir 不是 root 相对安全路径 ⇒ 镜像被拒（VMU_MATH_JOBS_DIR_UNSAFE）')
    if (fsSeam && typeof fsSeam.removeText !== 'function') notes.push('fs.removeText 缺失 ⇒ 淘汰不可做：到达 keepMirrors 后停止写盘并计数（mirrorSkipped），不静默无界增长')
    if (c.persist !== true) notes.push('vmu.math.jobs.persist=false ⇒ 镜像面关闭（作业只活在本次会话内存）')
    notes.push('跨进程独占创建：宿主未暴露该原语 ⇒ crossProcess=not-enforced（同名 jobId 并发写盘不保证唯一）')
    return {
      ok: true,
      persist: c.persist === true,
      fileMirror: mirrorEnabled(),
      jobsDir: c.jobsDir,
      keepMirrors: c.keepMirrors,
      removeText: !!(fsSeam && typeof fsSeam.removeText === 'function'),
      retention: mirrorFor().status().retention,
      recoverMode: c.recoverMode,
      exclusiveCreate: false,
      crossProcess: 'not-enforced',
      mirrors: ms.count,
      droppedMirrors, mirrorSkipped, mirrorFailures,
      lastRecovery,
      notes,
      next: { kind: 'note', hint: '需要真正的作业队列/断点续算 ⇒ 宿主需提供独占创建与删除原语；本面不假装有' },
    }
  }

  return {
    submit, status, cancel, receipt, list, statusAll: summary, checkReceipt, keysUsed, config: cfg, trail: () => trail.slice(),
    // ROUND 2
    recover, listMirrors,
    mirrors: () => {
      const recs = mirrorFor().records
      return { ok: true, count: recs.size, jobs: [...recs.values()].map((m) => ({ jobId: m.jobId, state: m.state, attempts: m.attempts, schema: m.schema })) }
    },
    admission, jobsDir: () => cfg().jobsDir, mirrorRel,
  }
}

export default createMathJobs
