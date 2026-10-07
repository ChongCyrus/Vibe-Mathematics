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
function copyGraph(file, dest, preset) {
  const src = join(REPO, preset || PRESET, file)
  copyFileSync(src, join(dest, file))
  for (const m of readFileSync(src, 'utf8').matchAll(/from\s+'(\.\/[A-Za-z0-9_.-]+\.js)'/g)) {
    const dep = m[1].slice(2)
    if (!readdirSync(dest).includes(dep)) copyGraph(dep, dest)
  }
}
function runFamily(f) {
  const dest = join(tmpdir(), 'v5fix-mut-' + Math.random().toString(36).slice(2, 10))
  mkdirSync(dest, { recursive: true })
  const preset = f.preset || PRESET
  const main = preset + '.js'
  copyGraph(main, dest, preset)
  const target = join(dest, f.editFile || main)
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
    out = execFileSync(process.execPath, [f.suite || SUITE], {
      cwd: REPO, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL',
      // task-13: a mutated CHILD only has to redden BY NAME, so it runs with a SMALL wait floor - the patient
    // default (E2E_V5_WAIT_FLOOR_MS = 30 s inside the suite) belongs to the real gate run. Without this the
    // 15 families x (patient suite) exceeded even the family's 900 s override and timed the family out.
    env: Object.assign({}, process.env, { [ENV]: join(dest, main), E2E_V5_WAIT_FLOOR_MS: '2000' }, f.env || {}),
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
// ── v5r family (R10 / docs/02-rulings §7.2) ──────────────────────────────────────────────────
// These three mutate the v5r preset and run the v5r R10 behaviour block (tests/selfdrive-v5.mjs,
// itself gated on the v5r preset). Each must redden ONE named R10 assertion. The static twin of
// the same guarantee lives in tests/audit-v5-integrity.mjs (gates R10[1..7]).
const V5R_FAMILIES = [
  {
    name: 'R10-v5r: the idle bound stops being revocable (named触界 must be revocable)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    from: "const bound = boundOf('idle', '长时间无新票，已到有界兜底上限（recoverStallMs=' + recoverStallMs() + 'ms）')",
    to: "const bound = { name: 'idle', why: '', at: 0, revocable: false }",
    expect: /R10：idle 触界同样/,
  },
  {
    name: 'R10-v5r: the round-cap close goes back to a bare round-complete (no named bound)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    from: "endedBy: 'bound:round-cap'",
    to: "endedBy: 'round-complete'",
    expect: /R10：轮数到顶是/,
  },
  {
    name: 'R10-v5r: the implicit abandoned(stuck) settle is restored in place of bound:idle',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    from: "endedBy: 'bound:idle', bound, closedAt: now(),",
    to: "endedBy: 'abandoned (stuck)', closedAt: now(),",
    expect: /R10：空闲兜底是/,
  },
  {
    // G6 family 1（首族）：去掉 D8「非表决者不可写」守卫 ⇒ 临时工的自述写入不再被拒，
    // 场景 g6-nonmember 的具名拒绝断言必红。锚点＝vibe-math-v5r.js 的 L5342-L5345 逐字块。
    name: 'G6: the D8 non-voter guard is gone (a temp can write a self-report)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 'g6-nonmember' },
    from: `      if (!(m.kind === 'academician' || m.kind === 'researcher')) {
        // D8：列席／受邀／临时工不可写（可读工作状态）
        return { ok: false, code: 'V5_NOT_VOTER', message: '列席／受邀／临时工不可写自述（G6；与 D8 一致）；你仍可查看工作状态' }
      }`,
    to: `    // MUTANT (G6 family 1): the D8 non-voter guard is gone`,
    expect: /G6-nonmember：临时工写入被拒/,
  },
  {
    name: "G6: the ownership check is gone (another member becomes writable)",
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: "g6-other" },
    from: "if (targetId && targetId !== String(memberId || '')) {",
    to: "if (false) {",
    expect: /G6-other：试图修改他人/,
  },
  {
    name: "G6: the deviation label disappears (the view no longer marks a deviation)",
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: "g6-history-deviation" },
    from: "deviationLabel: r.deviation ? '已偏离院士设定' : '',",
    to: "deviationLabel: '',",
    expect: /G6-history-deviation：查看面标注 deviationLabel/,
  },
  {
    name: "G6: the view surface leaks a private field (the whitelist must catch it)",
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: "g6-view" },
    from: "deviation: r.deviation || null,",
    to: "deviation: r.deviation || null, privateNote: 'MUTANT',",
    expect: /G6-view：roster 成员字段/,
  },
  {
    name: "G6: the idempotent self-report stops reporting deduped",
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: "g6-self" },
    from: "return { ok: true, deduped: true, member: m.id, fields: fieldsOf(next), times: timesOf(next),",
    to: "return { ok: true, member: m.id, fields: fieldsOf(next), times: timesOf(next),",
    expect: /G6-self：同值再提交 ⇒ deduped:true/,
  },
  {
    // G6 family 2：**最外层承载行**（工具入口的时键检查；下游被它短路，故锚内层＝空变异）。
    // 锚点内容与产品同步：时键检查已加固为大小写不敏感（`/(At|Ms)$/i`）；本条只把 `At` **收窄掉**（`to`）。
    name: 'G6: the entry-level time-key guard narrows to Ms (a client-supplied subgoalAt slips through)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 'g6-time' },
    from: "const timeKeys = Object.keys(args).filter((k) => /(At|Ms)$/i.test(String(k)))",
    to: "const timeKeys = Object.keys(args).filter((k) => /Ms$/.test(String(k)))",
    expect: /G6-time：请求自带 subgoalAt/,
  },
  {
    name: 'SCEN d3-silence: the participation gate is short-circuited (silence no longer blocks a chaired end)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 'd3-silence' },
    from: 'if (base.silent.length) {',
    to: 'if (false) {',
    expect: /D3：未表态名单被列出/,
  },
  {
    name: 'SCEN l4-abstain: an explicit abstention is recorded as a FALSE vote (silence-as-opposition shape)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 'l4-abstain' },
    from: "votes[memberId] = { abstain: true, reason: String(reason || ''), at: now() }",
    to: "votes[memberId] = { prob: 0, reason: String(reason || ''), at: now() }",
    expect: /显式弃权\*\*计入已投\*\*/,
  },
  {
    name: 'SCEN d3-unable: the unable channel is removed (cannot-judge is rejected instead of leaving the denominator)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 'd3-unable' },
    from: "if (raw === 'unable' || raw === '无法判断') {",
    to: 'if (false) {',
    expect: /无法判断者\*\*退出分母\*\*/,
  },
  {
    name: 'SCEN r3-speech: the end-of-debate tool loses its academician gate',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 'r3-speech' },
    // 锚点内容与产品同步：end_verify 的院士门在 S6 起走**单一谓词**（`gateDo(…, 'end_verify', …)`），
    // 旧锚 `if (member.kind !== 'academician') {` 已不存在 ⇒ 改为锚新承载行（整行 → `denyEnd = null`）。
    from: "const denyEnd = await gateDo(member.id, 'end_verify', '只有院士可以显式结束辩论（R10-2a）；其它成员请继续投票、弃权或声明无法判断')",
    to: 'const denyEnd = null',
    expect: /仅院士可结束辩论/,
  },
  // ── S4 family (D1/D2/R4/R5; docs/09 §12 的 S4 行) ─────────────────────────────────────────────
  // 六个族各锚**一处**、各跑**一个** s4-* 场景；`expect` 一律抄自定向实跑的**实际红名**。
  // 静态孪生门在 tests/audit-v5-integrity.mjs（R23–R28，每条一个唯一点 self-probe 变异）。
  {
    // ① 院士门去掉：非院士也能指定代行 ⇒ s4-proxy-denied 的具名拒绝断言必红。
    name: 'S4: the academician gate on chair_proxy is gone (anyone may appoint a proxy)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's4-proxy-denied' },
    // 锚点必须**全局唯一**：S6 的 `grantTool` 也含 `if (me.kind !== 'academician') {` ⇒ 单行锚已 x2。
    // 故改用**三行块**（含 D1 的具名文案，唯一）⇒ 仍是"最外层承载块"、单点。
    from: `      if (me.kind !== 'academician') {
        // D1 硬约束：非院士不得自任主持，也不得指定代行。
        return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: '只有院士可以指定代行（D1）：非院士不得自任主持或代行他人主持' }`,
    to: `      if (me.kind !== 'academician' && false) {
        // D1 硬约束：非院士不得自任主持，也不得指定代行。
        return { ok: false, code: 'V5_NOT_ACADEMICIAN', message: '只有院士可以指定代行（D1）：非院士不得自任主持或代行他人主持' }`,
    expect: /S4-proxy-denied：非院士指定代行/,
  },
  {
    // ② `scope` 放开（唯一取值 'close' 不设防）⇒ 非 close 的请求会被接受 ⇒ s4-proxy-acad 的具名拒绝断言必红。
    name: 'S4: the single-value scope guard on chair_proxy is short-circuited (any scope accepted)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's4-proxy-acad' },
    from: "if (String(args.scope || '') !== CHAIR_SCOPE_CLOSE) {",
    to: 'if (false) {',
    expect: /S4-proxy-acad：scope 只接受 close/,
  },
  {
    // ③ 时键接受（最外层承载行）⇒ 自带 until 的请求通过 ⇒ s4-proxy-time 的拒绝断言必红。
    // 锚点内容与产品同步（`/(At|Ms)$/i`，S4 同源加固后）；本条把整条检查**清空**（`to`）。
    name: 'S4: the chair-proxy entry-level time-key guard accepts a client-supplied …At/…Ms/until',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's4-proxy-time' },
    from: "const stampKeys = Object.keys(args).filter((k) => /(At|Ms)$/i.test(String(k)) || String(k) === 'until')",
    to: 'const stampKeys = []',
    expect: /S4-proxy-time：请求自带 until/,
  },
  {
    // ④ `chairReplyPending` 抹掉（假装已回填）⇒ s4-objection 的可见性断言必红。
    name: 'S4: the objection stops marking its reply as pending (it would look already answered)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's4-objection' },
    from: 'const rec = { by: me.id, at: now(), why, chairReply: null, chairReplyPending: true }',
    to: 'const rec = { by: me.id, at: now(), why, chairReply: null, chairReplyPending: false }',
    expect: /S4-objection：chairReplyPending:true 必须可见/,
  },
  {
    // ⑤ 主持权重接入判定（R5 违规）：代行被算成一张**真票** ⇒ 边界票型从"未定论"翻成"真" ⇒
    //    s4-no-weight 的"同一票型结论相同"断言必红（锚在承载可观测行为的最外层：票数聚合的返回值）。
    name: 'S4/R5: the chair proxy is counted as an extra TRUE vote in aggregateOpinion (the chair is weighted)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's4-no-weight' },
    from: '        m, P, Peff, bTrue, bFalse, abstain, estimates, mean,',
    to: '        m, P, Peff, bTrue: bTrue + (inst().chair ? 1 : 0), bFalse, abstain, estimates, mean,',
    expect: /S4-no-weight：主持\/代行不改变结论/,
  },
  {
    // ⑥ 幂等分支去掉（代行）⇒ 同值重复不再 deduped ⇒ s4-idempotent 的幂等断言必红。
    name: 'S4: the chair-proxy idempotent branch stops reporting deduped',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's4-idempotent' },
    from: 'return { ok: true, deduped: true, chair: cur, chairProxy: proxyId,',
    to: 'return { ok: true, chair: cur, chairProxy: proxyId,',
    expect: /S4-idempotent：代行同值重复/,
  },
  // ── S5 family (R1/D10；docs/09 §12 的 S5 行) ───────────────────────────────────────────────────
  // 六个族各锚**一处**、各跑**一个** s5-* 场景；`expect` 一律抄自定向实跑的**实际红名**。
  // 静态孪生门在 tests/audit-v5-integrity.mjs（R29–R33，每条一个唯一点 self-probe 变异）。
  {
    // ① 一次性判据去掉 ⇒ 同一静止片段内每轮都重发提示 ⇒ s5-notice-once 的"不得重发"断言必红。
    name: 'S5: the stall notice loses its per-episode key (it repeats every scheduling pass)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's5-notice-once' },
    from: 'if (prev && Number(prev.sinceAt) === sinceAt) return false',
    to: 'if (false) return false',
    expect: /S5-notice-once：同一静止片段内不得重发/,
  },
  {
    // ② 恢复"静止自动召集会议"（R1/D10 违规的正身）⇒ s5-stall-notice 的"会议不变"断言必红。
    name: 'S5: the stalled path goes back to convening a meeting on its own (R1/D10)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's5-stall-notice' },
    from: 'await emitStallNotice()',
    to: "await startMeeting('office', { agenda: 'MUTANT: 静止自动召集', kind: 'sync', auto: true })",
    expect: /S5-stall-notice：会议不变/,
  },
  {
    // ③ 静止路径自己写"收束记录"（防回归 R32 的**活体**形态）⇒ s5-no-auto-close 的 undecided 不变断言必红。
    //    用**累积**写入（每轮一个新 id）而不只写一次：单次写入可能落在 before 快照之前而变成空变异。
    name: 'S5: the stalled path starts writing closure records on its own (顺手收束)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's5-no-auto-close' },
    from: 'const noticeMs = stallNoticeMs()',
    to: "const noticeMs = stallNoticeMs(); if (noticeMs > 0) await putVerdict('p-s5m-' + String(Object.keys(inst().verdicts || {}).length), { closed: true, outcome: 'undecided', m: 0, P: 0 })",
    expect: /S5-no-auto-close：静止期间 undecided 不变/,
  },
  {
    // ④ 「谁在等谁」清单置空 ⇒ s5-waiting-graph 的"含被挡者 id"断言必红。
    name: 'S5: the notice stops listing who is waiting for whom',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's5-waiting-graph' },
    from: 'return out.slice(0, 3)',
    to: 'return []',
    expect: /S5-waiting-graph：提示须列出被挡者与阻挡者 id/,
  },
  {
    // ⑤ 静止路径代成员表态（防回归 R33 的**活体**形态）⇒ s5-no-auto-close 的 solveVotes 不变断言必红。
    //    同样是**累积**写入（每轮加一个新 key）：单次写入可能先于 before 快照 ⇒ 空变异。
    name: 'S5: the stalled path starts speaking for a member (it writes solve votes)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's5-no-auto-close' },
    from: 'const noticeMs = stallNoticeMs()',
    to: "const noticeMs = stallNoticeMs(); if (noticeMs > 0) await putSolve({ member: 'p-s5m-' + String(Object.keys(inst().solve || {}).length), value: true })",
    expect: /S5-no-auto-close：静止期间 solveVotes 不变/,
  },
  {
    // ⑥ 耐久标记不走 fold 白名单（丢失）⇒ 每轮都当"新片段"重发 ⇒ s5-notice-once 的"不得重发"必红。
    name: 'S5: the durable stall marker stops passing the fold whitelist (the key is lost)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's5-notice-once' },
    from: 'if (patch.stallNotice !== undefined) n.stallNotice = patch.stallNotice === null ? null : Object.assign({}, patch.stallNotice)',
    to: 'if (false) n.stallNotice = patch.stallNotice',
    expect: /S5-notice-once：同一静止片段内不得重发/,
  },
  {
    // ⑦ "负值＝关闭"被静默吃掉（回到"非正即删"守卫）⇒ 负值进不了参数 ⇒ s5-stall-notice 的
    //    "负值须真的写进参数"断言必红（**最外层承载行**：applyParams 的非正守卫；短路 stallNoticeMs()
    //    的负值分支是内层替代，但被外层先吃掉才是历史真缺陷的形态）。
    name: 'S5: the threshold stops accepting a negative value (the OFF switch is silently dropped again)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's5-stall-notice' },
    from: "for (const k of ['activityTimeoutMs', 'chatDigestMs', 'leanTimeoutMs']) {",
    to: "for (const k of ['activityTimeoutMs', 'stallAutoMeetingMs', 'chatDigestMs', 'leanTimeoutMs']) {",
    expect: /S5-stall-notice：负值须真的写进参数/,
  },
  // ── S6 family (D1/D2/D6/D8；docs/09 §12 的 S6 行) ─────────────────────────────────────────────
  // 六个族各锚**一处**、各跑**一个** s6-* 场景；`expect` 一律抄自定向实跑的**实际红名**。
  // 静态孪生门在 tests/audit-v5-integrity.mjs（R34–R38，每条一个唯一点 self-probe 变异）。
  {
    // ① 过期判据去掉（once 用掉仍生效）⇒ s6-scope-expire 的"用掉后自动失效"必红。
    name: 'S6: a once-scope grant stays effective after it was used (expiry is no longer event-derived)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's6-scope-expire' },
    from: "if (g.grantScope === 'once') return Number(g.usedAt || 0) === 0",
    to: "if (g.grantScope === 'once') return true",
    expect: /S6-scope-expire：once 用掉后自动失效/,
  },
  {
    // ② revoke 不落台账（撤回不生效）⇒ s6-revoke 的"撤回后立即回到默认表"必红。
    name: 'S6: revoke stops writing the ledger (the permission is not actually taken back)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's6-revoke' },
    from: 'await patchInstitute({ grants: (l) => (Array.isArray(l) ? l : []).map((g) => (g && g.id === hit.id ? Object.assign({}, g, { revokedAt: at, revokedBy: me.id, revokeWhy: why }) : g)) })',
    to: 'void hit',
    expect: /S6-revoke：撤回后立即回到默认表/,
  },
  {
    // ③ 票权可授（把生效授权的对象算成**额外票权**）⇒ s6-no-vote-power 的"票权集合不变"必红。
    name: 'S6: an active grant is counted as extra vote power (the grantee is pushed into the electorate)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's6-no-vote-power' },
    from: "const voters = () => activeMembers().filter((m) => m.kind === 'academician' || m.kind === 'researcher')",
    to: "const voters = () => activeMembers().filter((m) => m.kind === 'academician' || m.kind === 'researcher').concat(grantsList().filter((g) => grantActive(g)).map((g) => ({ id: g.to, kind: 'researcher', phase: 'active' })))",
    expect: /S6-no-vote-power：票权集合不变/,
  },
  {
    // ④ D8 守卫去掉（非成员可被授权）⇒ s6-no-vote-power 的"临时工不可被授权"必红。
    name: 'S6: the D8 roster gate on the grantee is gone (a non-member could be authorized)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's6-no-vote-power' },
    from: "if (!(target.kind === 'academician' || target.kind === 'researcher')) {",
    to: 'if (false) {',
    expect: /S6-no-vote-power：临时工不可被授权/,
  },
  {
    // ⑤ meeting 范围不再跟会议走（**最外层承载块**：`expiredAt` 判定 ＋ `meetingId` 判定两行一起改，
    //    单点＝一个连续块）⇒ 会议收束后仍生效 ⇒ s6-scope-expire 的"会议收束后自动失效"必红。
    name: 'S6: a meeting-scoped grant ignores the live meeting (it survives the meeting it was granted for)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's6-scope-expire' },
    from: `      if (Number(g.expiredAt || 0) > 0) return false
      if (g.grantScope === 'once') return Number(g.usedAt || 0) === 0
      if (g.grantScope === 'meeting') return !!meeting && String(g.meetingId || '') === String(meeting.id)`,
    to: `      if (g.grantScope === 'once') return Number(g.usedAt || 0) === 0
      if (g.grantScope === 'meeting') return true`,
    expect: /S6-scope-expire：会议收束后自动失效/,
  },
  {
    // ⑥ 台账不走 fold 白名单（静默丢弃）⇒ `got.entry` 永远为 null ⇒ s6-grant-ok 的**首条**断言
    //    "院士可授（once）"先红（实测红名即此条）。
    name: 'S6: the authorization ledger stops passing the fold whitelist (the grant is silently dropped)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's6-grant-ok' },
    from: 'if (patch.grants !== undefined) {',
    to: 'if (false) {',
    expect: /S6-grant-ok：院士可授/,
  },
  {
    // ⑧ S4 同源加固的**回归族**（Lead 追加）：把代行的时键检查改回**大小写敏感** ⇒
    //    全小写 `expires_at` 被静默接受 ⇒ s4-proxy-time 的新断言必红。
    //    锚点含 `|| String(k) === 'until'` ⇒ 与 `grantTool` 的同类行**不同文**，全局唯一。
    name: 'S4: the proxy time-key check becomes case-sensitive again (a lower-case expires_at slips through)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's4-proxy-time' },
    from: "const stampKeys = Object.keys(args).filter((k) => /(At|Ms)$/i.test(String(k)) || String(k) === 'until')",
    to: "const stampKeys = Object.keys(args).filter((k) => /(At|Ms)$/.test(String(k)) || String(k) === 'until')",
    expect: /S4-proxy-time：全小写 expires_at 也不得静默通过/,
  },
  {
    // ⑨ G6 同源加固的**回归族**（Lead 追加）：把**自述工具**的时键检查改回**大小写敏感** ⇒
    //    全小写 `expires_at` 被静默接受 ⇒ g6-time 的新断言必红。
    //    锚点用 `Object.keys(args)`（工具面）⇒ 与 `selfReport` 内部的 `Object.keys(a)` 行**不同文**，全局唯一。
    name: 'G6: the self-report time-key check becomes case-sensitive again (a lower-case expires_at slips through)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 'g6-time' },
    from: "const timeKeys = Object.keys(args).filter((k) => /(At|Ms)$/i.test(String(k)))",
    to: "const timeKeys = Object.keys(args).filter((k) => /(At|Ms)$/.test(String(k)))",
    expect: /G6-time：全小写 expires_at 也不得静默通过/,
  },
  // ── S7 family (D3/D4/R9/K13；docs/09 §12 的 S7 行) ───────────────────────────────────────────
  // 六个族各锚**一处**、各跑**一个** s7-* 场景；`expect` 一律抄自定向实跑的**实际红名**。
  // 静态孪生门在 tests/audit-v5-integrity.mjs（R39–R43，每条一个唯一点 self-probe 变异）。
  {
    // ① 门槛混用：把**结题门**（quorumM）折进 `settled` ⇒ s7-two-thresholds 的"结果里 settled 与
    //    quorum_reached 同时成立/未成立"必红（K13 禁止两门槛混用）。
    name: 'S7: the closure gate (quorum m) is folded into `settled` (the two thresholds are mixed)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's7-two-thresholds' },
    from: 'const settled = ballotSettled(b)',
    to: 'const settled = cast >= quorumM()',
    expect: /S7-two-thresholds：结果里 settled/,
  },
  {
    // ② 未达门槛仍报成立（outcome 恒 recorded）⇒ s7-min-votes 的"未达最少收集票 ⇒ 不形成结论"必红。
    name: 'S7: an unmet min_votes still reports the poll as settled (a conclusion would be inferred)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's7-min-votes' },
    from: "outcome: settled ? 'recorded' : 'unsettled'",
    to: "outcome: 'recorded'",
    expect: /S7-min-votes：未达最少收集票/,
  },
  {
    // ③ 票权可扩（去掉在册票权门）⇒ 临时工也能投票 ⇒ s7-secret-nonvoter 的"临时工 ⇒ V5_NOT_VOTER"必红。
    name: 'S7: the electorate gate on the poll vote is gone (a non-member could vote)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's7-secret-nonvoter' },
    from: '      if (!voters().some((m) => m.id === memberId)) {',
    to: '      if (false) {',
    expect: /S7-secret-nonvoter：临时工 ⇒ V5_NOT_VOTER/,
  },
  {
    // ④ **自动结算**（板不等院士显式动作，自己把自己关掉）⇒ s7-open-six 的"**开票前可见**"
    //    （status.poll.open=true）必红。注：**定时器变体**由 R43 的静态门覆盖（任何"到点调用
    //    `pollCloseTool`"都会被它抓住）；族这里用**同步**自动结算，避免 5 ms 定时器落在场景之后而变成空变异。
    name: 'S7: the board is settled automatically instead of waiting for the academician (automatic settlement)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's7-open-six' },
    from: '      return { ok: true, ballot: ballotView(got.entry) }',
    to: "      await pollCloseTool(me.id, { ballot_id: got.entry.id, reason: 'MUTANT: 自动结算' }); return { ok: true, ballot: ballotView(got.entry) }",
    expect: /S7-open-six：\*\*开票前可见\*\*/,
  },
  {
    // ⑤ secret 泄漏（不管记名与否都带上逐人选择）⇒ s7-secret-nonvoter 的**首条**断言
    //    "不记名板建立且回执不含逐人选择"先红（实测红名即此条；`(true) ?` 保持语法有效）。
    name: 'S7: a secret board exposes who chose what (the tally is no longer the only public face)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's7-secret-nonvoter' },
    from: '        ballot: named ? (b.votes || []).map((v) => ({',
    to: '        ballot: (true) ? (b.votes || []).map((v) => ({',
    expect: /S7-secret-nonvoter：不记名板建立且回执不含逐人选择/,
  },
  {
    // ⑥ 板不走 fold 白名单（静默丢弃）⇒ `got.entry` 恒为 null ⇒ s7-open-six 的**首条**断言
    //    "六项规则快照齐全"先红（实测红名即此条）。
    name: 'S7: the poll-board ledger stops passing the fold whitelist (boards and votes are dropped)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's7-open-six' },
    from: 'if (patch.ballots !== undefined) {',
    to: 'if (false) {',
    expect: /S7-open-six：六项规则快照齐全/,
  },
  // ── S8 family (R3/K12/B9；docs/09 §12 的 S8 行) ─────────────────────────────────────────────
  // 六个族各锚**一处**、各跑**一个** s8-* 场景；`expect` 一律抄自定向实跑的**实际红名**。
  // 静态孪生门在 tests/audit-v5-integrity.mjs（R44–R48，每条一个唯一点 self-probe 变异）。
  {
    // ① 冻结判据失效（有 open 板也放行）⇒ s8-freeze-say 的"成员发言 ⇒ 具名拒绝"必红。
    name: 'S8: the freeze predicate stops looking at the open ballot (speech flows during a ballot)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's8-freeze-say' },
    from: '    function speechFrozen() {\n      const b = openBallot()',
    to: '    function speechFrozen() {\n      const b = null',
    expect: /S8-freeze-say：成员发言 ⇒ 具名拒绝/,
  },
  {
    // ② 门塞进 `say()` 内部（**系统消息也被挡**）⇒ s8-system-not-blocked 的"表决期仍可分派任务"必红。
    name: 'S8: the freeze is enforced inside say() (framework messages would be blocked too)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's8-system-not-blocked' },
    from: '    async function say(from, opts) {\n      const text = String((opts && opts.text) || \'\').trim()',
    to: "    async function say(from, opts) {\n      if (speechFrozen().frozen) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'MUTANT: 系统消息也被挡' }\n      const text = String((opts && opts.text) || '').trim()",
    expect: /S8-system-not-blocked：院士发言不受限/,
  },
  {
    // ③ 冻结**顺手收束**（门禁路径直接收掉会议）⇒ s8-no-phase-change 的"不改会议阶段"必红。
    name: 'S8: the gate itself closes the meeting (the freeze is no longer passive)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's8-no-phase-change' },
    from: '      const f = speechFrozen()\n      if (!f.frozen) return null',
    to: '      const f = speechFrozen()\n      if (f.frozen && meeting) void finalizeMeeting(meeting)\n      if (!f.frozen) return null',
    expect: /S8-no-phase-change：冻结\*\*不改会议阶段\*\*/,
  },
  {
    // ④ 冻结**永不解冻**（收束表决后仍禁言）⇒ s8-freeze-say 的"收束后自动解冻"必红。
    //    （"冻结期清空举手队列"由 R44 的静态门守着：门禁路径出现 `delete meeting.hands` 即红。）
    name: 'S8: the freeze never lifts (speech stays blocked after the ballot closes)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's8-freeze-say' },
    from: '    function speechFrozen() {\n      const b = openBallot()',
    to: '    function speechFrozen() {\n      return { frozen: true, ballotId: \'mutant\', since: 0, question: \'\' }',
    expect: /S8-freeze-say：收束后自动解冻/,
  },
  {
    // ⑤ 结构化 `minutes{}` 写回丢失 ⇒ s8-minutes-zones 的"结构化 `minutes.speechZone`/`voteZone`"必红
    //    （渲染分区那半由 R47 的静态门守着）。
    name: 'S8: the structured minutes write-back is dropped (the zones live only in the rendered file)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's8-minutes-zones' },
    from: '          minutes: { at: now(), speechZone, voteZone, secretary: secWho, entries: secEntries, level: lvl },',
    to: '          minutes: { at: now(), secretary: secWho, entries: secEntries, level: lvl },',
    expect: /S8-minutes-zones：结构化 `minutes.speechZone`/,
  },
  {
    // ⑥ 冻结范围失控：**院士也被禁言**（chair-first 例外被删）⇒ s8-exception-path 的"院士/所办不受限"必红。
    //    注：**"到点自动解除"**这一形态由 **R45 的静态门**守着（门禁路径出现任何 `setTimeout`/`armHeartbeat`
    //    即红）——行为级用定时器会要么落在场景之后（空变异）、要么让子进程崩溃（无按名红名），
    //    与 S7 族④的教训一致。
    name: 'S8: the chair is blocked too (the chair-first exemption is dropped from the gate)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's8-exception-path' },
    from: '      if (isOffice(callerId) || (m && m.kind === \'academician\')) return null',
    to: '      if (isOffice(callerId)) return null',
    expect: /S8-exception-path：院士\/所办不受限/,
  },
  // ── S9 family (D5/D5a/U3；docs/09 §12 的 S9 行) ─────────────────────────────────────────────
  // 六个族各锚**一处**、各跑**一个** s9-* 场景；`expect` 一律抄自定向实跑的**实际红名**。
  // 静态孪生门在 tests/audit-v5-integrity.mjs（R49–R54，每条一个唯一点 self-probe 变异）。
  {
    // ① 少数意见**不入档**（盖章点失效）⇒ s9-minority-archive 的"少数意见一等入档"必红。
    name: 'S9: the seal point stops sealing (closed records carry no minority archive)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's9-minority-archive' },
    from: '    const putVerdict = (target, record) => commit(EV.verdict, { target, record: sealRecord(record) })',
    to: '    const putVerdict = (target, record) => commit(EV.verdict, { target, record })',
    expect: /S9\/D5：\*\*少数意见一等入档\*\*/,
  },
  {
    // ② 资格**只看角色面**（胜方规则不再从记录派生；有胜方时也放行任何参与者）⇒ 非胜方拒绝必红。
    name: 'S9: eligibility stops being derived from the record (a non-winner is accepted)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's9-reconsider-winner-only' },
    from: "      const hasWinner = outcome === 'true' || outcome === 'false'",
    to: '      const hasWinner = false',
    expect: /S9\/D5：\*\*非胜方（少数意见者）被具名拒绝\*\*/,
  },
  {
    // ③ **无胜方时拒绝受理**（违反 D5a 硬约束）⇒ s9-reconsider-undecided 的"任一参与者可提"必红。
    name: 'S9: a winnerless verdict refuses reconsideration (the D5a hard constraint is broken)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's9-reconsider-undecided' },
    from: "      let eligibility = 'any-participant'",
    to: "      let eligibility = 'any-participant'\n      if (!hasWinner) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'MUTANT: 无胜方不受理' }",
    expect: /S9\/D5a：\*\*无胜方 ⇒ 任一参与者可提\*\*/,
  },
  {
    // ④ 门槛**被降低**（max 变 min）⇒ s9-threshold-only-up 的"只升不降"必红。
    name: 'S9: the reconsideration threshold can be lowered (the only-up rule becomes a min)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's9-threshold-only-up' },
    from: '      const after = Math.max(before, floor, cap)',
    to: '      const after = Math.min(before, floor, cap)',
    expect: /S9\/U3：生效门槛/,
  },
  {
    // ⑤ **不记名板**的复议漏出逐人选择 ⇒ s9-secret-no-identity 的"只带聚合面"必红。
    name: 'S9: a SECRET board starts leaking who chose what through the reconsideration receipt',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's9-secret-no-identity' },
    from: "          secretSource: bSecret, eligibility: 'board-participant',",
    to: "          secretSource: bSecret, eligibility: 'board-participant', choices: bVotes.map((v) => v.choices),",
    expect: /S9\/R54：复议回执\*\*只带聚合面\*\*/,
  },
  {
    // ⑥ 复议**覆盖**旧结论（历史不留档）⇒ s9-audit-append-only 的"全部留档"必红。
    name: 'S9: a reconsideration overwrites the previous round (the history is not append-only)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's9-audit-append-only' },
    from: '        previousRounds: (Array.isArray(rec.previousRounds) ? rec.previousRounds : []).concat([previous]),',
    to: '        previousRounds: [],',
    expect: /S9\/R7：旧结论／旧票面／旧少数意见\*\*全部留档\*\*/,
  },
  // ── S10 family (D6/G5；docs/09 §12 的 S10 行) ───────────────────────────────────────────────
  // 六个族各锚**一处**、各跑**一个** s10-* 场景；`expect` 一律抄自定向实跑的**实际红名**。
  // 静态孪生门在 tests/audit-v5-integrity.mjs（R55–R60，每条一个唯一点 self-probe 变异）。
  {
    // ① 摘句不再截断（**全文搬运**）⇒ s10-quote-same-meeting 的"确定性截断"必红。
    name: 'S10: the excerpt stops being truncated (the quote copies the whole text)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's10-quote-same-meeting' },
    from: '        ? { excerpt: s.slice(0, QUOTE_EXCERPT_MAX), truncated: true }',
    to: '        ? { excerpt: s, truncated: true }',
    expect: /S10\/D6：摘句\*\*确定性截断\*\*/,
  },
  {
    // ② **跨会议/跨域**引用被放行（同域边界失效）⇒ s10-cross-meeting-refused 的"具名拒绝"必红。
    name: 'S10: a cross-meeting anchor is accepted (the same-meeting boundary is dropped)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's10-cross-meeting-refused' },
    from: "          if (String(got.meetingId || '') !== curMeetingId) {",
    to: '          if (false) {',
    expect: /S10\/D6：跨会议引用\*\*具名拒绝\*\*/,
  },
  {
    // ③ **私聊可直接引用**（补记门失效）⇒ s10-dm-not-quotable 的"私聊不得作为引用来源"必红。
    name: 'S10: a private message becomes directly quotable (the supplement gate is dropped)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's10-dm-not-quotable' },
    from: "        if (String(found.kind) === 'dm') {",
    to: '        if (false) {',
    expect: /S10\/D6\+G5：私聊\*\*不得\*\*作为引用来源/,
  },
  {
    // ④ **条数上限失效**（任意条数都收）⇒ s10-quote-limits 的"超条数具名拒绝"必红。
    name: 'S10: the per-message quote cap disappears (any number of quotes is accepted)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's10-quote-limits' },
    from: '        if (refs.length > quotesPerMessageMax()) {',
    to: '        if (false) {',
    expect: /S10\/D6：超条数\*\*具名拒绝\*\*/,
  },
  {
    // ⑤ **悬空锚被接受**（消息被凭空发明）⇒ s10-dangling-refused 的"悬空消息锚具名拒"必红。
    name: 'S10: a dangling message anchor is accepted (the quoted message is invented)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's10-dangling-refused' },
    from: '        const found = (inst().messages || []).filter((x) => x && String(x.id) === id)[0]',
    to: "        const found = (inst().messages || []).filter((x) => x && String(x.id) === id)[0] || { id, from: 'r-1', to: 'all', kind: 'chat', text: 'MUTANT: 伪造的悬空消息', at: 0 }",
    expect: /S10\/D6：悬空消息锚\*\*具名拒\*\*/,
  },
  {
    // ⑥ 引用**顺手驱动会议阶段**（不再被动）⇒ s10-no-drive 的"引用不改会议阶段"必红。
    name: 'S10: the quote path starts driving the meeting phase',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's10-no-drive' },
    from: '      const sent = await say(callerId, { to, text: a.text, kind, quote, quotes, supplementOf })',
    to: "      if (meeting) meeting.phase = 'open-floor'\n      const sent = await say(callerId, { to, text: a.text, kind, quote, quotes, supplementOf })",
    expect: /S10：引用\*\*不改会议阶段\*\*/,
  },
  // ── S11 family (GAPS 29；docs/09 §12 的 S11 行) ─────────────────────────────────────────────
  // 六个族各锚**一处**、各跑**一个** s11-* 场景；`expect` 一律抄自定向实跑的**实际红名**。
  // 静态孪生门在 tests/audit-v5-integrity.mjs（R61–R66，每条一个唯一点 self-probe 变异）。
  {
    // ① **允许自任**（记录退化为主持人的叙述）⇒ s11-self-refused 的"院士不得自任"必红。
    name: 'S11: the chair may appoint itself (recording collapses back into the chair)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's11-self-refused' },
    from: "      if (!revoke && (m.kind === 'academician' || isOffice(who))) {",
    to: '      if (false) {',
    expect: /S11\/GAPS 29：\*\*院士不得自任\*\*/,
  },
  {
    // ② 台账**漏出 fold 白名单**（指定被静默丢弃）⇒ s11-appoint 的"只读面可见"必红。
    name: 'S11: the secretary ledger stops passing the fold whitelist (appointments are dropped)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's11-appoint' },
    from: '          if (patch.secretaries !== undefined) {',
    to: '          if (false) {',
    expect: /S11：台账 append-only 一条/,
  },
  {
    // ③ **#54 权限放宽**（任何人都能写纪要）⇒ s11-only-academician 的"非记录人具名拒"必红。
    name: 'S11: writing minutes entries stops requiring the academician or the secretary',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's11-only-academician' },
    from: "      if (command === 'minutes') return acad || (!!meeting && String(meeting.secretary || '') === String(callerId))",
    to: "      if (command === 'minutes') return true",
    expect: /S11\/#27：\*\*非记录人\*\*写条目 ⇒ 具名拒/,
  },
  {
    // ④ 记录人小节**失去独立标题**（两区不再分离）⇒ s11-zones-and-anchors 的"两区仍在"必红。
    name: 'S11: the recorder section loses its own heading (the minutes zones are no longer separate)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's11-zones-and-anchors' },
    from: "      lines.push('## 记录人补充')\n      lines.push('- 本场等级：'",
    to: "      lines.push('- 本场等级：'",
    expect: /S11×S8：收束后\*\*两区仍在\*\*/,
  },
  {
    // ⑤ **只报缺口**失效（无 `entry` 也照样写）⇒ s11-record-entries 的"只报缺口"必红。
    name: 'S11: the gap report is skipped (a complete-looking minutes could be fabricated)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's11-record-entries' },
    from: '      if (!text) {',
    to: '      if (false) {',
    expect: /S11\/R7：无 `entry` ⇒ \*\*只报缺口\*\*/,
  },
  {
    // ⑥ **撤销非幂等**（第二次报错）⇒ s11-revoke-idempotent 的"再撤销 ⇒ 幂等"必红。
    name: 'S11: revoking twice is no longer idempotent (the second revocation errors)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's11-revoke-idempotent' },
    from: "          return { ok: true, deduped: true, secretary: null, meetingId: mtId, message: '当前未指定记录人（撤销幂等）' }",
    to: "          return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'MUTANT: 撤销非幂等' }",
    expect: /S11：\*\*再撤销 ⇒ 幂等\*\*/,
  },
  // ── S12 family (D7/GAPS 22；docs/09 §12 的 S12 行) ──────────────────────────────────────────
  // 六个族各锚**一处**、各跑**一个** s12-* 场景；`expect` 一律抄自定向实跑的**实际红名**。
  // 静态孪生门在 tests/audit-v5-integrity.mjs（R67–R70，每条一个唯一点 self-probe 变异）。
  {
    // ① 等级**不再派生**（决议类会议降级为简流程）⇒ s12-level-derived 的"正式"必红。
    name: 'S12: the level stops being derived from the meeting kind (a decision meeting becomes light)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's12-level-derived' },
    from: "    const FORMAL_MEETING_KINDS = ['verify-request', 'solve-vote']",
    to: '    const FORMAL_MEETING_KINDS = []',
    expect: /S12\/D7：`kind=solve-vote` ⇒ \*\*正式\*\*/,
  },
  {
    // ② **简流程接受实体定论**（D7 拒绝被摘掉）⇒ s12-light-no-truth 的"不得落决议"必红。
    name: 'S12: a light meeting accepts an entity conclusion (the D7 refusal is dropped)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's12-light-no-truth' },
    from: "      if (entryKind === 'decision' && isLightMeeting()) return truthWriteRefusal('不得落**决议**条目')",
    to: "      if (false) return truthWriteRefusal('不得落**决议**条目')",
    expect: /S12\/D7：简流程\*\*不得落决议条目\*\*/,
  },
  {
    // ③ **任何人都能设等级**（院士门被摘掉）⇒ s12-acad-only 的"非院士具名拒"必红。
    name: 'S12: anyone may set the meeting level (the academician gate is dropped)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's12-acad-only' },
    from: "      if (command === 'meeting_level') return acad",
    to: "      if (command === 'meeting_level') return true",
    expect: /S12\/#3★：非院士设定等级 ⇒ 具名拒/,
  },
  {
    // ④ **设等级开始驱动会议**（顺手收束）⇒ s12-no-drive 的"不改会议阶段"必红。
    name: 'S12: setting the level starts driving the meeting (it closes the meeting)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's12-no-drive' },
    from: '      meeting.formalAgenda = want',
    to: "      meeting.formalAgenda = want\n      await finalizeMeeting(meeting, 'level-change')",
    expect: /S12：等级变更\*\*不改会议阶段\*\*/,
  },
  {
    // ⑤ **同值幂等失效**（重复设定也当"真变更"）⇒ s12-idempotent 的"同值幂等"必红。
    name: 'S12: setting the same level twice stops being idempotent (it always writes an event)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's12-idempotent' },
    from: '      if ((meeting.formalAgenda === true) === want) {',
    to: '      if (false) {',
    expect: /S12：\*\*同值幂等\*\*/,
  },
  {
    // ⑥ 等级在 `report()` 里**不再可见**（简流程硬约束看不见）⇒ s12-report-visible 必红。
    name: 'S12: the level stops being visible in report() (the light warning disappears)',
    preset: 'vibe-math-v5r',
    suite: 'tests/selfdrive-v5.mjs',
    env: { V5_SCENARIO: 's12-report-visible' },
    from: "          + '｜等级＝' + (meetingLevelOf(m) === 'formal' ? '**正式**（可产出实体定论）' : '**简流程**：' + LIGHT_LEVEL_NOTE))",
    to: "          + '｜等级＝（MUTANT: 不写）')",
    expect: /S12：`report\(\)` \*\*明写\*\*简流程与硬约束/,
  },
]

// ── positive controls: pristine v5r, ONE scenario per child process, each in its own fresh
// workspace (V5_SCENARIO mode). A positive must be GREEN; its family above must redden by name.
const SCENARIOS = ['d3-silence', 'l4-abstain', 'd3-unable', 'r3-speech',
  // S4（D1/D2/R4/R5）：每个 s4-* 场景一个**正控**——原始树的该场景必须绿，对应的族才可能"按名红"。
  's4-proxy-acad', 's4-proxy-denied', 's4-proxy-time', 's4-objection', 's4-no-weight', 's4-idempotent',
  // S5（R1/D10）：每个 s5-* 场景一个正控（静止提示的一次性/不召集/不收束/谁在等谁）。
  's5-stall-notice', 's5-notice-once', 's5-no-auto-close', 's5-waiting-graph',
  // S6（D1/D2/D6/D8）：每个 s6-* 场景一个正控（授权/撤回复核/到期/票权/私密面边界）。
  's6-grant-ok', 's6-not-granted', 's6-scope-expire', 's6-revoke', 's6-no-vote-power', 's6-d6-boundary',
  // 时间纪律（G6 §7.1＋S4/S6 同源加固）：g6-time 的"大小写不敏感"新断言的正控。
  'g6-time',
  // S7（D3/D4/R9/K13）：每个 s7-* 场景一个正控（六项/单选多选/最少收集票/两门槛/弃权改票/不记名）。
  's7-open-six', 's7-single-multi', 's7-min-votes', 's7-two-thresholds', 's7-abstain-revote', 's7-secret-nonvoter',
  // S8（R3/K12/B9）：每个 s8-* 场景一个正控（禁言/系统消息/不改阶段/票面/纪要分区/例外通道）。
  's8-freeze-say', 's8-system-not-blocked', 's8-no-phase-change', 's8-ballot-unaffected', 's8-minutes-zones', 's8-exception-path',
  // S9（D5/D5a/U3）：每个 s9-* 场景一个正控（少数意见/胜方资格/无胜方/门槛只升/不记名聚合/append-only）。
  's9-minority-archive', 's9-reconsider-winner-only', 's9-reconsider-undecided', 's9-threshold-only-up', 's9-secret-no-identity', 's9-audit-append-only',
  // S10（D6/G5）：每个 s10-* 场景一个正控（同会议引用/跨会议拒/私聊补记/上限折叠/悬空拒/不驱动）。
  's10-quote-same-meeting', 's10-cross-meeting-refused', 's10-dm-not-quotable', 's10-quote-limits', 's10-dangling-refused', 's10-no-drive',
  // S11（GAPS 29）：每个 s11-* 场景一个正控（指定/禁止自任/权限面/条目/两区与锚/撤销幂等）。
  's11-appoint', 's11-self-refused', 's11-only-academician', 's11-record-entries', 's11-zones-and-anchors', 's11-revoke-idempotent',
  // S12（D7/GAPS 22）：每个 s12-* 场景一个正控（派生/简流程不得定论/仅院士/幂等/可见性/不驱动）。
  's12-level-derived', 's12-light-no-truth', 's12-acad-only', 's12-idempotent', 's12-report-visible', 's12-no-drive']
let posRed = 0
// MUTANTS_ONLY=<子串> ⇒ 定向运行：只跑 name 含该子串的族（正控**只在全量模式下跑**，定向模式跳过以省时）。
// 未设变量 ⇒ 行为与今天逐字一致（正控照跑、判据照旧）。
const ONLY = String(process.env.MUTANTS_ONLY || '').trim()
if (ONLY) console.error('mutants: only=' + ONLY + ' (DIRECTED run - 本次为定向运行，非全量证据)')
if (!ONLY) {
for (const sc of SCENARIOS) {
  const dest = join(tmpdir(), 'v5r-scen-' + Math.random().toString(36).slice(2, 10))
  mkdirSync(dest, { recursive: true })
  copyGraph('vibe-math-v5r.js', dest, 'vibe-math-v5r')
  const t0 = Date.now()
  let out = '', code = 0
  try {
    out = execFileSync(process.execPath, ['tests/selfdrive-v5.mjs'], {
      cwd: REPO, encoding: 'utf8', timeout: CHILD_TIMEOUT_MS, killSignal: 'SIGKILL',
      env: Object.assign({}, process.env, { [ENV]: join(dest, 'vibe-math-v5r.js'), V5_SCENARIO: sc }),
    })
  } catch (e) { code = (e && e.status) || 1; out = String((e && e.stdout) || '') + String((e && e.stderr) || '') }
  const ms = Date.now() - t0
  const green = code === 0 && /SCENARIO GREEN: /.test(out)
  if (!green) posRed++
  console.log((green ? '  ok   ' : '  FAIL ') + 'positive v5r scenario ' + sc + ' [' + ms + 'ms]' + (green ? '' : ' :: exit=' + code))
  TIMES.push(['positive:' + sc, ms])
  rmSync(dest, { recursive: true, force: true })
}
console.log('scenario positive controls green: ' + (SCENARIOS.length - posRed) + '/' + SCENARIOS.length)
}
let red = 0
const ALL_FAMILIES = FAMILIES.concat(V5R_FAMILIES)
const SELECTED = ONLY ? ALL_FAMILIES.filter((f) => String(f.name).includes(ONLY)) : ALL_FAMILIES
if (ONLY) {
  if (!SELECTED.length) { console.error('mutants: only=' + ONLY + ' matched 0/' + ALL_FAMILIES.length + ' families - named abort (nothing was run)'); process.exit(2) }
  console.error('mutants: only=' + ONLY + ' families=' + SELECTED.length + '/' + ALL_FAMILIES.length)
}
for (const f of SELECTED) { const ok = runFamily(f); if (ok) red++ }
const totalMs = TIMES.reduce((a, t) => a + t[1], 0)
console.log('')
console.log('mutant families reddening the v5 institute fixes by name: ' + red + '/' + SELECTED.length + (ONLY ? '  (DIRECTED: only=' + ONLY + ' - 非全量证据)' : ''))
console.log('timings: ' + TIMES.map((t) => String(t[0]).split(':')[0] + '=' + t[1] + 'ms').join('  '))
// R15: the audit-checklist row says EVERY family prints this line, and override decisions must quote it
// rather than an external estimate. Same shape as tests/formal-verify-v3.mutants.mjs.
console.log('TOTAL WALL TIME (all families + setup): ' + totalMs + 'ms (' + Math.round(totalMs / 1000) + 's)')
console.log('hangs=[' + hangs.join(' | ') + ']')
console.log('skipped=[' + skipped.join(' | ') + ']')
if (red !== SELECTED.length || skipped.length || hangs.length || (!ONLY && posRed)) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')
