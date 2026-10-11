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
// 依赖注入：`createLeanFace({ settings, spawn, root, clock, log })`。
//   · settings —— 读值接缝：`settings.get(key)` 优先，退回 `settings[key]`（**真读值**才算接线）；
//   · spawn    —— 执行接缝：`spawn({ command, args, cwd, timeoutMs })` ⇒
//                 `{ exitCode, stdout?, stderr?, timedOut? }`（本机未跑真机 ⇒ Host 由 Lead 接线）；
//   · root     —— 库根（文件路径与 `-R <root>` 的基准）；
//   · clock    —— `() => ms`（可注入，便于测试）；
//   · log      —— 可选 `(line) => void`。
//
// 拒绝一律 `VMU_*` ＋ `hint`；截断/丢弃必须计数（见 `view()` 的 `dropped`）。

import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export const LEAN_KEYS = Object.freeze([
  'vmu.math.formalVerify',
  'vmu.math.leanCommand',
  'vmu.math.leanArgs',
  'vmu.math.leanTimeoutMs',
  'vmu.math.leanAsync',
  'vmu.math.leanInitiative',
  'vmu.math.leanSearchPaths',
  'vmu.math.leanJobsMaxParallel',
])

export const LEAN_JOB_LOG_MAX = 200 // 事件日志上限；超出即 count 丢弃（不静默）

/**
 * ROUND 131 — 归档允许的 kind。v5r 的 `lean_archive` 把 kind="def" 的可复用定义送进词汇表；这里把同一族
 * 显式枚举，未知 kind **具名拒**（不猜、不放行）。
 */
export const ARCHIVE_KINDS = Object.freeze(['def', 'lemma', 'theorem', 'assumption'])

/** `read()` 一次返回的字节上限；超出即**计数**截断（不静默）。 */
export const ARCHIVE_READ_MAX = 200000

function refuse(code, message, hint) {
  return { ok: false, code, message, hint }
}

export function createLeanFace(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const spawn = o.spawn
  const root = String(o.root || '.')
  const clock = typeof o.clock === 'function' ? o.clock : () => Date.now()
  const log = typeof o.log === 'function' ? o.log : () => {}

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
    return { formalVerify, leanCommand, leanArgs, leanTimeoutMs, leanAsync, leanInitiative, leanJobsMaxParallel, searchPaths }
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
  let seq = 0
  let droppedEvents = 0
  const events = []
  const note = (id, what) => {
    events.push({ at: clock(), id, what })
    if (events.length > LEAN_JOB_LOG_MAX) { events.shift(); droppedEvents += 1 }
  }

  const readHash = async (file) => {
    try {
      const buf = await readFile(file)
      return createHash('sha256').update(buf).digest('hex')
    } catch (e) {
      return undefined // 读不到 ⇒ 由调用处具名拒（不静默当"未变"）
    }
  }

  const view = (j) => ({
    id: j.id, state: j.state, file: j.file, statement: j.statement,
    exitCode: j.exitCode, hashUnchanged: j.hashUnchanged, passed: j.passed === true,
    startedAt: j.startedAt, endedAt: j.endedAt,
    dropped: { events: droppedEvents }, // 截断/丢弃必计数（纪律）
  })

  const settle = async (id) => {
    const j = jobs.get(String(id))
    if (!j) return refuse('VMU_LEAN_NOT_FOUND', '找不到 Lean 作业 ' + String(id), '先用 list() 取 id；作业只存在于本次会话内存')
    if (j.promise) { try { await j.promise } catch (e) { /* state 已记录 */ } }
    if (j.state !== 'settled' && j.state !== 'failed') {
      return refuse('VMU_LEAN_NOT_SETTLED', '作业 ' + j.id + ' 尚未结算（state=' + j.state + '）', '等待 running/queued 结束后再 settle()')
    }
    return {
      ok: true, passed: j.passed === true, exitCode: j.exitCode,
      hashUnchanged: j.hashUnchanged, receipt: j.receipt,
    }
  }

  const runOne = async (j) => {
    j.state = 'running'
    j.startedAt = clock()
    note(j.id, 'running')
    const before = await readHash(j.file)
    if (before === undefined) {
      j.state = 'failed'; j.endedAt = clock()
      j.receipt = refuse('VMU_LEAN_FILE_UNREADABLE', '读不到 Lean 产物文件：' + j.file, '先写出 .lean 文件；本面只编译既有文件')
      note(j.id, 'failed:unreadable'); return
    }
    const cmd = commandFor(j.file)
    let out
    try {
      out = await spawn(cmd)
    } catch (e) {
      j.state = 'failed'; j.endedAt = clock()
      j.receipt = refuse('VMU_LEAN_SPAWN_FAILED', 'Lean 起不来：' + String((e && e.message) || e), '检查 `' + cmd.command + '` 是否在 PATH（Host 负责真机探测）')
      note(j.id, 'failed:spawn'); return
    }
    const r = out || {}
    if (r.timedOut) {
      j.state = 'failed'; j.endedAt = clock()
      j.receipt = refuse('VMU_LEAN_TIMEOUT', 'Lean 超过单次预算 ' + cmd.timeoutMs + ' ms', '调大 vmu.math.leanTimeoutMs 或切小目标')
      note(j.id, 'failed:timeout'); return
    }
    const exitCode = Number(r.exitCode)
    const after = await readHash(j.file)
    const hashUnchanged = before !== undefined && after !== undefined && before === after
    j.exitCode = exitCode
    j.hashUnchanged = hashUnchanged
    // **只有退出 0 且哈希未变** ⇒ passed（其余一律 failed）
    j.passed = exitCode === 0 && hashUnchanged === true
    j.state = j.passed ? 'settled' : 'failed'
    j.endedAt = clock()
    j.receipt = j.passed
      ? { ok: true, passed: true, exitCode, hashUnchanged: true, stdout: String(r.stdout || '').slice(0, 4000) }
      : refuse(exitCode === 0 ? 'VMU_LEAN_HASH_CHANGED' : 'VMU_LEAN_EXIT_NONZERO',
        exitCode === 0 ? '编译期间文件内容已变 ⇒ 结果不算 passed（hash 变了）' : 'Lean 退出码 ' + exitCode,
        exitCode === 0 ? '编译后不要再改文件；重跑一次' : '看 stdout/stderr 修证明；本面不猜结论')
    note(j.id, j.passed ? 'settled:passed' : 'failed:' + (j.receipt && j.receipt.code))
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
      j.promise = runOne(j).catch((e) => {
        j.state = 'failed'; j.endedAt = clock()
        j.receipt = refuse('VMU_LEAN_SPAWN_FAILED', 'Lean 作业异常：' + String((e && e.message) || e), '见 Host 日志')
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
    const id = 'lean-' + (++seq)
    const j = { id, statement, file, state: 'queued', exitCode: undefined, hashUnchanged: undefined, passed: undefined, startedAt: 0, endedAt: 0, receipt: undefined, promise: undefined }
    jobs.set(id, j); order.push(id)
    note(id, 'queued')
    if (c.leanAsync) { Promise.resolve().then(pump); return { ok: true, id, state: 'queued' } }
    // 同步路径：**等待本次结算**（不影响其他作业；leanAsync=false ⇒ 调用方拿到终态）
    await runOne(j)
    return { ok: true, id, state: j.state, sync: true }
  }

  const status = (id) => {
    const j = jobs.get(String(id))
    if (!j) return refuse('VMU_LEAN_NOT_FOUND', '找不到 Lean 作业 ' + String(id), '先用 list() 取 id')
    return { ok: true, job: view(j) }
  }
  const list = () => ({ ok: true, count: order.length, droppedEvents, jobs: order.map((id) => view(jobs.get(id))) })

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
    try { content = String(await readFile(e.file, 'utf8')) } catch (err) {
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

  return { submit, status, list, settle, archive, read, lib, keysUsed, policy, commandFor, jobsMaxParallel: () => cfg().leanJobsMaxParallel }
}

export default createLeanFace
