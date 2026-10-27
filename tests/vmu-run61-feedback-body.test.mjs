#!/usr/bin/env node
// vmu RUN 61 / F-52c — THE FIFTH REQUIRED FIELD OF THE FEEDBACK FORM IS CALLED `action`, AND THE FACE READ IT AS THE
// OPERATION.
//
// THE OBSERVED DEFECT (live run 61): the root called
//   vibe_v5_feedback { action:"add", member:"r-1", category:"流程", route:"team", phenomenon:"…", impact:"…" }
// and got `{ ok:true, op:"add", recordId:"rec-3" }`. The receipt looked perfect and the record was created — but the
// stored body's fifth field was `action：add`: the verb that said WHICH OPERATION to run was written into the one field
// the form exists for ("what should change"). The member's own feedback named it: "the body's action became 'add'".
// ONE KEY, TWO MEANINGS is a write-face defect (data loss, not friction): the recommendation is simply gone.
//
// WHAT THIS SUITE PROVES:
//   1. passing `action:"add"` is refused BY NAME (`VMU_FEEDBACK_ACTION_IS_THE_OPERATION`) instead of being stored;
//   2. the refusal's hint names the field to use (`recommendation`) and the field it collides with (`action`);
//   3. `op:"add"` + `recommendation:"…"` stores THAT text as the body's action line;
//   4. the legacy body key still works when its value is not an op word (no gratuitous break for existing callers);
//   5. all five required fields still gate the call: op:add with four fields and no recommendation is refused, and the
//      refusal names the missing fifth field;
//   6. `op:"list"` shows the row that was created with a real recommendation.
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
let NOW = 1000

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, ctx) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}
const refusalOf = (r) => (r && r.parsed && r.parsed.ok === false) ? r.parsed : (r && r.thrown ? r : null)

const root = await mkdtemp(join('D:/_tmp', 'vmu-r61-feedback-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const k = b.handle.kernel
  const FIVE = { member: 'r-a', category: '流程', route: 'team', phenomenon: '现象原文', impact: '影响原文' }

  // ── ① the operation verb passed as the body field is refused by name ─────────────────────────────────────
  const wrong = await callJSON(b, 'vibe_v5_feedback', Object.assign({ op: 'add', action: 'add' }, FIVE), { kernel: k })
  const refused = refusalOf(wrong)
  ok(!!refused, 'passing action:"add" is not silently accepted', wrong)
  ok(refused && refused.code === 'VMU_FEEDBACK_ACTION_IS_THE_OPERATION',
    'and the refusal is named (a stored "action：add" would lose the recommendation with no trace)', refused)
  ok(refused && /recommendation/.test(String(refused.hint || '')),
    'the hint names the field to use for the recommendation', refused && refused.hint)

  // ── ② the body field is stored from `recommendation` ────────────────────────────────────────────────────
  const good = await callJSON(b, 'vibe_v5_feedback',
    Object.assign({ op: 'add', recommendation: '把 task_update 的合法转移写进提示词' }, FIVE), { kernel: k })
  const recId = good.parsed && good.parsed.recordId
  ok(!!recId, 'op:add with a recommendation succeeds', good)
  const readBack = recId ? await callJSON(b, 'vibe_v5_read_library', { id: recId }, { kernel: k }) : null
  const body = JSON.stringify((readBack && readBack.parsed) || {})
  ok(/action：把 task_update 的合法转移写进提示词/.test(body), 'the stored body carries the RECOMMENDATION as its action line', body.slice(0, 300))
  ok(!/action：add/.test(body), 'and never the operation verb', body.slice(0, 300))

  // ── ③ the legacy body key still works when its value is not an op word ──────────────────────────────────
  const legacy = await callJSON(b, 'vibe_v5_feedback',
    Object.assign({ op: 'add', action: '给出跨内核读回的一次真机证据' }, FIVE), { kernel: k })
  const legacyId = legacy.parsed && legacy.parsed.recordId
  ok(!!legacyId, 'the legacy `action` key still stores a real recommendation', legacy)

  // ── ④ five required fields still gate the call, and the refusal names the fifth ─────────────────────────
  const short = await callJSON(b, 'vibe_v5_feedback', Object.assign({ op: 'add' }, FIVE), { kernel: k })
  const shortRef = refusalOf(short)
  ok(!!shortRef && /action/.test(String(shortRef.message || '')),
    'op:add with four fields is refused and the message names the fifth field', shortRef)

  // ── ⑤ list still answers, with the created rows ─────────────────────────────────────────────────────────
  const listed = await callJSON(b, 'vibe_v5_feedback', { op: 'list' }, { kernel: k })
  ok(listed.parsed && listed.parsed.ok === true && listed.parsed.count >= 2,
    'op:list returns the open rows (both recommendations are readable)', listed.parsed && { count: listed.parsed.count })
} finally {
  await rm(root, { recursive: true, force: true }).catch(() => {})
}

console.log('\n=== vmu run61 feedback body: ' + (failed === 0 ? 'ALL GREEN' : 'FAILURES') + ' ' + passed + '/' + (passed + failed) + ' ===')
if (failed > 0) {
  for (const f of failures) console.error(' - ' + f)
  process.exitCode = 1
}
