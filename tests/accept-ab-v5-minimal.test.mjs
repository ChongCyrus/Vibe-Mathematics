// ============================================================================
// accept-ab-v5-minimal.test.mjs — INDEPENDENT ACCEPTANCE (verifier-ab, task-1)
//
// Subject (frozen, READ-ONLY): vibe-math-v5/vibe-math-v5.js
//   A. parseReply failure must be DISCOVERABLE, and the real host path must leave a
//      record naming the member id + the raw output snippet; the same CONTENT with the
//      closing braces restored must parse again (and carry ParsedReply === true).
//   B. 4 voters, 3 readable ballots, the 4th member keeps emitting broken JSON:
//      B1 the ask count is bounded AND equals the DEFAULT params.verifyAskMaxAttempts (3)
//      B2 the terminal outcome is 'undecided' (NOT 'false'), with a record naming the
//         member id and the ask count
//      B3 the other 3 ballots are neither dropped nor rewritten
//      B4 the same scenario with a LEGAL reply from the 4th member reaches consensus and
//         is written to Verified/  (proof that only the broken road is blocked)
//
// Run: node tests/accept-ab-v5-minimal.test.mjs
// Raw output is stored verbatim in tests/_accept-out/ab.txt
//
// VERIFIED ARTEFACT — FINAL REVISION, HASH STABLE AND MATCHING THE SHIPPED FILE:
//   The plugin changed twice more AFTER the first acceptance round, so this suite has been
//   re-run for each revision (the A/B assertions themselves were never touched):
//     · the Lead's fix to the (a.2) orphan-dispatch notice path (notice('office', …) ->
//       saveChatLine, found by verifier-c)  -> 629,765 B / 0b91aff7…
//     · verifyAskMaxAttempts + orphanDispatchMaxAttempts added to visibleParams()
//       (source 7880-7892, the landing.md §3 rule) -> CURRENT, below
//   The file was byte-stable across 4 consecutive full runs (each 73/73) at the revision
//   below, and the sha256 was re-confirmed against the file immediately after the run:
//     bytes  = 630,189
//     sha256 = a3ba531294decabcc80c0214859496080f80b2970822c67ba6e4c647ebfbbe8c
//     mtime  = 2026-10-10T14:25:50.2703469Z
//   Historical note: during the FIRST round the file was NOT frozen (574,955 -> 575,106
//   -> 629,237 bytes); those results are superseded and no longer cited. Any further edit
//   to vibe-math-v5.js invalidates this file's results and the suite must be re-run.
//
// FIXTURE NOTE (a real defect in the task-1 spec text — reported to the Lead, who accepted
//   it): the spec's literal text is (§A):
//     {"verdict": {"value": 1, "reason": "该判据在非齐次理想上不成立" , "contextPct": 99
//   It is 69 chars and is short by TWO closing braces — its last shown char is already the
//   '}' that closes `verdict`, so the outer object is never closed. Consequently the spec
//   sentence "补上 } 后仍能正常解析" is FALSE for its own byte string: appending a single
//   '}' there is still unparseable. That is asserted, not assumed (check A3e, PASS).
//   This suite uses the spec's VERBATIM text as the broken subject of A1/A2 (so the broken
//   side is byte-identical to the task) and the SAME content with both braces restored
//   (71 chars) as the healthy subject of A3. Checks FIX1..FIX5 verify that relationship
//   from the strings themselves, so nothing above is taken on trust.
// ============================================================================
import { mkdtempSync, existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute } from 'node:path'

// ── engine discovery must not touch this machine (same isolation as e2e-v5-round2) ──
const EMPTY_ENGINE_ROOT = mkdtempSync(join(tmpdir(), 'vibe-v5-ab-nodsh-'))
process.env.DSH_HOME = EMPTY_ENGINE_ROOT
process.env.ProgramFiles = EMPTY_ENGINE_ROOT
process.env['ProgramFiles(x86)'] = EMPTY_ENGINE_ROOT
process.env.LOCALAPPDATA = EMPTY_ENGINE_ROOT
process.env.V5_TEX_ROOTS_SANDBOX = EMPTY_ENGINE_ROOT

const PLUGIN = process.env.V5_PLUGIN
  ? new URL('file:///' + String(process.env.V5_PLUGIN).replace(/\\/g, '/'))
  : new URL('../vibe-math-v5/vibe-math-v5.js', import.meta.url)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── the acceptance fixture text ─────────────────────────────────────────────
// SPEC_BAD is the task-1 text VERBATIM (69 chars).
const SPEC_BAD = '{"verdict": {"value": 1, "reason": "该判据在非齐次理想上不成立" , "contextPct": 99'
// The broken side = the spec text VERBATIM (this is what A1/A2 subject to the plugin).
const BAD_TEXT = SPEC_BAD
// The healthy side = the SAME content with both braces closed and nothing else changed.
const GOOD_TEXT = SPEC_BAD + '}}'
// The repair the spec's sentence describes (ONE added '}') — kept as the negative control
// that shows the spec's byte string is short by TWO chars.
const SPEC_ONE_BRACE_REPAIR = SPEC_BAD + '}'
const TRUE_FULL_TEXT = GOOD_TEXT

// ── the assertion harness. NOTHING is softened: a failed check is a failure. ──
let passed = 0, failed = 0
const failures = []
function assert(cond, msg, detail) {
  if (cond) { passed++; console.log('  ok   - ' + msg) }
  else {
    failed++; failures.push(msg)
    console.error('  FAIL - ' + msg + (detail !== undefined ? ' ｜ got: ' + detail : ''))
  }
}
function note(msg) { console.log('  #  ' + msg) }
function dump(label, value) {
  const s = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  console.log('  >>> ' + label + ':\n' + String(s).split('\n').map((l) => '      ' + l).join('\n'))
}

// JSON identity that ignores insignificant whitespace (key order is preserved by both paths).
function sign(s) { return String(s).replace(/\s+/g, '') }

function makeSession(id, parentSession) {
  const events = []
  return {
    id,
    header: { version: 1, id, createdAt: Date.now(), cwd: null, parentSession, isSeeded: false },
    inheritedEventCount: 0,
    get seq() { return events.length },
    append(type, data) { const ev = { type, data, seq: events.length, time: Date.now() }; events.push(ev); return ev },
    deriveMessages() { return [] },
    snapshotEvents(from) { return events.slice(from || 0) },
    ownEvents() { return events.slice() },
    _events: events,
  }
}

// ── minimal host: exactly the services this scenario touches ────────────────
function makeHost(opts) {
  const o = opts || {}
  const WS = o.ws || mkdtempSync(join(tmpdir(), 'vibe-v5-ab-'))
  const listeners = {}, toolRegs = [], commandRegs = [], spawns = [], wakes = [], drainCalls = []
  let wakeSends = 0
  const liveAgents = new Map()

  const ROOT_SESSION = makeSession('sess-A', undefined)
  ROOT_SESSION.header.cwd = WS
  const ROOT = { id: 'sess-A', options: {}, session: ROOT_SESSION }

  const ctx = {
    get(name) {
      if (name === 'sandboxPolicy') return undefined
      if (name === 'compaction') return undefined
      if (name === 'subprocess') return { async spawn() { return { done: Promise.resolve({ exitCode: 0 }) } } }
      return undefined
    },
    on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
    effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
    logger: { info() {}, warn() {}, error() {} },
    timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
    tools: { register(spec) { toolRegs.push(spec); return () => {} } },
    commands: { register(spec) { commandRegs.push(spec); return () => {} } },
    subagents: {
      list() { return ['spawn'] },
      async startContinuable({ label, request }) {
        const id = 'c' + (spawns.length + 1)
        const childSession = makeSession(id, 'sess-A'); childSession.header.cwd = WS
        liveAgents.set(id, { id, session: childSession, options: request && request.agentOptions })
        spawns.push({ label, request, childId: id, ended: false })
        return { childId: id, messageId: 'm' + spawns.length }
      },
      async sendMessage(parent, childId, blocks) {
        wakeSends += 1
        wakes.push({ childId, blocks }); return 'w' + wakes.length
      },
      interrupt() {},
      async drainContinuableChildren(parent, ids) { drainCalls.push(...ids); for (const i of ids) liveAgents.delete(i) },
    },
    agents: {
      roots() { return [ROOT] },
      get(id) { return id === ROOT.id ? ROOT : liveAgents.get(id) },
      list() { return [ROOT, ...liveAgents.values()] },
    },
    fs: {
      async resolve(rel, o2) {
        const b = (o2 && o2.cwd) || WS
        const p = (typeof rel === 'string' && isAbsolute(rel)) ? rel.replace(/\//g, '\\') : join(b, ...String(rel).split('/'))
        return { targetKey: p, displayPath: p }
      },
      async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
      async readText(t) { return readFileSync(t.targetKey, 'utf8') },
      async writeText(t, c) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8') },
      async listDir(t) { if (!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey, { withFileTypes: true }).map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
    },
  }

  const mod = o.pluginModule
  mod.apply(ctx)

  const childAgent = (childId) => liveAgents.get(childId) || { id: childId, session: { header: { parentSession: ROOT.id } } }
  const spawnOf = (m) => spawns.find((s) => s.label.indexOf('vibe5 ' + m + ' ') !== -1)
  const childOf = (m) => { const s = spawnOf(m); return s ? s.childId : m }
  const labelOf = (cid) => { const s = spawns.find((x) => x.childId === cid); const m = s ? /vibe5 (\S+) /.exec(s.label) : null; return m ? m[1] : '' }
  // Kind of a prompt, derived from the prompt TEXT only (never from the recipient), so
  // "who was asked" stays an independent observation instead of a circular one.
  const kindOf = (p) => /【入职首轮/.test(p) ? 'initial' : /【研究所会议/.test(p) ? 'meeting' : /【求真表决/.test(p) ? 'verify' : /【心跳检查/.test(p) ? 'checkpoint' : 'normal'
  const promptTextOf = (w) => (w.blocks && w.blocks[0] && w.blocks[0].text) || ''

  // The ask ledger, filled INSIDE sendMessage (see sendMessageOf below).
  const asks = []
  // Re-wrap the service method purely for OBSERVATION: the payload is untouched.
  const sendMessageOf = ctx.subagents.sendMessage
  ctx.subagents.sendMessage = async function (parent, childId, blocks) {
    const text = (blocks && blocks[0] && blocks[0].text) || ''
    asks.push({ childId, member: labelOf(childId), kind: kindOf(text), text: text.slice(0, 60) })
    return await sendMessageOf.call(ctx.subagents, parent, childId, blocks)
  }

  async function callTool(name, args, agent) {
    const spec = toolRegs.find((x) => x.name === name)
    if (!spec) throw new Error('no tool ' + name)
    return JSON.parse(await spec.execute(args || {}, { agent: agent || ROOT }))
  }

  function fireEnd(childId, reply, stopReason) {
    const blocks = reply === undefined ? [] : [{ type: 'text', text: '```json\n' + JSON.stringify(reply) + '\n```' }]
    return fireEndRaw(childId, blocks, stopReason)
  }
  // The REAL host path with an ARBITRARY payload — this is how a raw model output reaches
  // the plugin's subagent/end handler without passing through JSON.stringify.
  async function fireEndRaw(childId, blocks, stopReason) {
    const out = []
    for (const h of (listeners['subagent/end'] || [])) {
      out.push(await h({ id: childId, runId: 'r', provider: 'spawn', local: true, stopReason: stopReason || 'completed', lastAssistantMessage: blocks }))
    }
    return out
  }
  async function settleSpawns() {
    for (const sp of spawns.slice()) {
      if (sp.ended) continue
      sp.ended = true
      await fireEnd(sp.childId, { progress: labelOf(sp.childId) + '：初始见解已记录。', solved: false, contextPct: 10 })
      await sleep(10)
    }
  }
  return { WS, ctx, ROOT, ROOT_SESSION, spawns, wakes, asks, drainCalls, toolRegs, listeners,
    get wakeSends() { return wakeSends },
    callTool, childAgent, childOf, labelOf, kindOf, promptTextOf, fireEnd, fireEndRaw, spawnOf, settleSpawns }
}

// ── load the frozen plugin once ─────────────────────────────────────────────
let pluginModule = null
try {
  pluginModule = await import(PLUGIN.href)
} catch (e) {
  console.error('FATAL: cannot import the plugin: ' + String((e && e.stack) || e))
  process.exit(2)
}
const H = pluginModule.__testHelpers

// ── workspace artefact readers ──────────────────────────────────────────────
function instRootOf(WS) { return join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute') }
function stateFileOf(WS) { return join(instRootOf(WS), 'State', 'institute.v5state.json') }
function instOf(WS) {
  const p = stateFileOf(WS)
  if (!existsSync(p)) return null
  const s = JSON.parse(readFileSync(p, 'utf8'))
  if (!s || !s.institutes) return null
  const k = Object.keys(s.institutes)[0]
  return k ? s.institutes[k] : null
}
function verdictOf(WS, target) {
  const i = instOf(WS)
  return i && i.verdicts ? i.verdicts[target] : null
}
function chatMirrorText(WS) {
  const dir = join(instRootOf(WS), 'Shared', 'Chat')
  if (!existsSync(dir)) return null
  return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
}

// ── the propose_verify PREREQUISITE the reference factory also adds ─────────
// The gate is stated in the tool's own description ("with op=formal_proof and
// status=proved|disproved ... only such objects may be debated at all"), so it is read
// from the registered schema rather than hard-coded, exactly like e2e-v5-round2 does.
async function proposeVerify(h, target, reason, caller) {
  const pvSpec = h.toolRegs.find((x) => x.name === 'vibe_v5_propose_verify')
  const gated = !!(pvSpec && /formal_proof/.test(String(pvSpec.description || '')))
  const whose = caller || h.childAgent(h.childOf('acad'))
  if (gated) {
    const pre = h.toolRegs.some((x) => x.name === 'vibe_v5_end_verify')
      ? await h.callTool('vibe_v5_end_verify', { target, reason, op: 'formal_proof', status: 'proved' }, whose)
      : await h.callTool('vibe_v5_propose_verify', { target, reason, op: 'formal_proof', status: 'proved' }, whose)
    note('prerequisite (formal_proof registration, gated=' + gated + ') -> ' + JSON.stringify(pre))
  }
  return await h.callTool('vibe_v5_propose_verify', { target, kind: 'proposition', reason }, whose)
}

// ── B scenario driver: answer every wake; the stuck member answers RAW broken text ──
const PLANNED = new Map([['acad', 1], ['r-1', 1], ['r-2', 0.5], ['r-3', 0.5]])
const REASONS = new Map([['acad', 'acad 的理由：齐次情形可约化'], ['r-1', 'r-1 的理由：反例给出反方向证据'], ['r-2', 'r-2 的理由：我不确定，记弃权']])

async function driveOnce(h, target, stuckMember, stuckMode, budgetMs) {
  const t0 = Date.now()
  let iterations = 0
  const answered = new Map()
  const badFired = []
  while (Date.now() - t0 < budgetMs && iterations < 5000) {
    iterations++
    const i = h.wakes.findIndex((w) => h.kindOf(h.promptTextOf(w)) === 'verify')
    if (i === -1) {
      const done = verdictOf(h.WS, target)
      if (done && done.closed) break
      await sleep(15)
      continue
    }
    const w = h.wakes.splice(i, 1)[0]
    const who = h.labelOf(w.childId)
    answered.set(who, (answered.get(who) || 0) + 1)
    if (who === stuckMember) {
      if (stuckMode === 'bad') {
        const raw = '{"verdict": {"target": "' + target + '", "verdict": 1, "reason": "我判为真，但我的 JSON 少了一个右花括号", "contextPct": 99'
        badFired.push({ member: who, childId: w.childId, raw })
        await h.fireEndRaw(w.childId, [{ type: 'text', text: raw }])
      } else {
        await h.fireEnd(w.childId, { verdict: { target, verdict: 1, reason: 'stuck 已修正：我判为真' }, contextPct: 20 })
      }
    } else {
      const v = PLANNED.has(who) ? PLANNED.get(who) : 0.5
      await h.fireEnd(w.childId, { verdict: { target, verdict: v, reason: REASONS.get(who) || (who + ' 判断') }, contextPct: 20 })
    }
    await sleep(25)
  }
  return { iterations, answered, badFired, timedOut: !(verdictOf(h.WS, target) || {}).closed }
}

console.log('================================================================')
console.log('accept-ab-v5-minimal — independent acceptance of the frozen plugin')
console.log('plugin URL      : ' + PLUGIN.href)
console.log('plugin bytes    : ' + readFileSync(PLUGIN).length)
console.log('plugin sha256   : ' + createHash('sha256').update(readFileSync(PLUGIN)).digest('hex'))
console.log('plugin mtime    : ' + statSync(PLUGIN).mtime.toISOString())
console.log('node            : ' + process.version)
console.log('__testHelpers   : ' + (H ? Object.keys(H).join(', ') : '(MISSING)'))
console.log('SPEC_BAD (' + SPEC_BAD.length + 'ch) : ' + SPEC_BAD)
console.log('GOOD_TEXT(' + GOOD_TEXT.length + 'ch) : ' + GOOD_TEXT)
console.log('================================================================')

// ============================================================================
// ACCEPTANCE A — a broken reply must be DISCOVERABLE
// ============================================================================
console.log('\n[A] parseReply failure is discoverable\n')
{
  assert(!!H && typeof H.parseReply === 'function', 'A0 __testHelpers.parseReply exists', H && Object.keys(H).join(','))
  assert(!!H && typeof H.ParsedReply === 'function' && typeof H.ParseFailed === 'function',
    'A0b __testHelpers exports the ParsedReply/ParseFailed marker classes',
    H && (typeof H.ParsedReply) + '/' + (typeof H.ParseFailed))

  // ---- FIXTURE_REPAIR: the spec text really is ONE character away from parseable ----
  console.log('\n  [A/fixture] SPEC_BAD vs the repaired text\n')
  dump('SPEC_BAD length', String(SPEC_BAD.length))
  dump('GOOD_TEXT length', String(GOOD_TEXT.length))
  assert(GOOD_TEXT === SPEC_BAD + '}}', 'FIX1 GOOD_TEXT is SPEC_BAD plus exactly the two closing braces', JSON.stringify(GOOD_TEXT.slice(-3)))
  assert(GOOD_TEXT.slice(0, SPEC_BAD.length) === SPEC_BAD && GOOD_TEXT.length === SPEC_BAD.length + 2,
    'FIX2 GOOD_TEXT keeps SPEC_BAD byte-for-byte and adds 2 chars', GOOD_TEXT.length + ' vs ' + SPEC_BAD.length)
  let specBadThrew = false
  try { JSON.parse(SPEC_BAD) } catch (e) { specBadThrew = true }
  assert(specBadThrew, 'FIX3 the spec text ALONE is not valid JSON (the premise of acceptance A)')
  let oneBraceStillBad = false
  try { JSON.parse(SPEC_ONE_BRACE_REPAIR) } catch (e) { oneBraceStillBad = true }
  assert(oneBraceStillBad, 'FIX4 SPEC_BAD + ONE appended "}" is STILL not valid JSON — the spec text is short by TWO braces', '')
  const goodViaNative = JSON.parse(TRUE_FULL_TEXT)
  assert(!!goodViaNative && !!goodViaNative.verdict,
    'FIX5 GOOD_TEXT IS valid JSON — the CONTENT is sound; only the brace count differed', JSON.stringify(goodViaNative))
  dump('FIX5 JSON.parse(GOOD_TEXT)', goodViaNative)

  // ---- A1: the broken text must NOT yield a plausible-looking vote object ----
  const bad = H.parseReply(BAD_TEXT)
  dump('A1 input (BAD_TEXT, the spec text verbatim)', BAD_TEXT)
  dump('A1 parseReply(BAD_TEXT) keys = ' + JSON.stringify(Object.keys(bad)), typeof bad)
  const looksLikeVote = !!(bad && typeof bad === 'object'
    && (bad.verdict !== undefined || bad.value !== undefined || bad.contextPct !== undefined))
  assert(!looksLikeVote, 'A1 parseReply(BAD_TEXT) does not return a vote-shaped object (no verdict/value/contextPct)',
    JSON.stringify(bad))
  assert(bad && bad[H.ParseFailed] !== undefined, 'A1b parseReply(BAD_TEXT) CARRIES the ParseFailed marker',
    String(bad && bad[H.ParseFailed]))
  assert(Object.keys(bad).length === 0, 'A1c the failed result is an empty plain object (destructurable, no fake fields)',
    JSON.stringify(bad))
  assert(bad[H.ParsedReply] === undefined, 'A1d the failed result does NOT claim to be a parsed reply',
    String(bad[H.ParsedReply]))
  assert(String(bad[H.ParseFailed]) === BAD_TEXT, 'A1e the ParseFailed payload is the RAW text, uncut (< 500 chars)',
    JSON.stringify(bad[H.ParseFailed]))
  dump('A1 ParseFailed payload', String(bad[H.ParseFailed]))

  // ---- A2: the REAL host path must leave a record with member id + raw snippet ----
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: '证明素数有无穷多个', researcherCount: 3 })
  await h.settleSpawns()
  const roster = instOf(h.WS).members.map((m) => m.id)
  note('roster = ' + roster.join(', '))
  note('childOf(r-2) = ' + h.childOf('r-2') + ' ｜ labelOf = ' + h.labelOf(h.childOf('r-2')))

  await h.callTool('vibe_v5_say', { to: 'r-2', text: '请回报你的判断（原始文本回复即可）。' }, h.childAgent(h.childOf('acad')))
  let wokeR2 = null
  for (let i = 0; i < 800 && !wokeR2; i++) {
    const j = h.wakes.findIndex((w) => h.labelOf(w.childId) === 'r-2')
    if (j !== -1) wokeR2 = h.wakes.splice(j, 1)[0]
    else await sleep(10)
  }
  assert(!!wokeR2, 'A2 setup: r-2 has an in-flight turn to end')
  if (wokeR2) {
    await h.fireEndRaw(wokeR2.childId, [{ type: 'text', text: BAD_TEXT }])
    await sleep(120)
    const mirror = chatMirrorText(h.WS) || ''
    const mirrorLine = mirror.split('\n').filter((l) => /无法解析/.test(l))
    const inst = instOf(h.WS)
    const msgs = (inst && inst.messages) || []
    const unparseableMsgs = msgs.filter((m) => /无法解析/.test(String(m.text || '')))
    dump('A2 in-state messages containing 无法解析', unparseableMsgs.map((m) => ({ id: m.id, from: m.from, kind: m.kind, text: m.text })))
    dump('A2 Shared/Chat mirror lines containing 无法解析', mirrorLine)

    const haystack = JSON.stringify(unparseableMsgs) + '\n' + mirrorLine.join('\n')
    assert(/无法解析/.test(haystack), 'A2 the host path recorded an "unparseable" line', haystack.slice(0, 200))
    assert(haystack.indexOf('r-2') !== -1, 'A2 the record NAMES the member id (r-2)', haystack.slice(0, 300))
    assert(haystack.indexOf(BAD_TEXT) !== -1,
      'A2b the record carries the WHOLE raw output (the spec text itself)', haystack.slice(0, 400))
    assert(haystack.indexOf('"verdict"') !== -1, 'A2c the snippet is the raw model text, not a re-serialised object', '')
    assert(!(inst.verdicts && Object.keys(inst.verdicts).length),
      'A2d the unreadable turn created no verdict record at all',
      JSON.stringify(Object.keys((inst && inst.verdicts) || {})))
  }

  // ---- A3: the same text with the missing braces still parses ----
  const good = H.parseReply(GOOD_TEXT)
  dump('A3 input (GOOD_TEXT = SPEC_BAD + "}}")', GOOD_TEXT)
  dump('A3 parseReply(GOOD_TEXT)', good)
  assert(!!good && typeof good === 'object' && good.verdict !== undefined,
    'A3 parseReply(GOOD_TEXT) returns the object (verdict present)', JSON.stringify(good))
  assert(good && good[H.ParsedReply] === true,
    'A3b parseReply(GOOD_TEXT)[ParsedReply] === true', String(good && good[H.ParsedReply]))
  assert(good && good[H.ParseFailed] === undefined,
    'A3c the good parse carries no ParseFailed marker', String(good && good[H.ParseFailed]))
  assert(good && sign(JSON.stringify(good)) === sign(JSON.stringify(goodViaNative)),
    'A3d the helper result matches the native JSON.parse result', JSON.stringify(good))
  // A3e: the honest note that the spec's ONE-character repair does not work.
  const repairedByOneBrace = H.parseReply(SPEC_ONE_BRACE_REPAIR)
  assert(repairedByOneBrace[H.ParsedReply] !== true,
    'A3e [DOCUMENTED SPEC DISCREPANCY] SPEC_BAD + ONE "}" is STILL unparseable — the spec sentence '
    + '"补上 } 后仍能正常解析" is FALSE for its own byte string (the text is short by two braces)',
    'ParsedReply=' + String(repairedByOneBrace[H.ParsedReply]))
  dump('A3e SPEC_BAD + one "}" (the spec\'s literal repair)',
    'ParsedReply=' + String(repairedByOneBrace[H.ParsedReply])
    + ' ParseFailed=' + JSON.stringify(repairedByOneBrace[H.ParseFailed]))
}

// ============================================================================
// ACCEPTANCE B — 3 readable ballots + 1 member stuck on broken JSON
// ============================================================================
console.log('\n[B] 4 voters, the 4th keeps answering broken JSON\n')
const B_TARGET = 'p-ab-stuck'
const BUDGET_MS = 30000
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: '证明素数有无穷多个', researcherCount: 3 })
  await h.settleSpawns()
  // fast cadence: the watchdog window is 2×activityTimeoutMs. The DEFAULT
  // verifyAskMaxAttempts is deliberately NOT touched (B1 asserts it is the default 3).
  const setRes = await h.callTool('vibe_v5_set', { activityTimeoutMs: 150 })
  note('vibe_v5_set activityTimeoutMs -> ok=' + setRes.ok + '｜params.activityTimeoutMs=' + setRes.params.activityTimeoutMs)
  // This run OVERRIDES nothing about the ask limits: the only key sent is activityTimeoutMs.
  // (Before the visibleParams() change the echo simply LACKED the ask keys; now it carries them
  //  at their defaults. Either way the value used by the plugin is the default 3 — B1 asserts that,
  //  and SUPP1..SUPP5 read both limits back from /v5 status.)
  dump('B0 ask-limit keys present in the vibe_v5_set echo (informational only — this run never set them)',
    Object.keys(setRes.params).filter((k) => /[Aa]sk/.test(k)))
  dump('B0 their values in the echo (must be the defaults)',
    { verifyAskMaxAttempts: setRes.params.verifyAskMaxAttempts, orphanDispatchMaxAttempts: setRes.params.orphanDispatchMaxAttempts })
  const st0 = await h.callTool('vibe_v5_status', {})
  dump('B0 status.quorum (before)', st0.quorum)
  const voterIds = instOf(h.WS).members.map((m) => m.id)
  assert(st0.quorum.voterCount === 4, 'B0 the scenario really has 4 voters (got ' + st0.quorum.voterCount + ')', JSON.stringify(st0.quorum))
  note('roster = ' + voterIds.join(', '))
  const STUCK = 'r-3'
  assert(voterIds.indexOf(STUCK) !== -1, 'B0b the stuck member ' + STUCK + ' is one of the voters')

  await h.callTool('vibe_v5_record_proposition', { id: B_TARGET, statement: '本判据在非齐次理想上不成立', value: 0.5, motive: '独立验收', p: 0.5 }, h.childAgent(h.childOf('r-1')))
  const prop = await proposeVerify(h, B_TARGET, '独立验收：卡住的表决必须三次即停')
  dump('B0 propose_verify ->', prop)
  assert(prop && prop.ok !== false, 'B0c the verification really started', JSON.stringify(prop))

  const asksBefore = h.asks.filter((a) => a.kind === 'verify').length
  note('verify-kind sends observed BEFORE the driver: ' + asksBefore)
  const run = await driveOnce(h, B_TARGET, STUCK, 'bad', BUDGET_MS)
  note('driver iterations = ' + run.iterations + '｜verify wakes answered per member = ' + JSON.stringify([...run.answered]))
  note('raw broken replies fired by ' + STUCK + ' = ' + run.badFired.length + '｜driver timed out = ' + run.timedOut)
  dump('B raw broken text actually sent to the host path', run.badFired.map((x) => x.raw))
  const verifyAsks = h.asks.filter((a) => a.kind === 'verify')
  dump('B verify-kind sends observed (member, text head)', verifyAsks.map((a) => a.member + '｜' + a.text.replace(/\n/g, ' ')))

  const v = verdictOf(h.WS, B_TARGET)
  assert(!!v, 'B0d a verdict record exists for ' + B_TARGET, stateFileOf(h.WS))
  if (!v) {
    assert(false, 'B1/B2/B3 could not run: no verdict record was written for ' + B_TARGET)
  } else {
    dump('B verdict record (from State/institute.v5state.json)', {
      target: v.target, closed: v.closed, outcome: v.outcome, reason: v.reason, round: v.round,
      stuckVoter: v.stuckVoter, askAttempts: v.askAttempts, lastUnparsed: v.lastUnparsed,
      votes: v.votes, m: v.m, P: v.P, mean: v.mean, bTrue: v.bTrue, bFalse: v.bFalse, abstain: v.abstain,
    })

    // ---- B1: bounded ask count, EQUAL to the DEFAULT params.verifyAskMaxAttempts ----
    const asksObserved = verifyAsks.filter((a) => a.member === STUCK).length
    const defaultAskMax = 3   // DEFAULT_PARAMS.verifyAskMaxAttempts (source line 982)
    note('DEFAULT params.verifyAskMaxAttempts = ' + defaultAskMax + ' (source line 982; this run never set it)')
    note('ASK LEDGER for ' + STUCK + ': ' + asksObserved + ' verify-kind send(s) observed from sendMessage. '
      + 'askAttempts recorded by the plugin = ' + JSON.stringify(v.askAttempts)
      + '. The +1 is the OPENING ask (askVoters), which the plugin does not count in askAttempts by design.')
    assert(Number.isFinite(Number(v.askAttempts)),
      'B1 the closed record carries a numeric askAttempts for the stuck member', String(v.askAttempts))
    assert(Number(v.askAttempts) <= defaultAskMax,
      'B1b the recorded ask count is BOUNDED by the default (' + v.askAttempts + ' <= ' + defaultAskMax + ')', String(v.askAttempts))
    assert(Number(v.askAttempts) === defaultAskMax,
      'B1c the recorded ask count EQUALS the default ' + defaultAskMax + ' (got ' + v.askAttempts + ') — this is the value task B1 names',
      String(v.askAttempts))
    assert(asksObserved === Number(v.askAttempts) + 1,
      'B1d the TOTAL observed asks to ' + STUCK + ' (' + asksObserved + ') are exactly askAttempts + 1 (the opening askVoters) — '
      + 'so the re-ask loop is bounded at ' + defaultAskMax + ' and carries no hidden retries',
      asksObserved + ' vs ' + (Number(v.askAttempts) + 1))
    assert(asksObserved <= defaultAskMax + 1,
      'B1e the TOTAL asks to ' + STUCK + ' stay bounded by the default + the opening ask (' + asksObserved + ' <= ' + (defaultAskMax + 1) + ')',
      String(asksObserved))
    assert(run.badFired.length === asksObserved,
      'B1f the stuck member emitted exactly one broken reply per ask (' + run.badFired.length + ' replies / ' + asksObserved + ' asks)',
      run.badFired.length + ' vs ' + asksObserved)

    // ---- B2: terminal outcome is undecided (NOT false), with an auditable record ----
    assert(v.outcome === 'undecided', 'B2 terminal outcome === "undecided" (got ' + JSON.stringify(v.outcome) + ')', JSON.stringify(v.outcome))
    assert(v.outcome !== 'false', 'B2b terminal outcome is NOT "false"', JSON.stringify(v.outcome))
    assert(v.closed === true, 'B2c the record is CLOSED', String(v.closed))
    assert(String(v.stuckVoter) === STUCK, 'B2d the record names the stuck member (stuckVoter=' + v.stuckVoter + ')', String(v.stuckVoter))
    assert(String(v.reason || '').indexOf(STUCK) !== -1 && String(v.reason || '').indexOf(String(defaultAskMax)) !== -1,
      'B2e the reason names the member AND the ask count', String(v.reason))
    assert(String(v.lastUnparsed || '').indexOf('"verdict"') !== -1,
      'B2f the record carries the last unparsed raw output', String(v.lastUnparsed))
    const mirror = chatMirrorText(h.WS) || ''
    const mirrorHit = mirror.split('\n').filter((l) => new RegExp('求真表决.*' + B_TARGET).test(l))
    dump('B2 Shared/Chat mirror lines for ' + B_TARGET, mirrorHit)
    assert(mirrorHit.some((l) => l.indexOf(STUCK) !== -1),
      'B2g the group-chat mirror also carries the stuck record naming ' + STUCK, mirrorHit.join('\n'))
    assert(Number(v.bFalse) === 0, 'B2h no ballot was turned into a "false" rejection (bFalse=' + v.bFalse + ')', String(v.bFalse))

    // ---- B3: the other 3 ballots survive verbatim ----
    const votes = v.votes || {}
    const castIds = Object.keys(votes)
    dump('B3 ballots in the closed record', votes)
    for (const id of ['acad', 'r-1', 'r-2']) {
      assert(!!votes[id], 'B3 ' + id + '\'s ballot is present in the closed record', JSON.stringify(castIds))
      if (votes[id]) {
        assert(Number(votes[id].prob) === PLANNED.get(id),
          'B3 ' + id + '\'s ballot value is NOT rewritten (' + votes[id].prob + ' === ' + PLANNED.get(id) + ')', String(votes[id].prob))
        assert(String(votes[id].reason) === REASONS.get(id),
          'B3 ' + id + '\'s ballot reason is NOT rewritten', JSON.stringify(votes[id].reason))
      }
    }
    assert(castIds.length === 3, 'B3 no ballot for the stuck member and none dropped (3 ballots, got ' + castIds.length + ')', JSON.stringify(castIds))
    assert(castIds.indexOf(STUCK) === -1, 'B3b the unreadable member got no fabricated ballot', JSON.stringify(castIds))
    const unparseableLines = (chatMirrorText(h.WS) || '').split('\n').filter((l) => /无法解析/.test(l) && l.indexOf(STUCK) !== -1)
    assert(unparseableLines.length >= 1,
      'B3c each unreadable turn is on the record (' + unparseableLines.length + ' lines naming ' + STUCK + ')', String(unparseableLines.length))
    dump('B3 unparseable lines naming ' + STUCK, unparseableLines)
    const debateRel = join(instRootOf(h.WS), 'Shared', 'Debates', B_TARGET + '.md')
    assert(existsSync(debateRel), 'B3d Shared/Debates/' + B_TARGET + '.md was written', debateRel)
    if (existsSync(debateRel)) {
      const doc = readFileSync(debateRel, 'utf8')
      dump('B3 debate doc', doc)
      for (const id of ['acad', 'r-1', 'r-2']) assert(doc.indexOf(id + '：verdict=') !== -1, 'B3e debate doc lists ' + id + '\'s ballot')
      assert(doc.indexOf('未达门槛') !== -1 || doc.indexOf('未定论') !== -1, 'B3f the debate doc says 未达门槛/未定论', '')
    }
    const verifiedDir = join(instRootOf(h.WS), 'Verified')
    const verifiedFiles = existsSync(verifiedDir)
      ? readdirSync(verifiedDir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? readdirSync(join(verifiedDir, e.name)).map((f) => e.name + '/' + f) : [e.name])
      : []
    dump('B3 Verified/ contents (must NOT contain ' + B_TARGET + ')', verifiedFiles)
    assert(verifiedFiles.every((f) => f.indexOf(B_TARGET) === -1),
      'B3g the undecided target was NOT written to Verified/', JSON.stringify(verifiedFiles))
  }

  // ---- SUPPLEMENT (added at the Lead's request, AFTER the A/B assertions were final):
  // /v5 status must be able to READ BACK the two "how many times may we ask" limits. This is a
  // supplementary check on the API surface, not an A/B acceptance criterion; it is placed here so
  // A1..B4 remain the untouched, byte-identical core of this suite.
  const stP = await h.callTool('vibe_v5_status', {})
  dump('SUPPLEMENT status.params — the two ask limits', {
    verifyAskMaxAttempts: stP.params && stP.params.verifyAskMaxAttempts,
    orphanDispatchMaxAttempts: stP.params && stP.params.orphanDispatchMaxAttempts,
  })
  assert(stP.params !== undefined && Object.prototype.hasOwnProperty.call(stP.params, 'verifyAskMaxAttempts'),
    'SUPP1 status.params exposes verifyAskMaxAttempts', JSON.stringify(Object.keys(stP.params || {}).filter((k) => /Ask/.test(k))))
  assert(stP.params !== undefined && Object.prototype.hasOwnProperty.call(stP.params, 'orphanDispatchMaxAttempts'),
    'SUPP2 status.params exposes orphanDispatchMaxAttempts', JSON.stringify(Object.keys(stP.params || {}).filter((k) => /Ask/.test(k))))
  assert(Number(stP.params && stP.params.verifyAskMaxAttempts) === 3,
    'SUPP3 verifyAskMaxAttempts reads back as the DEFAULT 3 (this run never set it)',
    String(stP.params && stP.params.verifyAskMaxAttempts))
  assert(Number(stP.params && stP.params.orphanDispatchMaxAttempts) === 3,
    'SUPP4 orphanDispatchMaxAttempts reads back as the DEFAULT 3 (this run never set it)',
    String(stP.params && stP.params.orphanDispatchMaxAttempts))
  if (v) {
    assert(Number(stP.params && stP.params.verifyAskMaxAttempts) === Number(v.askAttempts),
      'SUPP5 the read-back limit EQUALS the ask count the stuck voter actually hit ('
      + (stP.params && stP.params.verifyAskMaxAttempts) + ' === ' + v.askAttempts + ')',
      String(v.askAttempts))
  }
}

// ============================================================================
// B4 — the SAME scenario with a LEGAL reply from the 4th member agrees + verifies
// ============================================================================
console.log('\n[B4] same scenario, 4th member replies with legal JSON -> consensus + Verified/\n')
const GOOD_TARGET = 'p-ab-good'
{
  const h = makeHost({ pluginModule })
  await h.callTool('vibe_v5_start', { problem: '证明素数有无穷多个', researcherCount: 3 })
  await h.settleSpawns()
  await h.callTool('vibe_v5_set', { activityTimeoutMs: 150 })
  const voterIds = instOf(h.WS).members.map((m) => m.id)
  assert(voterIds.length === 4, 'B4-0 the scenario has 4 voters again (got ' + voterIds.length + ')', JSON.stringify(voterIds))
  const STUCK = 'r-3'

  await h.callTool('vibe_v5_record_proposition', { id: GOOD_TARGET, statement: '本判据在非齐次理想上不成立', value: 0.5, motive: '独立验收', p: 0.5 }, h.childAgent(h.childOf('r-1')))
  const prop = await proposeVerify(h, GOOD_TARGET, '独立验收 B4：只堵坏路')
  assert(prop && prop.ok !== false, 'B4-0b the verification started', JSON.stringify(prop))

  const run = await driveOnce(h, GOOD_TARGET, STUCK, 'good', BUDGET_MS)
  note('driver iterations = ' + run.iterations + '｜verify wakes answered per member = ' + JSON.stringify([...run.answered]))
  note('bad replies fired = ' + run.badFired.length + ' (must be 0)｜driver timed out = ' + run.timedOut)
  assert(run.badFired.length === 0, 'B4-1 no broken reply was needed in the good run', String(run.badFired.length))
  const verifyAsks = h.asks.filter((a) => a.kind === 'verify')
  note('verify-kind sends observed: ' + verifyAsks.map((a) => a.member).join(', '))

  const v = verdictOf(h.WS, GOOD_TARGET)
  if (!v) assert(false, 'B4-2 no verdict record was written for ' + GOOD_TARGET)
  else {
    dump('B4 verdict record', {
      target: v.target, closed: v.closed, outcome: v.outcome, reason: v.reason,
      bTrue: v.bTrue, bFalse: v.bFalse, abstain: v.abstain, m: v.m, P: v.P, votes: v.votes,
      stuckVoter: v.stuckVoter, askAttempts: v.askAttempts,
    })
    assert(v.closed === true, 'B4-2 the record is CLOSED', String(v.closed))
    assert(v.outcome === 'true', 'B4-3 outcome === "true" (unanimous true) — got ' + JSON.stringify(v.outcome), JSON.stringify(v.outcome))
    assert(!v.stuckVoter, 'B4-4 no stuck voter in the good run', String(v.stuckVoter))
    const castIds = Object.keys(v.votes || {})
    assert(castIds.length === 4 && castIds.indexOf(STUCK) !== -1,
      'B4-5 all 4 ballots are present including the formerly stuck member (got ' + JSON.stringify(castIds) + ')', JSON.stringify(castIds))
    for (const id of ['acad', 'r-1', 'r-2']) {
      assert(Number((v.votes || {})[id] && (v.votes || {})[id].prob) === PLANNED.get(id),
        'B4-6 ' + id + '\'s ballot is still untouched in the good run', JSON.stringify(v.votes && v.votes[id]))
    }
    const card = join(instRootOf(h.WS), 'Verified', '命题', GOOD_TARGET + '.md')
    assert(existsSync(card), 'B4-7 Verified/命题/' + GOOD_TARGET + '.md was written', card)
    if (existsSync(card)) {
      const text = readFileSync(card, 'utf8')
      dump('B4 Verified card', text)
      assert(text.indexOf('结论: 真') !== -1, 'B4-8 the card says 结论: 真', '')
      assert(text.indexOf(GOOD_TARGET) !== -1, 'B4-9 the card names the target', '')
    }
    const st = await h.callTool('vibe_v5_status', {})
    dump('B4 status.verified', st.verified)
    assert(Array.isArray(st.verified) && st.verified.indexOf(GOOD_TARGET) !== -1,
      'B4-10 status.verified lists ' + GOOD_TARGET, JSON.stringify(st.verified))
  }
}

// ============================================================================
// VERDICT
// ============================================================================
console.log('\n================================================================')
console.log('RESULT: ' + passed + ' passed, ' + failed + ' failed')
if (failed) { console.log('FAILED CHECKS:'); for (const f of failures) console.log('  - ' + f) }
console.log('================================================================')
process.exit(failed ? 1 : 0)
