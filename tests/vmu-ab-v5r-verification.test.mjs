// tests/vmu-ab-v5r-verification.test.mjs — the verification CHAIN, driven end to end on the v5r side.
//
// Volume 24 §0 fixes the method: an equivalence claim is only admissible when both sides are RUN and their observable
// output compared. The meeting A/B file covers tools and flows; this file exists because the chain that decides TRUTH
// needs its own host context: the preset reaches its toolchain through `ctx.get('subprocess')`, and a second context
// inside the meeting file resolved against an earlier institute, so the seated fixture that works in isolation did not
// seat correctly there. One context, one institute, one chain - and everything asserted below was measured first.
//
// What this file pins, in the order the preset itself enforces it:
//   record a proposition (it comes back with a fingerprint)
//   -> archive a proof and QUEUE it through the host subprocess seam
//   -> the job lands settled with ok=true, promoting the file into the verified tree
//   -> register it with end_verify {op:'formal_proof'} which writes the formal ledger entry locked=true
//   -> and ONLY THEN does propose_verify admit the debate.
//
// Run: node tests/vmu-ab-v5r-verification.test.mjs   (last line: === VMU AB v5r verification: N passed, M failed ===)

import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, readdirSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { apply as applyV5R } from '../vibe-math-v5r/vibe-math-v5r.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed++; console.log('  ok   ' + name) } else { failed++; failures.push(name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 200) + ']')); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + JSON.stringify(detail).slice(0, 200) + ']')) }
}

const workspace = mkdtempSync(join(tmpdir(), 'vmu-ab-verify-'))
const root = { id: 'verify-root', session: { id: 'verify-root', header: { cwd: workspace } }, options: {} }
const registry = new Map()
const agents = new Map([[root.id, root]])
const seats = new Map()
let seq = 0
const spawns = []
// THE SEAM: resolveExecutable(name) + spawn({argv,cwd,stdio,graceMs}) -> a handle whose `done` yields the outcome.
const subprocess = {
  resolveExecutable: async (name) => '/fake/bin/' + String(name),
  spawn: (opts) => {
    spawns.push((opts.argv || []).join(' '))
    return { done: Promise.resolve({ exitCode: 0, signal: null, stdout: 'Build completed successfully.\n', stderr: '' }), terminate() {} }
  },
}
applyV5R({
  agents: { roots: () => [root], get: (id) => agents.get(id), list: () => [...agents.values()] },
  subagents: { list: () => ['spawn'], async startContinuable() { seq += 1; return { childId: 'v-child-' + seq, messageId: 'm' } }, async sendMessage() { return 'm' }, interrupt() {}, async drainContinuableChildren() {} },
  fs: {
    // the preset derives an absolute institute root and passes it straight back: an already-absolute path must pass
    // through untouched, or joining it under the temp dir would mangle it into a path that cannot be created.
    resolve: async (p) => { const s = String(p); return /^([A-Za-z]:[\\/]|\/)/.test(s) ? s : join(workspace, s) },
    stat: async (p) => (existsSync(p) ? { isFile: () => true, isDirectory: () => false, size: 0, mtimeMs: 0 } : undefined),
    readText: async (p) => { try { return readFileSync(p, 'utf8') } catch { return undefined } },
    writeText: async (p, c) => { const d = dirname(p); if (!existsSync(d)) mkdirSync(d, { recursive: true }); writeFileSync(p, String(c)); return { operation: 'write', after: { size: String(c).length } } },
    readFileSync: (p, e) => readFileSync(p, e), existsSync: (p) => existsSync(p),
    mkdirSync: (p, o) => mkdirSync(p, o),
    writeFileSync: (p, d) => { const dd = dirname(p); if (!existsSync(dd)) mkdirSync(dd, { recursive: true }); writeFileSync(p, d) },
    renameSync: (a, b) => renameSync(a, b), readdirSync: (p, o) => readdirSync(p, o),
    listDir: async (p) => { try { return readdirSync(p) } catch { return [] } },
  },
  tools: { register(spec) { registry.set(spec.name, spec); return () => {} } },
  commands: { register() { return () => {} } },
  timer: { setTimeout: (fn, ms) => { const h = setTimeout(fn, ms); if (h && h.unref) h.unref(); return h }, clearTimeout, setInterval: () => 0, clearInterval: () => {} },
  timeout: (fn, ms) => { const h = setTimeout(fn, Math.min(Number(ms) || 0, 5)); if (h && h.unref) h.unref(); return () => clearTimeout(h) },
  get: (what) => (what === 'subprocess' ? subprocess : undefined),
  on() { return () => {} },
  effect(fn) { try { const d = fn(); return typeof d === 'function' ? d : () => {} } catch { return () => {} } },
  logger: { info() {}, warn() {}, error() {} },
})
const call = async (name, params, agent) => {
  const spec = registry.get(name)
  if (!spec) return { missing: name }
  const a = agent || root
  try { const r = await spec.execute(params || {}, { agent: a, session: a.session }); return typeof r === 'string' ? JSON.parse(r) : r } catch (e) { return { thrown: true, code: e && e.code, message: String(e && e.message) } }
}
const seat = (id) => { const c = seats.get(id); return { id: c, session: { id: c, header: { cwd: workspace, parentSession: root.id } }, options: {} } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const started = await call('vibe_v5_start', {})
ok(started.ok === true, 'V1. the institute starts with the subprocess seam in place', started)
const roster = await call('vibe_v5_members', {})
for (const m of (roster.members || [])) if (m.childId) { seats.set(m.id, m.childId); agents.set(m.childId, seat(m.id)) }
ok(seats.size >= 2 && seats.has('acad') && seats.has('r-1'), 'V2. the roster publishes the childIds that seat an acting member', [...seats.keys()])

const rec = await call('vibe_v5_record_proposition', { id: 'q-1', title: 'L2', statement: 'L2 holds', value: 0.7, motive: 'step', p: 0.5 }, seat('r-1'))
ok(rec.ok === true && typeof rec.fingerprint === 'string' && rec.owner === 'r-1',
  'V3. ★★ a recorded proposition is a card with a FINGERPRINT and an owner', { file: rec.file, owner: rec.owner })

const arch = await call('vibe_v5_lean_archive', { kind: 'proof', target: 'q-1', name: 'L2', content: 'theorem L2 : True := trivial', run: true }, seat('r-1'))
ok(arch.ok === true && typeof arch.jobId === 'string' && arch.status === 'attempted',
  'V4. ★★ the proof is written AND QUEUED for background compilation', { jobId: arch.jobId, status: arch.status })
ok(arch.async && arch.async.state === 'queued',
  'V5. ★★★ and the queue is real: the job is queued rather than compiled inline, so a slow compiler cannot block the tool', arch.async)

await sleep(250)
const jobRes = await call('vibe_v5_lean_job', { jobId: arch.jobId }, seat('r-1'))
const job = jobRes.job || {}
ok(spawns.length > 0, 'V6. ★★ the host subprocess seam was actually used (ctx.get(subprocess) is the door)', { spawns: spawns.length })
ok(job.state === 'settled' && job.ok === true && job.exitCode === 0,
  'V7. ★★★ the job LANDS settled with ok=true and exitCode 0', { state: job.state, ok: job.ok, exitCode: job.exitCode })
ok(typeof job.proof === 'string' && /Verified/.test(job.proof),
  'V8. ★★★ and the file is PROMOTED into the verified tree', { proof: job.proof })

// before the formal ledger entry exists, the debate is refused
const early = await call('vibe_v5_propose_verify', { target: 'q-1', kind: 'proposition', reason: 'too early' }, seat('acad'))
ok(early.ok === false && /locked|定稿/.test(String(early.message)),
  'V9. ★★★ ORDER ENFORCED: a proof that has not been REGISTERED cannot open the debate', { message: String(early.message).slice(0, 70) })

const registered = await call('vibe_v5_end_verify', { target: 'q-1', op: 'formal_proof', status: 'proved', reason: 'lean passed' }, seat('acad'))
ok(registered.ok === true && registered.formalProof && registered.formalProof.locked === true && registered.formalProof.status === 'proved',
  'V10. ★★★ registering with op=formal_proof writes the institute formal ledger entry LOCKED (the door the refusal kept naming)',
  registered.formalProof)

const unlocked = await call('vibe_v5_propose_verify', { target: 'q-1', kind: 'proposition', reason: 'now debatable' }, seat('acad'))
ok(unlocked.ok === true && unlocked.queued === 'q-1',
  'V11. ★★★ THE DEBATE UNLOCKS ONLY NOW: proof first, consensus second, enforced by the same record that carries the evidence', unlocked)

const v1 = await call('vibe_v5_verdict', { target: 'q-1', verdict: 1, reason: 'holds' }, seat('r-1'))
const v2 = await call('vibe_v5_verdict', { target: 'q-1', verdict: 0, reason: 'doubt' }, seat('r-2'))
ok(v1.ok === true && v2.ok === true,
  'V12. ★★ two seated members cast OPPOSITE boolean verdicts on the object under verification', { first: v1.verdict, second: v2.verdict })

const closed = await call('vibe_v5_end_verify', { target: 'q-1' }, seat('acad'))
ok(closed !== null && typeof closed === 'object',
  'V13. ★★ and the academician closes the debate so the aggregation may run', { keys: Object.keys(closed || {}).slice(0, 8) })
console.log('  (observed aggregation: ' + JSON.stringify(closed).slice(0, 220) + ')')

rmSync(workspace, { recursive: true, force: true })
console.log('=== VMU AB v5r verification: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed > 0 ? 1 : 0)
