// vibe-math-vmu/tools/vote.js — PHASE 8 / round 37: the CLOSURE VOTE as a first-class tool.
//
// WHY IT EXISTS: a "vote-only" turn with NO tools made the model write tool-call syntax into its text, so the reply was
// not JSON and the turn was refused (VMU_TURN_NO_FENCE). The fix is not another sentence in the prompt: give the member
// exactly ONE tool and let the vote be a tool call. This face writes through kernel.recordClosureVote, which is the
// SAME writer the reply's vote_solved field uses (turn.recordClosureVote) — one ledger, two input channels.
export function makeVoteSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.vote,
    description: '投出结题表决的一票（写入与回执 vote_solved 相同的投票记录器）。只有持 closure-vote 权限的在册成员可以投；无权限/未落座 ⇒ 具名拒。',
    parameters: {
      member: param('string', '投票成员 id（必填；必须是持 closure-vote 权限的在册成员）', { required: true }),
      solved: param('boolean', '本所目标是否已达成（true/false）', { required: true }),
      why: param('string', '为什么这样投（可选，留痕用）'),
    },
    run: async (args = {}) => {
      if (!kernel || typeof kernel.recordClosureVote !== 'function') {
        return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel has no closure-vote writer',
          'assemble a kernel whose turn loop exposes recordClosureVote')
      }
      const member = typeof args.member === 'string' ? args.member : ''
      if (!member) return refused('VMU_INVALID_ARGUMENT', 'vibe_vmu_vote needs member', 'pass member:"<roster id>"')
      if (typeof args.solved !== 'boolean') return refused('VMU_INVALID_ARGUMENT', 'vibe_vmu_vote needs solved:boolean', 'pass solved:true or solved:false')
      try {
        return kernel.recordClosureVote({ member, solved: args.solved, why: typeof args.why === 'string' ? args.why : null })
      } catch (e) {
        return refused((e && e.code) || 'VMU_ENGINE_UNAVAILABLE', (e && e.message) || String(e), (e && e.hint) || null)
      }
    },
  }
}
