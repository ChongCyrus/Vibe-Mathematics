// Registered mutant harness for the v5 institute fixes — the suite carries its own proof.
// Each family is a SINGLE content-anchored mutation of the v5 preset (no line numbers); the suite runs
// through the V5_PLUGIN seam. Child runs are bounded (a timeout is a HANG); skipped families are printed
// and counted. Exit criterion: every family reddens BY NAME; ALL MUTANTS RED AS REQUIRED + exit 0 only then.
// Run: node tests/v5-institute-fixes.mutants.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const PRESET = 'vibe-math-v5'
const MAIN = PRESET + '.js'
const SUITE = 'tests/e2e-v5-round2.test.mjs'
const ENV = 'V5_PLUGIN'
// This suite is long, so the default child budget is generous; MUTANT_CHILD_TIMEOUT_MS overrides it.
const CHILD_TIMEOUT_MS = Number(process.env.MUTANT_CHILD_TIMEOUT_MS || 300000)
const TIMES = []
const hangs = []
const skipped = []
function copyGraph(file, dest) {
  const src = join(REPO, PRESET, file)
  copyFileSync(src, join(dest, file))
  for (const m of readFileSync(src, 'utf8').matchAll(/from\s+'(\.\/[A-Za-z0-9_.-]+\.js)'/g)) {
    const dep = m[1].slice(2)
    if (!readdirSync(dest).includes(dep)) copyGraph(dep, dest)
  }
}
function runFamily(f) {
  const dest = join(tmpdir(), 'v5fix-mut-' + Math.random().toString(36).slice(2, 10))
  mkdirSync(dest, { recursive: true })
  copyGraph(MAIN, dest)
  const target = join(dest, f.editFile || MAIN)
  const before = readFileSync(target, 'utf8').replace(/\r\n?/g, '\n')   // task-7: anchors are LF; a CRLF checkout made them match 0 times
if (/\r/.test(before)) { console.error('SETUP-FAIL - the anchor source was not EOL-normalised (CRLF leaked into anchor matching)'); process.exit(1) }
  const n = before.split(f.from).length - 1
  const okCount = f.lastOnly || f.all ? n >= 1 : n === 1
  if (!okCount) {
    skipped.push(f.name + ' (anchor x' + n + ')')
    console.error('  SKIP - ' + f.name + ' (anchor x' + n + ')')
    rmSync(dest, { recursive: true, force: true })
    return false
  }
  const mutated = f.lastOnly
    ? (() => { const i = before.lastIndexOf(f.from); return before.slice(0, i) + f.to + before.slice(i + f.from.length) })()
    : before.split(f.from).join(f.to)
  writeFileSync(target, mutated, 'utf8')
  try { execFileSync(process.execPath, ['--check', target], { stdio: 'pipe' }) }
  catch (e) {
    writeFileSync(target, before, 'utf8')
    skipped.push(f.name + ' (mutation did not compile)')
    console.error('  SKIP - ' + f.name + ' (mutation did not compile; restored)')
    rmSync(dest, { recursive: true, force: true })
    return false
  }
  const t0 = Date.now()
  let out = ''
  let code = 0
  let hang = false
  try {
    out = execFileSync(process.execPath, [SUITE], {
      cwd: REPO, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL',
      // task-13: a mutated CHILD only has to redden BY NAME, so it runs with a SMALL wait floor - the patient
    // default (E2E_V5_WAIT_FLOOR_MS = 30 s inside the suite) belongs to the real gate run. Without this the
    // 15 families x (patient suite) exceeded even the family's 900 s override and timed the family out.
    env: Object.assign({}, process.env, { [ENV]: join(dest, MAIN), E2E_V5_WAIT_FLOOR_MS: '2000' }),
    })
  } catch (e) {
    if (e && (e.killed || e.signal === 'SIGKILL')) hang = true
    code = (e && e.status) || 1
    out = String((e && e.stdout) || '') + String((e && e.stderr) || '')
  }
  const ms = Date.now() - t0
  TIMES.push([f.name, ms])
  if (hang) hangs.push(f.name + '(' + Math.round(ms / 1000) + 's)')
  const named = out.split(/\r?\n/).filter((l) => /^\s*(FAIL - | {2}- )/.test(l) && f.expect.test(l)).map((l) => l.trim())
  const ok = !hang && code !== 0 && named.length > 0
  console.log((hang ? '  HANG - ' : (ok ? '  ok - ' : '  FAIL - ')) + f.name + ' [' + ms + 'ms]' + (named.length ? ' :: ' + named[0].slice(0, 150) : ' :: no named red (exit=' + code + ')'))
  rmSync(dest, { recursive: true, force: true })
  return ok
}
const FAMILIES = [
  {
    // G1: acking at prompt-build time again — a failed wake then consumes the message.
    name: 'G1: the mailbox is acked BEFORE the wake again',
    from: 'if (ok && prompt.pending.length) await ackPending(prompt.pending)',
    to: 'if (prompt.pending.length) await ackPending(prompt.pending)',
    expect: /\[G1\] a message whose wake FAILED is still pending/,
  },
  {
    // G2: counting the round BEFORE a send that can fail (the historical shape v4 fixed as F10).
    name: 'G2: the round counter is applied BEFORE the send again',
    from: 'const nextRound = (rounds.get(member.id) || 0) + 1',
    to: 'rounds.set(member.id, (rounds.get(member.id) || 0) + 1); const nextRound = (rounds.get(member.id) || 0) + 1',
    expect: /\[G2\] a failed send must not consume a round/,
  },
  {
    // G4: restoring the second, unprotected whole-object write after the CAS (the lost-update window).
    name: 'G4: a second task write after the CAS is restored',
    from: "const r = await taskUpdate(memberId, { task_id: taskId, expected_revision: (cur ? cur.revision : 1), action: 'reassign', owner: to },\n        { assignedBy: isOffice(memberId) ? 'office' : memberId, why, acceptance })",
    to: "const r = await taskUpdate(memberId, { task_id: taskId, expected_revision: (cur ? cur.revision : 1), action: 'reassign', owner: to })\n      if (r.ok) await putTask(Object.assign({}, inst().tasks.find((t) => t.id === taskId), { assignedBy: isOffice(memberId) ? 'office' : memberId, why, acceptance }))",
    expect: /\[G4\] the assign path issues NO second, unprotected task write/,
  },
  {
    // A5: a permanent researcher founded with the academician KIND - the count stays 3 but the id
    // set and the kind multiset both break (the allocator also repeats the academician id).
    name: 'A5: a permanent researcher is founded with the academician kind',
    from: "const m = await newMember('researcher', { direction: dir })",
    to: "const m = await newMember('academician', { direction: dir })",
    expect: /A5 the founded (ID SET|KIND MULTISET)/,
  },
  {
    // A5-ids: the COUNT stays 3 and the kinds stay right, but the researcher id PREFIX changes, so the
    // MEASURED (R14): the count assertions stay GREEN and the ID-SET assertion reddens; the run's other
    // reds (82) are the cascade of the same mutation - not a claim that only the new assertion reddens.
    // founded ID SET is no longer {acad, r-1, r-2}. This is the discriminator the count cannot catch.
    name: 'A5-ids: the researcher id prefix is renamed (count still 3)',
    from: "researcher: 'r-',",
    to: "researcher: 'rX-',",
    expect: /A5 the founded ID SET is exactly/,
  },
  {
    // A5-kinds: the COUNT stays 3 and the ids stay right, but a founded researcher's KIND is rewritten,
    // MEASURED (R14): the count and ID-SET assertions stay GREEN and the KIND assertion reddens; the run's
    // other reds (21) are the cascade of the same mutation - not a claim that only the new assertion reddens.
    // so the kind MULTISET is no longer {academician:1, researcher:2}.
    name: 'A5-kinds: a founded researcher kind is rewritten (count still 3)',
    from: "id: '', kind,",
    to: "id: '', kind: kind === 'researcher' ? 'temp' : kind,",
    expect: /A5 the founded KIND MULTISET is exactly/,
  },
  {
    // spawnMember (G2-class): counting the founding round BEFORE `startContinuable`, so a host-cap
    // failure consumes a round and the retried founder is told 轮次 2.
    name: 'spawnMember: the founding round is counted BEFORE the start again',
    from: 'const startRound = (rounds.get(member.id) || 0) + 1',
    to: 'rounds.set(member.id, (rounds.get(member.id) || 0) + 1); const startRound = (rounds.get(member.id) || 0) + 1',
    expect: /\[spawnMember\] a FAILED start must not consume a round/,
  },
  {
    // spawnMember: restoring the destructive rollback — `rounds.delete`/`roundsSinceCompact.delete` in the
    // catch, which ERASES the count of a member being RESUMED (its numbering then restarts at 1).
    name: 'spawnMember: the failed-start rollback DELETES the existing round count again',
    from: "        busy.delete(member.id)\n        wakeKind.delete(member.id)",
    to: "        busy.delete(member.id)\n        wakeKind.delete(member.id)\n        rounds.delete(member.id)\n        roundsSinceCompact.delete(member.id)",
    expect: /\[spawnMember\] a FAILED resume must not move the round number backwards/,
  },
  {
    // spawnMember: dropping the explicit next-round argument, so the founding prompt's status block
    // falls back to the stored counter (still 0 at that point) and announces 轮次 0.
    name: 'spawnMember: the founding prompt is built without the explicit round',
    from: 'const prompt = initialPrompt(member, initialTask, mode, startRound)',
    to: 'const prompt = initialPrompt(member, initialTask, mode)',
    expect: /\[spawnMember\]|the founding prompt never displays 轮次 0|the FOUNDING prompt announces the round/,
  },
  {
    // F6: quietly dropping a failed REQUIRED artifact write again (the v4-G3 shape): the meta write is
    // still checked for `files`, but the failure is no longer NAMED in `warnings`.
    name: 'F6: a failed paper.meta.json write is silently dropped from warnings again',
    from: "      else warnings.push(paperWriteFailureWarning(['paper.meta.json']))",
    to: "      else { /* F6 mutant: the failure is silent again */ }",
    expect: /\[F6\] a failed REQUIRED write is named EXACTLY once/,
  },
  {
    // F6 (log half): discarding the FINALIZE-time log write result again — the log artifact can then go
    // missing with no warning at all, and the durable meta is not re-written to name it.
    name: 'F6: the finalize-time paper.log.md write result is discarded again',
    from: '      if (!logRes.ok) {',
    to: '      if (false) {',
    expect: /\[F6\] a failed FINALIZE-time log write is named exactly once/,
  },
  {
    // v5 L1 (`leanPathContractOk`): the tools' short form resolves to a DIFFERENT file, so the load-time
    // contract check fails and queues 'Lean path contract broken …'; report() must then surface it.
    name: 'v5 L1: the Lean tools short form resolves to the WRONG file (path contract broken)',
    from: 'const viaShort = leanAbsPath(probe)',
    to: "const viaShort = leanAbsPath(probe + 'x')",
    expect: /\[v5 L1\] a HEALTHY composition surfaces no Lean path contract note/,
  },
  {
    // task-9: the durable meta must record the probed TeX paths — dropping them makes the recorded
    // evidence disappear while the compile result still degrades identically.
    name: 'task-9: the durable meta stops recording the probed TeX paths (triedPaths emptied)',
    from: 'triedPaths: compile.triedPaths || []',
    to: 'triedPaths: []',
    expect: /\[task-9\] the durable meta records the probed TeX paths/,
  },
  {
    // task-9: the not-detected warning keeps its tail but must also say where it looked and how to pin
    // an engine — reverting that sentence to the old text must redden the guarding assertion by name.
    name: 'task-9: the not-detected warning drops the actionable sentence again',
    from: '只交付 paper.tex 与 paper.md。已探测 PATH 与文档化的常见 TeX 根；可用 paperLatexCommand 指定绝对路径。',
    to: '只交付 paper.tex 与 paper.md。',
    expect: /\[task-9\] the not-detected warning keeps its tail AND says where it looked/,
  },
  // RETIRED (task-17, 2.8.1 real-host fix): the former entry here mutated `return [forced]` into the merged
  // `[forced].concat(order…)`, which used to let an unresolvable explicit command fall through to a real
  // engine. After task-17 the explicit value is ALSO handed to resolveKnownTool as `explicit` (the explicit
  // branch probes only it and returns early), so the property is now enforced at TWO independent sites and
  // NO single-site mutation can defeat it — the merged list merely probes dead candidates. The assertion
  // itself stays in tests/e2e-v5-round2.test.mjs (`★ [task-10/v5] …degrades`); only the falsifier is retired
  // (and the task-17 entry below covers the hand-off single-site).
  {
    // task-17 (real host, 2.8.1): probing the explicit value as a BARE COMMAND NAME lets the known-root stage
    // join it onto every TeX root, so `triedPaths` reports impossible paths. Reverting the hand-off must
    // redden the guarding assertion by name.
    name: 'task-17: the explicit paperLatexCommand is probed as a bare command name again (triedPaths gets fake joins)',
    from: "explicit: forcedTex, kind: 'tex'",
    to: "explicit: '', kind: 'tex'",
    expect: /\[task-17\/v5\] an ABSOLUTE explicit paperLatexCommand is probed ALONE/,
  },
  {
    // task-18: the DELIVERED artifacts must say why no PDF was produced (the body is composed before the
    // compile runs, so the note is written after it). Blunting the zh note must redden that guard BY NAME.
    // The scenario that guards this runs with lang='en', so the ENGLISH branch is the one to blunt.
    name: 'task-18: the delivered paper stops stating that no engine was detected',
    from: ": 'No LaTeX engine detected: tex+md only'",
    to: ": ''",
    expect: /\[task-18\/v5\] the DELIVERED paper.md and paper.tex/,
  },
  {
    // real1004-minutes: a speech arriving after the meeting closed must be appended as a late note; dropping
    // it silently is exactly what a real host showed (minutes declared "r-1 → acad" with only "### r-1").
    name: 'real1004-minutes: a speech arriving after the meeting closed is dropped silently again',
    from: "} else if (lastMeetingId && typeof p.input === 'string' && p.input.trim()) {",
    to: '} else if (false) {',
    expect: /\[real1004-minutes\] a speech arriving after the meeting closed/,
  },
  {
    // real1004-consult: the office refusal must NAME the force reset (observed: 11 unnamed rejections on a real
    // host). Dropping the clause must redden the guarding assertion by name.
    name: 'real1004-consult: the office refusal stops naming the force restart',
    from: 'const restarted = p.forced === true',
    to: 'const restarted = false',
    expect: /\[real1004-consult\] an office finalisation after a force restart NAMES the reset/,
  },
  {
    // real1004-stall: the meeting must NOT be abandoned while an asked speaker is still in flight — doing so is
    // what turned ordinary speeches into "late notes" on a real host (1067 of them).
    name: 'real1004-stall: the meeting is abandoned while an asked member is still busy',
    from: 'if (stale >= recoverStallMs() && (!inFlight || stale >= recoverStallMs() * 3)) {',
    to: 'if (stale >= recoverStallMs()) {',
    expect: /\[real1004-stall\] the meeting watchdog exempts ASKED-but-busy speakers/,
  },
]
let red = 0
for (const f of FAMILIES) { const ok = runFamily(f); if (ok) red++ }
const totalMs = TIMES.reduce((a, t) => a + t[1], 0)
console.log('')
console.log('mutant families reddening the v5 institute fixes by name: ' + red + '/' + FAMILIES.length)
console.log('timings: ' + TIMES.map((t) => String(t[0]).split(':')[0] + '=' + t[1] + 'ms').join('  '))
// R15: the audit-checklist row says EVERY family prints this line, and override decisions must quote it
// rather than an external estimate. Same shape as tests/formal-verify-v3.mutants.mjs.
console.log('TOTAL WALL TIME (all families + setup): ' + totalMs + 'ms (' + Math.round(totalMs / 1000) + 's)')
console.log('hangs=[' + hangs.join(' | ') + ']')
console.log('skipped=[' + skipped.join(' | ') + ']')
if (red !== FAMILIES.length || skipped.length || hangs.length) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')
