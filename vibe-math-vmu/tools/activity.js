// vibe-math-vmu/tools/activity.js — the activity-wait tool spec (task-24 / D-08 baseline A, v5r `vibe_v5_wait`).
//
// THE FACE ADDS NO POLICY OF ITS OWN. The interval, the refuse-vs-clamp choice, the waiter cap and the peer
// short-circuit all live in `kernel/activity.js` and are declared in settings; this file maps arguments onto
// `kernel.activity.wait(...)` and turns a named kernel refusal into a named tool refusal — never a crash, never a
// silent success (the same split as tools/chat.js and tools/panel.js).
//
// It is deliberately TWO actions: `wait` (the primitive v5r exposed) and `status` (so an operator can see whether a
// declared `vmu.activity.wakeOn` is really wired, how many waiters are live, and which keys were refused — the
// observability half of F52). It does NOT expose `notify`: waking waiters is what a committed state change does
// (through the declared wake hooks or a producer's own call), not something a member may assert — a member that
// wants activity produces it (a message, a task, a meeting), and the framework owns the notification.
export function makeActivitySpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.activity,
    description: 'vmu 活动等待面：action=wait|status（缺省 wait）。参数名以 docs/03 的行为准（`action`／`timeoutMs`／`why`／`me`），并兼容 v5r 拼写（`timeout_ms`／`reason`／`member`）。' +
      '★ wait 是**一次性、只看未来**的等待器：等待开始**之前**发生的活动绝不唤醒它（没有积压、不重放历史）；' +
      '第一条**之后**发生的已提交状态变化才唤醒，且一次通知只唤醒当前这一代（用完即注销）。' +
      'timeoutMs 取 v5r 区间 [10000, 3600000]（默认 vmu.activity.timeoutMs=30000）；越界按 vmu.activity.timeoutPolicy 具名拒（默认 refuse）或钳制（clamp）。' +
      '注入同伴接缝时，没有其他在活成员立即返回 noProgress:{reason:"no-active-peer"}，不空等、不烧 token。' +
      '超时 disposer 在成功／超时／abort 三个分支都由内核清理；被 abort 时一律以具名 VMU_ACTIVITY_ABORTED 拒绝，signal 的 reason 保留在 abortReason／cause（v5r 在 reason 是 Error 时原样 reject，但 DOMException 的数字型 code 会越过工具面变成无名码，故此处统一具名）。' +
      '醒后请**重新读取状态**（task/panel/chat 等）：本工具只报告"被唤醒/超时"。',
    parameters: {
      action: param('string', 'wait｜status（缺省 wait；docs/18 记的就是"status 默认/wait"，v5r 的 vibe_v5_wait 没有 action ⇒ 缺省即等待）', { enum: ['wait', 'status'] }),
      timeoutMs: param('number', 'wait：等待毫秒数（整数；区间 [10000, 3600000]，越界按 vmu.activity.timeoutPolicy 处置）。别名 timeout_ms（v5r 拼写）'),
      why: param('string', 'wait：等待理由（可选，入观测与日志）。别名 reason'),
      me: param('string', 'wait：等待者 id（只用于注入的同伴接缝；缺省＝不检查同伴）。别名 member'),
    },
    run: async ({ action = 'wait', timeoutMs: timeoutMsDirect, timeout_ms: timeoutMsSnake, me, member, why, reason } = {}, exec = null) => {
      try {
        const activity = kernel && kernel.activity
        if (!activity) {
          return refused('VMU_ENGINE_UNAVAILABLE', 'the activity primitive is not mounted in this kernel',
            'declare vmu.activity.* (or config.activity) so the face is wired')
        }
        if (action === 'status') return Object.assign({ ok: true, action }, activity.status())
        if (action !== 'wait') {
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action), 'the two actions are wait and status')
        }
        // The DOCUMENTED parameter names (docs/03: `action`, `timeoutMs`, `why`, `me`) are canonical; the v5r
        // spellings (`timeout_ms`, `reason`, `member`) are accepted as aliases so a ported v5r pack call works.
        const requested = timeoutMsDirect === undefined ? timeoutMsSnake : timeoutMsDirect
        const waiter = me === undefined ? member : me
        const because = why === undefined ? reason : why
        // The signal is the HOST tool context's, exactly as v5r passed `x.signal` (vibe-math-v5r.js:11149): a host
        // that cancels the turn must be able to end the wait, and the kernel does the rejecting.
        const signal = exec && exec.signal ? exec.signal : null
        const receipt = await activity.wait({ timeoutMs: requested, signal, member: waiter === undefined ? null : waiter, reason: because || '' })
        return Object.assign({ ok: true, action: 'wait' }, receipt)
      } catch (e) {
        const out = refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        // D3: a refusal keeps its evaluated scope across the face boundary. `refused` only carries the four
        // documented fields, so the scope is merged explicitly rather than dropped (the house noun is `enforced[]`).
        if (Array.isArray(e.enforced)) { out.enforced = e.enforced.slice(); out.enforcedScope = e.enforcedScope || 'evaluated-so-far' }
        return out
      }
    },
  }
}
