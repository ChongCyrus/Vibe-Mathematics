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
      assignmentId: param('string', 'unbind 的指派 id（可选；与 reviewerId+submissionId 二者其一）'),
      reason: param('string', 'unbind 的理由（盲评解绑必填，vmu.reviewers.blindUnbindRequiresReason）'),
    },
    run: async ({ action, id, expertise, conflicts, reviewerId, submissionId, assignmentId, reason } = {}) => {
      try {
        const reviewers = kernel.reviewers
        // ★ round-11: the research-core reviewers service RESOLVES to its own `refuse(...)` Error on a denial
        // (it does not throw). `Object.assign({ ok: true, action }, <Error>)` would copy only `code`/`hint` and
        // produce an ok:true receipt hiding the refusal. Throw it instead, so the host catch decorates it with
        // means + both hint forms (the corpus' one undecorated signal was exactly this path).
        const unwrapReviewerResult = (v) => { if (v instanceof Error) throw v; return v }
        // ★ TB-2794 Step 3: the face is CONTRIBUTED by a pack. A host that mounts no provider must get a named refusal,
        // not a TypeError on null — and the hint names the only repair (mount the pack that contributes the face).
        if (!reviewers || typeof reviewers !== 'object') {
          return refused('VMU_ENGINE_UNAVAILABLE', 'no pack provides vmu.reviewers in this assembly',
            'mount the pack that contributes the face (the v5r pack publishes it through PACK.services)')
        }
        if (action === 'register') return Object.assign({ ok: true, action }, unwrapReviewerResult(await reviewers.register({ id, expertise, conflicts })))
        if (action === 'assign') return Object.assign({ ok: true, action }, unwrapReviewerResult(await reviewers.assign({ reviewerId, submissionId })))
        // ★ round-11 P1: FORWARD reason (and the optional assignmentId) — a blind unbind without the reason the caller sent
        // would be refused even after the id form was fixed.
        if (action === 'unbind') return Object.assign({ ok: true, action }, unwrapReviewerResult(await reviewers.unbind({ assignmentId, reviewerId, submissionId, reason })))
        if (action === 'acknowledge') return Object.assign({ ok: true, action }, unwrapReviewerResult(await reviewers.acknowledge({ reviewerId, submissionId })))
        if (action === 'acknowledgements') return Object.assign({ ok: true, action }, { acknowledgements: unwrapReviewerResult(await reviewers.acknowledgements()) })
        if (action === 'quorumMet') return Object.assign({ ok: true, action }, unwrapReviewerResult(await reviewers.quorumMet({ submissionId })))
        if (action === 'reviewerView') return Object.assign({ ok: true, action }, { reviewer: unwrapReviewerResult(await reviewers.reviewerView({ reviewerId })) })
        if (action === 'status') return Object.assign({ ok: true, action }, unwrapReviewerResult(await reviewers.status()))
        if (action === 'trace') return Object.assign({ ok: true, action }, { trace: unwrapReviewerResult(await reviewers.trace()) })
        if (action === 'keysUsed') return Object.assign({ ok: true, action }, { keysUsed: unwrapReviewerResult(await reviewers.keysUsed()) })
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
