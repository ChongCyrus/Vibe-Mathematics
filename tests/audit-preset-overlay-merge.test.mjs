// tests/audit-preset-overlay-merge.test.mjs — Round 5 / task-34: U14's DECLARABLE OVERLAY must really merge.
//
// WHY THIS TEST EXISTS. The overlay is the only sanctioned way to light vmu's tool faces on a real host without
// changing the shipped default (zero mechanism must stay zero). Its FIRST design put `overlay` inside the preset
// row's own config; because a loader patch REPLACES a row's config (it does not merge), that destroyed the preset
// (`agent-preset/not-found: Unknown agent preset: vibe-math-vmu`, captured from a real session transcript).
//
// THE TRAP THIS TEST AVOIDS: `dsh --dump-config` shows the LOADER TREE, not the runtime definition - the merge
// happens at REGISTER time, so the dump can neither prove nor disprove it. A `faces:` string in the dump is just
// the patch payload. That false positive/false negative pair is why this file drives `apply()` directly and reads
// what the module actually hands to `agentPresets.register`.
//
// The probe was written by vmu-core and is landed here (tests/** is the verification face) with two additions of
// my own: BOTH row orders are exercised (the reverse order proves the merge does not depend on apply order), and
// the no-registry path is covered (a host without agentPresets must not throw).
//
// Run: node tests/audit-preset-overlay-merge.test.mjs
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')

// The overlay registry lives in MODULE scope: an overlay applied once stays visible to later registrations of the
// same preset id **in the same process**. A real host applies each row once, so that is not a defect - but it means
// a test that shares one module instance would let case ① pollute case ③ (measured: the "no overlay" case came out
// with `faces` merged in). Every case therefore gets its OWN module instance via a cache-busting query, so it is
// order-independent and cannot silently pass/fail because of a sibling case.
let seq = 0
const fresh = () => import(new URL('../preset-declaration.js?case=' + (++seq), import.meta.url).href)
const m = await fresh()

let pass = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { pass += 1; console.log('  ok   ' + label) } else { failed += 1; console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

const SHIPPED = {
  id: 'vibe-math-vmu',
  name: 'Vibe Math Unify',
  description: 'x',
  order: 25,
  plugins: [
    { id: 'persona', name: 'p', config: { prefix: 'hello' } },
    { id: 'vibe-math-vmu', name: 'dsh-vibe-math/vibe-math-vmu/vibe-math-vmu.js', config: { vmu: { tools: { enabled: true } } } },
  ],
}
const OVERLAY_ROW = {
  overlayFor: 'vibe-math-vmu',
  rows: { 'vibe-math-vmu': { vmu: { tools: { faces: ['*'] }, packs: { active: ['v5r'] } } } },
}

/** Drive apply() with a fake ctx that CAPTURES what reaches agentPresets.register (and the logger). */
const mkCtx = () => {
  const state = { registered: [], warns: [], infos: [] }
  const ctx = {
    logger: { warn: (s) => state.warns.push(String(s)), info: (s) => state.infos.push(String(s)) },
    get: (n) => (n === 'agentPresets'
      ? { register: async (def) => { state.registered.push(JSON.parse(JSON.stringify(def))); return () => {} } }
      : undefined),
    effect: (fn) => fn(),
  }
  return { ctx, state }
}

/**
 * Apply the rows, then wait for the register microtask chain.
 * `order`: 'preset-first' = the ADVERSE order that broke design v1; 'overlay-first' = the other order.
 */
const run = async (rowsConfig, presetConfig = SHIPPED, order = 'preset-first') => {
  const mod = await fresh()
  const { ctx, state } = mkCtx()
  const presetRow = () => mod.apply(ctx, presetConfig)
  const overlayRow = () => (rowsConfig !== null ? mod.apply(ctx, rowsConfig) : undefined)
  if (order === 'preset-first') { presetRow(); overlayRow() } else { overlayRow(); presetRow() }
  await new Promise((r) => setTimeout(r, 10))
  return state
}

// ── 0. the module really exposes the overlay primitives (a renamed export would make everything below vacuous)
ok(typeof m.apply === 'function' && typeof m.applyOverlay === 'function' && typeof m.overlayForPreset === 'function',
  'the module exports apply + applyOverlay + overlayForPreset',
  Object.keys(m))

// ── ① ADVERSE ORDER (preset row applied BEFORE the overlay row - exactly what broke the first design)
console.log('=== ① adverse order: preset row first, overlay row second ===')
{
  const st = await run(OVERLAY_ROW, SHIPPED, 'preset-first')
  const def = st.registered[0]
  const inner = def && def.plugins.find((r) => r.id === 'vibe-math-vmu')
  const persona = def && def.plugins.find((r) => r.id === 'persona')
  ok(st.registered.length === 1, 'exactly one preset was registered')
  ok(def.id === 'vibe-math-vmu' && def.order === 25, '★ identity intact (id + order) - design v1 lost this')
  ok(def.plugins.length === SHIPPED.plugins.length, 'plugin list intact')
  ok(inner.config.vmu.tools.enabled === true, '★ deep merge, not replace: the inner row KEPT its own field')
  ok(JSON.stringify(inner.config.vmu.tools.faces) === '["*"]', '★ the overlay reached the INNER row (tools.faces)')
  ok(JSON.stringify(inner.config.vmu.packs.active) === '["v5r"]', '★ the overlay reached the INNER row (packs.active)')
  ok(JSON.stringify(persona.config) === JSON.stringify({ prefix: 'hello' }), 'other rows untouched')
  ok(JSON.stringify(def).indexOf('overlay') === -1, '★ no leftover overlay/overlayFor key in the definition')
  ok(JSON.stringify(SHIPPED.plugins).indexOf('faces') === -1, 'the shipped config was NOT mutated in place')
}

// ── ② REVERSE ORDER (my addition: the merge must not depend on apply order)
console.log('=== ② reverse order: overlay row first, preset row second ===')
{
  const st = await run(OVERLAY_ROW, SHIPPED, 'overlay-first')
  const def = st.registered[0]
  const inner = def && def.plugins.find((r) => r.id === 'vibe-math-vmu')
  ok(st.registered.length === 1 && def.id === 'vibe-math-vmu', 'identity intact in the reverse order too')
  ok(inner && inner.config.vmu.tools.enabled === true && JSON.stringify(inner.config.vmu.tools.faces) === '["*"]',
    '★ the merge happens in EITHER row order (the microtask chain waits for both applies)', inner && inner.config)
}

// ── ③ no overlay ⇒ zero mechanism, byte-identical to shipped
console.log('=== ③ no overlay row ⇒ zero mechanism ===')
{
  const st = await run(null)
  ok(st.registered.length === 1, 'registered')
  ok(JSON.stringify(st.registered[0].plugins) === JSON.stringify(SHIPPED.plugins), '★ plugins byte-identical to shipped')
  ok(st.registered[0].id === 'vibe-math-vmu' && st.registered[0].order === 25, 'identity intact')
  ok(st.warns.length === 0, 'and nothing was warned about')
}

// ── ④ an unmatched row id ⇒ NAMED warning (captured from the injected logger) and nothing changes
console.log('=== ④ unmatched row id ⇒ named warning + unchanged definition ===')
{
  const st = await run({ overlayFor: 'vibe-math-vmu', rows: { 'no-such-row': { a: 1 } } })
  ok(st.warns.length === 1 && /no-such-row/.test(st.warns[0]), '★ the typo is NAMED (logger.warn captured)', st.warns)
  ok(JSON.stringify(st.registered[0].plugins) === JSON.stringify(SHIPPED.plugins), 'definition unchanged')
}

// ── ⑤ the destroyed-config guard (the design-v1 failure) ⇒ named warning + nothing registered
console.log('=== ⑤ a config with no identity ⇒ warn naming cause AND fix, nothing registered ===')
{
  const st = await run(null, { overlay: { 'vibe-math-vmu': { vmu: {} } } })
  ok(st.registered.length === 0, '★ nothing registered from a config with no identity')
  ok(st.warns.some((w) => /REPLACED by a patch/.test(w) && /OVERLAY row/.test(w)),
    '★ the warning names the CAUSE and the FIX', st.warns)
}

// ── ⑥ my addition: a host WITHOUT agentPresets must not throw (defensive path)
console.log('=== ⑥ a host without agentPresets is a no-op, not a crash ===')
{
  let threw = null
  try {
    m.apply({ logger: { warn: () => {}, info: () => {} }, get: () => undefined }, SHIPPED)
    await new Promise((r) => setTimeout(r, 5))
  } catch (e) { threw = String((e && e.message) || e) }
  ok(threw === null, 'apply() with no agentPresets service neither throws nor registers', threw)
}

console.log('')
console.log('=== PRESET OVERLAY MERGE: ' + pass + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
