// tests/vmu-assistant-systemprompt.test.mjs — GOAL 6, THE PROOF THAT MATTERS MOST: the office persona reaches the SYSTEM
// PROMPT of the session that actually talks to the human.
//
// WHY THIS IS A SEPARATE SUITE. The per-round channel (tests/vmu-assistant-assembly.test.mjs) drives the MEMBERS: the turn
// pipeline assembles a prompt for each member of the institute. The MAIN agent is not a member - it is the session root,
// the one the user talks to - and what it believes about itself comes from the HOST's system prompt, not from a turn. v5r
// said it plainly (`agent.cordis.yml:74-86`: the office does not research and does not vote) and this repository's own
// preset persona says nothing of the sort, so if the pack's assistant declaration does not reach `ctx.systemPrompt`, then
// "the main agent is an assistant" would be a sentence in a document. This suite refuses that: it applies the REAL preset
// entry, records what the entry hands the host, and requires the declaration to be in it.
//
// Run: node tests/vmu-assistant-systemprompt.test.mjs
import { readFileSync, existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const ENTRY = join(VMU, 'vibe-math-vmu.js')
const ASSISTANT = join(VMU, 'packs', 'v5r', 'prompts', 'assistant.json')

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

/** The real host shape this entry consumes, with the system-prompt registration RECORDED. */
const fakeCtx = (extra = {}) => {
  const state = { specs: [], sections: [], effects: [] }
  return {
    state,
    ctx: Object.assign({
      effect(fn, label) { state.effects.push(label); return fn() },
      on() { return () => {} },
      tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
      systemPrompt: {
        section: (s) => { state.sections.push(s); return () => {} },
        getSectionOrder: () => 500,
      },
    }, extra),
  }
}

const raw = JSON.parse(readFileSync(ASSISTANT, 'utf8'))
const hostSections = (raw.sections || []).filter((s) => s && s.hostPrompt === true)
const NEEDLES = hostSections.map((s) => ({ name: s.name, needle: String(s.text).slice(0, 24) }))
// `--print` turns this suite into a REPRODUCIBLE EXCERPT: the same run, plus the bytes the host would receive. It is how
// the handover evidence quotes a prompt rather than asserting one.
const PRINT = process.argv.includes('--print')

stage('1. THE PLUGIN READS THE ASSISTANT DECLARATION (the wiring, as source text)')
{
  const src = readFileSync(ENTRY, 'utf8')
  ok(/assistant\.json/.test(src),
    'the preset entry reads packs/<name>/prompts/assistant.json (the pack-agnostic data read the host surface needs)',
    'the entry must read it by folder name: the plugin never learns WHICH pack it is reading')
  ok(/hostPrompt/.test(src), 'and it reads the `hostPrompt:true` flag rather than importing everything a pack carries')
  ok(!/from '\.\/packs\/v5r\/prompts\/assistant\.js'/.test(src) && !/'v5r-assistant'/.test(src),
    'without hard-coding this pack\'s name or module path into the framework')
}

stage('2. WITH THE PACK ACTIVE THE ASSISTANT PERSONA IS IN THE HOST SYSTEM PROMPT')
{
  const entry = await import(pathToFileURL(ENTRY).href)
  const root = await mkdtemp(join(tmpdir(), 'vmu-assistant-sp-'))
  const h = fakeCtx()
  const handle = entry.apply(h.ctx, { clock: () => Date.now(), root, packs: ['v5r'] })
  await new Promise((r) => setTimeout(r, 150))
  ok(handle.packErrors().length === 0, 'the v5r pack loads', JSON.stringify(handle.packErrors()).slice(0, 200))
  ok(h.state.sections.length >= 1,
    'the entry registered a host systemPrompt section (without one, this whole channel is dead)', h.state.sections.length)
  const text = h.state.sections.map((s) => String(s.text || '')).join('\n\n')
  if (PRINT) {
    console.log('----- ctx.systemPrompt.section TEXT (first 700 chars, as the host receives it) -----')
    console.log(text.slice(0, 700))
    console.log('----- end excerpt · sections registered: ' + h.state.sections.length + ' · chars: ' + text.length + ' -----')
  }
  for (const { name, needle } of NEEDLES) {
    ok(text.includes(needle), 'the host system prompt carries ' + name + ' (byte-present, not claimed)', { needle })
  }
  ok(/vibe_vmu_report/.test(text) && /vmu\.report\.reports/.test(text) && /vmu\.report\.params/.test(text),
    'and the assistant is told how to report and how to configure parameters, with the REAL key names')
  ok(/不参与研究/.test(text) && /不投票/.test(text),
    'and what it is NOT: no research, no vote (v5r\'s two-layer split, agent.cordis.yml:74-86)')
  // the provenance the entry reports must name the pack as the source, not "inline"
  const prompts = typeof handle.prompts === 'function' ? handle.prompts() : []
  const fromPack = prompts.filter((p) => String(p.source || '').startsWith('pack:'))
  ok(fromPack.length >= 1,
    'and the entry reports the section as coming from the PACK, so the provenance is auditable', prompts.map((p) => p.name + ':' + p.source).slice(0, 6))
  await rm(root, { recursive: true, force: true })
}

stage('3. ZERO MECHANISM IS UNTOUCHED: NO PACK ⇒ NO ASSISTANT SECTION')
{
  const entry = await import(pathToFileURL(ENTRY).href)
  const root = await mkdtemp(join(tmpdir(), 'vmu-assistant-sp0-'))
  const h = fakeCtx()
  entry.apply(h.ctx, { clock: () => Date.now(), root })
  await new Promise((r) => setTimeout(r, 150))
  ok(h.state.sections.length === 0,
    'with no pack named, no host systemPrompt section is registered (the assistant persona is the PACK\'s, not the framework\'s)',
    h.state.sections.map((s) => s.name))
  ok(!h.state.specs.some((s) => s.name === 'vibe_vmu_report'),
    'and no report tool face is published (its intent is declared by a pack, not by the framework)',
    h.state.specs.map((s) => s.name))
  await rm(root, { recursive: true, force: true })
}

stage('4. THE DECLARATION IS READABLE WHERE A READER WOULD LOOK (the file itself)')
{
  ok(existsSync(ASSISTANT) && hostSections.length >= 3, 'the host surface is a data file in the pack folder with >= 3 sections',
    { path: 'vibe-math-vmu/packs/v5r/prompts/assistant.json', n: hostSections.length })
  ok(hostSections.every((s) => !/\{\{/.test(s.text)),
    'and no host section carries a placeholder (the host path renders none, so one would ship verbatim)')
}

console.log('')
console.log('=== VMU ASSISTANT SYSTEM PROMPT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) {
  console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
  console.error('\nNOTE: sections 2 and 3 assert the WIRING between the pack declaration and the host system prompt.')
  console.error('If they fail while section 1 also fails, the entry does not yet read packs/<id>/prompts/assistant.json.')
  process.exitCode = 1
}
