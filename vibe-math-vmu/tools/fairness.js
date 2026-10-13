// vibe-math-vmu/tools/fairness.js — the fairness tool spec (round 542). One module plus one line in the host.
// It forwards request objects rather than unpacking every signature, so the service s own validation stays the only one.
export function makeFairnessSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.fairness,
    description: 'vmu 公平面（★ **(e) 代理间协作／(j) 自组织** ✓）：6 个动作。★ 分配策略与再平衡都由内核服务强制（★ `policy:"equal"` 与 `maxShare` ✓ —— **没有策略就不分配** ✗）；本工具只做**寻址与调用**。',
    parameters: {
      action: param('string', 'allocation｜explain｜audit｜rebalance｜status｜rebalanceDue', { required: true,
        enum: ['allocation','explain','audit','rebalance','status','rebalanceDue'] }),
      pool: param('object', 'assignment 的池（★ 形状由服务决定 ✓）'),
      reason: param('string', '解释／再平衡的理由（可选）'),
    },
    run: async ({ action, pool, reason } = {}) => {
      try {
        const fairness = kernel.fairness
        if (action === 'allocation') return Object.assign({ ok: true, action }, await fairness.allocation({ pool, reason }))
        if (action === 'explain') return Object.assign({ ok: true, action }, await fairness.explain({ pool, reason }))
        if (action === 'audit') return Object.assign({ ok: true, action }, await fairness.audit({ pool, reason }))
        if (action === 'rebalance') return Object.assign({ ok: true, action }, await fairness.rebalance({ pool, reason }))
        if (action === 'status') return Object.assign({ ok: true, action }, await fairness.status())
        if (action === 'rebalanceDue') return Object.assign({ ok: true, action }, await fairness.rebalanceDue())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
