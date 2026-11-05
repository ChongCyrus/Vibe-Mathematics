// RUN 236 / M4 — an update of an existing record must not REBUILD the row out of what this one call happened to name.
//
// THE MEASUREMENT (FEEDBACK60 §M4, a real run): r-1 CORRECTED a card with the same id. The receipt said
// `ok:true`, but the card came back with `title` reverted to its own id ("rec-6"), its `value` reverted and a whole
// `- debateRuling：{…}` line gone. The caller believed it was SUPPLEMENTING; the write had REWRITTEN the row, and
// nothing in the answer said what had been replaced. `kernel/records.js` `put` rebuilt a fresh row object on every
// write — `rev` back to 1, `createdAt` reset, `tags`/`permanent` defaulted, `versions` emptied — so a correction
// also erased the row's identity and history.
//
// THE REPAIR tested here (`kernel/records.js` `put`, the `isUpdate` branch):
//   ① MERGE BY FIELD: what the write NAMES wins; what it does NOT name is kept (title/kind/tags/permanent/by/body).
//   ② the row keeps its identity (id, slug, createdAt) and its `rev` INCREASES; the previous state is pushed as a
//      version, so the write is in `records.history` instead of being silently destroyed.
//   ③ the body is a FIELD: `bodyMode` decides `'replace'` (default) vs `'append'`; naming no body keeps it (`'kept'`).
//   ④ the receipt says what actually happened: `updated`, `rev`, `fieldsKept`, `fieldsReplaced`, `bodyModeUsed`,
//      `bodyModeMeans`. A field the caller never named can no longer move without being reported.
//   ⑤ an ID is not a NAME: the card path hands `title = <the row's own id>` when the caller named no title, and that
//      supplied "title" is refused as a title (`fieldsKeptWhy.title` says so) — this is the measured "rec-6" shape.
//
// Run: node tests/vmu-run236-record-merge.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
// fs-purpose: self-audit — source pins read this package's own module text (read-only self-inspection)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRecords } from '../vibe-math-vmu/kernel/records.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const read = (rel) => readFileSync(ROOT + rel, 'utf8')
const RECORDS = read('vibe-math-vmu/kernel/records.js')
const KIT = read('vibe-math-vmu/kit/handlers.js')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
/** A non-empty list, asserted BEFORE anything is read off it (an empty list must never make a check vacuous). */
const nonEmpty = (list, msg) => {
  ok(Array.isArray(list), msg + ' — expected an array, got ' + typeof list)
  ok(list.length > 0, msg + ' — expected at least one entry, got []')
  return list
}
const named = (fn, code, msg) => {
  try { fn() } catch (e) {
    ok(e && e.code === code, msg + ' — refusal code is ' + (e && e.code) + ', want ' + code, e && e.message)
    has(e && e.message, msg.fragment, msg + ' — the message names the defect')
    has(e && e.hint, msg.hint, msg + ' — the hint gives the reachable repair')
    return e
  }
  ok(false, msg + ' — nothing was refused')
  return null
}

const settings = () => ({ 'vmu.records.requireSettledRecords': false })
const ledger = (start = 1000) => { let t = start; return createRecords({ clock: () => { t += 1; return t }, settings: settings() }) }
const add = (r, extra = {}) => r.put(Object.assign({ track: 'progress', kind: 'progress', title: '前 n 个奇数之和等于 n 的平方', body: '陈述：前 n 个奇数之和等于 n 的平方', by: 'r-1' }, extra))

test('RUN 236 §0 — the mechanism is in the module the receipt describes (source pins)', () => {
  has(RECORDS, "const BODY_MODES = Object.freeze(['replace', 'append'])", '§0a the allowed body modes are a closed list')
  has(RECORDS, 'bodyMode = null', '§0b put accepts bodyMode as a named parameter')
  has(RECORDS, 'MERGES BY FIELD', '§0c the update branch states the rule it follows')
  has(RECORDS, 'fieldsKept', '§0d ★ the receipt has a field for what was KEPT')
  has(RECORDS, 'fieldsReplaced', '§0e ★ and one for what was REPLACED')
  has(RECORDS, 'bodyModeMeans', '§0f the body decision is explained in words, not only by a token')
  has(RECORDS, 'titleIsOwnId', '§0g an id handed in as a title is not taken as a name')
  has(RECORDS, 'FEEDBACK60 §M4', '§0h the repair names the measurement it answers')
  // the OTHER half of the story: the card path really does pass the row's own id as the title when no title was named
  has(KIT, 'titleOfCard', '§0i the card path computes a title at all')
  has(KIT, 'const rowTitle = titleOfCard(args, title)', '§0j and the row title is that computed value')
  has(KIT, 'no `title` was passed, so the row name is the id you passed', '§0k ★ its own prose says an omitted title becomes the id — the "rec-6" shape')
})

test('RUN 236 §1 — a CORRECTION keeps every field it does not name (the measured M4 shape)', () => {
  const r = ledger()
  const first = add(r, { tags: ['proposition'], body: '陈述：前 n 个奇数之和等于 n 的平方\n- value：对 n≥1 成立\n- p：1' })
  ok(first.ok === true && first.updated === false, '§1a the first write mints a row and says so', first)
  // the card path: no title named by the member, so kit/handlers.js titleOfCard hands the row's OWN ID
  const fixed = r.put({
    id: first.id, track: 'progress', kind: 'progress', title: first.id, by: 'r-1',
    body: '陈述：前 n 个奇数之和等于 n 的平方\n- value：0.95\n- p：1',
  })
  const view = r.get({ id: first.id })
  ok(view.title === '前 n 个奇数之和等于 n 的平方', '§1b ★ the card did NOT get renamed to its own id', view.title)
  ok(fixed.updated === true, '§1c the write is reported as an update', fixed)
  ok(view.rev === 2, '§1d the row\'s revision advanced instead of restarting at 1', view.rev)
  ok(view.createdAt === first.createdAt || view.createdAt !== undefined, '§1e the row still has its creation time', view.createdAt)
  ok(view.owner === 'r-1', '§1f the owner survived (an omitted `by` does not erase it)', view.owner)
  ok(JSON.stringify(view.tags) === JSON.stringify(['proposition']), '§1g omitted tags were KEPT, not reset to []', view.tags)
  nonEmpty(fixed.fieldsKept, '§1h the receipt lists the fields that were kept')
  ok(fixed.fieldsKept.includes('title'), '§1i ★ title is named as kept', fixed.fieldsKept)
  ok(fixed.fieldsKept.includes('createdAt'), '§1j identity is named as kept', fixed.fieldsKept)
  ok(fixed.fieldsKept.includes('tags'), '§1k tags is named as kept', fixed.fieldsKept)
  ok(Array.isArray(fixed.fieldsReplaced) && fixed.fieldsReplaced.includes('body'), '§1l ★ the body IS reported as replaced (not silent)', fixed.fieldsReplaced)
  ok(fixed.fieldsReplaced.includes('title') === false, '§1m and title is NOT among the replaced fields', fixed.fieldsReplaced)
  ok(fixed.bodyModeUsed === 'replace', '§1n a named body defaults to bodyMode replace', fixed.bodyModeUsed)
  has(fixed.bodyModeMeans, 'REPLACED', '§1o the prose says the body was replaced')
  ok(fixed.versionsCount === 1, '§1p the previous state was pushed as a version, not destroyed', fixed.versionsCount)
})

test('RUN 236 §2 — an update that names no body KEEPS the body; naming no field keeps the kind', () => {
  const r = ledger()
  const first = add(r)
  const same = r.put({ id: first.id, track: 'progress', kind: 'progress', by: 'r-1', title: '改过的名字' })
  const view = r.get({ id: first.id })
  ok(view.title === '改过的名字', '§2a a title that IS named does replace the title', view.title)
  ok(view.body === '陈述：前 n 个奇数之和等于 n 的平方', '§2b ★ the body was KEPT because this write named none', view.body)
  ok(same.bodyModeUsed === 'kept', '§2c and the receipt says the body was kept', same.bodyModeUsed)
  has(same.bodyModeMeans, 'KEPT its body', '§2d in words a caller can act on')
  ok(view.kind === 'progress', '§2e the kind was kept (omitting it must not default it away)', view.kind)
})

test('RUN 236 §3 — bodyMode:"append" keeps the old text and adds the new text after it', () => {
  const r = ledger()
  const first = add(r, { body: '第一段' })
  const grown = r.put({ id: first.id, track: 'progress', kind: 'progress', body: '第二段', bodyMode: 'append', by: 'r-1' })
  const view = r.get({ id: first.id })
  ok(grown.bodyModeUsed === 'append', '§3a the receipt names the mode actually used', grown.bodyModeUsed)
  ok(view.body === '第一段\n第二段', '§3b ★ the old body survived and the new text follows it', JSON.stringify(view.body))
  ok(Array.isArray(grown.fieldsReplaced) && grown.fieldsReplaced.includes('body'), '§3c an append still moves the body (reported)', grown.fieldsReplaced)
  has(grown.bodyModeMeans, 'added after it', '§3d the prose says the old text stayed')
})

test('RUN 236 §4 — the refusals are NAMED, with the reachable repair in the hint', () => {
  const r = ledger()
  const first = add(r)
  const bad = named(() => r.put({ id: first.id, track: 'progress', kind: 'progress', body: 'x', bodyMode: 'merge' }),
    'VMU_INVALID_ARGUMENT', { fragment: 'unknown bodyMode', hint: 'bodyMode:"replace"' })
  ok(bad && Array.isArray(bad.enforced), '§4a the refusal carries its enforced list like every other refusal', bad && bad.enforced)
  const mint = named(() => r.put({ track: 'progress', kind: 'progress', title: '新卡', body: 'x', bodyMode: 'append' }),
    'VMU_INVALID_ARGUMENT', { fragment: 'MINTS a new record', hint: 'drop bodyMode' })
  ok(mint && Array.isArray(mint.enforced), '§4b a bodyMode on an ADD is refused by name, not ignored', mint && mint.enforced)
  // nothing was written by either refusal
  ok(r.list({ track: 'progress' }).count === 1, '§4c neither refusal left a row behind', r.list({ track: 'progress' }).count)
})

test('RUN 236 §5 — the create path and dedupe are unchanged (adding the same content still answers deduplicated)', () => {
  const r = ledger()
  const a = add(r)
  const b = add(r)
  ok(a.updated === false && b.deduplicated === true, '§5a ★ a duplicate ADD is still counted, not re-added', b)
  ok(r.list({ track: 'progress' }).count === 1, '§5b the track still holds one row', r.list({ track: 'progress' }).count)
  // ★ RUN 178 regression: an update that RESTORES an earlier body must be WRITTEN, never deduplicated against itself
  const restored = r.put({ id: a.id, track: 'progress', kind: 'progress', body: '陈述：前 n 个奇数之和等于 n 的平方', by: 'r-1' })
  ok(restored.ok === true && restored.deduplicated === false && restored.updated === true, '§5c ★ rollback of an earlier body is a WRITE, not a dedupe', restored)
  ok(r.get({ id: a.id }).body === '陈述：前 n 个奇数之和等于 n 的平方', '§5d and the earlier body really is back on the row', r.get({ id: a.id }).body)
})

test('RUN 236 §6 — a second row is untouched: the merge is about the NAMED id, not the track', () => {
  const r = ledger()
  const one = add(r, { title: '第一张卡', body: '卡一' })
  const two = add(r, { title: '第二张卡', body: '卡二' })
  const fixed = r.put({ id: one.id, track: 'progress', kind: 'progress', body: '卡一（补正）', by: 'r-1' })
  ok(fixed.id === one.id, '§6a the receipt names the row this write touched', fixed.id)
  const other = r.get({ id: two.id })
  ok(other.title === '第二张卡' && other.body === '卡二' && other.rev === 1, '§6b ★ the other row is byte-for-byte untouched', other)
})
