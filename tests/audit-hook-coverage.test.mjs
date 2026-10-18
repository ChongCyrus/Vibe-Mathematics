// tests/audit-hook-coverage.test.mjs - a frozen hook must have an emit site, and a vmu-namespace emit must be frozen.
//
// WHY THIS EXISTS. docs/05 section 5.2 reported two hooks whose names were frozen while nothing emitted them; a scan found
// FOUR, plus a live bug the volume did not know about: kernel/budget.js emitted `budget/warn`, which is inside VMU's own
// namespace but was not frozen, so the bus refused it and the un-awaited call threw on the ordinary budget-warning path.
// Both directions of the same defect are now checked, and the second direction is the one that keeps it from returning.
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const walk = (d) => readdirSync(join(REPO, d), { withFileTypes: true }).flatMap((e) => {
  const r = join(d, e.name)
  if (e.isDirectory()) return /(^|\/)(\.git|node_modules)$/.test(r) ? [] : walk(r)
  return [r]
})
const bus = readFileSync(join(VMU, 'kernel', 'bus.js'), 'utf8')   // still the source of the NAMESPACE rule below
// D-12: the hook NAMES come from the runtime EXPORT, never from a source-text pattern. `bus.js` DERIVES VU_HOOKS
// from HOOK_REGISTRY now, so a regex would be coupled to the derivation's shape instead of to its value.
const { VU_HOOKS, HOOK_REGISTRY } = await import('../vibe-math-vmu/kernel/bus.js')
const { BRIDGED_HOOKS } = await import('../vibe-math-vmu/host-hooks.js')
const frozen = [...VU_HOOKS]
const vn = /const VU_NAMESPACE = (\/\^?[^\n]+)/.exec(bus)
const sources = walk('vibe-math-vmu').filter((f) => /\.js$/.test(f)).map((f) => ({ f: f.replace(/\\/g, '/'), t: readFileSync(join(REPO, f), 'utf8') }))
const hostHooksSrc = readFileSync(join(VMU, 'host-hooks.js'), 'utf8')

/**
 * PHASE 6 gate: `blockable` is a PROMISE, not a runtime rule (the bus never enforces it). A promise is kept only
 * if the producer's consumer reads the receipt and changes behaviour. This scan therefore requires, for every
 * `blockable:true` hook, that at least one literal emit site exists AND that within the next WINDOW lines the
 * source reads the receipt (`ok === false` / `.refused` / `refus...`). It is deliberately a TEXT scan: it cannot
 * know whether the read is correct, but it CAN catch the class where nobody reads at all (the ballot.close bug).
 */
const RECEIPT_READ = /ok\s*===\s*false|\.refused|refus/i
const WINDOW = 12
const emitSites = (hook) => {
  const hits = []
  const esc = hook.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // A hook reaches the bus either directly (`emit('<name>'`) or through a local pass-through helper
  // (`emitHook('<name>'`, whose CALLER is the consumer that must read the receipt). Both shapes are located;
  // a hook passes when at least ONE located site reads the receipt, and fails when NO site does.
  const re = new RegExp("(?:emit|emitHook)\\(\\s*['`]" + esc + "['`]")
  for (const s of sources) {
    const lines = s.t.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue
      hits.push({ file: s.f, line: i + 1, window: lines.slice(i, i + WINDOW).join('\n') })
    }
  }
  return hits
}

console.log('=== 4. SELF-PROOF: the receipt-read scan can SEE a missing read (a gate that cannot fail is not a gate) ===')
ok(RECEIPT_READ.test("if (d && d.ok === false) return refused") === true,
  'the scan recognises a real receipt read (`ok === false`/`refused`)')
ok(RECEIPT_READ.test("const d = await bus.emit('x', {})\nreturn { ok: true }") === false,
  '★ and a synthetic "emit without reading" sample is judged RED (the class this gate exists for)')
ok(emitSites('this-hook-does-not-exist-anywhere').length === 0,
  '★ a hook with no emit site yields ZERO sites (so "not found" can be made a failure, not a silent pass)')

console.log('=== 5. EVERY blockable:true HOOK READS ITS RECEIPT AT THE EMIT SITE ===')
const blockable = HOOK_REGISTRY.filter((h) => h.blockable === true)
ok(blockable.length >= 10, 'the registry still declares a meaningful set of blockable hooks', blockable.length)
const missingSite = []
const unreadSite = []
for (const h of blockable) {
  if (h.kind === 'host') {
    // Host hooks are emitted dynamically by the bridge (one listener for all bridged names). The receipt must be
    // read THERE, and the name must be one the bridge actually attaches - otherwise "blockable" is a paper claim.
    if (!BRIDGED_HOOKS.includes(h.name)) { missingSite.push(h.name + ' (not bridged)'); continue }
    if (!/decided\.ok === false|decided\.refused|decided\.decision/.test(hostHooksSrc)) unreadSite.push(h.name + ' (bridge does not read)')
    continue
  }
  const sites = emitSites(h.name)
  if (sites.length === 0) { missingSite.push(h.name); continue }
  // Passing rule: at least ONE site reads the receipt. A pass-through helper (`emitHook`) legitimately does not
  // read it; its caller does. The old ballot.close bug had exactly one site and it read nothing -> RED.
  if (!sites.some((s) => RECEIPT_READ.test(s.window))) {
    unreadSite.push(h.name + ' @ ' + sites.map((s) => s.file + ':' + s.line).join(', '))
  }
}
ok(missingSite.length === 0,
  '★ every blockable hook HAS a located emit site (a hook we cannot find is a failure, not a pass)', missingSite)
ok(unreadSite.length === 0,
  '★ every blockable hook’s emit site reads the receipt within ' + WINDOW + ' lines (this is the class ballot.close was in)',
  unreadSite)


console.log('=== HOOK COVERAGE: ' + passed + ' passed, ' + failed + ' failed ===')

console.log('=== 1. THE FROZEN SET AND THE NAMESPACE RULE ARE READABLE ===')
ok(frozen.length >= 20, 'the kernel publishes its frozen hook names', { frozen: frozen.length })
ok(!!vn, 'and the namespace rule that decides which emits the bus validates', { rule: vn && vn[1].slice(0, 60) })

console.log('=== 2. EVERY FROZEN HOOK IS EMITTED SOMEWHERE ===')
const neverEmitted = frozen.filter((h) => !sources.some((s) => new RegExp("emit\\(\\s*['\`]" + h).test(s.t)))
ok(neverEmitted.length === 0,
  'no frozen hook is a paper capability: each one is emitted by some module, so middleware can actually attach to it',
  { neverEmitted })

console.log('=== 3. EVERY EMIT INSIDE A VMU NAMESPACE IS FROZEN ===')
// the bus refuses these at runtime, so an unfrozen one is a thrown error on a live path, not a style question
const regex = vn ? new RegExp(vn[1].replace(/^\/\^?/, '').replace(/\/$/, '')) : null
const unfrozen = new Set()
for (const s of sources) {
  for (const m of s.t.matchAll(/emit\(\s*['\`]([^'\`]+)['\`]/g)) {
    const h = m[1]
    if (frozen.includes(h)) continue
    if (regex && !regex.test(h)) continue // a foreign namespace belongs to the substrate and is passed through
    unfrozen.add(h + '  (' + s.f + ')')
  }
}
ok(unfrozen.size === 0,
  'and nothing emits an unfrozen name in VMU s own namespace, which the bus refuses - this is how budget/warn threw on every budget warning',
  { unfrozen: [...unfrozen] })

console.log('=== HOOK COVERAGE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
