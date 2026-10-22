// vibe-math-vmu/tools/bidding.js — the bidding tool spec (round 558), named by the approval table as a face with a clear
// reader and no tool. Methods and the read/write split measured before writing.
export function makeBiddingSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.bidding,
    description: 'vmu 竞标面（(e) 代理间协作／资源分配）：11 个动作。★ 围标检测、指纹与计划归一化都由内核服务强制（★ 分配必须可复算 ✓）；本工具只做寻址与调用（整对象透传 ✓）。',
    parameters: {
      action: param('string', 'award｜bid｜cancel｜candidates｜close｜collusion｜fingerprintOf｜list｜normalizePlan｜post｜status', { required: true,
        enum: ['award','bid','cancel','candidates','close','collusion','fingerprintOf','list','normalizePlan','post','status'] }),
      request: param('object', '写动作的请求（形状由服务校验 ✓）'),
      id: param('string', '只读动作的目标 id（可选 ✓）'),
    },
    run: async ({ action, request, id } = {}) => {
      // ★★★ NEVER SPREAD A PRIMITIVE. `bidding.fingerprintOf` returns a STRING and `normalizePlan` a JSON TEXT, so
      // `Object.assign({ ok:true, action }, <string>)` spread them character by character into `{0:'2',1:'7',…}` - a receipt
      // that looks like data and is a bug. Found by a RUNTIME probe that called every service method and recorded its
      // return type; the static scan had missed both (it only saw `return <literal>` at method level, and these return
      // computed values). A primitive gets named as `result` instead.
      const receipt = (act, value) => (value === null || value === undefined || typeof value !== 'object'
        ? { ok: true, action: act, result: value === undefined ? null : value }
        : Object.assign({ ok: true, action: act }, value))
      try {
        const bidding = kernel.bidding
        if (action === 'award') return Object.assign({ ok: true, action }, await bidding.award(request))
        if (action === 'bid') return Object.assign({ ok: true, action }, await bidding.bid(request))
        if (action === 'cancel') return Object.assign({ ok: true, action }, await bidding.cancel(request))
        if (action === 'candidates') return Object.assign({ ok: true, action }, await bidding.candidates({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'close') return Object.assign({ ok: true, action }, await bidding.close(request))
        if (action === 'collusion') return Object.assign({ ok: true, action }, await bidding.collusion({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'fingerprintOf') return receipt(action, await bidding.fingerprintOf({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'list') return Object.assign({ ok: true, action }, await bidding.list({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'normalizePlan') return receipt(action, await bidding.normalizePlan({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'post') return Object.assign({ ok: true, action }, await bidding.post(request))
        if (action === 'status') return Object.assign({ ok: true, action }, await bidding.status({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
