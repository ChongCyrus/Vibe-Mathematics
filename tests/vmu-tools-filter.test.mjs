// tests/vmu-tools-filter.test.mjs - the consumer the round-142 filter never had, and the four behaviours that matter.
// Written as a capability scenario rather than a unit test: a host adapter is installed against a recording ctx and the
// registered names are READ, because "which tools does the agent actually get" is the question the setting answers.
import { createHostAdapter, TOOL_NAMES } from '../vibe-math-vmu/host.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const withAdapter = async (settings) => {
  const reg = []
  const ctx = { tools: { register: async (s) => { reg.push(s.name); return () => {} } }, effect: null }
  const adapter = createHostAdapter({ ctx, kernel: {}, settings, instance: 'probe' })
  await adapter.install()
  return { reg, st: adapter.status() }
}

console.log('=== 1. ABSENT MEANS NO RESTRICTION, AND AN EXPLICIT EMPTY LIST MEANS NOTHING ===')
const absent = await withAdapter({})
const empty = await withAdapter({ 'vmu.tools.enabled': [] })
ok(absent.reg.length > 0, 'with the key absent the published surface registers as before', { registered: absent.reg.length })
ok(empty.reg.length === 0, 'and an explicit empty list registers NOTHING - the two are deliberately different states', { registered: empty.reg.length })
ok(absent.reg.length !== empty.reg.length, 'so the setting discriminates rather than always letting everything through')

console.log('=== 2. A LIST NARROWS TO EXACTLY WHAT IT NAMES ===')
const one = await withAdapter({ 'vmu.tools.enabled': [TOOL_NAMES.status] })
ok(one.reg.length === 1 && one.reg[0] === TOOL_NAMES.status, 'naming one tool registers exactly that tool', { reg: one.reg })
const two = await withAdapter({ 'vmu.tools.enabled': [TOOL_NAMES.status, TOOL_NAMES.set] })
ok(two.reg.every((n) => [TOOL_NAMES.status, TOOL_NAMES.set].includes(n)) && two.reg.length <= 2,
  'naming two registers a SUBSET of them and never more than named - which is the property that matters, since a tool becomes available only once its kernel surface is', { reg: two.reg })

console.log('=== 3. AN UNUSABLE FILTER IS FAIL-CLOSED AND SAYS SO ===')
const bad = await withAdapter({ 'vmu.tools.enabled': ['vibe_vmu_not_a_tool'] })
ok(bad.reg.length === 0, 'an unknown name registers NOTHING rather than silently widening back to the full surface', { reg: bad.reg })
ok((bad.st.failures || []).length > 0, 'and the refusal is recorded in the adapter status, so it is never swallowed', { failures: (bad.st.failures || []).length })

console.log('=== 4. THE SETTING IS DECLARED WHERE THE SCHEMA LIVES ===')
const { SETTING_DEFS } = await import('../vibe-math-vmu/settings/schema.js')
const def = SETTING_DEFS.find((d) => d.key === 'vmu.tools.enabled')
ok(!!def, 'vmu.tools.enabled is a declared setting rather than an undocumented convention')
ok(def && def.def === null, 'and its default is null, which is what makes ABSENT and EMPTY different states')

console.log('=== TOOLS FILTER: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
