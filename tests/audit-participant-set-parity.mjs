// ============================================================================================
// CROSS-PRESET PARTICIPANT-SET PARITY (P4 / item 6.3)
//
// Expectation source: `_oneoff/review/participant-set-map.md` (table first, then this guard).
//
// The four presets deliberately use DIFFERENT names for the same concept - "which set of members is
// this decision counting, and as of which roster state":
//   · v2 `voteCount(t, round)`  -> { participants, expected, round, allParticipantsReported }
//   · v3 `voteCount(t, round)`  -> { participants, expected, round }   (NO allParticipantsReported:
//                                  its readers compose their own predicate - a deliberate difference)
//   · v4 `activeRosterSnapshot()` -> `frozen: { version, participants, kind }` (atomic; deprecated
//                                  alias `frozenParticipants`)
//   · v5 `rosterSnapshot()` -> `quorumView(): { m, mode, voters, voterCount, started, phase, rosterVersion }`
//
// So a behavioural "the numbers agree" test would have to unify those contracts, which is exactly what
// must NOT happen (v2's P2 regression came from collapsing two predicates). This guard is therefore
// STATIC: it pins, per preset, (a) that the participant set has exactly ONE producer, (b) that the set
// and its roster version/expectation are surfaced TOGETHER, and (c) the deliberate v2/v3 difference.
//
// Usage: node tests/audit-participant-set-parity.mjs
// ============================================================================================
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)))
const read = (rel) => existsSync(join(REPO, rel)) ? readFileSync(join(REPO, rel), 'utf8') : ''

let passed = 0, failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}
const occurrences = (s, re) => (s.match(re) || []).length
/** The body of a named function, by brace counting from its `function <name>(` occurrence. */
function body(src, name) {
  const i = src.indexOf('function ' + name + '(')
  if (i === -1) return ''
  let depth = 0, started = false
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; started = true }
    else if (src[j] === '}') { depth--; if (started && depth === 0) return src.slice(i, j + 1) }
  }
  return src.slice(i)
}

const v2 = read('vibe-math-v2/vibe-math-v2.js')
const v3 = read('vibe-math-v3/vibe-math-v3.js')
const v4 = read('vibe-math-v4/vibe-math-v4.js')
const v5 = read('vibe-math-v5/vibe-math-v5.js')

console.log('-- participant-set parity across the four presets --')

// ---- 1. v2: one producer, set + expectation + the field, and it is CONSUMED ----
{
  const b = body(v2, 'voteCount')
  ok(occurrences(v2, /function voteCount\(t, round\)/g) === 1, 'v2: exactly ONE participant-set producer (voteCount)')
  ok(/participants: participants/.test(b) && /expected: expected/.test(b) && /round: r/.test(b),
    'v2: voteCount returns the SET together with its expectation + round')
  ok(/allParticipantsReported: participants\.length > 0 && thisRoundIds\.length === participants\.length/.test(b),
    'v2: voteCount produces allParticipantsReported (its single predicate)')
  ok(occurrences(v2, /voteCount\(t, (?:t|meta)\.round\)\.allParticipantsReported/g) >= 2,
    'v2: the field is CONSUMED (both readers go through voteCount, not a re-derivation)')
  const expectedLine = /const expected = Math\.max\(MIN_REVIEWERS, Number\(tt\.expectedCount\) \|\| 0\)/.test(b)
  ok(expectedLine, 'v2: expected comes from the CREATION-TIME snapshot with the MIN_REVIEWERS floor (deliberately kept)')
}

// ---- 2. v3: one producer, NO allParticipantsReported (the documented difference), snapshot-only quorum ----
{
  const b = body(v3, 'voteCount')
  ok(occurrences(v3, /function voteCount\(t, round\)/g) === 1, 'v3: exactly ONE participant-set producer (voteCount)')
  ok(/participants: participants/.test(b) && /expected: expected/.test(b), 'v3: voteCount returns the SET together with its expectation')
  ok(!/allParticipantsReported/.test(v3), 'v3: deliberately has NO allParticipantsReported (readers compose their own predicate - do not "unify" it away)')
  const mv = body(v3, 'minVotes')
  ok(mv.length > 0 && !/params\.verifierCount/.test(mv), 'v3: minVotes reads the SNAPSHOT only (live params.verifierCount must not leak back in)')
}

// ---- 3. v4: one producer, ATOMIC set+version, deprecated alias, removal prunes ----
{
  ok(occurrences(v4, /function activeRosterSnapshot\(/g) === 1, 'v4: exactly ONE participant-set producer (activeRosterSnapshot)')
  ok(/frozen:\s*\(function\(sn\)\{\s*return \{version: sn\?sn\.rosterVersion:null, participants: sn\?sn\.rosterSnapshot:null, kind:/.test(v4),
    'v4: `frozen` is the ATOMIC triple {version, participants, kind}')
  ok(/frozenParticipants:\s*\(activeRosterSnapshot\(\)\|\|\{\}\)\.rosterSnapshot\|\|null/.test(v4) && /deprecated/.test(v4),
    'v4: `frozenParticipants` stays only as a deprecated alias of frozen.participants')
  const rm = body(v4, 'removeMember')
  ok(occurrences(rm, /rosterSnapshot=(\w+)\.rosterSnapshot\.filter\(x=>x!==id\)|rosterSnapshot\.filter\(x=>x!==id\)/g) >= 2,
    'v4: removal prunes BOTH frozen sets (that is what keeps "removal releases the wait" true)')
  ok(/function bumpRoster\(/.test(v4) && /rosterVersion\+\+/.test(body(v4, 'bumpRoster')), 'v4: exactly one roster-version bump helper')
}

// ---- 4. v5: one producer, quorum view surfaces the set + version together ----
{
  ok(occurrences(v5, /function rosterSnapshot\(\)/g) === 1, 'v5: exactly ONE participant-set producer (rosterSnapshot)')
  const qv = body(v5, 'quorumView')
  const keys = ['m', 'mode', 'voters', 'voterCount', 'started', 'phase', 'rosterVersion']
  const missing = keys.filter((k) => !new RegExp('\\b' + k + ':').test(qv))
  ok(qv.length > 0 && missing.length === 0, 'v5: quorumView surfaces the set (voters/voterCount) TOGETHER with m + rosterVersion', 'missing: ' + JSON.stringify(missing))
  ok(/return \{[\s\S]*?version: rosterVersion\(\)[\s\S]*?voters:/.test(body(v5, 'rosterSnapshot')),
    'v5: the snapshot captures version + voters in one object (no re-derivation between them)')
}

// ---- 5. the two cross-preset invariants, stated once (so a future preset cannot skip them) ----
{
  const producers = [
    ['v2', occurrences(v2, /function voteCount\(t, round\)/g)],
    ['v3', occurrences(v3, /function voteCount\(t, round\)/g)],
    ['v4', occurrences(v4, /function activeRosterSnapshot\(/g)],
    ['v5', occurrences(v5, /function rosterSnapshot\(\)/g)],
  ]
  ok(producers.every(([, n]) => n === 1), 'every preset has EXACTLY ONE participant-set producer ("produced only once")', JSON.stringify(producers))
  const setAndVersion = [
    ['v2', /participants: participants/.test(body(v2, 'voteCount')) && /expected: expected/.test(body(v2, 'voteCount'))],
    ['v3', /participants: participants/.test(body(v3, 'voteCount')) && /expected: expected/.test(body(v3, 'voteCount'))],
    ['v4', /participants: sn\?sn\.rosterSnapshot:null/.test(v4) && /version: sn\?sn\.rosterVersion:null/.test(v4)],
    ['v5', /voterCount: snap\.voterCount/.test(body(v5, 'quorumView')) && /rosterVersion: snap\.version/.test(body(v5, 'quorumView'))],
  ]
  ok(setAndVersion.every(([, b]) => b), 'every preset surfaces the set AND its roster version/expectation together', JSON.stringify(setAndVersion.filter(([, b]) => !b).map(([n]) => n)))
}

console.log('')
console.log('=== PARTICIPANT SET PARITY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failures.length) for (const f of failures) console.error('  - ' + f)
process.exit(failed === 0 ? 0 : 1)
