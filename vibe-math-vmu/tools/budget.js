// vibe-math-vmu/tools/budget.js — the budget tool spec, split out of host.js (round 538) so the host file stays
// inside the DECIDED 1200-line limit (docs/02). The spec is a factory: host.js supplies the shared helpers, and the guard
// condition stays in host.js, because which intent declares a tool is policy and policy belongs with the host.
export function makeBudgetSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
      name: TOOL_NAMES.budget,
      description: 'vmu 预算面：action=open|charge|reserve|remaining|status|list|totals|perTaskShare。' +
        '配额四类（tokens/turns/toolCalls/subagents）、预留、公平与越界动作都由内核服务强制；本工具只做**寻址与调用**，不复制任何策略。',
      parameters: {
        action: param('string', 'open｜charge｜reserve｜remaining｜status｜list｜totals｜perTaskShare', { required: true,
          enum: ['open', 'charge', 'reserve', 'remaining', 'status', 'list', 'totals', 'perTaskShare'] }),
        scope: param('string', '作用域名（open/charge/reserve/remaining 需要）'),
        kind: param('string', '配额类别（charge/remaining 用；★ 四类见服务自己的 kinds ✓）'),
        amount: param('number', 'charge 的数量（默认 0）'),
        taskId: param('string', 'charge 归属的任务（可选；★ 与 perTaskShare 一起作用 ✓）'),
        limits: param('object', 'open 的初始上限（可选）'),
        perTaskShare: param('number', 'open 的单任务占比（可选，0..1）'),
        ratio: param('number', 'reserve 的比例'),
      },
      run: async ({ action, scope, kind, amount, taskId, limits, perTaskShare, ratio } = {}) => {
        try {
          const budget = kernel.budget
          if (action === 'open') return Object.assign({ ok: true, action }, await budget.open({ scope, limits: limits || {}, perTaskShare }))
          if (action === 'charge') return Object.assign({ ok: true, action }, await budget.charge({ scope, kind, amount, taskId }))
          if (action === 'reserve') return Object.assign({ ok: true, action }, await budget.reserve({ scope, ratio }))
          if (action === 'remaining') return Object.assign({ ok: true, action }, await budget.remaining({ scope, kind }))
          if (action === 'status') return Object.assign({ ok: true, action }, await budget.status())
          if (action === 'list') return Object.assign({ ok: true, action }, await budget.list())
          if (action === 'totals') return Object.assign({ ok: true, action }, { totals: await budget.totals() })
          if (action === 'perTaskShare') return Object.assign({ ok: true, action }, { perTaskShare: await budget.perTaskShare() })
          return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
        } catch (e) {
          return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
        }
      },
  }
}
