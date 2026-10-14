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
  // Resume: v5r's `resume()` rebuilt exactly these seven projection faces, and checked what it wrote.
  'vmu.resume.projections': ['members', 'tasks', 'meetings', 'ballots', 'budget', 'phase', 'work'],
  'vmu.resume.autoRecover': true,
  'vmu.resume.readBack': true,
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
  // Meeting parameters measured from v5r: quote depth 3, at most 2 quotes per message, and an unanswered member
  // stays OUT of the denominator (v5r's D3: "未答不计分母、不算反对、名单必列").
  'vmu.meetings.quoteDepthMax': 3,
  'vmu.meetings.quotesPerMessageMax': 2,
  'vmu.meetings.unansweredInDenominator': false,
})

/** The keys this pack wants set, for a deployment that wants to diff its own overrides. */
export const V5R_SETTING_KEYS = Object.freeze(Object.keys(V5R_SETTING_DEFAULTS))
