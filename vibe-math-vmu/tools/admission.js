// vibe-math-vmu/tools/admission.js — the admission tool spec (round 569). Fifteen methods, measured; the service is a
// pipeline whose refusals each name the step that must come first, which is what this tool passes through unchanged.
export function makeAdmissionSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.admission,
    description: 'vmu 招募/准入面（(j) 代理自组织）：15 个动作，构成流水线 openPosting→apply→offer→accept→confirm。★ 每一步的前置条件由内核服务强制，★ 且【拒绝会告出下一步**]（如 "offer() first" ✓）；本工具只做寻址与调用（整对象透传 ✓）。' + '★ **与 `vibe_vmu_recruit` 动作集相同（同一内核服务）**：本面是招募/准入流水线视图；两面等价，★ 选一个即可（分工裁定见 docs）。',
    parameters: {
      action: param('string', 'accept｜actAsChair｜aggregate｜apply｜confirm｜offer｜openPosting｜postings｜probation｜promote｜recall｜reject｜renewTerm｜score｜status', { required: true,
        enum: ['accept','actAsChair','aggregate','apply','confirm','offer','openPosting','postings','probation','promote','recall','reject','renewTerm','score','status'] }),
      request: param('object', '流水线各步的请求（形状由服务校验 ✓）'),
      id: param('string', '只读动作的目标 id（可选 ✓）'),
    },
    run: async ({ action, request, id } = {}) => {
      try {
        const admission = kernel.admission
        if (action === 'accept') return Object.assign({ ok: true, action }, await admission.accept(request))
        if (action === 'actAsChair') return Object.assign({ ok: true, action }, await admission.actAsChair(request))
        if (action === 'aggregate') return Object.assign({ ok: true, action }, await admission.aggregate({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'apply') return Object.assign({ ok: true, action }, await admission.apply(request))
        if (action === 'confirm') return Object.assign({ ok: true, action }, await admission.confirm(request))
        if (action === 'offer') return Object.assign({ ok: true, action }, await admission.offer(request))
        if (action === 'openPosting') return Object.assign({ ok: true, action }, await admission.openPosting(request))
        if (action === 'postings') return Object.assign({ ok: true, action }, await admission.postings({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        if (action === 'probation') return Object.assign({ ok: true, action }, await admission.probation(request))
        if (action === 'promote') return Object.assign({ ok: true, action }, await admission.promote(request))
        if (action === 'recall') return Object.assign({ ok: true, action }, await admission.recall(request))
        if (action === 'reject') return Object.assign({ ok: true, action }, await admission.reject(request))
        if (action === 'renewTerm') return Object.assign({ ok: true, action }, await admission.renewTerm(request))
        if (action === 'score') return Object.assign({ ok: true, action }, await admission.score(request))
        if (action === 'status') return Object.assign({ ok: true, action }, await admission.status({ ...(request || {}), ...(id !== undefined && id !== null ? { id } : {}) }))
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
