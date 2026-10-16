#!/usr/bin/env node
// ★ A TEMP-ROOT PACK IS NOT FOLDED — THE STRUCTURAL FACT, GUARDED (phase-2 rounds 21/22).
//
// ★ WHAT THIS PINS, AND WHY THE FIRST VERSION OF IT FAILED. The first attempt to exercise "a pack default is really
// folded, and the receipt shows where it came from" put a pack in a temp dir and pointed `config.root` at it. It failed
// five of nine assertions. The reason is structural, not a fixture mistake: the fold-in reads the ENTRY'S OWN directory
// (`vibe-math-vmu.js` joins `here` with `packs/<id>/settings/defaults.json`), so `root` redirects the persona prompts and
// the runtime-pack reporting branch and NOTHING ELSE. That is worth guarding, because the wrong assumption is the natural
// one to make - so this file now asserts the negative, and it passes.
//
// ★ WHERE THE POSITIVE PROOF LIVES: `b1prime-pack-fold.test.mjs` uses v5r's OWN SHIPPED DEFAULTS (a key that is both in
// the pack's `settings/defaults.json` and declared in `settings/schema.js`) and asserts the fold, the provenance
// (`pack:v5r`), the non-empty precondition, and a control arm - with no temp tree and no new seam. It also proves this
// file's point from the other side: a REAL pack in the entry's own directory does fold.
//
// ★ WHAT NEITHER FILE SAYS: whether any default SHOULD be on. `packs/v5r/**` is never touched, and this fixture lives
// only in a temp dir that is removed afterwards.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const entry = await import(pathToFileURL(ENTRY).href)
const clock = () => '2026-10-09T00:00:00.000Z'
const PACK_ID = 'tmp-fold-pack'

let passed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) { passed += 1; return } failures.push(name + (detail === undefined ? '' : ' [' + String(detail).slice(0, 180) + ']')) }

const fakeCtx = () => {
  const state = { contextCalls: [], specs: [] }
  return {
    state,
    ctx: {
      effect(fn) { return fn() },
      on() { return () => {} },
      tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
      systemPrompt: { context: (p) => { state.contextCalls.push(p); return { ok: true } }, section: () => () => {}, getSectionOrder: () => 5 },
    },
  }
}
const findFeedback = (root) => {
  const seen = new Set()
  const walk = (v, d) => {
    if (!v || typeof v !== 'object' || d > 4 || seen.has(v)) return null
    seen.add(v)
    if (typeof v.enabled === 'boolean' && typeof v.delivered === 'boolean' && 'code' in v && 'stack' in v) return v
    for (const k of Object.keys(v)) { const r = walk(v[k], d + 1); if (r) return r }
    return null
  }
  return walk(root, 0)
}
const feedbackOf = (handle) => {
  for (const m of ['status', 'report', 'snapshot']) {
    if (handle && handle.kernel && typeof handle.kernel[m] === 'function') {
      try { const f = findFeedback(handle.kernel[m]()); if (f) return f } catch (e) { /* keep trying */ }
    }
  }
  return null
}

const root = mkdtempSync(join(tmpdir(), 'packfold-'))
try {
  // ── the TEMP pack: an index.js borrowed from an existing pack + a defaults.json shaped exactly like v5r's ──────
  const packDir = join(root, 'packs', PACK_ID)
  mkdirSync(join(packDir, 'settings'), { recursive: true })
  cpSync(join(REPO, 'vibe-math-vmu', 'packs', 'institute-min', 'index.js'), join(packDir, 'index.js'))
  writeFileSync(join(packDir, 'settings', 'defaults.json'), JSON.stringify({
    _comment: 'TEMPORARY fixture (rounds 21/22): proves a temp-root pack folds NOTHING. Never shipped.',
    defaults: { 'vmu.report.feedback': true, 'vmu.report.audience': 'm1' },
  }, null, 2))
  const shape = JSON.parse(readFileSync(join(packDir, 'settings', 'defaults.json'), 'utf8'))
  ok(shape && typeof shape.defaults === 'object' && shape.defaults['vmu.report.feedback'] === true,
    '★ fixture NON-EMPTY: the temp pack really states `vmu.report.feedback: true` in the documented shape',
    JSON.stringify(Object.keys(shape.defaults || {})))

  // ── ARM 1: the temp pack IS declared at startup, and still folds NOTHING ─────────────────────────────────────
  const { ctx, state } = fakeCtx()
  const handle = entry.apply(ctx, { clock, root, packs: [PACK_ID] })
  const resolved = (handle && handle.kernel && typeof handle.kernel.status === 'function')
    ? handle.kernel.status().settings.resolved : {}
  const entrySrc = resolved['vmu.report.feedback'] && resolved['vmu.report.feedback'].source
  ok(entrySrc !== 'pack:' + PACK_ID,
    '★★ STRUCTURAL FACT: a pack reached only through `config.root` is NOT folded - the fold reads the entry own directory',
    'resolved.source=' + String(entrySrc))
  const fb = feedbackOf(handle)
  ok(fb !== null, '★ the receipt is reachable through the assembled handle', fb && JSON.stringify(fb).slice(0, 60))
  ok(fb && fb.enabled === false,
    '★★ AND ITS DEFAULT ARMED NOTHING: the switch stays off, which is what "not folded" means operationally',
    fb && String(fb.enabled))
  ok(fb && fb.source === entrySrc,
    '★★ the receipt still AGREES with the kernel own account - both say the pack was not the source',
    'receipt=' + (fb && fb.source) + ' kernel=' + String(entrySrc))

  // ── ARM 2 (control): the SAME entry with NO pack declared ⇒ the outcome must be IDENTICAL ────────────────────
  const { ctx: ctx2 } = fakeCtx()
  const handle2 = entry.apply(ctx2, { clock, root })
  const resolved2 = (handle2 && handle2.kernel && typeof handle2.kernel.status === 'function')
    ? handle2.kernel.status().settings.resolved : {}
  const src2 = resolved2['vmu.report.feedback'] && resolved2['vmu.report.feedback'].source
  const fb2 = feedbackOf(handle2)
  ok(src2 === entrySrc && fb2 && fb2.source === entrySrc,
    '★ control: DECLARING the temp pack changes nothing at all (so ARM 1 measured the structural fact, not a constant)',
    'with=' + String(entrySrc) + ' without=' + String(src2) + ' receipt=' + (fb2 && fb2.source))
} finally {
  rmSync(root, { recursive: true, force: true })
}
console.log('')
console.log('=== B1PRIME PACK FOLD (temp-root negative): ' + passed + ' passed, ' + failures.length + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failures.length === 0 ? 0 : 1)
