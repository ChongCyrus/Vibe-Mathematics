/**
 * packs/v5r/verified.js — PHASE 12 / B1 STEP 1: THE *CARRIER* for "Verified ⇒ p=1".
 *
 * WHY THIS FILE EXISTS. The ledger rule (docs/acceptance/phase12-v5r-rules-conformance.md, row B1) is, verbatim:
 *   「Verified文件夹：只有布尔概率为1（只有辩论才能把命题卡的布尔概率修改为1，否则都只能介于0到1之间）的命题
 *    或参考文献中命题才可加入。」
 *   「只有命题卡中含有正式证明或证伪内容（且已经写完了而非半成品）才能用于后续辩论。那些布尔概率为1的命题卡
 *    需标记为已verified。」
 * Today NOTHING in `packs/v5r` carries "verified": `verified` is not a declared track, there is no verified card
 * shape, and `p` is ordinary body text (`kit/handlers.js:76-89` composes `- statement：… / - value：… / - motive：… /
 * - p：…`). So the rule has no data face to be enforced ON. This module is that data face — and ONLY that.
 *
 * ★★ WHAT THIS FILE IS NOT (the order is the repo's F5 constraint, decided in
 *    `docs/acceptance/conformance/lane-verified-design.md` §5): **carrier → gate → prompt text**.
 *    · STEP 1 (this file): declarations (track/kind/fields), tolerant parsers for the card and the verified card,
 *      a composer, `findVerified`, `listVerified`, and the single writer `promoteVerified`.
 *    · STEP 2 (not here): WHO may mint the warrant — the `ballot/tally` consumer that turns a unanimous debate
 *      into a warrant, the `tools/pre-execute` gate that refuses a non-debate path setting p=1, the single-writer
 *      gate that refuses direct writes to the verified track. Those bring their own `VMU_PACK_V5R_*` codes.
 *    · STEP 3 (not here): the prompt text (`prompts/v5r-persona.js` rules 9/10, `v5r-blocks-a.js:195`) must not be
 *      rewritten before the machine can do what it says.
 *    Consequence, stated so nobody mistakes it for done: **the carrier alone does not make B1 pass.** What it makes
 *    possible is step 2: without a row shape and a single writer, a gate has nothing to write and nothing to guard.
 *
 * WHY A `records` TRACK AND NOT A `Verified/` DIRECTORY. Three measured reasons:
 *   ① `records.list({track})` is the framework's default information channel and its head projection is
 *      `CORE_HEAD_FIELDS = ['id','track','kind','status','updatedAt','fingerprint']` (`kernel/records.js:61`), with the
 *      core fields un-trimmable (`kernel/records.js:592-600`, `VMU_HEAD_FIELD_IMMUTABLE`). A directory is invisible
 *      to that list; a track is visible with no new read mechanism.
 *   ② vmu has no filesystem write face at all (`tools/` carries no fs/write tool), so a directory would need a new
 *      face + a new persistence seam — new mechanism with no consumer (red line ④).
 *   ③ `packs/v3/middleware/dataplane.js:558-660` already implements exactly this split (`findVerified` /
 *      `promoteVerified`, "only p=1 or p=0 enters the verified track", idempotent refresh, bodyCap truncation
 *      reported as `bounded`). Copying that SEMANTICS (not its code) keeps one idea in the tree instead of two.
 *
 * ★ THE TRACK MUST BE DECLARED FIRST. `vmu.records.tracks` is SNAPSHOTTED when the kernel is constructed
 *   (`kernel/records.js:189-221`), so declaring `verified` in `packs/v5r/settings/defaults.json` takes effect on the
 *   NEXT kernel/session — not on the running one. An undeclared track is refused by name (`VMU_INVALID_ARGUMENT`,
 *   `kernel/records.js:461-465`), which is why `findVerified` below does not catch that refusal: "the carrier is not
 *   installed in this deployment" is an answer, not a bug.
 *
 * ★ CODES: this step uses ONLY the four codes `packs/v5r/tools.js` already names as the pack's registerable set
 *   (`VMU_INVALID_ARGUMENT` / `VMU_NO_SUCH_OBJECT` / `VMU_STATE` / `VMU_ENGINE_UNAVAILABLE`; the kernel raises the
 *   first two itself). The pack-specific codes the design names (`VMU_PACK_V5R_DEFECT_WITHDRAWN`,
 *   `…_P1_NEEDS_DEBATE`, `…_WARRANT_INVALID`, `…_VERIFIED_SINGLE_WRITER`) arrive in STEP 2 **together with their
 *   docs/03 rows** — a code used before it is registered rots docs/03's implementation table, which is the same rule
 *   `tools.js` states for its handlers. Until then a withdrawn proof refuses with `VMU_STATE`, whose message names
 *   the withdrawal.
 *
 * ★ "写完" IS NOT MACHINE-DECIDABLE. A card's `p` is the AUTHOR's declaration; the proof text itself lives in
 *   `Members/<member>/Propos/<id>.md` (`## 证明尝试` / `## 证伪尝试`) and never reaches this track. Therefore
 *   `promoteVerified` requires a WARRANT (provenance) and records it in the verified card — it does not, and cannot,
 *   claim to have judged the proof. Step 2 is what turns a warrant from "a caller passed an object" into "a unanimous
 *   debate produced it".
 */

/** The declared track/kind of the verified split (STEP 1 adds both to `packs/v5r/settings/defaults.json`). */
export const VERIFIED_TRACK = 'verified'
export const VERIFIED_KIND = 'verified'
/** The card face this carrier promotes FROM (`kit/tools.js:21` `KIT_CARD_CONFIG.vibe_v5_record_proposition`). */
export const CARD_TRACK = 'propositions'
export const CARD_KIND = 'proposition'
/** The card's REQUIRED fields, verbatim from the original tool declaration (no defaults are invented). */
export const CARD_FIELDS = Object.freeze(['statement', 'value', 'motive', 'p'])
/** The verified row's required header fields; `by` is optional (an anonymous promotion is still traceable by `at`). */
export const VERIFIED_REQUIRED_FIELDS = Object.freeze(['cardId', 'p', 'warrant', 'source', 'at'])
export const VERIFIED_OPTIONAL_FIELDS = Object.freeze(['by'])
/** The verified row's own marker, so a human reading the track sees the conclusion without parsing. */
export const VERIFIED_TITLE_PREFIX = '已验证｜'
/** Card/verified bodies are `- key：value` lines; the full-width colon is the writer's, the parser accepts both. */
export const FIELD_SEPARATOR = '：'
const SEPARATORS = Object.freeze(['：', ':', '='])
const HEADER_MARK = '- '
const SECTION_MARK = '## '
/** The one header field ignored when comparing two composed bodies (a re-write always carries a new time). */
const VOLATILE_FIELD = 'at'

function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  if (hint) err.hint = hint
  return err
}
const text = (v) => String(v === undefined || v === null ? '' : v)
const hasText = (v) => text(v).trim() !== ''
const probText = (n) => (Number.isFinite(n) ? String(n) : '—')
const timeText = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : '')

// ── parse：bad cards are NAMED, never silently defaulted ────────────────────────────────────────────────────
/**
 * Split a card body into header fields + `## section` blocks. Tolerant in the ways real data needs:
 * `：` / `:` / `=` separators, surrounding whitespace, a trailing CR, and **multi-line field values** (a line that
 * is not a header, following a header, continues that field — run 48 / F-23). NOT tolerant in the way that lies:
 * a duplicate field, and a line with no field to continue, are both REPORTED (`dupes` / `malformed`) — never resolved
 * silently. `continuations` counts how many lines were folded back into a field, so a reader can see the shape used.
 */
export function parseBody(body) {
  const lines = text(body).split('\n')
  const fields = {}
  const dupes = []
  const malformed = []
  const sections = {}
  let section = null
  let lastKey = null
  let continuations = 0
  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '')
    if (line.startsWith(SECTION_MARK)) {
      section = line.slice(SECTION_MARK.length).trim()
      if (!Object.prototype.hasOwnProperty.call(sections, section)) sections[section] = []
      lastKey = null
      continue
    }
    if (section !== null) { sections[section].push(line); continue }
    if (!line.trim()) {
      // a blank line inside a value is the author's paragraph break, not a broken line: keep it attached to the field
      if (lastKey !== null) fields[lastKey] += '\n'
      continue
    }
    if (!line.startsWith(HEADER_MARK)) {
      // ★★ LIVE RUN 48 (F-23): a multi-line statement was written verbatim by the card writer, and the reader called
      // every one of its paragraph lines "unparsable" — so the whole card became UNJUDGEABLE and the debate gate told
      // the caller the card carried no proofRef at all (it did: `- proofRef：…` was two lines further down). A line
      // that is not a header but follows a header is the PREVIOUS FIELD CONTINUING; it is appended, not reported as
      // damage, and the count is returned so a reader can see the body used continuation lines. Only a line with no
      // field to continue is malformed (there is nothing it could belong to).
      if (lastKey !== null) { fields[lastKey] += '\n' + line.trim(); continuations += 1; continue }
      malformed.push(line)
      continue
    }
    const rest = line.slice(HEADER_MARK.length)
    const positions = SEPARATORS.map((s) => rest.indexOf(s)).filter((i) => i >= 0)
    if (!positions.length) { malformed.push(line); continue }
    const cut = Math.min.apply(null, positions)
    const key = rest.slice(0, cut).trim()
    const value = rest.slice(cut + 1).trim()
    if (!key) { malformed.push(line); continue }
    if (Object.prototype.hasOwnProperty.call(fields, key)) { dupes.push(key); continue }
    fields[key] = value
    lastKey = key
  }
  // trailing blank lines are spacing after the last value, not part of it
  for (const key of Object.keys(fields)) fields[key] = fields[key].replace(/\n+$/, '')
  return { fields, dupes, malformed, sections, continuations }
}

/** A card's `p` is a BOOLEAN probability: a finite number in [0,1]. Anything else is named, not coerced. */
function probabilityOf(raw) {
  if (!hasText(raw)) return { ok: false, why: 'p is absent' }
  const n = Number(text(raw).trim())
  if (!Number.isFinite(n)) return { ok: false, why: 'p is not a number: ' + text(raw).trim() }
  if (n < 0 || n > 1) return { ok: false, why: 'p is outside [0,1]: ' + probText(n) }
  return { ok: true, value: n }
}

/**
 * Parse a PROPOSITION CARD body. Returns a value object — it never throws, because the read face
 * (`listVerified` / `findVerified` / a library view) must be able to point at a bad card instead of dying on it.
 * `ok:false` + `problems` is the caller's answer; `card` is null when anything is wrong, so a caller cannot
 * accidentally use a half-parsed card.
 */
export function parseCardBody(body) {
  const parsed = parseBody(body)
  const missing = CARD_FIELDS.filter((k) => !hasText(parsed.fields[k]))
  const p = probabilityOf(parsed.fields.p)
  const problems = []
  if (parsed.dupes.length) problems.push('duplicate header field(s): ' + parsed.dupes.join(','))
  if (parsed.malformed.length) problems.push('unparsable line(s): ' + parsed.malformed.length)
  if (missing.length) problems.push('missing required field(s): ' + missing.join(','))
  if (!p.ok) problems.push(p.why)
  const ok = problems.length === 0
  const card = ok
    ? {
        statement: parsed.fields.statement,
        value: parsed.fields.value,
        motive: parsed.fields.motive,
        p: p.value,
        // The original tool allows extra keys (`title`,`id` — `kit/tools.js:21`); they are carried, not invented.
        title: hasText(parsed.fields.title) ? parsed.fields.title : null,
        id: hasText(parsed.fields.id) ? parsed.fields.id : null,
      }
    : null
  return { ok, fields: parsed.fields, sections: parsed.sections, card, missing, problems, cardId: card ? card.id : null }
}

/** Parse a VERIFIED row body. Same contract as `parseCardBody`: value object, bad rows named, never a guess. */
export function parseVerifiedBody(body) {
  const parsed = parseBody(body)
  const missing = VERIFIED_REQUIRED_FIELDS.filter((k) => !hasText(parsed.fields[k]))
  const p = probabilityOf(parsed.fields.p)
  const conclusion = p.ok ? (p.value === 1 ? true : (p.value === 0 ? false : null)) : null
  const problems = []
  if (parsed.dupes.length) problems.push('duplicate header field(s): ' + parsed.dupes.join(','))
  if (parsed.malformed.length) problems.push('unparsable line(s): ' + parsed.malformed.length)
  if (missing.length) problems.push('missing required field(s): ' + missing.join(','))
  if (!p.ok) problems.push(p.why)
  else if (conclusion === null) problems.push('p is not a conclusion (only 1 or 0 may enter the verified track): ' + probText(p.value))
  const ok = problems.length === 0
  const verified = ok
    ? {
        cardId: parsed.fields.cardId,
        p: p.value,
        conclusion,
        warrant: parsed.fields.warrant,
        source: parsed.fields.source,
        by: hasText(parsed.fields.by) ? parsed.fields.by : null,
        at: parsed.fields.at,
        statement: (parsed.sections['陈述'] || []).join('\n').trim(),
        basis: (parsed.sections['判定依据'] || []).join('\n').trim(),
      }
    : null
  return { ok, fields: parsed.fields, sections: parsed.sections, verified, missing, problems }
}

// ── compose：one writer's body shape (the parser above is its inverse) ─────────────────────────────────────
function emitFields(order, values) {
  const out = []
  for (const key of order) if (hasText(values[key])) out.push(HEADER_MARK + key + FIELD_SEPARATOR + text(values[key]).trim())
  return out
}
/** Compose the ORIGINAL card shape (used by tests and by any pack code that must write a card). */
export function composeCardBody(card = {}) {
  const extra = Object.keys(card).filter((k) => !CARD_FIELDS.includes(k) && hasText(card[k]))
  const lines = emitFields(CARD_FIELDS.concat(extra), card)
  return lines.join('\n')
}
/**
 * Compose the VERIFIED row body. `§判定依据` records provenance in human-readable form; it is static text (no clock),
 * so a re-promotion of unchanged content compares equal after the volatile `at` line is stripped.
 */
export function composeVerifiedBody(row = {}) {
  // NO `# title` line in the body: the title lives in the record HEAD (`records.put({title})`), and a `# …` line here
  // would be an unparsable line for `parseBody` — i.e. the composer would emit exactly the malformed body it refuses.
  const lines = emitFields(VERIFIED_REQUIRED_FIELDS.concat(VERIFIED_OPTIONAL_FIELDS), row)
  const statement = text(row.statement).trim()
  if (statement) lines.push('', SECTION_MARK.trim() + ' 陈述', statement)
  const basis = text(row.basis).trim()
  if (basis) lines.push('', SECTION_MARK.trim() + ' 判定依据', basis)
  return lines.join('\n') + '\n'
}
/** Two composed bodies are "the same fact" when they differ only in the volatile time line. */
export function sameFact(a, b) {
  const strip = (body) => text(body).split('\n').filter((line) => {
    const t = line.replace(/\r$/, '')
    return !(t.startsWith(HEADER_MARK) && (t.slice(HEADER_MARK.length).trim().startsWith(VOLATILE_FIELD + FIELD_SEPARATOR)
      || t.slice(HEADER_MARK.length).trim().startsWith(VOLATILE_FIELD + ':')))
  }).join('\n').trim()
  return strip(a) === strip(b)
}

// ── rows：the records-face carriers ────────────────────────────────────────────────────────────────────────
function requireRecords(records, who) {
  if (!records || typeof records.get !== 'function' || typeof records.put !== 'function' || typeof records.list !== 'function') {
    throw refuse('VMU_ENGINE_UNAVAILABLE', who + ' needs the records face (get/put/list), and this kernel publishes none',
      'assemble a kernel that publishes vmu.records — the verified carrier is a track on it, not a private store')
  }
  return records
}
const rowLabel = (row) => (row && row.id ? String(row.id) : '(no id)')
/**
 * A row read through `records.get()` may have been TRUNCATED by the body cap (`view` ⇒ `bodyTruncated` /
 * `bodyDroppedBytes`, `kernel/records.js:338-348`). A truncated body must not be parsed as if it were whole: judging a
 * card by the first half of its text is exactly the kind of silent half-answer this pack is not allowed to give.
 */
function bodyReadProblem(row) {
  if (typeof row.body !== 'string') return 'the row carries no body text (a head-list row cannot be judged: read the record with a body)'
  if (row.bodyTruncated === true) return 'the records body cap truncated this row (' + text(row.bodyDroppedBytes) + ' bytes dropped), so the body cannot be judged as written; raise vmu.records.bodyCapBytes or read the stored body'
  return null
}

/** Parse one PROPOSITION row. A row without a body, or from another track/kind, is named — never coerced. */
export function parseCard(row) {
  if (!row || typeof row !== 'object') return { ok: false, id: null, reason: 'no row was given', card: null }
  const id = row.id ? String(row.id) : null
  const readProblem = bodyReadProblem(row)
  if (readProblem) return { ok: false, id, track: row.track || null, kind: row.kind || null, reason: readProblem, card: null }
  if (row.track !== CARD_TRACK || row.kind !== CARD_KIND) {
    return { ok: false, id, track: row.track || null, kind: row.kind || null, reason: 'row ' + rowLabel(row) + ' is ' + text(row.track) + '/' + text(row.kind) + ', not ' + CARD_TRACK + '/' + CARD_KIND, card: null }
  }
  const parsed = parseCardBody(row.body)
  return Object.assign({ id, track: row.track, kind: row.kind }, parsed)
}

/** Parse one VERIFIED row (inverse of `composeVerifiedBody`). */
export function parseVerified(row) {
  if (!row || typeof row !== 'object') return { ok: false, id: null, reason: 'no row was given', verified: null }
  const id = row.id ? String(row.id) : null
  const readProblem = bodyReadProblem(row)
  if (readProblem) return { ok: false, id, track: row.track || null, kind: row.kind || null, reason: readProblem, verified: null }
  if (row.track !== VERIFIED_TRACK) return { ok: false, id, track: row.track || null, kind: row.kind || null, reason: 'row ' + rowLabel(row) + ' is on track ' + text(row.track) + ', not ' + VERIFIED_TRACK, verified: null }
  const parsed = parseVerifiedBody(row.body)
  return Object.assign({ id, track: row.track, kind: row.kind }, parsed)
}

/**
 * The READ VIEW of the verified track: parsed rows plus the bad rows NAMED (v3's `dataplane.js:425` behaviour — a
 * broken entry never disappears, it is listed). A deployment that has not declared the track gets the records face's
 * own named refusal, not an empty success.
 */
export function listVerified(records) {
  requireRecords(records, 'listVerified')
  const heads = records.list({ track: VERIFIED_TRACK, limit: 0 })
  const items = []
  const bad = []
  const heads_ = Array.isArray(heads && heads.items) ? heads.items : []
  for (const head of heads_) {
    const row = records.get({ id: head.id })
    const parsed = parseVerified(row)
    if (parsed.ok) items.push({ id: row.id, cardId: parsed.verified.cardId, p: parsed.verified.p, conclusion: parsed.verified.conclusion, warrant: parsed.verified.warrant, source: parsed.verified.source, by: parsed.verified.by, at: parsed.verified.at, title: row.title })
    else bad.push({ id: head.id, reason: parsed.reason || parsed.problems.join('; ') })
  }
  return { ok: true, track: VERIFIED_TRACK, count: items.length, items, bad, badCount: bad.length, truncated: heads && heads.truncated === true }
}

/**
 * ★ B8: 撤回判定的**唯一读法**。内核的 `passedWithdrawnFor` 返回的是**标记对象**（`{ok:true,target,withdrawn:true,…}`）
 * 或 `null`，从来不是布尔 `true`；早先两处写 `=== true` 的比较因此在真机上**永不命中** —— 缺陷标记写了、verified 行
 * 却照样可读（"一行没人看的字"）。这里两种形状都认：布尔（旧 seam）与 `withdrawn===true`（规格面）。
 */
function withdrawnBy(fidelity, id) {
  if (!fidelity || typeof fidelity.passedWithdrawnFor !== 'function') return false
  let r = null
  try { r = fidelity.passedWithdrawnFor(id) } catch (e) { return false }
  return r === true || (!!r && typeof r === 'object' && r.withdrawn === true)
}

/**
 * Find the verified row for a card id (`verified` rows carry `- cardId：`). Returns null when there is none — it
 * NEVER guesses by title or by position. A withdrawn proof is invisible to this read point (v3 P1-9 parity with
 * `dataplane.js:56-60`): the kernel fidelity registry's `passedWithdrawnFor` is asked, so a marker written by a
 * fidelity defect really does hide the conclusion instead of being a line nobody reads.
 */
export function findVerified(records, sourceId, { fidelity = null } = {}) {
  requireRecords(records, 'findVerified')
  if (!hasText(sourceId)) throw refuse('VMU_INVALID_ARGUMENT', 'findVerified needs the card id to look for', 'pass the records id of the proposition card')
  const key = text(sourceId).trim()
  if (withdrawnBy(fidelity, key)) return null
  const heads = records.list({ track: VERIFIED_TRACK, limit: 0 })
  const items = Array.isArray(heads && heads.items) ? heads.items : []
  for (const head of items) {
    const row = records.get({ id: head.id })
    const parsed = parseVerified(row)
    if (parsed.ok && text(parsed.verified.cardId).trim() === key) return { id: row.id, rev: row.rev, title: row.title, body: row.body, verified: parsed.verified }
  }
  return null
}

// ── the SINGLE WRITER ──────────────────────────────────────────────────────────────────────────────────────
function truncateToBytes(input, cap) {
  const str = text(input)
  if (!Number.isFinite(cap) || cap <= 0) return { kept: str, dropped: 0, truncated: false }
  if (Buffer.byteLength(str, 'utf8') <= cap) return { kept: str, dropped: 0, truncated: false }
  let acc = ''
  let bytes = 0
  for (const ch of str) {
    const b = Buffer.byteLength(ch, 'utf8')
    if (bytes + b > cap) break
    acc += ch
    bytes += b
  }
  return { kept: acc, dropped: Buffer.byteLength(str, 'utf8') - bytes, truncated: true }
}

/**
 * THE ONE WRITER of the verified track (STEP 1 contract; STEP 2 makes it the ONLY path by refusing direct writes).
 *
 * Semantics copied from v3's `promoteVerified` (`packs/v3/middleware/dataplane.js:598-660`), translated to the v5r
 * card shape:
 *   · the card must be a `propositions/proposition` record whose body carries the four declared fields — otherwise
 *     `VMU_INVALID_ARGUMENT` (wrong face) or `VMU_STATE` (a card that cannot be read);
 *   · `p` must be EXACTLY 1 or 0 — anything in between is `VMU_STATE` naming the value, because the verified track
 *     holds conclusions, not experience;
 *   · a proof withdrawn by a fidelity defect cannot be re-promoted (`VMU_STATE` naming the withdrawal; STEP 2 renames
 *     it to `VMU_PACK_V5R_DEFECT_WITHDRAWN` when that code is registered in docs/03);
 *   · unchanged content is NOT rewritten (`written:false, unchanged:true`, the time line ignored) — a re-settlement
 *     must not inflate the track;
 *   · a body over the records body cap is truncated and the loss is REPORTED (`bounded`), never silent.
 *
 * ★ The WARRANT is REQUIRED and is recorded on the row. This is the carrier's provenance contract: a verified row
 * says WHICH warrant judged it (`debate-unanimous` from a debate, `lean-conformance` from the lean path, …). STEP 2
 * is what decides who may mint one and which kinds are accepted — passing a hand-made warrant object works here on
 * purpose (the unit test needs it) and will be refused there.
 */
export function promoteVerified({ records, sourceId, warrant = null, at = null, by = null, capBytes = null, fidelity = null } = {}) {
  requireRecords(records, 'promoteVerified')
  if (!hasText(sourceId)) throw refuse('VMU_INVALID_ARGUMENT', 'promoteVerified needs the card id to promote', 'pass sourceId:"<records id of the proposition card>"')
  if (!warrant || typeof warrant !== 'object') {
    throw refuse('VMU_INVALID_ARGUMENT', 'promoteVerified needs the WARRANT that produced this conclusion (a verified row without provenance is a claim with no judge)',
      'pass warrant:{id,kind,subject} — step 2 mints it from the ballot tally; until then the unit test passes one explicitly')
  }
  if (!hasText(warrant.id) || !hasText(warrant.kind)) {
    throw refuse('VMU_INVALID_ARGUMENT', 'the warrant needs an id and a kind', 'pass warrant:{id:"<warrant id>",kind:"debate-unanimous"|"lean-conformance",subject:"<card id>"}')
  }
  const src = records.get({ id: text(sourceId).trim() })
  const key = text(sourceId).trim()
  const parsed = parseCard(src)
  if (!parsed.ok) {
    if (src.track !== CARD_TRACK || src.kind !== CARD_KIND) {
      throw refuse('VMU_INVALID_ARGUMENT', 'record ' + key + ' is ' + text(src.track) + '/' + text(src.kind) + ', not a ' + CARD_TRACK + '/' + CARD_KIND + ' card — only proposition cards can enter the verified track',
        'the verified split carries settled propositions (p=1 or p=0) only')
    }
    const why = Array.isArray(parsed.problems) && parsed.problems.length ? parsed.problems.join('; ') : text(parsed.reason)
    throw refuse('VMU_STATE', 'card ' + key + ' cannot be read as a v5r proposition card: ' + why,
      'the card body must carry the four declared fields (statement/value/motive/p); the carrier never invents a default for a missing field')
  }
  const card = parsed.card
  const logicalId = hasText(card.id) ? card.id : key
  const subject = text(warrant.subject).trim()
  if (subject && subject !== key && subject !== logicalId) {
    throw refuse('VMU_INVALID_ARGUMENT', 'warrant ' + text(warrant.id) + ' judged subject ' + subject + ', which is not card ' + key,
      'a warrant may only promote the card it was produced for')
  }
  if (card.p !== 1 && card.p !== 0) {
    throw refuse('VMU_STATE', 'card ' + key + ' is not settled (p=' + probText(card.p) + '), so it cannot enter the verified track',
      'only 1 or 0 may be promoted: p in (0,1) is experience, not a conclusion — a debate settlement is what turns it into 1. Promote AFTER that settlement, never before it')
  }
  if (withdrawnBy(fidelity, logicalId)) {
    throw refuse('VMU_STATE', 'the archived proof of ' + logicalId + ' was WITHDRAWN by a fidelity defect marker, so it cannot be promoted (a withdrawal must not be undone by the next settlement)',
      'the defect marker is the shared truth for every reader; reinstating a proof means a new card/settlement, not deleting the marker')
  }
  const when = Number.isFinite(at) ? at : (Number.isFinite(src.updatedAt) ? src.updatedAt : null)
  const title = text(card.title || src.title || key).trim()
  const row = {
    cardId: key,
    p: card.p,
    warrant: text(warrant.id).trim(),
    source: text(warrant.kind).trim(),
    by: hasText(by) ? text(by).trim() : '',
    at: timeText(when),
    title,
    statement: card.statement,
    basis: 'warrant ' + text(warrant.id).trim() + ' (' + text(warrant.kind).trim() + ') subject ' + (subject || key) + '; conclusion ' + (card.p === 1 ? '真 (p=1)' : '假 (p=0)'),
  }
  const body = composeVerifiedBody(row)
  const existing = findVerified(records, key, { fidelity })
  if (existing && sameFact(existing.body, body)) {
    return { ok: true, written: false, unchanged: true, id: existing.id, sourceId: key, cardId: key, p: card.p, conclusion: card.p === 1, warrant: { id: row.warrant, kind: row.source },
      note: 'the verified row already states this fact (the time line is ignored when comparing, like v3 writeVerifiedCardIfChanged)' }
  }
  const caps = typeof records.status === 'function' ? (records.status().caps || {}) : {}
  const cap = Number.isInteger(capBytes) && capBytes > 0 ? capBytes : (Number.isInteger(caps.bodyCapBytes) ? caps.bodyCapBytes : 0)
  const bounded = truncateToBytes(body, cap)
  let outcome
  if (existing) {
    if (typeof records.supersede !== 'function') throw refuse('VMU_ENGINE_UNAVAILABLE', 'refreshing verified row ' + existing.id + ' needs records.supersede', 'assemble a kernel whose records face publishes supersede')
    outcome = records.supersede({ id: existing.id, reason: 'v5r verified refresh (p=' + card.p + ', warrant ' + row.warrant + ')', body: bounded.kept, by: hasText(by) ? text(by).trim() : null })
  } else {
    outcome = records.put({ track: VERIFIED_TRACK, kind: VERIFIED_KIND, title: VERIFIED_TITLE_PREFIX + title, body: bounded.kept, settled: true, by: hasText(by) ? text(by).trim() : null })
  }
  if (outcome && outcome.deduplicated === true) {
    return { ok: true, written: false, unchanged: true, id: outcome.id, sourceId: key, cardId: key, p: card.p, conclusion: card.p === 1,
      warrant: { id: row.warrant, kind: row.source }, bounded,
      note: 'the identical verified body was already in the track (records fingerprintPolicy deduplicated it): nothing was added' }
  }
  return {
    ok: true, written: true, refreshed: !!existing, id: outcome.id, rev: outcome.rev, sourceId: key, cardId: key,
    p: card.p, conclusion: card.p === 1, warrant: { id: row.warrant, kind: row.source },
    bounded: { source: 'records.status().caps.bodyCapBytes', cap, keptBytes: Buffer.byteLength(bounded.kept, 'utf8'), dropped: bounded.dropped, truncated: bounded.truncated },
    note: existing ? 'the verified row was refreshed (supersede, reason is machine-readable)' : 'the conclusion entered the verified track',
  }
}


