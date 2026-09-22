// ============================================================
// Vibe-Math-V5 PROMPT & INTERACTION INTEGRITY SUITE
//
// Why this suite exists
// ---------------------
// The 2026-09 field test (D:\wd\vibemath测试\项目测试1) exposed a fatal class of bug that
// 123 pre-existing assertions could not see: the framework built every member's brief
// from a mutable "currentMember" global, so each member was told it was SOMEBODY ELSE —
// "[状态] 你是 r-2" appeared inside r-3's induction brief, and the academician's brief
// said "你是 ?（常驻研究员）… 有表决权者 0 人". Nothing asserted the TEXT a member
// actually reads, so the entire class was invisible to the test suite.
//
// This suite therefore treats the PROMPT as the product:
//   · every prompt the framework sends is captured verbatim;
//   · every prompt is checked for IDENTITY coherence (does it name the member that
//     receives it, in its header, its [状态] block and its persona?), ROSTER/quorum
//     coherence, and INTERACTION coherence (do framed messages name the true sender
//     and the true kind?);
//   · the FULL prompt corpus is written to prompt-corpus-v5/ so the real interaction
//     content is preserved for human review, not just reduced to pass/fail.
//
// Each case runs in its OWN session root, so one case can never leave a meeting or a
// verification in flight to pollute the next one.
//
// Run: node prompt-v5-integrity.test.mjs
// Env:  V5_PLUGIN=<abs path>    point the suite at a mutated copy (sensitivity probes)
//       V5_CORPUS_DIR=<dir>     where to write the corpus (default: ./prompt-corpus-v5)
// ============================================================
import { mkdtempSync, existsSync, readdirSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, isAbsolute, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath, not URL.pathname: a Windows path with non-ASCII characters comes back
// percent-encoded from `.pathname`, which would silently write the corpus into a
// directory literally named "%E5%BC%80...".
const HERE = dirname(fileURLToPath(import.meta.url))
const PLUGIN = process.env.V5_PLUGIN
  ? new URL('file:///' + String(process.env.V5_PLUGIN).replace(/\\/g, '/'))
  : new URL('./vibe-math-v5/vibe-math-v5.js', import.meta.url)
const CORPUS_DIR = process.env.V5_CORPUS_DIR ? pathResolve(process.env.V5_CORPUS_DIR) : join(HERE, 'prompt-corpus-v5')
const WS = mkdtempSync(join(tmpdir(), 'vibe-v5-prompt-'))

let passed = 0, failed = 0
const failures = []
const assert = (c, m) => {
  if (c) { passed++; console.log('  ok - ' + m) } else { failed++; failures.push(m); console.error('  FAIL - ' + m) }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const section = (t) => console.log('\n[' + t + ']')

// ---------------------------------------------------------------
// mock host
// ---------------------------------------------------------------
function makeProjectionRegistry() {
  const units = new Map()
  const cells = new Map()
  const cellMap = (sess) => {
    const id = String(sess.id)
    let m = cells.get(id)
    if (!m) { m = new Map(); cells.set(id, m) }
    return m
  }
  return {
    register(def) { units.set(def.key, def); return () => { units.delete(def.key) } },
    stateOf(session, key) {
      const def = units.get(key)
      if (!def) return undefined
      const m = cellMap(session)
      if (!m.has(key)) m.set(key, def.init(session.header, session.inheritedEventCount || 0))
      return m.get(key)
    },
    _drive(session, event) {
      const m = cellMap(session)
      for (const [k, def] of units) {
        const cur = m.has(k) ? m.get(k) : def.init(session.header, session.inheritedEventCount || 0)
        let next
        try { next = def.apply(cur, event) } catch (e) { next = cur }
        m.set(k, next)
      }
    },
  }
}

const projections = makeProjectionRegistry()
const listeners = {}
const toolRegs = []
const liveAgents = new Map()

const spawns = []     // { label, childId, rootId, persona, prompt, toolFilter }
const wakes = []      // queued sends not yet handled
const delivered = []  // sends that drainWakes actually handled
let failNextStarts = 0

function makeMockSession(id, parentSession) {
  const events = []
  const s = {
    id,
    header: { version: 1, id, createdAt: Date.now(), cwd: WS, parentSession, isSeeded: false },
    inheritedEventCount: 0,
    get seq() { return events.length },
    append(type, data) {
      const ev = { type, data, seq: events.length, time: Date.now() }
      events.push(ev)
      projections._drive(s, ev)
      return ev
    },
    deriveMessages() { return [] },
    snapshotEvents(from) { return events.slice(from || 0) },
    ownEvents() { return events.slice() },
    _events: events,
  }
  return s
}

const roots = new Map()
let rootSeq = 0
function makeRoot() {
  const id = 'sess-' + String.fromCharCode(65 + rootSeq++)
  const session = makeMockSession(id, undefined)
  const root = { id, options: { provider: 'mock', model: 'm' }, session, ctx: undefined }
  roots.set(id, root)
  return root
}

const ctx = {
  get(name) {
    if (name === 'sessionProjections') return projections
    if (name === 'sandboxPolicy') return undefined
    if (name === 'compaction') return undefined
    if (name === 'subprocess') {
      return {
        async resolveExecutable(cmd) { return String(cmd) },
        spawn({ argv }) {
          const last = argv[argv.length - 1] || ''
          // directory creation still goes through the same mock (mkdirs uses a shell)
          if (/New-Item/.test(last)) {
            const paths = []
            const re = /'((?:[^']|'')*)'/g
            let m
            while ((m = re.exec(last)) !== null) paths.push(m[1].replace(/''/g, "'"))
            for (const q of paths) if (q && !/^-/.test(q)) mkdirSync(q, { recursive: true })
            return { done: Promise.resolve({ exitCode: 0, signal: null }), collected: {}, terminate() {} }
          }
          // The fake Lean toolchain: GREEN unless the file still uses sorry / carries -- FAIL.
          // Case 12 needs a proof that really passes so the prompt switches to fidelity review.
          const text = existsSync(last) ? readFileSync(last, 'utf8') : ''
          const bad = /sorry|-- FAIL/.test(text)
          const ok = { text: 'ok\n', nextOffset: 3, lossy: false }
          const err = { text: bad ? 'error: declaration uses sorry\n' : '', nextOffset: 0, lossy: false }
          return {
            done: Promise.resolve({ exitCode: bad ? 1 : 0, signal: null }),
            collected: { stdout: { readFrom: () => ok }, stderr: { readFrom: () => err } },
            terminate() {},
          }
        },
      }
    }
    return undefined
  },
  on(e, fn) { (listeners[e] = listeners[e] || []).push(fn) },
  effect(fn) { const d = fn(); return () => { if (typeof d === 'function') d() } },
  logger: { info() {}, warn() {}, error() {} },
  timeout(cb, ms) { const h = setTimeout(cb, ms); return () => clearTimeout(h) },
  tools: { register(spec) { toolRegs.push(spec); return () => {} } },
  commands: { register() { return () => {} } },
  sessions: { async flush() { return true } },
  subagents: {
    list() { return ['spawn'] },
    async startContinuable({ label, request }) {
      if (failNextStarts > 0) { failNextStarts -= 1; throw new Error('mock provisioning failure') }
      const rootId = (request && request.parent && request.parent.id) || 'sess-A'
      const id = 'c' + (spawns.length + 1)
      liveAgents.set(id, { id, session: makeMockSession(id, rootId), options: request && request.agentOptions })
      spawns.push({
        label, childId: id, rootId,
        persona: request && request.persona,
        prompt: request && request.prompt && request.prompt[0] && request.prompt[0].text,
        toolFilter: request && request.toolFilter,
      })
      return { childId: id, messageId: 'm' + spawns.length }
    },
    async sendMessage(parent, childId, blocks) {
      wakes.push({ childId, rootId: (parent && parent.id) || 'sess-A', prompt: (blocks && blocks[0] && blocks[0].text) || '' })
      return 'w' + (delivered.length + wakes.length)
    },
    interrupt() {},
    async drainContinuableChildren(parent, ids) { for (const i of ids) liveAgents.delete(i) },
  },
  agents: {
    roots() { return [...roots.values()] },
    get(id) { return roots.get(id) || liveAgents.get(id) },
    list() { return [...roots.values(), ...liveAgents.values()] },
  },
  fs: {
    async resolve(rel, opts) {
      const b = (opts && opts.cwd) || WS
      const p = (typeof rel === 'string' && isAbsolute(rel)) ? rel.replace(/\//g, '\\') : join(b, ...String(rel).split('/'))
      return { targetKey: p, displayPath: p }
    },
    async stat(t) { return existsSync(t.targetKey) ? { version: 'v1', type: 'file', size: 1 } : undefined },
    async readText(t) { return readFileSync(t.targetKey, 'utf8') },
    async writeText(t, c) { mkdirSync(dirname(t.targetKey), { recursive: true }); writeFileSync(t.targetKey, c, 'utf8') },
    async listDir(t) { if (!existsSync(t.targetKey)) return []; return readdirSync(t.targetKey, { withFileTypes: true }).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })) },
  },
}

const mod = await import(PLUGIN.href + '?t=' + Date.now())
const plugin = mod.default || mod
plugin.apply(ctx)

// ---------------------------------------------------------------
// driving helpers
// ---------------------------------------------------------------
async function callTool(name, args, agent) {
  const spec = toolRegs.find(x => x.name === name)
  if (!spec) throw new Error('no tool ' + name)
  return JSON.parse(await spec.execute(args || {}, { agent }))
}
const childAgent = (childId) => liveAgents.get(childId)
function fireEnd(childId, reply, stopReason) {
  const blocks = reply === undefined ? [] : [{ type: 'text', text: '```json\n' + JSON.stringify(reply) + '\n```' }]
  for (const h of (listeners['subagent/end'] || [])) {
    h({ id: childId, runId: 'r', provider: 'spawn', local: true, stopReason: stopReason || 'completed', lastAssistantMessage: blocks })
  }
}
const settle = async () => { await sleep(30) }
const memberOfChild = (childId) => {
  const s = spawns.find(x => x.childId === childId)
  const m = s ? /vibe5 (\S+) /.exec(s.label) : null
  return m ? m[1] : ''
}
const spawnOf = (root, memberId) => spawns.find(s => s.rootId === root.id && s.label.indexOf('vibe5 ' + memberId + ' ') !== -1)
const childOf = (root, memberId) => { const s = spawnOf(root, memberId); return s ? s.childId : '' }
const spawnsFor = (root) => spawns.filter(s => s.rootId === root.id)

// Pull exactly the VOTING prompts for one root. A plain FIFO drain returns whatever was
// queued first (work rounds, heartbeats), which is how an earlier version of this case ended
// up asserting against the wrong prompt entirely.
async function takeVerifyPrompts(root, n) {
  const got = []
  for (let guard = 0; guard < 400 && got.length < n; guard++) {
    const idx = wakes.findIndex(w => w.rootId === root.id && /【求真表决/.test(w.prompt))
    if (idx === -1) {
      const other = wakes.findIndex(w => w.rootId === root.id)
      if (other !== -1) {
        const w = wakes.splice(other, 1)[0]
        delivered.push({ prompt: w.prompt, owner: memberOfChild(w.childId), rootId: w.rootId })
        fireEnd(w.childId, { progress: '（语料采样时略过非表决轮）', contextPct: 20 })
        await settle()
        continue
      }
      await settle()
      continue
    }
    const w = wakes.splice(idx, 1)[0]
    got.push(w)
    delivered.push({ prompt: w.prompt, owner: memberOfChild(w.childId), rootId: w.rootId })
    fireEnd(w.childId, { verdict: { target: (/"target"\s*:\s*"([^"]+)"/.exec(w.prompt) || [])[1] || '', verdict: 0.5, reason: '语料采样' }, contextPct: 20 })
    await settle()
  }
  return got
}

let votePlan = new Map()   // memberId -> verdict number for the next verify prompts
let replyOverride = new Map()   // memberId -> the exact reply its NEXT wake must produce
// Roots whose MEETING prompts the driver must NOT answer, so the meeting stays in flight
// (case 10b needs a live meeting to test that a verification cannot preempt it).
const hushed = new Set()
// Handle queued sends. `delivered` collects what was actually sent for the case under
// test, because the queue is consumed here and assertions must not read it afterwards.
// Wakes belonging to OTHER roots are skipped over rather than allowed to block: a case
// with a short heartbeat keeps producing its own wakes, and a naive
// "stop at the first foreign wake" loop would starve every later case.
async function drainWakes(budget, root) {
  let n = 0
  while (n < budget) {
    const idx = wakes.findIndex(w => (!root || w.rootId === root.id)
      && !(hushed.has(w.rootId) && /【研究所会议/.test(w.prompt)))
    if (idx === -1) break
    const w = wakes.splice(idx, 1)[0]
    const owner = memberOfChild(w.childId)
    delivered.push({ prompt: w.prompt, owner, childId: w.childId, rootId: w.rootId })
    let reply
    if (replyOverride.has(owner)) { reply = replyOverride.get(owner); replyOverride.delete(owner) } else if (/【求真表决/.test(w.prompt)) {
      const target = (/"target"\s*:\s*"([^"]+)"/.exec(w.prompt) || [])[1] || ''
      const v = votePlan.has(owner) ? votePlan.get(owner) : 0.5
      reply = { verdict: { target, verdict: v, reason: owner + ' 的判断' }, contextPct: 20 }
    } else if (/【研究所会议/.test(w.prompt)) {
      reply = { input: owner + '：我的意见。', solved: false, contextPct: 20 }
    } else {
      reply = { progress: owner + '：继续推进。', solved: false, contextPct: 20 }
    }
    fireEnd(w.childId, reply)
    n++
    await settle()
  }
  return n
}
// A case is over: pause it so it can never generate a wake that would leak into the
// next case, and drop anything it still had queued.
async function endCase(root) {
  await callTool('vibe_v5_pause', {}, root)
  for (let i = wakes.length - 1; i >= 0; i--) if (wakes[i].rootId === root.id) wakes.splice(i, 1)
}
async function settleInstitute(root, rounds = 14) {
  for (let i = 0; i < rounds; i++) {
    await drainWakes(40, root)
    await sleep(20)
    const st = await callTool('vibe_v5_status', {}, root)
    if (!st.members.some(m => m.busy) && !st.meeting && !st.verify && wakes.length === 0) return st
  }
  await drainWakes(40, root)
  return await callTool('vibe_v5_status', {}, root)
}

// ---------------------------------------------------------------
// prompt inspection
// ---------------------------------------------------------------
const KINDS = ['院士', '常驻研究员', '临时工']
const reState = new RegExp('\\[状态\\]\\s*你是\\s+(\\S+?)（(' + KINDS.join('|') + ')）｜轮次\\s*(\\d+)｜法定票数\\s*m=(\\d+)｜有表决权者\\s*(\\d+)\\s*人')
const reRoster = /\[在册\]\s*(.*)/
const reAbsent = /\[未就位\]\s*(.*)/
const reHeader = /^【([^】]*)】/m

function headerMember(prompt) {
  const h = (reHeader.exec(prompt) || [])[1]
  if (!h) return { header: '', id: '', kind: '' }
  for (const k of KINDS) {
    let m = new RegExp('——\\s*' + k + '\\s+(\\S+?)\\s*】?$').exec(h)
    if (m) return { header: h, id: m[1], kind: k }
    m = new RegExp('——\\s*' + k + '\\s+(\\S+?)\\s+就对象').exec(h)
    if (m) return { header: h, id: m[1], kind: k }
  }
  return { header: h, id: '', kind: '' }
}
function parseState(prompt) {
  const s = reState.exec(prompt)
  if (!s) return null
  return { id: s[1], kind: s[2], round: Number(s[3]), m: Number(s[4]), voters: Number(s[5]) }
}
const rosterOf = (prompt) => {
  const r = reRoster.exec(prompt)
  return r ? r[1].split(/[、,]/).map(s => s.trim()).filter(s => s && s !== '（无）') : null
}
const absentOf = (prompt) => {
  const r = reAbsent.exec(prompt)
  return r ? r[1].split(/[、,]/).map(s => s.trim()).filter(Boolean) : null
}
const stateBlockCount = (prompt) => (prompt.match(/\[状态\]/g) || []).length
const GARBAGE = [/\bundefined\b/, /\bNaN\b/, /\[object Object\]/, /你是\s*\?/]
const isVoter = (id) => id === 'acad' || /^r-/.test(id)

// Applied to EVERY captured prompt.
function checkPromptSweep(prompt, owner, where) {
  const problems = []
  if (!prompt) return ['prompt is empty']
  for (const g of GARBAGE) if (g.test(prompt)) problems.push('contains ' + g)
  if (stateBlockCount(prompt) !== 1) problems.push('expected exactly one [状态] block, found ' + stateBlockCount(prompt))
  const st = parseState(prompt)
  if (!st) { problems.push('no parseable [状态] line'); return problems }
  if (st.id !== owner) problems.push('[状态] names ' + st.id + ' but was sent to ' + owner)
  const hd = headerMember(prompt)
  if (hd.id && hd.id !== owner) problems.push('header names ' + hd.id + ' but was sent to ' + owner)
  if (hd.kind && st.kind && hd.kind !== st.kind) problems.push('header kind ' + hd.kind + ' ≠ [状态] kind ' + st.kind)
  const roster = rosterOf(prompt)
  if (!roster) problems.push('[在册] line missing')
  else {
    if (roster.indexOf(owner) === -1) problems.push('the roster omits the reader ' + owner + ' ([' + roster.join('、') + '])')
    if (new Set(roster).size !== roster.length) problems.push('duplicate ids in [在册]')
    for (const a of (absentOf(prompt) || [])) {
      const id = String(a).replace(/（.*$/, '')
      if (roster.indexOf(id) !== -1) problems.push(id + ' is on the roster AND listed as 未就位')
    }
    if (st.voters !== roster.filter(isVoter).length) {
      problems.push('有表决权者 ' + st.voters + ' ≠ voters in [在册] ' + roster.filter(isVoter).length)
    }
    if (st.m !== Math.min(3, st.voters)) problems.push('m=' + st.m + ' ≠ min(quorumCap 3, voters ' + st.voters + ')')
  }
  for (const other of KINDS) {
    const hits = prompt.match(new RegExp('你是\\s+\\S+?（' + other + '）', 'g')) || []
    if (hits.length > 1) problems.push('more than one identity claim: ' + hits.join(' / '))
  }
  if (problems.length) console.error('    !! ' + where + ' → ' + problems.join('; '))
  return problems
}

// ---------------------------------------------------------------
// corpus recorder
// ---------------------------------------------------------------
const corpus = []
const scrub = (s) => String(s == null ? '' : s).split(WS).join('<WS>')
function record(kind, owner, prompt, persona, extra) {
  corpus.push({
    kind, owner,
    sentToLabel: (extra && extra.label) || '',
    persona: persona === undefined ? null : scrub(persona),
    prompt: scrub(prompt),
    toolFilter: (extra && extra.toolFilter) || null,
  })
}
function recordAndCheck(kind, owner, prompt, opts) {
  record(kind, owner, prompt, opts && opts.persona, opts)
  const problems = checkPromptSweep(prompt, owner, kind + ' prompt for ' + owner)
  assert(problems.length === 0, kind + ' prompt for ' + owner + ' is identity/roster coherent')
  return problems
}
function checkPersona(kind, owner, persona, checks) {
  for (const [re, label] of checks) assert(re.test(persona), kind + ': ' + owner + "'s charter " + label)
}

// ===============================================================
console.log('-- V5 prompt & interaction integrity --')

// =============== CASE 1: founding briefs =========================================
section('1 founding — every induction brief describes the member that receives it')
const RA = makeRoot()
const started = await callTool('vibe_v5_start', { problem: '求 3N^2-2=b^2 与 3N^2+2=5a^2 的全部整数解', researcherCount: 3 }, RA)
assert(started.ok === true, 'institute founded')
const FOUND_ORDER = ['acad', 'r-1', 'r-2', 'r-3']
const founding = spawnsFor(RA)
assert(founding.length === 4, 'four founding members were started (got ' + founding.length + ')')
for (let i = 0; i < founding.length; i++) {
  const sp = founding[i]
  const owner = memberOfChild(sp.childId)
  assert(owner === FOUND_ORDER[i], 'founding #' + i + ' started ' + owner + ' (expected ' + FOUND_ORDER[i] + ')')
  recordAndCheck('founding', owner, sp.prompt, sp)
  const st = parseState(sp.prompt) || {}
  const roster = rosterOf(sp.prompt) || []
  assert(JSON.stringify(roster) === JSON.stringify(FOUND_ORDER.slice(0, i + 1)),
    'the founding brief of ' + owner + ' shows the roster INCLUDING itself: ' + JSON.stringify(roster))
  assert(st.round === 1, owner + "'s founding brief is round 1 (got " + st.round + ')')
  assert(st.voters === i + 1, owner + ' sees ' + (i + 1) + ' voter(s) (got ' + st.voters + ')')
  assert(st.m === Math.min(3, i + 1), owner + ' sees m=min(3,' + (i + 1) + ')=' + Math.min(3, i + 1) + ' (got ' + st.m + ')')
  assert(sp.prompt.indexOf('【入职首轮') === 0, owner + "'s first prompt is framed as an induction")
  assert(sp.prompt.indexOf('你刚刚加入本所') !== -1, owner + "'s induction asks for its own first view")
}
assert(founding[0].prompt.indexOf('[状态] 你是 acad（院士）') !== -1, 'the academician brief says 你是 acad（院士） — never "?"')
assert(!/你是 \?/.test(founding[0].prompt), 'no "你是 ?" placeholder')
checkPersona('founding', 'acad', founding[0].persona, [
  [/在册院士：acad/, 'lists itself as the sitting academician'],
  [/在册常驻研究员：（无）/, 'shows no researchers at that instant'],
  [/你是「institute」的\*\*院士\*\*/, 'opens by naming its office'],
  [/Members\/acad\//, 'points at its own library'],
])
checkPersona('founding', 'r-3', founding[3].persona, [
  [/在册院士：acad/, 'names the sitting academician'],
  [/在册常驻研究员：r-1、r-2、r-3/, 'lists r-1、r-2、r-3 as the sitting researchers'],
  [/在册临时工：（无）/, 'shows no temps'],
  [/代号 r-3。/, 'states its own 代号'],
  [/Members\/r-3\//, 'points at its own library'],
  [/progress.md/, 'documents Progress/progress.md'],
])
checkPersona('founding', 'r-1', founding[1].persona, [[/一名常驻研究员/, 'opens as 常驻研究员']])
for (const sp of founding) {
  const owner = memberOfChild(sp.childId)
  assert(sp.persona.indexOf('Members/' + owner + '/') !== -1, owner + "'s charter points at Members/" + owner + '/')
}
for (const sp of founding) { sp._ended = true; fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RA)
await endCase(RA)

// =============== CASE 2: round prompts (normal + checkpoint) =====================
section('2 rounds — normal and checkpoint prompts keep the identity straight')
const RB = makeRoot()
await callTool('vibe_v5_start', { problem: '无领头人情形下的组织', researcherCount: 2 }, RB)
for (const sp of spawnsFor(RB)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RB)
// A short idle window makes the heartbeat prompt reachable inside a test run.
await callTool('vibe_v5_set', { activityTimeoutMs: 80, maxParallel: 6, chatDigestMax: 1 }, RB)
// (a) an addressed message must produce a NORMAL round prompt carrying the framed inbox
delivered.length = 0
await callTool('vibe_v5_say', { to: 'r-2', text: '请把你手上的结论同步给我。' }, childAgent(childOf(RB, 'r-1')))
await settle(); await drainWakes(10, RB)
const normalWakes = delivered.slice()
assert(normalWakes.length > 0, 'the addressed message produced a wake (' + normalWakes.length + ')')
for (const w of normalWakes) recordAndCheck('normal', w.owner, w.prompt)
assert(normalWakes.some(w => w.owner === 'r-2' && w.prompt.indexOf('【研究所·私信 from r-1】') !== -1),
  'r-2 is woken with its inbox containing the DM framed from r-1')
assert(normalWakes.filter(w => w.owner === 'r-2').every(w => w.prompt.indexOf('【研究所·私信 from r-2】') === -1),
  'r-2 never receives the DM framed as coming from itself')
// (b) the heartbeat must produce a CHECKPOINT prompt
delivered.length = 0
await sleep(260); await settle(); await drainWakes(10, RB)
let checkpointWakes = delivered.filter(w => /【心跳检查/.test(w.prompt))
if (!checkpointWakes.length) { await sleep(260); await settle(); await drainWakes(10, RB); checkpointWakes = delivered.filter(w => /【心跳检查/.test(w.prompt)) }
assert(checkpointWakes.length > 0, 'the heartbeat produced a checkpoint prompt (' + checkpointWakes.length + ')')
for (const w of checkpointWakes) {
  recordAndCheck('checkpoint', w.owner, w.prompt)
  // The heartbeat body may be preceded by a delivered inbox or the core-rules recap
  // after a real compaction, so match anywhere rather than at offset 0.
  assert(w.prompt.indexOf('【心跳检查 —— ') !== -1, w.owner + "'s heartbeat prompt names its own office and id")
  assert(new RegExp('【心跳检查 —— (院士|常驻研究员|临时工) ' + w.owner + '】').test(w.prompt),
    w.owner + "'s heartbeat header carries its own kind and id")
}
await endCase(RB)

// =============== CASE 3: interaction framing ====================================
section('3 interaction framing — every message names its true sender and kind')
const RC = makeRoot()
await callTool('vibe_v5_start', { problem: '交互框架测试', researcherCount: 2 }, RC)
for (const sp of spawnsFor(RC)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RC)
await callTool('vibe_v5_set', { maxParallel: 8, chatDigestMax: 1 }, RC)
const r1 = childOf(RC, 'r-1'), acad = childOf(RC, 'acad')
const send = async (kind, fn) => {
  delivered.length = 0
  const r = await fn()
  await settle(); await drainWakes(20, RC)
  const handled = delivered.slice()
  for (const w of handled) recordAndCheck(kind, w.owner, w.prompt).length
  return { r, prompts: handled.map(w => w.prompt).join('\n'), owners: handled.map(w => w.owner), count: handled.length }
}
const dm = await send('inbox-dm', () => callTool('vibe_v5_say', { to: 'r-2', text: '私下问你一下。' }, childAgent(r1)))
const voters = await send('inbox-voters', () => callTool('vibe_v5_say', { to: 'voters', text: '请全体表决者注意。' }, childAgent(r1)))
const chat = await send('inbox-chat', () => callTool('vibe_v5_say', { text: '各位，我建议先做最小反例归约。' }, childAgent(r1)))
const office = await send('inbox-office', () => callTool('vibe_v5_message', { to: 'all', content: '所办通知：请按计划推进。' }, RC))
const assign = await send('inbox-assign', () => callTool('vibe_v5_assign', { subject: '核验模 9 情形', to: 'r-2', why: '你最熟同余', acceptance: '给出模 9 全表' }, childAgent(acad)))
const nudge = await send('inbox-nudge', () => callTool('vibe_v5_nudge', { to: 'r-2', why: '进度偏慢', next_step: '先交一份模 9 表' }, childAgent(acad)))
assert(dm.r.ok === true && dm.r.delivered === 1, 'a DM reaches exactly its addressee')
assert(voters.r.ok === true && voters.r.delivered === 2, 'a voters-only broadcast reaches every voter but the sender')
assert(chat.r.ok === true && chat.r.delivered === 2, 'group chat fans out to every other member')
assert(assign.r.ok === true, "the ACADEMICIAN's assignment succeeded (" + JSON.stringify(assign.r).slice(0, 90) + ')')
assert(/【研究所·私信 from r-1】/.test(dm.prompts), 'a DM is framed by its true sender (【研究所·私信 from r-1】)')
assert(/【研究所·致全体表决者 from r-1】/.test(voters.prompts), 'a voters-only broadcast is framed as such, not as a DM')
assert(/【研究所·群聊】r-1：/.test(chat.prompts), 'group chat is framed with the true speaker')
assert(/【所办通知】/.test(office.prompts), 'an office notice is framed 所办通知')
assert(/【院士分派】/.test(assign.prompts), "the academician's assignment is framed 院士分派")
assert(/【督办 from acad】/.test(nudge.prompts), 'a nudge is framed 督办 by its true author')
assert(!/【院士分派】[^\n]*督办/.test(nudge.prompts), 'a nudge is NOT mislabelled as an assignment')
// THE OFFICE ITSELF must be able to assign, and must not impersonate the academician.
const officeAssign = await send('inbox-office-assign', () => callTool('vibe_v5_assign', { subject: '所办指派', to: 'r-2', why: '所办决定', acceptance: '给出结论' }, RC))
assert(officeAssign.r.ok === true, 'the OFFICE (session root) can assign — it is resolved as the office, not as a random member (' + JSON.stringify(officeAssign.r).slice(0, 90) + ')')
assert(/【所办分派】/.test(officeAssign.prompts), 'an OFFICE assignment is framed 所办分派, not 院士分派')
assert(!/【院士分派】/.test(officeAssign.prompts), 'an office assignment does not impersonate the academician')
const officeNudge = await send('inbox-office-nudge', () => callTool('vibe_v5_nudge', { to: 'r-2', why: '所办督办一下' }, RC))
assert(officeNudge.r.ok === true, 'the OFFICE can nudge')
assert(/【督办 from office】/.test(officeNudge.prompts) && /所办督办/.test(officeNudge.prompts),
  'an office nudge is labelled 所办督办 by the office, not 院士督办')
assert(await callTool('vibe_v5_prioritize', { order: [], why: 'x' }, RC).then(r => r.ok === false), 'the office still hits argument validation (resolved AS the office)')
await endCase(RC)

// =============== CASE 4: framework feedback delivery ============================
section('4 framework feedback reaches the member (never dropped as a self-message)')
const RD = makeRoot()
await callTool('vibe_v5_start', { problem: '框架反馈投递测试', researcherCount: 2 }, RD)
for (const sp of spawnsFor(RD)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RD)
await callTool('vibe_v5_set', { maxParallel: 8 }, RD)
const rd1 = childOf(RD, 'r-1'), rd2 = childOf(RD, 'r-2')
// A member can only be answered while a turn of its own is in flight, so each case
// below first WAKES r-1 and then lets its reply be the malformed one.
const wakeR1With = async (kind, reply) => {
  delivered.length = 0
  replyOverride.set('r-1', reply)
  await callTool('vibe_v5_say', { to: 'r-1', text: '请就当前状态给个结论。' }, childAgent(rd2))
  await settle(); await drainWakes(20, RD)
  const handled = delivered.slice()
  for (const w of handled) if (/【框架提示】/.test(w.prompt)) recordAndCheck(kind, w.owner, w.prompt).length
  return handled.map(w => w.prompt).join('\n')
}
const badVerdictText = await wakeR1With('notice', { verdict: { target: 'p-ghost', verdict: 'not-a-number', reason: 'x' }, contextPct: 20 })
assert(/【框架提示】/.test(badVerdictText), 'a malformed verdict produces a real 【框架提示】 delivery')
assert(/verdict 必须是 0-1 的数值/.test(badVerdictText), 'the notice says what was wrong')
assert(/【框架提示】[^\n]*verdict/.test(badVerdictText), 'the notice is framed by the framework, not by the member itself')
const badClaimText = await wakeR1With('notice-claim', { task_claim: 't-999', contextPct: 20 })
assert(/【框架提示】/.test(badClaimText) && /没有任务 t-999/.test(badClaimText), 'a refused claim is reported back to the claimer')
// A CAS refusal reported through the JSON reply must also come back.
const t = await callTool('vibe_v5_task_create', { subject: '一个没人认领的任务' }, childAgent(rd1))
const staleText = await wakeR1With('notice-task', { task_update: { task_id: t.task.id, expected_revision: 99, action: 'claim' }, contextPct: 20 })
assert(/【框架提示】/.test(staleText) && /V5_TASK_STALE_REVISION/.test(staleText), 'a stale CAS reported through the reply channel is echoed back')
const selfFramed = corpus.filter(c => new RegExp('【研究所·私信 from ' + c.owner + '】').test(c.prompt))
assert(selfFramed.length === 0, 'no member ever receives a message framed as coming from itself')
await endCase(RD)

// =============== CASE 5: temp workers ===========================================
section('5 a hired temp worker is told its own name, employer and purpose')
const RE = makeRoot()
await callTool('vibe_v5_start', { problem: '临时工入职测试', researcherCount: 2 }, RE)
for (const sp of spawnsFor(RE)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RE)
const hired = await callTool('vibe_v5_hire', { purpose: '核对文献引理', initial_task: '核对第 3 节引理' }, childAgent(childOf(RE, 'r-1')))
assert(hired.ok === true, 'r-1 hired a temp worker (' + JSON.stringify(hired).slice(0, 80) + ')')
const tempSpawn = spawnOf(RE, hired.id)
recordAndCheck('founding-temp', hired.id, tempSpawn.prompt, tempSpawn)
{
  const st = parseState(tempSpawn.prompt) || {}
  assert(st.kind === '临时工', 'the temp brief calls it 临时工 (got ' + st.kind + ')')
  assert((rosterOf(tempSpawn.prompt) || []).indexOf(hired.id) !== -1, 'the temp brief lists the temp itself on the roster')
  checkPersona('founding-temp', hired.id, tempSpawn.persona, [
    [new RegExp('代号 ' + hired.id + '，由 r-1 雇入'), 'names itself and its true employer'],
    [/用途：核对文献引理/, 'states its purpose'],
    [new RegExp('Members/' + hired.id + '/'), 'points at its own library'],
    [/你的雇主：r-1/, 'names its employer'],
  ])
  assert(/【入职首轮 —— 临时工 t-\d+】/.test(tempSpawn.prompt), 'the temp brief is framed as its induction')
  assert(/你的初始任务\/用途：/.test(tempSpawn.prompt) && /核对第 3 节引理/.test(tempSpawn.prompt), 'the temp brief carries its initial task')
  assert(!/"verdict":/.test(tempSpawn.prompt) || /"verdict" 字段对你不适用/.test(tempSpawn.prompt), 'the temp brief states it has no vote')
  assert(!/"hire":/.test(tempSpawn.prompt), 'the temp brief does not offer hire')
}
for (const sp of spawnsFor(RE)) { if (!sp._ended) { sp._ended = true; fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：收到。', solved: false, contextPct: 10 }); await settle() } }
await settleInstitute(RE)

// =============== CASE 6: failed provisioning is visible =========================
section('6 a member that failed to provision is visible, not a phantom')
failNextStarts = 1
const failedHire = await callTool('vibe_v5_hire', { purpose: '注定失败', initial_task: 'x' }, childAgent(childOf(RE, 'r-1')))
assert(failedHire.ok === false, 'a provisioning failure is reported to the hirer (' + JSON.stringify(failedHire).slice(0, 100) + ')')
const stFail = await callTool('vibe_v5_status', {}, RE)
const failedMember = stFail.members.find(m => m.phase === 'failed')
assert(!!failedMember, 'the member is recorded as failed rather than left active')
assert(!failedMember || failedMember.busy !== true, 'a failed member is not left marked busy')
delivered.length = 0
await callTool('vibe_v5_say', { to: 'r-2', text: '看下编制。' }, childAgent(childOf(RE, 'r-1')))
await settle(); await drainWakes(20, RE)
const failPrompts = delivered.slice()
for (const w of failPrompts) recordAndCheck('after-failure', w.owner, w.prompt).length
const failText = failPrompts.map(w => w.prompt).join('\n')
assert(failPrompts.length > 0, 'a member was woken after the failure (' + failPrompts.length + ')')
assert(new RegExp('\\[未就位\\][^\\n]*' + failedMember.id).test(failText), 'the failed member appears in [未就位] with its id')
assert(!new RegExp('\\[在册\\][^\\n]*' + failedMember.id).test(failText), 'the failed member is NOT listed as if it were on the roster')
await endCase(RE)

// =============== CASE 7: session rebuild ========================================
section('7 a rebuilt session is told it was rebuilt, not that it just joined')
const RF = makeRoot()
await callTool('vibe_v5_start', { problem: '会话重建测试', researcherCount: 2 }, RF)
for (const sp of spawnsFor(RF)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RF)
const personasBefore = {}
for (const sp of spawnsFor(RF)) personasBefore[memberOfChild(sp.childId)] = sp.persona
await callTool('vibe_v5_stop', {}, RF)
await settle()
const spawnCountBefore = spawns.length
const resumed = await callTool('vibe_v5_resume', {}, RF)
assert(resumed.ok === true, 'the institute resumed (' + JSON.stringify(resumed).slice(0, 120) + ')')
const resumeSpawns = spawns.slice(spawnCountBefore).filter(s => s.rootId === RF.id)
assert(resumeSpawns.length > 0, 'resume rebuilt at least one member session (' + resumeSpawns.length + ')')
for (const sp of resumeSpawns) {
  const owner = memberOfChild(sp.childId)
  recordAndCheck('resume', owner, sp.prompt, sp)
  assert(sp.prompt.indexOf('【会话重建 —— ') === 0, owner + "'s rebuilt session is framed 会话重建, not 入职首轮")
  assert(sp.prompt.indexOf('你刚刚加入本所') === -1, owner + ' is NOT told "你刚刚加入本所" on resume')
  assert(sp.prompt.indexOf('不要从头再来') !== -1, owner + ' is told to read back its progress instead of restarting')
  assert(sp.persona === personasBefore[owner], owner + "'s charter is the FROZEN hire-time one, not a resumed-time rewrite")
}
await endCase(RF)

// =============== CASE 8: leaderless institute ===================================
section('8 with academician:false no charter invents a leader')
const RG = makeRoot()
const l2 = await callTool('vibe_v5_start', { problem: '无院士建所', researcherCount: 2, academician: false }, RG)
assert(l2.ok === true, 'a leaderless institute can be founded (' + JSON.stringify(l2).slice(0, 100) + ')')
const l2spawns = spawnsFor(RG)
assert(l2spawns.length === 2, 'two researchers were founded and no academician (got ' + l2spawns.length + ')')
for (let i = 0; i < l2spawns.length; i++) {
  const sp = l2spawns[i]
  const owner = memberOfChild(sp.childId)
  recordAndCheck('founding-leaderless', owner, sp.prompt, sp)
  const st = parseState(sp.prompt) || {}
  assert(st.m === Math.min(3, i + 1), owner + ': m is computed over the leaderless roster INCLUDING itself (m=' + st.m + ')')
  assert(st.kind === '常驻研究员', owner + ' is a 常驻研究员 (got ' + st.kind + ')')
  assert(/在册院士：（无）/.test(sp.persona), owner + "'s charter records that there is no academician")
  assert(/本所当前\*\*没有在册院士\*\*/.test(sp.persona), owner + "'s charter says so in the organization section")
  assert(!/本所的领头人是\*\*院士/.test(sp.persona), owner + "'s charter does NOT claim a leader exists")
  assert(!/院士 acad/.test(sp.persona), owner + "'s charter never names a non-existent 院士 acad")
  assert(!/主动向院士汇报/.test(sp.persona), owner + "'s charter does not tell it to report to a non-existent academician")
  assert(!/院士也可以给你派活/.test(sp.persona), owner + "'s charter does not promise assignments from a non-existent academician")
  assert(!/院士可以直接分派任务/.test(sp.persona), owner + "'s charter does not promise academician assignment powers")
}
const l2status = await callTool('vibe_v5_status', {}, RG)
assert(l2status.quorum.voters.indexOf('acad') === -1, 'the leaderless institute has no academician among its voters')
await endCase(RG)

// =============== CASE 8b: the JSON contract offered matches what is honoured =====
section('8b the reply spec documents exactly the fields the framework honours')
{
  const specKinds = corpus.filter(c => ['founding', 'founding-temp', 'founding-leaderless', 'normal', 'checkpoint'].indexOf(c.kind) !== -1)
  assert(specKinds.length >= 6, 'the corpus has round prompts to check the reply spec on (' + specKinds.length + ')')
  for (const c of specKinds) {
    const isTemp = /^t-/.test(c.owner)
    const isAcad = c.owner === 'acad'
    if (isTemp) {
      assert(c.prompt.indexOf('"verdict" 字段对你不适用') !== -1, c.owner + ' (temp) is told it has no vote')
      assert(!/"hire":/.test(c.prompt) && !/"fire":/.test(c.prompt), c.owner + ' (temp) is not offered hire/fire')
    } else {
      assert(/"verdict":/.test(c.prompt), c.owner + ' is offered the verdict field')
      assert(/"hire":/.test(c.prompt) && /"fire":/.test(c.prompt), c.owner + ' is offered hire/fire')
    }
    if (isAcad) {
      assert(/"assign":/.test(c.prompt) && /"prioritize":/.test(c.prompt) && /"nudge":/.test(c.prompt) && /"convene_meeting":/.test(c.prompt),
        c.owner + ' (academician) is offered its organizational fields')
    } else {
      assert(!/"assign":/.test(c.prompt) && !/"prioritize":/.test(c.prompt), c.owner + ' is not offered academician-only fields')
    }
    // A field the framework HONOURS but never documents is an unreachable channel: the
    // member cannot object to an assignment, close a task, or fill a meeting input.
    assert(/"reject_assign":/.test(c.prompt), c.owner + ' is told about reject_assign (the objection channel is reachable)')
    assert(/"task_done":/.test(c.prompt), c.owner + ' is told about task_done')
    assert(/"input":/.test(c.prompt), c.owner + ' is told about the meeting "input" field')
  }
}

// =============== CASE 9: verification prompts ===================================
section('9 verification — voters are asked by name about the right object')
const RH = makeRoot()
await callTool('vibe_v5_start', { problem: '表决提示词测试', researcherCount: 2 }, RH)
for (const sp of spawnsFor(RH)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RH)
await callTool('vibe_v5_set', { maxParallel: 8 }, RH)
await callTool('vibe_v5_record_proposition', { id: 'p-lemma-a', title: '引理甲', statement: '若 n>2 则不存在整数解。', value: 0.6, motive: '用于归约', p: 0.8 }, childAgent(childOf(RH, 'r-1')))
delivered.length = 0
const proposed = await callTool('vibe_v5_propose_verify', { target: 'p-lemma-a', kind: 'proposition', reason: '已有证明' }, childAgent(childOf(RH, 'r-1')))
assert(proposed.ok === true, 'the object was proposed for verification')
await settle(); await drainWakes(3, RH)
const verifyPrompts = delivered.filter(w => /【求真表决/.test(w.prompt))
assert(verifyPrompts.length === 3, 'exactly the three voters were asked, and no temp/non-voter (' + verifyPrompts.length + ')')
for (const w of verifyPrompts) {
  recordAndCheck('verify', w.owner, w.prompt)
  assert(w.prompt.indexOf('【求真表决 —— ') === 0, w.owner + "'s voting prompt is framed as a vote")
  assert(w.prompt.indexOf(' ' + w.owner + ' 就对象 p-lemma-a 投票】') !== -1, w.owner + "'s voting prompt names itself and the object")
  assert(w.prompt.indexOf('引理甲') !== -1 || w.prompt.indexOf('若 n>2 则不存在整数解') !== -1, w.owner + "'s voting prompt shows the object statement")
  assert(/"target"\s*:\s*"p-lemma-a"/.test(w.prompt), w.owner + "'s voting prompt ends with the exact JSON the plugin parses")
  assert(w.prompt.indexOf('verdict = 1') !== -1 && w.prompt.indexOf('verdict = 0') !== -1, w.owner + ' is told the boolean rule')
}
// Now actually reach a debate round, to exercise the DEBATE-stage prompt.
await callTool('vibe_v5_set', { verdictMaxRounds: 3 }, RH)
votePlan = new Map([['acad', 0.5], ['r-1', 1], ['r-2', 0.5]])
delivered.length = 0
await drainWakes(3, RH)      // round 1: not enough boolean votes -> debate
const stillOpen = await callTool('vibe_v5_status', {}, RH)
assert(!!stillOpen.verify, 'the verification is still open after abstentions')
delivered.length = 0
await drainWakes(3, RH)      // round 2 (debate) is asked
const debatePrompts = delivered.filter(w => /【求真表决/.test(w.prompt))
assert(debatePrompts.length === 3, 'the debate round re-asks every voter (' + debatePrompts.length + ')')
for (const w of debatePrompts) {
  recordAndCheck('verify-debate', w.owner, w.prompt)
  assert(/### 上一轮各成员的意见/.test(w.prompt), w.owner + "'s debate prompt publishes the previous round's opinions")
  assert(/verdict=1/.test(w.prompt) && /verdict=0\.5/.test(w.prompt), w.owner + "'s debate prompt shows the real per-member verdicts")
  assert(w.prompt.indexOf('- ' + w.owner + '：') !== -1, w.owner + "'s debate prompt shows its OWN previous vote so it can revise it")
  const hist = /### 上一轮各成员的意见[\s\S]*?(?:\n\n|$)/.exec(w.prompt)
  const histIds = hist ? (hist[0].match(/^- (\S+?)：/gm) || []).map(s => s.slice(2, -1)) : []
  assert(histIds.slice().sort().join(',') === 'acad,r-1,r-2', w.owner + "'s debate prompt publishes exactly the voters' opinions (got " + histIds.join('、') + ')')
}
await endCase(RH)

// =============== CASE 9b: only ONE verification at a time =========================
section('9b a second proposal QUEUES; it never starts a concurrent verification')
const RL = makeRoot()
await callTool('vibe_v5_start', { problem: '并发表决测试', researcherCount: 1 }, RL)
for (const sp of spawnsFor(RL)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RL)
await callTool('vibe_v5_set', { maxParallel: 8 }, RL)
const rl1 = childOf(RL, 'r-1')
await callTool('vibe_v5_record_proposition', { id: 'p-first', statement: '第一个对象', value: 0.6, motive: 'm', p: 0.7 }, childAgent(rl1))
await callTool('vibe_v5_record_proposition', { id: 'p-second', statement: '第二个对象', value: 0.6, motive: 'm', p: 0.7 }, childAgent(rl1))
await callTool('vibe_v5_propose_verify', { target: 'p-first', kind: 'proposition', reason: '先做这个' }, childAgent(rl1))
await settle()
const stq0 = await callTool('vibe_v5_status', {}, RL)
assert(!!stq0.verify && stq0.verify.target === 'p-first', 'the first object is under verification')
// Proposing a second object while one is in flight must QUEUE it. The whole point of the
// one-at-a-time rule is that consensus is never split across two live ballots; a
// regression here would silently start a second ballot and drop the object from the queue.
await callTool('vibe_v5_propose_verify', { target: 'p-second', kind: 'proposition', reason: '排后面' }, childAgent(rl1))
await settle()
const stq1 = await callTool('vibe_v5_status', {}, RL)
assert(!!stq1.verify && stq1.verify.target === 'p-first', 'the in-flight ballot is still the first object')
assert((stq1.verifyQueue || []).indexOf('p-second') !== -1,
  'the second proposal is still QUEUED, not begun concurrently (queue=' + JSON.stringify(stq1.verifyQueue) + ')')
assert(stq1.undecided.length === 0 && stq1.verified.length === 0, 'nothing was settled by merely proposing')
// Once the first ballot settles, the queued one starts on its own.
await callTool('vibe_v5_set', { verdictMaxRounds: 1 }, RL)
delivered.length = 0
await drainWakes(20, RL)
const stq2 = await callTool('vibe_v5_status', {}, RL)
assert(stq2.verify === null || stq2.verify.target === 'p-second',
  'the queued object took over after the first ballot closed (now: ' + JSON.stringify(stq2.verify && stq2.verify.target) + ')')
await endCase(RL)

// =============== CASE 9c: a solve vote OUTSIDE a meeting ==========================
section('9c a unanimous solve vote landing outside a meeting still stops the institute')
const RM = makeRoot()
await callTool('vibe_v5_start', { problem: '会外表决停工测试', researcherCount: 1 }, RM)
for (const sp of spawnsFor(RM)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RM)
await callTool('vibe_v5_set', { maxParallel: 8 }, RM)
const solvedReply = { vote_solved: true, solved: true, progress: '我认为原问题已解决。', contextPct: 20 }
replyOverride.set('acad', solvedReply)
replyOverride.set('r-1', solvedReply)
await callTool('vibe_v5_say', { to: 'acad', text: '请你就"是否已解决"表态。' }, childAgent(childOf(RM, 'r-1')))
await settle(); await drainWakes(4, RM)
await callTool('vibe_v5_say', { to: 'r-1', text: '请你就"是否已解决"表态。' }, childAgent(childOf(RM, 'acad')))
await settle(); await drainWakes(4, RM)
const stSolved = await callTool('vibe_v5_status', {}, RM)
assert(stSolved.solveVotes.length >= 2, 'both voters recorded a solve vote outside any meeting (' + JSON.stringify(stSolved.solveVotes) + ')')
assert(stSolved.autoDone === true,
  'the institute STOPPED on a unanimous solve vote that arrived outside a meeting ' + JSON.stringify({ autoDone: stSolved.autoDone, solveVotes: stSolved.solveVotes }))
await endCase(RM)

// =============== CASE 10: meeting prompts =======================================
section('10 meeting — real speakers, real transcript keys')
const RI = makeRoot()
await callTool('vibe_v5_start', { problem: '会议提示词测试', researcherCount: 1 }, RI)
for (const sp of spawnsFor(RI)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RI)
await callTool('vibe_v5_set', { maxParallel: 8 }, RI)
delivered.length = 0
const mtg = await callTool('vibe_v5_meeting', { agenda: '分工与下一步', kind: 'sync' }, childAgent(childOf(RI, 'acad')))
assert(mtg.ok === true, 'the academician convened a meeting (' + JSON.stringify(mtg).slice(0, 90) + ')')
await settle(); await drainWakes(20, RI)
const meetingOne = delivered.filter(w => /【研究所会议/.test(w.prompt))
assert(meetingOne.length >= 2, 'both members were asked to speak (' + meetingOne.length + ')')
for (const w of meetingOne) {
  recordAndCheck('meeting', w.owner, w.prompt)
  assert(w.prompt.indexOf('【研究所会议 mt-1 进行中 —— ') === 0, w.owner + "'s meeting prompt is framed with the meeting id")
  assert(w.prompt.indexOf('分工与下一步') !== -1, w.owner + "'s meeting prompt carries the agenda")
  assert(w.prompt.indexOf('"input"') !== -1, w.owner + "'s meeting prompt documents the input field it must fill")
}
await settleInstitute(RI)
const stMtg = await callTool('vibe_v5_status', {}, RI)
assert(stMtg.meeting === null, 'the meeting finished instead of deadlocking')
const minutes = join(WS, 'VibeMath', 'Projects', 'default', 'Institutes', 'institute', 'Shared', 'Meetings', 'mt-1.md')
assert(existsSync(minutes), 'the meeting minutes were written')
if (existsSync(minutes)) {
  const t = readFileSync(minutes, 'utf8')
  assert(/### acad/.test(t) && /### r-1/.test(t), 'the minutes key each speech by its real member id')
  assert(/有表决权者：acad、r-1/.test(t), 'the minutes list the real voting members')
}
// A non-academician may only PROPOSE a meeting; the relay must be signed by the proposer.
delivered.length = 0
const propMtg = await callTool('vibe_v5_meeting', { agenda: '我提议讨论路线', kind: 'sync' }, childAgent(childOf(RI, 'r-1')))
assert(propMtg.ok === true && propMtg.proposed === true, 'a researcher can only PROPOSE a meeting (' + JSON.stringify(propMtg).slice(0, 80) + ')')
await settle(); await drainWakes(20, RI)
const propText = delivered.map(w => w.prompt).join('\n')
for (const w of delivered) record('meeting-proposal', w.owner, w.prompt)
assert(/【研究所·致全体表决者 from r-1】[^\n]*提议开会/.test(propText),
  'the meeting proposal is relayed SIGNED BY ITS TRUE PROPOSER r-1, not by whoever was woken last')
await endCase(RI)

// =============== CASE 10b: meetings and verifications are mutually exclusive ======
section('10b a verification proposed DURING a meeting must queue, never preempt it')
const RN = makeRoot()
await callTool('vibe_v5_start', { problem: '会议与验证互斥测试', researcherCount: 1 }, RN)
for (const sp of spawnsFor(RN)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RN)
await callTool('vibe_v5_set', { maxParallel: 8 }, RN)
await callTool('vibe_v5_record_proposition', { id: 'p-mid', statement: '会议期间提出的对象', value: 0.6, motive: 'm', p: 0.7 }, childAgent(childOf(RN, 'r-1')))
// Convene a meeting and stop before it has collected every input, so it stays in flight.
hushed.add(RN.id)
delivered.length = 0
const convened = await callTool('vibe_v5_meeting', { agenda: '先开这个会', kind: 'sync' }, childAgent(childOf(RN, 'acad')))
assert(convened.ok === true, 'a meeting was convened (' + JSON.stringify(convened).slice(0, 80) + ')')
await settle(); await drainWakes(1, RN)
const during = await callTool('vibe_v5_status', {}, RN)
assert(!!during.meeting, 'the meeting is still in flight (not everyone has spoken)')
// A member proposing a verification mid-meeting must NOT start a second, concurrent
// consensus process: the design says meetings and verifications never overlap, and a
// verification that preempts a meeting starves the meeting's watchdog clock.
const propMid = await callTool('vibe_v5_propose_verify', { target: 'p-mid', kind: 'proposition', reason: '想在会上定' }, childAgent(childOf(RN, 'r-1')))
assert(propMid.ok === true, 'the proposal is accepted (' + JSON.stringify(propMid).slice(0, 90) + ')')
await settle()
const afterProp = await callTool('vibe_v5_status', {}, RN)
assert(!!afterProp.meeting, 'the meeting is STILL in flight after the proposal')
assert(afterProp.verify === null,
  'NO verification started while the meeting was in flight (got ' + JSON.stringify(afterProp.verify && afterProp.verify.target) + ')')
assert((afterProp.verifyQueue || []).indexOf('p-mid') !== -1,
  'the proposal is QUEUED instead (queue=' + JSON.stringify(afterProp.verifyQueue) + ')')
// Once the meeting ends, the queued proposal must run — queueing must not drop it.
hushed.delete(RN.id)
await settleInstitute(RN)
const afterMtg = await callTool('vibe_v5_status', {}, RN)
assert(afterMtg.meeting === null, 'the meeting finished')
assert(afterMtg.verify !== null || afterMtg.undecided.indexOf('p-mid') !== -1 || afterMtg.verified.indexOf('p-mid') !== -1,
  'the queued proposal was started after the meeting ended (verify=' + JSON.stringify(afterMtg.verify && afterMtg.verify.target)
  + ', queue=' + JSON.stringify(afterMtg.verifyQueue) + ')')
await endCase(RN)

// =============== CASE 11: no unpaced re-wake loop ===============================
section('11 a task owner is pushed on a PACED cadence, not in a tight loop')
const RJ = makeRoot()
await callTool('vibe_v5_start', { problem: '调度节奏测试', researcherCount: 1 }, RJ)
for (const sp of spawnsFor(RJ)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RJ)
const asg = await callTool('vibe_v5_assign', { subject: '一个长任务', to: 'r-1', why: '你最合适', acceptance: '给出结果' }, childAgent(childOf(RJ, 'acad')))
assert(asg.ok === true, 'a task was assigned to r-1')
await settle(); await drainWakes(6, RJ)
const afterAssign = await callTool('vibe_v5_status', {}, RJ)
assert(afterAssign.tasks.some(t => t.status === 'in_progress' && t.ownerId === 'r-1'), 'r-1 still owns in-progress work')
assert(!afterAssign.members.some(m => m.busy), 'r-1 is idle again after answering')
// A task owner must NOT be re-woken the moment its turn ends: the work push is paced by
// activityTimeoutMs (120 s here). Without the pace, one unfinished task became an
// unbounded wake -> turn -> wake chain that burned tokens with no backoff at all.
await sleep(500); await settle()
const unpaced = wakes.filter(w => w.rootId === RJ.id)
assert(unpaced.length === 0, 'no unpaced re-wake of the task owner within the idle window (got ' + unpaced.length + ')')
await endCase(RJ)

// =============== CASE 12: Lean mode prompt text =================================
section('12 Lean formal-verification text enters the prompts (and the corpus)')
const RK = makeRoot()
await callTool('vibe_v5_start', { problem: 'Lean 提示词测试', researcherCount: 2 }, RK)
for (const sp of spawnsFor(RK)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RK)
await callTool('vibe_v5_set', { maxParallel: 8, formalVerify: 'encourage' }, RK)
// (a) an ordinary work round carries the "formalize reusable things as you go" request
delivered.length = 0
await callTool('vibe_v5_say', { to: 'r-1', text: '继续推进。' }, childAgent(childOf(RK, 'acad')))
await settle(); await drainWakes(3, RK)
for (const w of delivered.filter(d => d.rootId === RK.id)) recordAndCheck('lean-work', w.owner, w.prompt)
{
  const txt = delivered.filter(d => d.rootId === RK.id).map(d => d.prompt).join('\n')
  assert(/\[形式化\] 鼓励 Lean/.test(txt), 'the state block announces the Lean mode with its counts')
  assert(/【顺手形式化（鼓励）】/.test(txt), 'the work round asks for reusable objects to be formalized as work proceeds')
}
// (b) a voting round on an object WITHOUT a proof carries the "decide by difficulty" block
await callTool('vibe_v5_record_proposition', { id: 'p-lean-a', statement: 'Lean 语料对象甲', value: 0.6, motive: 'm', p: 0.8 }, childAgent(childOf(RK, 'r-1')))
const propA = await callTool('vibe_v5_propose_verify', { target: 'p-lean-a', kind: 'proposition', reason: '语料' }, childAgent(childOf(RK, 'r-1')))
assert(propA.ok === true && propA.started === true, 'the Lean corpus ballot for object 甲 actually started (' + JSON.stringify(propA).slice(0, 90) + ')')
delivered.length = 0
const vwA = await takeVerifyPrompts(RK, 3)
assert(vwA.length === 3, 'captured three voting prompts for object 甲 (got ' + vwA.length + ')')
for (const w of vwA) recordAndCheck('lean-verify', memberOfChild(w.childId), w.prompt)
{
  const txt = delivered.filter(d => d.rootId === RK.id).map(d => d.prompt).join('\n')
  assert(/【Lean 形式化验证（鼓励模式）】/.test(txt), 'the voting prompt explains the Lean mode')
  assert(/你唯一需要确认的就是忠实性/.test(txt), 'the voting prompt states the fidelity question')
}
await endCase(RK)
// (c) once a proof passes, the voting prompt switches to the fidelity review. This uses its
// own root: object 甲's ballot may still be in flight above, and a queued proposal would
// make the drained prompts belong to the WRONG ballot (the assertion would then fail for a
// reason that has nothing to do with the feature).
const RL2 = makeRoot()
await callTool('vibe_v5_start', { problem: 'Lean 忠实性提示词测试', researcherCount: 2 }, RL2)
for (const sp of spawnsFor(RL2)) { fireEnd(sp.childId, { progress: memberOfChild(sp.childId) + '：初始见解。', solved: false, contextPct: 10 }); await settle() }
await settleInstitute(RL2)
await callTool('vibe_v5_set', { maxParallel: 8, formalVerify: 'encourage' }, RL2)
await callTool('vibe_v5_record_proposition', { id: 'p-lean-b', statement: 'Lean 语料对象乙', value: 0.6, motive: 'm', p: 0.9 }, childAgent(childOf(RL2, 'r-1')))
const leanB = await callTool('vibe_v5_lean_archive', { kind: 'proof', target: 'p-lean-b', content: 'theorem p_lean_b : 1 + 1 = 2 := by decide\n' }, childAgent(childOf(RL2, 'r-1')))
assert(leanB.ok === true && leanB.passed === true, 'object 乙 has a proof that really passes (' + JSON.stringify({ ok: leanB.ok, passed: leanB.passed, code: leanB.run && leanB.run.code }) + ')')
const propB = await callTool('vibe_v5_propose_verify', { target: 'p-lean-b', kind: 'proposition', reason: '已有证明' }, childAgent(childOf(RL2, 'r-1')))
assert(propB.ok === true && propB.started === true, 'the Lean corpus ballot for object 乙 actually started (' + JSON.stringify(propB).slice(0, 90) + ')')
delivered.length = 0
const vwB = await takeVerifyPrompts(RL2, 3)
assert(vwB.length === 3, 'captured three voting prompts for object 乙 (got ' + vwB.length + ')')
for (const w of vwB) recordAndCheck('lean-fidelity', memberOfChild(w.childId), w.prompt)
{
  const txt = vwB.map(w => w.prompt).join('\n')
  assert(/该对象已有\*\*通过的 Lean 形式化证明\*\*/.test(txt), 'the prompt announces the passing proof')
  assert(/你不需要重新检查推导/.test(txt), 'with a proof in hand the prompt tells voters not to re-derive')
  assert(/忠实性审查/.test(txt), 'and asks for a fidelity review instead')
}
await drainWakes(10, RL2)
await endCase(RL2)

// =============== PART: full-corpus sweep ========================================
section('13 full-corpus sweep over every prompt ever sent')
{
  let swept = 0
  for (const sp of spawns) {
    if (!sp.prompt) continue
    swept++
    checkPromptSweep(sp.prompt, memberOfChild(sp.childId), 'corpus spawn ' + memberOfChild(sp.childId))
  }
  assert(swept >= 12, 'the corpus inspected every founding/resume prompt in the process (' + swept + ')')
  const owners = new Set(corpus.map(c => c.owner))
  assert(owners.has('acad') && owners.has('r-1') && owners.has('r-2'), 'the corpus covers academician and researchers (' + [...owners].join('、') + ')')
  assert([...owners].some(o => /^t-/.test(o)), 'the corpus covers a temp worker')
  const kinds = new Set(corpus.map(c => c.kind))
  for (const need of ['founding', 'founding-temp', 'founding-leaderless', 'resume', 'normal', 'checkpoint',
    'verify', 'verify-debate', 'meeting', 'meeting-proposal', 'inbox-dm', 'inbox-voters', 'inbox-chat',
    'inbox-office', 'inbox-assign', 'inbox-nudge', 'notice', 'notice-claim', 'after-failure',
    'lean-work', 'lean-verify', 'lean-fidelity']) {
    assert(kinds.has(need), 'the corpus contains a ' + need + ' prompt')
  }
  assert(corpus.every(c => c.prompt && c.prompt.length > 200), 'no captured prompt is suspiciously short')
  assert(corpus.every(c => !GARBAGE.some(g => g.test(c.prompt + (c.persona || '')))), 'no prompt or charter contains undefined/NaN/? garbage')
  // A single prompt must not deliver the same message twice. The inbox used to be
  // prepended AND re-emitted from the [状态] block, so a member read every new message
  // twice in one prompt.
  for (const c of corpus) {
    const bodies = c.prompt.match(/【[^】]*】[^\n]{20,}/g) || []
    for (const frame of new Set(bodies)) {
      const n = bodies.filter(b => b === frame).length
      if (n > 1) { assert(false, 'message delivered ' + n + '× in one prompt (' + c.kind + '/' + c.owner + '): ' + frame.slice(0, 60)); break }
    }
    const inboxHeads = (c.prompt.match(/\[新到的消息/g) || []).length
    assert(inboxHeads <= 1, c.kind + '/' + c.owner + ': at most one inbox section per prompt (found ' + inboxHeads + ')')
  }
  assert(true, 'no prompt delivers the same framed message twice, and no prompt has two inbox sections')
  // The identity claim inside a prompt must agree with the persona shipped alongside it.
  for (const c of corpus) {
    if (!c.persona) continue
    const st = parseState(c.prompt)
    if (!st) continue
    assert(c.persona.indexOf('Members/' + st.id + '/') !== -1,
      c.kind + ': the charter shipped with ' + st.id + "'s prompt points at Members/" + st.id + '/')
  }
}

// =============== corpus dump ====================================================
section('14 the full prompt corpus is preserved for human review')
mkdirSync(CORPUS_DIR, { recursive: true })
const md = []
md.push('# Vibe Math V5 — 提示词与交互语料（自动生成，请勿手改）')
md.push('')
md.push('由 `prompt-v5-integrity.test.mjs` 在每次运行时重写。这里保存的是**框架真正发给每个')
md.push('成员的提示词原文**，用于人工复核提示词分配、成员代号与交互内容的正确性。')
md.push('')
md.push('- 生成时刻的工作区路径被替换为 `<WS>`，因此内容是确定性的、可 diff 的。')
md.push('- `owner` 是这条提示词**实际发给的成员**；`kind` 是提示词类型。')
md.push('- 人设（charter/persona）按成员只完整打印一次，其余条目只记录字符数。')
md.push('- 这是提示词正确性的人工复核入口：任何“成员代号/职位/在册名单/交互署名”问题')
md.push('  都能在这里一眼看出，而不必去翻会话日志。')
md.push('')
const seenPersona = new Set()
const order = ['founding', 'founding-temp', 'founding-leaderless', 'resume', 'normal', 'checkpoint',
  'verify', 'verify-debate', 'meeting', 'meeting-proposal', 'inbox-dm', 'inbox-voters', 'inbox-chat',
  'inbox-office', 'inbox-assign', 'inbox-nudge', 'notice', 'notice-claim', 'after-failure',
  'lean-work', 'lean-verify', 'lean-fidelity']
const sorted = corpus.slice().sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
for (let i = 0; i < sorted.length; i++) {
  const c = sorted[i]
  md.push('---')
  md.push('')
  md.push('## [' + (i + 1) + '] kind=`' + c.kind + '` owner=`' + c.owner + '`')
  md.push('')
  if (c.toolFilter) md.push('- toolFilter: `' + JSON.stringify(c.toolFilter) + '`')
  md.push('- charter: ' + (c.persona == null ? '（本次唤醒不带人设）' : c.persona.length + ' 字符'))
  md.push('')
  if (c.persona != null && !seenPersona.has(c.owner)) {
    seenPersona.add(c.owner)
    md.push('### 人设 / 规章（' + c.owner + '，仅首次完整打印）')
    md.push('')
    md.push('```text')
    md.push(c.persona)
    md.push('```')
    md.push('')
  }
  md.push('### 提示词原文')
  md.push('')
  md.push('```text')
  md.push(c.prompt)
  md.push('```')
  md.push('')
}
const byKind = {}
for (const c of corpus) byKind[c.kind] = (byKind[c.kind] || 0) + 1
md.push('---')
md.push('')
md.push('## 统计')
md.push('')
for (const k of Object.keys(byKind).sort()) md.push('- `' + k + '`: ' + byKind[k])
md.push('')
md.push('- 合计：' + corpus.length + ' 条提示词')
md.push('')
const mdPath = join(CORPUS_DIR, 'prompt-corpus-v5.md')
writeFileSync(mdPath, md.join('\n'), 'utf8')
writeFileSync(join(CORPUS_DIR, 'prompt-corpus-v5.json'), JSON.stringify({
  note: 'Vibe Math V5 prompt/interaction corpus — generated by prompt-v5-integrity.test.mjs. <WS> = the run workspace.',
  counts: byKind, total: corpus.length,
  prompts: corpus.map(c => ({
    kind: c.kind, owner: c.owner, sentToLabel: c.sentToLabel,
    charterChars: c.persona == null ? null : c.persona.length,
    charter: c.persona, toolFilter: c.toolFilter, prompt: c.prompt,
  })),
}, null, 2), 'utf8')
assert(existsSync(mdPath), 'the prompt corpus Markdown was written')
assert(existsSync(join(CORPUS_DIR, 'prompt-corpus-v5.json')), 'the prompt corpus JSON was written')
const corpusMd = readFileSync(mdPath, 'utf8')
assert(corpusMd.length > 30000, 'the corpus is substantial (' + corpusMd.length + ' chars) — the real prompt text is preserved')
assert(corpusMd.indexOf('[状态] 你是 acad（院士）') !== -1, 'a human can verify the academician brief verbatim')
assert(corpusMd.indexOf('[状态] 你是 r-2') !== -1, 'a human can verify a researcher brief naming itself')
assert(corpusMd.indexOf('【框架提示】') !== -1, 'the corpus contains the framework-feedback interaction')
assert(corpusMd.indexOf('【会话重建 —— ') !== -1, 'the corpus contains a resume brief')
assert(corpusMd.indexOf('【所办分派】') !== -1, 'the corpus contains an office assignment')
assert(!/你是 \?/.test(corpusMd), 'the corpus contains NO wrong-identity "?" brief')

console.log('')
console.log('corpus: ' + mdPath)
console.log('passed=' + passed + ' failed=' + failed)
if (failed) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
process.exit(0)
