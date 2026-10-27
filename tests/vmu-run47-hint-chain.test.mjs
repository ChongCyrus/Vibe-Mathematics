#!/usr/bin/env node
// vmu RUN 47 — TWO HINT CHAINS THAT MADE A CALLER GUESS (the institute's own report, with the receipt text).
//
// (1) `vibe_v5_say {meeting:"<id>"}` on a meeting that lives in the SERVICE registry answered
//     `VMU_NO_SUCH_OBJECT` with the hint "open: m1" — the primitive table's ids, never named, no call to copy. The
//     caller had just read that same id from `vibe_v5_meeting{action:"status"}`, so the receipt told it nothing.
//     The hint must name BOTH registries and give one executable call for each.
// (2) `vibe_vmu_meeting {action:"open", kind:"debate"}` refused `kind` and pointed at the service face — correct — but
//     a debate on that face ALSO needs `subject` and the chair must have a recorded turn first, so a caller following
//     the hint verbatim hit two more refusals (run 47: three calls to open one meeting). The hint must say what else
//     the service face will demand.
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
const boot = async (root) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => NOW })
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, {}) } catch (e) { return { thrown: true, code: e && e.code, message: e && e.message, hint: e && (e.hint || (e.details && e.details.hint)) } }
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-run47-hints-'))
try {
  const b = await boot(root)
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  ok(kernel.members.roster().length === 2, 'setup: a chair and a researcher (RULE E)', kernel.members.roster().map((m) => m.id))

  // (1) A speech aimed at a meeting that does not exist: the hint must name both tables and be executable.
  const say = await call(b, 'vibe_v5_say', { meeting: 'm-service', member: 'r-1', text: '开会前的发言' })
  // The PACK wraps a face refusal into a JSON receipt (`{ok:false, code, message, hint}`) instead of throwing, so read
  // the receipt form first and the thrown form as a fallback (both are honest refusals).
  const sayRef = (say.parsed && say.parsed.ok === false) ? say.parsed : say
  ok(sayRef === say || (say.parsed && say.parsed.ok === false), 'the speech into an unknown meeting is refused (not silently recorded)', sayRef.code)
  ok(String(sayRef.code) === 'VMU_NO_OPEN_MEETING' || String(sayRef.code) === 'VMU_NO_SUCH_OBJECT', 'the refusal names a meeting-registry code', sayRef.code)
  const sayHint = String(sayRef.hint || sayRef.message || '')
  ok(/primitive/i.test(sayHint), 'the hint NAMES the primitive registry (run 47 defect: it did not)', sayHint)
  ok(sayHint.indexOf('vibe_vmu_meeting {action:"status"') >= 0, 'the hint gives a call for the primitive table (executable)', sayHint)
  ok(sayHint.indexOf('vibe_v5_meeting {action:"status"') >= 0, 'the hint ALSO gives a call for the service table', sayHint)

  // (2) `kind` on the primitive open: the hint must name the two extra checks the service face will run.
  const open = await call(b, 'vibe_vmu_meeting', { action: 'open', id: 'm-pr47', kind: 'debate' })
  const openRef = (open.parsed && open.parsed.ok === false) ? open.parsed : open
  ok(String(openRef.code) === 'VMU_INVALID_ARGUMENT', 'the primitive face refuses `kind` by name', openRef.code)
  const openHint = String(openRef.hint || '')
  ok(openHint.indexOf('type:"debate"') >= 0, 'the kind hint points at the service face\'s real shape (type:)', openHint)
  ok(/subject/i.test(openHint), 'the kind hint says the debate also needs a subject (run 47: two extra calls)', openHint)
  ok(openHint.indexOf('VMU_CHAIR_ACT_NOT_DELEGATED') >= 0, 'the kind hint says the chair needs a recorded turn first', openHint)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

console.log('\n=== VMU RUN 47 HINT CHAIN: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error(failures.join('\n')); process.exit(1) }
