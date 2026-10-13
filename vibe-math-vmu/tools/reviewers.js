// vibe-math-vmu/tools/reviewers.js — the reviewers tool spec (round 541). One module plus one line in the host.
export function makeReviewersSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.reviewers,
    description: 'vmu 评审人面（★ **(i) 评审与出版** ✓）：action=register|assign|unbind|acknowledge|acknowledgements|quorumMet|reviewerView|status|trace|keysUsed。★ 模式、回避与法定人数都由内核服务强制（★ `mode:"single-blind"`／`conflictPolicy:"recuse"` ✓）；本工具只做**寻址与调用**，不复制任何策略。',
    parameters: {
      action: param('string', 'register｜assign｜unbind｜acknowledge｜acknowledgements｜quorumMet｜reviewerView｜status｜trace｜keysUsed', { required: true,
        enum: ['register','assign','unbind','acknowledge','acknowledgements','quorumMet','reviewerView','status','trace','keysUsed'] }),
      id: param('string', 'register 的评审人 id（★ 服务会回必填项示例 ✓）'),
      expertise: param('array', 'register 的专长列表（可选）'),
      conflicts: param('array', 'register 的利益冲突列表（可选）'),
      reviewerId: param('string', 'assign／unbind 的评审人（★ 服务会回示例 ✓）'),
      submissionId: param('string', 'assign／unbind／quorumMet 的投稿（可选）'),
    },
    run: async ({ action, id, expertise, conflicts, reviewerId, submissionId } = {}) => {
      try {
        const reviewers = kernel.reviewers
        if (action === 'register') return Object.assign({ ok: true, action }, await reviewers.register({ id, expertise, conflicts }))
        if (action === 'assign') return Object.assign({ ok: true, action }, await reviewers.assign({ reviewerId, submissionId }))
        if (action === 'unbind') return Object.assign({ ok: true, action }, await reviewers.unbind({ reviewerId, submissionId }))
        if (action === 'acknowledge') return Object.assign({ ok: true, action }, await reviewers.acknowledge({ reviewerId, submissionId }))
        if (action === 'acknowledgements') return Object.assign({ ok: true, action }, { acknowledgements: await reviewers.acknowledgements() })
        if (action === 'quorumMet') return Object.assign({ ok: true, action }, await reviewers.quorumMet({ submissionId }))
        if (action === 'reviewerView') return Object.assign({ ok: true, action }, { reviewer: await reviewers.reviewerView({ reviewerId }) })
        if (action === 'status') return Object.assign({ ok: true, action }, await reviewers.status())
        if (action === 'trace') return Object.assign({ ok: true, action }, { trace: await reviewers.trace() })
        if (action === 'keysUsed') return Object.assign({ ok: true, action }, { keysUsed: await reviewers.keysUsed() })
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
