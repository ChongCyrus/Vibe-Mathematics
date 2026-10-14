// tests/vmu-assistant-assembly.test.mjs — GOAL 6, HALF TWO: the assistant persona and the reporting duty REALLY reach an
// assembly (this file: the per-round/turn channel, from the pack's own declaration to the assembled prompt, through the
// REAL pack loader and the REAL preset entry), plus the invariants that keep that declaration honest.
//
// WHY THIS SUITE EXISTS. The failing shape this project keeps finding is "it is written in a document, therefore it is
// true". A persona that exists as prose in a pack file, an unused export or a comment is NOT an assembled prompt. So this
// suite reads the pack's declaration the way the loader and the plugin read it, feeds it to the REAL prompt pipeline, and
// requires the text to appear in the assembled bytes - including the case where the section is switched off, which must
// remove it WHOLE (docs/26 section 3.26: the off state is zero injection, not an empty heading).
//
// THE ROOT/system-prompt half - the office persona reaching the session that actually talks to the human - is asserted in
// tests/vmu-assistant-systemprompt.test.mjs, against the same real entry.
//
// Run: node tests/vmu-assistant-assembly.test.mjs
import { readFileSync, existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { createPromptPipeline, VARIABLE_WHITELIST, ORDER_RANGES } from '../vibe-math-vmu/kernel/prompt/index.js'
import { PACK, v5rRoleSection } from '../vibe-math-vmu/packs/v5r/prompts/v5r-core.js'
import { CHARTER_SECTIONS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-charter.js'
import { V5R_ASSISTANT_TURN_SECTION, V5R_ASSISTANT_TURN_SECTIONS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-assistant.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const ASSISTANT = join(VMU, 'packs', 'v5r', 'prompts', 'assistant.json')
const ENTRY = join(VMU, 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}
const stage = (name) => console.log('=== ' + name + ' ===')

const KEBAB = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
const rangeOf = (order) => Object.entries(ORDER_RANGES).find(([, [lo, hi]]) => order >= lo && order <= hi)[0]

stage('1. THE TWO HALVES EXIST AS TWO DECLARATIONS FOR TWO DIFFERENT READERS')
ok(existsSync(ASSISTANT), 'the root/system-prompt half is DATA in the pack folder (the plugin reads a pack by name)', ASSISTANT)
ok(existsSync(join(VMU, 'packs', 'v5r', 'prompts', 'v5r-assistant.js')), 'the per-round half is a module the MANIFEST carries', 'v5r-assistant.js')
const raw = JSON.parse(readFileSync(ASSISTANT, 'utf8'))
const hostSections = Array.isArray(raw.sections) ? raw.sections : []
ok(hostSections.length >= 3, 'the host half declares the assistant identity, its reporting duty and its parameter face',
  { n: hostSections.length })
ok(Array.isArray(raw.bindings), 'and a bindings list (empty is a value: a section with no binding renders its own text)')
const shapeBad = hostSections.filter((s) => !s || typeof s.name !== 'string' || !KEBAB.test(s.name) ||
  !Number.isInteger(s.order) || typeof s.text !== 'string' || s.text.trim() === '' ||
  typeof s.range !== 'string' || s.hostPrompt !== true)
ok(shapeBad.length === 0, 'every host section carries a kebab-case name, an integer order, a non-empty text and the `hostPrompt:true` flag the entry reads',
  shapeBad.map((s) => s && s.name))
const rangeMismatch = hostSections.filter((s) => rangeOf(s.order) !== s.range)
ok(rangeMismatch.length === 0, 'each declared range agrees with the range its order falls in (the pipeline refuses a mismatch)',
  rangeMismatch.map((s) => s.name + ':' + s.order + '/' + s.range))
const turnSec = V5R_ASSISTANT_TURN_SECTION
ok(KEBAB.test(turnSec.name) && Number.isInteger(turnSec.order) && rangeOf(turnSec.order) === turnSec.range,
  'the per-round section declares the same shape, with a range that matches its order', { name: turnSec.name, order: turnSec.order })
// A NAME MAY NOT COLLIDE with anything else in the same pipeline: two pack sections claiming one name is a NAMED refusal
// (VMU_MIDDLEWARE_FAILED) at registration, so a collision would break the pack's LOAD rather than this test.
const taken = new Set([...CHARTER_SECTIONS.map((s) => s.name), v5rRoleSection.name])
ok(!taken.has(turnSec.name) && !hostSections.some((s) => taken.has(s.name)),
  'no assistant section collides with a charter section name (a duplicate pack name would refuse the whole load)')

stage('2. THE HOST HALF IS VARIABLE-FREE (the host path renders none) AND THE TURN HALF IS WHY-ABLE')
{
  const hostVars = hostSections.flatMap((s) => (s.text.match(/\{\{[^}]*\}\}/g) || []).map((v) => s.name + ' ' + v))
  ok(hostVars.length === 0,
    'NO host-surface section carries a template placeholder: the host path hands the text over verbatim, so a placeholder would reach the model as literal {{ }}',
    hostVars)
  const badVars = []
  for (const m of turnSec.text.matchAll(/\{\{\s*([a-zA-Z:-]+[a-zA-Z0-9:._-]*)\s*\}\}/g)) {
    const key = m[1].trim()
    const allowed = VARIABLE_WHITELIST.includes(key) ||
      (key.startsWith('setting:') && VARIABLE_WHITELIST.includes('setting:')) ||
      (key.startsWith('count:') && VARIABLE_WHITELIST.includes('count:'))
    if (!allowed) badVars.push(m[0])
  }
  ok(badVars.length === 0, 'every per-round placeholder is inside the pipeline whitelist (docs/03 §4 / docs/06 §5)', badVars)
  ok(/setting:/.test(turnSec.text), 'and the duty section really reads a live setting, so it is a runtime section rather than a recording')
  // THE BOUNDARY THAT MUST NOT BLUR: the v5r prompt CORPUS is a contrast baseline, and the file that would make it a
  // runtime template (prompts/sections.json) is still absent. The assistant surface is a DISTINCT declaration; if a later
  // change collapses the two, this is where it shows.
  ok(!existsSync(join(VMU, 'packs', 'v5r', 'prompts', 'sections.json')),
    'the corpus boundary is intact: v5r still ships no prompts/sections.json, so the assistant surface is a separate declaration')
}

stage('3. THE MANIFEST REALLY CARRIES THE PER-ROUND HALF (PACK.sections, the thing the loader applies)')
ok(Array.isArray(PACK.sections) && PACK.sections.some((s) => s.name === turnSec.name),
  'PACK.sections contains the reporting duty, so applying the pack registers it (not merely importing it)', PACK.sections.map((s) => s.name).filter((n) => String(n).includes('report')))
ok(V5R_ASSISTANT_TURN_SECTIONS.length === 1 && V5R_ASSISTANT_TURN_SECTIONS[0] === turnSec,
  'and the module exports exactly the sections the manifest is handed (no hidden second list)')

stage('4. THE PER-ROUND HALF REALLY REACHES AN ASSEMBLED PROMPT (direct pipeline, all three roles)')
{
  const settings = { 'vmu.turn.instituteName': 'institute' }
  const pipeline = createPromptPipeline({ sections: V5R_ASSISTANT_TURN_SECTIONS, bindings: [], settings, clock: () => '2026-01-01T00:00:00.000Z' })
  for (const [role, roleLabel] of [['academician', '院士'], ['researcher', '常驻研究员'], ['temp', '临时工']]) {
    const asm = await pipeline.assemble({ member: 'm-1', role, roleLabel, phase: 'normal', round: 3, settings })
    ok(String(asm.text).includes('主动汇报是成员义务'),
      'the reporting duty is IN the assembled prompt for role ' + role + ' (not merely declared)', { chars: String(asm.text).length })
    ok(asm.sources.some((s) => s.section === turnSec.name),
      'and the assembly NAMES it as a contributor, so the provenance is auditable')
    ok(String(asm.text).includes('【汇报纪律：本所「institute」】'),
      'with its live setting resolved from the assembly context (no literal placeholder survived)', role)
  }
  const one = await pipeline.assemble({ member: 'm-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 1, settings })
  ok(!/\{\{/.test(String(one.text)), 'no unresolved placeholder is left anywhere in the assembled text')
  ok(one.variableMisses.length === 0, 'and nothing was recorded as a missing variable', one.variableMisses)
  // THE OFF SWITCH, ON THE TEXT SIDE: disabling the section removes it WHOLE (zero injection, docs/26 section 3.26).
  pipeline.disable(turnSec.name)
  const off = await pipeline.assemble({ member: 'm-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 1, settings })
  ok(!String(off.text).includes('主动汇报是成员义务') && !String(off.text).includes(turnSec.name),
    'disabling the section removes the text AND its heading (zero injection, not an empty section)')
  pipeline.enable(turnSec.name)
  const back = await pipeline.assemble({ member: 'm-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 1, settings })
  ok(String(back.text) === String(one.text), 'and re-enabling restores the assembly BYTE FOR BYTE (the off state is a state, not an edit)')
}

stage('5. THE REAL PRESET ENTRY: THE PACK\'S ASSISTANT SURFACE IS IN THE LIVE PIPELINE')
{
  const entry = await import(pathToFileURL(ENTRY).href)
  const fakeCtx = (extra = {}) => {
    const state = { specs: [], sections: [] }
    return {
      state,
      ctx: Object.assign({
        effect(fn) { return fn() },
        on() { return () => {} },
        tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
      }, extra),
    }
  }
  const root = await mkdtemp(join(tmpdir(), 'vmu-assistant-assembly-'))
  const h = fakeCtx()
  const handle = entry.apply(h.ctx, { clock: () => Date.now(), root, packs: ['v5r'] })
  await new Promise((r) => setTimeout(r, 120))
  ok(handle.packErrors().length === 0, 'the v5r pack loads with the assistant surface in it', JSON.stringify(handle.packErrors()).slice(0, 220))
  const registered = handle.kernel.status().prompt.sections.map((s) => s.name)
  ok(registered.includes(turnSec.name),
    'the LIVE kernel pipeline holds the reporting duty, registered through the loaded manifest', registered.filter((n) => String(n).includes('report')))
  ok(registered.includes('v5r-role-block') && registered.includes('v5r-charter-opening'),
    'beside the sections that were already there (so this addition did not replace anything)')
  // THE REAL ASSEMBLY PATH: the kernel's own pipeline, with the turn context the loop supplies.
  const asm = await handle.kernel.prompt.assemble({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 2,
    settings: { 'vmu.turn.instituteName': 'institute' } })
  ok(String(asm.text).includes('主动汇报是成员义务'),
    'and assembling through the real kernel pipeline puts the duty text in the round prompt', { chars: String(asm.text).length })
  ok(String(asm.text).includes('v5r-report-duty'), 'with its heading, so a reader can tell which section said it')
  await rm(root, { recursive: true, force: true })
}

stage('6. THE PERSONA SAYS THE THINGS THE RULING REQUIRES IT TO SAY')
{
  const all = hostSections.map((s) => s.text).join('\n')
  ok(hostSections.some((s) => s.name === 'v5r-assistant-identity') && /不参与研究/.test(all) && /不投票/.test(all) && /无座/.test(all),
    'the identity section states the three v5r boundaries: no research, no vote, no seat (agent.cordis.yml:74-86)')
  ok(hostSections.some((s) => s.name === 'v5r-assistant-reporting') && /vmu\.report\.reports/.test(all) && /drives:false/.test(all),
    'the reporting section names the declared trigger list AND the never-drives invariant')
  ok(/没有声明就什么都不报/.test(all) && /vmu\.report\.enabled/.test(all),
    'and states the zero-mechanism default and its off switch in the assistant\'s own words')
  ok(hostSections.some((s) => s.name === 'v5r-assistant-parameters') && /vmu\.report\.params/.test(all) && /vmu\.report\.whoMayChange/.test(all),
    'the parameter section names the declared domain and the declared owners (v5r\'s "only the office may change parameters", as a declaration)')
  ok(/H3/.test(all) && /审计/.test(all), 'and states the read-only class and the audit trail rather than promising a silent change')
  ok(/所办/.test(all) && /院士/.test(all), 'the two layers are named distinctly: the office is the interface, the academician leads the institute')
  ok(/参数/.test(turnSec.text) && /所办/.test(turnSec.text),
    'and the per-round duty tells a MEMBER who owns the parameter face (read yes, change no)')
}

console.log('')
console.log('=== VMU ASSISTANT ASSEMBLY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
