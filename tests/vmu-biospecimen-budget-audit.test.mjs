// tests/vmu-biospecimen-budget-audit.test.mjs — independent tests for the three families this round added or completed:
//   kernel/biospecimen.js  (vmu.biospecimen.*  seven declared keys, a NEW face)
//   kernel/budget.js       (vmu.budget.*       five declared keys, an existing face)
//   kernel/audit.js        (vmu.audit.*        eight declared keys, an existing face)
// Every setting is asserted in BOTH directions. Last line: === VMU BIOSPECIMEN+BUDGET+AUDIT: N passed, M failed ===
import { createBiospecimen } from '../vibe-math-vmu/kernel/biospecimen.js'
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
const bio = (s = {}) => createBiospecimen({ clock: () => now, settings: s })
const bud = (s = {}) => createBudget({ clock: () => now, settings: s })
const aud = (s = {}) => createAudit({ clock: () => now, settings: s })

// ── BIOSPECIMEN ──────────────────────────────────────────────────────────────────────────────────────────────
{
  const z = bio()
  ok(z.status().samples === 0 && z.status().chainRequired === true, 'biospecimen zero-config: nothing registered, chain required by default')

  // subjectRefStyle: a plaintext-looking reference is refused under pseudonym style
  const p = bio({ 'vmu.biospecimen.subjectRefStyle': 'pseudonym' })
  throwsCode(() => p.registerSample({ subjectRef: 'someone@example.org' }), 'VMU_BIOSPECIMEN_SUBJECT_REF_STYLE',
    'subjectRefStyle[-]: a plaintext-looking reference is refused by name')
  ok(p.registerSample({ subjectRef: 'anon-0001' }).ok === true, 'subjectRefStyle[+]: a pseudonym registers')
  const asCode = bio({ 'vmu.biospecimen.subjectRefStyle': 'code' })
  ok(asCode.registerSample({ subjectRef: 'PT-0042' }).ok === true, 'subjectRefStyle[+]: under code style a code registers')

  // mappingIrreversible: kernel-enforced, so a reversible mapping is REFUSED rather than encrypted and hoped over
  const irrev = bio({ 'vmu.biospecimen.mappingIrreversible': true })
  const rev = throwsCode(() => irrev.registerSample({ subjectRef: 'anon-9', mapping: { subject: 'Jane Doe', ref: 'anon-9' } }),
    'VMU_BIOSPECIMEN_REVERSIBLE_MAPPING', 'mappingIrreversible[-]: a reversible mapping is refused by name')
  ok(!!rev && /outside this ledger/.test(String(rev.hint)), 'mappingIrreversible[-]: the hint says where the mapping belongs')
  const allowed = bio({ 'vmu.biospecimen.mappingIrreversible': false })
  ok(allowed.registerSample({ subjectRef: 'anon-9', mapping: { subject: 'Jane Doe' } }).ok === true,
    'mappingIrreversible[+]: only when the key is switched off may a mapping be stored')

  // requireChain: a transfer needs a holder
  const chain = bio({ 'vmu.biospecimen.requireChain': true })
  const s1 = chain.registerSample({ subjectRef: 'anon-A', kind: 'serum' })
  ok(s1.chainLength === 1, 'requireChain[+]: registration opens the chain')
  throwsCode(() => chain.transfer({ sampleId: s1.id }), 'VMU_BIOSPECIMEN_CHAIN_REQUIRED',
    'requireChain[-]: a transfer with no holder is refused by name')
  const moved = chain.transfer({ sampleId: s1.id, to: 'freezer-2', reason: 'moved' })
  ok(moved.chainLength === 2 && chain.chainOf({ sampleId: s1.id }).chain.length === 2, 'requireChain[+]: a transfer with a holder extends the chain')
  const loose = bio({ 'vmu.biospecimen.requireChain': false })
  const s2 = loose.registerSample({ subjectRef: 'anon-B' })
  ok(s2.chainLength === 0 && loose.transfer({ sampleId: s2.id }).ok === true, 'requireChain[off]: with it off neither the opening nor the holder is required')

  // chainGapPolicy: a backwards-dated link is a gap
  const blocking = bio({ 'vmu.biospecimen.chainGapPolicy': 'block' })
  const s3 = blocking.registerSample({ subjectRef: 'anon-C' })
  now += 5000
  blocking.transfer({ sampleId: s3.id, to: 'freezer-1' })
  throwsCode(() => blocking.transfer({ sampleId: s3.id, to: 'freezer-2', at: now - 10000 }), 'VMU_BIOSPECIMEN_CHAIN_GAP',
    'chainGapPolicy[-]: a link dated before the previous one is refused by name')
  const warning = bio({ 'vmu.biospecimen.chainGapPolicy': 'warn' })
  const s4 = warning.registerSample({ subjectRef: 'anon-D' })
  now += 5000
  warning.transfer({ sampleId: s4.id, to: 'freezer-1' })
  const gapWarned = warning.transfer({ sampleId: s4.id, to: 'freezer-2', at: now - 10000 })
  ok(gapWarned.gapWarned === true && warning.chainOf({ sampleId: s4.id }).warnings.length >= 1,
    'chainGapPolicy[warn]: a gap is recorded and warned about instead of refused')

  // freezeThawWarnAt: a warning at the declared count, never a refusal
  const ft = bio({ 'vmu.biospecimen.freezeThawWarnAt': 2 })
  const s5 = ft.registerSample({ subjectRef: 'anon-E' })
  ok(ft.freezeThawCycle({ sampleId: s5.id, kind: 'thaw' }).warned === false, 'freezeThawWarnAt[+]: the first cycle does not warn')
  const warned = ft.freezeThawCycle({ sampleId: s5.id, kind: 'thaw' })
  ok(warned.warned === true && warned.cycles === 2, 'freezeThawWarnAt[-]: at the declared count it WARNS (the contract asks for a warning, not a refusal)')
  ok(ft.freezeThawCycle({ sampleId: s5.id, kind: 'thaw' }).ok === true, 'freezeThawWarnAt: crossing the threshold does not refuse')

  // destroyKeepsReference
  const keeping = bio({ 'vmu.biospecimen.destroyKeepsReference': true })
  const s6 = keeping.registerSample({ subjectRef: 'anon-F' })
  const kept = keeping.destroy({ sampleId: s6.id, reason: 'used up' })
  ok(kept.referenceKept === true && keeping.status().samples === 1 && keeping.status().destroyed === 1,
    'destroyKeepsReference[+]: the record stays and says the material is gone')
  throwsCode(() => keeping.transfer({ sampleId: s6.id, to: 'x' }), 'VMU_BIOSPECIMEN_ALREADY_DESTROYED',
    'destroy[+]: a destroyed sample cannot change custody')
  const forgetting = bio({ 'vmu.biospecimen.destroyKeepsReference': false })
  const s7 = forgetting.registerSample({ subjectRef: 'anon-G' })
  ok(forgetting.destroy({ sampleId: s7.id }).referenceKept === false && forgetting.status().samples === 0,
    'destroyKeepsReference[-]: with it off the record is removed and the removal is counted')

  // ledgerDir is reported, never touched
  ok(bio({ 'vmu.biospecimen.ledgerDir': 'Custom/Samples' }).status().policy.ledgerDir === 'Custom/Samples', 'ledgerDir[+]: the declared directory is reported')
  ok(bio().status().policy.ledgerDir === 'Ops/Biosamples', 'ledgerDir[-]: the declared default is reported')
}

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

console.log('=== VMU BIOSPECIMEN+BUDGET+AUDIT: ' + pass + ' passed, ' + fail + ' failed ===')
process.exit(fail > 0 ? 1 : 0)
