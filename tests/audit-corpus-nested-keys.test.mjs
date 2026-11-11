// TB-2736: the real-receipt corpus must capture PATHS, not just top-level key names. A receipt field a reader
// genuinely reads (`status.turnReceipts[].notices.blockChars`) used to be invisible to the audit because only the
// top level was harvested, so the audit called a live reading a coverage gap. This suite proves the fix end to end:
// a REAL drive produces the receipt, the harvester captures its nested path, the audit reads that path (and goes red
// again when the path is not captured). Nothing below hand-writes a receipt body: the status JSON comes from the
// kernel under test.
// fs-purpose: audit — this suite writes its own fake session journals under its temp roots and reads the harvest output.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { zstdCompressSync } from 'node:zlib'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const ENTRY = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
const HARVEST = join(REPO, 'scripts', 'sim', 'harvest', 'real.mjs')
const AUDIT = join(REPO, 'tests', 'audit-prompt-names.mjs')
const HARVEST_SRC = readFileSync(HARVEST, 'utf8')
const AUDIT_SRC = readFileSync(AUDIT, 'utf8')
const SESSION_FILE = 'session.v4.jsonl.zstd'

let passed = 0
let failed = 0
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name); return }
  failed += 1
  console.log('  FAIL ' + name + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
}
const CLEAN = []
const clean = () => { for (const dir of CLEAN) { try { rmSync(dir, { recursive: true, force: true }) } catch (e) { /* best effort */ } } CLEAN.length = 0 }
process.on('exit', clean)

const NL = '\n'
const fence = (o) => ['```json', JSON.stringify(o), '```'].join(NL)

// ---- §0 the shape of the fix is in the source (a suite that only reads the artifact cannot tell a fix from a
// hand-written fieldset) ----
ok(HARVEST_SRC.includes('function pathsOf(parsed, maxDepth = PATH_MAX_DEPTH)'),
  '§0a the harvester has one path collector with an explicit depth cap', 'pathsOf')
ok(HARVEST_SRC.includes('const PATH_MAX_DEPTH = 6') && HARVEST_SRC.includes('if (depth >= maxDepth) return'),
  '§0b the cap is a constant, not a magic default, and it is applied', 'PATH_MAX_DEPTH')
ok(HARVEST_SRC.includes('pathsByTool') && HARVEST_SRC.includes('paths: [...'),
  '§0c the fieldset grew a paths set beside keys (old readers keep keys)', 'paths')
ok(HARVEST_SRC.includes('function hasSessionJournal') && HARVEST_SRC.includes('function sessionRoots'),
  '§0d roots are discovered by journal evidence, not by guessing directory names', 'sessionRoots')
ok(HARVEST_SRC.includes('const seenSessions = new Set()') && HARVEST_SRC.includes('duplicateSessions += 1'),
  '§0e a session is collected ONCE across roots (idempotence is collection property)', 'seenSessions')
ok(AUDIT_SRC.includes('function fieldPathsOf(fieldset)') && AUDIT_SRC.includes('function declaredPathOf(producedBy)'),
  '§0f the audit reads the captured path set and the path a provenance row claims', 'fieldPathsOf/declaredPathOf')
ok(AUDIT_SRC.includes('function pathCarried(fieldPaths, claimed)') &&
  AUDIT_SRC.includes('a same-named key elsewhere is a different existence'),
  '§0g the existence test is a PATH, and the why names the difference', 'pathCarried')
ok(AUDIT_SRC.includes('if (fieldPaths.size === 0)') && AUDIT_SRC.includes('regenerate it with scripts/sim/harvest/real.mjs'),
  '§0h a top-level-only fieldset is a NAMED refusal, not a silent pass', 'fieldPaths.size === 0')

function boot({ deliverMode = 'caller' } = {}) {
  const state = { specs: [], seq: 0 }
  const rootAgent = { options: { provider: 'sim', model: 'sim' }, session: { id: 'sim-session', header: { id: 'sim-session' } } }
  const answer = (spec) => {
    state.seq += 1
    const result = {
      output: [{ type: 'text', text: fence({ progress: 'r-1 的进展：引理 ' + state.seq + ' 已验证。' }) }],
      stopReason: 'end_turn',
    }
    return { childId: 'sim-child-' + state.seq, messageId: 'sim-msg-' + state.seq, result: Promise.resolve(result), dispose: async () => {} }
  }
  const subs = {
    list: () => ['sim'],
    interrupt: async () => {},
    sendMessage: async () => 'sim-msg',
    startActivation: async (spec) => answer(spec),
  }
  subs.start = async (provider, request) => answer({ provider, request })
  const agents = { list: () => ['sim-session'], get: () => rootAgent, currentInitiator: () => rootAgent }
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    get: (name) => (name === 'subagents' ? subs : (name === 'agents' ? agents : null)),
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const root = mkdtempSync(join(tmpdir(), 'vmu-nested-'))
  CLEAN.push(root)
  const opts = { clock: () => 1000, packs: ['v5r'], root }
  if (deliverMode === 'caller') opts.deliverMode = 'caller'
  else opts.vmu = { 'vmu.turn.deliverProvider': 'sim' }
  const handle = ENTRY.apply(ctx, opts)
  return { handle, state, root }
}
const call = async (b, name, args) => {
  const spec = b.state.specs.find((s) => s.name === name)
  const raw = await spec.execute(args, { kernel: b.handle.kernel, agent: { options: { provider: 'sim', model: 'sim' }, session: { id: 'sim-session', header: { id: 'sim-session' } } } })
  return typeof raw === 'string' ? JSON.parse(raw) : raw
}

// ---- §1 a REAL drive produces the nested notices reading (the receipt is the product output, not a fixture) ----
let statusReceipt = null
{
  const b = boot()
  try {
    await b.handle.ready()
    await b.handle.kernel.store.open()
    const K = b.handle.kernel
    await K.members.hire({ id: 'r-1', slot: 'member' })
    K.turn.notify('r-1', '【研究所提示】请复核引理 L2 的证明。')
    await call(b, 'vibe_vmu_turn', { op: 'drive', member: 'r-1', rounds: 1, phase: 'normal', why: 'TB-2736 §1' })
    const receipt = await call(b, 'vibe_vmu_turn', { op: 'status' })
    statusReceipt = receipt
    const status = receipt && receipt.status && typeof receipt.status === 'object' ? receipt.status : {}
    const rows = Array.isArray(status.turnReceipts) ? status.turnReceipts : []
    ok(rows.length > 0, '§1a-0 the status receipt nests the turn rows under status.turnReceipts', Object.keys(receipt))
    const row = rows[0] || {}
    const notices = row.notices || null
    ok(!!notices && typeof notices === 'object', '§1b and that row carries notices', notices)
    ok(!!notices && typeof notices.blockChars === 'number' && notices.blockChars > 0,
      '§1c notices.blockChars is a real number the drive measured', notices && notices.blockChars)
    ok(!!notices && typeof notices.lines === 'number' && notices.lines >= 1,
      '§1d notices.lines counts the queued notice', notices && notices.lines)
  } finally {
    await Promise.all((b.handle.cleanups || []).map(async (c) => { try { return await c() } catch (e) { return null } }))
  }
}

// ---- §2 the harvester captures that path from session journals in TWO roots, once ----
const encodeWorkspace = (abs) => '--' + abs.replace(/:/g, '').replace(/[\\/]/g, '-') + '--'
function writeJournal(file, receipts) {
  mkdirSync(dirname(file), { recursive: true })
  const lines = []
  for (const r of receipts) {
    lines.push(JSON.stringify({ type: 'tool/call', data: { callId: r.callId, name: 'vibe_vmu_turn' } }))
    lines.push(JSON.stringify({ type: 'tool/result', data: { toolCallId: r.callId, message: { content: [{ type: 'text', text: JSON.stringify(r.receipt) }] } } }))
  }
  writeFileSync(file, zstdCompressSync(Buffer.from(lines.join(NL) + NL, 'utf8')))
}
function harvest(env) {
  const res = spawnSync(process.execPath, [HARVEST], {
    encoding: 'utf8',
    env: { ...process.env, VMU_REAL_WS_ROOT: env.wsRoot, VMU_SESSIONS_ROOTS: env.roots.join(';'), VMU_REAL_OUT: env.out },
  })
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '' }
}
{
  const base = mkdtempSync(join(tmpdir(), 'vmu-harvest-'))
  CLEAN.push(base)
  const wsRoot = join(base, 'ws')
  const ws = join(wsRoot, 'fake-ws')
  const rootA = join(base, 'rootA')
  const rootB = join(wsRoot, 'sessions')
  mkdirSync(ws, { recursive: true })
  const enc = encodeWorkspace(ws)
  // the SAME run+session lives in both roots: one harvest must count it once, and a second harvest must not move.
  writeJournal(join(rootA, enc, 'sess-1', SESSION_FILE), [{ callId: 'c1', receipt: statusReceipt }])
  writeJournal(join(rootB, enc, 'sess-1', SESSION_FILE), [{ callId: 'c1', receipt: statusReceipt }])
  const out = join(base, 'out')
  const first = harvest({ wsRoot, roots: [rootA, rootB], out })
  ok(first.status === 0, '§2a harvest exits 0 over two roots', { status: first.status, stderr: first.stderr.slice(-300) })
  let summary = null
  try { summary = JSON.parse(first.stdout) } catch (e) { summary = null }
  ok(!!summary && summary.sessionFiles === 1, '§2b the same session in two roots is collected once', summary && { sessionFiles: summary.sessionFiles, duplicateSessions: summary.duplicateSessions, roots: summary.sessionRoots })
  ok(!!summary && summary.duplicateSessions === 1, '§2c and the duplicate is COUNTED, not silently dropped', summary && summary.duplicateSessions)
  const fieldset = JSON.parse(readFileSync(join(out, 'real-fieldset.json'), 'utf8'))
  const turn = fieldset.vibe_vmu_turn || {}
  const paths = Array.isArray(turn.paths) ? turn.paths : []
  const keys = Array.isArray(turn.keys) ? turn.keys : []
  ok(paths.length > 0, '§2d the fieldset carries a path set', paths.length)
  ok(paths.includes('status.turnReceipts[].notices.blockChars'),
    '§2e ★ the RUN 78 nested reading is captured as a PATH', paths.filter((p) => p.indexOf('notices') !== -1))
  ok(paths.includes('status.turnReceipts[].notices.lines') && paths.includes('status.turnReceipts[].notices.rendered'),
    '§2f its sibling readings come with it', paths.filter((p) => p.indexOf('notices') !== -1))
  ok(paths.every((p) => typeof p === 'string' && p.length > 0), '§2g every path is a non-empty string', paths.length)
  ok(keys.includes('ok') && keys.includes('status') && keys.includes('turns'),
    '§2h the OLD top-level keys are still there (existing readers must not break)', keys.slice(0, 6))
  const second = harvest({ wsRoot, roots: [rootA, rootB], out })
  const summary2 = (() => { try { return JSON.parse(second.stdout) } catch (e) { return null } })()
  const fieldset2 = JSON.parse(readFileSync(join(out, 'real-fieldset.json'), 'utf8'))
  ok(second.status === 0 && !!summary2 && summary2.receipts === summary.receipts,
    '§2i a second harvest over the same roots is IDEMPOTENT (same receipt count)', summary2 && { first: summary.receipts, second: summary2.receipts })
  ok(JSON.stringify(fieldset2.vibe_vmu_turn.paths) === JSON.stringify(paths),
    '§2j and the path set does not drift between runs', fieldset2.vibe_vmu_turn.paths.length)

  // ---- §3 a receipt whose notices object is EMPTY loses the path: the capture is measured, not assumed ----
  const emptyReceipt = JSON.parse(JSON.stringify(statusReceipt))
  if (emptyReceipt.status && Array.isArray(emptyReceipt.status.turnReceipts) && emptyReceipt.status.turnReceipts[0]) emptyReceipt.status.turnReceipts[0].notices = {}
  const outEmpty = join(base, 'out-empty')
  // a SEPARATE pair of roots holding only the emptied receipt: the union over both roots would keep the good one.
  const wsRoot2 = join(base, 'ws2')
  const ws2 = join(wsRoot2, 'fake2-ws')
  mkdirSync(ws2, { recursive: true })
  const rootC = join(base, 'rootC')
  const rootD = join(wsRoot2, 'sessions')
  const enc2 = encodeWorkspace(ws2)
  writeJournal(join(rootC, enc2, 'sess-2', SESSION_FILE), [{ callId: 'c2', receipt: emptyReceipt }])
  writeJournal(join(rootD, enc2, 'sess-2', SESSION_FILE), [{ callId: 'c2', receipt: emptyReceipt }])
  const stripped = harvest({ wsRoot: wsRoot2, roots: [rootC, rootD], out: outEmpty })
  const fieldsetEmpty = JSON.parse(readFileSync(join(outEmpty, 'real-fieldset.json'), 'utf8'))
  const pathsEmpty = (fieldsetEmpty.vibe_vmu_turn && fieldsetEmpty.vibe_vmu_turn.paths) || []
  ok(stripped.status === 0, '§3a harvest still runs on a receipt with empty notices', { status: stripped.status, stderr: stripped.stderr.slice(-200) })
  ok(!pathsEmpty.includes('status.turnReceipts[].notices.blockChars'),
    '§3b ★ the leaf path is GONE when the receipt no longer carries it', pathsEmpty.filter((p) => p.indexOf('notices') !== -1))
  ok(pathsEmpty.includes('status.turnReceipts[].notices'),
    '§3c the empty object itself is still a captured container (a fact, not a silence)', pathsEmpty.filter((p) => p.indexOf('notices') !== -1))

  // ---- §4 the audit consumes that path: green with it, red without it ----
  // The real corpus is the green side: regenerated by the harvester from the live session roots, it must carry the
  // RUN 78 path AND the audit must read 0 blockers off it (this is the 2-blockers-to-0 evidence, not a fixture).
  // The harvest corpus is a run artifact that lives OUTSIDE the repo (a fresh clone has none). The default names the
  // box that produced RUN 78; any other box overrides it. §4a-0 below turns an absent corpus into a named failure
  // rather than a silent skip, and PORTABLE-ALLOW is the audited exemption for exactly this shape.
  const REAL_FIELDSET = process.env.VMU_SIM_ROOT ? join(process.env.VMU_SIM_ROOT, 'real-fieldset.json') : 'D:/_tmp/sim/real-fieldset.json' // PORTABLE-ALLOW: harvest corpus is a run artifact outside the repo; override with VMU_SIM_ROOT=<dir holding real-fieldset.json>
  let realFieldset = null
  try { realFieldset = JSON.parse(readFileSync(REAL_FIELDSET, 'utf8')) } catch (e) { realFieldset = null }
  const realPaths = (realFieldset && realFieldset.vibe_vmu_turn && Array.isArray(realFieldset.vibe_vmu_turn.paths)) ? realFieldset.vibe_vmu_turn.paths : []
  ok(!!realFieldset && realPaths.includes('status.turnReceipts[].notices.blockChars'),
    '§4a-0 the real corpus (harvest output) carries the RUN 78 nested path', REAL_FIELDSET)
  const auditWith = spawnSync(process.execPath, [AUDIT, '--json'], { cwd: REPO, encoding: 'utf8' })
  let judged = null
  try { judged = JSON.parse(auditWith.stdout) } catch (e) { judged = null }
  ok(!!judged && judged.blockers === 0, '§4a ★ with the nested path captured the audit has 0 blockers', judged && { blockers: judged.blockers, exits: auditWith.status })
  ok(!!judged && judged.readings.gap === 0, '§4b and no taught-reading gap remains', judged && judged.readings)

  const strippedFieldset = JSON.parse(JSON.stringify(realFieldset))
  for (const tool of Object.keys(strippedFieldset)) {
    const entry = strippedFieldset[tool]
    if (entry && Array.isArray(entry.paths)) entry.paths = entry.paths.filter((p) => p.indexOf('notices') === -1)
  }
  const strippedPath = join(base, 'fieldset-stripped.json')
  writeFileSync(strippedPath, JSON.stringify(strippedFieldset, null, 2))
  const auditWithout = spawnSync(process.execPath, [AUDIT, '--fieldset', strippedPath, '--json'], { cwd: REPO, encoding: 'utf8' })
  let judgedWithout = null
  try { judgedWithout = JSON.parse(auditWithout.stdout) } catch (e) { judgedWithout = null }
  ok(!!judgedWithout && judgedWithout.blockers > 0,
    '§4c ★★ remove the captured paths and the SAME prompt goes red (the corpus is the decider)', judgedWithout && judgedWithout.blockers)
  ok(!!judgedWithout && judgedWithout.findings.some((f) => f.category === 'TAUGHT_READING' && f.blocker === true &&
    String(f.note || '').indexOf('does not carry that path') !== -1),
    '§4d and the red names the missing PATH, not a bare key', judgedWithout && judgedWithout.findings.filter((f) => f.blocker === true).slice(0, 3))
}

clean()
console.log(NL + '=== AUDIT CORPUS NESTED KEYS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exitCode = 1
