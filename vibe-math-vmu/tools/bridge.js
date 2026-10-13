// vibe-math-vmu/tools/bridge.js — the bridge tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeBridgeSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.bridge,
      description: 'vmu 脚本面（M3）：action=validate|plan|run|status|history。' +
        '请求形状（`file` 与 `inline` 互斥等）由内核服务校验，★ **本工具把 `request` 对象【原样转发**]，**不解释它的字段** ✓；干跑真的不执行 ✓。',
      parameters: {
        action: param('string', 'validate｜plan｜run｜status｜history', { required: true,
          enum: ['validate', 'plan', 'run', 'status', 'history'] }),
        request: param('object', '脚本请求（★ 形状见 `docs/05 §6.2` ✓；`validate`/`plan`/`run` 用；★ 本工具不解释其字段 ✓）'),
      },
      run: async ({ action, request } = {}) => {
        try {
          const bridge = kernel.bridge
          if (action === 'validate') return Object.assign({ ok: true, action }, { problems: await bridge.validate(request) })
          if (action === 'plan') return Object.assign({ ok: true, action }, await bridge.plan(request))
          if (action === 'run') return Object.assign({ ok: true, action }, await bridge.run(request))
          if (action === 'status') return Object.assign({ ok: true, action }, await bridge.status())
          if (action === 'history') return Object.assign({ ok: true, action }, { history: await bridge.history() })
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}
