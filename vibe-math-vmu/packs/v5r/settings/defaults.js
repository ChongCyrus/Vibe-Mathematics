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
  // The three optional blocks the source gates. ★ ROUND 7 FIDELITY CORRECTION: this used to say "on is the
  // source's default", and for the RESOURCE block that is FALSE — the original ran with
  // `resourceSelfCheck: false` (vibe-math-v5r.js:1122), whose own comment says "false ⇒ 提示词【一字不改】,
  // 仅当为 true 时才注入【资源】段". The pack's policy module gates the `v5r-turn-resources` section on
  // `settings['vmu.turn.selfCheck'] !== false` (packs/v5r/middleware/prompt-switches.js:27), so declaring
  // `true` injected a section v5r never sent. Declared FALSE = zero injection = what v5r really ran.
  // (`vmu.prompts.resourceSection` in the framework already defaults to false for the same reason.)
  'vmu.pointer.propagation': true,
  'vmu.turn.selfCheck': false,
  'vmu.turn.feedback': true,
  // Where the protocol lives, named by the compact catalogue. A path, not a hard-coded string.
  'vmu.turn.protocolPath': 'Shared/Protocol.md',
  // ROUND 7 FIDELITY: v5r's `activityTimeoutMs: 120000` (vibe-math-v5r.js:1082) is "how long without activity
  // before the institute counts as stalled". The framework's idle clock is `vmu.control.idleAfterMs` (default
  // 0 = "no idle defined"), read by `kernel/control.js:65` and named in its `enforced[]` (`:206`). Without this
  // line the institution never becomes idle, so v5r's stall detection cannot happen at all.
  // NOTE (deliberate divergence, NOT a gap): v5r then AUTO-CONVENED a meeting after `stallAutoMeetingMs`
  // (360000, :1083); vmu's `vmu.control.idleAction` defaults to 'notice' — "只提示，绝不自动散会" (R1: the
  // framework recommends, it does not drive). The pack keeps that stance.
  'vmu.control.idleAfterMs': 120000,
  // ROUND 10 (B1/B3, core landed the keys + readers in task-74). ★ SAME HONEST CATEGORY as the four paper keys:
  // these are a **RESTATEMENT OF THE FRAMEWORK DEFAULT** (the schema declares `compactThreshold` def 66,
  // `compactAfterRounds` def 8, `maxTempPerMember` def 3 — all taken FROM v5r's own `DEFAULT_PARAMS`), so they
  // are NOT fidelity evidence; they are declared so this institution is readable and tunable.
  //   · `compactThreshold: 66`     - v5r :1078 (percent, 0-100: when the context share reaches it, the assembly
  //     injects [CONTEXT COMPACT]); reader `kernel/prompt/index.js:118,121` (reads ctx.contextPct).
  //   · `compactAfterRounds: 8`    - v5r :1079 (the OR-twin: rounds since the last compaction); reader
  //     `kernel/prompt/index.js:125,128` (reads ctx.round).
  //   · `maxTempPerMember: 3`      - v5r :1075 (how many temp members one hirer may have in force at once; v5r
  //     counted by `hiredBy` and refused with V5_MEMBER_LIMIT). Reader `kernel/recruit.js:52,173` (`accept()`);
  //     vmu has no `kind:temp`, so the mapping counts members still on probation (`confirmedAt === null`).
  'vmu.prompt.compactThreshold': 66,
  'vmu.prompt.compactAfterRounds': 8,
  'vmu.members.maxTempPerMember': 3,
  // ROUND 10 (B4): a member may OBJECT to an assignment. v5r `memberMayRejectAssign: true` (:1066; its consumer
  // `:9555-9562` broadcast the objection to the voters and the original text says "任务仍会执行"). Reader:
  // `kernel/tasks.js:111` (`objectAssign()`), wired at `kernel/index.js:667`. Framework default is also `true`
  // (core took it from v5r), so this is a restatement - declared for readability, not fidelity evidence.
  // ★ The framework is deliberately STRICTER than v5r here: with `false` vmu REFUSES BY NAME, where v5r silently
  // ignored the field (the schema doc says so) - a divergence in the safe direction, recorded in docs/10 §4.8.
  'vmu.tasks.memberMayRejectAssign': true,

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
  // ★ ROUND 10 (Lead ruling; reader-a measured it on a REAL assembly): this list used to say `'ballots'`, while
  // the assembly's projection adapter table keys the face **`ballotbox`** (`kernel/index.js:883`, and the durable
  // store key is `ballotbox` too, `kernel/store.js:75`). A declaration that names a face the adapter table does
  // not have is a declaration of something that does not exist: reader-a opened TWO real boxes, called
  // `shutdown()`, and the durable key was still the store's seed — the board was NEVER projected
  // (`notAttached:[{face:'ballots', reason:'no adapter in this assembly'}]`). The name is now the adapter's own,
  // so the declaration is DIRECT (`viaAlias: []`). core keeps a NAMED, reported alias for the old spelling
  // (`kernel/index.js:965 PROJECTION_ALIASES`) so an older deployment that still writes `ballots` is told rather
  // than silently unprojected — tolerance and naming must come in pairs.
  'vmu.resume.projections': ['members', 'tasks', 'meetings', 'ballotbox', 'budget', 'phase', 'work', 'chat', 'panel', 'human'],
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
  //   · `vmu.limits.maxParallel` / `vmu.turn.maxParallel` = MEMBER wake concurrency. v5r's `maxParallel: 3`
  //     (:1081) is ALREADY the framework default on both keys (schema doc: "P3：吸收 v5r 的 maxParallel"), so
  //     the pack need not declare it. The framework also carries the original's own name for the job-side cap,
  //     `vmu.math.leanJobsMaxParallel`, whose default 1 IS v5r's `leanJobsMaxParallel: 1` (:1119).
  // The legacy `vmu.math.jobs.maxParallel` is NOT declared here (and core removes/deprecates it in the schema):
  // its value is derived from the canonical name, so a pack-level declaration would be a declaration with no
  // effect - the shape this repository refuses.
  // ★ ROUND 7 LEAD RULING: this line is KEPT for readability/tunability, but it is a **RESTATEMENT OF THE
  // FRAMEWORK DEFAULT** — `＝框架默认（复述）；v5r 对应参数 leanJobsMaxParallel:1（vibe-math-v5r.js:1119）；
  // 非保真证据**. It must never be cited as evidence that v5r's behaviour was reproduced: v5r's own parameter
  // for this is `leanJobsMaxParallel` (whose framework twin `vmu.math.leanJobsMaxParallel` already defaults to 1),
  // and this key's schema default is 1 as well. A deployment may still tune it here.
  'vmu.math.maxParallel': 1,
  // ★ ROUND 7 FIDELITY CORRECTION: `vmu.limits.maxLiveMembers: 3` was REMOVED from this file. v5r's live-member
  // cap was its OWN parameter `maxLiveChildren: 0` (vibe-math-v5r.js:1130) = NO cap, which is exactly why
  // `vmu.limits.maxLiveMembers` defaults to 0. The `3` that used to sit here was taken from `maxParallel` - a
  // different dimension, already defaulted on `vmu.limits.maxParallel`/`vmu.turn.maxParallel` - so declaring it
  // as a LIVE cap made this institution refuse a fourth live member that v5r would have allowed.
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
  // ROUND 10 (B2, core landed the keys + readers in task-74): THE FINAL PAPER.
  // ★ HONEST CATEGORY (the same one as `vmu.math.maxParallel` below): these four are a **RESTATEMENT OF THE
  // FRAMEWORK DEFAULT**, not fidelity evidence. The schema declares `vmu.paper.finalPaper` def **true**,
  // `format` def **'both'**, `language` def **'zh'**, `compilePdf` def **true** — i.e. core set the defaults
  // FROM v5r's own `DEFAULT_PARAMS`, and the schema docs say so (`vibe-math-v5r.js:1163-1166`, plus the
  // consumption sites `:7867` / `:8251` / `:8252` / `:8258`). They are declared here because an integration pack
  // should be READABLE and TUNABLE (a deployment sees what this institution ships), and they must never be cited
  // as proof that v5r's behaviour was reproduced.
  // Readers: `kernel/paper.js:58-61` (WIRED_KEYS) and `:164-177` (cfg() reads all four unconditionally).
  'vmu.paper.finalPaper': true,
  'vmu.paper.format': 'both',
  'vmu.paper.language': 'zh',
  'vmu.paper.compilePdf': true,
  'vmu.meetings.quoteDepthMax': 3,
  'vmu.meetings.quotesPerMessageMax': 2,
  'vmu.meetings.unansweredInDenominator': false,
})

/** The keys this pack wants set, for a deployment that wants to diff its own overrides. */
export const V5R_SETTING_KEYS = Object.freeze(Object.keys(V5R_SETTING_DEFAULTS))
