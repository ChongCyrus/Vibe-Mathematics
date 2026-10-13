// vibe-math-vmu/tools/capacity.js — the capacity tool spec (round 545).
export function makeCapacitySpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.capacity,
    description: 'vmu 容量面（(f) 工作流／(j) 自组织的资源侧）：9 个动作。★ 登记、预约、校准与阻断都由内核服务强制（★ 到期即阻断 ✓）；本工具只做寻址与调用（整对象透传 ✓）。',
    parameters: {
      action: param('string', 'register｜retire｜reserve｜release｜calibrate｜available｜blocked｜list｜status', { required: true,
        enum: ['admit','forecast','list','receiptsView','release','reserve','status','storage','waitlistView'] }),
      request: param('object', '写动作的请求（形状由服务校验 ✓）'),
      id: param('string', 'read 动作的目标 id（可选）'),
    },
    run: async ({ action, request, id } = {}) => {
      try {
        const capacity = kernel.capacity
        if (action === 'admit') return Object.assign({ ok: true, action }, await capacity.admit(request))
        if (action === 'forecast') return Object.assign({ ok: true, action }, await capacity.forecast(request))
        if (action === 'list') return Object.assign({ ok: true, action }, await capacity.list())
        if (action === 'receiptsView') return Object.assign({ ok: true, action }, await capacity.receiptsView(request))
        if (action === 'release') return Object.assign({ ok: true, action }, await capacity.release(request))
        if (action === 'reserve') return Object.assign({ ok: true, action }, await capacity.reserve(request))
        if (action === 'status') return Object.assign({ ok: true, action }, await capacity.status())
        if (action === 'storage') return Object.assign({ ok: true, action }, await capacity.storage(request))
        if (action === 'waitlistView') return Object.assign({ ok: true, action }, await capacity.waitlistView(request))
        if (action === 'retire') return Object.assign({ ok: true, action }, await capacity.retire(request))
        if (action === 'reserve') return Object.assign({ ok: true, action }, await capacity.reserve(request))
        if (action === 'release') return Object.assign({ ok: true, action }, await capacity.release(request))
        if (action === 'calibrate') return Object.assign({ ok: true, action }, await capacity.calibrate(request))
        if (action === 'available') return Object.assign({ ok: true, action }, await capacity.available({ ...request, id }))
        if (action === 'blocked') return Object.assign({ ok: true, action }, await capacity.blocked({ ...request, id }))
        if (action === 'list') return Object.assign({ ok: true, action }, await capacity.list())
        if (action === 'status') return Object.assign({ ok: true, action }, await capacity.status())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
