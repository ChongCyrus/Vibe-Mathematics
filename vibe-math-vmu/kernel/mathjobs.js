// vibe-math-vmu — 数学作业与回执（09 卷回执／15 卷引擎与复现）：**服务化**的作业生命周期。
//
// 硬不变式：
//   ① `spawn` 是**注入接缝**：未注入 ⇒ 具名拒（**绝不假装跑过** ✗）；
//   ② 超时 ⇒ 共享模块码 MATH_TIMEOUT（**无 VMU_ 前缀**：03-§8 里就是这个名 ✓），**保留部分输出**并**报丢弃字节**（不静默截断 ✗）；
//   ③ 非零退出 ⇒ 共享模块码 MATH_NONZERO_EXIT，回执**保留退出码与 stderr 尾部** ✓；
//   ④ 回执必须含：引擎／argv 指纹／输入指纹／退出码／时长／输出指纹（**缺一 ⇒ 具名拒** ✗）；
//   ⑤ 随机作业必须带种子（`requireSeedForRandom` 默认 true ✗✓）；
//   ⑥ 并发／总量上限 ⇒ **计数式截断**（`droppedReceipts`／`droppedLog`／`droppedBytes` ✓）；
//   ⑦ 只走注入 `clock`（**不读真实时间** ✗）；⑧ 零机制：无引擎声明 ⇒ 提交即具名拒 ✓；⑨ `list/status` 纯读 ✓。
//
// 注入：`createMathJobs({ clock, log, settings, bus, spawn })`
//   · spawn —— `({ engine, argv, stdin, timeoutMs, env }) => { exitCode, stdout, stderr, timedOut?, signal? }`

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
])
const LOG_MAX = 200
const refuse = (code, message, hint) => ({ ok: false, code, message, hint })

export function createMathJobs(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  const emit = (ev) => { try { if (o.bus && typeof o.bus.emit === 'function') o.bus.emit(ev) } catch (e) { /* 广播不改结果 */ } }
  const spawn = o.spawn

  const cfg = () => {
    const n = (k, d) => { const v = Number(readKey(k)); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d }
    const enginesRaw = readKey('vmu.math.engines')
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
    }
  }
  const keysUsed = () => MATH_KEYS.slice()

  const jobs = new Map()
  const receipts = new Map()
  let seq = 0
  let droppedReceipts = 0
  let droppedLog = 0
  const trail = []
  const note = (what, id, extra) => {
    trail.push(Object.assign({ at: clock(), what, id: String(id || '') }, extra || {}))
    if (trail.length > LOG_MAX) { trail.shift(); droppedLog += 1 }
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

  const submit = async (a) => {
    const args = a || {}
    const c = cfg()
    // ⑧ 零机制：无引擎声明（或计算面关闭）⇒ 提交即具名拒
    if (c.computation === 'off') return refuse('VMU_MATH_UNSUPPORTED_OP', '数学计算面已关闭（vmu.math.computation=off）', '打开它，或不要提交作业')
    const engine = String(args.engine || '').trim()
    if (!engine) return refuse('VMU_MATH_INVALID_INPUT', 'submit 需要 engine', '声明引擎名（见 vmu.math.engines）')
    if (c.engines.length === 0) return refuse('VMU_MATH_UNSUPPORTED_OP', '未声明任何引擎（vmu.math.engines 为空）', '先在设置里声明引擎；零机制不允许"猜一个引擎"')
    if (c.engines.indexOf(engine) === -1) return refuse('VMU_MATH_UNSUPPORTED_OP', '引擎未声明：' + engine, '已声明：' + c.engines.join('、'))
    if (c.mode === 'typed' && String(args.shell) === 'true') return refuse('VMU_MATH_SANDBOX_DENIED', 'typed 模式拒绝 shell（vmu.math.mode=typed）', '用 argv 传参，不要走 shell')
    if (c.maxJobs > 0 && jobs.size >= c.maxJobs) return refuse('VMU_MATH_RESOURCE_LIMIT', '作业总量已达上限 ' + c.maxJobs, '清掉旧作业或调大 vmu.math.maxJobs')
    const isRandom = args.random === true || args.seed !== undefined
    const seed = (args.seed === undefined || args.seed === null || args.seed === '') ? '' : String(args.seed)
    // ⑤ 随机作业必须有种子（默认 requireSeedForRandom=true）
    if (isRandom && !seed && c.requireSeedForRandom) return refuse('VMU_MATH_SEED_REQUIRED', '随机作业缺种子（requireSeedForRandom=true）', '给 seed；不许写"应该能复现"')
    // ① spawn 未注入 ⇒ 具名拒（**绝不假装跑过**）
    if (typeof spawn !== 'function') return refuse('VMU_EXTERNAL_UNAVAILABLE', 'spawn 接缝未注入（本机未接真引擎）', '由宿主注入 spawn；本面绝不假跑 ✗')

    const argv = Array.isArray(args.argv) ? args.argv.map(String) : []
    const stdin = String(args.stdin === undefined ? '' : args.stdin)
    const timeoutMs = Number(args.timeoutMs) > 0 ? Math.floor(Number(args.timeoutMs)) : c.timeoutMs
    const id = 'mj-' + (++seq)
    const job = { id, engine, argv: argv.slice(), seed, random: isRandom, state: 'running', startedAt: clock(), endedAt: 0, timeoutMs }
    jobs.set(id, job)
    note('math.submit', id)
    emit({ type: 'math.submit', id, engine })
    try {
      // 并发上限：超出 ⇒ **排队等待**（计数在 receipt 的 queueWaitMs 里；不静默丢弃 ✓）
      const waitStart = clock()
      while (running() > c.maxParallel) await Promise.resolve()
      job.queueWaitMs = clock() - waitStart
      const out = await spawn({ engine, argv: argv.slice(), stdin, timeoutMs, env: { denyNetwork: c.denyNetwork, workspaceOnly: c.workspaceOnly } })
      const r = out || {}
      job.endedAt = clock()
      const so = tail(r.stdout, c.captureStdoutBytes)
      const se = tail(r.stderr, c.captureStdoutBytes)
      const timedOut = r.timedOut === true
      const exitCode = timedOut ? null : Number(r.exitCode)
      const stderrTail = se.text.split('\n').slice(-5).join('\n')
      // ④ 回执完整性（缺一 ⇒ 具名拒）
      const receipt = {
        jobId: id, engine, argvFingerprint: fp(argv), inputFingerprint: fp({ stdin, seed, env: r.env }), outputFingerprint: fp({ stdout: so.text, stderr: se.text }),
        exitCode, durationMs: job.endedAt - job.startedAt, timedOut, seed,
        stdout: so.text, stderr: se.text, stderrTail, droppedBytes: so.droppedBytes + se.droppedBytes,
      }
      const missing = ['engine', 'argvFingerprint', 'inputFingerprint', 'exitCode', 'durationMs', 'outputFingerprint'].filter((k) => receipt[k] === undefined || receipt[k] === '')
      if (missing.length) { job.state = 'failed'; return refuse('VMU_FORMAL_REPRO_INCOMPLETE', '回执不完整：缺 ' + missing.join('、'), '回执必含引擎/argv 指纹/输入指纹/退出码/时长/输出指纹') }
      receipts.set(id, receipt)
      if (receipts.size > c.keepReceipts) { const oldest = [...receipts.keys()][0]; receipts.delete(oldest); droppedReceipts += 1 }
      if (timedOut) {
        job.state = 'timeout'
        note('math.timeout', id, { droppedBytes: receipt.droppedBytes })
        // INTEGRATOR RULING: the SHARED module code is the one already registered in 03-§8 (`MATH_TIMEOUT`,
        // no VMU_ prefix). One meaning, one name - inventing a VMU_-prefixed twin would be the same defect
        // as documenting two names for one knob.
        return Object.assign(refuse('MATH_TIMEOUT', '作业超时（>' + timeoutMs + ' ms）：已保留部分输出', '见 receipt.stdout/stderr 尾部；丢弃字节已计数 ' + receipt.droppedBytes), { receipt })
      }
      if (exitCode !== 0) {
        job.state = 'failed'
        note('math.nonzero', id, { exitCode })
        return Object.assign(refuse('MATH_NONZERO_EXIT', '引擎非零退出：' + exitCode, 'stderr 尾部：' + stderrTail.slice(0, 200)), { receipt })
      }
      job.state = 'done'
      note('math.done', id)
      return { ok: true, jobId: id, receipt }
    } catch (e) {
      job.state = 'failed'; job.endedAt = clock()
      return refuse('VMU_EXTERNAL_UNAVAILABLE', 'spawn 抛出：' + String((e && e.message) || e), '宿主接缝异常；本面不假装成功')
    }
  }

  const status = (q) => {
    const id = String((q && (q.jobId || q.id)) || '')
    const j = jobs.get(id)
    if (!j) return refuse('VMU_NOT_FOUND', '找不到作业 ' + id, '先 list() 取 id')
    return { ok: true, job: { id: j.id, engine: j.engine, state: j.state, startedAt: j.startedAt, endedAt: j.endedAt, timeoutMs: j.timeoutMs, hasReceipt: receipts.has(j.id) } }
  }
  const cancel = (q) => {
    const id = String((q && q.jobId) || '')
    const j = jobs.get(id)
    if (!j) return refuse('VMU_NOT_FOUND', '找不到作业 ' + id, '先 list() 取 id')
    if (j.state !== 'running') return refuse('VMU_JOB_CANCELLED', '作业已结束，不能取消（state=' + j.state + '）', '取消只对 running 生效')
    j.state = 'cancelled'
    note('math.cancel', id, { reason: String((q && q.reason) || '') })
    return { ok: true, jobId: id, state: j.state, reason: String((q && q.reason) || '') }
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
  const summary = () => ({ ok: true, count: jobs.size, running: running(), receipts: receipts.size, droppedReceipts, droppedLog, engines: cfg().engines.slice(), timeoutMs: cfg().timeoutMs })

  return { submit, status, cancel, receipt, list, statusAll: summary, checkReceipt, keysUsed, config: cfg, trail: () => trail.slice() }
}

export default createMathJobs
