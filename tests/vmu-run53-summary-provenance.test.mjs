#!/usr/bin/env node
// vmu RUN 53 — A BOUNDED VIEW MAY DROP THE MAP, NOT THE PROVENANCE OF THE NUMBER IT KEEPS.
//
// THE OBSERVED DEFECT (live run 53, step 2): the root read the DEFAULT face
//   vibe_vmu_status { detail: "summary" }
// and got `settings: {"keys":87,"engineEnabled":true,"dryRun":false,"resolvedCount":75,"note":"summary: counts only; …"}`.
// `settings.resolvedIn.kernelSession` and `settings.resolvedInMeans` were gone — and those two fields exist (ROUND 52)
// for exactly one purpose: telling a reader whether the settings map it is holding was resolved by THIS kernel or by
// another one over the same workspace. The member then compared its `[总任务]` line with that summary, found no
// provenance, and could only report 「无法验证是否同一内核」 — the summary had kept the count and dropped the answer.
//
// WHAT THIS SUITE PROVES (all through the TOOL FACE, the shape the run exercised):
//   1. `detail:'summary'` keeps `settings.resolvedIn` (with the kernel session) and `resolvedInMeans`;
//   2. it still keeps the MAP itself out (bounded), and says one word gets it back;
//   3. `detail:'settings'` carries the map AND the same provenance, so the elided field is retrievable, not lost;
//   4. a kernel built without a session id reports `kernelSession:null` with a sentence that says the map cannot be
//      matched to a session by name — absence stays distinguishable from "provenance elided";
//   5. two kernels over one root keep their own provenance in the summary (no collapse into one claim).
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
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}

const RUN = '第53轮：设置按内核解析、采纳决定的归属、群聊管理员解析（整数平方和 n^2+n 恒偶）'
const dir = await mkdtemp(join(tmpdir(), 'vmu-r53-sum-'))
try {
  // ── 1: the default face keeps the provenance of the count it keeps ────────────────────────────────────────
  {
    const a = await boot({ root: dir, instance: 'shared' }, { sessionId: 'session-r53-summary' })
    const summary = await callJSON(a, 'vibe_vmu_status', { detail: 'summary' })
    ok(summary.parsed && summary.parsed.ok === true, 'the default status face answers', summary.parsed && summary.parsed.code)
    const st = summary.parsed && summary.parsed.settings
    ok(st && typeof st === 'object', 'the summary still carries a settings section', st && Object.keys(st))
    ok(st && st.resolvedIn && st.resolvedIn.kernelSession === 'session-r53-summary',
      '★ the summary names the kernel that resolved the map (this is the field run 53 found missing)',
      st && st.resolvedIn)
    ok(st && typeof st.resolvedInMeans === 'string' && st.resolvedInMeans.includes('own'),
      '★ and says what that map is evidence about', st && st.resolvedInMeans)
    ok(st && typeof st.resolvedCount === 'number' && st.resolvedCount > 0,
      'the bounded count stays beside the provenance', st && st.resolvedCount)
  }

  // ── 2/3: the map is still elided from the summary, and still reachable one word away ─────────────────────
  {
    const a = await boot({ root: dir, instance: 'shared' }, { sessionId: 'session-r53-settings' })
    const started = await callJSON(a, 'vibe_v5_start', { problem: RUN, researcherCount: 2 })
    ok(started.parsed && started.parsed.ok === true, 'the run objective was written (so there is a runtime value to read)',
      started.parsed && started.parsed.code)
    const summary = await callJSON(a, 'vibe_vmu_status', { detail: 'summary' })
    const st = summary.parsed && summary.parsed.settings
    ok(st && st.resolved === undefined, 'the MAP itself is elided from the bounded face (that part of the bound is intact)',
      st && Object.keys(st))
    ok(st && typeof st.note === 'string' && /PROVENANCE/.test(st.note) && /detail:"full"/.test(st.note),
      'the note says which half was elided and which half was kept', st && st.note)
    const full = await callJSON(a, 'vibe_vmu_status', { detail: 'settings' })
    const obj = full.parsed && full.parsed.settings && full.parsed.settings.resolved && full.parsed.settings.resolved['vmu.turn.objective']
    ok(obj && obj.value === RUN, 'detail:"settings" carries the runtime value the summary had only counted', obj)
    ok(full.parsed.settings.resolvedIn && full.parsed.settings.resolvedIn.kernelSession === 'session-r53-settings',
      'and the same provenance as the summary - the elided field is retrievable, never lost',
      full.parsed.settings.resolvedIn)
  }

  // ── 4: no session id is stated as such, not silently omitted ──────────────────────────────────────────────
  {
    const bare = await boot({ root: dir, instance: 'shared' })
    const summary = await callJSON(bare, 'vibe_vmu_status', { detail: 'summary' })
    const st = summary.parsed && summary.parsed.settings
    ok(st && st.resolvedIn && st.resolvedIn.kernelSession === null,
      'a kernel with no session id reports kernelSession:null (distinguishable from an elided field)', st && st.resolvedIn)
    ok(st && typeof st.resolvedInMeans === 'string' && /session/.test(st.resolvedInMeans),
      'and its sentence says the map cannot be matched to a session by name', st && st.resolvedInMeans)
  }

  // ── 5: two kernels over one root each keep their OWN provenance in the summary ────────────────────────────
  {
    const a = await boot({ root: dir, instance: 'shared' }, { sessionId: 'session-r53-a' })
    const b = await boot({ root: dir, instance: 'shared' }, { sessionId: 'session-r53-b' })
    const started = await callJSON(a, 'vibe_v5_start', { problem: RUN, researcherCount: 2 })
    ok(started.parsed && started.parsed.ok === true, 'kernel A wrote the objective', started.parsed && started.parsed.code)
    const sa = await callJSON(a, 'vibe_vmu_status', { detail: 'summary' })
    const sb = await callJSON(b, 'vibe_vmu_status', { detail: 'summary' })
    ok(sa.parsed.settings.resolvedIn.kernelSession === 'session-r53-a' &&
      sb.parsed.settings.resolvedIn.kernelSession === 'session-r53-b',
    'two summary reads over the same root name two different resolvers (no collapse into one claim)',
    { a: sa.parsed.settings.resolvedIn, b: sb.parsed.settings.resolvedIn })
    const fa = await callJSON(a, 'vibe_vmu_status', { detail: 'settings' })
    const fb = await callJSON(b, 'vibe_vmu_status', { detail: 'settings' })
    ok(fa.parsed.settings.resolved['vmu.turn.objective'].value === RUN &&
      fb.parsed.settings.resolved['vmu.turn.objective'].value !== RUN,
    'and the underlying maps really do differ (so the provenance is not cosmetic)',
    { a: fa.parsed.settings.resolved['vmu.turn.objective'].value, b: fb.parsed.settings.resolved['vmu.turn.objective'].value })
  }
} finally {
  await rm(dir, { recursive: true, force: true }).catch(() => {})
}

console.log('\nTOTAL ' + (passed + failed) + ' PASS ' + passed + ' FAIL ' + failed)
if (failed > 0) { console.error('\nFAILURES:'); for (const f of failures) console.error(' - ' + f) }
process.exit(failed === 0 ? 0 : 1)
