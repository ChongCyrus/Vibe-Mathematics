// vmu kernel · custody — the entry ledger and the CHAIN OF CUSTODY
//
// ★ 范围基准（2026-10-11）：**本面已判定降级为扩展** ✗ —— **对数学研究举不出消费者** ✓（判据与登记见 docs/23-§1b）。
//   **本行注释不是"已完成"，而是"待改"的证据** ✗：键族与代码仍在，**移出流程必须包含撤代码**（docs/23-§2 规则 4）。
//   ★★ 另注：22-§14 早已判它"不做 ✗（无消费者）"，**而代码却存在且 7 键全部接线** —— 该矛盾见 docs/23-§1c。
// （docs/22 §2.5 biobank / chain of custody; docs/07 owns the durability library and is referenced for retention, never
// redefined here; docs/20 supplies the pseudonymisation side）.
//
// WHAT IT IS: a ledger of physical entries, the custody chain that moves with them, the policy when that chain has a gap,
// freeze/thaw accounting with a warning threshold, destruction that keeps the reference, the style of subject reference and
// the irreversibility of the mapping from subject to reference.
//
// THE INVARIANT WORTH STATING: `mappingIrreversible` is marked kernel-enforced in the design volume. The honest way to
// enforce an irreversible mapping in a face that must not keep the means of reversal is to REFUSE to store a reversible
// one: when the key is on, a plaintext mapping from subject to reference is refused by name, and only the reference
// travels. The face never sees the subject again.
//
// FACE CONVENTIONS: literal key reads; receipts carry enforced[] and fired[]; limits refused BY NAME; nothing declared
// means nothing happens; injected clock; read-only surfaces never mutate; every truncation is counted.
export const apiVersion = 1

export function refuse(code, message, hint, extra) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  if (extra !== undefined) e.detail = extra
  return e
}

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const boolOr = (v, d) => (typeof v === 'boolean' ? v : d)
const intOr = (v, d) => (Number.isInteger(v) ? v : d)

export const CODE = Object.freeze({
  entryUnknown: 'VMU_CUSTODY_ENTRY_UNKNOWN',
  chainRequired: 'VMU_CUSTODY_CHAIN_REQUIRED',
  chainGap: 'VMU_CUSTODY_CHAIN_GAP',
  reversibleMapping: 'VMU_CUSTODY_REVERSIBLE_MAPPING',
  pseudonymStyle: 'VMU_CUSTODY_PSEUDONYM_STYLE',
  alreadyDestroyed: 'VMU_CUSTODY_ALREADY_DESTROYED',
})

/** A reference that looks like a raw identifier rather than a code or pseudonym. Deliberately conservative. */
const LOOKS_PLAINTEXT = /^[^@\s]+@[^@\s]+$|^[A-Z][a-z]+\s+[A-Z][a-z]+$/

export function createCustody({ clock = () => 0, log = null, settings = {}, bus = null, listCap = 100 } = {}) {
  if (typeof clock !== 'function') throw refuse('VMU_INVALID_ARGUMENT', 'createCustody needs a clock function', 'pass { clock: () => ms }')
  const sget = (key, def) => {
    if (settings && typeof settings.get === 'function') { const v = settings.get(key); return v === undefined ? def : v }
    if (settings && Object.prototype.hasOwnProperty.call(settings, key)) return settings[key]
    return def
  }
  const say = (ev) => { if (log && typeof log.append === 'function') { try { log.append(ev) } catch (e) { /* logging never breaks the face */ } } }

  const cfg = () => ({
    ledgerDir: str(sget('vmu.custody.ledgerDir')) || 'Ops/Custody',
    requireChain: boolOr(sget('vmu.custody.requireChain'), true),
    chainGapPolicy: ['block', 'warn'].includes(sget('vmu.custody.chainGapPolicy')) ? sget('vmu.custody.chainGapPolicy') : 'block',
    storageCycleWarnAt: intOr(sget('vmu.custody.storageCycleWarnAt', 5), 5),
    destroyKeepsReference: sget('vmu.custody.destroyKeepsReference') !== false,
    pseudonymStyle: ['pseudonym', 'code'].includes(sget('vmu.custody.pseudonymStyle')) ? sget('vmu.custody.pseudonymStyle') : 'pseudonym',
    mappingIrreversible: sget('vmu.custody.mappingIrreversible') !== false,   // 内核强制：默认 true
  })

  const entries = new Map()   // id -> { id, ref, kind, chain[], storageCycles, destroyedAt, destroyReason, warnings[] }
  let dropped = 0
  let seq = 0

  const entryOf = (id) => {
    const s = entries.get(String(id))
    if (!s) throw refuse(CODE.entryUnknown, 'unknown entry: ' + String(id), 'register it first with registerEntry', { id: String(id) })
    return s
  }

  /**
   * Register a entry. `pseudonymStyle` decides what a reference may look like, and `mappingIrreversible` decides whether a
   * mapping back to the subject may be stored at all - it may NOT when the key is on, which is the default and is marked
   * kernel-enforced in the design volume.
   */
  function registerEntry({ id = null, pseudonym = null, kind = null, mapping = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.custody.pseudonymStyle', 'vmu.custody.mappingIrreversible', 'vmu.custody.ledgerDir']
    const fired = []
    const ref = str(pseudonym)
    if (!ref) throw refuse('VMU_INVALID_ARGUMENT', 'registerEntry needs a pseudonym', 'pass { pseudonym: "anon-…" }')
    // pseudonymStyle: a pseudonym must not look like a plaintext identifier; a code must look like a code.
    if (c.pseudonymStyle === 'pseudonym' && LOOKS_PLAINTEXT.test(ref)) {
      fired.push('vmu.custody.pseudonymStyle')
      throw refuse(CODE.pseudonymStyle, 'vmu.custody.pseudonymStyle=pseudonym but the reference looks like a plaintext identifier',
        'use a pseudonym, or set the style to code deliberately', { ref, style: c.pseudonymStyle, enforced, fired })
    }
    // mappingIrreversible: with it on (the default) a reversible mapping is REFUSED, not encrypted and hoped over.
    if (c.mappingIrreversible && mapping !== null && mapping !== undefined) {
      fired.push('vmu.custody.mappingIrreversible')
      throw refuse(CODE.reversibleMapping, 'vmu.custody.mappingIrreversible=true: a mapping from subject to reference may not be stored here',
        'keep the mapping outside this ledger, or set the key to false deliberately and record that decision', { ref, enforced, fired })
    }
    const realId = str(id) || ('entry-' + (++seq))
    const at = clock()
    const rec = { id: realId, ref, kind: str(kind) || null, chain: [], storageCycles: 0, destroyedAt: null, destroyReason: null, warnings: [], mapping: mapping === null || mapping === undefined ? null : Object.assign({}, mapping), at }
    // requireChain: a registered entry must OPEN its chain with a holder, so the chain can never start empty.
    if (c.requireChain) {
      rec.chain.push({ at, holder: null, action: 'registered', reason: null })
      fired.push('vmu.custody.requireChain')
    }
    entries.set(realId, rec)
    return { ok: true, id: realId, ref, kind: rec.kind, ledgerDir: c.ledgerDir, chainLength: rec.chain.length, enforced, fired }
  }

  /** Move custody. `requireChain` is what makes a transfer carry a holder and a reason rather than a bare note. */
  function transfer({ entryId, to = null, reason = null, at = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.custody.requireChain', 'vmu.custody.chainGapPolicy']
    const fired = []
    const s = entryOf(entryId)
    if (s.destroyedAt !== null) {
      throw refuse(CODE.alreadyDestroyed, 'the entry was destroyed at ' + s.destroyedAt + ' and cannot change custody',
        'register a new entry if material still exists', { entryId: s.id, destroyedAt: s.destroyedAt, enforced, fired })
    }
    const holder = str(to)
    if (c.requireChain && !holder) {
      fired.push('vmu.custody.requireChain')
      throw refuse(CODE.chainRequired, 'vmu.custody.requireChain=true: a transfer needs a new holder',
        'pass to:<holder>, or set the key to false deliberately', { entryId: s.id, enforced, fired })
    }
    const when = Number.isFinite(at) ? Number(at) : clock()
    const last = s.chain[s.chain.length - 1]
    // A gap is a chain entry that cannot be tied to the previous one: no previous entry at all, or a time that runs
    // backwards. `chainGapPolicy` decides whether that refuses or merely warns.
    // A gap is a link that cannot be tied to the previous one. An EMPTY chain is not a gap: that is exactly what
    // `requireChain: false` permits, and conflating the two made the default block policy refuse a first transfer.
    const gap = (last !== undefined && when < last.at) || (last === undefined && c.requireChain)
    if (gap && c.chainGapPolicy === 'block') {
      fired.push('vmu.custody.chainGapPolicy')
      throw refuse(CODE.chainGap, 'the custody chain has a gap: ' + (last ? 'the transfer is dated before the previous link' : 'there is no previous link'),
        'record the missing link, or set vmu.custody.chainGapPolicy=warn deliberately', { entryId: s.id, lastAt: last ? last.at : null, when, enforced, fired })
    }
    if (gap) { s.warnings.push('chain-gap-warn at ' + when); fired.push('vmu.custody.chainGapPolicy') }
    s.chain.push({ at: when, holder: holder || null, action: 'transfer', reason: reason === null ? null : String(reason) })
    return { ok: true, entryId: s.id, holder: holder || null, chainLength: s.chain.length, gapWarned: gap, enforced, fired }
  }

  /** Freeze or thaw. `storageCycleWarnAt` warns at the declared count - it does not refuse, because the contract states a warning. */
  function storageCycle({ entryId, kind = 'freeze' } = {}) {
    const c = cfg()
    const s = entryOf(entryId)
    const which = str(kind) === 'thaw' ? 'thaw' : 'freeze'
    if (which === 'thaw') s.storageCycles += 1
    const warn = s.storageCycles >= c.storageCycleWarnAt && c.storageCycleWarnAt > 0
    if (warn) s.warnings.push('freeze-thaw ' + s.storageCycles + ' >= ' + c.storageCycleWarnAt)
    s.chain.push({ at: clock(), holder: s.chain.length ? s.chain[s.chain.length - 1].holder : null, action: which, reason: null })
    return { ok: true, entryId: s.id, kind: which, cycles: s.storageCycles, warnAt: c.storageCycleWarnAt, warned: warn,
      enforced: ['vmu.custody.storageCycleWarnAt'], fired: warn ? ['vmu.custody.storageCycleWarnAt'] : [] }
  }

  /**
   * Destroy a entry. `destroyKeepsReference` is the difference between a ledger that remembers what it lost and one that
   * quietly forgets: with it on (the default) the record stays and says the material is gone.
   */
  function destroy({ entryId, reason = null } = {}) {
    const c = cfg()
    const enforced = ['vmu.custody.destroyKeepsReference']
    const s = entryOf(entryId)
    if (s.destroyedAt !== null) {
      throw refuse(CODE.alreadyDestroyed, 'the entry was already destroyed at ' + s.destroyedAt, 'nothing to do', { entryId: s.id, destroyedAt: s.destroyedAt, enforced, fired: [] })
    }
    const at = clock()
    s.destroyedAt = at
    s.destroyReason = reason === null ? null : String(reason)
    s.chain.push({ at, holder: s.chain.length ? s.chain[s.chain.length - 1].holder : null, action: 'destroyed', reason: s.destroyReason })
    if (!c.destroyKeepsReference) { entries.delete(s.id); dropped += 1 }
    return { ok: true, entryId: s.id, destroyedAt: at, referenceKept: c.destroyKeepsReference, reason: s.destroyReason, enforced, fired: c.destroyKeepsReference ? [] : ['vmu.custody.destroyKeepsReference'] }
  }

  /** Read-only view of one entry, including the whole chain and the warnings raised against it. */
  function chainOf({ entryId } = {}) {
    const s = entryOf(entryId)
    return { ok: true, id: s.id, ref: s.ref, kind: s.kind, ledgerDir: cfg().ledgerDir,
      chain: s.chain.map((x) => Object.assign({}, x)), chainLength: s.chain.length,
      storageCycles: s.storageCycles, destroyedAt: s.destroyedAt, warnings: s.warnings.slice(),
      enforced: ['vmu.custody.ledgerDir'], fired: [] }
  }

  const status = () => {
    const c = cfg()
    const all = [...entries.values()]
    return {
      ok: true, entries: entries.size, destroyed: all.filter((s) => s.destroyedAt !== null).length, dropped,
      policy: c,
      chainRequired: c.requireChain,
      mappingKept: all.filter((s) => s.mapping !== null).length,
      readsArePure: true,
      items: all.slice(0, listCap).map((s) => ({ id: s.id, ref: s.ref, chainLength: s.chain.length, storageCycles: s.storageCycles, destroyed: s.destroyedAt !== null, warnings: s.warnings.length })),
      at: clock(),
    }
  }

  return { apiVersion, registerEntry, transfer, storageCycle, destroy, chainOf, status }
}
