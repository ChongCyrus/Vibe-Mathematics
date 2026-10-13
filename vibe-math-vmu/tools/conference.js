// vibe-math-vmu/tools/conference.js — the conference tool spec (round 543). One module plus one line in the host.
export function makeConferenceSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.conference,
    description: 'vmu 会议面（★ **(d) 代理通信与会议系统** ✓）：11 个动作。★ 议程、指派与决议都由内核服务强制；本工具只做**寻址与调用**（★ **整对象透传** ✓）。',
    parameters: {
      action: param('string', 'open｜submit｜assign｜review｜decide｜register｜planAgenda｜viewSubmission｜list｜receiptsView｜status', { required: true,
        enum: ['open','submit','assign','review','decide','register','planAgenda','viewSubmission','list','receiptsView','status'] }),
      request: param('object', '写动作的请求（★ 形状由服务校验 ✓）'),
      id: param('string', 'read 动作的目标 id（可选）'),
    },
    run: async ({ action, request, id } = {}) => {
      try {
        const conference = kernel.conference
        if (action === 'open') return Object.assign({ ok: true, action }, await conference.open(request))
        if (action === 'submit') return Object.assign({ ok: true, action }, await conference.submit(request))
        if (action === 'assign') return Object.assign({ ok: true, action }, await conference.assign(request))
        if (action === 'review') return Object.assign({ ok: true, action }, await conference.review(request))
        if (action === 'decide') return Object.assign({ ok: true, action }, await conference.decide(request))
        if (action === 'register') return Object.assign({ ok: true, action }, await conference.register(request))
        if (action === 'planAgenda') return Object.assign({ ok: true, action }, await conference.planAgenda(request))
        if (action === 'viewSubmission') return Object.assign({ ok: true, action }, await conference.viewSubmission({ id }))
        if (action === 'list') return Object.assign({ ok: true, action }, await conference.list())
        if (action === 'receiptsView') return Object.assign({ ok: true, action }, await conference.receiptsView({ id }))
        if (action === 'status') return Object.assign({ ok: true, action }, await conference.status())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
