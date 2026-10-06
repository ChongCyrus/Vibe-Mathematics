// ============================================================================================
// PRESET DECLARATIONS — the bundle patch that delivers the four presets on the CURRENT DSH line.
//
// The defect class this guards (2.4.0 adaptation to DSH 0.2.0): a preset that is present in the
// package but invisible to the host. Three concrete ways that happened while adapting:
//
//   1. `dsh.bundle.patch` as an ARRAY. DSH >= 0.1.7 accepts a list of patch files, but 0.1.5/0.1.6
//      pass the value straight into `path.join`, so an array aborts the whole profile boot with
//      ERR_INVALID_ARG_TYPE. One patch file is valid on every line.
//   2. A declaration row naming `@deepseek-ai/dsh-agent-preset`. That package exists only from 0.1.7,
//      so on the older line the row fails to import and is reported as an activation failure on every
//      boot. The rows name this package's own `preset-declaration` module instead, which resolves on
//      both lines and registers only where the `agentPresets` service exists.
//   3. A `disabled: !!js` gate on the declaration row. Measured on DSH 0.2.0-rc.2: an expression that
//      CALLS `ctx.get(...)` throws inside the loader's patch evaluation, the entry never initialises,
//      and the preset silently never registers (`dsh: warning: N entries did not activate`). Constants
//      and `typeof ctx` work; service lookups do not — so there is no such gate anywhere.
//
// It also pins the SHARED SOURCE OF TRUTH: cordis.patch.yml is generated from the frozen 0.1.x
// compositions, so a hand edit to either side fails here instead of drifting.
//
// Usage: node tests/audit-preset-rows.test.mjs
// ============================================================================================
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, resolve } from 'node:path'
import { buildPatch } from '../scripts/build-preset-rows.mjs'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
const patch = readFileSync(join(REPO, 'cordis.patch.yml'), 'utf8')
const VERSIONS = ['v2', 'v3', 'v4', 'v5', 'v5r']

let passed = 0, failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}
const at = (rel) => join(REPO, rel)

// ---- 1. the generated patch is in sync with its generator ------------------------------------
ok(buildPatch() === patch, 'cordis.patch.yml is exactly what scripts/build-preset-rows.mjs generates',
  'hand-edited? regenerate with: node scripts/build-preset-rows.mjs')

// ---- 2. bundle patch declaration --------------------------------------------------------------
ok(typeof pkg.dsh.bundle.patch === 'string' && pkg.dsh.bundle.patch === './cordis.patch.yml',
  'dsh.bundle.patch is the single patch file as a STRING (an array breaks the 0.1.5/0.1.6 boot)',
  JSON.stringify(pkg.dsh.bundle.patch))
ok(pkg.files.includes('cordis.patch.yml') && pkg.files.includes('scripts/build-preset-rows.mjs')
  && pkg.files.includes('preset-declaration.js'),
  'the patch, its generator and the declaration module all ship in package.json files')

// ---- 3. rows ----------------------------------------------------------------------------------
ok(/^ {4}- id: vibe-math-preset-installer$/m.test(patch)
  && /^ {6}name: dsh-vibe-math\/installer$/m.test(patch),
  'the installer row is inserted first')
const declarationRows = [...patch.matchAll(/^ {4}- id: preset-vibe-math-(v\d+r?)$/gm)].map((m) => m[1])
ok(declarationRows.join(',') === VERSIONS.join(','),
  'one declaration row per preset, in order', declarationRows.join(','))
ok((patch.match(/name: dsh-vibe-math\/preset-declaration/g) || []).length === 5,
  'every declaration names this package\'s own preset-declaration module')
ok(!patch.includes("name: '@deepseek-ai/dsh-agent-preset'"),
  'no row names @deepseek-ai/dsh-agent-preset (that package does not exist on DSH <= 0.1.6)')
ok(!/^ {4,6}disabled:/m.test(patch),
  'no `disabled: !!js` gate on a DECLARATION row (an expression calling ctx.get() throws in patch evaluation and the row never loads; the nested platform gates on tool-bash/tool-pwsh inside a composition are constants and fine)')

// ---- 4. every declaration's composition -------------------------------------------------------
const IDS = { v2: '20', v3: '21', v4: '22', v5: '23', v5r: '24' }
for (const v of VERSIONS) {
  const start = patch.indexOf('- id: preset-vibe-math-' + v)
  const next = patch.indexOf('\n- insert:', start)
  const body = patch.slice(start, next === -1 ? undefined : next)
  const need = [
    ['declared preset id', new RegExp('^ {8}id: vibe-math-' + v + '$', 'm')],
    ['roster order', new RegExp('^ {8}order: ' + IDS[v] + '$', 'm')],
    ['persona prefix', /^ {14}prefix: \|-/m],
    ['no legacy persona.text key', /^(?![\s\S]*^ {14}text:)/m],
    ['agent-instructions row', /name: '@deepseek-ai\/dsh-agent-instructions'/],
    ['plan-mode inside an isolate realm', /isolate:\n\s+planMode: true/],
    ['compaction isolate realm', /isolate:\n\s+compaction: true\n\s+toolResultPruner: true/],
    ['delegation isolate realm', /isolate:\n\s+workflowEngine: true/],
    ['the 0.1.7+ workflow engine', /name: '@deepseek-ai\/dsh-workflow-ptc'/],
    ['present row (deliverable cards)', /id: present\n\s+name: '@deepseek-ai\/dsh-tool-present'/],
    ['command-goal row', /id: command-goal\n\s+name: '@deepseek-ai\/dsh-command-goal'/],
    ['framework row by package subpath', new RegExp("name: 'dsh-vibe-math/vibe-math-" + v + "/vibe-math-" + v + "\\.js'")],
    ['framework row NOT a relative path', new RegExp("(?!name: '\\./vibe-math-" + v + "\\.js')")],
  ]
  const missing = need.filter(([, re]) => !re.test(body)).map(([label]) => label)
  ok(missing.length === 0, v + ': the composition carries every required row', 'missing: ' + missing.join(', '))
  ok(!body.includes('workflow-worker-thread'), v + ': the removed worker-thread engine is not referenced')
}

// ---- 4b. the declaration module itself ---------------------------------------------------------
// It is the only piece of code in this mechanism, so its two behaviours are pinned directly:
// register exactly the row's declaration where the service exists, and do NOTHING (no throw, no call)
// where it does not — the older DSH line reads the directory instead and must boot silently.
{
  const declaration = await import('../preset-declaration.js')
  const CONFIG = { id: 'x', name: 'X', description: 'd', order: 7, plugins: [{ id: 'p', name: '@deepseek-ai/dsh-persona' }] }
  const makeCtx = (service) => {
    const calls = []
    const warnings = []
    const ctx = {
      calls, warnings,
      logger: { warn: (m) => warnings.push(String(m)) },
      get: (n) => (n === 'agentPresets' ? service : undefined),
      effect: (fn) => { const d = fn(); ctx.disposers.push(d); return () => { if (typeof d === 'function') d() } },
      disposers: [],
      inject: (deps, cb) => cb(ctx),
    }
    return ctx
  }
  const settle = () => new Promise((r) => setTimeout(r, 0))

  // (a) service present → the row's declaration reaches register()
  {
    let seen
    const ctx = makeCtx({ register: async (def) => { seen = def; return async () => {} } })
    declaration.apply(ctx, CONFIG)
    await settle()
    ok(seen !== undefined && seen.id === 'x' && seen.order === 7 && Array.isArray(seen.plugins) && seen.plugins.length === 1,
      'preset-declaration: the row config is handed to agentPresets.register() unchanged')
  }
  // (b) service absent (DSH <= 0.1.6) → no call, no throw (the directory form is the mechanism there)
  {
    const ctx = makeCtx(undefined)
    let threw = false
    try { declaration.apply(ctx, CONFIG); await settle() } catch (e) { threw = true }
    ok(!threw && ctx.warnings.length === 0, 'preset-declaration: on a host without the service it registers nothing and stays silent')
  }
  // (c) a duplicate id (the user saved their own declaration) → reported once, never thrown
  {
    const ctx = makeCtx({ register: async () => { throw new Error('Duplicate agent preset: x') } })
    let threw = false
    try { declaration.apply(ctx, CONFIG); await settle() } catch (e) { threw = true }
    ok(!threw && ctx.warnings.length === 1 && /Duplicate agent preset/.test(ctx.warnings[0]),
      'preset-declaration: a duplicate id is logged once (the profile declaration wins) and never breaks the boot',
      ctx.warnings.join(' | '))
  }
  // (d) no ctx.inject (an older Cordis) → the direct path still registers
  {
    let seen
    const ctx = makeCtx({ register: async (def) => { seen = def; return async () => {} } })
    delete ctx.inject
    declaration.apply(ctx, CONFIG)
    await settle()
    ok(seen !== undefined, 'preset-declaration: without ctx.inject it registers directly')
  }
  // (e) a row with no config must not throw
  {
    let threw = false
    try { declaration.apply(makeCtx(undefined), undefined); declaration.apply(makeCtx(undefined), null) } catch (e) { threw = true }
    ok(!threw, 'preset-declaration: a missing config is ignored instead of throwing')
  }
}

// ---- 5. module resolution ---------------------------------------------------------------------
for (const v of VERSIONS) {
  const sub = './vibe-math-' + v + '/vibe-math-' + v + '.js'
  ok(pkg.exports[sub] === sub && existsSync(at(sub)),
    v + ': the framework plugin is exported as ' + sub)
  ok(pkg.files.includes('vibe-math-' + v + '/vibe-math-' + v + '.js'),
    v + ': the framework plugin ships')
}
ok(pkg.exports['./preset-declaration'] === './preset-declaration.js' && existsSync(at('preset-declaration.js')),
  'preset-declaration.js is exported and present')
ok(pkg.files.includes('preset-declaration.js'), 'preset-declaration.js ships')

// ---- 6. the frozen 0.1.x compositions stay the field-tested shape -----------------------------
for (const v of VERSIONS) {
  const src = readFileSync(at('vibe-math-' + v + '/agent.cordis.yml'), 'utf8')
  ok(src.includes("name: '@deepseek-ai/dsh-workflow-worker-thread'"),
    v + ': the frozen composition still uses the worker-thread engine (what <= 0.1.6 ships)')
  ok(/^ {4}text: \|-/m.test(src) || /^ {2}text: \|-/m.test(src),
    v + ': the frozen composition still carries the legacy persona.text key (DSH <= 0.1.2 needs it)')
}

console.log('')
console.log('=== PRESET DECLARATIONS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
