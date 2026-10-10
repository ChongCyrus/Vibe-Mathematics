// Independent test for vmu kernel · records (no dependency on kernel/index.js).
// Spec source: docs/07-durability-library.md §4/§12 (the 24 `vmu.records.*` keys) + docs/21 (ops). The standard
// followed is kernel/mathtools.js: every wired key CHANGES AN OBSERVABLE RESULT, every receipt carries
// `enforced[]` (keys whose rule was evaluated) and `fired[]` (keys that changed the outcome), the wired/unwired
// partition is asserted, and read paths never mutate.
// Run: node tests/vmu-records.test.mjs     Last line: === VMU RECORDS: N passed, M failed ===
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRecords, refuse, slugify, chunkBody, DECLARED_KEYS, WIRED_KEYS, UNWIRED_REASONS, EXTRA_WIRED_KEYS, CORE_HEAD_FIELDS } from '../vibe-math-vmu/kernel/records.js'

let passed = 0
let failed = 0
function ok(cond, label) { if (cond) { passed += 1 } else { failed += 1; console.log('FAIL ' + label) } }
function throwsNamed(fn, code, label) {
  try { fn(); failed += 1; console.log('FAIL ' + label + ' (no refusal)'); return null }
  catch (e) {
    if (e && e.code === code) { passed += 1; return e }
    failed += 1; console.log('FAIL ' + label + ' (code=' + (e && e.code) + ' want ' + code + ')'); return null
  }
}
/**
 * A refusal must be NAMED **and** carry `enforced` (rule ①): an array (possibly empty), never undefined, never
 * with duplicates. Optionally assert which keys MUST be listed (rule ③: "it changed behaviour ⇒ it is listed").
 */
function throwsNamedE(fn, code, label, mustInclude = []) {
  let e = null
  try { fn() } catch (err) { e = err }
  if (!e) { failed += 1; console.log("FAIL " + label + " (no refusal)"); return null }
  if (e.code !== code) { failed += 1; console.log("FAIL " + label + " (code=" + e.code + " want " + code + ")"); return null }
  const problems = []
  if (!Array.isArray(e.enforced)) problems.push("enforced is " + typeof e.enforced + " (not an array)")
  else if (new Set(e.enforced).size !== e.enforced.length) problems.push("enforced has duplicates: " + e.enforced.join(","))
  for (const k of mustInclude) if (!Array.isArray(e.enforced) || !e.enforced.includes(k)) problems.push("missing " + k)
  if (problems.length) { failed += 1; console.log("FAIL " + label + " (" + problems.join("; ") + ")"); return e }
  passed += 1
  return e
}
function fakeClock(start = 0) { let t = start; return { now: () => t, advance: (ms) => { t += ms }, clock: () => t } }
function fakeLog() { const rows = []; return { rows, append: (e) => { rows.push(e) } } }
function fakeBus({ throwOnEmit = false } = {}) {
  const rows = []; const topics = []
  return { rows, topics, declareTopic: (n) => { topics.push(n); return { ok: true, topic: n, existing: false } }, emit: (h, p) => { if (throwOnEmit) throw new Error('bus down'); rows.push({ hook: h, payload: p }) } }
}
const S = (extra = {}) => Object.assign({ 'vmu.records.requireSettledRecords': false }, extra)
const put = (r, extra = {}) => r.put(Object.assign({ track: 'progress', kind: 'progress', title: 'task one', body: 'hello', settled: true }, extra))

// ── 0. the standard itself: the 24-key partition, and every wired key is really read ─────────────────
{
  const r = createRecords({ clock: () => 0, settings: S() })
  const st = r.status()
  ok(DECLARED_KEYS.length === 24, 'standard: the design volumes declare exactly 24 keys')
  ok(WIRED_KEYS.every((k) => DECLARED_KEYS.includes(k)), 'standard: WIRED ⊆ declared')
  ok(st.unwiredKeys.every((k) => !WIRED_KEYS.includes(k)), 'standard: wired ∩ unwired = ∅')
  ok(st.wiredCount + st.unwiredCount === 24 && st.partitionOk === true, 'standard: wired + unwired partition the 24 exactly')
  ok(st.complementOk === true, 'standard: status() states that the partition holds')
  ok(st.unwiredKeys.length === 0 && Object.keys(st.unwiredReasons).length === 0, 'standard: no documented key is left unwired (stated, not implied)')
  ok(st.extraWired.length === 7 && EXTRA_WIRED_KEYS.every((k) => st.extraWired.includes(k)), 'standard: the 7 extra registered core keys are reported separately')
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'vibe-math-vmu', 'kernel', 'records.js'), 'utf8')
  const missing = DECLARED_KEYS.filter((k) => !src.includes("'" + k + "'"))
  ok(missing.length === 0, 'standard: every declared key appears as a PLAIN LITERAL in the module (nothing hidden: ' + missing.join(',') + ')')
  ok(st.registry.declaredRecordsKeys >= 24 && Array.isArray(st.registry.undocumented), 'standard: the runtime registry is cross-checked read-only')
  ok(UNWIRED_REASONS && typeof UNWIRED_REASONS === 'object', 'standard: the unwired-reason table exists (empty because all 24 are wired)')
}

// ── 1. zero mechanism + refusal accounting + injected clock ──────────────────────────────────────────
{
  const c = fakeClock(7)
  const r = createRecords({ clock: c.clock, settings: S() })
  ok(r.list().count === 0 && r.list().available === 0, 'zero: an empty ledger lists nothing')
  ok(r.history().count === 0 && r.status().records.total === 0, 'zero: history and status are empty')
  ok(r.purge().purgedCount === 0, 'zero: purge() is a harmless no-op')
  throwsNamed(() => r.get({ id: 'r-404' }), 'VMU_NO_SUCH_OBJECT', 'zero: an unknown record is refused by name')
  throwsNamed(() => r.remove({ id: 'r-404' }), 'VMU_NO_SUCH_OBJECT', 'zero: removing an unknown record is refused')
  ok(r.status().refusals.VMU_NO_SUCH_OBJECT === 2, 'zero: refusals are counted by code')
  const one = put(r)
  ok(one.ok === true && one.id === 'r-1', 'clock: ids are deterministic (r-1)')
  ok(r.get({ id: one.id }).createdAt === 7, 'clock: createdAt comes from the injected clock only')
}

// ── 2. the 24 documented keys, one by one (positive AND negative) ────────────────────────────────────
{
  const c = fakeClock(0)
  // 1 · allowedKinds
  const kinds = createRecords({ clock: c.clock, settings: S({ 'vmu.records.allowedKinds': ['progress'] }) })
  ok(put(kinds, { kind: 'progress' }).ok === true, 'allowedKinds +: a declared kind is accepted')
  const e1 = throwsNamed(() => put(kinds, { kind: 'lesson' }), 'VMU_INVALID_ARGUMENT', 'allowedKinds −: an undeclared kind is refused')
  ok(!!e1 && /vmu\.records\.allowedKinds/.test(String(e1.hint)) && /progress/.test(String(e1.hint)), 'allowedKinds −: the refusal names the key and the allowed set')
  ok(kinds.status().refusals.VMU_INVALID_ARGUMENT === 1, 'allowedKinds: the refusal is counted')

  // 2 · headFields
  const heads = createRecords({ clock: c.clock, settings: S({ 'vmu.records.headFields': ['id', 'title'] }) })
  put(heads)
  const item = heads.list().items[0]
  ok(item && item.id !== undefined && item.title === 'task one', 'headFields +: the declared fields are projected')
  ok(item.owner === undefined && item.kind !== undefined, 'headFields: optional fields are trimmed, CORE fields stay')
  const e2 = throwsNamed(() => heads.list({ fields: ['title'] }), 'VMU_HEAD_FIELD_IMMUTABLE', 'headFields −: trimming a CORE head field is refused')
  ok(!!e2 && /id/.test(e2.message), 'headFields −: the refusal names the immutable field')
  ok(heads.list({ fields: CORE_HEAD_FIELDS.concat(['title']) }).count === 1, 'headFields +: a caller may keep the core fields')

  // 3 · bodyCapBytes (+ truncateMode / noticeStyle interplay is tested below)
  const capped = createRecords({ clock: c.clock, settings: S({ 'vmu.records.bodyCapBytes': 10 }) })
  const big = capped.put({ track: 'progress', kind: 'progress', title: 'big', body: 'x'.repeat(40), settled: true })
  ok(big.ok === true, 'bodyCapBytes +: an over-cap body is still accepted (the CAP truncates, it does not reject)')
  const got = capped.get({ id: big.id })
  ok(got.bodyTruncated === true && got.bodyDroppedBytes > 0 && got.bodyCapBytes === undefined, 'bodyCapBytes −: the read DISCLOSES the truncation and the dropped bytes')
  ok(/truncated/.test(String(got.bodyNotice)) && /30/.test(String(got.bodyNotice)), 'bodyCapBytes: the notice contains the COUNT (never silent)')
  ok(got.body.length <= 10, 'bodyCapBytes: the returned body respects the cap')
  const wide = createRecords({ clock: c.clock, settings: S({ 'vmu.records.bodyCapBytes': 32768 }) })
  const w = wide.put({ track: 'progress', kind: 'progress', title: 'wide', body: 'x'.repeat(40), settled: true })
  ok(wide.get({ id: w.id }).bodyTruncated === false, 'bodyCapBytes: a body inside the cap is returned whole')

  // 4 · expandThreshold
  const lazy = createRecords({ clock: c.clock, settings: S({ 'vmu.records.expandThreshold': 0 }) })
  const l = lazy.put({ track: 'progress', kind: 'progress', title: 'lazy', body: 'small', settled: true })
  ok(lazy.get({ id: l.id }).expanded === true, 'expandThreshold +: above the threshold the record is expanded on demand')
  const eager = createRecords({ clock: c.clock, settings: S({ 'vmu.records.expandThreshold': 999999 }) })
  const g = eager.put({ track: 'progress', kind: 'progress', title: 'eager', body: 'small', settled: true })
  ok(eager.get({ id: g.id }).expanded === false, 'expandThreshold −: below the threshold the head is returned inline')

  // 5 · head.maxItems (cap ⇒ named refusal with 现值/上限)
  const small = createRecords({ clock: c.clock, settings: S({ 'vmu.records.head.maxItems': 2 }) })
  put(small, { title: 'a', body: 'body a' }); put(small, { title: 'b', body: 'body b' })
  const e5 = throwsNamedE(() => put(small, { title: 'c', body: 'body c' }), 'VMU_QUOTA_EXCEEDED', 'head.maxItems −: exceeding the per-track cap is refused WITH enforced', ['vmu.records.head.maxItems'])
  ok(!!e5 && /2\/2/.test(e5.message) && /head\.maxItems/.test(String(e5.hint)), 'head.maxItems −: the refusal gives 现值/上限 and names the key')
  ok(small.list().count === 2, 'head.maxItems: nothing was evicted silently')

  // 6 · head.sort
  const sortA = createRecords({ clock: c.clock, settings: S({ 'vmu.records.head.sort': 'title' }) })
  sortA.put({ track: 'progress', kind: 'progress', title: 'zulu', body: '1', settled: true })
  c.advance(10)
  sortA.put({ track: 'progress', kind: 'progress', title: 'alpha', body: '2', settled: true })
  ok(sortA.list().items.map((x) => x.title).join(',') === 'alpha,zulu', 'head.sort: title ordering is honoured')
  const sortU = createRecords({ clock: c.clock, settings: S({ 'vmu.records.head.sort': 'updatedAt' }) })
  sortU.put({ track: 'progress', kind: 'progress', title: 'zulu', body: '1', settled: true })
  c.advance(10)
  sortU.put({ track: 'progress', kind: 'progress', title: 'alpha', body: '2', settled: true })
  ok(sortU.list().items.map((x) => x.title).join(',') === 'zulu,alpha', 'head.sort: updatedAt ordering differs (the knob changes behaviour)')

  // 7 · body.noticeStyle
  const shortNote = createRecords({ clock: c.clock, settings: S({ 'vmu.records.body.noticeStyle': 'short', 'vmu.records.bodyCapBytes': 4 }) })
  const sn = shortNote.put({ track: 'progress', kind: 'progress', title: 'n', body: 'abcdefghij', settled: true })
  const shortText = shortNote.get({ id: sn.id }).bodyNotice
  ok(/truncated/.test(shortText) && shortText.length < 80, 'noticeStyle: the SHORT notice is one line and still carries the count')
  const detailed = createRecords({ clock: c.clock, settings: S({ 'vmu.records.body.noticeStyle': 'detailed', 'vmu.records.bodyCapBytes': 4 }) })
  const dn = detailed.put({ track: 'progress', kind: 'progress', title: 'n', body: 'abcdefghij', settled: true })
  const detailText = detailed.get({ id: dn.id }).bodyNotice
  ok(/mode=/.test(detailText) && detailText.length > shortText.length, 'noticeStyle: the DETAILED notice adds the mode (a different observable string)')

  // 8 · body.chunkedReturn (+ threshold/chunk size)
  const chunked = createRecords({ clock: c.clock, settings: S({ 'vmu.records.body.chunkedReturn': true, 'vmu.records.chunk.thresholdBytes': 1, 'vmu.records.chunk.chunkBytes': 4, 'vmu.records.bodyCapBytes': 1000 }) })
  const ch = chunked.put({ track: 'progress', kind: 'progress', title: 'c', body: 'abcdefghijkl', settled: true })
  const cg = chunked.get({ id: ch.id })
  ok(cg.bodyMode === 'chunked' && Array.isArray(cg.bodyChunks) && cg.bodyChunks.length === 3, 'chunkedReturn +: a large body is returned in chunks')
  ok(cg.body === null, 'chunkedReturn: the inline body is not duplicated when chunked')
  const inline = createRecords({ clock: c.clock, settings: S({ 'vmu.records.body.chunkedReturn': false, 'vmu.records.bodyCapBytes': 1000 }) })
  const il = inline.put({ track: 'progress', kind: 'progress', title: 'c', body: 'abcdefghijkl', settled: true })
  ok(inline.get({ id: il.id }).bodyMode === 'inline', 'chunkedReturn −: with the knob off the body stays inline')

  // 9 · naming.slugPolicy
  const ascii = createRecords({ clock: c.clock, settings: S({ 'vmu.records.naming.slugPolicy': 'ascii' }) })
  const as = ascii.put({ track: 'progress', kind: 'progress', title: '路线图', body: 'x', settled: true })
  ok(as.slug === 'record', 'slugPolicy ascii: a pure-CJK title falls back to the neutral slug')
  const cjk = createRecords({ clock: c.clock, settings: S({ 'vmu.records.naming.slugPolicy': 'cjk-keep' }) })
  const ck = cjk.put({ track: 'progress', kind: 'progress', title: '路线图', body: 'x', settled: true })
  ok(ck.slug === '路线图', 'slugPolicy cjk-keep: the Han characters are kept (different behaviour)')

  // 10 · naming.maxLength
  const shortSlug = createRecords({ clock: c.clock, settings: S({ 'vmu.records.naming.maxLength': 5 }) })
  const ss = shortSlug.put({ track: 'progress', kind: 'progress', title: 'abcdefghijk', body: 'x', settled: true })
  ok(ss.slug.length === 5 && shortSlug.status().counters.slugTruncated === 1, 'maxLength: the slug is capped AND the truncation is counted')
  const longSlug = createRecords({ clock: c.clock, settings: S({ 'vmu.records.naming.maxLength': 80 }) })
  ok(longSlug.put({ track: 'progress', kind: 'progress', title: 'abcdefghijk', body: 'x', settled: true }).slug === 'abcdefghijk', 'maxLength: a slug inside the cap is untouched')

  // 11 · naming.conflictSuffix
  // 11b · enforced 去重（批评者第 12 轮：`naming.maxLength` 触界时同一键曾出现两次 ✗ ⇒ 必须唯一 ✓）
  {
    const dup = createRecords({ clock: c.clock, settings: S({ 'vmu.records.naming.maxLength': 8 }) })
    const r = dup.put({ track: 'progress', kind: 'progress', title: 'a-very-long-title-that-truncates', body: 'x', settled: true })
    const list = Array.isArray(r.enforced) ? r.enforced : []
    ok(new Set(list).size === list.length, 'enforced must never contain the same key twice (got ' + JSON.stringify(list) + ')')
    ok(list.includes('vmu.records.naming.maxLength'), 'a truncation ⇒ maxLength is listed')
    ok(list.filter((k) => k === 'vmu.records.naming.maxLength').length === 1, 'maxLength appears exactly once')
  }
  const suf = createRecords({ clock: c.clock, settings: S({ 'vmu.records.naming.conflictSuffix': '-2' }) })
  suf.put({ track: 'progress', kind: 'progress', title: 'same', body: 'one', settled: true })
  const s2 = suf.put({ track: 'progress', kind: 'progress', title: 'same', body: 'two', settled: true })
  ok(s2.slug === 'same-2' && suf.status().counters.slugConflicts === 1, 'conflictSuffix: the second record gets the template suffix and the conflict is counted')
  const s3 = suf.put({ track: 'progress', kind: 'progress', title: 'same', body: 'three', settled: true })
  ok(s3.slug === 'same-3', 'conflictSuffix: the template increments (-3)')
  const custom = createRecords({ clock: c.clock, settings: S({ 'vmu.records.naming.conflictSuffix': '_v' }) })
  custom.put({ track: 'progress', kind: 'progress', title: 'same', body: 'one', settled: true })
  ok(custom.put({ track: 'progress', kind: 'progress', title: 'same', body: 'two', settled: true }).slug === 'same_v', 'conflictSuffix: a numeric template is replaced (different behaviour)')

  // 12 · retention.keepEvery
  const keep = createRecords({ clock: c.clock, settings: S({ 'vmu.records.retention.keepEvery': 2 }) })
  const kr = keep.put({ track: 'progress', kind: 'progress', title: 'k', body: 'v0', settled: true })
  for (let i = 1; i <= 4; i++) { c.advance(1); keep.supersede({ id: kr.id, reason: 'rev ' + i, body: 'v' + i }) }
  ok(keep.history({ id: kr.id }).available === 4, 'keepEvery: four versions exist before compaction')
  const comp = keep.compact({ track: 'progress' })
  ok(comp.prunedVersionCount > 0 && keep.history({ id: kr.id }).available < 4, 'keepEvery: compaction prunes versions (keep every Nth)')
  ok(keep.status().counters.versionsPruned === comp.prunedVersionCount, 'keepEvery: the pruning is COUNTED')
  const keepAll = createRecords({ clock: c.clock, settings: S({ 'vmu.records.retention.keepEvery': 1 }) })
  const ka = keepAll.put({ track: 'progress', kind: 'progress', title: 'k', body: 'v0', settled: true })
  keepAll.supersede({ id: ka.id, reason: 'r', body: 'v1' })
  ok(keepAll.compact({ track: 'progress' }).prunedVersionCount === 0, 'keepEvery=1: nothing is pruned (documented as "keep everything")')

  // 13 · retention.permanentMarker
  const perm = createRecords({ clock: c.clock, settings: S({ 'vmu.records.retention.permanentMarker': 'locked' }) })
  const pr = perm.put({ track: 'progress', kind: 'progress', title: 'p', body: 'x', settled: true, tags: ['locked'] })
  const e13 = throwsNamed(() => perm.remove({ id: pr.id, by: 'office', reason: 'cleanup' }), 'VMU_RETENTION_CONFLICT', 'permanentMarker −: a marked record cannot be removed')
  ok(!!e13 && /locked/.test(e13.message), 'permanentMarker −: the refusal names the marker')
  ok(perm.get({ id: pr.id }).status === 'live', 'permanentMarker: the record is still there')
  const plain = perm.put({ track: 'progress', kind: 'progress', title: 'plain', body: 'y', settled: true })
  ok(perm.remove({ id: plain.id, by: 'office', reason: 'cleanup' }).state === 'trashed', 'permanentMarker +: an unmarked record can be trashed')

  // 14 · retention.maxBytes
  const quota = createRecords({ clock: c.clock, settings: S({ 'vmu.records.retention.maxBytes': 10, 'vmu.records.trash.countInQuota': false }) })
  ok(quota.put({ track: 'progress', kind: 'progress', title: 'q1', body: '12345', settled: true }).ok === true, 'maxBytes +: a record inside the budget is accepted')
  const e14 = throwsNamedE(() => quota.put({ track: 'progress', kind: 'progress', title: 'q2', body: '123456', settled: true }), 'VMU_QUOTA_EXCEEDED', 'maxBytes −: exceeding the track budget is refused', ['vmu.records.retention.maxBytes'])
  ok(!!e14 && /10/.test(e14.message) && /retention\.maxBytes/.test(String(e14.hint)), 'maxBytes −: the refusal gives 现值/上限 and names the key')

  // 15 · retention.tierThreshold
  const tier = createRecords({ clock: c.clock, settings: S({ 'vmu.records.retention.tierThreshold': 100 }) })
  const tr = tier.put({ track: 'progress', kind: 'progress', title: 't', body: 'x', settled: true })
  ok(tier.get({ id: tr.id }).tier === 'hot', 'tierThreshold: a fresh record is hot')
  c.advance(150)
  ok(tier.get({ id: tr.id }).tier === 'cold' && tier.status().records.cold === 1, 'tierThreshold +: a record past the threshold becomes cold (and is counted)')
  const noTier = createRecords({ clock: c.clock, settings: S({ 'vmu.records.retention.tierThreshold': 0 }) })
  const nt = noTier.put({ track: 'progress', kind: 'progress', title: 't', body: 'x', settled: true })
  c.advance(100000)
  ok(noTier.get({ id: nt.id }).tier === 'hot', 'tierThreshold=0: no tiering at all')

  // 16 · trash.retainDays
  const trash = createRecords({ clock: c.clock, settings: S({ 'vmu.records.trash.retainDays': 1 }) })
  const td = put(trash)
  trash.remove({ id: td.id, by: 'office', reason: 'done' })
  ok(trash.purge().purgedCount === 0, 'retainDays: nothing is purged before the retention days pass')
  c.advance(2 * 86400000)
  const pg = trash.purge()
  ok(pg.purgedCount === 1 && pg.retainDays === 1, 'retainDays +: expired trash is purged after the configured days')
  throwsNamed(() => trash.get({ id: td.id }), 'VMU_NO_SUCH_OBJECT', 'retainDays: the purged record is really gone (only after the window)')
  const longTrash = createRecords({ clock: c.clock, settings: S({ 'vmu.records.trash.retainDays': 30 }) })
  const lt = put(longTrash)
  longTrash.remove({ id: lt.id, by: 'office', reason: 'done' })
  c.advance(2 * 86400000)
  ok(longTrash.purge().purgedCount === 0, 'retainDays −: a longer window keeps the record recoverable')

  // 17 · trash.autoPurge
  const auto = createRecords({ clock: c.clock, settings: S({ 'vmu.records.trash.autoPurge': true, 'vmu.records.trash.retainDays': 0 }) })
  const au = put(auto)
  const rem = auto.remove({ id: au.id, by: 'office', reason: 'done' })
  ok(rem.autoPurged === 1, 'autoPurge +: removal purges immediately-expired trash by itself')
  const manual = createRecords({ clock: c.clock, settings: S({ 'vmu.records.trash.autoPurge': false, 'vmu.records.trash.retainDays': 0 }) })
  const ma = put(manual)
  ok(manual.remove({ id: ma.id, by: 'office', reason: 'done' }).autoPurged === 0 && manual.purge().purgedCount === 1, 'autoPurge −: with the knob off the purge must be asked for')

  // 18 · trash.countInQuota
  const counted = createRecords({ clock: c.clock, settings: S({ 'vmu.records.retention.maxBytes': 10, 'vmu.records.trash.countInQuota': true }) })
  const cq = counted.put({ track: 'progress', kind: 'progress', title: 'q', body: '12345', settled: true })
  counted.remove({ id: cq.id, by: 'office', reason: 'trash' })
  const e18 = throwsNamed(() => counted.put({ track: 'progress', kind: 'progress', title: 'q2', body: '123456', settled: true }), 'VMU_QUOTA_EXCEEDED', 'countInQuota +: trashed bytes still count against the budget')
  ok(!!e18 && /countInQuota=true/.test(String(e18.hint)), 'countInQuota +: the refusal explains the accounting rule')
  const uncounted = createRecords({ clock: c.clock, settings: S({ 'vmu.records.retention.maxBytes': 10, 'vmu.records.trash.countInQuota': false }) })
  const uq = uncounted.put({ track: 'progress', kind: 'progress', title: 'q', body: '12345', settled: true })
  uncounted.remove({ id: uq.id, by: 'office', reason: 'trash' })
  ok(uncounted.put({ track: 'progress', kind: 'progress', title: 'q2', body: '123456', settled: true }).ok === true, 'countInQuota −: with the knob off the same write is accepted (different behaviour)')

  // 19 · history.depth
  const shallow = createRecords({ clock: c.clock, settings: S({ 'vmu.records.history.depth': 2 }) })
  const sh = shallow.put({ track: 'progress', kind: 'progress', title: 'h', body: 'v0', settled: true })
  for (let i = 1; i <= 4; i++) shallow.supersede({ id: sh.id, reason: 'r' + i, body: 'v' + i })
  ok(shallow.history({ id: sh.id }).available === 2 && shallow.status().counters.versionsPruned === 2, 'history.depth +: only the newest N versions are kept and the pruned ones are COUNTED')
  const deep = createRecords({ clock: c.clock, settings: S({ 'vmu.records.history.depth': 0 }) })
  const dp = deep.put({ track: 'progress', kind: 'progress', title: 'h', body: 'v0', settled: true })
  for (let i = 1; i <= 4; i++) deep.supersede({ id: dp.id, reason: 'r' + i, body: 'v' + i })
  ok(deep.history({ id: dp.id }).available === 4 && deep.status().counters.versionsPruned === 0, 'history.depth=0: nothing is pruned (documented as "keep all")')

  // 20 · history.storeMode
  const diff = createRecords({ clock: c.clock, settings: S({ 'vmu.records.history.storeMode': 'diff' }) })
  const dr = diff.put({ track: 'progress', kind: 'progress', title: 'h', body: 'v0', settled: true })
  diff.supersede({ id: dr.id, reason: 'change', body: 'v1' })
  const drow = diff.history({ id: dr.id }).versions[0]
  ok(drow.mode === 'diff' && drow.changed && drow.snapshot === null, 'storeMode diff: versions store the CHANGED fields')
  const full = createRecords({ clock: c.clock, settings: S({ 'vmu.records.history.storeMode': 'full' }) })
  const fr = full.put({ track: 'progress', kind: 'progress', title: 'h', body: 'v0', settled: true })
  full.supersede({ id: fr.id, reason: 'change', body: 'v1' })
  const frow = full.history({ id: fr.id }).versions[0]
  ok(frow.snapshot && frow.snapshot.body === 'v0' && frow.changed === null, 'storeMode full: versions store a SNAPSHOT instead')

  // 21 · chunk.thresholdBytes
  const thr = createRecords({ clock: c.clock, settings: S({ 'vmu.records.body.chunkedReturn': true, 'vmu.records.chunk.thresholdBytes': 100, 'vmu.records.chunk.chunkBytes': 4 }) })
  const th = thr.put({ track: 'progress', kind: 'progress', title: 'c', body: 'abcdefghij', settled: true })
  ok(thr.get({ id: th.id }).bodyMode === 'inline', 'chunk.thresholdBytes −: below the threshold nothing is chunked')
  const thr2 = createRecords({ clock: c.clock, settings: S({ 'vmu.records.body.chunkedReturn': true, 'vmu.records.chunk.thresholdBytes': 2, 'vmu.records.chunk.chunkBytes': 4 }) })
  const th2 = thr2.put({ track: 'progress', kind: 'progress', title: 'c', body: 'abcdefghij', settled: true })
  ok(thr2.get({ id: th2.id }).bodyMode === 'chunked', 'chunk.thresholdBytes +: above the threshold it is chunked')

  // 22 · chunk.chunkBytes
  const size4 = createRecords({ clock: c.clock, settings: S({ 'vmu.records.body.chunkedReturn': true, 'vmu.records.chunk.thresholdBytes': 1, 'vmu.records.chunk.chunkBytes': 4 }) })
  const x4 = size4.put({ track: 'progress', kind: 'progress', title: 'c', body: 'abcdefghijkl', settled: true })
  ok(size4.get({ id: x4.id }).bodyChunks.length === 3, 'chunk.chunkBytes: a 4-byte chunk size yields 3 chunks for 12 bytes')
  const size100 = createRecords({ clock: c.clock, settings: S({ 'vmu.records.body.chunkedReturn': true, 'vmu.records.chunk.thresholdBytes': 1, 'vmu.records.chunk.chunkBytes': 100 }) })
  const x100 = size100.put({ track: 'progress', kind: 'progress', title: 'c', body: 'abcdefghijkl', settled: true })
  ok(size100.get({ id: x100.id }).bodyChunks.length === 1, 'chunk.chunkBytes: a larger chunk size yields one chunk (different behaviour)')

  // 23 · external.allowedSchemes
  const schemes = createRecords({ clock: c.clock, settings: S({ 'vmu.records.external.allowedSchemes': ['file'] }), exists: () => true })
  const sc = put(schemes)
  ok(schemes.attachExternal({ id: sc.id, uri: 'file:///tmp/x', by: 'office' }).verified === true, 'allowedSchemes +: an allowed scheme is attached and verified')
  const e23 = throwsNamed(() => schemes.attachExternal({ id: sc.id, uri: 'http://example.org/x' }), 'VMU_EXTERNAL_DISABLED', 'allowedSchemes −: a disallowed scheme is refused by name')
  ok(!!e23 && /file/.test(String(e23.hint)), 'allowedSchemes −: the refusal lists the allowed schemes')
  throwsNamed(() => schemes.attachExternal({ id: sc.id, uri: 'no-scheme' }), 'VMU_EXTERNAL_QUERY_INVALID', 'allowedSchemes: a schemeless reference is refused')

  // 24 · external.verifyExists
  const verifying = createRecords({ clock: c.clock, settings: S({ 'vmu.records.external.verifyExists': true }), exists: () => false })
  const vf = put(verifying)
  const e24 = throwsNamed(() => verifying.attachExternal({ id: vf.id, uri: 'file:///missing' }), 'VMU_EXTERNAL_UNAVAILABLE', 'verifyExists +: a reference that does not exist is refused')
  ok(!!e24 && /verifyExists/.test(String(e24.hint)), 'verifyExists +: the refusal names the key')
  const noSeam = createRecords({ clock: c.clock, settings: S({ 'vmu.records.external.verifyExists': true }) })
  const ns = put(noSeam)
  const att = noSeam.attachExternal({ id: ns.id, uri: 'file:///maybe' })
  ok(att.verified === null && noSeam.status().unwired['external-seam'] >= 1, 'verifyExists: without a seam verification is DISCLOSED as impossible (counted, never pretended)')
  const off = createRecords({ clock: c.clock, settings: S({ 'vmu.records.external.verifyExists': false }) })
  const of_ = put(off)
  ok(off.attachExternal({ id: of_.id, uri: 'file:///whatever' }).verified === null, 'verifyExists −: with verification off the reference is attached unverified')
}

// ── 3. the 7 extra registered core keys also change behaviour ────────────────────────────────────────
{
  const c = fakeClock(0)
  // tracks
  const t = createRecords({ clock: c.clock, settings: S({ 'vmu.records.tracks': ['progress'] }) })
  ok(put(t).ok === true, 'tracks +: a declared track accepts records')
  const e1 = throwsNamed(() => put(t, { track: 'routes' }), 'VMU_INVALID_ARGUMENT', 'tracks −: an undeclared track is refused')
  ok(!!e1 && /vmu\.records\.tracks/.test(String(e1.hint)), 'tracks −: the refusal names the key')
  // headListAt
  const hl = createRecords({ clock: c.clock, settings: S({ 'vmu.records.headListAt': 3 }) })
  for (let i = 0; i < 5; i++) put(hl, { title: 'x' + i, body: 'body ' + i })
  const l3 = hl.list()
  ok(l3.count === 3 && l3.dropped === 2 && l3.truncated === true, 'headListAt +: the head list is capped and the DROPPED rows are counted')
  ok(hl.list({ limit: 0 }).count === 5, 'headListAt: limit 0 means "all" (documented)')
  const hlAll = createRecords({ clock: c.clock, settings: S({ 'vmu.records.headListAt': 0 }) })
  for (let i = 0; i < 5; i++) put(hlAll, { title: 'x' + i, body: 'body ' + i })
  ok(hlAll.list().count === 5, 'headListAt=0: no cap at all')
  // truncateMode
  const mk = (mode) => { const r = createRecords({ clock: c.clock, settings: S({ 'vmu.records.truncateMode': mode, 'vmu.records.bodyCapBytes': 4 }) }); const rec = r.put({ track: 'progress', kind: 'progress', title: 't', body: 'abcdefghij', settled: true }); return r.get({ id: rec.id }).body }
  const keepChars = mk('keepChars')
  const keepHeadTail = mk('keepHeadTail')
  const dropMiddle = mk('dropMiddle')
  ok(keepChars !== keepHeadTail || keepHeadTail !== dropMiddle, 'truncateMode: the truncation SHAPE changes the returned body')
  ok(keepChars.length <= 4 && keepHeadTail.length <= 4 && dropMiddle.length <= 4, 'truncateMode: every mode respects the byte cap')
  // fingerprintPolicy
  const contentOnly = createRecords({ clock: c.clock, settings: S({ 'vmu.records.fingerprintPolicy': 'content-only' }) })
  const a1 = contentOnly.put({ track: 'progress', kind: 'progress', title: 'first title', body: 'same body', settled: true })
  const a2 = contentOnly.put({ track: 'progress', kind: 'progress', title: 'other title', body: 'same body', settled: true })
  ok(a2.deduplicated === true && a2.id === a1.id && contentOnly.status().counters.deduplicated === 1, 'fingerprintPolicy content-only: the same body deduplicates (COUNTED, not re-added)')
  const withDisplay = createRecords({ clock: c.clock, settings: S({ 'vmu.records.fingerprintPolicy': 'content+display' }) })
  const b1 = withDisplay.put({ track: 'progress', kind: 'progress', title: 'first title', body: 'same body', settled: true })
  const b2 = withDisplay.put({ track: 'progress', kind: 'progress', title: 'other title', body: 'same body', settled: true })
  ok(b2.deduplicated === false && b2.id !== b1.id, 'fingerprintPolicy content+display: the display head participates, so both records exist')
  ok(contentOnly.get({ id: a1.id }).fingerprintOk === true, 'fingerprint: the stored fingerprint can be RE-COMPUTED and verified on read')
  // requireSettledRecords
  const strict = createRecords({ clock: c.clock, settings: { 'vmu.records.requireSettledRecords': true } })
  const e2 = throwsNamed(() => strict.put({ track: 'progress', kind: 'progress', title: 'x', body: 'y' }), 'VMU_STATE', 'requireSettledRecords +: an unsettled write is refused')
  ok(!!e2 && /requireSettledRecords/.test(String(e2.hint)), 'requireSettledRecords +: the refusal names the key')
  ok(strict.put({ track: 'progress', kind: 'progress', title: 'x', body: 'y', settled: true }).ok === true, 'requireSettledRecords: a settled write passes')
  const loose = createRecords({ clock: c.clock, settings: S({ 'vmu.records.requireSettledRecords': false }) })
  ok(loose.put({ track: 'progress', kind: 'progress', title: 'x', body: 'y' }).ok === true, 'requireSettledRecords −: with the knob off the write passes')
  // pointerPropagation
  const muted = createRecords({ clock: c.clock, settings: S({ 'vmu.records.pointerPropagation': false }) })
  put(muted)
  const ml = muted.list()
  ok(ml.suppressed === true && ml.items.length === 0 && ml.available === 1, 'pointerPropagation −: the head list is muted (zero injection) but the corpus is disclosed')
  const normal = createRecords({ clock: c.clock, settings: S({ 'vmu.records.pointerPropagation': true }) })
  put(normal)
  ok(normal.list().suppressed === false && normal.list().count === 1, 'pointerPropagation +: the head list is the default channel')
  // meetingKeepEvery
  const meetings = createRecords({ clock: c.clock, settings: S({ 'vmu.records.tracks': ['meetings'], 'vmu.records.meetingKeepEvery': 2, 'vmu.records.retention.keepEvery': 100 }) })
  for (let i = 0; i < 5; i++) { c.advance(1); meetings.put({ track: 'meetings', kind: 'progress', title: 'm' + i, body: 'b' + i, settled: true }) }
  const mc = meetings.compact({ track: 'meetings' })
  ok(mc.archivedCount > 0 && meetings.list().count < 5, 'meetingKeepEvery: every Nth meeting is kept as the archive and the rest are COUNTED away')
  ok(mc.fired.includes('vmu.records.meetingKeepEvery'), 'meetingKeepEvery: the receipt says the meeting knob governed this compaction')
}

// ── 4. `enforced[]` vs `fired[]`: "read" and "took effect" are distinguishable ───────────────────────
{
  const c = fakeClock(0)
  const r = createRecords({ clock: c.clock, settings: S({ 'vmu.records.bodyCapBytes': 4, 'vmu.records.naming.conflictSuffix': '-2' }) })
  const a = put(r, { title: 'plain', body: 'tiny' })
  ok(Array.isArray(a.enforced) && a.enforced.length >= 5, 'enforced: a put receipt lists the keys whose rules were EVALUATED')
  ok(a.enforced.includes('vmu.records.tracks') && a.enforced.includes('vmu.records.allowedKinds'), 'enforced: the evaluated keys are named')
  ok(a.fired.length === 0, 'fired: a plain accepted write fired nothing (no knob changed the outcome)')
  const big = put(r, { title: 'big', body: 'abcdefgh' })
  ok(big.fired.includes('vmu.records.bodyCapBytes'), 'fired: the body cap fired for an over-cap write')
  const dup = put(r, { title: 'plain', body: 'tiny' })
  ok(dup.fired.includes('vmu.records.fingerprintPolicy') && dup.deduplicated === true, 'fired: the fingerprint policy fired for a duplicate')
  const conflict = put(r, { title: 'plain', body: 'different' })
  ok(conflict.fired.includes('vmu.records.naming.conflictSuffix'), 'fired: the conflict suffix fired on a slug clash')
  const universe = new Set(WIRED_KEYS.concat(EXTRA_WIRED_KEYS))
  ok(a.enforced.concat(big.fired, dup.fired, conflict.fired).every((k) => universe.has(k)), 'enforced/fired: every listed key is a wired key (no invented names)')
  const listed = r.list()
  ok(listed.enforced.includes('vmu.records.head.sort') && listed.enforced.includes('vmu.records.headListAt'), 'enforced: the list receipt names the ordering and cap keys it evaluated')
}

// ── 5. counting discipline, read-only purity, determinism, seams ─────────────────────────────────────
{
  const c = fakeClock(0)
  const log = fakeLog()
  const bus = fakeBus()
  const r = createRecords({ clock: c.clock, log, settings: S(), bus })
  const a = put(r)
  ok(bus.topics.includes('records/put') && bus.rows.some((x) => x.hook === 'records/put' && x.payload.id === a.id), 'bus: records/put is declared and emitted')
  ok(log.rows.some((x) => x.type === 'records/put'), 'log: the write is audited')
  const broken = createRecords({ clock: c.clock, settings: S(), bus: fakeBus({ throwOnEmit: true }) })
  put(broken)
  ok(broken.status().unwired['bus:records/put'] === 1, 'bus: a broken bus is a COUNTED wiring gap')
  // truncation counts
  const trunc = createRecords({ clock: c.clock, settings: S({ 'vmu.records.headListAt': 1 }) })
  put(trunc, { title: 'a', body: 'body a' }); put(trunc, { title: 'bb', body: 'body bb' }); put(trunc, { title: 'ccc', body: 'body ccc' })
  const tl = trunc.list()
  ok(tl.dropped === 2 && tl.available === 3, 'counting: list truncation reports dropped/available (never silent)')
  const hTarget = put(trunc, { title: 'hist', body: 'h0' })
  trunc.supersede({ id: hTarget.id, reason: 'r1', body: 'h1' })
  trunc.supersede({ id: hTarget.id, reason: 'r2', body: 'h2' })
  const h = trunc.history({ limit: 1 })
  ok(h.available === 2 && h.dropped === 1 && h.truncated === true, 'counting: the history ring reports its drops')
  // read-only purity
  const before = JSON.stringify(r.list()) + '|' + JSON.stringify(r.status()) + '|' + JSON.stringify(r.get({ id: a.id })) + '|' + JSON.stringify(r.history())
  for (let i = 0; i < 3; i++) { r.list(); r.status(); r.get({ id: a.id }); r.history(); r.externals({ id: a.id }) }
  const after = JSON.stringify(r.list()) + '|' + JSON.stringify(r.status()) + '|' + JSON.stringify(r.get({ id: a.id })) + '|' + JSON.stringify(r.history())
  ok(before === after, 'read-only: list/status/get/history/externals never mutate the ledger')
  // determinism
  const build = () => { const cc = fakeClock(5); const x = createRecords({ clock: cc.clock, settings: S() }); x.put({ track: 'progress', kind: 'progress', title: 't', body: 'b', settled: true }); return x }
  const x1 = build(); const x2 = build()
  ok(JSON.stringify(x1.list()) === JSON.stringify(x2.list()), 'determinism: two ledgers agree on list()')
  ok(JSON.stringify(x1.status()) === JSON.stringify(x2.status()), 'determinism: two ledgers agree on status()')
  ok(x1.get({ id: 'r-1' }).fingerprint === x2.get({ id: 'r-1' }).fingerprint, 'determinism: fingerprints are stable across instances')
  ok(refuse('X', 'y', 'z').code === 'X' && refuse('X', 'y', 'z').hint === 'z', 'refuse(): the named-error helper keeps code/hint')
  ok(slugify('Hello World', 'ascii', 80).slug === 'hello-world' && chunkBody('abcd', 2).length === 2, 'helpers: slugify/chunkBody are exported and deterministic')
  ok(r.status().note.includes('enforced') && r.status().note.includes('fired'), 'status: the note explains the enforced/fired contract')
}

// ── 6. every refusal path carries `enforced`, and no receipt anywhere has duplicates ─────────────────
{
  const c = fakeClock(0)
  const S2 = (extra = {}) => Object.assign({ 'vmu.records.requireSettledRecords': false }, extra)
  const universe = new Set(WIRED_KEYS.concat(EXTRA_WIRED_KEYS))
  const check = (e, label, must = []) => {
    if (!e) { failed += 1; console.log('FAIL enforced: ' + label + ' (no refusal)'); return null }
    ok(Array.isArray(e && e.enforced), 'enforced: ' + label + ' carries an ARRAY (never undefined)')
    ok(!!e && e.enforced.every((k) => universe.has(k)), 'enforced: ' + label + ' lists only wired keys')
    ok(!!e && new Set(e.enforced).size === e.enforced.length, 'enforced: ' + label + ' has no duplicates')
    if (must.length) ok(must.every((k) => e.enforced.includes(k)), 'enforced: ' + label + ' names the key that fired (' + must.join(',') + ')')
    return e
  }
  // the two items the C2 gate named, checked explicitly once more
  const q = createRecords({ clock: c.clock, settings: S2({ 'vmu.records.head.maxItems': 1 }) })
  put(q, { title: 'a', body: 'body a' })
  check(throwsNamedE(() => put(q, { title: 'b', body: 'body b' }), 'VMU_QUOTA_EXCEEDED', 'sweep: put ⇒ quota'), 'put(quota)', ['vmu.records.head.maxItems'])
  const rq = createRecords({ clock: c.clock, settings: S2() })
  const rec0 = put(rq, { body: 'body' })
  check(throwsNamedE(() => rq.remove({ id: rec0.id, reason: 'no actor' }), 'VMU_INVALID_ARGUMENT', 'sweep: remove ⇒ no by'), 'remove(no by)', ['vmu.records.trash.retainDays'])

  // the 22 refusal sites of the module, one by one
  const t1 = createRecords({ clock: c.clock, settings: S2({ 'vmu.records.tracks': ['progress'] }) })
  check(throwsNamedE(() => put(t1, { track: 'routes', body: 'x' }), 'VMU_INVALID_ARGUMENT', 'sweep: tracks'), 'put(bad track)', ['vmu.records.tracks'])
  const t2 = createRecords({ clock: c.clock, settings: { 'vmu.records.requireSettledRecords': true } })
  check(throwsNamedE(() => t2.put({ track: 'progress', kind: 'progress', title: 'x', body: 'y' }), 'VMU_STATE', 'sweep: requireSettled'), 'put(unsettled)', ['vmu.records.requireSettledRecords'])
  const t3 = createRecords({ clock: c.clock, settings: S2({ 'vmu.records.allowedKinds': ['progress'] }) })
  check(throwsNamedE(() => put(t3, { kind: 'lesson', body: 'x' }), 'VMU_INVALID_ARGUMENT', 'sweep: allowedKinds'), 'put(bad kind)', ['vmu.records.allowedKinds'])
  const t4 = createRecords({ clock: c.clock, settings: S2({ 'vmu.records.retention.maxBytes': 3, 'vmu.records.trash.countInQuota': false }) })
  check(throwsNamedE(() => put(t4, { body: 'abcdefgh' }), 'VMU_QUOTA_EXCEEDED', 'sweep: maxBytes'), 'put(bytes quota)', ['vmu.records.retention.maxBytes'])
  const t5 = createRecords({ clock: c.clock, settings: S2() })
  check(throwsNamedE(() => t5.get({ id: 'r-404' }), 'VMU_NO_SUCH_OBJECT', 'sweep: get'), 'get(unknown)')
  check(throwsNamedE(() => t5.list({ track: 'nope' }), 'VMU_INVALID_ARGUMENT', 'sweep: list track'), 'list(bad track)', ['vmu.records.tracks'])
  check(throwsNamedE(() => t5.list({ fields: ['title'] }), 'VMU_HEAD_FIELD_IMMUTABLE', 'sweep: head fields'), 'list(core trimmed)', ['vmu.records.headFields'])
  check(throwsNamedE(() => t5.supersede({ id: 'r-404', reason: 'x' }), 'VMU_NO_SUCH_OBJECT', 'sweep: supersede id'), 'supersede(unknown)')
  const sup = put(t5, { body: 'v0' })
  check(throwsNamedE(() => t5.supersede({ id: sup.id }), 'VMU_REASON_REQUIRED', 'sweep: supersede reason'), 'supersede(no reason)', ['vmu.records.history.storeMode'])
  check(throwsNamedE(() => t5.remove({ id: 'r-404', by: 'office' }), 'VMU_NO_SUCH_OBJECT', 'sweep: remove id'), 'remove(unknown)')
  const perm = createRecords({ clock: c.clock, settings: S2({ 'vmu.records.retention.permanentMarker': 'locked' }) })
  const prec = perm.put({ track: 'progress', kind: 'progress', title: 'p', body: 'x', settled: true, tags: ['locked'] })
  check(throwsNamedE(() => perm.remove({ id: prec.id, by: 'office', reason: 'x' }), 'VMU_RETENTION_CONFLICT', 'sweep: permanent'), 'remove(permanent)', ['vmu.records.retention.permanentMarker'])
  check(throwsNamedE(() => t5.purge({ at: 'soon' }), 'VMU_INVALID_ARGUMENT', 'sweep: purge at'), 'purge(bad at)', ['vmu.records.trash.retainDays'])
  check(throwsNamedE(() => t5.restore({ id: 'r-404' }), 'VMU_NO_SUCH_OBJECT', 'sweep: restore id'), 'restore(unknown)')
  check(throwsNamedE(() => t5.restore({ id: sup.id }), 'VMU_STATE', 'sweep: restore state'), 'restore(live)')
  check(throwsNamedE(() => t5.compact({ track: 'nope' }), 'VMU_INVALID_ARGUMENT', 'sweep: compact track'), 'compact(bad track)', ['vmu.records.retention.keepEvery'])
  check(throwsNamedE(() => t5.attachExternal({ id: 'r-404', uri: 'file:///x' }), 'VMU_NO_SUCH_OBJECT', 'sweep: external id'), 'attachExternal(unknown)')
  check(throwsNamedE(() => t5.attachExternal({ id: sup.id, uri: 'no-scheme' }), 'VMU_EXTERNAL_QUERY_INVALID', 'sweep: external scheme missing'), 'attachExternal(schemeless)', ['vmu.records.external.allowedSchemes'])
  const sc = createRecords({ clock: c.clock, settings: S2({ 'vmu.records.external.allowedSchemes': ['file'] }), exists: () => true })
  const screc = put(sc, { body: 'z' })
  check(throwsNamedE(() => sc.attachExternal({ id: screc.id, uri: 'http://x/y' }), 'VMU_EXTERNAL_DISABLED', 'sweep: scheme denied'), 'attachExternal(denied)', ['vmu.records.external.allowedSchemes'])
  const vf = createRecords({ clock: c.clock, settings: S2(), exists: () => false })
  const vfrec = put(vf, { body: 'z' })
  check(throwsNamedE(() => vf.attachExternal({ id: vfrec.id, uri: 'file:///missing' }), 'VMU_EXTERNAL_UNAVAILABLE', 'sweep: never verified'), 'attachExternal(missing)', ['vmu.records.external.verifyExists'])
  check(throwsNamedE(() => t5.externals({ id: 'r-404' }), 'VMU_NO_SUCH_OBJECT', 'sweep: externals id'), 'externals(unknown)')
  check(throwsNamedE(() => createRecords({ clock: 'not a function' }), 'VMU_INVALID_ARGUMENT', 'sweep: factory clock'), 'factory(no clock)')

  // "behaviour changed ⇒ it IS listed" / negative: a refusal that evaluated nothing lists exactly []
  const empty = throwsNamedE(() => t5.get({ id: 'r-404' }), 'VMU_NO_SUCH_OBJECT', 'sweep: empty enforced is allowed')
  ok(Array.isArray(empty.enforced) && empty.enforced.length === 0, 'enforced −: a refusal that evaluated no key lists an EMPTY array (not undefined, not a guess)')
  ok(!empty.enforced.includes('vmu.records.head.maxItems'), 'enforced −: an untouched key is NOT listed on the refusal path')

  // no duplicates + fired ⊆ enforced in EVERY receipt of a full scenario
  const c2 = fakeClock(10)
  const full = createRecords({ clock: c2.clock, settings: S2({ 'vmu.records.bodyCapBytes': 4, 'vmu.records.headListAt': 2, 'vmu.records.history.depth': 1, 'vmu.records.retention.tierThreshold': 5, 'vmu.records.trash.retainDays': 0, 'vmu.records.trash.autoPurge': true, 'vmu.records.body.chunkedReturn': true, 'vmu.records.chunk.thresholdBytes': 1, 'vmu.records.chunk.chunkBytes': 2 }), exists: () => true })
  const receipts = []
  receipts.push(full.put({ track: 'progress', kind: 'progress', title: 'one', body: 'abcdefgh', settled: true }))
  receipts.push(full.put({ track: 'progress', kind: 'progress', title: 'one', body: 'abcdefgh', settled: true }))
  receipts.push(full.put({ track: 'progress', kind: 'progress', title: 'two', body: 'ijklmnop', settled: true }))
  receipts.push(full.list())
  receipts.push(full.list({ fields: CORE_HEAD_FIELDS.concat(['title']) }))
  receipts.push(full.get({ id: 'r-1' }))
  receipts.push(full.supersede({ id: 'r-1', reason: 'r', body: 'zz' }))
  receipts.push(full.history({ id: 'r-1' }))
  receipts.push(full.attachExternal({ id: 'r-1', uri: 'file:///x' }))
  receipts.push(full.externals({ id: 'r-1' }))
  receipts.push(full.compact({ track: 'progress' }))
  receipts.push(full.remove({ id: 'r-2', by: 'office', reason: 'done' }))
  receipts.push(full.purge())
  const all = receipts.slice()   // status() is a REPORT, not an operation receipt: it has no enforced/fired
  ok(all.every((r) => Array.isArray(r.enforced)), 'receipts: every operation receipt carries an array `enforced`')
  ok(all.every((r) => !Array.isArray(r.enforced) || new Set(r.enforced).size === r.enforced.length), 'receipts: NO receipt has duplicate `enforced` entries (whole module)')
  ok(all.every((r) => !r.fired || new Set(r.fired).size === r.fired.length), 'receipts: NO receipt has duplicate `fired` entries (whole module)')
  ok(all.every((r) => !r.fired || r.fired.every((k) => r.enforced.includes(k))), 'receipts: fired ⊆ enforced everywhere (a fired key was necessarily evaluated)')
  ok(all.every((r) => r.enforced.every((k) => universe.has(k))), 'receipts: every listed key is a wired key')
  const firedSomewhere = new Set(receipts.flatMap((r) => r.fired || []))
  ok(firedSomewhere.size >= 5, 'receipts: the scenario really fired several knobs (' + firedSomewhere.size + ')')
}

console.log('=== VMU RECORDS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
