// tests/vmu-explain-control-citations.test.mjs — independent tests for the three faces this round added:
//   kernel/explain.js    (vmu.explain.*    seven declared keys)
//   kernel/control.js    (vmu.control.*    seven declared keys)
//   kernel/citations.js  (vmu.citations.*  four declared keys)
// Every setting is asserted in BOTH directions, plus each face's declared-default and purity invariants.
// Last line: === VMU EXPLAIN+CONTROL+CITATIONS: N passed, M failed ===
import { createExplain, CODE as EX_CODE } from '../vibe-math-vmu/kernel/explain.js'
import { createControl, CODE as CO_CODE } from '../vibe-math-vmu/kernel/control.js'
import { createCitations, CODE as CI_CODE } from '../vibe-math-vmu/kernel/citations.js'

let pass = 0
let fail = 0
const ok = (cond, label, detail) => { if (cond) { pass += 1 } else { fail += 1; console.log('FAIL ' + label + (detail === undefined ? '' : ' [' + detail + ']')) } }
const throwsCode = (fn, code, label) => {
  try { fn(); fail += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) { if (e && e.code === code) { pass += 1; return e } fail += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null }
}

let now = 1000
const ex = (s = {}) => createExplain({ clock: () => now, settings: s })
const co = (s = {}) => createControl({ clock: () => now, settings: s })
const ci = (s = {}) => createCitations({ clock: () => now, settings: s })

// ── EXPLAIN ──────────────────────────────────────────────────────────────────────────────────────────────────
{
  // reasonRequired
  const req = ex({ 'vmu.explain.reasonRequired': true })
  throwsCode(() => req.checkReason({ action: 'delegate' }), EX_CODE.reasonRequired,
    'reasonRequired[-]: an action with no reason is refused by name')
  ok(req.checkReason({ action: 'delegate', reason: 'because' }).reason === 'because', 'reasonRequired[+]: a reason passes')
  ok(ex({ 'vmu.explain.reasonRequired': false }).checkReason({ action: 'delegate' }).reason === null,
    'reasonRequired[off]: with it off no reason is demanded')

  // reasonMaxChars: refused, never truncated
  const cap = ex({ 'vmu.explain.reasonMaxChars': 10 })
  const tooLong = throwsCode(() => cap.checkReason({ reason: 'x'.repeat(11) }), EX_CODE.reasonTooLong,
    'reasonMaxChars[-]: an over-long reason is refused by name')
  ok(!!tooLong && /NOT truncate/.test(String(tooLong.hint)), 'reasonMaxChars[-]: the hint refuses to truncate on the caller behalf')
  ok(cap.checkReason({ reason: 'x'.repeat(10) }).length === 10, 'reasonMaxChars[+]: exactly at the cap passes')
  ok(ex({}).checkReason({ reason: 'x'.repeat(400) }).ok === true, 'reasonMaxChars[-]: the declared default is 400')

  // correlateBy
  const byTrace = ex({ 'vmu.explain.correlateBy': 'traceId' })
  ok(byTrace.correlate({ traceId: 't-1' }).value === 't-1', 'correlateBy[+]: the declared key is used')
  throwsCode(() => byTrace.correlate({ taskId: 'k-1' }), EX_CODE.correlationUnknown,
    'correlateBy[-]: a missing declared key is refused by name')
  const byTask = ex({ 'vmu.explain.correlateBy': 'taskId' })
  ok(byTask.correlate({ taskId: 'k-1', traceId: 't-1' }).value === 'k-1', 'correlateBy[+]: switching the key switches the answer')
  const none = ex({ 'vmu.explain.correlateBy': 'none' })
  const nc = none.correlate({ traceId: 't-1' })
  ok(nc.correlated === false && nc.value === null, 'correlateBy[none]: nothing is correlated and no id is invented')
  ok(none.correlate({}).ok === true, 'correlateBy[none]: correlating with nothing is not an error when nothing is correlated at all')

  // detail decides how much survives, and omissions are NAMED
  const full = ex({ 'vmu.explain.detail': 'full' })
  const long = 'y'.repeat(300)
  const fullRep = full.build({ action: 'x', reason: 'r', traceId: 't', fields: { note: long } })
  ok(fullRep.report.fields.note.length === 300, 'detail[full]: a long field is kept whole')
  const sum = ex({ 'vmu.explain.detail': 'summary' })
  const sumRep = sum.build({ action: 'x', reason: 'r', traceId: 't', fields: { note: long } })
  ok(sumRep.report.fields.note.length < 300 && sumRep.report.omitted.some((o) => o.startsWith('long-field:note')),
    'detail[summary]: the field is shortened AND the shortening is named', JSON.stringify(sumRep.report.omitted))

  // includeChains / includeScores
  const withBoth = ex({ 'vmu.explain.includeChains': true, 'vmu.explain.includeScores': true })
  const both = withBoth.build({ action: 'x', reason: 'r', traceId: 't', chains: [{ from: 'a', to: 'b' }], scores: [{ who: 'a', score: 1 }] })
  ok(Array.isArray(both.report.chains) && both.report.chains.length === 1 && Array.isArray(both.report.scores) && both.report.scores.length === 1,
    'includeChains[+]/includeScores[+]: both sections are present')
  const without = ex({ 'vmu.explain.includeChains': false, 'vmu.explain.includeScores': false })
  const wo = without.build({ action: 'x', reason: 'r', traceId: 't', chains: [{ from: 'a' }], scores: [{ who: 'a' }] })
  ok(wo.report.chains === null && wo.report.scores === null && wo.report.omitted.includes('chains') && wo.report.omitted.includes('scores'),
    'includeChains[-]/includeScores[-]: the sections are absent AND named as omitted', JSON.stringify(wo.report.omitted))

  // reportFormat
  const md = ex({ 'vmu.explain.reportFormat': 'md' })
  const mdRep = md.build({ action: 'x', reason: 'r', traceId: 't' })
  ok(md.render({ report: mdRep.report }).format === 'md' && md.render({ report: mdRep.report }).text.includes('## x'),
    'reportFormat[md]: markdown is produced')
  const js = ex({ 'vmu.explain.reportFormat': 'json' })
  const jsRep = js.build({ action: 'x', reason: 'r', traceId: 't' })
  const rendered = js.render({ report: jsRep.report })
  ok(rendered.format === 'json' && JSON.parse(rendered.text).action === 'x', 'reportFormat[json]: JSON parses back to the report')
  ok(js.status().omissionsAreNamed === true, 'explain: the face declares that omissions are named')
}

// ── CONTROL ──────────────────────────────────────────────────────────────────────────────────────────────────
{
  // pauseScope: archiving is deliberately absent
  const c = co({ 'vmu.control.pauseScope': ['tasks', 'meetings', 'ballots', 'work'], 'vmu.control.canPauseRoles': ['office', 'chair'] })
  throwsCode(() => c.pause({ scope: 'archive', byRole: 'office' }), CO_CODE.pauseScope,
    'pauseScope[-]: pausing the archival surface is refused by name')
  ok(c.pause({ scope: 'tasks', byRole: 'chair' }).ok === true, 'pauseScope[+]: a declared scope is paused')
  ok(c.status().archivingNeverPausedByDefault === true, 'pauseScope: the face discloses that archiving is not pausable by default')
  const narrow = co({ 'vmu.control.pauseScope': ['meetings'] })
  throwsCode(() => narrow.pause({ scope: 'tasks', byRole: 'office' }), CO_CODE.pauseScope,
    'pauseScope[-]: a scope outside a narrowed declaration is refused')

  // canPauseRoles
  throwsCode(() => c.pause({ scope: 'work', byRole: 'intern' }), CO_CODE.pauseRole,
    'canPauseRoles[-]: an undeclared role is refused by name')
  throwsCode(() => c.pause({ scope: 'work' }), CO_CODE.pauseRole, 'canPauseRoles[-]: pausing with no role is refused')
  ok(co({ 'vmu.control.canPauseRoles': ['intern'] }).pause({ scope: 'work', byRole: 'intern' }).ok === true,
    'canPauseRoles[+]: a widened declaration admits the role')

  // mayAct + resume
  throwsCode(() => c.mayAct({ scope: 'tasks' }), 'VMU_CONTROL_PAUSED', 'pause[+]: a paused scope refuses action by name')
  ok(c.resume({ scope: 'tasks', byRole: 'chair' }).resumed === true, 'resume[+]: a paused scope resumes')
  ok(c.mayAct({ scope: 'tasks' }).ok === true, 'resume[+]: after resuming, action is allowed')
  ok(c.resume({ scope: 'never-paused', byRole: 'chair' }).resumed === false, 'resume[-]: resuming something not paused says so')

  // watchdogIntervalMs: zero means no timer, honestly
  const noTimer = co({ 'vmu.control.watchdogIntervalMs': 0 })
  const nw = noTimer.watchdog({ lastBeatAt: 0 })
  ok(nw.timer === false && nw.due === false, 'watchdogIntervalMs[0]: zero means no timer, and the face says so')
  const timed = co({ 'vmu.control.watchdogIntervalMs': 100 })
  ok(timed.watchdog({ lastBeatAt: now - 50 }).due === false, 'watchdogIntervalMs[+]: before the interval it is not due')
  ok(timed.watchdog({ lastBeatAt: now - 200 }).due === true, 'watchdogIntervalMs[-]: after the interval it is due')

  // idleAfterMs + idleAction: notice is the default and NEVER recesses
  const noIdle = co({ 'vmu.control.idleAfterMs': 0 })
  ok(noIdle.idleState({ lastActivityAt: 0 }).idle === false, 'idleAfterMs[0]: zero means idleness is not defined')
  const idle = co({ 'vmu.control.idleAfterMs': 100, 'vmu.control.idleAction': 'notice' })
  ok(idle.idleState({ lastActivityAt: now - 50 }).idle === false, 'idleAfterMs[+]: a recent activity is not idle')
  const idleNow = idle.idleState({ lastActivityAt: now - 500 })
  ok(idleNow.idle === true && idleNow.action === 'notice' && idleNow.recessed === false && /NOTICE only/.test(String(idleNow.notice)),
    'idleAction[notice]: an idle system is NOTICED, never recessed', JSON.stringify(idleNow.notice))
  const recess = co({ 'vmu.control.idleAfterMs': 100, 'vmu.control.idleAction': 'recess' })
  const rec = recess.idleState({ lastActivityAt: now - 500 })
  ok(rec.recessed === false && /belongs to the meeting face/.test(String(rec.note)),
    'idleAction[recess]: even then it does not end a meeting - that belongs to the meeting face')
  const nothing = co({ 'vmu.control.idleAfterMs': 100, 'vmu.control.idleAction': 'none' })
  ok(nothing.idleState({ lastActivityAt: now - 500 }).action === 'none', 'idleAction[none]: the declaration asks for nothing')

  // degradeSteps
  const noSteps = co({ 'vmu.control.degradeSteps': [] })
  throwsCode(() => noSteps.degrade({ step: 'read-only' }), CO_CODE.degradeStep,
    'degradeSteps[0]: an empty ladder refuses degradation by name')
  const ladder = co({ 'vmu.control.degradeSteps': ['read-only', 'report-only'] })
  ok(ladder.degrade({ step: 'report-only' }).level === 2, 'degradeSteps[+]: a declared step degrades, and the level counts')
  throwsCode(() => ladder.degrade({ step: 'no-spawn' }), CO_CODE.degradeStep,
    'degradeSteps[-]: a step not in the declared ladder is refused by name')
  ok(co({ 'vmu.control.degradeSteps': ['no-spawn'] }).degrade({ step: 'no-spawn' }).level === 1, 'degradeSteps[+]: another declared ladder works')

  // stopClearsRegistry
  const clearing = co({ 'vmu.control.stopClearsRegistry': true })
  clearing.register({ id: 'r1' })
  const stopped = clearing.stop()
  ok(stopped.cleared === 1 && stopped.registrySize === 0, 'stopClearsRegistry[+]: the registry is cleared and the count reported')
  const keeping = co({ 'vmu.control.stopClearsRegistry': false })
  keeping.register({ id: 'r2' })
  const kept = keeping.stop()
  ok(kept.cleared === 0 && kept.registrySize === 1, 'stopClearsRegistry[-]: with it off the registry survives, and the receipt says so')
}

// ── CITATIONS ────────────────────────────────────────────────────────────────────────────────────────────────
{
  // style
  const bib = ci({ 'vmu.citations.style': 'bibtex' })
  const b = bib.render({ title: 'A paper', authors: ['Ada Lovelace'], year: 2026, ids: { doi: '10.1/x' } })
  ok(b.style === 'bibtex' && b.text.startsWith('@article{') && b.text.includes('10.1/x'), 'style[bibtex]: bibtex is produced and carries the doi')
  const csl = ci({ 'vmu.citations.style': 'csl-json' })
  const c = csl.render({ title: 'A paper', authors: ['Ada Lovelace'], year: 2026, ids: { doi: '10.1/x' } })
  ok(c.style === 'csl-json' && Array.isArray(JSON.parse(c.text)), 'style[csl-json]: a CSL array parses')
  const yaml = ci({ 'vmu.citations.style': 'csl-yaml' })
  ok(yaml.render({ title: 'A', authors: ['B'], year: 2026, ids: { url: 'https://x' } }).style === 'csl-yaml', 'style[csl-yaml]: the third declared style works')
  const odd = ci({ 'vmu.citations.style': 'bibtex' })
  throwsCode(() => odd.render({ title: 'A', authors: ['B'], year: 2026, ids: { url: 'u' }, style: 'mla' }), CI_CODE.styleUnknown,
    'style[-]: an undeclared style is refused by name')
  ok(odd.status().policy.style === 'bibtex', 'style[-]: the declared default is bibtex')

  // requiredFields
  const strict = ci({ 'vmu.citations.requiredFields': ['title', 'authors', 'year'] })
  const missing = throwsCode(() => strict.validate({ title: 'Only a title' }), CI_CODE.fieldMissing,
    'requiredFields[-]: a missing field is refused by name')
  ok(!!missing && /authors/.test(String(missing.detail.missing)) && /year/.test(String(missing.detail.missing)),
    'requiredFields[-]: the refusal names EVERY missing field', JSON.stringify(missing.detail.missing))
  ok(strict.validate({ title: 't', authors: ['a'], year: 2026, ids: { url: 'u' } }).ok === true, 'requiredFields[+]: a complete entry passes')
  const lax = ci({ 'vmu.citations.requiredFields': ['title'] })
  ok(lax.validate({ title: 't', ids: { url: 'u' } }).ok === true, 'requiredFields[+]: a narrowed declaration admits the entry')

  // idPriority: the DECLARED order decides, not the input order
  const pri = ci({ 'vmu.citations.idPriority': ['doi', 'arxiv', 'pmid', 'url'] })
  ok(pri.identify({ ids: { url: 'u', arxiv: 'a', doi: 'd' } }).idType === 'doi',
    'idPriority[+]: doi wins even though url came first in the input')
  const urlFirst = ci({ 'vmu.citations.idPriority': ['url', 'doi'] })
  ok(urlFirst.identify({ ids: { url: 'u', doi: 'd' } }).idType === 'url', 'idPriority[+]: changing the declaration changes the answer')
  ok(pri.identify({ ids: {} }).idType === null, 'idPriority[-]: with no identifier present, none is invented')

  // allowFreeText
  const noFree = ci({ 'vmu.citations.allowFreeText': false })
  throwsCode(() => noFree.validate({ title: 't', authors: ['a'], year: 2026 }), CI_CODE.identifierMissing,
    'allowFreeText[-]: an entry with no identifier is refused by name')
  const free = ci({ 'vmu.citations.allowFreeText': true })
  ok(free.validate({ title: 't', authors: ['a'], year: 2026, freeText: 'blog post, 2026' }).ok === true,
    'allowFreeText[+]: with it on a free-text entry is admitted')
  ok(noFree.status().freeTextIsOffByDefault === true, 'allowFreeText: the face discloses that free text is off by default')
  ok(free.render({ title: 't', authors: ['a'], year: 2026, freeText: 'blog post' }).ok === true, 'allowFreeText[+]: rendering a free-text entry works')
}

console.log('=== VMU EXPLAIN+CONTROL+CITATIONS: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail > 0 ? 1 : 0)
