// vibe-math-vmu/tools/turn.js — the turn tool spec, split out of host.js (round 538) so the host file stays inside the
// DECIDED 1200-line limit (docs/02). This block was SELF-CONTAINED - it defined its own core and two wrappers - so those 
// definitions move with the spec; the factory supplies only what the block genuinely took from the host scope.
export function makeTurnSpec({ param, refused, TOOL_NAMES, kernel }) {
    // ROUND 349: ONE CORE, TWO THIN WRAPPERS. The middleware wrapper calls `spec.run` and stringifies what it gets,
    // while direct callers (and the tests) call `spec.execute` and parse a string themselves. Measured the hard way:
    // a face that returns a string from `run` gets it stringified AGAIN, so the caller parses back the same string.
    // `run` therefore returns the OBJECT and `execute` returns the JSON STRING, both from the same core.
    const coreTurn = async (args = {}) => {
      if (!kernel.turn) return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel exposes no turn loop')
      const op = String(args.op || 'status')
      // ★★★ ROUND 45 (measured on a real machine): THE CONTRACT PROMISED THE ROSTER INFERENCE AND THE CODE DID NOT DO IT.
      // This parameter's own description says "缺省时由内核名册推断" - when omitted, inferred from the KERNEL ROSTER -
      // but the fallback was `[]`, so a caller that (reasonably) omitted `members` got `stopped:'no-members'` every
      // time no matter how many members the institute actually had. The real run shows exactly that: the turn face was
      // called sixty-one times and answered `no-members` throughout, while the roster held a seated member in the
      // chair slot. The same contract-versus-implementation family as the control face's hire, in a second place.
      //
      // The fallback now reads the roster the framework already maintains: live members become {id, role} with the
      // slot as the role. An explicit `members` still WINS when the caller supplies one - the framework defaults
      // sensibly and the deployment stays in control.
      const explicit = Array.isArray(args.members) && args.members.length > 0
      const inferred = !explicit && kernel.members && typeof kernel.members.roster === 'function'
        ? kernel.members.roster().filter((m) => m && m.state === 'live').map((m) => ({ id: m.id, role: m.slot }))
        : []
      const members = explicit ? args.members : inferred
      if (op === 'status') {
    const status = kernel.turn.status()
    // ★ PHASE 7 / round 17: the turn face used to call closureVoteOf with its DEFAULTS (roster []), so a seated member
    // with the vote permission still read eligible:[]. Use the kernel's ONE calculation instead of a second one.
    if (typeof kernel.closureVoteView === 'function') status.closureVote = kernel.closureVoteView()
    return { ok: true, status }
  }
      // ★★★ ROUND 73: THE CALLER-PLAYED TURN, SECOND HALF. When a host cannot lend an Agent, the assembled member
      // prompt is handed back to the CALLING session instead of being delivered to a subagent, and that session
      // returns the member's own reply here on the next call. The seam is the framework's own (`deliverByReturning`);
      // this face is where the reply arrives. Supplying one is optional, so a deployment with a real delivery seam is
      // unaffected.
      if (typeof args.reply === 'string' && kernel.turn && typeof kernel.turn.supplyMemberReply === 'function') {
        kernel.turn.supplyMemberReply(args.reply)
      }
      // ★ PHASE 7 / round 19: A VOTE-ONLY TURN MUST NOT HAVE TOOLS. Telling an agent "do not call tools" does not constrain
      // an agent that HAS tools (measured: 3 vote rounds, 180 s delivery timeouts, 12-21 calls each). `tools:'none'` makes
      // the member's visible face EMPTY for exactly this round, then restores the previous face in a finally block.
      if (op === 'step' && args.tools === 'none') {
        if (typeof kernel.visibleToolsOf !== 'function' || typeof kernel.applyMemberToolFace !== 'function') {
          return refused('VMU_ENGINE_UNAVAILABLE', 'tools:"none" needs the member tool face (visibleToolsOf + applyMemberToolFace)',
            'assemble the host adapter so the member Agent exposes its tool table, or omit tools')
        }
        const before = []
        try {
          for (const m of members) {
            const id = m && m.id
            const visible = kernel.visibleToolsOf(id)
            before.push({ id, tools: visible && Array.isArray(visible.tools) ? visible.tools.slice() : [] })
            await kernel.applyMemberToolFace({ member: id, allow: [] })
            const after = kernel.visibleToolsOf(id)
            if (!after || !Array.isArray(after.tools) || after.tools.length !== 0) {
              return refused('VMU_ENGINE_UNAVAILABLE', 'the empty member tool face did not take effect for ' + String(id),
                'the host refused restrict({allow:[]}); a vote round must not run with tools still visible')
            }
          }
          return await kernel.turn.step({ members, phase: args.phase, why: args.why, nextStep: args.next_step })
        } finally {
          for (const b of before) {
            try { await kernel.applyMemberToolFace({ member: b.id, allow: b.tools }) } catch { /* restore is best-effort; the receipt says what ran */ }
          }
        }
      }
      if (op === 'step') return await kernel.turn.step({ members, phase: args.phase, why: args.why, nextStep: args.next_step })
      if (op === 'drive') return await kernel.turn.drive({ members, rounds: args.rounds, phase: args.phase, why: args.why, nextStep: args.next_step })
      return refused('VMU_INVALID_ARGUMENT', 'unknown op: ' + op, 'known ops: step, drive, status')
    }
    const runTurn = (args = {}) => coreTurn(args)
    const executeTurn = async (args = {}) => JSON.stringify(await coreTurn(args))
  return {
      name: TOOL_NAMES.turn,
      description: 'Run institute TURNS: step runs exactly one round (who is chosen by vmu.turn.wakeupPolicy, what ' +
        'prompt is assembled by the pipeline), drive runs a bounded number, status reports what the loop has done. ' +
        'A round with no members is a legal no-op; a failed round is returned with its code rather than thrown.',
      // ★ PHASE 7 / round 20: this block used to be a FULL JSON SCHEMA passed where the host expects a PARAM MAP.
      // toHostParameters() then wrapped it once more, so the PUBLISHED schema had properties named type/properties/required
      // and a real "properties" object - the model (correctly) put its arguments INSIDE that object, so top-level keys like
      // tools:'none' never reached coreTurn. It is a param map now, exactly like every other tool.
      parameters: {
        op: param('string', 'step＝一轮／drive＝连跑若干轮／status＝读数', { required: true }),
        members: param('array', '本轮可唤醒的成员：[{id, role}]；缺省时由内核名册推断（无成员 ⇒ 合法空转）'),
        rounds: param('integer', 'drive 的轮数（必须为正整数；没有无限默认）'),
        phase: param('string', '相位：founding／normal／checkpoint／verify／verify-debate／meeting／resume'),
        why: param('string', '为什么唤醒（原预设的唤醒也带这一项）'),
        reply: param('string', '★ 由调用者扮演成员回合时：★ 上一次 step／drive 交回的成员提示词，★ 其【成员自己的回复】放在这里送回（★ 仅当交付接缝是 deliverByReturning 时需要）'),
        next_step: param('string', '下一步要做什么'),
        tools: param('string', '★ step 专用：none＝本回合把成员可见工具面清空（表决回合用），回合结束后恢复；缺省＝不动工具面'),
      },
      execute: executeTurn,
      run: runTurn,
  }
}
