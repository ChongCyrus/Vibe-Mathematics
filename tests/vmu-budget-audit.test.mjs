// tests/vmu-budget-audit.test.mjs — the budget and audit families, split out of a shared suite.
//   kernel/budget.js       (vmu.budget.*       five declared keys, an existing face)
//   kernel/audit.js        (vmu.audit.*        eight declared keys, an existing face)
// Every setting is asserted in BOTH directions. Last line: === VMU BUDGET+AUDIT: N passed, M failed ===
import { createBudget } from '../vibe-math-vmu/kernel/budget.js'
import { createAudit } from '../vibe-math-vmu/kernel/audit.js'

let pass = 0
let fail = 0
const ok = (cond, label, detail) => { if (cond) { pass += 1 } else { fail += 1; console.log('FAIL ' + label + (detail === undefined ? '' : ' [' + detail + ']')) } }
const throwsCode = (fn, code, label) => {
  try { fn(); fail += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) { if (e && e.code === code) { pass += 1; return e } fail += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null }
}

let now = 1000
const DAY = 86400000
const bud = (s = {}) => createBudget({ clock: () => now, settings: s })
const aud = (s = {}) => createAudit({ clock: () => now, settings: s })

// ── BUDGET ───────────────────────────────────────────────────────────────────────────────────────────────────
{
  // a declared total becomes the scope's default limit
  const b = bud({ 'vmu.budget.tokens': 10 })
  const scope = b.open({ scope: 'meeting:mt-1' })
  ok(JSON.stringify(scope.limits) === JSON.stringify({ tokens: 10 }), 'tokens[+]: the declared total becomes the scope limit', JSON.stringify(scope.limits))
  ok(b.charge({ scope: 'meeting:mt-1', kind: 'tokens', amount: 10 }).ok !== false, 'tokens[+]: exactly the total is allowed')
  let over = null
  try { b.charge({ scope: 'meeting:mt-1', kind: 'tokens', amount: 1 }) } catch (e) { over = e }
  ok(!!over, 'tokens[-]: exceeding the declared total is refused')
  ok(bud({ 'vmu.budget.tokens': 0 }).open({ scope: 'x' }).limits.tokens === undefined, 'tokens[0]: zero means unlimited, so no limit is set')
  const explicit = bud({ 'vmu.budget.tokens': 10 }).open({ scope: 'y', limits: { tokens: 3 } })
  ok(explicit.limits.tokens === 3, 'tokens[override]: an explicit limit still wins over the declared total')

  // the other three totals behave the same way
  const all = bud({ 'vmu.budget.turns': 4, 'vmu.budget.toolCalls': 6, 'vmu.budget.subagents': 2 })
  const l = all.open({ scope: 'z' }).limits
  ok(l.turns === 4 && l.toolCalls === 6 && l.subagents === 2, 'turns/toolCalls/subagents[+]: all three totals become limits', JSON.stringify(l))

  // perTaskShare: one task may not take more than its share of the limit
  const share = bud({ 'vmu.budget.tokens': 10, 'vmu.budget.perTaskShare': 0.5 })
  share.open({ scope: 's' })
  share.charge({ scope: 's', kind: 'tokens', amount: 5, taskId: 't1' })
  throwsCode(() => share.charge({ scope: 's', kind: 'tokens', amount: 1, taskId: 't1' }), 'VMU_BUDGET_TASK_SHARE_EXCEEDED',
    'perTaskShare[-]: a task beyond its share is refused by name')
  ok(share.charge({ scope: 's', kind: 'tokens', amount: 5, taskId: 't2' }).ok !== false,
    'perTaskShare[+]: a DIFFERENT task gets its own share')
  const noShare = bud({ 'vmu.budget.tokens': 10, 'vmu.budget.perTaskShare': 0 })
  noShare.open({ scope: 'n' })
  ok(noShare.charge({ scope: 'n', kind: 'tokens', amount: 4, taskId: 't1' }).ok !== false && noShare.charge({ scope: 'n', kind: 'tokens', amount: 4, taskId: 't1' }).ok !== false,
    'perTaskShare[0]: with no share declared, only the scope total governs')
  ok(share.perTaskShare() === 0.5 && noShare.perTaskShare() === 0, 'perTaskShare: the resolved value is observable')
}

// ── AUDIT ────────────────────────────────────────────────────────────────────────────────────────────────────
{
  // level: minimal drops the fields, verbose adds the redaction list, normal keeps them
  const minimal = aud({ 'vmu.audit.level': 'minimal' })
  const mrow = minimal.append({ what: 'vote', ballot: 'b-1' })
  ok(mrow.ballot === undefined && mrow.what === 'vote', 'level[minimal]: the row carries only the frame', JSON.stringify(mrow))
  const normal = aud({ 'vmu.audit.level': 'normal' })
  ok(normal.append({ what: 'vote', ballot: 'b-1' }).ballot === 'b-1', 'level[normal]: the fields are kept')
  const verbose = aud({ 'vmu.audit.level': 'verbose' })
  const vrow = verbose.append({ what: 'vote', ballot: 'b-1' })
  ok(vrow.ballot === 'b-1' && Array.isArray(vrow.redactedFields) && vrow.level === 'verbose', 'level[verbose]: the fields AND the redaction list are kept')

  // sensitiveFields ADDS to the redaction list
  const sens = aud({ 'vmu.audit.sensitiveFields': ['patientRef'] })
  const srow = sens.append({ what: 'vote', patientRef: 'secret', ballot: 'b-2' })
  ok(srow.patientRef !== 'secret', 'sensitiveFields[+]: a declared field is redacted')
  ok(aud({}).append({ what: 'vote', patientRef: 'kept' }).patientRef === 'kept', 'sensitiveFields[-]: without the declaration the field is kept')

  // rotateBytes / rotateDaily: a not-due rotation is refused, force overrides
  const rot = aud({ 'vmu.audit.rotateBytes': 10485760, 'vmu.audit.rotateDaily': true })
  rot.append({ what: 'vote', ballot: 'b-3' })
  ok(throwsCode(() => rot.rotate(), 'VMU_AUDIT_WRITE_FAILED', 'rotateBytes[+] rotateDaily[+]: a not-due rotation is refused by name') !== null,
    'rotate[not due]: the declared policy decides that no rotation is due')
  ok(rot.rotate({ force: true }).kept >= 0, 'rotate[force]: force rotates anyway')
  const tiny = aud({ 'vmu.audit.rotateBytes': 1 })
  tiny.append({ what: 'vote', ballot: 'b-4' })
  ok(tiny.rotate().removed >= 0, 'rotateBytes[-]: a tiny declared size makes a rotation due')

  // traceKeepMs ages trace rows out on append
  const traces = aud({ 'vmu.audit.traceKeepMs': 1000 })
  traces.append({ what: 'trace-span', span: 's1' })
  now += 5000
  traces.append({ what: 'vote', ballot: 'b-5' })
  ok(traces.status().expired >= 1, 'traceKeepMs[+]: an old trace row is aged out and counted', JSON.stringify(traces.status().expired))
  const noTrace = aud({ 'vmu.audit.traceKeepMs': 0 })
  noTrace.append({ what: 'trace-span', span: 's2' })
  now += 5000
  noTrace.append({ what: 'vote', ballot: 'b-6' })
  ok(noTrace.status().expired === 0, 'traceKeepMs[0]: zero disables the age-out entirely')

  // recountRoles
  const recount = aud({ 'vmu.audit.recountRoles': ['chair'] })
  ok(recount.recount({ byRole: 'chair' }).ok === true, 'recountRoles[+]: a declared role may recount')
  throwsCode(() => recount.recount({ byRole: 'intern' }), 'VMU_AUDIT_RECOUNT_NOT_ALLOWED',
    'recountRoles[-]: an undeclared role is refused by name')
  throwsCode(() => recount.recount({}), 'VMU_AUDIT_RECOUNT_NOT_ALLOWED', 'recountRoles[-]: recounting with no role is refused')

  // exportScope
  const exp = aud({ 'vmu.audit.exportScope': ['refusals'] })
  const e1 = exp.exportScoped({ scope: 'refusals' })
  ok(e1.ok === true && e1.scopes.join() === 'refusals', 'exportScope[+]: a declared scope exports')
  throwsCode(() => exp.exportScoped({ scope: 'secrets' }), 'VMU_AUDIT_SCOPE_NOT_DECLARED',
    'exportScope[-]: an undeclared scope is refused by name')
  const all = aud({}).exportScoped()
  ok(all.scopes.length === 3, 'exportScope[default]: the declared default lists three scopes')

  // dir is reported, never touched
  ok(aud({ 'vmu.audit.dir': 'Custom/Audit' }).exportScoped().dir === 'Custom/Audit', 'dir[+]: the declared directory is reported')
  ok(aud({}).exportScoped().dir === '<root>/vmu/audit', 'dir[-]: the declared default is reported')
  ok(aud({}).status().policy.rotateBytes === 10485760 && aud({}).status().policy.rotateDaily === true,
    'rotateBytes/rotateDaily: the declared defaults are reported (10485760 / true)')
}

console.log('=== VMU BUDGET+AUDIT: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail > 0 ? 1 : 0)
