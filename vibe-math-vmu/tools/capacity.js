// vibe-math-vmu/tools/capacity.js — the capacity tool spec (round 545).
export function makeCapacitySpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.capacity,
    description: 'vmu 容量面（(f) 工作流／(j) 自组织的资源侧）：10 个动作。★ 登记（admit）／退场（retire）、预约、校准与阻断都由内核服务强制（★ 到期即阻断 ✓）；本工具只做寻址与调用（整对象透传 ✓）。',
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
        // ★★★★★★★ ROUND 80: A MISSING CAPABILITY IS REFUSED BY NAME, NEVER CALLED. The enum offered `retire` and this
        // branch called `capacity.retire(request)` - a method the capacity service does not have. A real run reached it and
        // the tool answered with the ENGINE'S OWN message ("capacity.retire is not a function"), which is exactly what the
        // no-engine-leaks gate exists to catch: a refusal is the framework speaking to an operator, and an engine message is
        // not a refusal. The branch now probes for the method and refuses by name when it is absent.
        if (action === 'retire') {
          if (typeof capacity.retire !== 'function') {
            return refused('VMU_ENGINE_UNAVAILABLE', 'this capacity service has no retire: the face offers it and the service does not implement it',
              'the service implements ' + Object.keys(capacity).filter((k) => typeof capacity[k] === 'function').slice(0, 12).join('｜') + ' - use one of those, or the deployment adds retire')
          }
          return Object.assign({ ok: true, action }, await capacity.retire(request))
        }
        if (action === 'reserve') return Object.assign({ ok: true, action }, await capacity.reserve(request))
        if (action === 'release') return Object.assign({ ok: true, action }, await capacity.release(request))
        if (action === 'calibrate') return Object.assign({ ok: true, action }, await capacity.calibrate(request))
        if (action === 'available') return Object.assign({ ok: true, action }, await capacity.available({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'blocked') return Object.assign({ ok: true, action }, await capacity.blocked({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'list') return Object.assign({ ok: true, action }, await capacity.list())
        if (action === 'status') return Object.assign({ ok: true, action }, await capacity.status())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
