// vibe-math-vmu/tools/charter.js — the charter tool spec (round 544). One module plus one line in the host.
export function makeCharterSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.charter,
    description: 'vmu 章程面（(j) 代理自组织）：11 个动作。★ 生效、修订与引用都由内核服务强制；本工具只做寻址与调用（整对象透传 ✓）。',
    parameters: {
      action: param('string', 'propose｜amend｜ratify｜inForce｜cite｜dissolve｜articles｜children｜list｜history｜status', { required: true,
        enum: ['propose','amend','ratify','inForce','cite','dissolve','articles','children','list','history','status'] }),
      request: param('object', '写动作的请求（形状由服务校验 ✓）'),
      id: param('string', 'read 动作的目标 id（可选）'),
    },
    run: async ({ action, request, id } = {}) => {
      try {
        const charter = kernel.charter
        if (action === 'propose') return Object.assign({ ok: true, action }, await charter.propose(request))
        if (action === 'amend') return Object.assign({ ok: true, action }, await charter.amend(request))
        if (action === 'ratify') return Object.assign({ ok: true, action }, await charter.ratify(request))
        if (action === 'inForce') return Object.assign({ ok: true, action }, await charter.inForce(request))
        if (action === 'cite') return Object.assign({ ok: true, action }, await charter.cite(request))
        if (action === 'dissolve') return Object.assign({ ok: true, action }, await charter.dissolve(request))
        if (action === 'articles') return Object.assign({ ok: true, action }, await charter.articles())
        if (action === 'children') return Object.assign({ ok: true, action }, await charter.children())
        if (action === 'list') return Object.assign({ ok: true, action }, await charter.list())
        if (action === 'history') return Object.assign({ ok: true, action }, await charter.history())
        if (action === 'status') return Object.assign({ ok: true, action }, await charter.status())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
