// scripts/audit-hook-emit-classification.mjs — THE HOOK-EMIT CLASSIFICATION GATE (Lead adjudication ①, Round 4).
//
// WHY THIS EXISTS. `bus.emit('<name>', …)` was used for two different intents while only one of them was
// written down: an EVENT (a behaviour happened and an extension may react - it belongs in `HOOK_REGISTRY`) and
// an ACCOUNTING ROW (a ledger line nobody should be able to subscribe to). Everything else was invisible, and
// a name that is "neither registered nor declared log-only" is exactly the silent state this gate forbids.
// Round 4 measured 30 such names (five of them live bugs: inside `VU_NAMESPACE` but unregistered, so the bus
// refused the emit and the caller's try/catch swallowed the refusal - the `budget/warn` class).
//
// WHAT IT CHECKS (exit non-zero on any):
//   §1 every literal `emit('<name>'` in vmu code is CLASSIFIED: registered in HOOK_REGISTRY, or listed in
//      LOG_ONLY_EMITS with a reason. `unclassified` must be 0.
//   §2 no registered vmu hook is a paper capability: every one has an emit site.
//   §3 `declareTopic` is SYMMETRIC: declaring a topic makes it module-subscribable, an undeclared or misspelt
//      name is still refused (both directions asserted), and an unregistered name inside a vmu namespace is
//      still a NAMED refusal.
//
//   node scripts/audit-hook-emit-classification.mjs
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

const { VU_HOOKS, DSH_HOOKS, LOG_ONLY_EMITS, createBus, declaredTopics } = await import(pathToFileURL(join(VMU, 'kernel', 'bus.js')).href)
const { isRegisteredHook } = await import(pathToFileURL(join(VMU, 'kernel', 'loader.js')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const walk = (d, out = []) => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.js')) out.push(p)
  }
  return out
}

console.log('=== 1. EVERY EMITTED NAME IS CLASSIFIED (registered OR explicitly log-only) ===')
const emitted = new Map() // name -> Set(relative files)
for (const f of walk(VMU)) {
  const t = readFileSync(f, 'utf8')
  for (const m of t.matchAll(/emit\(\s*['`]([a-zA-Z0-9/_-]+)['`]/g)) {
    if (!emitted.has(m[1])) emitted.set(m[1], new Set())
    emitted.get(m[1]).add(f.slice(VMU.length + 1))
  }
}
const registered = new Set([...VU_HOOKS, ...DSH_HOOKS, 'host/waterfall'])
const logOnly = new Set(Object.keys(LOG_ONLY_EMITS))
const unclassified = [...emitted.keys()].filter((n) => !registered.has(n) && !logOnly.has(n))
ok(unclassified.length === 0,
  'no emitted name is left unclassified (the silent state: neither a registered hook nor a declared log-only row)',
  { emitted: emitted.size, registered: registered.size, logOnly: logOnly.size, unclassified })
// a log-only entry is only a classification if it carries a usable reason
const thinReasons = Object.entries(LOG_ONLY_EMITS).filter(([, r]) => typeof r !== 'string' || r.length < 20).map(([n]) => n)
ok(thinReasons.length === 0, 'every log-only entry states a usable reason (a bare name would be unclassified in disguise)', { thinReasons })

console.log('=== 2. NO REGISTERED vmu HOOK IS A PAPER CAPABILITY ===')
const never = VU_HOOKS.filter((n) => !emitted.has(n))
ok(never.length === 0, 'every registered vmu hook has a real emit site', { registeredVmu: VU_HOOKS.length, never })

console.log('=== 3. declareTopic IS SYMMETRIC (subscribable when declared, refused otherwise) ===')
const bus = createBus({})
const topic = 'lab/classification-gate-topic'
ok(!isRegisteredHook(topic), 'an UNDECLARED topic is not subscribable', { topic })
ok(!isRegisteredHook('lab/classification-gate-typo'), 'a misspelt name is not subscribable')
bus.declareTopic(topic)
ok(isRegisteredHook(topic), 'a DECLARED topic IS subscribable by a module (the Round 4 unification)', { declared: declaredTopics() })
let refused = null
try { await bus.emit('prompt/assemble', {}) } catch (e) { refused = e && e.code }
ok(refused === 'VMU_INVALID_ARGUMENT', 'an unregistered name inside a vmu namespace is still a NAMED refusal', { refused })

console.log('=== HOOK EMIT CLASSIFICATION: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
