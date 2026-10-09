// vmu rules — the capability scenario for kernel/rules.js (docs/05 §5).
//
// The point of a DECLARATIVE rule is that it can be checked before it is trusted, so the scenarios are:
//   · static validation refuses what a declarative rule must never contain: an unknown predicate or
//     action, an expression-shaped key (`expr`, `js`, `code`, ...), a deny without a registered VMU_*
//     code, a malformed `arg`/`setting`/`count`/`match` clause;
//   · the predicate vocabulary behaves as documented, including wildcards, comparisons, the kernel's
//     NAMED subject predicates, and all/any/not;
//   · dry-run is PROVABLY side-effect free: it reports what would happen and moves no counter that only
//     real matches move, and it does not mutate the rule it was given;
//   · a compiled rule is a bus handler, so M1 and M2 share one bus - including the bus's capability
//     enforcement, which refuses a rule that uses a capability it did not declare.
//
// `--self-probe` copies the module, REMOVES the forbidden-key check and requires the "no expressions"
// assertion to fail - the safety property, not a convenience.

import { readFile, writeFile, mkdtemp, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'rules.js')
const BUS = resolve(REPO, 'vibe-math-vmu', 'kernel', 'bus.js')
const SELF_PROBE = process.argv.includes('--self-probe')

let passed = 0, failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) passed++
  else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const expectThrow = (fn, code, name) => {
  try { fn(); failed++; failures.push(name + ' (did not throw)') }
  catch (e) { ok(e && e.code === code, name, e && e.code) }
}

const m = await import(pathToFileURL(MODULE).href)
const busMod = await import(pathToFileURL(BUS).href)

const engine = m.createRulesEngine({
  settings: { 'vmu.limits.toolCallsPerTurnCap': 12 },
  counters: { tool_calls: 12, refusals: 0 },
  subjects: { has_locked_formal_proof: (ev) => ev.locked === true, in_frozen_ballot: (ev) => ev.frozen === true },
})

// ---- 1. static validation: what a declarative rule may never contain ---------------------------
{
  expectThrow(() => engine.compile({ id: 'x', on: ['h'], when: { nope: 1 }, then: [{ allow: {} }] }),
    'VMU_MIDDLEWARE_FAILED', 'an unknown predicate is refused at compile time')
  expectThrow(() => engine.compile({ id: 'x', on: ['h'], when: {}, then: [{ explode: {} }] }),
    'VMU_MIDDLEWARE_FAILED', 'an unknown action is refused')
  const expr = engine.validate({ id: 'x', on: ['h'], when: { expr: 'ctx.state > 3' }, then: [{ allow: {} }] })
  ok(expr.some((p) => /expressions are not allowed/.test(p)), 'an expression key is refused (M1 is data, not code)', expr.join(' | '))
  const expr2 = engine.validate({ id: 'x', on: ['h'], when: { js: 'return 1' }, then: [{ allow: {} }] })
  ok(expr2.some((p) => /expressions are not allowed/.test(p)), 'a `js` key is refused too')
  ok(engine.validate({ id: 'x', on: ['h'], when: { all: [{ tool: ['a'] }, { not: { role: ['b'] } }] }, then: [{ allow: {} }] }).length === 0,
    'a well-formed rule validates clean')
  const badDeny = engine.validate({ id: 'x', on: ['h'], when: {}, then: [{ deny: { message: 'no' } }] })
  ok(badDeny.some((p) => /registered VMU_\* code/.test(p)), 'a deny without a registered code is refused', badDeny.join(' | '))
  ok(engine.validate({ id: 'x', on: ['h'], when: { arg: { eq: 1 } }, then: [{ allow: {} }] }).some((p) => /arg: needs/.test(p)),
    'a malformed arg clause is refused')
  ok(engine.validate({ id: 'x', on: [], when: {}, then: [{ allow: {} }] }).some((p) => /on must be a hook name or a non-empty list/.test(p)),
    'an empty hook list is refused')
  ok(engine.validate({ id: 'x', on: ['h'], when: {}, then: [] }).some((p) => /then must be a non-empty list/.test(p)),
    'an empty then list is refused')
  ok(engine.validate({ id: 'x', on: ['h'], when: {}, then: [{ allow: {} }, { deny: { code: 'VMU_STATE', message: 'x' } }] }).length === 0,
    'two actions in one entry list are fine (they are separate entries)')
  ok(engine.validate({ id: 'x', on: ['h'], when: { tool: ['a'], all: [{ role: ['b'] }] }, then: [{ allow: {} }] })
    .some((p) => /combine logical and atomic/.test(p)), 'mixing a logical key with an atomic key is refused')
}

// ---- 2. the predicate vocabulary ---------------------------------------------------------------
{
  const wild = engine.compile({ id: 'w', on: ['h'], when: { tool: ['vibe_vmu_*'] }, then: [{ annotate: { tag: 'x' } }] })
  ok((await wild({ tool: 'vibe_vmu_ballot' })) !== undefined, 'a wildcard tool match hits')
  ok((await wild({ tool: 'math_computation' })) === undefined, 'a wildcard tool match does not hit a different tool')

  const idp = engine.compile({ id: 'i', on: ['h'], when: { all: [{ role: ['chair'] }, { phase: ['review'] }] }, then: [{ annotate: {} }] })
  ok((await idp({ role: 'chair', phase: 'review' })) !== undefined, 'all/atomic conjunction hits when every clause holds')
  ok((await idp({ role: 'chair', phase: 'explore' })) === undefined, 'and misses when one clause fails')

  const anyp = engine.compile({ id: 'a', on: ['h'], when: { any: [{ member: ['m-1'] }, { member: ['m-2'] }] }, then: [{ annotate: {} }] })
  ok((await anyp({ member: 'm-2' })) !== undefined, 'any hits on either branch')
  const notp = engine.compile({ id: 'n', on: ['h'], when: { not: { role: ['temp'] } }, then: [{ annotate: {} }] })
  ok((await notp({ role: 'reviewer' })) !== undefined && (await notp({ role: 'temp' })) === undefined, 'not inverts')

  const argp = engine.compile({ id: 'g', on: ['h'], when: { arg: { path: 'track', eq: 'rejected' } }, then: [{ deny: { code: 'VMU_INVALID_ARGUMENT', message: 'no' } }] })
  ok((await argp({ args: { track: 'rejected' } })).deny !== undefined, 'an arg equality match hits')
  ok((await argp({ args: { track: 'routes' } })) === undefined, 'and misses otherwise')
  const gt = engine.compile({ id: 'gt', on: ['h'], when: { count: { of: 'tool_calls', gte: 12 } }, then: [{ deny: { code: 'VMU_RESOURCE_BUDGET', message: 'cap' } }] })
  ok((await gt({})).deny.code === 'VMU_RESOURCE_BUDGET', 'a count comparison hits at the threshold')
  const setp = engine.compile({ id: 's', on: ['h'], when: { setting: { key: 'vmu.limits.toolCallsPerTurnCap', gt: 0 } }, then: [{ annotate: {} }] })
  ok((await setp({})) !== undefined, 'a setting comparison reads the resolved settings')

  const subj = engine.compile({ id: 'p', on: ['h'], when: { subject: 'has_locked_formal_proof' }, then: [{ annotate: {} }] })
  ok((await subj({ locked: true })) !== undefined && (await subj({ locked: false })) === undefined,
    'a named subject predicate is asked, and only true counts')
  let badSubj = null
  try { engine.compile({ id: 'bad', on: ['h'], when: { subject: 'not_registered' }, then: [{ annotate: {} }] }) } catch (e) { badSubj = e }
  ok(badSubj && badSubj.code === 'VMU_MIDDLEWARE_FAILED' && /unknown named predicate/.test(badSubj.message),
    'an unregistered subject predicate is refused at COMPILE time, naming the known ones', badSubj && badSubj.message)

  const mp = engine.compile({ id: 'm', on: ['h'], when: { match: { on: 'prompt', re: '只评已锁定结论' } }, then: [{ annotate: {} }] })
  ok((await mp({ prompt: '本轮只评已锁定结论。' })) !== undefined, 'a text match can be applied to the prompt')
}

// ---- 3. terminal vs merged actions -------------------------------------------------------------
{
  const denyRule = engine.compile({ id: 'd', on: ['h'], when: {}, then: [{ annotate: { a: 1 } }, { deny: { code: 'VMU_NOT_PERMITTED', message: 'no' } }] })
  const d = await denyRule({})
  ok(d.deny && d.deny.code === 'VMU_NOT_PERMITTED' && d.deny.by === 'd', 'a deny wins and records which rule refused')
  const merged = engine.compile({ id: 'mr', on: ['h'], when: {}, then: [{ annotate: { a: 1 } }, { record: { track: 'routes' } }] })
  const r = await merged({})
  ok(r.annotate && r.record, 'non-terminal actions are merged into one decision')
}

// ---- 4. dry-run is provably side-effect free ---------------------------------------------------
{
  const rule = { id: 'dry', on: ['h'], when: { tool: ['vibe_vmu_*'] }, then: [{ deny: { code: 'VMU_NOT_PERMITTED', message: 'no' } }] }
  const before = JSON.stringify(rule)
  const beforeMatches = engine.status().stats.matches
  const out = engine.dryRun(rule, [{ tool: 'vibe_vmu_ballot' }, { tool: 'other' }, { tool: 'vibe_vmu_meeting' }])
  ok(out.ok === true && out.hits.length === 2 && out.would.join(',') === 'deny', 'dry-run reports the hits and what they would do', JSON.stringify(out.would))
  ok(JSON.stringify(rule) === before, 'dry-run did not mutate the rule it was given')
  ok(engine.status().stats.matches === beforeMatches, 'dry-run moved no counter that only real matches move (no side effects)')
  ok(engine.dryRun({ id: 'bad', on: ['h'], when: { expr: 'x' }, then: [{ allow: {} }] }, []).ok === false,
    'dry-run of an invalid rule reports problems instead of pretending to run')
}

// ---- 5. a compiled rule IS a bus handler: M1 and M2 share one bus ------------------------------
{
  const bus = busMod.createBus()
  const entries = engine.toBusEntries([
    { id: 'gate', kind: 'rules', on: ['tools/pre-execute'], order: 100, when: { not: { subject: 'has_locked_formal_proof' } }, then: [{ deny: { code: 'VMU_INVALID_ARGUMENT', message: 'only locked objects may be voted on' } }] },
  ])
  for (const e of entries) bus.add(e)
  const rules = engine.get('gate')
  ok(rules.id === 'gate', 'the compiled rule is retrievable by id')
  const refused = await bus.emit('tools/pre-execute', { locked: false }, { member: 'm-1' })
  ok(refused.ok === false && refused.refused.code === 'VMU_INVALID_ARGUMENT', 'the M1 rule denies through the shared bus')
  const allowed = await bus.emit('tools/pre-execute', { locked: true }, { member: 'm-1' })
  ok(allowed.ok === true, 'and it lets the operation through when the subject predicate holds', JSON.stringify(allowed))

  // The bus's capability enforcement applies to M1 exactly as it does to M2 (docs/05 §6).
  const sneaky = busMod.createBus()
  sneaky.add({ id: 'sneaky', kind: 'rules', on: ['tools/pre-execute'], capabilities: ['annotate'], handler: async () => ({ deny: { code: 'VMU_NOT_PERMITTED', message: 'x' } }) })
  const r = await sneaky.emit('tools/pre-execute', {})
  ok(r.ok === false && /without declaring it/.test(r.message), 'the bus refuses an M1 rule that exceeds its declared capabilities')
  const capabilityKeys = Object.values(m.ACTION_CAPABILITY)
  ok(capabilityKeys.every((c) => busMod.CAPABILITIES.includes(c)), 'every action capability is part of the bus vocabulary (one vocabulary, two forms)')
}

// ---- 6. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = await readFile(MODULE, 'utf8')
  const guard = "      if (FORBIDDEN_KEYS.includes(k)) {"
  if (src.indexOf(guard) === -1) {
    ok(false, 'self-probe anchor applies (the forbidden-key check is present)', 'ANCHOR MISS')
  } else {
    const dir = await mkdtemp(join(tmpdir(), 'vmu-rules-mut-'))
    await mkdir(join(dir, 'kernel'), { recursive: true })
    await writeFile(join(dir, 'kernel', 'rules.js'), src.replace(guard, '      if (false) {'), 'utf8')
    const mm = await import(pathToFileURL(join(dir, 'kernel', 'rules.js')).href + '?probe=1')
    const problems = mm.validateRule({ id: 'x', on: ['h'], when: { expr: 'ctx.x > 1' }, then: [{ allow: {} }] })
    // With the check removed an expression-shaped rule passes validation: the safety assertion MUST fail.
    ok(problems.some((p) => /expressions are not allowed/.test(p)) === true,
      'self-probe: check removed => the "no expressions in M1" assertion fails (as required)', JSON.stringify(problems))
    await rm(dir, { recursive: true, force: true })
  }
  console.log('=== VMU RULES SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU RULES: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
