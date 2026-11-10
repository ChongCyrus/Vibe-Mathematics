// tests/vmu-run240-task-brief.test.mjs — a face that forwards a method must forward every noun it takes.
//
// WHY: the simulated-action audit listed `vibe_vmu_task { action: "brief" }` as "declared but never successfully
// called", and the reason was not a missing feature but a DROPPED ARGUMENT: `tools/task.js` called
// `tasks.brief(id)` while the kernel method is `brief(id, text, {...})`, and the schema declared no `text` at all. So
// every brief call answered `VMU_INVALID_ARGUMENT -- a brief needs non-empty text`, and the `briefNote` read-back on
// `vibe_v5_task_get` was unreachable by construction. The kernel was right the whole time; the face lost the noun.
//
// This suite pins the whole hand-off: schema → forwarder → kernel → read-back.
//
// Run: node tests/vmu-run240-task-brief.test.mjs

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

// `scripts/sim/harness.mjs` is DEV tooling (a simulator that boots the real kernel in-process), not a shipped
// runtime module, so it is imported by PATH the way every other sim-backed suite here does it
// (tests/vmu-run236-a2-report-fires.test.mjs:47). A STATIC relative import of the harness would make
// tests/audit-package-membership.mjs demand that the harness ship in package.json files, because that gate exists to
// stop a RUNTIME module from shipping without its harness, not to force dev scripts into the tarball.
const HARNESS = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href)
const boot = HARNESS.boot

const read = (p) => readFileSync(join(REPO, p), 'utf8')

let passed = 0
let failed = 0
const ok = (cond, what, detail = '') => {
  if (cond) { passed += 1; console.log('  ok   ' + what) } else { failed += 1; console.log('  FAIL ' + what + (detail ? '  [' + detail + ']' : '')) }
}

const src = read('vibe-math-vmu/tools/task.js')

console.log('--- 0. the source cannot lose the noun again')
ok(/text: param\('string', 'brief 的正文/.test(src), '§0a the schema declares `text` for the brief body')
ok(/run: async \(\{ action, id, title, objective, owner, deps, write_scopes, blocked_by, expected_revision, to, reason, text \} = \{\}\) => \{/.test(src),
  '§0b the run signature DESTRUCTURES text (a parameter that is not read is not forwarded)')
ok(/await tasks\.brief\(need\(id, 'id'\), text\)/.test(src), '§0c the forwarder passes text as the second argument')

console.log('--- 1. the tool round-trip works')
const root = 'D:/_tmp/sim-tests/task-brief'
const h = await boot({ root, clock: () => 1000, withPrompt: false })
const called = async (name, args) => {
  try { return await h.call(name, args, { as: { agent: { id: 'r-acad' } } }) } catch (e) { return { thrown: true, code: e && e.code, message: String(e && e.message), hint: e && e.hint } }
}

const created = await called('vibe_v5_task_create', { subject: '复验 brief 转发', description: 'RUN 240', write_scopes: ['VibeMath/Members/r-1/'] })
const taskId = created && created.task ? created.task.id : (created && created.id)
ok(typeof taskId === 'string' && taskId.length > 0, '§1a a task is created', JSON.stringify(created).slice(0, 120))

const briefed = await called('vibe_vmu_task', { action: 'brief', id: taskId, text: '先读蓝图第 2 节，再补归纳步的证明指针。' })
ok(briefed && briefed.ok === true, '§1b brief succeeds (it used to answer "a brief needs non-empty text")', JSON.stringify(briefed).slice(0, 160))
ok(briefed && briefed.rollbackable === true, '§1c the kernel answer is returned (rollbackable), not swallowed by the face')

const got = await called('vibe_v5_task_get', { id: taskId })
ok(got && got.ok === true, '§1d task_get reads the task back', JSON.stringify(got).slice(0, 120))
const briefRow = got && got.brief ? got.brief : null
// The read-back nests one more level: `vibe_v5_task_get` returns `brief` as the BOARD's answer row ({ok, id, owner,
// brief: <text>, by, at, shared}), so the text lives at `brief.brief`. Accept the string form too — the face is
// allowed to flatten it later, and this assertion is about the noun surviving, not about the nesting.
const briefText = typeof briefRow === 'string'
  ? briefRow
  : (briefRow && typeof briefRow.text === 'string' ? briefRow.text
    : (briefRow && typeof briefRow.brief === 'string' ? briefRow.brief : ''))
ok(briefText.includes('归纳步'), '§1e the brief body is readable after the round trip', JSON.stringify(briefRow).slice(0, 160))
ok(!got || got.briefNote === undefined, '§1f a successful read publishes no briefNote (briefNote is the FAILURE sentence)', JSON.stringify(got && got.briefNote))

console.log('--- 2. an empty brief is refused BY NAME, with a reachable next move')
const empty = await called('vibe_vmu_task', { action: 'brief', id: taskId, text: '   ' })
ok(empty && empty.ok === false && empty.code === 'VMU_INVALID_ARGUMENT', '§2a a blank brief is refused as invalid input', JSON.stringify(empty).slice(0, 160))
ok(empty && /non-empty text/.test(String(empty.message || '')), '§2b the message says what is missing', String(empty && empty.message))

console.log('--- 3. a task with no brief reads as ABSENT, not as a broken lookup')
const second = await called('vibe_v5_task_create', { subject: '没有 brief 的任务', write_scopes: ['VibeMath/Members/r-1/'] })
const secondId = second && second.task ? second.task.id : (second && second.id)
const read2 = await called('vibe_v5_task_get', { id: secondId })
ok(read2 && read2.ok === true && read2.brief === null, '§3a brief is null when the board holds none', JSON.stringify(read2 && read2.brief))
ok(read2 && String(read2.briefMeans || '').includes('no brief attached'), '§3b the absence gets its own sentence naming the setter', String(read2 && read2.briefMeans).slice(0, 160))

console.log('')
console.log('=== VMU RUN 240 TASK BRIEF: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
