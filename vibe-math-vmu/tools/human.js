// vibe-math-vmu/tools/human.js — the HUMAN's operational surface: veto, approval queue, dashboard clamp and
// session recovery (docs/17 §19; docs/07 §4; docs/26 §6).
//
// WHY THIS TOOL EXISTS. `kernel/human.js` had a face and no wire: a human could not veto, could not see the
// approval queue, and the approval "gate" was a declaration nobody consulted. The same was true of the recovery
// work in `kernel/resume.js`. One tool covers both because they are the same actor's surface — the human (or the
// office acting for the human) deciding what the institute may do, and what survived the last restart.
//
// FACE CONVENTIONS: the spec is a factory (host.js supplies `param`/`refused`/`TOOL_NAMES`/`kernel`); every
// action returns NAMED structured JSON and never swallows a refusal; `refused()` carries the service's own code.
//
// ★ ROUND 33 / task-22 — THE CALLER GATE. Until this round the face had NO caller check: any live member could
// `decide` / `withdraw` / `veto` / `inject`, i.e. act as the human. Measured on the real entry before the fix:
//     chair decide (allow:true) → {"ok":true,"decision":"allowed","decidedBy":"chair"}
//     member veto               → {"ok":true,"veto":{"id":"veto-2","by":"member"}}
// That is run 33's "所办替院士做裁决" as a MECHANISM hole, not a prompt problem. Two verbs carry the human's
// AUTHORITY, so they are gated by two DECLARED keys — `vmu.human.deciderRoles` (decide/withdraw/veto) and
// `vmu.human.injectRoles` (inject) — whose default in `settings/schema.js` is the office ALONE: out of the box no
// seat may approve anything, because an authority mistake must fail closed.
//   · WHY HERE AND NOT IN `kernel/human.js`: that kernel gate states the rule itself — "DECIDING BY ROLE IS POLICY,
//     SO IT LIVES OUTSIDE THIS KERNEL GATE" (task-205 B, kernel/human.js:323). The capability (approve/withdraw/
//     veto/inject) stays in the kernel; the question "who may" is a declaration, and this face is where the CALLER
//     is known.
//   · WHO the caller is comes from `resolveTurnMember` — the SAME unforgeable criterion the pack-tool seat gate
//     uses (`host-pack-tools.js:106`), never from the model-supplied `by` argument. A seat that writes
//     `by:"office"` is still refused; the argument names a role, the exec names an actor.
//   · THE DEFAULT IS READ FROM THE DECLARATION (`SETTING_DEFS`), not written here: a live view value wins (hot
//     settings really move the gate), the declared `def` is the fallback, and an undeclared key grants NOBODY
//     (fail closed — the failure mode of a deleted declaration must not be "everyone may approve").
//
// ★ ROUND 45 / task-29 — THE DELEGATE GATE. Run 45 (build fe98b36f) measured, on the real entry:
//     root session: decide { request_id:"rq-r45", allow:true, by:"r-1" } → { ok:true, decidedBy:"r-1" }
// i.e. the researcher's identity carried the human's decision, and `approvalState` did not even report who
// decided. The caller gate above judged the CALLER and never resolved the model-supplied `by` argument — which is
// the name that lands on the receipt. So there are TWO authorities in one decision (the caller who acts, and the
// actor the decision is attributed to) and a name on a receipt is an authority claim: BOTH must be in the declared
// approver set. `by` absent means "the caller itself" (the existing office path); a seat id is resolved through
// the LIVE roster to its slot and judged by that slot; an id that is neither a declared role nor a roster seat is
// an invented actor and is refused. `inject` is deliberately out of this rule: it names its speaker with `from`,
// owns its own declaration (`vmu.human.injectRoles`), and run 45 measured nothing about it.
//   · AND THE READ-BACK: `approvalState` now returns `decidedBy` (from the live ledger — the request arguments
//     are never echoed) and `decidedByMeans` = 'self' (the decider acted as itself) | 'delegate' (the caller
//     acted for a DIFFERENT approver) | 'unrecorded' (decided outside this face — the face does not guess).
import { resolveTurnMember } from '../host-pack-tools.js'
import { SETTING_DEFS } from '../settings/schema.js'
export function makeHumanSpec({ param, refused, TOOL_NAMES, kernel }) {
  const k = kernel || {}
  // ── THE CALLER GATE (ROUND 33 / task-22) — see the file header for why it lives here and not in the kernel ──
  const DECIDER_KEY = 'vmu.human.deciderRoles'
  const INJECT_KEY = 'vmu.human.injectRoles'
  const DECIDER_CODE = 'VMU_HUMAN_DECIDER_ROLE'
  const INJECT_CODE = 'VMU_HUMAN_INJECT_ROLE'
  // ★ LIVE RUN 51 (F-36, a member's own report): A CALLER THIS KERNEL CANNOT IDENTIFY IS NOT THE OFFICE. `resolveTurnMember`
  // answers null for two very different callers — the ROOT session (which really is the office) and a NON-ROOT agent whose
  // session this kernel never learned (a member running in its own kernel). Treating the second as `office` let a member
  // call `decide` with no `by` and have the decision ATTRIBUTED to the office. The reader cannot tell a root caller from an
  // unknown one by the roster alone, so the agent id shape is the tie-breaker (`agentIdOf`'s own criterion): root agent ids
  // are `session-…` (or absent); a member's child agent id is not.
  const CALLER_CODE = 'VMU_HUMAN_CALLER_UNKNOWN'
  // ★ A MAP, NOT A TABLE SUBSCRIPTED BY THE ACTION — and the reason is a real gate, not taste.
  // `tests/audit-face-actions.mjs`'s `isGenericDispatch()` scans the SOURCE TEXT (comments included) for a
  // table-subscript-by-action pattern, or for a rest-parameter catch-all, and reads either as "this face
  // dispatches by index". A face judged generic-dispatch stops being checked for "each offered action has its
  // own branch" and is instead held to "each action name equals a method of a kernel service this face
  // mentions" — which `withdraw` (really `withdrawApproval`), `inject` (chat/mailbox seams) and
  // `recoverStatus` (its own branch) can never satisfy. Written as a subscripted-by-action object this table
  // demoted the human face exactly that way; a `Map` + `.get(action)` states the same policy and leaves the
  // gate reading the face for what it is: explicit branches.
  const GATED_VERBS = new Map([['decide', DECIDER_CODE], ['withdraw', DECIDER_CODE], ['veto', DECIDER_CODE], ['inject', INJECT_CODE]])
  const KEY_OF_CODE = new Map([[DECIDER_CODE, DECIDER_KEY], [INJECT_CODE, INJECT_KEY]])
  const WHAT_OF_CODE = new Map([
    [DECIDER_CODE, 'decide an approval, withdraw it, or veto the institute'],
    [INJECT_CODE, 'speak as the human (inject)'],
  ])
  const DECLARED = new Map((SETTING_DEFS || []).filter((d) => d && typeof d.key === 'string').map((d) => [d.key, d]))
  /** Live value first, the declaration's default second, empty last (an undeclared key grants nobody). */
  const declaredRoles = (key) => {
    let live
    try {
      const view = kernel && typeof kernel.settingsView === 'function' ? kernel.settingsView() : null
      live = view && typeof view.get === 'function' ? view.get(key) : undefined
    } catch { live = undefined }
    if (Array.isArray(live)) return live.map((r) => String(r).trim()).filter(Boolean)
    if (typeof live === 'string') return live.split(',').map((r) => r.trim()).filter(Boolean)
    const def = DECLARED.get(key) && DECLARED.get(key).def
    return Array.isArray(def) ? def.map((r) => String(r).trim()).filter(Boolean) : []
  }
  const rosterRow = (id) => {
    try {
      const roster = kernel && kernel.members && typeof kernel.members.roster === 'function' ? kernel.members.roster() : null
      for (const row of Array.isArray(roster) ? roster : []) if (row && String(row.id) === String(id)) return row
    } catch { /* an unreadable roster means "not a seat" — the same answer the seat gate gives */ }
    return null
  }
  /** office (no member ⇒ root/host actor, exactly `resolveTurnMember`'s null) or the live roster SLOT. */
  const seatOf = (row) => (row && typeof row.slot === 'string' && row.slot.trim() ? row.slot.trim() : null)
  const callerRole = (exec) => {
    const agentId = String((exec && exec.agent && exec.agent.id) || '')
    // `root` is the criterion `resolveTurnMember`/`host.js` already use: no agent id, or a session-shaped one.
    const root = agentId === '' || agentId.startsWith('session-')
    const member = resolveTurnMember(kernel, exec)
    if (!member) return { member: null, role: 'office', seat: 'office', root, agentId }
    const row = rosterRow(member)
    const seat = seatOf(row) || '(no seat)'
    return { member, role: seat, seat, root, agentId }
  }
  // ── THE DELEGATE (ROUND 45 / task-29) — see the file header. `by` names WHO the decision is attributed to; the
  // caller gate alone let a root session write a seat's name onto the receipt. Resolution order matches the caller
  // gate: same declaration, same live roster. The argument never grants authority by being written down.
  const MEANS_SELF = 'self'
  const MEANS_DELEGATE = 'delegate'
  const MEANS_UNRECORDED = 'unrecorded'
  // ★ ROUND 52 / F-35b (run 52's member report): a decision this kernel adopted from the shared ledger was reported as
  // `decidedByMeans:'unrecorded'` beside a local audit that had no line for it — honest words that point nowhere. The
  // kernel now remembers which rows it adopted (`humanAdoptedDecisions()`), so this face can say the thing the reader
  // needs: the act happened in ANOTHER kernel, the row was read from the ledger, and this kernel's audit never saw it.
  const MEANS_ADOPTED = 'read-from-shared-ledger'
  const MEANS_ADOPTED_MEANS = 'another kernel decided this request and the decision row (decidedBy/decidedAt) was read from the shared ledger; this kernel\'s own audit has no line for the act, and this face never authorised it'
  const MEANS_OF = new Map() // requestId → 'self' | 'delegate' (how THIS face authorised the attribution)
  const rememberMeans = (requestId, means) => { if (requestId && means) MEANS_OF.set(String(requestId), means) }
  /** Resolve `by` to { by, role, means }: omitted ⇒ the caller itself; a declared role or roster seat ⇒ delegate. */
  const delegateOf = (byArg, who, roles) => {
    if (byArg === undefined || byArg === null || String(byArg).trim() === '') return { by: who.member || who.role, role: who.role, means: MEANS_SELF }
    const named = String(byArg).trim()
    if (named === who.role || (who.member && named === String(who.member))) return { by: named, role: who.role, means: MEANS_SELF }
    if (roles.indexOf(named) !== -1) return { by: named, role: named, means: MEANS_DELEGATE }
    const row = rosterRow(named)
    if (row) return { by: named, role: seatOf(row), means: seatOf(row) ? MEANS_DELEGATE : MEANS_UNRECORDED }
    return { by: named, role: null, means: MEANS_UNRECORDED }
  }
  /** Throws a NAMED refusal in the caller's own vocabulary when this caller may not perform `action`. */
  const gateVerb = (action, exec, byArg) => {
    const code = GATED_VERBS.get(action)
    if (!code) return null
    const key = KEY_OF_CODE.get(code)
    const roles = declaredRoles(key)
    const who = callerRole(exec)
    const caller = who.member ? '"' + who.seat + '" (' + who.member + ')' : '"' + who.seat + '"'
    const what = WHAT_OF_CODE.get(code)
    // ★ LIVE RUN 51 / F-36: refuse to GUESS. A non-root caller whose identity this kernel cannot resolve to a roster
    // member is not the office; naming it `office` would attribute the decision to an actor that may not approve.
    if (!who.root && who.member === null) {
      throw Object.assign(
        new Error('the human face decides for the institution: this caller is a non-root agent (' + (who.agentId || '(no id)') + ') that this kernel cannot resolve to a roster member, so it is NOT the office and may not ' + what),
        {
          code: CALLER_CODE,
          hint: 'run the human decision from the office (root) session, or from a member turn this kernel has learned '
            + '(the member writes `member:"<id>"` in its steps and the kernel maps its session). Who may approve is DECLARED: ' + key + ' = [' + (roles.length ? roles.join(', ') : 'nobody, so nothing is granted') + ']',
          enforced: [key],
          caller: { role: null, member: null, agentId: who.agentId || null, root: false },
        })
    }
    if (roles.indexOf(who.role) !== -1) {
      // ★ THE CALLER MAY DECIDE — but the delegate must be an approver too (ROUND 45). Returned so the branch can
      // attribute the receipt: `by` is what the ledger will record, `means` is how that attribution was authorised.
      if (code !== DECIDER_CODE) return { caller: who, by: undefined, role: who.role, means: null }
      const delegate = delegateOf(byArg, who, roles)
      if (delegate.role !== null && roles.indexOf(delegate.role) !== -1) return Object.assign({ caller: who }, delegate)
      const named = delegate.role === null
        ? 'by:"' + delegate.by + '" is neither a declared role nor a seat on the roster'
        : 'by:"' + delegate.by + '" resolves to role "' + delegate.role + '", which is not an approver'
      throw Object.assign(
        new Error('the human face decides for the institution: caller ' + caller + ' passed ' + named
          + ', and the DELEGATE is not an approver — the decision would be ATTRIBUTED to an actor that may not approve; declared ' + key + ' = [' + roles.join(', ') + ']'),
        {
          code,
          hint: 'two ways out: (1) decide in your own name — omit `by` (or name your own role "' + who.role + '"), so the decision is attributed to the caller; '
            + '(2) hand the decision to that seat — let that member call ' + action + ' from its own turn, where the identity comes from the turn, not from the `by` argument. '
            + 'Who may approve is DECLARED, not hardcoded: ' + key + ' = [' + (roles.length ? roles.join(', ') : 'nobody, so nothing is granted') + '] in settings/schema.js',
          enforced: [key],
          caller: { role: who.role, member: who.member },
          delegate: { by: delegate.by, role: delegate.role, seated: delegate.role !== null },
        })
    }
    throw Object.assign(
      new Error('the human face decides for the institution: ' + caller + ' may NOT ' + what + ' — declared ' + key + ' = [' + roles.join(', ') + ']'),
      {
        code,
        hint: 'if this caller really may ' + what + ', declare it: ' + key + ' must include "' + who.role + '" (declared in settings/schema.js — the framework default is '
          + (roles.length ? roles.join(', ') + ' only' : 'nobody, so nothing is granted') + ', and no seat may approve out of the box)',
        enforced: [key],
      })
  }
  /** The LIVE ledger record for an approval (snapshot first — the queue view is capped). null = not readable. */
  const ledgerRow = (requestId) => {
    if (requestId === undefined || requestId === null || String(requestId) === '') return null
    const id = String(requestId)
    try {
      const snap = human().snapshot()
      const pairs = snap && snap.data && Array.isArray(snap.data.approvals) ? snap.data.approvals : []
      for (const pair of pairs) if (Array.isArray(pair) && String(pair[0]) === id && pair[1] && typeof pair[1] === 'object') return pair[1]
    } catch { /* fall through to the capped queue view */ }
    try {
      const q = human().queue()
      for (const row of Array.isArray(q && q.requests) ? q.requests : []) if (row && String(row.requestId) === id) return row
    } catch { /* no ledger view: the state still comes back, the attribution stays null rather than invented */ }
    return null
  }
  const human = () => {
    const h = kernel && kernel.human
    if (!h) throw Object.assign(new Error('this kernel exposes no human face'), { code: 'VMU_ENGINE_UNAVAILABLE', hint: 'the human face is registered by the kernel; check vmu.tools.faces / the facesDisabled list' })
    return h
  }
  const resume = () => {
    // `kernel.resume` is the CONTROL flow's resume-from-pause method (the counterpart of pause); the recovery
    // face therefore hangs off `kernel.recovery` (alias `kernel.resumeService`, registry name `vmu.resume`).
    const k = kernel || {}
    const r = k.recovery || k.resumeService || (k.resume && typeof k.resume === 'object' ? k.resume : null)
    if (!r) throw Object.assign(new Error('this kernel exposes no recovery face'), { code: 'VMU_ENGINE_UNAVAILABLE', hint: 'the recovery face needs a durable root (kernel { root }); without one there is nothing to recover' })
    return r
  }
  return {
    name: TOOL_NAMES.human,
    description: 'vmu 人类在环：action=status｜veto｜explainVeto｜liftVeto｜observerView｜openApproval｜approvalState｜decide｜withdraw｜queue｜gate｜dashboard｜inject｜recover｜recoverStatus｜readBack。' +
      '**审批是真闸门**：被闸动作在获批前**不执行、只排队**（VMU_HUMAN_APPROVAL_PENDING 带 requestId）；超时默认 hold，default-allow 必须显式确认。' +
      '**inject＝人工中途干预**：以 `from`（默认 office）把一句话送进运行中的研究所，经群聊或私发；**该面的策略照常生效**（配额/禁言/冻结等具名拒原样透传，绝不假装已送达）。' +
      'recover/recoverStatus/readBack 是**会话级恢复原语**：写前必读（VMU_RESUME_WRITE_BEFORE_READ）、中断具名（绝不静默变 passed）、回读一致性可查。',
    parameters: {
      action: param('string', 'status（默认）｜veto｜explainVeto｜liftVeto｜observerView｜openApproval｜approvalState｜decide｜withdraw｜queue｜gate｜dashboard｜inject｜recover｜recoverStatus｜readBack',
        { required: true, enum: ['status', 'veto', 'explainVeto', 'liftVeto', 'observerView', 'openApproval', 'approvalState', 'decide', 'withdraw', 'queue', 'gate', 'dashboard', 'inject', 'recover', 'recoverStatus', 'readBack'] }),
      scope: param('string', 'veto/observerView/dashboard/gate 的作用域；dashboard 只接受 global｜institution'),
      target: param('string', 'veto 的目标（可省＝覆盖整个作用域）'),
      reason: param('string', 'veto/decide/liftVeto/withdraw 的理由（withdraw 必填；vmu.human.vetoNeedsReason=true 时否决必填；紧急可后补）'),
      emergency: param('boolean', '紧急否决：允许理由后补（记录为 pending，不假装已给）'),
      veto_id: param('string', 'explainVeto/liftVeto 的目标否决 id'),
      member_id: param('string', 'gate 的主体（被闸对象 id，可省）'),
      request_id: param('string', 'approvalState/decide/withdraw/explainVeto 的审批 id'),
      allow: param('boolean', 'decide：true＝批准、false＝否决（否决立即生效）'),
      by: param('string', 'decide/withdraw/veto：这个决定记在谁名下（角色名或成员 id；省略＝调用者自己）。★ 被记名者必须也是审批角色（vmu.human.deciderRoles），否则具名拒 VMU_HUMAN_DECIDER_ROLE——替别人决定必须那本人也能决定。liftVeto 必填，受 vmu.human.vetoLiftRoles 约束'),
      subject: param('string', 'openApproval/gate 的主体说明'),
      domains: param('string', 'dashboard：逗号分隔的可见域；空＝仅聚合（private/dm 永不可见）'),
      requestId: param('string', 'openApproval 的调用方自定义 id（可省）'),
      timeout_ms: param('number', 'gate：旁路超时判定用（可省，通常由框架时钟决定）'),
      key: param('string', '改参数：vmu.control.tunableKeys 里的键（本工具不暴露写参数，见 vibe_vmu_control）'),
      // inject: the human's voice into the running institute
      text: param('string', 'inject：要说的话（必填）'),
      to: param('string', 'inject：收件人（成员 id／"all"／"voters"）；省略＝发到群聊'),
      from: param('string', 'inject：发言人身份（默认 "office" ＝所办/人类代表）'),
      via: param('string', 'inject：chat（群聊）｜mailbox（逐收件人私发）｜auto（按 to 自动选）', { enum: ['auto', 'chat', 'mailbox'] }),
      why: param('string', 'inject：这次干预的理由（会写进回执，便于审计）'),
    },
    run: async ({ action = 'status', scope, target, reason, emergency, veto_id, member_id, request_id, allow, by, subject, domains, requestId, timeout_ms,
      text, to, from, via, why } = {}, exec = null) => {
      const notEmpty = (v) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined)
      try {
        // ★ THE CALLER GATE runs BEFORE any state changes: a refused verb must leave the human table exactly as it
        // found it (a refusal that still flipped the approval would pass an "did it error?" test and be worthless).
        // ROUND 45: it also resolves `by` — a caller that may decide cannot attribute the decision to an actor that
        // may not, and the refusal still happens before any state changes.
        const gate = gateVerb(action, exec, notEmpty(by))
        // ★ LIVE RUN 128 (F-128a): `openApproval` takes the id as `requestId`, while decide/state/withdraw/explainVeto
        // read `request_id`; both are declared on this ONE face, so a caller who just received `{id:"rq-…"}` from
        // openApproval and passed it back as `requestId` got `VMU_INVALID_ARGUMENT "unknown approval: undefined"` — a
        // refusal that prints the word it never received. One alias for all the id-taking verbs, and a refusal that
        // NAMES the parameter instead of echoing undefined.
        const rid = notEmpty(request_id) || notEmpty(requestId)
        const idFor = (verb) => {
          if (rid !== undefined) return rid
          throw Object.assign(new Error('the human face cannot name the approval: ' + verb + ' needs the approval id'),
            { code: 'VMU_INVALID_ARGUMENT',
              hint: 'pass request_id:"<id>" (openApproval returns that id as `id`; requestId is accepted too, because openApproval takes the same id under that name)' })
        }
        if (action === 'status') return Object.assign({ ok: true, action }, human().status())
        if (action === 'veto') return Object.assign({ ok: true, action }, human().veto({ by: gate ? gate.by : (notEmpty(by) || null), scope: notEmpty(scope) || null, target: notEmpty(target) || null, reason: notEmpty(reason) || null, emergency: emergency === true }))
        if (action === 'explainVeto') return Object.assign({ ok: true, action }, human().explainDecision({ vetoId: notEmpty(veto_id) || null, requestId: rid || null, reason: notEmpty(reason) || null }))
        if (action === 'liftVeto') {
          // ★ ROUND 45 / task-29b — THE LIFT IS ATTRIBUTED TO WHO PERFORMED IT. `liftVeto` names its actor with the
          // SAME `by` argument, but only `vmu.human.vetoLiftRoles` was checked — the caller was never resolved. So a
          // root session (the office) could lift a veto IN A SEAT'S NAME (`by:"chair"`) whenever that role happened to
          // be declared in vetoLiftRoles, and the ledger would record the seat as the actor. Same defect class as
          // `decide` (task-29), same rule: the name on the receipt is an authority claim about the actor, so a caller
          // may only lift in its OWN name. Delegation is not a thing here: lifting is an act, not a decision made on
          // someone's behalf, and the actor who performs it is exactly the actor who can lift it (the kernel still
          // decides whether that role is allowed: `vmu.human.vetoLiftRoles`).
          const who = callerRole(exec)
          const named = notEmpty(by) || null
          const namedRole = named === null ? null : (seatOf(rosterRow(named)) || named)
          const selfId = who.member === undefined || who.member === null ? null : String(who.member)
          const ownName = named === null || named === who.role || (selfId !== null && named === selfId)
          if (!ownName) {
            throw Object.assign(
              new Error('the human face lifts a veto: caller ' + (who.member ? '"' + who.seat + '" (' + who.member + ')' : '"' + who.seat + '"')
                + ' may NOT lift it in the name of "' + named + '" — a lift is ATTRIBUTED to the actor that PERFORMED it, and this caller is not that actor'),
              {
                code: 'VMU_HUMAN_LIFT_ROLE',
                hint: 'lift in your own name (by:"' + who.role + '"), or let that actor call liftVeto from its own turn (its identity then comes from the turn, not from `by`); who may lift is DECLARED: vmu.human.vetoLiftRoles = [' + declaredRoles('vmu.human.vetoLiftRoles').join(', ') + ']',
                enforced: ['vmu.human.vetoLiftRoles'],
                caller: { role: who.role, member: who.member },
                named: { by: named, role: namedRole },
              })
          }
          return Object.assign({ ok: true, action }, human().liftVeto({
            vetoId: notEmpty(veto_id),
            by: named === null || (selfId !== null && named === selfId) ? who.role : named,
            reason: notEmpty(reason) || null,
          }))
        }
        if (action === 'observerView') return Object.assign({ ok: true, action }, human().observerView({ scope: notEmpty(scope) || null }))
        if (action === 'openApproval') return Object.assign({ ok: true, action }, human().openApproval({ subject: subject === undefined ? null : subject, requestId: notEmpty(requestId) || null }))
        if (action === 'approvalState') {
          const at = Number.isFinite(Number(timeout_ms)) ? Number(timeout_ms) : null
          const requestId = idFor('approvalState')
          const st = human().approvalState({ requestId, at })
          // ★ ROUND 45 — THE READ-BACK MUST SAY WHO DECIDED, and it is read from the LIVE LEDGER, never echoed from
          // the request arguments (otherwise a caller shapes the audit by choosing `by`). `decidedByMeans` is 'self'
          // or 'delegate' when THIS face authorised the attribution, and 'unrecorded' when it did not (decided
          // outside the face — e.g. a pack against the kernel API): the face does not guess, and it never calls an
          // ungated act "self". Pending — or timed out, where NOBODY decided — reports null/null.
          const row = requestId ? ledgerRow(requestId) : null
          const decided = !!(row && row.decidedAt !== undefined && row.decidedAt !== null)
          const decidedBy = decided && row.decidedBy !== undefined && row.decidedBy !== null ? String(row.decidedBy) : null
          // ROUND 52 / F-35b: "decided outside this face" was the whole truth the read-back could tell a member whose
          // kernel had ADOPTED the decision from the shared ledger — and beside a local audit with no line for it, the
          // word `unrecorded` invites the wrong conclusion ("the gate was skipped here"). Ask the kernel which rows it
          // adopted and name that instead: the act is real, it happened elsewhere, and this kernel never saw it happen.
          const adoptedRow = decided && requestId && k && typeof k.humanAdoptedDecisions === 'function'
            ? (k.humanAdoptedDecisions().filter((r) => String(r && r.requestId) === String(requestId))[0] || null)
            : null
          const localMeans = MEANS_OF.get(String(requestId)) || null
          const decidedByMeans = decided ? (localMeans || (adoptedRow ? MEANS_ADOPTED : MEANS_UNRECORDED)) : null
          return Object.assign({ ok: true, action }, st, {
            decidedBy,
            decidedByMeans: decided
              ? decidedByMeans
              // ★ LIVE RUN 50 (the office's report, item ⑨): pending answered `decidedByMeans:null`, which reads as
              // "the field the reader needs is absent" rather than "nobody has decided". Say it: with no decision there
              // is no actor, and the absence is the fact.
              : (String(st && st.state) === 'pending'
                ? 'nobody has decided this request yet (state=pending), so there is no actor to name'
                : 'this request has no recorded decision and is not pending either (state=' + String(st && st.state) + '), so no actor can be named'),
            // The sentence beside the code, so a reader who only sees `decidedByMeans` still knows what it means and
            // where to look. `decidedInThisKernel` is deliberately `null` when it cannot be known: a row this face did
            // not authorise and the kernel does not report as adopted could have come from a pack acting on the kernel
            // API, and guessing either way would be worse than the gap.
            decidedByMeansMeans: decided
              ? (decidedByMeans === MEANS_ADOPTED ? MEANS_ADOPTED_MEANS
                : decidedByMeans === MEANS_SELF ? 'this face authorised the attribution: the caller acted as itself'
                  : decidedByMeans === MEANS_DELEGATE ? 'this face authorised the attribution: the caller acted for a different approver'
                    : 'this face did not authorise the attribution and the kernel reports no row adopted from the shared ledger, so the deciding act happened somewhere this face cannot name (e.g. a pack acting on the kernel API); the row itself is the live ledger\'s')
              : null,
            decidedInThisKernel: decided ? (adoptedRow ? false : (localMeans ? true : null)) : null,
            adoptedFromSharedLedgerAt: adoptedRow ? (adoptedRow.adoptedAt === undefined ? null : adoptedRow.adoptedAt) : null,
          })
        }
        if (action === 'decide') {
          // ROUND 45: the receipt's `by` is the GATE's answer, not the raw argument: omitted ⇒ the caller itself, a
          // seat id ⇒ that seat, a declared role ⇒ that role — and every one of them was just checked as an approver.
          const r = human().decide({ requestId: idFor('decide'), allow: allow === true, reason: notEmpty(reason) || null, by: gate ? gate.by : (notEmpty(by) || null) })
          if (gate) rememberMeans(r.id, gate.means)
          return Object.assign({ ok: true, action }, r)
        }
        // PHASE 6（目标 3 审计）: a PENDING approval can be WITHDRAWN through the tool face — the same path as every
        // other human verb (no direct kernel call needed). Missing reason / second withdrawal surface as named
        // refusals through the outer catch (VMU_INVALID_ARGUMENT / VMU_STATE).
        if (action === 'withdraw') {
          const r = human().withdrawApproval({ requestId: idFor('withdraw'), by: gate ? gate.by : (notEmpty(by) || null), reason: notEmpty(reason) || null })
          if (gate) rememberMeans(r.id, gate.means)
          return Object.assign({ ok: true, action }, r)
        }
        if (action === 'queue') return Object.assign({ ok: true, action }, human().queue())
        if (action === 'gate') {
          const at = Number.isFinite(Number(timeout_ms)) ? Number(timeout_ms) : null
          // `gate` is the drop-in form: a refusal here is the DECISION, so it is returned as a structured
          // refusal rather than thrown out of the tool (the caller wants to see the requestId and the queue).
          const d = human().approvalDecision({ action: notEmpty(member_id) ? 'tool.' + notEmpty(member_id) : 'tool.gate', subject: notEmpty(subject) || notEmpty(target) || null, byRole: notEmpty(by) || null, scope: notEmpty(scope) || null, at })
          return d.ok === true ? Object.assign({ ok: true, action }, d) : Object.assign({ ok: false, action }, d)
        }
        if (action === 'dashboard') return Object.assign({ ok: true, action }, human().dashboard({ scope: notEmpty(scope) || null, domains: notEmpty(domains) ? String(domains).split(',').map((x) => x.trim()).filter(Boolean) : null }))
        if (action === 'inject') {
          // THE HUMAN'S VOICE, mid-run. It goes through the SAME faces the members use, so their policy still
          // applies (quota, mute, freeze, admin) and their refusals pass through unchanged — this tool never
          // bypasses a gate and never reports a delivery the face did not make.
          const body = notEmpty(text)
          if (!body) return refused('VMU_INVALID_ARGUMENT', 'inject needs text', 'pass the sentence the institute should hear')
          const sender = notEmpty(from) || 'office'
          const toWho = notEmpty(to)
          const mode = notEmpty(via) || 'auto'
          if (['auto', 'chat', 'mailbox'].indexOf(mode) === -1) return refused('VMU_INVALID_ARGUMENT', 'via must be auto/chat/mailbox', 'got ' + mode)
          const chat = k.chat && typeof k.chat.send === 'function' ? k.chat : null
          const mail = k.mailbox && typeof k.mailbox.send === 'function' ? k.mailbox : null
          const useMailbox = mode === 'mailbox' || (mode === 'auto' && !!toWho && !!mail)
          const useChat = mode === 'chat' || (mode === 'auto' && !useMailbox && !!chat)
          if (useMailbox) {
            const r = await mail.send(sender, { to: toWho || 'all', text: body, kind: 'notice' })
            return Object.assign({ ok: true, action, via: 'mailbox', from: sender, to: toWho || 'all', why: notEmpty(why) || null }, r)
          }
          if (useChat) {
            const r = await chat.send(sender, body, { kind: 'announce' })
            return Object.assign({ ok: true, action, via: 'chat', from: sender, to: '（群聊）', why: notEmpty(why) || null }, r)
          }
          return refused('VMU_ENGINE_UNAVAILABLE',
            'no injection path is mounted: neither kernel.chat.send nor kernel.mailbox.send exists in this assembly',
            'declare vmu.chat.* / vmu.mailbox.* (or config.chat/config.mailbox) so the human voice has a face to go through')
        }
        if (action === 'recover') {
          const plan = resume().recoverPlan({ reason: notEmpty(reason) || 'human-requested' })
          const report = await resume().recover({ reason: notEmpty(reason) || 'human-requested' })
          return Object.assign({ ok: report.ok !== false, action }, { plan, recovery: report })
        }
        if (action === 'recoverStatus') return Object.assign({ ok: true, action }, resume().status())
        if (action === 'readBack') return Object.assign({ ok: true, action }, resume().readBack())
        return refused('VMU_INVALID_ARGUMENT', 'unknown action: ' + String(action))
      } catch (e) {
        return refused(e.code || 'VMU_STATE', String(e.message), e.hint)
      }
    },
  }
}
