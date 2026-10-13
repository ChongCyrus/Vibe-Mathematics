// vibe-math-vmu/tools/clockguard.js — the clockguard tool spec (round 541). One module plus one line in the host.
export function makeClockguardSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.clockguard,
    description: 'vmu 时钟守卫面（★ **(g) 控制流** ✓）：action=now|observe|skew|monotonic|status|clockSource。★ 回退、跳变与钳制都由内核服务强制（★ 策略 `clamp` ✓ —— **倒流不会被静默接受** ✗）；本工具只做**寻址与调用**，不复制任何策略。',
    parameters: {
      action: param('string', 'now｜observe｜skew｜monotonic｜status｜clockSource', { required: true,
        enum: ['now','observe','skew','monotonic','status','clockSource'] }),
      value: param('number', 'observe／monotonic 的输入值（可选；★ 用于验证守卫的行为 ✓）'),
    },
    run: async ({ action, value } = {}) => {
      try {
        const clockguard = kernel.clockguard
        if (action === 'now') return Object.assign({ ok: true, action }, { now: await clockguard.now() })
        if (action === 'observe') return Object.assign({ ok: true, action }, await clockguard.observe({ value }))
        if (action === 'skew') return Object.assign({ ok: true, action }, await clockguard.skew())
        if (action === 'monotonic') return Object.assign({ ok: true, action }, await clockguard.monotonic({ value }))
        if (action === 'status') return Object.assign({ ok: true, action }, await clockguard.status())
        if (action === 'clockSource') return Object.assign({ ok: true, action }, { clockSource: await clockguard.clockSource() })
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
