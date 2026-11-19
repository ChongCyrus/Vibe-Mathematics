
// ─────────────────────────────────────────────────────────────────────────────────────────────
// ★★★ TB-2792 / C#25 + ROUND-10 boundary (product audit): REFUSAL MEANS + DUAL-FORM HINTS, ONE TABLE FOR THE
// WHOLE TOOL-FACING SURFACE. The corpus measurement was 186 refusal receipts of which 6 carried means and none
// carried a short/full distinction; the first fix covered the v5r pack's own construction sites, the round-10
// boundary was the remaining 80 (host pre-gates + kernel tool modules). So the table and the decorator live HERE,
// a MODULE the pack, the host and the kernel tool face all import — no side needs to depend on another's code.
//
// THE MEASURED DEFECT: 186 refusal receipts in a round, only 6 carried `means`; and `hint` had no short/full
// distinction, so a caller in a compact/tool receipt had to read a paragraph to learn what the code means, while a
// caller who needed a next step got a one-liner. Both are RECEIPT-LEGIBILITY defects, not wording.
//
// THE MECHANISM (this table + the two functions below; wired in `withActingSeatGate`, so EVERY v5r pack tool receipt
// and EVERY thrown refusal that the host serialises passes through it — one seam, not per-call sprinkling):
//   · `means`      — ONE sentence per CODE: why it refused / what the state means. Coverage is validated by
//                    `scripts/audit-refusal-means.mjs` (every distinct code the pack can emit must have an entry; a
//                    missing one is a RED gate, not a silent null).
//   · `hintShort`  — ONE line (≤ ~80 chars) for compact/tool-face receipts,
//   · `hintFull`   — the original hint text PRESERVED, plus `REACHABLE INSTEAD:` naming a reachable alternative
//                    (the full form is a SUPERSET: nothing that used to be said is dropped),
//   · `hint`       — the form the CALLER asked for: full by default; `hintForm:'short'` (or a compact ctx) selects
//                    short. `hintFull`/`hintShort` are always both present, so switching form never loses content.
// A code the table does not know is NOT invented at runtime: `means` stays null and `meansMissing:true` is attached,
// so the validator's red is the only way such a code can ship (honest absence over a fabricated sentence).
export const REFUSAL_MEANS = Object.freeze({
  VMU_INVALID_ARGUMENT: Object.freeze({
    means: 'The call carried a missing, extra or malformed argument (a required parameter, a value out of range, or two conflicting aliases) — nothing was written and this is a CALL-SHAPE refusal, not a state refusal.',
    short: 'The call shape is wrong (missing/malformed/conflicting argument) — nothing was written.',
    reachable: 'Pass exactly the parameters this face declares (a typo is not an alias), one of each alias pair, and a value inside the domain the hint names.',
  }),
  VMU_ENGINE_UNAVAILABLE: Object.freeze({
    means: 'The framework seam this face needs (records, roster, ledger, library, a registered service) is not published in this deployment — the request is well-formed, the MACHINE cannot carry it, so it is refused rather than pretended.',
    short: 'This deployment does not publish the seam this face needs — the request was not performed.',
    reachable: 'Read what IS reachable (the receipt names it), or have the deployment publish the missing service before calling this face again.',
  }),
  VMU_STATE: Object.freeze({
    means: 'The request is legal in general but this object is in a state that forbids it right now (closed, already done, not yet opened, no open row) — the state machine, not the call shape, refused.',
    short: 'The object state forbids this action right now.',
    reachable: 'Read the object first (its receipt names the state), then take the action that state allows — or move the object to the needed state on its own face.',
  }),
  VMU_NOT_PERMITTED: Object.freeze({
    means: 'The caller is not the seat this act belongs to (another member, a non-chair, a non-office seat) — v5r is an institution with role-scoped powers, and this act is reserved to a declared role.',
    short: 'The caller does not hold the role this act is reserved to.',
    reachable: 'Call the face as the seat that owns the act (member:"<your id>"), or ask the office/chair to perform it; a refusal that names the roles tells you which.',
  }),
  VMU_NO_SUCH_OBJECT: Object.freeze({
    means: 'The id/pointer this call names does not exist in the registry it was looked up in — this is ABSENCE, not a failed check (nothing was compared, nothing was judged).',
    short: 'The named object does not exist in that registry.',
    reachable: 'List the registry first (the face that mints these rows has a list/roster read) and pass an id that exists; do not mint an id yourself.',
  }),
  VMU_V5R_CLOCK_VALUE_INVALID: Object.freeze({
    means: 'A time/epoch field was not a value this institute can place on the clock (unparseable, negative, or not an instant the deployment permits) — the refusal is about the TIME INPUT, not about the object.',
    short: 'The time value is not a usable instant.',
    reachable: 'Pass epoch milliseconds or an ISO-8601 instant (the deployment clock decides "now"); omit the field when you mean the default.',
  }),
  VMU_CONFLICT: Object.freeze({
    means: 'Two declarations/sources disagree about the same fact (a name already published, an id already taken, a vote and a ruling that cannot both hold) — O4: conflicts are refused, never merged silently.',
    short: 'Two sources conflict about the same fact; nothing was merged.',
    reachable: 'Pick one owner for the fact (drop the duplicate declaration, or use the distinct name/id the receipt suggests), then retry.',
  }),
  VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED: Object.freeze({
    means: 'This institute requires a machine-checked (Lean) pass before the act, and the evidence this call relied on is not a passing Lean run — the gate is the institution\'s policy (vmu.math.formalVerify), not a tool bug.',
    short: 'The required machine-checked (Lean) pass is missing for this act.',
    reachable: 'Run the Lean face (vibe_v5_lean_run) and archive a passing outcome, or change vmu.math.formalVerify if this deployment does not require it.',
  }),
  VMU_ASK_UNKNOWN_PROPOSITION: Object.freeze({
    means: 'A question/ask named a proposition id this institute does not hold — the ask is addressed to a row that cannot answer it.',
    short: 'The ask names a proposition that does not exist here.',
    reachable: 'List the propositions/cards first and ask about an existing id (or record the proposition before asking).',
  }),
  VMU_METRIC_UNAVAILABLE: Object.freeze({
    means: 'A metric/indicator the call needs was never declared by this deployment (vmu.metrics.indicators) — the count is ABSENT, not zero.',
    short: 'The metric this call needs is not declared here.',
    reachable: 'Declare the indicator in vmu.metrics.indicators (an undeclared metric is not silently counted as 0), or read a face that does not require it.',
  }),
  VMU_PACK_V5R_CORE_PAPER_STATE: Object.freeze({
    means: 'The paper pipeline was asked for an action its current state does not allow (a draft not yet adopted, a finalisation before review, a section not yet part of the paper) — the pipeline state machine refused, not the paper face.',
    short: 'The paper is not in a state that allows this action.',
    reachable: 'Read the paper status first and take the allowed next step (the refusal names the state and the allowed action); adopt/finalise only after the earlier stage completed.',
  }),
  VMU_PACK_V5R_CORE_P1_RULING_UNVOTED: Object.freeze({
    means: 'A P1 (proposition-level) ruling was requested before the debate produced votes — the ruling gate needs a DECIDED debate, and "no votes yet" is a policy refusal.',
    short: 'The P1 ruling needs debate votes first.',
    reachable: 'Open/advance the debate until the required votes are in (vibe_v5_meeting), then file the ruling.',
  }),
  VMU_MEETING_QUORUM_LOST: Object.freeze({
    means: 'The meeting\'s legal quorum was lost (a participant left/was removed, or the declared quorum rule no longer holds) — the body cannot make a binding decision right now.',
    short: 'The meeting lost its quorum; decisions are blocked.',
    reachable: 'Restore attendance to the quorum rule (the receipt names the rule/needed count), or close the meeting and reconvene.',
  }),
  VMU_PAPER_GLYPH_UNCOVERED: Object.freeze({
    means: 'The paper text uses a glyph/character the renderer cannot cover with the declared fonts — the render would drop or mangle it, so the face refused the render instead of producing a lossy artifact.',
    short: 'The text uses a glyph the declared fonts cannot cover.',
    reachable: 'Replace the uncovered glyph (the receipt names it) or add a font that covers it, then render again.',
  }),
  VMU_BLUEPRINT_FIELDS_MISSING: Object.freeze({
    means: 'A blueprint outline node does not record the ten declared structured fields (vmu.blueprint.fields@1): the rule says every direction/route/node records all of them, so the proposal is refused instead of filing an empty record.',
    short: 'The blueprint node is missing one or more of the ten declared fields.',
    reachable: 'Add every missing field named in detail.missing (with its Chinese label) on each outline node, then propose again; a legacy outline may omit the schema and reads fields:null instead.',
  }),
  VMU_PAPER_CROSS_REVIEW_UNMET: Object.freeze({
    means: 'The paper cannot pass the cross-review gate: fewer than two DISTINCT non-author reviewers hold a counted deliverable verdict on the current text (the receipt names crossReviewers/required/staleReviews).',
    short: 'The paper still lacks the required distinct non-author cross-reviews.',
    reachable: 'Get the missing non-author reviewers to file a counted deliverable review of the current text (re-file after any part rewrite), then retry final.',
  }),
  VMU_SCOPE_REFUSED: Object.freeze({
    means: 'A member-scope rule (the seat\'s permissible tool/face set for this turn) refuses the call — this is the institution\'s scope policy, distinct from a role permission.',
    short: 'This seat\'s member scope does not include the call.',
    reachable: 'Act within the tools the scope names (the receipt lists them), or have the office adjust the seat\'s scope policy.',
  }),
  VMU_PACK_V5R_CORE_NO_ADHOC_SCRIPTS: Object.freeze({
    means: 'This institute refuses ad-hoc script execution outside its script/ledger faces — a direct script run is policy-refused even where the sandbox could technically run it.',
    short: 'Ad-hoc scripts are refused by institute policy.',
    reachable: 'Run the computation through the math/tool faces (or the declared script face) so the act is recorded; do not call raw script execution.',
  }),
  VMU_PACK_V5R_CORE_NOT_SETTLED: Object.freeze({
    means: 'A record/proposition was used as settled evidence while its state is not settled (draft/unverified) — the pack\'s "only settled facts may be cited" rule refused.',
    short: 'The record is not settled, so it cannot be used as evidence.',
    reachable: 'Promote the record through verification (the track/face that settles it), or cite a settled one.',
  }),
  VMU_TURN_NO_PENDING_MEMBER: Object.freeze({
    means: 'The turn face has no pending member/context to hand a reply to — the turn loop was not awaiting a member, so a reply would land nowhere.',
    short: 'No pending member turn to receive this reply.',
    reachable: 'Reply through the channel the turn opened (the fence the receipt names), or drive a member turn first.',
  }),
  VMU_MATH_INVALID_INPUT: Object.freeze({
    means: 'A math/formalisation input was incomplete or malformed for the engine (missing statement/proof keys, a shape the adapter cannot map) — this is an INPUT refusal before any computation.',
    short: 'The math input is incomplete or malformed.',
    reachable: 'Supply the keys the hint lists (statement/proof/…) in the taught fence shape, then retry the computation.',
  }),
  VMU_SEAT_FACE_UNKNOWN: Object.freeze({
    means: 'A tool-face name was resolved against the seat-face table and is not one this pack declares — the name is not a face, it is a typo or a face another deployment would own.',
    short: 'That tool-face name is not declared by this pack.',
    reachable: 'Use a face name from the pack\'s declared set (vibe_v5_tool_help lists the seat\'s reachable faces).',
  }),
  VMU_FEEDBACK_ACTION_IS_THE_OPERATION: Object.freeze({
    means: 'The feedback face takes its verb as the OPERATION (`action`) rather than as an argument — the call mixed the two, so the face cannot tell what you meant.',
    short: 'Pass the feedback verb as `action`, not as an argument.',
    reachable: 'Call vibe_v5_feedback with `action:"<create|list|close|…>"` and keep the rest as its declared parameters.',
  }),
  VMU_RECORD_SETTLEMENT_REWRITE: Object.freeze({
    means: 'A settled record row cannot be rewritten (settlement is a one-way state) — the attempt to modify a settled fact was refused instead of silently forking it.',
    short: 'A settled record cannot be rewritten.',
    reachable: 'Append a new row (or a revision) instead of rewriting the settled one; the settled fact stays as it was.',
  }),
  VMU_PACK_V5R_CORE_P1_RULING_UNRESOLVED: Object.freeze({
    means: 'The P1 ruling was asked to conclude while the underlying debate is unresolved (no decision, or an undecided tie) — the gate needs a resolution, not just a filing.',
    short: 'The P1 debate is unresolved; no ruling can conclude.',
    reachable: 'Resolve the debate first (the meeting face names the missing votes), then file the ruling.',
  }),
  VMU_PACK_V5R_CORE_P1_RULING_NOT_UNANIMOUS: Object.freeze({
    means: 'This institute\'s quorum rule for the P1 ruling is m-unanimous and the votes are not unanimous — the ruling is refused by the declared rule rather than recorded as decided.',
    short: 'The P1 ruling is not unanimous under this rule.',
    reachable: 'Reopen discussion until the required unanimity, or change vmu.meetings.quorumRule if this deployment really uses another rule.',
  }),
  VMU_PACK_V5R_SOCIAL_WARRANT_REFUSED: Object.freeze({
    means: 'A social act (say/message) lacked the warrant this institute requires for that channel (a cited source, a declared motive) — refused rather than sent without its warrant.',
    short: 'The social act lacks its required warrant.',
    reachable: 'Add the warrant field the receipt names (e.g. a cited basis/motive), or use the channel whose contract does not need it.',
  }),
  VMU_PACK_V5R_VERIFIED_NEEDS_JUDGE: Object.freeze({
    means: 'A verified-row promotion needs a JUDGE verdict and none is recorded (a promotion cannot be self-certified) — the gate is about WHO may certify.',
    short: 'No judge verdict is recorded for this promotion.',
    reachable: 'Have a judge seat file the verdict on the debate/ruling face, then repeat the promotion.',
  }),
  VMU_PACK_V5R_P1_NEEDS_DEBATE: Object.freeze({
    means: 'A P1 ruling was attempted with no debate at all — the institution requires a debate before a proposition-level ruling, even when the answer seems obvious.',
    short: 'A P1 ruling needs a debate first.',
    reachable: 'Open a debate meeting on the proposition (vibe_v5_meeting) and let it produce the votes, then file the ruling.',
  }),
  VMU_PACK_V5R_FORMAL_REQUIRED: Object.freeze({
    means: 'formalmachine-check is REQUIRED by this deployment (vmu.math.formalVerify=require) and this call carried no passing formal evidence — the policy gate refused the conclusion.',
    short: 'This deployment REQUIRES formal (Lean) evidence for this act.',
    reachable: 'Produce and archive a passing Lean run (vibe_v5_lean_run → archive), or set vmu.math.formalVerify to a policy that matches this institution.',
  }),
  VMU_RULING_NO_SUBMISSIONS: Object.freeze({
    means: 'A ruling was filed while no submission/proposal exists to rule on — the ruling body has nothing before it.',
    short: 'There is no submission to rule on.',
    reachable: 'Let members submit positions/proposals first, then file the ruling.',
  }),
  VMU_RULING_CONTRADICTS_SUBMISSION: Object.freeze({
    means: 'The ruling contradicts a recorded submission (the decision does not match what was proposed/voted) — the ledger refuses a ruling that rewrites the record it decides.',
    short: 'The ruling contradicts the recorded submission.',
    reachable: 'File a ruling that matches the recorded submission/votes, or record the change of position first so the ledger can show it.',
  }),
  VMU_ASK_NOTHING_DELIVERED: Object.freeze({
    means: 'An ask produced no deliverable at all (no message, no file, no row) — the receipt says the act delivered NOTHING rather than pretending delivery.',
    short: 'The ask delivered nothing (no message/file/row).',
    reachable: 'Deliver the artifact before closing the ask (the face names the deliverable slots), or mark the ask as not needed.',
  }),
  VMU_MEETING_AGENDA_CONFLICT: Object.freeze({
    means: 'Both `agenda` and its kernel-side alias `materials` were supplied with different content — the meeting stores ONE line, so passing two is a conflict, not a merge.',
    short: 'Pass exactly one of agenda/materials, not both.',
    reachable: 'Send ONE stored line: `agenda` (or `materials` alone); drop the other.',
  }),
  VMU_BALLOT_MIN_VOTES_NOT_MET: Object.freeze({
    means: 'The ballot\'s declared minimum number of votes was not reached before this act — an institutional quorum rule, not a call error.',
    short: 'The ballot did not reach its declared minimum votes.',
    reachable: 'Collect the missing votes (the receipt names the minimum/current count), then retry the act.',
  }),
  VMU_RULING_NO_LEDGER: Object.freeze({
    means: 'The ruling ledger face is not published in this deployment, so a ruling cannot be recorded — absence of the seam, named.',
    short: 'No ruling ledger is published here.',
    reachable: 'Record the ruling through the meeting/minutes face that IS published, or have the deployment publish the ledger.',
  }),
  VMU_RULING_CHAIR_SIGNS: Object.freeze({
    means: 'Only the chair seat may sign/file the ruling (the institution puts the pen in the chair\'s hand) — another seat\'s attempt is refused.',
    short: 'Only the chair seat may sign this ruling.',
    reachable: 'Have the chair seat call this face (or the office acting for the chair), or use the face your role does own.',
  }),
  VMU_RULING_NOT_DEBATER: Object.freeze({
    means: 'The caller is not a debater in this debate, so it cannot file a ruling in it — the body of participants is declared, not inferred.',
    short: 'The caller is not a debater in this debate.',
    reachable: 'File the ruling from a seat that IS in the debate (the receipt names the participants), or convene/seat the right debater first.',
  }),
  VMU_RULING_ALREADY_FILED: Object.freeze({
    means: 'A ruling for this target was already filed — the ledger holds ONE ruling per target, and a second file would fork the record.',
    short: 'A ruling is already filed for this target.',
    reachable: 'Read the filed ruling (its face lists rulings), or supersede it through the declared revision path.',
  }),
  VMU_RULING_NEEDS_CHANNEL: Object.freeze({
    means: 'The ruling was submitted through the wrong channel (the reply fence vs the tool, or a face that does not carry rulings) — the act is legal, the carrier is not.',
    short: 'The ruling came through a channel that cannot carry it.',
    reachable: 'File the ruling on the face the receipt names (e.g. vibe_v5_meeting/vibe_v5_verified ruling action), not through a free-text reply.',
  }),
  VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING: Object.freeze({
    means: 'The paper section claimed a conclusion whose evidence cards/rows are missing — the paper gate refuses an assertion the record cannot support.',
    short: 'The paper section lacks its evidence cards.',
    reachable: 'Record the evidence cards/verified rows first (the receipt names what is needed), then write/adopt the section.',
  }),
  VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN: Object.freeze({
    means: 'A citation in the paper points at a source this institute does not hold — the paper face refuses a citation that resolves to nothing.',
    short: 'A citation names a source that is not held here.',
    reachable: 'Import/record the cited source first (or cite an existing one the receipt lists), then render/adopt.',
  }),
  VMU_ENGINE_FAILURE: Object.freeze({
    means: 'The underlying engine/service raised while performing the request — the seam EXISTS but failed this time; the failure is named rather than reported as a plain success.',
    short: 'The underlying engine failed while performing the request.',
    reachable: 'Read the failure message, fix its cause (or retry once), and if it persists treat the seam as unavailable and report it.',
  }),
  VMU_MEMBER_SESSION_NOT_LIVE: Object.freeze({
    means: 'This member\'s session existed and has ENDED — there is a session to reopen (distinct from "never opened").',
    short: 'The member session existed but is no longer live.',
    reachable: 'Drive the member again (vibe_vmu_turn {op:"drive"}), or seat it again via vibe_vmu_control {action:"hire"}, then call again.',
  }),
  VMU_MEMBER_SESSION_NEVER_OPENED: Object.freeze({
    means: 'This member has NEVER had a live session — there is no wire to reopen, only one to open (distinct from "ended").',
    short: 'The member never had a session; there is nothing to reopen.',
    reachable: 'Seat the member (vibe_vmu_control {action:"hire"}) or drive it (vibe_vmu_turn {op:"drive"}) so a session opens.',
  }),
  VMU_FIRE_CALLER_UNKNOWN: Object.freeze({
    means: 'A scheduled/triggered fire could not name its caller (the agent/turn context that fired it is gone) — the act cannot be attributed, so it is refused rather than recorded anonymously.',
    short: 'The firing caller cannot be identified.',
    reachable: 'Fire from a live member/turn context (the face that schedules names the caller), or re-drive the member so the caller exists.',
  }),
  // ── FRAMEWORK / HOST / KERNEL-TOOL CODES (round-10 boundary: the corpus refusals that reach the MODEL through a
  // tool face, not just the pack's own construction sites). These are the codes the host pre-gate, the kernel tool
  // modules (`tools/*.js`), the kit and the pack tool faces can emit; the SAME decorator runs at the host boundary, so
  // a receipt from any of these modules carries means + both hint forms.
  VMU_TOOL_NOT_IN_FACE: Object.freeze({
    means: 'The seat\'s tool FACE does not include this tool (a seat ACL): the tool exists, the caller is known, and the institution declares that this seat may not call it — a SCOPE refusal, not a permission typo.',
    short: 'This seat\'s tool face does not include this tool.',
    reachable: 'Call the face this seat DOES own (the receipt lists or the seat-face declaration names them), or ask the office to widen the seat\'s face.',
  }),
  VMU_TOOL_FACE_UNRESOLVED: Object.freeze({
    means: 'The face name could not be resolved to a declared tool face at all (a typo, or a face this deployment never declares) — the host cannot decide membership for a face that does not exist.',
    short: 'The tool face name cannot be resolved.',
    reachable: 'Use a face name from the declared set (tool_help / the seat-face declaration lists them).',
  }),
  VMU_PACK_CONFLICT: Object.freeze({
    means: 'A pack tried to declare something another owner already owns (a setting, a service name, an alias) without an explicit override — O4: conflicts are refused, never merged silently.',
    short: 'The pack declaration conflicts with an existing owner.',
    reachable: 'Drop the duplicate declaration, or declare vmu.packs.allowKernelOverride=true when overriding is really intended.',
  }),
  VMU_PACK_MISSING: Object.freeze({
    means: 'The named pack could not be found or did not validate: no manifest, and no data folder that would make it a data-only pack.',
    short: 'The named pack does not exist or is invalid.',
    reachable: 'Check the id against the shipped preset roster (docs/27 §6.6) and keep the pack folder where the loader resolves it.',
  }),
  VMU_PACK_INVALID: Object.freeze({
    means: 'A pack manifest was found but does not have the shape the loader consumes (an id, a version, and lists of the kinds it declares) — the refusal names the problem list.',
    short: 'The pack manifest is malformed; see the problem list.',
    reachable: 'Fix the manifest fields the receipt lists (docs/10 §2 shape), then apply again.',
  }),
  VMU_PACK_DIR_INVALID: Object.freeze({
    means: 'A `config.packDirs` entry is not a usable directory (empty or relative): an external pack root must be an absolute path, because a relative one would resolve against an unknowable cwd.',
    short: 'A packDirs entry is not an absolute directory.',
    reachable: 'Pass absolute paths in config.packDirs (or drop packDirs and use the shipped packs/ root).',
  }),
  VMU_PACK_ID_INVALID: Object.freeze({
    means: 'A requested pack id is not a safe identifier (separators / "." / ".." / illegal characters) or resolves outside the allowed pack roots — pack ids are identifiers, never paths.',
    short: 'The pack id is not a safe identifier (or escapes the pack root).',
    reachable: 'Use an id matching /^[A-Za-z0-9._-]+$/ that names a folder under a declared root.',
  }),
  VMU_PACK_ID_DUPLICATE: Object.freeze({
    means: 'The same pack id is provided by more than one root (or a file and an inline declaration): two providers with one id would make "which one won" a silent choice.',
    short: 'The same pack id is provided twice; nothing was chosen.',
    reachable: 'Declare the pack in exactly ONE root (or one inline object); the receipt lists every candidate path.',
  }),
  VMU_PACK_RUNTIME_DATA_UNREADABLE: Object.freeze({
    means: 'The pack\'s runtime.json exists but cannot be read (broken link / permission), so the pre-kernel declarations cannot be honoured.',
    short: 'The pack runtime.json exists but cannot be read.',
    reachable: 'Fix the file\'s readability (or remove it); reinstall if it was shipped broken.',
  }),
  VMU_PACK_CONTRIBUTION_UNREADABLE: Object.freeze({
    means: 'An external pack\'s index.js exists but its real path cannot be resolved, so its hooks cannot be imported.',
    short: 'The external pack index.js cannot be resolved.',
    reachable: 'Fix the file/link inside the declared pack root, then re-apply the pack.',
  }),
  VMU_PACK_CONTRIBUTION_ABSENT: Object.freeze({
    means: 'An external pack ships an index.js but no PACK_CONTRIBUTION export: its DATA applies while its HOOKS do not — said out loud instead of silently missing.',
    short: 'The external pack exports no PACK_CONTRIBUTION (data only).',
    reachable: 'Export PACK_CONTRIBUTION {sectionPolicy, noticeBlock} from <packDir>/<id>/index.js if this pack has hooks.',
  }),
  VMU_MIDDLEWARE_FAILED: Object.freeze({
    means: 'A middleware/module/bus operation raised while performing the call — the seam exists and failed; the refusal is the raised failure, named rather than reported as success.',
    short: 'A middleware or bus operation failed while performing the call.',
    reachable: 'Read the message: fix the failing entry/module and retry; if the bus itself is unavailable, report the seam rather than retrying.',
  }),
  VMU_GATE_UNSATISFIED: Object.freeze({
    means: 'A domain-compliance gate refused the call because the declared compliance evidence is missing or stale — the extension\'s policy, not a tool bug.',
    short: 'A compliance gate refused: evidence missing or stale.',
    reachable: 'Record the evidence the gate names (or change the declared compliance policy in this deployment).',
  }),
  VMU_META_VALIDATION_FAILED: Object.freeze({
    means: 'The metadata/arguments of a domain object failed the declared validation rules (required fields, enums, date direction) before it could be stored.',
    short: 'The object metadata failed the declared validation.',
    reachable: 'Supply the fields the receipt lists in the declared shape/domain, then retry.',
  }),
  VMU_REGISTRATION_MISSING: Object.freeze({
    means: 'A required registration (a compliance/consent/training record) is absent for this subject, so the gate cannot let the act through.',
    short: 'A required registration is missing.',
    reachable: 'File the registration the receipt names, then retry the act.',
  }),
  VMU_IACUC_EXPIRED: Object.freeze({
    means: 'The animal-use (IACUC) approval for this work is expired — the institution may not act on differing evidence.',
    short: 'The IACUC approval has expired.',
    reachable: 'Renew the approval and record it, then retry; otherwise the act stays refused.',
  }),
  VMU_CONSENT_VERSION_MISMATCH: Object.freeze({
    means: 'The recorded consent is for a DIFFERENT protocol version than the one now in force — consent is versioned, so an old version is not consent.',
    short: 'The recorded consent is for another protocol version.',
    reachable: 'Re-consent the subject under the version in force (or restore the version the consent names).',
  }),
  VMU_SAE_REPORT_OVERDUE: Object.freeze({
    means: 'A serious-adverse-event report is overdue: the declared reporting window passed — the gate refuses further progress until the report is filed.',
    short: 'A serious-adverse-event report is overdue.',
    reachable: 'File the report (the receipt names the event/window), then continue.',
  }),
  VMU_THREE_R_INCOMPLETE: Object.freeze({
    means: 'The 3R (replacement/reduction/refinement) justification for this study is incomplete, so the ethics gate refuses the act.',
    short: 'The 3R justification is incomplete.',
    reachable: 'Complete the 3R fields the receipt names and retry.',
  }),
  VMU_FACILITY_UNACCREDITED: Object.freeze({
    means: 'The facility named by this study is not accredited in the deployment\'s declarations, so it may not host the work.',
    short: 'The named facility is not accredited here.',
    reachable: 'Use an accredited facility, or record the accreditation before the act.',
  }),
  VMU_TRAINING_EXPIRED: Object.freeze({
    means: 'A required training/certification for this person is expired, so the institution refuses to let them perform the act.',
    short: 'A required training has expired.',
    reachable: 'Record the renewed training, then retry.',
  }),
  VMU_REGISTRY_BOUNDARY: Object.freeze({
    means: 'A request crossed a registry boundary: the id exists in a DIFFERENT registry/namespace than the one this face reads — the object is real, the face is looking in the wrong table.',
    short: 'The id belongs to a different registry than this face reads.',
    reachable: 'Use the face that owns that registry (the receipt names it), or the id of an object in THIS registry.',
  }),
  VMU_TURN_OP_MISSING: Object.freeze({
    means: 'The turn face was called without the required `op` (the verb that says which turn operation to perform) — the face cannot infer the operation from the other fields.',
    short: 'The turn call is missing its `op`.',
    reachable: 'Pass the `op` your intent uses (reply/drive/step/status…) with its declared parameters.',
  }),
  VMU_HUMAN_LIFT_ROLE: Object.freeze({
    means: 'The caller tried to lift a human veto but does not hold a role in `vmu.human.vetoLiftRoles` — lifting is role-scoped authority.',
    short: 'The caller may not lift this human veto.',
    reachable: 'Have a seat listed in vmu.human.vetoLiftRoles lift it (receipt names the required roles).',
  }),
  VMU_LEAN_STATEMENT_REQUIRED: Object.freeze({
    means: 'A Lean run/archive needs the statement (the proposition text) and this call carried none — the artifact cannot be named without it.',
    short: 'The Lean call needs a `statement`.',
    reachable: 'Pass `statement` (and the file/name the action needs) exactly once, then retry.',
  }),
  VMU_LEAN_BLOCKED_NOTE_REQUIRED: Object.freeze({
    means: 'An archive of kind "blocked" requires the blocking `note`: a blocked record without a reason is unauditable, so it is refused instead of written.',
    short: 'A blocked archive record needs its `note`.',
    reachable: 'Pass `note` with the blocking reason (that note is also what later lets the formal gate pass), or archive a real passing run.',
  }),
  VMU_LEAN_NOT_FOUND: Object.freeze({
    means: 'The named Lean artifact/job/archive row does not exist — absence, not a failed check.',
    short: 'The named Lean artifact does not exist.',
    reachable: 'List the Lean archives/jobs first and use an existing name (or run the job before reading it).',
  }),
  VMU_EXTERNAL_UNAVAILABLE: Object.freeze({
    means: 'An external toolchain/engine this face needs (an external prover/solver/binary) is not available in this deployment, so the request is refused rather than faked.',
    short: 'The external toolchain this face needs is unavailable.',
    reachable: 'Install/declare the external engine, or use the face that works without it (the receipt names it).',
  }),
  VMU_EXIT_FLUSH_UNAVAILABLE: Object.freeze({
    means: 'The exit flush could not run because this assembly has no durable store seam to flush to — the shutdown is refused by name so "nothing was written" cannot be mistaken for "all was written".',
    short: 'The exit flush has no durable store to write to.',
    reachable: 'Construct the kernel with a durable root/store, or read the state through a face that does not need flushing.',
  }),
  VMU_SPAWN_HANDLE_CALLBACK_FAILED: Object.freeze({
    means: 'A spawn handle\'s callback threw: the child/subagent seam exists but its completion callback failed — the failure is named with the handle rather than swallowed.',
    short: 'A spawn-handle callback failed.',
    reachable: 'Fix the callback (the receipt names the handle), or interrupt the child and re-spawn it.',
  }),
  VMU_SPAWN_TIMER_CLEANUP: Object.freeze({
    means: 'A spawn timer could not be cleaned up during teardown — a resource-leak reading, reported by name instead of being ignored.',
    short: 'A spawn timer could not be cleaned up.',
    reachable: 'Retry teardown / re-spawn; if it persists, report the leaked timer with the receipt facts.',
  }),
  // ── HOST SEAM CODES (the host's own refusals reach the model through the same tool receipts).
  VMU_TURN_DELIVERY_TIMEOUT: Object.freeze({
    means: 'A turn delivery exceeded the declared delivery deadline (vmu.turn.deliveryTimeoutMs) — the loop killed the delivery at the budget, so the turn is refused rather than left half-delivered.',
    short: 'The turn delivery exceeded the declared deadline.',
    reachable: 'Retry once if the peer is alive; otherwise record the timeout (the receipt keeps the budget/source) and deliver by another declared transport.',
  }),
  VMU_EXIT_FLUSH_FAILED: Object.freeze({
    means: 'The exit flush ran but one of its writes failed — shutdown cannot claim "everything was persisted", so it reports the failure instead of a clean exit.',
    short: 'The exit flush failed to persist its writes.',
    reachable: 'Fix the failing write (receipt names it) and flush again; do not treat the exit as clean until it succeeds.',
  }),
  VMU_EXIT_FLUSH_INCOMPLETE: Object.freeze({
    means: 'The exit flush did not cover everything it was supposed to (a seam/collection was missing) — the shutdown is honest about what it could not flush.',
    short: 'The exit flush was incomplete.',
    reachable: 'Construct the kernel with the missing durable seam so the flush can cover it, then exit again.',
  }),
  VMU_RESUME_CHILDREN_UNAVAILABLE: Object.freeze({
    means: 'Recovery could not check the direct-child roster because this host exposes no durable children directory — recovery still proceeds, but says the roster could not be verified.',
    short: 'The child roster could not be read during recovery.',
    reachable: 'Use a host that exposes subagents.listChildren, or reconcile the roster by hand before relying on recovery.',
  }),
  VMU_PACK_RUNTIME_DATA_INVALID: Object.freeze({
    means: 'A pack runtime.json exists but is not valid JSON / not an object — the pre-kernel declarations cannot be read, so the pack\'s data is absent (named, not skipped silently).',
    short: 'The pack runtime.json is invalid.',
    reachable: 'Fix the JSON (the receipt names the file) and re-run; reinstall if it was shipped broken.',
  }),
  VMU_PACK_CONTRIBUTION_IMPORT_FAILED: Object.freeze({
    means: 'A pack\'s index.js was found but importing it threw, so its PACK_CONTRIBUTION hooks (and manifest) could not be loaded — the failure is named with the file.',
    short: 'The pack module failed to import.',
    reachable: 'Fix the module (syntax/import error the receipt names) or reinstall the pack, then apply again.',
  }),
  VMU_STORE_FAILED: Object.freeze({
    means: 'The durable store raised during open/read/write: the persistence seam exists and failed, so the act is refused rather than reported as persisted.',
    short: 'The durable store failed.',
    reachable: 'Check the store root/permissions named in the message, open the store again, and retry the act.',
  }),
  VMU_IDS_UNAVAILABLE: Object.freeze({
    means: 'The persistent id counters could not be hydrated (the id seam is missing or unreadable), so minting would risk duplicates — the face refuses instead of minting blind ids.',
    short: 'The id counters are unavailable.',
    reachable: 'Start the kernel with its id ledger readable (or pass a store the counters can be stored in), then retry.',
  }),
  VMU_RESUME_UNAVAILABLE: Object.freeze({
    means: 'The recovery face needs a durable root and this assembly has none — there is nothing to recover FROM, so recovery refuses by name instead of pretending.',
    short: 'Recovery is unavailable: no durable store.',
    reachable: 'Construct the kernel with { store } (a durable root) — docs/07 §3 — or skip recovery for this deployment.',
  }),
  // ── KERNEL-SERVICE CODES THAT REACH THE MODEL THROUGH TOOL RECEIPTS (round-11 corpus attribution): these are
  // emitted by kernel services and surface in tool回执 (thrown → host catch, or returned as data → normalized at the
  // host boundary). They need a means for the SAME reason the tool modules do: the model reads the code off a tool receipt.
  VMU_NOT_FOUND: Object.freeze({
    means: 'The id/name this call names is not in the registry/collection it was looked up in — absence, not a failed check (nothing was compared). Distinct from VMU_NO_SUCH_OBJECT by vocabulary only: this code is the registry/collection face\'s own name for the same absence.',
    short: 'The named id/name does not exist in that registry.',
    reachable: 'List that registry/collection first and pass an existing id (the receipt names the registry), or create the row before referring to it.',
  }),
  VMU_RECORDS_REINDEX_BLOCKED: Object.freeze({
    means: 'A records reindex/rebuild was refused because the store cannot be reindexed safely in this state (a live writer/conflicting generation) — the index is left as it was rather than rebuilt on unsafe input.',
    short: 'The records reindex was refused; the index is unchanged.',
    reachable: 'Stop/complete the concurrent write (receipt names it) and retry the reindex, or read the existing index without rebuilding.',
  }),
  VMU_CONTROL_PARAM_UNAVAILABLE: Object.freeze({
    means: 'A control-tune parameter was asked for but this deployment does not declare it (vmu.control.* unknown) — the parameter is ABSENT, not silently defaulted.',
    short: 'That control parameter is not declared here.',
    reachable: 'Read status/keysUsed to see the declared control parameters, or declare the key in vmu.control.* before tuning it.',
  }),
  VMU_FORMAL_REPRO_INCOMPLETE: Object.freeze({
    means: 'A formal record is missing part of its reproduction evidence (artifact/command/digest set), so it cannot be treated as reproducible — the gate refuses rather than accepting a partial record.',
    short: 'The formal record\'s reproduction evidence is incomplete.',
    reachable: 'Fill the missing reproduction fields the receipt lists (artifact/command/digest), then re-read or re-verify.',
  }),
  VMU_MAILBOX_NO_SUCH_ENTRY: Object.freeze({
    means: 'The mailbox entry this call names does not exist in that box (wrong box, already purged, or a typo) — absence in a specific box, not a permission refusal.',
    short: 'That mailbox entry does not exist in this box.',
    reachable: 'List the box first (inbox shows ids) and use an existing entry id; a purged entry cannot be read again.',
  }),
  VMU_REPORT_PARAM_NOT_DECLARED: Object.freeze({
    means: 'A report face was given a parameter no report handler declares — the report vocabulary is DECLARED, so an undeclared parameter is refused instead of being dropped.',
    short: 'The report parameter is not declared by that handler.',
    reachable: 'Use the parameter names the report face declares (docs/18 / its parameter table), or pass the report body the handler expects.',
  }),
  VMU_ENV_UNKNOWN_NEED: Object.freeze({
    means: 'An environment need was referenced that this deployment never declared in vmu.env.needs — the deployment declares which external needs exist, so an unknown name is a typo/config gap.',
    short: 'That environment need is not declared here.',
    reachable: 'Declare the need in vmu.env.needs (or use a declared name — env.probe/list names them) before probing it.',
  }),
  VMU_MATH_UNSUPPORTED_OP: Object.freeze({
    means: 'The requested math operation is not supported by the available engine/adapter — the ENGINE cannot carry this op (not a bad argument), so it is refused rather than approximated silently.',
    short: 'No available math engine supports that operation.',
    reachable: 'Use an operation the engine supports (math status names the capabilities), or install/declare an engine that provides it.',
  }),
  VMU_PACK_V5R_DEBATE_SUBJECT_NO_PROOF: Object.freeze({
    means: 'A debate was asked to run on a one-line subject that carries no addressable proof carrier — v5r requires either a card whose written proof is finished, or a file reference, so the subject cannot be debated as stated.',
    short: 'The debate subject has no addressable proof carrier.',
    reachable: 'Pass a card with proofRef + proofState:"complete" (or a verified row / passed Lean run), or a subject_evidence.file; a bare sentence is not a carrier.',
  }),
  VMU_MAILBOX_DELIVERY_FAILED: Object.freeze({
    means: 'A mailbox delivery raised while performing the send — the mail seam exists and failed; the refusal names the failure instead of reporting a delivered message.',
    short: 'The mailbox delivery failed.',
    reachable: 'Read the failure the receipt names (box/permission/transport), fix it, and resend; do not assume the message arrived.',
  }),
  VMU_DIRECTION_INCOMPLETE: Object.freeze({
    means: 'A direction/plan entry is missing required parts (goal/steps/owner), so the institution\'s direction set cannot be used as declared — refused rather than accepted half-defined.',
    short: 'The direction entry is incomplete.',
    reachable: 'Fill the fields the receipt names and re-submit; read the current directions to see the declared shape.',
  }),
  VMU_CHAT_ALREADY_SPOKE: Object.freeze({
    means: 'The member already spoke in this chat round — one voice per member per round, so a second utterance is refused instead of appending twice.',
    short: 'This member already spoke in this round.',
    reachable: 'Wait for the next round, or edit your earlier utterance through the round-owning face; do not repeat the same speech.',
  }),
  VMU_ACTIVITY_INVALID_TIMEOUT: Object.freeze({
    means: 'The activity/wait timeout is not a value the face accepts (negative/non-finite/outside the declared range) — a CALL-SHAPE refusal on the timeout parameter.',
    short: 'The activity timeout is not a usable value.',
    reachable: 'Pass a finite timeout in the declared range (activity status shows the accepted shape), or omit it to use the declared default.',
  }),
  // ── ROUND-11 FROZEN-LAYER CODES (the other scenarios' refusal vocabulary; same surface, read off tool receipts).
  VMU_OFFICE_CONSULT_REQUIRED: Object.freeze({
    means: 'The paper action needed the office/chair consult answer first (vmu.paper.officeConsult) and none is recorded — the policy gate refuses the step rather than proceeding unconsulted.',
    short: 'The office consult answer is required first.',
    reachable: 'Have a declared consult role answer on the paper consult face, then repeat the action (or change vmu.paper.officeConsult if this deployment does not require it).',
  }),
  VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING: Object.freeze({
    means: 'A paper step needs a LaTeX/executor seam this deployment does not publish (no engine/executor) — the artifact cannot be produced here, so the step is refused rather than faked.',
    short: 'No paper executor/LaTeX engine is available.',
    reachable: 'Install/declare the missing engine (the receipt names it), or take the route that does not need an executor.',
  }),
  VMU_RESOURCE_BUDGET: Object.freeze({
    means: 'A declared resource budget (jobs/tokens/load class) would be exceeded by this call — a POLICY quota refusal, not a malformed request.',
    short: 'This call would exceed a declared resource budget.',
    reachable: 'Wait for capacity or raise the declared budget (vmu.resource.*), then retry; the receipt names which budget was hit.',
  }),
  VMU_LATE_ADMISSION_REFUSED: Object.freeze({
    means: 'The member arrived after the declared late-arrival boundary and this meeting\'s lateAdmission policy is "refuse" (or the chair has not admitted them) — attending is a policy decision, not an error.',
    short: 'Late admission is refused by this meeting\'s policy.',
    reachable: 'Ask the chair to admit the seat (meeting {action:"admit"}), or attend the next meeting on time (late boundary is vmu.meetings.lateAfterMs).',
  }),
  VMU_TASK_BRIEF_MISSING: Object.freeze({
    means: 'A task update that requires the brief found no brief on the task — v5r requires the task to carry its own brief before this update can apply.',
    short: 'The task has no brief yet.',
    reachable: 'Write the brief first (task {action:"brief"}), then repeat the update.',
  }),
  VMU_RESUME_READBACK_DRIFT: Object.freeze({
    means: 'A resume readback did not match what was persisted (the restored view differs from the durable row) — a DRIFT reading, reported instead of silently accepting a divergent state.',
    short: 'Resume readback drifted from what was persisted.',
    reachable: 'Re-open the durable store/ledger and re-run recovery; if the drift repeats, report the receipt (it names both readings).',
  }),
  VMU_QUOTA_EXCEEDED: Object.freeze({
    means: 'A declared quota (per-member/per-face/global) is exhausted by this call — the quota is policy, the shape is fine.',
    short: 'A declared quota is exhausted.',
    reachable: 'Free capacity or raise the declared quota (the receipt names which one), then retry.',
  }),
  VMU_HUMAN_APPROVAL_PENDING: Object.freeze({
    means: 'The human-in-the-loop gate registered this action and is WAITING for an approval decision — a pending human step, distinct from a refusal of the action itself.',
    short: 'A human approval is pending for this action.',
    reachable: 'Have the declared decider approve on the human face (the receipt names the request/decider), then retry the action.',
  }),
  VMU_TURN_PARKED_NEEDS_OWNER: Object.freeze({
    means: 'A parked turn needs an owner seat to resume it and none is recorded — the turn cannot continue anonymously.',
    short: 'A parked turn has no owner to resume it.',
    reachable: 'Name the owner seat (drive/member context) that should resume the parked turn, then resume it.',
  }),
  VMU_TURN_NO_FENCE: Object.freeze({
    means: 'A reply was expected in a fenced block and the turn carried none — the loop cannot parse an unfenced reply, so it refuses instead of guessing.',
    short: 'The turn reply has no fenced block.',
    reachable: 'Write the reply inside the taught fence (the channel prompt shows its shape), then re-submit.',
  }),
  VMU_TURN_ALREADY_PARKED: Object.freeze({
    means: 'This turn is already parked — parking twice would lose the first reason, so the second park is refused.',
    short: 'This turn is already parked.',
    reachable: 'Resume the existing parked turn (its face lists the parked row) instead of parking it again.',
  }),
  VMU_TURN_STALE_REPLY: Object.freeze({
    means: 'A reply arrived for a turn that is no longer the current one (stale round/sequence) — accepting it would write into the wrong turn, so it is refused by name.',
    short: 'The reply belongs to a stale turn.',
    reachable: 'Read the current turn/receipt (the status face names the expected round) and reply to THAT turn.',
  }),
  VMU_TASK_BLOCKED: Object.freeze({
    means: 'The task cannot proceed because it is blocked by a declared dependency/blocker — the task state machine refuses the step, not the call shape.',
    short: 'The task is blocked by a dependency.',
    reachable: 'Resolve or remove the blocking dependency (task board lists blockers), then retry the step.',
  }),
  // ── RUN-87 P1 readiness hardening (final30b G1): the prompt-policy dispatcher refuses BY NAME instead of
  // switching nothing when pack contributions are declared but the async install has not settled yet.
  VMU_PROMPT_POLICY_NOT_READY: Object.freeze({
    means: 'packs are declared but their prompt policy contribution is not registered yet: the async pack install has not settled, so dispatching now would silently switch NO policy (and render mutually-exclusive fixture sections); the dispatcher refuses by name instead of switching nothing.',
    short: 'The pack prompt policy is not registered yet; await readiness.',
    reachable: 'Await handle.ready() (it waits for the pack install) before dispatching turns; status().promptPolicies.policiesReady reports the same readiness — once settled with NO policy, a data-only pack is legitimate and the dispatcher switches nothing.',
  }),
  // ── RUN-88 P1 deferred-namespace reconcile (final31 G1): after the pack install settles, deferred setting
  // values are re-screened against the real declarations; a value that is still illegal/unknown is reported by name.
  VMU_SETTINGS_INVALID: Object.freeze({
    means: 'A settings value failed the declaration screen at the deferred-namespace reconcile: the key is not declared (or its namespace is still unknown after the pack install settled) or the value is outside its type/domain, so it is REJECTED by name instead of being silently kept or silently defaulted.',
    short: 'A settings value/key is invalid at the deferred reconcile.',
    reachable: 'Read the rejection and fix the value: run check-settings --json (or read status.settings.rejected) to see key + reason, then correct the key name / type / enum value or declare the namespace (packs/<id>/settings/declarations.js) before re-running.',
  }),
})

/** The means for a code, or null. `null` is HONEST ABSENCE (the validator turns it into a red gate). */
export function refusalMeansOf(code) {
  const row = REFUSAL_MEANS[String(code || '')]
  return row ? row.means : null
}

/** One line, ≤ ~80 chars, derived from the table (short) — never a paragraph. */
export function refusalShortOf(code, fallback = '') {
  const row = REFUSAL_MEANS[String(code || '')]
  const text = row ? row.short : String(fallback || '')
  const line = String(text).replace(/\s+/g, ' ').trim()
  return line.length > 96 ? line.slice(0, 93).replace(/[，。；、,. ]+$/, '') + '…' : line
}

/** The FULL hint: the original text is kept (superset), plus `REACHABLE INSTEAD:` when it is not already there. */
export function refusalFullOf(code, originalHint = '') {
  const row = REFUSAL_MEANS[String(code || '')]
  const original = String(originalHint === null || originalHint === undefined ? '' : originalHint).trim()
  const reachable = row ? String(row.reachable || '').trim() : ''
  if (!reachable) return original || null
  if (/REACHABLE INSTEAD/i.test(original)) return original
  const clause = 'REACHABLE INSTEAD: ' + reachable
  return original ? original + ' — ' + clause : clause
}

/** Decorate ONE receipt (`{ok:false,…}`) or ONE refusal error (THEN rethrown by the caller). Idempotent: an existing
 *  `means`/`hintShort`/`hintFull` is never overwritten. `form` selects which shape lands in `hint` (full by default). */
export function decorateRefusal(out, { form = null } = {}) {
  if (!out || typeof out !== 'object') return out
  const code = out.code
  if (out.means === undefined) {
    const means = refusalMeansOf(code)
    out.means = means
    if (means === null) out.meansMissing = true
  }
  if (out.hintShort === undefined) out.hintShort = refusalShortOf(code) || null
  if (out.hintFull === undefined) out.hintFull = refusalFullOf(code, typeof out.hint === 'string' ? out.hint : '')
  const wanted = form || out.hintForm || 'full'
  if (out.hintForm === undefined) out.hintForm = wanted
  // The chosen form lands in `hint`; the FULL form is a SUPERSET (original text + REACHABLE INSTEAD), so selecting
  // full never drops what the old receipt said, and `hintFull`/`hintShort` keep both forms readable either way.
  if (wanted === 'short') out.hint = out.hintShort
  else out.hint = out.hintFull
  return out
}

/** The same decoration for a THROWN refusal: the host copies every own enumerable fact, so attaching them here is
 *  what makes `means`/`hintShort`/`hintFull` reach the model for thrown refusals too. */
export function decorateThrownRefusal(e, opts = {}) {
  if (!e || typeof e !== 'object' || typeof e.code !== 'string') return e
  try { decorateRefusal(e, opts) } catch { /* decoration must never mask the refusal */ }
  return e
}


/** Named exemption ledger: a code that genuinely cannot carry a means must be listed here WITH its reason. It is
 *  EMPTY today (the discovery covers 100% of the tool-facing codes) and it is exported so the validator can print it —
 *  "forgotten" and "deliberate" must stay distinguishable. */
export const REFUSAL_MEANS_EXEMPT = Object.freeze({})

/** The v5r pack's name for the same ONE table (kept so existing imports/tests do not fork the data). */
export const V5R_REFUSAL_MEANS = REFUSAL_MEANS
