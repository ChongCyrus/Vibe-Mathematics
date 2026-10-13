// vibe-math-vmu/tools/ratelimit.js — the ratelimit tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeRatelimitSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.ratelimit,
      description: 'vmu 速率面：action=take|peek|reset|bucket|status。' +
        '速率上限、重置必须给理由、以及"零配置下【不算保护】"的自我申明都由内核服务回答；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'take｜peek｜reset｜bucket｜status', { required: true,
          enum: ['take', 'peek', 'reset', 'bucket', 'status'] }),
        key: param('string', '限流键（可选；★ 缺省由服务决定，如 `global` ✓）'),
        cost: param('number', 'take 的代价（默认 1）'),
        scope: param('string', 'take 的作用域（可选）'),
        reason: param('string', 'reset 的理由（★ 服务强制必填 ✓）'),
        by: param('string', 'reset 的执行者（可选）'),
      },
      run: async ({ action, key, cost, scope, reason, by } = {}) => {
        try {
          const ratelimit = kernel.ratelimit
          if (action === 'take') return Object.assign({ ok: true, action }, await ratelimit.take({ key, cost, scope }))
          if (action === 'peek') return Object.assign({ ok: true, action }, await ratelimit.peek({ key }))
          if (action === 'reset') return Object.assign({ ok: true, action }, await ratelimit.reset({ key, reason, by }))
          if (action === 'bucket') return Object.assign({ ok: true, action }, await ratelimit.bucket({ key }))
          if (action === 'status') return Object.assign({ ok: true, action }, await ratelimit.status())
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}
