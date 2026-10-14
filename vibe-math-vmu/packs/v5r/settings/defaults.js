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
  // ROUND 3 (Lead adjudication): concurrency caps are POLICY, so the pack declares both, with v5r's factory
  // numbers. v5r's own semantics were: `maxParallel: 3` = the framework wakes at most 3 members at once
  // (vibe-math-v5r.js:1081; wording at :2073-2076) and `leanJobsMaxParallel: 1` = background compilation is
  // SERIAL by default (:1118-1119). ★ HONEST BOUNDARY: in the CURRENT vmu wiring `vmu.math.maxParallel` is read
  // by `kernel/mathjobs.js:41,249` (the math-JOB service's active-runs cap) and `vmu.math.jobs.maxParallel` by
  // `kernel/mathtools.js:56,200,571-572` (the strategy-layer active-runs cap) — two readers that do NOT drive
  // each other today, so a deployment that wants to cap concurrency sets BOTH. core's convergence direction is
  // to make mathtools read the former; when that lands this pack drops one line.
  'vmu.math.maxParallel': 3,
  'vmu.math.jobs.maxParallel': 1,
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
  // RISES and the object's own standard still applies" — so the pack adds NO extra floor (0 = none), which is
  // the same stance the manifest declares for the meeting-side reconsideration (`vmu.meetings.reconsiderFloor`).
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
  'vmu.meetings.quoteDepthMax': 3,
  'vmu.meetings.quotesPerMessageMax': 2,
  'vmu.meetings.unansweredInDenominator': false,
})

/** The keys this pack wants set, for a deployment that wants to diff its own overrides. */
export const V5R_SETTING_KEYS = Object.freeze(Object.keys(V5R_SETTING_DEFAULTS))
