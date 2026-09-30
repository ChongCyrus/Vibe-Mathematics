// ============================================================================================
// PRESET DECLARATION — the loader must NOT interpolate this row's config (audit finding F2).
//
// A DSH preset is declared as a row whose config is `{id, name, description, order, plugins}`. The
// nested `plugins` list holds the preset's OWN rows, and those carry `!!js` expressions that belong
// to the preset's mount scope (cordis.patch.yml has 8 of them: `process.platform === 'win32'`).
//
// The loader interpolates a row's config — evaluates every `!!js` node — unless the row's plugin
// callback carries the "tree carrier" marker `EntryGroup.key === Symbol.for('cordis.group')`:
//     const plugin = this.runtime?.callback
//     if (plugin?.[EntryGroup.key]) return config
//     return interpolate(this.ctx, config)          — cordis-plugin-loader/src/index.ts:104-113
// `@deepseek-ai/dsh-agent-preset` (the host's own preset row) carries `static [EntryGroup.key] =
// true`, so expressions survive into the preset scope. Our module did not, which evaluated them in
// the DECLARING row's realm at boot: harmless for today's two constant platform expressions, but
// silently wrong for anything scope-dependent — and a row that never activates (all four presets
// missing from the picker, no error) as soon as one of them throws there.
//
// This suite pins (a) the marker, on the host's own symbol, and (b) its EFFECT through the real
// cordis loader, with a marker-less twin as the control: if the loader ever stopped interpolating
// unmarked rows, the twin assertion would go red and tell us the harness no longer proves anything.
//
// Usage: node tests/audit-preset-declaration-group.test.mjs
// ============================================================================================
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const GROUP = Symbol.for('cordis.group')
const declaration = await import('../preset-declaration.js')

let passed = 0, failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}
const note = (label) => console.log('  note ' + label)

// ---------------------------------------------------------------------------------------------
// 1. the marker itself (no host needed)
// ---------------------------------------------------------------------------------------------
console.log('=== 1. the group marker on the exported row callback ===')
ok(typeof declaration.apply === 'function', 'preset-declaration exports its row plugin as apply()')
ok(declaration.apply[GROUP] === true,
  'apply carries Symbol.for("cordis.group") — the marker that makes the loader return the row config untouched')
ok(Object.getOwnPropertySymbols(declaration.apply).includes(GROUP),
  '...as an own SYMBOL property (not a string key the loader would never read)')
ok(declaration.apply['cordis.group'] !== true,
  '...and NOT as a string key (the loader reads EntryGroup.key, a registered symbol)')

// ---------------------------------------------------------------------------------------------
// 2. the marker is the HOST's symbol, and the host's own preset row has it too
// ---------------------------------------------------------------------------------------------
console.log('=== 2. that symbol is the host loader\'s own EntryGroup.key ===')
function hostScopedDir() {
  const candidates = []
  if (process.env.DSH_HOST_NODE_MODULES) candidates.push(process.env.DSH_HOST_NODE_MODULES)
  const exe = dirname(process.execPath)
  candidates.push(
    join(exe, 'node_modules'),
    join(exe, 'bin', 'node_modules'),
    join(exe, '..', 'bin', 'node_modules'),
    join(exe, '..', 'lib', 'node_modules'),
    '/usr/local/lib/node_modules',
    '/usr/lib/node_modules',
  )
  for (const base of candidates) {
    const scoped = join(base, '@deepseek-ai')
    // two layouts: the host's own bundled node_modules, or a flat global install
    for (const dir of [join(scoped, 'dsh', 'node_modules', '@deepseek-ai'), scoped]) {
      if (existsSync(join(dir, 'cordis-plugin-loader', 'lib', 'index.js'))) return dir
    }
  }
  return null
}
const HOST = hostScopedDir()
const hostModule = async (rel) => {
  if (HOST === null) return null
  try { return await import(pathToFileURL(join(HOST, rel)).href) } catch (e) { return null }
}
const loaderMod = await hostModule('cordis-plugin-loader/lib/index.js')
if (loaderMod === null) {
  note('host packages are not reachable here — §2 and §3 report what they can and the effect is');
  note('cited from the host source (cordis-plugin-loader/src/index.ts:104-113, config/group.ts:7)');
} else {
  ok(loaderMod.EntryGroup !== undefined && loaderMod.EntryGroup.key === GROUP,
    'the host loader\'s EntryGroup.key IS Symbol.for("cordis.group") (the marker is not a guess)',
    String(loaderMod.EntryGroup && loaderMod.EntryGroup.key))
  const presetMod = await hostModule('dsh-agent-preset/lib/index.js')
  if (presetMod !== null) {
    const hostRow = presetMod.default ?? presetMod.AgentPreset
    ok(hostRow !== undefined && hostRow[GROUP] === true,
      'the host\'s own preset row class carries the same marker (ours now mirrors it)')
  }
}

// ---------------------------------------------------------------------------------------------
// 3. the EFFECT, through the REAL loader, against a marker-less twin as the control
// ---------------------------------------------------------------------------------------------
console.log('=== 3. through the real loader: a nested !!js survives into register() ===')
if (HOST === null) {
  note('SKIPPED: the real-cordis harness needs the host packages (see §2)')
} else {
  const scratch = mkdtempSync(join(tmpdir(), 'vibe-group-'))
  const NESTED = { __jsExpr: "process.platform === 'win32'" }
  const ROW_CONFIG = {
    id: 'vibe-math-probe',
    name: 'Probe',
    description: 'probe row',
    order: 99,
    plugins: [{ id: 'p', name: '@deepseek-ai/dsh-persona', disabled: NESTED }],
  }
  // the CONTROL: an otherwise identical row module without the marker. The loader must evaluate its
  // nested expression (to a boolean), which is what proves the harness can see the difference at all.
  const PLAIN_OUT = join(scratch, 'plain-out.json')
  writeFileSync(join(scratch, 'plain-declaration.mjs'), [
    "import { writeFileSync } from 'node:fs'",
    "export const name = 'plain-declaration'",
    'export function apply(ctx, config) { writeFileSync(process.env.PLAIN_OUT, JSON.stringify(config)) }',
    '',
  ].join('\n'))

  try {
    const cordis = await hostModule('cordis/lib/index.js')
    const Context = cordis.Context ?? cordis.default
    const Loader = loaderMod.default ?? loaderMod.Loader

    const mountRow = async (baseDir, name, captured) => {
      const ctx = new Context()
      await ctx.plugin(Loader, { baseUrl: pathToFileURL(baseDir).href + '/' })
      const loader = ctx.get('loader')
      // the service our declaration module injects; `register` is where the config lands
      ctx.plugin({
        name: 'probe-agent-presets',
        apply(child) {
          child.provide('agentPresets', {
            list: () => [],
            register: (definition) => { captured.push(definition); return async () => {} },
          })
        },
      })
      await loader.create({ id: 'row-' + name.replace(/[^\w-]/g, ''), name, config: ROW_CONFIG })
      await loader.await()
      await ctx.fiber?.dispose?.()
    }

    const captured = []
    await mountRow(REPO, './preset-declaration.js', captured)
    const got = captured[0] && captured[0].plugins && captured[0].plugins[0]
    ok(got !== undefined, 'the real loader handed a definition to agentPresets.register()')
    ok(got !== undefined && got.disabled !== null && typeof got.disabled === 'object' && got.disabled.__jsExpr === NESTED.__jsExpr,
      'the nested !!js arrives PRESERVED (still {__jsExpr}) for the preset\'s own scope',
      JSON.stringify(got && got.disabled))

    const plainCaptured = []
    process.env.PLAIN_OUT = PLAIN_OUT
    await mountRow(scratch, './plain-declaration.mjs', plainCaptured)
    const plainApplied = existsSync(PLAIN_OUT)
    const plain = plainApplied ? JSON.parse(readFileSync(PLAIN_OUT, 'utf8')) : null
    ok(plainApplied, 'CONTROL: the marker-less twin row did run (the harness is really driving the loader)')
    ok(plain !== null && typeof plain.plugins[0].disabled === 'boolean',
      'CONTROL: without the marker the loader EVALUATED the nested !!js to a boolean — so the assertion above is a real difference, not a tautology',
      JSON.stringify(plain && plain.plugins[0].disabled))
    ok(plainCaptured.length === 0, 'CONTROL: the marker-less twin registers nothing (it only records its config)')
  } catch (e) {
    ok(false, 'the real-loader harness ran without throwing', String((e && e.stack) || e))
  }
  rmSync(scratch, { recursive: true, force: true })
}

// ---------------------------------------------------------------------------------------------
// 4. a rejecting disposer must never become an unhandled rejection (Node >= 15 kills the process)
// ---------------------------------------------------------------------------------------------
console.log('=== 4. teardown rejections are swallowed, not thrown at the process ===')
{
  const NESTED = { __jsExpr: '1 + 1' }
  const ROW = { id: 'probe', name: 'Probe', description: 'd', order: 1, plugins: [NESTED] }

  // (a) the fiber unloads AFTER register() resolved: the stored disposer rejects
  {
    const unhandled = []
    const onUnhandled = (e) => unhandled.push(String(e))
    process.on('unhandledRejection', onUnhandled)
    let disposer
    const ctx = {
      logger: { warn: () => {} },
      get: (n) => (n === 'agentPresets'
        ? { register: async () => async () => { throw new Error('dispose failed (a)') } }
        : undefined),
      effect: (fn) => { disposer = fn() },
      inject: (deps, cb) => cb(ctx),
    }
    declaration.apply(ctx, ROW)
    await new Promise((r) => setTimeout(r, 10)) // let register() resolve and store the disposer
    if (typeof disposer === 'function') disposer()
    await new Promise((r) => setTimeout(r, 50))
    process.off('unhandledRejection', onUnhandled)
    ok(unhandled.length === 0, 'a rejecting disposer is swallowed on unload (no unhandled rejection)', unhandled.join(' | '))
  }

  // (b) the fiber unloads BEFORE register() resolves: the late disposer is called and rejects
  {
    const unhandled = []
    const onUnhandled = (e) => unhandled.push(String(e))
    process.on('unhandledRejection', onUnhandled)
    let release
    const gate = new Promise((r) => { release = r })
    let disposer
    const ctx = {
      logger: { warn: () => {} },
      get: (n) => (n === 'agentPresets'
        ? { register: async () => { await gate; return async () => { throw new Error('late dispose failed (b)') } } }
        : undefined),
      effect: (fn) => { disposer = fn() },
      inject: (deps, cb) => cb(ctx),
    }
    declaration.apply(ctx, ROW)
    await new Promise((r) => setTimeout(r, 10))
    if (typeof disposer === 'function') disposer() // unload first: `retired` is already true
    release()
    await new Promise((r) => setTimeout(r, 50))
    process.off('unhandledRejection', onUnhandled)
    ok(unhandled.length === 0, 'unloading before register() resolves still swallows the late disposer rejection', unhandled.join(' | '))
  }
}

console.log('')
console.log('=== PRESET DECLARATION GROUP: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
