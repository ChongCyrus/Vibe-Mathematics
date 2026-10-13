// vibe-math-vmu/tools/publication.js — the publication tool spec (round 542). One module plus one line in the host.
// It forwards request objects rather than unpacking every signature, so the service s own validation stays the only one.
export function makePublicationSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.publication,
    description: 'vmu 出版面（★ **(i) 评审与出版** ✓）：14 个动作。★ 可得性、徽章与影响评估都由内核服务强制；本工具只做**寻址与调用**（★ **整对象透传** ✓ —— ★ 服务自己的 14 个签名不在此复制 ✓）。',
    parameters: {
      action: param('string', 'shareReplication｜submitPack｜advance｜register｜availability｜badge｜replication｜list｜status｜outreachPack｜publishOutreach｜openOutreachReview｜logImpact｜useImpactInEvaluation', { required: true,
        enum: ['shareReplication','submitPack','advance','register','availability','badge','replication','list','status','outreachPack','publishOutreach','openOutreachReview','logImpact','useImpactInEvaluation'] }),
      request: param('object', '写动作的请求（★ 形状由服务校验 ✓）'),
      id: param('string', 'read 动作的目标 id（可选）'),
      period: param('string', '影响评估的周期（可选）'),
    },
    run: async ({ action, request, id, period } = {}) => {
      try {
        const publication = kernel.publication
        if (action === 'shareReplication') return Object.assign({ ok: true, action }, await publication.shareReplication(request))
        if (action === 'submitPack') return Object.assign({ ok: true, action }, await publication.submitPack(request))
        if (action === 'advance') return Object.assign({ ok: true, action }, await publication.advance(request))
        if (action === 'register') return Object.assign({ ok: true, action }, await publication.register(request))
        if (action === 'availability') return Object.assign({ ok: true, action }, await publication.availability({ id, paperId: id }))
        if (action === 'badge') return Object.assign({ ok: true, action }, await publication.badge(request))
        if (action === 'replication') return Object.assign({ ok: true, action }, await publication.replication({ id, paperId: id }))
        if (action === 'list') return Object.assign({ ok: true, action }, await publication.list())
        if (action === 'status') return Object.assign({ ok: true, action }, await publication.status())
        if (action === 'outreachPack') return Object.assign({ ok: true, action }, await publication.outreachPack({ id, paperId: id, request }))
        if (action === 'publishOutreach') return Object.assign({ ok: true, action }, await publication.publishOutreach({ id, paperId: id, request }))
        if (action === 'openOutreachReview') return Object.assign({ ok: true, action }, await publication.openOutreachReview({ id, paperId: id, period }))
        if (action === 'logImpact') return Object.assign({ ok: true, action }, await publication.logImpact(request))
        if (action === 'useImpactInEvaluation') return Object.assign({ ok: true, action }, await publication.useImpactInEvaluation({ id, paperId: id, period }))
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
