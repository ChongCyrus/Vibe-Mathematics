/**
 * packs/v5r/paper-quality.js — PHASE 12 / E1＋E3: the paper's RECORD-BACKED sections and its QUALITY GATE.
 *
 * WHY THIS FILE EXISTS (both halves are the same complaint):
 *   · E1 — the nine-section outline had three sections that could never carry anything: `PAPER_SECTIONS[1]`
 *     (引言与问题背景), `[3]` (已检验通过的命题) and `[4]` (已解决的子问题) own NO part-field
 *     (`sectionFields` has '' at those indexes, see `packs/v5r/paper.js`), so `PaperMd` printed the heading and then
 *     jumped to the next one. A paper that never names the original problem and never lists what was proved is not
 *     "a draft", it is structurally empty. The three sections have RECORDS as their source (the institute's declared
 *     objective; the `verified` track; the `problems` track) — so this module FILLS them from the records face at
 *     render time, and when a source really is empty it writes a NAMED note instead of a silent blank line;
 *   · E3 — "证据/引用/不得编造" was only a sentence in a prompt. This module turns it into a gate that REFUSES, by
 *     name and with the offending id in the message: a citation that names no record, a paper with no evidence at
 *     all, and a paper whose body drops a verified conclusion / a solved subproblem.
 *
 * LAYERING (the pack's own red lines):
 *   · NOTHING here invents a track, a kind or an id space: every read goes through `kernel.records`（list/get）and
 *     the pack's existing `verified` read face (`./verified.js`), which is the one authority for "what a verified row
 *     means";
 *   · every code is a `VMU_PACK_` code declared HERE by the institution and passed to `kit/paper.js` as `codes`
 *     (`kit` never invents codes). `VMU_PACK_*` codes are the pack family that `tests/audit-vmu-docs` exempts from the
 *     kernel code table (`:232`), so this file adds no docs/03 registration burden;
 *   · no filesystem, no clock, no spawn: the fills are a pure function of (md, records view) and the gate is a pure
 *     function of (md, state, records view). Determinism is what makes them testable without a live agent.
 */
import { listVerified, parseBody } from './verified.js'

/** The institution's error codes for this gate (pack family; registered by prefix, not in the kernel table). */
export const QUALITY_CODES = Object.freeze({
  // A record-backed section's heading is missing from the rendered markdown: the fill cannot be placed, and silently
  // dropping it would hide the very thing E1 demands. (A malformed md is a named block, never a half-filled paper.)
  SECTIONS: 'VMU_PACK_V5R_CORE_PAPER_SECTIONS',
  // A citation (an evidence entry or an in-text member-file path) names an id the records face does not hold.
  CITATION_UNKNOWN: 'VMU_PACK_V5R_CORE_PAPER_CITATION_UNKNOWN',
  // No evidence at all: the appendix would be an empty promise ("证据/引用/不得编造" cannot be checked with nothing).
  EVIDENCE_MISSING: 'VMU_PACK_V5R_CORE_PAPER_EVIDENCE_MISSING',
  // The body drops a verified conclusion or a solved subproblem that the records face really holds.
  VERIFIED_MISSING: 'VMU_PACK_V5R_CORE_PAPER_VERIFIED_MISSING',
})

/**
 * WHO owns which record-backed section — POLICY, declared here, indexes into the pack's own `PAPER_SECTIONS`.
 * `source` names the records face read that fills it; `legalEmpty` is the ONLY permitted empty state and is rendered
 * as a sentence, so "empty" is always a stated fact with a reason instead of a blank line nobody reads.
 * Indexes: 1 引言与问题背景 ← the institute's DECLARED objective (data, not a records track); 3 已检验通过的命题 ← the
 * `verified` track; 4 已解决的子问题/中间成果 ← `problems` rows whose own card says p=1.
 */
export const RECORD_SECTIONS = Object.freeze([
  Object.freeze({ index: 1, source: 'objective', legalEmpty: '本所尚未设定研究对象（`vmu.turn.objective` 仍是默认值），因此没有"原问题"可写' }),
  Object.freeze({ index: 3, source: 'verified', legalEmpty: '`verified` 轨为空：还没有经过正式证明且忠实性审查通过的命题' }),
  Object.freeze({ index: 4, source: 'subproblems', legalEmpty: '`problems` 轨里没有 p=1（已判定成立）的子问题' }),
])

/** Member-file → (track, card id): the ONLY citation shapes this gate judges. A prose mention that is not a path is
 *  free text — the gate does not pretend it can verify it (and therefore does not accuse it of fabrication either).
 *  Shape: `Members/<member>/<Category>/<id>.md` (the charter's own file layout, forward or back slashes, optional .md). */
// ★ RUN 153 (G6): a bare record id ("rec-12", "p-3") is also a legal evidence pointer — see checkEvidencePointers.
const BARE_CARD_ID = /^([A-Za-z][A-Za-z0-9_-]*-[A-Za-z0-9_-]*\d+)$/
/**
 * ★★ RUN 173 — A BARE CITATION IS THE WHOLE STRING, never a prefix of prose. `r-1 的命题卡` (free text, a real fixture
 * in tests/vmu-paper-quality.test.mjs) is NOT the record id `r-1`: the pointer normalizer above cuts at the first
 * non-id character because prose punctuation follows a POINTER, but a bare entry has no path around it to tell us where
 * the id stops — so the whole trimmed string must be an id, or the entry is free text and the gate must not accuse it.
 */
const normalizeBareId = (raw) => {
  const s = str(raw).trim()
  const at = s.indexOf('#')
  const head = at < 0 ? s : s.slice(0, at)
  return head.replace(/\.(md|tex|lean)$/i, '').trim()
}
const isBareCitation = (id) => BARE_CARD_ID.test(id) || /^[A-Za-z][A-Za-z0-9_-]*$/.test(id)
// ★★ RUN 173 (real machine, run 18 — A LEGITIMATE POINTER READ AS A FABRICATED ONE): the capture group was
// `[^\/\\\s]+?`, which stops only at whitespace or a closing bracket, so the member's own prose punctuation was read as
// part of the id: `Members/r-1/Propos/rec-316.md（RUN14…` yielded the id `rec-316.md（RUN14` — the gate then reported a
// record that DOES exist as "no record with this id" (measured, run 18). A record id is ASCII by construction, so the
// capture is now exactly the id alphabet and the lookahead is "anything that is not an id character": the pointer ends
// where the member's prose resumes, whatever punctuation that is.
const MEMBER_FILE = /Members[\/\\][^\/\\\s]*[\/\\](Propos|Methods|Subproblems|Progress)[\/\\]([A-Za-z0-9_.-]+?)(?:\.md)?(?:#[^\s，。；、）)\]（`'"「」『』【】]*)?(?=$|[^A-Za-z0-9_.-])/
const TRACK_OF_CATEGORY = Object.freeze({ Propos: 'propositions', Methods: 'methods', Subproblems: 'problems', Progress: 'progress' })

const str = (v) => (v === undefined || v === null ? '' : String(v))
const has = (v) => str(v).trim() !== ''

/**
 * ★★ RUN 170 (real machine, run 16 / FEEDBACK16 F16-9 — A FILE NAME READ AS A RECORD ID): the gate took the tail of a
 * prose citation as a record id, so `Members/r-1/Propos/run16-odd-cubes.md#四步归纳` became the id
 * `run16-odd-cubes.md#四步归纳` and `records.get` THREW `VMU_NO_SUCH_OBJECT` out of the gate (the whole `final` call died
 * with a records error instead of a citation verdict). A citation is a record id with an optional `.md` suffix and an
 * optional `#anchor` — both are ADDRESSING, never part of the id. One normalizer for BOTH gates, so they cannot disagree
 * about what "the id" is.
 */
const normalizeCitedId = (raw) => {
  const s = str(raw)
  const at = s.indexOf('#')
  const head = at < 0 ? s : s.slice(0, at)
  // ★★ RUN 173: a pointer quoted inside prose is followed by the member's own punctuation (`（…`, `，…`, `。`). Those
  // characters are prose, not addressing — cutting at the first non-id character keeps `rec-316.md（RUN14` an id
  // (`rec-316`) instead of accusing a record that exists. Trailing dots go for the same reason.
  const cut = head.replace(/[^A-Za-z0-9_.-].*$/, '')
  return cut.replace(/\.(md|tex|lean)$/i, '').replace(/\.+$/, '').trim()
}

/** The records face's full row (same shape rule the kit uses: `get` may hand back `{record}` or the record itself). */
function recordOf(records, id) {
  const got = records.get({ id })
  return got && got.record ? got.record : got
}
function bodyOf(row) {
  if (!row) return ''
  let body = row.body
  if (body === undefined && Array.isArray(row.blocks)) body = row.blocks.map((b) => (typeof b === 'string' ? b : (b && b.text) || '')).join('\n')
  return str(body)
}
function rowsOf(records, track, limit) {
  const out = records.list({ track, limit })
  const items = Array.isArray(out && out.items) ? out.items : []
  return { items, truncated: !!(out && out.truncated === true), cap: limit }
}
/** ★★ RUN 199 (run 39 / FEEDBACK38 1.2, MEASURED): ONE reader for the sentence a truncated verified name stops in the
 *  middle of. Run 39 read `requiredLines` and got requiredLineTruncated:true beside requiredLineFull:null while the
 *  same receipt's own means promised requiredLineFull was "the sentence to paste when the row name stops at …".
 *  The two faces computed it differently: the DELIVERY gate (`checkQuality`) fell back to the card's statement line,
 *  the READ face (`verifiedRequirements`) read item.statement — a field `view.verified()` never returns — so the read
 *  answer was null BY CONSTRUCTION, not because the sentence was missing. Both now call this one function. */
function statementOfCardOf(recordsFace, cardId) {
  if (!recordsFace || cardId === undefined || cardId === null || str(cardId).trim() === '') return null
  try {
    const row = recordOf(recordsFace, String(cardId))
    const body = bodyOf(row)
    const m = body.match(/^[-*]?\s*statement\s*[：:]\s*(.+)$/m)
    return m && m[1] ? m[1].trim() : null
  } catch (e) { return null }
}

/**
 * The READ VIEW of the three sources. Every count it reports is measured (never assumed), every unreadable row is
 * NAMED (never dropped), and a truncated list says so — "查不到要具名、截断要计数" is the pack's own discipline.
 */
export function createRecordsView({ kernel, codes, limit = 200 } = {}) {
  if (!kernel || !kernel.records || typeof kernel.records.list !== 'function' || typeof kernel.records.get !== 'function') {
    throw Object.assign(new Error('the paper quality view needs the records face (list/get)'), { code: 'VMU_ENGINE_UNAVAILABLE' })
  }
  const records = kernel.records

  /** E1 §1: the institute's DECLARED objective — data, not prompt text (`settings/schema.js` `vmu.turn.objective`). */
  function objective() {
    let raw = null
    try { raw = kernel.settingsSnapshot ? kernel.settingsSnapshot()['vmu.turn.objective'] : null } catch { raw = null }
    const text = str(raw).trim()
    const unset = !text || text === '（尚未设定）'
    return { ok: true, declared: !unset, text: unset ? '' : text }
  }

  /** E1 §3: the verified track, read through the pack's ONE verified read face (parsed rows + named bad rows). */
  function verified() {
    const read = listVerified(records)
    return {
      ok: true, items: read.items.map((r) => ({
        id: str(r.id), cardId: str(r.cardId), p: r.p, title: str(r.title), warrant: str(r.warrant), source: str(r.source),
      })), bad: read.bad, badCount: read.badCount, truncated: read.truncated === true,
    }
  }

  /** E1 §4: `problems` rows whose OWN card says p=1. The card's boolean is the criterion — no new track is invented
   *  and no "solved" column is guessed: a subproblem is solved when its card says so. */
  function subproblems() {
    const list = rowsOf(records, 'problems', limit)
    const items = []
    const unreadable = []
    let read = 0
    for (const head of list.items) {
      const row = recordOf(records, head.id)
      read += 1
      if (!row) { unreadable.push({ id: str(head.id), reason: 'the records face returned no row for this head' }); continue }
      if (row.bodyTruncated === true) { unreadable.push({ id: str(row.id), reason: 'body truncated by vmu.records.bodyCapBytes; cannot judge p' }); continue }
      const parsed = parseBody(bodyOf(row))
      const p = Number(str(parsed.fields.p).trim())
      if (!Number.isFinite(p)) { unreadable.push({ id: str(row.id), reason: 'the card carries no numeric p' }); continue }
      if (p !== 1) continue
      items.push({ id: str(row.id), title: str(row.title), statement: str(parsed.fields.statement) })
    }
    return { ok: true, items, unreadable, badCount: unreadable.length, read, truncated: list.truncated, cap: list.cap }
  }

  return { objective, verified, subproblems, records }
}

/** The bullet lines for ONE record-backed section, from the view. Empty ⇒ exactly one named sentence. */
function sectionLines(entry, view) {
  if (entry.source === 'objective') {
    const o = view.objective()
    if (!o.declared) return { mode: 'legal-empty', count: 0, lines: ['（本节本次为空，且这是合法的：' + entry.legalEmpty + '）'] }
    // ★★★ RUN 153 (G7): this line is the INSTITUTE'S TOTAL OBJECTIVE, auto-filled into a paper's §1. On the real run a
    // paper about `n + n = 2n` opened with "研究对象（原问题）: 本所本期目标：确立并证明『前 n 个奇数之和的封闭形式 n²』"
    // — literally true and completely misleading: a reader takes it as the paper's subject. The line now says whose
    // objective it is and what it is not, so the automatic fill cannot be mistaken for the paper's own problem.
    return { mode: 'filled', count: 1, lines: ['- 本所本期目标（设置键 `vmu.turn.objective`，是【全所】的目标、不一定是本篇论文的研究对象；本篇的具体问题写在作者自己的 part 正文里）：' + o.text] }
  }
  if (entry.source === 'verified') {
    const v = view.verified()
    const lines = []
    for (const item of v.items) {
      const name = item.title || item.cardId || item.id
      const why = [item.warrant ? '依据：' + item.warrant : '', item.source ? '来源：' + item.source : ''].filter(Boolean).join('；')
      // BOTH ids are printed: the row id (what `records.get` takes) and the CARD id (what a citation path must name).
      const ids = '记录 `' + item.id + '`' + (item.cardId && item.cardId !== item.id ? '（命题卡 `' + item.cardId + '`）' : '')
      lines.push('- ' + name + '（p=1' + (why ? '；' + why : '') + '；' + ids + '）')
    }
    // Named, never silent: a bad row means the appendix does NOT claim it and the reader learns why.
    if (v.badCount > 0) lines.push('（另有 ' + v.badCount + ' 条 `verified` 记录无法解析，未列入本节：' + v.bad.map((b) => str(b.id)).join('、') + '）')
    if (v.truncated) lines.push('（`verified` 列表在 ' + v.items.length + ' 条处被 records 面截断，另有未读条目——本节不是全量）')
    if (lines.length === 0) return { mode: 'legal-empty', count: 0, lines: ['（本节本次为空，且这是合法的：' + entry.legalEmpty + '）'] }
    return { mode: 'filled', count: v.items.length, lines }
  }
  if (entry.source === 'subproblems') {
    const s = view.subproblems()
    const lines = []
    for (const item of s.items) {
      const name = item.title || item.id
      const stmt = item.statement && item.statement !== name ? '：' + item.statement : ''
      lines.push('- ' + name + stmt + '（p=1；记录 `' + item.id + '`）')
    }
    if (s.badCount > 0) lines.push('（另有 ' + s.badCount + ' 条 `problems` 记录无法判定 p，未列入本节：' + s.unreadable.map((u) => str(u.id)).join('、') + '）')
    if (s.truncated) lines.push('（`problems` 列表在 ' + s.read + ' 行处被截断（cap=' + s.cap + '），本节不是全量）')
    if (lines.length === 0) return { mode: 'legal-empty', count: 0, lines: ['（本节本次为空，且这是合法的：' + entry.legalEmpty + '）'] }
    return { mode: 'filled', count: s.items.length, lines }
  }
  return { mode: 'legal-empty', count: 0, lines: ['（本节本次为空，且这是合法的：本节的数据来源没有声明）'] }
}

/**
 * E1: put the record-backed content INTO the rendered markdown, under the exact headings the kit emitted.
 * The kit renders the outline (policy: `PAPER_SECTIONS`), this function only fills the three sections the outline
 * declares record-backed. A heading that cannot be found is a NAMED problem (the md is malformed or the policy drifted)
 * — never a silent skip, because a silent skip is exactly the defect E1 removes.
 */
export function fillRecordSections({ md, sections, view, codes = QUALITY_CODES } = {}) {
  let text = str(md)
  const report = []
  const problems = []
  for (const entry of RECORD_SECTIONS) {
    const heading = str(sections && sections[entry.index])
    if (!heading) { problems.push({ index: entry.index, code: codes.SECTIONS, why: 'the pack declares no heading at index ' + entry.index }); continue }
    const marker = '\n## ' + heading
    const at = text.indexOf(marker)
    if (at < 0) {
      problems.push({ index: entry.index, code: codes.SECTIONS, heading, why: 'the rendered markdown has no "## ' + heading + '" heading, so the record-backed content cannot be placed' })
      continue
    }
    const fill = sectionLines(entry, view)
    const content = '\n\n' + fill.lines.join('\n')
    const insertAt = at + marker.length
    text = text.slice(0, insertAt) + content + text.slice(insertAt)
    report.push({
      index: entry.index, heading, source: entry.source, mode: fill.mode, count: fill.count,
      chars: fill.lines.join('\n').length, lines: fill.lines,
    })
  }
  return { ok: problems.length === 0, md: text, sections: report, problems }
}

/**
 * ★★ RUN 172 — EVERY POINTER ON A LINE, NOT JUST THE FIRST. The scan used `line.match(MEMBER_FILE)`, which returns one
 * match, so a member who wrote two member-file pointers on one line had only the first one judged: run 17 wrote
 * `…可寻址的一处：Members/r-1/Propos/rec-316.md#命题陈述 … 不可寻址的一处：Members/r-1/Propos/run17-not-a-record.md#§3`
 * in ONE paragraph and the gate saw only `rec-316` — the fabricated pointer passed `render`, `final` and the PDF compile
 * (measured, run 17). A gate must see every pointer the reader can see.
 */
function eachMemberFile(line, push) {
  const re = new RegExp(MEMBER_FILE.source, 'g')
  let m = null
  while ((m = re.exec(line)) !== null) {
    push(pointerText(m[0]))
    if (m[0].length === 0) re.lastIndex += 1
  }
}

/** ★★ RUN 175 (run 20 FEEDBACK20 ①): a pointer written inside markdown inline code was reported with the closing tick
 *  attached (`Members/r-1/Propos/rec-316.md#§3`` ` ``), because the anchor class excluded whitespace and CJK punctuation
 *  but not the tick. The tick is PROSE, not addressing — the id was already right, the path printed to the caller was not.
 *  Receipts now carry the pointer without its markdown wrapper, so a reader can paste it. */
function pointerText(raw) {
  return str(raw).replace(/^[`'"「『【]+/, '').replace(/[`'"」』】]+$/, '').trim()
}

/** Every citation this gate judges: the parts' `evidence` entries plus member-file paths quoted in the prose. */
function citationsOf(state, records) {
  const found = []
  const parts = state && state.parts && typeof state.parts === 'object' ? state.parts : {}
  for (const member of Object.keys(parts)) {
    const row = recordOf(records, parts[member] && parts[member].recordId)
    if (!row) continue
    let part = null
    try { part = JSON.parse(bodyOf(row)) } catch { part = null }
    // ★ RUN 172 — A PART THAT IS NOT JSON IS STILL TEXT SOMEBODY WROTE. `recordPart` accepts a bare body (a member who
    // writes the section as prose, not as a JSON envelope — run 17 did exactly that), and the old `if (!part) continue`
    // made every citation in such a part invisible: the gate judged nothing, said nothing, and the deliverable was
    // produced carrying a pointer to a record that does not exist. A gate that cannot see the text cannot guard it, so
    // the raw body is scanned the same way the JSON fields are (`origin:'prose-raw'` names where the text came from).
    if (part === null || typeof part !== 'object') {
      for (const line of bodyOf(row).split('\n')) {
        eachMemberFile(line, (text) => found.push({ member, origin: 'prose-raw', text }))
      }
      continue
    }
    const evidence = Array.isArray(part.evidence) ? part.evidence.map(str) : []
    for (const entry of evidence) found.push({ member, origin: 'evidence', text: entry })
    for (const field of ['title', 'solution', 'methods', 'rules', 'limits']) {
      const prose = str(part[field])
      if (!prose) continue
      for (const line of prose.split('\n')) {
        eachMemberFile(line, (text) => found.push({ member, origin: 'prose', text }))
      }
    }
  }
  for (const c of found) {
    const m = c.text.match(MEMBER_FILE)
    if (m) { c.category = m[1]; c.cardId = normalizeCitedId(m[2]); c.expectedTrack = TRACK_OF_CATEGORY[m[1]] }
    else if (c.origin === 'evidence') {
      // an evidence entry in the BARE form (`rec-12`, or `rec-12.md#证明`) is a citation too: normalize it the same way
      const bare = normalizeBareId(c.text)
      if (bare && isBareCitation(bare)) { c.cardId = bare; c.expectedTrack = null; c.bare = true }
    }
  }
  return found
}

/**
 * ★★ RUN 177 (run 22, FEEDBACK22 D3) — THE PROSE IS JUDGED THE SAME WAY THE EVIDENCE IS, AT THE SAME MOMENT.
 *
 * Measured on the real machine: a member wrote `Members/r-1/Propos/run22-cubes.md#二` in a part's prose while the
 * record's own id was `rec-6xx`. `recordPart` accepted it (only the `evidence` array was resolved), the paper was
 * cross-reviewed, and the citation rule fired at `render`/`final` — the most expensive moment, after the deliverable had
 * been written. The rule itself was right (the pointer names no record); the MOMENT was wrong. This resolves every
 * member-file pointer a part's prose carries against the same records face, at the writing step, so a fabricated or
 * mistyped citation is refused where it was typed.
 *
 * Pure: (text, records view) in, verdict out — shared by the tool face (which refuses) and any reader (which may ask).
 */
export function checkProsePointers({ text, records, codes = QUALITY_CODES } = {}) {
  if (!records) throw Object.assign(new Error('checkProsePointers needs the records-backed view'), { code: 'VMU_INVALID_ARGUMENT' })
  const pointers = []
  for (const line of str(text).split(String.fromCharCode(10))) eachMemberFile(line, (pointer) => pointers.push(pointer))
  // ★★ RUN 182 (run 27 / FEEDBACK27 F27-2, MEASURED): the scan above resolves member-file POINTERS and nothing else, so a paper
  //   could carry `rec-99999` — an id the institute never recorded — in its prose and be accepted, while the same id in
  //   `evidence[]` was refused. The prose is what a reader checks against the ledger, so a BARE record id in it is a citation
  //   too: it is resolved here, and an id that names no record is refused where it is typed.
  const bareSeen = new Set()
  for (const m of str(text).matchAll(/\brec-[0-9]+\b/g)) {
    const id = m[0]
    if (bareSeen.has(id)) continue
    bareSeen.add(id)
    pointers.push(id)
  }
  if (pointers.length === 0) {
    return { ok: true, provided: 0, resolved: [], unknown: [],
      means: 'the prose carries no Members/<member>/(Propos|Methods|Subproblems|Progress)/<id>.md pointer and no bare record id, so there is nothing to resolve here (the quality gate still judges the deliverable)' }
  }
  const res = checkEvidencePointers({ evidence: pointers, records, codes })
  return { ok: res.ok, provided: res.provided, resolved: res.resolved, unknown: res.unknown,
    means: 'every member-file pointer written in the prose is resolved against the records face at the moment the part is written: a citation that names no record is refused HERE (RUN 177 D3), not at render after the paper is written and cross-reviewed' }
}

/**
 * ★ ROUND 95 — FAIL FAST AT `part`, NOT AT `render`. `recordPart` accepted any `evidence` array, and the FIRST time a
 * pointer was resolved was the quality gate on `render` — i.e. after the paper had been written, cross-reviewed,
 * consulted and finalised. A fabricated pointer therefore cost the whole chain (measured on a live run: the member
 * wrote the paper, ran the consult, and only the last step named the bad citation). This resolves the pointers NOW,
 * against the same records face the gate reads; the pack shell turns `!ok` into a named refusal. Pure: (evidence,
 * records view) in, verdict out — no clock, no filesystem, the same contract as `checkQuality`.
 */
export function checkEvidencePointers({ evidence, records, codes = QUALITY_CODES } = {}) {
  if (!records) throw Object.assign(new Error('checkEvidencePointers needs the records-backed view'), { code: 'VMU_INVALID_ARGUMENT' })
  const list = Array.isArray(evidence) ? evidence.map(str).filter((s) => s !== '') : []
  const resolved = []
  const unknown = []
  for (const pointer of list) {
    // ★★★ RUN 153 (G6): the appendix indexes evidence by RECORD ID, so a bare card id ("rec-12") is a legal pointer.
    // The member-file form was the only accepted shape, and the real run's members wrote the id they were shown on the
    // card — and were refused with "not-a-member-file-pointer" for citing the thing the institute had just told them.
    // ★★ RUN 155 (audit of c5d356b9, small account): two REAL shapes were mis-reported.
    //   · `Members/r-1/Propos/x.md#证明` (a pointer with a section anchor, which is how the cards name their proof) was
    //     matched as if `x.md#证明` were the record id ⇒ `no-such-record` about a record that exists: the anchor is
    //     stripped before resolution and kept only for the receipt.
    //   · a bare id that does not exist (`rec-a153-nosuch`) was answered "not-a-member-file-pointer", which sends the reader
    //     looking for a path problem when the actual problem is that the record is missing. A bare-looking id that fails to
    //     resolve is now `no-such-record`.
    const anchorAt = pointer.indexOf('#')
    const barePointer = anchorAt < 0 ? pointer : pointer.slice(0, anchorAt)
    const anchor = anchorAt < 0 ? null : pointer.slice(anchorAt)
    const m = barePointer.match(MEMBER_FILE)
    if (!m) {
      const bare = normalizeBareId(barePointer)
      if (bare && isBareCitation(bare)) {
        let bareRow = null
        try { bareRow = recordOf(records, bare) } catch { bareRow = null }
        if (bareRow) {
          resolved.push({ pointer, cardId: bare, track: str(bareRow.track), fingerprint: str(bareRow.fingerprint) || null, anchor,
            means: 'bare record id: resolved against the records face and checked for existence (the gate still matches the citation in the prose by id, so this pointer and the citation must name the same card)' + (anchor ? '; the `' + anchor + '` anchor is a section inside that record, not part of its id' : '') })
          continue
        }
        // ★★ RUN 182 (run 27 / FEEDBACK27 F27-3): the refusal named the id and gave the caller nothing to pick from — the
        //   member-file branch had learned to suggest neighbours, this one had not. Ids here are `rec-<n>`, so the nearest
        //   numbers ARE the nearest rows: up to three are offered, ordered by the distance of their number.
        let closest = []
        try {
          const listed = records.list({ limit: 0 })
          const rows = Array.isArray(listed) ? listed : (listed && Array.isArray(listed.items) ? listed.items : [])
          const want = Number(String(bare).replace(/[^0-9]/g, ''))
          closest = rows
            .map((r) => ({ id: String(r && r.id ? r.id : ''), title: String(r && r.title ? r.title : '') }))
            .filter((r) => r.id !== '' && /^rec-[0-9]+$/.test(r.id) && Number.isFinite(want))
            .map((r) => ({ id: r.id, title: r.title, distance: Math.abs(Number(r.id.replace(/[^0-9]/g, '')) - want) }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 3)
        } catch { closest = [] }
        unknown.push({ pointer, cardId: bare, reason: 'no-such-record', anchor, closest,
          closestMeans: closest.length === 0 ? 'no recorded id is numerically near this one' : 'recorded ids whose number is nearest this one — a mistyped digit usually lands on one of these',
          expected: 'Members/<member>/(Propos|Methods|Subproblems|Progress)/<id>.md, or a record id written by the records face' })
        continue
      }
      unknown.push({ pointer, reason: 'not-a-member-file-pointer',
        expected: 'Members/<member>/(Propos|Methods|Subproblems|Progress)/<id>.md, or a bare record id such as "rec-12"' })
      continue
    }
    const category = m[1]
    const cardId = m[2]
    const expectedTrack = TRACK_OF_CATEGORY[category]
    // The records face THROWS for an unknown id (`VMU_NO_SUCH_OBJECT unknown record: …`) — a fail-fast check must turn
    // that into a per-pointer reason, not let one bad pointer abort the whole list.
    let row = null
    try { row = recordOf(records, cardId) } catch { row = null }
    if (!row) {
      // ★★ RUN 179 (run 24 / FEEDBACK24 F24-6): THE REFUSAL SHOWED A TRUNCATED POINTER AND NOTHING TO PICK FROM. The
      // pointer is matched up to the first punctuation mark, so a citation ending `#三、证明（L2）` came back as `#三` —
      // and with a second anchor starting the same way the author had to GUESS which sentence to paste. The refusal now
      // carries the ids on the claimed track that resemble the stem it read, so the correction is a choice, not a guess.
      let nearby = []
      try {
        const listed = records.list({ track: expectedTrack, limit: 0 })
        const rows = Array.isArray(listed) ? listed : (listed && Array.isArray(listed.items) ? listed.items : [])
        // the FIRST THREE letters/digits of the name the pointer read: ids in this institute are `rec-<n>`-shaped, so a
        // mistyped number still lands beside its own family instead of beside nothing at all.
        const stem = String(cardId).replace(/[^A-Za-z0-9_一-鿿]/g, '').slice(0, 3).toLowerCase()
        nearby = rows
          .map((r) => ({ id: String(r && r.id ? r.id : ''), title: String(r && r.title ? r.title : '') }))
          .filter((r) => r.id !== '' && stem !== '' && (r.id.toLowerCase().includes(stem) || r.title.toLowerCase().includes(stem)))
          .slice(0, 3)
      } catch { nearby = [] }
      unknown.push({ pointer, cardId, expectedTrack, reason: 'no-such-record', nearby: nearby.map((r) => r.id),
        nearbyMeans: nearby.length === 0 ? 'no row on that track resembles the name this pointer read' : 'rows on the claimed track whose id or title resembles the name this pointer read — the pointer is matched up to the first punctuation mark, so check whether you pasted a prefix' })
      continue
    }
    const actualTrack = str(row.track)
    if (actualTrack !== expectedTrack) {
      // ★★ RUN 181 (run 26 / FEEDBACK25 F25-4): `wrong-track` listed the two tracks and NOTHING the caller could do —
      // the `no-such-record` branch had learned to suggest, this one had not, even though it knows the row exists and where.
      let elsewhere = []
      try {
        const listed = records.list({ track: expectedTrack, limit: 0 })
        const rows = Array.isArray(listed) ? listed : (listed && Array.isArray(listed.items) ? listed.items : [])
        const stem = String(cardId).replace(/[^A-Za-z0-9_一-鿿]/g, '').slice(0, 3).toLowerCase()
        elsewhere = rows
          .map((r) => String(r && r.id ? r.id : ''))
          .filter((id) => id !== '' && stem !== '' && id.toLowerCase().includes(stem))
          .slice(0, 3)
      } catch { elsewhere = [] }
      unknown.push({ pointer, cardId, expectedTrack, actualTrack: actualTrack || null, reason: 'wrong-track',
        existsAt: { id: cardId, track: actualTrack || null },
        nearby: elsewhere,
        nearbyMeans: 'the id exists, but on ANOTHER track: cite a row that lives on the claimed track, or write the pointer under the directory for the track the row really is on (the category word decides the track)',
        trackMeans: 'the directory word (Propos/Methods/Subproblems/Progress) declares which track the row must be on; this pointer and this row disagree about that' })
      continue
    }
    // ★ RUN 155: an anchor (`#证明`) is a SECTION inside the record, not part of its id - resolve on the pointer
    // WITHOUT it and keep it on the receipt so the citation the member wrote is still recoverable.
    resolved.push({ pointer, cardId, track: expectedTrack, fingerprint: str(row.fingerprint) || null, anchor,
      means: 'member-file pointer: resolved against the records face by its id' + (anchor ? '; the `' + anchor + '` anchor is a section inside that record, not part of its id' : '') })
  }
  return { ok: unknown.length === 0, provided: list.length, resolved, unknown,
    means: 'the pointers are resolved against the records face the moment the part is written, so a fabricated or mistracked citation is refused HERE instead of at render; this face resolves what it is GIVEN and requires NOTHING — an empty `evidence` list passes here, and the DELIVERY gate (gate "evidence", >=1 entry per part) is what refuses it later at render/final. Two faces, two questions: "do these pointers resolve?" (here) and "did every part file evidence?" (the gate)' }
}

/**
 * E3: THE QUALITY GATE. Pure: (md, state, view) in, verdict out. The caller (the pack shell) turns a `!ok` verdict
 * into a named refusal, so the codes live here and the throw lives there — the same split the E4 consult gate uses.
 *
 * The three rules, in the order they are checked (cheapest lie first):
 *   ① CITATION_UNKNOWN — a cited / quoted id must EXIST in the records face, on the track its path claims. An id the
 *      institute never recorded is a fabricated citation, and the message names it (plus member and expected track);
 *   ② EVIDENCE_MISSING — the parts must carry ≥1 evidence entry, and every resolvable citation must come back with a
 *      record FINGERPRINT (the appendix indexes evidence by fingerprint; an entry with none is not an index entry);
 *   ③ VERIFIED_MISSING — every verified conclusion and every solved subproblem the records face holds must APPEAR in the
 *      body. Dropping one is a structural omission: the paper claims completeness while the institute's own results are
 *      missing from it.
 */
export function checkQuality({ md, state, view, codes = QUALITY_CODES } = {}) {
  const text = str(md)
  const records = view && view.records
  if (!records) throw Object.assign(new Error('checkQuality needs the records-backed view'), { code: 'VMU_INVALID_ARGUMENT' })
  const cites = citationsOf(state || {}, records)

  // ① existence
  const unknown = []
  const known = []
  for (const c of cites) {
    if (!c.cardId) continue
    // ★★ RUN 170 (F16-9): the records face THROWS for an unknown id, and this loop let that throw escape as
    // `VMU_NO_SUCH_OBJECT unknown record: …` — a whole `final` call died with a records error instead of the citation
    // verdict that names the offending line. Absence is a VERDICT here, never an exception.
    let row = null
    try { row = recordOf(records, c.cardId) } catch { row = null }
    if (!row) { unknown.push({ id: c.cardId, path: c.text, member: c.member, origin: c.origin, expectedTrack: c.expectedTrack, reason: 'no record with this id' }); continue }
    if (c.expectedTrack && row.track !== c.expectedTrack) {
      unknown.push({ id: c.cardId, path: c.text, member: c.member, origin: c.origin, expectedTrack: c.expectedTrack, actualTrack: str(row.track), reason: 'the id exists but on another track' })
      continue
    }
    known.push({ id: c.cardId, member: c.member, origin: c.origin, fingerprint: str(row.fingerprint) })
  }
  if (unknown.length > 0) {
    const first = unknown[0]
    // ★★ RUN 188 (run 33 / FEEDBACK32 ③, MEASURED): a member wrote its own reasoning to
    //   `VibeMath/Members/<m>/Propos/<name>.md` (exactly what the institute told it to do), cited that path in
    //   `part.evidence`, and got "no record with this id" with no sentence saying WHY a path that plainly exists is not
    //   an id. The appendix indexes RECORDS; a file card on disk is a different thing. When the pointer is shaped like a
    //   file card the refusal says so and names the conversion (write the card into the records face, cite the rec id).
    const looksFileCard = /(^|[\/])Members[\/]/.test(String(first.path || '')) || /\.md$|\.md[^A-Za-z0-9_]/i.test(String(first.id || ''))
    return {
      ok: false, code: codes.CITATION_UNKNOWN,
      message: '论文引用了一个记录库里不存在的 id：' + first.id + '（' + first.path + '，成员 ' + first.member + '，应为 ' + first.expectedTrack + ' 轨；' + first.reason + '）'
        + (looksFileCard ? '——这条指针是磁盘上的「文件卡」（Members/<成员>/Propos/<名>.md），不是记录库里的行：附录按【记录】索引，文件存在不等于有这一行' : ''),
      hint: looksFileCard
        ? '把这张卡写成记录行（例如用 vibe_v5_record_proposition 记一条，或让记录面返回它的 rec-<n>），再把 evidence 换成那个记录 id——文件卡与记录行是两个面，附录只认后者'
        : '在记录面写入该卡时显式给它这个 id（vibe_v5_record_proposition 的 id 参数），或把 evidence 改成记录面返回的 id——附录按【记录】索引，不按文件名索引',
      fileCardHint: looksFileCard || undefined,
      // ★★ RUN 197 (run 38 / FEEDBACK37 1.5, MEASURED): the EVIDENCE refusal named its gate; this one did not, so a reader
      // could not tell the two checks apart by field. Same vocabulary in both places.
      gate: 'citation',
      nextGate: 'evidence',
      missing: unknown,
      missingMeans: 'every entry here is a CITED id that failed to resolve: this gate answered the CITATION question ("does the record exist, on the track the path claims?"), not the EVIDENCE question ("did every part file evidence?")',
    }
  }

  // ② evidence — PER PART. Counting the whole paper's evidence was the F3b defect: one member's evidence shielded every
  // other member's empty appendix entry, so a paper with one evidenced part and nine blank ones passed. The appendix
  // indexes evidence by member, so the check is per member and NAMES the empty parts.
  const evidenceEntries = cites.filter((c) => c.origin === 'evidence')
  const partMembers = Object.keys((state && state.parts) || {})
  const emptyParts = partMembers.filter((m) => !evidenceEntries.some((c) => c.member === m))
  if (partMembers.length > 0 && emptyParts.length > 0) {
    const withEvidence = partMembers.length - emptyParts.length
    return {
      ok: false, code: codes.EVIDENCE_MISSING,
      message: '论文有 ' + emptyParts.length + ' 个部分没有任何证据条目：' + emptyParts.join('、')
        + '（另有 ' + withEvidence + ' 个部分有证据，但不能替它们作证——附录按【每个部分】索引证据，规则要求"证据/引用/不得编造"）',
      hint: '让 ' + emptyParts.join('、') + ' 各自在 recordPart 的 evidence 里写明引用的记录 id（rec-<n>；磁盘上的文件卡 Members/<member>/Propos/p-x.md 不是记录行，会被具名拒）；一个部分有证据不算另一个部分有证据',
      // ★★ RUN 195 (run 37 / FEEDBACK36 2.3, MEASURED): this refusal answered `missing: []` next to `emptyParts: [...]`,
      // and run 37's editor read the empty `missing` as "nothing is missing, so why was I refused?". Two lists, two
      // meanings: `missing` is the list of RECORD IDS that did not resolve, `emptyParts` is the list of parts that filed
      // NO evidence at all. Neither field says which GATE ran, so `gate`/`nextGate` name the check and the one after it.
      gate: 'evidence',
      nextGate: 'required-line',
      missingMeans: 'empty ON PURPOSE: no record id failed to resolve — this refusal is about parts that filed no evidence at all (`emptyParts`), not about unknown ids (`missing`); the two lists are different questions and this gate answered the first',
      missing: [], members: partMembers, emptyParts,
    }
  }
  if (partMembers.length === 0) {
    // Honest about the zero case instead of borrowing the "everyone's evidence is empty" sentence: with no part written,
    // there is nothing to index and nothing to review — the paper has no body at all.
    return {
      ok: false, code: codes.EVIDENCE_MISSING,
      message: '论文没有任何部分：0 位成员写了 part，附录因此没有任何可索引的证据（论文至少要有一段由参与者写的正文）',
      hint: '先让参与者 recordPart 写各自的正文与 evidence；没有正文的"论文"没有可定稿的内容',
      gate: 'evidence',
      nextGate: 'required-line',
      missingMeans: 'empty ON PURPOSE: there is no part at all, so no record id could fail to resolve — the refusal is that the paper has no body (`members`/`emptyParts` are empty too)',
      missing: [], members: [], emptyParts: [],
    }
  }
  const noFingerprint = evidenceEntries
    .map((c) => (c.cardId ? known.filter((k) => k.id === c.cardId)[0] : null))
    .filter((k) => k && !k.fingerprint)
  if (noFingerprint.length > 0) {
    return {
      ok: false, code: codes.EVIDENCE_MISSING,
      message: '附录要按指纹索引证据，但 ' + noFingerprint.length + ' 条证据对应的记录没有指纹：' + noFingerprint.map((k) => k.id).join('、'),
      hint: 'records 面的每条记录都应带 fingerprint；请用记录面重写这条证据（put 会算指纹）',
      missing: noFingerprint,
    }
  }

  // ③ verified / solved content must appear. The token is the CONCLUSION'S OWN NAME (the verified row's title without the
  // track's `已验证｜` prefix), NOT a bare id: an id also appears inside a citation path, so matching it would let a paper
  // "pass" while never stating the result. A row with no title falls back to its card id.
  // ★ RUN 181 (F25-3): the claim a truncated verified name stops in the middle of lives on the CARD (its `statement`
  // field), so the gate reads it back rather than telling the author to paste a ceiling.
  // ★★ RUN 199: the ONE reader (module level, shared with the read face) — see statementOfCardOf.
  const statementOfCard = statementOfCardOf
  const missingEvidence = []
  const nameOf = (t) => str(t).replace(/^已验证｜/, '').trim()
  // ★★ RUN 175 (run 20 FEEDBACK20 ②): a verified conclusion whose title carries math (`Σ_{k=1}^{n} k³ = (n(n+1)/2)²`)
  // forced the author to paste that raw title into the prose, and the renderer — which escapes prose but keeps paired
  // `$…$` as math — turned it into a backslash soup on the page (`Σ\_\{k=1\}\textasciicircum{}\{n\}`). Two things were
  // wrong: the gate demanded the ESCAPED form (so the author could not use the math form the renderer respects), and the
  // hint did not say a paired `$…$` is accepted. The comparison now normalizes BOTH sides (drop `$`, the escaping of
  // `_ ^ { } $ & % #`, and whitespace), so writing the conclusion as math (`$Σ_{k=1}^{n} k³ = (n(n+1)/2)²$`) satisfies the
  // gate AND renders as math; the raw form still matches too, so nothing that passed before fails now.
  const mathKey = (s) => str(s)
    .replace(/\\textasciicircum\{\}/g, '^').replace(/\\textasciitilde\{\}/g, '~')
    .replace(/\\textbackslash\{\}/g, '\\').replace(/\\textless\{\}/g, '<')
    .replace(/\\textgreater\{\}/g, '>').replace(/\\textbar\{\}/g, '|')
    .replace(/\\([&%$#_{}])/g, '$1')
    .replace(/[\\$]/g, '').replace(/[{}\\s]/g, '')
  const textKey = mathKey(text)
  // ★★ RUN 176 (run 21 A4 / FEEDBACK21 F5): the NAME of a card whose title was derived from its claim is truncated at 48
  // chars and ends with `…`. That ellipsis is where the NAME stops, not part of the claim — demanding it verbatim made the
  // author paste a sentence that stops mid-formula (`…Σ_{k=1}^{n} k(k+1) = n(n…`). The gate now matches the claim PREFIX
  // the name really holds; the full statement is the row's `陈述` section, and the receipt says so.
  const claimPrefix = (s) => (String(s).endsWith('…') ? String(s).slice(0, -1).trim() : String(s))
  // ★★ RUN 176 (run 21 A1): `$…$` was offered for ANY name containing `_ ^ { } $ \`. A name that carries an IDENTIFIER
  // (`n_plus_n_eq_two_n`) is the one case where that advice is actively wrong: inside math mode every `_` is a subscript,
  // so the pasted form the gate itself recommended was rejected by xelatex (`! Double subscript.`) — and a finalised paper
  // could not be revised. The receipt now names the algebra-safe form AND refuses to recommend math for an identifier.
  const identifierLike = (s) => /[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]*/.test(String(s))
  const safeForm = (s) => {
    const name = claimPrefix(s)
    const hasMath = /[_^{}$]/.test(name) || name.indexOf(String.fromCharCode(92)) >= 0
    const hasIdentifier = identifierLike(name)
    return {
      line: name,
      truncated: String(s).endsWith('…'),
      hasMath,
      hasIdentifier,
      math: hasMath && !hasIdentifier ? '$' + name + '$' : null,
    }
  }
  const verified = view.verified()
  for (const item of verified.items) {
    const named = safeForm(nameOf(item.title))
    const tokens = named.line ? [named.line] : [item.cardId, item.id].filter(has)
    // ★ RUN 153 (G5): the refusal names the line to paste. The first real run's agent had to strip the "已验证｜" prefix
    // from the title BY HAND (this gate requires the title verbatim) and got it wrong once — a whole `revise` round lost.
    if (!tokens.some((t) => text.includes(t) || (mathKey(t) !== '' && textKey.includes(mathKey(t))))) {
      missingEvidence.push({ kind: 'verified', id: item.id, cardId: item.cardId, title: item.title,
        requiredLine: named.line || String(item.cardId || item.id),
        requiredLineTruncated: named.truncated,
        // ★★ RUN 179 (F24-4): when the NAME stops at `…`, the claim does not. The row's own `陈述` is the sentence to
        // write; naming only the truncated title made the gate impossible to satisfy honestly (the author had to paste a
        // ceiling). `requiredLineFull` is that sentence, and `requiredLineTruncated` says the name is not the claim.
        // ★★ RUN 181 (run 26 / FEEDBACK25 F25-3): `requiredLineFull` was null for every row in the run — the gate asked
        // for a sentence that stopped mid-formula and could not say what the sentence was. The verified row carries its own
        // `陈述` section, but a row promoted before that section existed has only the card: the card's `statement` field is
        // the same claim, so the gate reads it from there instead of shrugging at a truncated name.
        requiredLineFull: named.truncated
          ? (has(item.statement) ? claimPrefix(item.statement) : (statementOfCard(records, item.cardId) || null))
          : null,
        requiredLineMath: named.math,
        requiredLineIdentifier: named.hasIdentifier })
    }
  }
  const solved = view.subproblems()
  for (const item of solved.items) {
    const tokens = [item.title, item.statement].filter(has)
    if (tokens.length === 0) tokens.push(item.id)
    if (!tokens.some((t) => text.includes(t) || (mathKey(t) !== '' && textKey.includes(mathKey(t))))) {
      const sub = item.title ? safeForm(nameOf(item.title)) : null
      missingEvidence.push({ kind: 'subproblem', id: item.id, title: item.title,
        requiredLine: sub && sub.line ? sub.line : String(item.id),
        requiredLineTruncated: sub ? sub.truncated : false,
        requiredLineMath: sub ? sub.math : null,
        requiredLineIdentifier: sub ? sub.hasIdentifier : false })
    }
  }
  if (missingEvidence.length > 0) {
    const first = missingEvidence[0]
    // Name the CARD id first (the identity the institute uses), plus the conclusion's own title: a bare row id would make
    // the refusal un-actionable for a reader who only knows the proposition.
    const firstLabel = (first.cardId || first.id) + (nameOf(first.title) ? '「' + nameOf(first.title) + '」' : '')
    return {
      ok: false, code: codes.VERIFIED_MISSING,
      message: '正文漏掉了记录库里已有的结论：' + missingEvidence.length + ' 条（首条 ' + first.kind + ' `' + firstLabel + '`）——已检验通过的命题与已解决的子问题必须出现在正文里'
        // ★★ RUN 186 (run 29 / FEEDBACK29 D8): the message used to offer the TRUNCATED name as "paste this verbatim",
        // so an author who pasted exactly what the gate printed still failed (the row name stops at `…` on a long
        // formula). When the name is a ceiling, quote the full sentence instead and say which one is which.
        + (first.requiredLineTruncated && first.requiredLineFull
          ? '；这条结论的完整陈述（粘进正文的是它，不是行名）：`' + first.requiredLineFull + '`（行名 `' + first.requiredLine + '` 只是前缀，以 `…` 收尾）'
          : (first.requiredLine ? '；可直接粘进正文的标题行：`' + first.requiredLine + '`' : '')),
      hint: (first.requiredLineIdentifier
        ? '这条结论的行名里有**标识符**（例如 `n_plus_n_eq_two_n`）：把它按**纯文本原样**写进正文，**不要**包进 `$…$`——数学模式里每个 `_` 都是下标，包裹后 xelatex 会报 `! Double subscript.`（run 21 实测：闸自己给过「包进 `$…$`」的建议，照做反而编不过；已改为不再对标识符推荐数学形式）。'
        : (first.requiredLineMath ? '这条结论的标题带数学记号：把它写成配对 `$…$` 的数学形式（例如 `' + first.requiredLineMath + '`）最省事——渲染器会原样保留配对 `$…$` 里的内容当数学，而裸写标题会被转义成满页反斜杠；两种写法都能过这道闸。' : ''))
        + (first.requiredLineTruncated ? '★ 这条行名是被截断的主张（以 `…` 收尾）：闸只要求上面这段前缀出现，不必抄那个省略号；完整陈述见该记录的「陈述」一节。' : '')
        + '这条门判的是**成员写的正文**（渲染时第 3 节由 `verified` 轨自动填充、第 4 节由 `problems` 轨 p=1 自动填充，但自动填充只进渲染出的文件，**不能**代替正文里的结论）：把该结论的标题（去掉「已验证｜」前缀）原样写进某一节的 part 正文，或让作者在下一轮补写，再 render。★ 如果论文已经走到 awaiting-editor（只有 writing 阶段能写 part），先让主编把它退回去：vibe_v5_paper { action: "final", target: "<本论文>", member: "<主席席成员>", decision: "revise", note: "<补哪些结论>" } 回到 writing 后再录 part',
      missing: missingEvidence,
    }
  }

  return {
    ok: true,
    counts: { citations: cites.length, evidence: evidenceEntries.length, resolved: known.length, verified: verified.items.length, subproblems: solved.items.length },
    citations: known,
  }
}

/**
 * ★★ RUN 189 (run 33 / FEEDBACK33 1.3, MEASURED): the gate demands that a paper's prose carry every verified conclusion
 * VERBATIM, and the only way to learn WHICH line was to fail `final` once and read `missing[]`. Run 33's office lost a
 * whole review round that way. The requirement is a property of the LEDGER, not of the failure: this function answers it
 * before anything is written.
 *
 * Returns `{ ok, count, items, means }`. Each item names the row, the line the gate will look for, whether that line is
 * a truncated ceiling (`…`) with the full sentence alongside, and the algebra-safe form when the line carries math.
 * A ledger with no verified conclusion is `{ ok: true, count: 0 }` — "nothing required" is a reading, not a failure.
 */
export function verifiedRequirements({ view, codes = QUALITY_CODES } = {}) {
  if (!view || typeof view.verified !== 'function') {
    return { ok: false, code: codes.VERIFIED_MISSING, count: 0, items: [], message: 'no verified reading is wired, so the required lines cannot be computed here', means: 'the paper quality face reads the verified track through `view.verified()`' }
  }
  const nameOf = (t) => String(t === undefined || t === null ? '' : t).replace(/^已验证｜/, '').trim()
  const claimPrefix = (s) => (String(s).endsWith('…') ? String(s).slice(0, -1).trim() : String(s))
  const identifierLike = (s) => /[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]*/.test(String(s))
  const verified = view.verified()
  // ★★ RUN 199: the verified rows carry {id, cardId, p, title, warrant, source} — NO statement, so a fallback that
  // asked item.statement could only ever answer null. Read the CARD through the same records face the gate uses.
  const recordsFace = view && view.records ? view.records : null
  const items = (verified.items || []).map((item) => {
    const name = claimPrefix(nameOf(item.title))
    const truncated = String(nameOf(item.title)).endsWith('…')
    const hasMath = /[_^{}$]/.test(name) || name.indexOf(String.fromCharCode(92)) >= 0
    const hasIdentifier = identifierLike(name)
    return {
      id: item.id, cardId: item.cardId === undefined ? null : item.cardId,
      requiredLine: name || String(item.cardId || item.id),
      requiredLineTruncated: truncated,
      requiredLineFull: truncated ? (item.statement ? String(item.statement) : statementOfCardOf(recordsFace, item.cardId)) : null,
      requiredLineFullWhy: !truncated ? null
        : (item.statement ? null
          : (statementOfCardOf(recordsFace, item.cardId) === null
            ? 'the verified row name stops at … and its card carries no readable statement line, so no full sentence exists to paste — read the card itself (records get) before writing the prose'
            : 'the name stops at …; the full sentence is the CARD statement line, read back here because the row itself was capped')),
      requiredLineMath: hasMath && !hasIdentifier ? '$' + name + '$' : null,
      requiredLineIdentifier: hasIdentifier,
      writeAs: hasIdentifier ? 'plain text: do NOT wrap an identifier in $…$ (inside math mode every _ is a subscript and xelatex reports "!" Double subscript")'
        : hasMath ? 'paired $…$ around the line (the renderer keeps paired math verbatim) or the raw line — both pass'
          : 'the raw line, verbatim',
    }
  })
  return {
    ok: true, count: items.length, items,
    means: items.length === 0
      ? 'the verified track is empty, so this paper is required to quote no conclusion verbatim — the requirement grows as conclusions are promoted, so read this again before the final render'
      : 'each item is a line the content gate will look for VERBATIM (normalised for math mode) in the paper prose before `final`/`render`; `requiredLineFull` is the sentence to paste when the row name stops at `…`, and `writeAs` says how to write a line that carries math or an identifier',
  }
}
