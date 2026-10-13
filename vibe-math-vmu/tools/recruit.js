// vibe-math-vmu/tools/recruit.js — the recruit tool spec (round 544). One module plus one line in the host.
export function makeRecruitSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.recruit,
    description: 'vmu 招募面（(j) 代理自组织）：15 个动作。★ 任期、晋升与试用都由内核服务强制；本工具只做寻址与调用（整对象透传 ✓）。',
    parameters: {
      action: param('string', 'renewTerm｜recall｜actAsChair｜promote｜openPosting｜apply｜score｜offer｜accept｜reject｜probation｜confirm｜postings｜status｜aggregate', { required: true,
        enum: ['renewTerm','recall','actAsChair','promote','openPosting','apply','score','offer','accept','reject','probation','confirm','postings','status','aggregate'] }),
      request: param('object', '写动作的请求（形状由服务校验 ✓）'),
      id: param('string', 'read 动作的目标 id（可选）'),
    },
    run: async ({ action, request, id } = {}) => {
      try {
        const recruit = kernel.recruit
        if (action === 'renewTerm') return Object.assign({ ok: true, action }, await recruit.renewTerm(request))
        if (action === 'recall') return Object.assign({ ok: true, action }, await recruit.recall(request))
        if (action === 'actAsChair') return Object.assign({ ok: true, action }, await recruit.actAsChair(request))
        if (action === 'promote') return Object.assign({ ok: true, action }, await recruit.promote(request))
        if (action === 'openPosting') return Object.assign({ ok: true, action }, await recruit.openPosting(request))
        if (action === 'apply') return Object.assign({ ok: true, action }, await recruit.apply(request))
        if (action === 'score') return Object.assign({ ok: true, action }, await recruit.score(request))
        if (action === 'offer') return Object.assign({ ok: true, action }, await recruit.offer(request))
        if (action === 'accept') return Object.assign({ ok: true, action }, await recruit.accept(request))
        if (action === 'reject') return Object.assign({ ok: true, action }, await recruit.reject(request))
        if (action === 'probation') return Object.assign({ ok: true, action }, await recruit.probation(request))
        if (action === 'confirm') return Object.assign({ ok: true, action }, await recruit.confirm(request))
        if (action === 'postings') return Object.assign({ ok: true, action }, await recruit.postings())
        if (action === 'status') return Object.assign({ ok: true, action }, await recruit.status())
        if (action === 'aggregate') return Object.assign({ ok: true, action }, await recruit.aggregate())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
