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
      const members = Array.isArray(args.members) ? args.members : []
      if (op === 'status') return { ok: true, status: kernel.turn.status() }
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
          next_step: param('string', '下一步要做什么'),
        },
        required: ['op'],
      },
      execute: executeTurn,
      run: runTurn,
  }
}
