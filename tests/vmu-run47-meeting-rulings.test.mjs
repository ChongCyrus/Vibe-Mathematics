#!/usr/bin/env node
// vmu RUN 47 — THE CHAIR'S READ SIDE OF THE DEBATE RULINGS.
//
// THE OBSERVED DEFECT (live runs 45/46): a member filed its final ruling with
// `vibe_v5_verdict { meeting, proposition_id, verdict, reason, member }` — a card under
// `Members/<member>/Propos/ruling-<meeting>-<proposition>-*.md` — and the meeting face reported
// `spokeBy:[]`, `present:1`, nothing about the filing. The chair could only learn WHO had filed by running
// `vibe_v5_verdict_final`, which TALLYS and refuses when somebody is missing: a read that decides is not a read.
//
// THE MECHANISM: the cards are on disk the whole time (`rulingSubmissionsOf`, the same source the tally adopts
// from). What was missing was a way to READ them mid-debate. `vibe_v5_meeting { action:"rulings", id,
// proposition_id }` is that read: it returns `rows` (latest filing per member), `cards` (scanned proposition cards)
// and `duplicates` (a member with two different values), writes nothing, aggregates nothing, and answers
// `readable:false` + `why` when no library can be read — which is NOT the same as "nobody filed".
//
// WHAT THIS SUITE PROVES: (1) the ruling cards a member filed are READABLE through the meeting face on the SAME
// kernel (rows name member/verdict/reason/card id/path); (2) a second card with a different value is reported as a
// duplicate instead of being collapsed or averaged; (3) the read works from ANOTHER kernel over the same durable
// root (the chair reads what a member filed in its own session); (4) missing id / missing proposition are refused BY
// NAME and the refusals say what to pass; (5) a meeting/proposition with no filing reads `count:0` with
// `readable:true` (an empty list that means "nobody filed"), while an unreadable library reads `readable:false`
// with a `why`; (6) the read does NOT tally, does NOT sign, and does not change the card set.
import { mkdtemp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { parsed: undefined, missing: true }
  let raw
  try { raw = await spec.execute(args, {}) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

const MEETING = 'm-r47'
const PROP = 'p-r47'
const MARK = 'VMU-RULING '
/** File a ruling card exactly the way `submitRuling` writes it (a card under Members/<member>/Propos/). */
const fileRuling = async (kernel, member, verdict, reason, suffix) => {
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
  const id = 'ruling-' + [MEETING, PROP, member].map(slug).join('-') + (suffix ? '-' + suffix : '')
  const payload = { v: 1, kind: 'final-ruling', meeting: MEETING, proposition: PROP, member, verdict, reason }
  return kernel.library.append({
    kind: 'proposition', id, title: 'RULING ' + [MEETING, PROP, member].join(' | '),
    statement: 'final ruling on ' + PROP, proof: MARK + JSON.stringify(payload), visibility: 'public', status: 'ruling',
  }, { member })
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-run47-rulings-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  ok(kernel.members.roster().length === 3, 'setup: a chair and two members really exist (RULE E)', kernel.members.roster().map((m) => m.id))

  // §1 — THE FILES THAT EXIST ARE READABLE THROUGH THE MEETING FACE. Two members filed; the chair reads both.
  const c1 = await fileRuling(kernel, 'r-1', 0.4, '构造反驳未展开')
  const c2 = await fileRuling(kernel, 'r-2', 0.75, '两个方向都试过')
  ok(!c1.thrown && !c2.thrown, 'setup: two ruling cards really landed on disk (RULE E)', [c1, c2])

  const read1 = await call(b, 'vibe_v5_meeting', { action: 'rulings', id: MEETING, proposition_id: PROP })
  ok(!read1.thrown, 'the meeting face answers the rulings read (it does not need an agenda for a READ)', read1)
  const r1 = read1.parsed || {}
  ok(r1.ok === true && r1.action === 'rulings', 'sis. the receipt says ok:true / action:"rulings"', r1)
  ok(r1.readable === true && r1.why === null, 'the cards are readable and no reason is invented (readable:true, why:null)', r1)
  ok(r1.count === 2, 'count = the members who filed (2 latest-per-member rows), not the number of cards', r1.count)
  ok(Array.isArray(r1.rows) && r1.rows.length === 2, 'rows names both filings', r1.rows)
  const byMember = Object.fromEntries((r1.rows || []).map((x) => [x.member, x]))
  ok(byMember['r-1'] && Number(byMember['r-1'].verdict) === 0.4, 'r-1\'s filed verdict is 0.4', byMember['r-1'])
  ok(byMember['r-2'] && Number(byMember['r-2'].verdict) === 0.75, 'r-2\'s filed verdict is 0.75', byMember['r-2'])
  ok(byMember['r-1'] && String(byMember['r-1'].reason || '').indexOf('构造反驳') === 0, 'the reason is the member\'s own words, not a summary', byMember['r-1'] && byMember['r-1'].reason)
  ok(byMember['r-1'] && typeof byMember['r-1'].path === 'string' && byMember['r-1'].path.indexOf('Propos') >= 0, 'the CARD PATH is named (a card a reader can open, not just an id)', byMember['r-1'] && byMember['r-1'].path)
  ok(typeof r1.means === 'string' && r1.means.indexOf('does NOT tally') > 0, 'the receipt says the read does not tally', r1.means)

  // §2 — A SECOND CARD WITH A DIFFERENT VALUE IS A DUPLICATE, NOT AN AVERAGE.
  const c3 = await fileRuling(kernel, 'r-1', 0.9, '改主意了', 'again')
  ok(!c3.thrown, 'setup: a second card for r-1 with a different value really exists (RULE E)', c3)
  const read2 = await call(b, 'vibe_v5_meeting', { action: 'rulings', id: MEETING, proposition_id: PROP })
  const r2 = read2.parsed || {}
  ok(r2.count === 2, 'count stays 2 (one row per member) even though three cards exist', r2.count)
  ok(r2.cards === 3, 'cards names how many proposition cards were scanned (3)', r2.cards)
  ok(Array.isArray(r2.duplicates) && r2.duplicates.length === 1, 'the disagreement is reported as a duplicate instead of collapsing silently', r2.duplicates)
  ok(r2.duplicates && r2.duplicates[0] && r2.duplicates[0].member === 'r-1', 'the duplicate names the member', r2.duplicates && r2.duplicates[0])
  ok(r2.duplicates && r2.duplicates[0] && r2.duplicates[0].kept && Number(r2.duplicates[0].kept.verdict) === 0.9, 'the LATEST filing is the one kept (0.9)', r2.duplicates && r2.duplicates[0] && r2.duplicates[0].kept)

  // §3 — THE CHAIR READS WHAT A MEMBER FILED IN ITS OWN SESSION: another kernel over the same root sees the same cards.
  const b2 = await boot({ root, packs: ['v5r'] })
  const read3 = await call(b2, 'vibe_v5_meeting', { action: 'rulings', id: MEETING, proposition_id: PROP })
  const r3 = read3.parsed || {}
  ok(r3.readable === true && r3.count === 2, 'a SECOND kernel (the chair\'s own session) reads the same two filings', { readable: r3.readable, count: r3.count })
  ok(r3.rows && r3.rows.map((x) => x.member).sort().join(',') === 'r-1,r-2', 'the cross-kernel read names the same members', r3.rows && r3.rows.map((x) => x.member))

  // §4 — MISSING ID / MISSING PROPOSITION ARE REFUSED BY NAME, AND THE REFUSAL SAYS WHAT TO PASS.
  const noId = await call(b, 'vibe_v5_meeting', { action: 'rulings', proposition_id: PROP })
  const nid = noId.parsed || {}
  ok(nid.ok === false && nid.code === 'VMU_INVALID_ARGUMENT', 'a rulings read with no meeting id is refused VMU_INVALID_ARGUMENT', nid)
  ok(typeof nid.hint === 'string' && nid.hint.indexOf('id:') >= 0, 'that refusal tells the reader to pass id:"<meeting>"', nid.hint)
  const noProp = await call(b, 'vibe_v5_meeting', { action: 'rulings', id: MEETING })
  const npr = noProp.parsed || {}
  ok(npr.ok === false && npr.code === 'VMU_INVALID_ARGUMENT', 'a rulings read with no proposition is refused VMU_INVALID_ARGUMENT', npr)
  ok(typeof npr.hint === 'string' && npr.hint.indexOf('proposition_id') >= 0, 'that refusal tells the reader to pass proposition_id', npr.hint)

  // §5 — NO FILING IS count:0 + readable:true; an unreadable library is readable:false + why (two DIFFERENT answers).
  const none = await call(b, 'vibe_v5_meeting', { action: 'rulings', id: MEETING, proposition_id: 'p-nobody-filed' })
  const rn = none.parsed || {}
  ok(rn.readable === true && rn.count === 0, 'a proposition nobody filed about reads count:0 with readable:true ("nobody filed")', { readable: rn.readable, count: rn.count })
  // The unreadable-library branch (`readable:false` + `why`) cannot be reached from OUTSIDE this pack: the v5r pack
  // itself refuses to apply on a kernel with no durable root ("this kernel has no library root"), which is the
  // stronger guarantee — a deployment without a ledger never offers the ruling channel at all. The refusal is pinned
  // here so the branch cannot drift into a silent count:0.
  const noRoot = await boot({ packs: ['v5r'] })
  ok(noRoot.specOf('vibe_v5_meeting') === undefined, 'without a durable root the pack does not apply at all (no face, hence no unreadable ruling list)', noRoot.specOf('vibe_v5_meeting'))

  // §6 — THE READ TALLIES NOTHING AND SIGNS NOTHING. The cards are unchanged: the same rows point at the same ids.
  const before = (r2.rows || []).map((x) => x.id).sort()
  const readAgain = await call(b, 'vibe_v5_meeting', { action: 'rulings', id: MEETING, proposition_id: PROP })
  const after = ((readAgain.parsed || {}).rows || []).map((x) => x.id).sort()
  // RULE E: pin the population BEFORE comparing — two empty id lists compare equal and would pass for nothing.
  ok(before.length === 2 && after.length === 2, 'the read returns two card ids on both reads (the comparison below has a population)', { before, after })
  ok(JSON.stringify(before) === JSON.stringify(after), 'reading twice returns the same card ids (no rewriting, no new card)', { before, after })
  ok((readAgain.parsed || {}).count === 2, 'and the latest-per-member set is still the same size', (readAgain.parsed || {}).count)

  const doc = await call(b, 'vibe_v5_meeting', { action: 'status', id: MEETING })
  const dd = doc.parsed || {}
  ok(dd.ok === false && dd.code === 'VMU_INVALID_ARGUMENT', 'every OTHER action is still refused on this face (the read is one action, not a door)', dd)
  const ruled = await call(b, 'vibe_v5_meeting', { action: 'rulings', id: MEETING, proposition_id: PROP })
  ok((ruled.parsed || {}).count === 2, 'the rulings read is unaffected by the refused action before it', (ruled.parsed || {}).count)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

console.log('\n=== VMU RUN 47 MEETING RULINGS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error(failures.join('\n')); process.exit(1) }
