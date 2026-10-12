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
  // ROUND 374: a binding means "this section says something different for this role / phase / member / task", so at
  // most ONE wins and it REPLACES the section text. The old assertion pinned the append order, which is the bug an
  // independent pack audit measured (three identities and three quorums inside one charter), so it now asserts the
  // new truth: the most specific dimension wins and the others contribute nothing.
  ok(dt > -1 && at === -1 && bp === -1 && cm === -1, 'only the MOST SPECIFIC binding wins: task beats member beats phase beats role, and the losers contribute nothing', at + ',' + bp + ',' + cm + ',' + dt)
  const b = await p.assemble({ member: 'r-2', role: 'solver', phase: 'formalize' })
  ok(b.text.indexOf('TASK') === -1 && b.text.indexOf('ROLE') === -1, 'bindings that do not match contribute nothing')
  // A tie on the SAME dimension is refused by name rather than silently picked, because a silent pick is the same
  // class of bug the append was (docs/03 section 8: VMU_PROMPT_BINDING_CONFLICT).
  {

    const p2 = m.createPromptPipeline({ sections: [{ name: 'tie-sec', order: 10, range: 'pack', text: 'BASE' }], bindings: [
      { section: 'tie-sec', role: 'solver', text: 'ONE' },
      { section: 'tie-sec', role: 'solver', text: 'TWO' },
    ], clock: () => '2026-01-01T00:00:00.000Z' })
    let refused = null
    try { await p2.assemble({ member: 'r-1', role: 'solver', phase: 'explore' }) } catch (e) { refused = e }
    ok(refused !== null && refused.code === 'VMU_PROMPT_BINDING_CONFLICT',
      'and a TIE on one dimension is refused by name rather than silently picked', refused && refused.code)
  }
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

// ---- 10. the assembly hook uses the FROZEN name, and dry run does not disable it (task-40 finding) ----
{
  const seen = []
  const capturing = {
    emit: async (hook, payload, opts) => {
      seen.push({ hook, payload, opts })
      return { ok: true, decisions: [{ id: 'mw-1', decision: { appendPrompt: [{ section: 'dry', text: 'DRY-APPEND' }] } }] }
    },
  }
  const p = m.createPromptPipeline({ sections: baseSections, bus: capturing })
  const a = await p.assemble({ member: 'r-1', phase: 'explore', settings: {} })
  ok(seen.length === 1 && seen[0].hook === 'prompt/section-assembled',
    'assembly emits the FROZEN hook name (the drifted `prompt/assemble` reached no listener at all)',
    JSON.stringify(seen.map((s) => s.hook)))
  ok(/DRY-APPEND/.test(a.text), 'and a middleware append lands when not dry-running')

  const b = await p.assemble({ member: 'r-1', phase: 'explore', settings: { 'vmu.middleware.dryRun': false } })
  ok(/DRY-APPEND/.test(b.text),
    'setting the dry-run key to FALSE keeps the hook (it used to disable middleware control of the prompt)')

  const c = await p.assemble({ member: 'r-1', phase: 'explore', settings: { 'vmu.middleware.dryRun': true } })
  ok(!/DRY-APPEND/.test(c.text) && seen.length === 3,
    'dry run CALLS the hook and does not apply its effects (the documented meaning)', 'calls=' + seen.length)
}

// ---- 11. self-probe ----------------------------------------------------------------------------
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


// ── ROUND 241: the language unit of the prompt pipeline ──────────────────────────────────────────────────────
{
  const m = await import(pathToFileURL(MODULE).href)
  const mkPipe = (settings, extra = {}) => m.createPromptPipeline(Object.assign({
    // NOTE: no `scope` - it is an object of dimensions, and `task` is a BINDING dimension, not a scope. A malformed scope
    // matches nothing, which is how this assertion first failed.
    sections: [{ name: 'greeting', order: 100, text: 'hello' },
               { name: 'french', order: 101, lang: 'fr', text: 'bonjour' }],
    settings,
  }, extra))

  // locale.default fills in when the session asks for nothing
  const withDefault = await mkPipe({ 'vmu.prompts.locale.default': 'fr' }).assemble({})
  ok(withDefault.ok === true && withDefault.locale.tried[0] === 'fr',
    'locale.default: the declared default LEADS the tried order when the session asks for nothing', JSON.stringify(withDefault.locale.tried.slice(0, 3)))
  const noDefault = await mkPipe({}).assemble({})
  ok(noDefault.locale.default === null && noDefault.locale.tried.length > 0,
    'locale.default[empty]: with nothing declared the chain alone decides, and the receipt says so')

  // locale.fallbackChain replaces the default chain
  const chained = await mkPipe({ 'vmu.prompts.locale.fallbackChain': ['de', 'en'] }).assemble({ lang: 'de-AT' })
  ok(chained.locale.chain.join(',') === 'de,en' && chained.locale.tried.join(',').startsWith('de-AT,de,en'),
    'locale.fallbackChain: a declared chain REPLACES the default and the tried order follows it', JSON.stringify(chained.locale.tried))

  // locale.onMissing decides what a language mismatch means - and it really branches
  const warning = await mkPipe({ 'vmu.prompts.locale.onMissing': 'warn' }).assemble({ lang: 'zh-Hans' })
  ok(warning.ok === true && warning.localeMisses.some((x) => x.section === 'french'),
    'locale.onMissing[warn]: the mismatch is RECORDED and assembly continues', JSON.stringify(warning.localeMisses))
  let refused = null
  try { await mkPipe({ 'vmu.prompts.locale.onMissing': 'refuse' }).assemble({ lang: 'zh-Hans' }) } catch (e) { refused = e && e.code }
  ok(refused === 'VMU_NO_SUCH_OBJECT',
    'locale.onMissing[refuse]: the same mismatch is refused by name - the declaration really branches', String(refused))
  const satisfied = await mkPipe({ 'vmu.prompts.locale.onMissing': 'refuse' }).assemble({ lang: 'fr' })
  ok(satisfied.ok === true, 'locale.onMissing[refuse]: a language that IS in the order does not trip the refusal')

  // overridesByLang wins for the resolved language, and the plain override still applies elsewhere
  const byLang = await mkPipe({ 'vmu.prompts.overridesByLang': { greeting: { fr: 'BONJOUR' } } },
    { overrides: { greeting: 'PLAIN' } }).assemble({ lang: 'fr' })
  ok(/BONJOUR/.test(byLang.text), 'overridesByLang[+]: the language-level override is used for the matching language', byLang.text.slice(0, 40))
  ok(byLang.locale.overrideSources.some((e) => e.section === 'greeting' && e.source === 'byLang:fr'),
    'overridesByLang[+]: the receipt says WHICH override source was used', JSON.stringify(byLang.locale.overrideSources))
  const otherLang = await mkPipe({ 'vmu.prompts.overridesByLang': { greeting: { fr: 'BONJOUR' } } },
    { overrides: { greeting: 'PLAIN' } }).assemble({ lang: 'en' })
  ok(/PLAIN/.test(otherLang.text), 'overridesByLang[+]: for another language the plain override still applies', otherLang.text.slice(0, 40))
}


// ── ROUND 242: declared sections and declared overrides (the verified half) ──────────────────────────────────
{
  const m = await import(pathToFileURL(MODULE).href)
  const mkP = (settings, extra = {}) => m.createPromptPipeline(Object.assign({ sections: [], settings }, extra))

  const declared = await mkP({ 'vmu.prompts.sections': [{ name: 'declared-one', order: 400, text: 'from the declaration' }] }).assemble({})
  ok(/from the declaration/.test(declared.text),
    'prompts.sections[+]: a section declared in settings reaches the assembled prompt', declared.text.slice(0, 50))
  const none = await mkP({}).assemble({})
  ok(!/from the declaration/.test(none.text), 'prompts.sections[empty]: with nothing declared the prompt is unchanged')

  const merged = await mkP({ 'vmu.prompts.overrides': { 'decl-over': 'FROM-DECLARATION' } },
    { sections: [{ name: 'decl-over', order: 403, text: 'own' }] }).assemble({})
  ok(/FROM-DECLARATION/.test(merged.text), 'prompts.overrides[+]: a declared override applies', merged.text.slice(0, 50))
  const callerWins = await mkP({ 'vmu.prompts.overrides': { 'decl-over': 'FROM-DECLARATION' } },
    { sections: [{ name: 'decl-over', order: 403, text: 'own' }], overrides: { 'decl-over': 'FROM-CALLER' } }).assemble({})
  ok(/FROM-CALLER/.test(callerWins.text) && callerWins.overrideMerge.declared === 1 && callerWins.overrideMerge.fromCaller === 1,
    'prompts.overrides[precedence]: the CALLER wins over the declaration, and the receipt reports the merge', JSON.stringify(callerWins.overrideMerge))
  // The kernel passes overrides: null EXPLICITLY; that must not throw.
  const nullish = await mkP({ 'vmu.prompts.overrides': { 'decl-over': 'X' } },
    { sections: [{ name: 'decl-over', order: 403, text: 'own' }], overrides: null }).assemble({})
  ok(nullish.ok === true && /X/.test(nullish.text), 'prompts.overrides[null]: an explicit null is normalised, not fatal', nullish.text.slice(0, 40))
}


// ── ROUND 243: one name, several languages (§21.1), and what a language mismatch means ───────────────────────
{
  const m = await import(pathToFileURL(MODULE).href)
  const pair = (extra = {}) => m.createPromptPipeline(Object.assign({
    settings: {},
    sections: [
      { name: 'pair', order: 401, lang: 'en', text: 'ENGLISH' },
      { name: 'pair', order: 402, lang: 'fr', text: 'FRANCAIS' },
    ],
  }, extra))

  const en = await pair().assemble({ lang: 'en' })
  const fr = await pair().assemble({ lang: 'fr' })
  ok(/ENGLISH/.test(en.text) && !/FRANCAIS/.test(en.text), 'prompts.sections[lang=en]: the matching language renders', en.text.slice(0, 30))
  ok(/FRANCAIS/.test(fr.text) && !/ENGLISH/.test(fr.text), 'prompts.sections[lang=fr]: the other declaration renders for its own language', fr.text.slice(0, 30))
  ok(en.text.split('\n').filter((x) => x.startsWith('#')).length === 1,
    'prompts.sections[coexist]: ONE name contributes ONE section - the second declaration no longer overwrites the first, and both do not appear at once')

  // the language-less entry is the language-agnostic fallback the volume describes
  const withFallback = m.createPromptPipeline({
    // A NARROW chain: the default ends in `en`, which would match the english entry and hide the fallback rule.
    settings: { 'vmu.prompts.locale.fallbackChain': ['de'] },
    sections: [
      { name: 'pair2', order: 403, lang: 'en', text: 'ENGLISH-ONLY' },
      { name: 'pair2', order: 404, text: 'AGNOSTIC' },
    ],
  })
  const fb = await withFallback.assemble({ lang: 'de' })
  ok(/AGNOSTIC/.test(fb.text) && !/ENGLISH-ONLY/.test(fb.text),
    'prompts.sections[fallback]: with no match in the resolved order the LANGUAGE-LESS entry renders', fb.text.slice(0, 30))

  // and with neither a match nor a fallback, the declaration decides
  const narrowChain = m.createPromptPipeline({
    settings: { 'vmu.prompts.locale.fallbackChain': ['de'] },
    sections: [
      { name: 'pair', order: 401, lang: 'en', text: 'ENGLISH' },
      { name: 'pair', order: 402, lang: 'fr', text: 'FRANCAIS' },
    ],
  })
  const warned = await narrowChain.assemble({ lang: 'de' })
  ok(warned.ok === true && warned.localeMisses.some((x) => x.section === 'pair'),
    'locale.onMissing[warn]: a name with entries in no resolved language is RECORDED and assembly continues', JSON.stringify(warned.localeMisses))
  // the default chain ends in 'en', so 'de' still finds english; removing the chain proves the refusal path
  const strict = m.createPromptPipeline({
    settings: { 'vmu.prompts.locale.fallbackChain': ['de'], 'vmu.prompts.locale.onMissing': 'refuse' },
    sections: [
      { name: 'pair3', order: 405, lang: 'en', text: 'E' },
      { name: 'pair3', order: 406, lang: 'fr', text: 'F' },
    ],
  })
  let refused = null
  try { await strict.assemble({ lang: 'de' }) } catch (e) { refused = e && e.code }
  ok(refused === 'VMU_NO_SUCH_OBJECT',
    'locale.onMissing[refuse]: with entries but no match in the resolved order the assembly is refused BY NAME', String(refused))
  const lenient = m.createPromptPipeline({
    settings: { 'vmu.prompts.locale.fallbackChain': ['de'], 'vmu.prompts.locale.onMissing': 'warn' },
    sections: [
      { name: 'pair3', order: 405, lang: 'en', text: 'E' },
      { name: 'pair3', order: 406, lang: 'fr', text: 'F' },
    ],
  })
  const lenientOut = await lenient.assemble({ lang: 'de' })
  ok(lenientOut.ok === true && lenientOut.localeMisses.some((x) => x.section === 'pair3'),
    'locale.onMissing[warn]: the same case is recorded instead, and the prompt is still produced', JSON.stringify(lenientOut.localeMisses))
}


// ── ROUND 244: the glossary family (§21.4), every branch of it ───────────────────────────────────────────────
{
  const m = await import(pathToFileURL(MODULE).href)
  const readerOf = (ids) => async () => JSON.stringify({ apiVersion: 1, terms: Object.fromEntries(ids.map((i) => [i, {}])) })
  const mkG = (settings, extra = {}) => m.createPromptPipeline(Object.assign({
    sections: [{ name: 'cites', order: 404, text: 'x', terms: ['known', 'unknown-term'] }],
    settings,
  }, extra))

  // the ontology is READ through the pipeline own reader, and loaded once
  let calls = 0
  const counted = async () => { calls += 1; return JSON.stringify({ terms: { known: {} } }) }
  const warnOut = await mkG({ 'vmu.prompts.glossary.mode': 'warn' }, { readFile: counted }).assemble({})
  ok(calls === 1, 'prompts.glossary.ontology: the ontology is read exactly once for an assembly', String(calls))
  ok(warnOut.ok === true && warnOut.glossary.loaded === true && warnOut.glossary.traces.some((t) => t.what === 'term-unknown'),
    'prompts.glossary.mode[warn]: an unknown term is TRACED and assembly continues', JSON.stringify(warnOut.glossary.traces))

  const good = await mkG({ 'vmu.prompts.glossary.mode': 'warn' }, { readFile: readerOf(['known', 'unknown-term']) }).assemble({})
  ok(good.ok === true && good.glossary.traces.length === 0, 'prompts.glossary[+]: a section citing only known terms is clean')

  const strict = await mkG({ 'vmu.prompts.glossary.mode': 'enforce' }, { readFile: readerOf(['known']) }).assemble({})
  ok(strict.ok === false && strict.refused && strict.refused.code === 'VMU_INVALID_ARGUMENT',
    'prompts.glossary.mode[enforce]: the same citation REFUSES the assembly by name', JSON.stringify(strict.refused))

  const off = await mkG({ 'vmu.prompts.glossary.mode': 'off' }, { readFile: readerOf([]) }).assemble({})
  ok(off.ok === true && off.glossary.loaded === false && off.glossary.traces.length === 0,
    'prompts.glossary.mode[off]: nothing is read and nothing is traced - the declaration really switches it off')

  // §21.4: an ontology that cannot be READ is not "no terms"
  const unreadable = async () => { throw new Error('ENOENT') }
  const badEnforce = await mkG({ 'vmu.prompts.glossary.mode': 'enforce' }, { readFile: unreadable }).assemble({})
  ok(badEnforce.ok === false && badEnforce.refused.code === 'VMU_NO_SUCH_OBJECT' &&
     badEnforce.glossary.traces.some((t) => t.what === 'ontology-unreadable'),
    'prompts.glossary.ontology[-]: an unreadable ontology REFUSES under enforce - it is NEVER mistaken for "no terms"',
    JSON.stringify(badEnforce.glossary.traces))
  const badWarn = await mkG({ 'vmu.prompts.glossary.mode': 'warn' }, { readFile: unreadable }).assemble({})
  ok(badWarn.ok === true && badWarn.glossary.traces.some((t) => t.what === 'ontology-unreadable'),
    'prompts.glossary.ontology[-]: under warn the same condition is traced and assembly continues', JSON.stringify(badWarn.glossary.traces))

  // a pipeline with NO reader is a CAPABILITY GAP, not a broken declaration
  const noReader = await mkG({ 'vmu.prompts.glossary.mode': 'enforce' }).assemble({})
  ok(noReader.ok === true && noReader.glossary.traces.some((t) => t.what === 'ontology-unchecked'),
    'prompts.glossary[no reader]: a capability gap is traced and NOT fatal, even under enforce', JSON.stringify(noReader.glossary.traces))

  // a declared ontology path is honoured
  const elsewhere = await mkG({ 'vmu.prompts.glossary.mode': 'warn', 'vmu.prompts.glossary.ontology': 'Ops/terms.json' },
    { readFile: readerOf(['known']) }).assemble({})
  ok(elsewhere.glossary.path === 'Ops/terms.json', 'prompts.glossary.ontology[+]: the declared path is the one read', elsewhere.glossary.path)
}

console.log('=== VMU PROMPT: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
