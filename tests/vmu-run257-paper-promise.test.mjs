// tests/vmu-run257-paper-promise.test.mjs — RUN 257 PAPER PROMISE (TB-2638 / task-119).
//
// THE DEFECT THIS PINS: the paper face and the prompts taught "final / render / compile" as one-step successes. On a
// machine that has no LaTeX face (the normal case here) the receipts said `ok: true` while `missing: ["pdf"]`,
// `renderOk: false`, `complete: false` were true at the same time, and 12 prompts mentioned `consult` ZERO times —
// so the office consult gate refused `final` with a rule nobody had been taught (TB-2633 counted P40/P43/P44/P45).
//
// WHAT THIS SUITE PROVES, from REAL kernel receipts (no fixture restates the code it checks):
//   1 P40: `final` is refused BY NAME before the office consult; the hint teaches the TOOL face; once the office
//     answers through that face, the SAME `final` is accepted.
//   2 P43/P45: `ok:true` is the REQUEST; `complete` / `renderOk` are the PAPER; the receipts say which is which
//     (`okMeans` / `completeMeans` / `renderOkMeans` / `unfinished` / `reachableInstead`).
//   3 P44: `compile` refuses `VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING` WITH a reachable alternative.
//   4 D-2 CONTRACT (LEAD criterion): every tool name and parameter the hints TELL you to use must exist in the
//     registry this same boot publishes (`spec.parameters.properties`) — checked by traversal, not by literals.
//   5 PROMPT HALF: the declared paper-final section teaches the readings the receipts now carry, and every tool it
//     names exists. Nothing in it says "ok:true is completion".
//
// Run: node tests/vmu-run257-paper-promise.test.mjs     Last line: === VMU RUN257 PAPER PROMISE: N passed, M failed ===

import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const V5R = join(REPO, 'vibe-math-vmu', 'packs', 'v5r')
const urlish = (p) => pathToFileURL(p).href

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}

// --- the real v5r pack on a throwaway root -------------------------------------------------------------
async function bootFaces (config = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vmu-r257-pp-'))
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } }
  }
  const entry = await import(urlish(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')))
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root, ...config })
  await handle.ready()
  await handle.kernel.store.open()
  const hire = async (id, slot) => handle.kernel.members.hire({ id, slot, institution: 'sim' })
  const call = async (name, args = {}) => {
    const spec = specs.filter((s) => s && s.name === name)[0]
    if (!spec) throw new Error('no such tool on this boot: ' + name)
    const raw = await spec.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  // refusals reach the face as a receipt (ok:false + code) or as a thrown error; this normalises both
  const drive = async (name, args = {}) => {
    try {
      const receipt = await call(name, args)
      return { refused: receipt.ok === false && typeof receipt.code === 'string', receipt, code: receipt.code, message: String(receipt.message || ''), hint: String(receipt.hint || '') }
    } catch (e) {
      return { refused: true, thrown: true, receipt: null, code: e && e.code, message: String((e && e.message) || ''), hint: String((e && e.hint) || '') }
    }
  }
  const registry = new Map()
  for (const s of specs) {
    const props = s && s.parameters && s.parameters.properties
    registry.set(String(s && s.name), new Set(props ? Object.keys(props) : []))
  }
  return { root, handle, kernel: handle.kernel, specs, call, drive, hire, registry }
}

const workspaceOf = (root) => join(root, 'VibeMath')
const writeWs = (root, rel, text) => {
  const abs = join(workspaceOf(root), rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text)
  return abs
}

// --- D-2 contract helper: the hint must tell you something that EXISTS --------------------------------
const MARKER = 'REACHABLE INSTEAD:'
const TOOL_ARG_RX = /(vibe_(?:v5|vmu)_[a-z0-9_]+)\s*\{([^}]*)\}/g

function auditHint (registry, hint, label) {
  const text = String(hint || '')
  const at = text.indexOf(MARKER)
  if (!ok(at >= 0, label + ': the hint carries the ASCII contract marker ' + MARKER, text.slice(0, 120))) return
  const body = text.slice(at + MARKER.length).trim()
  const dense = body.replace(/\s+/g, '')
  ok(dense.length >= 12, label + ': the marker is followed by a real alternative (>=12 non-space chars)', dense.length)
  ok(/\(|vibe_/.test(body), label + ': the alternative names a callable shape, not a slogan', body.slice(0, 90))
  const argSpans = [...text.matchAll(TOOL_ARG_RX)]
  const bareSpans = [...text.matchAll(/(?:^|[^A-Za-z0-9_.])(vibe_(?:v5|vmu)_[a-z0-9_]+)/g)]
  // RULE E guard: a hint that names no tool at all is the defect this section exists to catch — so the scans below
  // must have input. (This is a real guard: a prose-only "alternative" fails here instead of the loops silently
  // running zero times.)
  ok(argSpans.length > 0 || bareSpans.length > 0,
    label + ': the hint names at least one tool call, not just prose', { argSpans: argSpans.length, bareSpans: bareSpans.length })
  for (const m of argSpans) {
    const tool = m[1]
    const known = registry.get(tool)
    if (!ok(known !== undefined, label + ': tool named in the hint is on the registry: ' + tool)) continue
    const args = m[2].split(',')
    ok(args.length > 0, label + ': the argument list parses into at least one token (' + tool + ')', args.length)
    for (const raw of args) {
      const p = raw.trim()
      if (p === '') continue
      if (p === '...' || p === '…') continue
      const named = (p.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/) || [])[1]
      const key = named || p
      ok(/^[A-Za-z_][A-Za-z0-9_]*$/.test(key), label + ': parameter token is a name, not prose: ' + p)
      ok(known.has(key), label + ': parameter is declared on ' + tool + ': ' + key, [...known].join(','))
    }
  }
  for (const m of bareSpans) {
    ok(registry.get(m[1]) !== undefined, label + ': bare tool name is on the registry: ' + m[1])
  }
}

// --- the REAL paper flow: start -> part x2 -> advance -> review x2 -> advance --------------------------
const PAPER = 'RUN257 论文承诺'
async function paperUpToEditor (b) {
  await b.hire('r-acad', 'chair')
  await b.hire('r-1', 'member')
  await b.hire('r-2', 'member')
  const start = await b.call('vibe_v5_paper', { action: 'start', title: PAPER, participants: ['r-1', 'r-2'] })
  if (!ok(start.ok === true, 'paper flow: start accepted', start.code || '')) return PAPER
  const prop = await b.call('vibe_v5_record_proposition', {
    member: 'r-1', statement: 'RUN257 命题', value: 'objects', motive: 'RUN257 复算回执', p: 0.5
  })
  const recId = String((prop && prop.recordId) || '')
  ok(recId !== '', 'paper flow: a proposition row exists to cite as evidence', prop && prop.recordId)
  const part = await b.call('vibe_v5_paper', {
    action: 'part', target: PAPER, member: 'r-1', part: '结论', solution: ('RUN257 结论正文') + String.fromCharCode(10) + '证据等级：draft', evidence: [recId]
  })
  ok(part.ok === true, 'paper flow: part accepted', part.code || '')
  await b.call('vibe_v5_paper', { action: 'part', target: PAPER, member: 'r-2', part: '附录', solution: ('RUN257 附录正文') + String.fromCharCode(10) + '证据等级：draft', evidence: [recId] })
  const adv1 = await b.call('vibe_v5_paper', { action: 'advance', target: PAPER, member: 'r-acad' })
  ok(adv1.advance && adv1.advance.to === 'reviewing', 'paper flow: first advance opens cross-review', adv1.advance && adv1.advance.to)
  await b.call('vibe_v5_paper', { action: 'review', target: PAPER, member: 'r-1', of: 'r-2', deliverable: true })
  await b.call('vibe_v5_paper', { action: 'review', target: PAPER, member: 'r-2', of: 'r-1', deliverable: true })
  const adv2 = await b.call('vibe_v5_paper', { action: 'advance', target: PAPER, member: 'r-acad' })
  ok(adv2.advance && adv2.advance.to === 'awaiting-editor', 'paper flow: second advance reaches awaiting-editor', adv2.advance && adv2.advance.to)
  return PAPER
}

// the office consult gate, driven the way the refusal teaches: read the waiting id, then answer by name
async function answerConsult (b, label) {
  const state = await b.call('vibe_v5_paper', { action: 'consult_state', target: PAPER })
  const awaiting = state && state.consult && state.consult.awaiting
  ok(awaiting !== null && awaiting !== undefined, label + ': consult_state shows the waiting request', state.consult && state.consult.status)
  const requestId = String((awaiting && awaiting.id) || '')
  ok(/^consult-\d{4}-[0-9a-f]{4}$/.test(requestId), label + ': the waiting request id has the canonical shape', requestId)
  const answer = await b.call('vibe_v5_paper', {
    action: 'consult', target: PAPER, member: 'office', answer: '核对过：缺 pdf 是环境事实，可收口'
  })
  ok(answer.ok === true, label + ': the office answers through the TOOL face (action: consult)', answer.code || '')
  return requestId
}

async function finalAfterConsult (b, label) {
  const before = await b.drive('vibe_v5_paper', { action: 'final', target: PAPER, member: 'r-acad', decision: 'deliverable' })
  ok(before.refused === true, label + ': final is REFUSED before the office consult', before.code || '')
  ok(before.code === 'VMU_OFFICE_CONSULT_REQUIRED', label + ': the refusal is NAMED VMU_OFFICE_CONSULT_REQUIRED', before.code)
  const requestId = await answerConsult(b, label)
  const after = await b.call('vibe_v5_paper', { action: 'final', target: PAPER, member: 'r-acad', decision: 'deliverable' })
  return { before, after, requestId }
}

console.log('RUN 257 PAPER PROMISE — TB-2638: receipts and prompts must agree about what "ok" means')

// §1 — P40 + P43: refusal teaches the consult, then the same final is accepted with honest readings -------
{
  const b = await bootFaces()
  await paperUpToEditor(b)
  const { before, after, requestId } = await finalAfterConsult(b, '§1 P40')
  auditHint(b.registry, before.hint, '§1 P40 hint')
  ok(before.receipt && before.receipt.final && before.receipt.final.blockedBy === 'office-consult', '§1 P40: the nested final names the blocking gate', before.receipt && before.receipt.final && before.receipt.final.blockedBy)
  ok(before.receipt && String(before.receipt.requestId || '') !== '', '§1 P40: the refusal carries the opened request id', before.receipt && before.receipt.requestId)
  ok(after.ok === true, '§1 P43: the SAME final is accepted once the consult is answered', after.code || '')
  ok(after.complete === false, '§1 P43: complete is false on a machine with no pdf (ok:true is not completion)', after.complete)
  ok(Array.isArray(after.unfinished) && after.unfinished.indexOf('pdf') >= 0, '§1 P43: unfinished NAMES pdf for the caller', after.unfinished)
  ok(Array.isArray(after.toolchainAbsent) && after.toolchainAbsent.indexOf('latex') >= 0, '§1 P43: toolchainAbsent names latex', after.toolchainAbsent)
  ok(after.final && Array.isArray(after.final.missing) && after.final.missing.indexOf('pdf') >= 0, '§1 P43: the nested final still names missing pdf', after.final && after.final.missing)
  ok(after.final && after.final.complete === false, '§1 P43: the nested final AGREES with the top-level reading', after.final && after.final.complete)
  ok(typeof after.okMeans === 'string' && /request/i.test(after.okMeans) && /\bnot\b/i.test(after.okMeans), '§1 P43: okMeans says ok is the request, NOT the paper', after.okMeans)
  ok(typeof after.completeMeans === 'string' && after.completeMeans.length > 40, '§1 P43: completeMeans says what completion would require', String(after.completeMeans).slice(0, 80))
  ok(Array.isArray(after.reachableInstead) && after.reachableInstead.length >= 2, '§1 P43: reachableInstead lists concrete calls', after.reachableInstead && after.reachableInstead.length)
  ok(String(after.final && after.final.consult && after.final.consult.requestId || '') === requestId, '§1 P43: the final records WHICH consult satisfied it', after.final && after.final.consult)
}

// §2 — P45: render ok:true with renderOk:false, and the means must not call that a finished render ---------
{
  const b = await bootFaces()
  await paperUpToEditor(b)
  const { after } = await finalAfterConsult(b, '§2 P45')
  ok(after.ok === true, '§2 P45: final accepted before render', after.code || '')
  const render = await b.call('vibe_v5_paper', { action: 'render', target: PAPER, member: 'r-acad' })
  ok(render.ok === true, '§2 P45: render ok:true means the REQUEST ran', render.code || '')
  ok(render.renderOk === false, '§2 P45: renderOk is false on a machine with no pdf', render.renderOk)
  ok(render.complete === render.renderOk, '§2 P45: complete and renderOk are the same fact (by construction)', [render.complete, render.renderOk])
  ok(Array.isArray(render.unfinished) && render.unfinished.indexOf('pdf') >= 0, '§2 P45: unfinished names pdf', render.unfinished)
  ok(typeof render.okMeans === 'string' && /request/i.test(render.okMeans), '§2 P45: okMeans says ok is the request', render.okMeans)
  ok(typeof render.renderOkMeans === 'string' && render.renderOkMeans.length > 40, '§2 P45: renderOkMeans explains what renderOk measures', String(render.renderOkMeans).slice(0, 80))
  const text = String(render.renderOkMeans || '')
  ok(!/渲染完成|渲染成功|rendered successfully|render is done/i.test(text), '§2 P45: renderOkMeans does NOT say the render is done', text)
  ok(/kit|archive|归档/i.test(text), '§2 P45: renderOkMeans names the real definition (the kit archive row set)', text.slice(0, 120))
}

// §3 — P44: compile refuses by name WITH a reachable alternative -----------------------------------------
{
  const b = await bootFaces()
  await paperUpToEditor(b)
  const compile = await b.drive('vibe_v5_paper', { action: 'compile', target: PAPER, member: 'r-acad' })
  ok(compile.refused === true, '§3 P44: compile is refused on a boot with no LaTeX face', compile.code)
  ok(compile.code === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING', '§3 P44: the refusal is NAMED EXECUTOR_MISSING', compile.code)
  auditHint(b.registry, compile.hint, '§3 P44 hint')
  ok(/vibe_v5_paper/.test(compile.hint) && /vibe_vmu_env/.test(compile.hint), '§3 P44: the hint names both reachable tools', compile.hint.slice(-200))
  ok(/latex/.test(compile.hint) && /final|missing/i.test(compile.hint), '§3 P44: the hint names latex and the final-with-missing road', compile.hint.slice(-160))
}

// §4 — ok is not completion: the two readings disagree in the receipt the prompt teaches -----------------
{
  const b = await bootFaces()
  await paperUpToEditor(b)
  const { after } = await finalAfterConsult(b, '§4')
  ok(after.ok === true && after.complete === false, '§4: ok:true WITH complete:false is the normal reading, not an error', [after.ok, after.complete])
  const means = String(after.okMeans || '') + ' ' + String(after.completeMeans || '')
  ok(/request/i.test(means) && /(complete|done|finish)/i.test(means), '§4: the means spell out request-vs-completion', means.slice(0, 140))
  const status = await b.call('vibe_v5_paper', { action: 'status', target: PAPER })
  ok(status.complete === false, '§4: status AGREES with final about completion', status.complete)
  ok(Array.isArray(status.toolchainAbsent) && status.toolchainAbsent.indexOf('latex') >= 0, '§4: status reads toolchainAbsent (the environment fact)', status.toolchainAbsent)
}

// §5 — D-2 治本: the other three refusal hints, audited against this boot's registry ----------------------
{
  const b = await bootFaces()
  await b.hire('r-acad', 'chair')
  await b.hire('r-1', 'member')
  // VMU_PACK_V5R_BLUEPRINT_MD_MISSING: a member names a draft file that does not exist
  const missing = await b.drive('vibe_v5_blueprint', {
    action: 'propose', path: 'Protocol', member: 'r-acad', text: 'RUN257 草案正文', mdPath: 'Shared/Drafts/RUN257-never-written.md'
  })
  ok(missing.refused === true, '§5: propose with a missing member draft file is refused', missing.code)
  ok(missing.code === 'VMU_PACK_V5R_BLUEPRINT_MD_MISSING', '§5: the blueprint refusal is NAMED MD_MISSING', missing.code)
  auditHint(b.registry, missing.hint, '§5 blueprint MD_MISSING hint')
  // VMU_PACK_V5R_BLUEPRINT_MD_DRIFT: a jointly authored draft is changed on disk after the row recorded it
  const DRAFT = 'Shared/Drafts/RUN257-drift-r1.md'
  writeWs(b.root, DRAFT, '# RUN257 drift draft\n')
  const p1 = await b.call('vibe_v5_blueprint', {
    action: 'propose', path: 'Protocol', member: 'r-acad', mdPath: DRAFT, materialize: true
  })
  const p2 = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Protocol', member: 'r-1', mdPath: DRAFT })
  const id = String((p2 && p2.id) || (p1 && p1.id) || '')
  ok(id !== '', '§5: the joint draft is on the board', p2 && p2.revision)
  writeWs(b.root, DRAFT, '# RUN257 drift draft\n\nchanged on disk after the row was written\n')
  const drift = await b.drive('vibe_v5_blueprint', { action: 'adopt', path: 'Protocol', member: 'r-acad', draft: id })
  ok(drift.refused === true, '§5: adopting a draft whose bytes drifted is refused', drift.code)
  ok(drift.code === 'VMU_PACK_V5R_BLUEPRINT_MD_DRIFT', '§5: the drift refusal is NAMED MD_DRIFT', drift.code)
  auditHint(b.registry, drift.hint, '§5 blueprint MD_DRIFT hint')
  // VMU_MEMBER_SESSION_NEVER_OPENED: tool_help for a member that has no child session
  const help = await b.call('vibe_v5_tool_help', { member: 'r-acad' })
  const nested = help && help.measuredSet && help.measuredSet.refusal
  ok(nested && nested.code === 'VMU_MEMBER_SESSION_NEVER_OPENED', '§5: tool_help names NEVER_OPENED for a member with no session', nested && nested.code)
  auditHint(b.registry, nested && nested.hint, '§5 NEVER_OPENED hint')
}

// §6 — the PROMPT half: paper-final teaches the readings and names only real tools ------------------------
{
  const v5r = await import(urlish(join(V5R, 'index.js')))
  const sections = (v5r.PACK && v5r.PACK.sections) || []
  const paperBlocks = sections.filter((s) => {
    const phases = (s && s.scope && s.scope.phase) || []
    return phases.indexOf('paper-final') >= 0
  })
  ok(paperBlocks.length > 0, '§6: the pack DECLARES a paper-final section', paperBlocks.length)
  const blockMod = await import(urlish(join(V5R, 'prompts', 'v5r-blocks-b.js')))
  const block = (blockMod.CHARTER_BLOCKS_B || []).filter((x) => x && x.name === 'v5r-paper-final')[0]
  ok(block !== undefined, '§6: the paper-final block is declared in the source corpus', blockMod.CHARTER_BLOCKS_B && blockMod.CHARTER_BLOCKS_B.length)
  const text = String((block && block.texts && block.texts['paper-final']) || '')
  ok(/ok:true/.test(text), '§6: the section teaches the ok:true reading', text.length)
  ok(/complete/.test(text) && /missing/.test(text), '§6: the section names complete and missing', text.slice(0, 120))
  ok(/consult_state/.test(text), '§6: the section teaches the consult route', /consult_state/.test(text))
  ok(/latex|toolchainAbsent/.test(text), '§6: the section teaches the environment fact', /latex/.test(text))
  ok(!/ok[:：]?\s*true[^\n]{0,30}(即|就是|等于)[^\n]{0,12}(完成|定稿)/.test(text), '§6: the section does NOT say ok:true is completion', text.match(/ok:true/))
  const b = await bootFaces()
  const registry = b.registry
  const argSpans = [...text.matchAll(TOOL_ARG_RX)]
  const bareSpans = [...text.matchAll(/(?:^|[^A-Za-z0-9_.])(vibe_(?:v5|vmu)_[a-z0-9_]+)/g)]
  // RULE E guard: the section must actually name tool calls; otherwise the two loops below check nothing.
  ok(argSpans.length > 0 || bareSpans.length > 0,
    '§6: the section names at least one tool call', { argSpans: argSpans.length, bareSpans: bareSpans.length })
  for (const m of argSpans) {
    if (!ok(registry.get(m[1]) !== undefined, '§6: prompt names a real tool: ' + m[1])) continue
    const args = m[2].split(',')
    ok(args.length > 0, '§6: the argument list parses into at least one token (' + m[1] + ')', args.length)
    for (const raw of args) {
      const p = raw.trim()
      if (p === '') continue
      if (p === '...' || p === '…') continue
      const key = (p.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:/) || [])[1] || p
      ok(registry.get(m[1]).has(key), '§6: prompt names a real parameter of ' + m[1] + ': ' + key)
    }
  }
  for (const m of bareSpans) {
    ok(registry.get(m[1]) !== undefined, '§6: prompt names a real tool (bare): ' + m[1])
  }
}

console.log('')
if (failed > 0) {
  console.error('=== VMU RUN257 PAPER PROMISE: ' + passed + ' passed, ' + failed + ' failed ===')
  process.exitCode = 1
} else {
  console.log('=== VMU RUN257 PAPER PROMISE: ' + passed + ' passed, ' + failed + ' failed ===')
}
