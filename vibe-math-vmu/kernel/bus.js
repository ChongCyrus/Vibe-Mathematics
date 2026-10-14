// vmu hook bus — one place where middleware meets the framework (docs/05).
//
// The bus exists so that middleware authors never have to know DSH's rules:
//   · waterfall listeners MUST call next() or they silently veto the whole chain (including built-in
//     behaviour). `wrapHostWaterfall` owns that contract, so a vmu handler that merely returns
//     undefined always lets the chain continue;
//   · every entry declares its capabilities; using one it did not declare is a named refusal, not a
//     surprise (docs/05 §6);
//   · failures are three-state (open / closed / abort) and ALWAYS audited; consecutive failures trip a
//     breaker that disables the entry instead of letting it drag the whole institute down (docs/05 §7);
//   · scope decides who a hook applies to (member / role / phase), and ordering is deterministic
//     (order, then id) so two runs of the same configuration behave identically (docs/05 §2).
//
// No host imports: plain Node must be able to import this module in this repository (see the same note
// in settings/schema.js and kernel/store.js).

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

/** Failure policies (docs/05 §7). */
export const FAILURE = Object.freeze({ OPEN: 'open', CLOSED: 'closed', ABORT: 'abort' })

/** The capability vocabulary. A decision may only use what its entry declared (docs/05 §3.2, §6). */
export const CAPABILITIES = Object.freeze([
  'read-state', 'read-args', 'deny', 'cancel', 'rewrite-args', 'rewrite-result',
  'append-prompt', 'record', 'notify', 'set-setting', 'trigger-workflow', 'annotate',
])

/** decision key -> the capability it consumes */
const DECISION_CAPABILITY = Object.freeze({
  deny: 'deny',
  cancel: 'cancel',
  rewriteArgs: 'rewrite-args',
  rewriteResult: 'rewrite-result',
  appendPrompt: 'append-prompt',
  record: 'record',
  notify: 'notify',
  setSetting: 'set-setting',
  triggerWorkflow: 'trigger-workflow',
  annotate: 'annotate',
})

/**
 * Bus topics that are NOT vmu hooks: the host-waterfall bridge publishes the DSH waterfall under this name (and
 * passes the host's own hook name through) so middleware can observe/steer it. Kept SEPARATE from `VU_HOOKS`
 * because the docs' hook table is the vmu-internal contract, while these are bridge topics (docs/05 §4.1 vs §4.2).
 */
export const BRIDGE_TOPICS = Object.freeze(['host/waterfall'])

// `VU_HOOKS` and `DEFAULT_FAILURE` are DERIVED from `HOOK_REGISTRY` below (decision D-12: one source, no
// second copy). They used to be literals kept in sync by assertion; the registry is now the only place a
// hook name or its failure policy is written down.

/**
 * THE HOOK REGISTRY — THE SINGLE SOURCE FOR EVERY HOOK (decision D-04, closed by D-12).
 *
 * The project carried three tables that drifted apart: `VU_HOOKS` (the vmu names the bus enforces),
 * `DSH_HOOKS` (what a module may subscribe to, kernel/loader.js) and `BRIDGED_HOOKS` (what the host
 * bridge can really attach, host-hooks.js). The registry below is the ONLY place a hook is written
 * down, recording:
 *   name · kind (vmu|host) · failure semantics · whether it can block · whether it can rewrite ·
 *   its scope dimensions · when it fires · its real producer · whether the host bridge attaches it
 *     (and at which site).
 * EVERY published table is derived from it:
 *   · `VU_HOOKS`        = the `kind:'vmu'` names, in registry order;
 *   · `DEFAULT_FAILURE` = each vmu hook's `failure`;
 *   · `DSH_HOOKS`       = the `kind:'host'` names (re-exported by kernel/loader.js);
 *   · `BRIDGED_HOOKS`   = the host hooks with `bridged:true` (re-exported by host-hooks.js).
 * `hookRegistryProblems()` then checks the DATA (names, kinds, policies, bridge sites, producers) —
 * the checks that used to compare the registry against a second literal are gone because there is no
 * second copy left to compare against.
 */
const VU_SCOPE = Object.freeze(['member', 'role', 'phase'])
const BRIDGE_SITE = 'host-hooks.js attachHostHooks (ctx.effect -> ctx.on)'
export const HOOK_REGISTRY = Object.freeze([
  // ── vmu-internal hooks (docs/05 §4.2 / §5) ────────────────────────────────────────────────────────
  { name: 'member/self-report', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a member reports on itself', producer: 'kernel/members.js' },
  { name: 'budget/warn', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a budget crosses its warning line', producer: 'kernel/budget.js' },
  { name: 'member/wake-before', kind: 'vmu', failure: 'closed', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'before a member is woken', producer: 'kernel/members.js' },
  { name: 'member/wake-after', kind: 'vmu', failure: 'closed', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'after a member was woken', producer: 'kernel/members.js' },
  { name: 'turn/reply-parsed', kind: 'vmu', failure: 'closed', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'a turn reply was parsed, before dispatch', producer: 'kernel/turn/index.js' },
  { name: 'meeting/round-start', kind: 'vmu', failure: 'closed', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'a meeting round opens', producer: 'kernel/meeting.js' },
  { name: 'meeting/round-end', kind: 'vmu', failure: 'closed', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a meeting round closes', producer: 'kernel/meeting.js, kernel/minutes.js' },
  // ROUND 12 / task-97 (vmu-pack's ⑤): A MID-MEETING MOTION. The site used to write only the module's own log, so no
  // middleware could react to "someone moved a motion in THIS meeting", and the id the vote mirror asks `boxFor` about
  // is this meeting-scoped one (`mo1`), not the governance face's institute-wide `mo-1`. `failure:'open'` and NOT
  // blockable: the motion has happened, and the audience/policy belongs to middleware (R1) - exactly the door the
  // pack's "propose ⇒ open a box" policy needs.
  { name: 'meeting/motion', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a motion was moved inside a meeting (meeting-scoped motion id)', producer: 'kernel/meetings.js' },
  { name: 'ballot/cast', kind: 'vmu', failure: 'closed', blockable: true, rewritable: false, scope: VU_SCOPE, timing: 'a vote is cast', producer: 'kernel/ballot.js' },
  { name: 'ballot/tally', kind: 'vmu', failure: 'closed', blockable: true, rewritable: false, scope: VU_SCOPE, timing: 'a ballot is tallied', producer: 'kernel/ballot.js, packs/v3-core' },
  { name: 'record/append-before', kind: 'vmu', failure: 'closed', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'before any record is validated or written', producer: 'kernel/library.js' },
  { name: 'record/appended', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a record was appended', producer: 'kernel/compliance.js, kernel/handover.js, kernel/minutes.js, kernel/tenure.js' },
  { name: 'task/assign', kind: 'vmu', failure: 'closed', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'a task is assigned', producer: 'kernel/members.js, kernel/tasks.js' },
  { name: 'task/transition', kind: 'vmu', failure: 'closed', blockable: true, rewritable: false, scope: VU_SCOPE, timing: 'a task changes state', producer: 'kernel/tasks.js' },
  // ROUND 10 (v5r fidelity, named by vmu-core): v5r's `memberMayRejectAssign` did not just record the objection,
  // it BROADCAST it to the voters ("任务仍会执行", the task still runs). vmu recorded it and reported
  // `broadcast:{attempted:false, hook:'task/assign-objected'}` because no such hook existed. Registered here
  // (the hook registry is vmu-pack's file) so core can emit it: an OBSERVATION (failure 'open', not blockable),
  // because the objection never stops the task.
  { name: 'task/assign-objected', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a member objected to an assignment (v5r broadcast this to the voters; the task still runs)', producer: 'kernel/tasks.js' },
  // ROUND 12 (task-97; core landed the name-first SLASH form at kernel/governance.js:114-210, and its own comment
  // says these belong here): the agenda/motion family. Before this registration a middleware could NEVER subscribe
  // to a motion - the names were emitted but absent from the registry (and `declareTopic` cannot take them until
  // they are declared here). All are OBSERVATIONS (failure 'open', not blockable): they report that the agenda or a
  // motion changed state; nothing about them may be blocked or rewritten by a listener.
  { name: 'agenda/add', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'an item was added to the agenda', producer: 'kernel/governance.js' },
  { name: 'agenda/reorder', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'the agenda was reordered', producer: 'kernel/governance.js' },
  { name: 'agenda/split', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'an agenda item was split into a child', producer: 'kernel/governance.js' },
  { name: 'motion/propose', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a motion was proposed (the event a pack policy may react to, e.g. opening a ballot box)', producer: 'kernel/governance.js' },
  { name: 'motion/second', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a motion was seconded', producer: 'kernel/governance.js' },
  { name: 'motion/withdraw', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a motion was withdrawn', producer: 'kernel/governance.js' },
  { name: 'motion/table', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a motion was tabled', producer: 'kernel/governance.js' },
  { name: 'motion/amend', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a motion was amended', producer: 'kernel/governance.js' },
  { name: 'prompt/section-assembled', kind: 'vmu', failure: 'open', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'a prompt assembly asks for section decisions', producer: 'kernel/prompt/index.js' },
  { name: 'budget/exceeded', kind: 'vmu', failure: 'abort', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'a conserving allocation fails', producer: 'kernel/fairness.js' },
  { name: 'pack/loading', kind: 'vmu', failure: 'closed', blockable: true, rewritable: true, scope: VU_SCOPE, timing: 'before a pack changes anything (may refuse)', producer: 'kernel/pack.js' },
  { name: 'pack/loaded', kind: 'vmu', failure: 'closed', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'after every manifest is in place', producer: 'kernel/pack.js' },
  { name: 'settle/before', kind: 'vmu', failure: 'closed', blockable: true, rewritable: false, scope: VU_SCOPE, timing: 'before a settlement', producer: 'kernel/tasks.js' },
  { name: 'settle/after', kind: 'vmu', failure: 'closed', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'after a settlement', producer: 'kernel/tasks.js' },
  { name: 'control/paused', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'the kernel is paused', producer: 'kernel/index.js' },
  { name: 'control/resumed', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'the kernel is resumed', producer: 'kernel/index.js' },
  { name: 'control/heartbeat', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a control heartbeat', producer: 'kernel/index.js' },

  // ── ROUND 2 primitives (goal 1/2): registered so middleware can attach AND so a typo is refused ──────
  // reader-a (kernel/resume.js, kernel/human.js, kernel/control.js) and reader-c (kernel/chat.js,
  // kernel/mailbox.js, kernel/panel.js) emit these with `bus.emit('<name>', payload, opts)`; the namespaces
  // are added to VU_NAMESPACE below, so an UNREGISTERED name in them is a named refusal rather than silence.
  { name: 'resume/recovered', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a recovery completed', producer: 'kernel/resume.js' },
  { name: 'resume/degraded', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a recovery finished with unhydrated projections', producer: 'kernel/resume.js' },
  { name: 'resume/projection-error', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'one projection failed to hydrate', producer: 'kernel/resume.js' },
  { name: 'ids/minted', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a durable id was minted', producer: 'kernel/resume.js' },
  { name: 'ids/hydrated', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'the id counter was hydrated from the fold', producer: 'kernel/resume.js' },
  { name: 'ids/persist-failed', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'persisting the id counter failed', producer: 'kernel/resume.js' },
  // ROUND 4 (reader-a's F18): emitted by kernel/resume.js:749 through its NAME-first helper. Before this
  // registration the name was inside `VU_NAMESPACE` but NOT frozen, so the bus REFUSED it and the helper's
  // catch swallowed the refusal - the "budget/warn" class of bug, one round later (measured by
  // tests/audit-hook-coverage.test.mjs, which went red the moment the emit landed).
  { name: 'resume/lock-release-failed', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'releasing the recovery lock failed (warning: the lock may outlive the attempt)', producer: 'kernel/resume.js' },
  { name: 'human/vetoed', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a human veto was recorded', producer: 'kernel/human.js' },
  { name: 'human/veto-lifted', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a human veto was lifted', producer: 'kernel/human.js' },
  { name: 'human/approval-asked', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'an approval was requested', producer: 'kernel/human.js' },
  { name: 'human/gate-pending', kind: 'vmu', failure: 'closed', blockable: true, rewritable: false, scope: VU_SCOPE, timing: 'an action is held at the approval gate (a broken listener must NOT open the gate)', producer: 'kernel/human.js' },
  { name: 'human/approval-decided', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'an approval was decided', producer: 'kernel/human.js' },
  { name: 'control/scope-paused', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a scope was paused', producer: 'kernel/control.js' },
  { name: 'control/scope-resumed', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a scope was resumed', producer: 'kernel/control.js' },
  { name: 'control/param-set', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a declared parameter was changed', producer: 'kernel/control.js' },
  { name: 'control/param-refused', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a parameter change was refused', producer: 'kernel/control.js' },
  // ROUND 10 / task-74 (B): THE IDLE EDGE. `control/idleState()` publishes it when idleness CROSSES the declared
  // threshold (`vmu.control.idleAfterMs`), so middleware can implement a policy ("a stalled institute convenes")
  // without the kernel inventing one. `failure:'open'` on purpose: a broken listener must not stop the idle report -
  // and the face itself RECESSES NOTHING (`idleAction` defaults to `notice`).
  { name: 'control/idle', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'idleness crossed vmu.control.idleAfterMs (edge-triggered: once per idle episode)', producer: 'kernel/control.js' },
  { name: 'chat/send-before', kind: 'vmu', failure: 'closed', blockable: true, rewritable: false, scope: VU_SCOPE, timing: 'before a chat message is accepted (quota/mute/freeze policy)', producer: 'kernel/chat.js' },
  { name: 'chat/sent', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a chat message was accepted', producer: 'kernel/chat.js' },
  { name: 'chat/refused', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a chat message was refused by policy', producer: 'kernel/chat.js' },
  { name: 'mailbox/deliver-before', kind: 'vmu', failure: 'closed', blockable: true, rewritable: false, scope: VU_SCOPE, timing: 'before a delivery batch is flushed', producer: 'kernel/mailbox.js' },
  { name: 'mailbox/delivered', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a delivery batch was acked', producer: 'kernel/mailbox.js' },
  { name: 'panel/write-before', kind: 'vmu', failure: 'closed', blockable: true, rewritable: false, scope: VU_SCOPE, timing: 'before a self-report panel write', producer: 'kernel/panel.js' },
  { name: 'panel/written', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a self-report panel write landed', producer: 'kernel/panel.js' },
  { name: 'panel/viewed', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a panel was viewed (view audit)', producer: 'kernel/panel.js' },
  // reader-b (kernel/mathjobs.js, kernel/mathadapters.js): the math-job face emits these (NAME-first form).
  { name: 'math/job-submitted', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a math job was submitted', producer: 'kernel/mathjobs.js' },
  { name: 'math/job-settled', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a math job exited cleanly', producer: 'kernel/mathjobs.js' },
  { name: 'math/job-failed', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a math job exited non-zero', producer: 'kernel/mathjobs.js' },
  { name: 'math/job-timeout', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a math job exceeded its budget', producer: 'kernel/mathjobs.js' },
  { name: 'math/job-cancelled', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a math job was cancelled', producer: 'kernel/mathjobs.js' },
  { name: 'math/job-recovered', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'the job mirror was scanned at start-up', producer: 'kernel/mathjobs.js' },
  { name: 'math/adapters-probed', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'the scientific-library environment was probed', producer: 'kernel/mathadapters.js' },
  { name: 'math/adapters-ran', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a library-adapted computation ran', producer: 'kernel/mathadapters.js' },
  // reader-a (kernel/lifecycle.js): the two broadcasts that used to be a SILENT no-op because they were sent as
  // `emit({type:...})` - a single object, which `bus.emit` refuses (it needs a string name). Fixed to the
  // name-first form in round 2, so they are registered here rather than left as a paper capability.
  { name: 'lifecycle/prereg', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a study was pre-registered', producer: 'kernel/lifecycle.js' },
  { name: 'lifecycle/advance', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a study advanced a stage', producer: 'kernel/lifecycle.js' },

  // ── ROUND 4 (Lead adjudication ①): the names that were already emitted through `bus.emit('<name>', …)` but
  // were NOT in this registry. Each one is now either REGISTERED here (a behavior that happened and an
  // extension may legitimately react to) or listed in `LOG_ONLY_EMITS` (an accounting/observability row that
  // is NOT a subscribable hook). Nothing is left in between - see `docs/05 §5.4` and the classification gate
  // `D:\_tmp\vmu-hook-emit-census.mjs` (仓库外临时探针).
  { name: 'paper/office-consult-required', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'finalisation was refused because the office was not consulted', producer: 'kernel/paper.js' },
  { name: 'publication/advance', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a paper advanced a publication stage', producer: 'kernel/publication.js' },
  { name: 'publication/replication-failed', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a replication attempt failed', producer: 'kernel/publication.js' },
  { name: 'notify/emit', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a notification was emitted to the delivery seam', producer: 'kernel/notify.js' },
  { name: 'crypto/signed', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a payload was signed', producer: 'kernel/crypto.js' },
  { name: 'crypto/rotated', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'key material was rotated', producer: 'kernel/crypto.js' },
  { name: 'external/stale-served', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a stale external result was served (degraded mode)', producer: 'kernel/external.js' },
  { name: 'legalentity/registered', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a legal entity was registered', producer: 'kernel/partnership.js' },
  { name: 'ratelimit/queued', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a call was queued by the rate limiter', producer: 'kernel/ratelimit.js' },
  { name: 'ratelimit/degraded', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'the rate limiter degraded a call', producer: 'kernel/ratelimit.js' },
  { name: 'recruit/confirmed', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a recruitment was confirmed into a slot', producer: 'kernel/recruit.js' },
  { name: 'reviewers/registered', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a reviewer was registered', producer: 'kernel/reviewers.js' },
  { name: 'workflow/advance', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a workflow advanced a state', producer: 'kernel/workflow.js' },
  { name: 'workflow/retry', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a workflow step was retried', producer: 'kernel/workflow.js' },
  { name: 'workflow/escalate', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a workflow escalated', producer: 'kernel/workflow.js' },
  { name: 'formal/checked', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a formalisation check completed', producer: 'kernel/formal.js' },
  { name: 'formal/fidelity-defect', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a fidelity defect was declared for a target', producer: 'kernel/fidelity.js' },
  { name: 'formal/abstention-enforced', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'the framework forced an abstention (C-45)', producer: 'kernel/fidelity.js' },
  { name: 'formal/defects-loaded', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'the durable defect markers were loaded', producer: 'kernel/fidelity.js' },
  { name: 'lean/job-submitted', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a Lean compilation job was submitted', producer: 'kernel/lean.js' },
  { name: 'lean/job-settled', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a Lean compilation job finished', producer: 'kernel/lean.js' },
  { name: 'lean/job-timeout', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a Lean compilation job exceeded its budget', producer: 'kernel/lean.js' },
  { name: 'lean/job-recovered', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'Lean jobs were recovered from the mirror', producer: 'kernel/lean.js' },
  { name: 'lean/jobs-disposed', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'Lean job handles were disposed', producer: 'kernel/lean.js' },
  // ROUND 6 (found by v5r-reader-a, the same class as `resume/lock-release-failed`): `kernel/lean.js` emits this
  // inside the `lean/` namespace, which is in VU_NAMESPACE - unregistered, so the bus refused it and the helper's
  // catch swallowed the refusal (a cancelled job reached no middleware).
  { name: 'lean/job-cancelled', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a Lean compilation job was cancelled', producer: 'kernel/lean.js' },
  // The in-repo classification gate (scripts/audit-hook-emit-classification.mjs) found five MORE string-form
  // emits the earlier out-of-repo census missed: each is marked "advisory" in its module, so nobody could
  // subscribe to it and nothing had classified it.
  { name: 'board/moved', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a task moved between board columns', producer: 'kernel/board.js' },
  { name: 'projmigrate/migrated', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'an on-disk projection was migrated', producer: 'kernel/projmigrate.js' },
  { name: 'skills/declare', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a member declared a skill', producer: 'kernel/skills.js' },
  { name: 'topology/select', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a collaboration topology was selected', producer: 'kernel/topology.js' },
  { name: 'trust/signal', kind: 'vmu', failure: 'open', blockable: false, rewritable: false, scope: VU_SCOPE, timing: 'a trust signal was recorded', producer: 'kernel/trust.js' },

  // ── host-substrate hooks (docs/05 §4.1): the vocabulary belongs to DSH, not to vmu ─────────────────
  { name: 'tools/pre-execute', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: true, rewritable: false, timing: 'before a tool call runs (input rewriting is refused by the host)' },
  { name: 'tools/post-execute', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: true, rewritable: true, timing: 'after a tool call ran' },
  { name: 'tools/execute', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'tool execution (observation)' },
  { name: 'tools/result', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'a tool result exists (observation)' },
  { name: 'prompt/assemble', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'the HOST assembles its system prompt' },
  { name: 'prompt/section', kind: 'host', bridged: false, blockable: false, rewritable: false, timing: 'host prompt-section registration (subscribe-only)' },
  { name: 'agent/pre-step', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: true, rewritable: false, timing: 'before an agent step' },
  { name: 'agent/request', kind: 'host', bridged: false, blockable: false, rewritable: false, timing: 'an agent request is issued (subscribe-only)' },
  { name: 'agent/request-error', kind: 'host', bridged: false, blockable: false, rewritable: false, timing: 'an agent request failed (subscribe-only)' },
  { name: 'agent/turn-stopping', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'the host turn ends (the per-turn tool budget resets here)' },
  { name: 'agent/inbox', kind: 'host', bridged: false, blockable: false, rewritable: false, timing: 'agent inbox delivery (subscribe-only)' },
  { name: 'agent/created', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'an agent was created' },
  { name: 'subagent/start', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'a subagent starts' },
  { name: 'subagent/end', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'a subagent ends' },
  { name: 'session/event', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'a session event' },
  { name: 'session/flush', kind: 'host', bridged: false, blockable: false, rewritable: false, timing: 'a session is flushed (subscribe-only)' },
  { name: 'fs/write-intent', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: true, rewritable: false, timing: 'a write is about to happen' },
  { name: 'settings/changed', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'settings changed' },
  { name: 'system-prompt/assemble', kind: 'host', bridged: true, bridgeSite: BRIDGE_SITE, blockable: false, rewritable: false, timing: 'the host assembles its system prompt (host-side name)' },
])

/** The vmu-internal hook names the bus enforces (docs/05 §4.2) — DERIVED from the registry, in its order. */
export const VU_HOOKS = Object.freeze(HOOK_REGISTRY.filter((h) => h.kind === 'vmu').map((h) => h.name))

/**
 * The default failure policy per vmu hook, so an entry that omits one still behaves safely (docs/05 §4.3)
 * — DERIVED from the registry. The observations stay `open` and `budget/exceeded` stays the only `abort`;
 * that reasoning now lives beside each hook in the registry above.
 */
export const DEFAULT_FAILURE = Object.freeze(Object.fromEntries(
  HOOK_REGISTRY.filter((h) => h.kind === 'vmu').map((h) => [h.name, h.failure])))

/** The host-substrate names a module may subscribe to — DERIVED from the registry. */
export const DSH_HOOKS = Object.freeze(HOOK_REGISTRY.filter((h) => h.kind === 'host').map((h) => h.name))

/** The host hooks the bridge can really attach — DERIVED from the registry (`bridged: true`). */
export const BRIDGED_HOOKS = Object.freeze(HOOK_REGISTRY.filter((h) => h.kind === 'host' && h.bridged === true).map((h) => h.name))

/** Hook namespaces a module may subscribe to by PREFIX (a workflow topic is named by its own pack). */
export const HOOK_PREFIXES = Object.freeze(['workflow/'])

/**
 * ROUND 4 (Lead adjudication ①): the emits that are DELIBERATELY NOT hooks.
 *
 * `bus.emit('<name>', …)` is used for two different intents, and the difference matters to a middleware
 * author: an EVENT ("a behaviour happened, an extension may react") belongs in `HOOK_REGISTRY`, while an
 * ACCOUNTING ROW ("this is a line in the audit/observability ledger") does not - nobody should be able to
 * subscribe to it, and registering it would promise a lifecycle it does not have. The names below are the
 * second kind, each with the reason it is NOT a hook. The classification gate
 * (`D:\_tmp\vmu-hook-emit-census.mjs`, 仓库外临时探针) requires EVERY emitted name to be either registered
 * or listed here - "neither" is the silent state this list exists to forbid.
 */
export const LOG_ONLY_EMITS = Object.freeze({
  'audit/rotate': 'the audit ring rotated (a ledger maintenance row, not a behaviour to react to)',
  'auditchain/appended': 'a row was appended to the tamper-evident chain (ledger write)',
  'auditchain/checkpoint-failed': 'a chain checkpoint failed to write (ledger failure row)',
  'auditchain/partial-verify': 'a chain verify returned partial (ledger verification row)',
  'auditchain/anchored': 'a chain anchor was written (ledger maintenance row)',
  'retention/truncated': 'retention dropped rows and counted them (quota accounting row)',
})

/**
 * ROUND 4 (Lead adjudication ②): the bus-side view of DECLARED TOPICS, so a declared topic is not merely
 * emittable but SUBSCRIBABLE. `bus.declareTopic(name)` adds the name here; `kernel/loader.js`'s
 * `isRegisteredHook()` consults it (alongside `VU_HOOKS`/`DSH_HOOKS`/`HOOK_PREFIXES`), which is what lets an
 * M2 module declare a topic that a face registered at run time. It is deliberately PROCESS-WIDE: a declared
 * topic is a protocol extension point of this process, and every bus instance must agree on it.
 */
const DECLARED_TOPICS = new Set()

/** The declared custom topics, in declaration order (observability + the loader's subscription check). */
export function declaredTopics() { return [...DECLARED_TOPICS] }

/** Is this name a topic some face declared with `bus.declareTopic`? */
export function isDeclaredTopic(name) { return typeof name === 'string' && DECLARED_TOPICS.has(name) }


/**
 * The D-04/D-12 invariant, as a function a gate can call: the registry's DATA must be complete and
 * self-consistent. Since every published table is now derived from the registry, the old
 * "table == registry" comparisons would be tautologies; what remains genuinely checkable here is the
 * data itself:
 *   · names are unique and shaped like `domain/name`;
 *   · every vmu hook states a failure policy from `FAILURE` and non-empty scope dimensions;
 *   · every hook states when it fires and who produces it (a hook nobody produces is a paper capability);
 *   · a bridged host hook names its registration site, and an unbridged one does not claim one.
 */
export function hookRegistryProblems() {
  const problems = []
  const seen = new Set()
  const SHAPE = /^[a-z0-9-]+\/[a-z0-9-]+$/
  for (const h of HOOK_REGISTRY) {
    if (!h || typeof h.name !== 'string' || h.name.length === 0) { problems.push('a registry entry has no name'); continue }
    if (!SHAPE.test(h.name)) problems.push(h.name + ': a hook name must look like domain/name')
    if (seen.has(h.name)) problems.push('duplicate hook in the registry: ' + h.name)
    seen.add(h.name)
    if (h.kind !== 'vmu' && h.kind !== 'host') problems.push(h.name + ': kind must be vmu|host')
    if (typeof h.timing !== 'string' || h.timing.length === 0) problems.push(h.name + ': every hook states when it fires')
    if (h.kind === 'vmu') {
      if (!Object.values(FAILURE).includes(h.failure)) problems.push(h.name + ': failure must be open|closed|abort (got ' + JSON.stringify(h.failure) + ')')
      if (!Array.isArray(h.scope) || h.scope.length === 0) problems.push(h.name + ': a vmu hook states its scope dimensions')
      if (typeof h.producer !== 'string' || h.producer.length === 0) problems.push(h.name + ': a vmu hook names its real producer (a hook nobody emits is a paper capability)')
      if (h.bridged !== undefined) problems.push(h.name + ': only host hooks carry `bridged`')
    } else {
      if (typeof h.bridged !== 'boolean') problems.push(h.name + ': a host hook states `bridged: true|false`')
      if (h.bridged === true && (typeof h.bridgeSite !== 'string' || h.bridgeSite.length === 0)) {
        problems.push(h.name + ': a bridged hook must name its registration site (bridgeSite)')
      }
      if (h.bridged === false && h.bridgeSite !== undefined) problems.push(h.name + ': an unbridged hook must not claim a registration site')
      if (h.failure !== undefined) problems.push(h.name + ': only vmu hooks carry `failure` (the host owns its own policies)')
    }
  }
  // Non-vacuous completeness: the derived tables must be the registry's own sets (asserted on the SETS,
  // so an accidental filter change is caught even though the arrays are built from them).
  const vmu = new Set(HOOK_REGISTRY.filter((h) => h.kind === 'vmu').map((h) => h.name))
  const host = new Set(HOOK_REGISTRY.filter((h) => h.kind === 'host').map((h) => h.name))
  if (VU_HOOKS.length !== vmu.size) problems.push('VU_HOOKS does not cover the registry exactly (' + VU_HOOKS.length + ' vs ' + vmu.size + ')')
  if (Object.keys(DEFAULT_FAILURE).length !== vmu.size) problems.push('DEFAULT_FAILURE does not cover every vmu hook')
  if (DSH_HOOKS.length !== host.size) problems.push('DSH_HOOKS does not cover the registry host hooks exactly')
  for (const n of BRIDGED_HOOKS) if (!host.has(n)) problems.push('a bridged hook is not a registry host hook: ' + n)
  return problems
}

/**
 * THE KINDS THE BUS CAN ACTUALLY RUN (decision D-03: no paper forms).
 *
 * `script` and `plugin` used to be ACCEPTED here and then silently skipped at emit time (`emit()` logs
 * `middleware/skipped` for an entry without a handler), so such a declaration validated clean and never
 * fired. They are now REFUSED BY NAME (`VMU_MIDDLEWARE_KIND_UNSUPPORTED`) with the REAL carrier in the
 * hint, because the bus owns no file loader and no plugin host:
 *   · M3 script/workflow -> kernel/script-bridge.js + the `vibe_vmu_script` tool (config.scripts);
 *   · M4 external plugin -> a DSH plugin consuming vmu's published services (an integration pack is L4,
 *     kernel/pack.js, its own tier — not a bus entry).
 */
export const SUPPORTED_KINDS = Object.freeze(['rules', 'module'])

/** kind -> why it is not a bus entry, and where it really lives (the hint a refusal carries). */
export const UNSUPPORTED_KIND_CARRIERS = Object.freeze({
  script: 'M3 scripts/workflows run through kernel/script-bridge.js and the `vibe_vmu_script` tool (declare them with config.scripts), not as a bus entry',
  plugin: 'M4 external plugins are DSH plugins consuming vmu\'s published services; an integration pack is L4 (kernel/pack.js), its own tier, not a bus entry',
})

/** The unsupported kind of an entry, or null when the bus can run it. */
export function unsupportedKind(entry) {
  const k = entry && entry.kind
  if (k === undefined || k === null || SUPPORTED_KINDS.includes(k)) return null
  return String(k)
}

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  return err
}

/** Static validation of one entry (docs/05 §9 step 1). Returns a list of problems; empty means OK. */
export function validateEntry(entry) {
  const problems = []
  if (!entry || typeof entry !== 'object') return ['entry must be an object']
  if (typeof entry.id !== 'string' || entry.id.length === 0) problems.push('id is required')
  const badKind = unsupportedKind(entry)
  if (badKind && UNSUPPORTED_KIND_CARRIERS[badKind]) {
    problems.push('kind "' + badKind + '" is not a bus entry kind: ' + UNSUPPORTED_KIND_CARRIERS[badKind])
  } else if (badKind) {
    problems.push('kind must be rules|module (got ' + JSON.stringify(entry.kind) + ')')
  }
  const on = Array.isArray(entry.on) ? entry.on : [entry.on]
  if (on.length === 0 || on.some((h) => typeof h !== 'string' || h.length === 0)) problems.push('on must name at least one hook')
  if (entry.failure !== undefined && !Object.values(FAILURE).includes(entry.failure)) problems.push('failure must be open|closed|abort')
  if (entry.order !== undefined && !Number.isInteger(entry.order)) problems.push('order must be an integer')
  if (entry.capabilities !== undefined) {
    if (!Array.isArray(entry.capabilities)) problems.push('capabilities must be a list')
    else for (const c of entry.capabilities) if (!CAPABILITIES.includes(c)) problems.push('unknown capability: ' + c)
  }
  // A `file` is NOT a handler: the bus never loads files, so a file-only entry used to register clean and
  // then be skipped at emit time. A module file is loaded by kernel/loader.js toBusEntries(), which hands the
  // bus an entry WITH a handler; anything else must arrive here with one too.
  if (entry.kind && entry.kind !== 'rules' && typeof entry.handler !== 'function') {
    problems.push('a non-rules bus entry needs a handler function (the bus does not load files: load a module file with kernel/loader.js, which attaches the handler before add())')
  }
  return problems
}

function scopeMatches(scope, ctx) {
  if (!scope) return true
  const hit = (dim, value) => {
    const want = scope[dim]
    if (want === undefined || want === '*') return true
    const list = Array.isArray(want) ? want : [want]
    return list.includes(value)
  }
  return hit('member', ctx.member) && hit('role', ctx.role) && hit('phase', ctx.phase)
}

/**
 * Create the bus. `entries` are middleware declarations; `handlers` may be attached later with `on()`
 * (that is how code modules register). `settings` is the resolved settings map from settings/schema.js.
 */
export function createBus({ entries = [], settings = {}, clock = () => new Date().toISOString(), onAudit } = {}) {
  const hookTimeoutMs = Number.isInteger(settings['vmu.middleware.hookTimeoutMs']) ? settings['vmu.middleware.hookTimeoutMs'] : 2000
  const breakerThreshold = Number.isInteger(settings['vmu.middleware.breakerThreshold']) ? settings['vmu.middleware.breakerThreshold'] : 3
  // ROUND 294 (volume 05 §L77/§L81/§L63): the DECLARED defaults for three per-entry fields. Each replaces a value that was hard-coded
  // here, so declaring one changes what an entry that does not state its own gets - and nothing else.
  const enabledDefault = settings['vmu.middleware.enabled'] !== false
  const orderDefault = Number.isInteger(settings['vmu.middleware.order']) ? settings['vmu.middleware.order'] : 1000
  const failureDefault = ['closed', 'open', 'skip'].includes(settings['vmu.middleware.onFailure']) ? settings['vmu.middleware.onFailure'] : null

  const registry = new Map() // id -> entry (normalised)
  const failures = new Map() // id -> consecutive failure count
  const disabled = new Map() // id -> reason
  const hits = new Map() // id -> times it returned a decision
  const traces = new Map() // traceId -> [{ts, hook, entry, outcome, detail}]
  const traceOrder = []
  let dryRun = false
  let seq = 0
  // Topics a deployment declared EXPLICITLY (docs/05 §6 protocol extension). The frozen VU_HOOKS set is the
  // contract; anything else must be declared before it can be emitted - zero mechanism, nothing implicit.
  const customTopics = new Set()

  const audit = (record) => {
    const row = Object.assign({ ts: clock(), seq: seq++ }, record)
    if (typeof onAudit === 'function') onAudit(row)
    return row
  }

  const remember = (traceId, row) => {
    if (!traceId) return
    const list = traces.get(traceId) || []
    list.push(row)
    traces.set(traceId, list)
    traceOrder.push(traceId)
    while (traceOrder.length > 64) traces.delete(traceOrder.shift())
  }

  const add = (entry) => {
    // D-03: a kind the bus cannot run is refused BY NAME, before anything else, with its real carrier in
    // the hint. Accepting it here and skipping it at emit time was the paper form this closes.
    const badKind = unsupportedKind(entry)
    if (badKind && UNSUPPORTED_KIND_CARRIERS[badKind]) {
      throw refuse('VMU_MIDDLEWARE_KIND_UNSUPPORTED',
        'the bus cannot run a middleware entry of kind "' + badKind + '": ' + UNSUPPORTED_KIND_CARRIERS[badKind],
        'declare it where its carrier lives (docs/05 §2: M1 rules and M2 modules are bus entries; M3 scripts and M4 external plugins are not)')
    }
    const problems = validateEntry(entry)
    if (problems.length > 0) {
      throw refuse('VMU_MIDDLEWARE_FAILED', 'invalid middleware entry: ' + problems.join('; '),
        'see docs/05 §2 and §9 for the accepted shape')
    }
    if (registry.has(entry.id)) {
      throw refuse('VMU_MIDDLEWARE_FAILED', 'duplicate middleware id (conflicts are never resolved silently): ' + entry.id,
        'pack overrides must be declared explicitly (docs/10 §4)')
    }
    const on = Array.isArray(entry.on) ? entry.on : [entry.on]
    const normalised = Object.assign({}, entry, {
      on,
      enabled: entry.enabled === undefined ? enabledDefault : entry.enabled !== false,
      order: Number.isInteger(entry.order) ? entry.order : orderDefault,
      failure: entry.failure || failureDefault || DEFAULT_FAILURE[on[0]] || 'closed',
      capabilities: Array.isArray(entry.capabilities) ? entry.capabilities.slice() : [],
      source: entry.source || 'session',
    })
    registry.set(normalised.id, normalised)
    audit({ what: 'middleware/registered', id: normalised.id, on: normalised.on.join(','), order: normalised.order, failure: normalised.failure })
    return normalised
  }

  const sortedFor = (hook) => [...registry.values()]
    .filter((e) => e.enabled && e.on.includes(hook) && !disabled.has(e.id))
    .sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const withTimeout = async (fn, payload) => {
    if (!(hookTimeoutMs > 0)) return fn(payload)
    let timer
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(refuse('VMU_MIDDLEWARE_FAILED', 'hook exceeded its budget of ' + hookTimeoutMs + 'ms')), hookTimeoutMs)
    })
    try { return await Promise.race([fn(payload), timeout]) } finally { clearTimeout(timer) }
  }

  const checkCapability = (entry, decision) => {
    const used = Object.keys(decision).filter((k) => DECISION_CAPABILITY[k] !== undefined)
    for (const key of used) {
      const cap = DECISION_CAPABILITY[key]
      if (!entry.capabilities.includes(cap)) {
        throw refuse('VMU_MIDDLEWARE_FAILED',
          'middleware ' + entry.id + ' used capability "' + cap + '" without declaring it',
          'declare capabilities in the entry (docs/05 §6)')
      }
    }
    return decision
  }

  const recordFailure = (entry, error) => {
    const n = (failures.get(entry.id) || 0) + 1
    failures.set(entry.id, n)
    audit({ what: 'middleware/failed', id: entry.id, consecutive: n, code: error && error.code, error: String(error && error.message) })
    if (n >= breakerThreshold) {
      disabled.set(entry.id, 'breaker: ' + n + ' consecutive failures')
      audit({ what: 'middleware/breaker-tripped', id: entry.id, threshold: breakerThreshold })
    }
  }

  const bus = {
    /** Register a code-module handler for an entry (also used by tests to inject handlers). */
    on(entry, handler) {
      const normalised = add(Object.assign({}, entry, { handler }))
      return normalised.id
    },
    add,
    entries: () => [...registry.values()].map((e) => Object.assign({}, e, { handler: undefined, disabled: disabled.get(e.id) || null })),

    setDryRun(value) { dryRun = !!value; audit({ what: 'middleware/dry-run', value: dryRun }) },
    isDryRun: () => dryRun,

    disable(id, reason) {
      if (!registry.has(id)) throw refuse('VMU_INVALID_ARGUMENT', 'unknown middleware id: ' + id)
      disabled.set(id, reason || 'disabled by operator')
      audit({ what: 'middleware/disabled', id, reason: disabled.get(id) })
      return { ok: true, id, disabled: true }
    },
    enable(id) {
      if (!registry.has(id)) throw refuse('VMU_INVALID_ARGUMENT', 'unknown middleware id: ' + id)
      disabled.delete(id)
      failures.delete(id)
      audit({ what: 'middleware/enabled', id })
      return { ok: true, id, disabled: false }
    },

    /**
     * Declare a NEW hook topic (docs/05 §6, the protocol-extension point). The frozen `VU_HOOKS` set is the
     * contract, so a genuinely new topic must be declared here before anything may emit it: nothing appears
     * without a declaration (zero mechanism). Declaring twice is not an error, and `existing` says which.
     */
    declareTopic(name) {
      if (typeof name !== 'string' || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(name)) {
        throw refuse('VMU_INVALID_ARGUMENT', 'a hook topic must look like domain/name: ' + String(name),
          'e.g. lab/review-requested (kebab-case on both sides)')
      }
      const existing = VU_HOOKS.includes(name) || customTopics.has(name)
      customTopics.add(name)
      // ROUND 4 (Lead adjudication ②): the SAME declaration makes the topic SUBSCRIBABLE, not merely
      // emittable - `kernel/loader.js`'s isRegisteredHook() consults this process-wide set. A topic that can
      // be emitted but not subscribed to was "declared but unusable", the class this project keeps catching.
      DECLARED_TOPICS.add(name)
      return { ok: true, topic: name, existing }
    },

    /**
     * Run one hook. Returns { ok, decisions, traceId, refused? , aborted? }.
     * A deny is terminal and named; an abort is reported to the caller to end the turn or stage.
     */
    async emit(hook, payload = {}, opts = {}) {
      // E3 (task-154): the hook NAME is validated FIRST. Before this, `emit(123)` died inside
      // `hook.replace(...)` with a bare TypeError, `emit({})` likewise, `emit(null)` with "Cannot read
      // properties of null", and `emit('')` was ACCEPTED (an unnamed hook can reach no listener, so every
      // subscriber silently never ran). A nameless emission is now a NAMED refusal — never a crash, never a
      // silent no-op; valid string hooks (including declared custom topics) are untouched.
      if (typeof hook !== 'string' || hook.trim().length === 0) {
        throw refuse('VMU_INVALID_ARGUMENT',
          'bus.emit needs a NON-EMPTY STRING hook, got ' + (hook === null ? 'null' : Array.isArray(hook) ? 'array' : typeof hook) + (typeof hook === 'string' ? ' (empty/whitespace)' : ''),
          'e.g. bus.emit("control/paused", payload) — declare a new topic with bus.declareTopic(name); an unnamed hook reaches nobody')
      }
      // HOOK-NAME MEMBERSHIP (independent verification, task-40). The name was never validated, so a misspelled
      // hook - or a name that had drifted from the frozen set (the proven case: `prompt/assemble` was emitted
      // while the registry declared `prompt/section-assembled`) - reached NO listener: the middleware never ran
      // and nothing said so. The rule is now NAMESPACE-AWARE:
      //   · a name in VMU's OWN namespaces must be in VU_HOOKS (or declared with `declareTopic`);
      //   · a name in a FOREIGN namespace (the host's vocabulary, e.g. `tools/pre-execute`, `fs/write-intent`)
      //     is passed through, because that vocabulary belongs to the substrate - and note that `prompt/assemble`
      //     is a HOST name, so allowing all host names wholesale would have re-admitted exactly the drift this
      //     check exists to catch. The host-waterfall bridge (`opts.bridge`) is exempt for the same reason.
      // ROUND 2: the new primitives own their own namespaces too, so a typo in them is a NAMED refusal
      // rather than an emit that reaches nobody (the same rule the original eleven prefixes follow).
      // ROUND 2 + ROUND 4: the new primitives own their own namespaces too, so a typo in them is a NAMED
      // refusal rather than an emit that reaches nobody. ROUND 4 added the namespaces whose emitted names are
      // now REGISTERED (Lead adjudication ①): a name in one of these that is neither registered nor declared
      // with `declareTopic` is refused - the "declare before emit" rule. The three LOG-ONLY namespaces
      // (`audit`, `auditchain`, `retention`) are deliberately NOT listed: their rows are not hooks, so their
      // emits stay in the foreign-namespace pass-through path (documented in docs/05 §5.4).
      const VU_NAMESPACE = /^(member|turn|meeting|ballot|record|task|prompt|budget|pack|settle|control|resume|ids|human|chat|mailbox|panel|math|lifecycle|paper|publication|notify|crypto|external|legalentity|ratelimit|recruit|reviewers|workflow|formal|lean|board|projmigrate|skills|topology|trust|motion|agenda)\//
      const bridged = opts && opts.bridge === true
      const isVmuName = typeof hook === 'string' && VU_NAMESPACE.test(hook)
      if (!bridged && isVmuName && !(VU_HOOKS.includes(hook) || customTopics.has(hook))) {
        throw refuse('VMU_INVALID_ARGUMENT',
          'unknown vmu hook: ' + String(hook) + ' (' + VU_HOOKS.length + ' declared + ' + customTopics.size + ' custom)',
          'declared: ' + VU_HOOKS.join(', ') + ' — declare a NEW topic with bus.declareTopic(name)')
      }
      const traceId = opts.traceId || ('t' + (++seq) + '-' + hook.replace(/[^a-z]+/gi, '-'))
      const ctx = { member: opts.member, role: opts.role, phase: opts.phase }
      const decisions = []
      for (const entry of sortedFor(hook)) {
        if (!scopeMatches(entry.scope, ctx)) continue
        if (typeof entry.handler !== 'function') {
          audit({ what: 'middleware/skipped', id: entry.id, hook, why: 'no handler attached' })
          continue
        }
        let decision
        try {
          decision = await withTimeout(entry.handler, { hook, payload, ctx, dryRun, traceId, setting: (k) => settings[k] })
        } catch (error) {
          recordFailure(entry, error)
          const policy = entry.failure
          const row = { what: 'middleware/failure-policy', id: entry.id, hook, policy, traceId, error: String(error && error.message) }
          audit(row)
          remember(traceId, Object.assign({ hook, entry: entry.id, outcome: 'failed' }, row))
          if (policy === 'open') continue
          if (policy === 'abort') {
            return { ok: false, aborted: true, code: error && error.code ? error.code : 'VMU_MIDDLEWARE_FAILED',
              message: 'middleware ' + entry.id + ' failed in abort mode: ' + String(error && error.message), entry: entry.id, traceId }
          }
          return { ok: false, code: 'VMU_MIDDLEWARE_FAILED',
            message: 'middleware ' + entry.id + ' failed in closed mode: ' + String(error && error.message), entry: entry.id, traceId }
        }
        if (decision === undefined || decision === null) {
          failures.set(entry.id, 0)
          continue
        }
        // A capability violation is a configuration DEFECT, not a policy matter: it is always treated
        // as closed (refuse the operation), audited, and counted towards the breaker.
        try {
          checkCapability(entry, decision)
        } catch (error) {
          recordFailure(entry, error)
          remember(traceId, { hook, entry: entry.id, outcome: 'capability-violation' })
          return { ok: false, code: 'VMU_MIDDLEWARE_FAILED',
            message: String(error && error.message), entry: entry.id, traceId }
        }
        failures.set(entry.id, 0)
        hits.set(entry.id, (hits.get(entry.id) || 0) + 1)
        const applied = dryRun ? Object.assign({}, decision, { dryRun: true }) : decision
        decisions.push({ id: entry.id, decision: applied })
        audit({ what: 'middleware/decision', id: entry.id, hook, keys: Object.keys(decision).join(','), dryRun, traceId })
        remember(traceId, { hook, entry: entry.id, outcome: 'decided', keys: Object.keys(decision) })
        if (decision.deny || decision.cancel) {
          const d = decision.deny || decision.cancel
          return { ok: false, decision: applied, refused: {
            code: (d && d.code) || (decision.cancel ? 'VMU_MIDDLEWARE_REJECTED' : 'VMU_INVALID_ARGUMENT'),
            message: (d && d.message) || (d && d.reason) || 'refused by middleware ' + entry.id,
            hint: d && d.hint,
          }, entry: entry.id, decisions, traceId }
        }
      }
      // The FULL decision is returned, not only its terminal kinds: an adapter (the DSH hook bridge) must be
      // able to see `ask`, `rewriteArgs`, `replaceResult`, `record` and friends. A bus that surfaced only
      // denials left those actions silently unusable - a gap the host-hook scenario exposed.
      const last = decisions.length > 0 ? decisions[decisions.length - 1].decision : null
      return { ok: true, decisions, traceId, decision: last }
    },

    /** Observability (R11): ordered entries with their enable state, hits, failures and breaker state. */
    status() {
      return {
        dryRun,
        hookTimeoutMs,
        breakerThreshold,
        entries: [...registry.values()]
          .sort((a, b) => (a.order - b.order) || (a.id < b.id ? -1 : 1))
          .map((e) => ({ id: e.id, kind: e.kind, order: e.order, on: e.on, failure: e.failure,
            capabilities: e.capabilities, scope: e.scope || null, source: e.source,
            enabled: e.enabled && !disabled.has(e.id), disabledReason: disabled.get(e.id) || null,
            hits: hits.get(e.id) || 0, consecutiveFailures: failures.get(e.id) || 0 })),
        hooks: [...new Set([...registry.values()].flatMap((e) => e.on))].sort(),
      }
    },

    trace(traceId) { return (traces.get(traceId) || []).map((r) => Object.assign({}, r)) },

    /**
     * The host-waterfall contract (docs/05 §1, docs/03 for the contract itself): a listener that returns
     * undefined MUST let the chain continue. Middleware never touches the host waterfall directly —
     * this wrapper is the only place that knows about `next`.
     */
    wrapHostWaterfall(next) {
      if (typeof next !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'wrapHostWaterfall needs the host next()')
      return async (payload) => {
        const result = await bus.emit(payload && payload.hook ? payload.hook : 'host/waterfall', payload)
        if (result && result.ok === false) return result
        return next(payload)
      }
    },
  }

  for (const e of entries) add(e)
  return bus
}
