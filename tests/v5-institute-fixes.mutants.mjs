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
    // meeting-speak (2.9.0) 最坏情形防线：收束时把"沉默"写成票 = "沉默即同意"（绝不允许）。
    name: 'meeting-speak: silence is written as a true solve vote when the meeting closes',
    from: "      finalizeLock = 'meeting'\n      try {\n        await finalizeMeeting(meeting)",
    to: "      for (const id of meeting.roster) { if (meeting.silent[id] !== undefined && meeting.inputs[id] === undefined) await recordSolveVote(id, true) }\n      finalizeLock = 'meeting'\n      try {\n        await finalizeMeeting(meeting)",
    expect: /\[meeting-speak\] (沉默没有被写成票|沉默只写 silent 集合|未投票仍阻塞结题)/,
  },
  {
    // meeting-speak: 举手必须参与收束判据——有人举手却被收束 ⇒ 发言被丢。
    name: 'meeting-speak: a raised hand no longer holds the meeting open',
    from: 'if (notYetAsked.length || inFlight.length || unanswered.length || handsUp.length) {',
    to: 'if (notYetAsked.length || inFlight.length || unanswered.length) {',
    expect: /\[meeting-speak\] 有人举手时闸门不放过/,
  },
  {
    // meeting-speak: "沉默"绝不允许续命（旧行为：任何 busy 的人都能把会议吊住）。
    name: 'meeting-speak: a silent member keeps the meeting alive again',
    from: 'const inFlight = meeting.roster.filter((id) => meeting.asked[id] !== undefined && meeting.inputs[id] === undefined && meeting.silent[id] === undefined && meeting.unreached[id] === undefined && busy.has(id))',
    to: 'const inFlight = meeting.roster.filter((id) => busy.has(id))',
    expect: /\[meeting-speak\] 在飞集合排除/,
  },
  {
    // meeting-speak: 硬界必须**有界**（无界 ⇒ 卡死的一轮永远收不掉，run 被拖住）。
    name: 'meeting-speak: the meeting hard limit loses its bounds',
    from: 'Math.min(7200000, Math.max(300000, Math.floor(out.meetingHardLimitMs)))',
    to: 'out.meetingHardLimitMs',
    expect: /\[meeting-speak\] 两个新参数有界可配/,
  },
  {
    // M1：收束闸门改回"是否发过言"（沉默者被永久追问 ⇒ 沉默重新阻塞收束）。
    name: 'meeting-speak M1: the closing gate goes back to the SPEECH position',
    from: 'const notYetAsked = meeting.roster.filter((id) => meeting.asked[id] === undefined && meeting.silent[id] === undefined && meeting.unreached[id] === undefined)',
    to: 'const notYetAsked = meeting.roster.filter((id) => meeting.inputs[id] === undefined)',
    expect: /\[meeting-speak\] (沉默不阻塞收束|沉默被具名记录|闸门只读机会位)/,
  },
  {
    // M4：收束时不再等待"举着手但未交付"的人（发言被丢）。
    name: 'meeting-speak M4: a raised hand is no longer waited for',
    from: 'const handsUp = meetingHandsUp(meeting)',
    to: 'const handsUp = []',
    expect: /\[meeting-speak\] (A4|A5|举手被登记)/,
  },
  {
    // M6：征询名单含临时工（默认参会 ⇒ 与"默认不参与发言"相反）。
    name: 'meeting-speak M6: the ask roster includes temp workers again',
    from: 'const live = voters().map((m) => m.id)',
    to: 'const live = activeMembers().map((m) => m.id)',
    expect: /\[meeting-speak\] (B1|临时工默认不在征询名单)/,
  },
  {
    // M7：受邀者被塞进阻塞集合（受邀不回复就把会议吊住）。
    name: 'meeting-speak M7: an invited temp enters the blocking set',
    from: 'meeting.invited[id] = { by: callerId, why, at: now(), askedOnce: false }',
    to: 'meeting.invited[id] = { by: callerId, why, at: now(), askedOnce: false }; meeting.hands[id] = now()',
    expect: /\[meeting-speak\] C2（源码级）受邀者不进 hands\/roster/,
  },
  {
    // M9：忽略 meeting_hand（举手机制整体失效）。
    name: 'meeting-speak M9: meeting_hand is ignored',
    from: 'if (p.meeting_hand === true) {',
    to: 'if (false) {',
    expect: /\[meeting-speak\] (举手被登记|A4|A5|A6)/,
  },
  {
    // M10：沉默不入 silent 集合（不可审计 ⇒ 无"选择不发言"记录）。
    name: 'meeting-speak M10: silence is no longer recorded',
    from: '          meeting.silent[member.id] = now()',
    to: '          void 0',
    expect: /\[meeting-speak\] (沉默被具名记录|沉默不阻塞收束)/,
  },
  {
    // M11：受邀发言被算成票（只记纪要/不计票的边界被破坏）。
    name: 'meeting-speak M11: an invited speech is counted as a vote',
    from: '          meeting.inputs[member.id] = text',
    to: '          meeting.inputs[member.id] = text\n          if (meeting.invited[member.id]) await recordSolveVote(member.id, true)',
    expect: /\[meeting-speak\] 沉默只写 silent 集合/,
  },
  {
    // M12（用户裁决的 0 边界）：把 `meetingWakeRetries: 0` 当成"一次都不尝试"。
    // 正确语义是"先尝试 1 次、再重试 N 次（共 N+1 次）"，所以 0 ⇒ **恰好尝试一次**。
    name: 'meeting-speak M12: meetingWakeRetries:0 skips the single attempt',
    from: 'if (tries > maxTries && !meeting.hands[id]) {',
    to: 'if (tries >= maxTries && !meeting.hands[id]) {',
    expect: /\[meeting-speak\] E5b meetingWakeRetries:0 ⇒ 每位常驻/,
  },
  {
    // task-24: the member-prompt statement line must MARK its cut, not hide the tail (a real host registered
    // statements longer than the display cap and the truncated text is what voters read).
    name: 'real1004-visibility: the member-prompt statement cut becomes silent again',
    from: "'…（已截断；完整陈述见源卡片 '",
    to: "''",
    expect: /\[real1004-visibility\] the member-prompt statement line marks its 800-char cut/,
  },
  {
    // task-26: the set response must keep reporting what it coerced.
    name: 'real1004-visibility: the set response stops reporting adjusted values',
    from: 'return { ok: true, params: visibleParams(), adjusted, dropped: droppedSet.slice() }',
    to: 'return { ok: true, params: visibleParams(), adjusted: {}, dropped: droppedSet.slice() }',
    expect: /\[real1004-visibility\] vibe_v5_set reports `adjusted`/,
  },
  {
    // task-26: the two capacity refusals must stay machine-distinguishable.
    name: 'real1004-visibility: the institute capacity refusal reuses the per-member scope',
    from: "scope: 'institute'",
    to: "scope: 'per-member'",
    expect: /\[real1004-visibility\] the two capacity refusals carry DISTINCT/,
  },
  {
    // task-25: the fieldScopes declaration must keep covering the payload fields it used to omit.
    name: 'real1004-visibility: fieldScopes stops declaring diagnostics/backend again',
    from: "'pendingSpawns[].attempts', 'diagnostics', 'backend'],",
    to: "'pendingSpawns[].attempts'],",
    expect: /\[real1004-visibility\] fieldScopes.session covers the payload fields it used to omit/,
  },
  {
    // task-25: an incomplete electorate must keep naming who is still missing.
    name: 'real1004-visibility: the verdict response stops naming the missing voters',
    from: 'return { ok: true, voted: memberId, verdict: p, allVoted, pendingVoters: need.filter((id) => !votes[id]) }',
    to: 'return { ok: true, voted: memberId, verdict: p, allVoted }',
    expect: /\[real1004-visibility\] an incomplete electorate NAMES the missing voters/,
  },
  {
    // task-27: the injected Lean search root must stay on Lean 4's -R (the Lean-3 spelling fails argument parsing).
    name: 'real1004-lean-flag: the injected search root falls back to the Lean-3 --search-path',
    from: "const LEAN_SEARCH_PATH_FLAG = '-R'",
    to: "const LEAN_SEARCH_PATH_FLAG = '--search-path'",
    expect: /\[real1004-lean-flag\] the injected Lean search root uses -R/,
  },
  {
    // Iron-rules P4: the shared LaTeX tail must say when it applies (otherwise it is unexplained noise in
    // founding/verify/meeting wakes).
    name: 'real1004-prompt-scope: the LaTeX tail loses its scope note again',
    from: "if (b) L.push('\\n（**以下这段仅在你参与论文写作或编译时适用**；其他阶段可忽略。）' + b)",
    to: 'if (b) L.push(b)',
    expect: /\[real1004-prompt-scope\] the LaTeX block says WHEN it applies/,
  },
  {
    // task-30: the per-round feedback hint must actually reach the members (it is the only place that
    // explains WHY/WHAT/the three routes); suppressing it must redden the prompt guard BY NAME.
    name: 'task-30: the per-round feedback hint is never injected',
    from: "if (!feedbackOn()) return\n      L.push(''",
    to: "if (true) return\n      L.push(''",
    expect: /\[task-30\] the per-round prompt carries the feedback hint/,
  },
  {
    // task-30: `off` must be a real switch — if the gate always answers "on", the hint keeps being
    // injected and the refusal never fires.
    name: 'task-30: feedback=off stops suppressing the prompt hint',
    from: "function feedbackOn() { return String(params.feedback || 'on') !== 'off' }",
    to: 'function feedbackOn() { return true }',
    expect: /\[task-30\] feedback=off: the per-round hint is NOT injected/,
  },
  {
    // task-30: `off` must refuse BY NAME and write NOTHING (a silent write while disabled is the defect
    // class this project keeps hitting).
    name: 'task-30: feedback=off still accepts and writes an entry',
    from: "if (!feedbackOn()) {\n        return { ok: false, code: 'V5_FEEDBACK_DISABLED'",
    to: "if (false) {\n        return { ok: false, code: 'V5_FEEDBACK_DISABLED'",
    expect: /\[task-30\] off refuses the write BY NAME/,
  },
  {
    // task-30: the published counts must agree with the library — a wrong `closed` split makes the tool,
    // the report and the overview lie together.
    name: 'task-30: the feedback counters disagree with the library',
    from: 'return { total: all.length, open, closed: all.length - open, byCategory, byRoute }',
    to: 'return { total: all.length, open, closed: all.length, byCategory, byRoute }',
    expect: /\[task-30\] summary counts match the library contents exactly/,
  },
  {
    // task-31/P1: the archive→edit→re-run section must SAY what a receipt is at its first mention,
    // otherwise a member that never produced one can only guess (A/R2: members probed around for it).
    name: 'task-31: the archive-workflow line drops the receipt background again',
    editFile: 'math-computation.js',
    from: '- 归档→编辑→重跑（**回执＝一次 math_computation 调用的 JSON 结果**：先 probe 或 run 一次，它有哪些字段就一目了然）：mode:',
    to: '- 归档→编辑→重跑：mode:',
    expect: /\[task-31\] P1: (归档→编辑→重跑|成员那一轮真正读到)/,
  },
  {
    // task-31/P3: with no engine the line must not render "本机可用 （无）" (available + none).
    name: 'task-31: the empty engine table reads "本机可用 （无）" again',
    editFile: 'math-computation.js',
    from: "const head = '- math_computation：可用引擎 ' + (list || '无')",
    to: "const head = '- math_computation：本机可用 ' + (list || '（无）')",
    expect: /\[task-31\] P3: (空引擎表渲染为|成员提示词里是)/,
  },
  {
    // task-31/P4: agent-facing text must not call the plugin "框架" (ambiguous to an agent: plugin? host?).
    name: 'task-31: the notice frame calls the plugin 框架 again',
    from: "if (m.kind === 'notice') return '【研究所提示】' + m.text",
    to: "if (m.kind === 'notice') return '【框架提示】' + m.text",
    expect: /\[task-31\] P4: 面向代理文本里不再出现/,
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
