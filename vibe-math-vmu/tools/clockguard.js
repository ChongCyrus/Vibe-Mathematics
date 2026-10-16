// vibe-math-vmu/tools/clockguard.js — the clockguard tool spec (round 541). One module plus one line in the host.
export function makeClockguardSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.clockguard,
    description: 'vmu 时钟守卫面（★ **(g) 控制流** ✓）：action=now|observe|skew|monotonic|status|clockSource。★ 回退、跳变与钳制都由内核服务强制（★ 策略 `clamp` ✓ —— **倒流不会被静默接受** ✗）；本工具只做**寻址与调用**，不复制任何策略。',
    parameters: {
      action: param('string', 'now｜observe｜skew｜monotonic｜status｜clockSource', { required: true,
        enum: ['now','observe','skew','monotonic','status','clockSource'] }),
      // ROUND 4/256 (task-204 FIX #2): THE DECLARED SCHEMA MUST MATCH THE KERNEL SIGNATURES THIS TOOL CALLS.
      // It used to declare ONE `value` and pass it to BOTH `observe({ at })` and `monotonic({ from, to })`:
      // `observe` dropped it (its parameter is `at`), and `monotonic` read `undefined` endpoints and answered
      // `{ok:false, reason:"non-finite input"}` — i.e. its SUCCESS BRANCH WAS UNREACHABLE through this tool.
      at: param('number', 'observe 的观测时刻（ms，可选；不传 ⇒ 只报最近状态。★ 本模块不读真实时间 —— 时刻必须由调用方给）'),
      from: param('number', 'monotonic 的起点（monotonic 必填）'),
      to: param('number', 'monotonic 的终点（monotonic 必填）'),
    },
    run: async ({ action, at, from, to } = {}) => {
      try {
        const clockguard = kernel.clockguard
        if (action === 'now') return Object.assign({ ok: true, action }, { now: await clockguard.now() })
        if (action === 'observe') return Object.assign({ ok: true, action }, await clockguard.observe({ at }))
        if (action === 'skew') return Object.assign({ ok: true, action }, await clockguard.skew())
        if (action === 'monotonic') {
          // NOTHING IS INVENTED: a missing or non-finite endpoint is refused BY NAME instead of being handed to the
          // kernel as `undefined` — which is exactly how this action became unreachable in the first place.
          if (typeof from !== 'number' || typeof to !== 'number' || !Number.isFinite(from) || !Number.isFinite(to)) {
            return refused('VMU_INVALID_ARGUMENT', 'monotonic needs numeric from/to',
              'pass BOTH { from, to } (e.g. { from: 1, to: 2 }); with a missing endpoint the kernel answers "non-finite input" and the success branch is unreachable')
          }
          return Object.assign({ ok: true, action }, await clockguard.monotonic({ from, to }))
        }
        if (action === 'status') return Object.assign({ ok: true, action }, await clockguard.status())
        if (action === 'clockSource') return Object.assign({ ok: true, action }, { clockSource: await clockguard.clockSource() })
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
