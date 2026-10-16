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
      if (op === 'status') return { ok: true, status: kernel.turn.status() }
      // ★★★ ROUND 73: THE CALLER-PLAYED TURN, SECOND HALF. When a host cannot lend an Agent, the assembled member
      // prompt is handed back to the CALLING session instead of being delivered to a subagent, and that session
      // returns the member's own reply here on the next call. The seam is the framework's own (`deliverByReturning`);
      // this face is where the reply arrives. Supplying one is optional, so a deployment with a real delivery seam is
      // unaffected.
      if (typeof args.reply === 'string' && kernel.turn && typeof kernel.turn.supplyMemberReply === 'function') {
        kernel.turn.supplyMemberReply(args.reply)
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
      parameters: {
        type: 'object',
        properties: {
          op: param('string', 'step＝一轮／drive＝连跑若干轮／status＝读数'),
          members: param('array', '本轮可唤醒的成员：[{id, role}]；缺省时由内核名册推断（无成员 ⇒ 合法空转）'),
          rounds: param('integer', 'drive 的轮数（必须为正整数；没有无限默认）'),
          phase: param('string', '相位：founding／normal／checkpoint／verify／verify-debate／meeting／resume'),
          why: param('string', '为什么唤醒（原预设的唤醒也带这一项）'),
          reply: param('string', '★ 由调用者扮演成员回合时：★ 上一次 step／drive 交回的成员提示词，★ 其【成员自己的回复】放在这里送回（★ 仅当交付接缝是 deliverByReturning 时需要）'),
          next_step: param('string', '下一步要做什么'),
        },
        required: ['op'],
      },
      execute: executeTurn,
      run: runTurn,
  }
}
