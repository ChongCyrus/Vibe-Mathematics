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
  const forwardJumpMs = () => Math.max(0, numOf(read(settings, 'vmu.clock.forwardJumpMs', 0), 0))

  const state = {
    guarded: (typeof clock === 'function' || typeof now === 'function'),
    last: null,
    lastAction: null,
    lastClamped: false,
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
      pushSkew({ at: state.counts.calls, from: state.last, to: raw, jumpMs: jump, action: 'suspect', clamped: false, selfExposed: true })
      log('clockguard: abnormal forward jump ' + jump + 'ms (recorded, never silent)')
    }
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
      value: state.last, lastAction: state.lastAction, clamped: state.lastClamped,
      skews: state.skews.slice(), skewCount: state.skews.length, dropped: { skews: state.dropped.skews },
      counts: Object.assign({}, state.counts),
    }
  }

  return { now: nowGuarded, observe, skew, monotonic, status, clockSource: base }
}
