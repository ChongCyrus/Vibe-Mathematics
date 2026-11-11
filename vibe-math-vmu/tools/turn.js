// vibe-math-vmu/tools/turn.js — the turn tool spec, split out of host.js (round 538) so the host file stays inside the
// DECIDED 1200-line limit (docs/02). This block was SELF-CONTAINED - it defined its own core and two wrappers - so those 
// definitions move with the spec; the factory supplies only what the block genuinely took from the host scope.
//
// ★★★★★★★ LANE turn-reply: THE REPORT'S FIELDS COME FROM THE KERNEL'S OWN TABLE. `FIELD_OWNERS` is the field → face map
// the dispatcher actually uses, and `REPLY_FIELDS` adds the bookkeeping fields (`RECORDED_FIELDS`). A hand-written list
// here would drift the moment a face gains a field, and the published schema would then reject a legal report before the
// kernel had a chance to accept it - the same contract-versus-implementation gap this repo keeps paying for.
import { FIELD_OWNERS, REPLY_FIELDS } from '../kernel/turn/index.js'

// ★★★★★★★ TB-2733 / RUN 78 D8 (FEEDBACK78): A MEMBER'S TURN FACE MUST ADVERTISE THE OPS IT CAN ACTUALLY RUN.
// RUN 78: the member wire carried the WHOLE turn engine (the host has no seat table for host faces, so nothing narrows
// this face for a member), member r-3 called op:"step" at t-17, got VMU_NOT_PERMITTED, and the hint told it to "remove
// vibe_vmu_turn from tools.allow" - a lever a member cannot pull, and one the office had never set. A refusal whose
// remedy is unreachable is the defect, not the refusal.
// ONE constant drives FOUR exits: the op description's member sentence, the runtime guard, the refusal hint, and the
// status receipt. Copying the list four times is how wire/guard/receipt drift apart (TB-2710, TB-2712, TB-2720); adding
// an op for a member is ONE edit here and every exit moves with it. The member set is { status } by the TB-2733 ruling:
// reading your OWN last settled turn is a delivered capability (RUN 75 F75-06); running the engine belongs to the office.
export const MEMBER_TURN_OPS = Object.freeze(['status'])
export const memberOpsText = () => 'members may call only ' + MEMBER_TURN_OPS.map((o) => 'op:"' + o + '"').join(' or ') + ' (read your own turns)'

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
      // ★★★ TB-2739 (E) / RUN 79: A RECEIPT THAT HANDS OVER A PROMPT MUST SAY WHETHER THE STATUS BLOCK IS IN IT. The
      // 79th live run's office paged the same text and reported the block absent while the code has two routes that put
      // it in; the reader had to grep a capture to form an opinion. The assembly now computes the reading on the exact
      // string delivery receives (`kernel.turn.statusBlockReading`), and it rides on the prompt object here, so "is the
      // board in what this member was told" is a receipt field and not an inference.
      if (p && typeof p === 'object' && p.statusBlock === undefined && typeof p.turnId === 'string'
        && kernel.turn && typeof kernel.turn.statusBlockReading === 'function') {
        const reading = kernel.turn.statusBlockReading(p.turnId)
        if (reading && typeof reading === 'object') {
          p.statusBlock = reading
          p.statusBlockMeans = 'the assembly measured this on the text it handed to delivery: `included` is whether the composed status text occurs in that string (true = the member was told; false = a framework defect), `appendedLiterally` says which of the two routes put it there, and `chars` is how long the block was. A resumed turn reuses the caller-held prompt and assembles nothing, so it reports no reading rather than a guess'
        }
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
    // ★★★ RUN 256 / TB-2616: A PARKED REFUSAL CARRIES FACTS THE GENERIC FUNNEL WOULD DROP. `VMU_TURN_PARKED_NEEDS_OWNER`
    // is only useful if the caller can see WHY a reply was refused and WHAT happened to it. The generic refusal funnel
    // keeps code/message/hint and loses parkedFacts/parkedReason/parkedReplyDiscarded, and the simulator's negative face
    // (scripts/sim/scenarios/turns.mjs, `probe-step-needs-owner`) measures exactly those three. ONE predicate for both
    // step faces: a parked refusal becomes a RECEIPT (named, with its facts); every other thrown error still propagates.
    const parkedRefusal = (e) => {
      if (!e || typeof e !== 'object' || e.code !== 'VMU_TURN_PARKED_NEEDS_OWNER') return null
      return {
        ok: false, tool: 'vibe_vmu_turn', op: 'step', code: e.code,
        message: String((e && e.message) || e), hint: (e && e.hint) || null,
        parkedFacts: (e && e.parkedFacts) || null,
        parkedReason: (e && e.parkedReason) || null,
        parkedReplyDiscarded: e.parkedReplyDiscarded === true,
        parkedReplyDiscardedMeans: 'the supplied reply was DISCARDED: there was no parked prompt for it to answer, and handing it to the next turn would attribute a member\'s words to a turn they were not answering. Park first (op:"drive" or an op:"step" that returns awaiting:true), then answer that prompt with the same member.',
      }
    }
    const coreTurnInner = async (args = {}, exec = null) => {
      void exec
      if (!kernel.turn) return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel exposes no turn loop')
      // The face refuses a MISSING op by name (VMU_TURN_OP_MISSING, see coreTurn); this default now only covers a direct
      // call into the inner core, and it is never how a tool call is answered.
      const op = String(args.op || 'status')
      // ★★★ TASK-173 / TB-2690 (F75-12): THE DELIVERY MODE HAS A PER-CALL DOOR ON THIS FACE. `vmu.turn.deliverMode` is
      // resolved once at construction (`host-deliver.js`), and a config-declared mode shadows it - so the 75th live run's
      // fourteen member turns were all activation/continuation and the caller route (the member's prompt comes back to the
      // calling session, which plays the turn) was unreachable. `deliver_mode` overrides THAT CALL only: it is threaded onto
      // the turn, changes no configuration, persists nothing, and the receipt reports `deliveryPath` /
      // `deliverModeSource` (arg|config|setting) / `deliverModeReason`. An unknown value is refused BY NAME, because a typo
      // that silently fell back to the deployment default would look exactly like "the override worked".
      const deliverModeGiven = Object.prototype.hasOwnProperty.call(args, 'deliver_mode') || Object.prototype.hasOwnProperty.call(args, 'deliverMode')
      const deliverModeRaw = Object.prototype.hasOwnProperty.call(args, 'deliver_mode') ? args.deliver_mode : args.deliverMode
      let deliverModeArg = null
      if (deliverModeGiven) {
        const v = deliverModeRaw === null || deliverModeRaw === undefined ? '' : String(deliverModeRaw).trim()
        if (v !== 'caller' && v !== 'subagents') {
          return refused('VMU_INVALID_ARGUMENT', 'unknown deliver_mode: ' + JSON.stringify(deliverModeRaw === undefined ? null : deliverModeRaw),
            'deliver_mode is a PER-CALL route: "caller" - the CALLING session plays this member turn and the reply comes back on the next call; "subagents" - the host runs the member turn. Omit the argument to use the deployment default (the receipt names it in deliverModeSource). Known values: caller | subagents')
        }
        if (op !== 'step' && op !== 'drive') {
          return refused('VMU_INVALID_ARGUMENT', 'deliver_mode applies to op:"step" and op:"drive" only; this call is op:"' + op + '"',
            'the delivery mode decides how THIS turn is played, so it is only meaningful where a turn is dispatched. Call op:"step" or op:"drive" with deliver_mode, or omit it')
        }
        deliverModeArg = v
      }
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
      const listed = Array.isArray(args.members) && args.members.length > 0
      // ★★★ LIVE RUN 29 (the institute's own acceptance brief, step ②, receipt seq 48): THE SINGULAR SHORTHAND WAS
      // SILENTLY SWALLOWED BY THIS FACE. The framework's own chair-rail hint teaches
      // `vibe_vmu_turn {op:"step", member:"academician-1"}`, and the orchestrator honours that shorthand — but only
      // when `members` is EMPTY (kernel/turn/index.js:2288, "one place, honoured by both faces"). This face fills
      // `members` from the roster whenever the caller omits them, so the singular id arrived beside a three-name
      // default list and LOST: the receipt read `requestedMembers:[]` with
      // `requestedMembersSource:"roster-default"`, and the loop woke whoever the cursor happened to point at. The
      // brief had named a member; the receipt claimed nobody had. A caller that NAMED somebody is honoured or
      // refused, never reinterpreted — so a lone `member` IS an explicit one-member selection here, and it travels
      // as such (`membersFrom:"caller-selection"`, `membersInferred:false`) instead of as an inferred roster.
      const singleMember = !listed && typeof args.member === 'string' && args.member.trim() !== ''
        ? { id: args.member.trim() }
        : null
      const explicit = listed || singleMember !== null
      // ★★ RUN 30 (the institute's own report, item ②): THE FACE NOW NORMALISES, SO THE FACE MUST NAME THE SHAPE.
      // A singular `member` is turned into a one-seat `members` list (the run-29 fix above), which means the kernel can
      // no longer see which parameter the caller actually used: it looked at its own `members` argument and printed
      // "the caller named `members`" for a call that had passed `member`. Behaviour right, sentence wrong. The shape is
      // known HERE and nowhere else, so it travels as `selectionShape` and the kernel's note is derived from it.
      const selectionShape = listed ? 'members' : (singleMember !== null ? 'member' : 'roster-default')
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
      if (listed) {
        const bad = args.members.find((m) => memberEntry(m) === null)
        if (bad !== undefined) {
          return refused('VMU_INVALID_ARGUMENT',
            'members 的每一项必须是 {id, role} 或一个非空的成员 id 字符串；收到 ' + JSON.stringify(bad),
            'pass members:[{id, role}] or members:["m-1"] — omitting members entirely infers them from the roster')
        }
        explicitMembers = args.members.map(memberEntry)
      } else if (singleMember !== null) {
        explicitMembers = [singleMember]
      }
      const inferred = !explicit && kernel.members && typeof kernel.members.roster === 'function'
        // ★★★ PHASE 12 / R16 (the institute's run-15 prompt carried the TEMP charter section to a 常驻研究员):
        // the seat is `slot` on the roster row and `role` on some older rows, so reading ONLY `slot` handed the loop
        // `role: undefined` — the section policy then could not tell a seat from a hole and emitted both role variants.
        ? kernel.members.roster().filter((m) => m && m.state === 'live').map((m) => ({ id: m.id, role: m.slot || m.role }))
        : []
      const members = explicit ? explicitMembers : inferred
      // ★ E12 / task-19: the meeting a step or drive belongs to travels WITH the dispatch, not only with the answer.
      // Without it the loop assembled the turn unbound, the member's `say` reached the dispatch with no meeting to
      // speak into, and the receipt explained the silence as `reason:"no-meeting-bound"` - the member was blamed for a
      // binding the caller never made. Normalized once here so all three call sites send the same value (an empty
      // string and an absent arg both mean "no binding", never a meeting named '').
      const forMeetingArg = typeof args.meeting === 'string' && args.meeting.trim() !== '' ? args.meeting.trim() : null
      // ★★ ROUND 240 / FEEDBACK63 ①4: the DOOR a turn came through is part of its receipt (`openedBy` in op:"status"
      // turns[]). The loop defaults to 'drive' because the caller's own step/drive is the common case; a caller that is
      // settling a turn a MEETING WAKE produced passes opened_by:"wait", so the row does not claim the office opened it by
      // hand. The vocabulary belongs to the loop (drive/activation/wait) - this face forwards the word and re-decides none.
      const openedByArg = typeof args.opened_by === 'string' && args.opened_by.trim() !== '' ? args.opened_by.trim() : null
      if (op === 'prompt') {
        const want = args.turn === undefined || args.turn === null || args.turn === '' ? null : String(args.turn)
        // ★★★ TB-2739 (C) / RUN 79 (B4): `member` IS A SELECTOR, NOT DECORATION. Measured live: the office called
        // `{op:"prompt", member:"r-temp", limit:9000}` and got the prompt of `t-13` — a turn that belonged to ANOTHER
        // seat — while the receipt filled `actedForMember:"r-temp"` as if the page had been the temp's. A caller that
        // names a seat asked for THAT seat's prompt; answering with a neighbour's text and echoing the name back turns a
        // wrong answer into a confident one. So the seat selects its own most recent retained prompt, and when both a
        // turn id and a seat are named they must AGREE (a mismatch is refused by name with a route to the right id).
        const wantMember = typeof args.member === 'string' && args.member.trim() !== '' ? args.member.trim() : null
        let id = want
        let text = null
        let promptFor = null
        if (wantMember !== null) {
          const promptOfOne = (tid) => (kernel.turn && typeof kernel.turn.promptOf === 'function' ? kernel.turn.promptOf(tid) : null)
          if (want !== null) {
            const named = promptOfOne(want)
            const turnMember = named && typeof named.member === 'string' ? named.member : null
            if (turnMember !== null && turnMember !== wantMember) {
              return refused('VMU_INVALID_ARGUMENT', 'turn ' + want + ' is seat ' + turnMember + '\'s prompt, not ' + wantMember + '\'s: naming both a turn and a seat asks for two different pages',
                'REACHABLE INSTEAD: drop `member` to read ' + want + ' (it belongs to ' + turnMember + '), or drop `turn` to read ' + wantMember + '\'s most recent prompt')
            }
          } else {
            const ids = kernel.turn && typeof kernel.turn.promptTurns === 'function' ? kernel.turn.promptTurns() : []
            const mine = ids.filter((tid) => { const hit = promptOfOne(tid); return hit && hit.member === wantMember })
            if (mine.length === 0) {
              const seated = ids.map((tid) => { const hit = promptOfOne(tid); return hit && hit.member }).filter(Boolean)
              return refused('VMU_NO_SUCH_OBJECT', 'no assembled member prompt is retained for seat ' + wantMember,
                'retained seats: ' + (Array.from(new Set(seated)).join(', ') || '(none in this process: the kernel archive is bounded to its own cap, and the tool-face cache to ' + PROMPT_CACHE_LIMIT + ')'))
            }
            id = mine[mine.length - 1]
            text = promptOfOne(id) ? promptOfOne(id).text : null
          }
          promptFor = { member: wantMember, turnId: id, turnMember: wantMember, means: 'the seat you named selected its OWN most recent retained prompt: `turnMember` is the seat the archive says assembled this text, so a page can never answer with a neighbour\'s biography' }
        }
        // ★ LIVE RUN 51 item 3: THE KERNEL KEEPS THE ASSEMBLED TEXT ON EVERY DELIVERY PATH. This face caches it only when
        // the receipt carries `memberPrompt.text`, which an ACTIVATION receipt never does (the text went to the child
        // session), so after four settled rounds the cache was empty and `op:"prompt"` refused while the tool promises
        // paged access. Ask the kernel before refusing: a prompt that exists is not a prompt that may be reported missing.
        const kernelTurns = kernel.turn && typeof kernel.turn.promptTurns === 'function' ? kernel.turn.promptTurns() : []
        const kernelTextOf = (tid) => {
          if (!kernel.turn || typeof kernel.turn.promptOf !== 'function') return null
          const hit = kernel.turn.promptOf(tid)
          return hit && typeof hit.text === 'string' ? hit.text : null
        }
        if (id === null) {
          if (promptCache.size === 0 && kernelTurns.length === 0) {
            if (lastPromptMode === 'activation') {
              return refused('VMU_STATE', 'no member prompt was RETAINED: this face delivers in ACTIVATION mode, so the assembled prompt was handed to the child session and never returned here',
                'paging (op:"prompt") covers the CALLER-PLAYED route - set `vmu.turn.deliverMode:"caller"` and re-run to page prompts; the activation receipt names the child it went to')
            }
            return refused('VMU_STATE', 'no member prompt has been assembled in this process yet, so there is nothing to page',
              'run op:"step" first - the prompt that step hands you is the one this op pages')
          }
          id = promptCache.size ? Array.from(promptCache.keys()).pop() : kernelTurns[kernelTurns.length - 1]
          text = promptCache.get(id) || kernelTextOf(id)
        } else {
          text = promptCache.get(id) || kernelTextOf(id)
          if (text === null) {
            return refused('VMU_NO_SUCH_OBJECT', 'no assembled member prompt is retained for turn ' + id,
              'retained turns: ' + (promptCache.size || (kernel.turn && typeof kernel.turn.promptTurns === 'function' && kernel.turn.promptTurns().length) ? Array.from(new Set(Array.from(promptCache.keys()).concat(kernel.turn && typeof kernel.turn.promptTurns === 'function' ? kernel.turn.promptTurns() : []))).join(', ') : '(none in this process: the face cache is bounded to ' + PROMPT_CACHE_LIMIT + ' and the kernel archive to its own cap)'))
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
        // ★★★ TB-2739 (E) / RUN 79: THE PAGE SAYS WHETHER THE STATUS BLOCK IS IN THE TEXT IT IS PAGING. The 79th live
        // run's office read this page and reported that neither `[状态板]` nor `[蓝图]` appeared in a 26 641-character
        // prompt, while the assembly has two routes that put the block in (a pack section, or the literal append at
        // `assemble()`); a reader cannot settle that from a capture, and a page that does not say is a page that invites a
        // guess. The reading comes from the KERNEL archive, which is written from the same string delivery receives;
        // `null` says the face cache answered without that fact and which route did.
        const archived = kernel.turn && typeof kernel.turn.promptOf === 'function' ? kernel.turn.promptOf(id) : null
        const statusBlockIncluded = archived && typeof archived.statusBlockIncluded === 'boolean' ? archived.statusBlockIncluded : null
        return { ok: true, turn: id, chars: text.length, offset, limit,
          limitClamped: limit !== askedLimit, end, done: end >= text.length,
          nextOffset: end >= text.length ? null : end,
          text: text.slice(offset, end),
          pages: Math.ceil(text.length / limit),
          statusBlockIncluded,
          statusBlockChars: archived && Number.isFinite(Number(archived.statusBlockChars)) ? Number(archived.statusBlockChars) : null,
          statusBlockMeans: statusBlockIncluded === null
            ? 'NOT RECORDED for this prompt: the reading is kept by the KERNEL archive and this answer came from the tool-face cache, so this page cannot say whether the status block is in the characters above. Re-read with `turn:"<id>"` after the same turn settles, or read the assembly receipt (op:"step") which carries `memberPrompt.statusBlock`'
            : 'read from the kernel archive, which stores the EXACT string the delivery seam received: true means the status text (' + String(archived.statusBlockChars) + ' characters) is inside `text`, so the member was handed it; false means the assembly produced a prompt without the block it composed - a framework defect, not a rendering choice',
          // null when the caller named no seat (the page answers "the latest prompt"); an object when it did, so the page
          // can be checked against the seat instead of trusted because the name was echoed back.
          promptFor }
      }
      if (op === 'status') {
    // ★★★ TB-2724 / RUN 77 (D — the status receipt was 51 988 B against the host's 12 000 B bound): `detail` now
    // selects a SLICE, and the choice is made BEFORE the kernel assembles the big object. `closure` keeps the round-12
    // narrowing; `board` is the board slice (turnLoop/memberWorkShare/closureVote/liveReadings) the kernel builds
    // without dispatch/turnReceipts/lastAttribution/counts. Any other value is still a NAMED refusal, never a no-op.
    const detail = args.detail === undefined || args.detail === null || String(args.detail).trim() === ''
      ? null
      : String(args.detail).trim()
    if (detail !== null && detail !== 'closure' && detail !== 'board') {
      return refused('VMU_INVALID_ARGUMENT', 'unknown status detail: ' + detail,
        'known detail values: closure | board (omit detail for the full status)')
    }
    // ★ TB-2724 (D): the KERNEL only knows the `board` slice; `closure` is still assembled here from the full reading.
    const status = kernel.turn.status(detail === 'board' ? { detail: 'board' } : {})
    // ★ PHASE 7 / round 17: the turn face used to call closureVoteOf with its DEFAULTS (roster []), so a seated member
    // with the vote permission still read eligible:[]. Use the kernel's ONE calculation instead of a second one.
    if (typeof kernel.closureVoteView === 'function') status.closureVote = kernel.closureVoteView()
    if (detail === 'closure') {
      return { ok: true, detail: 'closure',
        closureVote: status.closureVote || null,
        closureVoteWrites: Number.isInteger(status.closureVoteWrites) ? status.closureVoteWrites : 0 }
    }
    if (detail === 'board') {
      // ★★ TB-2724 / RUN 77 (D): these four blocks are the SAME values the full status carries (both come from one
      // reading inside the kernel), so a board reader and a full reader cannot disagree; the small receipt is the point.
      return { ok: true, detail: 'board',
        detailMeans: status.detailMeans || null,
        turnLoop: status.turnLoop || null,
        memberWorkShare: status.memberWorkShare || null,
        closureVote: status.closureVote || null,
        liveReadings: status.liveReadings || null }
    }
    // ★★★ ROUND 240 (FEEDBACK63 ①4/①9, MEASURED): THE OFFICE COULD NOT READ WHAT A WAIT-WOKEN TURN DID. `status` used to
    // carry a tally (`turns: 3`) and nothing per turn, so the eye had to reverse-engineer the session files to learn what
    // t-2 wrote. The list now travels under `turns` (the name the run-63 receipt asked for) and `turnsMeans` says it is
    // HOST BOOKKEEPING, not the member's intent; rows the kernel cannot see are named in each row's `unavailable`.
    // `status` itself keeps the whole kernel reading (including its numeric `turns` count) - no key is replaced.
    const perTurn = Array.isArray(status.turnReceipts) ? status.turnReceipts : []
    // ★★★ RUN 260 / TB-2667 (task-147): THE SESSION-WIDE SKIP TOTAL, HOISTED so the answer to "how many fields did this
    // session skip?" is in the receipt itself instead of one page down under `status`. Same value the kernel derived
    // from the SAME rows `turns` carries - not a second tally; null only for a kernel too old to have the reading.
    const skippedTotals = status.skippedTotals === undefined ? null : status.skippedTotals
    // ★★★ TB-2694 / F75-06 (MEASURED on the 75th live run): a member calling THIS op from its OWN session read
    // `turns:0 / turnReceipts:[]` — that session mounts a SECOND kernel over the same root, so the list above cannot
    // describe it. The durable `turns` row is the only cross-instance fact: settlement projects `status/codes/skipped/
    // emptyReply` into it (kernel/turn/index.js#noteSettledTurn) and `member_sessions` maps a child session to its
    // member. `lastTurn` is READ-ONLY: step/abandon/prompt stay refused for a member by `memberAllowed` above.
    const callerAgentId = (() => { try { return String((exec && exec.agent && exec.agent.id) || '') } catch (e) { return '' } })()
    const memberRead = callerAgentId !== '' && !callerAgentId.startsWith('session-')
    let lastTurn = null
    if (memberRead) {
      let memberId = null
      try { if (typeof kernel.memberBySession === 'function') memberId = kernel.memberBySession(callerAgentId) } catch (e) { memberId = null }
      if (!memberId && kernel.turn && typeof kernel.turn.memberBySession === 'function') {
        try { memberId = kernel.turn.memberBySession(callerAgentId) } catch (e) { memberId = null }
      }
      if (!memberId && kernel.store && typeof kernel.store.read === 'function') {
        try {
          const pairs = kernel.store.read('member_sessions')
          const hit = Array.isArray(pairs) ? pairs.filter((p) => p && String(p.session) === callerAgentId)[0] : null
          memberId = hit && typeof hit.member === 'string' ? hit.member : null
        } catch (e) { memberId = null }
      }
      if (memberId && kernel.store && typeof kernel.store.read === 'function') {
        try {
          const rows = kernel.store.read('turns')
          const row = Array.isArray(rows) ? rows.filter((r) => r && String(r.member) === String(memberId)).slice(-1)[0] : null
          if (row) lastTurn = { id: typeof row.turn === 'string' ? row.turn : null,
            codes: Array.isArray(row.codes) ? row.codes.slice() : [],
            skipped: Number.isFinite(Number(row.skipped)) ? Number(row.skipped) : 0,
            emptyReply: typeof row.emptyReply === 'boolean' ? row.emptyReply : null,
            status: typeof row.status === 'string' ? row.status : null,
            at: typeof row.at === 'string' ? row.at : null }
        } catch (e) { lastTurn = null }
      }
    }
    return { ok: true, status, turns: perTurn, skippedTotals,
      ...(memberRead ? { lastTurn, memberOps: MEMBER_TURN_OPS.slice(), memberOpsMeans: memberOpsText() + '; this list is the ONE constant that also builds the guard and the refusal hint - an op not listed here is refused by VMU_NOT_PERMITTED with a reachable next step', lastTurnMeans: 'READ-ONLY durable projection of YOUR OWN last turn (turns fold + member_sessions): id = turn id, codes = refusal codes recorded at settlement, skipped = fields kept but not executed, emptyReply = the loop settled with no usable reply, status = how it ended, at = when it opened. `turns` above is THIS kernel instance\'s memory and is empty in your own session — this line is the cross-instance answer. You cannot step/abandon/prompt from here.' } : {}),
      turnsMeans: 'HOST BOOKKEEPING of each turn the loop settled (or still has open), NOT the member\'s intent: executed = reply fields dispatched and the face.op channel, skipped = fields kept but not executed (each with a code), writes = tool writes with their record ids, codes = refusal codes, unavailable = what this kernel CANNOT see (e.g. tool calls a member made in its own child session). `openedBy` says which door opened the turn: drive (the caller\'s step/drive), activation (the background pump), wait (a meeting wake), null (unknown/legacy). Bounded to the last rows; an empty list means no turn settled in THIS kernel session, not that nothing happened.',
      ...(status.turnReceiptsMeans === undefined ? {} : { turnsUnavailableMeans: status.turnReceiptsMeans }) }
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
            'op:"reply" is the TOOL-REPORT channel, and this call ALSO carries a text reply (the reply string): one turn must not be answered through two channels in one call — the string here is the OTHER channel\'s payload, not a report field',
            'send the report alone: op:"reply", report:{…} (no reply string). Send text alone: op:"step", reply:"…" — that is the text channel. The two merge only when they arrive on different calls (source:"tool+text")')
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
          // ★ RUN 242 (FEEDBACK65 1.7): "IS THERE A TURN TO ANSWER?" COMES BEFORE "IS THE REPORT WELL-FORMED?".
          // MEASURED (run 65): a call carrying only `reply_for` came back VMU_INVALID_ARGUMENT "report is missing or
          // empty", so the member had to BUILD a well-formed report before it could learn that this channel is
          // permanently unreachable on the delegated delivery path. If no turn is open, say that instead - through the
          // kernel, so the long CHANNEL hint is not duplicated here.
          const chan = kernel.turn && typeof kernel.turn.reportChannel === 'function' ? kernel.turn.reportChannel() : null
          if (chan !== null && chan.open === false) {
            try {
              return await kernel.turn.supplyStructuredReply({}, {
                forMember: typeof args.reply_for === 'string' && args.reply_for ? args.reply_for : null,
                meeting: typeof args.meeting === 'string' && args.meeting.trim() !== '' ? args.meeting.trim() : null,
              })
            } catch (e) {
              return refused((e && e.code) || 'VMU_ENGINE_UNAVAILABLE', (e && e.message) || String(e), (e && e.hint) || null)
            }
          }
          return refused('VMU_INVALID_ARGUMENT', 'report is missing or empty: this call records nothing',
            'pass report:{ <field>: <value> } with at least one field; known fields: ' + REPORT_FIELDS_DOC)
        }
        const forMember = typeof args.reply_for === 'string' && args.reply_for ? args.reply_for : null
        // ★ THE KERNEL'S REFUSALS ARE THE ANSWER. supplyStructuredReply refuses by name (no open member turn ⇒
        // VMU_TURN_NO_PENDING_MEMBER, second report for the same turn ⇒ VMU_TURN_REPLY_CONFLICT, no recognised field ⇒
        // VMU_TURN_UNKNOWN_FIELD, reply_for mismatch ⇒ VMU_INVALID_ARGUMENT); this face must not re-decide any of it -
        // it only maps the thrown refusal into the tool's returned shape, hint untouched.
        try {
          // ★ 用户裁决 B 第 2 步：所办替成员跑一轮时，可以指名这一轮属于哪场会议 —— 于是成员那句 say 被记成
          // 成员本人的发言（onBehalf），而不是躺在 notes 里。不传就保持原行为（回执说明为什么没派发）。
          const forMeeting = typeof args.meeting === 'string' && args.meeting.trim() !== '' ? args.meeting.trim() : null
          return await kernel.turn.supplyStructuredReply(report, { forMember, meeting: forMeeting })
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
          // ★★★★★★★ LIVE RUN 51 residue 2: A THROWN DELIVERY TIMEOUT CARRIED NO PARTIAL READING, so the office read
          // "nothing happened" while the child was still running and had already written its Lean file. The seam now
          // attaches `partial`/`stillRunning` to the error, and this face must not drop them the way the generic funnel
          // does (it keeps only code/message/hint). A refusal that hides the work in flight is worse than no refusal.
          let stepped
          try {
            stepped = await kernel.turn.step({ members, member: args.member || null, membersFrom, membersInferred: !explicit, selectionShape, phase: args.phase, why: args.why, nextStep: args.next_step, meeting: forMeetingArg, openedBy: openedByArg, deliverMode: deliverModeArg })
          } catch (e) {
            const parked = parkedRefusal(e)
            if (parked) return parked
            if (!e || !e.partial) throw e
            return {
              ok: false,
              tool: 'vibe_vmu_turn',
              code: e.code || 'VMU_TURN_DELIVERY_TIMEOUT',
              message: String(e.message || e),
              hint: e.hint || null,
              partial: e.partial,
              stillRunning: e.stillRunning === true,
              stillRunningMeans: e.stillRunningMeans || null,
              workspaceHint: e.workspaceHint || null,
              waitedMs: Number.isFinite(e.waitedMs) ? e.waitedMs : null,
              deliveryTimeoutMs: e.deliveryTimeoutMs || null,
              round: e.round === undefined ? null : e.round,
              roundConsumed: e.roundConsumed === true,
              roundCompleted: e.roundCompleted === undefined ? null : e.roundCompleted,
            }
          }
          const withOverride = stepped && typeof stepped === 'object'
            ? Object.assign({}, stepped, { toolsOverride: { mode: isNone ? 'none' : 'allow', allow: isNone ? [] : (allow || []), members: ids,
              seam: 'setMemberToolOverride', note: 'reported by the turn face: the seam was set for these members before the round and cleared after it; the actual wire is narrowed by the pull resolver on its next request, which this face cannot read' } })
            : stepped
          // ★★★ b-4 (live run 44): the office DELEGATED this turn but the receipt never named what it delegated. The id
          // and the size exist; childId stays null while awaiting and the field says so, because inventing it would be the
          // class of lie this phase exists to remove.
          // ★★★ LIVE RUN 52 (found by node --check turning into a ReferenceError on the awaiting path): this block named
          // `cfg.deliverPreset`, and `cfg` is NOT in this module's scope — it was the HOST's variable before this spec was
          // split out of host.js. So every caller-played awaiting step would have thrown. The preset is not this face's
          // fact: the host puts it on the child CREATION request, and the SETTLED receipt names it in
          // `delivery.childPreset`. Claiming it here would be guessing, so it is null and it says why.
          const delegated = withOverride && withOverride.awaiting === true
            ? Object.freeze({
              mode: 'subagents',
              preset: null,
              presetMeans: 'this face does not read the host config, so it cannot name the preset while the turn is still awaiting; the SETTLED receipt carries it as delivery.childPreset (null there means: inherit the caller preset)',
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
        try { return rememberPrompt(withClosure(await kernel.turn.step({ members, member: args.member || null, membersFrom: explicit ? 'caller-selection' : 'roster-default', membersInferred: !explicit, selectionShape, phase: args.phase, why: args.why, nextStep: args.next_step, meeting: forMeetingArg, openedBy: openedByArg, deliverMode: deliverModeArg }))) }
        catch (e) { const parked = parkedRefusal(e); if (parked) return parked; throw e }
        finally { if (typeof kernel.setActiveTurnMember === 'function') kernel.setActiveTurnMember(null) }
      }
      // ★★ RUN 172 (run 17 / FEEDBACK17 P2-6): the closure tally's window has a named opener, and it lives HERE because the
      // loop is the thing that knows a judgement happened: the office kernel cannot tell from a vote row whether the
      // institute is still answering the same question. Root-only by construction — `coreTurn` refuses every op but
      // status/reply from a member caller, so a member cannot reopen the window its own vote is counted in.
      if (op === 'reopen-closure') {
        if (typeof kernel.reopenClosureVote !== 'function') {
          return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel exposes no closure-vote window',
            'assemble a kernel that exposes reopenClosureVote; until then the tally keeps counting every vote ever cast')
        }
        return kernel.reopenClosureVote({ why: args.why, by: args.by })
      }
      // \u2605\u2605 RUN 241 / FEEDBACK64 M1: A TURN THAT WILL NEVER SETTLE HAS TO BE CLOSEABLE FROM OUTSIDE. Run 64 left a
      // waiter-woken turn `status:"open"` for hours: the loop held its re-entrancy lock, every later step answered
      // `VMU_TURN_REENTRANT`, and nothing in the whole face list could release it (the durable resume面 said
      // `inflight.pending:0`, which was true and useless). This op is that release: it closes the in-flight turn as
      // `abandoned` (a NAMED ending, with its own code, visible in op:"status" turnReceipts), clears the lock, and lets the
      // next step/drive open a fresh turn. `turn` names the row to close (omit = whatever is in flight); if it names a
      // different turn nothing is closed and the receipt says which one IS in flight, so a stale caller cannot close the
      // wrong turn by accident.
      if (op === 'abandon') {
        if (!kernel.turn || typeof kernel.turn.abandon !== 'function') {
          return refused('VMU_ENGINE_UNAVAILABLE', 'this kernel exposes no turn abandonment',
            'assemble a kernel whose turn loop has abandon (RUN 241); until then a held turn ends when its delivery deadline passes')
        }
        const wantTurn = args.turn === undefined || args.turn === null || args.turn === '' ? null : String(args.turn)
        const out = kernel.turn.abandon({ turn: wantTurn, why: args.why })
        return Object.assign({ action: 'abandon' }, out)
      }
      if (op === 'drive') return withClosure(await kernel.turn.drive({ members, rounds: args.rounds, phase: args.phase, why: args.why, nextStep: args.next_step, meeting: forMeetingArg, openedBy: openedByArg, deliverMode: deliverModeArg }))
      return refused('VMU_INVALID_ARGUMENT', 'unknown op: ' + op, 'known ops: status, prompt, reply, step, drive, abandon, reopen-closure')
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
      // ★★★★★★★ RUN 79 / TB-2739 (B) — A REQUIRED PARAMETER THAT SILENTLY DEFAULTED. `op` is declared `required: true`
      // in the published schema, and this face answered a call WITHOUT it as `status`. The real log (run 79, build
      // 6c689c86, the office session) shows what that costs: three calls carried `member` + `next_step` - arguments that
      // belong to op:"step" - and omitted `op`; each came back `{"ok":true,"status":{...}}` with `turns` unchanged, so the
      // receipt said success while the whole intent had been dropped, and the reader concluded "step does nothing, try
      // drive". The schema promised "required"; the code promised "a default". A promise the code does not keep is the
      // defect class this round is about, so the face now REFUSES BY NAME and says what the arguments would have meant,
      // with the three known ways to say it. No new rule is invented: the parameter keeps its declared meaning.
      const rawOp = args && typeof args.op === 'string' ? args.op.trim() : ''
      if (rawOp === '') {
        const given = Object.keys(args || {})
          .filter((k) => k !== 'op' && args[k] !== undefined && args[k] !== null && !(typeof args[k] === 'string' && args[k].trim() === ''))
          .sort()
        const OP_ARG_OWNERS = Object.freeze([
          { op: 'step', keys: ['members', 'member', 'phase', 'why', 'next_step', 'deliver_mode', 'opened_by', 'meeting', 'tools', 'statusBlock'] },
          { op: 'drive', keys: ['rounds'] },
          { op: 'reply', keys: ['reply', 'reply_for', 'report'] },
          { op: 'prompt', keys: ['turn', 'offset', 'limit'] },
          { op: 'status', keys: ['detail'] },
        ])
        const owners = OP_ARG_OWNERS.filter((o) => o.keys.some((k) => given.indexOf(k) !== -1)).map((o) => 'op:"' + o.op + '"')
        const carried = given.length === 0 ? 'no arguments at all' : given.map((k) => '`' + k + '`').join(', ')
        return Promise.resolve(refused('VMU_TURN_OP_MISSING',
          'this face needs `op`; omitting it is not a default. The call carried ' + carried +
          (owners.length === 0 ? '' : ' - arguments of ' + owners.join(' / ') + ' - and answering it as a status reading would return ok:true while dropping what you asked for'),
          'say what the call means. REACHABLE INSTEAD: vibe_vmu_turn { op: "status" } (read the loop: turns, turnReceipts, closureVote - answers at once and never waits) / { op: "step", member: "<seat>", phase: "normal", why: "<why>" } (run exactly one round) / { op: "drive", member: "<seat>", rounds: 1 } (a bounded run) / { op: "prompt", member: "<seat>" } (read back the prompt a seat was handed, paginated) / { op: "abandon" } (release a round that will never settle)'))
      }
      const op = rawOp
      const caller = agentIdOf(exec)
      const memberCaller = isMemberCaller(caller)
      const memberAllowed = MEMBER_TURN_OPS.includes(op)
      if (memberCaller && !memberAllowed) {
        return Promise.resolve(refused('VMU_NOT_PERMITTED',
          'a member turn cannot run the institute turn engine (op: ' + op + ')',
          'this face cannot run the turn engine from a member session. ' + memberOpsText() + '. REACHABLE INSTEAD: vibe_vmu_turn { op: "status" } - it answers at once with lastTurn (your own last settled turn: id, codes, status, at) and never waits behind a step. Running rounds belongs to the root/office, and your report reaches them through the office: they relay it on your behalf, so do not call op:"reply" from your own session - no turn is waiting for it here'))
      }
      // ★★★★★★★ RUN 245 (audit round 12 H1): THE OBSERVATION AND THE RELEASE NEVER WAIT BEHIND THE THING THEY OBSERVE.
      // run 241 added `turnLoop` (a reading) and `op:"abandon"` (a release) for a turn whose delivery never returns —
      // and then queued both behind that very delivery: measured 1500 ms with every op hanging, while the kernel's own
      // `turn.status()` answered at once. A queued reader cannot see a stuck queue and a queued release cannot free it,
      // so `status` and `abandon` run DIRECTLY here (the member's `status`/`reply` already do, for the same reason).
      // Opening ops (`step`, `drive`, `prompt`, `reopen-closure`) still queue: preserving their order is what the queue is for.
      const observesOrReleases = op === 'status' || op === 'abandon'
      if (memberCaller || observesOrReleases) return Promise.resolve(coreTurnInner(args, exec))
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
        'A round with no members is a legal no-op; a failed round is returned with its code rather than thrown. ' +
        'ONE round advances ONE member (drive{rounds:N} moves at most N members, it is not a lap over the roster), and ' +
        'the receipt says in notAdvanced why it stopped.',
      // ★ PHASE 7 / round 20: this block used to be a FULL JSON SCHEMA passed where the host expects a PARAM MAP.
      // toHostParameters() then wrapped it once more, so the PUBLISHED schema had properties named type/properties/required
      // and a real "properties" object - the model (correctly) put its arguments INSIDE that object, so top-level keys like
      // tools:'none' never reached coreTurn. It is a param map now, exactly like every other tool.
      parameters: {
        op: param('string', 'step＝一轮／drive＝连跑若干轮／reply＝汇报本回合（工具通道，首选）／status＝读数／prompt＝分页读回本进程交出的成员提示词原文（step 回执里的 memberPrompt 会被回执上限截断，这里不会）／abandon＝关掉正在进行、永远不会自己结算的那一轮（回执把它记成 status:abandoned，并释放重入锁；不名字＝关在途那一轮）／reopen-closure＝开一个新的结题票窗口（旧票留档不再计数；只有所办能开，因为只有它知道所在问的是新问题）。★ 本项是必填、且没有默认值：省略或空白值时这个面会具名拒 VMU_TURN_OP_MISSING（不会当成 status 静默执行），hint 给出可照抄的 status／step／drive 三种说法' + '｜成员：' + memberOpsText() + '（其余动作由所办/主席执行；被拒时 hint 给出可照抄的下一步）', { required: true }),
        turn: param('string', '仅 prompt：要读哪一轮的提示词（省略＝最近一轮）'),
        offset: param('integer', '仅 prompt：从第几个字符开始（省略＝0）'),
        limit: param('integer', '仅 prompt：本页最多多少字符（省略＝6000，上限 9000；被夹到上限时回执 limitClamped:true）'),
        detail: param('string', '仅 status：closure＝只回 closureVote（小回执）；未知值具名拒'),
        members: param('array', '本轮可唤醒的成员：[{id, role}]；缺省时由内核名册推断（无成员 ⇒ 合法空转）'),
        // ★ LIVE RUN 23 (the institute's own report, item 2): the chair rail's hint writes `vibe_vmu_turn {op:"step", member:"<id>"}`
        // — a SINGLE-member shorthand. The face refused it as an unknown parameter, so the caller's intent was lost and the roster
        // default woke everyone. The shortcut is declared here and forwarded to the kernel, which owns the one mapping.
        member: param('string', '★ 单成员简写（等价于 members:[{id}]）；与 members 同传时 members 优先。chair 栏杆的 hint 用的就是它'),
        rounds: param('integer', 'drive 的轮数（必须为正整数；没有无限默认）。★ 一轮只推 ONE 个成员：drive{rounds:N} 最多推动 N 个成员，不是「N 个成员各跑一轮」——推不动时回执 notAdvanced 说明为什么停下'),
        phase: param('string', '相位：founding／normal／checkpoint／verify／verify-debate／meeting／resume'),
        opened_by: param('string', '★ 仅 step／drive：这一轮是哪扇门开的——wait＝会议唤醒后由所办结算（省略＝drive＝调用方直接开的）；op:"status" 的 turns[].openedBy 用它记账'),
        deliver_mode: param('string', '★ 仅 step／drive：本次投递模式，只影响这一次调用、不写设置也不持久化——caller＝把成员提示词交回给调用方自己演（所办代跑；回执 deliveryPath:"caller"、memberWorkShare.officeRelayedActs 会记它），subagents＝交给宿主 Agent 跑；省略＝用部署默认，回执 deliverModeSource（arg|config|setting）与 deliverModeReason 说明实际走了哪条、为什么。非法值具名拒'),
        why: param('string', '为什么唤醒（原预设的唤醒也带这一项）'),
        reply_for: param('string', '★ 这个回复属于哪个成员（它的提示词是上一次 step 交回的那个）；不传 = 沿用旧行为'),
        meeting: param('string', '★ op:"step"／op:"drive"／op:"reply" 用：这一轮属于哪场会议。step/drive 时它被记在回合上（回执 awaiting:true 且 memberPrompt.meeting 给出），成员交回的 say 因此被记成「该成员本人」在该会的发言（回执 executed[].onBehalf），不再以 no-meeting-bound 被跳过；reply 时它绑定这份汇报，与停着的回合所属会议不一致会被具名拒 VMU_TURN_REPLY_CONFLICT，省略则继承停着那回合的会议。不传 = 不绑定（say 只进 notes 并在回执说明原因）'),
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
