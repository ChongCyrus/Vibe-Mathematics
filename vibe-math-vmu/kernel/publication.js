// vmu kernel publication — version chain, submission packs, archive registration (offline first),
// availability statements + badges, and replication outcomes (negative results are first-class).
// Spec: docs/16-research-lifecycle.md §7 (G2 JATS-style pack / G12 registration / G19 availability /
//       G20 replication) + docs/07 (fingerprints are REFERENCED, never redefined here).
// Codes: VMU_SUBMISSION_INCOMPLETE / VMU_VERSION_CHAIN_BROKEN / VMU_ARCHIVE_RECEIPT_MISSING /
//        VMU_AVAILABILITY_VAGUE / VMU_BADGE_MISMATCH (03-§8).
// Invariants: the version chain never breaks (jump/rollback refused BY NAME with current + legal next);
// "on request" is refused unless explicitly allowed; a claimed registration without a receipt is refused
// (an offline run still produces a *pending* pack); a badge must match its fields; `failed` replication is
// recorded normally (never an error); injected clock; zero-config never crashes; reads never mutate.

export const apiVersion = 1

/** The version chain of a publication (16 §7 G2). */
export const VERSION_CHAIN = Object.freeze(['preprint', 'accepted', 'vor', 'erratum'])

export function refuse(code, message, hint, extra) {
  const err = new Error(message)
  err.code = code
  err.hint = hint
  if (extra) Object.assign(err, extra)
  return err
}

const intOr = (v, d) => (Number.isInteger(v) && v >= 0 ? v : d)
const boolOr = (v, d) => (typeof v === 'boolean' ? v : d)

/** "on request" phrasings that are NOT an availability statement (16 §7 G19). */
export const VAGUE_PATTERNS = Object.freeze([
  'on request', 'upon request', 'by request', 'available on request', 'available upon request',
  '应要求提供', '可应要求提供', '按需提供', '如有需要可提供', '需要时提供', '可向作者索取', '索取',
  // contact 族（批评者实测能绕过的写法；中英双语，仍只做声明式表）
  'contact the authors', 'contact the author', 'contact us', 'please contact the authors',
  'available from the authors', 'available from the author', 'obtainable from the authors',
  '联系作者', '请联系作者', '与作者联系', '可联系作者获取', '向作者索取', '可向作者', '来信索取', '联系原作者',
])

/** 匹配前归一化：小写 ＋ 空白折叠（全角空格/制表/换行）＋ 去零宽字符。只做声明式匹配，不引入模糊匹配。 */
export function normalizeForMatch(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')   // 零宽字符
    .replace(/[\s\u3000]+/g, ' ')            // 空白折叠（含全角空格）
    .trim()
    .toLowerCase()
}

export function isVague(text) {
  const s = String(text === undefined || text === null ? '' : text).trim().toLowerCase()
  if (!s) return true
  // 归一化后匹配：多空格／全角空格／零宽字符／大小写都不再能绕过短语表
    return VAGUE_PATTERNS.some((p) => normalizeForMatch(s).includes(normalizeForMatch(p)))
}

/**
 * Create the publication service. `library` and `repropack` are OPTIONAL injectable seams (the module
 * works standalone); `clock` is injected for determinism.
 */
export function createPublication({ clock = () => Date.now(), log = () => {}, settings = {}, bus = null, library = null, repropack = null, listCap = 100 } = {}) {
  const papers = new Map()      // paperId -> { id, version, history[], packs[], registrations[], availability, at }
  const replications = []       // { original, outcome, evidence, at }
  let dropped = 0
  let seq = 0

  const cfg = () => ({
    allowOnRequest: boolOr(settings['vmu.avail.allowOnRequest'], false),
    requireUrl: boolOr(settings['vmu.avail.requireUrl'], true),
    openLicenses: Array.isArray(settings['vmu.avail.openLicenses']) && settings['vmu.avail.openLicenses'].length ? settings['vmu.avail.openLicenses'] : ['CC0-1.0', 'CC-BY-4.0', 'MIT', 'Apache-2.0'],
    offlineFirst: boolOr(settings['vmu.archive.offlineFirst'], true),
    receiptRequired: boolOr(settings['vmu.archive.receiptRequired'], true),
    targets: Array.isArray(settings['vmu.archive.targets']) ? settings['vmu.archive.targets'] : ['zenodo', 'osf', 'swh', 'other'],
    jatsVersion: settings['vmu.publish.jatsVersion'] || 'JATS-1.3',
    requireChecklist: boolOr(settings['vmu.publish.requireChecklist'], true),
    versionChainStrict: boolOr(settings['vmu.publish.versionChainStrict'], true),
    treatNegativeAsFirstClass: boolOr(settings['vmu.records.treatNegativeAsFirstClass'], true),
    summaryEnabled: boolOr(settings['vmu.replication.summaryEnabled'], true),
  })

  const paper = (paperId) => {
    const p = papers.get(paperId)
    if (!p) throw refuse('VMU_VERSION_CHAIN_BROKEN', 'unknown paper: ' + String(paperId), 'open it with submitPack({paperId,…}) first', { paperId })
    return p
  }
  const nextInChain = (version) => { const i = VERSION_CHAIN.indexOf(version); return i >= 0 && i + 1 < VERSION_CHAIN.length ? VERSION_CHAIN[i + 1] : null }

  /** Submission pack (G2). The pack is data only — network submission belongs to scripts/plugins. */
  function submitPack({ paperId, venue = null, version = VERSION_CHAIN[0], jats = null } = {}) {
    if (!paperId) throw refuse('VMU_SUBMISSION_INCOMPLETE', 'submitPack needs paperId', 'e.g. submitPack({paperId:"paper-1", venue:"J."})', { missing: ['paperId'] })
    if (!VERSION_CHAIN.includes(version)) throw refuse('VMU_VERSION_CHAIN_BROKEN', 'unknown version: ' + String(version), 'chain: ' + VERSION_CHAIN.join('->'), { version, chain: VERSION_CHAIN.slice() })
    const c = cfg()
    const p = papers.get(paperId)
    if (!p) {
      if (version !== VERSION_CHAIN[0]) throw refuse('VMU_VERSION_CHAIN_BROKEN', 'a new paper must start at ' + VERSION_CHAIN[0] + ', not ' + version, 'current: (none); legal next: ' + VERSION_CHAIN[0], { paperId, to: version, current: null, legalNext: VERSION_CHAIN[0] })
      papers.set(paperId, { id: paperId, version, history: [{ version, at: clock(), venue }], packs: [], registrations: [], availability: null, at: clock() })
    } else {
      if (p.version !== version) throw refuse('VMU_VERSION_CHAIN_BROKEN', 'pack version ' + version + ' does not match the current version ' + p.version + ' of ' + paperId, 'current: ' + p.version + '; legal next: ' + String(nextInChain(p.version)), { paperId, to: version, current: p.version, legalNext: nextInChain(p.version) })
    }
    const id = 'pack-' + (++seq)
    const pack = { id, paperId, venue, version, jatsVersion: c.jatsVersion, jats: jats || null, checklist: { paperId: true, venue: !!venue, jats: !!jats }, at: clock(), status: 'ready' }
    if (c.requireChecklist && !pack.checklist.venue) throw refuse('VMU_SUBMISSION_INCOMPLETE', 'submission pack is incomplete for ' + paperId + ': missing venue', 'pass venue:<name> (vmu.publish.requireChecklist=true)', { paperId, missing: ['venue'] })
    papers.get(paperId).packs.push(pack)
    return { ...pack }
  }

  /** advance(): the chain is strict — jumps and rollbacks are refused BY NAME. */
  function advance({ paperId, to } = {}) {
    const p = paper(paperId)
    if (!VERSION_CHAIN.includes(to)) throw refuse('VMU_VERSION_CHAIN_BROKEN', 'unknown version: ' + String(to), 'chain: ' + VERSION_CHAIN.join('->'), { paperId, to, chain: VERSION_CHAIN.slice() })
    const legal = nextInChain(p.version)
    const c = cfg()
    const backward = VERSION_CHAIN.indexOf(to) < VERSION_CHAIN.indexOf(p.version)
    if (to !== legal) {
      const why = backward ? 'rollback is not allowed' : (VERSION_CHAIN.indexOf(to) > VERSION_CHAIN.indexOf(p.version) + 1 ? 'version skipping is not allowed' : 'same version cannot be re-entered')
      throw refuse('VMU_VERSION_CHAIN_BROKEN', 'illegal version move ' + p.version + '->' + to + ' (' + why + ')',
        'current: ' + p.version + '; legal next: ' + String(legal), { paperId, from: p.version, to, current: p.version, legalNext: legal })
    }
    if (c.versionChainStrict && to === VERSION_CHAIN[VERSION_CHAIN.length - 1] && p.registrations.some((r) => r.status === 'pending')) {
      // informational only: an erratum after a pending registration is allowed
    }
    p.version = to
    p.history.push({ version: to, at: clock() })
    if (bus && typeof bus.emit === 'function') bus.emit('publication/advance', { paperId, to, at: clock() })
    return { paperId, version: p.version, legalNext: nextInChain(p.version), history: p.history.slice() }
  }

  /**
   * Archive registration (G12), OFFLINE FIRST. With no network (or no receipt) the call still produces a
   * pending registration; claiming `registered` without a receipt is refused by name.
   */
  function register({ paperId, target = null, receipt = null, status = null } = {}) {
    const p = paper(paperId)
    const c = cfg()
    if (target && !c.targets.includes(target)) throw refuse('VMU_ARCHIVE_RECEIPT_MISSING', 'unknown archive target: ' + String(target), 'declared targets: ' + c.targets.join('|') + ' (vmu.archive.targets)', { target })
    const wanted = status || (receipt ? 'registered' : 'pending')
    if (wanted === 'registered' && c.receiptRequired && !receipt) {
      throw refuse('VMU_ARCHIVE_RECEIPT_MISSING', 'cannot claim a registration without a receipt for ' + paperId,
        'offline-first: record status:"pending" now and add the receipt when the network returns (vmu.archive.receiptRequired=true)', { paperId, target })
    }
    const reg = { id: 'reg-' + (++seq), paperId, target, status: wanted, receipt: receipt || null, at: clock(), offline: !receipt }
    p.registrations.push(reg)
    return { ...reg }
  }

  /** Availability statement (G19): "on request" is refused unless explicitly allowed. */
  function availability({ paperId, data = null, code = null, materials = null, license = null, url = null, how = null } = {}) {
    const p = paper(paperId)
    const c = cfg()
    const urlStr = typeof url === 'string' ? url.trim() : ''
    const howStr = typeof how === 'string' ? how.trim() : ''
    const resolvableUrl = /^https?:\/\//i.test(urlStr)
    if (!c.allowOnRequest) {
      // (a) an "on request" phrasing is NOT availability; (b) a missing/non-resolvable url is not either.
      if ((howStr && isVague(howStr)) || (urlStr && isVague(urlStr))) {
        const text = [howStr, urlStr].filter(Boolean).join(' | ')
        throw refuse('VMU_AVAILABILITY_VAGUE', 'availability statement is vague ("on request" is not availability): ' + (text || '(empty)'),
          'give a resolvable url; "on request" is refused unless vmu.avail.allowOnRequest=true', { paperId, how: howStr || null, url: urlStr || null })
      }
      if (c.requireUrl && !resolvableUrl) {
        throw refuse('VMU_AVAILABILITY_VAGUE', 'availability statement has no resolvable url for ' + paperId,
          'pass url:"https://…" (vmu.avail.requireUrl=true); "on request" is refused unless vmu.avail.allowOnRequest=true', { paperId, url: urlStr || null })
      }
    }
    const fields = { data, code, materials }
    const decl = { paperId, ...fields, license, url: urlStr || null, how: howStr || null, at: clock() }
    p.availability = decl
    const vagueAccepted = isVague([howStr, urlStr].filter(Boolean).join(' '))
    // 显式放行也必须**自曝**：回执里出现 onRequest:true，绝不静默
    return { ...decl, badge: badge({ paperId }).badge, ...(c.allowOnRequest && vagueAccepted ? { onRequest: true, onRequestNote: 'accepted ONLY because vmu.avail.allowOnRequest=true (self-exposed)' } : {}) }
  }

  /** Badge (G19): must match the fields — a mismatch is refused by name. */
  function badge({ paperId, expect = null } = {}) {
    const p = paper(paperId)
    const c = cfg()
    const a = p.availability
    let computed = 'closed'
    if (a) {
      const openLicense = !!a.license && c.openLicenses.some((l) => String(a.license).toLowerCase() === String(l).toLowerCase())
      const urlOk = !!a.url && /^https?:\/\//i.test(String(a.url))
      const anyDeclared = !!(a.data || a.code || a.materials)
      computed = anyDeclared && openLicense && urlOk ? 'open' : (anyDeclared ? 'restricted' : 'closed')
    }
    if (expect !== null && expect !== undefined && expect !== computed) {
      throw refuse('VMU_BADGE_MISMATCH', 'badge mismatch for ' + paperId + ': declared=' + String(expect) + ' computed=' + computed,
        'the badge is derived from the fields (url + open license + declared artifacts)', { paperId, declared: expect, computed })
    }
    return { paperId, badge: computed, fields: a ? { license: a.license, url: a.url, data: a.data, code: a.code, materials: a.materials } : null }
  }

  /**
   * Replication outcomes (G20): `failed` is a FIRST-CLASS result, never an error. A missing `original`
   * or `evidence` is refused by name (that is a malformed record, not a negative result).
   */
  function replication({ original, outcome, evidence = null, notes = null } = {}) {
    const c = cfg()
    if (!original) throw refuse('VMU_INVALID_ARGUMENT', 'replication needs original', 'pass original:<paperId|study-id>', { missing: ['original'] })
    if (!['reproduced', 'failed', 'partial'].includes(outcome)) throw refuse('VMU_INVALID_ARGUMENT', 'outcome must be reproduced|failed|partial, got ' + String(outcome), 'a negative result is recorded as failed - it is NOT an error', { outcome })
    if (!evidence) throw refuse('VMU_INVALID_ARGUMENT', 'replication needs evidence', 'pass evidence:<path|hash|note> so the outcome can be re-checked', { missing: ['evidence'] })
    const rec = { original, outcome, evidence, notes, at: clock(), firstClass: c.treatNegativeAsFirstClass, sequence: ++seq }
    replications.push(rec)
    if (outcome === 'failed' && c.summaryEnabled && bus && typeof bus.emit === 'function') bus.emit('publication/replication-failed', { original, at: rec.at })
    return { ...rec }
  }

  /** Read-only views (never mutate; counted truncation). */
  const list = () => {
    const all = [...papers.values()].map((p) => ({ paperId: p.id, version: p.version, legalNext: nextInChain(p.version), packs: p.packs.length, registrations: p.registrations.length, hasAvailability: !!p.availability, at: p.at }))
    const kept = all.slice(0, listCap)
    if (kept.length !== all.length) dropped += all.length - kept.length
    return { items: kept, total: all.length, dropped, replications: replications.length }
  }
  const status = () => ({
    papers: papers.size,
    replications: replications.length,
    outcomes: replications.reduce((acc, r) => { acc[r.outcome] = (acc[r.outcome] || 0) + 1; return acc }, {}),
    dropped,
    policy: cfg(),
    seams: { library: library ? 'injected' : 'none', repropack: repropack ? 'injected' : 'none' },
    chain: VERSION_CHAIN.slice(),
  })

  return { apiVersion, submitPack, advance, register, availability, badge, replication, list, status }
}
