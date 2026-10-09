// vmu prompt pipeline — the capability scenario for kernel/prompt/index.js (docs/06).
//
// What must hold (docs/06 §8):
//   · sections are registered with a kebab-case name inside a reserved order range, and two pack sections
//     may not silently claim the same name;
//   · the `state` section is IMMUTABLE: overriding it is refused by name, and neither a binding nor a
//     middleware append can rewrite read-only facts;
//   · assembly is deterministic (same inputs, same bytes) so a snapshot can be compared verbatim;
//   · bindings are four-dimensional with a fixed priority `role < phase < member < task`;
//   · template variables come from a whitelist, unknown ones are refused, and a VALUE containing template
//     syntax is escaped so it cannot inject a placeholder;
//   · truncation is never silent: the notice is in the text and the numbers are in status();
//   · the host binding is an injected adapter, and a missing or partial adapter is refused by name;
//   · middleware appends arrive through the bus with provenance, and still cannot touch `state`.
//
// `--self-probe` copies the module, REMOVES the immutability guard, and requires the corresponding
// assertion to fail: the same technique tests/run-tests.mutants.mjs uses on the runner itself.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const MODULE = resolve(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')
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

// A tiny fake bus shaped like kernel/bus.js's emit() result, so the integration is tested without it.
const fakeBus = (decision) => ({ emit: async () => ({ ok: true, decisions: [{ id: 'mw-1', decision }], traceId: 't1' }) })

const baseSections = [
  { name: 'state', order: 0, text: 'phase=explore\nmembers=r-1', source: 'framework' },
  { name: 'charter', order: 210, text: '章程：{{phase}} 阶段由 {{member}} 负责', source: 'kernel', mutable: true },
  { name: 'hooks-contract', order: 410, text: '中间件契约：必须 return', source: 'kernel' },
  { name: 'pack-extra', order: 610, text: 'pack 段', source: 'pack' },
]

// ---- 1. registration rules ---------------------------------------------------------------------
{
  const p = m.createPromptPipeline({ sections: baseSections })
  ok(p.status().sections.length === 4, 'four sections registered')
  expectThrow(() => p.register({ name: 'Bad_Name', order: 610 }), 'VMU_INVALID_ARGUMENT', 'non-kebab section name refused')
  expectThrow(() => p.register({ name: 'way-out', order: 99999 }), 'VMU_INVALID_ARGUMENT', 'order outside every reserved range refused')
  expectThrow(() => p.register({ name: 'state', order: 0, text: 'x' }), 'VMU_NOT_PERMITTED', 're-registering the state block refused')
  expectThrow(() => { p.register({ name: 'immutable-one', order: 300, mutable: false }); p.register({ name: 'immutable-one', order: 301 }) },
    'VMU_NOT_PERMITTED', 'an immutable section cannot be replaced by re-registration')
  expectThrow(() => p.register({ name: 'dup-pack', order: 620, source: 'pack' }) &&
    p.register({ name: 'dup-pack', order: 621, source: 'pack' }), 'VMU_MIDDLEWARE_FAILED',
    'two pack sections with one name are a conflict, not a silent override')
  ok(p.status().sections.every((s) => s.range), 'every section lands in a named range')
}

// ---- 2. immutability of the facts block --------------------------------------------------------
{
  const p = m.createPromptPipeline({ sections: baseSections, bindings: [
    { section: 'state', text: 'INJECTED', role: 'reviewer' },
  ] })
  expectThrow(() => p.override('state', 'REWRITTEN'), 'VMU_NOT_PERMITTED', 'overriding state is refused by name')
  const a = await p.assemble({ member: 'r-1', role: 'reviewer', phase: 'explore' })
  ok(/phase=explore\nmembers=r-1/.test(a.text), 'the state facts survive verbatim')
  ok(!/INJECTED/.test(a.text), 'a binding aimed at state contributes nothing')
  ok(a.sources.find((s) => s.section === 'state').source === 'framework', 'the state source stays framework-owned')
}

// ---- 3. overrides, authority and rollback ------------------------------------------------------
{
  const p = m.createPromptPipeline({ sections: baseSections, whoMayOverride: ['office'] })
  expectThrow(() => p.override('charter', 'hijack', 'm-9'), 'VMU_NOT_PERMITTED', 'an unauthorised override is refused')
  const r = p.override('charter', '章程：由 office 覆写 {{member}}', 'office')
  ok(r.ok === true && r.rollbackable === true, 'an authorised override is accepted and reports rollbackability')
  const a1 = await p.assemble({ member: 'r-1', phase: 'explore' })
  ok(/office 覆写 r-1/.test(a1.text), 'the override is in effect and still renders variables')
  ok(a1.sources.find((s) => s.section === 'charter').overridden === true, 'the override is reported in provenance')
  p.rollback('charter')
  const a2 = await p.assemble({ member: 'r-1', phase: 'explore' })
  ok(/章程：explore 阶段由 r-1 负责/.test(a2.text), 'rollback restores the previous reference')
}

// ---- 4. four-dimensional bindings with a fixed priority ----------------------------------------
{
  const p = m.createPromptPipeline({ sections: baseSections.concat([{ name: 'task-brief', order: 620, text: 'brief' }]), bindings: [
    { section: 'task-brief', text: 'TASK', task: ['t-1'] },
    { section: 'task-brief', text: 'MEMBER', member: ['r-1'] },
    { section: 'task-brief', text: 'PHASE', phase: ['explore'] },
    { section: 'task-brief', text: 'ROLE', role: ['reviewer'] },
  ] })
  const a = await p.assemble({ member: 'r-1', role: 'reviewer', phase: 'explore', task: 't-1' })
  const at = a.text.indexOf('ROLE')
  const bp = a.text.indexOf('PHASE')
  const cm = a.text.indexOf('MEMBER')
  const dt = a.text.indexOf('TASK')
  ok(at > -1 && bp > at && cm > bp && dt > cm, 'binding contributions follow role < phase < member < task', at + ',' + bp + ',' + cm + ',' + dt)
  const b = await p.assemble({ member: 'r-2', role: 'solver', phase: 'formalize' })
  ok(b.text.indexOf('TASK') === -1 && b.text.indexOf('ROLE') === -1, 'bindings that do not match contribute nothing')
}

// ---- 5. the variable whitelist and escaping ----------------------------------------------------
{
  const p = m.createPromptPipeline({ sections: [
    { name: 'card', order: 610, text: '成员={{member}} 阶段={{phase}} 键={{setting:vmu.limits.maxLiveMembers}} 计数={{count:toolCalls}}' },
  ], counts: { toolCalls: 7 } })
  const a = await p.assemble({ member: 'r-1', phase: 'review', settings: { 'vmu.limits.maxLiveMembers': 6 } })
  ok(/成员=r-1/.test(a.text) && /阶段=review/.test(a.text), 'whitelisted variables render')
  ok(/键=6/.test(a.text) && /计数=7/.test(a.text), 'setting: and count: variables render from their sources')
  const q = m.createPromptPipeline({ sections: [{ name: 'card', order: 610, text: 'bad {{nope}}' }] })
  let threw = null
  try { await q.assemble({}) } catch (e) { threw = e }
  ok(threw && threw.code === 'VMU_INVALID_ARGUMENT', 'an unregistered variable is refused by name', threw && threw.code)
  const esc = m.createPromptPipeline({ sections: [{ name: 'card', order: 610, text: 'v={{member}} end' }] })
  const a2 = await esc.assemble({ member: '{{phase}}' })
  ok(/v=\{ \{phase\} \} end/.test(a2.text), 'template syntax inside a VALUE is escaped (no injection)', a2.text.trim())
}

// ---- 6. truncation is never silent -------------------------------------------------------------
{
  const p = m.createPromptPipeline({ sections: [
    { name: 'long', order: 610, text: 'x'.repeat(50), truncate: { keepChars: 10, mode: 'keepChars' } },
  ] })
  const a = await p.assemble({})
  ok(/已省略更早 40 字符/.test(a.text), 'the truncation notice is IN the text')
  const st = p.status()
  ok(st.truncation.length === 1 && st.truncation[0].dropped === 40, 'the truncation numbers are in status()', JSON.stringify(st.truncation))
  const q = m.createPromptPipeline({ sections: [{ name: 'short', order: 610, text: 'tiny' }] })
  await q.assemble({})
  ok(q.status().truncation.length === 0, 'no truncation is recorded when nothing was truncated')
}

// ---- 7. determinism and snapshots --------------------------------------------------------------
{
  const mk = () => m.createPromptPipeline({ sections: baseSections })
  const p1 = mk(), p2 = mk()
  const a1 = await p1.assemble({ member: 'r-1', role: 'reviewer', phase: 'explore' })
  const a2 = await p2.assemble({ member: 'r-1', role: 'reviewer', phase: 'explore' })
  ok(a1.text === a2.text, 'two independent assemblies are byte-identical (determinism)')
  const snaps = await p1.snapshot([{ member: 'r-1', role: 'reviewer', phase: 'explore' }])
  ok(snaps.length === 1 && snaps[0].text === a1.text, 'snapshot() returns byte-exact text for the corpus gate')
  ok(a1.text.endsWith('\n') && !a1.text.endsWith('\n\n'), 'the trailing newline is normalised (comparable snapshots)')
}

// ---- 8. the host seam --------------------------------------------------------------------------
{
  const p = m.createPromptPipeline({ sections: baseSections })
  expectThrow(() => p.bindToHost(null), 'VMU_ENGINE_UNAVAILABLE', 'a missing host adapter is refused by name')
  expectThrow(() => p.bindToHost({ registerSection: () => {} }), 'VMU_ENGINE_UNAVAILABLE', 'a partial host adapter is refused by name')
  const registered = []
  let assembleHook = null
  const r = p.bindToHost({ registerSection: (s) => registered.push(s.name), onAssemble: (fn) => { assembleHook = fn } })
  ok(r.ok === true && registered.length === 4, 'a complete adapter receives every section')
  const text = await assembleHook({ member: 'r-1', phase: 'explore' })
  ok(typeof text === 'string' && /章程/.test(text), 'the adapter can drive assembly')
}

// ---- 9. middleware appends through the bus -----------------------------------------------------
{
  const p = m.createPromptPipeline({
    sections: baseSections,
    bus: fakeBus({ appendPrompt: [{ section: 'hooks-contract', text: '本轮只评已锁定结论。' }] }),
  })
  const a = await p.assemble({ member: 'r-1', phase: 'explore' })
  ok(/本轮只评已锁定结论/.test(a.text), 'a middleware appendPrompt lands in the prompt')
  ok(a.sources.some((s) => s.source === 'middleware:mw-1'), 'the append carries its provenance')
  ok(/phase=explore/.test(a.text), 'the facts block is still intact after an append')
}

// ---- 10. self-probe ----------------------------------------------------------------------------
if (SELF_PROBE) {
  const src = readFileSync(MODULE, 'utf8')
  const guard = "if (entry.mutable === false) {"
  if (!src.includes(guard)) {
    ok(false, 'self-probe anchor applies (the immutability guard is present)', 'ANCHOR MISS')
  } else {
    const dir = mkdtempSync(join(tmpdir(), 'vmu-prompt-mut-'))
    mkdirSync(join(dir, 'kernel', 'prompt'), { recursive: true })
    // Remove the guard: overriding an immutable section must then SUCCEED, i.e. the assertion that it is
    // refused must fail - which is what makes this self-probe meaningful rather than decorative.
    const mutated = src.replace("    override(section, text, by = 'office') {\n      const entry = registry.get(section)\n      if (!entry) throw refuse('VMU_NO_SUCH_OBJECT', 'unknown section: ' + section)\n      if (entry.mutable === false) {",
      "    override(section, text, by = 'office') {\n      const entry = registry.get(section)\n      if (!entry) throw refuse('VMU_NO_SUCH_OBJECT', 'unknown section: ' + section)\n      if (false) {")
    writeFileSync(join(dir, 'kernel', 'prompt', 'index.js'), mutated)
    const mm = await import(pathToFileURL(join(dir, 'kernel', 'prompt', 'index.js')).href + '?probe=1')
    const mp = mm.createPromptPipeline({ sections: baseSections })
    let refused = false
    try { mp.override('state', 'REWRITTEN') } catch { refused = true }
    ok(refused === false ? false : true, 'self-probe: guard removed => the immutability assertion fails (as required)', 'refused=' + refused)
    rmSync(dir, { recursive: true, force: true })
  }
  console.log('=== VMU PROMPT SELF-PROBE: ' + (failed > 0 ? 'guard can fail (as required)' : 'GUARD CANNOT FAIL') + ' ===')
  process.exit(failed > 0 ? 0 : 1)
}

console.log('=== VMU PROMPT: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
