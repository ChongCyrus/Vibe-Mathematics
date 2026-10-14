// vmu kernel · citations — the bibliography face: the declared style, the fields an entry must carry, the priority order of
// identifiers, and whether an entry without any identifier may exist at all
// （docs/07 the citation table; kernel/library.js owns records and kernel/paper.js owns the paper, neither is redefined here）.
//
// WHAT IT IS: it turns an entry into the declared style, refuses an entry that is missing a declared field or carries no
// identifier under the default rule, and chooses the identifier to key on by the DECLARED priority rather than by whichever
// key happens to appear first in the input.
//
// FACE CONVENTIONS: literal key reads; receipts carry enforced[] and fired[]; limits refused BY NAME; nothing declared means
// nothing happens; injected clock; read-only surfaces never mutate.
import { mint } from './ids.js'   // ROUND 2 (task-14): ids never restart from 0 (kernel/ids.js)
export const apiVersion = 1

export function refuse(code, message, hint, extra) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  if (extra !== undefined) e.detail = extra
  return e
}

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const listOf = (v, fallback) => (Array.isArray(v) && v.length ? v.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : fallback.slice())

const STYLES = Object.freeze(['bibtex', 'csl-json', 'csl-yaml'])
const DEFAULT_FIELDS = Object.freeze(['title', 'authors', 'year'])
const DEFAULT_PRIORITY = Object.freeze(['doi', 'arxiv', 'pmid', 'url'])

export const CODE = Object.freeze({
  styleUnknown: 'VMU_CITATIONS_STYLE_UNKNOWN',
  fieldMissing: 'VMU_CITATIONS_FIELD_MISSING',
  identifierMissing: 'VMU_CITATIONS_IDENTIFIER_MISSING',
})

export function createCitations({ clock = () => 0, log = null, settings = {}, bus = null, listCap = 100 } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createCitations needs a clock function', 'pass { clock: () => ms }')
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging never breaks the face */ } } }

  const cfg = () => ({
    style: STYLES.includes(sget('vmu.citations.style')) ? sget('vmu.citations.style') : 'bibtex',
    requiredFields: listOf(sget('vmu.citations.requiredFields'), DEFAULT_FIELDS),
    idPriority: listOf(sget('vmu.citations.idPriority'), DEFAULT_PRIORITY),
    allowFreeText: sget('vmu.citations.allowFreeText') === true,
  // ROUND 262 (volume 16 §L84): two identifier SCHEMES this face did not consider. They are read here and JOIN the declared
  // priority rather than creating a second selection path - one way to choose an identifier, not two.
  orcid: sget('vmu.citations.orcid') === true,
  ror: sget('vmu.citations.ror') === true,
  })

  const entries = []
  let dropped = 0

  /** The identifier to key on, chosen by the DECLARED priority - never by whichever key appears first. */
  function identify({ ids = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.citations.idPriority']
    const bag = ids && typeof ids === 'object' && !Array.isArray(ids) ? ids : {}
    const order = c.idPriority.concat([c.orcid ? 'orcid' : null, c.ror ? 'ror' : null].filter(Boolean))
    for (const key of order) {
      const v = str(bag[key])
      if (v) return { ok: true, idType: key, id: v, priority: c.idPriority.slice(), enforced, fired: c.idPriority[0] === key ? [] : ['vmu.citations.idPriority'] }
    }
    return { ok: true, idType: null, id: null, priority: c.idPriority.slice(), enforced, fired: [] }
  }

  /**
   * Validate an entry against the declaration. A missing required field is refused BY NAME, and an entry with no identifier
   * is refused unless free text is explicitly allowed - because a citation nobody can resolve is not a citation.
   */
  function validate({ title = null, authors = null, year = null, ids = null, freeText = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.citations.requiredFields', 'vmu.citations.allowFreeText', 'vmu.citations.idPriority']
    const fired = []
    const entry = { title: str(title), authors: authors, year: year, ids: ids && typeof ids === 'object' ? Object.assign({}, ids) : {}, freeText: freeText === null ? null : String(freeText) }
    const present = { title: entry.title, authors: Array.isArray(entry.authors) || typeof entry.authors === 'string' ? entry.authors : null, year: Number.isInteger(entry.year) || (typeof entry.year === 'string' && entry.year.trim()) ? entry.year : null }
    const missing = c.requiredFields.filter((f) => present[f] === null || present[f] === undefined || present[f] === '')
    if (missing.length) {
      fired.push('vmu.citations.requiredFields')
      throw refuse(CODE.fieldMissing, 'the entry is missing declared field(s): ' + missing.join(', '),
        'entries must carry ' + c.requiredFields.join(', ') + ' (vmu.citations.requiredFields)', { missing, enforced, fired })
    }
    const idr = identify({ ids: entry.ids })
    if (!idr.idType && !c.allowFreeText && !entry.freeText) {
      fired.push('vmu.citations.allowFreeText')
      throw refuse(CODE.identifierMissing, 'the entry carries no identifier and vmu.citations.allowFreeText=false',
        'give one of ' + c.idPriority.join(', ') + ', or allow free text deliberately', { priority: c.idPriority.slice(), enforced, fired })
    }
    if (!idr.idType) fired.push('vmu.citations.allowFreeText')
    return { ok: true, entry, idType: idr.idType, id: idr.id, idFired: idr.fired, enforced, fired }
  }

  /** Render an entry in the declared style. The style is the decision; the text shows which one was used. */
  function render({ title = null, authors = null, year = null, ids = null, freeText = null, style = null } = {}) {
    const c = cfg()
    const wanted = style === null ? c.style : String(style)
    if (!STYLES.includes(wanted)) {
      throw refuse(CODE.styleUnknown, 'unknown citation style: ' + wanted,
        'declared styles: ' + STYLES.join(', ') + ' (vmu.citations.style)', { style: wanted })
    }
    const v = validate({ title, authors, year, ids, freeText })
    const entry = v.entry
    const authorList = Array.isArray(entry.authors) ? entry.authors.map((x) => String(x)) : (entry.authors ? [String(entry.authors)] : [])
    let text
    if (wanted === 'bibtex') {
      const key = (authorList[0] ? String(authorList[0]).split(/\s+/).pop() : 'anon') + String(entry.year)
      text = '@article{' + key + ',\n  title = {' + entry.title + '},\n  author = {' + authorList.join(' and ') + '},\n  year = {' + entry.year + '}' +
        (v.idType ? ',\n  ' + v.idType + ' = {' + v.id + '}' : '') + '\n}'
    } else if (wanted === 'csl-json') {
      text = JSON.stringify([{ id: v.id || (mint('cite-free', 'free-')), type: 'article-journal', title: entry.title, author: authorList.map((a) => ({ literal: a })), issued: { 'date-parts': [[Number(entry.year) || entry.year]] }, DOI: entry.ids.doi || undefined, URL: entry.ids.url || undefined }])
    } else {
      text = '- id: ' + (v.id || (mint('cite-free', 'free-'))) + '\n  title: ' + entry.title + '\n  author: [' + authorList.join(', ') + ']\n  issued: ' + entry.year
    }
    const rec = { id: mint('cite', 'cite-'), style: wanted, text, idType: v.idType, id: v.id, title: entry.title, at: clock() }
    entries.push(rec)
    while (entries.length > 300) { entries.shift(); dropped += 1 }
    say({ type: 'citations/rendered', at: rec.at, id: rec.id, style: wanted, idType: v.idType })
    return { ok: true, style: wanted, text, idType: v.idType, id: v.id, enforced: [...new Set(v.enforced.concat(['vmu.citations.style']))], fired: [...new Set(v.fired)] }
  }

  /** Read-only. */
  const status = () => ({
    ok: true, entries: entries.length, dropped,
    policy: cfg(),
    freeTextIsOffByDefault: cfg().allowFreeText === false,
    readsArePure: true,
    items: entries.slice(0, listCap).map((e) => ({ id: e.id, style: e.style, idType: e.idType, title: e.title })),
    at: clock(),
  })

  return { apiVersion, identify, validate, render, status }
}
