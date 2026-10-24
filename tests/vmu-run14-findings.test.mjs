#!/usr/bin/env node
// tests/vmu-run14-findings.test.mjs — the readings that LIVE RUN 14 asked for, at the layer that was wrong.
//
// WHY THIS FILE EXISTS. Run 14 passed every machine criterion (`cast:true`, 0 RED) and its own acceptance report still
// found four things wrong. Two of them are defects that the kernel suites could not see, because they live on the
// boundary the kernel does not own:
//
//  6.1 「主席用 `member:` 报名被拒，而同一回执的 hint 写着 `member:` 是同义词」
//      → the KERNEL accepts `actor ?? by ?? member` (tests/vmu-run13-findings.test.mjs ⑧-c proves that), but the TOOL
//        FACE `vibe_vmu_meeting {action:'proceed'}` forwarded only `actor`/`by`, so `member:` never reached the kernel
//        and the refusal contradicted its own hint. A face may not advertise an alias it does not forward.
//
//  ⑧.4 「`sweep.recentTransitions` 里找不到 scheduled→waiting」
//      → the cross-pass history only recorded transitions found by a `sweepDue()` PASS. But a meeting also moves on
//        the TOUCH path (`speak`/`attend`/`proceed` → syncMeeting), and that is exactly how the live meeting moved, so
//        the history stayed `[]` while its own note promised "a transition from an earlier pass is still visible here".
//        A history that remembers one of the two ways a state can move is a false reading.
//
// WHAT THIS DOES NOT PROVE: it does not mount a host or the full tool registry, so it proves (a) the face's SOURCE
// forwards the alias and (b) the kernel's history records a touch-path transition — the live run is what proves the two
// together reach an agent.
//
// Run: node tests/vmu-run14-findings.test.mjs   (last line: === VMU RUN14 FINDINGS: N passed, M failed ===)

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createMeetings } from '../vibe-math-vmu/kernel/meetings.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed += 1; failures.push(name + (detail === undefined ? '' : ' [' + detail + ']')); console.log('  FAIL ' + name + (detail === undefined ? '' : ' [' + detail + ']')) }
}
const errOf = (fn) => { try { fn(); return null } catch (e) { return e } }

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

// ── 6.1 the TOOL FACE forwards `member` to `svc.proceed` ───────────────────────────────────────────────────────
// Static-with-teeth: the face is a source artefact, and the defect was exactly "the call site omits a key". A runtime
// assertion would need a full kernel + host mount (the live run does that); this pins the call site itself, and the
// teeth case below proves the judge is not decorative.
const FACE_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'tools', 'meeting.js'), 'utf8')
/** true when the proceed call hands the kernel the `member` key. */
const forwardsProceedMember = (src) => {
  const at = src.indexOf("if (action === 'proceed')")
  if (at < 0) return false
  const call = src.slice(at, at + 2400)
  const m = call.match(/svc\.proceed\(\{([^}]*)\}\)/)
  if (!m) return false
  return /\bmember\s*:/.test(m[1])
}
ok(FACE_SRC.includes("action === 'proceed'"), 'setup: the meeting face still has a proceed branch (the judge below has a subject)')
ok(forwardsProceedMember(FACE_SRC),
  '★★ 6.1 the face FORWARDS `member` into svc.proceed — the kernel accepts it, so the face must not drop it (live: refused while the hint promised acceptance)')
{
  // TEETH: the pre-fix call site (only actor/by/why) must be judged as NOT forwarding, or this gate proves nothing.
  const stripped = FACE_SRC.replace(/\s*member: member === undefined \? null : member,/, '')
  ok(!forwardsProceedMember(stripped),
    '★★ 6.1 TEETH: the same judge on the PRE-FIX call site (no `member:`) is red, so this assertion is not vacuous')
  // and the alias the face now forwards must still be one the KERNEL honours
  const KERNEL_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js'), 'utf8')
  ok(/proceed\(\{[^}]*member = null/.test(KERNEL_SRC),
    '6.1 the kernel still DECLARES the `member` synonym the face now forwards (one truth, both ends)')
}

// ── ⑧.4 the history records a transition that happened on the TOUCH path ──────────────────────────────────────
{
  let NOW = 1_000_000
  const svc = createMeetings({ clock: () => NOW, settings: { get: () => undefined } })
  const opened = svc.open({ id: 'm1', roster: ['r-1', 'r-2'], chair: 'r-1', materials: 'run14', at: NOW + 1000 })
  ok(opened && opened.ok === true, 'setup: a meeting can be scheduled (⑧.4)', opened && opened.code)
  const fresh = svc.status({ id: 'm1' })
  ok(fresh && fresh.sweep && Array.isArray(fresh.sweep.recentTransitions) && fresh.sweep.recentTransitions.length === 0,
    'setup: the history starts EMPTY and says so (an empty array is a fact, not a missing field)', fresh && fresh.sweep)
  ok(fresh && /BOUNDED history/.test(String(fresh.sweep.recentTransitionsNote)),
    'setup: and it announces its own bound before there is anything in it')

  // THE TOUCH PATH: no sweepDue() call at all. Time passes, then a member touches the meeting — this is exactly what
  // run 14 did (`speak` on a scheduled meeting after its start time) and what the old code failed to record.
  NOW += 2000
  const touchErr = errOf(() => svc.speak({ meeting: 'm1', by: 'r-1', text: 'run14: a touch that moves the state' }))
  ok(touchErr !== null && touchErr.code === 'VMU_STATE',
    'setup: a touch after the start time settles the meeting and then refuses the act (the rail ran)', touchErr && touchErr.code)

  const st = svc.status({ id: 'm1' })
  const hist = st && st.sweep ? st.sweep.recentTransitions : null
  ok(Array.isArray(hist) && hist.length > 0,
    '★★ ⑧.4 the TOUCH path is recorded in the cross-pass history (live: `[]` while the note promised otherwise)', hist)
  ok(Array.isArray(hist) && hist.some((t) => t.meeting === 'm1' && t.from === 'scheduled' && t.to === 'waiting'),
    '★★ ⑧.4 and it holds the scheduled→waiting transition the acceptance report could not find', hist)
  ok(Array.isArray(hist) && hist.every((t) => Object.prototype.hasOwnProperty.call(t, 'passAt')),
    '★ ⑧.4 every entry carries the instant of the move (`passAt`), so "when" is readable', hist && hist[0])
  ok(st && st.sweep && st.sweep.recentTransitionsNote && /BOUNDED history/.test(String(st.sweep.recentTransitionsNote)),
    '⑧.4 the history still announces its bound after it has content')

  // the SWEEP path must not double-record the same transition now that syncMeeting owns the recorder
  const pass = svc.sweepDue({ at: NOW })
  const after = svc.status({ id: 'm1' })
  const hist2 = after && after.sweep ? after.sweep.recentTransitions : []
  ok(pass && pass.ok !== false, '⑧.4 a sweep pass still runs and returns its own transitions', pass && pass.swept)
  ok(Array.isArray(hist2) && hist.length > 0 && hist2.length === hist.length,
    '★★ ⑧.4 a second pass over an unchanged meeting does NOT duplicate history (the recorder moved, it did not fork)', { before: hist.length, after: hist2.length })
}

// ── 6.2 / 6.3 / 6.5 are CLASSIFIED, not silently dropped ─────────────────────────────────────────────────────
// The acceptance report also raised three readings that are honest but unhelpful/ambiguous. They are pinned as
// CLASSIFICATIONS so a future change cannot quietly turn "classified" into "forgotten": the reading must still be
// PRESENT and must still explain itself, even though the shape is not changed.
{
  let NOW = 2_000_000
  const svc = createMeetings({ clock: () => NOW, settings: { get: () => undefined } })
  svc.open({ id: 'm2', roster: ['r-1', 'r-2'], chair: 'r-1', materials: 'run14-classified' })
  // 6.2 (「发言回执不告诉你还剩多少」) is a CLASSIFICATION, not a defect: `budget:null` + `budgetDeclared:false` on a
  // deployment that declared no budget is the honest answer, and `tests/vmu-receipt-shapes.test.mjs` already pins that
  // pair (it is the shape, not the usefulness, that can be gated). Repeating it here would be a second copy of one truth.
  // 6.3 (「`met:true` 与 `required:0` 并排」) is a CLASSIFICATION too: the receipt already carries `metIs`, which spells
  // out what `met` means, and the pure floor reading is named `floorMet` INSIDE the proceed override record
  // (`vibe-math-vmu/kernel/meetings.js` — the only place a floor reading is separated from the institution rule).
  // Renaming `met` would be a breaking read-face change made on a suggestion, so it is recorded in the ledger as
  // 已判非缺陷/命名建议 rather than silently renamed here. What MUST stay true is that the two readings are not merged
  // into one boolean: if they were, the ambiguity would become a wrong answer instead of a readable one.
  const OVERRIDE_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'meetings.js'), 'utf8')
  ok(/whichRule: 'institution-rule'[^}]*floorMet:/.test(OVERRIDE_SRC),
    '6.3` the override record still names BOTH the rule and the floor reading (the two are not collapsed into one boolean)')
}

console.log('=== VMU RUN14 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
