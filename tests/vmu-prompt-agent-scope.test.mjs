// tests/vmu-prompt-agent-scope.test.mjs — ROUND 84, the FIFTH binding dimension: WHICH HOST AGENT an assembly is for.
//
// WHY THIS TEST EXISTS. The four existing dimensions describe the INSTITUTE (role, phase, member, task). None of them can
// say "only for THIS host agent", because `member` is an in-institute identity rather than the host's own agent identity.
// That capability is the one worth absorbing from the official agent-teams' per-scope registration, and it is absorbed the
// way this framework absorbs things: the KERNEL knows how to MATCH the dimension, while WHICH agent an assembly is for is
// ASSEMBLY - the host passes `ctx.agent`, or a deployment with no host hook declares `vmu.prompts.agentId`. Nothing here
// references those packages; the idea is taken and the dependency is not.
//
// THE ASSERTION THAT MATTERS MOST IS THE NEGATIVE ONE. An `agent`-scoped section must NOT render when no agent is known.
// Reading "nobody said which agent" as "every agent" would inject a section into assemblies it was never meant for -
// the silent-success shape this framework refuses everywhere else.
import { createPromptPipeline } from '../vibe-math-vmu/kernel/prompt/index.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const KEBAB = /^[a-z][a-z0-9-]*$/
const build = (sections = [], settings = {}) => {
  const p = createPromptPipeline({ sections, settings: { get: (k) => settings[k] }, clock: () => '2026-01-01T00:00:00Z' })
  return p
}
const section = (name, order, extra = {}) => Object.assign({ name, order, text: name.toUpperCase() + '-BODY' }, extra)

console.log('=== 1. AN `agent`-SCOPED SECTION MATCHES ONLY THE AGENT IT NAMES ===')
{
  const p = build([
    section('always-here', 100, { text: 'BASE' }),
    section('for-agent-x', 700, { scope: { agent: 'x' } }),
  ])
  const forX = await p.assemble({ agent: 'x', member: 'm1', role: 'member', phase: 'founding' })
  const forY = await p.assemble({ agent: 'y', member: 'm1', role: 'member', phase: 'founding' })
  ok(/FOR-AGENT-X-BODY/.test(forX.text), 'the section renders for the agent it names', { chars: forX.text.length })
  ok(!/FOR-AGENT-X-BODY/.test(forY.text), 'and does NOT render for a different agent', { tail: forY.text.slice(-80) })
  ok(/BASE/.test(forY.text), 'while an unscoped section renders for both, so the pipeline is not simply empty')
}

console.log('=== 2. ★ THE NEGATIVE THAT MATTERS: NO AGENT KNOWN ⇒ NO MATCH (not "match everyone") ===')
{
  const p = build([section('always-here', 100, { text: 'BASE' }), section('for-agent-x', 700, { scope: { agent: 'x' } })])
  const unknown = await p.assemble({ member: 'm1', role: 'member', phase: 'founding' })
  ok(!/FOR-AGENT-X-BODY/.test(unknown.text),
    'with no agent declared anywhere, an agent-scoped section is ABSENT - it must not default to everyone',
    { tail: unknown.text.slice(-80) })
  ok(/BASE/.test(unknown.text), 'and the assembly still happens, so absence is a decision rather than a failure')
}

console.log('=== 3. THREE SOURCES, IN ORDER: the host context, a per-assembly settings view, the declaration ===')
{
  const declared = build([section('for-agent-x', 700, { scope: { agent: 'x' } })], { 'vmu.prompts.agentId': 'x' })
  const viaDeclaration = await declared.assemble({ member: 'm1', role: 'member', phase: 'founding' })
  ok(/FOR-AGENT-X-BODY/.test(viaDeclaration.text), 'the DECLARED setting is the fallback when no host identity is given')

  const perAssembly = build([section('for-agent-x', 700, { scope: { agent: 'x' } })])
  const viaCtxSettings = await perAssembly.assemble({ settings: { 'vmu.prompts.agentId': 'x' }, member: 'm1', role: 'member', phase: 'founding' })
  ok(/FOR-AGENT-X-BODY/.test(viaCtxSettings.text), 'a PER-ASSEMBLY settings view is honoured too, so one pipeline can serve several agents')

  const both = build([section('for-agent-x', 700, { scope: { agent: 'x' } })], { 'vmu.prompts.agentId': 'y' })
  const hostWins = await both.assemble({ agent: 'x', member: 'm1', role: 'member', phase: 'founding' })
  ok(/FOR-AGENT-X-BODY/.test(hostWins.text),
    'and the HOST identity WINS over the declaration, because the host knows which agent is running and a setting cannot')
}

console.log('=== 4. THE EXISTING FOUR DIMENSIONS STILL BEHAVE THE SAME ===')
{
  const p = build([section('for-member', 700, { scope: { member: 'm1' } }), section('for-role', 701, { scope: { role: 'chair' } })])
  const a = await p.assemble({ member: 'm1', role: 'member', phase: 'founding' })
  const b = await p.assemble({ member: 'm2', role: 'chair', phase: 'founding' })
  ok(/FOR-MEMBER-BODY/.test(a.text) && !/FOR-ROLE-BODY/.test(a.text), 'a member-scoped section matches the member it names and not the other role')
  ok(/FOR-ROLE-BODY/.test(b.text) && !/FOR-MEMBER-BODY/.test(b.text), 'and a role-scoped section matches the role it names')
}

console.log('=== 5. "EXACTLY ONE DIMENSION" STILL HOLDS, AND NOW NAMES THE FIFTH ===')
{
  const p = build([section('s-one', 700), section('s-two', 701)])
  let twoDims = null
  try { p.bind({ section: 's-one', agent: 'x', role: 'member', text: 'body' }) } catch (e) { twoDims = e }
  ok(twoDims !== null && twoDims.code === 'VMU_INVALID_ARGUMENT' && /exactly one dimension/.test(String(twoDims.message)),
    'naming agent AND role is refused by name, exactly as two of the original four would be', { code: twoDims && twoDims.code })
  ok(twoDims !== null && /agent/.test(String(twoDims.hint || '')),
    'and the hint LISTS the fifth dimension, so a caller learns the whole set from the refusal', { hint: twoDims && twoDims.hint })
  let empty = null
  try { p.bind({ section: 's-one', text: 'body' }) } catch (e) { empty = e }
  ok(empty !== null && empty.code === 'VMU_INVALID_ARGUMENT', 'and naming NO dimension is still refused', { code: empty && empty.code })
  const bound = p.bind({ section: 's-two', agent: 'x', text: 'AGENT-BOUND-BODY' })
  ok(bound && bound.dim === 'agent', 'an agent-only binding is accepted and reports its dimension', { bound })
}

console.log('=== 6. THE DISPLACEMENT RECORD IS ON THE STATUS SURFACE (C-3), not only on the assembly receipt ===')
{
  const p = build([section('always-here', 100, { text: 'BASE' })])
  const st = p.status()
  ok(Array.isArray(st.replacedSections) && typeof st.replacedCount === 'number',
    'pipeline.status() reports what a declared replacement displaced, without needing an assembly first',
    { has: Object.prototype.hasOwnProperty.call(st, 'replacedSections'), count: st.replacedCount })
  const asm = await p.assemble({ member: 'm1', role: 'member', phase: 'founding' })
  ok(Array.isArray(asm.replacedSections) && typeof asm.replacedCount === 'number',
    'and the assembly receipt still carries it, so both surfaces agree')
}

console.log('=== AGENT SCOPE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
