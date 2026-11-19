// scripts/sim/scenarios/fixture-mode-precedence.mjs — RUN 87 P0: does the turn prompt read the MERGED settings?
//
// WHY THIS SCENARIO EXISTS. Round 12 found the prompt policy never ran (every seat read BOTH mutually exclusive
// catalogues and the host-only "effective tools" placeholder). The fix landed, but a new question remained unanswered:
// when a deployment declares `vmu.v5r.fixtureMode` through a DIFFERENT config shape (RUN 87's top-level `config.v5r`),
// does the turn prompt still silently mis-render? This scenario pins the three-layer truth on the REAL turn path
// (`vibe_vmu_turn {op:"drive"}` -> `{op:"prompt"}` archive, i.e. the same prompt a seat reads):
//
//   A1  config = { v5r: { fixtureMode: 'tools' } }   <- the RUN 87 injected shape: NOT a settings key
//       expected: readSettings names it in `unparsed` (NOT applied, never silent); effective value falls back to
//       the PACK DEFAULT, which is 'tools' today -> prompt = tools.
//   A2  config.vmu dotted tools        -> prompt = tools
//   A3  config.vmu dotted no-tools     -> prompt = constraint (session wins over the pack default; the O4 conflict
//                                         is NAMED in settingsMerge, never silent)
//   B1  boot settings layer tools      -> prompt = tools
//   B2  boot settings layer no-tools   -> prompt = constraint
//
// The assertions are PAIRED so neither direction can pass silently: tools must be exactly 1 AND constraint exactly 0
// (and vice versa); the reply catalogue is exactly ONE of compact/spec; the host-only placeholder is 0 everywhere.
// Anti-lamps: A1 must be VISIBLE in unparsed (a top-level key that vanishes is a red, not a convenience), and the
// settings-layer override must really flip the prompt (otherwise "the merge is read" is just a sentence).

import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdtempSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { boot, REPO } from '../harness.mjs'
import { tmpRoot } from '../../lib/tmp-root.mjs'

export const settings = { deliverMode: 'caller' }

const NL = String.fromCharCode(10)
const FENCE = String.fromCharCode(96, 96, 96)
const fence = (payload) => [FENCE + 'json', JSON.stringify(payload), FENCE].join(NL)
const CLOCK = () => 1_800_000_000_000
const COUNT = (t, s) => String(t).split(s).length - 1

/** Boot through the ENTRY exactly like a deployment (minimal host ctx), so `config` is the real config shape. */
async function bootEntry(config) {
  const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
  const specs = []
  const ctx = { effect: (fn) => fn(), on: () => () => {}, tools: { register: async (spec) => { specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: CLOCK, packs: ['v5r'], root: mkdtempSync(join(tmpRoot(), 'sim-fixture-mode-')) }, config))
  if (handle && typeof handle.ready === 'function') await handle.ready().catch(() => {})
  const call = async (name, args = {}) => {
    const spec = specs.filter((s) => s && s.name === name)[0]
    if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', tool: name }
    try { const raw = await spec.execute(args, { kernel: handle.kernel }); return typeof raw === 'string' ? JSON.parse(raw) : raw } catch (e) { return { ok: false, code: (e && e.code) || 'THREW', message: String((e && e.message) || e) } }
  }
  return { handle, call }
}

async function readPromptFrom(call, member = 'r-1') {
  let text = ''
  let offset = 0
  for (let page = 0; page < 40; page += 1) {
    const pr = await call('vibe_vmu_turn', { op: 'prompt', member, offset, limit: 9000 })
    if (!pr || pr.ok !== true) return { ok: false, code: (pr && pr.code) || 'PROMPT_READ_FAILED', text: '' }
    text += String(pr.text || '')
    if (pr.done === true) break
    offset = pr.nextOffset === null || pr.nextOffset === undefined ? offset + String(pr.text || '').length : pr.nextOffset
  }
  return { ok: true, text }
}

function sectionReading(text) {
  return {
    chars: String(text).length,
    constraint: COUNT(text, '# v5r-fixture-constraint'),
    tools: COUNT(text, '# v5r-fixture-tools'),
    replyCompact: COUNT(text, '# v5r-reply-compact'),
    replySpec: COUNT(text, '# v5r-reply-spec'),
    placeholder: COUNT(text, '【本轮你实际能调用的工具｜占位段】'),
    effectiveBlock: COUNT(text, '【本轮你实际能调用的工具｜'),
  }
}

/** Assert a reading expresses exactly ONE fixture variant and exactly ONE reply catalogue, no host-only placeholder. */
function expectMode(name, reading, want, failures) {
  const okTools = want === 'tools' ? (reading.tools === 1 && reading.constraint === 0) : (reading.constraint === 1 && reading.tools === 0)
  const okCatalogue = reading.replyCompact + reading.replySpec === 1
  const okPlaceholder = reading.placeholder === 0 && reading.effectiveBlock === 0
  const ok = okTools && okCatalogue && okPlaceholder && reading.chars > 0
  if (!ok) {
    failures.push({
      code: 'SIM_FIXTURE_MODE_PRECEDENCE',
      step: name,
      message: name + ': expected ' + want + ' but read ' + JSON.stringify(reading),
      means: 'the turn prompt must read the MERGED settings: exactly one fixture variant (tools XOR constraint), exactly one reply catalogue, and no host-only "effective tools" placeholder (that block belongs to the root system prompt, never to a turn prompt)',
    })
  }
  return { ok }
}

/** One full case: start -> drive -> read the archived prompt -> read the entry's merge/unparsed reports. */
async function runCase(booted, name, want, failures) {
  const { call, handle } = booted
  const started = await call('vibe_v5_start', { problem: 'fixtureMode 优先级仿真：' + name, researcherCount: 2 })
  const drive = await call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: 'precedence ' + name })
  const prompt = await readPromptFrom(call)
  const reading = sectionReading(prompt.text || '')
  const check = expectMode(name, reading, want, failures)
  const unparsed = (() => { try { const u = typeof handle.settingsUnparsed === 'function' ? handle.settingsUnparsed() : handle.settingsUnparsed; return Array.isArray(u) ? u.map((x) => x && x.path) : [] } catch { return [] } })()
  const resolved = (() => { try { const st = handle.kernel.status(); const r = st && st.settings && st.settings.resolved ? st.settings.resolved['vmu.v5r.fixtureMode'] : null; return r ? { value: r.value === undefined ? null : r.value, source: r.source } : null } catch { return null } })()
  const merge = (() => { try { const m = typeof handle.mergeReport === 'function' ? handle.mergeReport() : (handle.packMerge ? handle.packMerge() : {}); return { source: m.sources ? m.sources['vmu.v5r.fixtureMode'] : null, conflicts: (m.conflicts || []).filter((c) => c.key === 'vmu.v5r.fixtureMode').map((c) => ({ code: c.code, packValue: c.packValue, sessionValue: c.sessionValue })) } } catch { return null } })()
  return { name, want, started: started && started.ok === true, drive: drive ? drive.awaiting === true : false, reading, check: check.ok, unparsed, resolved, merge }
}

export async function fixtureModePrecedence(h, { log = () => {} } = {}) {
  const steps = []
  const failures = []
  const highlights = { means: 'fixtureMode precedence on the REAL turn path: 2 config shapes (non-vmu top-level / dotted vmu), 2 settings-layer overrides, one default — each read from the archived prompt a seat actually receives' }
  const step = (name) => { steps.push({ name, at: h.receipts.length, files: { before: 0, after: 0 }, ok: true, code: null }) }
  const cases = []
  const run = async (name, booted, want) => {
    const row = await runCase(booted, name, want, failures)
    cases.push(row)
    step(name)
    log(name + ': ' + (row.check ? 'ok' : 'MISMATCH') + ' (' + want + ') ' + JSON.stringify(row.reading))
    return row
  }

  // ── 0. the scenario's own default (the harness settings layer: deliverMode caller, fixtureMode = pack default) ──
  step('main/start')
  await h.call('vibe_v5_start', { problem: 'fixtureMode 优先级仿真：默认 settings 层', researcherCount: 2 })
  await h.call('vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: 'precedence default' })
  const mainPrompt = await readPromptFrom(h.call)
  const mainReading = sectionReading(mainPrompt.text || '')
  expectMode('main/default', mainReading, 'tools', failures)
  step('main/default')
  if (mainPrompt.ok === true && mainPrompt.text) {
    h.prompts.push({ seat: 'member', phase: 'normal', round: 1, chars: mainPrompt.text.length, text: mainPrompt.text, assembly: h.prompts.length + 1, afterReceipts: h.receipts.length, member: 'r-1', notices: null, source: 'turn-prompt-default-fixture-mode', means: 'default (pack) fixtureMode turn prompt: exactly one fixture variant + one reply catalogue, no host-only placeholder' })
  }

  // ── A1: the RUN 87 injected shape (top-level `v5r`) — visible as unparsed, effective = pack default tools ──────
  const a1 = await run('A1/config.v5r.top-level', await bootEntry({ v5r: { fixtureMode: 'tools' }, vmu: { deliverMode: 'caller' } }), 'tools')
  // ── A2/A3: dotted config.vmu (the declared channel) ─────────────────────────────────────────────────────────
  const a2 = await run('A2/config.vmu.dotted.tools', await bootEntry({ vmu: { deliverMode: 'caller', 'vmu.v5r.fixtureMode': 'tools' } }), 'tools')
  const a3 = await run('A3/config.vmu.dotted.no-tools', await bootEntry({ vmu: { deliverMode: 'caller', 'vmu.v5r.fixtureMode': 'no-tools' } }), 'no-tools')
  // ── B1/B2: boot settings layer (harness `settings` -> config.vmu) ───────────────────────────────────────────
  const bootLayer = async (mode) => {
    const hh = await boot({ root: mkdtempSync(join(tmpRoot(), 'sim-fixture-mode-h-')), settings: { deliverMode: 'caller', 'vmu.v5r.fixtureMode': mode } })
    return { call: hh.call, handle: hh.handle, close: async () => { try { await hh.close() } catch { /* throwaway */ } } }
  }
  const b1 = await run('B1/harness.settings.tools', await bootLayer('tools'), 'tools')
  const b2 = await run('B2/harness.settings.no-tools', await bootLayer('no-tools'), 'no-tools')
  // ── anti-lamps that make the two directions falsifiable ─────────────────────────────────────────────────────
  if (!a1.unparsed.includes('v5r')) {
    failures.push({ code: 'SIM_FIXTURE_MODE_UNPARSED_NOT_NAMED', step: 'A1/config.v5r.top-level', message: 'the top-level config.v5r shape was NOT named in settingsUnparsed: ' + JSON.stringify(a1.unparsed), means: 'a config key that cannot become a setting must be named in unparsed (silently ignoring it is the class of defect this round fixes)' })
  }
  if (b1.check !== true || b2.check !== true) {
    failures.push({ code: 'SIM_FIXTURE_MODE_OVERRIDE_NOT_READ', step: 'B/settings-layer', message: 'the boot settings layer did not flip the turn prompt between tools and no-tools', means: 'prompt assembly must read the MERGED settings; otherwise the two round-12 fixes are masking, not fixing' })
  }
  if (a2.check !== true || a3.check !== true) {
    failures.push({ code: 'SIM_FIXTURE_MODE_DOTTED_NOT_READ', step: 'A2/A3/config.vmu', message: 'config.vmu dotted fixtureMode did not decide the fixture variant', means: 'the declared settings channel must decide the fixture variant' })
  }
  highlights.precedence = {
    table: cases.map((c) => ({ case: c.name, want: c.want, got: c.reading, checked: c.check, unparsed: c.unparsed, resolved: c.resolved, merge: c.merge })),
    mainDefault: { reading: mainReading },
    means: 'each row = one kernel boot shape; `got` is counted from the archived turn prompt (constraint/tools XOR + catalogue count + placeholder 0); A1 must be named in unparsed and must NOT escape to the default; the settings layer must flip both ways',
  }
  return { steps, receipts: h.receipts, tree: h.tree ? h.tree() : [], failures, highlights, expectedRefusals: [] }
}

export const scenario = fixtureModePrecedence
