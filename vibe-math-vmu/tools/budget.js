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
      request: param('object', '★ 也可整对象传入（★ 与服务的提示示例一致 ✓；★ 与顶层参数等价 ✓）'),
      },
      run: async ({ action, scope, kind, amount, taskId, limits, perTaskShare, ratio, request } = {}) => {
      // ROUND 575: ALSO accept a `request` object. The service's own refusal hint teaches `open({scope:"meeting:mt-1"})`, and
      // that call could not be made through this tool because its parameters were scattered at the top level - so the hint
      // and the tool disagreed and the documented example failed with "open needs a string scope". Merging the request keeps
      // every existing call working (additive) and makes the tool agree with every other tool face built this session.
      const rq = request && typeof request === 'object' ? request : {}
      scope = scope !== undefined ? scope : rq.scope
      kind = kind !== undefined ? kind : rq.kind
      amount = amount !== undefined ? amount : rq.amount
      taskId = taskId !== undefined ? taskId : rq.taskId
      limits = limits !== undefined ? limits : rq.limits
      perTaskShare = perTaskShare !== undefined ? perTaskShare : rq.perTaskShare
      ratio = ratio !== undefined ? ratio : rq.ratio
        try {
          const budget = kernel.budget
          if (action === 'open') return Object.assign({ ok: true, action }, await budget.open({ ...request, scope, limits: limits || {}, perTaskShare }))
          if (action === 'charge') return Object.assign({ ok: true, action }, await budget.charge({ ...request, scope, kind, amount, taskId }))
          if (action === 'reserve') return Object.assign({ ok: true, action }, await budget.reserve({ ...request, scope, ratio }))
          if (action === 'remaining') return Object.assign({ ok: true, action }, await budget.remaining({ ...request, scope, kind }))
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
