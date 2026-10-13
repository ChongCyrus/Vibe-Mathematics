// vibe-math-vmu/tools/arbitration.js — the arbitration tool spec (round 543). One module plus one line in the host.
export function makeArbitrationSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.arbitration,
    description: 'vmu 裁决面（★ **(e) 代理间协作／(i) 评审与出版** ✓）：13 个动作。★ 回避、听证与裁定都由内核服务强制；本工具只做**寻址与调用**（★ **整对象透传** ✓）。',
    parameters: {
      action: param('string', 'open｜appoint｜pick｜declareConflict｜recuse｜hear｜rule｜appeal｜escalate｜effective｜list｜history｜status', { required: true,
        enum: ['open','appoint','pick','declareConflict','recuse','hear','rule','appeal','escalate','effective','list','history','status'] }),
      request: param('object', '写动作的请求（★ 形状由服务校验 ✓）'),
      id: param('string', 'read 动作的目标 id（可选）'),
    },
    run: async ({ action, request, id } = {}) => {
      try {
        const arbitration = kernel.arbitration
        if (action === 'open') return Object.assign({ ok: true, action }, await arbitration.open(request))
        if (action === 'appoint') return Object.assign({ ok: true, action }, await arbitration.appoint(request))
        if (action === 'pick') return Object.assign({ ok: true, action }, await arbitration.pick(request))
        if (action === 'declareConflict') return Object.assign({ ok: true, action }, await arbitration.declareConflict(request))
        if (action === 'recuse') return Object.assign({ ok: true, action }, await arbitration.recuse(request))
        if (action === 'hear') return Object.assign({ ok: true, action }, await arbitration.hear(request))
        if (action === 'rule') return Object.assign({ ok: true, action }, await arbitration.rule(request))
        if (action === 'appeal') return Object.assign({ ok: true, action }, await arbitration.appeal(request))
        if (action === 'escalate') return Object.assign({ ok: true, action }, await arbitration.escalate(request))
        if (action === 'effective') return Object.assign({ ok: true, action }, await arbitration.effective({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'list') return Object.assign({ ok: true, action }, await arbitration.list())
        if (action === 'history') return Object.assign({ ok: true, action }, await arbitration.history())
        if (action === 'status') return Object.assign({ ok: true, action }, await arbitration.status())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
