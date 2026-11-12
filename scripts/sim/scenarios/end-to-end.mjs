#!/usr/bin/env node
// scripts/sim/scenarios/end-to-end.mjs — TB-2601 · ONE UNBROKEN LIFETIME, ZERO TOKENS.
//
// WHY THIS FILE EXISTS: the twelve scenarios next to it each prove one face (meetings, paper, records, refusals...).
// None of them proves the thing the institute actually ships: a single lifetime that starts from an empty workspace and
// ends with a finalised paper, with every step taken through the REAL kernel and no language model anywhere. A face can
// be green twelve times and the LIFETIME still be broken, because a lifetime defect lives in the HANDOVER: the id one
// step mints and the next step consumes, the receipt that says "meeting is open" and the prompt the chair then reads,
// the archive row the paper is supposed to carry back. This scenario walks that handover 12 phases deep and keeps the
// evidence: every receipt, the prompt each turn would read, the workspace tree, and a REPORT that says, per step, what
// moved and which id the next step cited.
//
// WHY IT IS FREE: no `deliver` seam is supplied, so no `subagent` is ever started; no host is contacted; nothing reads
// `process.env`. Every "member" is a scripted call with the SAME caller identity a member session has (`as:{agent:{id}}`),
// so `memberActed`/`callerIsSeat`/`ranInOwnTurn` are exercised exactly as live ones. The only seam replaced is the
// language model, and it is replaced by ABSENCE, not by a stub that pretends to answer.
//
// THE THREE RULES THIS SCENARIO KEEPS (they are what the gate next to it checks):
//   1. ID PROVENANCE — an id a step passes in may only be one an EARLIER RECEIPT already carried. Seat ids (r-*) come
//      from the founding/hiring receipts; every produced id (m1, mo1, rec-N, paper-p1, consult-...) must be visible in
//      the immediately preceding receipt. Without this rule a scenario silently hard-codes "m1" and stops being a test
//      of the handover (the exact failure mode the audit calls a fabricated id).
//   2. PROMPT/RECEIPT PAIRS — after most steps the prompt that seat would read is assembled from the live ledger, and
//      the ids of the step's own receipt that the text actually SHOWS are recorded. A prompt that does not reflect what
//      just happened is a broken channel, and a corpus of prompts with no receipt next to it cannot show that.
//   3. NAMED ABSENCE — a PDF cannot be compiled in an assembly with no LaTeX face. That is an ENVIRONMENT fact, and it
//      is asserted BY NAME (`pdfEnvironmentMissing`, `toolchainAbsent:["latex"]`) instead of being skipped.
//
// The clock is a seam here too: the meeting is scheduled at +60 s and its opening is observed by moving the injected
// clock (not by sleeping), so the same corpus reproduces.

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpRoot as gateTmpRoot } from '../../lib/tmp-root.mjs'

const NL = String.fromCharCode(10)
const CLOCK_START = 1_800_000_000_000

/** The 12 phases the gate requires at least one real receipt for. Order is the lifetime order. */
export const PHASES = Object.freeze([
  { key: 'founding', label: '立所（start + hire）' },
  { key: 'proposition', label: '命题卡（record_proposition）' },
  { key: 'blueprint', label: '蓝图草案（成员 fs 写 md → propose → codesign → adopt → read）' },
  { key: 'meeting-schedule', label: '预约会议（meeting schedule）' },
  { key: 'meeting-attend', label: '成员签到（attend）' },
  { key: 'meeting-open', label: '人齐开门（固定时钟推进 + status）' },
  { key: 'meeting-deliberate', label: '会中发言与表决（say / motion / second / vote）' },
  { key: 'meeting-ruling', label: '会中裁决与闭会（verdict / verdict_final / close）' },
  { key: 'records', label: '归档记录（progress / 方法库 / 图书馆）' },
  { key: 'paper-draft', label: '论文草稿（start / part / advance / review）' },
  { key: 'paper-finalize', label: '论文定稿（office consult 支路 + final）' },
  { key: 'closure', label: '结题产物（render / status / 台账）' },
])

/** Mutable clock the kernel reads (harness contract: NUMBER milliseconds). Exported so run.mjs injects it into boot(). */
export const clockState = { now: CLOCK_START }
export const clock = () => clockState.now

/** The corpus directory this scenario wants by default (`--out` still wins). */
export const corpusDir = join(gateTmpRoot(), 'sim', 'e2e') // the corpus default lives under the ONE temporary root; --out still wins, and an unwritable dir FAILS the run instead of silently writing elsewhere

/** Refusals this scenario PREDICTS (evidence, not defects). The E4 office gate is supposed to refuse the first final. */
export const DECLARED_REFUSALS = Object.freeze([
  { tool: 'vibe_v5_paper', code: 'VMU_OFFICE_CONSULT_REQUIRED', why: 'E4: the office must answer before finalisation' },
])

// ── id vocabulary ────────────────────────────────────────────────────────────────────────────────────────────────
// One id is one TOKEN the ledger mints. The tokenizer is deliberately dumb (split on anything that is not a letter,
// digit, underscore, hyphen or CJK) so it can be applied to receipts, prompt text and arguments alike; a per-tool
// parser would let each tool's own shape decide what counts as "an id", which is how a hard-coded id hides.
const TOKEN_RE = /[A-Za-z0-9_\u4e00-\u9fff-]+/g
const SEAT_RE = /^r-[a-z0-9]+$/
const ID_RES = [/^m\d+$/, /^mo\d+$/, /^rec-\d+$/, /^paper-p\d+$/, /^t-\d+$/, /^ag-\d+$/, /^consult-.+-\d+$/]
const isSeat = (token) => SEAT_RE.test(token)
const isProduced = (token) => ID_RES.some((re) => re.test(token))

function idsIn(value, out = new Set()) {
  if (value === null || value === undefined) return out
  if (typeof value === 'string') {
    const tokens = value.match(TOKEN_RE) || []
    for (const token of tokens) if (isSeat(token) || isProduced(token)) out.add(token)
    return out
  }
  if (Array.isArray(value)) {
    for (const item of value) idsIn(item, out)
    return out
  }
  if (typeof value === 'object') {
    for (const key of Object.keys(value)) idsIn(value[key], out)
    return out
  }
  return out
}

const sha256 = (buf) => 'sha256:' + createHash('sha256').update(buf).digest('hex')
const pad2 = (n) => (n < 10 ? '0' : '') + String(n)
const trim = (text, max) => {
  const s = String(text === null || text === undefined ? '' : text)
  const cap = max || 160
  return s.length > cap ? s.slice(0, cap) + '…' : s
}
const jsonShort = (value, max) => trim(JSON.stringify(value === undefined ? null : value), max)

/** The scenario. Returns the corpus shapes run.mjs writes; it never writes to the corpus itself. */
export async function scenario(h, context = {}) {
  const log = typeof context.log === 'function' ? context.log : () => {}
  const root = h.root
  const workspace = join(root, 'VibeMath')
  const receipts = h.receipts

  const steps = []
  const promptFiles = []
  const promptChecks = []
  const problems = []
  const findings = []
  const seatPool = new Set()
  const highlights = {}

  // ── the sanitizer: a prompt is evidence a HUMAN reads, so it must not leak the throwaway workspace path ──────────
  const sanitize = (text) => String(text).split(root).join('<workspace>').replace(/[A-Za-z]:[\\/][^\s"'<>|]*/g, '<path>')

  // ── one tool step ───────────────────────────────────────────────────────────────────────────────────────────────
  const doCall = async (spec) => {
    const before = h.tree().length
    const seqFrom = receipts.length + 1
    const args = spec.args || {}
    const asId = spec.as || null
    const mints = Array.isArray(spec.mints) ? spec.mints : []
    // RULE 1 (a): the ids this call passes in must be traceable BEFORE the call runs.
    const uses = [...idsIn(args)].filter((id) => !mints.includes(id)).sort()
    const prevReceipt = seqFrom > 1 ? receipts[seqFrom - 2].receipt : null
    const prevJson = JSON.stringify(prevReceipt === null || prevReceipt === undefined ? null : prevReceipt)
    const violations = []
    for (const id of uses) {
      if (isSeat(id)) {
        if (!seatPool.has(id)) violations.push({ id, why: 'seat id not carried by an earlier receipt (founding/hiring)' })
      } else if (prevJson.indexOf(id) === -1) {
        violations.push({ id, why: 'produced id absent from receipt #' + (seqFrom - 1) })
      }
    }
    if (mints.length > 0) for (const id of mints) seatPool.add(id)
    const receipt = await h.call(spec.tool, args, asId === null ? undefined : { as: { agent: { id: asId } } })
    const seqTo = receipts.length
    for (const id of idsIn(receipt)) if (isSeat(id)) seatPool.add(id)
    const code = receipt && receipt.code ? String(receipt.code) : null
    const environmental = code === 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING' || code === 'VMU_ENGINE_UNAVAILABLE'
    const expected = !receipt.ok && Array.isArray(spec.expect) && spec.expect.includes(code)
    const verdict = receipt.ok ? 'PASS' : environmental ? 'ENV-REFUSED' : expected ? 'EXPECTED-REFUSAL' : 'UNEXPECTED-REFUSAL'
    const produced = [...idsIn(receipt)].filter((id) => isProduced(id)).sort()
    const detail = (spec.keys || []).map((key) => {
      const value = receipt[key]
      if (value === undefined || value === null || value === '') return null
      return key + '=' + (typeof value === 'object' ? jsonShort(value, 120) : trim(value, 90))
    }).filter(Boolean).join(' · ')
    const step = {
      n: steps.length + 1,
      name: spec.phase + '/' + spec.label,
      phase: spec.phase,
      label: spec.label,
      kind: 'tool',
      tool: spec.tool,
      as: asId || 'office',
      args,
      expect: spec.expect || [],
      ok: receipt.ok === true,
      code,
      verdict,
      receiptSeq: [seqFrom, seqTo],
      uses,
      mints,
      produced,
      idCheck: { ok: violations.length === 0, checked: uses.length, violations },
      files: { before, after: h.tree().length },
      detail: detail || (spec.extra || ''),
      note: spec.note || '',
    }
    if (violations.length > 0) problems.push({ step: step.n, name: step.name, kind: 'id-provenance', violations })
    if (verdict === 'UNEXPECTED-REFUSAL') problems.push({ step: step.n, name: step.name, kind: 'unexpected-refusal', code, message: trim(receipt.message || receipt.hint || '', 300) })
    steps.push(step)
    log(step.name + ' -> ' + verdict + (code ? ' ' + code : ''))
    return { receipt, step }
  }

  // ── one non-tool step (member fs write / clock advance) ────────────────────────────────────────────────────────
  const doAct = async (spec) => {
    const before = h.tree().length
    const result = await spec.act()
    const uses = [...idsIn(spec.args || {})].sort()
    const violations = uses.filter((id) => (isSeat(id) ? !seatPool.has(id) : true))
    const step = {
      n: steps.length + 1,
      name: spec.phase + '/' + spec.label,
      phase: spec.phase,
      label: spec.label,
      kind: spec.kind || 'act',
      tool: null,
      as: spec.as || 'member',
      args: spec.args || {},
      ok: result && result.ok === true,
      code: result && result.code ? String(result.code) : null,
      verdict: result && result.ok === true ? 'PASS' : 'FAILED',
      receiptSeq: [receipts.length + 1, receipts.length],
      uses,
      mints: spec.mints || [],
      produced: [],
      idCheck: { ok: violations.length === 0, checked: uses.length, violations },
      files: { before, after: h.tree().length },
      detail: spec.detail ? spec.detail(result) : (result && result.detail ? String(result.detail) : ''),
      note: spec.note || '',
    }
    if (!step.ok) problems.push({ step: step.n, name: step.name, kind: 'action-failed', detail: step.detail })
    steps.push(step)
    log(step.name + ' -> ' + step.verdict + ' ' + trim(step.detail, 90))
    return { result, step }
  }

  // The phrases a seat prompt may quote from the ledger: they are matched against the SAME previous receipt the ids
  // are matched against, so a prompt line only counts as "paired" when the receipt proves the fact exists.
  const FACT_PHRASES = [
    '端到端命题',
    '端到端提案确认',
    '端到端会议',
    '端到端占位论文',
    '确认命题与蓝图',
  ]

  // ── RULE 2: assemble the prompt a seat would read, and record which of the previous receipt's ids it SHOWS ─────
  const capture = async (spec) => {
    const prevReceipt = receipts.length > 0 ? receipts[receipts.length - 1].receipt : null
    const prevSeq = receipts.length > 0 ? receipts[receipts.length - 1].seq : null
    let text = ''
    let error = null
    try {
      text = await h.prompts.assembleFor({
        seat: spec.seat,
        phase: spec.phase || 'normal',
        round: spec.round || 1,
        member: spec.member || null,
        meeting: spec.meeting || null,
      })
    } catch (e) {
      error = String((e && e.message) || e)
    }
    const clean = sanitize(text)
    const prevJson = JSON.stringify(prevReceipt === null ? null : prevReceipt)
    const facts = []
    for (const id of [...idsIn(clean)].sort()) if (prevJson.indexOf(id) !== -1) facts.push(id)
    for (const phrase of FACT_PHRASES) if (prevJson.indexOf(phrase) !== -1 && clean.indexOf(phrase) !== -1) facts.push(phrase)
    const producedFacts = facts.filter((fact) => isProduced(fact))
    const seq = promptFiles.length + 1
    const name = pad2(seq) + '-' + String(spec.seat || 'seat') + '.txt'
    const check = {
      seq,
      name,
      seat: spec.seat || 'chair',
      phase: spec.phase || 'normal',
      round: spec.round || 1,
      meeting: spec.meeting || null,
      afterStep: steps.length > 0 ? steps[steps.length - 1].n : null,
      pairReceiptSeq: prevSeq,
      chars: clean.length,
      facts,
      producedFacts,
      mailVisible: clean.indexOf('新到的消息') !== -1,
      statusVisible: clean.indexOf('状态') !== -1 || clean.indexOf('STATUS') !== -1,
      error,
      label: spec.label || '',
    }
    // The corpus writer in run.mjs strips `text` into the file and keeps the rest as the pairing manifest — so the
    // manifest and the bytes on disk are produced from ONE object and cannot drift.
    promptFiles.push(Object.assign({ text: clean }, check))
    if (error) problems.push({ step: steps.length, kind: 'prompt-assembly-failed', error })
    if (facts.length === 0) problems.push({ step: steps.length, kind: 'prompt-unpaired', name, seat: check.seat, chars: clean.length })
    promptChecks.push(check)
    log('prompt ' + name + ' ' + clean.length + ' chars, facts=' + (facts.join(',') || '(none)'))
    return check
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // PHASE 1/12 — founding: an empty institute is started and a temporary seat is hired.
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const started = await doCall({
    phase: 'founding',
    label: '立所：院士席 + 2 名常驻研究员',
    tool: 'vibe_v5_start',
    args: { problem: '端到端：从立所到论文结题的一次完整生命周期', researcherCount: 2 },
    keys: ['hired', 'hiredNow', 'rosterBefore'],
    note: 'the founding receipt is the ONLY source of seat ids for everything downstream',
  })
  for (const id of idsIn(started.receipt)) if (isSeat(id)) seatPool.add(id)
  const roster = Array.isArray(started.receipt.hired) ? started.receipt.hired.slice() : []
  if (roster.length === 0) problems.push({ phase: 'founding', kind: 'no-roster' })

  const hired = await doCall({
    phase: 'founding',
    label: '雇一名临时工：把蓝图草案写成 md 文件',
    tool: 'vibe_v5_hire',
    args: {
      to: 'r-t1',
      purpose: '把蓝图草案写成成员自己的 md 文件',
      initial_task: '在成员工作区写 Drafts/protocol-r1.md',
      slot: 'temp',
    },
    mints: ['r-t1'],
    keys: ['member', 'slot', 'task'],
  })
  // `hire` MINTS the seat id (the caller names it), so it is the one place in this lifetime where an id is invented
  // rather than read back — declared in `mints` so the gate can tell a declared mint from a fabricated citation.
  const tempSeat = hired.receipt.member || 'r-t1'
  await capture({ seat: 'chair', phase: 'normal', label: '立所后的院士席回合' })
  // The temp seat is captured HERE, while the hire receipt is still the previous one: its prompt has to show the seat
  // and the task id the hire minted, otherwise the pairing is decorative.
  await capture({ seat: 'temp', member: tempSeat, phase: 'normal', label: '临时工收到任务后的回合（不在 electorate 内）' })

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // PHASE 2/12 — the proposition card.
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const proposition = await doCall({
    phase: 'proposition',
    label: '常驻研究员登记命题卡',
    tool: 'vibe_v5_record_proposition',
    as: roster[1] || 'r-1',
    args: {
      statement: '端到端命题：一次所内生命周期可以被零 token 完整复现',
      value: '会议裁决 + 论文结题',
      motive: '昂贵验证必须先在没有模型的情况下被审计',
      p: 0.7,
      member: roster[1] || 'r-1',
    },
    keys: ['track', 'recordId', 'writer', 'by', 'value', 'p'],
  })
  const propositionId = proposition.receipt.recordId

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // PHASE 3/12 — the blueprint: a MEMBER writes the draft md with its own file tool, then propose → codesign → adopt.
  // The md path resolves under `<workspace>/VibeMath/`, which is exactly what the refusal hint says when it is wrong.
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const draftRel = 'Members/' + (roster[1] || 'r-1') + '/Drafts/protocol-r1.md'
  const draftBody = [
    '# 端到端研究协议',
    '',
    '## 一、问题',
    '把一次完整的所内生命周期写进论文：立所、雇人、命题、蓝图、会议、记录、论文。',
    '',
    '## 二、方法',
    '真内核同进程驱动，零 token；每一步的回执与下一回合的提示词成对留档。',
    '',
    '## 三、会议议程',
    '确认端到端命题与蓝图，并决定把方法写进论文。',
    '',
  ].join(NL)
  const draft = await doAct({
    phase: 'blueprint',
    label: '成员 fs 工具写蓝图草案 md',
    kind: 'member-fs',
    args: { path: draftRel },
    act: async () => {
      mkdirSync(join(workspace, 'Members', roster[1] || 'r-1', 'Drafts'), { recursive: true })
      writeFileSync(join(workspace, draftRel), draftBody)
      const bytes = statSync(join(workspace, draftRel)).size
      return { ok: bytes === Buffer.byteLength(draftBody), detail: draftRel + ' ' + bytes + ' B ' + sha256(Buffer.from(draftBody)).slice(0, 26) }
    },
    note: 'no fs tool is registered in-process: the scenario plays the member own file tool, which is what the host provides',
  })

  const proposed = await doCall({
    phase: 'blueprint',
    label: '常驻研究员提交蓝图草案（mdPath 指向成员文件）',
    tool: 'vibe_v5_blueprint',
    as: roster[1] || 'r-1',
    args: { action: 'propose', path: 'Shared/Protocol.md', member: roster[1] || 'r-1', mdPath: draftRel },
    keys: ['action', 'id', 'path', 'status', 'revision', 'mdPath', 'mdWritten'],
  })
  const draftId = proposed.receipt.id

  // 蓝图草案的「共同设计」也是 fs-first：RUN 255 起，不带 mdPath 的 propose 只返回 draftMdMissing:true，
  // 既不改行也不留 authors —— 于是 adopt 会拒 VMU_PACK_V5R_BLUEPRINT_NEEDS_CODESIGN（缺院士席留痕）。
  // 所以院士席要像真成员那样：读同一份草案文件，把自己的 section 写回去，再带同一个 mdPath 重新 propose。
  const chairSection = '## 共同设计：院士席的追加意见' + NL + '会议必须留下裁决记录，论文必须带回证据指针。' + NL
  const composedDraft = draftBody + NL + chairSection
  await doAct({
    phase: 'blueprint',
    label: '院士席 fs 工具把共同设计写回同一份草案 md',
    kind: 'member-fs',
    args: { path: draftRel },
    act: async () => {
      writeFileSync(join(workspace, draftRel), composedDraft)
      const bytes = statSync(join(workspace, draftRel)).size
      return { ok: bytes === Buffer.byteLength(composedDraft), detail: draftRel + ' ' + bytes + ' B（含院士席 section）' }
    },
    note: 'a continuation writes the draft own md: the chair appends its section to the same file, then re-proposes with that mdPath',
  })

  const chairSeat = roster[0] || 'r-acad'
  const chairAuthored = (receipt) => Array.isArray(receipt && receipt.authors) && receipt.authors.some((a) => a && a.member === chairSeat)
  const codesignArgs = {
    action: 'propose',
    path: 'Shared/Protocol.md',
    member: chairSeat,
    draft: draftId,
    mdPath: draftRel,
    text: chairSection,
  }
  let codesigned = await doCall({
    phase: 'blueprint',
    label: '院士席共同设计（fs-first：带 mdPath 续写草案）',
    tool: 'vibe_v5_blueprint',
    as: chairSeat,
    args: codesignArgs,
    keys: ['action', 'id', 'revision', 'authors', 'filed', 'draftMdMissing'],
  })
  // 两条契约都认：RUN 255 的 fs-first（带 mdPath，文件即正文）与更早的「draft+text 即留痕」。
  // 只用回执自己的读数决定是否退第二条路，不猜版本：filed:false 或 authors 里没有院士席 ⇒ 换 text-only 重试一次。
  let codesignPath = 'mdPath'
  if (!codesigned.receipt.ok || codesigned.receipt.filed === false || !chairAuthored(codesigned.receipt)) {
    codesignPath = 'text-only'
    codesigned = await doCall({
      phase: 'blueprint',
      label: '院士席共同设计（旧契约回退：draft+text 即留痕）',
      tool: 'vibe_v5_blueprint',
      as: chairSeat,
      args: { action: 'propose', path: 'Shared/Protocol.md', member: chairSeat, draft: draftId, text: chairSection },
      keys: ['action', 'id', 'revision', 'authors', 'filed', 'draftMdMissing'],
    })
  }
  if (!chairAuthored(codesigned.receipt)) {
    problems.push({ step: codesigned.step.n, kind: 'codesign-missing-chair', receiptKeys: Object.keys(codesigned.receipt || {}), authors: codesigned.receipt && codesigned.receipt.authors })
  }

  const adopted = await doCall({
    phase: 'blueprint',
    label: '院士席采纳蓝图（adopt 才写 Shared/Protocol.md）',
    tool: 'vibe_v5_blueprint',
    as: roster[0] || 'r-acad',
    args: { action: 'adopt', path: 'Shared/Protocol.md', member: roster[0] || 'r-acad', draft: draftId },
    keys: ['action', 'id', 'path', 'pathFrom', 'status', 'revision', 'adoptedBy', 'proposalId'],
    extra: '',
  })
  const blueprintId = adopted.receipt.id
  const md = adopted.receipt.md || null
  const mdAbs = md && md.absPath ? String(md.absPath) : null
  let mdBytes = 0
  let mdMatches = false
  if (mdAbs) {
    try {
      const disk = readFileSync(mdAbs)
      mdBytes = disk.length
      mdMatches = sha256(disk) === md.mdFingerprint
    } catch (e) {
      problems.push({ step: adopted.step.n, kind: 'blueprint-md-missing', path: mdAbs, error: String((e && e.message) || e) })
    }
  }
  adopted.step.detail = trim(adopted.step.detail + ' · md.absPath=' + (mdAbs ? '<path>' : '(none)') + ' · mdFingerprint=' + (md && md.mdFingerprint ? String(md.mdFingerprint).slice(0, 22) + '…' : '(none)') + ' · disk=' + mdBytes + ' B · sha-match=' + String(mdMatches), 320)
  if (!mdMatches) problems.push({ step: adopted.step.n, kind: 'blueprint-md-fingerprint-mismatch', mdAbs, mdFingerprint: md && md.mdFingerprint })
  highlights.blueprint = { draftId, blueprintId, mdPath: md && md.path ? String(md.path) : null, mdBytes, mdMatches, codesignPath, codesignAuthors: Array.isArray(codesigned.receipt.authors) ? codesigned.receipt.authors.map((a) => a && a.member) : null }

  const blueprintRead = await doCall({
    phase: 'blueprint',
    label: '读回当前蓝图（status/revision）',
    tool: 'vibe_v5_blueprint',
    args: { action: 'read', id: blueprintId },
    keys: ['action', 'id', 'status', 'revision', 'path'],
  })
  await capture({ seat: 'chair', phase: 'normal', label: '蓝图采纳后的院士席回合' })

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // PHASE 4/12 — schedule the meeting. `at` is a fixed instant on the INJECTED clock (+60 s) and the agenda names the
  // proposition record, so the schedule receipt itself carries both the meeting id and the proposition id for later.
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // The ledger read is a BRIDGE, not decoration: the agenda below names the proposition id, and this corpus refuses
  // a call whose ids are not on the receipt immediately before it. A read takes no ids and returns every one, so the
  // chair can be shown to have LOOKED UP the number it is about to put on the agenda.
  await doCall({
    phase: 'meeting-schedule',
    label: '院士席读全台账：拿到要写进议程的命题卡编号',
    tool: 'vibe_vmu_records',
    args: { action: 'list', limit: 0 },
    keys: ['action', 'total', 'returned', 'records'],
  })
  const scheduledAt = new Date(clockState.now + 60_000).toISOString()
  const scheduled = await doCall({
    phase: 'meeting-schedule',
    label: '院士席预约会议（at = 注入时钟 +60s）',
    tool: 'vibe_v5_meeting',
    as: roster[0] || 'r-acad',
    args: { agenda: '确认提案 ' + propositionId + ' 与蓝图', title: '端到端会议', at: scheduledAt, member: roster[0] || 'r-acad' },
    keys: ['meeting', 'type', 'title', 'state', 'scheduledFor', 'startsInMs', 'requiresChairProceed', 'formalAgenda'],
  })
  const meetingId = scheduled.receipt.meeting
  await capture({ seat: 'member', member: roster[1] || 'r-1', phase: 'normal', label: '成员收到会议预约邮件后的回合' })

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // PHASE 5/12 — attendance. The chair is seated by convening itself; the temp seat is NOT on the electorate (a real
  // boundary the arrival receipt names), so only the two residents check in.
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  for (const seat of [roster[1] || 'r-1', roster[2] || 'r-2']) {
    await doCall({
      phase: 'meeting-attend',
      label: '成员签到：' + seat,
      tool: 'vibe_vmu_meeting',
      as: seat,
      args: { action: 'attend', id: meetingId, member: seat },
      keys: ['action', 'id', 'late', 'started', 'arrival', 'requiresChairProceed'],
    })
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // PHASE 6/12 — open the door. The scheduler does NOT open on its own: time is moved and the kernel's lazy settle runs
  // on the next touch, then the status read is the receipt that says the floor is open (state:open, quorum met).
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  await doAct({
    phase: 'meeting-open',
    label: '固定时钟推进 +61s，内核惰性结算开门',
    kind: 'clock',
    args: {},
    act: async () => {
      clockState.now += 61_000
      const swept = h.kernel.meetings.sweepDue({ at: clockState.now })
      const moved = Array.isArray(swept.transitions) ? swept.transitions.filter((t) => t.meeting === meetingId) : []
      const opened = moved.some((t) => t.from === 'scheduled' && t.to === 'open')
      return {
        ok: swept.swept >= 1 && opened,
        detail: 'clock=' + clockState.now + ' swept=' + swept.swept + ' transitions=' + jsonShort(moved, 140),
        code: opened ? null : 'MEETING_DID_NOT_OPEN',
      }
    },
    note: 'no sleep: the injected clock moves, the kernel settles lazily, and the transition is the evidence',
  })
  const openStatus = await doCall({
    phase: 'meeting-open',
    label: '读会议状态：已开门（quorum 达标）',
    tool: 'vibe_vmu_meeting',
    args: { action: 'status', id: meetingId },
    keys: ['action', 'state', 'started', 'quorum', 'requiresChairProceed', 'speeches'],
  })
  const quorum = openStatus.receipt.quorum || {}
  if (openStatus.receipt.state !== 'open') problems.push({ step: openStatus.step.n, kind: 'meeting-not-open', state: openStatus.receipt.state })
  if (quorum.met !== true) problems.push({ step: openStatus.step.n, kind: 'quorum-not-met', quorum })
  highlights.meeting = { meetingId, state: openStatus.receipt.state, quorumMet: quorum.met === true, scheduledFor: scheduled.receipt.scheduledFor }
  await capture({ seat: 'member', member: roster[1] || 'r-1', phase: 'meeting', meeting: meetingId, label: '开门后成员的会议回合' })

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // PHASE 7/12 — deliberation: two speeches, a resolution from the chair (only the chair may move one), a second, and
  // the closure votes. `vibe_v5_say` refuses a `round` next to a `meeting`; the tool face says so by name.
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  await doCall({
    phase: 'meeting-deliberate',
    label: '常驻研究员发言',
    tool: 'vibe_v5_say',
    as: roster[1] || 'r-1',
    args: { meeting: meetingId, member: roster[1] || 'r-1', text: '主席，命题卡与蓝图已经就位：建议会议确认命题，并把方法写进论文。' },
    keys: ['via', 'meeting', 'member', 'receipt'],
  })
  await doCall({
    phase: 'meeting-deliberate',
    label: '第二名常驻研究员附议',
    tool: 'vibe_v5_say',
    as: roster[2] || 'r-2',
    args: { meeting: meetingId, member: roster[2] || 'r-2', text: '附议。论文的两节由我与研究员分写，证据指针指向命题记录。' },
    keys: ['via', 'meeting', 'member', 'receipt'],
  })
  const motion = await doCall({
    phase: 'meeting-deliberate',
    label: '院士席提出决议（只有主席能提 resolution）',
    tool: 'vibe_v5_motion',
    as: roster[0] || 'r-acad',
    args: { meeting: meetingId, member: roster[0] || 'r-acad', kind: 'resolution', text: '批准把方法写进论文，并由院士席结题。' },
    keys: ['motion', 'meeting', 'kind', 'status', 'motionQualified', 'note'],
  })
  const motionId = motion.receipt.motion
  await doCall({
    phase: 'meeting-deliberate',
    label: '常驻研究员附议动议',
    tool: 'vibe_v5_second',
    as: roster[1] || 'r-1',
    args: { meeting: meetingId, motion_id: motionId, member: roster[1] || 'r-1' },
    keys: ['motion', 'meeting', 'status', 'secondedBy'],
  })
  for (const [seat, solved, why] of [[roster[0] || 'r-acad', true, '会议 m1 上命题与蓝图已就位，可以结题。'], [roster[1] || 'r-1', true, '会议 m1 上证明链完整。'], [roster[2] || 'r-2', false, '会议 m1 上保留意见：局限一节还要写清楚。']]) {
    await doCall({
      phase: 'meeting-deliberate',
      label: '闭幕票：' + seat + '（solved=' + String(solved) + '）',
      tool: 'vibe_vmu_vote',
      as: seat,
      args: { member: seat, solved, why },
      keys: ['member', 'solved', 'persistedToFold', 'foldKey'],
    })
  }
  await capture({ seat: 'chair', phase: 'meeting', meeting: meetingId, label: '表决后的主席会议回合' })

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // PHASE 8/12 — ruling: the chair re-reads the floor, asks the members for their final rulings (which mails them),
  // each member submits one, the chair finalises it, and the meeting is closed BY THE CHAIR NAMING ITSELF (actor).
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  await doCall({
    phase: 'meeting-ruling',
    label: '院士席会前再读一次会场（裁决前核对议程）',
    tool: 'vibe_vmu_meeting',
    args: { action: 'status', id: meetingId },
    keys: ['action', 'state', 'quorum', 'speeches', 'agenda'],
  })
  const ask = await doCall({
    phase: 'meeting-ruling',
    label: '院士席征集最终裁决（会向成员投递邮件）',
    tool: 'vibe_v5_verdict_ask',
    as: roster[0] || 'r-acad',
    args: { meeting: meetingId, proposition_id: propositionId },
    keys: ['meeting', 'chair', 'proposition', 'propositionKind', 'asked', 'askedSource', 'deliveredCount', 'meetingState'],
  })
  await capture({ seat: 'member', member: roster[2] || 'r-2', phase: 'normal', label: '成员收到裁决征集邮件后的回合' })

  for (const [seat, value, reason] of [[roster[1] || 'r-1', 0.9, '蓝图与会议议程一致。'], [roster[2] || 'r-2', 0.8, '论证可复现，局限已写明。']]) {
    await doCall({
      phase: 'meeting-ruling',
      label: '成员提交裁决：' + seat + '（verdict=' + String(value) + '）',
      tool: 'vibe_v5_verdict',
      as: seat,
      args: { meeting: meetingId, proposition_id: propositionId, member: seat, verdict: value, reason },
      keys: ['channel', 'submission', 'rosterChecked', 'readBack'],
    })
  }
  const ruling = await doCall({
    phase: 'meeting-ruling',
    label: '院士席汇总最终裁决',
    tool: 'vibe_v5_verdict_final',
    as: roster[0] || 'r-acad',
    args: { meeting: meetingId, proposition_id: propositionId },
    keys: ['meeting', 'chair', 'proposition', 'value', 'decided', 'p1RulingReading', 'notified'],
  })
  await capture({ seat: 'member', member: roster[1] || 'r-1', phase: 'normal', label: '收到最终裁决邮件后的成员回合' })
  await doCall({
    phase: 'meeting-ruling',
    label: '院士席闭会（必须自报 actor）',
    tool: 'vibe_vmu_meeting',
    as: roster[0] || 'r-acad',
    args: { action: 'close', id: meetingId, actor: roster[0] || 'r-acad' },
    keys: ['action', 'id', 'closedBy', 'state', 'closeSemantics', 'turns', 'speeches', 'archived', 'closureVote'],
  })
  // `decided` on the final-ruling receipt is NOT a success flag (it stayed false while the ruling was written), so the
  // highlight records what the receipt actually PROVES: the numeric value and who was asked.
  highlights.ruling = { value: ruling.receipt.value, propositionKind: ask.receipt.propositionKind, asked: ask.receipt.asked, sources: ruling.receipt.p1RulingReading && ruling.receipt.p1RulingReading.sources }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // PHASE 9/12 — archive: a progress record, a method record, the library read, and the ledger list. The list is what
  // makes the record ids visible to the next receipt (and, later, to the paper evidence pointers).
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const progress = await doCall({
    phase: 'records',
    label: '记录进度（会议已裁决）',
    tool: 'vibe_v5_record_progress',
    as: roster[1] || 'r-1',
    args: {
      content: '会议已裁决：命题确认，方法写进论文。',
      track: 'progress',
      member: roster[1] || 'r-1',
      progress: '命题、蓝图、会议、裁决都留下了回执。',
      obstacles: '没有 LaTeX 引擎，PDF 只能具名缺省。',
      next: '把两节写进论文并交叉评审。',
      help: '需要院士席结题。',
    },
    keys: ['track', 'recordId', 'owner', 'writer', 'progress'],
  })
  const method = await doCall({
    phase: 'records',
    label: '记录方法（零 token 复现法）',
    tool: 'vibe_v5_record_method',
    as: roster[2] || 'r-2',
    args: {
      content: '真内核同进程 + 注入时钟 + 回执与提示词成对留档，可以在零 token 下复现一次完整生命周期。',
      value: '把一次完整生命周期变成可重跑的证据，而不是一段叙述。',
      motive: '每一次昂贵验证都要先在零 token 的模拟里被审计。',
      p: 0.6,
      member: roster[2] || 'r-2',
      title: '零 token 端到端复现法',
    },
    keys: ['track', 'recordId', 'kind', 'title'],
  })
  const library = await doCall({
    phase: 'records',
    label: '读方法库（图书馆归档读面）',
    tool: 'vibe_v5_read_library',
    as: roster[2] || 'r-2',
    args: { member: roster[2] || 'r-2', list: true },
    keys: ['total', 'returned', 'kindsPresent', 'libraryCardCount'],
  })
  const ledger = await doCall({
    phase: 'records',
    label: '读全台账（records list，id 集合的公开读面）',
    tool: 'vibe_vmu_records',
    args: { action: 'list', limit: 0 },
    keys: ['action', 'total', 'returned', 'truncated', 'rowsFrom'],
  })
  await capture({ seat: 'chair', phase: 'normal', label: '归档后的院士席回合' })
  highlights.records = {
    progressId: progress.receipt.recordId,
    methodId: method.receipt.recordId,
    libraryKinds: library.receipt.kindsPresent,
    ledgerTotal: ledger.receipt.total,
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // PHASE 10/12 — the paper: start (no id needed), two parts written by two members with the proposition record as the
  // evidence pointer, advance, cross reviews, advance again. The bridge list between start and the first part is what
  // puts `rec-1` back on the immediately preceding receipt, so the evidence pointer is a real citation, not a literal.
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const paperTitle = '端到端占位论文'
  const paperStarted = await doCall({
    phase: 'paper-draft',
    label: '论文 start（只给标题，id 由内核铸造）',
    tool: 'vibe_v5_paper',
    args: { action: 'start', title: paperTitle, participants: [roster[1] || 'r-1', roster[2] || 'r-2'] },
    keys: ['action', 'started'],
  })
  const paperId = paperStarted.receipt.started && paperStarted.receipt.started.id ? paperStarted.receipt.started.id : null
  const stateRecord = paperStarted.receipt.started && paperStarted.receipt.started.stateRecord ? paperStarted.receipt.started.stateRecord : null
  const bridge = await doCall({
    phase: 'paper-draft',
    label: '读台账桥（把命题记录 id 带回紧邻回执）',
    tool: 'vibe_vmu_records',
    args: { action: 'list', limit: 0 },
    keys: ['action', 'total', 'returned'],
  })
  const bridgeHasEvidence = JSON.stringify(bridge.receipt).indexOf(propositionId) !== -1
  if (!bridgeHasEvidence) problems.push({ step: bridge.step.n, kind: 'bridge-missing-evidence-id', id: propositionId })
  bridge.step.detail = trim(bridge.step.detail + ' · carries ' + propositionId + '=' + String(bridgeHasEvidence), 200)

  const bodyTheorem = [
    '## 定理',
    '一次所内生命周期可以被零 token 完整复现：会议裁决固定方法，论文带回证据指针（依据记录 ' + propositionId + '）。',
    '',
    '## 证明',
    '由会议裁决记录与蓝图采纳记录可直接读出该结论，两者都在台账里可解析。',
  ].join(NL)
  const bodyProof = [
    '## 证明',
    '在注入时钟下推进会议结算，回执与提示词成对落盘（依据记录 ' + propositionId + '）。',
    '',
    '## 讨论',
    '没有 LaTeX 引擎属于环境缺省，按名记录，不阻断结题。',
  ].join(NL)
  await doCall({
    phase: 'paper-draft',
    label: '研究员写定理一节（evidence=' + propositionId + '）',
    tool: 'vibe_v5_paper',
    as: roster[1] || 'r-1',
    args: { action: 'part', target: paperTitle, member: roster[1] || 'r-1', part: 'theorem', body: bodyTheorem, evidence: [propositionId] },
    keys: ['action', 'part', 'requiredLines', 'evidence', 'evidenceGate'],
  })
  await doCall({
    phase: 'paper-draft',
    label: '第二名研究员写证明一节',
    tool: 'vibe_v5_paper',
    as: roster[2] || 'r-2',
    args: { action: 'part', target: paperTitle, member: roster[2] || 'r-2', part: 'proof', body: bodyProof, evidence: [propositionId] },
    keys: ['action', 'part', 'requiredLines', 'evidence', 'evidenceGate'],
  })
  const advance1 = await doCall({
    phase: 'paper-draft',
    label: '院士席推进：writing → reviewing',
    tool: 'vibe_v5_paper',
    as: roster[0] || 'r-acad',
    args: { action: 'advance', target: paperTitle, member: roster[0] || 'r-acad' },
    keys: ['action', 'advance'],
  })
  await doCall({
    phase: 'paper-draft',
    label: '研究员交叉评审（对方一节，deliverable）',
    tool: 'vibe_v5_paper',
    as: roster[1] || 'r-1',
    args: { action: 'review', target: paperTitle, member: roster[1] || 'r-1', of: roster[2] || 'r-2', deliverable: true, notes: '证明一节可复现。' },
    keys: ['action', 'review'],
  })
  await doCall({
    phase: 'paper-draft',
    label: '第二名研究员交叉评审',
    tool: 'vibe_v5_paper',
    as: roster[2] || 'r-2',
    args: { action: 'review', target: paperTitle, member: roster[2] || 'r-2', of: roster[1] || 'r-1', deliverable: true, notes: '定理与证据一致。' },
    keys: ['action', 'review'],
  })
  const advance2 = await doCall({
    phase: 'paper-draft',
    label: '院士席推进：reviewing → awaiting-editor（全票可交付）',
    tool: 'vibe_v5_paper',
    as: roster[0] || 'r-acad',
    args: { action: 'advance', target: paperTitle, member: roster[0] || 'r-acad' },
    keys: ['action', 'advance'],
  })
  await capture({ seat: 'member', member: roster[1] || 'r-1', phase: 'normal', label: '论文进入待定稿后的成员回合' })
  highlights.paper = {
    paperId,
    stateRecord,
    advance1: advance1.receipt.advance,
    advance2: advance2.receipt.advance,
    bridgeHasEvidence,
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // PHASE 11/12 — finalisation. The FIRST final is refused BY NAME (the E4 office consult gate) and carries the
  // requestId; the office answers it; the SECOND final finalises, and the missing PDF is a NAMED environment absence.
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const finalAttempt = await doCall({
    phase: 'paper-finalize',
    label: '院士席第一次定稿（被 office consult 门拒绝，预期）',
    tool: 'vibe_v5_paper',
    as: roster[0] || 'r-acad',
    args: { action: 'final', target: paperTitle, member: roster[0] || 'r-acad', decision: 'deliverable' },
    expect: ['VMU_OFFICE_CONSULT_REQUIRED'],
    keys: ['code', 'requestId', 'message', 'hint'],
  })
  const consultRequestId = finalAttempt.receipt.requestId || null
  if (!consultRequestId) problems.push({ step: finalAttempt.step.n, kind: 'consult-request-id-missing' })
  const consultState = await doCall({
    phase: 'paper-finalize',
    label: '读所办问询状态（awaiting requestId）',
    tool: 'vibe_v5_paper',
    args: { action: 'consult_state', target: paperTitle },
    keys: ['action', 'consult'],
  })
  const awaiting = consultState.receipt.consult && consultState.receipt.consult.awaiting ? consultState.receipt.consult.awaiting : null
  const awaitingId = awaiting && awaiting.id ? awaiting.id : null
  if (awaitingId !== consultRequestId) problems.push({ step: consultState.step.n, kind: 'consult-awaiting-mismatch', expected: consultRequestId, got: awaitingId })
  const consultAnswer = await doCall({
    phase: 'paper-finalize',
    label: '所办答复问询（PAPER_CONSULT_ROLES 只允许 office）',
    tool: 'vibe_v5_paper',
    args: {
      action: 'consult',
      member: 'office',
      target: paperTitle,
      request_id: awaitingId,
      answer: '可以结题：证据指针可解析，局限已写明；PDF 属于本装配的环境缺省。',
      note: '所办答复已留档。',
    },
    keys: ['action', 'consult'],
  })
  const finalised = await doCall({
    phase: 'paper-finalize',
    label: '院士席第二次定稿（office 已答复）',
    tool: 'vibe_v5_paper',
    as: roster[0] || 'r-acad',
    args: { action: 'final', target: paperTitle, member: roster[0] || 'r-acad', decision: 'deliverable' },
    keys: ['action', 'final'],
  })
  const fin = finalised.receipt.final || {}
  const toolchainAbsent = Array.isArray(fin.toolchainAbsent) ? fin.toolchainAbsent : []
  if (fin.finalized !== true) problems.push({ step: finalised.step.n, kind: 'paper-not-finalized', final: jsonShort(fin, 400) })
  if (fin.pdfEnvironmentMissing !== true) problems.push({ step: finalised.step.n, kind: 'pdf-absence-not-named', pdf: jsonShort(fin.pdf, 300) })
  if (!toolchainAbsent.includes('latex')) problems.push({ step: finalised.step.n, kind: 'toolchain-absent-not-named', toolchainAbsent })
  await capture({ seat: 'chair', phase: 'normal', label: '定稿后的院士席回合' })

  const compile = await doCall({
    phase: 'paper-finalize',
    label: '尝试编译 PDF（无 LaTeX 面 → 环境拒绝，具名）',
    tool: 'vibe_v5_paper',
    as: roster[0] || 'r-acad',
    args: { action: 'compile', target: paperTitle, member: roster[0] || 'r-acad' },
    keys: ['code', 'message', 'hint'],
    note: 'EXECUTOR_MISSING is an ENVIRONMENT refusal here: this assembly injected no LaTeX face',
  })

  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  // PHASE 12/12 — closure: render the artefacts, read the paper back, and read the final ledger. The tree the corpus
  // carries is this workspace, so the final read is also what proves the artefacts exist on disk.
  // ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
  const rendered = await doCall({
    phase: 'closure',
    label: '渲染结题产物（md/tex/meta 进归档，pdf 缺省具名）',
    tool: 'vibe_v5_paper',
    as: roster[0] || 'r-acad',
    args: { action: 'render', target: paperTitle, member: roster[0] || 'r-acad' },
    keys: ['action', 'renderOk', 'wroteToLedger', 'diskFiles', 'missing', 'archiveArtifacts', 'qualityGate'],
  })
  const paperStatus = await doCall({
    phase: 'closure',
    label: '读论文最终状态（finalized）',
    tool: 'vibe_v5_paper',
    args: { action: 'status', target: paperTitle },
    keys: ['action', 'exists', 'paper', 'missing', 'complete', 'toolchainAbsent', 'archiveArtifacts'],
  })
  const paperState = paperStatus.receipt.paper && paperStatus.receipt.paper.status ? String(paperStatus.receipt.paper.status) : ''
  if (paperState !== 'finalized') problems.push({ step: paperStatus.step.n, kind: 'paper-status-not-finalized', status: paperState })
  const finalLedger = await doCall({
    phase: 'closure',
    label: '读结题台账（records list）',
    tool: 'vibe_vmu_records',
    args: { action: 'list', limit: 0 },
    keys: ['action', 'total', 'returned', 'truncated'],
  })
  await capture({ seat: 'chair', phase: 'normal', label: '结题后的院士席回合' })

  // ── the tree the corpus carries ────────────────────────────────────────────────────────────────────────────────
  const tree = h.tree()
  highlights.phases = {}
  for (const row of steps) {
    highlights.phases[row.phase] = (highlights.phases[row.phase] || 0) + 1
  }
  highlights.closure = {
    finalised: fin.finalized === true,
    pdfEnvironmentMissing: fin.pdfEnvironmentMissing === true,
    toolchainAbsent,
    renderOk: rendered.receipt.renderOk === true || rendered.receipt.renderOk === false ? rendered.receipt.renderOk : null,
    archiveMissing: rendered.receipt.archiveArtifacts ? rendered.receipt.archiveArtifacts.missing : null,
    paperStatus: paperState,
    ledgerTotal: finalLedger.receipt.total,
    treeFiles: tree.length,
  }
  highlights.counts = {
    steps: steps.length,
    receipts: receipts.length,
    prompts: promptFiles.length,
    seats: [...seatPool].sort(),
    ids: steps.reduce((acc, s) => acc.concat(s.produced), []).filter((id, i, all) => all.indexOf(id) === i).sort(),
  }
  highlights.problems = problems
  highlights.findings = findings
  highlights.expectedRefusals = DECLARED_REFUSALS
  highlights.prompts = promptChecks.map((c) => ({
    name: c.name,
    seat: c.seat,
    phase: c.phase,
    meeting: c.meeting,
    afterStep: c.afterStep,
    pairReceiptSeq: c.pairReceiptSeq,
    chars: c.chars,
    facts: c.facts,
    producedFacts: c.producedFacts,
    mailVisible: c.mailVisible,
  }))

  // ── the REPORT section: per step action → receipt keys → verdict → what the next step cited ────────────────────
  for (let i = 0; i < steps.length; i += 1) {
    const s = steps[i]
    const next = steps[i + 1] || null
    if (s.receiptSeq && s.receiptSeq[1] >= s.receiptSeq[0]) {
      const cited = next === null ? [] : next.uses.filter((id) => s.produced.indexOf(id) !== -1)
      s.nextUse = next === null
        ? '（生命周期结束，没有下一步）'
        : cited.length > 0
          ? '#' + s.receiptSeq[0] + ' 给出 ' + cited.join(', ') + ' → 下一步 #' + next.n + ' 直接引用'
          : '（下一步不使用本步新产生的 id）'
    } else {
      s.nextUse = '（本步不产生回执；没有可供下一步引用的新 id）'
    }
  }
  const reportLines = []
  for (const s of steps) {
    reportLines.push('### ' + pad2(s.n) + ' · ' + s.phase + ' · ' + s.label)
    reportLines.push('')
    reportLines.push('- 动作：' + (s.tool === null
      ? (s.kind === 'member-fs' ? '成员 fs 工具写 ' + String(s.args.path || '') : '内核触碰 ' + s.label)
      : '`' + s.tool + '` ' + trim(JSON.stringify(s.args), 240) + '（as ' + s.as + '）'))
    reportLines.push('- 回执：' + (s.receiptSeq && s.receiptSeq[1] >= s.receiptSeq[0]
      ? '#' + s.receiptSeq[0] + (s.receiptSeq[1] !== s.receiptSeq[0] ? '–#' + s.receiptSeq[1] : '') + ' · ' + s.verdict + (s.code ? ' · code=' + s.code : '') + ' · ' + s.detail
      : s.verdict + ' · ' + s.detail))
    reportLines.push('- 判定：' + (s.idCheck.ok ? 'id 来源可追溯（检查 ' + s.idCheck.checked + ' 个）' : 'id 来源违例 ' + s.idCheck.violations.length + ' 处：' + jsonShort(s.idCheck.violations, 240)) + '；文件 ' + s.files.before + ' → ' + s.files.after)
    reportLines.push('- 下一步依据：' + s.nextUse)
    reportLines.push('')
  }
  reportLines.push('### 提示词 / 回执成对留档')
  reportLines.push('')
  for (const c of promptChecks) {
    reportLines.push('- ' + c.name + '（' + c.seat + (c.meeting ? ' @ ' + c.meeting : '') + '，' + c.chars + ' 字符，每回执 #' + (c.pairReceiptSeq === null ? '-' : c.pairReceiptSeq) + '）：可见事实 ' + (c.facts.length > 0 ? c.facts.join(', ') : '（无）') + (c.mailVisible ? ' · 含新到消息块' : ''))
  }
  reportLines.push('')
  reportLines.push('### 自查')
  reportLines.push('')
  reportLines.push('- 阶段覆盖：' + PHASES.map((p) => p.key + '=' + (highlights.phases[p.key] || 0)).join(' · '))
  reportLines.push('- 回执总数：' + receipts.length + '；提示词：' + promptFiles.length + '；工作区文件：' + tree.length)
  reportLines.push('- 问题：' + (problems.length === 0 ? '无' : problems.length + ' 条（见 steps/highlights.json 的 problems）'))
  reportLines.push('')

  return {
    steps,
    receipts,
    tree,
    promptChars: Object.fromEntries(promptChecks.map((c) => [c.name, c.chars])),
    promptFiles,
    reportLines,
    expectedRefusals: DECLARED_REFUSALS.map((r) => ({ tool: r.tool, code: r.code })),
    highlights: Object.assign({}, highlights, {
      promptPairs: promptChecks,
      unpairedPrompts: promptChecks.filter((c) => c.facts.length === 0).map((c) => c.name),
    }),
  }
}

export default scenario
