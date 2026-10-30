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
const MEMBER_FILE = /Members[\/\\][^\/\\\s]*[\/\\](Propos|Methods|Subproblems|Progress)[\/\\]([^\/\\\s]+?)(?:\.md)?(?=$|[\s，。；、）)\]])/
const TRACK_OF_CATEGORY = Object.freeze({ Propos: 'propositions', Methods: 'methods', Subproblems: 'problems', Progress: 'progress' })

const str = (v) => (v === undefined || v === null ? '' : String(v))
const has = (v) => str(v).trim() !== ''

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

/** Every citation this gate judges: the parts' `evidence` entries plus member-file paths quoted in the prose. */
function citationsOf(state, records) {
  const found = []
  const parts = state && state.parts && typeof state.parts === 'object' ? state.parts : {}
  for (const member of Object.keys(parts)) {
    const row = recordOf(records, parts[member] && parts[member].recordId)
    if (!row) continue
    let part = null
    try { part = JSON.parse(bodyOf(row)) } catch { part = null }
    if (!part) continue
    const evidence = Array.isArray(part.evidence) ? part.evidence.map(str) : []
    for (const entry of evidence) found.push({ member, origin: 'evidence', text: entry })
    for (const field of ['title', 'solution', 'methods', 'rules', 'limits']) {
      const prose = str(part[field])
      if (!prose) continue
      for (const line of prose.split('\n')) {
        const m = line.match(MEMBER_FILE)
        if (m) found.push({ member, origin: 'prose', text: m[0] })
      }
    }
  }
  for (const c of found) {
    const m = c.text.match(MEMBER_FILE)
    if (m) { c.category = m[1]; c.cardId = m[2]; c.expectedTrack = TRACK_OF_CATEGORY[m[1]] }
  }
  return found
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
      const bare = barePointer.match(BARE_CARD_ID) || (/^[A-Za-z][A-Za-z0-9_-]*$/.test(barePointer) ? [barePointer, barePointer] : null)
      if (bare) {
        let bareRow = null
        try { bareRow = recordOf(records, bare[1]) } catch { bareRow = null }
        if (bareRow) {
          resolved.push({ pointer, cardId: bare[1], track: str(bareRow.track), fingerprint: str(bareRow.fingerprint) || null, anchor,
            means: 'bare record id: resolved against the records face and checked for existence (the gate still matches the citation in the prose by id, so this pointer and the citation must name the same card)' + (anchor ? '; the `' + anchor + '` anchor is a section inside that record, not part of its id' : '') })
          continue
        }
        unknown.push({ pointer, cardId: bare[1], reason: 'no-such-record', anchor,
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
    if (!row) { unknown.push({ pointer, cardId, expectedTrack, reason: 'no-such-record' }); continue }
    const actualTrack = str(row.track)
    if (actualTrack !== expectedTrack) {
      unknown.push({ pointer, cardId, expectedTrack, actualTrack: actualTrack || null, reason: 'wrong-track' })
      continue
    }
    // ★ RUN 155: an anchor (`#证明`) is a SECTION inside the record, not part of its id - resolve on the pointer
    // WITHOUT it and keep it on the receipt so the citation the member wrote is still recoverable.
    resolved.push({ pointer, cardId, track: expectedTrack, fingerprint: str(row.fingerprint) || null, anchor,
      means: 'member-file pointer: resolved against the records face by its id' + (anchor ? '; the `' + anchor + '` anchor is a section inside that record, not part of its id' : '') })
  }
  return { ok: unknown.length === 0, provided: list.length, resolved, unknown,
    means: 'the pointers are resolved against the records face the moment the part is written, so a fabricated or mistracked citation is refused HERE instead of at render; the gate still owns the deliverable (it also requires >=1 evidence entry per part and a fingerprint for every citation)' }
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
    const row = recordOf(records, c.cardId)
    if (!row) { unknown.push({ id: c.cardId, path: c.text, member: c.member, origin: c.origin, expectedTrack: c.expectedTrack, reason: 'no record with this id' }); continue }
    if (row.track !== c.expectedTrack) {
      unknown.push({ id: c.cardId, path: c.text, member: c.member, origin: c.origin, expectedTrack: c.expectedTrack, actualTrack: str(row.track), reason: 'the id exists but on another track' })
      continue
    }
    known.push({ id: c.cardId, member: c.member, origin: c.origin, fingerprint: str(row.fingerprint) })
  }
  if (unknown.length > 0) {
    const first = unknown[0]
    return {
      ok: false, code: codes.CITATION_UNKNOWN,
      message: '论文引用了一个记录库里不存在的 id：' + first.id + '（' + first.path + '，成员 ' + first.member + '，应为 ' + first.expectedTrack + ' 轨；' + first.reason + '）',
      hint: '在记录面写入该卡时显式给它这个 id（vibe_v5_record_proposition 的 id 参数），或把 evidence 改成记录面返回的 id——附录按【记录】索引，不按文件名索引',
      missing: unknown,
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
      hint: '让 ' + emptyParts.join('、') + ' 各自在 recordPart 的 evidence 里写明引用的证据路径（Members/<member>/Propos/p-x.md 这种形状会被逐条核实）；一个部分有证据不算另一个部分有证据',
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
  const missingEvidence = []
  const nameOf = (t) => str(t).replace(/^已验证｜/, '').trim()
  const verified = view.verified()
  for (const item of verified.items) {
    const named = nameOf(item.title)
    const tokens = named ? [named] : [item.cardId, item.id].filter(has)
    // ★ RUN 153 (G5): the refusal names the line to paste. The first real run's agent had to strip the "已验证｜" prefix
    // from the title BY HAND (this gate requires the title verbatim) and got it wrong once — a whole `revise` round lost.
    if (!tokens.some((t) => text.includes(t))) {
      missingEvidence.push({ kind: 'verified', id: item.id, cardId: item.cardId, title: item.title,
        requiredLine: named || String(item.cardId || item.id) })
    }
  }
  const solved = view.subproblems()
  for (const item of solved.items) {
    const tokens = [item.title, item.statement].filter(has)
    if (tokens.length === 0) tokens.push(item.id)
    if (!tokens.some((t) => text.includes(t))) {
      missingEvidence.push({ kind: 'subproblem', id: item.id, title: item.title,
        requiredLine: item.title ? nameOf(item.title) : String(item.id) })
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
        + (first.requiredLine ? '；可直接粘进正文的标题行：`' + first.requiredLine + '`' : ''),
      hint: '这条门判的是**成员写的正文**（渲染时第 3 节由 `verified` 轨自动填充、第 4 节由 `problems` 轨 p=1 自动填充，但自动填充只进渲染出的文件，**不能**代替正文里的结论）：把该结论的标题（去掉「已验证｜」前缀）原样写进某一节的 part 正文，或让作者在下一轮补写，再 render',
      missing: missingEvidence,
    }
  }

  return {
    ok: true,
    counts: { citations: cites.length, evidence: evidenceEntries.length, resolved: known.length, verified: verified.items.length, subproblems: solved.items.length },
    citations: known,
  }
}
