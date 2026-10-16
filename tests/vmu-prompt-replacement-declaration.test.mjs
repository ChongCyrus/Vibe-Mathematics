#!/usr/bin/env node
// ★ REPLACING AN EXISTING SURFACE IS A DECLARATION (phase-3 round 11 · task-235) — the guard for the third branch
// in `kernel/prompt/index.js` `register()`.
//
// WHY THIS FILE EXISTS: `register()` used to guard only immutable sections and pack-versus-pack collisions, so a
// PACK section colliding with a same-named MUTABLE FRAMEWORK section fell straight to `registry.set` — the
// framework text disappeared, the pack text rendered, and NOTHING was refused or reported. MEASURED before the fix
// (see the round report): rendered framework text = false, rendered pack text = true, refusal = none.
//
// WHAT IT PINS: a pack may replace a mutable framework section ONLY by declaring `replaces: ['<name>']`; undeclared
// is refused by name with a hint that names the field; declared is allowed AND the assembly receipt names what was
// displaced (`replacedSections` / `replacedCount`). It also pins that the two PRE-EXISTING guards still fire
// (pack-versus-pack, and immutable sections), and that DEPLOYMENT overrides still work as a READ-TIME merge
// (`overrideFor`) that does NOT go through `register()` — i.e. the fix does not conflict with them.
//
// ★ WHAT IT DOES NOT CLAIM: it does not claim anything about the CONTENT of a replacement (that belongs to the
// pack's own assertions), and it does not claim the two-pack case can be resolved by declaration — that refusal
// is unchanged and intentional.
//
// ★ TARGET-ADDRESSED: `REPO` comes from THIS FILE's own location, so a copy of the tree carries a copy of this test
// that judges the COPY (which is what makes the copy-based counterexample in the round report meaningful).
import { pathToFileURL, fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const { createPromptPipeline } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu/kernel/prompt/index.js')).href)
const CLOCK = () => '2026-01-01T00:00:00.000Z'
const CTX = { member: 'acad', role: 'academician', roleLabel: '院士', phase: 'founding' }

let passed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) { passed += 1; return } failures.push(name + (detail === undefined ? '' : ' [' + String(detail).slice(0, 220) + ']')) }

/** Build a pipeline; return either the thrown refusal or the assembled result. */
const build = async (sections, extra = {}) => {
  let pipe = null, refused = null
  try { pipe = createPromptPipeline(Object.assign({ sections, clock: CLOCK }, extra)) } catch (e) { refused = e }
  if (refused) return { refused }
  const r = await pipe.assemble(CTX)
  return { pipe, r }
}
const FW = { name: 'fw-policy', order: 300, source: 'kernel', text: 'FRAMEWORK-POLICY-TEXT' }

// ── 0. CONTROL: the framework section alone really renders (so "the text disappeared" below is a real change) ────
{
  const c = await build([FW])
  ok(!c.refused && String(c.r.text).includes('FRAMEWORK-POLICY-TEXT'),
    '★ NON-EMPTY PRECONDITION: with only the framework section registered, its text really renders',
    c.refused ? String(c.refused.message) : String(c.r.text).slice(0, 120))
  ok(Array.isArray(c.r.replacedSections) && c.r.replacedSections.length === 0 && c.r.replacedCount === 0,
    '★ CONTROL: nothing was replaced, so the record is EMPTY (the field is not always-populated noise)',
    JSON.stringify(c.r.replacedSections))
}

// ── 1. UNDECLARED: a pack section replacing a framework section is refused BY NAME ───────────────────────────────
{
  const c = await build([FW, { name: 'fw-policy', order: 700, source: 'pack:v5r', text: 'PACK-REPLACEMENT-TEXT' }])
  ok(c.refused && c.refused.code === 'VMU_MIDDLEWARE_FAILED',
    '★★ UNDECLARED REPLACEMENT IS REFUSED BY NAME (it used to overwrite silently)',
    c.refused ? c.refused.code + ': ' + c.refused.message : 'no refusal — the silent overwrite returned')
  ok(c.refused && /replaces/.test(String(c.refused.hint)),
    '★ the refusal HINT names the field to add, so the author is told what to write',
    c.refused ? String(c.refused.hint) : '(no refusal)')
}

// ── 2. DECLARED: allowed, the replacement renders, and the RECEIPT names what was displaced ──────────────────────
{
  const c = await build([FW, { name: 'fw-policy', order: 700, source: 'pack:v5r', replaces: ['fw-policy'], text: 'PACK-REPLACEMENT-TEXT' }])
  ok(!c.refused, '★ DECLARED replacement is allowed', c.refused ? String(c.refused.message) : undefined)
  if (!c.refused) {
    ok(String(c.r.text).includes('PACK-REPLACEMENT-TEXT') && !String(c.r.text).includes('FRAMEWORK-POLICY-TEXT'),
      '★★ THE REPLACEMENT REALLY RENDERS AND THE DISPLACED TEXT IS GONE (not a silent non-injection: the trap where the replacement shares the disabled name)',
      JSON.stringify({ pack: String(c.r.text).includes('PACK-REPLACEMENT-TEXT'), framework: String(c.r.text).includes('FRAMEWORK-POLICY-TEXT') }))
    const rec = (c.r.replacedSections || [])[0]
    ok(c.r.replacedCount === 1 && rec && rec.section === 'fw-policy' && rec.displacedSource === 'kernel',
      '★★ THE RECEIPT NAMES WHAT WAS DISPLACED, attribute scope included',
      JSON.stringify(c.r.replacedSections))
    ok(rec && rec.replacedBy === 'pack:v5r' && JSON.stringify(rec.declaredReplaces) === JSON.stringify(['fw-policy']),
      '★ …and names WHO replaced it and which declaration authorised it',
      JSON.stringify(rec))
    const st = c.pipe.status().sections.filter((s) => s.name === 'fw-policy')
    ok(st.length === 1 && st[0].source === 'pack:v5r' && st[0].range === 'pack',
      '★ the registry holds the REPLACEMENT (one entry, pack range), not two',
      JSON.stringify(st))
  }
}

// ── 3. THE TWO PRE-EXISTING GUARDS STILL FIRE (the ruling: keep pack-versus-pack exactly as it is; do not ban overwriting wholesale) ──
{
  const pp = await build([{ name: 'x-pack', order: 700, source: 'pack:a', text: 'A' }, { name: 'x-pack', order: 701, source: 'pack:b', text: 'B' }])
  ok(pp.refused && pp.refused.code === 'VMU_MIDDLEWARE_FAILED' && /two pack sections/.test(String(pp.refused.message)),
    '★ pack-versus-pack is STILL refused, unchanged', pp.refused ? pp.refused.code + ' ' + pp.refused.message : 'no refusal')
  const imm = await build([{ name: 'state', order: 10, source: 'kernel', text: 'FACTS' }, { name: 'state', order: 700, source: 'pack:a', replaces: ['state'], text: 'HIJACK' }])
  ok(imm.refused && imm.refused.code === 'VMU_NOT_PERMITTED',
    '★ an IMMUTABLE section cannot be replaced even WITH a declaration (the immutable guard runs first)',
    imm.refused ? imm.refused.code : 'no refusal')
  // a pack section replacing a FRAMEWORK section that does NOT collide is untouched by this change
  const plain = await build([FW, { name: 'p-new', order: 701, source: 'pack:a', text: 'PLAIN-ADDITION' }])
  ok(!plain.refused && String(plain.r.text).includes('PLAIN-ADDITION') && plain.r.replacedCount === 0,
    '★ a pack section that collides with NOTHING is unaffected (no record, no refusal)',
    plain.refused ? String(plain.refused.message) : JSON.stringify(plain.r.replacedSections))
}

// ── 4. DEPLOYMENT OVERRIDE IS A READ-TIME MERGE (verified, not assumed): it still works and overrideMerge moves ──
{
  const c = await build([FW], { overrides: { 'fw-policy': 'OVERRIDDEN-BY-CALLER' } })
  ok(!c.refused && String(c.r.text).includes('OVERRIDDEN-BY-CALLER') && !String(c.r.text).includes('FRAMEWORK-POLICY-TEXT'),
    '★★ DEPLOYMENT OVERRIDE STILL WORKS: the override text renders in place of the section text',
    c.refused ? String(c.refused.message) : JSON.stringify({ overridden: String(c.r.text).includes('OVERRIDDEN-BY-CALLER') }))
  ok(c.r.overrideMerge && c.r.overrideMerge.fromCaller === 1 && c.r.overrideMerge.declared === 0,
    '★★ `overrideMerge` still moves (it records the caller-side override)',
    JSON.stringify(c.r.overrideMerge))
  ok(c.r.replacedCount === 0,
    '★★ AND AN OVERRIDE IS NOT A REPLACEMENT: it does not go through `register()`, so it records no displacement (the ruling\'s claim, verified)',
    JSON.stringify(c.r.replacedSections))
}

console.log('')
console.log('=== VMU PROMPT REPLACEMENT DECLARATION: ' + passed + ' passed, ' + failures.length + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failures.length === 0 ? 0 : 1)
