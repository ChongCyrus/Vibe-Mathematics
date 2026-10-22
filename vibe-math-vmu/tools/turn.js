// vibe-math-vmu/tools/turn.js — the turn tool spec, split out of host.js (round 538) so the host file stays inside the
// DECIDED 1200-line limit (docs/02). This block was SELF-CONTAINED - it defined its own core and two wrappers - so those 
// definitions move with the spec; the factory supplies only what the block genuinely took from the host scope.
export function makeTurnSpec({ param, refused, TOOL_NAMES, kernel }) {
    // ROUND 349: ONE CORE, TWO THIN WRAPPERS. The middleware wrapper calls `spec.run` and stringifies what it gets,
    // while direct callers (and the tests) call `spec.execute` and parse a string themselves. Measured the hard way:
    // a face that returns a string from `run` gets it stringified AGAIN, so the caller parses back the same string.
    // `run` therefore returns the OBJECT and `execute` returns the JSON STRING, both from the same core.
    const coreTurnInner = async (args = {}, exec = null) => {
      void exec
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
      // ★★ A BARE-ID ARRAY IS NORMALISED, AND A WRONG ENTRY IS REFUSED BY NAME — never answered with a false
      // "no-members". MEASURED on a live run: a caller passed `members: ['member']` (an obvious reading of the
      // declared `[{id, role}]`) and got `stopped: 'no-members'` while the roster held a seated member, because
      // the kernel reads `.id` off each entry: a string yields no id, the list becomes empty, and the answer said
      // "no members" about an institute that had one. A misleading answer is worse than a refusal — the refusal
      // can be acted on. So: a non-empty string becomes `{id}`, a well-formed object passes through, and anything
      // else is refused with the declared shape in the hint.
      const memberEntry = (m) => {
        if (typeof m === 'string' && m.trim() !== '') return { id: m.trim() }
        if (m && typeof m === 'object' && typeof m.id === 'string' && m.id.trim() !== '') return m
        return null
      }
      let explicitMembers = []
      if (explicit) {
        const bad = args.members.find((m) => memberEntry(m) === null)
        if (bad !== undefined) {
          return refused('VMU_INVALID_ARGUMENT',
            'members 的每一项必须是 {id, role} 或一个非空的成员 id 字符串；收到 ' + JSON.stringify(bad),
            'pass members:[{id, role}] or members:["m-1"] — omitting members entirely infers them from the roster')
        }
        explicitMembers = args.members.map(memberEntry)
      }
      const inferred = !explicit && kernel.members && typeof kernel.members.roster === 'function'
        ? kernel.members.roster().filter((m) => m && m.state === 'live').map((m) => ({ id: m.id, role: m.slot }))
        : []
      const members = explicit ? explicitMembers : inferred
      if (op === 'status') {
    const status = kernel.turn.status()
    // ★ PHASE 7 / round 17: the turn face used to call closureVoteOf with its DEFAULTS (roster []), so a seated member
    // with the vote permission still read eligible:[]. Use the kernel's ONE calculation instead of a second one.
    if (typeof kernel.closureVoteView === 'function') status.closureVote = kernel.closureVoteView()
    // ★ PHASE 9+ / round 12: `detail` used to be silently dropped (not even declared), so `detail:'closure'` returned
    // the FULL status and the caller could not tell whether it had been narrowed. It NARROWS here (the reason it
    // exists: status was large enough to be truncated), and any unknown value is a NAMED refusal, never a no-op.
    const detail = args.detail === undefined || args.detail === null ? null : String(args.detail)
    if (detail !== null && detail !== 'closure') {
      return refused('VMU_INVALID_ARGUMENT', 'unknown status detail: ' + detail,
        'known detail values: closure (omit detail for the full status)')
    }
    if (detail === 'closure') {
      return { ok: true, detail: 'closure',
        closureVote: status.closureVote || null,
        closureVoteWrites: Number.isInteger(status.closureVoteWrites) ? status.closureVoteWrites : 0 }
    }
    return { ok: true, status }
  }
      // ★★★ ROUND 73: THE CALLER-PLAYED TURN, SECOND HALF. When a host cannot lend an Agent, the assembled member
      // prompt is handed back to the CALLING session instead of being delivered to a subagent, and that session
      // returns the member's own reply here on the next call. The seam is the framework's own (`deliverByReturning`);
      // this face is where the reply arrives. Supplying one is optional, so a deployment with a real delivery seam is
      // unaffected.
      if (typeof args.reply === 'string' && kernel.turn && typeof kernel.turn.supplyMemberReply === 'function') {
        // ★ PASS THE MEMBER THE PROMPT BELONGED TO (see kernel/turn/index.js supplyMemberReply). Without it the reply is recorded
        // against whatever member the wakeup policy picked next, which is how a truthful vote landed on the wrong person.
        kernel.turn.supplyMemberReply(args.reply, typeof args.reply_for === 'string' && args.reply_for ? args.reply_for : null)
      }
      // ★ PHASE 8 / round 37: THREE SHAPES of tools:
      //   'none'                 -> empty face (deny all)
      //   { allow: [names...] }  -> ONLY those names (validated against the host catalogue)
      //   omitted                -> role narrowing exactly as today (zero mechanism)
      let toolsArg = args.tools
      // ★ The schema declares tools as a STRING (so 'none' is expressible), and the model may therefore send the object
      // form JSON-encoded. Normalize that ONE representation; everything else unknown is refused rather than ignored.
      if (typeof toolsArg === 'string' && toolsArg.trim() !== '' && toolsArg.trim() !== 'none' && toolsArg.trim().startsWith('{')) {
        try { toolsArg = JSON.parse(toolsArg) } catch (e) { return refused('VMU_INVALID_ARGUMENT', 'tools is not valid JSON: ' + String((e && e.message) || e), 'use none, or {"allow":["<tool>", ...]}, or omit tools') }
      }
      const isNone = toolsArg === 'none'
      const isAllow = toolsArg && typeof toolsArg === 'object' && !Array.isArray(toolsArg) && Array.isArray(toolsArg.allow)
      if (op === 'step' && toolsArg !== undefined && toolsArg !== null && !isNone && !isAllow) {
        return refused('VMU_INVALID_ARGUMENT', 'tools has an unsupported shape', 'use none, or {"allow":["<tool>", ...]}, or omit tools (role narrowing)')
      }
      if (op === 'step' && (isNone || isAllow)) {
        if (typeof kernel.setMemberToolOverride !== 'function' || typeof kernel.clearMemberToolOverride !== 'function') {
          return refused('VMU_ENGINE_UNAVAILABLE', 'this tools override needs the per-turn tool override seam',
            'assemble a kernel with setMemberToolOverride (the pull resolver owns the actual restriction)')
        }
        const ids = members.map((m) => m && m.id).filter((id) => typeof id === 'string' && id !== '')
        if (ids.length === 0) return refused('VMU_INVALID_ARGUMENT', 'this tools override needs at least one member', 'pass members:[{id, role}]')
        let allow = null
        if (isAllow) {
          allow = toolsArg.allow.filter((x) => typeof x === 'string')
          if (allow.length === 0) return refused('VMU_INVALID_ARGUMENT', 'tools.allow must not be empty', 'pass at least one registered tool name, or omit tools')
          if (typeof kernel.validateToolFaceNames !== 'function') {
            return refused('VMU_ENGINE_UNAVAILABLE', 'the host catalogue is not published, so tools.allow cannot be validated', 'assemble the host adapter first')
          }
          try { kernel.validateToolFaceNames(allow) } catch (e) {
            return refused((e && e.code) || 'VMU_INVALID_ARGUMENT', (e && e.message) || 'unknown tool name in tools.allow', (e && e.hint) || null)
          }
        }
        for (const id of ids) kernel.setMemberToolOverride({ member: id, all: isNone, allow })
        if (typeof kernel.setActiveTurnMember === 'function') kernel.setActiveTurnMember(ids[0])
        try {
          return await kernel.turn.step({ members, phase: args.phase, why: args.why, nextStep: args.next_step })
        } finally {
          if (typeof kernel.setActiveTurnMember === 'function') kernel.setActiveTurnMember(null)
          for (const id of ids) { try { kernel.clearMemberToolOverride(id) } catch { /* clear is best effort */ } }
        }
      }
      if (op === 'step') {
        const activeId = members.length > 0 && members[0] && typeof members[0].id === 'string' ? members[0].id : null
        if (activeId && typeof kernel.setActiveTurnMember === 'function') kernel.setActiveTurnMember(activeId)
        try { return await kernel.turn.step({ members, phase: args.phase, why: args.why, nextStep: args.next_step }) }
        finally { if (typeof kernel.setActiveTurnMember === 'function') kernel.setActiveTurnMember(null) }
      }
      if (op === 'drive') return await kernel.turn.drive({ members, rounds: args.rounds, phase: args.phase, why: args.why, nextStep: args.next_step })
      return refused('VMU_INVALID_ARGUMENT', 'unknown op: ' + op, 'known ops: step, drive, status')
    }
    // ★ PHASE 8 / round 36: SERIALIZE the tool calls. Root may issue several step calls in ONE assistant message (parallel
    // tool calls); the active-member hint is a per-step scalar, so parallel steps would overwrite each other and a member
    // could receive another slot's deny list (measured: member-a got temp-a's 6-tool face). A single queue preserves the
    // caller's order and makes each step's active member unambiguous.
    let turnQueue = Promise.resolve()
    // ★ G6 tier 2 (measured on a real machine): A MEMBER TURN MUST NEVER RUN THE TURN ENGINE.
    // The real run put `vibe_vmu_turn` in a member's tools.allow; the member called it. The nested call did not
    // deadlock by itself — it QUEUED behind the very step that was delivering it, waited 175.7s, and made the outer
    // step hit its 180s delivery timeout. That timeout's `finally` cleared the active-member scalar, so the member's
    // NEXT model request resolved NO member and the host pull returned the full 87-tool host catalogue: the role
    // narrowing was bypassable from inside a member turn. Two guards, both here:
    //   · a non-root caller (child Agent id, not 'session-…') may only READ turn status; step/drive is refused BY NAME;
    //   · that read runs directly instead of entering the queue, so it can never wait behind its own step.
    const agentIdOf = (exec) => { try { return String((exec && exec.agent && exec.agent.id) || '') } catch { return '' } }
    const isMemberCaller = (id) => id !== '' && !id.startsWith('session-')
    const coreTurn = (args = {}, exec = null) => {
      const op = String((args && args.op) || 'status')
      const caller = agentIdOf(exec)
      const memberCaller = isMemberCaller(caller)
      if (memberCaller && op !== 'status') {
        return Promise.resolve(refused('VMU_NOT_PERMITTED',
          'a member turn cannot run the institute turn engine (op: ' + op + ')',
          'remove vibe_vmu_turn from tools.allow: the turn engine belongs to the root/office; a member acts through the faces its role grants and waits for the next step'))
      }
      if (memberCaller) return Promise.resolve(coreTurnInner(args, exec))
      const job = turnQueue.then(() => coreTurnInner(args, exec), () => coreTurnInner(args, exec))
      turnQueue = job.catch(() => {})
      return job
    }
    const runTurn = (args, exec) => coreTurn(args, exec)
    const executeTurn = async (args, exec) => JSON.stringify(await coreTurn(args, exec))
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
        detail: param('string', '仅 status：closure＝只回 closureVote（小回执）；未知值具名拒'),
        members: param('array', '本轮可唤醒的成员：[{id, role}]；缺省时由内核名册推断（无成员 ⇒ 合法空转）'),
        rounds: param('integer', 'drive 的轮数（必须为正整数；没有无限默认）'),
        phase: param('string', '相位：founding／normal／checkpoint／verify／verify-debate／meeting／resume'),
        why: param('string', '为什么唤醒（原预设的唤醒也带这一项）'),
        reply_for: param('string', '★ 这个回复属于哪个成员（它的提示词是上一次 step 交回的那个）；不传 = 沿用旧行为'),
      reply: param('string', '★ 由调用者扮演成员回合时：★ 上一次 step／drive 交回的成员提示词，★ 其【成员自己的回复】放在这里送回（★ 仅当交付接缝是 deliverByReturning 时需要）'),
        next_step: param('string', '下一步要做什么'),
        tools: param('string', '★ step 专用：none＝清空；或 JSON 字符串 {"allow":["<工具名>"]}＝只挂这些（校验后生效）；缺省＝按角色收窄'),
      },
      execute: executeTurn,
      run: runTurn,
  }
}
