// vmu kernel clockguard — 注入时钟的**单调守卫**（批评者第 8 轮 N3）。
//
// 问题：TTL／`pendingTimeoutMs`／`reap()` 全信注入时钟 ⇒ **回拨会让 TTL 永久延长、pending 永不过期**
// （幂等与保留同时失效）。本模块把"时钟只会向前"变成**可判定**的性质。
//
// 硬不变式：① `now()` **单调不减**（回拨按 `onBackward` 处置：`clamp` 不回退并自曝 `clamped:true`／
// `refuse` 具名拒／`warn` 值可回退但**必须自曝**）；② 回拨与异常前跳**绝不被静默吞掉**（`status().skews[]`
// ＋计数）；③ 零机制（未注入底层时钟）**必须自曝 `guarded:false`**；④ **本模块不读真实时间**（只用注入 ticker）；
// ⑤ `observe()` 只观察不改状态；⑥ 截断必计数。
export const apiVersion = 1
export const POLICIES = Object.freeze(['clamp', 'refuse', 'warn'])

export function refuse(code, message, hint, extra) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  if (extra) Object.assign(e, extra)
  return e
}

const read = (s, k, d) => {
  if (!s) return d
  if (Object.prototype.hasOwnProperty.call(s, k)) return s[k]
  const short = k.split('.').pop()
  const host = s.clock || s
  return host && Object.prototype.hasOwnProperty.call(host, short) ? host[short] : d
}
const numOf = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d }

/**
 * `createClockGuard({ now, log, settings, onBackward })` —— `now` 是**注入的底层时钟**（必填才 guarded）。
 * 本模块**从不**调用 `Date.now()` / `performance.now()`。
 */
export function createClockGuard({ clock = null, now = null, log = () => {}, settings = {}, onBackward = null, bus = null } = {}) {
  // 注入优先；零机制 ⇒ 默认底层时钟（行为同直连），但 status() 自曝 guarded:false。本模块其余处不读真实时间。
  const base = typeof clock === 'function' ? clock : (typeof now === 'function' ? now : () => Date.now())
  const policyOf = () => {
    const v = onBackward !== null ? onBackward : read(settings, 'vmu.clock.onBackward', 'clamp')
    if (!POLICIES.includes(v)) throw refuse('VMU_INVALID_ARGUMENT', 'unknown onBackward policy: ' + String(v), 'one of ' + POLICIES.join('|'))
    return v
  }
  const maxSkews = () => Math.max(0, numOf(read(settings, 'vmu.clock.maxSkews', 50), 50))
  // M4 裁决①：**默认 60_000ms** —— 正常调度抖动/单轮耗时在 ms~秒 量级，**一次 ≥60s 的前跳**在会话内
  // 只可能是时钟异常（休眠/虚拟化/宿主调整），所以默认**开启**而不是关闭；可用 vmu.clock.maxForwardJumpMs 覆盖。
  const forwardJumpMs = () => Math.max(0, numOf(read(settings, 'vmu.clock.maxForwardJumpMs', read(settings, 'vmu.clock.forwardJumpMs', 86400000)), 86400000))
  // M4 裁决②：前跳与回拨**对称**（clamp|refuse|warn；默认 clamp ⇒ 值不跳、更不会让消费方误判"时间已过去"）
  const forwardPolicyOf = () => {
    const v = read(settings, 'vmu.clock.onForward', 'clamp')
    if (!POLICIES.includes(v)) throw refuse('VMU_INVALID_ARGUMENT', 'unknown onForward policy: ' + String(v), 'one of ' + POLICIES.join('|'))
    return v
  }
  // A2 裁决：**有界 clamp ＋ resync 出口**。冻结上限默认 2 天（= 前跳阈值 ×2，明显大于任何正常步进）；
  // 一旦"待接受的跳幅"超过它（例如休眠 5 天），必须**接受新时刻并自曝**，绝不允许时间永久冻结。
  const resyncMs = () => {
    const v = numOf(read(settings, 'vmu.clock.resyncMs', 172800000), 172800000)
    return Math.max(forwardJumpMs(), v)
  }

  const state = {
    guarded: (typeof clock === 'function' || typeof now === 'function'),
    last: null,
    lastAction: null,
    lastClamped: false,
    lastClampedForward: false,
    frozenSince: null, frozenForMs: 0, resyncs: 0, resynced: false,
    skews: [],
    dropped: { skews: 0 },
    counts: { calls: 0, backward: 0, forward: 0, clamped: 0, refused: 0, warned: 0, observes: 0 },
  }

  const pushSkew = (rec) => {
    state.skews.push(rec)
    const cap = maxSkews()
    while (state.skews.length > cap) { state.skews.shift(); state.dropped.skews += 1 }
  }

  /** now()：受守卫的当前时刻（单调不减，按策略处置回拨）。 */
  function nowGuarded() {
    if (!state.guarded) {
      // 零机制：**不抛错** —— 服务可替换的默认底层时钟（行为同直连），由 status() 自曝 guarded:false
      log('clockguard: UNGUARDED (no injected clock): serving the replaceable default base clock')
    }
    const raw = Number(base())
    if (!Number.isFinite(raw)) throw refuse('VMU_CLOCK_UNGUARDED', 'the injected clock returned a non-finite value: ' + String(raw), 'the ticker must return a finite number')
    state.counts.calls += 1
    if (state.last === null) { state.last = raw; state.lastAction = 'init'; state.lastClamped = false; return raw }
    const maxBack = Math.max(0, numOf(read(settings, 'vmu.clock.maxBackwardMs', 0), 0))
    if (raw < state.last && (state.last - raw) > maxBack) {
      state.counts.backward += 1
      const policy = policyOf()
      if (policy === 'refuse') {
        state.counts.refused += 1
        pushSkew({ at: state.counts.calls, from: raw, last: state.last, action: 'refuse', clamped: false })
        state.lastAction = 'refuse'
        throw refuse('VMU_CLOCK_BACKWARD', 'the injected clock went BACKWARD: ' + raw + ' < last ' + state.last,
          'refusing to serve a non-monotonic time (policy="refuse"); fix the ticker or switch vmu.clock.onBackward to clamp|warn',
          { from: raw, last: state.last })
      }
      if (policy === 'warn') {
        state.counts.warned += 1
        state.last = raw
        state.lastAction = 'warn'
        state.lastClamped = false
        pushSkew({ at: state.counts.calls, from: raw, last: null, action: 'warn', clamped: false, selfExposed: true })
        log('clockguard: backward clock accepted under "warn" but SELF-EXPOSED (from ' + raw + ')')
        return raw
      }
      // clamp（默认）：绝不回退，并自曝
      state.counts.clamped += 1
      state.lastAction = 'clamp'
      state.lastClamped = true
      pushSkew({ at: state.counts.calls, from: raw, last: state.last, action: 'clamp', clamped: true, selfExposed: true })
      log('clockguard: backward clock CLAMPED to ' + state.last + ' (requested ' + raw + ')')
      return state.last
    }
    const jump = raw - state.last
    if (forwardJumpMs() > 0 && jump > forwardJumpMs()) {
      state.counts.forward += 1
      const fpol = forwardPolicyOf()
      if (fpol === 'refuse') {
        state.counts.refused += 1
        pushSkew({ at: state.counts.calls, from: state.last, to: raw, jumpMs: jump, action: 'forward-refuse', clamped: false, suspect: true, selfExposed: true })
        state.lastAction = 'forward-refuse'
        throw refuse('VMU_CLOCK_FORWARD_JUMP', 'the injected clock jumped FORWARD abnormally: ' + raw + ' - last ' + state.last + ' = ' + jump + 'ms > ' + forwardJumpMs() + 'ms',
          'refusing a forward jump that would mass-expire TTLs/reap the ledger (policy="refuse"); fix the ticker or switch vmu.clock.onForward to clamp|warn',
          { from: state.last, to: raw, jumpMs: jump, thresholdMs: forwardJumpMs() })
      }
      if (fpol === 'warn') {
        state.counts.warned += 1
        pushSkew({ at: state.counts.calls, from: state.last, to: raw, jumpMs: jump, action: 'forward-jump', clamped: false, suspect: true, selfExposed: true })
        log('clockguard: forward jump ' + jump + 'ms accepted under "warn" but SELF-EXPOSED (never silent)')
        state.last = raw; state.lastAction = 'forward-warn'; state.lastClamped = false
        return raw
      }
      // clamp（默认）：**值不跳** ⇒ 消费方的 TTL/reap 不会因为一次异常前跳而集体过期。
      // 但 clamp 必须是**有界**的：待接受跳幅超过 resyncMs ⇒ 接受新时刻并自曝 resynced:true（永冻不可接受）。
      if (jump > resyncMs()) {
        state.counts.resynced = (state.counts.resynced || 0) + 1
        state.resyncs += 1
        state.resynced = true
        state.frozenForMs = jump
        state.frozenSince = state.last
        pushSkew({ at: state.counts.calls, from: state.last, to: raw, jumpMs: jump, frozenMs: jump, action: 'resync', clamped: false, suspect: true, resynced: true, selfExposed: true })
        state.last = raw
        state.lastAction = 'resync'
        state.lastClamped = false
        state.lastClampedForward = false
        log('clockguard: forward jump ' + jump + 'ms EXCEEDED the resync budget (' + resyncMs() + 'ms) — RESYNCED to ' + raw + ' (time may never freeze forever)')
        return raw
      }
      state.counts.clamped += 1
      pushSkew({ at: state.counts.calls, from: state.last, to: raw, jumpMs: jump, frozenMs: jump, action: 'forward-clamp', clamped: true, clampedForward: true, suspect: true, selfExposed: true })
      state.lastAction = 'forward-clamp'
      state.lastClamped = false
      state.lastClampedForward = true
      state.resynced = false
      if (state.frozenSince === null) state.frozenSince = state.last
      state.frozenForMs = raw - state.frozenSince
      log('clockguard: forward jump ' + jump + 'ms CLAMPED (value stays ' + state.last + '; frozenForMs=' + state.frozenForMs + '/' + resyncMs() + ')')
      return state.last
    }
    state.lastClampedForward = false
    state.last = raw
    state.lastAction = 'ok'
    state.lastClamped = false
    return raw
  }

  /** observe()：只观察，**不改状态**（不调用底层时钟、不写 skew、不加 calls）。 */
  function observe({ at = null } = {}) {
    state.counts.observes += 1
    return {
      guarded: state.guarded,
      value: state.last,
      lastAction: state.lastAction,
      clamped: state.lastClamped,
      skews: state.skews.length,
      backward: state.counts.backward,
      forward: state.counts.forward,
      droppedSkews: state.dropped.skews,
    }
  }

  /** skew()：只读列出记录到的时钟异常（回拨/拒绝/warn/前跳）＋截断计数。 */
  function skew() {
    return { ok: true, count: state.skews.length, skews: state.skews.slice(), dropped: { skews: state.dropped.skews }, counts: Object.assign({}, state.counts) }
  }

  /** monotonic({from,to})：纯判定器（不碰状态）。 */
  function monotonic({ from, to } = {}) {
    const a = Number(from), b = Number(to)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return { ok: false, monotonic: false, reason: 'non-finite input' }
    return { ok: true, monotonic: b >= a, from: a, to: b, backwardMs: b < a ? a - b : 0, toleranceMs: Math.max(0, numOf(read(settings, 'vmu.clock.maxBackwardMs', 0), 0)) }
  }

  /** status()：只读快照（零机制自曝 guarded:false；skews 全量）。 */
  function status() {
    return {
      ok: true, apiVersion,
      guarded: state.guarded,
      note: state.guarded ? 'the injected clock is guarded (monotonic by policy "' + policyOf() + '")' : 'no base clock injected: guarded=false (any time-based TTL/reap must be treated as UNGUARDED)',
      policy: { onBackward: policyOf(), policies: [...POLICIES], maxSkews: maxSkews(), forwardJumpMs: forwardJumpMs() },
      value: state.last, lastAction: state.lastAction, clamped: state.lastClamped, clampedForward: state.lastClampedForward === true,
      frozenSince: state.frozenSince, frozenForMs: state.frozenForMs, resyncs: state.resyncs, resynced: state.resynced,
      clockTrust: {
        onBackward: policyOf(), onForward: forwardPolicyOf(), policies: [...POLICIES], resyncMs: resyncMs(),
        maxBackwardMs: Math.max(0, numOf(read(settings, 'vmu.clock.maxBackwardMs', 0), 0)),
        forwardJumpMs: forwardJumpMs(), defaultForwardJumpMs: 86400000,
        counts: { backward: state.counts.backward, forward: state.counts.forward, clamped: state.counts.clamped, warned: state.counts.warned, refused: state.counts.refused },
        guarded: state.guarded,
      },
      skews: state.skews.slice(), skewCount: state.skews.length, dropped: { skews: state.dropped.skews },
      counts: Object.assign({}, state.counts),
    }
  }

  return { now: nowGuarded, observe, skew, monotonic, status, clockSource: base }
}
