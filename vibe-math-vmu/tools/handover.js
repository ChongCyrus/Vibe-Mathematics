// vibe-math-vmu/tools/handover.js — the handover tool spec (round 542). One module plus one line in the host.
// It forwards request objects rather than unpacking every signature, so the service s own validation stays the only one.
export function makeHandoverSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.handover,
    description: 'vmu 交接面（★ **(e) 代理间协作** ✓）：7 个动作。★ 必需字段与状态机都由内核服务强制（★ `requiredFields:["status","open…` ✓ —— **缺字段就不许交接** ✗）；本工具只做**寻址与调用**。',
    parameters: {
      action: param('string', 'open｜attach｜finalize｜accept｜reject｜pack｜status', { required: true,
        enum: ['open','attach','finalize','accept','reject','pack','status'] }),
      id: param('string', '交接 id（多数动作必填 ✓）'),
      payload: param('object', 'attach 的内容（可选）'),
      reason: param('string', 'reject 的理由（★ 服务会要求它 ✓）'),
    },
    run: async ({ action, id, payload, reason } = {}) => {
      try {
        const handover = kernel.handover
        if (action === 'open') return Object.assign({ ok: true, action }, await handover.open({ payload }))
        if (action === 'attach') return Object.assign({ ok: true, action }, await handover.attach({ id, payload }))
        if (action === 'finalize') return Object.assign({ ok: true, action }, await handover.finalize({ id, payload }))
        if (action === 'accept') return Object.assign({ ok: true, action }, await handover.accept({ id, payload }))
        if (action === 'reject') return Object.assign({ ok: true, action }, await handover.reject({ id, reason }))
        if (action === 'pack') return Object.assign({ ok: true, action }, await handover.pack({ id, payload }))
        if (action === 'status') return Object.assign({ ok: true, action }, await handover.status())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
