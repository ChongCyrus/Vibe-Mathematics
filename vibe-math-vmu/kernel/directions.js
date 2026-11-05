// vmu directions — the DIRECTION CARD: one durable place for the nine kinds of direction/route/node information
// that rules G10 (L28), G13 (L31) and G14 (L32) describe in prose, plus the reuse/transfer half of G13/G14.
//
// WHY THIS EXISTS. The audit (docs/acceptance/sim-audit-rules.md, G10/G13/G14) found those three rules PROSE-ONLY:
// the rules text tells a member to accumulate per-direction information, to reuse what worked, and to check whether
// a similar problem was already handled — and NOTHING in the framework had a place to write any of it, so the
// instructions could not be observed at all. This module is the minimal carrier, deliberately NOT a gate and NOT a
// score: it only guarantees that the nine fields have somewhere to go, that a write lands, that a read returns them
// verbatim, and that a card missing a required field SAYS WHICH ONES instead of succeeding with holes.
//
// THE NINE FIELDS (English key, Chinese meaning — the key is what a tool call carries, the prose is what the rule
// text calls it):
//   current_assessment  当下评价
//   initial_plan        初始计划／源于什么启发／初始相关目标
//   related_plan        相关计划
//   feasibility         当下可行性评估及原因
//   value               当下价值性评估及原因
//   findings            已发现的相关结论／命题／认知／经验反馈／发现
//   obstacles           遇到的障碍及原因／解决方案／实施情况与效果或经验
//   history             过去经验经历
//   reuse               可复用／可迁移的方法与被复用过的类似问题（G13/G14）
// REQUIRED (a card missing any of these is refused by name): current_assessment, initial_plan, feasibility,
// findings, reuse. The other four may be empty — but they still APPEAR on every read as `null`, because an empty
// field means "not recorded yet", which is a different fact from "there is nothing to say" (fieldsMeans says so).
//
// STORAGE IS NOT NEW: a card is one `records` row on the `state` track (kind `route`), whose body is the SAME
// `vmu-md/1` shape `kernel/records.js` already composes and parses (`mdComposeText`/`mdParseText`) — so a card is
// readable by the generic records face, indexable, prunable and restorable like every other row. No second store.
// An update SUPERSEDES the same row (records keeps the version trail and bumps `rev`), it never silently replaces
// history: the read face reports `revision`, how many earlier revisions exist, and where they live.

/** Public-interface version of this module's surfaces (docs/03 §7, D13-O3). */
export const apiVersion = 1

import { mdComposeText, mdParseText } from './records.js'

/** The nine declared fields, in rule order (G10 lists them in this order). */
export const DIRECTION_FIELDS = Object.freeze([
  'current_assessment',
  'initial_plan',
  'related_plan',
  'feasibility',
  'value',
  'findings',
  'obstacles',
  'history',
  'reuse',
])

/** The five that must be present for a card to be written at all. */
export const DIRECTION_REQUIRED = Object.freeze(['current_assessment', 'initial_plan', 'feasibility', 'findings', 'reuse'])

/** Chinese meaning of each key — the read face prints these so a reader never has to guess what a key meant. */
export const DIRECTION_LABELS = Object.freeze({
  current_assessment: '当下评价',
  initial_plan: '初始计划／源于什么启发／初始相关目标',
  related_plan: '相关计划',
  feasibility: '当下可行性评估及原因',
  value: '当下价值性评估及原因',
  findings: '已发现的相关结论／命题／认知／经验反馈／发现',
  obstacles: '遇到的障碍及原因／解决方案／实施情况与效果或经验',
  history: '过去经验经历',
  reuse: '可复用／可迁移的方法与被复用过的类似问题',
})

/** Where a card lives: the EXISTING state track, kind `route` (a direction is a route through the work). */
export const DIRECTION_TRACK = 'state'
export const DIRECTION_KIND = 'route'
export const DIRECTION_TAG = 'direction'

/** The one code this module can throw itself. */
export const CODE = Object.freeze({ INCOMPLETE: 'VMU_DIRECTION_INCOMPLETE' })

const textOf = (v) => {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  // ★ RUN 240 (found by scripts/sim/scenarios/refusals.mjs): String({}) is "[object Object]", so a refusal that
  // meant to quote what the caller passed told the reader nothing — and the audit read it as a leaked object.
  // Quote the VALUE (JSON) instead of its type name. A nine-field card wants strings; this is how that mistake
  // reads back to the person who made it.
  try { return JSON.stringify(v) } catch { return String(v) }
}

/**
 * The record id of a direction key. STABLE, because `set` must UPHOLD a card rather than mint a new one every
 * write: the same direction always addresses the same row (records' own minted `rec-N` would drift per write).
 */
export function directionIdOf(direction) {
  const key = textOf(direction)
  const slug = key.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
  return 'dir-' + (slug === '' ? 'unnamed' : slug)
}

/** Every nine fields of `args`, trimmed; missing/undefined becomes '' (which the read face renders as null). */
export function fieldsOf(args = {}) {
  const out = {}
  for (const f of DIRECTION_FIELDS) out[f] = textOf(args[f])
  return out
}

/** Which of the nine are empty, and which REQUIRED ones are among them. */
export function missingOf(fields) {
  const missing = DIRECTION_FIELDS.filter((f) => textOf(fields && fields[f]) === '')
  const requiredMissing = DIRECTION_REQUIRED.filter((f) => textOf(fields && fields[f]) === '')
  return { missing, requiredMissing }
}

/** The md body of a card — the same `- key：value` header shape records already parses. */
export function bodyOf(direction, fields) {
  const key = textOf(direction)
  const src = Object.assign({ direction: key }, fieldsOf(fields))
  return mdComposeText({ title: '方向卡：' + key, track: DIRECTION_TRACK, kind: DIRECTION_KIND, fields: src, text: '' })
}

/** Parse a stored card body back into the nine fields (absent keys read as '' — the caller decides null vs ''). */
export function cardOf(body) {
  const doc = mdParseText(body)
  const fields = {}
  for (const f of DIRECTION_FIELDS) fields[f] = textOf(doc && doc.fields ? doc.fields[f] : '')
  return { ok: !!(doc && doc.ok), format: doc ? doc.format : null, direction: textOf(doc && doc.fields ? doc.fields.direction : ''), fields, why: doc ? doc.why : null }
}

function refuseDirection(code, message, hint, extra = null) {
  const e = new Error(message)
  e.code = code
  if (hint) e.hint = hint
  if (extra && typeof extra === 'object') Object.assign(e, extra)
  return e
}

/**
 * createDirections — the direction-card projection over `kernel.records`. Stateless: the kernel owns the ledger,
 * this module owns the SHAPE of a card and the honesty of its refusals.
 */
export function createDirections({ kernel = null } = {}) {
  const records = kernel && kernel.records ? kernel.records : null

  const requireRecords = () => {
    if (!records) {
      throw refuseDirection('VMU_ENGINE_UNAVAILABLE', 'this kernel has no records projection, so a direction card has nowhere to live',
        'a direction card is stored as one records row on the "' + DIRECTION_TRACK + '" track; attach the records projection (a durable root) and retry')
    }
    return records
  }

  const findRow = (id) => {
    try { return records.get({ id, includeBody: true }) } catch { return null }
  }

  const api = {
    apiVersion,
    fields: DIRECTION_FIELDS.slice(),
    required: DIRECTION_REQUIRED.slice(),
    labels: Object.assign({}, DIRECTION_LABELS),

    /** WRITE/UPDATE one direction card. Missing REQUIRED field ⇒ named refusal listing the field names. */
    set({ direction = null, by = null, ...rest } = {}) {
      const rc = requireRecords()
      const key = textOf(direction)
      if (key === '') {
        throw refuseDirection('VMU_INVALID_ARGUMENT', 'a direction card needs a `direction` key (e.g. "mainline" or "route:algebra")',
          'the key is how a later read addresses this card; without it every card would be the same card')
      }
      const fields = fieldsOf(rest)
      const { missing, requiredMissing } = missingOf(fields)
      if (requiredMissing.length > 0) {
        throw refuseDirection(CODE.INCOMPLETE, 'direction card "' + key + '" is missing required field(s): ' + requiredMissing.join(', '),
          'required fields: ' + DIRECTION_REQUIRED.join(', ') + ' — empty fields are allowed only for ' + DIRECTION_FIELDS.filter((f) => !DIRECTION_REQUIRED.includes(f)).join(', ') + ' (and a blank field means "not recorded", never "nothing to say")',
          { fieldsMissing: requiredMissing, fieldsRequired: DIRECTION_REQUIRED.slice(), direction: key })
      }
      const id = directionIdOf(key)
      const title = '方向卡：' + key
      const body = bodyOf(key, fields)
      const tags = [DIRECTION_TAG, DIRECTION_TAG + ':' + key]
      const existing = findRow(id)
      let rec = null
      let mode = 'created'
      if (existing) {
        const changed = DIRECTION_FIELDS.filter((f) => textOf(cardOf(existing.body).fields[f]) !== fields[f])
        rec = rc.supersede({ id, reason: 'direction card "' + key + '" updated (' + (changed.join(', ') || 'no field changed') + ')', title, body, tags, by })
        mode = 'updated'
      } else {
        rec = rc.put({ id, track: DIRECTION_TRACK, kind: DIRECTION_KIND, title, body, tags, settled: true, by })
      }
      const view = findRow(id)
      return {
        ok: true, action: 'set', mode, direction: key, id,
        revision: view ? view.rev : null,
        fieldsPresent: DIRECTION_FIELDS.filter((f) => fields[f] !== ''),
        fieldsMissing: missing,
        fieldsMeans: 'fieldsMissing lists the fields this card leaves empty: empty means "not recorded", not "there is nothing to say"',
        record: rec,
      }
    },

    /** READ one card back: all nine fields, empty ones as `null`, plus which are empty and where history lives. */
    get({ direction = null } = {}) {
      requireRecords()
      const key = textOf(direction)
      if (key === '') throw refuseDirection('VMU_INVALID_ARGUMENT', 'get needs a `direction` key', 'call list first to see the direction keys that exist')
      const id = directionIdOf(key)
      const row = findRow(id)
      if (!row) {
        throw refuseDirection('VMU_NO_SUCH_OBJECT', 'unknown direction card: ' + key,
          'known direction keys: ' + (api.list().directions.join(', ') || '(none)'))
      }
      const card = cardOf(row.body)
      const fields = {}
      for (const f of DIRECTION_FIELDS) fields[f] = card.fields[f] === '' ? null : card.fields[f]
      const { missing } = missingOf(card.fields)
      return {
        ok: true, action: 'get', direction: key, id, title: row.title,
        revision: row.rev, previousRevisions: Math.max(0, (row.rev || 1) - 1),
        supersededBy: null,
        supersededByMeans: 'this IS the live revision; earlier revisions are kept in the record version trail (kernel records.history({ id })), not overwritten',
        updatedAt: row.updatedAt, by: row.by,
        fields,
        fieldsMissing: missing,
        fieldsMeans: 'a null field was never recorded: empty is not "nothing applies", it is "not written down" (see fieldsMissing)',
        labels: Object.assign({}, DIRECTION_LABELS),
        mdFormat: card.format,
        mdOk: card.ok,
      }
    },

    /** LIST the direction keys that exist: key, updatedAt, and how many of the nine fields are still empty. */
    list() {
      const rc = requireRecords()
      const listed = rc.list({ track: DIRECTION_TRACK, limit: 0 })
      const items = []
      for (const head of (listed.items || [])) {
        if (String(head.kind) !== DIRECTION_KIND) continue
        let row = null
        try { row = rc.get({ id: head.id, includeBody: true }) } catch { row = null }
        if (!row) continue
        const card = cardOf(row.body)
        const key = card.direction !== '' ? card.direction : String(head.title || '').replace(/^方向卡：/, '')
        const { missing } = missingOf(card.fields)
        items.push({ direction: key, id: row.id, updatedAt: row.updatedAt, revision: row.rev, fieldsMissing: missing.length, fieldsMissingNames: missing })
      }
      items.sort((a, b) => (a.direction < b.direction ? -1 : (a.direction > b.direction ? 1 : 0)))
      return {
        ok: true, action: 'list',
        directions: items.map((x) => x.direction),
        items, count: items.length,
        fieldsMeans: 'fieldsMissing counts the nine fields still empty on that card: a card is allowed to be incomplete on the four optional ones, never on the five required ones (a write that misses one is refused with VMU_DIRECTION_INCOMPLETE)',
      }
    },

    /** The declared shape, for a reader that needs to render a form (no state, no scoring). */
    shape() {
      return { fields: DIRECTION_FIELDS.slice(), required: DIRECTION_REQUIRED.slice(), labels: Object.assign({}, DIRECTION_LABELS),
        track: DIRECTION_TRACK, kind: DIRECTION_KIND, code: CODE.INCOMPLETE }
    },
  }
  return api
}

export default createDirections
