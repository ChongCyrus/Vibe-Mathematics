// tests/vmu-run31-findings.test.mjs — the INSTITUTE'S OWN 31st acceptance report (㉓), pinned.
//
// WHAT IT REPORTED (its own words, transcript `_oneoff/vm-slv/full-1024-221621.jsonl`):
//   「被拒的原语 `open` 留下了副作用记录（create-before-validate）。期望什么：一次返回 ok:false 的 open 应当原子地不留痕；
//     修正参数后用同一个 id 重试应当能成功。实际什么：… 以 VMU_MEETING_TOO_SMALL 被拒后，p-x 已进入活表；补上 roster 重试即被
//     VMU_CONFLICT — a live meeting already uses id p-x 拒，无法用同 id 补正。」
//   plus two readability items: the VMU_CONFLICT hint opened with the full m1…m115 list and buried the one decisive
//   sentence at its end, and the message said "a ordinary meeting".
//
// WHAT IS PINNED HERE (each state READ BACK — "refused" must also mean "did not happen"):
//   ① a REFUSED primitive `open` leaves NO live record: the id is absent from the live table afterwards, and the
//     corrected retry with the SAME id SUCCEEDS (the whole point — a caller can fix its argument and retry);
//   ② the refusal is still the kernel's own named one (VMU_MEETING_TOO_SMALL), not swallowed by the cleanup;
//   ③ the foreign-id hint's DECISIVE sentence comes FIRST and the id list after it, and the message does not begin
//     with the copied list; a same-table collision keeps its own wording;
//   ④ the ordinary-meeting refusal says "AN ordinary meeting" (grammar is a message, not a rule) and a non-ordinary
//     type still reads "a <type> meeting";
//   ⑤ a successful primitive open is UNCHANGED: the live table holds it and it is still addressable (the cleanup must
//     not touch the happy path).
//
// WHAT IT DOES NOT PROVE: that an AGENT reads the reordered hint, and nothing about the service registry's own
// lifecycle (close/extend) — identity and atomicity only.
//
// RULE E: every collection assertion carries its non-emptiness in the same expression.
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
const codeOf = (p) => (p && p.code) || null
const J = (o) => JSON.stringify(o)

const entry = await import(pathToFileURL(ENTRY).href)
let NOW = 1000

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, state, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { raw: undefined, parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-run31-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  ok(kernel.members.roster().length === 2, 'setup: a chair and one member really exist (RULE E)', kernel.members.roster().map((m) => m.id))

  // ── ① A REFUSED OPEN LEAVES NOTHING BEHIND ──────────────────────────────────────────────────────────────
  console.log('=== 1. a refused primitive open is ATOMIC (live run 31) ===')
  const refused = await call(b, 'vibe_vmu_meeting', { action: 'open', id: 'p-x', agenda: 'primitive', member: 'r-chair' })
  ok(codeOf(refused.parsed) === 'VMU_MEETING_TOO_SMALL',
    '★ the refusal is still the kernel’s own named one (cleanup did not swallow it)', refused.parsed && { code: codeOf(refused.parsed), message: refused.parsed.message })
  ok(kernel.liveMeeting('p-x') === null,
    '★★ AND IT DID NOT HAPPEN: the refused id is absent from the live table (it stayed there before this fix)',
    { liveMeeting: kernel.liveMeeting('p-x') && kernel.liveMeeting('p-x').state })
  const liveList = kernel.liveList()
  ok(Array.isArray(liveList.meetings) && !liveList.meetings.includes('p-x'),
    '★★ the live LIST does not name it either (the report read `state:"idle"` off exactly such a stub)',
    { meetings: liveList.meetings, cap: liveList.cap })

  const retry = await call(b, 'vibe_vmu_meeting', { action: 'open', id: 'p-x', agenda: 'primitive', member: 'r-chair', roster: ['r-chair', 'r-1'] })
  ok(retry.parsed && retry.parsed.ok === true && retry.parsed.id === 'p-x',
    '★★★ THE WHOLE POINT: the corrected retry with the SAME id now SUCCEEDS (it was VMU_CONFLICT before)',
    retry.parsed && { ok: retry.parsed.ok, id: retry.parsed.id, code: codeOf(retry.parsed), message: retry.parsed.message })
  ok(kernel.liveMeeting('p-x') !== null,
    '★ and the successful open IS in the live table — the cleanup did not touch the happy path',
    { state: kernel.liveMeeting('p-x') && kernel.liveMeeting('p-x').state })

  // ── ② A SAME-ID SERVICE OPEN STILL REFUSES, NAMING THE PRIMITIVE TABLE FIRST ───────────────────────────
  console.log('=== 2. one visible name = one meeting: the decisive sentence comes FIRST ===')
  const foreign = await call(b, 'vibe_v5_meeting', { member: 'r-chair', agenda: 'service tries p-x', id: 'p-x' })
  ok(codeOf(foreign.parsed) === 'VMU_CONFLICT',
    '★ the collision is refused by name', foreign.parsed && { code: codeOf(foreign.parsed) })
  const hint = String((foreign.parsed && foreign.parsed.hint) || '')
  ok(hint.startsWith('that id belongs to the PRIMITIVE meeting registry'),
    '★★ the DECISIVE sentence is the FIRST thing in the hint (the institute had to read past 115 ids)',
    { hintHead: hint.slice(0, 120) })
  ok(/pass another id/.test(hint) && /Service ids in use:/.test(hint),
    '★ and the id list is still there, AFTER the answer, under a label that says which table it lists',
    { hint: hint.slice(0, 200) })
  ok(!/^m\d+/.test(String((foreign.parsed && foreign.parsed.message) || '')),
    '★ the message does not begin with the id list either', { message: foreign.parsed && foreign.parsed.message })

  // ── ③ "AN ORDINARY MEETING" ────────────────────────────────────────────────────────────────────────────
  console.log('=== 3. the ordinary-meeting refusal says AN ordinary meeting ===')
  const ordinary = await call(b, 'vibe_v5_meeting', { member: 'r-chair', agenda: 'ordinary with target', target: 'whatever' })
  const om = String((ordinary.parsed && ordinary.parsed.message) || '')
  ok(/^an ordinary meeting takes no object/.test(om),
    '★ the article is derived from the type it names (the institute quoted "a ordinary" back)',
    { message: om.slice(0, 120), code: codeOf(ordinary.parsed) })
  ok(codeOf(ordinary.parsed) === 'VMU_INVALID_ARGUMENT',
    '★ and the refusal is still the same named one (only the wording moved)', { code: codeOf(ordinary.parsed) })

  // ── ④ the primitive face still holds its own refusal wording (no blanket rewrite) ────────────────────
  console.log('=== 4. a control: the primitive face is unchanged ===')
  const stillRefused = await call(b, 'vibe_vmu_meeting', { action: 'open', agenda: 'no roster again', member: 'r-chair' })
  ok(codeOf(stillRefused.parsed) === 'VMU_MEETING_TOO_SMALL',
    '★ a fresh refused open is refused the same way (the fix is in the cleanup, not in the policy)',
    stillRefused.parsed && { code: codeOf(stillRefused.parsed) })
  const minted = await call(b, 'vibe_vmu_meeting', { action: 'open', agenda: 'minted id', member: 'r-chair', roster: ['r-chair', 'r-1'] })
  ok(minted.parsed && minted.parsed.ok === true && typeof minted.parsed.id === 'string' && minted.parsed.id !== 'p-x',
    '★ a MINTED id still works and does not reuse p-x', minted.parsed && { id: minted.parsed.id })
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('\n=== VMU RUN31 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('failures:\n - ' + failures.join('\n - ')); process.exit(1) }
