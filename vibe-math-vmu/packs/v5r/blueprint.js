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
 * read-out (`blueprintState`) that answers "which revision is in force, when was it adopted, is it overdue". It is NOT
 * a filesystem writer (vmu has no fs write face at all — see `verified.js:25-34` for the same reasoning), NOT a second
 * authority over "who may adopt" (the caller passes the roster row; the pack declares the slot in `BLUEPRINT_ADOPT_SLOT`,
 * exactly like `PAPER_CONSULT_ROLES`), and NOT prompt text (that is `prompts/v5r-corrections.js`, and only after the
 * machine can do what it says — the repo's carrier → gate → prompt order).
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
 * ★ STALENESS IS A SIGNAL, NOT A REFUSAL. "按时更新" is a reminder, and a reminder that blocks work is a gate nobody
 *   asked for. `blueprintState` reports `updatedAt` / `ageMs` / `stale` / `staleAfterMs`; the tool receipt repeats them.
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
/** The one slot the pack lets adopt a revision. The KERNEL never learns this name (opaque institutional semantics). */
export const BLUEPRINT_ADOPT_SLOT = 'chair'
/** Pack policy: how old an adopted revision may be before the read-out calls it overdue. */
export const BLUEPRINT_STALE_AFTER_MS = 30 * 24 * 60 * 60 * 1000
/** The body status vocabulary (two stored states; "superseded" is DERIVED from a higher revision, never stored). */
export const BLUEPRINT_STATUSES = Object.freeze(['draft', 'current'])
/** Header field order of a blueprint body (stable, so two identical texts fingerprint the same). */
export const BLUEPRINT_FIELDS = Object.freeze(['path', 'status', 'revision', 'proposedBy', 'proposedAt', 'adoptedBy', 'adoptedAt', 'proposalId', 'note'])
/** The section that holds the blueprint text itself. ONE such marker per row; it is a START marker, not a boundary. */
export const BLUEPRINT_TEXT_SECTION = '正文'

/**
 * The four readings a blueprint receipt must PRINT instead of leaving implied (see the header ★ block ①②③). They name the
 * field, the unit and the reason; the receipts repeat them verbatim, so a reader never has to reconcile two numbers or two
 * words that are both on disk. Kept as DATA so the tool layer and the tests can point at the same sentences.
 */
export const BLUEPRINT_MEANINGS = Object.freeze({
  status: 'status 只取表头那一行（- status：draft|current）：draft = 已提出、未生效，current = 曾被落成（是否现行见 currentRevision 与 history）。正文里的字不参与判断，所以正文自称「草案」不代表本行 status。',
  text: '正文 = 该行 `## 正文` 标记之后的全部内容，逐字（正文自带的 `## ` 标题是内容，不是段边界）。落成不改写正文：只改 status 与签名，所以正文里的「状态：草案」是提案当时的措辞，不代表现行版状态。',
  history: 'history 是 append-only：被采纳的草案在 history 里仍是 status:"draft"、adoptedBy:null（那行记的是「曾作为草案提出」）。「谁采纳了它」由现行行的 proposalId（指向草案 id）与 adoptedBy（采纳人）回答。',
  revisions: 'revisions = 本路径现存行数（草案一行 + 生效行一行，各算一行）；currentRevision = 生效行的 revision 数值。一次 propose+adopt 令 revisions +2、currentRevision 只 +1（草案与它的生效行共用同一个 revision 号）。',
})

/** The receipt-shaped view of `BLUEPRINT_MEANINGS`: `statusMeans` / `textMeans` / `historyMeans` / `revisionsMeans`. */
export function blueprintMeans() {
  return { statusMeans: BLUEPRINT_MEANINGS.status, textMeans: BLUEPRINT_MEANINGS.text, historyMeans: BLUEPRINT_MEANINGS.history, revisionsMeans: BLUEPRINT_MEANINGS.revisions }
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

/**
 * Compose a blueprint ROW body: header fields (in `BLUEPRINT_FIELDS` order) + ONE `## 正文` marker + the text VERBATIM.
 * The marker comes last and reads "to the end" (`blueprintTextOf`), so the user's own `## ` headings stay content; the
 * text is never prefixed, escaped or re-heading-ified. Pure (no clock: the caller passes `proposedAt` / `adoptedAt`), so
 * the same revision composed twice fingerprints the same.
 */
export function composeBlueprintBody(row = {}) {
  const lines = []
  for (const key of BLUEPRINT_FIELDS) {
    const value = key === 'proposedAt' || key === 'adoptedAt' ? timeText(row[key]) : txt(row[key])
    if (value === '') continue
    lines.push('- ' + key + SEP + value)
  }
  lines.push('## ' + BLUEPRINT_TEXT_SECTION)
  const body = txt(row.text)
  if (body !== '') lines.push(body)
  return lines.join('\n')
}

/**
 * Parse a blueprint row into `{ ok, id, fields, text, problems }`. Tolerant where real data needs it (the shared
 * `parseBody`: `：` / `:` / `=`, CR, whitespace) and REPORTING where silence would lie (unknown status, missing path,
 * non-integer revision): a row this module did not compose is `problems`, not a guess.
 */
export function parseBlueprint(row) {
  if (!row || typeof row !== 'object') return { ok: false, reason: 'not a record row', id: null, fields: {}, text: '', problems: [] }
  const id = row.id === undefined || row.id === null ? null : String(row.id)
  const parsed = parseBody(row.body)
  const fields = parsed.fields || {}
  // ★ The text comes from `blueprintTextOf` (to the END of the body), NOT from `parsed.sections['正文']`: the shared
  // parser cuts at every inner `## ` line, which silently amputated adopted blueprints in run 36 (4134 B → 939 B).
  const text = blueprintTextOf(row.body)
  const problems = []
  if (String(row.track || '') !== BLUEPRINT_TRACK) problems.push('track is ' + String(row.track || '(none)') + ', not ' + BLUEPRINT_TRACK)
  if (String(row.kind || '') !== BLUEPRINT_KIND) problems.push('kind is ' + String(row.kind || '(none)') + ', not ' + BLUEPRINT_KIND)
  if (String(row.state || 'live') !== 'live') problems.push('record state is ' + String(row.state || '(none)'))
  const status = txt(fields.status)
  if (!BLUEPRINT_STATUSES.includes(status)) problems.push('status "' + status + '" is not one of ' + BLUEPRINT_STATUSES.join('|'))
  const revision = Number(fields.revision)
  if (!Number.isInteger(revision) || revision <= 0) problems.push('revision "' + txt(fields.revision) + '" is not a positive integer')
  if (txt(fields.path) === '') problems.push('path is empty')
  return { ok: problems.length === 0, id, fields, status, revision, text, problems, malformed: parsed.malformed || [] }
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
 * The read-out: which revision is IN FORCE, when it was adopted, whether it is overdue, and the drafts waiting for a
 * decision. Pure derivation over the rows — no clock is read here unless the caller supplies `now`.
 */
export function blueprintState({ records, path, now = null }) {
  const { rows, skipped } = listBlueprints({ records, path })
  const stamp = Number.isFinite(now) ? now : Date.now()
  const currents = rows.filter((r) => r.status === 'current')
  const inForce = currents.length === 0 ? null : currents[currents.length - 1]
  const adoptedAt = inForce === null ? null : msOf(inForce.fields.adoptedAt)
  const ageMs = adoptedAt === null ? null : Math.max(0, stamp - adoptedAt)
  const stale = adoptedAt !== null && ageMs > BLUEPRINT_STALE_AFTER_MS
  const currentRevision = inForce ? inForce.revision : 0
  const drafts = rows.filter((r) => r.status === 'draft' && r.revision > currentRevision)
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
    },
    currentRevision,
    updatedAt: adoptedAt,
    ageMs,
    stale,
    staleAfterMs: BLUEPRINT_STALE_AFTER_MS,
    staleNote: inForce === null
      ? '这条路径上还没有被落成的蓝图：提案不会自己生效（staleness 只在有 current 时有意义）'
      : (stale
        ? '已超过 ' + Math.round(BLUEPRINT_STALE_AFTER_MS / 86400000) + ' 天没有更新（提示，不是拒绝）'
        : null),
    drafts: drafts.map((d) => ({ id: d.id, revision: d.revision, proposedBy: d.fields.proposedBy || null, proposedAt: d.fields.proposedAt || null, bytes: d.bytes === undefined ? null : d.bytes })),
    draftsWaiting: drafts.length,
    revisions: rows.length,
    // `proposalId` is what links an adopted row to the draft it came from: without it, reading ② ("the adopted draft still
    // says draft") has no answer in the receipt itself.
    history: rows.map((r) => ({ id: r.id, revision: r.revision, status: r.status, proposedBy: r.fields.proposedBy || null, adoptedBy: r.fields.adoptedBy || null, proposalId: txt(r.fields.proposalId) || null })),
    superseded: rows.filter((r) => r.status === 'current' && inForce !== null && r.id !== inForce.id).map((r) => ({ id: r.id, revision: r.revision })),
    skipped,
    // ★ The FOUR readings this receipt used to leave implied (see the header ★ block): status vs the text, append-only
    // history, and revisions-vs-currentRevision. Printed on every state read so no caller has to infer the convention.
    ...blueprintMeans(),
  }
}

/** Read ONE row by id (draft or current), with its text and problems. */
export function readBlueprint({ records, id }) {
  const track = refuseIfNoRecords(records)
  const wanted = txt(id)
  if (wanted === '') throw refuse('VMU_INVALID_ARGUMENT', 'a blueprint read needs the record id', 'pass id:<the row id returned by state/draft>')
  const got = track.get({ id: wanted })
  const parsed = parseBlueprint(got)
  return Object.assign({ ok: parsed.ok, row: got, problems: parsed.problems }, parsed)
}

/**
 * PROPOSE a revision. Any member may draft (the permission question is only about ADOPTION); the caller passes the
 * roster row it resolved so this module never guesses identities.
 */
export function proposeBlueprint({ records, path, text, by, at = null, note = '' }) {
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
  const before = listBlueprints({ records, path: wantedPath })
  const currentRevision = before.rows.filter((r) => r.status === 'current').reduce((max, r) => Math.max(max, r.revision), 0)
  const revision = currentRevision + 1
  const composed = composeBlueprintBody({ path: wantedPath, status: 'draft', revision, proposedBy: author, proposedAt: stamp, note, text: body })
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
    fingerprint: put.fingerprint || null,
    deduplicated: put.deduplicated === true,
    note: '草案不会生效：要有主席席落成（adopt）才是 current',
  }
}

/**
 * ADOPT a draft as the revision in force. The CALLER has already checked that `by` may adopt (the tool layer resolves
 * the roster row and compares its slot to `BLUEPRINT_ADOPT_SLOT`); this function refuses to guess a role.
 */
export function adoptBlueprint({ records, path, draft, by, at = null, note = '' }) {
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
  const after = blueprintState({ records, path: wantedPath, now: stamp })
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
    superseded: superseded === null ? null : { id: previous.id, revision: previous.revision, rev: superseded.rev },
    previousRevision: previous === null ? 0 : previous.revision,
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
    fingerprint: put.fingerprint || null,
    note: previous === null
      ? '这是该路径上的第一个生效版本'
      : '上一版（r' + previous.revision + '）已写入历史并 supersede，读面只把最高 revision 当现行版',
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
