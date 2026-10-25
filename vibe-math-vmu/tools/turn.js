// vibe-math-vmu/tools/turn.js — the turn tool spec, split out of host.js (round 538) so the host file stays inside the
// DECIDED 1200-line limit (docs/02). This block was SELF-CONTAINED - it defined its own core and two wrappers - so those 
// definitions move with the spec; the factory supplies only what the block genuinely took from the host scope.
//
// ★★★★★★★ LANE turn-reply: THE REPORT'S FIELDS COME FROM THE KERNEL'S OWN TABLE. `FIELD_OWNERS` is the field → face map
// the dispatcher actually uses, and `REPLY_FIELDS` adds the bookkeeping fields (`RECORDED_FIELDS`). A hand-written list
// here would drift the moment a face gains a field, and the published schema would then reject a legal report before the
// kernel had a chance to accept it - the same contract-versus-implementation gap this repo keeps paying for.
import { FIELD_OWNERS, REPLY_FIELDS } from '../kernel/turn/index.js'

const REPORT_FIELDS_DOC = REPLY_FIELDS
  .map((f) => (FIELD_OWNERS[f] ? f + '→' + FIELD_OWNERS[f].face + '.' + FIELD_OWNERS[f].op : f + '→书账'))
  .join('；')

export function makeTurnSpec({ param, refused, TOOL_NAMES, kernel }) {
    // ★★★ LIVE RUN 23: THE DELIVERED PROMPT COULD NOT BE READ BACK, SO A WHOLE CLASS OF ACCEPTANCE CHECK WAS UNPROVABLE.
    // The step receipt carries `memberPrompt.text`, but a receipt is bounded (12 000 bytes per tool result), so a
    // ~21 700-byte member prompt came back with its middle elided and its tail host-cut: the reader could not answer
    // "does this prompt say X anywhere", and the institute correctly refused to certify what it could not see. Reading
    // a truncated receipt and eyeballing the visible part is not verification. So the face REMEMBERS the full text of
    // the last few prompts it handed out and exposes op:"prompt", paged by offset/limit, stating the total, the page's
    // end and the next offset - the same characters the member received, readable in full.
    // The cache lives on the SPEC (one per assembled host), not inside the per-call core, so a page can be read after
    // the call that produced it returned. Bounded to the last few turns; an unknown turn is refused by name.
    const PROMPT_CACHE_LIMIT = 6
    const promptCache = new Map()
    // ★★ LIVE RUN 42 (the institute's own report, ㉝.2 ③): under activation (subagents) delivery the assembled prompt is
    // handed to the CHILD session, so this face never receives it and `op:"prompt"` could only say "nothing has been
    // assembled in this process yet" — a sentence that reads like a bug in the caller rather than a property of the
    // delivery mode. The mode is recorded from what the last step actually handed back, so the refusal can name it.
    let lastPromptMode = null
    // ★ ROUND 32 (run-32 report, readability item 1): the TURN store mints `t-<n>` and so does the TASK board, from
    // separate counters — `vibe_v5_hire` returns `task.id: "t-1"` while `vibe_vmu_turn` returns `memberPrompt.turnId: "t-1"`.
    // The ids cannot be renamed without invalidating every stored id, so the PROMPT side names its own table here; the
    // task side does the same in `packs/v5r/tools.js` (`task.idRegistry: "task-board"`).
    const labelPromptRegistry = (out) => {
      const p = out && out.memberPrompt
      if (p && typeof p === 'object' && p.turnIdRegistry === undefined) {
        p.turnIdRegistry = 'turn-store'
        p.turnIdMeans = 'turn ids are minted by the TURN store (`t-<n>`); the TASK board mints `t-<n>` from ITS own counter, so a bare id is ambiguous across receipts — this field names the table, and `task.idRegistry` names the other one'
      }
      return out
    }
    const rememberPrompt = (out) => {
      labelPromptRegistry(out)
      const p = out && out.memberPrompt
      const text = p && typeof p.text === 'string' ? p.text : null
      if (text) {
        // ★ LIVE RUN 24 (c-1) / RUN 25 (still red): the awaiting receipt names the turn as a STRING on the prompt object
        // (`memberPrompt.turnId: "t-1"`), and the old key-finder looked only at `out.turn.id` / `out.turnId`, so every
        // page was filed under a synthetic `anon-N` — while the SAME receipt carried the real id elsewhere
        // (`pending.turn`, `memberPrompt.turnId`). Run 25 caught it: the page said `anon-1`, the reader had `t-1`, and
        // the hint offered a name the caller had never been given. Read the id from EVERY shape it arrives in, and
        // refuse to invent one: a synthetic key is only used when the receipt truly carries no id at all.
        const idOf = (o) => {
          if (!o || typeof o !== 'object') return null
          const cands = [
            o.turn && typeof o.turn === 'object' ? o.turn.id : null,
            typeof o.turn === 'string' ? o.turn : null,
            o.turnId,
            o.memberPrompt && typeof o.memberPrompt === 'object' ? o.memberPrompt.turnId : null,
            o.pending && typeof o.pending === 'object' ? o.pending.turn : null,
          ]
          for (const c of cands) if (typeof c === 'string' && c !== '') return c
          return null
        }
        const id = idOf(out) || 'anon-' + (promptCache.size + 1)
        promptCache.delete(id)
        promptCache.set(id, text)
        while (promptCache.size > PROMPT_CACHE_LIMIT) promptCache.delete(promptCache.keys().next().value)
        lastPromptMode = 'caller'
      } else if (out && typeof out === 'object' && out.ok !== false) {
        // A round really happened and handed the text to a child session instead of returning it.
        lastPromptMode = 'activation'
      }
      return out
    }
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
        // ★★★ PHASE 12 / R16 (the institute's run-15 prompt carried the TEMP charter section to a 常驻研究员):
        // the seat is `slot` on the roster row and `role` on some older rows, so reading ONLY `slot` handed the loop
        // `role: undefined` — the section policy then could not tell a seat from a hole and emitted both role variants.
        ? kernel.members.roster().filter((m) => m && m.state === 'live').map((m) => ({ id: m.id, role: m.slot || m.role }))
        : []
      const members = explicit ? explicitMembers : inferred
      if (op === 'prompt') {
        const want = args.turn === undefined || args.turn === null || args.turn === '' ? null : String(args.turn)
        let id = want
        let text = null
        if (id === null) {
          if (promptCache.size === 0) {
            if (lastPromptMode === 'activation') {
              return refused('VMU_STATE', 'no member prompt was RETAINED: this face delivers in ACTIVATION mode, so the assembled prompt was handed to the child session and never returned here',
                'paging (op:"prompt") covers the CALLER-PLAYED route - set `vmu.turn.deliverMode:"caller"` and re-run to page prompts; the activation receipt names the child it went to')
            }
            return refused('VMU_STATE', 'no member prompt has been assembled in this process yet, so there is nothing to page',
              'run op:"step" first - the prompt that step hands you is the one this op pages')
          }          id = Array.from(promptCache.keys()).pop()
          text = promptCache.get(id)
        } else {
          text = promptCache.get(id) || null
          if (text === null) {
            return refused('VMU_NO_SUCH_OBJECT', 'no assembled member prompt is retained for turn ' + id,
              'retained turns: ' + (promptCache.size ? Array.from(promptCache.keys()).join(', ') : '(none - the cache is per process and bounded to the last ' + PROMPT_CACHE_LIMIT + ')'))
          }
        }
        const asInt = (v, dflt) => {
          if (v === undefined || v === null || v === '') return dflt
          const n = typeof v === 'number' ? v : Number(String(v))
          return Number.isFinite(n) && Math.floor(n) === n ? n : null
        }
        const offset = asInt(args.offset, 0)
        if (offset === null || offset < 0) {
          return refused('VMU_INVALID_ARGUMENT', 'offset must be a non-negative whole number of characters', 'omit offset to start at the beginning')
        }
        const askedLimit = asInt(args.limit, 6000)
        if (askedLimit === null || askedLimit < 1) {
          return refused('VMU_INVALID_ARGUMENT', 'limit must be a positive whole number of characters', 'omit limit for 6000')
        }
        const LIMIT_MAX = 9000
        const limit = Math.min(askedLimit, LIMIT_MAX)
        if (offset >= text.length) {
          return refused('VMU_INVALID_ARGUMENT', 'offset ' + offset + ' is past the end of this prompt (' + text.length + ' characters)',
            'page from 0 and follow nextOffset to the end')
        }
        const end = Math.min(text.length, offset + limit)
        return { ok: true, turn: id, chars: text.length, offset, limit,
          limitClamped: limit !== askedLimit, end, done: end >= text.length,
          nextOffset: end >= text.length ? null : end,
          text: text.slice(offset, end),
          pages: Math.ceil(text.length / limit) }
      }
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
      // ★★★★★★★ LANE turn-reply — THE PRIMARY REPORTING CHANNEL (08号决策). A member turn reports through THIS op; the
      // fenced json object stays supported as the COMPATIBILITY path (and is byte-for-byte the old path). Why the op is
      // here and not a new tool name: publishing a second tool name needs a TOOL_NAMES entry AND a TOOL_FACES row in
      // host.js (a host edit, and the host belongs to another lane), and the report belongs to the turn face anyway -
      // what it answers IS a turn. The op records the report into the kernel's ONE structured slot and answers with a
      // READBACK computed after recording, so the caller sees which fields were really taken, not what it hoped.
      if (op === 'reply') {
        if (!kernel.turn || typeof kernel.turn.supplyStructuredReply !== 'function') {
          return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel has no structured-report channel on the turn loop',
            'assemble a kernel that exposes turn.supplyStructuredReply; until then report through the fenced json object: op:"step" with reply:"```json { ... }```"')
        }
        // ★ ONE CALL, ONE CHANNEL. A report AND a text reply in the same call would put the same turn's answer in two
        // places at once, and the tool call has no delivery to attach the text to - so it is refused BY NAME instead of
        // being silently preferred, dropped or double-sent. The two channels DO combine when they arrive on different
        // calls (the kernel merges them and stamps source:'tool+text') - see the 08号决策 note in kernel/turn/index.js.
        if (typeof args.reply === 'string' && args.reply.trim() !== '') {
          return refused('VMU_INVALID_ARGUMENT',
            'this call carries BOTH a tool report and a text reply: one turn must not be answered through two channels in one call',
            'send the report alone with op:"reply", report:{...} — or send the text alone with op:"step", reply:"…"; the two channels merge only when they arrive on different calls (source:"tool+text")')
        }
        const rawReport = args.report === undefined || args.report === null ? null : args.report
        // The schema declares `report` as an object; a model can still hand it over JSON-encoded, and that ONE alternate
        // representation is normalised here (everything else unknown is refused, never ignored).
        let report = rawReport
        if (typeof rawReport === 'string') {
          try { report = JSON.parse(rawReport) } catch (e) {
            return refused('VMU_INVALID_ARGUMENT', 'report is not valid JSON: ' + String((e && e.message) || e),
              'pass report as an object literal: { say: "…", input: {…} }; known fields: ' + REPORT_FIELDS_DOC)
          }
        }
        if (!report || typeof report !== 'object' || Array.isArray(report) || Object.keys(report).length === 0) {
          return refused('VMU_INVALID_ARGUMENT', 'report is missing or empty: this call records nothing',
            'pass report:{ <field>: <value> } with at least one field; known fields: ' + REPORT_FIELDS_DOC)
        }
        const forMember = typeof args.reply_for === 'string' && args.reply_for ? args.reply_for : null
        // ★ THE KERNEL'S REFUSALS ARE THE ANSWER. supplyStructuredReply refuses by name (no open member turn ⇒
        // VMU_TURN_NO_PENDING_MEMBER, second report for the same turn ⇒ VMU_TURN_REPLY_CONFLICT, no recognised field ⇒
        // VMU_TURN_UNKNOWN_FIELD, reply_for mismatch ⇒ VMU_INVALID_ARGUMENT); this face must not re-decide any of it -
        // it only maps the thrown refusal into the tool's returned shape, hint untouched.
        try {
          return await kernel.turn.supplyStructuredReply(report, { forMember })
        } catch (e) {
          return refused((e && e.code) || 'VMU_ENGINE_UNAVAILABLE', (e && e.message) || String(e), (e && e.hint) || null)
        }
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
          // ★ LIVE RUN 24 (c-2): the override changed the pull resolver's face, but the receipt said NOTHING about it, so
          // a reader could not tell "none took effect" from "none was ignored" — and the prompt's own text no longer
          // claims this-turn availability, which made the silence the only remaining signal. The receipt now reports what
          // the face DID (it called the seam for these members) and names the seam, so the claim is exactly as strong as
          // the evidence and no stronger.
          // ★★ b-2: the receipt must say WHICH roster these members came from - a caller cannot tell a default roster
          // from its own selection by looking at the ids alone.
          const membersFrom = explicit ? 'caller-selection' : 'roster-default'
          const stepped = await kernel.turn.step({ members, membersFrom, membersInferred: !explicit, phase: args.phase, why: args.why, nextStep: args.next_step })
          const withOverride = stepped && typeof stepped === 'object'
            ? Object.assign({}, stepped, { toolsOverride: { mode: isNone ? 'none' : 'allow', allow: isNone ? [] : (allow || []), members: ids,
              seam: 'setMemberToolOverride', note: 'reported by the turn face: the seam was set for these members before the round and cleared after it; the actual wire is narrowed by the pull resolver on its next request, which this face cannot read' } })
            : stepped
          // ★★★ b-4 (live run 44): the office DELEGATED this turn but the receipt never named what it delegated. The id
          // and the size exist; the preset comes from the live config. childId stays null while awaiting and the field
          // says so, because inventing it would be the class of lie this phase exists to remove.
          const delegated = withOverride && withOverride.awaiting === true
            ? Object.freeze({
              mode: 'subagents',
              preset: (cfg && cfg.deliverPreset) || null,
              turnId: (withOverride.memberPrompt && withOverride.memberPrompt.turnId) || null,
              promptChars: withOverride.memberPrompt && typeof withOverride.memberPrompt.chars === 'number' ? withOverride.memberPrompt.chars : null,
              childId: withOverride.childId || null,
              childIdMeans: 'the child session id is reported when this turn SETTLES; null while the turn is awaiting',
            })
            : null
          return rememberPrompt(delegated === null ? withOverride : Object.assign({}, withOverride, { delegation: delegated }))
        } finally {
          if (typeof kernel.setActiveTurnMember === 'function') kernel.setActiveTurnMember(null)
          for (const id of ids) { try { kernel.clearMemberToolOverride(id) } catch { /* clear is best effort */ } }
        }
      }
      // ★★★ THE CLOSURE READING BELONGS ON EVERY TURN RECEIPT, NOT ONLY ON status/clore. The SLV acceptance criterion is
      // "closureVote.cast === true", and on the final live run the only evidence for it was the AGENT'S OWN PROSE quoting a status call -
      // a machine-checkable criterion was being judged from a human-readable narrative. That is the same defect class as everything else
      // this round: a value that exists but is not carried where the consumer looks. Both writers below now attach the kernel's ONE
      // calculation (kernel.closureVoteView, the same source status/closure use) so every step receipt answers "is the institute closed?"
      // without a second call, and a scripted run can read it as a FIELD.
      const withClosure = (out) => {
        if (!out || typeof out !== 'object') return out
        if (typeof kernel.closureVoteView !== 'function') return out
        try { return Object.assign({}, out, { closureVote: kernel.closureVoteView() }) } catch { return out }
      }
            if (op === 'step') {
        const activeId = members.length > 0 && members[0] && typeof members[0].id === 'string' ? members[0].id : null
        if (activeId && typeof kernel.setActiveTurnMember === 'function') kernel.setActiveTurnMember(activeId)
        try { return rememberPrompt(withClosure(await kernel.turn.step({ members, membersFrom: explicit ? 'caller-selection' : 'roster-default', membersInferred: !explicit, phase: args.phase, why: args.why, nextStep: args.next_step }))) }
        finally { if (typeof kernel.setActiveTurnMember === 'function') kernel.setActiveTurnMember(null) }
      }
      if (op === 'drive') return withClosure(await kernel.turn.drive({ members, rounds: args.rounds, phase: args.phase, why: args.why, nextStep: args.next_step }))
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
    // ★★★★★★★ LANE turn-reply: `reply` JOINS `status` AS A MEMBER-SAFE OP. The whole point of the tool channel is that the
    // MEMBER reports from inside its own turn; the G6 guard below must therefore let that one writing op through, and it
    // must run it DIRECTLY (not queued): the member's call arrives while its own step is still in flight, and a queued
    // member call is exactly what deadlocked for 175.7s and bypassed role narrowing. `step`/`drive` stay root-only.
    const coreTurn = (args = {}, exec = null) => {
      const op = String((args && args.op) || 'status')
      const caller = agentIdOf(exec)
      const memberCaller = isMemberCaller(caller)
      const memberAllowed = op === 'status' || op === 'reply'
      if (memberCaller && !memberAllowed) {
        return Promise.resolve(refused('VMU_NOT_PERMITTED',
          'a member turn cannot run the institute turn engine (op: ' + op + ')',
          'remove vibe_vmu_turn from tools.allow: the turn engine belongs to the root/office; a member reports with op:"status" (read) or op:"reply" (report), and acts through the faces its role grants'))
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
        'prompt is assembled by the pipeline), drive runs a bounded number, status reports what the loop has done, ' +
        'reply records the member\'s structured report for the open turn (the primary reporting channel - the fenced ' +
        'json object in reply stays supported as the compatibility path). ' +
        'A round with no members is a legal no-op; a failed round is returned with its code rather than thrown.',
      // ★ PHASE 7 / round 20: this block used to be a FULL JSON SCHEMA passed where the host expects a PARAM MAP.
      // toHostParameters() then wrapped it once more, so the PUBLISHED schema had properties named type/properties/required
      // and a real "properties" object - the model (correctly) put its arguments INSIDE that object, so top-level keys like
      // tools:'none' never reached coreTurn. It is a param map now, exactly like every other tool.
      parameters: {
        op: param('string', 'step＝一轮／drive＝连跑若干轮／reply＝汇报本回合（工具通道，首选）／status＝读数／prompt＝分页读回本进程交出的成员提示词原文（step 回执里的 memberPrompt 会被回执上限截断，这里不会）', { required: true }),
        turn: param('string', '仅 prompt：要读哪一轮的提示词（省略＝最近一轮）'),
        offset: param('integer', '仅 prompt：从第几个字符开始（省略＝0）'),
        limit: param('integer', '仅 prompt：本页最多多少字符（省略＝6000，上限 9000；被夹到上限时回执 limitClamped:true）'),
        detail: param('string', '仅 status：closure＝只回 closureVote（小回执）；未知值具名拒'),
        members: param('array', '本轮可唤醒的成员：[{id, role}]；缺省时由内核名册推断（无成员 ⇒ 合法空转）'),
        rounds: param('integer', 'drive 的轮数（必须为正整数；没有无限默认）'),
        phase: param('string', '相位：founding／normal／checkpoint／verify／verify-debate／meeting／resume'),
        why: param('string', '为什么唤醒（原预设的唤醒也带这一项）'),
        reply_for: param('string', '★ 这个回复属于哪个成员（它的提示词是上一次 step 交回的那个）；不传 = 沿用旧行为'),
        // ★★★★★★★ LANE turn-reply: THE REPORT ITSELF. The field names below are DERIVED from the kernel's field table
        // (see the import at the top of this file), never hand-copied; the JSON type of each field is the dispatcher's
        // business (the kernel's field gate refuses what it cannot dispatch), so this schema declares only the ONE legal
        // container shape and leaves the per-field shapes to the owner that dispatches them.
        report: param('object', '★ op:"reply"：★ 本回合的结构化汇报（对象）。字段与围栏 JSON 完全同一张表：' + REPORT_FIELDS_DOC +
          '。未知字段由内核按 vmu.turn.unknownReplyFieldMode 收下或具名拒；空对象与"一个字段都不认识"都具名拒'),
      reply: param('string', '★ 兼容通道（仅当交付接缝是 deliverByReturning 时需要）：★ 上一次 step／drive 交回的成员提示词，★其【成员自己的回复】放在这里送回；★ 首选是用 op:"reply" 的 report 汇报'),
        next_step: param('string', '下一步要做什么'),
        tools: param('string', '★ step 专用：none＝清空；或 JSON 字符串 {"allow":["<工具名>"]}＝只挂这些（校验后生效）；缺省＝按角色收窄'),
      },
      execute: executeTurn,
      run: runTurn,
  }
}
