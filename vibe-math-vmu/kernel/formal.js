// vibe-math-vmu — 形式化面（09 卷）：把"证明尝试"变成**可点名的检查结果**。
//
// 硬不变式：
//   ① `spawn` 是**注入接缝**：未注入 ⇒ 具名拒（**不假装编译过** ✗）；
//   ② `sorry` 出现 ⇒ **默认拒**（`VMU_FORMAL_SORRY_FOUND`，**点名行/列** ✓）；显式 `allowSorry` 才放行且**自曝** ✓；
//   ③ 白名单外公理 ⇒ 拒（`VMU_FORMAL_AXIOM_UNTRUSTED`，**点名公理** ✓）；
//   ④ **编译失败 ≠ 命题为假**：回执**明说**"编译失败，未判定真假"，`verdict='undecided'`（不得暗示否定 ✗）；
//   ⑤ 复现：同 argv/env 指纹；不一致 ⇒ `VMU_MATH_REPRO_MISMATCH` 并**给差异** ✓；
//   ⑥ 截断必计数（`droppedBytes`／`droppedLog`／`droppedArtifacts` ✓）；⑦ 注入时钟（不读真实时间 ✗）；
//   ⑧ 零机制不崩；⑨ `list/status/axioms/sorryReport/artifacts` **只读** ✓。
//
// 注入：`createFormal({ clock, log, settings, bus, spawn, library })`
//   · spawn —— `({ command, args, cwd, stdin, timeoutMs }) => { exitCode, stdout, stderr, timedOut? }`

export const FORMAL_KEYS = Object.freeze([
  'vmu.math.leanCommand',
  'vmu.math.leanArgs',
  'vmu.math.compileTimeoutMs',
  'vmu.math.leanTimeoutMs',
  'vmu.math.leanAsync',
  'vmu.math.leanSearchPaths',
  'vmu.formal.axiomWhitelist',
  'vmu.formal.allowSorry',
  'vmu.formal.requireArtifacts',
  'vmu.formal.maxArtifacts',
  'vmu.formal.maxSourceBytes',
])
const LOG_MAX = 200
const refuse = (code, message, hint) => ({ ok: false, code, message, hint })

export function createFormal(opts) {
  const o = opts || {}
  const readKey = (k) => (o.settings && typeof o.settings.get === 'function' ? o.settings.get(k) : (o.settings || {})[k])
  const clock = typeof o.clock === 'function' ? o.clock : () => 0
  const log = typeof o.log === 'function' ? o.log : () => {}
  const emit = (ev) => { try { if (o.bus && typeof o.bus.emit === 'function') o.bus.emit(ev) } catch (e) { /* 广播不改结果 */ } }
  const spawn = o.spawn

  const cfg = () => {
    const n = (k, d) => { const v = Number(readKey(k)); return Number.isFinite(v) && v >= 0 ? Math.floor(v) : d }
    const rawWl = readKey('vmu.formal.axiomWhitelist')
    const rawPaths = readKey('vmu.math.leanSearchPaths')
    const searchPaths = []
    for (const p of (Array.isArray(rawPaths) ? rawPaths : [])) { const s = String(p || '').trim(); if (s && searchPaths.indexOf(s) === -1) searchPaths.push(s) }
    return {
      leanCommand: String(readKey('vmu.math.leanCommand') || 'lean'),
      leanArgs: Array.isArray(readKey('vmu.math.leanArgs')) ? readKey('vmu.math.leanArgs').map(String) : [],
      timeoutMs: n('vmu.math.compileTimeoutMs', 0) || n('vmu.math.leanTimeoutMs', 120000),
      leanAsync: readKey('vmu.math.leanAsync') !== false,
      searchPaths,
      axiomWhitelist: Array.isArray(rawWl) ? rawWl.map(String) : ['propext', 'Classical.choice', 'Quot.sound'],
      allowSorry: readKey('vmu.formal.allowSorry') === true,       // 默认 false ✗✓
      requireArtifacts: readKey('vmu.formal.requireArtifacts') !== false,
      maxArtifacts: n('vmu.formal.maxArtifacts', 20),
      maxSourceBytes: n('vmu.formal.maxSourceBytes', 200000),
    }
  }
  const keysUsed = () => FORMAL_KEYS.slice()

  const notes = new Map()
  const artifacts = new Map()
  let seq = 0
  let droppedLog = 0
  let droppedArtifacts = 0
  const trail = []
  const note = (what, id, extra) => {
    trail.push(Object.assign({ at: clock(), what, id: String(id || '') }, extra || {}))
    if (trail.length > LOG_MAX) { trail.shift(); droppedLog += 1 }
  }
  const fp = (x) => { const s = typeof x === 'string' ? x : JSON.stringify(x); let h = 0; for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0; return 'fp:' + h.toString(16) }

  /** `sorry` 位置（行/列，1 基）—— **点名位置** 的依据 ✓。 */
  const sorryPositions = (src) => {
    const out = []
    const lines = String(src || '').split('\n')
    for (let i = 0; i < lines.length; i += 1) {
      let idx = lines[i].indexOf('sorry')
      while (idx !== -1) { out.push({ line: i + 1, col: idx + 1 }); idx = lines[i].indexOf('sorry', idx + 1) }
    }
    return out
  }
  /** 公理声明（行首 `axiom <name>` 或 `axiom <name> :`）—— 白名单检查的依据 ✓。 */
  const axiomDecls = (src) => {
    const out = []
    const res = String(src || '').matchAll(/^[ \t]*axiom[ \t]+([A-Za-z0-9_.']+)/gm)
    for (const m of res) out.push(m[1])
    return out
  }

  const check = (a) => {
    const args = a || {}
    const c = cfg()
    const statement = String(args.statement || '').trim()
    const proof = String(args.proof || '')
    if (!statement || !proof.trim()) return refuse('VMU_MATH_INVALID_INPUT', 'check 需要 statement 与 proof', '两者必填：命题原文与证明脚本')
    // ① 接缝未注入 ⇒ 具名拒（**不假装编译过**）
    if (typeof spawn !== 'function') return refuse('VMU_EXTERNAL_UNAVAILABLE', 'spawn 接缝未注入（未接真 Lean）', '由宿主注入 spawn；本面绝不假跑 ✗')
    // ⑥ 截断必计数
    const bytes = Buffer.byteLength(proof, 'utf8')
    let src = proof; let droppedBytes = 0
    if (c.maxSourceBytes > 0 && bytes > c.maxSourceBytes) {
      src = proof.slice(0, c.maxSourceBytes)
      droppedBytes = bytes - Buffer.byteLength(src, 'utf8')
    }
    const sorry = sorryPositions(src)
    const allowSorry = args.allowSorry === true || c.allowSorry === true
    // ② sorry 默认拒 ＋ 点名位置
    if (sorry.length && !allowSorry) {
      return refuse('VMU_FORMAL_SORRY_FOUND', '检出 sorry（' + sorry.length + ' 处）：' + sorry.map((p) => p.line + ':' + p.col).join('、'),
        '把 sorry 补成真证明；确要放行须显式 allowSorry（且会被自曝 ✗）')
    }
    // ③ 白名单外公理 ⇒ 拒 ＋ 点名公理
    const decls = axiomDecls(src).concat(Array.isArray(args.axioms) ? args.axioms.map(String) : [])
    const untrusted = decls.filter((x) => c.axiomWhitelist.indexOf(x) === -1)
    if (untrusted.length) {
      return refuse('VMU_FORMAL_AXIOM_UNTRUSTED', '公理不在白名单：' + untrusted.join('、'),
        '白名单：' + c.axiomWhitelist.join('、') + '；请补证明或先登记该公理')
    }
    // 组装 Lean 调用（**去重后的 searchPaths 在自动根之前** ✓）
    const args2 = []
    for (const p of c.searchPaths) args2.push('-R', p)
    for (const x of c.leanArgs) args2.push(x)
    args2.push('--stdin')
    const argvFingerprint = fp([c.leanCommand].concat(args2))
    const inputFingerprint = fp({ statement, proof: src, seed: '' })
    const startedAt = clock()
    let out
    try { out = spawn({ command: c.leanCommand, args: args2, cwd: '.', stdin: src, timeoutMs: c.timeoutMs }) } catch (e) {
      return refuse('VMU_EXTERNAL_UNAVAILABLE', 'spawn 抛出：' + String((e && e.message) || e), '宿主接缝异常；本面不假装成功')
    }
    const r = out || {}
    const endedAt = clock()
    const timedOut = r.timedOut === true
    const exitCode = timedOut ? null : Number(r.exitCode)
    const receipt = {
      id: 'fm-' + (++seq), statement, engine: c.leanCommand, argvFingerprint, inputFingerprint,
      exitCode, durationMs: endedAt - startedAt, timedOut,
      outputFingerprint: fp({ stdout: String(r.stdout || ''), stderr: String(r.stderr || '') }),
      compileOk: !timedOut && exitCode === 0,
      verdict: (!timedOut && exitCode === 0) ? 'checked' : 'undecided',   // ④ 编译失败**不判假** ✓
      allowedSorry: !!(sorry.length && allowSorry),
      sorryPositions: sorry.slice(),
      axiomDecls: decls.slice(),
      droppedBytes,
      note: (!timedOut && exitCode === 0)
        ? '编译通过（这是编译结果，不是数学真值；真值仍由判定流程决定）'
        : (timedOut ? '超时：**未判定真假** ✓' : '**编译失败，未判定真假**（编译失败 ≠ 命题为假 ✗）'),
    }
    notes.set(receipt.id, receipt)
    const arts = [{ id: receipt.id + '-stdout', bytes: Buffer.byteLength(String(r.stdout || ''), 'utf8') }]
    artifacts.set(receipt.id, arts)
    if (artifacts.size > c.maxArtifacts) { const oldest = [...artifacts.keys()][0]; artifacts.delete(oldest); droppedArtifacts += 1 }
    note('formal.check', receipt.id, { compileOk: receipt.compileOk, droppedBytes })
    emit({ type: 'formal.check', id: receipt.id, compileOk: receipt.compileOk })
    // INTEGRATOR RULING: the shared module code is MATH_TIMEOUT (no VMU_ prefix) - that is the name 03-§8
    // registers, and a VMU_-prefixed twin would be two names for one meaning.
    if (timedOut) return Object.assign(refuse('MATH_TIMEOUT', 'Lean 编译超时（>' + c.timeoutMs + ' ms）⇒ **未判定真假**', '调大 compileTimeoutMs'), { receipt })
    if (exitCode !== 0) {
      return Object.assign(refuse('VMU_LEAN_COMPILE_FAILED', 'Lean 编译失败（exit ' + exitCode + '）⇒ **未判定真假**（编译失败 ≠ 命题为假 ✗）', '见回执 stderr；修证明或换路线'), { receipt })
    }
    return { ok: true, receipt, sorrySelfReported: receipt.allowedSorry ? receipt.sorryPositions : [] }
  }

  const axioms = (q) => {
    const r = notes.get(String((q && q.id) || ''))
    if (!r) return refuse('VMU_FORMAL_NOT_FOUND', '找不到形式化记录 ' + String((q && q.id) || ''), '先 check() 取 id')
    return { ok: true, id: r.id, axioms: r.axiomDecls.slice(), whitelist: cfg().axiomWhitelist.slice() }
  }
  const sorryReport = (q) => {
    const r = notes.get(String((q && q.id) || ''))
    if (!r) return refuse('VMU_FORMAL_NOT_FOUND', '找不到形式化记录 ' + String((q && q.id) || ''), '先 check() 取 id')
    return { ok: true, id: r.id, positions: r.sorryPositions.slice(), allowed: r.allowedSorry }
  }
  const artifactsOf = (q) => {
    const id = String((q && q.id) || '')
    const list = artifacts.get(id)
    if (!list) return refuse('VMU_FORMAL_NOT_FOUND', '找不到产物 ' + id, '先 check() 取 id')
    return { ok: true, id, count: list.length, droppedArtifacts, artifacts: list.slice() }
  }
  /** ⑤ 复现：同 argv/env 指纹；不一致 ⇒ `VMU_MATH_REPRO_MISMATCH` ＋ **差异** ✓。 */
  const reproduce = (q) => {
    const id = String((q && q.id) || '')
    const r = notes.get(id)
    if (!r) return refuse('VMU_FORMAL_NOT_FOUND', '找不到形式化记录 ' + id, '先 check() 取 id')
    if (typeof spawn !== 'function') return refuse('VMU_EXTERNAL_UNAVAILABLE', 'spawn 接缝未注入；无法复现', '由宿主注入 spawn')
    const c = cfg()
    const args2 = []
    for (const p of c.searchPaths) args2.push('-R', p)
    for (const x of c.leanArgs) args2.push(x)
    args2.push('--stdin')
    const nowFp = fp([c.leanCommand].concat(args2))
    const diffs = []
    if (nowFp !== r.argvFingerprint) diffs.push({ member: 'argvFingerprint', expected: r.argvFingerprint, actual: nowFp })
    const out = spawn({ command: c.leanCommand, args: args2, cwd: '.', stdin: '(reproduce)', timeoutMs: c.timeoutMs }) || {}
    const nowExit = out.timedOut === true ? null : Number(out.exitCode)
    if (nowExit !== r.exitCode) diffs.push({ member: 'exitCode', expected: r.exitCode, actual: nowExit })
    if (diffs.length) {
      return Object.assign(refuse('VMU_MATH_REPRO_MISMATCH', '复现不一致：' + diffs.map((d) => d.member).join('、'), '见 diffs；同 argv/env 指纹才可复现'), { diffs })
    }
    return { ok: true, id, matched: true, diffs: [] }
  }

  const list = () => ({ ok: true, count: notes.size, dropped: droppedLog + droppedArtifacts, records: [...notes.values()].map((r) => ({ id: r.id, compileOk: r.compileOk, verdict: r.verdict, allowedSorry: r.allowedSorry })) })
  const status = () => ({ ok: true, count: notes.size, droppedLog, droppedArtifacts, allowSorry: cfg().allowSorry, axiomWhitelist: cfg().axiomWhitelist.slice() })

  return { check, axioms, sorryReport, artifacts: artifactsOf, reproduce, list, status, keysUsed, config: cfg, trail: () => trail.slice() }
}

export default createFormal
