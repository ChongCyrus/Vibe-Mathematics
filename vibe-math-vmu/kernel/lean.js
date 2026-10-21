// vibe-math-vmu — P3 Lean 形式化面（8 键的真消费者）。
//
// 设计边界（与 docs/09 的既有声明逐条一致，零机制）：
//   · 只有 "退出 0 **且** 产物文件内容哈希未变" 才可标 passed —— 其余一律 failed（不猜、不放宽）；
//   · leanAsync=true ⇒ 入队即返回（后台 pump）；false ⇒ 同步等待；
//   · leanJobsMaxParallel 限制**并发**（默认 1 ＝ 串行）；
//   · leanTimeoutMs 是**单次**预算（传给 spawn，超时具名拒）；
//   · leanSearchPaths **去重**后注入在**自动 VibMath 根之前**；
//   · leanInitiative（日常主动性）与 formalVerify（判定时要求 off|encourage|require）**正交**；
//   · ROUND 131 起另有**归档三动词**（v5r 的 lean_archive / lean_read / lean_lib）：归档登记【具名引用＋内容
//     哈希】而不复制内容（**只引不复制**），`read()` 回源并校验哈希，漂移即具名拒 —— 见下方归档段。
//
// ── ROUND 2 · 目标 5 B（收掉 N2）：作业**持久化 / 断点续算** ────────────────────────────────────────
//   本面原先只有会话内存（`jobs` Map，重启即丢）。现在接上与计算面**同一套原语**
//   （`kernel/mathjobs.js` 的 `createJobMirror`）：
//     · 镜像 `Formal/Jobs/<jobId>.json`（`schema:'vmu/lean-job@1'`，与 v5r 的 `Formal/Jobs/` 路径一致），
//       记录状态、尝试次数、时间、退出码、**运行前后内容哈希**与**构建上下文指纹**；
//     · 状态全集 `queued|running|settled|failed|timeout|interrupted`（**没有 `passed` 状态**：`passed` 只是
//       "退出 0 且哈希未变"的**布尔结论**，`settled` 才是状态；`interrupted` 永远不是 passed）；
//     · **恢复四分支**（`recover()`，语义对齐 v5r 的 `recoverLeanJobs`）：
//         ① `queued`                                    ⇒ 重新入队（attempts 不变，0 只变成真正的第 1 次）；
//         ② `running` ＋ 文件内容哈希**仍等于**记录值     ⇒ 标 `interrupted` 后**重新入队**（attempts+1）；
//         ③ `running` ＋ 哈希**不一致**（或被删/读不到）  ⇒ **只标 `interrupted`，绝不重跑旧内容**（具名原因）；
//         ④ `settled` ＋ exit 0 ＋ `hashUnchanged` ＋ **带回执** ＋ **构建上下文一致** ＋ 当前文件哈希仍等于
//           记录值 ⇒ **采纳**（恢复 passed 与回执）；上下文变了 ⇒ `interrupted` + `build context changed`。
//       其余（failed/timeout/interrupted/未知）⇒ **原样保留，不自动重跑**，逐条具名 why。
//     · **永不静默 passed**：采纳路径要求四个工具事实同时成立，缺一即 `interrupted` 并写明缺哪一条；
//       本面任何返回值都带 `isRefutation:false`（编译失败/中断**不是**对命题的反驳）。
//     · **id 计数器**：走 `kernel/ids.js`（`mint('lean','lean-')`），恢复时 `observe('lean', 既有 jobId)`
//       ⇒ 计数取 **max+1**，重启后**不复用**旧编号（本面**不再**自带 `let seq`）。
//     · **能力边界如实登记**（`admission()`）：宿主没有独占创建原语 ⇒ `exclusiveCreate:false`、
//       `crossProcess:'not-enforced'`；`dispose()` 只能把在跑作业标 `interrupted`，
//       **无法 terminate 子进程**（注入的 `spawn` 是 promise 接缝，没有 handle）—— 具名说明，不假装。
//
// 依赖注入：`createLeanFace({ settings, spawn, root, clock, log, bus, ids, fs })`。
//   · settings —— 读值接缝：`settings.get(key)` 优先，退回 `settings[key]`（**真读值**才算接线）；
//   · spawn    —— 执行接缝：`spawn({ command, args, cwd, timeoutMs })` ⇒
//                 `{ exitCode, stdout?, stderr?, timedOut? }`（本机未跑真机 ⇒ Host 由 Lead 接线）；
//   · root     —— 库根（文件路径与 `-R <root>` 的基准）；
//   · clock    —— `() => ms`（可注入，便于测试）；
//   · ids      —— 可选：`kernel/ids.js` 的实例（缺省用模块级单例，见 `mint`/`observeIds`）；
//   · fs       —— 可选：`{ writeText, readText, listDir, removeText? }`（缺它 ⇒ 镜像面**具名不可用**）；
//   · log      —— 可选 `(line) => void`。
//
// 拒绝一律 `VMU_*` ＋ `hint`；截断/丢弃必须计数（见 `view()` 的 `dropped`）。

import { readFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import { createHash } from 'node:crypto'
import { createJobMirror, safeRelDir, ENFORCED_SCOPE, createChildBudget, RECOVERY_LEASE_TTL_MS, defaultTimer } from './mathjobs.js'
import { mint as mintId, observeIds } from './ids.js'

export const LEAN_KEYS = Object.freeze([
  'vmu.math.formalVerify',
  'vmu.math.leanCommand',
  'vmu.math.leanArgs',
  'vmu.math.leanTimeoutMs',
  'vmu.math.leanAsync',
  'vmu.math.leanInitiative',
  'vmu.math.leanSearchPaths',
  'vmu.math.leanJobsMaxParallel',
  // ROUND 2 (target 5 B): the durable-job face, shared with the computation face.
  'vmu.math.jobs.persist',
  'vmu.math.jobs.dir',
  'vmu.math.jobs.recover',
  'vmu.math.jobs.keepMirrors',
  // F17: the per-stream output cap (same key the computation face uses ⇒ one meaning, one knob).
  'vmu.math.captureStdoutBytes',
])

export const LEAN_JOB_LOG_MAX = 200 // 事件日志上限；超出即 count 丢弃（不静默）
/** 一次性公告队列的上限（超出即 count 丢弃：F44 的"一键公告"不许无界增长）。 */
export const LEAN_NOTICE_MAX = 20
/** 子进程输出的硬上限（每个流）：超出即**计数**截断（F17 的 `maxBytes` 面）。 */
export const LEAN_OUTPUT_MAX_BYTES = 64 * 1024

/** The durable-job states. **There is no `passed` state**: `passed` is a conclusion, `settled` is a state. */
export const LEAN_JOB_STATES = Object.freeze(['queued', 'running', 'settled', 'failed', 'timeout', 'interrupted'])
export const LEAN_TERMINAL_STATES = Object.freeze(['settled', 'failed', 'timeout', 'interrupted'])
/** The mirror schema (v5r's `Formal/Jobs/<jobId>.json` semantics). */
export const LEAN_JOB_SCHEMA = 'vmu/lean-job@1'
/** v5r's own directory spelling, so the two lines agree on where a job mirror lives. */
export const LEAN_JOBS_DIR_DEFAULT = 'Formal/Jobs'

/**
 * ROUND 131 — 归档允许的 kind。v5r 的 `lean_archive` 把 kind="def" 的可复用定义送进词汇表；这里把同一族
 * 显式枚举，未知 kind **具名拒**（不猜、不放行）。
 */
export const ARCHIVE_KINDS = Object.freeze(['def', 'lemma', 'theorem', 'assumption'])

/** `read()` 一次返回的字节上限；超出即**计数**截断（不静默）。 */
export const ARCHIVE_READ_MAX = 200000

/**
 * F17: byte-capped truncation that COUNTS what it dropped (a silent cut would hide the very output a
 * failed compile needs). Keeps the TAIL, because compiler errors are at the end.
 */
export function tailBytes(s, cap) {
  const str = String(s === undefined || s === null ? '' : s)
  const bytes = Buffer.byteLength(str, 'utf8')
  if (!(cap > 0) || bytes <= cap) return { text: str, droppedBytes: 0 }
  let cut = str
  while (Buffer.byteLength(cut, 'utf8') > cap && cut.length > 0) cut = cut.slice(1)
  return { text: cut, droppedBytes: bytes - Buffer.byteLength(cut, 'utf8') }
}

/**
 * A named refusal. `enforced` lists the SETTINGS KEYS whose value took part in this refusal — an empty
 * array when the decision came from the arguments/file/the injected seam (the honest answer, not a
 * missing one). `enforcedScope` says how far the evaluation got (repo D3: a result is never scope-less).
 */
function refuse(code, message, hint, enforced) {
  return {
    ok: false, code, message, hint,
    enforced: Array.isArray(enforced) ? enforced.slice() : [],
    enforcedScope: ENFORCED_SCOPE,
  }
}

export function createLeanFace(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const spawn = o.spawn
  // F17: the KILLABLE seam. `spawnHandle(opts, onHandle)` must hand us the handle synchronously; then the
  // budget can really terminate the child (and `terminated:true` is a fact, not a claim). Absent ⇒ we keep the
  // promise seam, still time out (never hang) and report `canTerminateChild:false` BY NAME.
  const spawnHandle = typeof o.spawnHandle === 'function' ? o.spawnHandle : null
  const budget = createChildBudget({ timer: o.timer })
  const root = String(o.root || '.')
  // ★ PHASE 9 / round 5: every file the face reads is resolved against `root`, exactly as the file header says.
  // With no `root`, `resolve(s)` uses the process cwd — the documented fallback, not a second convention.
  const resolveFile = (f) => resolvePath(root, String(f))
  /** ROUND 9 · C: this face's identity for the recovery lease (process + random; never an id-counter consumer). */
  const faceOwner = 'lf-' + String(typeof process !== 'undefined' && process.pid ? process.pid : 'x') + '-' + Math.random().toString(36).slice(2, 8)
  const leaseTtlFor = (jobTimeoutMs) => Math.max(RECOVERY_LEASE_TTL_MS, (Number(jobTimeoutMs) || 0) + 30000)
  /**
   * Wait until a job reaches a terminal state (used to release the recovery lease exactly once).
   * ROUND 9-fix (F15): the polling sleep goes through the **INJECTED** timer seam and falls back to the framework's
   * only global-timer site (`defaultTimer` in `kernel/mathjobs.js`). A kernel face must not own an un-injectable
   * real sleep: `tests/vmu-activity-timers.test.mjs` classifies global timer sites, and a second site in this file
   * was exactly the "unclassified timer" it refused. Cadence and cap are unchanged (4000 × 50 ms).
   */
  const sleepMs = (ms) => new Promise((resolve) => {
    const arm = typeof o.timer === 'function' ? o.timer : defaultTimer
    try { const dispose = arm(resolve, ms); if (typeof dispose === 'function') { /* the caller owns completion */ } } catch (e) { resolve() }
  })
  const waitForJob = async (id) => {
    for (let i = 0; i < 4000; i += 1) {
      const j = jobs.get(id)
      if (!j || LEAN_TERMINAL_STATES.indexOf(j.state) !== -1) return true
      await sleepMs(50)
    }
    return false
  }
  const clock = typeof o.clock === 'function' ? o.clock : () => Date.now()
  const log = typeof o.log === 'function' ? o.log : () => {}
  const fsSeam = (o.fs && typeof o.fs.writeText === 'function' && typeof o.fs.readText === 'function') ? o.fs : null
  const idsSvc = o.ids && typeof o.ids.mint === 'function' ? o.ids : null
  // bus.emit takes (NAME, payload): a single object would be refused by the bus and swallowed by a try/catch.
  const emit = (name, payload) => {
    try {
      if (!o.bus || typeof o.bus.emit !== 'function') return
      const r = o.bus.emit(String(name), payload || {})
      if (r && typeof r.catch === 'function') r.catch(() => {})
    } catch (e) { /* 广播不改结果 */ }
  }

  // ★ PHASE 9 / round 1: the spawn failure carries EVIDENCE, not only a verdict. resolved=null means the host's
  // resolveExecutable failed (host PATH) while the member's own shell can still find lean; doneError is a REJECTED
  // handle.done; pathPrefix/cwd let a reader compare the host service env with the member env.
  const spawnDiagnostics = (src, cmd2) => {
    const o = src || {}
    const done = o.doneError || null
    const resolve = o.resolveError || null
    const spawnErr = o.spawnError || null
    const pathText = o.path === null || o.path === undefined ? null : String(o.path).slice(0, 300)
    return {
      resolved: o.resolved === undefined ? null : o.resolved,
      doneError: done,
      resolveError: resolve,
      spawnError: spawnErr,
      cwd: o.cwd === undefined || o.cwd === null ? (cmd2 && cmd2.cwd ? String(cmd2.cwd) : null) : String(o.cwd),
      pathPrefix: pathText,
      signal: o.signal === undefined ? null : o.signal,
      timedOut: o.timedOut === true,
      // ★ PHASE 9 / round 7: the raw value `await handle.done` resolved to, and the handle's own keys. Without these a
      // renamed field (code/status) or Promise-wrapped outcome is indistinguishable from "the host gave nothing".
      doneValue: o.doneValue === undefined ? null : o.doneValue,
      doneShape: o.doneShape === undefined ? null : o.doneShape,
      handleKeys: Array.isArray(o.handleKeys) ? o.handleKeys.slice(0, 40) : [],
    }
  }
  const commandNotFoundOf = (e, diag) => {
    if (e && e.commandNotFound === true) return true
    const rows = [diag.resolveError, diag.spawnError, diag.doneError].filter(Boolean)
    return rows.some((x) => x && (x.code === 'ENOENT' || /not found|ENOENT|no such file/i.test(String(x.message || ''))))
  }
  const spawnEvidenceText = (diag) => 'resolved=' + JSON.stringify(diag.resolved) +
    ' doneError=' + JSON.stringify(diag.doneError) +
    ' resolveError=' + JSON.stringify(diag.resolveError) +
    ' spawnError=' + JSON.stringify(diag.spawnError) +
    ' cwd=' + JSON.stringify(diag.cwd) + ' pathPrefix=' + JSON.stringify(diag.pathPrefix) +
    ' signal=' + JSON.stringify(diag.signal) + ' timedOut=' + String(diag.timedOut) +
    ' doneValue=' + JSON.stringify(diag.doneValue === undefined ? null : diag.doneValue) +
    ' doneShape=' + JSON.stringify(diag.doneShape === undefined ? null : diag.doneShape) +
    ' handleKeys=' + JSON.stringify(diag.handleKeys || [])

  // ── 设置读取（**唯一口径**；每个键只在此处被读 ⇒ keysUsed() 与实现必然一致）────────────
  const cfg = () => {
    const formalVerify = String(readKey('vmu.math.formalVerify') || 'off')
    const leanCommand = String(readKey('vmu.math.leanCommand') || 'lean')
    const leanArgs = Array.isArray(readKey('vmu.math.leanArgs')) ? readKey('vmu.math.leanArgs').map(String) : []
    const nTimeout = Number(readKey('vmu.math.leanTimeoutMs'))
    const leanTimeoutMs = Number.isFinite(nTimeout) && nTimeout > 0 ? Math.floor(nTimeout) : 120000
    const leanAsync = readKey('vmu.math.leanAsync') !== false
    const leanInitiative = String(readKey('vmu.math.leanInitiative') || 'normal')
    const rawPaths = readKey('vmu.math.leanSearchPaths')
    const nJobs = Number(readKey('vmu.math.leanJobsMaxParallel'))
    const leanJobsMaxParallel = Number.isFinite(nJobs) && nJobs >= 1 ? Math.floor(nJobs) : 1
    // 去重（保序）＋ 过滤空串：searchPaths 的顺序语义由此固定
    const searchPaths = []
    for (const p of (Array.isArray(rawPaths) ? rawPaths : [])) {
      const s = String(p || '').trim()
      if (s && searchPaths.indexOf(s) === -1) searchPaths.push(s)
    }
    // ROUND 2: the durable-job face (same four keys as the computation face; empty dir ⇒ v5r's Formal/Jobs).
    const rawDir = String(readKey('vmu.math.jobs.dir') || '').trim()
    const jobsDir = rawDir ? safeRelDir(rawDir) : LEAN_JOBS_DIR_DEFAULT
    const nKeep = Number(readKey('vmu.math.jobs.keepMirrors'))
    const rm = String(readKey('vmu.math.jobs.recover') || 'on-load')
    // F17: the per-stream output cap (the shared key; 0/absent ⇒ the documented 64KB constant).
    const nOut = Number(readKey('vmu.math.captureStdoutBytes'))
    const outputMaxBytes = Number.isFinite(nOut) && nOut > 0 ? Math.floor(nOut) : LEAN_OUTPUT_MAX_BYTES
    return {
      formalVerify, leanCommand, leanArgs, leanTimeoutMs, leanAsync, leanInitiative, leanJobsMaxParallel, searchPaths,
      persist: readKey('vmu.math.jobs.persist') === true,
      jobsDir, jobsDirRaw: rawDir,
      keepMirrors: Number.isFinite(nKeep) && nKeep >= 0 ? Math.floor(nKeep) : 200,
      recoverMode: ['on-load', 'manual', 'off'].indexOf(rm) === -1 ? 'on-load' : rm,
      outputMaxBytes,
    }
  }

  /** 本面**实际读过**的设置键（真读值 ⇒ 与 cfg() 一一对应）。 */
  const keysUsed = () => LEAN_KEYS.slice()

  /** 判定时的形式化策略；`formalVerify==='off'` ⇒ **零策略**（不要求、不提示）。 */
  const policy = () => {
    const c = cfg()
    return {
      formalVerify: c.formalVerify,
      requireFormal: c.formalVerify === 'require',
      encourageFormal: c.formalVerify === 'encourage',
      initiative: c.leanInitiative, // 与 formalVerify **正交**：这里只如实回显，不参与判定
      // ★ G5 第六轮 F2：这个键【有读者但无效果】不是隐藏缺陷，而是**具名说明**——回执自曝其效果级别，
      // 这样调用方不会误以为 leanInitiative 会改变判定。设计卷/设置表同步写“只回显”。
      initiativeEffect: 'display-only',
    }
  }

  /** `-R` 顺序：**去重的 searchPaths 在前，自动 VibMath 根在最后**。显式 `-R/--root` 在 leanArgs 时不重复注入。 */
  const commandFor = (file) => {
    const c = cfg()
    const explicitRoot = c.leanArgs.some((a) => a === '-R' || a === '--root' || a.startsWith('-R') || a.startsWith('--root='))
    const args = []
    for (const p of c.searchPaths) args.push('-R', p)
    if (!explicitRoot) args.push('-R', root)
    for (const a of c.leanArgs) args.push(a)
    args.push(String(file || ''))
    return { command: c.leanCommand, args, cwd: root, timeoutMs: c.leanTimeoutMs }
  }

  const jobs = new Map()
  const order = []
  let droppedEvents = 0
  const events = []
  // F44: ONE-SHOT announcements. A settled job announces itself EXACTLY ONCE, in the initiator's next
  // prompt; the queue is capped (drops counted) and the durable paths (mirror file / status(jobId) /
  // mirrors()) remain the LONG-TERM query face — "announcement is not the only way to learn the outcome".
  const notices = []
  let droppedNotices = 0
  /** F17: the runtime fact — did the LAST spawn hand us a handle? (admission() reports the declared seam too.) */
  let lastSpawnHadHandle = null
  /** ROUND 6: "we have SEEN a live handle at least once" — the proof that this face can terminate (dispose/cancel). */
  let sawHandle = false
  const pushNotice = (j, line) => {
    notices.push({ member: String(j.member || ''), jobId: j.id, line, at: clock() })
    while (notices.length > LEAN_NOTICE_MAX) { notices.shift(); droppedNotices += 1 }
  }
  const takeNoticesFor = (memberId) => {
    const me = String(memberId || '')
    if (!me) return []
    const mine = notices.filter((n) => n.member === me)
    if (!mine.length) return []
    for (const n of mine) { const i = notices.indexOf(n); if (i !== -1) notices.splice(i, 1) }
    return mine.map((n) => n.line)
  }
  const noticesView = () => ({ ok: true, count: notices.length, droppedNotices, cap: LEAN_NOTICE_MAX, notices: notices.map((n) => ({ member: n.member, jobId: n.jobId, at: n.at, line: n.line })) })
  const note = (id, what, extra) => {
    events.push(Object.assign({ at: clock(), id, what }, extra || {}))
    if (events.length > LEAN_JOB_LOG_MAX) { events.shift(); droppedEvents += 1 }
  }

  const readHash = async (file) => {
    try {
      const buf = await readFile(resolveFile(file))
      return createHash('sha256').update(buf).digest('hex')
    } catch (e) {
      return undefined // 读不到 ⇒ 由调用处具名拒（不静默当"未变"）
    }
  }

  // ── id 计数器（kernel/ids.js：唯一铸号者；**不再自带 let seq**）──────────────────────────────
  const mintJobId = () => (idsSvc ? idsSvc.mint('lean', 'lean-') : mintId('lean', 'lean-'))
  const observeJobIds = (list) => {
    const arr = (list || []).map(String)
    if (!arr.length) return
    try {
      if (idsSvc && typeof idsSvc.observe === 'function') idsSvc.observe('lean', arr)
      else observeIds('lean', arr)
    } catch (e) { /* hydration is best-effort; a failure must not break recovery */ }
  }

  const view = (j) => ({
    id: j.id, state: j.state, file: j.file, statement: j.statement,
    exitCode: j.exitCode, hashUnchanged: j.hashUnchanged, passed: j.passed === true,
    startedAt: j.startedAt, endedAt: j.endedAt,
    attempts: Number(j.attempts) || 0,
    // F17 facts a reader must be able to see without reading the mirror.
    terminated: j.terminated === true, hadHandle: j.hadHandle === true,
    outputDroppedBytes: Number(j.outputDroppedBytes) || 0, outputLossy: j.outputLossy === true, outputSpill: j.outputSpill || null,
    // F45 fact: this job reused an earlier PASSED compile (same content + build context).
    dedupedOf: j.dedupedOf || null,
    // ★ PHASE 7 / round 17: a failed job used to show exitCode:null with NO reason. The receipt already has the named
    // code; a diagnostic view that drops it is exactly the "refusal not named" class, so expose code/message/hint.
    code: (j.receipt && j.receipt.code) || null,
    message: (j.receipt && j.receipt.message) || null,
    hint: (j.receipt && j.receipt.hint) || null,
    // ★ PHASE 9 / round 9: a compile with rc=1 was unreadable ("真错在哪"). Tails live on the JOB view only (never
    // status), capped at 2000 chars each; this is the compiler's own words, not a synthesized judgement.
    stdoutTail: String((j.receipt && (j.receipt.stdoutTail || j.receipt.stdout)) || '').slice(-2000),
    stderrTail: String((j.receipt && j.receipt.stderrTail) || '').slice(-2000),
    dropped: { events: droppedEvents }, // 截断/丢弃必计数（纪律）
  })

  const settle = async (id) => {
    const j = jobs.get(String(id))
    if (!j) return refuse('VMU_LEAN_NOT_FOUND', '找不到 Lean 作业 ' + String(id), '先用 list() 取 id；作业镜像在 Formal/Jobs/<id>.json')
    if (j.promise) { try { await j.promise } catch (e) { /* state 已记录 */ } }
    if (LEAN_TERMINAL_STATES.indexOf(j.state) === -1) {
      return refuse('VMU_LEAN_NOT_SETTLED', '作业 ' + j.id + ' 尚未结算（state=' + j.state + '）', '等待 running/queued 结束后再 settle()')
    }
    return {
      ok: true, passed: j.passed === true, exitCode: j.exitCode,
      hashUnchanged: j.hashUnchanged, receipt: j.receipt, state: j.state,
      isRefutation: false,   // a compile outcome is never a refutation of the proposition
    }
  }

  // ── 镜像面（与计算面共用 `createJobMirror`：保留/淘汰/损坏的规则只有一份）──────────────────────
  let mirrorInst = null
  let mirrorKey = ''
  let mirrorSkipped = 0
  let mirrorEvicted = 0
  const mirrorFor = () => {
    const c = cfg()
    const key = String(c.jobsDir) + '|' + String(c.keepMirrors)
    if (!mirrorInst || mirrorKey !== key) {
      mirrorInst = createJobMirror({
        fs: fsSeam, dir: c.jobsDir, keep: c.keepMirrors, clock, schema: LEAN_JOB_SCHEMA,
        onNote: (what, id, extra) => note(id, 'mirror-' + what, extra),
      })
      mirrorKey = key
    }
    return mirrorInst
  }
  const mirrorAllowed = () => cfg().persist === true && cfg().jobsDir !== null && !!fsSeam
  const contextHashOf = (file) => {
    const cmd = commandFor(file)
    // The build context v5r checks is "engine + args + search paths" — NOT the file (the file is the job).
    return 'ctx:' + createHash('sha256').update(JSON.stringify([cmd.command, cmd.args.slice(0, -1), cmd.cwd])).digest('hex').slice(0, 24)
  }
  /**
   * F45: THE dedupe key — content identity + build context, i.e. exactly the two facts the settle decision
   * re-checks (`hashUnchanged` and `contextHash`). Dedupe therefore CANNOT drift from settle: one function.
   */
  const dedupeKeyOf = (file, contentHash) => (contentHash
    ? 'dk:' + createHash('sha256').update(String(contentHash) + '|' + contextHashOf(file)).digest('hex').slice(0, 32)
    : null)
  const mirrorRecord = (j) => ({
    schema: LEAN_JOB_SCHEMA, jobId: j.id, statement: j.statement, file: j.file, member: j.member || '',
    state: j.state, attempts: Number(j.attempts) || 0,
    enqueuedAt: j.enqueuedAt || 0, startedAt: j.startedAt || 0, settledAt: j.endedAt || 0,
    exitCode: j.exitCode === undefined ? null : j.exitCode,
    hashBefore: j.hashBefore === undefined ? null : j.hashBefore,
    hashAfter: j.hashAfter === undefined ? null : j.hashAfter,
    hashUnchanged: j.hashUnchanged === undefined ? null : j.hashUnchanged,
    passed: j.passed === true,
    contextHash: contextHashOf(j.file),
    // F45: the SAME key the settle decision uses (content hash + build context) — dedupe and settle are one
    // source by construction, not two rules that happen to agree today.
    dedupeKey: dedupeKeyOf(j.file, j.hashBefore === undefined ? null : j.hashBefore),
    // F17: the kill facts travel with the record (was a handle available; was the child really terminated).
    terminated: j.terminated === true, hadHandle: j.hadHandle === true,
    outputDroppedBytes: Number(j.outputDroppedBytes) || 0,
    receipt: j.receipt === undefined ? null : j.receipt,
    reason: j.reason || '',
    recovered: j.recovered === true,
  })
  /** Write the mirror for one job. Failures are counted by the helper and reported (`mirrorFailures`). */
  const writeMirror = async (j) => {
    if (!mirrorAllowed()) return { ok: false, code: 'VMU_LEAN_JOBS_MIRROR_UNWIRED' }
    return await mirrorFor().write(j.id, mirrorRecord(j))
  }

  const runOne = async (j) => {
    j.state = 'running'
    j.startedAt = clock()
    j.attempts = (Number(j.attempts) || 0) + 1
    // ── ROUND 9（端到端演练抓出的缺陷 ③）────────────────────────────────────────────────────────────
    // The hash is read BEFORE the durable `running` write. It used to be read AFTER, so the on-disk `running`
    // record carried `hashBefore: null`; after a crash the recovery compared the (unchanged) file against that
    // null ⇒ `contentMatches === false` ⇒ **branch ③ ("file changed") — a crashed Lean job could never resume.**
    const before = await readHash(j.file)
    j.hashBefore = before === undefined ? null : before
    note(j.id, 'running', { attempts: j.attempts, hashBefore: j.hashBefore })
    await writeMirror(j)
    if (before === undefined) {
      j.state = 'failed'; j.endedAt = clock(); j.reason = 'file-unreadable'
      j.receipt = refuse('VMU_LEAN_FILE_UNREADABLE', '读不到 Lean 产物文件：' + j.file, '先写出 .lean 文件；本面只编译既有文件')
      note(j.id, 'failed:unreadable'); await writeMirror(j); return
    }
    // ── F45 去重：与 settle **同源**（dedupeKey ＝ 内容哈希 ＋ 构建上下文，即 settle 要复核的那两个事实）。
    // 同内容同上下文已有一次「通过」⇒ 不重编译；改内容或改构建上下文才会重跑。
    j.dedupeKey = dedupeKeyOf(j.file, before)
    if (j.dedupeKey) {
      const memHit = [...jobs.values()].filter((x) => x.id !== j.id && x.passed === true && x.dedupeKey === j.dedupeKey)[0]
      let ofId = memHit ? memHit.id : ''
      if (!ofId) {
        try {
          const rows = await mirrorFor().list()
          const mHit = rows.filter((r) => !r.corrupt && r.rec.passed === true && r.rec.dedupeKey === j.dedupeKey && r.jobId !== j.id)[0]
          if (mHit) ofId = mHit.jobId
        } catch (e) { /* no mirror ⇒ no dedupe */ }
      }
      if (ofId) {
        j.state = 'settled'; j.passed = true; j.exitCode = 0; j.hashUnchanged = true
        j.hashAfter = before; j.endedAt = clock(); j.dedupedOf = ofId; j.reason = 'deduped'
        j.receipt = { ok: true, passed: true, deduped: true, of: ofId, exitCode: 0, hashUnchanged: true, isRefutation: false }
        note(j.id, 'settled:deduped', { of: ofId })
        await writeMirror(j)
        emit('lean/job-settled', { jobId: j.id, exitCode: 0, hashUnchanged: true, deduped: true, of: ofId })
        pushNotice(j, '【形式化结果】' + j.id + '：同内容同构建上下文已有通过（' + ofId + '）⇒ 去重，未重编译')
        Promise.resolve().then(pump)
        return
      }
    }
    const cmd = commandFor(j.file)
    // `graceMs` is passed as a REQUEST to the host; the local budget is what makes the timeout binding.
    const cmd2 = Object.assign({}, cmd, { graceMs: cmd.timeoutMs })
    let out
    let budgetInfo = { timedOut: false, terminated: false, hadHandle: false }
    try {
      const r = await budget({
        timeoutMs: cmd.timeoutMs,
        label: 'lean ' + j.id,
        // ROUND 6: attach the live handle so `cancel({jobId})` can really terminate a running compile.
        onHandle: (h) => { j.handle = h; sawHandle = true },
        call: (onHandle) => (spawnHandle ? spawnHandle(cmd2, onHandle) : spawn(cmd2)),
      })
      out = r.result
      j.handle = null
      budgetInfo = { timedOut: r.timedOut, terminated: r.terminated, hadHandle: r.hadHandle }
    } catch (e) {
      j.state = 'failed'; j.endedAt = clock(); j.reason = 'spawn-threw'
      const diag = spawnDiagnostics(e, cmd2)
      const notFound = commandNotFoundOf(e, diag)
      const code = notFound ? 'VMU_LEAN_COMMAND_NOT_FOUND' : 'VMU_LEAN_SPAWN_FAILED'
      const hint = notFound
        ? '把 \'vmu.math.leanCommand\' 设成 lean 的完整路径（例如 D:\\.elan\\bin\\lean.exe），或把该目录加进宿主服务的 PATH；成员自己的 shell 能找到 Lean 不等于宿主服务的 PATH 能找到'
        : '检查宿主是否真的注入了 spawn 接缝，以及 handle.done 是否 reject；证据见 resolved/doneError/cwd/pathPrefix'
      j.receipt = Object.assign(refuse(code,
        (notFound ? 'Lean 命令解析不到：' : 'Lean 起不来：') + String((e && e.message) || e) + ' | ' + spawnEvidenceText(diag), hint), diag)
      note(j.id, 'failed:spawn'); await writeMirror(j); return
    }
    // ── ROUND 8（同一类缺陷，与计算面同修）─────────────────────────────────────────────────────────
    // `cancel()` 把作业标成 `interrupted`（reason:'cancelled'）后，被终止的子进程的 `close` 事件会让本路径继续
    // 往下走，把状态**改写成** `settled`/`failed`（后写者赢）⇒ 取消被抹掉。取消是终态：本路径必须让位。
    if (j.cancelled === true || j.reason === 'cancelled' || String(j.reason || '').indexOf('cancelled') === 0) {
      j.state = 'interrupted'
      j.endedAt = clock()
      j.terminated = !!budgetInfo.terminated
      j.hadHandle = !!budgetInfo.hadHandle
      j.passed = false
      j.receipt = Object.assign(refuse('VMU_JOB_CANCELLED',
        'Lean 作业已被取消（mid-flight）：取消是**终态**，不因子进程结束而改写成 settled/failed',
        '要重跑请用新的 jobId 重新 submit；镜像保留取消事实，恢复扫描不重排它', []),
        { cancelled: true, terminated: !!budgetInfo.terminated })
      note(j.id, 'interrupted:cancelled:sticky', { terminated: !!budgetInfo.terminated })
      await writeMirror(j)
      emit('lean/job-cancelled', { jobId: j.id, terminated: !!budgetInfo.terminated, sticky: true })
      Promise.resolve().then(pump)
      return
    }
    j.terminated = !!budgetInfo.terminated
    j.hadHandle = !!budgetInfo.hadHandle
    lastSpawnHadHandle = !!budgetInfo.hadHandle
    const cRun = cfg()
    const capOut = tailBytes(String((out && out.stdout) || ''), cRun.outputMaxBytes)
    const capErr = tailBytes(String((out && out.stderr) || ''), cRun.outputMaxBytes)
    j.outputDroppedBytes = capOut.droppedBytes + capErr.droppedBytes
    // The HOST's own truncation report (offset reader): authoritative when present.
    const hostLossy = !!((out && out.stdoutLossy) || (out && out.stderrLossy))
    const hostSpill = (out && (out.stdoutSpill || out.stderrSpill)) || null
    j.outputLossy = hostLossy
    j.outputSpill = hostSpill
    const r = out || {}
    if (budgetInfo.timedOut || r.timedOut) {
      j.state = 'timeout'; j.endedAt = clock(); j.reason = budgetInfo.terminated ? 'timeout:terminated' : 'timeout:not-terminated'
      j.receipt = Object.assign(refuse('VMU_LEAN_TIMEOUT',
        'Lean 超过单次预算 ' + cmd.timeoutMs + ' ms' + (budgetInfo.terminated
          ? '（已 **terminate** 子进程）'
          : '（宿主未提供 handle 接缝 ⇒ **无法 terminate**，只把作业结算为 timeout；进程可能仍在跑）'),
        budgetInfo.terminated ? '调大 vmu.math.leanTimeoutMs 或切小目标' : '注入 spawnHandle 接缝（带 handle）才能真正终止；见 docs/09 §4.3',
        ['vmu.math.leanTimeoutMs']),
        { terminated: !!budgetInfo.terminated, hadHandle: !!budgetInfo.hadHandle, stdoutTail: capOut.text.slice(-2000), stderrTail: capErr.text.slice(-2000), droppedBytes: j.outputDroppedBytes })
      note(j.id, 'timeout', { terminated: !!budgetInfo.terminated })
      await writeMirror(j)
      emit('lean/job-timeout', { jobId: j.id, timeoutMs: cmd.timeoutMs, terminated: !!budgetInfo.terminated })
      pushNotice(j, '【形式化结果】' + j.id + '：超时（' + cmd.timeoutMs + 'ms，' + (budgetInfo.terminated ? '已 terminate' : '无法 terminate（无 handle 接缝）') + '）')
      Promise.resolve().then(pump)
      return
    }
    // ★ PHASE 7 / round 19: exitCode null/undefined used to become NaN and be labelled EXIT_NONZERO - a WRONG NAME
    // (it sends the reader to the proof while the truth is that spawn returned nothing). No exit code = spawn failure.
    // ★ PHASE 9 / round 9: the seam has TWO names for the same fact (`host-spawn` returns `code`, and also mirrors it
    // as `exitCode` since this round). Read both, in that order; the old `r.exitCode` alone made a host that returned
    // doneValue {"exitCode":1} look like "no exitCode" forever. This was a FIELD-NAME defect, not a missing channel.
    const rawExit = r.exitCode !== undefined ? r.exitCode : r.code
    const exitCode = Number(rawExit)
    if (rawExit === null || rawExit === undefined || !Number.isFinite(exitCode)) {
      j.state = 'failed'; j.exitCode = null; j.endedAt = clock()
      const diag = spawnDiagnostics(r, cmd2)
      // ★ PHASE 9 / round 6: hadHandle + no exitCode + NO error field is a DIFFERENT fact from a rejected spawn: the
      // command was resolved and a handle existed, but this host never supplied an exit code. The real-machine form is
      // the DSH file sandbox refusing to execute "D:\\.elan\\bin\\lean.EXE" (Access is denied, workspace-write); the old
      // message merely said "no exitCode", naming the symptom instead of the direction.
      const unobserved = j.hadHandle === true && rawExit === undefined &&
        !diag.doneError && !diag.spawnError && !diag.resolveError
      const code = unobserved ? 'VMU_LEAN_EXIT_UNOBSERVED' : 'VMU_LEAN_SPAWN_FAILED'
      const message = unobserved
        ? 'Lean 命令已解析到 ' + String(diag.resolved || '(unknown)') + '，宿主也已启动句柄，但没有给出退出码 ⇒ 无法判断编译结果 | ' + spawnEvidenceText(diag)
        : 'spawn 未返回退出码（exitCode=' + String(rawExit) + '）⇒ 无法判断编译结果 | ' + spawnEvidenceText(diag)
      const hint = unobserved
        ? '常见原因是宿主沙箱拒绝执行该路径（workspace-write 模式会拒绝工作区外的可执行文件）；若成员能在自己的 shell 里跑通而本面不能，就是宿主 vs 成员的执行环境差异。请检查宿主沙箱模式/允许路径，必要时由主代理向用户请求执行权限，或把 lean 目录加进允许范围'
        : '检查宿主是否真的注入了 spawn 接缝、命令是否存在、以及 handle/promise 的返回形状是否为 { exitCode }；证据见 resolved/doneError/cwd/pathPrefix'
      j.receipt = Object.assign(refuse(code, message, hint),
        { stdoutDroppedBytes: capOut.droppedBytes, stderrDroppedBytes: capErr.droppedBytes, hostLossy, spillPath: hostSpill,
          stdoutTail: capOut.text.slice(-2000), stderrTail: capErr.text.slice(-2000) }, diag)
      note(j.id, 'failed:' + code)
      await writeMirror(j)
      emit('lean/job-failed', { jobId: j.id, exitCode: null, hashUnchanged: null, code })
      pushNotice(j, '【形式化结果】' + j.id + '：' + code + (unobserved ? '（已解析/已启动但退出码不可观测）' : '（spawn 未返回退出码）'))
      Promise.resolve().then(pump)
      return
    }
    const after = await readHash(j.file)
    j.hashAfter = after === undefined ? null : after
    const hashUnchanged = before !== undefined && after !== undefined && before === after
    j.exitCode = exitCode
    j.hashUnchanged = hashUnchanged
    // **只有退出 0 且哈希未变** ⇒ passed（其余一律 failed；这是唯一的 passed 途径）
    j.passed = exitCode === 0 && hashUnchanged === true
    j.state = j.passed ? 'settled' : 'failed'
    j.endedAt = clock()
    j.receipt = j.passed
      ? { ok: true, passed: true, isRefutation: false, exitCode, hashUnchanged: true, stdout: capOut.text.slice(0, 4000),
          stdoutDroppedBytes: capOut.droppedBytes, stderrDroppedBytes: capErr.droppedBytes, hostLossy, spillPath: hostSpill }
      : Object.assign(refuse(exitCode === 0 ? 'VMU_LEAN_HASH_CHANGED' : 'VMU_LEAN_EXIT_NONZERO',
        exitCode === 0 ? '编译期间文件内容已变 ⇒ 结果不算 passed（hash 变了）'
          : 'Lean 退出码 ' + exitCode + (capErr.text ? '；stderr 尾部：' + capErr.text.slice(-800) : '（stderr 为空）'),
        exitCode === 0 ? '编译后不要再改文件；重跑一次' : '看 stdout/stderr 修证明；本面不猜结论'),
        { stdoutDroppedBytes: capOut.droppedBytes, stderrDroppedBytes: capErr.droppedBytes, hostLossy, spillPath: hostSpill,
          stdoutTail: capOut.text.slice(-2000), stderrTail: capErr.text.slice(-2000) })
    note(j.id, j.passed ? 'settled:passed' : 'failed:' + (j.receipt && j.receipt.code))
    await writeMirror(j)
    emit(j.passed ? 'lean/job-settled' : 'lean/job-failed',
      { jobId: j.id, exitCode, hashUnchanged, code: j.passed ? null : (j.receipt && j.receipt.code) || null })
    pushNotice(j, j.passed
      ? '【形式化结果】' + j.id + '：通过（exit 0，哈希未变' + (j.terminated ? '' : '') + '）'
      : '【形式化结果】' + j.id + '：' + (j.receipt && j.receipt.code) + '（' + String((j.receipt && j.receipt.message) || '').slice(0, 120) + '）')
    // 一个作业结束后**必须再 pump**：否则 leanJobsMaxParallel=1 时队列停在第一个作业之后（实测缺陷）。
    Promise.resolve().then(pump)
  }

  const runningCount = () => order.reduce((n, id) => n + ((jobs.get(id) || {}).state === 'running' ? 1 : 0), 0)
  const pump = () => {
    const c = cfg()
    while (runningCount() < c.leanJobsMaxParallel) {
      const next = order.filter((id) => (jobs.get(id) || {}).state === 'queued')[0]
      if (!next) return
      const j = jobs.get(next)
      j.promise = runOne(j).catch(async (e) => {
        j.state = 'failed'; j.endedAt = clock(); j.reason = 'job-threw'
        j.receipt = refuse('VMU_LEAN_SPAWN_FAILED', 'Lean 作业异常：' + String((e && e.message) || e), '见 Host 日志')
        await writeMirror(j)
      })
    }
  }

  const submit = async (a) => {
    const args = a || {}
    const statement = String(args.statement || '').trim()
    const file = String(args.file || '').trim()
    if (!statement) return refuse('VMU_LEAN_STATEMENT_REQUIRED', 'submit 需要 statement（要形式化的命题原文）', 'statement 必填：它是回执与审计的对象')
    if (!file) return refuse('VMU_LEAN_FILE_REQUIRED', 'submit 需要 file（.lean 文件路径）', 'file 必填：本面只编译既有文件，不替你写证明')
    const c = cfg()
    // ROUND 9: a caller-chosen `jobId` is honoured (the computation face has always accepted one, and the
    // crash/cancel drills need to address a job across processes). A chosen id is OBSERVED so the counter can
    // never re-mint it later (ids are never reused, D-15).
    const requestedId = String(args.jobId || '').trim()
    const id = requestedId || mintJobId()
    if (requestedId) observeJobIds([requestedId])
    const j = {
      id, statement, file, member: String(args.member || ''), dedupeKey: null, state: 'queued', attempts: 0, enqueuedAt: clock(),
      exitCode: undefined, hashBefore: undefined, hashAfter: undefined, hashUnchanged: undefined,
      passed: undefined, startedAt: 0, endedAt: 0, receipt: undefined, promise: undefined, reason: '',
    }
    jobs.set(id, j); order.push(id)
    note(id, 'queued')
    // CROSS-PROCESS CLAIM (N5): with the exclusive seam, taking the mirror is what makes this job OURS.
    const claimed = await writeMirror(j)
    if (claimed && claimed.ok === false && claimed.code === 'VMU_MATH_JOB_ID_TAKEN') {
      jobs.delete(id)
      const k = order.indexOf(id); if (k !== -1) order.splice(k, 1)
      note(id, 'rejected:job-id-taken')
      return refuse('VMU_MATH_JOB_ID_TAKEN', '作业号 ' + id + ' 已被另一个进程占用（独占创建拒绝）',
        '换一个 jobId，或让 id 计数器真正持久（kernel/ids.js 绑定 store）后再提交；本面绝不覆盖别人的镜像 ✗',
        ['vmu.math.jobs.persist', 'vmu.math.jobs.dir'])
    }
    emit('lean/job-submitted', { jobId: id, file })
    if (c.leanAsync) { Promise.resolve().then(pump); return { ok: true, id, state: 'queued' } }
    // 同步路径：**等待本次结算**（不影响其他作业；leanAsync=false ⇒ 调用方拿到终态）
    await runOne(j)
    return { ok: true, id, state: j.state, sync: true }
  }

  const status = (id) => {
    const j = jobs.get(String(id))
    if (!j) {
      const rec = mirrorInst ? mirrorInst.records.get(String(id)) : null
      if (rec) return { ok: true, job: { id: rec.jobId, state: rec.state, file: rec.file, statement: rec.statement, passed: rec.passed === true, attempts: rec.attempts, fromMirror: true } }
      return refuse('VMU_LEAN_NOT_FOUND', '找不到 Lean 作业 ' + String(id), '先用 list() 取 id；作业镜像在 Formal/Jobs/<id>.json')
    }
    return { ok: true, job: view(j) }
  }
  const list = () => ({ ok: true, count: order.length, droppedEvents, jobs: order.map((id) => view(jobs.get(id))) })

  // ── 恢复（ROUND 2 · 四分支；语义对齐 v5r 的 recoverLeanJobs）────────────────────────────────────
  /** 镜像目录列表（只读；缺 fs 接缝 ⇒ 具名不可用）。 */
  const listMirrors = async () => {
    if (!fsSeam) return refuse('VMU_LEAN_JOBS_MIRROR_UNWIRED', '未注入 fs 接缝：Lean 作业镜像面不可用', '注入 fs{writeText,readText,listDir,removeText?}；或用 vmu.math.jobs.persist=false 明确关掉', ['vmu.math.jobs.persist', 'vmu.math.jobs.dir'])
    const c = cfg()
    if (c.jobsDir === null) return refuse('VMU_LEAN_JOBS_DIR_UNSAFE', 'vmu.math.jobs.dir 不是 root 相对的安全路径：' + c.jobsDirRaw, '用 root 相对、无 .. 的目录；空＝' + LEAN_JOBS_DIR_DEFAULT, ['vmu.math.jobs.dir'])
    const rows = await mirrorFor().list()
    observeJobIds(rows.map((r) => r.jobId))   // 水合：计数取 max+1（重启后不复用编号）
    return { ok: true, dir: c.jobsDir, count: rows.length, mirrors: rows.map((r) => (r.corrupt ? { jobId: r.jobId, corrupt: true } : { jobId: r.jobId, corrupt: false, state: r.rec.state, attempts: r.rec.attempts, passed: r.rec.passed === true })) }
  }

  const admission = () => {
    const c = cfg()
    const bad = c.jobsDir === null
    const ms = mirrorInst ? mirrorInst.status() : { count: 0, retention: 'append-only-refuse-after-cap', skipped: 0, evicted: 0, failed: 0 }
    const xc = !!(fsSeam && typeof fsSeam.writeTextExclusive === 'function')
    const notes = []
    if (!fsSeam) notes.push('未注入 fs 接缝 ⇒ 镜像/断点续算具名不可用（admission.fileMirror=false）')
    if (bad) notes.push('vmu.math.jobs.dir 不是 root 相对安全路径 ⇒ 镜像被拒（VMU_LEAN_JOBS_DIR_UNSAFE）')
    if (c.persist !== true) notes.push('vmu.math.jobs.persist=false ⇒ 镜像面关闭（作业只活在本次会话内存）')
    if (fsSeam && typeof fsSeam.removeText !== 'function') notes.push('fs.removeText 缺失 ⇒ 淘汰不可做：到达 keepMirrors 后停止写盘并计数（mirrorSkipped）')
    notes.push(xc
      ? '跨进程独占创建：宿主提供 fs.writeTextExclusive（wx/O_EXCL）⇒ 首个镜像写入**原子占号**，同号并发写盘被具名拒（VMU_MATH_JOB_ID_TAKEN）'
      : '跨进程独占创建：宿主未暴露 writeTextExclusive ⇒ crossProcess=not-enforced（同名 jobId 的并发写盘不保证唯一，后写者覆盖）；需要它的是"多进程/多会话共用一个研究所目录"的部署')
    notes.push('dispose() 只能把在跑作业标 interrupted：注入的 spawn 是 promise 接缝，没有 handle ⇒ **无法 terminate 子进程**（具名限制，不假装）')
    // F17: the subprocess budget is LOCAL (a timer) and killing needs a handle ⇒ report exactly that.
    notes.push(spawnHandle
      ? '子进程预算：本地 timer 到点后调用 handle.terminate()（**真的终止**），结果带 terminated:true；graceMs 同时作为请求传给宿主'
      : '子进程预算：本地 timer 到点会把作业结算为 timeout（**不会挂死**）；能否**真的终止**取决于 seam 形状——宿主原生 spawn 同步返回 SubprocessHandle（有 terminate）时本面会自动使用它并记 terminated:true；只给 promise 接缝 ⇒ terminated:false、canTerminateChild:false，谁需要它：超时后要立刻释放 CPU、不留孤儿进程的部署')
    return {
      ok: true,
      persist: c.persist === true,
      fileMirror: mirrorAllowed(),
      outputMaxBytes: c.outputMaxBytes,
      subprocess: {
        budget: 'local-timer',
        declaredKillableSeam: !!spawnHandle,
        lastSpawnHadHandle,
        // Ground truth: the DSH `subprocess` service documents `spawn(spec): SubprocessHandle` with
        // `terminate()`/`waitForExit()`/`done`/`collected.*.readFrom(offset)` — so a host-native spawn is
        // ALREADY killable; passing it through is all that is needed (no new host capability).
        hostContract: 'subprocess.spawn → SubprocessHandle{terminate, done, collected}',
        graceMsSent: true,
      },
      jobsDir: c.jobsDir,
      keepMirrors: c.keepMirrors,
      removeText: !!(fsSeam && typeof fsSeam.removeText === 'function'),
      retention: ms.retention,
      recoverMode: c.recoverMode,
      // ROUND 20 / task-122 ④ — THE RESUME DISCLOSURE (a DISCLOSURE, not an interpretation): this face had NO
      // resume statement at all, so a caller could not tell whether a Lean job can continue where it stopped.
      // It cannot, and the reason is named rather than implied: a Lean job here is ONE whole-file build
      // invocation, with no in-run protocol or output stream, so there is no partial elaboration state for a
      // checkpoint to hold — and the face's own recovery already treats a crashed build as something to re-issue
      // from the start, never to continue (see the fingerprint branch: a changed file can never resume).
      // The kernel's ruling (docs/15 §14.4, round 9) keeps `resumeFrom` a CARRIED opaque token and names the
      // upgrade's precondition; until that precondition is met, this stays false BY NAME.
      resume: {
        supported: false,
        reason: 'Lean cannot resume mid-run: this face invokes the engine as ONE whole-file build (no in-run protocol/stream), so there is no partial state a checkpoint could hold; a crashed Lean job is re-issued from the start, never continued',
        engine: 'lean',
        whatWouldHaveToExist: 'an engine-side output protocol + an in-run stream this face could read + a `checkpoint` field in the job mirror + segmented re-issue',
        changeCondition: 'docs/15 §14.4: a real resumable engine exists AND a single job lasts >= the job budget. Only then is the upgrade "one demo per engine proving resume == one uninterrupted run" (~60-100 kernel lines) worth landing',
      },
      // The state set is a FACT about this face and it reaches callers HERE (admission() is consumed by the
      // tool face / status readers). There is deliberately NO `jobsStates()` instance method: it had no caller,
      // and the module-level `LEAN_JOB_STATES` export is the one authority — the computation face exports its
      // own `JOB_STATES` the same way (one shape, not an instance-method twin).
      jobStates: LEAN_JOB_STATES.slice(),
      exclusiveCreate: xc,
      crossProcess: xc ? 'enforced-by-exclusive-create' : 'not-enforced',
      canTerminateChild: !!(spawnHandle || sawHandle || lastSpawnHadHandle === true),   // declared seam OR runtime-proven
      mirrors: ms.count,
      mirrorSkipped: mirrorSkipped + (ms.skipped || 0),
      mirrorEvicted: mirrorEvicted + (ms.evicted || 0),
      mirrorFailures: ms.failed || 0,
      lastRecovery: lastRecovery,
      notes,
      next: { kind: 'note', hint: '需要真正可 kill 的作业 ⇒ 宿主需提供带 handle 的 spawn；本面不假装有' },
    }
  }

  let lastRecovery = null

  /**
   * 恢复：**绝不静默 passed**。四分支逐条具名并计数（`{scanned,requeued,adopted,interrupted,left,corrupt}`），
   * 因此"重启后行为"可以直接断言，而不是靠"大概没坏"。
   */
  const recover = async () => {
    const c = cfg()
    if (c.recoverMode === 'off') {
      lastRecovery = { at: clock(), skipped: 'recover-mode-off' }
      return { ok: true, disabled: true, reason: 'vmu.math.jobs.recover=off', scanned: 0, requeued: 0, adopted: 0, interrupted: 0, left: 0, corrupt: 0 }
    }
    if (!fsSeam) return refuse('VMU_LEAN_JOBS_MIRROR_UNWIRED', '未注入 fs 接缝：无法恢复 Lean 作业镜像', '注入 fs{writeText,readText,listDir}；或用 vmu.math.jobs.persist=false 明确关掉', ['vmu.math.jobs.persist', 'vmu.math.jobs.dir'])
    if (c.jobsDir === null) return refuse('VMU_LEAN_JOBS_DIR_UNSAFE', 'vmu.math.jobs.dir 不是 root 相对的安全路径：' + c.jobsDirRaw, '用 root 相对、无 .. 的目录；空＝' + LEAN_JOBS_DIR_DEFAULT, ['vmu.math.jobs.dir'])
    const listed = await listMirrors()
    if (listed.ok !== true) return listed
    let scanned = 0, requeued = 0, adopted = 0, interrupted = 0, left = 0, corrupt = 0
    const results = []
    for (const row of listed.mirrors) {
      if (row.corrupt) { corrupt += 1; results.push({ jobId: row.jobId, action: 'corrupt-ignored' }); continue }
      const rec = mirrorFor().records.get(row.jobId)
      if (!rec) { corrupt += 1; results.push({ jobId: row.jobId, action: 'corrupt-ignored' }); continue }
      scanned += 1
      const hashNow = await readHash(rec.file)
      const ctxSame = !!rec.contextHash && contextHashOf(rec.file) === rec.contextHash
      const contentMatches = hashNow !== undefined && rec.hashBefore !== null && rec.hashBefore !== undefined && hashNow === rec.hashBefore
      const mk = (state, extra) => Object.assign({
        id: rec.jobId, statement: rec.statement, file: rec.file, state,
        attempts: Number(rec.attempts) || 0, enqueuedAt: rec.enqueuedAt || 0,
        startedAt: rec.startedAt || 0, endedAt: rec.settledAt || 0,
        exitCode: rec.exitCode === undefined ? undefined : rec.exitCode,
        hashBefore: rec.hashBefore, hashAfter: rec.hashAfter,
        hashUnchanged: rec.hashUnchanged === null ? undefined : rec.hashUnchanged,
        // NEVER inherited from the mirror: `passed` may only be set by the ADOPT branch (branch ④). A mirror
        // that claims `passed:true` while its evidence no longer holds must NOT resurrect the claim
        // (that is the "silently passed" defect this face exists to prevent).
        passed: false,
        receipt: rec.receipt || undefined,
        reason: rec.reason || '', recovered: true, mirror: rec,
      }, extra || {})
      if (rec.state === 'queued') {
        // ① 从未开始 ⇒ 重新入队（attempts 不变：0 只变成真正的第 1 次 —— 由 runOne 递增）
        const j = mk('queued')
        jobs.set(j.id, j); order.push(j.id)
        requeued += 1
        results.push({ jobId: j.id, action: 'requeued', attempts: j.attempts })
        note(j.id, 'recover:requeued', { from: 'queued' })
        continue
      }
      if (rec.state === 'running') {
        if (contentMatches) {
          // ② running ＋ 文件内容哈希仍等于记录值 ⇒ interrupted 后**重新入队**（attempts+1）
          // ROUND 9 · C：恢复租约（与计算面同一原语）。两个实例同时扫到同一个 `running` 镜像会各编译一遍；
          // 未过期的租约 ⇒ 本实例让位（具名 `lease-held`），陈旧租约可被抢（避免死实例永久阻塞恢复）。
          const lease = await mirrorFor().takeLease(rec.jobId, faceOwner, leaseTtlFor(Number(rec.request && rec.request.timeoutMs) || cfg().leanTimeoutMs))
          if (lease && lease.ok === true && lease.held === false) {
            results.push({ jobId: rec.jobId, action: 'lease-held', owner: lease.owner, ageMs: lease.ageMs, enforced: lease.enforced !== false })
            note(rec.jobId, 'recover:lease-held', { owner: lease.owner })
            continue
          }
          const j = mk('interrupted', { reason: 'crash: previous run never reported (file content unchanged)', interrupted: true })
          jobs.set(j.id, j)
          interrupted += 1
          await writeMirror(j)          // durable first: "the previous run is known-interrupted"
          j.state = 'queued'            // …and only then re-enqueue it (pump only picks `queued`)
          order.push(j.id)
          requeued += 1
          results.push({ jobId: j.id, action: 'interrupted-then-requeued', lease: lease && lease.stole ? 'stolen-stale' : (lease && lease.enforced === false ? 'unenforced' : 'acquired') })
          note(j.id, 'recover:requeued', { from: 'running', attempts: j.attempts })
          // the lease must not outlive the recovery it guards: release it once the re-run is done
          Promise.resolve().then(async () => { try { await waitForJob(j.id); await mirrorFor().releaseLease(j.id) } catch (e) { /* TTL is the backstop */ } })
        } else {
          // ③ running ＋ 哈希不一致/读不到 ⇒ **只标 interrupted，绝不重跑旧内容**
          const why = hashNow === undefined ? 'crash: the compiled file is unreadable now — not re-run' : 'crash: the compiled file changed — not re-run'
          const j = mk('interrupted', { reason: why, interrupted: true })
          jobs.set(j.id, j)
          interrupted += 1
          results.push({ jobId: j.id, action: 'interrupted-no-rerun', why: hashNow === undefined ? 'file-unreadable' : 'hash-mismatch' })
          note(j.id, 'recover:interrupted', { why })
          await writeMirror(j)
        }
        continue
      }
      if (rec.state === 'settled' && Number(rec.exitCode) === 0 && rec.hashUnchanged === true && rec.receipt && ctxSame && contentMatches) {
        // ④ 采纳：四个工具事实都成立才恢复 passed（**永不静默 passed**）
        const j = mk('settled', { passed: true })
        jobs.set(j.id, j)
        adopted += 1
        results.push({ jobId: j.id, action: 'adopted', exitCode: 0 })
        note(j.id, 'recover:adopted')
        continue
      }
      const why = rec.state === 'settled'
        ? (!ctxSame ? 'build-context-changed' : (!rec.receipt ? 'settled-without-receipt' : (!contentMatches ? 'file-changed-since-run' : 'hash-not-clean')))
        : 'terminal-state-kept'
      const state = LEAN_JOB_STATES.indexOf(rec.state) === -1 ? 'interrupted' : rec.state
      const j = mk(state, { reason: rec.reason || why, kept: true })
      jobs.set(j.id, j)
      left += 1
      results.push({ jobId: j.id, action: 'kept', state: j.state, why })
      note(j.id, 'recover:kept', { why })
      // If we REFUSED to adopt a mirror that claimed `passed`, the durable record must stop claiming it too:
      // memory and disk disagreeing about "passed" is exactly the ambiguity this face forbids.
      if (rec.state === 'settled' && rec.passed === true) {
        const downgraded = Object.assign({}, rec, { state, passed: false, reason: j.reason, settledAt: j.endedAt })
        jobs.get(j.id).mirror = downgraded
        await mirrorFor().write(j.id, downgraded)
      }
    }
    lastRecovery = { at: clock(), scanned, requeued, adopted, interrupted, left, corrupt }
    log('lean/jobs: recover scanned=' + scanned + ' requeued=' + requeued + ' adopted=' + adopted + ' interrupted=' + interrupted + ' kept=' + left + ' corrupt=' + corrupt)
    emit('lean/job-recovered', { scanned, requeued, adopted, interrupted, left, corrupt })
    if (requeued > 0) Promise.resolve().then(pump)
    return { ok: true, dir: listed.dir, scanned, requeued, adopted, interrupted, left, corrupt, results, lastRecovery }
  }

  /** Session teardown: a RUNNING job is ambiguous ⇒ `interrupted` (never passed). The child cannot be killed. */
  /**
   * ROUND 6 · jobId 级取消（v5r 的 Lean 面**没有**取消：`dispose` 只标 interrupted）。
   * 语义边界（与 v5r 的状态集保持一致，**不新增状态**）：取消 ⇒ `interrupted` ＋ `reason:'cancelled'`。
   * 拿到活 handle 时**真的 `terminate()`**（`terminated:true`）；拿不到就**具名**说明"无法终止，
   * 子进程最多活到它自己的单次预算"。取消同样**落镜像**，避免崩溃恢复把它当 running 重排（静默复活）。
   */
  const cancel = async (a) => {
    const args = a || {}
    const id = String(args.jobId || '').trim()
    const j = jobs.get(id)
    if (!j) return refuse('VMU_NOT_FOUND', '找不到 Lean 作业 ' + id, '先 list() 取 jobId')
    if (j.state !== 'running' && j.state !== 'queued') {
      return refuse('VMU_JOB_CANCELLED', '作业已结束，不能取消（state=' + j.state + '）', '取消只对 queued/running 生效')
    }
    let terminated = false
    const hadHandle = !!(j.handle && (typeof j.handle.terminate === 'function' || typeof j.handle.kill === 'function'))
    try {
      if (j.handle && typeof j.handle.terminate === 'function') { j.handle.terminate(); terminated = true }
      else if (j.handle && typeof j.handle.kill === 'function') { j.handle.kill(); terminated = true }
    } catch (e) { note(j.id, 'cancel:terminate-failed', { detail: String((e && e.message) || e) }) }
    const wasRunning = j.state === 'running'
    j.state = 'interrupted'
    j.endedAt = clock()
    j.reason = 'cancelled' + (args.reason ? (': ' + String(args.reason)) : '')
    j.terminated = terminated
    j.hadHandle = hadHandle
    j.cancelled = true
    note(j.id, 'interrupted:cancelled', { terminated, hadHandle })
    await writeMirror(j)
    emit('lean/job-cancelled', { jobId: j.id, terminated, hadHandle, wasRunning })
    pushNotice(j, '【形式化作业】' + j.id + '：已取消（' + (terminated ? '子进程已 terminate' : '无 handle ⇒ 无法 terminate，进程最多活到单次预算') + '）')
    Promise.resolve().then(pump)   // a queued slot just freed up
    return { ok: true, jobId: j.id, state: j.state, reason: j.reason, terminated, hadHandle, wasRunning,
      note: terminated ? '子进程已 terminate' : '无 handle ⇒ 无法 terminate；作业已标 interrupted（reason:cancelled）' }
  }

  const dispose = async () => {
    const touched = []
    let killed = 0
    for (const j of jobs.values()) {
      if (j.state !== 'running') continue
      // ROUND 6: a live handle is now attached during the run, so dispose CAN terminate (and counts it).
      let terminated = false
      try {
        if (j.handle && typeof j.handle.terminate === 'function') { j.handle.terminate(); terminated = true }
        else if (j.handle && typeof j.handle.kill === 'function') { j.handle.kill(); terminated = true }
      } catch (e) { note(j.id, 'dispose:terminate-failed', { detail: String((e && e.message) || e) }) }
      if (terminated) killed += 1
      j.state = 'interrupted'; j.endedAt = clock(); j.terminated = terminated; j.hadHandle = !!j.handle
      j.reason = terminated
        ? 'session disposed (child terminated via the live handle)'
        : 'session disposed (no live handle ⇒ the child can only be ended by its own budget)'
      touched.push(j.id)
      note(j.id, 'interrupted:dispose', { terminated })
      await writeMirror(j)
    }
    emit('lean/jobs-disposed', { interrupted: touched.length, killed })
    return { ok: true, interrupted: touched.length, killed, canTerminateChild: !!(spawnHandle || sawHandle), jobIds: touched.slice() }
  }

  // ── 归档（ROUND 131）：v5r 的 lean_archive / lean_read / lean_lib 三个动词 ────────────────────
  // 设计：**只引不复制** —— 归档登记的是【具名引用】（文件 ＋ 语句 ＋ 内容哈希 ＋ kind），
  // `read()` 每次都**回到源文件**读，并把当前哈希与登记时比对：不一致即具名拒（引用已失效 ⇒ 不返回旧内容）。
  // 由此"可复用"与"内容同一性"同时成立，且不存在两份会各自漂移的副本。
  const archived = new Map()

  const archive = async (a) => {
    const args = a || {}
    const name = String(args.name || '').trim()
    const kind = String(args.kind || 'def').trim()
    const file = String(args.file || '').trim()
    const statement = String(args.statement || '').trim()
    if (!name) return refuse('VMU_LEAN_ARCHIVE_NAME_REQUIRED', 'archive 需要 name（库中引用的名字）', '给一个稳定名字：read() 与 lib() 都用它')
    if (!file) return refuse('VMU_LEAN_FILE_REQUIRED', 'archive 需要 file（.lean 文件路径）', '归档只登记既有文件，不复制内容')
    if (ARCHIVE_KINDS.indexOf(kind) === -1) {
      return refuse('VMU_LEAN_KIND_UNKNOWN', '未知的归档 kind：' + kind + '（允许：' + ARCHIVE_KINDS.join('|') + '）', '用允许的 kind，或先显式扩展 ARCHIVE_KINDS')
    }
    if (archived.has(name)) {
      return refuse('VMU_LEAN_ARCHIVE_NAME_TAKEN', '归档名已被占用：' + name, '换名字，或先 lib() 查看既有条目（**不静默覆盖** ✗）')
    }
    const hash = await readHash(file)
    if (hash === undefined) return refuse('VMU_LEAN_FILE_UNREADABLE', '读不到要归档的 Lean 文件：' + file, '先写出 .lean 文件再归档')
    const entry = { name, kind, file, statement, hash, at: clock() }
    archived.set(name, entry)
    note('archive:' + name, kind)
    return { ok: true, name, kind, file, hash, statement, at: entry.at, count: archived.size }
  }

  const read = async (a) => {
    const args = a || {}
    const name = String(args.name || '').trim()
    const e = archived.get(name)
    if (!e) return refuse('VMU_LEAN_ARCHIVE_NOT_FOUND', '归档里没有 ' + name, '先用 lib() 列出条目')
    const now = await readHash(e.file)
    if (now === undefined) return refuse('VMU_LEAN_FILE_UNREADABLE', '归档引用的文件读不到：' + e.file, '文件被删或移走了：重建它，或重新 archive()')
    if (now !== e.hash) {
      return refuse('VMU_LEAN_ARCHIVE_DRIFT',
        '归档内容已变：' + name + '（登记 ' + e.hash.slice(0, 12) + '…，现在 ' + now.slice(0, 12) + '…）',
        '重新 archive() 登记新内容，或恢复原文件（只引不复制 ⇒ **不返回旧内容** ✗）')
    }
    let content
    try { content = String(await readFile(resolveFile(e.file), 'utf8')) } catch (err) {
      return refuse('VMU_LEAN_FILE_UNREADABLE', '读不到 ' + e.file, '检查权限或路径')
    }
    const truncated = content.length > ARCHIVE_READ_MAX
    return {
      ok: true, name, kind: e.kind, file: e.file, hash: e.hash, statement: e.statement, at: e.at,
      content: truncated ? content.slice(0, ARCHIVE_READ_MAX) : content,
      dropped: { bytes: truncated ? content.length - ARCHIVE_READ_MAX : 0 }, // 截断必计数（纪律）
    }
  }

  const lib = () => ({
    ok: true,
    count: archived.size,
    kinds: [...new Set([...archived.values()].map((e) => e.kind))].sort(),
    entries: [...archived.values()].map((e) => ({ name: e.name, kind: e.kind, file: e.file, hash: e.hash, statement: e.statement, at: e.at })),
  })

  return {
    submit, status, list, settle, archive, read, lib, keysUsed, policy, commandFor,
    jobsMaxParallel: () => cfg().leanJobsMaxParallel,
    // ROUND 4 (target 5 B): durable jobs; ROUND 6: jobId-level cancel
    recover, listMirrors, admission, dispose, cancel,
    mirrors: () => ({ ok: true, count: mirrorInst ? mirrorInst.records.size : 0, jobs: [...(mirrorInst ? mirrorInst.records.values() : [])].map((m) => ({ jobId: m.jobId, state: m.state, attempts: m.attempts, passed: m.passed === true, terminated: m.terminated === true, dedupeKey: m.dedupeKey || null })) }),
    // ROUND 4 · F44: the one-shot announcement queue (long-term query stays: status(jobId) / mirrors() / the mirror file)
    takeNoticesFor, notices: noticesView,
  }
}

export default createLeanFace
