// RUN 192 — run 32 / FEEDBACK32 ⑥ and ①: two receipts that counted something other than what their words said.
//
// ⑥ `votesCast:3` was read by the office as "three votes FOR", beside `against:["r-1"]`; it counts ARRIVALS (for plus
//    against, whether or not they agree). RUN 192 puts the split and the size of the electorate on the reading:
//    `votesFor`, `votesAgainst`, `votesTotal`.
// ① `drive` answered `executed:0, effects:[]` for a turn whose member had written a proof and submitted a Lean job in its
//    OWN session; `executedMeans` now says, in the sentence a reader actually gets, that the count is the reply FIELDS of
//    this turn and not the output of the member.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const TURN = fs.readFileSync(path.join(ROOT, 'vibe-math-vmu/kernel/turn/index.js'), 'utf8')
const { closureVoteOf } = await import(new URL('../vibe-math-vmu/kernel/turn/index.js', import.meta.url))

const ok = (cond, why) => assert.ok(cond, why)
const has = (hay, needle, why) => assert.ok(hay.includes(needle), why + ' (missing: ' + needle + ')')

test('§0 the two receipts name what they count (source pins)', () => {
  has(TURN, 'votesFor: forIt.length', '§0a the reading carries the FOR count')
  has(TURN, 'votesAgainst: against.length', '§0b the reading carries the AGAINST count')
  has(TURN, 'votesTotal: enfranchised.length', '§0c the reading carries the size of the electorate')
  has(TURN, 'RUN 192', '§0d the change names the run it came from')
  has(TURN, 'const EXECUTED_MEANS', '§0e the drive receipt still explains its count')
  const means = TURN.slice(TURN.indexOf('const EXECUTED_MEANS'), TURN.indexOf("'", TURN.indexOf('const EXECUTED_MEANS') + 30))
  has(TURN, 'REPLY FIELDS this turn dispatched', '§0f executed counts REPLY FIELDS')
  has(TURN, 'not the output of the member', '§0g and the sentence says what it does NOT count')
})

test('§1 votesCast is arrivals; the split and the electorate are named beside it', () => {
  const votes = new Map([['r-1', true], ['r-2', false]])
  const roster = [{ id: 'r-1' }, { id: 'r-2' }, { id: 'r-3' }]
  const v = closureVoteOf({ votes, roster, may: () => true })
  ok(v.votesCast === 2, '§1a two judgements arrived')
  ok(v.votesFor === 1, '§1b one of them was FOR, §1c readable as a number')
  ok(v.votesAgainst === 1, '§1c the other was AGAINST')
  ok(v.votesTotal === 3, '§1d the electorate is three, so one member is missing')
  ok(v.missing.length === 1 && v.missing[0] === 'r-3', '§1e and the reading names who')
  ok(v.confirmed === false, '§1f a split vote does not confirm closure')
  // the old reading is untouched: a unanimous tally still reads 3/3 with nothing missing
  const u = closureVoteOf({ votes: new Map([['r-1', true], ['r-2', true], ['r-3', true]]), roster, may: () => true })
  ok(u.votesCast === 3 && u.votesFor === 3 && u.votesAgainst === 0 && u.votesTotal === 3,
    '§1g unanimous: 3 arrived, 3 for, 0 against, of 3')
  ok(u.confirmed === true, '§1h and closure is confirmed')
  // a member who judged but holds no vote is still neither counted nor missing (RUN 169's rule survives)
  const t = closureVoteOf({
    votes: new Map([['r-1', true], ['r-2', true], ['r-temp', false]]),
    roster: [{ id: 'r-1' }, { id: 'r-2' }],
    may: (id) => id !== 'r-temp',
  })
  ok(t.votesTotal === 2 && t.votesCast === 2 && t.votesFor === 2, '§1i the temp judgement is not in the tally')
  // ★ TB-2724 / RUN 77 (C): `notEligible` rows carry the judgement instead of a bare id (the 77th run showed a bare
  // `r-temp` beside a Means sentence that promised "recorded"). Old world: `t.notEligible.includes('r-temp')`.
  ok(Array.isArray(t.notEligible) && t.notEligible.length === 1 && t.notEligible[0].member === 'r-temp'
    && t.notEligible[0].solved === false && t.notEligible[0].why === 'no-closure-vote-permission',
    '§1j and it is named WITH its judgement as not eligible, not dropped in silence', t.notEligible)
})

test('§2 the drive receipt says which count it is (live reading)', () => {
  const v = closureVoteOf({ votes: new Map(), roster: [{ id: 'r-1' }], may: () => true })
  ok(v.votesCast === 0 && v.votesFor === 0 && v.votesTotal === 1, '§2a an empty tally is 0 arrived of 1 eligible')
  const means = TURN.slice(TURN.indexOf('const EXECUTED_MEANS'))
  ok(!/an empty list means nothing was dispatched/i.test(means.slice(0, 400)),
    '§2b the sentence no longer claims an empty list means the member did nothing')
})
