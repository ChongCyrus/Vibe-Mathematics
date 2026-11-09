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
 * overdue". It is NOT a second authority over "who may adopt" (the caller passes the roster row; the pack declares the
 * slot in `BLUEPRINT_ADOPT_SLOT`, exactly like `PAPER_CONSULT_ROLES`), and NOT prompt text (that is
 * `prompts/v5r-corrections.js`, and only after the machine can do what it says — the repo's carrier → gate → prompt
 * order).
 *
 * ★★ RUN 225-A: THE MD FILE IS THE TRUTH; THE ROW IS ITS INDEX. Until this revision the blueprint existed ONLY as a row
 *   body inside `<root>/vmu/state.json`, so the document a human opens on disk and the document the tools answer from were
 *   two different things: `vmu.turn.protocolPath` named a file nobody wrote, and a row could claim a revision no file
 *   carried. Now every propose / continue / adopt writes the FULL revision body to that path as its own md — atomically
 *   (temp file + rename, so nobody reads half a document) — and the row stores the md sha256 in its `mdFingerprint`
 *   header. The read faces compare the two and DISCLOSE a disagreement (`mdChangedSinceIndex: true` + both fingerprints +
 *   the means pointing at `vibe_vmu_records { action: "reindex" }`), instead of answering from the index as if the file
 *   agreed. The writer lives in `kernel/records.js` (the md face: compose/parse/atomic-write/reindex — one file shape for
 *   every row that carries a document); this module only decides WHAT one blueprint revision says.
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
export const BLUEPRINT_FIELDS = Object.freeze(['path', 'status', 'revision', 'proposedBy', 'proposedAt', 'adoptedBy', 'adoptedAt', 'proposalId', 'note', 'authors', 'lastStaleSeenAt', 'mdFingerprint', 'mdPath', 'outline', 'revisionReason', 'mdWrittenBy', 'mdWroteInOwnTurn'])
/** ★ RUN 225-A: the header field that holds the sha256 of the md this row was indexed from (last position: a row written
 *  before the md face has no such field and still parses — the superset rule this file already follows for authors). */
export const BLUEPRINT_MD_KEY = 'mdFingerprint'
/**
 * ★★★ RUN 238 (run 61 / FEEDBACK61 A, MEASURED): ONE shared file could not hold two revisions. `propose` wrote the
 * draft to the canonical path, so an unadopted draft ATOMICALLY REPLACED the in-force document, and pruning the draft
 * did not bring the old text back (`prune` moves index rows, it does not rewrite files). Two rows then claimed the same
 * file as "the truth", and the file held neither of them.
 *
 * The fix is the one the file layout was always missing: EVERY revision owns its own md. A draft writes
 * `Shared/Drafts/<stem>-r<N>.md`; only `adopt` writes the canonical path. So "the truth is a file" stays true per
 * revision, and no unadopted text can ever displace the document in force.
 */
export const BLUEPRINT_MD_PATH_KEY = 'mdPath'

/**
 * ★★★ RUN 248 (user ruling, 2026-11-06): A DRAFT NOW WRITES ITS OWN md, and the member may own that file. RUN 238 kept
 * a draft out of the file system because ONE canonical file could not hold two revisions: `propose` wrote the canonical
 * path, so an unadopted draft ATOMICALLY REPLACED the document in force, and pruning the draft row did not bring the old
 * text back. The fix that keeps both halves — "the truth is a file" AND "an unadopted draft cannot displace the document
 * in force" — is one file PER revision: a draft owns `<dirname(blueprint path)>/Drafts/<stem>-r<N>.md`, and `adopt`
 * promotes that file's text to the canonical path.
 *
 * The member owns the draft file: `propose { mdPath }` accepts a md the member already wrote with its own fs tool (a
 * blueprint md, or plain markdown). The file's sha256 is stored in the row beside `mdPath`, so "the row and the file
 * agree" is a CHECKED fact (`readBlueprintDraftMd`), not a promise.
 */
export const BLUEPRINT_DRAFT_DIR = 'Drafts'
/** The refusal code for "the draft md you named is not on disk" (a NEW code, registered by this module). */
export const BLUEPRINT_MD_MISSING = 'VMU_PACK_V5R_BLUEPRINT_MD_MISSING'
/** The refusal code for "the draft file bytes are not the bytes the row indexed" (a NEW code, registered here). */
export const BLUEPRINT_MD_DRIFT = 'VMU_PACK_V5R_BLUEPRINT_MD_DRIFT'
/**
 * ★★★ RUN 255 / TB-2613 (md ownership): WHO wrote the md a row points at is a FACT OF THE ROW, not a guess made when a
 * reader asks. The two fields are APPENDED at the end of BLUEPRINT_FIELDS (the append-only rule this file already follows
 * for authors/outline): a row written before this revision has neither field and still parses — its ownership is then
 * `fs-untracked` when the file exists on disk, or null when it does not. `mdWroteInOwnTurn` is stored as the literal
 * string true only when it is true; absence means the writing turn is not known (never a claim that it was not in-turn).
 */
export const BLUEPRINT_MD_BY_KEY = 'mdWrittenBy'
export const BLUEPRINT_MD_IN_TURN_KEY = 'mdWroteInOwnTurn'
/** The three distinguishable writers: a member file, a kernel-materialized file, a file with no row provenance on disk. */
export const BLUEPRINT_MD_OWNERS = Object.freeze(['member-file', 'kernel-materialized', 'fs-untracked'])

/**
 * ★★★ RUN 256 / TB-2623 (clock purity): ONE clock reading, ONE entry. Product code may not read the wall clock to stamp
 * a fact: a caller that holds the kernel clock passes it in (`at`/`now`), and this module then records `atSource:'kernel-clock'`.
 * Only when NO clock reaches this module does it fall back to the wall clock — and that fallback is NAMED here (one place,
 * counted, enumerated) instead of being a silent `Date.now()` in five functions, which is how an injected clock and the
 * wall clock ended up MIXED in the same receipt (`authors[].at` wall time beside `scheduledFor` injected time).
 */
const WALL_CLOCK_READS = { count: 0, sites: [] }
function wallClockReadingOf(site) {
  WALL_CLOCK_READS.count += 1
  const label = String(site)
  if (WALL_CLOCK_READS.sites.indexOf(label) < 0) WALL_CLOCK_READS.sites.push(label)
  return Date.now()
}
/**
 * ★★★ RUN 256 / TB-2623: One reading, with the SOURCE named. BOTH legal clock shapes count as a caller-supplied
 * stamp — a finite number of milliseconds AND an ISO-8601 string (the kernel's own `isoStampOf` produces the second
 * shape, so treating it as "no clock" here would silently turn a caller clock into the wall clock and mislabel it).
 * Only a value that is neither finite nor parseable falls back to the one named wall-clock reading.
 */
/** The plausible range for a stamped clock value (2000-01-01 .. 2100-01-01, UTC). A value outside it is a BUG in the
 * caller, not a time: refusing by name keeps a broken clock distinguishable from a clock that was never read. */
const CLOCK_VALUE_MIN_MS = 946684800000
const CLOCK_VALUE_MAX_MS = 4102444800000
/** ISO-8601 WITH an explicit offset (`Z` or `+HH:MM`). A date-only spelling (`2026-01-01`) or a local slash spelling
 * (`2026/01/01`) carries no offset, so it names an INSTANT only by guessing the reader timezone — refused, not guessed. */
const CLOCK_ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/
const CLOCK_VALUE_HINT = '时钟值要么是整数毫秒（2000-01-01 至 2100-01-01 之间），要么是带显式位移的 ISO-8601（如 2026-01-01T00:00:00+08:00 或 2026-01-01T00:00:00Z）。 REACHABLE INSTEAD: 传整数毫秒（2000-01-01..2100-01-01）或带位移的 ISO-8601（如 2026-01-01T00:00:00+08:00）；确实没有钟就不要传这个参数（默认走唯一计数的墙钟，回执 atSource:"wall-clock"）；不传这个值，就由本模块读唯一那一处计数的墙钟（atSource:"wall-clock"）。纯日期 2026-01-01、斜杠写法 2026/01/01、负数/小数/超范围的数字、以及垃圾字符串，一律具名拒绝，而不是静默换成本次的墙钟——时钟坏了必须看起来和时钟读到值不一样（RUN 259 / AUDIT-14 P1-2）'
export function clockReadingOf(value, site, options = {}) {
  const where = String(site === undefined || site === null ? 'clockReadingOf' : site)
  // ★ absent = the ONE named wall-clock reading (unchanged: counted, enumerable). It is not a silent substitution: the
  // receipt says atSource:"wall-clock" and blueprintClockSourcesOf() counts it.
  if (value === undefined || value === null) return { at: wallClockReadingOf(where), atSource: 'wall-clock', clockValue: null }
  if (typeof value === 'number') {
    if (Number.isFinite(value) !== true || Number.isInteger(value) !== true) {
      throw refuse('VMU_V5R_CLOCK_VALUE_INVALID', '时钟值不是整数毫秒（位置 ' + where + '）：' + String(value), CLOCK_VALUE_HINT)
    }
    // ★ a reading that came from the KERNEL CLOCK SEAM is trusted as a measurement (test/sim deployments inject small
    // counters such as 1000 on purpose); a value handed in as caller DATA must be plausible, or it is refused by name.
    const fromKernel = options && options.kernelClock === true
    if (fromKernel !== true && (value < CLOCK_VALUE_MIN_MS || value >= CLOCK_VALUE_MAX_MS)) {
      throw refuse('VMU_V5R_CLOCK_VALUE_INVALID', '时钟值不在合理区间 2000-01-01..2100-01-01 内（位置 ' + where + '）：' + String(value) + ' ms', CLOCK_VALUE_HINT)
    }
    return { at: value, atSource: 'kernel-clock', clockValue: fromKernel === true ? 'kernel-clock-seam' : 'integer-ms' }
  }
  if (typeof value === 'string') {
    const raw = value.trim()
    if (raw === '') throw refuse('VMU_V5R_CLOCK_VALUE_INVALID', '空字符串不是时钟值（位置 ' + where + '）', CLOCK_VALUE_HINT)
    if (CLOCK_ISO_WITH_OFFSET.test(raw) !== true) {
      throw refuse('VMU_V5R_CLOCK_VALUE_INVALID', '时钟字符串不是带显式位移的 ISO-8601（位置 ' + where + '）：「' + raw + '」——纯日期或本地斜杠写法都不指明瞬时', CLOCK_VALUE_HINT)
    }
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed) !== true) {
      throw refuse('VMU_V5R_CLOCK_VALUE_INVALID', '时钟字符串无法解析成瞬时（位置 ' + where + '）：「' + raw + '」', CLOCK_VALUE_HINT)
    }
    if (parsed < CLOCK_VALUE_MIN_MS || parsed >= CLOCK_VALUE_MAX_MS) {
      throw refuse('VMU_V5R_CLOCK_VALUE_INVALID', '时钟字符串不在合理区间 2000-01-01..2100-01-01 内（位置 ' + where + '）：「' + raw + '」', CLOCK_VALUE_HINT)
    }
    return { at: parsed, atSource: 'kernel-clock', clockValue: 'iso-with-offset' }
  }
  throw refuse('VMU_V5R_CLOCK_VALUE_INVALID', '时钟值必须是整数毫秒或带位移的 ISO-8601 字符串（位置 ' + where + '）：收到 ' + typeof value, CLOCK_VALUE_HINT)
}
/** The audit face: how many wall-clock reads this module has made, and where (one entry, so the count can be driven to 0). */
export function blueprintClockSourcesOf() {
  return {
    wallClockReads: WALL_CLOCK_READS.count,
    sites: WALL_CLOCK_READS.sites.slice(),
    means: WALL_CLOCK_READS.count === 0
      ? 'zero wall-clock reads: every stamp this module wrote came from a caller-supplied clock (atSource \u0027kernel-clock\u0027)'
      : 'this deployment reached the wall clock ' + WALL_CLOCK_READS.count + ' time(s) (' + WALL_CLOCK_READS.sites.join(', ') + ') because no clock was passed in — those receipts carry atSource:\u0027wall-clock\u0027 and must not be replayed as reproducible corpus',
  }
}

/**
 * The md path of ONE revision: `<dirname(path)>/Drafts/<stem>-r<N>.md` (stem = the canonical basename minus `.md`).
 * A blueprint at `Shared/Protocol.md` therefore drafts into `Shared/Drafts/Protocol-r1.md`; a blueprint in a subdirectory
 * drafts into ITS OWN `Drafts/` directory, so two paths never fight over one file name.
 */
export function blueprintDraftMdPathOf({ path = '', revision = null } = {}) {
  const wanted = txt(path).replace(/\\/g, '/')
  if (wanted === '') return ''
  const name = wanted.slice(wanted.lastIndexOf('/') + 1)
  const dir = wanted.includes('/') ? wanted.slice(0, wanted.lastIndexOf('/')) : ''
  const stem = name.replace(/\.md$/i, '')
  const prefix = dir === '' ? '' : dir + '/'
  return prefix + BLUEPRINT_DRAFT_DIR + '/' + stem + '-r' + String(revision === null || revision === undefined ? 0 : revision) + '.md'
}

/** Normalize a caller-supplied md path to the display (rel) path the index uses; an absolute path is accepted too. */
export function blueprintMdRelOf({ records, mdPath = '' } = {}) {
  const given = txt(mdPath)
  if (given === '') return ''
  if (records && typeof records.mdPathOf === 'function' && typeof records.mdRelOf === 'function') {
    const abs = records.mdPathOf(given)
    if (abs !== null && abs !== undefined) return txt(records.mdRelOf(abs))
  }
  return given.replace(/\\/g, '/')
}

/**
 * ★★★ RUN 248: READ a draft md as the document it is. The RAW bytes of the file are what the row stores a sha256 for
 * (so an edit of any byte — header or prose — is one detectable fact), and the file's text is the draft body: a
 * blueprint md (with the `- vmuMd：` marker) contributes its `## 正文` section, any other markdown is taken WHOLE (a
 * member's own prose). `exists:false` is a fact the callers turn into a NAMED refusal, not an empty document.
 */
export function readBlueprintDraftMd({ records, mdPath = '' } = {}) {
  const rel = txt(mdPath)
  const unavailable = (means) => ({
    ok: true, available: false, exists: null, mdPath: rel === '' ? null : rel, absPath: null,
    fingerprint: null, content: null, doc: null, format: BLUEPRINT_MD_FORMAT, text: '', means,
  })
  if (!records || typeof records.mdRead !== 'function') {
    return unavailable('this records face carries no md reader (a hand-built test double), so a draft file cannot be read and no row should claim one')
  }
  let read = null
  try { read = records.mdRead({ path: rel }) } catch (e) {
    return Object.assign(unavailable('the draft md read threw, so this call makes no claim about the file: ' + String((e && e.message) || e)),
      { error: { code: (e && e.code) || null, message: String((e && e.message) || e) } })
  }
  if (!read || read.available !== true) {
    return unavailable((read && read.means) || 'this deployment does not know its workspace root, so the draft md cannot be located')
  }
  if (read.exists !== true) {
    return Object.assign(unavailable('no md at this path: a draft file has to exist before a row can index it'), { available: true, exists: false })
  }
  const doc = read.doc || null
  const content = read.content === undefined || read.content === null ? '' : String(read.content)
  const isBlueprintMd = doc !== null && doc.ok === true
  return {
    ok: true, available: true, exists: true, mdPath: txt(read.path) || rel,
    absPath: read.absPath === undefined ? null : read.absPath,
    fingerprint: read.fingerprint === undefined ? null : read.fingerprint,
    content, doc, bytes: read.bytes === undefined || read.bytes === null ? content.length : Number(read.bytes),
    format: isBlueprintMd ? BLUEPRINT_MD_FORMAT : 'plain-md',
    text: isBlueprintMd ? txt(doc.text) : txt(content),
    means: isBlueprintMd
      ? 'the draft is a blueprint md on disk: its `## 正文` section is the document, and the row stores the sha256 of the WHOLE file (so an edit of the header or of the prose is the same detectable fact)'
      : 'the draft is a plain markdown file (no `- vmuMd：` header line): its WHOLE text is the document, and the row stores the sha256 of the whole file',
  }
}

/**
 * ★★★ RUN 255 / TB-2613: the ownership the ROW records (never inferred from who is asking). Two header fields carry it:
 * `mdWrittenBy` (member-file | kernel-materialized | fs-untracked) and `mdWroteInOwnTurn` (the writing turn was the
 * member's own turn). A row written before this revision carries neither — that absence is REPORTED as null, never turned
 * into a guess by the reader.
 */
export function blueprintMdProvenanceOf(fields = {}) {
  const source = fields === null || fields === undefined ? {} : fields
  const by = txt(source[BLUEPRINT_MD_BY_KEY])
  const inTurn = txt(source[BLUEPRINT_MD_IN_TURN_KEY]).toLowerCase()
  return {
    writtenBy: by === '' ? null : by,
    wroteInOwnTurn: inTurn === '' ? null : inTurn === 'true',
    means: by === ''
      ? 'the row carries no mdWrittenBy header field (a row written before RUN 255, or a path that records no provenance), so WHO wrote the file cannot be read off the row: the reader is told null instead of being handed a guess'
      : 'mdWrittenBy is the row header field itself — what the WRITER recorded, not something the reader infers from the file or from who is asking',
  }
}

/**
 * ★★★ RUN 255 / TB-2613: the ownership EVIDENCE of one md file. `bytes` and `sha256` are read from the DISK (through the
 * records md reader) at evidence time, never copied out of the row's own `mdFingerprint`, so a row that drifted from its
 * file cannot make the evidence agree with itself. `writtenBy` comes from the row provenance; with none, a file that
 * exists is `fs-untracked` (a real file with no recorded writer) — its `atSource` says which of the four facts decided it.
 * Returns null when there is no path to be owned at all (the honest "no md here", not an empty object).
 */
export function mdOwnerOf({ records = null, mdPath = '', writtenBy = null, wroteInOwnTurn = null } = {}) {
  const rel = txt(mdPath)
  if (rel === '') return null
  const declared = txt(writtenBy === null || writtenBy === undefined ? '' : writtenBy)
  const inTurn = wroteInOwnTurn === true ? true : (wroteInOwnTurn === false ? false : null)
  let read = null
  if (records && typeof records.mdRead === 'function') {
    try { read = records.mdRead({ path: rel }) } catch (e) {
      read = { ok: false, available: true, exists: null, error: { code: (e && e.code) || null, message: String((e && e.message) || e) } }
    }
  }
  const readable = read !== null && read.available === true
  const exists = readable ? read.exists === true : null
  const fingerprint = exists === true && read.fingerprint !== undefined && read.fingerprint !== null ? String(read.fingerprint) : null
  const bytes = exists === true && read.bytes !== undefined && read.bytes !== null ? Number(read.bytes) : null
  const known = BLUEPRINT_MD_OWNERS.indexOf(declared) !== -1
  if (declared === '' && exists !== true) {
    return null
  }
  const who = declared !== '' ? declared : 'fs-untracked'
  // ★★★ RUN 255 rev3 (Lead P1-6): atSource is DERIVED from the one test that already decided the value — declared === ''
  // means a file nobody claims by provenance was found on disk, so the source IS the disk; otherwise the source is the
  // row header. The old three-way ternary had two identical arms (a branch that could never be true); no dead branch now.
  const atSource = declared === '' ? 'disk-only' : 'row-provenance'
  const means = declared === ''
    ? 'there is a file on disk at this path but the row records NO writer (mdWrittenBy absent): it is reported as fs-untracked — a real file nobody claims by provenance — rather than being credited to the member'
    : (known
      ? 'writtenBy is the row header value itself (' + declared + '), so the claim has a source on disk; bytes and sha256 were read from the file JUST NOW, not copied from the row'
      : 'the row records writtenBy=' + declared + ', which is not one of the three known writers (' + BLUEPRINT_MD_OWNERS.join('/') + '): it is printed verbatim instead of being silently coerced')
  return {
    writtenBy: who,
    wroteInOwnTurn: inTurn,
    path: rel,
    exists: exists === true ? true : (readable ? false : null),
    absPath: exists === true && read.absPath !== undefined ? read.absPath : null,
    bytes,
    sha256: fingerprint,
    atSource,
    means,
  }
}

/**
 * ★★★ RUN 256 / TB-2622: THE ONE hint for "how do I get a draft adopted". MEASURED defect: the adopt refusal taught
 * `propose { action, path, member, text }` (text-only), but under the RUN 255 fs-first default a text-only propose returns
 * `filed:false` and appends no author, so following that hint could NEVER pass the `NEEDS_CODESIGN` gate this same file
 * raises — two hints in one file denying each other. This function is the single source: `codesignRefusal` (the adopt
 * gate), both `draftMdMissing` receipts (the text-only dead end) and both success receipts (the codesign precondition)
 * all carry ITS text verbatim, so a model that copies the hint lands on a call that works.
 * Pure: no records, no disk. `path` and `draftMdPath` are interpolated (they are the same in every context that shares a
 * blueprint); the draft id stays a placeholder because the unfiled receipt has no id yet.
 */
export function resumeDraftHintOf(record = {}) {
  const src = record !== null && typeof record === 'object' ? record : {}
  const fields = src.fields !== null && typeof src.fields === 'object' ? src.fields : src
  const path = txt(fields.path)
  const rawRevision = fields.revision === undefined || fields.revision === null ? src.revision : fields.revision
  const revision = Number.isFinite(Number(rawRevision)) ? Number(rawRevision) : 0
  const declaredMdPath = txt(fields[BLUEPRINT_MD_PATH_KEY] !== undefined ? fields[BLUEPRINT_MD_PATH_KEY] : src[BLUEPRINT_MD_PATH_KEY])
  const draftMdPath = declaredMdPath !== '' ? declaredMdPath : blueprintDraftMdPathOf({ path, revision })
  const member = '<你的成员 id>'
  const hint = '下一步（可复制；fs-first：不带 mdPath 的 propose 只回 filed:false，不写文件、也不追加 authors）：'
    + '① 用 fs 把整份正文写进 ' + draftMdPath + '（plain md 或带 `## 正文` 的 blueprint md）；'
    + '② 再提议：vibe_v5_blueprint { action: "propose", path: "' + path + '", member: "' + member + '", mdPath: "' + draftMdPath + '" }；'
    + '③ 院士席与常驻研究员席各走一次 ①②，再 vibe_v5_blueprint { action: "adopt", path: "' + path + '", draft: "<filed 回执里的 draft id>" }'
  const nextActions = [
    {
      step: 1,
      do: '用 fs 工具把整份正文写进草案 md',
      args: { path: draftMdPath, content: '<整份正文：纯 markdown，或带 `## 正文` 的 blueprint md>' },
      becomes: '磁盘上出现 ' + draftMdPath + '；内核只索引它的 sha256，不改写它',
    },
    {
      step: 2,
      do: '带同一个 mdPath 重新 propose',
      args: { tool: 'vibe_v5_blueprint', action: 'propose', path, member, mdPath: draftMdPath },
      becomes: 'filed:true：行索引的是你写的字节，你的 member 记入 authors',
    },
    {
      step: 3,
      do: '两席都写过 section 后 adopt',
      args: { tool: 'vibe_v5_blueprint', action: 'adopt', path, draft: '<filed 回执里的 draft id>' },
      becomes: 'status:adopted：草案正文晋升为 current',
    },
  ]
  return {
    draftMdPath,
    path,
    revision,
    draftId: txt(src.id) !== '' ? txt(src.id) : null,
    hint,
    nextActions,
    means: 'ONE chain, not alternatives: the draft document belongs to the member (fs), the kernel indexes its bytes and records who wrote them; a propose without mdPath writes nothing and adds no author, so it cannot build the co-design record this gate checks',
  }
}

/** The value of one `- key：value` header line of a record body (null when absent) — the blueprint half of mdFieldOf. */
function headerFieldOf(body, key) {
  const wanted = txt(key)
  if (wanted === '') return null
  for (const line of String(body === undefined || body === null ? '' : body).split('\n')) {
    const m = /^-\s*([^：:]+?)\s*[：:]\s*(.*)$/.exec(line)
    if (m && m[1].trim() === wanted) return txt(m[2])
  }
  return null
}

/**
 * ★★★ RUN 248: "the row and the file cannot diverge" is CHECKED here, right after the row is written: read the row back
 * and require (a) its `## 正文` text to be the file's text and (b) its `mdFingerprint` header to be the file's sha256. A
 * deployment with a body-less `get` cannot be checked and says so (`checked:false`) instead of claiming agreement.
 */
function verifyBlueprintRowMd({ track, id, md, mdPath, text }) {
  const wanted = txt(mdPath)
  const out = { checked: false, ok: null, mdPath: wanted === '' ? null : wanted, mdFingerprint: md === null ? null : (txt(md.fingerprint) || null), rowFingerprint: null, rowTextBytes: null, means: '' }
  if (md === null || md.available !== true || txt(md.fingerprint) === '') {
    out.means = 'nothing was written to disk (or this deployment has no md face), so there is no file to check the row against: the row is the only holder and this receipt says so'
    return out
  }
  const fresh = typeof track.get === 'function' ? track.get({ id, includeBody: true }) : null
  const rowBody = fresh && fresh.ok !== false ? fresh.body : null
  if (typeof rowBody !== 'string' || rowBody === '') {
    out.means = 'this records face returned no row body, so the row-versus-file check could not run: the sha256 above is the file the row CLAIMS, not a comparison'
    return out
  }
  const rowText = blueprintTextOf(rowBody)
  const rowFingerprint = headerFieldOf(rowBody, BLUEPRINT_MD_KEY)
  const same = rowText === txt(text) && rowFingerprint === txt(md.fingerprint)
  if (!same) {
    throw refuse('VMU_STATE',
      'the row written for this revision does NOT carry the bytes it claims: text agrees=' + String(rowText === txt(text))
      + ', mdFingerprint ' + String(rowFingerprint) + ' vs file ' + String(md.fingerprint),
      'this is an internal inconsistency (the row is the index of the file, not a second document): re-run the same call; if it repeats, the records face is rewriting bodies (bodyMode/parse) and the md face cannot be indexed faithfully')
  }
  out.checked = true
  out.ok = true
  out.rowFingerprint = rowFingerprint
  out.rowTextBytes = rowText.length
  out.means = 'row 与文件已经核对过：行的 `## 正文` 与文件正文逐字相同，行的 `' + BLUEPRINT_MD_KEY + '` 就是文件的 sha256（先写文件、再把行指过去，读完再校验——不是「行说它对了」）'
  return out
}
/** ★ RUN 225-A: the md format NAME this pack reports in its md receipts (the file marker itself is the records face's
 *  `vmuMd：vmu-md/1`: one document shape, every row that carries a document). */
export const BLUEPRINT_MD_FORMAT = 'vmu-blueprint-md/1'
/** ★ RUN 236 — G8「由粗到细」: an OPTIONAL ordered outline (`[{id,title,depth}]`, depth 1 = coarse, 2 = finer). It lives
 *  in the SAME header-field mechanism as `authors`, so it travels with the revision and through `reindex` — no second
 *  store, and a reader never has to reconcile an outline with a text. Attached at the END of the field order (append-only
 *  rule: an older row has no such field and still parses). */
export const BLUEPRINT_OUTLINE_KEY = 'outline'
/** ★ RUN 236 — G11「据实践细化并更新对象」: an OPTIONAL one-line reason for THIS revision, stored in the header (and the
 *  md) instead of only in a conversation, so "why the revision exists" is readable from the document itself. */
export const BLUEPRINT_REASON_KEY = 'revisionReason'
/** The DECLARED setting that asks for an outline (`settings/schema.js`, default FALSE). It is a HINT, never a gate: the
 *  write still lands, the receipt says `outlineRequired: true` and names the missing structure. */
export const BLUEPRINT_OUTLINE_REQUIRE_KEY = 'vmu.blueprint.requireOutline'
/** The outline depths this mechanism knows (1 = coarse, 2 = fine). A depth outside this set is REPORTED, not guessed. */
export const BLUEPRINT_OUTLINE_DEPTHS = Object.freeze([1, 2])

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

/**
 * ★★★ RUN 213 (run 50 / FEEDBACK49 1.4, MEASURED): the TOOL owns the `## 共同设计补充｜<member>` heading, but a member's
 * text often repeats it (run 50 wrote it into `text` as well), so the draft body carried the same heading twice and the
 * receipt said nothing. A leading duplicate is dropped here and the count is reported by the caller.
 */
export function stripRepeatedCodesignHeading(text) {
  const lines = txt(text).split('\n')
  let dropped = 0
  while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  while (lines.length > 0 && lines[0].trim().startsWith(BLUEPRINT_CODESIGN_SECTION)) {
    lines.shift(); dropped += 1
    while (lines.length > 0 && lines[0].trim() === '') lines.shift()
  }
  return { text: txt(lines.join('\n')), dropped }
}

/**
 * ★★★ RUN 215 (run 52 / FEEDBACK51 1.1b, MEASURED): a co-designer continued the draft by pasting the WHOLE document it
 * had just read — base text included — as its own section, so the draft ended up holding the base twice and the receipt
 * said only `headingDropped:0`. The duplicate is content, not formatting: it gets adopted as the current revision and
 * every later reader sees the same paragraph twice. When the incoming text STARTS WITH the draft that already exists
 * (or with its base), that prefix is the copy; it is stripped here and the receipt says how much was removed.
 */
export function stripLeadingDuplicateDraft(text, existing) {
  const body = txt(text)
  const known = txt(existing).trim()
  if (known === '') return { text: body, droppedChars: 0, matched: null }
  const lead = body.replace(/^[ \t\n\r]+/, '')
  if (lead.startsWith(known)) {
    const rest = lead.slice(known.length).replace(/^[ \t\n\r]+/, '')
    if (rest !== '') return { text: rest, droppedChars: body.length - rest.length, matched: 'draft' }
  }
  return { text: body, droppedChars: 0, matched: null }
}

/** Compose the `## 正文` text: the first proposer's base, then one attributed section per co-designer (order kept). */
export function composeBlueprintText(base, sections) {
  let out = txt(base)
  for (const section of Array.isArray(sections) ? sections : []) {
    const member = txt(section && section.member)
    if (member === '') continue
    // the heading is written HERE, so a repeated one in the section text is dropped (RUN 213 / FEEDBACK49 1.4)
    out += (out === '' ? '' : '\n\n') + BLUEPRINT_CODESIGN_SECTION + member + '\n' + stripRepeatedCodesignHeading(txt(section && section.text)).text
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

/** ONE line, always: a header field is `- key：value`, so a value that carries a newline would invent header lines. The
 *  reason keeps its words, only the line breaks collapse (`\\s+` → one space). */
function oneLine(value) {
  return txt(value).replace(/\s+/g, ' ')
}

/** Serialize an outline as ONE JSON line (the same shape `authors` uses: one field, one line, no second store). */
function serializeOutline(outline) {
  const list = (Array.isArray(outline) ? outline : [])
    .filter((e) => e && txt(e.id) !== '')
    .map((e) => {
      const depth = Number(e.depth)
      return { id: txt(e.id), title: txt(e.title), depth: Number.isInteger(depth) ? depth : 1 }
    })
  return list.length === 0 ? '' : JSON.stringify(list)
}

/**
 * ★ RUN 236 — read an outline, TOLERANTLY and REPORTING. `null`/`''` is "this revision carried no outline" (an empty
 * list, `provided: false`), NOT a problem; a malformed value is `problems` (the read-out reports it, `propose` refuses it
 * by name before writing). An entry without `id` or with a depth outside `BLUEPRINT_OUTLINE_DEPTHS` is DROPPED from the
 * parsed list and named in `problems` — a half-read outline must never look like the caller's whole outline.
 */
function parseOutlineField(value) {
  let parsed = value
  if (value === null || value === undefined || typeof value === 'string') {
    const raw = txt(value)
    if (raw === '') return { outline: [], problems: [], provided: false }
    try { parsed = JSON.parse(raw) } catch (e) { return { outline: [], problems: ['outline is not valid JSON: ' + raw.slice(0, 120)], provided: true } }
  }
  if (!Array.isArray(parsed)) return { outline: [], problems: ['outline is not a JSON array: ' + txt(parsed).slice(0, 120)], provided: true }
  const outline = []
  const problems = []
  // ★★★ RUN 238 (run 61 / FEEDBACK61 D, MEASURED): an outline entry's id is the node's NAME, and two entries could carry
  // the same one (`[{id:"1",…},{id:"1",…}]` wrote ok:true with outlineCount:2). A layered outline whose nodes cannot be
  // told apart is not an outline, and `outlineDepthMax`/node lookups answered about a set that has two of everything.
  const seenIds = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') { problems.push('an outline entry is not an object'); continue }
    const id = txt(item.id)
    if (id === '') { problems.push('an outline entry has no id'); continue }
    if (seenIds.indexOf(id) >= 0) {
      problems.push('outline entry ' + id + ' repeats an id already used by an earlier entry: an outline node is named once')
      continue
    }
    seenIds.push(id)
    const depth = Number(item.depth)
    if (!Number.isInteger(depth) || !BLUEPRINT_OUTLINE_DEPTHS.includes(depth)) {
      problems.push('outline entry ' + id + ' has depth "' + txt(item.depth) + '", not one of ' + BLUEPRINT_OUTLINE_DEPTHS.join('|'))
      continue
    }
    outline.push({ id, title: txt(item.title), depth })
  }
  return { outline, problems, provided: true }
}

/**
 * ★★★ RUN 239-B (run 62 / FEEDBACK62 ②, MEASURED): two read faces reported the SAME row with different
 * `outlineSource` values — `state` said "row" while `read` said "request" (its default), so a reader comparing the two
 * receipts had to guess which one was lying. They were not lying about different facts: both read the outline stored in
 * the row. A source name is only useful if every face means the same thing by it, so the enum is defined ONCE here and
 * every receipt carries the sentence for its value:
 *   request = the WRITE call itself carried an outline (it was stored into this revision)
 *   draft   = the write call carried none, so the outline inherited from the draft being continued / adopted
 *   row     = a READ: what is reported is the outline stored on this row (a read request has no outline argument)
 *   none    = this revision has no outline (an explicit empty list, not an omission)
 */
const OUTLINE_SOURCE_MEANS = Object.freeze({
  request: 'request = 这次写入调用自己带了 outline（写进这一版）；它说的是这次调用带了什么，不是读面从哪里读到的',
  draft: 'draft = 这次写入调用没带 outline，用的是被续写/被采纳草案上的那一套（同 id 的项按续写规则合并，旧项不丢失）',
  row: 'row = 读面报告的是这一行上存着的 outline：读请求没有 outline 参数，所以读到的就是行上的原文——state 与 read 都读同一行时给出同一个 row，不会一面说 row、另一面说 request',
  none: 'none = 这一版没有 outline（空表是明确的空，不是回执忘了问）',
})

/** The sentence a receipt prints beside its `outlineSource` value (see the ★ block above). */
export function outlineSourceMeansOf(source) {
  const name = txt(source)
  return OUTLINE_SOURCE_MEANS[name] === undefined
    ? 'outlineSource 只取 ' + Object.keys(OUTLINE_SOURCE_MEANS).join('|') + '，读到 "' + name + '" 说明这个回执不是本模块产的'
    : OUTLINE_SOURCE_MEANS[name]
}

/**
 * ★★★ RUN 239-B (run 62 / FEEDBACK62 ①, MEASURED): a CONTINUATION REPLACED the base outline. The draft row carried
 * `[{id:"1"},{id:"1.1"}]`; a second designer continued it with `[{id:"2"},{id:"2.1"}]` and the row afterwards held only
 * 2/2.1 — the base outline vanished while BOTH text sections were still there. The text is composed (base + sections),
 * so the outline must compose too: a continuation MERGES by id (same id = later writer overrides title/depth, new id is
 * appended, ids only the base had are kept). A NEW revision still takes its outline as given — there is no base to merge
 * with, and `added` then lists every id it carries.
 */
function mergeOutline(base = [], incoming = []) {
  const baseList = Array.isArray(base) ? base : []
  const incomingList = Array.isArray(incoming) ? incoming : []
  const outline = baseList.map((e) => ({ id: txt(e.id), title: txt(e.title), depth: Number(e.depth) }))
  const added = []
  const updated = []
  const kept = []
  for (const item of incomingList) {
    const id = txt(item && item.id)
    const index = outline.findIndex((e) => e.id === id)
    const next = { id, title: txt(item && item.title), depth: Number(item && item.depth) }
    if (index >= 0) { outline[index] = next; updated.push(id) } else { outline.push(next); added.push(id) }
  }
  for (const entry of outline) {
    if (updated.indexOf(entry.id) < 0 && added.indexOf(entry.id) < 0) kept.push(entry.id)
  }
  return { outline, added, updated, kept }
}

/** The receipt reading of a merge (or of a fresh revision's outline), with the sentence that says which happened. */
function outlineMergedReading({ merged, continued, provided }) {
  const base = '本次 outline 处理：' + (continued
    ? (provided
      ? '续写按 id 合并到行上已有的骨架——同 id 覆盖 title/depth（updated）、新 id 追加（added）、只有 base 才有的 id 原样保留（kept）'
      : '续写没有带 outline：行上已有的骨架原样保留（kept），不合并也不清空')
    : '起新 revision 直接采用本次提供的一套（覆盖语义：不与上一版合并，added 列出它带的每个 id）')
  return {
    added: merged.added.slice(),
    updated: merged.updated.slice(),
    kept: merged.kept.slice(),
    means: base + '；结果共 ' + String(merged.outline.length) + ' 项（added ' + String(merged.added.length)
      + ' / updated ' + String(merged.updated.length) + ' / kept ' + String(merged.kept.length) + '）',
  }
}

/**
 * ★ RUN 236 — the G8 reading a receipt prints. Absent is EXPLICIT (`[]` + `outlineCount: 0` + a means that says the
 * structure was optional), never omitted: a reader must be able to tell "no outline" from "the receipt forgot to ask".
 * `outlineRequired` is the deployment's ASK (`vmu.blueprint.requireOutline`), and it is a HINT: the receipt says the
 * structure is missing, the write still landed.
 */
export function outlineReading({ outline = null, requireOutline = false, source = 'request' } = {}) {
  const list = (Array.isArray(outline) ? outline : []).map((e) => ({ id: txt(e && e.id), title: txt(e && e.title), depth: Number.isInteger(e && e.depth) ? e.depth : 1 }))
  const required = requireOutline === true
  const depthMax = list.reduce((max, e) => Math.max(max, e.depth), 0)
  // ★★★ RUN 239-B: ONE enum for every face. An empty list is `none` regardless of who passed it; a non-empty list names
  // where it came from, and the sentence for that value travels with it (see OUTLINE_SOURCE_MEANS).
  const sourceName = list.length === 0 ? 'none' : txt(source)
  return {
    outline: list,
    outlineCount: list.length,
    outlineDepthMax: depthMax,
    outlineSource: sourceName,
    outlineSourceMeans: outlineSourceMeansOf(sourceName),
    outlineRequired: required && list.length === 0,
    outlineRequiredSource: required ? BLUEPRINT_OUTLINE_REQUIRE_KEY : null,
    outlineMeans: list.length === 0
      ? (required
        ? '这台部署打开了 ' + BLUEPRINT_OUTLINE_REQUIRE_KEY + '（默认关闭），但这次修订没有带 outline：不拒绝——该设置是提示不是门——状态写成空表并在这里点名，让缺结构成为可读的事实'
        : '这次修订没有带 outline：G8 的「由粗到细」是可选载体，缺失不是错误；于是 outline 写成空表而不是省略（省略会让读面分不清「没有」与「没说」）')
      : 'outline 是有序的 [{id,title,depth}]（depth 1=粗 2=细，共 ' + String(depthMax) + ' 层）：它是这一版的骨架，随行与 md 的同名字段一起走，不是第二份正文',
    outlineRequiredMeans: required
      ? (list.length === 0
        ? '部署设置 ' + BLUEPRINT_OUTLINE_REQUIRE_KEY + ' = true 且这一版没有 outline：提示已给出，写入没有被拒绝（设置默认关闭，规则 G8 的载体不靠硬门）'
        : '部署设置 ' + BLUEPRINT_OUTLINE_REQUIRE_KEY + ' = true，这一版已带 outline，提示不再触发')
      : '部署设置 ' + BLUEPRINT_OUTLINE_REQUIRE_KEY + ' 为默认值（关闭）：outline 只是可选载体，回执不因此拒绝也不伪装成要求',
  }
}

/** ★ RUN 236 — the G11 reading: the reason THIS revision exists, and WHERE it came from (`request` | `draft` | `none`).
 *  A revision with no reason is `null` + a sentence saying so — never a silent empty string. */
export function revisionReasonReading({ revisionReason = '', source = 'none' } = {}) {
  const reason = oneLine(revisionReason)
  return {
    revisionReason: reason === '' ? null : reason,
    revisionReasonSource: reason === '' ? 'none' : source,
    revisionReasonMeans: reason === ''
      ? '这次修订没有记录理由（revisionReason 缺省，草案里也没有）：G11 的「据实践细化」因此没有可读原文——读面明确写 null，而不是留一个空字符串让人以为是没打印出来'
      : (source === 'draft'
        ? '这条理由是从被落成的草案继承来的（revisionReasonSource:"draft"）：落成不改写文档，只把草案表头里的理由带到生效行，所以「为什么改」不会随落成丢失'
        : (source === 'row'
          ? '这条理由是从这一版的行与 md 里读出来的（revisionReasonSource:"row"）：读面如实报告存量原文，不是这次调用刚写的——要改它就再提一版并给出新理由'
          : '这条理由是本次调用给出的（revisionReasonSource:"request"）：它随这一版写进行与 md，读面与历史都能读到原文')),
  }
}

/**
 * ★ RUN 236 — the ONLY reader of the declared `requireOutline` knob inside the pack. The tool layer resolves the setting
 * (a view with `.get(key)` or a plain value map) and hands the answer to `propose`/`adopt`; this function exists so the
 * declared key has a NAMED reader instead of a literal only the schema knows. Default: false (the declared default).
 */
export function outlineRequireOf(settings = null) {
  if (settings === null || settings === undefined) return false
  const raw = typeof settings.get === 'function' ? settings.get(BLUEPRINT_OUTLINE_REQUIRE_KEY) : settings[BLUEPRINT_OUTLINE_REQUIRE_KEY]
  return raw === true || raw === 'true'
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
    // ★ RUN 236: both new fields are ONE header line: an outline is JSON (the `authors` shape), a reason is prose whose
    // line breaks are collapsed, so neither can invent header lines of its own.
    else if (key === BLUEPRINT_OUTLINE_KEY) value = typeof row[BLUEPRINT_OUTLINE_KEY] === 'string' ? txt(row[BLUEPRINT_OUTLINE_KEY]) : serializeOutline(row[BLUEPRINT_OUTLINE_KEY])
    else if (key === BLUEPRINT_REASON_KEY) value = oneLine(row[BLUEPRINT_REASON_KEY])
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
 * ★★ RUN 225-A: the MD HEADER of one revision — the SAME fields the row header prints, rendered as text, so the md on
 * disk and the index row can be compared field by field. It deliberately carries NO fingerprint of itself (a file that
 * prints its own sha256 can never verify: changing the line changes the hash). The records face adds the marker and the
 * title; this function only decides what a blueprint revision says.
 */
export function blueprintMdHeaderOf({
  path = '', status = '', revision = null, proposedBy = '', proposedAt = null,
  adoptedBy = '', adoptedAt = null, proposalId = '', note = '', authors = null,
  outline = null, revisionReason = '', mdPath = '', mdWrittenBy = '', mdWroteInOwnTurn = '',
} = {}) {
  const fields = {}
  const put = (key, value) => { const s = txt(value); if (s !== '') fields[key] = s }
  put('path', path)
  put('status', status)
  put('revision', revision === null || revision === undefined ? '' : String(revision))
  put('proposedBy', proposedBy)
  put('proposedAt', timeText(proposedAt))
  put('adoptedBy', adoptedBy)
  put('adoptedAt', timeText(adoptedAt))
  put('proposalId', proposalId)
  put('note', note)
  put('authors', typeof authors === 'string' ? txt(authors) : serializeAuthors(authors))
  // ★ RUN 236: the two optional revision facts travel to the md header too — the file is the truth, so an outline only the
  // row knew would be the same "two documents" defect RUN 225-A removed. Empty values are omitted (the put rule).
  put(BLUEPRINT_MD_PATH_KEY, mdPath)
  put(BLUEPRINT_OUTLINE_KEY, typeof outline === 'string' ? txt(outline) : serializeOutline(outline))
  put(BLUEPRINT_REASON_KEY, oneLine(revisionReason))
  // ★★★ RUN 255 / TB-2613: the md itself records WHO wrote it, so the ownership evidence survives a reindex (the row is
  // rebuilt from this header) instead of living only in a receipt of the call that wrote it.
  put(BLUEPRINT_MD_BY_KEY, mdWrittenBy)
  put(BLUEPRINT_MD_IN_TURN_KEY, mdWroteInOwnTurn)
  return fields
}

/**
 * ★★ RUN 225-A: write ONE revision to its md (atomically, through the records face) and return the receipt the blueprint
 * receipts carry. A records face built by hand in a unit test has no md writer: that is a NAMED `available: false` with
 * the reason, never a silent "the file is fine" — the row is then the only holder, and the receipt says so.
 */
export function writeBlueprintMd({ records, path, title = '', status = '', revision = null, fields = null, text = '' } = {}) {
  const wanted = txt(path)
  const unavailable = (means) => ({
    ok: true, available: false, written: false, path: wanted, absPath: null, fingerprint: null,
    bytes: 0, format: BLUEPRINT_MD_FORMAT, atomic: null, means,
  })
  if (!records || typeof records.mdWrite !== 'function') {
    return unavailable('this records face carries no md writer (a hand-built test double), so this revision lives ONLY in the records track: the md 是磁盘上的正文真相，而这个部署没有文件面')
  }
  let out = null
  try {
    out = records.mdWrite({ path: wanted, title, track: BLUEPRINT_TRACK, kind: BLUEPRINT_KIND, fields: fields === null ? {} : fields, text })
  } catch (e) {
    return Object.assign(unavailable('the md write threw, so no md was written: ' + String((e && e.message) || e)),
      { error: { code: (e && e.code) || null, message: String((e && e.message) || e) } })
  }
  if (!out || out.available !== true) {
    return Object.assign(unavailable((out && out.means) || 'this deployment does not know its workspace root, so no md was written and no row should claim one'), out || {})
  }
  return {
    ok: out.ok !== false, available: true, written: out.written === true,
    path: out.path === undefined ? wanted : out.path,
    absPath: out.absPath === undefined ? null : out.absPath,
    fingerprint: out.fingerprint === undefined ? null : out.fingerprint,
    bytes: out.bytes === undefined ? 0 : out.bytes,
    format: BLUEPRINT_MD_FORMAT,
    atomic: out.atomic === undefined ? null : out.atomic,
    replaced: out.replaced === true,
    means: 'md 已原子替换（同目录临时文件 + rename）：磁盘上是这一版的完整正文；行里存它的 sha256，所以「md 被外部改过」是可发现的事实（read 会披露 mdChangedSinceIndex，reindex 才认账），不是沉默',
  }
}

/**
 * ★★ RUN 225-A: the index-versus-disk comparison a READ prints. `mdChangedSinceIndex` is TRUE only when both fingerprints
 * are known and differ: a md that is missing, or a face with no md reader at all, is disclosed as such — "cannot compare"
 * must never be printed as "agrees". The repair is always the same and the means says it: `vibe_vmu_records { action:
 * "reindex" }` makes the index admit the file.
 */
export function blueprintMdReading({ records, path, row = null } = {}) {
  // ★ RUN 238: a row names the file it owns (`mdPath`); the path is only the fallback for rows written before that
  // field existed. Comparing every revision against the canonical file is exactly what made a draft look like an
  // external edit of the document in force.
  const rowMdPath = row === null || row === undefined ? '' : txt(row.fields && row.fields[BLUEPRINT_MD_PATH_KEY])
  const wanted = rowMdPath !== '' ? rowMdPath : txt(path)
  const indexFingerprint = row === null || row === undefined ? null : (txt(row.fields && row.fields[BLUEPRINT_MD_KEY]) || null)
  const indexRevision = row === null || row === undefined || !Number.isInteger(row.revision) ? null : row.revision
  // ★★★ RUN 239-B: the facts every md block now prints beside its comparison (see the ★ block inside `unavailable`).
  const isDraftRow = row !== null && row !== undefined && txt(row.status) === 'draft'
  const canonicalPath = txt(path) === '' ? null : txt(path)
  // ★★★ RUN 248: a DRAFT row names the file it OWNS (`mdPath` = `<dirname>/Drafts/<stem>-r<N>.md`); the canonical path is
  // what `adopt` promotes that text to. Both are printed, because "where is my draft" and "what is in force" are two
  // different files now, and a reader must not have to guess which one a `path` field means.
  const draftMdPath = isDraftRow && rowMdPath !== '' ? rowMdPath : null
  const mdFaceMeans = ({ draftRow, canonical, draftPath }) => 'available 说的是「这个部署有没有 md 读面」；mdWritten 说的是「这一版自己的文件此刻在不在磁盘上」；written 说的是「这次调用有没有写文件」（读面恒为 false）。三者不是一回事：available:true 可以同时 mdWritten:false（文件被删了或还没写），而 exists:false 是 reindex 会具名报告的 missing。'
    + (draftRow
      ? ' 这一行是草案：它自己的 md 是 ' + String(draftPath) + '（draftMdPath），不写 canonicalPath=' + String(canonical === null ? '(none)' : canonical) + '；adopt 才把草案文件的正文晋升到 canonicalPath'
      : ' 这一行不是草案：canonicalPath=' + String(canonical === null ? '(none)' : canonical) + ' 就是它自己的 md（draftMdPath 只对草案给出）')
  const unavailable = (means) => ({
    ok: true, available: false, path: wanted, absPath: null, exists: null, mdMissing: null,
    mdFingerprint: null, indexFingerprint, indexRevision, mdRevision: null, mdStatus: null,
    mdChangedSinceIndex: false, mdAheadOfIndex: false, mdBehindIndex: false,
    // ★★★ RUN 248: the md block prints which file THIS row owns (`draftMdPath`) and whether that file is on disk
    // (`mdWritten`); `written` keeps its narrow meaning (did THIS call write — a read never does) and `canonicalPath`
    // names the file adoption promotes the draft text to. An unavailable md face cannot answer "is it on disk"
    // (`mdWritten:null`), which is not the same as "no".
    written: false, canonicalPath: canonicalPath, draftMdPath: draftMdPath,
    mdWritten: null,
    mdMeans: mdFaceMeans({ draftRow: isDraftRow, canonical: canonicalPath, draftPath: draftMdPath === null ? '(none)' : draftMdPath }),
    means,
  })
  if (!records || typeof records.mdDigest !== 'function') {
    return unavailable('this records face carries no md reader (a hand-built test double), so there is no file to compare the index against — the row is the only side of the comparison, and that is not the same as agreement')
  }
  let digest = null
  try { digest = records.mdDigest({ path: wanted, indexFingerprint }) } catch (e) {
    return unavailable('the md comparison threw, so this read makes no claim either: ' + String((e && e.message) || e))
  }
  if (!digest || digest.available !== true) {
    return unavailable((digest && digest.means) || 'this deployment does not know its workspace root, so the index cannot be compared against a file')
  }
  const mdRevision = digest.mdRevision === undefined ? null : digest.mdRevision
  const mdStatus = digest.mdStatus === undefined ? null : digest.mdStatus
  const mdFingerprint = digest.mdFingerprint === undefined ? null : digest.mdFingerprint
  const exists = digest.exists === true
  const changed = digest.mdChangedSinceIndex === true
  const mdRev = mdRevision === null || mdRevision === undefined || mdRevision === '' ? null : Number(mdRevision)
  const indexRev = indexRevision === null ? null : Number(indexRevision)
  const ahead = changed && mdRev !== null && indexRev !== null && Number.isFinite(mdRev) && Number.isFinite(indexRev) && mdRev > indexRev
  const behind = changed && mdRev !== null && indexRev !== null && Number.isFinite(mdRev) && Number.isFinite(indexRev) && mdRev < indexRev
  // Same revision, different status: the md tracks the path, so a draft row legitimately stops agreeing with it once the
  // draft is adopted (status in the file became current). Naming that keeps it from being read as an external edit.
  const statusMoved = changed && !ahead && !behind && row !== null && mdStatus !== null && txt(row.status) !== txt(mdStatus)
  return {
    ok: true, available: true, path: wanted, absPath: digest.absPath === undefined ? null : digest.absPath, exists,
    mdMissing: exists === false,
    mdFingerprint, indexFingerprint, indexRevision, mdRevision, mdStatus,
    mdChangedSinceIndex: changed,
    mdAheadOfIndex: ahead,
    mdBehindIndex: behind,
    mdStatusMoved: statusMoved,
    // ★★★ RUN 248: the same facts the unavailable shape carries, so one md block never means two things — here
    // `mdWritten` is answered (`exists`), and `draftMdPath` names the draft file when this row is a draft.
    written: false, canonicalPath: canonicalPath, draftMdPath: draftMdPath,
    mdWritten: exists,
    mdMeans: mdFaceMeans({ draftRow: isDraftRow, canonical: canonicalPath, draftPath: draftMdPath === null ? '(none)' : draftMdPath }),
    means: !exists
      ? '索引里有这一版的行，但 md 文件不在磁盘上：读面不静默回退（不拿索引冒充文件），reindex 会把它计入 missing 并具名报告'
      : (!changed
        ? 'md 与索引一致（同一 sha256）：这里的内容就是磁盘上的正文'
        : (ahead
          ? 'md 比这一行新（md 记 r' + String(mdRevision) + '，这一行是 r' + String(indexRevision) + '）：这条路径已经推进到更新的版本。要读现行版用 state；要让索引追上 md（含历史行只增不改）走 vibe_vmu_records { action: "reindex" }'
          : (behind
            ? 'md 比这一行旧（md 记 r' + String(mdRevision) + '，这一行是 r' + String(indexRevision) + '）：这一行不是这条路径上最新的版本，md 跟的是最新的那一版'
            : (statusMoved
              ? '同一 revision，但 md 的 status 与这一行不同（md 记 ' + txt(mdStatus) + '，这一行是 ' + txt(row.status) + '）：文件跟的是这条路径的现行状态，草案落成后它的草案行不再与文件逐字节相同；正文一致（正文在 adopt 时逐字搬运）'
              : 'md 已被外部改过（磁盘 md 的 sha256 与索引行记的 mdFingerprint 不同）：这里给的是 INDEX 里的正文，不是磁盘正文。先 vibe_vmu_records { action: "reindex" } 让索引换成 md 的快照，再读')))),
  }
}

/**
 * ★★★ RUN 248: "is this revision's own md on disk right now" — asked for EVERY draft the `state` receipt lists, so a
 * reader never has to call the records face per draft. `null` = this deployment cannot answer (no md reader / no
 * workspace root), which is not the same as "no file", and the field is printed as null rather than guessed.
 */
function blueprintMdOnDisk({ records, path }) {
  const rel = txt(path)
  if (rel === '') return null
  if (!records || typeof records.mdDigest !== 'function') return null
  try {
    const digest = records.mdDigest({ path: rel })
    return digest && digest.available === true ? digest.exists === true : null
  } catch (e) {
    return null
  }
}

/** The row that represents the newest revision on a path: the in-force row when there is one, else the newest draft. */
export function newestBlueprintRow(rows, inForce = null) {
  if (inForce !== null && inForce !== undefined) return inForce
  if (!Array.isArray(rows) || rows.length === 0) return null
  return rows.slice().sort((a, b) => (b.revision - a.revision) || ((Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0)))[0]
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
  // ★ RUN 236: the two optional revision facts are READ here (so `state`/`read`/`listBlueprints` all see them without a
  // second path), and a malformed outline is a `problem` — the row still parses, the defect is named.
  const outlineParsed = parseOutlineField(fields[BLUEPRINT_OUTLINE_KEY])
  const revisionReason = oneLine(fields[BLUEPRINT_REASON_KEY])
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
  problems.push(...outlineParsed.problems)
  return { ok: problems.length === 0, id, fields, status, revision, text, authors: authorsParsed.authors, lastStaleSeenAt: msOf(fields.lastStaleSeenAt), outline: outlineParsed.outline, revisionReason: revisionReason === '' ? null : revisionReason, problems, malformed: parsed.malformed || [] }
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
    // ★ LIVE RUN 129 (F-129b): WITH NO ADOPTER THERE IS NOTHING TO JUDGE AGAINST. The sentence used to say
    // "adopt 人（（未指定））已由调用方校验为院士席" — it named the adopter as unspecified in the same breath as it
    // claimed the caller had verified that adopter was a chair, which is not a fact anyone had. `ok:false` here means
    // "cannot be judged yet" at propose time; `pending` says so, and the adopt-time call (which HAS the adopter) is the
    // one that decides.
    judged: who !== '',
    pending: who === '',
    inference: who === ''
      ? '此刻还没有 adopt 人，所以 seat 未记录的 authors 判不了院士侧／常驻侧（seat 记录在案的作者按 seat 原样判定）。`ok:false` 只表示「还没有 adopt 人可比对」，不是「缺共同设计」；adopt 时会用 adopt 人的席位解析。'
      : 'seat 未记录的 authors 按 adopt 人解析：adopt 人（' + who + '）已由调用方校验为院士席 ⇒ 与之同 id 的作者算院士侧，其余算常驻研究员侧。记录了 seat 的作者按 seat 原样判定。',
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
  // ★★★ RUN 256 / TB-2622: this used to teach a TEXT-ONLY propose, which under the RUN 255 fs-first default returns
  // filed:false and appends no author — i.e. the hint could never pass the gate it is printed beside. The one source
  // below is shared with both draftMdMissing receipts and both success receipts.
  const resume = resumeDraftHintOf(target)
  return refuse(BLUEPRINT_NEEDS_CODESIGN, message, resume.hint)
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
  const nowRead = clockReadingOf(opts.now, 'blueprintFreshness', { kernelClock: opts.nowFromKernel === true })
  const now = nowRead.at
  const window = windowWith(opts.staleAfterMs, opts.staleAfterMsSource)
  const path = txt(src.path)
  const records = src.records || null
  if (path === '') return freshnessReading({ path: '', available: false, reason: 'no-path', stamp: now, stampFromKernel: opts.nowFromKernel === true, staleAfterMs: window.ms, staleAfterMsSource: window.source })
  if (!records || typeof records.list !== 'function' || typeof records.get !== 'function') {
    return freshnessReading({ path, available: false, reason: 'no-records-face', stamp: now, stampFromKernel: opts.nowFromKernel === true, staleAfterMs: window.ms, staleAfterMsSource: window.source })
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
      stampFromKernel: opts.nowFromKernel === true,
      lastStaleSeenAt: inForce === null ? null : msOf(inForce.fields.lastStaleSeenAt),
    })
  } catch (e) {
    return freshnessReading({
      path,
      available: false,
      reason: (e && e.code) || 'read-failed',
      stamp: now,
      stampFromKernel: opts.nowFromKernel === true,
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
  const stampRead = clockReadingOf(input.stamp, 'freshnessReading', { kernelClock: input.stampFromKernel === true })
  const stamp = stampRead.at
  // ★★★ RUN 259 / AUDIT-14 P1-2: atSource is DERIVED from the measurement, never taken from the caller — a caller could
  // hand in `{stamp: <wall-clock NOW>, atSource: "kernel-clock"}` and make a wall-clock read claim to be a kernel reading.
  const stampSource = stampRead.atSource
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
    stamp,
    stampSource,
    clockSources: blueprintClockSourcesOf(),
    clockSourcesMeans: blueprintClockSourcesOf().means,
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
export function blueprintState({ records, path, now = null, atSource = null, staleAfterMs = null, staleAfterMsSource = null, nowFromKernel = false }) {
  const atSourceGiven = atSource
  const { rows, skipped } = listBlueprints({ records, path })
  const track = records
  const stampRead = clockReadingOf(now, 'blueprintState', { kernelClock: nowFromKernel === true })
  const stamp = stampRead.at
  // ★★★ RUN 259 / AUDIT-14 P1-2: the caller may describe its reading (`atSourceGiven`, kept for history) but the value
  // written into the receipt is the MEASURED one. Overriding it made `atSource` a claim, not a measurement.
  const atSourceOut = stampRead.atSource
  const atSourceCaller = txt(atSourceGiven) === '' ? null : txt(atSourceGiven)
  const window = windowWith(staleAfterMs, staleAfterMsSource)
  const currents = rows.filter((r) => r.status === 'current')
  const inForce = currents.length === 0 ? null : currents[currents.length - 1]
  const adoptedAt = inForce === null ? null : msOf(inForce.fields.adoptedAt)
  const ageMs = adoptedAt === null ? null : Math.max(0, stamp - adoptedAt)
  const stale = adoptedAt !== null && ageMs > window.ms
  const currentRevision = inForce ? inForce.revision : 0
  const drafts = rows.filter((r) => r.status === 'draft' && r.revision > currentRevision)
  // ★ RUN 236 — the two optional revision facts of the version IN FORCE (and of every draft the receipt lists). They are
  // read off the rows (the same fields the md header carries), so the read face has ONE answer for "what is the outline
  // of this revision" and never needs a second call.
  const outlineOf = (row) => parseOutlineField(row && row.fields ? row.fields[BLUEPRINT_OUTLINE_KEY] : '').outline
  const reasonOf = (row) => oneLine(row && row.fields ? row.fields[BLUEPRINT_REASON_KEY] : '')
  const currentOutline = inForce === null ? [] : outlineOf(inForce)
  const currentReason = inForce === null ? '' : reasonOf(inForce)
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
        // ★ RUN 236: the overdue mark rewrites the row body, so the two optional revision facts travel with it — a mark
        // that dropped them would erase "why this revision exists" and its outline while adding a timestamp.
        outline: currentOutline,
        revisionReason: currentReason,
        // ★ RUN 225-A: the overdue mark rewrites the row body, so the md stamp must travel with it or the write would
        // erase the one thing that lets a later reader compare the row against the file.
        mdFingerprint: txt(inForce.fields[BLUEPRINT_MD_KEY]),
        // ★★★ RUN 248: and so must the file the row owns — a mark that dropped `mdPath` would leave the in-force row
        // pointing at nothing while its `mdFingerprint` still described a file.
        mdPath: txt(inForce.fields[BLUEPRINT_MD_PATH_KEY]),
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
    // ★ TB-2655 / task-134 (MEASURED on prompt-lane suite): this internal re-validation used to forget WHICH CLOCK the
    // stamp came from, so a `boot({ clock: () => 1000 })` deployment (the harness unit) had its own measured stamp
    // re-checked as if a caller payload and refused VMU_V5R_CLOCK_VALUE_INVALID. The seam flag travels with the VALUE.
    stampFromKernel: nowFromKernel === true,
    atSource: atSourceOut,
    atSourceCaller: atSourceCaller,
    lastStaleSeenAt,
    persist,
    staleAfterMs: window.ms,
    staleAfterMsSource: window.source,
  })
  const md = blueprintMdReading({ records, path: txt(path), row: newestBlueprintRow(rows, inForce) })
  // ★★★ RUN 239-B (run 62 / FEEDBACK62 ③): with no revision in force there IS no outline to compare, and the generic
  // "this revision carried no outline" sentence told the reader the wrong reason (there is no revision at all). The
  // means is rewritten against the fact the receipt already prints (`current:null`), not against a missing field.
  const outlineRead = outlineReading({ outline: currentOutline, source: 'row' })
  if (inForce === null) {
    outlineRead.outlineMeans = '还没有生效的修订（current:null），所以没有 outline 可对比：这不是「这次修订没带 outline」——这条路径上还没有任何 revision 被 adopt，行上也就没有骨架可读；草案的 outline 在 drafts 里逐条给出'
  }
  return {
    ok: true,
    path: txt(path),
    track: BLUEPRINT_TRACK,
    kind: BLUEPRINT_KIND,
    // ★★ RUN 225-A: the index says what it was built from; the file says what the document is NOW. Both are printed,
    // and a disagreement is DISCLOSED here (mdChangedSinceIndex) with the repair named — never resolved silently.
    md,
    mdChangedSinceIndex: md.mdChangedSinceIndex,
    mdMissing: md.mdMissing,
    mdFingerprint: md.mdFingerprint,
    indexFingerprint: md.indexFingerprint,
    mdMeans: md.means,
    // ★★★ RUN 248: a draft owns its own file, so the read face must name it (`draftMdPath`) and say whether it is on
    // disk (`mdWritten`) — a reader that had to reconstruct `<dirname>/Drafts/<stem>-r<N>.md` would be guessing at the
    // one fact this mechanism promises to have written.
    draftMdPath: md.draftMdPath,
    mdWritten: md.mdWritten,
    // ★ RUN 236: G8 (outline) + G11 (revision reason) on the READ face. Both appear even when absent (`[]` / `null`), each
    // beside a sentence that says what the absence MEANS; `current`/`drafts` repeat them so one row is one answer.
    ...outlineRead,
    ...revisionReasonReading({ revisionReason: currentReason, source: currentReason === '' ? 'none' : 'row' }),
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
      outline: currentOutline,
      revisionReason: currentReason === '' ? null : currentReason,
      mdWrittenBy: blueprintMdProvenanceOf(inForce.fields).writtenBy,
      mdOwner: mdOwnerOf({
        records, mdPath: txt(inForce.fields[BLUEPRINT_MD_PATH_KEY]),
        writtenBy: blueprintMdProvenanceOf(inForce.fields).writtenBy,
        wroteInOwnTurn: blueprintMdProvenanceOf(inForce.fields).wroteInOwnTurn,
      }),
    },
    currentRevision,
    updatedAt: adoptedAt,
    ageMs,
    stale,
    staleAfterMs: window.ms,
    staleAfterMsSource: window.source,
    staleNote: freshness.staleNote,
    stamp,
    stampSource: atSourceOut,
    stampSourceCaller: atSourceCaller,
    clockSources: blueprintClockSourcesOf(),
    clockSourcesMeans: blueprintClockSourcesOf().means,
    lastStaleSeenAt,
    // ★ B4: the SAME shape `blueprintFreshness` returns (plus `persist`, which says whether this read wrote the mark).
    freshness,
    // ★★★ RUN 248: each draft names the md file it owns and whether that file is on disk. `mdPath` is the row header's
    // own field (the file the row was indexed from), `mdWritten` asks the records face — the draft is a DOCUMENT now, so
    // "where is it" is part of listing the drafts, not a follow-up call.
    drafts: drafts.map((d) => {
      const draftMdPathOfRow = txt(d.fields[BLUEPRINT_MD_PATH_KEY]) || null
      const draftProvenance = blueprintMdProvenanceOf(d.fields)
      return {
        id: d.id, revision: d.revision, proposedBy: d.fields.proposedBy || null, proposedAt: d.fields.proposedAt || null,
        bytes: d.bytes === undefined ? null : d.bytes, authors: d.authors, outline: outlineOf(d),
        revisionReason: reasonOf(d) === '' ? null : reasonOf(d),
        mdPath: draftMdPathOfRow,
        draftMdPath: draftMdPathOfRow,
        mdWritten: blueprintMdOnDisk({ records, path: draftMdPathOfRow === null ? '' : draftMdPathOfRow }),
        // ★★★ RUN 255 / TB-2613: WHO wrote this draft file, read off the row provenance, with the evidence (bytes/sha256)
        // taken from the disk at read time. A draft with no file has mdOwner:null — the absence is the answer.
        mdWrittenBy: draftProvenance.writtenBy,
        mdOwner: mdOwnerOf({
          records, mdPath: draftMdPathOfRow === null ? '' : draftMdPathOfRow,
          writtenBy: draftProvenance.writtenBy, wroteInOwnTurn: draftProvenance.wroteInOwnTurn,
        }),
      }
    }),
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
  // ★★ RUN 225-A: reading ONE revision is the act most likely to be answered from a stale index (a human edited the md
  // and asked "what does r3 say now?"). The receipt carries the file comparison, so the body above is never mistaken for
  // the file when the two disagree. The comparison takes the PARSED row (its blueprint header), not the records shell:
  // the shell's `status` is the records lifecycle (live/trashed) and its `revision` is the row version, and reading those
  // as the blueprint's status/revision made every read claim a status change.
  const md = blueprintMdReading({
    records, path: txt(parsed.fields.path),
    row: { id: parsed.id, revision: parsed.revision, status: parsed.status, fields: parsed.fields, updatedAt: got.updatedAt },
  })
  return Object.assign({
    ok: parsed.ok, row: got, problems: parsed.problems,
    md, mdChangedSinceIndex: md.mdChangedSinceIndex, mdMissing: md.mdMissing, mdFingerprint: md.mdFingerprint,
    indexFingerprint: md.indexFingerprint, mdMeans: md.means,
    // ★★★ RUN 248: reading ONE revision prints the file that revision owns and whether it is on disk — the draft md is
    // the document, so "what did I actually read" includes "from which file, and is it there".
    draftMdPath: md.draftMdPath, mdWritten: md.mdWritten,
    // ★★★ RUN 255 / TB-2613: the ownership evidence for the file this row indexes (reader-side, from the row provenance
    // plus a fresh disk read), or null when the row owns no file.
    mdWrittenBy: blueprintMdProvenanceOf(parsed.fields).writtenBy,
    mdOwner: mdOwnerOf({
      records, mdPath: txt(parsed.fields[BLUEPRINT_MD_PATH_KEY]),
      writtenBy: blueprintMdProvenanceOf(parsed.fields).writtenBy,
      wroteInOwnTurn: blueprintMdProvenanceOf(parsed.fields).wroteInOwnTurn,
    }),
  }, parsed, outlineReading({ outline: parsed.outline, source: 'row' }),
  revisionReasonReading({ revisionReason: parsed.revisionReason || '', source: parsed.revisionReason === null ? 'none' : 'row' }))
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
 * ★★★ RUN 248 (user ruling, 2026-11-06): A DRAFT IS A DOCUMENT ON DISK. Two shapes, both of them WRITE a draft md — the
 * first one is the member writing it (`mdPath`, its own fs tool), the second is the kernel materializing it
 * (`<dirname>/Drafts/<stem>-r<N>.md`). Either way the file is read back, its sha256 goes into the row beside `mdPath`,
 * and the row is re-read after the write to prove the row and the file carry the same bytes. A named `mdPath` that is
 * not on disk is refused by code (`VMU_PACK_V5R_BLUEPRINT_MD_MISSING`) with that path and the reachable fix — never silently
 * replaced by an empty draft.
 */
export function proposeBlueprint({ records, path, text, by, draft = '', at = null, atKernel = false, note = '', seat = '', outline = null, revisionReason = '', requireOutline = false, mdPath = '', materialize = false, inOwnTurn = null }) {
  const track = refuseIfNoRecords(records)
  // ★★★ RUN 255 / TB-2613: the DEFAULT flipped to fs-first. Omitting `mdPath` no longer means "the kernel writes the
  // draft": it means the member still owes that file, and the receipt asks for it (`draftMdMissing`). Kernel
  // materialization remains available, but only when asked for by name (`materialize: true`) — the old behaviour is now
  // an explicit choice instead of a silent default.
  const materializeNow = materialize === true
  const inOwnTurnGiven = inOwnTurn === true ? true : (inOwnTurn === false ? false : null)
  // ★★★ RUN 248: the draft md the MEMBER may have written itself (fs). Empty = the member still owes the file.
  const givenMdPath = txt(mdPath)
  const wantedPath = txt(path)
  if (wantedPath === '') throw refuse('VMU_INVALID_ARGUMENT', 'a blueprint proposal needs the path it is about',
    'pass path:<the blueprint path> (this pack\'s ' + BLUEPRINT_PATH_KEY + ' is Shared/Protocol.md)')
  const body = txt(text)
  // ★★★ RUN 248: with `mdPath` the FILE is the document, so `text` may be omitted (the prose is read off the file).
  // Without it, an empty revision is refused as before — a draft that froze "nothing" would be adopted as nothing.
  if (body === '' && givenMdPath === '') throw refuse('VMU_INVALID_ARGUMENT', 'a blueprint proposal needs text',
    'pass text:<the full blueprint revision> — an empty revision would silently adopt "nothing"; or pass mdPath:<a draft md you already wrote> and that file supplies the text')
  const author = txt(by)
  if (author === '') throw refuse('VMU_INVALID_ARGUMENT', 'a blueprint proposal needs its author',
    'pass member:<the roster id proposing> — an unsigned revision cannot be reviewed or audited')
  const stampRead = clockReadingOf(at, 'proposeBlueprint', { kernelClock: atKernel === true })
  const stamp = stampRead.at
  const atSource = stampRead.atSource
  const seatGiven = txt(seat)
  // ★ RUN 236: both optional revision facts are validated BEFORE anything is written (a malformed outline must never leave
  // the md rewritten and the row half-updated). `provided: false` (absent) is not a problem; a malformed one is refused by
  // NAME, with the shape the caller has to pass — dropping bad entries silently is the "tolerant read lied" defect class.
  const outlineParsed = parseOutlineField(outline)
  if (outlineParsed.provided && outlineParsed.problems.length > 0) {
    throw refuse('VMU_INVALID_ARGUMENT', 'the outline is malformed: ' + outlineParsed.problems.join('; '),
      'pass outline:[{id,title,depth}] — one entry per outline node, depth one of ' + BLUEPRINT_OUTLINE_DEPTHS.join('|') + ' (1=粗, 2=细)')
  }
  const reasonGiven = oneLine(revisionReason)
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
  // ★ RUN 236 — the two optional revision facts, resolved ONCE for both write branches. A continuation that does not
  // restate them CARRIES them (the draft is the same revision: its outline and its reason do not vanish because a second
  // designer appended a section). `source` says which of the two happened.
  // ★★★ RUN 239-B (run 62 / FEEDBACK62 ①, MEASURED): the continuation case MERGES instead of replacing — a second
  // designer's `[{id:"2"},{id:"2.1"}]` used to erase the base `[{id:"1"},{id:"1.1"}]` from the row while both text
  // sections survived. The outline now composes like the text does: same id = this writer overrides title/depth, new id
  // is appended, ids only the base had are kept. A new revision (target === null) has no base, so it takes the given
  // outline as-is; BOTH cases print `outlineMerged`, so a caller can see which of the two happened without inferring.
  const inheritedOutline = target !== null && Array.isArray(target.outline) ? target.outline : []
  const incomingOutline = outlineParsed.provided ? outlineParsed.outline : []
  const mergedOutline = mergeOutline(inheritedOutline, incomingOutline)
  const outlineNext = mergedOutline.outline
  const outlineSource = outlineParsed.provided ? 'request' : (inheritedOutline.length > 0 ? 'draft' : 'none')
  const outlineMerged = outlineMergedReading({ merged: mergedOutline, continued: target !== null, provided: outlineParsed.provided })
  const inheritedReason = target !== null ? txt(target.revisionReason) : ''
  const reasonNext = reasonGiven !== '' ? reasonGiven : inheritedReason
  const reasonSource = reasonGiven !== '' ? 'request' : (inheritedReason !== '' ? 'draft' : 'none')
  // ★★★ RUN 213 (run 50 / FEEDBACK49 1.4): strip a heading the caller repeated, and SAY that it happened — a silent
  // drop would be the same class of defect as the duplicate itself.
  const cleanedBody = stripRepeatedCodesignHeading(body)
  const headingDropped = cleanedBody.dropped
  const cleanBody = cleanedBody.text
  // ★★★ RUN 215 (run 52 / FEEDBACK51 1.1a, MEASURED): the `dropped:0` branch said "the text you passed carried no
  // `## 共同设计补充｜…` heading" while the caller's text DID carry one — just not on the first line, which is the only
  // line this stripper reads. A sentence about the rule was written as a sentence about the text. The branch now says
  // which of the two happened, and names the first-line rule the caller has to know before writing.
  const headingLinesInInput = txt(body).split('\n').filter((l) => l.trim().startsWith(BLUEPRINT_CODESIGN_SECTION)).length
  // ★★★ RUN 215 (run 52 / FEEDBACK51 1.1b, MEASURED): a continuation that pastes the draft it just read carries the whole
  // base again; that copy is stripped (see stripLeadingDuplicateDraft) and the receipt says how much went.
  // A continuation can paste the composed draft (what `read` returns) or just its `## 正文` base — both are copies of text
  // the reader already holds, so both are stripped; the base is tried second only when the whole draft did not match.
  const dup = (() => {
    if (target === null) return { text: cleanBody, droppedChars: 0, matched: null }
    const whole = stripLeadingDuplicateDraft(cleanBody, target.text)
    if (whole.matched !== null) return whole
    return stripLeadingDuplicateDraft(cleanBody, blueprintCodesignSections(target.text).base)
  })()
  const bodyNext = dup.text
  const bodyPrefixDropped = dup.droppedChars
  // ★★★ RUN 217 (run 54 / FEEDBACK53 ①-1, MEASURED): this sentence said "the draft it continued" even when the call
  // continued NOTHING - the path had no open draft (the previous one was adopted), so a new revision was started and
  // `continued:false`. The caller read `bodyPrefixDropped:0` as "you did not paste it back" and concluded the strip was
  // broken. A sentence about a different call is the defect class this phase keeps removing: the branch now says which
  // row the text was actually joined to (or that none was), and `continuedBase` names the request beside the outcome.
  const bodyPrefixDroppedMeans = target === null
    ? 'this call STARTED revision ' + String(revision) + ' (continued:false): no earlier draft was joined to your text, so there was no draft body in front of it to strip - bodyPrefixDropped is 0 because nothing was compared, not because pasted text survived'
    : (dup.matched === null
    ? 'your text did not begin with the draft it continued, so nothing was removed from it'
    : 'the first ' + String(dup.droppedChars) + ' character(s) of your text were the DRAFT you were continuing, pasted back in: that copy was removed, so this revision holds it once. Only the text after it was stored as your section')
  // ★★★ RUN 217: WHICH ROW did this text join? `continued:false` was already in the receipt, but nothing said WHICH draft
  // was (not) continued, so a caller that had just read rec-1 could not see that rec-1 was history and this call started rN.
  const continuedBase = target === null
    ? { requested: explicit === '' ? null : explicit, actual: null, continued: false, revision,
        why: explicit === ''
          ? 'this call named no draft and this path had no OPEN draft, so it started a new one (r' + String(revision) + ')'
          : 'the named draft could not be continued, so this call started a new draft (r' + String(revision) + ')',
        means: 'continued:false is a FACT about this call, not a failure - and `bodyPrefixDropped:0` follows from it: with no row joined there is nothing to compare your text against. Read `actual` to know which row (none) holds this revision' }
    : { requested: explicit === '' ? null : explicit, actual: target.id, continued: true, revision: target.revision,
        why: explicit === ''
          ? 'this call named no draft: it continued the OPEN draft of this path'
          : 'this call continued the draft it named',
        means: 'the row your text was joined to is `' + String(target.id) + '` (r' + String(target.revision) + '): read THAT row to know what the revision now holds' }
  // ★★★ RUN 214 (run 51 / FEEDBACK50 1.1, MEASURED): the sentence used to say "THIS TOOL writes that heading itself" in BOTH
  // branches. That is true only when a section is ADDED to an existing draft (the composer writes `## 共同设计补充｜<member>`).
  // A FIRST proposal has no per-member section at all: its heading was dropped and nothing was written in its place, so the
  // acceptance reading "every member's heading appears once" came out as 0 for the first proposer while the receipt
  // claimed the tool had supplied one. The drop is now described against what actually happened to THIS call.
  const headingDroppedMeans = headingDropped === 0
    ? (headingLinesInInput > 0
      ? 'the text you passed carries ' + String(headingLinesInInput) + ' `## 共同设计补充｜…` heading line(s) but NOT as the first line: only a heading on the very FIRST line is recognised and dropped, so your heading line was stored verbatim inside the text (it will be read as part of the body, not as a section header)'
      : 'the text you passed carries no `## 共同设计补充｜…` heading line at all, so nothing had to be dropped')
    : (target === null
      ? 'the text you passed began with ' + String(headingDropped) + ' `## 共同设计补充｜…` heading line(s) and they were DROPPED: this is the FIRST proposal of this revision, so there is no per-member section yet and the base text is stored as you wrote it minus those heading lines — no heading was written in its place. A section heading is only written when a section is ADDED to an existing draft (continue that draft)'
      : 'the text you passed began with ' + String(headingDropped) + ' `## 共同设计补充｜…` heading line(s); THIS TOOL writes that heading itself for a section ADDED to an existing draft, so your copy was dropped instead of being stored twice (the rest of your text is unchanged)')
  // ★★★ RUN 218 (run 54 / FEEDBACK53 1.2 + 2.3, MEASURED): the office filed a DIAGNOSTIC propose (never adopted,
  // "just to test the face") and it silently joined the draft two members were writing: the receipt answered id/revision
  // and nothing said the row is INSTITUTE-WIDE. `authors` had three rows, but a reader has to know to count them. There is
  // no private draft in this institution: the row is in the shared records track, every member kernel over this workspace
  // reads it, and it stays until the draft is adopted (or pruned). The receipt now says so, and names what this call joined
  // (or that it started the row), so "file it and throw it away" is refused by the facts BEFORE it becomes someone's base.
  // ★★★ RUN 222 (run 58 / FEEDBACK57 B, MEASURED): this paragraph used to print BOTH windows in one breath, so a call that
  // STARTED a fresh draft row on a path that already had an adopted revision was told "AFTER adoption your text is inside the
  // CURRENT protocol row" — the opposite of the fact (a new row is a draft, and the BEFORE window is the one that applies to
  // it). Run 58 came within one inference of believing its own text could not be removed. The sentence now names the window
  // THIS call is in and keeps the other one as a warning about later, not as a claim about now.
  const draftSharingOf = (joinedId, authorList, continued) => ({
    scope: 'institute-wide',
    revision,
    appendedTo: joinedId,
    continuesOpenDraft: continued === true,
    authors: authorList.map((a) => txt(a.member)),
    means: 'a draft is NOT private: this revision lives in the shared records track and every member kernel over this '
      + 'workspace reads the SAME row' + (joinedId === null
        ? ' — this call STARTED it, so the next author writes on top of your text'
        : ' (' + String(joinedId) + '), so a proposal filed to test the face is visible to every member and becomes part '
          + 'of the text they continue')
      + '. Nothing is discarded automatically. THE WINDOW THIS CALL IS IN: '
      + (continued === true
        ? 'your text went into the OPEN DRAFT row ' + String(joinedId) + ', which is NOT adopted'
        : 'your text is in a NEW DRAFT row — this call adopted nothing')
      + ', so the BEFORE-adoption window is the live one: prune that row by id (vibe_vmu_records { action: "prune", track: "blueprint", ids: "<the draft row id>" }) removes the whole draft, including your text. '
      + 'The AFTER-adoption window is stated only so the future is not a surprise, and it does NOT describe this call: once the chair adopts a revision, that text sits inside the CURRENT protocol row, prune moves WHOLE rows, and there is NO path that deletes just a paragraph. '
      + 'If the text was diagnostic, say so in `note`; otherwise it is the base the next author writes on',
  })
  if (target === null) {
    const authors = [entry]
    // ★★★ RUN 248: THE DRAFT FILE FIRST, THEN THE ROW. Two ways the file exists — the member wrote it (`mdPath`, its own
    // fs tool) or the kernel materializes `<dirname>/Drafts/<stem>-r<N>.md` here. Either way the row records the file
    // sha256 + path and is RE-READ after the write (verifyBlueprintRowMd), so "the row indexes the file" is a checked
    // fact; a named `mdPath` that is not on disk is refused by name instead of being replaced by an empty draft.
    const draftPath = givenMdPath !== '' ? blueprintMdRelOf({ records, mdPath: givenMdPath }) : blueprintDraftMdPathOf({ path: wantedPath, revision })
    const memberDraft = givenMdPath !== '' ? readBlueprintDraftMd({ records, mdPath: draftPath }) : null
    if (memberDraft !== null && memberDraft.available === true && memberDraft.exists === false) {
      throw refuse(BLUEPRINT_MD_MISSING,
        'the draft md you named is not on disk: ' + draftPath,
        'write it first with the fs tool (<workspace>/VibeMath/' + draftPath + ' — a plain markdown file, or a blueprint md whose `## 正文` holds the prose), then call propose again with the same mdPath; or omit mdPath and pass materialize:true, and the kernel writes the draft file it owns (' + blueprintDraftMdPathOf({ path: wantedPath, revision }) + ') from your text (RUN 255: the default is fs-first, so the kernel no longer writes it unasked). REACHABLE INSTEAD: 用 fs 写 ' + draftPath + '（纯 markdown，或把正文放进 blueprint md 的 `## 正文`），再以同一 mdPath 调 vibe_v5_blueprint {action:"propose", path:"' + wantedPath + '", member, mdPath:"' + draftPath + '"}；或省略 mdPath 并传 materialize:true，由内核写 ' + blueprintDraftMdPathOf({ path: wantedPath, revision }))
    }
    const fileText = memberDraft !== null && memberDraft.exists === true ? txt(memberDraft.text) : ''
    if (memberDraft !== null && memberDraft.exists === true && fileText === '') {
      throw refuse('VMU_INVALID_ARGUMENT', 'the draft md ' + draftPath + ' carries no text, so it would propose an empty revision',
        'write the revision prose into ' + draftPath + ' and call propose again — a draft that froze nothing would be adopted as nothing')
    }
    const textSource = fileText !== '' ? 'md' : 'argument'
    const draftText = fileText !== '' ? fileText : bodyNext
    const textArgumentDropped = fileText !== '' && body !== '' && body !== fileText
    const memberFileHere = memberDraft !== null && memberDraft.available === true && memberDraft.exists === true
    let md = null
    if (memberFileHere) {
      md = {
        ok: true, available: true, written: false, writtenBy: 'member-file',
        wroteInOwnTurn: inOwnTurnGiven,
        path: draftPath, mdPath: draftPath, absPath: memberDraft.absPath,
        fingerprint: memberDraft.fingerprint, bytes: memberDraft.bytes, format: memberDraft.format,
        atomic: null, replaced: false,
        means: 'this call wrote NO file: the draft md is the member own file (fs), read back and indexed as it stands — the row stores the sha256 of those bytes, so any later edit of the file is one detectable fact, and the row records WHO wrote it (mdWrittenBy) instead of leaving ownership to be guessed',
      }
    } else if (materializeNow) {
      // legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
      const mdFields = blueprintMdHeaderOf({
        path: wantedPath, status: 'draft', revision, proposedBy: author, proposedAt: stamp, note, authors, mdPath: draftPath,
        outline: outlineNext, revisionReason: reasonNext,
        mdWrittenBy: 'kernel-materialized', mdWroteInOwnTurn: 'false',
      })
      const mdWrote = writeBlueprintMd({
        records, path: draftPath, title: BLUEPRINT_TITLE_PREFIX + wantedPath + '｜r' + revision + '｜草案',
        status: 'draft', revision, fields: mdFields, text: draftText,
      })
      md = Object.assign({}, mdWrote, { writtenBy: 'kernel-materialized', wroteInOwnTurn: false, mdPath: draftPath })
    } else {
      // ★★★ RUN 255 / TB-2613: THE DEFAULT. Nothing is written — not the file, not a row. The call honestly reports the
      // one fact the caller has to act on (the draft md does not exist yet) and hands back the text it would have written,
      // so the member can write it with its own fs tool and call again with mdPath. A row written here would claim a
      // document that is not on disk, which is exactly the "invented evidence" class this institution refuses.
      // ★★★ RUN 256 / TB-2622: the ONE resume hint (shared with the adopt refusal and both success receipts).
      const RH = resumeDraftHintOf({ fields: { path: wantedPath, revision, mdPath: draftPath } })
      return {
        ok: true,
        action: 'propose',
        filed: false,
        id: null,
        path: wantedPath,
        revision,
        baseRevision: currentRevision,
        status: null,
        proposedBy: author,
        proposedAt: stamp,
        continued: false,
        draftMdMissing: true,
        materialize: false,
        mdPath: draftPath,
        draftMdPath: draftPath,
        text: draftText,
        textSource,
        textArgumentDropped,
        md: {
          ok: true, available: true, written: false, writtenBy: null, wroteInOwnTurn: null,
          path: draftPath, mdPath: draftPath, absPath: null, fingerprint: null, bytes: 0,
          format: null, atomic: null, replaced: false,
          means: 'this call wrote NOTHING: the default is fs-first, so the draft md is still the member own to write — no file, no row, no sha to claim',
        },
        mdFingerprint: null,
        mdWritten: false,
        writtenBy: null,
        mdOwner: null,
        // ★★★ RUN 255 rev3 (Lead P0-3, MEASURED): the receipt SHAPE may not depend on whether a file was written. The
        // success path carries headingDropped/bodyPrefixDropped/verified; if the early exit simply OMITTED them a caller
        // reading `receipt.headingDropped` got `undefined` — the same key silently missing exactly when the call filed
        // nothing. Named null says the honest thing: nothing was cleaned, because nothing was written.
        headingDropped: null,
        headingDroppedMeans: 'not cleaned: this call wrote no row and no file (draftMdMissing:true), so no `## 共同设计补充｜…` heading was stripped from any body — null is the named absence, not 0 (0 would claim a body was inspected and found clean)',
        bodyPrefixDropped: null,
        bodyPrefixDroppedMeans: 'not measured: this call joined no earlier draft (nothing was filed), so there was no pasted copy to compare - null is the named absence, not 0',
        verified: null,
        fingerprint: null,
        deduplicated: false,
        mdChangedSinceIndex: null,
        // ★★★ RUN 256 / TB-2622: the hint and the action list come from the ONE source (`resumeDraftHintOf`) — the
        // same text the adopt refusal prints, so the dead end and the gate cannot teach different calls again.
        why: 'the draft md ' + draftPath + ' is not on disk yet: under the RUN 255 fs-first default the kernel does NOT write it (and does not write a row) — the member owns this document',
        resumeHint: RH.hint,
        resumeHintMeans: RH.means,
        nextActions: RH.nextActions,
        nextActionsMeans: RH.means + ' — the three steps are ONE chain: write the file, re-propose with the SAME mdPath, then adopt after both seats wrote',
        note: '草案还没有落盘（draftMdMissing:true）：跑 ① 用 fs 把整份正文写进 ' + draftPath + '，② 带同一个 mdPath 重新 propose（filed:true、你的 member 记入 authors），③ 两席都写过之后 adopt。text-only propose 不会写文件也不会追加 authors，别照旧文案走。',
      }
    }
    const composed = composeBlueprintBody({
      path: wantedPath, status: 'draft', revision, proposedBy: author, proposedAt: stamp, note, authors,
      outline: outlineNext, revisionReason: reasonNext,
      mdFingerprint: md.available === true ? (md.fingerprint || '') : '',
      mdPath: md.available === true ? draftPath : '',
      mdWrittenBy: md.writtenBy === undefined || md.writtenBy === null ? '' : md.writtenBy,
      mdWroteInOwnTurn: md.wroteInOwnTurn === true ? 'true' : '',
      text: draftText,
    })
    const put = track.put({
      track: BLUEPRINT_TRACK,
      kind: BLUEPRINT_KIND,
      title: BLUEPRINT_TITLE_PREFIX + wantedPath + '｜r' + revision + '｜草案',
      body: composed,
      settled: false,
      by: author,
    })
    const verified = verifyBlueprintRowMd({ track, id: put.id, md, mdPath: draftPath, text: draftText })
    // ★★★ RUN 256 / TB-2622: the codesign precondition — the SAME hint the adopt gate prints, on the receipt that
    // creates the draft, so "what is still missing before adopt" is answered by one text everywhere.
    const RH = resumeDraftHintOf({ id: put.id, fields: { path: wantedPath, revision, mdPath: draftPath } })
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
      continuedBase,
      authors,
      draftSharing: draftSharingOf(null, authors, false),
      codesign: blueprintCodesignStatus(authors, ''),
      atSource,
      clockSources: blueprintClockSourcesOf(),
      clockSourcesMeans: blueprintClockSourcesOf().means,
      // ★★★ RUN 256 / TB-2622: same text as the adopt refusal and both draftMdMissing receipts (one source).
      resumeHint: RH.hint,
      resumeHintMeans: RH.means,
      ...outlineReading({ outline: outlineNext, requireOutline: requireOutline === true, source: outlineSource }),
      ...revisionReasonReading({ revisionReason: reasonNext, source: reasonSource }),
      // ★★★ RUN 239-B: WHICH outline handling this call did (merge for a continuation, take-as-given for a new revision).
      outlineMerged,
      // ★★★ RUN 248: the DRAFT md on disk (this call wrote it, or read the member own file), the sha256 the row now
      // indexes it by, and the row-versus-file check that ran after the write.
      md,
      mdFingerprint: md.fingerprint,
      mdPath: md.available === true ? draftPath : null,
      draftMdPath: md.available === true ? draftPath : null,
      mdWritten: md.available === true && txt(md.fingerprint) !== '',
      writtenBy: md.writtenBy === undefined ? null : md.writtenBy,
      // ★★★ RUN 255 (sim-lane mainline): `filed` and `draftMdMissing` are ALWAYS BOTH PRESENT — the success receipt used
      // to carry only `draftMdMissing:false`, so the same key was missing exactly when the call succeeded.
      filed: true,
      draftMdMissing: false,
      materialize: materializeNow,
      mdOwner: mdOwnerOf({
        records, mdPath: md.available === true ? draftPath : '',
        writtenBy: md.writtenBy === undefined ? null : md.writtenBy,
        wroteInOwnTurn: md.wroteInOwnTurn === undefined ? null : md.wroteInOwnTurn,
      }),
      textSource,
      textArgumentDropped,
      verified,
      mdChangedSinceIndex: false,
      fingerprint: put.fingerprint || null,
      deduplicated: put.deduplicated === true,
      headingDropped,
      headingDroppedMeans,
      bodyPrefixDropped,
      bodyPrefixDroppedMeans,
      note: '草案不会生效：要有主席席落成（adopt）才是 current。草案自己的 md 在 ' + (md.available === true ? draftPath : '(这台部署没有 md 面，正文只在行里)') + '，adopt 把它的正文晋升到 ' + wantedPath + '。共同设计：让院士与本所至少一名常驻研究员各自 propose 一次（同一路径下会续写这同一份草案与同一个 md 文件），adopt 前两方都必须有 authors 留痕。',
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
  // ★★★ RUN 216 (run 53 / FEEDBACK52 1.1b, MEASURED): when the FIRST proposer pasted the whole draft back in, the strip
  // above left only the text they appended — and this branch then REPLACED the base with it, so the draft's own body
  // disappeared while `bodyPrefixDroppedMeans` said "this revision holds it once". A strip removes a COPY; it must never
  // make the remainder the whole base. Whenever something was stripped, the remainder is an ADDITION: the base stays,
  // and the author gets a section on top of it, exactly like any other designer.
  const strippedCopy = dup.matched !== null
  if (txt(target.fields.proposedBy) === author && !strippedCopy) {
    // The first proposer edits the `## 正文` base; the other designers' sections are preserved as they wrote them.
    textNext = composeBlueprintText(bodyNext, split.sections)
  } else {
    const sections = split.sections.filter((s) => txt(s.member) !== author)
    sections.push({ member: author, text: bodyNext })
    textNext = composeBlueprintText(split.base, sections)
  }
  // ★★★ RUN 248: a continuation EDITS the draft document, so the SAME draft md file is rewritten (the member file it
  // named, or the file the row already owns, or the derived path for a row written before drafts had files) and the row
  // then indexes the new bytes. A mdPath naming a DIFFERENT file is refused: a continuation appends to ONE document, and
  // writing a second file would leave two candidates for "the draft".
  const targetMdPath = blueprintMdRelOf({ records, mdPath: txt(target.fields[BLUEPRINT_MD_PATH_KEY]) })
  if (targetMdPath !== '' && givenMdPath !== '' && blueprintMdRelOf({ records, mdPath: givenMdPath }) !== targetMdPath) {
    throw refuse('VMU_INVALID_ARGUMENT',
      'draft ' + target.id + ' owns the md "' + targetMdPath + '", not "' + blueprintMdRelOf({ records, mdPath: givenMdPath }) + '"',
      'a continuation writes the draft own md: pass that mdPath, or omit mdPath and this call uses ' + targetMdPath)
  }
  const draftPath = givenMdPath !== '' ? blueprintMdRelOf({ records, mdPath: givenMdPath }) : (targetMdPath !== '' ? targetMdPath : blueprintDraftMdPathOf({ path: wantedPath, revision: target.revision }))
  const memberDraft = givenMdPath !== '' ? readBlueprintDraftMd({ records, mdPath: draftPath }) : null
  if (memberDraft !== null && memberDraft.available === true && memberDraft.exists === false) {
    throw refuse(BLUEPRINT_MD_MISSING,
      'the draft md you named is not on disk: ' + draftPath,
      'write it first with the fs tool, then call propose again with the same mdPath; or pass materialize:true to ask the kernel to write ' + draftPath + ' from the row (RUN 255: the default is fs-first)')
  }
  const memberFileHere = memberDraft !== null && memberDraft.available === true && memberDraft.exists === true
  // ★★★ RUN 256 / TB-2622: ONE hint for this whole continuation branch, computed ONCE above both exits — the dead end
  // below and the success receipt after the if/else carry THIS text, so the two paths cannot teach different calls.
  // (It used to be declared inside the dead-end `else` only, and the success return referenced it out of scope: node
  // --check does not catch a const that is merely missing at runtime.)
  const RH = resumeDraftHintOf({ id: target.id, fields: { path: wantedPath, revision: target.revision, mdPath: draftPath } })
  let md = null
  if (memberFileHere) {
    // ★★★ RUN 255 / TB-2613: when the member names its own file, that WHOLE file IS the continuation — the kernel does
    // not rewrite it (a rewrite would replace the member own prose with the kernel composition, and the row would then
    // index bytes the member never wrote). The row still records the sha256 of what is on disk.
    if (txt(memberDraft.text) === '') {
      throw refuse('VMU_INVALID_ARGUMENT', 'the draft md ' + draftPath + ' carries no text, so it would continue the draft with an empty document',
        'write the revision prose into ' + draftPath + ' and call propose again — a continuation that froze nothing would be adopted as nothing')
    }
    textNext = txt(memberDraft.text)
    md = {
      ok: true, available: true, written: false, writtenBy: 'member-file', wroteInOwnTurn: inOwnTurnGiven,
      path: draftPath, mdPath: draftPath, absPath: memberDraft.absPath,
      fingerprint: memberDraft.fingerprint, bytes: memberDraft.bytes, format: memberDraft.format,
      atomic: null, replaced: false,
      formatSwitched: memberDraft.format !== BLUEPRINT_MD_FORMAT,
      means: 'this call wrote NO file: the continuation is the member own draft md (fs), read back as it stands — the row indexes ITS bytes and records who wrote them, instead of the kernel rewriting the member document',
    }
  } else if (materializeNow) {
    // legacy path: kernel-materialized only when materialize:true is explicit (RUN 255 default flipped to fs-first)
    const mdFields = blueprintMdHeaderOf({
      path: wantedPath, status: 'draft', revision: target.revision,
      proposedBy: txt(target.fields.proposedBy), proposedAt: msOf(target.fields.proposedAt),
      note: txt(note) || txt(target.fields.note), authors, mdPath: draftPath,
      outline: outlineNext, revisionReason: reasonNext,
      mdWrittenBy: 'kernel-materialized', mdWroteInOwnTurn: 'false',
    })
    const mdWrote = writeBlueprintMd({
      records, path: draftPath, title: BLUEPRINT_TITLE_PREFIX + wantedPath + '｜r' + target.revision + '｜草案',
      status: 'draft', revision: target.revision, fields: mdFields, text: textNext,
    })
    md = Object.assign({}, mdWrote, {
      writtenBy: 'kernel-materialized', wroteInOwnTurn: false, mdPath: draftPath,
      formatSwitched: memberDraft !== null && memberDraft.format !== BLUEPRINT_MD_FORMAT,
    })
  } else {
    // ★★★ RUN 255 / TB-2613: the default for a continuation too — no file is invented. The member still owns the
    // document, so the call reports the missing file (and the composed text) instead of rewriting the draft row.
    // ★★★ RUN 256 / TB-2622: the hint/actions come from the ONE source computed above the branch, so this dead end
    // and the adopt gate teach the exact same call shape.
    return {
      ok: true,
      action: 'propose',
      filed: false,
      id: target.id,
      path: wantedPath,
      revision: target.revision,
      baseRevision: currentRevision,
      status: 'draft',
      proposedBy: txt(target.fields.proposedBy) || author,
      proposedAt: msOf(target.fields.proposedAt),
      continued: true,
      continuedBase,
      author,
      authors,
      draftMdMissing: true,
      materialize: false,
      mdPath: draftPath,
      draftMdPath: draftPath,
      text: textNext,
      textSource: 'argument',
      md: {
        ok: true, available: true, written: false, writtenBy: null, wroteInOwnTurn: null,
        path: draftPath, mdPath: draftPath, absPath: null, fingerprint: null, bytes: 0,
        format: null, atomic: null, replaced: false,
        means: 'this call wrote NOTHING: the default is fs-first, so the draft md is still the member own to write — the row was not touched and no sha was claimed',
      },
      mdFingerprint: null,
      mdWritten: false,
      writtenBy: null,
      mdOwner: null,
      // ★★★ RUN 255 rev3 (Lead P0-3): same receipt SHAPE as the success path — a caller reading headingDropped /
      // bodyPrefixDropped / verified gets a named null here instead of `undefined` just because nothing was filed.
      headingDropped: null,
      headingDroppedMeans: 'not cleaned: this call wrote no file and did not touch the row (draftMdMissing:true), so no `## 共同设计补充｜…` heading was stripped from any body — null is the named absence, not 0',
      bodyPrefixDropped: null,
      bodyPrefixDroppedMeans: 'not measured: this call joined the draft in the receipt only (nothing was filed), so the pasted-copy comparison did not run — null is the named absence, not 0',
      verified: null,
      fingerprint: null,
      deduplicated: false,
      mdChangedSinceIndex: null,
      // ★★★ RUN 256 / TB-2622: same single source as the new-proposal dead end and the adopt refusal.
      why: 'the draft md ' + draftPath + ' is not on disk yet: under the RUN 255 fs-first default this continuation writes no file and does not touch the row — the member owns this document',
      resumeHint: RH.hint,
      resumeHintMeans: RH.means,
      nextActions: RH.nextActions,
      nextActionsMeans: RH.means + ' — the three steps are ONE chain: write the WHOLE continuation into the file, re-propose with the SAME mdPath, then adopt after both seats wrote',
      note: '续写没有落盘（draftMdMissing:true）：跑 ① 用 fs 把整份正文写进 ' + draftPath + '，② 带同一个 mdPath 重新 propose（filed:true、你的 member 记入 authors），③ 两席都写过之后 adopt。text-only propose 不会写文件也不会追加 authors。',
    }
  }
  const composed = composeBlueprintBody({
    path: wantedPath,
    status: 'draft',
    revision: target.revision,
    proposedBy: txt(target.fields.proposedBy),
    proposedAt: msOf(target.fields.proposedAt),
    note: txt(note) || txt(target.fields.note),
    authors,
    outline: outlineNext,
    revisionReason: reasonNext,
    mdFingerprint: md.available === true ? (md.fingerprint || '') : '',
    mdPath: md.available === true ? draftPath : '',
    mdWrittenBy: md.writtenBy === undefined || md.writtenBy === null ? '' : md.writtenBy,
    mdWroteInOwnTurn: md.wroteInOwnTurn === true ? 'true' : '',
    text: textNext,
  })
  const wrote = track.supersede({
    id: target.id,
    body: composed,
    by: author,
    reason: '蓝图草案 ' + target.id + ' 共同设计续写（' + author + ' 写入自己的 section）',
  })
  const verified = verifyBlueprintRowMd({ track, id: target.id, md, mdPath: draftPath, text: textNext })
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
    continuedBase,
    author,
    authors,
    draftSharing: draftSharingOf(String(target.id), authors, true),
    codesign: blueprintCodesignStatus(authors, ''),
    atSource,
    clockSources: blueprintClockSourcesOf(),
    clockSourcesMeans: blueprintClockSourcesOf().means,
    // ★★★ RUN 256 / TB-2622: same text as the adopt refusal (one source) — the codesign precondition on this receipt.
    resumeHint: RH.hint,
    resumeHintMeans: RH.means,
    ...outlineReading({ outline: outlineNext, requireOutline: requireOutline === true, source: outlineSource }),
    ...revisionReasonReading({ revisionReason: reasonNext, source: reasonSource }),
    // ★★★ RUN 239-B: the continuation's outline merge (added/updated/kept), so "did my new outline replace the base?"
    // is answered by the receipt instead of by re-reading the row.
    outlineMerged,
    // ★★★ RUN 248: the rewritten draft document, the sha256 the same row now carries, and the row-versus-file check.
    md,
    mdFingerprint: md.fingerprint,
    mdPath: md.available === true ? draftPath : null,
    draftMdPath: md.available === true ? draftPath : null,
    mdWritten: md.available === true && txt(md.fingerprint) !== '',
    writtenBy: md.writtenBy === undefined ? null : md.writtenBy,
    // ★★★ RUN 255 (sim-lane mainline): both keys present in BOTH states — a success receipt no longer omits `filed`.
    filed: true,
    draftMdMissing: false,
    materialize: materializeNow,
    mdOwner: mdOwnerOf({
      records, mdPath: md.available === true ? draftPath : '',
      writtenBy: md.writtenBy === undefined ? null : md.writtenBy,
      wroteInOwnTurn: md.wroteInOwnTurn === undefined ? null : md.wroteInOwnTurn,
    }),
    formatSwitched: md.formatSwitched === true,
    verified,
    mdChangedSinceIndex: false,
    fingerprint: (wrote && wrote.fingerprint) || null,
    deduplicated: false,
    headingDropped,
    headingDroppedMeans,
    bodyPrefixDropped,
    bodyPrefixDroppedMeans,
    note: '★ 续写的是同一份草案（id/r 不变）：' + author + ' 的 section 已写进 `## 共同设计补充｜' + author + '`；正文里其他设计者的文字没有被改写，草案的 md 文件 ' + (md.available === true ? draftPath : '(没有 md 面)') + (md.writtenBy === 'member-file'
      ? ' 是成员自己的文件（本调用只读回、不重写）。'
      : ' 已整份重写。') + 'adopt 前 authors 必须同时有院士席与常驻研究员席。',
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
export function adoptBlueprint({ records, path, draft, by, at = null, atKernel = false, note = '', staleAfterMs = null, staleAfterMsSource = null, outline = null, revisionReason = '', requireOutline = false, refreshFingerprint = false }) {
  const track = refuseIfNoRecords(records)
  let wantedPath = txt(path)
  // ★★★ RUN 224 (run 59 / FEEDBACK58 1.7, MEASURED): the prompts teach `{ action: "adopt", draft: "<id>" }` WITHOUT a
  // path, and this function refused that shape before it even read the draft — while its own refusal message proved it had
  // already resolved the draft's path. A draft names exactly one path, so an adopt that names a draft may leave the path
  // out and the draft is the source of it (`pathFrom` says which of the two it was). `path` still wins when both are given,
  // because that is the only case with real ambiguity (an id read under the wrong path).
  let pathFrom = 'argument'
  if (wantedPath === '') {
    const namedDraft = txt(draft)
    if (namedDraft === '') {
      throw refuse('VMU_INVALID_ARGUMENT', 'adopting a blueprint needs the draft it adopts (or, failing that, the path)',
        'pass draft:<the draft row id> — a draft carries its own path — or path:<the blueprint path>; `state` lists the drafts with their revisions')
    }
    const peek = readBlueprint({ records, id: namedDraft })
    wantedPath = txt(peek.fields.path)
    pathFrom = 'draft'
    if (wantedPath === '') {
      throw refuse('VMU_INVALID_ARGUMENT', 'draft ' + peek.id + ' does not carry a path in its header, so the path cannot be read off it',
        'pass path:<the blueprint path> explicitly; `state` lists every draft under the path it belongs to')
    }
  }
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
  // ★ RUN 236 — G8/G11 cross the adoption boundary. The default is INHERIT: adoption changes status/signature, never the
  // document, so the draft's outline and the draft's reason travel to the row in force (source `draft`). A caller may pass
  // either one to REPLACE it (source `request`); a malformed outline is refused before the md is rewritten.
  const outlineParsed = parseOutlineField(outline)
  if (outlineParsed.provided && outlineParsed.problems.length > 0) {
    throw refuse('VMU_INVALID_ARGUMENT', 'the outline is malformed: ' + outlineParsed.problems.join('; '),
      'pass outline:[{id,title,depth}] — one entry per outline node, depth one of ' + BLUEPRINT_OUTLINE_DEPTHS.join('|') + ' (1=粗, 2=细)')
  }
  const draftOutline = Array.isArray(target.outline) ? target.outline : []
  const outlineNext = outlineParsed.provided ? outlineParsed.outline : draftOutline
  const outlineSource = outlineParsed.provided ? 'request' : (draftOutline.length > 0 ? 'draft' : 'none')
  const reasonGiven = oneLine(revisionReason)
  const draftReason = txt(target.revisionReason)
  const reasonNext = reasonGiven !== '' ? reasonGiven : draftReason
  const reasonSource = reasonGiven !== '' ? 'request' : (draftReason !== '' ? 'draft' : 'none')
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
  const stampRead = clockReadingOf(at, 'adoptBlueprint', { kernelClock: atKernel === true })
  const stamp = stampRead.at
  const atSource = stampRead.atSource
  const previousAdoptedAt = previous === null ? null : msOf(previous.fields.adoptedAt)
  const previousAgeMs = previousAdoptedAt === null ? null : Math.max(0, stamp - previousAdoptedAt)
  const window = windowWith(staleAfterMs, staleAfterMsSource)
  const overdueUpdate = previousAgeMs !== null && previousAgeMs > window.ms
  // ★★★ RUN 248: ADOPT PROMOTES THE DRAFT FILE, NOT THE ROW. The draft md is the document; the row is its index. The
  // bytes that become the canonical md are therefore the FILE's, and before anything is written this call checks that
  // the file is still the file the row indexed (sha256). A mismatch is refused by NAME: promoting a stale row would put
  // into force text nobody wrote, and silently rewriting the draft would erase a member's edit.
  const draftedMdPath = blueprintMdRelOf({ records, mdPath: txt(target.fields[BLUEPRINT_MD_PATH_KEY]) })
  const draftRead = draftedMdPath === '' ? null : readBlueprintDraftMd({ records, mdPath: draftedMdPath })
  const draftedFingerprint = txt(target.fields[BLUEPRINT_MD_KEY])
  let draftText = target.text
  let mdTextFrom = 'row'
  // ★★★ RUN 259 / AUDIT-14 P0-3: drift is a FACT about two byte sequences, and the fix has to be an action that CHANGES
  // which bytes the row vouches for. The old hint said "run reindex" — reindex cannot own a plain markdown draft (it
  // answers ok:false + blocked now), so following the hint changed nothing and the next adopt refused with the SAME code.
  // The repair named here is `refreshFingerprint:true`: one adopt that says OUT LOUD "the file is the truth, take its
  // current bytes", and the receipt records the drift it admitted instead of forgetting it.
  let mdDrift = null
  if (draftRead !== null && draftRead.available === true) {
    if (draftRead.exists !== true) {
      throw refuse(BLUEPRINT_MD_MISSING,
        'draft ' + target.id + ' owns the md "' + draftedMdPath + '", and it is NOT on disk, so there is no document to adopt',
        'continue the draft once (propose { path: "' + wantedPath + '", draft: "' + target.id + '" }) — it writes ' + draftedMdPath + ' again from the row — or restore that file, then adopt again')
    }
    if (draftedFingerprint !== '' && txt(draftRead.fingerprint) !== '' && draftedFingerprint !== txt(draftRead.fingerprint)) {
      const fileFp = txt(draftRead.fingerprint)
      // ★★★ RUN 259 / AUDIT-14 P0-3: the ONE repair that provably changes which bytes the next adopt accepts is
      // refreshFingerprint:true. reindex is NOT offered as a repair: it rebuilds the draft row from the FILE, and a draft
      // file written before the co-signature carries only the first proposer in its header, so "reindex then adopt"
      // turned a DRIFT refusal into a NEEDS_CODESIGN refusal (same kind of circular advice, different code). For a plain
      // markdown draft reindex does not even index the file (ok:false + blocked[].reachableInstead). One call, one fact.
      const driftHint = '文件是真相：以磁盘字节为准，一次调用修好——vibe_v5_blueprint {action:"adopt", path:"' + wantedPath + '", member:"<chair id>", draft:"' + target.id + '", refreshFingerprint:true}：这次 adopt 把 mdDrift（indexedFingerprint 与 fileFingerprint）记进回执，并把当前文件字节写进生效版。不要用 reindex 修 drift：它按文件重建草案行，草案文件头若早于共同设计会丢掉后来的作者，adopt 会改拒 VMU_PACK_V5R_BLUEPRINT_NEEDS_CODESIGN；纯 markdown 草案 reindex 还会回 ok:false 并在 blocked[] 里点名它。REACHABLE INSTEAD: vibe_v5_blueprint {action:"adopt", path:"' + wantedPath + '", member:"<chair id>", draft:"' + target.id + '", refreshFingerprint:true}（一次调用，回执带 mdDrift 的两个 sha256）'
      if (refreshFingerprint !== true) {
        throw refuse(BLUEPRINT_MD_DRIFT,
          'the draft md was changed after the row indexed it: ' + draftedMdPath + ' is ' + fileFp + ', but row ' + target.id + ' recorded ' + draftedFingerprint,
          'the file is the truth: pass refreshFingerprint:true to adopt the CURRENT bytes (the receipt then records the drift), or make the index admit the file first (only a vmu md can be re-indexed; a plain markdown draft cannot). ' + driftHint)
      }
      // explicit acknowledgement: the file changed and the caller chose the file. Recorded, not forgotten.
      mdDrift = {
        path: draftedMdPath,
        indexedFingerprint: draftedFingerprint,
        fileFingerprint: fileFp,
        admitted: true,
        refreshFingerprint: true,
        means: 'the draft file was NOT the file the row indexed: this adopt was told refreshFingerprint:true, so the CURRENT disk bytes (' + fileFp + ') go into force and the drift is recorded here instead of being silently dropped — the index never saw these bytes before this call',
      }
    }
    draftText = draftRead.text
    mdTextFrom = 'md'
  }
  // ★★ RUN 225-A: adoption changes the STATUS and the signature, never the document — the canonical file carries the
  // draft text VERBATIM plus the new header, and only then does the index row record its sha256.
  const mdFields = blueprintMdHeaderOf({
    path: wantedPath, status: 'current', revision,
    proposedBy: target.fields.proposedBy, proposedAt: msOf(target.fields.proposedAt),
    adoptedBy: adopter, adoptedAt: stamp, proposalId: target.id, note, authors: target.authors,
    outline: outlineNext, revisionReason: reasonNext, mdPath: wantedPath,
  })
  const canonicalTitle = BLUEPRINT_TITLE_PREFIX + wantedPath + '｜r' + revision + '｜生效'
  // ★★★ RUN 248: the canonical BYTES this adoption wants, composed before writing, so "the member already wrote the
  // canonical file" is a comparison (same sha256) instead of a heuristic: equal bytes mean this call VERIFIES, not
  // rewrites, and the receipt says `alreadyWritten:true, copiedFrom:null` (the member is the writer).
  let expected = null
  if (typeof records.mdCompose === 'function') {
    try { expected = records.mdCompose({ title: canonicalTitle, track: BLUEPRINT_TRACK, kind: BLUEPRINT_KIND, fields: mdFields, text: draftText }) } catch (e) { expected = null }
  }
  const canonicalRead = readBlueprintDraftMd({ records, mdPath: wantedPath })
  const alreadyWritten = expected !== null && canonicalRead.available === true && canonicalRead.exists === true
    && txt(canonicalRead.fingerprint) !== '' && txt(canonicalRead.fingerprint) === txt(expected.fingerprint)
  let md = null
  if (alreadyWritten) {
    md = {
      ok: true, available: true, written: false, writtenBy: 'member-file',
      path: wantedPath, mdPath: wantedPath, absPath: canonicalRead.absPath,
      fingerprint: expected.fingerprint, bytes: expected.bytes, format: BLUEPRINT_MD_FORMAT,
      atomic: null, replaced: false, copiedFrom: null, alreadyWritten: true,
      means: 'the canonical md ALREADY holds exactly these bytes (same sha256), so this call VERIFIED instead of rewriting: the member wrote the document in force, and adoption only signed it — copiedFrom:null says no byte was copied by this call',
    }
  } else {
    // ★★★ RUN 255 / TB-2613: the canonical file THIS call writes records its writer in its own header, so the ownership
    // survives a reindex. The `expected` bytes above deliberately carry no provenance line: they are only a comparison
    // against a file a member may have written (whose header this kernel does not dictate).
    const mdFieldsWritten = Object.assign({}, mdFields, { mdWrittenBy: 'kernel-materialized', mdWroteInOwnTurn: 'false' })
    const mdWrote = writeBlueprintMd({
      records, path: wantedPath, title: canonicalTitle,
      status: 'current', revision, fields: mdFieldsWritten, text: draftText,
    })
    md = Object.assign({}, mdWrote, {
      writtenBy: mdWrote.available === true && mdWrote.written === true ? 'kernel-materialized' : null,
      wroteInOwnTurn: false,
      mdPath: wantedPath,
      copiedFrom: draftedMdPath === '' ? null : draftedMdPath,
      alreadyWritten: false,
    })
  }
  // ★★★ RUN 248: read the canonical file BACK: "the bytes on disk are the ones the row is about to record" is checked,
  // not assumed (a writer that returns a fingerprint the file does not have would otherwise be undetectable).
  if (md.available === true && txt(md.fingerprint) !== '') {
    const back = readBlueprintDraftMd({ records, mdPath: wantedPath })
    if (back.available === true && back.exists === true && txt(back.fingerprint) !== txt(md.fingerprint)) {
      throw refuse('VMU_STATE',
        'the canonical md does not carry the bytes this adoption claims: ' + wantedPath + ' is ' + txt(back.fingerprint) + ', the receipt says ' + txt(md.fingerprint),
        'this is an internal inconsistency of the md face (the write returned a fingerprint its file does not have): re-run adopt; if it repeats, inspect the records md writer')
    }
  }
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
    // ★ RUN 236: the outline and the reason travel too — the file in force must say the SAME thing the draft said.
    outline: outlineNext,
    revisionReason: reasonNext,
    mdFingerprint: md.fingerprint || '',
    mdPath: wantedPath,
    // ★★★ RUN 255 / TB-2613: the adopted row says WHO wrote the file it indexes — `kernel-materialized` when this call
    // copied the draft bytes, `member-file` when the member had already written the canonical file and this call only
    // verified it (the writing turn of that copy is not known here, so mdWroteInOwnTurn stays absent).
    mdWrittenBy: md.writtenBy === undefined || md.writtenBy === null ? '' : md.writtenBy,
    mdWroteInOwnTurn: '',
    // ★★★ RUN 248: the ADOPTED row carries the DRAFT FILE's text verbatim — the file is the document, so promotion
    // moves ITS bytes, not the row's copy of them (a row that had drifted from its file is refused above, never used).
    text: draftText,
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
  // ★★★ RUN 248-M3 (cold T1): PROMOTION MOVES THE CLAIM, not only the bytes. The draft row used to keep
  // `mdPath: Shared/Drafts/<stem>-r<N>.md` plus that file sha after adoption, so two row bodies named a file at once and
  // the draft row answer to "which file does this revision own" was a file the document in force no longer is. The draft
  // row therefore RELEASES its claim: its draft file becomes history on disk (reindex reports it as an orphan-draft-md
  // skip, never as a row), exactly ONE row — the one written above — owns the canonical path, and a reader of the old
  // draft row falls back to that path and is told the status moved instead of being shown a stale equality.
  let draftReleased = null
  const draftClaimPath = txt(target.fields[BLUEPRINT_MD_PATH_KEY])
  const draftClaimFingerprint = txt(target.fields[BLUEPRINT_MD_KEY])
  if (draftClaimPath !== '' || draftClaimFingerprint !== '') {
    const releasedFrom = draftClaimPath === '' ? null : draftClaimPath
    if (typeof track.supersede !== 'function') {
      draftReleased = {
        ok: null, id: target.id, from: releasedFrom, rev: null,
        means: 'this records face has no supersede, so the draft row KEEPS claiming ' + String(releasedFrom) + ' — two rows then name a file and the index cannot say which one is the document in force',
      }
    } else {
      try {
        const releaseBody = composeBlueprintBody(Object.assign({}, target.fields, {
          proposedAt: msOf(target.fields.proposedAt),
          adoptedAt: msOf(target.fields.adoptedAt),
          lastStaleSeenAt: msOf(target.fields.lastStaleSeenAt),
          authors: target.authors,
          mdFingerprint: '',
          mdPath: '',
          text: target.text,
        }))
        const releasedRow = track.supersede({
          id: target.id,
          body: releaseBody,
          by: adopter,
          reason: '草案 r' + revision + ' 已落成为 ' + put.id + '：它自己的 md（' + (releasedFrom === null ? '(none)' : releasedFrom) + '）不再是这份文件，文件归现行行 ' + put.id,
        })
        draftReleased = {
          ok: true, id: target.id, from: releasedFrom,
          rev: releasedRow && releasedRow.rev !== undefined ? releasedRow.rev : null,
          means: 'the draft row no longer names a file (mdPath/mdFingerprint cleared): exactly one row — the one this call wrote (' + put.id + ') — owns ' + wantedPath + ', so "which row points at the file" has one answer and its sha is the sha on disk',
        }
      } catch (e) {
        draftReleased = {
          ok: false, id: target.id, from: releasedFrom, rev: null,
          error: { code: (e && e.code) || null, message: String((e && e.message) || e) },
          means: 'the draft row could NOT release its claim (the supersede threw), so two rows may still name a file: the adoption itself stands (the canonical md was written and indexed above), and the error is printed instead of being hidden',
        }
      }
    }
  }
  const after = blueprintState({ records, path: wantedPath, now: stamp, nowFromKernel: atKernel === true, staleAfterMs: window.ms, staleAfterMsSource: window.source })
  return {
    ok: true,
    action: 'adopt',
    id: put.id,
    path: wantedPath,
    pathFrom,
    pathFromMeans: pathFrom === 'draft'
      ? 'the path was READ OFF the draft this call adopted: the draft names exactly one path, so repeating it in the request was never a second fact'
      : 'the path came from the request; the draft\'s own path agreed with it (a disagreement is refused by name)',
    revision,
    status: 'current',
    adoptedBy: adopter,
    adoptedAt: stamp,
    atSource,
    clockSources: blueprintClockSourcesOf(),
    clockSourcesMeans: blueprintClockSourcesOf().means,
    proposalId: target.id,
    authors: target.authors,
    codesign,
    ...outlineReading({ outline: outlineNext, requireOutline: requireOutline === true, source: outlineSource }),
    ...revisionReasonReading({ revisionReason: reasonNext, source: reasonSource }),
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
    // ★ RUN 225-A: the CURRENT document on disk equals the index by construction here (the file was written first and the
    // row indexes that byte sequence) — the receipt shows the comparison rather than asking the reader to trust it.
    md: after.md,
    mdWrite: md,
    // ★★★ RUN 248: the WHOLE file contract in one object: ONE canonical file counts (`path`), and this call either copied
    // the draft file's bytes into it (`copiedFrom`) or verified that a member had already written exactly those bytes
    // (`alreadyWritten:true, copiedFrom:null`). `mdWritten` on `md` says whether the draft file is on disk.
    mdIsTheDocumentInForce: {
      path: wantedPath,
      wroteNow: md.written === true,
      copiedFrom: md.copiedFrom === undefined ? null : md.copiedFrom,
      alreadyWritten: md.alreadyWritten === true,
      draftMdPath: draftedMdPath === '' ? null : draftedMdPath,
      mdTextFrom,
      means: 'the blueprint owns ONE file that counts — ' + wantedPath + '. This adoption promoted the draft md '
        + (draftedMdPath === '' ? '(the row: this deployment has no md face)' : draftedMdPath) + ' to it: '
        + (md.alreadyWritten === true
          ? 'the member had already written exactly these bytes, so this call verified instead of rewriting (copiedFrom:null)'
          : 'the file was written here from the draft bytes (temp file + rename), and copiedFrom names the file they came from'),
    },
    copiedFrom: md.copiedFrom === undefined ? null : md.copiedFrom,
    alreadyWritten: md.alreadyWritten === true,
    // ★★★ RUN 259 / AUDIT-14 P0-3: null when the file was the indexed file; the whole drift record when the caller took
    // the file with refreshFingerprint:true. A reader can tell "verified" from "admitted a drift" from "no drift check".
    mdDrift,
    fingerprintRefreshed: mdDrift !== null,
    refreshFingerprint: refreshFingerprint === true,
    // ★★★ RUN 255 / TB-2613: ownership evidence of the file in force — sha256/bytes read from the disk NOW, writer taken
    // from the row provenance this call just wrote (never inferred from who asked).
    mdOwner: mdOwnerOf({
      records, mdPath: wantedPath,
      writtenBy: md.writtenBy === undefined ? null : md.writtenBy,
      wroteInOwnTurn: md.writtenBy === 'kernel-materialized' ? false : null,
    }),
    draftMdPath: draftedMdPath === '' ? null : draftedMdPath,
    mdWritten: after.md === null || after.md === undefined ? null : after.md.mdWritten,
    mdTextFrom,
    // ★★★ RUN 248-M3: WHICH row owns the file now that this call is done — the answer must be ONE id. The draft row
    // released its claim above, so no reader has to decide between two rows that both name a file.
    mdClaim: {
      owner: put.id,
      path: wantedPath,
      mdFingerprint: md.fingerprint === undefined ? null : md.fingerprint,
      means: 'exactly one row claims this file: ' + put.id + ' (the revision this call put in force); the draft row it came from (' + target.id + ') released its own draft file (' + (draftedMdPath === '' ? '(none)' : draftedMdPath) + '), so the index never offers two answers to which file a revision owns',
    },
    draftReleased: draftReleased,
    mdFingerprint: md.fingerprint,
    mdChangedSinceIndex: after.mdChangedSinceIndex,
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
