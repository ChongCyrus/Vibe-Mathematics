/**
 * packs/v5r/blueprint.js — PHASE 12 / R18-B2: THE CARRIER for the institute's PUBLIC BLUEPRINT (公共蓝图).
 *
 * THE DEFECT THIS FILE CLOSES. `vmu.turn.protocolPath` (`settings/schema.js:212`, this pack's value `Shared/Protocol.md`)
 * has exactly two prompt-interpolation consumers (`prompts/v5r-blocks-b.js:236` and `:584`) and NO writer anywhere in the
 * tree: nothing can propose a blueprint, nothing can decide WHICH revision is in force, and nothing can say when the one
 * named by the path was last touched. So "the blueprint is updated on time" was a sentence in a prompt, not a mechanism —
 * and the path was a convention with no edit right attached to it.
 *
 * WHAT THIS FILE IS (and is not). It is the DATA FACE of the blueprint: a `records` track whose rows are revisions, the
 * two verbs that move a revision (`proposeBlueprint` = any member drafts, `adoptBlueprint` = the chair adopts), and a
 * read-out (`blueprintState` / `blueprintFreshness`) that answers "which revision is in force, when was it adopted, is it
 * overdue". It is NOT a filesystem writer (vmu has no fs write face at all — see `verified.js:25-34` for the same
 * reasoning), NOT a second authority over "who may adopt" (the caller passes the roster row; the pack declares the slot
 * in `BLUEPRINT_ADOPT_SLOT`, exactly like `PAPER_CONSULT_ROLES`), and NOT prompt text (that is
 * `prompts/v5r-corrections.js`, and only after the machine can do what it says — the repo's carrier → gate → prompt
 * order).
 *
 * ★ THE TRACK MUST BE DECLARED AT ASSEMBLY TIME. `vmu.records.tracks` is SNAPSHOTTED when the kernel is constructed
 *   (`kernel/records.js:189-221`), so `blueprint` is declared in `packs/v5r/settings/defaults.json` next to `verified`
 *   and `scripts`. An undeclared track is refused by name (`VMU_INVALID_ARGUMENT`, `kernel/records.js:461-465`); this
 *   module does not catch that refusal, because "this deployment does not carry the blueprint track" is an answer.
 *
 * ★ VERSIONING SHAPE — append-only rows, "in force" is DERIVED. Every proposal is one row (`status: draft`), every
 *   adoption is a NEW row (`status: current`, same `revision` as the draft it came from) and the row it replaces is
 *   `records.supersede`d with a reason. The row bodies therefore never lie: a draft was never in force, and a current row
 *   WAS in force at `adoptedAt`. Which revision is in force NOW is computed (highest revision among live `current` rows),
 *   never stored — storing it would be a second writer for one fact.
 *
 * ★ "共同设计" IS A MECHANISM, NOT A SENTENCE (rule: 由院士+常驻研究员共同设计策划、决定如何调整；最终编辑权交给院士).
 *   Until this revision ANY seat could propose alone and the chair could then adopt that single-author draft: the
 *   "共同" half of the rule had no carrier at all. Now:
 *   ① ONE draft per unadopted revision. `proposeBlueprint` on a path that already has an open (unadopted) draft
 *      CONTINUES that draft — same record id, same revision — appending the caller's own section under
 *      `## 共同设计补充｜<member>` and recording them in the draft row's own `authors` header field
 *      (`[{ seat, member, at }]`, persisted in the row, no second store). Re-proposing as the SAME member replaces
 *      that member's own section (`## 正文` base for the first proposer, their section otherwise); the other authors'
 *      prose is never rewritten.
 *   ② `adoptBlueprint` (still CHAIR-ONLY — the rule's 「最终编辑权交给院士」 is untouched) refuses, by name
 *      (`VMU_PACK_V5R_BLUEPRINT_NEEDS_CODESIGN`), a draft whose `authors` do not show BOTH seats: the chair (院士席,
 *      `BLUEPRINT_ADOPT_SLOT`) and at least one resident researcher (常驻研究员席, `BLUEPRINT_CODESIGN_SEAT`). The
 *      refusal names which side is missing and gives a copy-pasteable next call. A row with EMPTY `authors` (written
 *      before this mechanism existed) is refused as "no co-design record" and the message SAYS it is historical data.
 *   ③ Seats are recorded when the caller supplies them (`seat:`); when the kernel-side caller cannot (the v5r tool
 *      forwards only the member id), an author with an UNRECORDED seat is resolved against the adopter: the adopter is
 *      the chair (the caller already checked that slot), so an unrecorded-seat author equal to the adopter is the chair
 *      side and any other one is the resident side. This is an INFERENCE from an act the caller enforced, not a guess:
 *      it is printed in the receipt as `codesign.inference`.
 *
 * ★ STALENESS IS A SIGNAL WITH A RECORDED CONSEQUENCE — NOT A REFUSAL. "按时更新" used to end at one boolean inside a
 *   `state` receipt that no assembler read: the reminder existed, the consequence did not. Now:
 *   ① `blueprintFreshness(store, { now })` is the EXPORTED, PURE reading (no write, no throw, injectable clock) that turn
 *      assembly calls: `{ stale, ageMs, staleAfterMs, means, ... }` — `means` says what staleness MEANS (adopt still
 *      works, the overdue is recorded, the chair should be reminded) so the number is never read alone.
 *   ② The `state` read-out carries the SAME object as `freshness` and — when the revision in force is overdue — writes
 *      `lastStaleSeenAt` into that revision's OWN row (via `records.supersede`, which keeps the id and the version
 *      trail). That is the "consequence path": the overdue becomes a fact on disk that later reads (including the pure
 *      reader) can see, idempotently (one write per adopted revision; the write is reported as
 *      `freshness.persist.written`). `read` stays a pure read.
 *   ③ `adoptBlueprint` reports `overdueUpdate` when it replaces an overdue revision, so "adopt still works, but it is
 *      recorded as a late update" is measured, not promised.
 *   `BLUEPRINT_STALE_AFTER_MS` is pack POLICY (declared here, one number, surfaced in every read-out so a reader can
 *   check it) — it is not a framework default and it is not hidden.
 *
 * ★ THE TEXT SECTION IS "TO THE END OF THE BODY", NOT "UNTIL THE NEXT `## `" (run 36). The text is the user's prose and
 *   may itself contain `## 一、`-style headings. `composeBlueprintBody` writes it under ONE `## 正文` marker, and it is read
 *   back by `blueprintTextOf` — everything after that marker line, verbatim — NOT by the shared `parseBody`, whose
 *   `## `-as-segment-boundary rule is load-bearing for cards/verified rows (`parseCardBody`/`parseVerifiedBody`) and must
 *   not be changed here. Run 36 measured the defect end to end: draft `r-23` was stored at 4134 bytes, the chair adopted it
 *   as `r-29`, and the version IN FORCE came back at 939 bytes with `## 一、`…`## 六、` missing, `bodyTruncated:false` (the
 *   adopted row was born short because `adoptBlueprint` copies `target.text` verbatim — adoption never edits the document).
 *   Reading the section to the end also repairs the READ FACE of drafts already on disk: `r-23` was never damaged.
 *
 * ★ THE THREE READINGS A BLUEPRINT RECEIPT USED TO LEAVE IMPLIED (now printed by `blueprintMeans()`, never left to guess):
 *   ① `status` is read from the HEADER LINE only (`- status：draft|current`). The text is the proposer's verbatim prose, so
 *      an adopted row's text can still say 「状态：草案」 while the row is `current`; the row's status wins, and the text is
 *      never rewritten (`statusMeans` / `textMeans`).
 *   ② `history` is append-only: the row of an ADOPTED draft still says `status:"draft"`, `adoptedBy:null` — it records "this
 *      version was proposed". "Who adopted it" is the current row's `proposalId` (the draft's id) and `adoptedBy` (the
 *      chair) (`historyMeans`).
 *   ③ `revisions` and `currentRevision` are TWO RULERS: `revisions` counts rows on disk for the path (a draft and its
 *      adoption are two rows), `currentRevision` is the revision NUMBER in force. One `propose`+`adopt` round adds 2 rows
 *      but advances the revision by 1, and a draft and its adoption share ONE revision number (`revisionsMeans`).
 */

import { parseBody } from './verified.js'

/** The declared track/kind of the blueprint split (`packs/v5r/settings/defaults.json` declares both). */
export const BLUEPRINT_TRACK = 'blueprint'
export const BLUEPRINT_KIND = 'blueprint'
/** The head title prefix, so a head list reads like a list of revisions. */
export const BLUEPRINT_TITLE_PREFIX = '蓝图｜'
/** The setting that names WHERE the blueprint lives (`settings/schema.js:212`); a row is keyed by it. */
export const BLUEPRINT_PATH_KEY = 'vmu.turn.protocolPath'
/** The one slot the pack lets adopt a revision (院士席). The KERNEL never learns this name (opaque institutional semantics). */
export const BLUEPRINT_ADOPT_SLOT = 'chair'
/** The slot that makes the co-design half real: at least one 常驻研究员 must be an author of the draft the chair adopts. */
export const BLUEPRINT_CODESIGN_SEAT = 'member'
/** The refusal code for "this draft has no 院士+常驻研究员 co-design record" — a NEW code, registered by this module. */
export const BLUEPRINT_NEEDS_CODESIGN = 'VMU_PACK_V5R_BLUEPRINT_NEEDS_CODESIGN'
/** The section marker a co-designing member's own contribution is stored under, inside the `## 正文` text. */
export const BLUEPRINT_CODESIGN_SECTION = '## 共同设计补充｜'
/** Pack policy: how old an adopted revision may be before the read-out calls it overdue. It is the DEFAULT only — a
 *  deployment may declare `vmu.blueprint.staleAfterMs` (`settings/schema.js`), and every reading reports which one it used
 *  (`staleAfterMsSource: 'setting' | 'policy'`). Reason: a window nobody can set is a rule nobody can observe or tune. */
export const BLUEPRINT_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000
/** The DECLARED setting that overrides the window above (`settings/schema.js`; office-owned, hot H2). */
export const BLUEPRINT_STALE_KEY = 'vmu.blueprint.staleAfterMs'
/** Resolve ONE window from a caller-supplied candidate: a finite number ≥ 0 wins, anything else falls back to policy. */
export function staleWindowOf(candidate) {
  const n = typeof candidate === 'string' && candidate.trim() !== '' ? Number(candidate) : candidate
  if (Number.isFinite(n) && n >= 0) return { ms: Math.floor(n), source: 'setting' }
  return { ms: BLUEPRINT_STALE_AFTER_MS, source: 'policy' }
}
/** ★ The source travels WITH the number. A resolver that only sees `ms` cannot tell a tuned 30 days from the policy's
 *  30 days (run: the `state` receipt passed the millis down and the NESTED reading re-derived the source as "setting",
 *  so one receipt said "policy" and the other said "setting" about the SAME number). A declared source wins. */
function windowWith(candidate, declaredSource) {
  const w = staleWindowOf(candidate)
  const s = txt(declaredSource)
  return { ms: w.ms, source: s !== '' ? s : w.source }
}
/** The body status vocabulary (two stored states; "superseded" is DERIVED from a higher revision, never stored). */
export const BLUEPRINT_STATUSES = Object.freeze(['draft', 'current'])
/**
 * Header field order of a blueprint body (stable, so two identical texts fingerprint the same). `authors` and
 * `lastStaleSeenAt` were APPENDED by the B4/B5 mechanisms: old fields keep their name and position, so every row written
 * before this revision still parses, and a new row is a superset of the old shape.
 */
export const BLUEPRINT_FIELDS = Object.freeze(['path', 'status', 'revision', 'proposedBy', 'proposedAt', 'adoptedBy', 'adoptedAt', 'proposalId', 'note', 'authors', 'lastStaleSeenAt'])
/** The section that holds the blueprint text itself. ONE such marker per row; it is a START marker, not a boundary. */
export const BLUEPRINT_TEXT_SECTION = '正文'
/** The seats the ledger rule names. Kept as DATA so the refusal and the receipt quote the same two names. */
export const BLUEPRINT_SEATS = Object.freeze([BLUEPRINT_ADOPT_SLOT, BLUEPRINT_CODESIGN_SEAT])

/**
 * The readings a blueprint receipt must PRINT instead of leaving implied (see the header ★ blocks ①②③). They name the
 * field, the unit and the reason; the receipts repeat them verbatim, so a reader never has to reconcile two numbers or two
 * words that are both on disk. Kept as DATA so the tool layer and the tests can point at the same sentences.
 */
export const BLUEPRINT_MEANINGS = Object.freeze({
  status: 'status 只取表头那一行（- status：draft|current）：draft = 已提出、未生效，current = 曾被落成（是否现行见 currentRevision 与 history）。正文里的字不参与判断，所以正文自称「草案」不代表本行 status。',
  text: '正文 = 该行 `## 正文` 标记之后的全部内容，逐字（正文自带的 `## ` 标题是内容，不是段边界）。落成不改写正文：只改 status 与签名，所以正文里的「状态：草案」是提案当时的措辞，不代表现行版状态。',
  history: 'history 是 append-only：被采纳的草案在 history 里仍是 status:"draft"、adoptedBy:null（那行记的是「曾作为草案提出」）。「谁采纳了它」由现行行的 proposalId（指向草案 id）与 adoptedBy（采纳人）回答。',
  revisions: 'revisions = 本路径现存行数（草案一行 + 生效行一行，各算一行）；currentRevision = 生效行的 revision 数值。一次 propose+adopt 令 revisions +2、currentRevision 只 +1（草案与它的生效行共用同一个 revision 号）。',
  codesign: 'authors = 这条草案的设计者留痕（[{seat,member,at}]，持久在草案行自己的表头，不是第二份状态）。同一路径下未落成的草案只有一份：再次 propose 是「续写同一草案」（同 id、同 revision），把本人的 section 追加在 `## 正文` 的 `## 共同设计补充｜<member>` 下。adopt 前必须同时有院士席（chair）与常驻研究员席（member）作者；adopt 仍是院士的最终编辑权，不因共同设计而转移。',
  freshness: 'freshness = 「按时更新」的读数（stale / ageMs / staleAfterMs / means / lastStaleSeenAt）。stale 不是拒绝：adopt 仍可做；但 state 读到逾期时会把 lastStaleSeenAt 写进现行版自己的行（幂等，只写一次），让「逾期过」成为磁盘上的历史，而不是一句没人读的提示。',
})

/** The receipt-shaped view of `BLUEPRINT_MEANINGS`: `statusMeans` / `textMeans` / `historyMeans` / `revisionsMeans` / … */
export function blueprintMeans() {
  return {
    statusMeans: BLUEPRINT_MEANINGS.status,
    textMeans: BLUEPRINT_MEANINGS.text,
    historyMeans: BLUEPRINT_MEANINGS.history,
    revisionsMeans: BLUEPRINT_MEANINGS.revisions,
    codesignMeans: BLUEPRINT_MEANINGS.codesign,
    freshnessMeans: BLUEPRINT_MEANINGS.freshness,
  }
}

/**
 * THE TEXT OF A BLUEPRINT ROW: everything after the `## 正文` marker line, to the END of the body, verbatim.
 *
 * WHY NOT `parseBody`: that shared parser (verified.js) treats EVERY `## ` line as a segment boundary, which is right for
 * cards/verified rows and wrong here — the blueprint text is user prose that carries its own `## 一、` headings, so the
 * `正文` section it reported stopped at the first inner heading (run 36: a 4134-byte draft adopted into a 939-byte row).
 * The marker is a START, not a boundary: a text that happens to contain a `## 正文` line of its own keeps it as content.
 * A row with no marker (foreign writer / header only) yields `''`, not a guess.
 */
export function blueprintTextOf(body) {
  const raw = body === undefined || body === null ? '' : String(body)
  if (raw === '') return ''
  const marker = '## ' + BLUEPRINT_TEXT_SECTION
  const lines = raw.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].replace(/\r$/, '').trim() === marker) { start = i; break }
  }
  if (start < 0) return ''
  return txt(lines.slice(start + 1).map((line) => line.replace(/\r$/, '')).join('\n'))
}

/** Split the `## 正文` text of a co-designed draft into `{ base, sections: [{ member, text }] }`. */
export function blueprintCodesignSections(text) {
  const raw = txt(text)
  if (raw === '') return { base: '', sections: [] }
  const base = []
  const sections = []
  let current = null
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    const trimmed = line.trim()
    if (trimmed.startsWith(BLUEPRINT_CODESIGN_SECTION)) {
      current = { member: trimmed.slice(BLUEPRINT_CODESIGN_SECTION.length).trim(), lines: [] }
      sections.push(current)
      continue
    }
    if (current === null) base.push(line)
    else current.lines.push(line)
  }
  return { base: txt(base.join('\n')), sections: sections.map((s) => ({ member: s.member, text: txt(s.lines.join('\n')) })) }
}

/** Compose the `## 正文` text: the first proposer's base, then one attributed section per co-designer (order kept). */
export function composeBlueprintText(base, sections) {
  let out = txt(base)
  for (const section of Array.isArray(sections) ? sections : []) {
    const member = txt(section && section.member)
    if (member === '') continue
    out += (out === '' ? '' : '\n\n') + BLUEPRINT_CODESIGN_SECTION + member + '\n' + txt(section && section.text)
  }
  return out
}

const SEP = '：'

function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  return err
}

const txt = (v) => String(v === undefined || v === null ? '' : v).trim()
const timeText = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : '')
/** The body stores times as ISO text (human-readable); reads convert back, and an unparsable stamp is `null`, not 0. */
const msOf = (v) => {
  const raw = txt(v)
  if (raw === '') return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : null
}

/** The `authors` header field is ONE JSON array on one line — the draft row's own persistent shape (no second store). */
function serializeAuthors(authors) {
  const list = (Array.isArray(authors) ? authors : [])
    .filter((a) => a && txt(a.member) !== '')
    .map((a) => {
      const seat = txt(a.seat)
      const entry = { seat: seat === '' ? null : seat, member: txt(a.member) }
      if (txt(a.at) !== '') entry.at = txt(a.at)
      if (txt(a.updatedAt) !== '') entry.updatedAt = txt(a.updatedAt)
      return entry
    })
  return list.length === 0 ? '' : JSON.stringify(list)
}

/** Tolerant read of `authors`: a malformed field is REPORTED (`problems`), never silently turned into "no authors". */
function parseAuthorsField(value) {
  const raw = txt(value)
  if (raw === '') return { authors: [], problems: [] }
  let parsed = null
  try { parsed = JSON.parse(raw) } catch (e) { return { authors: [], problems: ['authors is not valid JSON: ' + raw.slice(0, 120)] } }
  if (!Array.isArray(parsed)) return { authors: [], problems: ['authors is not a JSON array: ' + raw.slice(0, 120)] }
  const authors = []
  const problems = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') { problems.push('an authors entry is not an object'); continue }
    const member = txt(item.member)
    if (member === '') { problems.push('an authors entry has no member'); continue }
    const seat = txt(item.seat)
    if (seat !== '' && !BLUEPRINT_SEATS.includes(seat)) problems.push('authors entry ' + member + ' has seat "' + seat + '", not one of ' + BLUEPRINT_SEATS.join('|'))
    authors.push({ seat: seat === '' ? null : seat, member, at: txt(item.at) === '' ? null : txt(item.at), updatedAt: txt(item.updatedAt) === '' ? null : txt(item.updatedAt) })
  }
  return { authors, problems }
}

/**
 * Compose a blueprint ROW body: header fields (in `BLUEPRINT_FIELDS` order) + ONE `## 正文` marker + the text VERBATIM.
 * The marker comes last and reads "to the end" (`blueprintTextOf`), so the user's own `## ` headings stay content; the
 * text is never prefixed, escaped or re-heading-ified. Pure (no clock: the caller passes `proposedAt` / `adoptedAt`), so
 * the same revision composed twice fingerprints the same.
 */
export function composeBlueprintBody(row = {}) {
  const lines = []
  for (const key of BLUEPRINT_FIELDS) {
    let value = ''
    if (key === 'proposedAt' || key === 'adoptedAt' || key === 'lastStaleSeenAt') value = timeText(row[key])
    else if (key === 'authors') value = typeof row.authors === 'string' ? txt(row.authors) : serializeAuthors(row.authors)
    else value = txt(row[key])
    if (value === '') continue
    lines.push('- ' + key + SEP + value)
  }
  lines.push('## ' + BLUEPRINT_TEXT_SECTION)
  const body = txt(row.text)
  if (body !== '') lines.push(body)
  return lines.join('\n')
}

/**
 * Parse a blueprint row into `{ ok, id, fields, text, authors, lastStaleSeenAt, problems }`. Tolerant where real data
 * needs it (the shared `parseBody`: `：` / `:` / `=`, CR, whitespace) and REPORTING where silence would lie (unknown
 * status, missing path, non-integer revision, malformed `authors`): a row this module did not compose is `problems`,
 * not a guess.
 */
export function parseBlueprint(row) {
  if (!row || typeof row !== 'object') return { ok: false, reason: 'not a record row', id: null, fields: {}, text: '', authors: [], lastStaleSeenAt: null, problems: [], malformed: [] }
  const id = row.id === undefined || row.id === null ? null : String(row.id)
  const parsed = parseBody(row.body)
  const fields = parsed.fields || {}
  // ★ The text comes from `blueprintTextOf` (to the END of the body), NOT from `parsed.sections['正文']`: the shared
  // parser cuts at every inner `## ` line, which silently amputated adopted blueprints in run 36 (4134 B → 939 B).
  const text = blueprintTextOf(row.body)
  const authorsParsed = parseAuthorsField(fields.authors)
  const problems = []
  if (String(row.track || '') !== BLUEPRINT_TRACK) problems.push('track is ' + String(row.track || '(none)') + ', not ' + BLUEPRINT_TRACK)
  if (String(row.kind || '') !== BLUEPRINT_KIND) problems.push('kind is ' + String(row.kind || '(none)') + ', not ' + BLUEPRINT_KIND)
  if (String(row.state || 'live') !== 'live') problems.push('record state is ' + String(row.state || '(none)'))
  const status = txt(fields.status)
  if (!BLUEPRINT_STATUSES.includes(status)) problems.push('status "' + status + '" is not one of ' + BLUEPRINT_STATUSES.join('|'))
  const revision = Number(fields.revision)
  if (!Number.isInteger(revision) || revision <= 0) problems.push('revision "' + txt(fields.revision) + '" is not a positive integer')
  if (txt(fields.path) === '') problems.push('path is empty')
  problems.push(...authorsParsed.problems)
  return { ok: problems.length === 0, id, fields, status, revision, text, authors: authorsParsed.authors, lastStaleSeenAt: msOf(fields.lastStaleSeenAt), problems, malformed: parsed.malformed || [] }
}

/** Every live blueprint row for ONE path, oldest revision first. Reads are by `records.list` + `records.get`. */
export function listBlueprints({ records, path }) {
  const track = refuseIfNoRecords(records)
  const wanted = txt(path)
  if (wanted === '') throw refuse('VMU_INVALID_ARGUMENT', 'a blueprint read needs the path it is about',
    'pass path:<the blueprint path>, e.g. this pack\'s ' + BLUEPRINT_PATH_KEY + ' value (Shared/Protocol.md)')
  const listed = track.list({ track: BLUEPRINT_TRACK, limit: 0 })
  const rows = []
  const skipped = []
  for (const item of Array.isArray(listed.items) ? listed.items : []) {
    const id = String(item.id)
    const got = track.get({ id })
    const parsed = parseBlueprint(got)
    if (!parsed.ok) { skipped.push({ id, problems: parsed.problems }); continue }
    if (parsed.fields.path !== wanted) continue
    rows.push(Object.assign({}, parsed, { at: got.at === undefined ? null : got.at, title: got.title, bytes: got.bytes, fingerprint: got.fingerprint, updatedAt: got.updatedAt }))
  }
  rows.sort((a, b) => (a.revision - b.revision) || (a.fields.proposedAt < b.fields.proposedAt ? -1 : 1))
  return { rows, skipped, declared: true }
}

/**
 * ★ B5 — THE CO-DESIGN READING. Given a draft's `authors` and the member about to adopt, answer which of the two seats
 * the ledger rule names are represented. Pure and explicit:
 *   · a recorded seat wins (`chair` / `member`);
 *   · an UNRECORDED seat is resolved against the adopter — the caller has ALREADY checked that the adopter is the chair
 *     (`requireChairSeat` in `packs/v5r/tools.js`), so "author === adopter" is the chair side and "some other author"
 *     is the resident side. `inference` says so in the receipt; it is not hidden.
 * `ok` is true only when BOTH sides have at least one author — the rule's 「共同」, measured instead of asserted.
 */
export function blueprintCodesignStatus(authors = [], adopter = '') {
  const who = txt(adopter)
  const list = (Array.isArray(authors) ? authors : []).filter((a) => a && txt(a.member) !== '')
  const sideOf = (a) => {
    const seat = txt(a.seat)
    if (seat === BLUEPRINT_ADOPT_SLOT) return BLUEPRINT_ADOPT_SLOT
    if (seat === BLUEPRINT_CODESIGN_SEAT) return BLUEPRINT_CODESIGN_SEAT
    if (seat !== '') return 'other'
    if (who === '') return 'unknown'
    return txt(a.member) === who ? BLUEPRINT_ADOPT_SLOT : BLUEPRINT_CODESIGN_SEAT
  }
  const chair = list.filter((a) => sideOf(a) === BLUEPRINT_ADOPT_SLOT).map((a) => txt(a.member))
  const resident = list.filter((a) => sideOf(a) === BLUEPRINT_CODESIGN_SEAT).map((a) => txt(a.member))
  const missing = []
  if (chair.length === 0) missing.push(BLUEPRINT_ADOPT_SLOT)
  if (resident.length === 0) missing.push(BLUEPRINT_CODESIGN_SEAT)
  return {
    ok: missing.length === 0,
    hasChair: chair.length > 0,
    hasResident: resident.length > 0,
    missing,
    chair,
    resident,
    authors: list,
    seats: BLUEPRINT_SEATS.slice(),
    inference: 'seat 未记录的 authors 按 adopt 人解析：adopt 人（' + (who || '（未指定）') + '）已由调用方校验为院士席 ⇒ 与之同 id 的作者算院士侧，其余算常驻研究员侧。记录了 seat 的作者按 seat 原样判定。',
  }
}

/** The named refusal for a draft with no co-design record (message names the MISSING side + the historical case). */
function codesignRefusal(target, status) {
  const id = String(target.id)
  const revision = Number.isFinite(target.revision) ? 'r' + target.revision : '(revision 未知)'
  const named = status.missing.map((seat) => (seat === BLUEPRINT_ADOPT_SLOT
    ? '院士席（' + BLUEPRINT_ADOPT_SLOT + '）'
    : '常驻研究员席（' + BLUEPRINT_CODESIGN_SEAT + '）'))
  const who = status.authors.map((a) => txt(a.member) + (txt(a.seat) === '' ? '（seat 未记录）' : '（' + txt(a.seat) + '）')).join('、')
  const historical = status.authors.length === 0
    ? ' 该草案的 authors 为空：这是「共同设计」机制上线前的历史数据（旧草案只记了单个 proposedBy=' + (txt(target.fields.proposedBy) || '（未记录）') + '），机制上没有任何共同设计留痕，不能当成「已共同设计」。'
    : ''
  const message = '蓝图草案 ' + id + '（' + revision + '）缺少共同设计留痕：还缺 ' + named.join(' 与 ') + '。'
    + '规则要求「由院士+常驻研究员共同设计策划、决定如何调整」：adopt 是院士的最终编辑权，不能替代共同设计。'
    + '（当前 authors：' + (who || '（空）') + '）' + historical
  const hint = '下一步（可复制；同一路径下未落成的草案会被续写为同一个 draft id）：\n'
    + '① 院士本人写自己的设计 section：vibe_v5_blueprint { action: "propose", path: "' + txt(target.fields.path) + '", member: "<院士 id>", text: "<院士的设计/调整说明>" }\n'
    + '② 至少一名常驻研究员写自己的 section：vibe_v5_blueprint { action: "propose", path: "' + txt(target.fields.path) + '", member: "<研究员 id>", text: "<研究员的设计/调整说明>" }\n'
    + '③ 再由主席席落成：vibe_v5_blueprint { action: "adopt", path: "' + txt(target.fields.path) + '", draft: "' + id + '" }\n'
    + '模块调用方也可显式续写：proposeBlueprint({ draft: "' + id + '", path: "' + txt(target.fields.path) + '", by: "<id>", text: "..." })'
  return refuse(BLUEPRINT_NEEDS_CODESIGN, message, hint)
}

/**
 * ★ B4 — THE EXPORTED FRESHNESS READING. Pure (reads `records`, writes NOTHING, never throws) and explicit:
 * `blueprintFreshness(store = {}, options = {})` with `store = { records, path }` and `options = { now }`.
 * Returns `{ stale, ageMs, staleAfterMs, means, … }` — `means` is non-empty for every state (including "no carrier" and
 * "no current revision") so a caller such as turn assembly never reads a bare boolean. `now` is injectable; the default
 * is `Date.now()`. `available:false` means "this deployment cannot answer" — NOT "up to date".
 */
export function blueprintFreshness(store = {}, options = {}) {
  const src = store && typeof store === 'object' ? store : {}
  const opts = options && typeof options === 'object' ? options : {}
  const now = Number.isFinite(opts.now) ? opts.now : Date.now()
  const window = windowWith(opts.staleAfterMs, opts.staleAfterMsSource)
  const path = txt(src.path)
  const records = src.records || null
  if (path === '') return freshnessReading({ path: '', available: false, reason: 'no-path', stamp: now, staleAfterMs: window.ms, staleAfterMsSource: window.source })
  if (!records || typeof records.list !== 'function' || typeof records.get !== 'function') {
    return freshnessReading({ path, available: false, reason: 'no-records-face', stamp: now, staleAfterMs: window.ms, staleAfterMsSource: window.source })
  }
  try {
    const { rows } = listBlueprints({ records, path })
    const currents = rows.filter((r) => r.status === 'current')
    const inForce = currents.length === 0 ? null : currents[currents.length - 1]
    const adoptedAt = inForce === null ? null : msOf(inForce.fields.adoptedAt)
    const ageMs = adoptedAt === null ? null : Math.max(0, now - adoptedAt)
    const stale = adoptedAt !== null && ageMs > window.ms
    return freshnessReading({
      path,
      available: true,
      inForce,
      adoptedAt,
      ageMs,
      stale,
      staleAfterMs: window.ms,
      staleAfterMsSource: window.source,
      stamp: now,
      lastStaleSeenAt: inForce === null ? null : msOf(inForce.fields.lastStaleSeenAt),
    })
  } catch (e) {
    return freshnessReading({
      path,
      available: false,
      reason: (e && e.code) || 'read-failed',
      stamp: now,
      staleAfterMs: window.ms,
      staleAfterMsSource: window.source,
      error: { code: (e && e.code) || null, message: String((e && e.message) || e) },
    })
  }
}

/** One shape for `blueprintFreshness` and for the `freshness` object the `state` receipt carries. */
function freshnessReading(input = {}) {
  const available = input.available === true
  const inForce = input.inForce || null
  const adoptedAt = Number.isFinite(input.adoptedAt) ? input.adoptedAt : null
  const ageMs = Number.isFinite(input.ageMs) ? input.ageMs : null
  const stale = input.stale === true
  const stamp = Number.isFinite(input.stamp) ? input.stamp : Date.now()
  const lastStaleSeenAt = Number.isFinite(input.lastStaleSeenAt) ? input.lastStaleSeenAt : null
  const window = windowWith(input.staleAfterMs, input.staleAfterMsSource)
  const staleAfterMs = window.ms
  const staleAfterMsSource = txt(input.staleAfterMsSource) || window.source
  const windowLabel = staleAfterMs >= 86400000 ? Math.round(staleAfterMs / 86400000) + ' 天' : staleAfterMs + ' 毫秒'
  const overdueDays = stale && ageMs !== null ? Math.floor(ageMs / 86400000) : 0
  const currentRevision = inForce === null ? 0 : inForce.revision
  const means = available
    ? (inForce === null
      ? '这条路径上还没有生效版本（currentRevision=0）：没有「按时更新」可言——草案不会自己生效，要院士席 adopt 才有现行版；此时 fresh 不代表蓝图存在。'
      : (stale
        ? '逾期（> ' + windowLabel + '）：现行版 r' + currentRevision + ' 已 ' + overdueDays + ' 天没有更新。后果（不是拒绝）：adopt 仍可做；但本次 state 读数的副作用是把 lastStaleSeenAt 写进现行版自己的行（幂等，只写一次），让逾期成为可回查的历史；轮次装配应据此提醒院士复查并 propose 新一版，adopt 后的回执会把这次落成记为 overdueUpdate=true。'
        : '未逾期：现行版 r' + currentRevision + ' 在 ' + windowLabel + ' 窗口内（ageMs=' + (ageMs === null ? 'null' : ageMs) + '）。本次读数不写 lastStaleSeenAt，也不阻止任何调用。'))
    : (input.reason === 'no-path'
      ? '没有给出蓝图路径（path 为空）：读不到蓝图不是「按时」，而是无从判断——请传 path（本 pack 的 ' + BLUEPRINT_PATH_KEY + '）再判定逾期。'
      : '这个部署没有可读的 records 面：蓝图载体不存在，读不到不是「按时更新」；没有任何可判断的逾期，也没有后果路径。')
  const staleNote = available
    ? (inForce === null
      ? '这条路径上还没有被落成的蓝图：提案不会自己生效（staleness 只在有 current 时有意义）'
      : (stale ? '已超过 ' + windowLabel + ' 没有更新（提示，不是拒绝）' : null))
    : null
  return {
    ok: true,
    available,
    path: txt(input.path),
    track: BLUEPRINT_TRACK,
    kind: BLUEPRINT_KIND,
    stale,
    hasCurrent: inForce !== null,
    currentRevision,
    current: inForce === null ? null : {
      id: inForce.id,
      revision: inForce.revision,
      adoptedBy: inForce.fields.adoptedBy || null,
      adoptedAt,
      proposedBy: inForce.fields.proposedBy || null,
    },
    updatedAt: adoptedAt,
    ageMs,
    staleAfterMs,
    staleAfterMsSource,
    overdueDays,
    lastStaleSeenAt,
    means,
    staleNote,
    readAt: stamp,
    reason: input.reason || null,
    error: input.error || null,
    // The `state` read-out is the only caller that may write (`persist`); the pure reader always reports "not attempted".
    persist: input.persist || { attempted: false, written: false, error: null },
    note: 'freshness 是读数：stale 是「该更新了」的信号，不是拒绝。要让它有后果（留痕），走 state 读数——它会把 lastStaleSeenAt 写进现行版行。',
  }
}

/**
 * The read-out: which revision is IN FORCE, when it was adopted, whether it is overdue, and the drafts waiting for a
 * decision. Derives over the rows — no clock is read unless the caller supplies `now`.
 *
 * ★ THE OVERDUE CONSEQUENCE LIVES HERE, because this is the one read-out the tool layer reaches (`state`). When the
 * revision in force is overdue and its row does not yet carry `lastStaleSeenAt` for this adoption, the row is
 * `records.supersede`d with the stamp added (same id, same revision, version trail kept). Idempotent: one write per
 * adopted revision; a failed write is REPORTED (`persist.error`), never thrown out of a read-out.
 */
export function blueprintState({ records, path, now = null, staleAfterMs = null, staleAfterMsSource = null }) {
  const { rows, skipped } = listBlueprints({ records, path })
  const track = records
  const stamp = Number.isFinite(now) ? now : Date.now()
  const window = windowWith(staleAfterMs, staleAfterMsSource)
  const currents = rows.filter((r) => r.status === 'current')
  const inForce = currents.length === 0 ? null : currents[currents.length - 1]
  const adoptedAt = inForce === null ? null : msOf(inForce.fields.adoptedAt)
  const ageMs = adoptedAt === null ? null : Math.max(0, stamp - adoptedAt)
  const stale = adoptedAt !== null && ageMs > window.ms
  const currentRevision = inForce ? inForce.revision : 0
  const drafts = rows.filter((r) => r.status === 'draft' && r.revision > currentRevision)
  let lastStaleSeenAt = inForce === null ? null : msOf(inForce.fields.lastStaleSeenAt)
  const persist = { attempted: false, written: false, error: null }
  if (stale && inForce !== null) {
    const needsWrite = lastStaleSeenAt === null || (adoptedAt !== null && lastStaleSeenAt < adoptedAt)
    if (needsWrite) {
      persist.attempted = true
      const iso = new Date(stamp).toISOString()
      const composed = composeBlueprintBody({
        path: txt(inForce.fields.path),
        status: 'current',
        revision: inForce.revision,
        proposedBy: txt(inForce.fields.proposedBy),
        proposedAt: msOf(inForce.fields.proposedAt),
        adoptedBy: txt(inForce.fields.adoptedBy),
        adoptedAt: msOf(inForce.fields.adoptedAt),
        proposalId: txt(inForce.fields.proposalId),
        note: txt(inForce.fields.note),
        authors: inForce.authors,
        lastStaleSeenAt: stamp,
        text: inForce.text,
      })
      try {
        if (typeof track.supersede !== 'function') throw refuse('VMU_ENGINE_UNAVAILABLE', 'this records face has no supersede, so the overdue mark cannot be persisted')
        const wrote = track.supersede({
          id: inForce.id,
          body: composed,
          by: txt(inForce.fields.adoptedBy) || null,
          reason: '蓝图 r' + inForce.revision + ' 逾期读数留痕（lastStaleSeenAt=' + iso + '）：只加读数，不改 status/revision/正文',
        })
        const freshRow = typeof track.get === 'function' ? track.get({ id: inForce.id }) : null
        inForce.fields.lastStaleSeenAt = iso
        inForce.lastStaleSeenAt = stamp
        if (freshRow && freshRow.ok !== false) { inForce.bytes = freshRow.bytes; inForce.fingerprint = freshRow.fingerprint; inForce.updatedAt = freshRow.updatedAt }
        else if (wrote && wrote.fingerprint) inForce.fingerprint = wrote.fingerprint
        lastStaleSeenAt = stamp
        persist.written = true
      } catch (e) {
        persist.error = { code: (e && e.code) || null, message: String((e && e.message) || e) }
      }
    }
  }
  const freshness = freshnessReading({
    path: txt(path),
    available: true,
    inForce,
    adoptedAt,
    ageMs,
    stale,
    stamp,
    lastStaleSeenAt,
    persist,
    staleAfterMs: window.ms,
    staleAfterMsSource: window.source,
  })
  return {
    ok: true,
    path: txt(path),
    track: BLUEPRINT_TRACK,
    kind: BLUEPRINT_KIND,
    hasCurrent: inForce !== null,
    current: inForce === null ? null : {
      id: inForce.id,
      revision: inForce.revision,
      adoptedBy: inForce.fields.adoptedBy || null,
      adoptedAt,
      proposedBy: inForce.fields.proposedBy || null,
      title: inForce.title || null,
      fingerprint: inForce.fingerprint || null,
      bytes: inForce.bytes === undefined ? null : inForce.bytes,
      authors: inForce.authors,
      lastStaleSeenAt: lastStaleSeenAt,
    },
    currentRevision,
    updatedAt: adoptedAt,
    ageMs,
    stale,
    staleAfterMs: window.ms,
    staleAfterMsSource: window.source,
    staleNote: freshness.staleNote,
    lastStaleSeenAt,
    // ★ B4: the SAME shape `blueprintFreshness` returns (plus `persist`, which says whether this read wrote the mark).
    freshness,
    drafts: drafts.map((d) => ({ id: d.id, revision: d.revision, proposedBy: d.fields.proposedBy || null, proposedAt: d.fields.proposedAt || null, bytes: d.bytes === undefined ? null : d.bytes, authors: d.authors })),
    draftsWaiting: drafts.length,
    revisions: rows.length,
    // `proposalId` is what links an adopted row to the draft it came from: without it, reading ② ("the adopted draft still
    // says draft") has no answer in the receipt itself.
    history: rows.map((r) => ({ id: r.id, revision: r.revision, status: r.status, proposedBy: r.fields.proposedBy || null, adoptedBy: r.fields.adoptedBy || null, proposalId: txt(r.fields.proposalId) || null, authors: r.authors })),
    superseded: rows.filter((r) => r.status === 'current' && inForce !== null && r.id !== inForce.id).map((r) => ({ id: r.id, revision: r.revision })),
    skipped,
    // ★ The four readings this receipt used to leave implied (see the header ★ block): status vs the text, append-only
    // history, and revisions-vs-currentRevision. Printed on every state read so no caller has to infer the convention.
    ...blueprintMeans(),
  }
}

/** Read ONE row by id (draft or current), with its text, its authors and its problems. Pure read. */
export function readBlueprint({ records, id }) {
  const track = refuseIfNoRecords(records)
  const wanted = txt(id)
  if (wanted === '') throw refuse('VMU_INVALID_ARGUMENT', 'a blueprint read needs the record id', 'pass id:<the row id returned by state/draft>')
  const got = track.get({ id: wanted })
  const parsed = parseBlueprint(got)
  return Object.assign({ ok: parsed.ok, row: got, problems: parsed.problems }, parsed)
}

/**
 * PROPOSE a revision — or, when this path already has an UNADOPTED draft, CONTINUE that draft (B5's 「共同」).
 *
 * WHY CONTINUE INSTEAD OF A SECOND DRAFT ROW: a new draft's revision is always `currentRevision + 1`, so before the
 * first adoption there is only ONE unadopted revision per path; a second draft row would share that number and make
 * "which draft is the decision about" ambiguous. Continuing keeps `id`/`revision` and appends the caller's own section,
 * so the design work of both seats lands in ONE document — which is exactly what "共同设计策划" needs.
 *
 * Any member may draft (the permission question is only about ADOPTION); the caller passes the roster row it resolved so
 * this module never guesses identities. `seat` is OPTIONAL: when the caller knows the slot it records it; when it does
 * not, `null` is stored and `blueprintCodesignStatus` resolves the side against the adopter.
 */
export function proposeBlueprint({ records, path, text, by, draft = '', at = null, note = '', seat = '' }) {
  const track = refuseIfNoRecords(records)
  const wantedPath = txt(path)
  if (wantedPath === '') throw refuse('VMU_INVALID_ARGUMENT', 'a blueprint proposal needs the path it is about',
    'pass path:<the blueprint path> (this pack\'s ' + BLUEPRINT_PATH_KEY + ' is Shared/Protocol.md)')
  const body = txt(text)
  if (body === '') throw refuse('VMU_INVALID_ARGUMENT', 'a blueprint proposal needs text',
    'pass text:<the full blueprint revision> — an empty revision would silently adopt "nothing"')
  const author = txt(by)
  if (author === '') throw refuse('VMU_INVALID_ARGUMENT', 'a blueprint proposal needs its author',
    'pass member:<the roster id proposing> — an unsigned revision cannot be reviewed or audited')
  const stamp = Number.isFinite(at) ? at : Date.now()
  const seatGiven = txt(seat)
  const before = listBlueprints({ records, path: wantedPath })
  const currentRevision = before.rows.filter((r) => r.status === 'current').reduce((max, r) => Math.max(max, r.revision), 0)
  const revision = currentRevision + 1
  const explicit = txt(draft)
  let target = null
  if (explicit !== '') {
    target = before.rows.filter((r) => r.id === explicit)[0] || null
    if (target === null) {
      throw refuse('VMU_NO_SUCH_OBJECT', 'no blueprint row "' + explicit + '" on path "' + wantedPath + '"',
        'state lists the drafts of this path with their ids; omit draft to continue the open draft, or pass one of those ids')
    }
    if (target.fields.path !== wantedPath) {
      throw refuse('VMU_INVALID_ARGUMENT', 'row ' + target.id + ' is about path "' + txt(target.fields.path) + '", not "' + wantedPath + '"',
        'pass the path this draft belongs to (state lists each draft under its path)')
    }
    if (target.status !== 'draft') {
      throw refuse('VMU_STATE', 'row ' + target.id + ' is "' + target.status + '", not a draft: it cannot be continued',
        'a current row is history; propose the NEXT revision (a new draft) and let both seats design it')
    }
    const adoptedAs = before.rows.filter((r) => r.status === 'current' && txt(r.fields.proposalId) === target.id)
    if (adoptedAs.length > 0) {
      throw refuse('VMU_STATE', '草案 ' + target.id + ' 已经被落成为 r' + adoptedAs[0].revision + '（' + adoptedAs[0].id + '），不能续写',
        '要改蓝图请 propose 一版新的（revision 自动加一）并让两位设计者各自留痕，再 adopt 新的那一份')
    }
    if (target.revision !== revision) {
      throw refuse('VMU_STATE', '草案 ' + target.id + ' 是 r' + target.revision + '，不是「待落成的下一版 r' + revision + '」',
        '蓝图的下一版号变了（现行版已被更新）：请对新的一版重新 propose（不传 draft 即续写当前未落成的草案）')
    }
  } else {
    const open = before.rows.filter((r) => r.status === 'draft' && r.revision > currentRevision)
    target = open.length === 0 ? null : open[open.length - 1]
  }
  const entry = { seat: seatGiven === '' ? null : seatGiven, member: author, at: timeText(stamp) }
  if (target === null) {
    const authors = [entry]
    const composed = composeBlueprintBody({ path: wantedPath, status: 'draft', revision, proposedBy: author, proposedAt: stamp, note, authors, text: body })
    const put = track.put({
      track: BLUEPRINT_TRACK,
      kind: BLUEPRINT_KIND,
      title: BLUEPRINT_TITLE_PREFIX + wantedPath + '｜r' + revision + '｜草案',
      body: composed,
      settled: false,
      by: author,
    })
    return {
      ok: true,
      action: 'propose',
      id: put.id,
      path: wantedPath,
      revision,
      baseRevision: currentRevision,
      status: 'draft',
      proposedBy: author,
      proposedAt: stamp,
      continued: false,
      authors,
      codesign: blueprintCodesignStatus(authors, ''),
      fingerprint: put.fingerprint || null,
      deduplicated: put.deduplicated === true,
      note: '草案不会生效：要有主席席落成（adopt）才是 current。共同设计：让院士与本所至少一名常驻研究员各自 propose 一次（同一路径下会续写这同一份草案），adopt 前两方都必须有 authors 留痕。',
    }
  }
  // ── CONTINUATION: same record id, same revision; only this author's own role/section changes ────────────────────
  const authors = target.authors.slice()
  const index = authors.findIndex((a) => txt(a.member) === author)
  const merged = { seat: seatGiven === '' ? (index >= 0 ? authors[index].seat : null) : seatGiven, member: author, at: timeText(stamp), updatedAt: timeText(stamp) }
  if (index >= 0) {
    merged.at = authors[index].at || timeText(stamp)
    authors[index] = merged
  } else {
    authors.push(merged)
  }
  const split = blueprintCodesignSections(target.text)
  let textNext = ''
  if (txt(target.fields.proposedBy) === author) {
    // The first proposer edits the `## 正文` base; the other designers' sections are preserved as they wrote them.
    textNext = composeBlueprintText(body, split.sections)
  } else {
    const sections = split.sections.filter((s) => txt(s.member) !== author)
    sections.push({ member: author, text: body })
    textNext = composeBlueprintText(split.base, sections)
  }
  const composed = composeBlueprintBody({
    path: wantedPath,
    status: 'draft',
    revision: target.revision,
    proposedBy: txt(target.fields.proposedBy),
    proposedAt: msOf(target.fields.proposedAt),
    note: txt(note) || txt(target.fields.note),
    authors,
    text: textNext,
  })
  const wrote = track.supersede({
    id: target.id,
    body: composed,
    by: author,
    reason: '蓝图草案 ' + target.id + ' 共同设计续写（' + author + ' 写入自己的 section）',
  })
  return {
    ok: true,
    action: 'propose',
    id: target.id,
    path: wantedPath,
    revision: target.revision,
    baseRevision: currentRevision,
    status: 'draft',
    proposedBy: txt(target.fields.proposedBy) || author,
    proposedAt: msOf(target.fields.proposedAt),
    updatedAt: stamp,
    continued: true,
    author,
    authors,
    codesign: blueprintCodesignStatus(authors, ''),
    fingerprint: (wrote && wrote.fingerprint) || null,
    deduplicated: false,
    note: '★ 续写的是同一份草案（id/r 不变）：' + author + ' 的 section 已写进 `## 共同设计补充｜' + author + '`；正文里其他设计者的文字没有被改写。adopt 前 authors 必须同时有院士席与常驻研究员席。',
  }
}

/**
 * ADOPT a draft as the revision in force. The CALLER has already checked that `by` may adopt (the tool layer resolves
 * the roster row and compares its slot to `BLUEPRINT_ADOPT_SLOT`); this function refuses to guess a role.
 *
 * ★ B5: before minting the current row it requires the draft's `authors` to show BOTH seats (院士 + 至少一名常驻研究员).
 * The chair-only edit right is UNCHANGED (the rule's 「最终编辑权交给院士」) — co-design is a precondition of the final
 * edit, not a transfer of it.
 */
export function adoptBlueprint({ records, path, draft, by, at = null, note = '', staleAfterMs = null, staleAfterMsSource = null }) {
  const track = refuseIfNoRecords(records)
  const wantedPath = txt(path)
  if (wantedPath === '') throw refuse('VMU_INVALID_ARGUMENT', 'adopting a blueprint needs the path', 'pass path:<the blueprint path>')
  const adopter = txt(by)
  if (adopter === '') throw refuse('VMU_INVALID_ARGUMENT', 'adoption is a signed act', 'pass member:<the chair seat id adopting> — nobody adopts anonymously')
  const target = readBlueprint({ records, id: draft })
  if (target.fields.path !== wantedPath) {
    throw refuse('VMU_INVALID_ARGUMENT', 'draft ' + target.id + ' is about path "' + txt(target.fields.path) + '", not "' + wantedPath + '"',
      'pass the path this draft belongs to (state lists each draft with its path)')
  }
  if (target.status !== 'draft') {
    throw refuse('VMU_STATE', 'record ' + target.id + ' is "' + target.status + '", not a draft: it cannot be adopted again',
      'propose a NEW revision (any member may) and adopt that one; the adopted row stays as history')
  }
  const codesign = blueprintCodesignStatus(target.authors, adopter)
  if (codesign.ok !== true) throw codesignRefusal(target, codesign)
  const before = listBlueprints({ records, path: wantedPath })
  // ★ A DRAFT ROW NEVER CHANGES STATUS (append-only), so "adopted twice" cannot be caught by looking at the draft alone:
  // it is caught by asking whether a CURRENT row already names this draft as its proposal. Without this check a second
  // adoption would mint a second "to be in force" row for one decision — two writers for one fact, hidden in history.
  const already = before.rows.filter((r) => r.status === 'current' && txt(r.fields.proposalId) === String(target.id))
  if (already.length > 0) {
    throw refuse('VMU_STATE', '草案 ' + target.id + ' 已经被落成为 r' + already[0].revision + '（' + already[0].id + '），不能重复落成',
      '提案 → 落成是一次性的：要改蓝图请重新 propose 一版，再 adopt 那一份（历史只增不改）')
  }
  const currents = before.rows.filter((r) => r.status === 'current')
  const previous = currents.length === 0 ? null : currents[currents.length - 1]
  const revision = target.revision
  if (previous !== null && previous.revision >= revision) {
    throw refuse('VMU_STATE', '草案 r' + revision + ' 比现行版本 r' + previous.revision + ' 旧，不能落成',
      'propose 一版新蓝图（revision 会自动加一），再 adopt 新的那一份')
  }
  const stamp = Number.isFinite(at) ? at : Date.now()
  const previousAdoptedAt = previous === null ? null : msOf(previous.fields.adoptedAt)
  const previousAgeMs = previousAdoptedAt === null ? null : Math.max(0, stamp - previousAdoptedAt)
  const window = windowWith(staleAfterMs, staleAfterMsSource)
  const overdueUpdate = previousAgeMs !== null && previousAgeMs > window.ms
  const composed = composeBlueprintBody({
    path: wantedPath,
    status: 'current',
    revision,
    proposedBy: target.fields.proposedBy,
    proposedAt: target.fields.proposedAt,
    adoptedBy: adopter,
    adoptedAt: stamp,
    proposalId: target.id,
    note,
    // B5: the co-design record travels WITH the adopted row (who designed this version is a fact of the version).
    authors: target.authors,
    // The ADOPTED row carries the draft's TEXT verbatim: adoption changes the status/signature, never the document.
    text: target.text,
  })
  const put = track.put({
    track: BLUEPRINT_TRACK,
    kind: BLUEPRINT_KIND,
    title: BLUEPRINT_TITLE_PREFIX + wantedPath + '｜r' + revision + '｜生效',
    body: composed,
    settled: true,
    by: adopter,
  })
  let superseded = null
  if (previous !== null) {
    superseded = track.supersede({
      id: previous.id,
      by: adopter,
      reason: '蓝图 r' + previous.revision + ' 被 r' + revision + '（' + put.id + '）取代',
    })
  }
  const after = blueprintState({ records, path: wantedPath, now: stamp, staleAfterMs: window.ms, staleAfterMsSource: window.source })
  return {
    ok: true,
    action: 'adopt',
    id: put.id,
    path: wantedPath,
    revision,
    status: 'current',
    adoptedBy: adopter,
    adoptedAt: stamp,
    proposalId: target.id,
    authors: target.authors,
    codesign,
    superseded: superseded === null ? null : { id: previous.id, revision: previous.revision, rev: superseded.rev },
    previousRevision: previous === null ? 0 : previous.revision,
    // ★ B4: "adopt still works, but a late update is RECORDED" — this is the measured consequence, not a refusal.
    overdueUpdate,
    previousAgeMs,
    inForce: after.current,
    // The adopt receipt answers the SAME questions as `state`, because run 36 read these numbers out of a SEPARATE state
    // call and concluded the two disagreed: `revisions` (rows on disk) and `currentRevision` (revision in force) are two
    // rulers, and `history` still carries the draft row as a draft. Both are carried here WITH their explanations.
    currentRevision: after.currentRevision,
    revisions: after.revisions,
    history: after.history,
    ...blueprintMeans(),
    stale: after.stale,
    staleAfterMs: after.staleAfterMs,
    staleAfterMsSource: after.staleAfterMsSource,
    freshness: after.freshness,
    fingerprint: put.fingerprint || null,
    note: previous === null
      ? '这是该路径上的第一个生效版本'
      : (overdueUpdate
        ? '上一版（r' + previous.revision + '）已逾期 ' + Math.floor(previousAgeMs / 86400000) + ' 天才更新：本次落成记为 overdueUpdate（不拒绝，但已留痕），上一版写入历史并 supersede'
        : '上一版（r' + previous.revision + '）已写入历史并 supersede，读面只把最高 revision 当现行版'),
  }
}

/** A records face is required; its ABSENCE is named (the deployment carries no records track ⇒ no blueprint carrier). */
function refuseIfNoRecords(records) {
  if (!records || typeof records.put !== 'function' || typeof records.list !== 'function' || typeof records.get !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', 'this deployment has no records face, so it cannot carry a blueprint track',
      'the blueprint carrier IS a records track (' + BLUEPRINT_TRACK + '): construct the kernel with its records face')
  }
  return records
}
