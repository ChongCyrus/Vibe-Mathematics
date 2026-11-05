// tests/vmu-run240-refusal-rails.test.mjs — RUN 240: FIVE RAILS THAT ANSWERED A RAW TypeError, AND THREE
// REFUSALS THAT FORGOT WHAT THEY KNEW.
//
// THE MEASURED GAPS (found by the action matrix in scripts/sim/audit/action-coverage.json, not by reading code):
//   1. `vibe_vmu_meeting { action: leaverequest | leaveapprove | leaverequests | lapse | revokelapse }` called
//      `live().X(...)` unconditionally. `live()` hands back a PRIMITIVE meeting object; no primitive meeting has
//      any of the five methods. Every call therefore answered `TypeError: live(...).requestLeave is not a function`
//      — a raw JS error with no `code` and no `hint`. The five verbs sat at 0/225 for the same reason: an agent
//      that called them learned nothing it could act on.
//   2. The p1 evidence gate's `hire` refusal ("member id … must be path-safe") was the ONLY refusal in
//      kernel/members.js with no hint — audit check A4 (a named refusal must say what to do next) caught it.
//   3. `kit/handlers.js` rebuilt the kernel's error so it could append a record-vs-member hint, copying only
//      code/hint/detail: every other field (`enforcedScope`, `enforced`, `missing`, `required`, …) was silently
//      dropped. A receipt that loses those reads as "the gate evaluated nothing".
//
// WHAT THIS SUITE DOES: it founds a real institute, convenes a real SERVICE meeting, and walks all five rails
// through it — then points the same five verbs at a PRIMITIVE meeting and requires a NAMED refusal with a hint
// (never a TypeError). It reads the three other shapes off real calls, and pins the source so the shape cannot
// regress quietly.
//
// Run: node tests/vmu-run240-refusal-rails.test.mjs   (last line: === VMU RUN 240 REFUSAL RAILS: N passed, M failed ===)

import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label) } else { failed += 1; failures.push(label); console.log('  FAIL ' + label + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 300) + ']')) }
}
const codeOf = (r) => (r && (r.code || (r.failure && r.failure.code))) || null
const hintOf = (r) => (r && (r.hint || (r.failure && r.failure.hint))) || null

const roots = []
const mkRoot = async () => { const d = await mkdtemp(join(tmpdir(), 'vmu-r240rr-')); roots.push(d); return d }
let diag = ''

try {
  // ── 0. SOURCE PINS: the five verbs may not go back to calling a primitive-only method ────────────────────────
  {
    const src = await readFile(join(REPO, 'vibe-math-vmu', 'tools', 'meeting.js'), 'utf8')
    ok(!/live\(\)\.requestLeave\(/.test(src), '§0a no live().requestLeave(...) call remains (a primitive meeting has no such method)')
    ok(!/live\(\)\.approveLeave\(/.test(src), '§0b no live().approveLeave(...) call remains')
    ok(!/live\(\)\.leaveRequests\(/.test(src), '§0c no live().leaveRequests(...) call remains')
    ok(!/live\(\)\.lapse\(/.test(src), '§0d no live().lapse(...) call remains')
    ok(!/live\(\)\.revokeLapse\(/.test(src), '§0e no live().revokeLapse(...) call remains')
    ok(/leaverequest: 'requestLeave', leaveapprove: 'approveLeave', leaverequests: 'leaveRequests',/.test(src),
      '§0f the five verbs are dispatched to the SERVICE methods by name')
    ok(/registry: 'service' \}, svc\[method\]\(payload\)\)/.test(src),
      '§0g and the receipt names the registry it wrote to')
  }
  {
    const src = await readFile(join(REPO, 'vibe-math-vmu', 'kernel', 'members.js'), 'utf8')
    ok(/must be path-safe: ' \+ shown,\n\s*'pass a string matching '/.test(src),
      '§0h the path-safety refusal carries a hint (audit A4: a named refusal says what to do next)')
    ok(!/must be path-safe: ' \+ String\(id\)\)/.test(src),
      '§0i and it no longer prints String(id) — which read "[object Object]" for an object')
  }
  {
    const src = await readFile(join(REPO, 'vibe-math-vmu', 'kit', 'handlers.js'), 'utf8')
    ok(/for \(const k of Object\.keys\(e\)\) \{/.test(src) && /k === 'stack' \|\| k === 'code' \|\| k === 'hint' \|\| k === 'message' \|\| k === 'detail'/.test(src),
      '§0j the error rebuild copies every own field instead of a hand-picked three')
  }
  {
    const src = await readFile(join(REPO, 'vibe-math-vmu', 'kernel', 'directions.js'), 'utf8')
    ok(/try \{ return JSON\.stringify\(v\) \} catch \{ return String\(v\) \}/.test(src),
      '§0k a direction field that is an object is QUOTED, so no message can read "[object Object]"')
  }

  const entry = await import(pathToFileURL(ENTRY).href)
  const state = { specs: [] }
  const ctx = {
    effect (fn) { return fn() },
    on () { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const root = await mkRoot()
  const handle = entry.apply(ctx, { clock: () => 1000000, packs: ['v5r'], root, deliverMode: 'caller' })
  await handle.ready()
  await handle.kernel.store.open()
  const K = handle.kernel
  const call = async (name, args = {}, as = null) => {
    const spec = state.specs.filter((s) => s && s.name === name)[0] || null
    if (!spec) return { ok: false, tool: name, code: 'NO_SUCH_TOOL' }
    const exec = as === null ? { kernel: K } : { kernel: K, agent: { id: as } }
    try {
      const raw = await spec.execute(args, exec)
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e), hint: (e && e.hint) || null, enforcedScope: (e && e.enforcedScope) || null }
    }
  }

  const started = await call('vibe_v5_start', { problem: 'run240 refusal rails probe', researcherCount: 2 })
  ok(started && started.ok === true, '§1a a staffed institute exists (fixture precondition)', { code: codeOf(started), message: started && started.message })
  diag = JSON.stringify({ start: codeOf(started) })

  // ── 2. THE SERVICE MEETING: all five rails reach the service, and SAY SO ────────────────────────────────────
  const convened = await call('vibe_v5_meeting', {
    type: 'debate', member: 'r-acad', title: 'run240 rails 会议',
    agenda: '只压机制：请假与有界兜底走服务面。',
    subject: 'Shared/Protocol.md', subject_evidence: { file: { readable: true, bytes: 1024, name: 'Shared/Protocol.md' } },
  })
  const mid = convened && (typeof convened.meeting === 'string' ? convened.meeting : (convened.meeting && convened.meeting.id) || convened.id)
  ok(typeof mid === 'string' && mid !== '', '§2a a service meeting is convened', { code: codeOf(convened), message: convened && convened.message })

  const req = await call('vibe_vmu_meeting', { action: 'leaverequest', id: mid, member: 'r-1', reason: 'probe: family matter' })
  ok(req && req.ok === true && req.registry === 'service',
    '§2b ★ leaverequest reaches the SERVICE rail (it used to be a raw TypeError) and the receipt names the registry',
    { code: codeOf(req), registry: req && req.registry, message: req && req.message })
  const list = await call('vibe_vmu_meeting', { action: 'leaverequests', id: mid })
  ok(list && list.ok === true && list.registry === 'service',
    '§2c ★ leaverequests reads the service roster', { code: codeOf(list), registry: list && list.registry })
  const appr = await call('vibe_vmu_meeting', { action: 'leaveapprove', id: mid, member: 'r-1', by: 'r-acad', reason: 'probe: approved' })
  ok(appr && appr.ok === true && appr.registry === 'service',
    '§2d ★ leaveapprove decides it, and the approver is the DECLARED one', { code: codeOf(appr), registry: appr && appr.registry })

  const lapseEarly = await call('vibe_vmu_meeting', { action: 'lapse', id: mid, by: 'r-acad', reason: 'probe: too early' })
  ok(lapseEarly && lapseEarly.ok === false && codeOf(lapseEarly) === 'VMU_STATE' && hintOf(lapseEarly),
    '§2e ★ lapse before the declared bound refuses BY NAME (VMU_STATE) WITH a hint — nothing settles silently',
    { code: codeOf(lapseEarly), hint: String(hintOf(lapseEarly) || '').slice(0, 60) })
  const revoke = await call('vibe_vmu_meeting', { action: 'revokelapse', id: mid, by: 'r-acad' })
  ok(revoke && revoke.ok === false && codeOf(revoke) !== null,
    '§2f revokelapse without a reason is a NAMED refusal (the reason is required), not a TypeError',
    { code: codeOf(revoke), message: revoke && revoke.message })

  // ── 3. THE PRIMITIVE FLOOR: same five verbs must refuse by NAME, with a reachable alternative ────────────────
  const prim = await call('vibe_vmu_meeting', { action: 'open', id: 'p-r240', agenda: '原语会议', roster: ['r-1', 'r-2'] })
  ok(prim && prim.ok === true && String(prim.id) === 'p-r240', '§3a a primitive meeting still opens (its own registry)',
    { code: codeOf(prim), id: prim && prim.id })
  for (const verb of ['leaverequest', 'leaveapprove', 'leaverequests', 'lapse', 'revokelapse']) {
    const r = await call('vibe_vmu_meeting', { action: verb, id: 'p-r240', member: 'r-1', by: 'r-acad', reason: 'probe' })
    const named = codeOf(r) === 'VMU_INVALID_ARGUMENT'
    const hinted = typeof hintOf(r) === 'string' && hintOf(r).indexOf('vibe_v5_meeting') >= 0
    const text = String((r && r.message) || '')
    ok(r && r.ok === false && named && hinted && text.indexOf('SERVICE') >= 0 && !/is not a function/.test(text),
      '§3b ★★ primitive ' + verb + ': refused BY NAME, the message says it is a SERVICE rail, and the hint names the pack face that has it (never "is not a function")',
      { code: codeOf(r), hint: String(hintOf(r) || '').slice(0, 70), message: text.slice(0, 70) })
  }

  // ── 4. THE THREE REMEMBERED THINGS ──────────────────────────────────────────────────────────────────────────
  const badHire = await call('vibe_v5_hire', { id: '新临时工', slot: 'member' }, 'r-acad')
  ok(badHire && badHire.ok === false && codeOf(badHire) === 'VMU_INVALID_ARGUMENT' && hintOf(badHire),
    '§4a the path-safety refusal now carries a hint: it says what a path-safe id looks like',
    { code: codeOf(badHire), hint: String(hintOf(badHire) || '').slice(0, 70) })
  ok(!/\[object Object\]/.test(String((badHire && badHire.message) || '')),
    '§4b and it does not print "[object Object]"',
    { message: String((badHire && badHire.message) || '').slice(0, 80) })

  // The rebuild this grades is the record-vs-member branch: asking for a MEMBER id on the record face.
  const libMiss = await call('vibe_v5_read_library', { id: 'r-1' }, 'r-acad')
  const rebuiltHint = String(hintOf(libMiss) || '')
  const keptMeta = libMiss && libMiss.ok === false && codeOf(libMiss) === 'VMU_NO_SUCH_OBJECT'
    && rebuiltHint.indexOf('MEMBER') >= 0
    && libMiss.memberActed !== undefined && libMiss.memberActedMeans !== undefined
  ok(keptMeta,
    '§4c a rebuilt refusal keeps the fields the rebuild does not name (attribution survives) and says which NOUN the id is — the rebuild used to copy only code/hint/detail',
    { code: codeOf(libMiss), hint: rebuiltHint.slice(0, 70), memberActed: libMiss && libMiss.memberActed, keys: libMiss ? Object.keys(libMiss).slice(0, 12) : null })
} catch (e) {
  failed += 1
  failures.push('suite threw')
  console.log('  FAIL suite threw: ' + String((e && e.stack) || e).split(String.fromCharCode(10)).slice(0, 4).join(' | '))
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log(String.fromCharCode(10) + '=== VMU RUN 240 REFUSAL RAILS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.log('failures:'); for (const f of failures) console.log('  - ' + f); console.log('diag: ' + diag) }
process.exitCode = failed ? 1 : 0
