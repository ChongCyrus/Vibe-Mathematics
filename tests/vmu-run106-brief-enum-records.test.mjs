#!/usr/bin/env node
// ROUND 106 — three defects measured on the same night's runs (105 / 106), each fixed the same round.
//
// F-106a — THE BRIEF CHECKER WAS BLIND TO ITS OWN COMMONEST FORM. Runs 105 and 106 both died at step 1 because the brief
//   wrote `` `vibe_v5_start`，参数：`{"reason": …}` `` — a backticked tool name with the object AFTER the name — and
//   `scripts/check-task-brief.mjs` only parsed `<name> {…}` (and, after round 70, `参数：{…}` inline). So it answered
//   "0 problem(s)" for two briefs that the pack refused at the first call. A checker that cannot see a call form is
//   worse than no checker: it certifies the mistake.
//
// F-106c — A DECLARED ENUM WAS NOT ENFORCED. `tests/vmu-run106-*` measured `vibe_v5_meeting_round {phase:"debate"}`,
//   a value that is not in the declared enum, accepted by the tool layer and refused only by the business layer
//   (`VMU_NO_OPEN_MEETING`) — so the caller could not tell "your phase word is not a phase" from "no meeting is open".
//   The face now refuses by name and PRINTS the legal words (a gate that refuses without saying the accepted set is a
//   riddle). Host faces (tools/*.js) already had this; pack tools did not.
//
// F-106d — A ROW ANOTHER KERNEL WROTE COULD BE ERASED BY A WRITE THAT NEVER READ IT. `snapshotRecords()` replaced the
//   whole `records` array with THIS instance's rows (`store.write`), and two kernels over one `state.json` are normal
//   (docs/02). A wrote rec-1, B wrote rec-2, A wrote rec-3 without pulling rec-2 first ⇒ A's snapshot erased B's row
//   from disk. Measured as a 2-in-10 flake of `tests/vmu-run36-records-shared.test.mjs` under load, then reproduced
//   deterministically. The write is now a merge-on-current `patch` (the same shape tasks/chat/mailbox use): rows this
//   instance does not hold are PRESERVED, rows it does hold keep its (newer) copy.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const BRIEF = join(REPO, 'scripts', 'check-task-brief.mjs')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const serr = (fn) => { try { return { value: fn() } } catch (e) { return { error: e } } }

const entry = await import(pathToFileURL(ENTRY).href)
const brief = await import(pathToFileURL(BRIEF).href)

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, kernel: handle.kernel, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, ctx) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r106-')); roots.push(d); return d }

// ── §1 F-106a: the checker must SEE the form the briefs actually use, and must derive parameters from declarations ──
console.log('=== 1. THE BRIEF CHECKER READS THE CALL FORM THE BRIEF REALLY USES (a blind checker certifies mistakes) ===')
const catalog = await brief.buildCatalog({ repo: REPO })
ok(catalog && catalog.tools instanceof Map && catalog.tools.size > 40,
  '① the catalog is built from the real declarations (host toolSpecs() + V5R_PACK_TOOLS), not a hand list', { size: catalog && catalog.tools && catalog.tools.size })

// THE EXACT SHAPE RUNS 105/106 USED — backticked name, then the words, then the object. `reason` was never a parameter.
const briefInline = [
  '## 步骤 1',
  '调用 `vibe_v5_start`，参数：`{"reason":"第 106 轮验收"}`。',
  '调用 `vibe_v5_record_progress`，参数：`{"track":"progress","body":"写完了"}`。',
  '调用 `vibe_zzz_absent_face`，参数：`{"member":"r-1"}`。',
  '',
].join('\n')
const inlineReport = brief.checkBriefText('inline.txt', briefInline, catalog)
const inlineProblems = Array.isArray(inlineReport.problems) ? inlineReport.problems : []
const inlineCodes = inlineProblems.map((p) => p && p.code)
ok(inlineProblems.length === 3,
  '①★ the checker now PARSES the inline form: three calls in, three problems out (runs 105/106 got zero)', { problems: inlineProblems })
ok(inlineCodes.includes(brief.CODES.unknownParam) && inlineProblems.some((p) => p && p.tool === 'vibe_v5_start' && p.param === 'reason'),
  '①★ `vibe_v5_start {reason}` is refused as an UNKNOWN PARAMETER of the tool it names (this is what the live run answered)', { inlineProblems })
ok(inlineProblems.some((p) => p && p.tool === 'vibe_v5_record_progress' && p.param === 'body'),
  '① the second wrong parameter (`body` is not declared; the row is written by `content`) is caught the same way — the declaration is the criterion', { inlineProblems })
ok(inlineCodes.includes(brief.CODES.unknownTool) && inlineProblems.some((p) => p && p.tool === 'vibe_zzz_absent_face'),
  '① a tool name that does not exist is still refused by name (the old form keeps working; nothing was traded for the new one)', { inlineProblems })

// A CORRECT inline brief must stay silent — a checker that only ever says "problem" would pass the assertions above
// while being useless. The pair (silent on right, loud on wrong) is the whole test.
const briefGood = [
  '## 步骤 1',
  '调用 `vibe_v5_start`，参数：`{"problem":"校验器","researcherCount":2,"academician":true}`。',
  '调用 `vibe_v5_record_progress`，参数：`{"track":"progress","title":"读完","content":"读完了","member":"r-1"}`。',
  '',
].join('\n')
const goodReport = brief.checkBriefText('good.txt', briefGood, catalog)
const goodProblems = Array.isArray(goodReport.problems) ? goodReport.problems : []
ok(goodProblems.length === 0,
  '①★ a CORRECT inline brief produces NO problem (silence on the right briefs, by name on the wrong ones)', { problems: goodProblems })

// ── §2 F-106c: a declared enum is a gate, and the gate names the legal set ─────────────────────────────────────────
console.log('=== 2. A DECLARED ENUM IS A GATE: an unknown value is refused BY NAME, and the legal words are printed ===')
const root = await mkRoot()
const b = await boot({ root })
const s = await call(b, 'vibe_v5_start', { problem: '枚举', researcherCount: 2, academician: true }, { kernel: b.handle.kernel })
ok(s.parsed && s.parsed.ok !== false, '② the institute starts (the enum gate is not blocking the normal path)', s.parsed || s)

const bad = await call(b, 'vibe_v5_meeting_round', { meeting: 'm-none', phase: 'debate', member: 'r-acad' }, { kernel: b.handle.kernel })
const badParsed = bad.parsed || bad
ok(badParsed && badParsed.ok === false && badParsed.code === 'VMU_INVALID_ARGUMENT',
  '②★ `phase:"debate"` (a word run 103/104 used and that is NOT in the enum) is refused at the TOOL LAYER, not by the business layer', badParsed)
ok(String(badParsed && badParsed.message || '').includes('debate') && /founding|heartbeat|verify-debate/.test(String(badParsed && (badParsed.message || '') + ' ' + (badParsed.hint || ''))),
  '②★ the refusal names the value it refused AND the legal set (a gate that refuses without saying the accepted words is a riddle)', badParsed)
ok(!/NO_OPEN_MEETING/.test(String(badParsed && badParsed.code || '')),
  '② the refusal is NOT `VMU_NO_OPEN_MEETING` — "your phase word is not a phase" and "no meeting is open" must not be one answer', badParsed && badParsed.code)

const legal = await call(b, 'vibe_v5_meeting_round', { meeting: 'm-none', phase: 'meeting', members: ['r-acad'] }, { kernel: b.handle.kernel })
const legalParsed = legal.parsed || legal
ok(legalParsed && legalParsed.ok === false && legalParsed.code === 'VMU_NO_OPEN_MEETING',
  '② a LEGAL value passes the gate and reaches the business layer (which refuses `VMU_NO_OPEN_MEETING` for a meeting nobody opened) — the gate is narrow, not a wall', legalParsed)

// ── §3 F-106d: a write that never read must not erase another kernel's rows ───────────────────────────────────────
console.log('=== 3. ★★ TWO KERNELS, ONE state.json: a write that never read must not erase the other writer’s row ===')
const shared = await mkRoot()
const K1 = await boot({ root: shared, packs: ['v5r'], clock: () => 1000 })
const K2 = await boot({ root: shared, packs: ['v5r'], clock: () => 1000 })
ok(K1.kernel !== K2.kernel, '③ two SEPARATE kernels over the same root (docs/02: ONE state.json, SEVERAL kernels)', { same: K1.kernel === K2.kernel })
// THE ORDER THAT FAILED: K1 writes, K2 writes, K1 writes AGAIN — and K1 never read K2's row in between.
const r1 = K1.kernel.records.put({ track: 'progress', kind: 'verified', title: 'from-k1', body: 'one', tags: ['r106'], by: 'r-1' })
const r2 = K2.kernel.records.put({ track: 'progress', kind: 'verified', title: 'from-k2', body: 'two', tags: ['r106'], by: 'r-2' })
const r3 = K1.kernel.records.put({ track: 'progress', kind: 'verified', title: 'from-k1-again', body: 'three', tags: ['r106'], by: 'r-1' })
ok(r1.ok === true && r2.ok === true && r3.ok === true, '③ all three writes were acknowledged (the fixture wrote what it claims)', { r1, r2, r3 })

const until = async (fn, ms = 4000) => {
  const t0 = Date.now()
  for (;;) {
    let v = null
    try { v = fn() } catch { v = null }
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 20))
  }
}
const idsOnDisk = () => {
  const rows = K2.kernel.store.read('records')
  return Array.isArray(rows) ? rows.map((r) => String(r && r.id)) : []
}
const allThree = await until(() => {
  const ids = idsOnDisk()
  return ids.includes(r1.id) && ids.includes(r2.id) && ids.includes(r3.id) ? ids : null
})
ok(Array.isArray(allThree) && allThree.length === 3,
  '③★★ the durable fold holds ALL THREE rows: K1’s second write did not erase the row K2 wrote (before round 106 it did, and the row was gone for everyone)', { ids: idsOnDisk(), expected: [r1.id, r2.id, r3.id] })

// AND THE READING: a THIRD kernel that has never written anything sees all three, each with its own author.
const K3 = await boot({ root: shared, packs: ['v5r'], clock: () => 1000 })
const list = K3.kernel.records.list({ track: 'progress', limit: 0 })
const byId = new Map((Array.isArray(list.items) ? list.items : []).map((h) => [String(h.id), h]))
ok(list.ok === true && list.items.length === 3,
  '③★ a THIRD kernel sees three rows (the merge is not a private pact between the two writers)', { items: list.items && list.items.map((h) => h.id) })
const owners = [r1.id, r2.id, r3.id].map((id) => (byId.get(String(id)) || {}).owner)
ok(owners[0] === 'r-1' && owners[1] === 'r-2' && owners[2] === 'r-1',
  '③★ each row still carries ITS OWN author (r-1 / r-2 / r-1): preserving a row must preserve who wrote it', { owners })

for (const r of roots) await rm(r, { recursive: true, force: true })

console.log('')
if (failed > 0) { console.error('FAILURES:'); for (const f of failures) console.error(' - ' + f) }
console.log('=== VMU RUN106 BRIEF/ENUM/RECORDS: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed === 0 ? 0 : 1)
