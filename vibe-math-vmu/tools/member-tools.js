// vibe-math-vmu/tools/member-tools.js — PHASE 8 / B-1: the FRAMEWORK'S OWN introspection tool.
//
// WHY THIS IS KERNEL-SIDE: "what can this member call right now?" is answered by the kernel's tool table plus the
// visible-tools provider (`turn.visibleToolsOf`); it is not an institution's vocabulary. The pack alias
// `vibe_v5_tool_help` becomes a thin forwarder to this same reading (B-1), not a second implementation.
//
// SOURCE OF TRUTH: names come from the LIVE provider only. No live Agent ⇒ the provider's named refusal propagates;
// this face never returns an empty list and calls it success. Purposes come from the host's published descriptions,
// registered with `kernel.setToolFaceDescriptions`; an unregistered name gets `purpose:null` rather than an invented one.
export function makeMemberToolsSpec({ param, refused, TOOL_NAMES, kernel }) {
  return {
    name: TOOL_NAMES.memberTools,
    description: '本成员此刻【真实可见】的工具表：名字来自内核的 visible-tools provider（不是 pack 声明），每项附一句用途。只读。无 live Agent ⇒ 具名拒。',
    parameters: {
      member: param('string', '成员 id（必填；没有 live Agent 的成员会被具名拒，而不是返回空表）', { required: true }),
    },
    // ★ tools/ 下每个面都写成 `run: async ({ … } = {}, exec) => …`，本面也一样 —— 校验工具参数形状的门禁
    // 读的就是这个签名（units: vmu-tools-action-arity）。本面是**单用途**（没有 action/op），所以它只解构 `member`。
    run: async ({ member: memberId } = {}, exec = null) => {
      const args = { member: memberId }
      const member = typeof args.member === 'string' ? args.member : ''
      if (!member) return refused('VMU_INVALID_ARGUMENT', 'vibe_vmu_tools needs member', 'pass member:"<roster id>"')
      if (!kernel || typeof kernel.toolsView !== 'function') {
        return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel has no toolsView reader',
          'assemble a kernel with the visible-tools provider (host adapter)')
      }
      // ★ A tool runs on the caller's Agent; pass it when this is a child (root ids are 'session-…'). The kernel's
      // provider path stays for out-of-turn calls (where there is no caller Agent).
      const caller = exec && exec.agent ? exec.agent : null
      const agent = caller && typeof caller.id === 'string' && !caller.id.startsWith('session-') ? caller : null
      const view = kernel.toolsView({ member, agent })
      // ★★★★★★★ TASK-13 / LIVE RUN 31 — VOICE AND SCOPE, NAMED ON EVERY ANSWER.
      //
      // WHAT RUN 31 MEASURED. A member, INSIDE its own child session, called `vibe_v5_tool_help` for itself and was told
      // `no live Agent for member res-01 (session=(none learned yet))` — it did not know that the session it was running
      // in WAS the session being looked for, and the sentence read as "this member has no tool face at all". That second
      // misreading is the expensive one: a member that believes it cannot see its own tools stops trying, and the office
      // reads the resulting silence as a member that sees nothing. The underlying readers have since been fixed (the
      // caller's live Agent is consulted first, and the kernel learns the child id from every step receipt), so what is
      // left is to make the ANSWER say which voice and which scope it was computed in. Two fields do that, and the note
      // is composed from the same facts — never from the member's assumed intent:
      //   `voice`        'member' when a live CHILD Agent made the call (it is standing in a member session), 'office'
      //                  for a root-session or out-of-turn call. Root agent ids start with 'session-', so this is read
      //                  from the id, not guessed from the roster.
      //   `readingScope` 'caller-live-agent'  — the table was read from the caller's own live Agent: it IS this member's
      //                                        own tool face when `callerIsThisMember` is true;
      //                  'provider-live-agent' — read through the kernel's visible-tools provider, which found a live Agent;
      //                  'office-view-unreadable' — no live table could be read at all: `tools:null` means "not readable
      //                                        from here", NOT "the member sees nothing".
      const callerId = agent && typeof agent.id === 'string' ? agent.id : null
      const voice = callerId === null ? 'office' : 'member'
      let learnedSession = null
      try {
        const turn = kernel && kernel.turn ? kernel.turn : null
        if (turn && typeof turn.memberSession === 'function') learnedSession = turn.memberSession(member)
        else if (typeof kernel.memberSession === 'function') learnedSession = kernel.memberSession(member)
      } catch { learnedSession = null }
      learnedSession = typeof learnedSession === 'string' && learnedSession !== '' ? learnedSession : null
      const callerIsThisMember = callerId === null || learnedSession === null ? null : callerId === learnedSession
      const toolsReadable = Array.isArray(view && view.tools)
      const readingScope = view && view.source === 'caller'
        ? 'caller-live-agent'
        : (toolsReadable ? 'provider-live-agent' : 'office-view-unreadable')
      const kernelNote = view && typeof view.note === 'string' && view.note !== '' ? view.note : null
      const note = (() => {
        if (readingScope === 'caller-live-agent') {
          if (callerIsThisMember === true) {
            return '这是成员自己的读数：工具表是从调用者自己的 live Agent（' + callerId + '）读出的，而这个 Agent 正是运行成员 "'
              + member + '" 的子会话（' + learnedSession + '）。所以这张表就是你此刻真正能调用的工具，不是办公室替你猜的视角'
          }
          if (callerIsThisMember === false) {
            return '注意视角：调用者是 ' + callerId + '，而内核为成员 "' + member + '" 学到的子会话是 ' + learnedSession
              + '。这张表是【另一个子会话】的工具表 —— 不是被问成员自己的工具面。问自己请传你所在会话对应的成员 id'
          }
          return '工具表来自调用者自己的 live Agent（' + callerId + '）；内核尚未为成员 "' + member + '" 学到任何子会话 id，'
            + '所以无法判断这个调用者是不是该成员本人。这不是"成员看不见工具"的读数'
        }
        if (readingScope === 'provider-live-agent') {
          return '工具表来自内核的 visible-tools provider，它找到了成员 "' + member + '" 的 live Agent 并读出了真实可见的工具名'
        }
        // ★ THE HONEST OFFICE NOTE. `tools:null` is the one reading that gets misquoted as "the member is blind", so the
        // sentence states the scope first and the meaning second, and when the CALLER is itself a member it says outright
        // that this is the office-side reading rather than the caller's own table.
        const office = '【办公室视角的读数】这里读不到成员 "' + member + '" 的 live 工具表（tools:null）：null 的意思是"从这一侧读不到"，'
          + '既不是"成员看不见任何工具"，也不是"成员什么都没做"'
        const where = learnedSession !== null
          ? '成员 "' + member + '" 学到的子会话是 ' + learnedSession + '，它已经结束，所以没有 live Agent 可查'
          : '内核尚未为成员 "' + member + '" 学到子会话 id（该成员还没有在本进程里结算过任何回合，或 seam 没报 childId）'
        if (voice === 'office') return office + '。' + where + '。要读它自己的工具表，请读该子会话的日志，或先投递一个回合让 child id 被学到'
        return office + '。' + where + '。★ 你此刻处在成员语气里（调用者是 live 子 Agent ' + callerId + '），'
          + '但拿到的是办公室这一侧能算出来的读数，不是你自己会话的工具表；要读你自己会话的真实工具表，'
          + '请让该会话的 live Agent 调用本工具（或读该会话的日志）'
      })()
      return {
        ...view,
        tool: TOOL_NAMES.memberTools,
        // ★ these three travel because a reader must not have to parse the sentence to learn the scope
        voice,
        readingScope,
        callerIsThisMember,
        memberSession: learnedSession,
        memberSessionMeans: learnedSession !== null
          ? 'the child session this kernel holds for "' + member + '" (in memory, per kernel instance): the session that ran its last settled turn — the one a continued turn would resume'
          : 'NOT LEARNED YET for "' + member + '": no child id has reached this kernel for it, so there is no session to read and none to continue',
        callerMeans: voice === 'member'
          ? 'the caller is a live child Agent (' + callerId + '), i.e. this call was made from INSIDE a member session'
          : 'the caller is a root session (or an out-of-turn call with no caller Agent), so this is the OFFICE view of the member',
        note: kernelNote === null ? note : kernelNote + ' | ' + note,
      }
    },
  }
}
