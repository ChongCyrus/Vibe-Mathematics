/**
 * packs/v5r/paper.js — PHASE 7 round 7: THE PAPER SUBSYSTEM (v5r's cooperative paper flow).
 *
 * THE ORIGINAL, READ FROM SOURCE (`vibe-math-v5r.js:229-248, 8156-8344, 8770`), NOT FROM MEMORY:
 *   · `PAPER_SECTIONS` — nine section titles; `PAPER_MAX_ROUNDS = 3`; `PAPER_ENGINE_ORDER` puts **xelatex first for
 *     Chinese** (CJK out of the box) and pdflatex first for English; `PAPER_REPAIR_CORE` is the retry package set.
 *   · the state machine is `writing → reviewing → (writing … up to PAPER_MAX_ROUNDS) → awaiting-editor → finalized`;
 *     a reviewing round where every participant answers `deliverable:true` goes to awaiting-editor, a disagreement
 *     sends the paper back to writing for another round, and the cap sends it on with a NAMED warning.
 *   · `parts[memberId] = {member, round, title, solution, methods, rules, limits, evidence[], at}`;
 *     `reviews[memberId] = {member, of, round, deliverable, comments, at}`; `final = {by, decision, note, conclusion, at}`.
 *   · the paper object lives in the institute state (`Paper/<id>/` on disk in the original). HERE it lives in the
 *     RECORDS face, one record per artefact, named `v5r-paper|<target>|<artifact>` — the v3 naming convention with v5r's
 *     own prefix, so both institutions' papers are readable side by side.
 *
 * THE TWO HARD RULES THIS FILE ENFORCES (both demanded by the Lead's brief):
 *   ① A PAPER BODY IS REBUILT FROM ITS RECORDS **BY ID + FINGERPRINT**: every part's fingerprint is the one the KERNEL's
 *      records face computed when the part was written (`put` returns it), and rendering re-reads the part by id and
 *      compares. A difference is a NAMED BLOCK (`VMU_PACK_V5R_CORE_PAPER_FINGERPRINT_MISMATCH`) — the old text is
 *      NEVER silently used, because a paper that quietly keeps stale prose is a lie about what the institute proved.
 *   ② FOUR ARTEFACTS (`md`, `tex`, `pdf`, `meta`) — `PaperArtifacts` reports `missing:[…]` instead of claiming
 *      completion, and a missing PDF names the kernel capability it needs (there is no LaTeX executor in this kernel:
 *      measured — `kernel/` has no xelatex/pdflatex/latexmk face, only sympy's `latex` string in `mathadapters`).
 */

export const PAPER_MAX_ROUNDS = 3
/** The original's nine sections, in order (verbatim from `vibe-math-v5r.js:238-248`). */
export const PAPER_SECTIONS = Object.freeze([
  '标题、作者、日期与摘要',
  '引言与问题背景',
  '原问题的完整解法',
  '已检验通过的命题',
  '已解决的子问题 / 中间成果',
  '创造或发现的有价值之物：方法、理论、思想、经验与数学理解',
  '规律总结',
  '讨论、局限与展望',
  '附录：证据与文件索引',
])
/** Chinese first (docs/final-paper.md §8): xelatex covers CJK out of the box; English prefers pdflatex. */
export const PAPER_ENGINE_ORDER = Object.freeze({
  zh: Object.freeze(['xelatex', 'latexmk', 'pdflatex', 'lualatex', 'tectonic']),
  en: Object.freeze(['pdflatex', 'latexmk', 'lualatex', 'tectonic', 'xelatex']),
})
export const PAPER_REPAIR_CORE = Object.freeze(['amsmath', 'amssymb', 'amsthm', 'geometry', 'ctex'])
export const PAPER_STATES = Object.freeze(['writing', 'reviewing', 'awaiting-editor', 'finalized'])
export const PAPER_ARTIFACTS = Object.freeze(['md', 'tex', 'pdf', 'meta'])
export const PAPER_TRACK = 'paper'
export const PAPER_CODES = Object.freeze({
  STATE: 'VMU_PACK_V5R_CORE_PAPER_STATE',
  FINGERPRINT: 'VMU_PACK_V5R_CORE_PAPER_FINGERPRINT_MISMATCH',
  PDF_NEEDS_KERNEL: 'VMU_PACK_V5R_CORE_PAPER_PDF_NEEDS_KERNEL',
  EXECUTOR: 'VMU_PACK_V5R_CORE_PAPER_EXECUTOR_MISSING',
})

const str = (v) => (v === undefined || v === null ? '' : String(v))
const has = (v) => v !== undefined && v !== null && String(v).trim() !== ''

function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  return e
}

const recordName = (target, artifact) => 'v5r-paper|' + str(target) + '|' + artifact

/**
 * Create the paper subsystem over ONE kernel. Every method is a pure state transition over records; there is no timer
 * and no global: the pack's turn/middleware layer calls `pass()` when it wants the flow to move.
 */
export function createPaperSubsystem({ kernel } = {}) {
  if (!kernel || !kernel.records) {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'the paper subsystem needs the records face', 'assemble a kernel with the records service')
  }
  const records = kernel.records

  const declaredTracks = () => {
    try {
      const v = kernel.settingsSnapshot ? kernel.settingsSnapshot()['vmu.records.tracks'] : null
      return Array.isArray(v) ? v.map(String) : []
    } catch { return [] }
  }
  const ensureTrack = () => {
    if (!declaredTracks().includes(PAPER_TRACK)) {
      throw refuse('VMU_INVALID_ARGUMENT', 'the records face does not declare the "' + PAPER_TRACK + '" track, so a paper cannot be archived',
        'declare vmu.records.tracks including "' + PAPER_TRACK + '" (the v5r pack declares it in its value layer)')
    }
  }
  const listPaper = () => {
    const rows = records.list({ track: PAPER_TRACK, limit: 500 })
    return Array.isArray(rows.items) ? rows.items : []
  }
  const rowByTitle = (title) => listPaper().filter((r) => String(r.title) === title)[0] || null
  const readState = (target) => {
    const row = rowByTitle(recordName(target, 'state'))
    if (!row) return null
    const got = records.get({ id: row.id })
    const full = got && got.record ? got.record : got
    let body = full && full.body
    if (body === undefined && Array.isArray(full && full.blocks)) body = full.blocks.map((b) => (typeof b === 'string' ? b : b && b.text) || '').join('\n')
    try { return { state: JSON.parse(String(body || '{}')), row: full } } catch { return null }
  }
  const writeState = (state) => {
    // ONE state record, updated IN PLACE: `records.put` with the remembered id writes a new revision, so the paper has
    // exactly one live state row (a fresh id per write would leave duplicates whose list order decides the truth).
    const put = records.put({
      id: state.stateRecordId || null,
      track: PAPER_TRACK, kind: 'paper-state', title: recordName(state.target, 'state'),
      body: JSON.stringify(state), settled: state.status === 'finalized', by: 'vibe_v5_paper',
    })
    if (put && put.id) state.stateRecordId = put.id
    return put
  }

  const requireState = (target) => {
    const found = readState(target)
    if (!found) {
      throw refuse(PAPER_CODES.STATE, 'no paper "' + str(target) + '" exists in the records face',
        'start one first (paper.start({target, participants}))')
    }
    return found
  }

  /** ① start: writing/round 1, participants = the writing members. */
  function start({ target, participants = [], editor = 'academician', lang = 'zh', format = 'both' } = {}) {
    ensureTrack()
    if (!has(target)) throw refuse('VMU_INVALID_ARGUMENT', 'start needs the paper target', 'pass target:"<the object being written up>"')
    const list = Array.isArray(participants) ? participants.map(String).filter((x) => x !== '') : []
    if (list.length === 0) throw refuse('VMU_INVALID_ARGUMENT', 'start needs at least one writing participant', 'pass participants:["r-1", …]')
    if (readState(str(target))) throw refuse(PAPER_CODES.STATE, 'a paper for "' + str(target) + '" already exists',
      'advance/finalize the existing one, or start a paper for a different target (this face never silently overwrites)')
    const state = {
      id: 'paper-' + str(target), target: str(target), status: 'writing', stage: 'writing', round: 1,
      participants: list, editor: str(editor) || 'academician', lang: lang === 'en' ? 'en' : 'zh',
      format: ['both', 'md', 'tex'].includes(format) ? format : 'both',
      parts: {}, reviews: {}, reviewOf: {}, final: null, disagreement: [], warnings: [], forcedAfterCap: false,
      createdAt: 1, updatedAt: 1,
    }
    ensureTrack()
    const put = writeState(state)
    // the first write minted the id; fold it in so every later write updates the same record
    writeState(state)
    return { ok: true, target: state.target, status: state.status, round: state.round, stateRecord: state.stateRecordId || (put && put.id), fingerprint: put && put.fingerprint }
  }

  /** ② a part: written by a PARTICIPANT, in the WRITING stage; it is archived as its own record and its kernel-computed
   *  fingerprint is remembered in the state (that is what rule ① compares against later). */
  function recordPart({ target, member, title = '', solution = '', methods = '', rules = '', limits = '', evidence = [] } = {}) {
    const { state } = requireState(target)
    if (state.status !== 'writing') throw refuse(PAPER_CODES.STATE, 'the paper is not in its writing stage (now: ' + state.status + ')', 'advance it back to writing before recording a part')
    if (!state.participants.includes(str(member))) throw refuse('VMU_NO_SUCH_OBJECT', str(member) + ' is not a writing participant of this paper', 'participants: ' + state.participants.join(', '))
    const part = {
      member: str(member), round: state.round, title: str(title).slice(0, 300),
      solution: str(solution).slice(0, 20000), methods: str(methods).slice(0, 20000),
      rules: str(rules).slice(0, 12000), limits: str(limits).slice(0, 12000),
      evidence: Array.isArray(evidence) ? evidence.map(String).slice(0, 50) : [],
    }
    if (!part.title && !part.solution && !part.methods && !part.rules && !part.limits) {
      throw refuse('VMU_INVALID_ARGUMENT', 'the part carries no content', 'give at least a title and one contribution field (solution/methods/rules/limits)')
    }
    const put = records.put({ track: PAPER_TRACK, kind: 'paper-part', title: recordName(state.target, 'part|' + part.member), body: JSON.stringify(part), by: 'vibe_v5_paper' })
    state.parts[part.member] = { recordId: put && put.id, fingerprint: put && put.fingerprint, round: part.round, at: 1 }
    state.updatedAt = 1
    writeState(state)
    return { ok: true, recorded: part.member, round: state.round, recordId: put && put.id, fingerprint: put && put.fingerprint }
  }

  /** ③ a review: deliverable must be a real boolean ("未表态不算可交付", the original's wording). */
  function recordReview({ target, member, deliverable, comments = '', of = null } = {}) {
    const { state } = requireState(target)
    if (state.status !== 'reviewing') throw refuse(PAPER_CODES.STATE, 'the paper is not in its cross-review stage (now: ' + state.status + ')', 'advance() moves writing → reviewing')
    if (!state.participants.includes(str(member))) throw refuse('VMU_NO_SUCH_OBJECT', str(member) + ' is not a review participant of this paper', 'participants: ' + state.participants.join(', '))
    if (deliverable !== true && deliverable !== false) {
      throw refuse('VMU_INVALID_ARGUMENT', 'deliverable must be true or false (an unstated verdict is NOT deliverable)', 'pass deliverable:true/false — "未表态不算可交付"')
    }
    const assigned = state.reviewOf[String(member)] || null
    const review = { member: str(member), of: str(of || assigned || ''), round: state.round, deliverable: deliverable === true, comments: str(comments).slice(0, 8000) }
    const put = records.put({ track: PAPER_TRACK, kind: 'paper-review', title: recordName(state.target, 'review|' + review.member), body: JSON.stringify(review), by: 'vibe_v5_paper' })
    state.reviews[review.member] = { recordId: put && put.id, fingerprint: put && put.fingerprint, deliverable: review.deliverable, of: review.of, round: state.round }
    state.updatedAt = 1
    writeState(state)
    return { ok: true, recorded: review.member, of: review.of, deliverable: review.deliverable, round: state.round }
  }

  /** ④ advance: the state machine. Returns what happened, or `moved:false` with the reason (never a silent no-op). */
  function advance({ target } = {}) {
    const { state } = requireState(target)
    if (state.status === 'writing') {
      if (state.participants.length === 0) throw refuse(PAPER_CODES.STATE, 'no participants: nothing can be cross-reviewed', 'record at least one part and have a second participant')
      const reviewOf = {}
      for (let i = 0; i < state.participants.length; i += 1) reviewOf[state.participants[i]] = state.participants[(i + 1) % state.participants.length]
      state.status = 'reviewing'; state.stage = 'reviewing'; state.reviewOf = reviewOf; state.reviews = {}
      writeState(state)
      return { ok: true, moved: true, from: 'writing', to: 'reviewing', round: state.round, reviewOf }
    }
    if (state.status === 'reviewing') {
      const refusers = state.participants.filter((id) => !(state.reviews[id] && state.reviews[id].deliverable === true))
      if (refusers.length === 0) {
        state.status = 'awaiting-editor'; state.stage = 'awaiting-editor'
        writeState(state)
        return { ok: true, moved: true, from: 'reviewing', to: 'awaiting-editor', round: state.round, unanimous: true }
      }
      const entry = { round: state.round, members: refusers.slice(), detail: refusers.map((id) => id + '：' + String((state.reviews[id] || {}).comments || '未说明')).join('；') }
      state.disagreement = (state.disagreement || []).concat([entry])
      if (state.round < PAPER_MAX_ROUNDS) {
        state.round += 1; state.status = 'writing'; state.stage = 'writing'; state.reviews = {}
        writeState(state)
        return { ok: true, moved: true, from: 'reviewing', to: 'writing', round: state.round, refusers }
      }
      state.status = 'awaiting-editor'; state.stage = 'awaiting-editor'
      state.forcedAfterCap = true
      state.warnings = (state.warnings || []).concat(['互审在 ' + PAPER_MAX_ROUNDS + ' 轮上限仍未达成全体一致（' + refusers.join('、') + '）；分歧已写入论文附录。'])
      writeState(state)
      return { ok: true, moved: true, from: 'reviewing', to: 'awaiting-editor', round: state.round, refusers, capped: true, warnings: state.warnings }
    }
    return { ok: true, moved: false, state: state.status, note: 'the flow is ' + state.status + '; only writing/reviewing advance on their own (finalize it, or start a new paper)' }
  }

  /** ⑤ the driver: advance until nothing moves (the original's paperPass, bounded so it cannot loop forever). */
  function pass({ target, maxSteps = 6 } = {}) {
    const transitions = []
    for (let i = 0; i < maxSteps; i += 1) {
      const r = advance({ target })
      if (!r.moved) return { ok: true, moved: transitions.length > 0, transitions, stopped: r.state || null }
      transitions.push({ from: r.from, to: r.to, round: r.round })
    }
    return { ok: true, moved: transitions.length > 0, transitions, stopped: 'max-steps' }
  }

  /** ⑥ the final decision: academician only, decision deliverable|revise (the original's two values). */
  function recordFinal({ target, member, decision, note = '', conclusion = '' } = {}) {
    const { state } = requireState(target)
    if (state.status !== 'awaiting-editor') throw refuse(PAPER_CODES.STATE, 'the paper is not awaiting its editor (now: ' + state.status + ')', 'advance() until the cross-review is unanimous or the round cap is reached')
    if (state.editor !== 'academician') {
      throw refuse('VMU_NOT_PERMITTED', 'paperEditor is "' + state.editor + '": this paper is not the academician\'s to finalise', 'the original lets the office finalize only after consulting the institute — that path is a named gap here')
    }
    const row = (kernel.members ? kernel.members.roster() : []).filter((m) => m.id === str(member))[0]
    if (!row || String(row.slot) !== 'chair') {
      throw refuse('VMU_NOT_PERMITTED', 'the academician (chair seat) must finalise this paper; "' + str(member) + '" is ' + (row ? 'in slot "' + String(row.slot) + '"' : 'not on the roster'),
        'seat an academician in the chair slot, or configure editor:"office" with its consult gap reported (named gap)')
    }
    if (decision !== 'deliverable' && decision !== 'revise') throw refuse('VMU_INVALID_ARGUMENT', 'decision must be deliverable|revise', 'the original accepts exactly these two')
    const fin = { by: str(member), decision, note: str(note).slice(0, 4000), conclusion: str(conclusion).slice(0, 20000) }
    if (decision === 'deliverable') {
      state.final = fin; state.status = 'finalized'; state.stage = 'finalized'
      writeState(state)
      const rendered = render({ target })
      return { ok: true, finalized: true, target: state.target, final: fin, artifacts: rendered.artifacts, missing: rendered.missing }
    }
    state.final = fin
    if (state.round < PAPER_MAX_ROUNDS) {
      state.round += 1; state.status = 'writing'; state.stage = 'writing'
      state.disagreement = (state.disagreement || []).concat([{ round: state.round - 1, members: [fin.by], detail: '定稿代表要求修订：' + (fin.note || '（未说明）') }])
      writeState(state)
      return { ok: true, finalized: false, moved: true, round: state.round, status: state.status }
    }
    throw refuse(PAPER_CODES.STATE, '已到 ' + PAPER_MAX_ROUNDS + ' 轮上限，定稿代表仍要求修订', 'the original would have to force it; this face refuses instead of silently finalizing a revised paper')
  }

  /** Re-read a part BY ID and compare the fingerprint remembered at write time (rule ①). */
  function readPartVerified(state, member) {
    const ref = state.parts[member]
    if (!ref) return null
    const got = records.get({ id: ref.recordId })
    const full = got && got.record ? got.record : got
    const now = full && full.fingerprint
    if (now !== ref.fingerprint) {
      throw refuse(PAPER_CODES.FINGERPRINT, 'part "' + member + '" no longer matches the fingerprint the state remembers (' + String(ref.fingerprint) + ' → ' + String(now) + ')',
        'the body on disk changed behind the paper\'s back; rebuild the part explicitly (record it again) — this face will NOT silently use the old text')
    }
    let body = full && full.body
    if (body === undefined && Array.isArray(full && full.blocks)) body = full.blocks.map((b) => (typeof b === 'string' ? b : b && b.text) || '').join('\n')
    try { return JSON.parse(String(body || '{}')) } catch { return null }
  }

  /** ⑦ markdown: rebuilt from the parts (by id + fingerprint), one section per the original's list. */
  function PaperMd({ target } = {}) {
    const { state } = requireState(target)
    const lines = ['# 论文：' + state.target, '', '状态：' + state.status + '｜轮次：' + state.round + '｜编辑：' + state.editor, '']
    lines.push('## ' + PAPER_SECTIONS[0])
    lines.push('目标对象：' + state.target + '；参与成员：' + state.participants.join('、'))
    for (let i = 1; i < PAPER_SECTIONS.length; i += 1) {
      lines.push('', '## ' + PAPER_SECTIONS[i])
      for (const member of state.participants) {
        const part = readPartVerified(state, member)
        if (!part) continue
        const chunk = [part.title && '**' + part.title + '**', part.solution, part.methods, part.rules, part.limits]
          .filter((x) => has(x)).join('\n\n')
        if (has(chunk)) lines.push('', '### ' + member + '（第 ' + part.round + ' 轮）', '', chunk)
        if (i === PAPER_SECTIONS.length - 1 && part.evidence.length) lines.push('', '证据：' + part.evidence.join('；'))
      }
    }
    if (state.warnings.length) lines.push('', '## 警告', ...state.warnings.map((w) => '- ' + w))
    return lines.join('\n')
  }

  /** ⑧ tex: same body, with the engine order's preamble needs (ctex for Chinese). */
  function PaperTex({ target } = {}) {
    const state = requireState(target).state
    const md = PaperMd({ target })
    const esc = (s) => String(s).replace(/([&%$#_{}])/g, '\\$1')
    const body = md.split('\n').map((line) => {
      if (line.startsWith('### ')) return '\\subsection*{' + esc(line.slice(4)) + '}'
      if (line.startsWith('## ')) return '\\section*{' + esc(line.slice(3)) + '}'
      if (line.startsWith('# ')) return '\\section*{' + esc(line.slice(2)) + '}'
      return esc(line)
    }).join('\n')
    const engines = PAPER_ENGINE_ORDER[state.lang] || PAPER_ENGINE_ORDER.zh
    return [
      '% generated by packs/v5r/paper.js — engine order for ' + state.lang + ': ' + engines.join(' → '),
      '\\documentclass[11pt]{article}',
      '\\usepackage{' + PAPER_REPAIR_CORE.join(',') + '}',
      '\\begin{document}',
      body,
      '\\end{document}',
    ].join('\n')
  }

  /** ⑨ the four artefacts. Missing is NAMED; the PDF is the one this kernel cannot make (no LaTeX executor). */
  function PaperArtifacts({ target } = {}) {
    const found = readState(target)
    const present = {}
    for (const name of PAPER_ARTIFACTS) {
      // EVERY artefact — including `meta` — is its own record: the state row is the flow, not the fourth artefact.
      present[name] = !!found && !!rowByTitle(recordName(str(target), name))
    }
    const missing = PAPER_ARTIFACTS.filter((n) => present[n] !== true)
    const pdf = missing.includes('pdf')
      ? { missing: 'pdf', needsKernel: 'LaTeX 编译执行器', code: PAPER_CODES.PDF_NEEDS_KERNEL,
        why: 'this kernel has no xelatex/pdflatex/latexmk face (measured: kernel/ has no such spawn caller; only sympy\'s latex string exists in mathadapters)' }
      : null
    return { ok: missing.length === 0, target: str(target), present, missing, complete: missing.length === 0, pdf,
      note: missing.length === 0 ? 'all four artefacts are present' : 'INCOMPLETE: ' + missing.join(', ') + ' — this receipt does NOT claim completion' }
  }

  /** ⑩ render: write md/tex/meta records for the current state (pdf needs the named kernel capability — never faked). */
  function render({ target } = {}) {
    const { state } = requireState(target)
    const md = PaperMd({ target })
    const tex = PaperTex({ target })
    const meta = { id: state.id, target: state.target, status: state.status, round: state.round, editor: state.editor, lang: state.lang, format: state.format, participants: state.participants, warnings: state.warnings, forcedAfterCap: state.forcedAfterCap }
    const wrote = {}
    const wantsMd = state.format === 'both' || state.format === 'md'
    const wantsTex = state.format === 'both' || state.format === 'tex'
    if (wantsMd) wrote.md = records.put({ track: PAPER_TRACK, kind: 'paper-md', title: recordName(state.target, 'md'), body: md, by: 'vibe_v5_paper' })
    if (wantsTex) wrote.tex = records.put({ track: PAPER_TRACK, kind: 'paper-tex', title: recordName(state.target, 'tex'), body: tex, by: 'vibe_v5_paper' })
    wrote.meta = records.put({ track: PAPER_TRACK, kind: 'paper-meta', title: recordName(state.target, 'meta'), body: JSON.stringify(meta), by: 'vibe_v5_paper' })
    const artifacts = PaperArtifacts({ target })
    return { ok: artifacts.complete, target: state.target, wrote: Object.keys(wrote), artifacts, missing: artifacts.missing, pdf: artifacts.pdf }
  }

  return { start, recordPart, recordReview, advance, pass, recordFinal, PaperMd, PaperTex, PaperArtifacts, render, sections: () => PAPER_SECTIONS.slice(), state: (target) => readState(target) }
}

export default createPaperSubsystem
