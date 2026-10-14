/**
 * THE v5r PACK'S OWN SETTINGS DEFAULTS (goal 2: the integration pack folder).
 *
 * A pack is the place where a particular INSTITUTION lives, and part of an institution is what it
 * wants the knobs to be. Keeping those wants here rather than inside the framework is the whole
 * point: the framework states what CAN be set (settings/schema.js), and the pack states what it
 * PREFERS, while a deployment may override either.
 *
 * Every key named here must exist in settings/schema.js. The gate checks that, because a default
 * for a key nobody declared is a typo that would otherwise fail silently.
 */
export const V5R_SETTING_DEFAULTS = Object.freeze({
  // Which reply catalogue the original really sent: the delivered-prompt corpus carries the compact
  // form, so that is the pack's preference. The full catalogue stays available by setting.
  'vmu.turn.replyCatalogue': 'compact',
  // The three optional blocks the source gates. On is the source's default: a deployment that never
  // configured them gets the full prompt.
  'vmu.pointer.propagation': true,
  'vmu.turn.selfCheck': true,
  'vmu.turn.feedback': true,
  // Where the protocol lives, named by the compact catalogue. A path, not a hard-coded string.
  'vmu.turn.protocolPath': 'Shared/Protocol.md',

  // ── ROUND 2 (D-08): the institution's preferences for the new primitives ────────────────────────────
  // These are STRATEGY, not mechanism: kernel/chat.js, kernel/mailbox.js, kernel/panel.js, kernel/resume.js,
  // kernel/human.js, kernel/report.js and the math-job face READ them and enforce; the pack only states what
  // THIS institution wants. Grounded in _handoff/vmu/v5r-inventory-c.md §④/§⑤/⑦-B and inventory-a §4.
  //
  // Group chat: v5r had NO admin/quota/mute fields (only the vote-freeze), so these three are new capability
  // (D-08 baseline B) and the values chosen here are the ones closest to v5r's actual behaviour:
  //   · the academician is the administrator (member id `acad`; a deployment with other ids overrides it);
  //   · no per-person quota (v5r's `spokeCount` was display-only, never a cap) ⇒ 0 = unlimited;
  //   · no expiring mute (v5r's only mute was the global vote-freeze) ⇒ 0 = explicit unmute required;
  //   · admins keep speaking during a frozen ballot = R4 chair-first.
  'vmu.chat.admins': ['acad'],
  'vmu.chat.speakQuota': 0,
  'vmu.chat.muteDefaultMs': 0,
  'vmu.chat.freezeExemptAdmins': true,
  // Mailbox: v5r's `deliveryDecision` delivered every non-chat kind immediately and digested pure chat, and
  // woke one recipient per flush — the same split the kernel reads here.
  'vmu.mailbox.urgentKinds': ['dm', 'office', 'assign', 'nudge', 'notice', 'meeting', 'verify'],
  'vmu.mailbox.wakeBudget': 1,
  // Panel: v5r kept the academician's original `overall` and recorded the deviation instead of refusing it.
  'vmu.panel.deviationPolicy': 'record',
  // Resume: v5r's `resume()` rebuilt these projection faces, and checked what it wrote. ROUND 3 adds the three
  // faces the round-3 seams made durable (chat / panel / human) — a restart must not lose the group chat, the
  // self-report panels or the approval queue.
  'vmu.resume.projections': ['members', 'tasks', 'meetings', 'ballots', 'budget', 'phase', 'work', 'chat', 'panel', 'human'],
  'vmu.resume.autoRecover': true,
  'vmu.resume.readBack': true,
  // ROUND 3: a state-type projection writes through on every wrapped call, so "an unapproved action is still
  // queued after a restart" survives a crash rather than waiting for an explicit snapshot.
  'vmu.resume.writeThrough': true,
  // Human in the loop: v5r never let a timeout allow an action by default, and only office lifted a veto.
  // `gatedActions` is deliberately EMPTY (zero mechanism: nothing is gated until a deployment declares it).
  'vmu.human.onTimeout': 'hold',
  'vmu.human.vetoLiftRoles': ['office'],
  'vmu.human.gatedActions': [],
  // Reporting: v5r had NO timed/automatic report (only persona text + an academician-initiated overview). The
  // reporting POLICY therefore lives on the LOADED MANIFEST (packs/v5r/prompts/v5r-core.js, the assistant's
  // face): `vmu.report.enabled`/`reports`/`params`/`whoMayChange` are declared there and applied by the pack
  // loader. They are deliberately NOT repeated here - a key in this file is folded into the kernel BEFORE the
  // manifest is applied, and a second declaration of the same key is refused as a conflict (O4).
  // Math jobs: a research institute keeps its computation mirrors across restarts (goal 5).
  'vmu.math.jobs.persist': true,
  'vmu.math.jobs.recover': 'on-load',
  // ROUND 4 (Lead ruling on §G): THE TWO CONCURRENCY STRATEGIES KEEP THEIR OWN NAMES. Mirroring them into one
  // number was wrong - they are different policies:
  //   · `vmu.math.maxParallel` = MATH-JOB / compilation concurrency. Its two readers are `kernel/mathjobs.js`
  //     and `kernel/mathtools.js`, both about running maths, so v5r's value is its `leanJobsMaxParallel: 1`
  //     = background compilation is SERIAL (vibe-math-v5r.js:1118-1119).
  //   · `vmu.limits.maxLiveMembers` = MEMBER concurrency. v5r's `maxParallel: 3` meant "wake at most 3 members
  //     at once" (:1081; wording :2073-2076) and belongs to the member cap (`kernel/index.js:221`'s
  //     `liveMemberCapOf`, read by `declareSlots`), NOT under `vmu.math.*`.
  // The legacy `vmu.math.jobs.maxParallel` is NOT declared here (and core removes/deprecates it in the schema):
  // its value is derived from the canonical name, so a pack-level declaration would be a declaration with no
  // effect - the shape this repository refuses.
  'vmu.math.maxParallel': 1,
  'vmu.limits.maxLiveMembers': 3,
  // Meeting parameters measured from v5r: quote depth 3, at most 2 quotes per message, and an unanswered member
  // stays OUT of the denominator (v5r's D3: "未答不计分母、不算反对、名单必列").
  // ROUND 3 (GAP-MTG-02): the meeting TIER is the pack's policy. v5r had ONE meeting protocol (the full one), so
  // this institution defaults to `formal`; `light` is a new capability whose AVAILABILITY is declared by the
  // pack, while the kernel only supplies the tier + the derived predicate (`light` must not produce substantive
  // conclusions).
  'vmu.meetings.tier': 'formal',
  // ROUND 3 (GAP-MTG-02, reader-c): `allowLight=false` is v5r's answer — v5r ran ONE meeting protocol, so a
  // "light" (simplified) meeting is refused BY NAME here (`VMU_MEETING_TIER_CONFLICT`) rather than silently
  // producing nothing substantive. A deployment that wants light sets this true (both states are implemented).
  'vmu.meetings.allowLight': false,
  // ROUND 3 (GAP-MTG-10, reader-c): the ballot board's reopen threshold. v5r's rule was "the threshold only
  // RISES and the object's own standard still applies" — so the pack adds NO extra floor (0 = none).
  // ROUND 6 (goal-4 verdict): the meeting-side twin that used to be named here (`vmu.meetings.reconsiderFloor`,
  // declared on the manifest and in `settings/schema.js`) turned out to be a ZERO-READER orphan: this key is the
  // one that is actually read (`kernel/ballotbox.js`'s `reopen()`), and the orphan is being deleted from both
  // places (schema by vmu-core, manifest by vmu-assistant). One meaning, one name.
  'vmu.ballot.reopenFloor': 0,
  // ROUND 3 (C-30, CLOSED): the OFFICE CONSULT GATE before finalisation. v5r's `finalizePaperByOffice` /
  // `notePaperConsult` asked the institute before the office finalised, so this institution declares the gate
  // REQUIRED, on FINALIZE, with NO timeout escape (0 = wait; a timeout HOLDS and still refuses — there is no
  // `default-allow` value at all), and — per the Lead's F4 ruling — **NOBODY is exempt by default**: the case
  // this gate exists for IS the office finalising, so exempting `office` would exempt exactly that case.
  // Readers: `kernel/paper.js:45-49` (WIRED_KEYS 3→8) and `:111-114` (cfg() reads all five unconditionally).
  'vmu.paper.officeConsult': 'required',
  'vmu.paper.officeConsultOn': 'finalize',
  'vmu.paper.officeConsultTimeoutMs': 0,
  'vmu.paper.officeConsultOnTimeout': 'hold',
  'vmu.paper.officeConsultExemptRoles': [],
  // ROUND 6 (goal-4 verdict G1, now CLOSED): the PAPER ROUND CAP. v5r's `PAPER_MAX_ROUNDS = 3` bounded how many
  // times a manuscript could be revised, and vmu now has the mechanism with a declared knob: `revise()` counts
  // rounds and a revision that would exceed `vmu.paper.maxRounds > 0` is refused BY NAME
  // (`VMU_PAPER_ROUNDS_EXCEEDED`) with the cap in `enforced[]`. Readers: `kernel/paper.js:41` (WIRED_KEYS) and
  // `:135` (`readKey('vmu.paper.maxRounds') || 0`). v5r's value is 3; the framework default is 0 = no cap, so
  // WITHOUT this line the institution would lose its bound - which is exactly why it is declared here.
  'vmu.paper.maxRounds': 3,
  'vmu.meetings.quoteDepthMax': 3,
  'vmu.meetings.quotesPerMessageMax': 2,
  'vmu.meetings.unansweredInDenominator': false,
})

/** The keys this pack wants set, for a deployment that wants to diff its own overrides. */
export const V5R_SETTING_KEYS = Object.freeze(Object.keys(V5R_SETTING_DEFAULTS))
