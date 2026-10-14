#!/usr/bin/env node
// dsh-drive.mjs — full-control driver for a DSH session with an EXPLICIT agent preset (脚本化真机验证（SLV），原"方案三").
// Playbook: `docs/slv-playbook.md` (in-repo since Round 1; esp. §1–§9, §17, §18).
//
// MOVED INTO THE REPOSITORY (handover D-05, Round 2). It used to live at `_oneoff/vm-drive/dsh-drive.mjs`,
// OUTSIDE version control, so a clean clone could not reproduce any scripted live run. Only this header was
// rewritten: the body is byte-identical to the driver that produced the historical evidence.
//
// ⚠️ PRECONDITIONS (named, because this tool CANNOT run without a host — it drives a REAL DSH):
//   1. a DSH install with `dsh` on PATH (selftest mode boots its own server on `--port`);
//   2. a SCRATCH profile that has this package installed — never the user's own profile:
//        an isolated DSH_HOME + `dsh plugin add <this repo>` into it;
//      and that profile's patch must NOT insert a surface probe for real turns (guardProfile() enforces it,
//      because mixing probe and real turns produced REQUEST_EXTENSION / 0-token turns);
//   3. an ASCII-only `--ws` / `--cwd` (a non-ASCII workspace becomes mojibake host-side and fails ENOENT);
//   4. a free `--port`;
//   5. attach mode additionally needs the launch token from the host's own stdout line
//        `dsh web: http://127.0.0.1:<port>/?token=<TOKEN>`;
//   6. write `--out` / `--jsonl` OUTSIDE the repository (the dumps are evidence, not fixtures).
//   Missing 1–5 ⇒ the driver fails with a NAMED reason (a `fatal` step or an HTTP error) rather than
//   pretending to have run; that behaviour is what makes an unattended run honest.
//
// HISTORICAL EVIDENCE STAYS OUTSIDE THE REPO: the runs driven by this tool are kept at `_oneoff/vmu/live/**`
// as an EXTERNAL COPY. They are reproducible only by re-running this driver with the preconditions above —
// see `vibe-math-vmu/docs/11-gates-and-development.md` §8.1 / §9.6 for what they do and do not establish.
//
// ONE-LINER (self-test, own port, own ASCII workspace, dumps everything):
//   node scripts/dsh-drive.mjs selftest --profile <scratch-with-our-plugin> --port 7791 \
//        --ws %TEMP%\vm-selftest-ws --out <dump-dir-outside-the-repo> \
//        --task-file <instruction.txt> --follow-stream --jsonl <out>\transcript.jsonl --timeout 600
//
// ATTACH MODE (drive an already-running scratch instance):
//   dsh --profile <scratch> --port 7791 --no-open      # prints http://127.0.0.1:7791/?token=<TOKEN>
//   node scripts/dsh-drive.mjs --port 7791 --token <TOKEN> --cwd <ascii ws> [control flags below]
//
// FLAGS
//   --port <n>          attach: server port                (selftest: port to bind, default 7791)
//   --token <t>         attach: launch token from stdout
//   --profile <name>    selftest: profile to boot (default vmself; MUST have dsh-vibe-math installed)
//   --ws <dir>          selftest: ASCII scratch workspace (default %TEMP%\vm-selftest-ws)
//   --cwd <dir>         attach: session cwd (ASCII!)
//   --preset <id>       agent preset for a NEW session (default vibe-math-v5)
//   --resume <id>       continue an existing session instead of creating one (alias --session)
//   --task "<text>"     instruction (or env DSH_DRIVE_TASK; or --task-file <path>)
//   --steer "<text>"    steering prompt (session/prompt mode:'steer') after --steer-after ms (default 6000)
//   --cancel            call session/cancel mid-turn (after --cancel-after ms, default 8000)
//   --jsonl <file>      append every emitted line (events/responses) as JSONL for replay
//   --out <dir>         selftest dump dir (transcript.jsonl, report.md, ws-tree.txt, summary.json)
//   --timeout <sec>     turn wait budget (default 600)
//   --quiet             no stdout chatter (JSONL still written)
//   --follow            open the $events lifecycle/activity stream on /api/remote.mux
//   --follow-stream     open the session/follow Remote stream (token-level deltas; assistantStream:true)
//   --allow-probe-patch bypass the guard that forbids a probe-inserting profile for real turns
//
// WIRE FACTS (read from the installed DSH; playbook has file:line)
//   · unary RPC  POST /api/<endpoint>  body {type:'client-request',rpcId,method,payload:{args:{…}}}
//   · auth       GET /?token=<launch token> mints the browser cookie; /api/* is 401 without it
//   · streams    ws://host/api/remote.mux; frames {type:'open'|'item'|'end'|'cancel',streamId,…}
//   · address    SessionAddress = {kind:'session',sessionId} | {kind:'subagent',parentSessionId,childSessionId,mode}
//   · prompt     SessionPromptRequest {requestId,sessionId,mode:'queue'|'steer',content:[{type:'text',text}]}
//   · cancel     SessionCancelRequest {sessionId}
//   · OPERATIONAL RULE: a profile whose patch inserts a surface probe must NOT be used for real turns
//     (mixing them yielded REQUEST_EXTENSION / 0-token turns) — enforced by guardProfile() below.

import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import zlib from 'node:zlib'

const argv = process.argv.slice(2)
const SUB = argv[0] === 'selftest' ? 'selftest' : 'attach'
const rest = SUB === 'selftest' ? argv.slice(1) : argv
const arg = (n, d) => { const i = rest.indexOf('--' + n); return i === -1 ? d : rest[i + 1] }
const flag = (n) => rest.includes('--' + n)

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const PORT = Number(arg('port', SUB === 'selftest' ? '7791' : '0'))
const PROFILE = arg('profile', 'vmself')
const WS = arg('ws', join(tmpdir(), 'vm-selftest-ws'))
const CWD = arg('cwd', WS)
const PRESET = arg('preset', 'vibe-math-v5')
const RESUME = arg('resume', arg('session', null))
const TASK_FILE = arg('task-file', null)
const TASK = arg('task', null) ?? process.env.DSH_DRIVE_TASK ?? 'reply with the single word ok, then stop'
const STEER = arg('steer', null)
const DO_CANCEL = flag('cancel')
const CANCEL_AFTER = Number(arg('cancel-after', '8000'))
const JSONL = arg('jsonl', null)
const OUT = arg('out', null)
const TIMEOUT_S = Number(arg('timeout', '600'))
const MAX_TOKENS = Number(arg('max-tokens', '0'))   // 0 = no cap; else abort cleanly when root+child usage reaches it
const QUIET = flag('quiet')
const FOLLOW = flag('follow')
const FOLLOW_STREAM = flag('follow-stream')
const FOLLOW_MEMBERS = flag('follow-members')   // also follow every subagent/member session (SessionAddress kind:'subagent')
const ALLOW_PROBE = flag('allow-probe-patch')

const emit = (o) => { const line = JSON.stringify(o); if (!QUIET) console.log(line); if (JSONL) appendFileSync(JSONL, line + '\n') }
const die = (m) => { emit({ step: 'fatal', error: m }); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- operational guard: never drive real turns from a probe-patching profile -------------------
function guardProfile(name) {
  const p = join(DSH_HOME, 'profiles', name, 'cordis.patch.yml')
  if (!existsSync(p)) return
  const text = readFileSync(p, 'utf8')
  if (/name:\s*['"]?\.?\/?[^'"\n]*probe/i.test(text) && !ALLOW_PROBE) {
    die(`profile "${name}" inserts a surface-probe row; real turns must use a clean profile (probe mounting at root breaks the model request: REQUEST_EXTENSION). Override with --allow-probe-patch.`)
  }
}

// ---- selftest: boot our own scratch instance --------------------------------------------------
let server = null
async function startServer() {
  guardProfile(PROFILE)
  mkdirSync(WS, { recursive: true })
  const bin = process.env.DSH_BIN || 'C:/Users/admin/scoop/apps/nodejs-lts/current/bin/node_modules/@deepseek-ai/dsh/lib/bin.js'
  emit({ step: 'server', action: 'spawn', profile: PROFILE, port: PORT, ws: WS })
  server = spawn(process.execPath, [bin, '--profile', PROFILE, '--port', String(PORT), '--no-open'], { cwd: WS, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = '', err = ''
  server.stdout.on('data', (d) => { out += d.toString() })
  server.stderr.on('data', (d) => { err += d.toString() })
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    const m = /token=([A-Za-z0-9_\-]+)/.exec(out)
    if (m) return { token: m[1], stderrBytes: err.length }
    if (server.exitCode !== null) die(`server exited early (code ${server.exitCode}); stderr=${err.slice(0, 400)}`)
    await sleep(250)
  }
  die('server did not print a token within 60s')
}
const stopServer = () => { try { server?.kill() } catch {} }

// ---- RPC --------------------------------------------------------------------------------------
let COOKIE = ''
const ORIGIN = () => `http://127.0.0.1:${PORT}`
async function auth(token) {
  const res = await fetch(`${ORIGIN()}/?token=${token}`, { redirect: 'manual' })
  const raw = (res.headers.getSetCookie?.() ?? [res.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0])
  COOKIE = raw.join('; ')
  emit({ step: 'auth', status: res.status, cookie: COOKIE ? COOKIE.split('=')[0] + '=…' : '(none)' })
}
async function rpc(endpoint, payload) {
  const body = { type: 'client-request', rpcId: randomUUID(), method: endpoint, payload }
  const res = await fetch(`${ORIGIN()}/api/${endpoint}`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: COOKIE }, body: JSON.stringify(body) })
  const text = await res.text()
  let env = null
  try { env = JSON.parse(text) } catch { /* non-JSON */ }
  emit({ step: 'rpc', endpoint, ok: !!env?.result?.ok, error: env?.result?.error, http: res.status })
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${endpoint}: ${text.slice(0, 200)}`)
  if (!env?.result?.ok) throw new Error(`${endpoint}: ${JSON.stringify(env?.result?.error ?? env)}`)
  return env.result.value
}

// ---- session/follow (Remote stream) + $events -------------------------------------------------
let sock = null, followTry = 0, followOk = false, membersFollowed = 0
const EVENT_ID = 'drive-events', FOLLOW_ID = 'drive-follow'
const FOLLOW_PAYLOADS = (sid) => [
  { args: { request: { address: { kind: 'session', sessionId: sid }, assistantStream: true } } },
  { args: { request: { address: { kind: 'session', sessionId: sid } } } },
]
function sendFollow(sid) {
  if (sock?.readyState === 1) sock.send(JSON.stringify({ type: 'open', streamId: FOLLOW_ID, endpoint: 'session/follow', payload: FOLLOW_PAYLOADS(sid)[followTry] }))
}
// one stream per (mode, child); the wrong `mode` answers with an error, the right one streams
function sendMemberFollows(rootId, childId) {
  for (const mode of ['continuable', 'one-shot', 'unknown']) {
    if (sock?.readyState !== 1) return
    sock.send(JSON.stringify({ type: 'open', streamId: 'follow-' + mode + '-' + childId, endpoint: 'session/follow', payload: { args: { request: { address: { kind: 'subagent', parentSessionId: rootId, childSessionId: childId, mode }, assistantStream: true } } } }))
  }
}
async function openStreams(sid) {
  if (!FOLLOW && !FOLLOW_STREAM && !FOLLOW_MEMBERS) return
  const mod = await import(pathToFileURL('C:/Users/admin/.dsh/profiles/node_modules/ws/index.js').href)
  const WSock = mod.default ?? mod.WebSocket
  sock = new WSock(`ws://127.0.0.1:${PORT}/api/remote.mux`, { headers: { cookie: COOKIE, host: `127.0.0.1:${PORT}` } })
  sock.on('open', () => {
    emit({ step: 'mux', status: 'open' })
    if (FOLLOW) sock.send(JSON.stringify({ type: 'open', streamId: EVENT_ID, endpoint: '$events', payload: { args: {} } }))
    if (FOLLOW_STREAM && sid) sendFollow(sid)
  })
  sock.on('error', (e) => emit({ step: 'mux', error: String(e.message || e) }))
  sock.on('close', (c, r) => emit({ step: 'mux', closed: c, reason: String(r).slice(0, 120) }))
  sock.on('message', (data) => {
    let f; try { f = JSON.parse(String(data)) } catch { return }
    const mm = /^follow-(continuable|one-shot|unknown)-(.+)$/.exec(String(f.streamId || ''))
    if (mm) {   // member/subagent session stream (SessionAddress kind:'subagent')
      if (f.type === 'item') { membersFollowed += 1; return emit({ step: 'member-item', session: mm[2], kind: 'member', mode: mm[1], value: f.value }) }
      if (f.type === 'error') return emit({ step: 'member-error', session: mm[2], mode: mm[1], error: f.error })
      return
    }
    if (f.type === 'item' && f.streamId === FOLLOW_ID) { followOk = true; return emit({ step: 'follow-item', session: sid, kind: 'root', value: f.value }) }
    if (f.type === 'error' && f.streamId === FOLLOW_ID) {
      emit({ step: 'follow-error', attempt: followTry, error: f.error })
      if (followTry < FOLLOW_PAYLOADS(sid).length - 1) { followTry += 1; sendFollow(sid) }
      return
    }
    if (f.type === 'item') return emit({ step: 'event', session: sid, kind: 'root', value: f.value })
    emit({ step: 'frame', frame: f.type, streamId: f.streamId, error: f.error })
  })
}

// ---- session log reader (multi-frame zstd) -> assistant text for the report --------------------
function readSession(sid) {
  const root = join(DSH_HOME, 'sessions')
  const walk = (d, o = []) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p, o); else o.push(p) } return o }
  let file = null
  try { file = walk(root).find((p) => p.includes(sid) && /session.*jsonl/.test(p)) } catch { /* no sessions */ }
  if (!file) return { file: null, events: [], assistant: [], tools: [] }
  const buf = readFileSync(file)
  const M = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]); const parts = []; let off = 0
  while (off < buf.length) { const n = buf.indexOf(M, off + 4); const s = n === -1 ? buf.subarray(off) : buf.subarray(off, n); try { parts.push(zlib.zstdDecompressSync(s)) } catch {} if (n === -1) break; off = n }
  const events = []; const assistant = []; const tools = []
  for (const l of Buffer.concat(parts).toString('utf8').split('\n').filter(Boolean)) {
    let e; try { e = JSON.parse(l) } catch { continue }
    events.push(e)
    if (e.type === 'assistant/message') { const t = (e.data?.message?.content ?? []).map((c) => c.text ?? '').join(''); if (t.trim()) assistant.push(t) }
    if (e.type === 'tool/call') tools.push(e.data?.name)
  }
  return { file, events, assistant, tools }
}
function tree(dir) {
  const out = []
  const w = (d, b = '') => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) w(p, b + e.name + '/'); else out.push(b + e.name) } }
  if (existsSync(dir)) w(dir)
  return out
}

// ---- main -------------------------------------------------------------------------------------
const t0 = Date.now()
if (SUB === 'selftest') { const s = await startServer(); await auth(s.token) } else {
  const token = arg('token'); if (!token) die('attach mode needs --token')
  await auth(token)
}
const list = async () => (await rpc('session/list', { args: { _request: {} } })).items
let sessionId = RESUME
if (sessionId) {
  const cur = (await list()).find((x) => x.sessionId === sessionId)
  emit({ step: 'resume', sessionId, found: !!cur, projectionPreset: cur?.projections?.values?.agentPreset, agentAvailable: cur?.agentAvailable })
  if (!cur) die(`session ${sessionId} not found`)
} else {
  const created = await rpc('session/create', { args: { request: { agentPreset: PRESET, cwd: CWD } } })
  sessionId = created.sessionId
  emit({ step: 'create', sessionId, agentPreset: created.agentPreset })
  const it = (await list()).find((x) => x.sessionId === sessionId)
  emit({ step: 'verify', projectionPreset: it?.projections?.values?.agentPreset, agentAvailable: it?.agentAvailable })
  if (it?.projections?.values?.agentPreset !== PRESET) die('preset did not take effect')
}
await openStreams(sessionId)

const instruction = TASK_FILE ? readFileSync(TASK_FILE, 'utf8') : TASK
const r = await rpc('session/prompt', { args: { request: { requestId: randomUUID(), sessionId, mode: 'queue', content: [{ type: 'text', text: instruction }] } } })
emit({ step: 'prompt', accepted: r.accepted, chars: instruction.length })

if (STEER) setTimeout(() => { rpc('session/prompt', { args: { request: { requestId: randomUUID(), sessionId, mode: 'steer', content: [{ type: 'text', text: STEER }] } } }).then((v) => emit({ step: 'steer', accepted: v.accepted })).catch((e) => emit({ step: 'steer', error: String(e.message || e) })) }, Number(arg('steer-after', '6000')))
if (DO_CANCEL) setTimeout(() => { rpc('session/cancel', { args: { request: { sessionId } } }).then((v) => emit({ step: 'cancel', value: v })).catch((e) => emit({ step: 'cancel', error: String(e.message || e) })) }, CANCEL_AFTER)

const deadline = Date.now() + TIMEOUT_S * 1000
// token cap counts the root session AND any member/child sessions (v5 members are real child agents)
const tokTotal = (items) => items
  .filter((x) => x.sessionId === sessionId || x.parentSessionId === sessionId)
  .reduce((n, x) => { const t = x.projections?.values?.tokenUsage ?? {}; return n + (t.uncachedInputTokens || 0) + (t.outputTokens || 0) + (t.cacheReadTokens || 0) + (t.cacheWriteTokens || 0) }, 0)
let last = null, capped = false, total = 0
while (Date.now() < deadline) {
  await sleep(3000)
  const items = await list()
  const now = items.find((x) => x.sessionId === sessionId)
  if (!now) continue
  last = now
  const tu = now.projections?.values?.tokenUsage
  total = tokTotal(items)
  emit({ step: 'poll', t: Math.round((Date.now() - t0) / 1000), running: now.running, out: tu?.outputTokens, in: tu?.uncachedInputTokens, totalTokens: total })
  if (FOLLOW_MEMBERS) {
    const seen = (globalThis.__dshFollowedChildren ??= new Set())
    for (const it of items) {
      if (it.sessionId === sessionId || it.parentSessionId !== sessionId || seen.has(it.sessionId)) continue
      seen.add(it.sessionId)
      emit({ step: 'member-follow', session: it.sessionId, preset: it.projections?.values?.agentPreset, title: it.projections?.values?.title })
      sendMemberFollows(sessionId, it.sessionId)
    }
  }
  if (MAX_TOKENS > 0 && total >= MAX_TOKENS) {
    capped = true
    emit({ step: 'token-cap', totalTokens: total, cap: MAX_TOKENS, action: 'session/cancel' })
    try { await rpc('session/cancel', { args: { request: { sessionId } } }) } catch (e) { emit({ step: 'token-cap', cancelError: String(e.message || e) }) }
    await sleep(6000)
    break
  }
  if (!now.running && !(FOLLOW_MEMBERS && items.some((x) => x.parentSessionId === sessionId && x.running)) && (tu?.outputTokens ?? 0) > 0) break
}
const dur = Math.round((Date.now() - t0) / 1000)
const sess = readSession(sessionId)
const summary = {
  sessionId, preset: PRESET, durationSec: dur,
  tokens: last?.projections?.values?.tokenUsage ?? null,
  tokenTotal: total, tokenCap: MAX_TOKENS, tokenCapHit: capped,
  title: last?.projections?.values?.title ?? null,
  transcriptEvents: sess.events.length, toolCalls: sess.tools.length,
  followStreamWorked: followOk, sessionLog: sess.file,
  workspaceFiles: tree(CWD),
}
emit({ step: 'done', ...summary, tools: sess.tools })

if (SUB === 'selftest') {
  const out = OUT || join(process.cwd(), 'vm-selftest')
  mkdirSync(out, { recursive: true })
  writeFileSync(join(out, 'transcript.jsonl'), (JSONL && existsSync(JSONL)) ? readFileSync(JSONL, 'utf8') : '')
  writeFileSync(join(out, 'report.md'), '# v5 self-test report\n\n' + (sess.assistant.join('\n\n---\n\n') || '(no assistant message captured)') + '\n')
  writeFileSync(join(out, 'ws-tree.txt'), summary.workspaceFiles.join('\n') + '\n')
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2) + '\n')
  emit({ step: 'dumped', out, files: ['transcript.jsonl', 'report.md', 'ws-tree.txt', 'summary.json'] })
  stopServer()
}
try { sock?.close() } catch {}
process.exit(0)
