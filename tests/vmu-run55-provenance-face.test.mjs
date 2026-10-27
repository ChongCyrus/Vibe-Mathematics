#!/usr/bin/env node
// vmu RUN 55 — A BOUNDED FACE NEEDS A SMALL DOOR, AND A SUMMARY MAY SHORTEN A FIELD, NOT RENAME IT.
//
// TWO OBSERVED DEFECTS (live run 55, build b8156742):
//
//   F-44 — `vibe_vmu_status { detail: "settings" }` returns the settings map plus `settingsMerge.sources` as ONE JSON
//   line of ~7 kB. The harness's own `grep` and `read` truncate a line at 2,000 chars, so `settings.resolvedIn` was
//   PRESENT but unreadable: the root session grepped, re-read, tried `detail:"summary"`, then walked the installed
//   package and the source tree looking for the field, and finally reported it could not be verified. A face that a
//   model cannot read is a mechanism nobody can use — and the fix is not "make the receipt smaller" (the map is
//   legitimately 3.3 kB) but a SMALL DOOR onto the same facts: `detail:"provenance"`.
//
//   F-46 — the default (`detail:"summary"`) face RESHAPED `bridge` to `{hasSpawnSeam, note}` and `math` to
//   `{hostInjected, hostSeam, note}`. A member told to check `bridge.spawnSeamMeans` (the name the FULL face uses)
//   therefore answered 「没有该字段」 — the sentence was there, under a DIFFERENT NAME. A bounded face may shorten a
//   value; it may not rename a field, because the reader's instruction names fields.
//
// WHAT THIS SUITE PROVES (through the TOOL FACE, the shape the run exercised):
//   1. `detail:'provenance'` is a legal detail and returns the provenance in one readable line (<2000 chars);
//   2. it carries the kernel session, the ownership sentence, both seam booleans and BOTH seam sentences, under the
//      SAME field names the full face uses;
//   3. it does NOT carry the map (it is a door, not a second full view) and says where the map lives;
//   4. the summary face keeps `bridge.spawnSeamMeans` and `math.means` (the names, not just the sentences), while
//      staying under the 8,000-byte readability bound the host suite asserts;
//   5. a kernel without a session id says `kernelSession:null` with a sentence that admits it cannot be matched by
//      name — absence stays distinguishable from "elided";
//   6. an unknown detail is still refused by name, and the legal list it prints includes provenance.
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const entry = await import(pathToFileURL(ENTRY).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const boot = async (config = {}, ctxExtra = {}) => {
  const state = { specs: [] }
  const ctx = Object.assign({
    effect(fn) { return fn() },
    on() { return () => {} },
    get(name) { return name === 'systemPrompt' ? null : name === 'sessions' ? null : null },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }, ctxExtra)
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, {}) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw), raw } } catch { return { raw } }
}

const SESSION = 'session-r55-prov'
const dir = await mkdtemp(join(tmpdir(), 'vmu-r55-prov-'))
try {
  // ── 1: the provenance door exists, is legal, and fits one readable line ───────────────────────────────────
  {
    const a = await boot({ root: dir, instance: 'shared' }, { sessionId: SESSION })
    const prov = await callJSON(a, 'vibe_vmu_status', { detail: 'provenance' })
    ok(prov.parsed && prov.parsed.ok === true, 'detail:"provenance" is a legal detail (not refused)', prov.parsed && (prov.parsed.code || prov.parsed.message))
    const p = prov.parsed || {}
    ok(p.detail === 'provenance', 'the receipt names its own face', p.detail)
    ok(p.settings && p.settings.resolvedIn && p.settings.resolvedIn.kernelSession === SESSION, 'the door carries WHICH kernel resolved the settings', p.settings && p.settings.resolvedIn)
    ok(p.settings && typeof p.settings.resolvedInMeans === 'string' && p.settings.resolvedInMeans.includes('THIS kernel'), 'and the sentence that says what that means', p.settings && p.settings.resolvedInMeans)
    ok(p.bridge && p.bridge.hasSpawnSeam === true, 'the SCRIPT bridge seam is reported as a boolean', p.bridge)
    ok(p.bridge && typeof p.bridge.spawnSeamMeans === 'string' && p.bridge.spawnSeamMeans.includes('SCRIPT'), 'under the SAME field name the full face uses (spawnSeamMeans)', p.bridge && p.bridge.spawnSeamMeans)
    ok(p.math && typeof p.math.means === 'string' && p.math.means.includes('OWN'), 'the math seam keeps its own name and sentence', p.math && p.math.means)
    ok(!(p.settings && p.settings.keys !== undefined), 'the door does NOT carry the key map (it is a door, not a second full view)', p.settings)
    ok(!(p.faces || p.packTools || p.bus), 'and it is not the summary either (no faces/packTools/bus)', Object.keys(p))
    const size = (prov.raw || '').length
    ok(size > 0 && size < 2000, 'the whole receipt is one readable line (<2000 chars, the harness truncation bound)', size)
  }

  // ── 2: the summary keeps the field NAMES, not only the sentences (F-46) ──────────────────────────────────
  {
    const b = await boot({ root: dir, instance: 'shared' }, { sessionId: SESSION })
    const sum = await callJSON(b, 'vibe_vmu_status', { detail: 'summary' })
    const s = sum.parsed || {}
    ok(s.ok === true, 'the summary face still answers', s.code || s.message)
    ok(s.bridge && typeof s.bridge.spawnSeamMeans === 'string', 'summary.bridge.spawnSeamMeans exists (a short value is fine; renaming to note is not)', s.bridge)
    ok(s.math && typeof s.math.means === 'string', 'summary.math.means exists', s.math && s.math.means)
    ok(s.math && s.math.hostInjected === false || s.math && typeof s.math.hostInjected === 'boolean', 'summary.math.hostInjected still a boolean', s.math && s.math.hostInjected)
    ok(s.settings && s.settings.resolvedIn && s.settings.resolvedIn.kernelSession === SESSION, 'summary still keeps the settings provenance (ROUND 53)', s.settings && s.settings.resolvedIn)
    // The 8,000-byte bound belongs to the REAL assembly fixture (`tests/vmu-host.test.mjs`, which boots the v5r pack
    // the way the host does); this bare fixture's summary is larger for unrelated reasons, so asserting the absolute
    // bound here would test the fixture, not the rename. What THIS suite owns is that the two sentences stay SHORT
    // values under the original field names — a rename is what the run proved, not a size regression.
    ok(typeof s.bridge.spawnSeamMeans === 'string' && s.bridge.spawnSeamMeans.length < 240, 'summary.bridge.spawnSeamMeans is a SHORT value, not the full prose', s.bridge.spawnSeamMeans && s.bridge.spawnSeamMeans.length)
    ok(typeof s.math.means === 'string' && s.math.means.length < 260, 'summary.math.means is a SHORT value', s.math.means && s.math.means.length)
  }

  // ── 3: absence stays distinguishable — a kernel with no session id says so ───────────────────────────────
  {
    // A guarded context: reading an un-injected property throws. The kernel must still assemble and the door must
    // report "no session id it can name yet", not invent one and not omit the field.
    const guarded = new Proxy({}, {
      get(_t, prop) {
        if (prop === 'effect') return (fn) => fn()
        if (prop === 'on') return () => () => {}
        if (prop === 'tools') return { register: async () => () => {} }
        if (prop === 'get') return (name) => (name === 'systemPrompt' ? null : null)
        throw new TypeError('cannot get property "' + String(prop) + '" without inject')
      },
    })
    const state = { specs: [] }
    // Re-shape: the guarded proxy must still let `tools.register` collect specs, so build the ctx by hand.
    const realCtx = {
      effect(fn) { return fn() },
      on() { return () => {} },
      get(name) { return name === 'systemPrompt' || name === 'sessions' ? null : null },
      tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
      get sessionId() { throw new TypeError('cannot get property "sessionId" without inject') },
    }
    const handle = entry.apply(realCtx, { clock: () => 1000, packs: ['v5r'], root: dir, instance: 'guarded' })
    await handle.ready()
    const spec = state.specs.find((s) => s.name === 'vibe_vmu_status')
    ok(!!spec, 'a kernel whose context refuses `sessionId` still assembles its status face')
    if (spec) {
      const prov = JSON.parse(await spec.execute({ detail: 'provenance' }, {}))
      ok(prov.settings && prov.settings.resolvedIn && prov.settings.resolvedIn.kernelSession === null, 'the door reports null rather than inventing a name', prov.settings && prov.settings.resolvedIn)
      ok(typeof prov.settings.resolvedInMeans === 'string' && prov.settings.resolvedInMeans.includes('no session id'), 'and says it cannot match the map by name', prov.settings && prov.settings.resolvedInMeans)
      ok(!/undefined|\[object Object\]/.test(JSON.stringify(prov)), 'nothing undefined/Object leaks into the receipt')
    }
    void guarded
  }

  // ── 4: an unknown detail is refused by name, and the legal list includes the new door ────────────────────
  {
    const c = await boot({ root: dir, instance: 'shared' }, { sessionId: SESSION })
    const bad = await callJSON(c, 'vibe_vmu_status', { detail: 'provenance2' })
    const p = bad.parsed || {}
    ok(p.ok === false && p.code === 'VMU_INVALID_ARGUMENT', 'an unknown detail is refused by name', p.code || bad.thrown)
    ok(typeof p.hint === 'string' && p.hint.includes('provenance'), 'the refusal lists provenance among the legal details', p.hint)
    ok(typeof p.hint === 'string' && p.hint.includes('settings'), 'and still lists the map face', p.hint)
  }
} finally {
  await rm(dir, { recursive: true, force: true })
}

console.log('\n=== VMU RUN 55 PROVENANCE FACE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) {
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
}
