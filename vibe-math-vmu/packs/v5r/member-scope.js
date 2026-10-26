/**
 * v5r MEMBER SCOPE — 哪一件 pack 工具属于「所办」、哪一件属于「席位」。
 *
 * WHY THIS FILE EXISTS (run-51 residue #4, design ruled in
 * `docs/acceptance/conformance/member-scope-design.md`): under activation delivery a member turn runs in an
 * INDEPENDENT kernel instance, so when a member prompt taught a member to call an institution-level action
 * (`vibe_v5_verdict`, `vibe_v5_poll_vote`, …) the call came back as `VMU_NO_SUCH_OBJECT` — a WRONG NAME for the
 * real situation ("this session has no institution state at all"). A wrong name is worse than no name: whoever
 * reads it goes and fixes the id.
 *
 * The ruling was: do NOT bridge the child kernel. A member is not supposed to exercise institution-level actions;
 * its legitimate channels are ① reply fields ② records in its own library ③ messages/inbox. So the boundary is
 * declared HERE, once, derived from the tool catalogue, and the member's wire is NARROWED to it.
 *
 * THE DECLARATION IS THE ONLY SOURCE. `MEMBER_SAFE_TOOLS` / `OFFICE_ONLY_TOOLS` are derived from `TOOL_SCOPES`;
 * a second hand-written list would be the same "two copies drift" failure this project keeps paying for.
 *
 * ★ THE OTHER AXIS — THIS TABLE ANSWERS "WHO CAN SEE IT", NOT "WHICH SEAT MAY CALL IT" (round 31, run 31 post-mortem).
 * `seat-faces.js#SEAT_TOOL_FACES` answers the opposite question: which seat (chair / member / temp) may CALL a tool, and
 * that is what `kernel/memberface.js#faceGate` enforces on a real call. This table decides whether a face belongs in a
 * member's WIRE at all (preset `packToolAllow`, visible list). They are not redundant and neither may copy the other:
 *   · a face can be seat-line yet chair-only (`vibe_v5_meeting`, `vibe_v5_assign`) — visible, gated by the seat face;
 *   · a face can be office-only yet callable by one seat (`vibe_v5_report`, `verdict_final`) — the chair's, by role.
 * The rule that keeps them from colliding: `applyMemberScope` pushes a DENY list DERIVED FROM `seat-faces.js` (never an
 * `allow` array, and never this table's list), and it never overrides the chair seat. An `allow` array would stop the
 * gate from reading `deny` (`kernel/memberface.js`), i.e. it would REPLACE the seat declaration — that is precisely the
 * bug measured on run 31: the chair lost `verdict_final` / `verdict_ask` / `verified_promote` / `report` at `start` time
 * and was handed `vibe_v5_message` on the same line.
 * `seatFaceReconciliation` / `seatScopeDivergence` (seat-faces.js) list any disagreement BY NAME; the suite pins both.
 *
 * SCOPES:
 *   'office' — 所办 only. Control/parameter/reporting faces (`report`, `overview`, `start/stop/pause/resume`,
 *              `configure`, `set`), the three faces whose authority is not a seat's own business
 *              (`verified_promote`, `verdict_final`, and `verdict_ask`, which sends mail SIGNING AS THE CHAIR —
 *              the row in the table carries the full reason), and the two faces that cannot be a seat's own
 *              (`vibe_v5_message`, which relays in SOMEONE ELSE'S NAME, and `vibe_v5_script`, the run-script archive).
 *   'member' — 席位线：一个席（不限于常驻研究员，主席席也是席）可能在它的线束里看到它。Every record/
 *              communication/task/meeting/lean/paper face is here, because meeting controls etc. are gated by the KERNEL's
 *              permission rails and by the seat face, not by the wire. This does NOT mean the member seat may call it —
 *              that is `seat-faces.js`'s answer. Read the two together (see the ★ block above).
 *   'both'   — either side may call it (nothing in this pack is office-and-member-exclusive by nature).
 */

import { SEAT_GOVERNED_SLOTS, seatDeclaredNames, seatDenyNames } from './seat-faces.js'

/** The vocabulary, so a reader can tell what "office" means without reading this comment. */
export const SCOPE_VOCAB = Object.freeze({
  office: '所办（主代理）专用：控制、参数、汇报，以及以「机构」而非「席位」为授权主体的面孔',
  member: '席位线：某个席（含主席席）的线束里会出现它——「看得见」不等于「这个席调得动」，后者由 seat-faces.js 决定',
  both: '两侧都可用',
})

/**
 * One line per pack tool: which side may call it.
 *
 * Kept as an explicit table ON PURPOSE (not derived from the tool bodies): a reader must be able to answer
 * "may a member call this?" by reading one line, and the gate below proves the table and the catalogue agree.
 */
export const TOOL_SCOPES = Object.freeze({
  // ── records in one's own library (each tool resolves the member from the caller) ──────────────────────
  vibe_v5_record_progress: 'member',
  vibe_v5_record_proposition: 'member',
  vibe_v5_record_method: 'member',
  vibe_v5_record_subproblem: 'member',
  vibe_v5_read_library: 'member',
  vibe_v5_feedback: 'member',
  // ── communication ──────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_say: 'member',
  // ★ WHY `message` IS 'office' (round 31, Lead 裁决 1 — it used to be 'member'): this face RELAYS A MESSAGE IN SOMEONE
  // ELSE'S VOICE. `kit/handlers.js:352` sets `sender = args.member || 'office'` and never checks who is calling, so a seat
  // holding it can send mail signed as the office or as any member. A member's real private channel is `say {to}`
  // (`kind:'dm'`, same file :305), which resolves the sender from the caller. Declaring it 'member' would therefore put an
  // impersonation face in the member's wire; `seat-faces.js` denies it to every seat but the chair, and that denial is what
  // decides calls. Two axes, one name: 「线束里看得见」 ≠ 「席位调得动」 — see the SEAT_SCOPE_AXES note below.
  vibe_v5_message: 'office',
  vibe_v5_inbox: 'member',
  vibe_v5_wait: 'member',
  // ── task board (creation/claim/assignment are gated by the kernel's rails, not by the wire) ─────────────
  vibe_v5_task_create: 'member',
  vibe_v5_task_list: 'member',
  vibe_v5_task_get: 'member',
  vibe_v5_task_update: 'member',
  vibe_v5_assign: 'member',
  vibe_v5_prioritize: 'member',
  vibe_v5_nudge: 'member',
  // ── roster ──────────────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_hire: 'member',
  vibe_v5_fire: 'member',
  // ── meetings (chair is a seat; permission rails decide what a seat may actually do) ─────────────────────
  vibe_v5_meeting: 'member',
  vibe_v5_meeting_round: 'member',
  vibe_v5_motion: 'member',
  vibe_v5_second: 'member',
  vibe_v5_poll_open: 'member',
  vibe_v5_poll_vote: 'member',
  vibe_v5_poll_close: 'member',
  vibe_v5_verdict: 'member',
  vibe_v5_fidelity_conclude: 'member',
  // ── research material ──────────────────────────────────────────────────────────────────────────────────
  vibe_v5_blueprint: 'member',
  vibe_v5_lean_run: 'member',
  vibe_v5_lean_job: 'member',
  vibe_v5_lean_lib: 'member',
  vibe_v5_lean_read: 'member',
  vibe_v5_lean_archive: 'member',
  vibe_v5_paper: 'member',
  vibe_v5_tool_help: 'member',
  // ── office only ────────────────────────────────────────────────────────────────────────────────────────
  vibe_v5_report: 'office',
  vibe_v5_overview: 'office',
  vibe_v5_start: 'office',
  vibe_v5_stop: 'office',
  vibe_v5_pause: 'office',
  vibe_v5_resume: 'office',
  vibe_v5_configure: 'office',
  vibe_v5_set: 'office',
  vibe_v5_verified_promote: 'office',
  vibe_v5_verdict_final: 'office',
  // ★ WHY `script` IS 'office' (round 31): the script face archives / reads / lists run scripts — it is an OPERATING
  // record, not a research face. `seat-faces.js` denies it to all three seats (SEAT_PENDING_RULINGS records that
  // decision), so declaring it 'member' put a face in the member's wire that the gate refuses on every call: a dead entry.
  // A seat-line name nobody may call is exactly what `seatScopeDivergence` reports as `stranded`, and this row is why
  // that check exists.
  vibe_v5_script: 'office',
  // ★ WHY `verdict_ask` IS 'office' AND NOT 'member' (ruled in round 30 / gate-debt D; do NOT re-decide this when the
  // next member-wire red appears). This face SENDS MAIL IN THE CHAIR'S NAME: its receipt signs `from: <chair>` and it
  // asks every debating seat for "布尔概率 + 理由". The tool body checks only its ARGUMENT — `member`, when passed, must
  // equal the meeting's chair (`packs/v5r/tools.js:1664`) — and NEVER checks that the CALLER is that chair. On live run
  // 29 the office called it with `member:"acad-01"` and the receipt read `from:"acad-01"`; no line of the body could
  // tell that call apart from a member impersonating the chair, so "who may send this mail" is knowable ONLY from the
  // wire — and this table IS the wire declaration. A seat's legitimate acts around a ruling are its own vote
  // (`vibe_v5_verdict`: 'member') and the chair's tally of the votes collected (`vibe_v5_verdict_final`: 'office'); the
  // v5r rule is that the FRAMEWORK asks each member for a final ruling (「v5r 框架请各成员给出最终裁决」), not that
  // seats ask one another. Declaring it 'member' would hand a seat a face that speaks as its chair with no rail behind
  // the signature; declaring it 'office' is the only declaration the mechanism actually supports.
  vibe_v5_verdict_ask: 'office',
})

/** DERIVED — never hand-written. A seat may call these. */
export const MEMBER_SAFE_TOOLS = Object.freeze(
  Object.keys(TOOL_SCOPES).filter((n) => TOOL_SCOPES[n] === 'member' || TOOL_SCOPES[n] === 'both').sort(),
)

/** DERIVED — never hand-written. Only the office may call these. */
export const OFFICE_ONLY_TOOLS = Object.freeze(
  Object.keys(TOOL_SCOPES).filter((n) => TOOL_SCOPES[n] === 'office').sort(),
)

/** The sentence a member prompt may carry, so the boundary is stated where the member reads it. */
export const MEMBER_SCOPE_NOTE = Object.freeze(
  '机构级读数（汇报、总览、启动/暂停/停止、参数设置、最终裁决、verified 提升）不在你的线束里：'
  + '它们属于推动者的内核。你需要它们时，用回复字段或消息请求所办，不要凭记忆叙述机构状态。',
)

/**
 * Compare this table against an available-name list — BIDIRECTIONALLY.
 *
 * `tools.js` must not be imported here (it imports this module, and an ESM cycle would evaluate these derived
 * arrays before the catalogue exists). So the comparison is a FUNCTION: the caller hands its own list in, and
 * gets both directions back, because a table that covers the catalogue but names a tool that no longer exists is
 * just as wrong as one that misses a tool.
 */
export function scopeCatalogue(availableNames = []) {
  const available = new Set(availableNames.map(String))
  const declared = new Set(Object.keys(TOOL_SCOPES))
  const missing = [...available].filter((n) => !declared.has(n)).sort()
  const extra = [...declared].filter((n) => !available.has(n)).sort()
  return { ok: missing.length === 0 && extra.length === 0, declaredCount: declared.size, availableCount: available.size, missing, extra }
}

/** The live slot of one seat, read from the roster — the ONE fact the override must not guess. */
const slotOfSeat = (kernel, member) => {
  let roster = null
  try {
    roster = kernel && kernel.members && typeof kernel.members.roster === 'function' ? (kernel.members.roster() || []) : null
  } catch (e) {
    return { slot: '', why: 'roster-unreadable', detail: String((e && e.message) || e) }
  }
  if (!Array.isArray(roster)) return { slot: '', why: 'roster-unavailable',
    detail: 'this kernel exposes no `members.roster()`; without a roster a seat has no declared SLOT, and guessing one is how the seat face gets replaced by a guess' }
  const row = roster.find((m) => m && String(m.id) === member) || null
  if (!row) return { slot: '', why: 'not-on-roster', detail: 'the id is not on the LIVE roster, so it has no seat face to narrow' }
  const slot = String(row.slot || '')
  if (!slot) return { slot: '', why: 'undeclared-slot',
    detail: 'the roster row declares no slot, so no seat face applies to this id at all; the office must seat it (`slot`) before its wire can be scoped' }
  return { slot, why: '', detail: '' }
}

/**
 * Apply the member scope to a set of seats, through the seam the host already reads
 * (`kernel.setMemberToolOverride` → `kernel.memberToolOverride` → `host.js` visible tools).
 *
 * ★ ROUND 31 REWRITE — THE OVERRIDE IS NOW DERIVED FROM `seat-faces.js`, AND IT IS A DENY LIST.
 * What this function used to do was `setMemberToolOverride({ member, allow: MEMBER_SAFE_TOOLS })` for EVERY hired seat,
 * the chair included. `kernel/memberface.js#faceGate` treats an `allow` array as the WHOLE truth (it stops reading
 * `deny`), so on live run 31 that one line both CUT the chair seat's ruling faces (`verdict_final`, `verdict_ask`,
 * `verified_promote`, `report`, …) and WIDENED it with `vibe_v5_message` — an allow list is a replacement, not a
 * narrowing. Three rules now decide what happens to a seat:
 *   ① the seat's SLOT is read from the LIVE roster (`kernel.members.roster()`), never assumed;
 *   ② a NON-governed slot (today only `chair`; `SEAT_GOVERNED_SLOTS`) is NOT overridden at all — its capability is
 *      exactly `SEAT_TOOL_FACES[slot]`, declared in `seat-faces.js` and enforced by the kernel's face gate;
 *   ③ a governed slot (`member`, `temp`) receives `deny = seatDenyNames(slot, declared)` — computed from that same
 *      declaration. A deny list can only ever NARROW, so this layer cannot grant a face by accident, which is what
 *      makes "the member wire has a hole" impossible to introduce from here.
 * Reports that vanish silently are why the receipt has three buckets (`applied` / `skipped` / `refused`) and names the
 * reason for each: a seat that was NOT narrowed must not look like one that was.
 *
 * Returns a RECEIPT rather than nothing: "narrowed" is a state somebody may need to prove later, and a silent
 * mutation would make every later question ("is the member wire narrow?") unanswerable from outside.
 *
 * Never throws for an absent seam: a kernel that does not expose `setMemberToolOverride` is a DIFFERENT
 * deployment (a test double, an older host), and refusing here would turn a scope hint into a hard dependency.
 * The receipt says which case happened, by name.
 */
export function applyMemberScope({ kernel, members } = {}) {
  const ids = Array.isArray(members) ? members.map((m) => String(m)).filter((m) => m.length > 0) : []
  const hasSeam = Boolean(kernel && typeof kernel.setMemberToolOverride === 'function')
  const declared = seatDeclaredNames()
  const applied = []
  const skipped = []
  const refused = []
  if (hasSeam) {
    for (const member of ids) {
      const probed = slotOfSeat(kernel, member)
      if (!probed.slot) {
        skipped.push({ member, slot: null, why: probed.why, detail: probed.detail })
        continue
      }
      if (!SEAT_GOVERNED_SLOTS.includes(probed.slot)) {
        skipped.push({ member, slot: probed.slot, why: 'seat-authority',
          detail: 'seat "' + probed.slot + '" is not governed by applyMemberScope: its face IS `seat-faces.js#SEAT_TOOL_FACES.'
            + probed.slot + '`. An override here would either replace that declaration (the run-31 defect) or re-widen the seat' })
        continue
      }
      const deny = seatDenyNames(probed.slot, declared)
      try {
        kernel.setMemberToolOverride({ member, deny: deny.slice() })
        applied.push({ member, slot: probed.slot, denyCount: deny.length })
      } catch (e) {
        refused.push({ member, slot: probed.slot, code: String((e && e.code) || 'VMU_SCOPE_REFUSED'), message: String((e && e.message) || e) })
      }
    }
  }
  const seatDenyCount = seatDenyNames('member', declared).length
  return {
    ok: true,
    seam: hasSeam ? 'kernel.setMemberToolOverride' : 'absent',
    seamReads: hasSeam ? ['setMemberToolOverride', 'members.roster'] : [],
    applied,
    appliedCount: applied.length,
    skipped,
    skippedCount: skipped.length,
    refused,
    refusedCount: refused.length,
    askedCount: ids.length,
    declaredCount: declared.length,
    denyCount: seatDenyCount,
    allowCount: declared.length - seatDenyCount,
    memberLineCount: MEMBER_SAFE_TOOLS.length,
    officeOnlyCount: OFFICE_ONLY_TOOLS.length,
    governedSlots: SEAT_GOVERNED_SLOTS.slice(),
    derivedFrom: 'vibe-math-vmu/packs/v5r/seat-faces.js#seatDenyNames',
    means: hasSeam
      ? 'governed seats (' + SEAT_GOVERNED_SLOTS.join(', ') + ') got a DENY list derived from seat-faces.js: the member seat loses '
        + seatDenyCount + ' of ' + declared.length + ' pack tools (keeps ' + (declared.length - seatDenyCount)
        + '); the chair seat is NOT overridden, so its ' + (declared.length - seatDenyNames('chair', declared).length)
        + ' declared faces stay callable. ' + applied.length + ' applied, ' + skipped.length + ' skipped, ' + refused.length + ' refused'
      : 'no seam on this kernel: the scope was NOT applied, and `applied` is empty — the caller should treat the member wire as unscoped',
  }
}
