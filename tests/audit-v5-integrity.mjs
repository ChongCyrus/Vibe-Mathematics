// ============================================================
// V5 INTEGRITY AUDIT — static self-check of vibe-math-v5.js against the ways this
// kind of single-file plugin actually breaks:
//   1. a function CALLED but never defined (ReferenceError at runtime only)
//   2. a `params.X` read for a key that DEFAULT_PARAMS never declares (silent undefined)
//   3. a tool handler calling `s.NAME(...)` on the session API object that the session
//      never returns (TypeError only when that tool is used)
//   4. documented error codes that are never raised, and raised codes never documented
//   5. leftover development markers / TODO scaffolding
// Run: node tests/audit-v5-integrity.mjs   (exit 1 on any finding)
// ============================================================
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = new URL('../', import.meta.url)
/**
 * `V5_INTEGRITY_MUTATE` carries a JSON `[rel, from, to]` triple: that ONE repo-relative file is mutated
 * IN MEMORY for one child run. Combined with `--self-probe` this makes every guard below reproducible
 * from OUTSIDE — a verifier no longer has to copy this audit and rewrite its URLs to point it at a
 * mutated copy (R16's request). Same shape as `audit-prompt-invariants.mjs` and the
 * `math-computation-shared --self-probe` pattern.
 *
 * SEAM COVERAGE (R17 measured, both directions): the seam reaches a **plugin** path (a plugin mutation
 * produces 1 finding) AND the **corpus** path (a corpus mutation produces 2 findings) — i.e. it is not
 * limited to the plugin file, and a corpus-only drift is observable from outside too. The corpus is read
 * through the same `readRaw()`, so any new corpus check inherits the seam.
 */
const MUT = process.env.V5_INTEGRITY_MUTATE
function readRaw(rel) {
  let text = readFileSync(new URL(rel, HERE), 'utf8').replace(/\r\n?/g, '\n')
  if (MUT) {
    try {
      const [r, from, to] = JSON.parse(MUT)
      if (r === rel && from) text = text.replace(from, to)
    } catch (e) { /* a malformed mutation is a harness error, not an audit failure */ }
  }
  return text
}

/**
 * Each mutation is a REAL defect shape for one of this audit's guards. `expect` is a substring that MUST
 * appear in the failing run; `control: true` marks the unmutated run, which must stay green.
 */
const SELF_PROBE_MUTATIONS = [
  { name: 'control (no mutation)', rel: '', from: '', to: '', expect: '', control: true },
  {
    name: 'F3: a status() top-level key is renamed (the frozen field surface must redden)',
    rel: 'vibe-math-v5/vibe-math-v5.js',
    from: 'leanNoticesScope: ',
    to: 'leanNoticesScopeRenamed: ',
    expect: 'status() field surface changed',
  },
  {
    name: 'F1: the README resume claim loses its in-instance case (the pairing gate must redden)',
    rel: 'README.md',
    from: '**同实例重建**（宿主丢了子会话、插件实例还在）**继续**原编号',
    to: '**同实例重建**从 1 重新开始',
    expect: 'README resume-claim side missing',
  },
  {
    name: 'F1: a code anchor the README cites is removed (its philosophy gate must redden)',
    rel: 'vibe-math-v5/vibe-math-v5.js',
    from: 'rounds.set(member.id, startRound)',
    to: 'void 0 /* anchor removed (self-probe) */',
    expect: 'philosophy gate missing from the implementation: the founding round is applied only AFTER a successful start',
  },
  {
    name: 'F2/G1: the diagram is mutated back to the pre-G1 inbox order (the pairing gate must redden)',
    rel: 'vibe-math-v5/架构图.md',
    from: '唯一的推进驱动',
    to: '唯一的推进驱动（先 ack 再构造）',
    expect: '架构图 still states the pre-G1 order',
  },
  {
    name: 'F2/G1: the plan is mutated back to the explicit pre-G1 inbox phrasing (the pairing gate must redden)',
    rel: 'vibe-math-v5/实现方案.md',
    from: '**未 ack ⇒ 仍可重投**',
    to: '**先 ack 邮件、再构造**；**未 ack ⇒ 仍可重投**',
    expect: '实现方案.md still states the pre-G1 order',
  },
  {
    name: 'F2/G1: a docs file is mutated back to the named pre-G1 phrasing (the docs-wide gate must redden)',
    rel: 'docs/AUDIT-CHECKLIST.md',
    from: '身份一律显式传递，绝不猜测。',
    to: '身份一律显式传递，绝不猜测。先 ack 再构造',
    expect: 'still states the pre-G1 order',
  },
  {
    name: 'F2/G1: the plan is mutated to re-introduce the pre-G1 re-send contract (the named check must redden)',
    rel: 'vibe-math-v5/实现方案.md',
    from: '`makeFileBackend`',
    to: '`makeFileBackend`（queued 永不重发）',
    expect: 'still states the pre-G1 re-send contract',
  },
  {
    name: 'R10[1]: aggregateOpinion loses its provisional marking (process tallies look like verdicts)',
    rel: "vibe-math-v5r/vibe-math-v5r.js",
    from: 'voters: E, votersAll: E0, provisional: true,',
    to: 'voters: E }',
    expect: 'R10[1]',
  },
  {
    name: 'R10[2]: the endedBy fail-safe is deleted (a process tally could decide again)',
    rel: "vibe-math-v5r/vibe-math-v5r.js",
    from: "if (!endedBy) return Object.assign(base, { outcome: 'undecided', reason: 'R10: 辩论尚未结束（过程票数不构成裁定）' })",
    to: '// R10 fail-safe removed (self-probe)',
    expect: 'R10[2]',
  },
  {
    name: 'R10[5]: the named bound stops being revocable',
    rel: "vibe-math-v5r/vibe-math-v5r.js",
    from: 'revocable: true',
    to: 'revocable: false',
    expect: 'R10[5]',
  },
  {
    name: 'R10[6]: the idle close stops recording its named bound',
    rel: "vibe-math-v5r/vibe-math-v5r.js",
    from: "endedBy: 'bound:idle', bound, closedAt: now(),",
    to: "endedBy: 'bound:idle', closedAt: now(),",
    expect: 'R10[6]',
  },
  {
    name: 'D3: the participation gate is short-circuited (silence would no longer block)',
    rel: "vibe-math-v5r/vibe-math-v5r.js",
    from: 'if (base.silent.length) {',
    to: 'if (false) {',
    expect: 'R11',
  },
  {
    name: 'L4: the explicit abstention channel is removed (0<p<1 would be the only middle ground)',
    rel: "vibe-math-v5r/vibe-math-v5r.js",
    from: "if (raw === 'abstain' || raw === '弃权') {",
    to: 'if (false) {',
    expect: 'R12',
  },
  {
    name: 'D3: the unable declaration no longer leaves the denominator',
    rel: "vibe-math-v5r/vibe-math-v5r.js",
    from: 'const E = E0.filter((id) => !unableMap[id])',
    to: 'const E = E0',
    expect: 'R13',
  },
  {
    name: 'R10-2a: the academician end-of-debate tool is unregistered',
    rel: "vibe-math-v5r/vibe-math-v5r.js",
    from: "registerTool('vibe_v5_end_verify'",
    to: "registerTool('vibe_v5_end_verify_DISABLED'",
    expect: 'R14',
  },
  {
    name: 'R2/C1: the prompt text folds silence into consent again',
    rel: "vibe-math-v5r/vibe-math-v5r.js",
    from: '**沉默不是同意，也不是反对**',
    to: '**沉默视为无异议**',
    expect: 'R15',
  },
  {
    name: 'L4: the reply channel drops the abstain/unable words again (reply path becomes second-class)',
    rel: "vibe-math-v5r/vibe-math-v5r.js",
    from: 'const n = enforced ? 0.5 : (declared === undefined ? declaredWord : declared)',
    to: 'const n = enforced ? 0.5 : declared',
    expect: 'R16',
  },
  {
    name: 'G6: the framework-sets-time refusal is dropped (a user …At would be accepted)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'const timeKeys = Object.keys(args).filter((k) => /(At|Ms)$/i.test(String(k)))',
    to: 'const timeKeys = []',
    expect: 'R18',
  },
  {
    name: 'G6: the self-report command is unregistered',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "registerTool('vibe_v5_self_report'",
    to: "registerTool('vibe_v5_self_report_DISABLED'",
    expect: 'R17',
  },
  {
    name: 'G6: history stops recording the OLD value',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'history.push({ at, by: m.id, field: c.field, old: c.old, next: c.next, reason: String(reason || \'\'), source: src })',
    to: 'history.push({ at, by: m.id, field: c.field, next: c.next })',
    expect: 'R19',
  },
  {
    name: 'G6: deviation is no longer recorded (silent overwrite of the academician overall)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'next.deviation = { at, by: m.id, keptAcademicianValue: ov.old,',
    to: 'next.deviation = null; void ({ at, by: m.id, keptAcademicianValue: ov.old,',
    expect: 'R20',
  },
  {
    name: 'G6: the view stops being audited (no view trail)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'const audit = await selfViewAudit(viewerId,',
    to: 'const audit = []; void (await selfViewAudit(viewerId,',
    expect: 'R21',
  },
  {
    name: 'G6: the idempotent branch stops marking deduped',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'return { ok: true, deduped: true, member: m.id, fields: fieldsOf(next), times: timesOf(next),',
    to: 'return { ok: true, member: m.id, fields: fieldsOf(next), times: timesOf(next),',
    expect: 'R22',
  },
  {
    name: 'S4: the chair-proxy runtime tool (#45) is unregistered',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "registerTool('vibe_v5_chair_proxy'",
    to: "registerTool('vibe_v5_chair_proxy_DISABLED'",
    expect: 'R23',
  },
  {
    name: 'S4/D1: the single-value scope guard is short-circuited (any scope would be accepted)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "if (String(args.scope || '') !== CHAIR_SCOPE_CLOSE) {",
    to: 'if (false) {',
    expect: 'R24',
  },
  {
    name: 'S4/D2: the objection stops marking its reply as PENDING (the reply would look filled in)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'const rec = { by: me.id, at: now(), why, chairReply: null, chairReplyPending: true }',
    to: 'const rec = { by: me.id, at: now(), why, chairReply: null, chairReplyPending: false }',
    expect: 'R25',
  },
  {
    name: 'S4/R5: the chair proxy is added to the true-count inside judgeVerdict (the chair carries weight)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "if (bTrue >= m && bFalse === 0) return Object.assign(base, { outcome: 'true', reason: bTrue + ' >= m=' + m + ', all assert true' })",
    to: "if (bTrue + (inst().chair ? 1 : 0) >= m && bFalse === 0) return Object.assign(base, { outcome: 'true', reason: bTrue + ' >= m=' + m + ', all assert true' })",
    expect: 'R26',
  },
  {
    name: 'S4/D1: appointing a proxy also appends it to the electorate (a proxy would be a new vote)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'await patchInstitute({ chair: rec })',
    to: "await patchInstitute({ chair: rec }); inst().members.push({ id: proxyId, kind: 'researcher', phase: 'active' })",
    expect: 'R27',
  },
  {
    name: 'S4: the chair-proxy idempotent branch stops marking deduped',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'return { ok: true, deduped: true, chair: cur, chairProxy: proxyId,',
    to: 'return { ok: true, chair: cur, chairProxy: proxyId,',
    expect: 'R28',
  },
  {
    name: 'S5: the stalled path goes back to convening a meeting on its own (R1/D10)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'await emitStallNotice()',
    to: "await startMeeting('office', {})",
    expect: 'R29',
  },
  {
    name: 'S5: the stall notice loses its per-episode key (it would repeat every pass)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'if (prev && Number(prev.sinceAt) === sinceAt) return false',
    to: 'if (false) return false',
    expect: 'R30',
  },
  {
    name: 'S5: the notice stops listing who is waiting for whom',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'return out.slice(0, 3)',
    to: 'return []',
    expect: 'R31',
  },
  {
    name: 'S5: the stalled path starts closing things on its own (顺手收束)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'busy.size === 0 && (now() - lastProgressAt) >= noticeMs) {',
    to: 'busy.size === 0 && (now() - lastProgressAt) >= noticeMs) { if (false) await closeVerify(vs, true, {})',
    expect: 'R32',
  },
  {
    name: 'S5: the stalled path starts speaking for a member (writes a solve vote)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'const noticeMs = stallNoticeMs()',
    to: 'const noticeMs = stallNoticeMs(); if (false) await putSolve({})',
    expect: 'R33',
  },
  {
    name: 'S6: the authorization ledger stops passing the fold whitelist (grants are silently dropped)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'if (patch.grants !== undefined) {',
    to: 'if (false) {',
    expect: 'R34',
  },
  {
    name: 'S6: the grantable set is widened to a command guarded by an adjudication-level identity',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "const GRANTABLE_COMMANDS = ['assign', 'prioritize', 'nudge', 'convene']",
    to: "const GRANTABLE_COMMANDS = ['assign', 'prioritize', 'nudge', 'convene', 'end_verify']",
    expect: 'R35',
  },
  {
    name: 'S6: the grant path starts touching the electorate (a grant would look like vote power)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "const dup = grantsList().filter((g) => g && String(g.to || '') === toId",
    to: "void voters().length; const dup = grantsList().filter((g) => g && String(g.to || '') === toId",
    expect: 'R36',
  },
  {
    name: 'S6: the D8 roster gate on the grantee is gone (a non-member could be authorized)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "if (!(target.kind === 'academician' || target.kind === 'researcher')) {",
    to: 'if (false) {',
    expect: 'R37',
  },
  {
    name: 'S6: a once-scope grant stays effective after it was used (expiry is no longer event-derived)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "if (g.grantScope === 'once') return Number(g.usedAt || 0) === 0",
    to: "if (g.grantScope === 'once') return true",
    expect: 'R38',
  },
  {
    name: 'S7: the poll-board ledger stops passing the fold whitelist (boards are silently dropped)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'if (patch.ballots !== undefined) {',
    to: 'if (false) {',
    expect: 'R39',
  },
  {
    name: 'S7: the closure gate is folded into `settled` (the two thresholds are mixed)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: 'const settled = ballotSettled(b)',
    to: 'const settled = cast >= quorumM()',
    expect: 'R40',
  },
  {
    name: 'S7: an unmet min_votes still reports the poll as settled (a truth value would be inferred)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "outcome: settled ? 'recorded' : 'unsettled'",
    to: "outcome: 'recorded'",
    expect: 'R41',
  },
  {
    name: 'S7: the vote path starts consulting the grant ledger (vote power could be delegated)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      if (!voters().some((m) => m.id === memberId)) {",
    to: "      if (!voters().some((m) => m.id === memberId) && !grantEffective(memberId, 'poll_vote')) {",
    expect: 'R42',
  },
  {
    name: 'S7: a secret board starts exposing who chose what (the tally is no longer the only public face)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '        ballot: named ? (b.votes || []).map((v) => ({',
    to: '        ballot: (b.votes || []).map((v) => ({',
    expect: 'R43',
  },
  {
    name: 'S8: the freeze predicate stops looking at the open ballot (speech flows during a ballot)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '    function speechFrozen() {\n      const b = openBallot()',
    to: '    function speechFrozen() {\n      const b = null',
    expect: 'R44',
  },
  {
    name: 'S8: the gate itself starts closing the meeting (the freeze is no longer passive)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '      const f = speechFrozen()\n      if (!f.frozen) return null',
    to: '      const f = speechFrozen()\n      if (f.frozen && meeting) void finalizeMeeting(meeting)\n      if (!f.frozen) return null',
    expect: 'R45',
  },
  {
    name: 'S8: the gate starts writing a solve vote (speech would be folded into a ballot)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '      const f = speechFrozen()\n      if (!f.frozen) return null',
    to: "      const f = speechFrozen()\n      if (f.frozen) void putSolve({ member: 'mutant', value: true })\n      if (!f.frozen) return null",
    expect: 'R46',
  },
  {
    name: 'S8: the minutes lose the speech zone header (the zones are no longer separated)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      lines.push('## 发言区')",
    to: "      lines.push('## 发言')",
    expect: 'R47',
  },
  {
    name: 'S8: the freeze is enforced inside say() (framework messages would be blocked too)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '    async function say(from, opts) {\n      const text = String((opts && opts.text) || \'\').trim()',
    to: "    async function say(from, opts) {\n      if (speechFrozen().frozen) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'MUTANT: 系统消息也被挡' }\n      const text = String((opts && opts.text) || '').trim()",
    expect: 'R48',
  },
  {
    name: 'S9: the seal point stops sealing (closed records carry no minority archive)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '    const putVerdict = (target, record) => commit(EV.verdict, { target, record: sealRecord(record) })',
    to: '    const putVerdict = (target, record) => commit(EV.verdict, { target, record })',
    expect: 'R49',
  },
  {
    name: 'S9: eligibility collapses to a role (the winner-only rule stops being read from the record)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      const hasWinner = outcome === 'true' || outcome === 'false'",
    to: '      const hasWinner = true',
    expect: 'R50',
  },
  {
    name: 'S9: the reconsideration threshold can be lowered (the only-up rule becomes a min)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '      const after = Math.max(before, floor, cap)',
    to: '      const after = Math.min(before, floor, cap)',
    expect: 'R51',
  },
  {
    name: 'S9: the reconsideration path invents a brand-new error code',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "        return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '本轮已复议过（每轮只受理一次）：请等本轮结论' }",
    to: "        return { ok: false, code: 'V5_RECONSIDER_ALREADY', message: 'MUTANT: 新错误码' }",
    expect: 'R52',
  },
  {
    name: 'S9: a reconsideration starts closing the verification itself (no longer passive)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '      const done = Array.isArray(rec.reconsiderations) ? rec.reconsiderations : []',
    to: '      const done = Array.isArray(rec.reconsiderations) ? rec.reconsiderations : []\n      if (rec.closed) void closeVerify(rec, true, { m: 1, P: 1, bTrue: 1, bFalse: 0, abstain: 0, mean: 1, voters: [] })',
    expect: 'R53',
  },
  {
    name: 'S9: a SECRET board starts leaking who chose what through the reconsideration receipt',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "          secretSource: bSecret, eligibility: 'board-participant',",
    to: "          secretSource: bSecret, eligibility: 'board-participant', choices: bVotes.map((v) => v.choices),",
    expect: 'R54',
  },
  {
    name: 'S10: the excerpt stops being truncated (the quote copies the whole text)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '        ? { excerpt: s.slice(0, QUOTE_EXCERPT_MAX), truncated: true }',
    to: '        ? { excerpt: s, truncated: true }',
    expect: 'R55',
  },
  {
    name: 'S10: a cross-meeting anchor is accepted (the same-meeting boundary is dropped)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "          if (String(got.meetingId || '') !== curMeetingId) {",
    to: '          if (false) {',
    expect: 'R56',
  },
  {
    name: 'S10: a private message becomes directly quotable (the supplement gate is dropped)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "        if (String(found.kind) === 'dm') {",
    to: '        if (false) {',
    expect: 'R57',
  },
  {
    name: 'S10: the per-message quote cap disappears (any number of quotes is accepted)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '        if (refs.length > quotesPerMessageMax()) {',
    to: '        if (false) {',
    expect: 'R58',
  },
  {
    name: 'S10: a dangling minutes anchor is accepted (the speech branch stops refusing)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "        if (!b || !body) return quoteRefused('悬空引用：' + rel + ' 里找不到 ' + who + ' 的第 ' + nth + ' 次发言（锚 ' + r + '）')",
    to: "        if (!b || !body) return { ok: true, ref: r, domain: 'meeting', meetingId: mid, from: who, text: '', kind: 'speech', depth: 1, chain: [] }",
    expect: 'R59',
  },
  {
    name: 'S10: the quote path starts driving the meeting phase',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '      const sent = await say(callerId, { to, text: a.text, kind, quote, quotes, supplementOf })',
    to: "      if (meeting) meeting.phase = 'open-floor'\n      const sent = await say(callerId, { to, text: a.text, kind, quote, quotes, supplementOf })",
    expect: 'R60',
  },
  {
    name: 'S11: the chair may appoint itself (recording collapses back into the chair)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      if (!revoke && (m.kind === 'academician' || isOffice(who))) {",
    to: '      if (false) {',
    expect: 'R61',
  },
  {
    name: 'S11: the secretary ledger stops passing the fold whitelist (appointments are dropped)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '          if (patch.secretaries !== undefined) {',
    to: '          if (false) {',
    expect: 'R62',
  },
  {
    name: 'S11: writing minutes entries stops requiring the academician or the secretary',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      if (command === 'minutes') return acad || (!!meeting && String(meeting.secretary || '') === String(callerId))",
    to: "      if (command === 'minutes') return true",
    expect: 'R63',
  },
  {
    name: 'S11: the recorder section loses its own heading (the minutes zones are no longer separate)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      lines.push('## 记录人补充')\n      lines.push('- 本场等级：'",
    to: "      lines.push('- 本场等级：'",
    expect: 'R64',
  },
  {
    name: 'S11: the gap report is skipped (a complete-looking minutes could be fabricated)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '      if (!text) {',
    to: '      if (false) {',
    expect: 'R65',
  },
  {
    name: 'S11: the secretary path invents a brand-new error code',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      if (text.length > SECRETARY_ENTRY_MAX) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '条目过长（上限 ' + SECRETARY_ENTRY_MAX + ' 字符）' }",
    to: "      if (text.length > SECRETARY_ENTRY_MAX) return { ok: false, code: 'V5_SECRETARY_ENTRY_TOO_LONG', message: 'MUTANT: 新错误码' }",
    expect: 'R66',
  },
  {
    name: 'S12: the level stops being derived from the meeting kind (a decision meeting becomes light)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "    const FORMAL_MEETING_KINDS = ['verify-request', 'solve-vote']",
    to: '    const FORMAL_MEETING_KINDS = []',
    expect: 'R67',
  },
  {
    name: 'S12: a light meeting accepts an entity conclusion (the D7 refusal is dropped)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      if (entryKind === 'decision' && isLightMeeting()) return truthWriteRefusal('不得落**决议**条目')",
    to: "      if (false) return truthWriteRefusal('不得落**决议**条目')",
    expect: 'R68',
  },
  {
    name: 'S12: anyone may set the meeting level (the academician gate is dropped)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      if (command === 'meeting_level') return acad",
    to: "      if (command === 'meeting_level') return true",
    expect: 'R69',
  },
  {
    name: 'S12: setting the level starts driving the meeting (it closes the meeting)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '      meeting.formalAgenda = want',
    to: "      meeting.formalAgenda = want\n      await finalizeMeeting(meeting, 'level-change')",
    expect: 'R70',
  },
  {
    name: 'S13: the stable resolution id stops being allocated by the framework (ids collide)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "    const nextResolutionId = () => 'res-' + (resolutionsList().length + 1)",
    to: "    const nextResolutionId = () => 'res-' + (resolutionsList().length)",
    expect: 'R71',
  },
  {
    name: 'S13: a light meeting accepts a resolution (the D7 refusal on the resolution path is dropped)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      if (meetingLevelOf(meeting) !== 'formal') return truthWriteRefusal('不得落决议')",
    to: "      if (false) return truthWriteRefusal('不得落决议')",
    expect: 'R72',
  },
  {
    name: 'S13: anyone may write a resolution (the academician/secretary gate is dropped)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      if (command === 'result_record') return acad || (!!meeting && String(meeting.secretary || '') === String(callerId))",
    to: "      if (command === 'result_record') return true",
    expect: 'R73',
  },
  {
    name: 'S13: the resolution ledger stops passing the fold whitelist (resolutions are dropped)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '          if (patch.resolutions !== undefined) {',
    to: '          if (false) {',
    expect: 'R74',
  },
  {
    name: 'S13: retrieval stops rejecting time filters',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      if (badTime.length) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '时间由框架设置：检索不接受时间参数 ' + badTime.join('、') + '（时间只作排序/展示）' }",
    to: "      if (badTime.length) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'MUTANT: 不再拒绝时间过滤 ' + badTime.join('、') }",
    expect: 'R75',
  },
  {
    name: 'S14: a ledger key loses its read-side default (an old state file would crash)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "            const next = typeof patch.grants === 'function' ? patch.grants(Array.isArray(n.grants) ? n.grants : []) : patch.grants",
    to: '            const next = patch.grants',
    expect: 'R76',
  },
  {
    name: 'S14: the schema version gate disappears (an old file is read as if it were current)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "            else loadProblem = 'schema version mismatch: file has v='",
    to: "            else loadProblem = 'MUTANT: version gate dropped v='",
    expect: 'R77',
  },
  {
    name: 'S14: the machine modes start deleting temp state (--counts would sweep)',
    rel: 'tests/run-tests.mjs',
    from: "if (!has('no-temp-hygiene') && !has('self-check') && !has('counts')) {",
    to: "if (!has('no-temp-hygiene')) {",
    expect: 'R78',
  },
  {
    name: 'S15: the confirmation ledger stops passing the fold whitelist (confirmations are dropped)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '          if (patch.minutesConfirmations !== undefined) {',
    to: '          if (false) {',
    expect: 'R79',
  },
  {
    name: 'S15: the factual correction stops landing in its own appended section (the minutes could be rewritten)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "        await appendMeetingTail(meeting, '## 上次纪要确认\\n- ' + fmtTime(at) + '｜' + memberId + ' 确认 ' + of",
    to: "        await appendMeetingTail(meeting, '- ' + fmtTime(at) + '｜' + memberId + ' 确认 ' + of",
    expect: 'R80',
  },
  {
    name: 'S15: handover stops parking the action item (responsibility could vanish silently)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "          next.state = 'handover'",
    to: "          next.state = 'open'",
    expect: 'R81',
  },
  {
    name: 'S15: the minutes-confirm path starts driving the meeting (it closes the meeting)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      const detail = String(args.detail || 'normal')",
    to: "      await finalizeMeeting(meeting, 'k4-mutant')\n      const detail = String(args.detail || 'normal')",
    expect: 'R82',
  },
  {
    name: 'S16: the opening roll-call stops naming the owner / 待接手 / overdue (it degrades to bare ids)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "            return String(t.id) + '（' + (who || '待接手') + (over ? '｜**逾期**' : '') + '）'",
    to: '            return String(t.id)',
    expect: 'R83',
  },
  {
    name: 'S17: the overview action-items section stops exposing 待接手 / 逾期（未决项） counts',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "        parts.push('- 共 ' + ai.total + ' 条｜未完成 ' + ai.open.length + '｜**待接手** ' + ai.handover.length + '｜**逾期（未决项）** ' + ai.overdue.length)",
    to: "        parts.push('- 共 ' + ai.total + ' 条｜未完成 ' + ai.open.length)",
    expect: 'R84',
  },
  {
    name: 'S18: the motion ledger stops passing the fold whitelist (motions are silently dropped)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '          if (patch.motions !== undefined) {',
    to: '          if (false) {',
    expect: 'R85',
  },
  {
    name: 'S18: seconding your OWN motion stops being refused',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      if (String(cur.by) === memberId) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '**不可附议自己的动议**（' + mid + '）' }",
    to: '      // MUTANT: self-second allowed',
    expect: 'R86',
  },
  {
    name: 'S18: the seconds threshold stops carrying the motion',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      if (next.secondedBy.length >= Math.max(1, Number(next.needed || 1))) { next.state = 'carried'; next.carriedAt = now() }",
    to: '      // MUTANT: threshold never carries',
    expect: 'R87',
  },
  {
    name: 'S18: raising a motion starts driving the meeting (it finalizes it)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "      await patchInstitute({ motions: (l) => (Array.isArray(l) ? l : []).concat([rec]) })",
    to: "      await patchInstitute({ motions: (l) => (Array.isArray(l) ? l : []).concat([rec]) })\n      await finalizeMeeting(meeting, 's18-mutant')",
    expect: 'R88',
  },
  {
    name: 'S19: the seconds-threshold domain check lets 0 through (n < 1 becomes n < 0)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '        if (!Number.isFinite(n) || Math.floor(n) !== n || n < 1) {',
    to: '        if (!Number.isFinite(n) || Math.floor(n) !== n || n < 0) {',
    expect: 'R89',
  },
  {
    name: 'S20: supersede stops checking that both resolutions EXIST (a bogus id supersedes)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "        if (!oldRec) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '找不到被取代的决议 ' + of + '（须先由 #55 落库）' }",
    to: '        // MUTANT: existence of the target is not checked',
    expect: 'R90',
  },
  {
    name: 'S20: a resolution can be superseded TWICE (the one-way chain breaks)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "          return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '决议 ' + of + ' **已被取代**（by ' + String(oldRec.supersededBy) + '）⇒ **不得二次取代**（状态机单向）' }",
    to: '          // MUTANT: a second supersede is allowed',
    expect: 'R90',
  },
  {
    name: 'S20: latestResolution falls back to the last ELEMENT (superseded resolutions can be "latest" again)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '        if (!String(list[i].supersededBy || \'\')) return list[i]',
    to: '        return list[i]',
    expect: 'R91',
  },
  {
    name: 'S20: from_resolution stops refusing a superseded resolution (superseded decisions dispatch work)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "        if (String(rr.supersededBy || '')) {\n          return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '决议 ' + fromRes + ' **已被取代**（by ' + String(rr.supersededBy) + '）⇒ **不得据此派活**（B-3(甲)/S20）' }\n        }",
    to: '        // MUTANT: a superseded resolution may still dispatch work',
    expect: 'R92',
  },
  {
    name: 'S25-A: the resource block loses its off-switch (it is injected even when resourceSelfCheck is false)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '      if (!resourceSelfCheckOn()) return []',
    to: '      // MUTANT: the off-switch is gone',
    expect: 'R94',
  },
  {
    name: 'S25-A: the tool-call budget reader hard-codes 0 (setting toolCallsPerTurnCap has no effect)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '      const n = Number(params.toolCallsPerTurnCap)',
    to: '      const n = 0',
    expect: 'R95',
  },
  {
    name: 'S25-A: the memory ceiling reader hard-codes 0 (setting memoryCeilingMb has no effect)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: '      const n = Number(params.memoryCeilingMb)',
    to: '      const n = 0',
    expect: 'R95',
  },
  {
    name: 'S25-A: the >=0 domain check accepts a negative toolCallsPerTurnCap (n < 0 becomes n < -1)',
    rel: 'vibe-math-v5r/vibe-math-v5r.js',
    from: "        if (!Number.isFinite(n) || Math.floor(n) !== n || n < 0) {\n          return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'toolCallsPerTurnCap 必须是",
    to: "        if (!Number.isFinite(n) || Math.floor(n) !== n || n < -1) {\n          return { ok: false, code: 'V5_INVALID_ARGUMENT', message: 'toolCallsPerTurnCap 必须是",
    expect: 'R96',
  },
]

if (process.argv.includes('--self-probe')) {
  const bad = []
  for (const mut of SELF_PROBE_MUTATIONS) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--json'], {
      cwd: fileURLToPath(HERE),
      env: Object.assign({}, process.env, mut.control ? {} : { V5_INTEGRITY_MUTATE: JSON.stringify([mut.rel, mut.from, mut.to]) }),
      encoding: 'utf8',
    })
    let parsed = null
    try { parsed = JSON.parse(r.stdout) } catch (e) { /* fall through to the diagnostic below */ }
    const text = (r.stdout || '') + (r.stderr || '')
    if (mut.control) {
      const ok = r.status === 0 && parsed && parsed.failed === 0
      console.log((ok ? 'PASS ' : 'FAIL ') + 'control: the unmutated run stays green (' + (parsed ? parsed.failed + ' findings, ' + parsed.gates + ' gates' : 'unparsable output') + ')')
      if (!ok) bad.push('control run was not green')
      continue
    }
    const hit = text.includes(mut.expect)
    const red = r.status === 1 && parsed && parsed.failed > 0
    const ok = red && hit
    console.log((ok ? 'PASS ' : 'FAIL ') + mut.name + (ok ? '' : '  → exit=' + r.status + ' hit=' + hit + ' failed=' + (parsed && parsed.failed)))
    if (!ok) bad.push(mut.name + ' (exit ' + r.status + ', expected ' + JSON.stringify(mut.expect) + ')')
  }
  console.log('')
  console.log('V5 INTEGRITY SELF-PROBE: ' + (SELF_PROBE_MUTATIONS.length - bad.length) + '/' + SELF_PROBE_MUTATIONS.length + ' as required')
  for (const b of bad) console.error('  FAIL ' + b)
  process.exit(bad.length === 0 ? 0 : 1)
}

const FILE_REL = 'vibe-math-v5/vibe-math-v5.js'
const raw = readRaw(FILE_REL)
// Strip comments, string literals AND regex literals before any identifier scan. Without this the
// heuristic matches English words inside comments that merely precede a '(' (e.g.
// "// per unit (" becomes a phantom call to unit()), drowning the real findings.
//
// REGEX LITERALS ARE NOT OPTIONAL HERE: v5 contains `/[\\/:*?"<>|\u0000-\u001f]+/` — a character class
// holding a DOUBLE QUOTE. A scanner without regex support reads that quote as a string start and
// mangles the rest of the line. Measured on this very file (old vs new, line by line): 30 of 4365
// lines differed and the stripped output did NOT parse. No identifier this audit checks
// (call names, `params.*` reads, `s.*()` methods) happened to be missed in the current source, so this
// was latent rather than exploited — but a single call appearing only on such a line would have been
// invisible. The self-check at the bottom of this file keeps the scanner honest.
// The keyword rule matters for the same reason as in audit-prompt-invariants.mjs (`return /…/`).
function stripNoise(s) {
  let out = ''
  let i = 0
  const n = s.length
  let prev = '' // last significant token (single char, or a whole word such as `return`)
  let word = ''
  const REGEX_AFTER_KEYWORD = /^(?:return|typeof|case|delete|void|instanceof|in|of|yield|await|new|do|else)$/
  const regexAllowed = () => prev === '' || REGEX_AFTER_KEYWORD.test(prev) || /[(,=:[!&|?{};+\-*%~^<>]/.test(prev)
  while (i < n) {
    const c = s[i], c2 = s[i + 1]
    if (c === '/' && c2 === '/') { while (i < n && s[i] !== '\n') i++; continue }
    if (c === '/' && c2 === '*') { i += 2; while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++; i += 2; continue }
    if (c === '/' && regexAllowed()) {
      i++
      let inClass = false
      while (i < n) {
        if (s[i] === '\\') { i += 2; continue }
        if (s[i] === '[') inClass = true
        else if (s[i] === ']') inClass = false
        else if (s[i] === '/' && !inClass) { i++; break }
        else if (s[i] === '\n') break // a regex literal cannot span lines
        i++
      }
      while (i < n && /[a-z]/i.test(s[i])) i++ // flags
      out += "''" // a value placeholder, like strings: keeps `X: <value>` shapes but no phantom calls
      prev = ')'
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const q = c
      i++
      while (i < n) {
        if (s[i] === '\\') { i += 2; continue }
        if (s[i] === q) { i++; break }
        if (q !== '`' && s[i] === '\n') break
        i++
      }
      out += q + q   // keep a placeholder so `X: ''` shape survives
      prev = ')'
      continue
    }
    out += c
    if (/[A-Za-z0-9_$]/.test(c)) word += c
    else { if (word) { prev = word; word = '' } if (!/\s/.test(c)) prev = c }
    i++
  }
  return out
}
const src = stripNoise(raw)
const findings = []
const notes = []
// How many philosophy gates the run checked (module scope so `--json` can report it).
let gateCount = 0

const lineOf = (idx) => src.slice(0, idx).split('\n').length

// ---- 1. called-but-undefined -------------------------------------------
const defined = new Set()
for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) defined.add(m[1])
for (const m of src.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) defined.add(m[1])
for (const m of src.matchAll(/(?:const|let|var)\s+\{([^}]+)\}\s*=/g)) {
  for (const part of m[1].split(',')) { const n = part.split(':').pop().trim(); if (n) defined.add(n) }
}
for (const m of src.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) defined.add(m[1])
// ESM imports are DEFINITIONS too: the preset imports the shared `math_computation` module
// (INTERFACE-FREEZE §5.1), so calling an imported function is not a ReferenceError. Without
// this every imported symbol was reported as "called but never defined"; a call to a name that
// is neither declared nor imported is still flagged.
for (const m of src.matchAll(/import\s*(?:\*\s*as\s+([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\}\s*)?from\s*['"][^'"]*['"]/g)) {
  if (m[1]) defined.add(m[1])
  if (m[2]) defined.add(m[2])
  if (m[3]) {
    for (const part of m[3].split(',')) {
      const name = part.split(/\s+as\s+/).pop().trim()
      if (name) defined.add(name)
    }
  }
}
// Function/method PARAMETERS are locally bound identifiers too, not free calls.
for (const m of src.matchAll(/function\s*[A-Za-z_$]*\s*\(([^)]*)\)/g)) {
  for (const raw of m[1].split(',')) {
    const name = raw.trim().replace(/[={].*$/s, '').trim()
    if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name)
  }
}
for (const m of src.matchAll(/\(([^()]*)\)\s*=>/g)) {
  for (const raw of m[1].split(',')) {
    const name = raw.trim().replace(/[={].*$/s, '').trim()
    if (/^[A-Za-z_$][\w$]*$/.test(name)) defined.add(name)
  }
}
for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) defined.add(m[1])
// JS/DSH globals that are legitimately free
const GLOBALS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new', 'await', 'delete', 'void', 'do', 'else', 'try',
  'Array', 'Object', 'JSON', 'Number', 'String', 'Boolean', 'Math', 'Date', 'Promise', 'Set', 'Map', 'WeakRef', 'WeakMap', 'Symbol', 'Error',
  'isFinite', 'isNaN', 'parseInt', 'parseFloat', 'encodeURIComponent', 'decodeURIComponent', 'structuredClone',
  'AbortSignal', 'console', 'require', 'import', 'super', 'this', 'of', 'in', 'instanceof',
  'RegExp', 'Proxy', 'Reflect', 'AggregateError', 'TextEncoder', 'TextDecoder', 'URL', 'BigInt', 'Intl', 'Buffer', 'process',
])
const LOCAL_METHODS = new Set()
for (const m of src.matchAll(/[{,]\s*([A-Za-z_$][\w$]*)\s*[:(]/g)) LOCAL_METHODS.add(m[1])
for (const m of src.matchAll(/\.\s*([A-Za-z_$][\w$]*)\s*\(/g)) LOCAL_METHODS.add(m[1])

const called = new Map()
for (const m of src.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
  const name = m[1]
  if (GLOBALS.has(name) || LOCAL_METHODS.has(name)) continue
  if (!called.has(name)) called.set(name, { n: 0, line: lineOf(m.index) })
  called.get(name).n++
}
for (const [name, info] of called) {
  if (!defined.has(name)) findings.push('line ' + info.line + ': called but never defined: ' + name + '()  (' + info.n + ' call site(s))')
}

// ---- 2. params keys ----------------------------------------------------
const dpBlock = /const DEFAULT_PARAMS = \{([\s\S]*?)\n    \}/.exec(src)
if (!dpBlock) findings.push('could not locate DEFAULT_PARAMS')
else {
  const declared = new Set()
  for (const m of dpBlock[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) declared.add(m[1])
  const used = new Map()
  for (const m of src.matchAll(/\bparams\.([A-Za-z_$][\w$]*)/g)) used.set(m[1], (used.get(m[1]) || 0) + 1)
  for (const [k, n] of used) {
    if (!declared.has(k)) findings.push('params.' + k + ' read but not declared in DEFAULT_PARAMS (' + n + ' use(s))')
  }
  notes.push('DEFAULT_PARAMS keys: ' + declared.size + '; params.* reads: ' + used.size)
}

// ---- 3. session-API surface used by tool handlers -----------------------
// `s` is not always the session API object. The toolFilter sanitiser added for the v2/v3/v4
// parity guard contains `.map(function(s){ return s.trim() })` — there `s` is a LOCAL string
// parameter, and a flat `s.NAME(` scan reported the phantom finding "calls s.trim() but the
// session API does not export it". A false FINDING is as corrosive as a blind spot (it trains
// the reader to ignore the audit), so the scan now respects the ONE shadowing form the plugin
// actually uses: a plain `function (...)` whose parameter list binds `s`.
//
// This is scope analysis, not an allowlist: any `s.X()` inside such a body CANNOT be a call on
// the enclosing session object — the parameter shadows it. The tool handlers themselves are
// ARROW functions (`(s, a, x) => s.…)`), so their `s` IS the session API and stays scanned; the
// self-check at the bottom of this file proves the skip does not blind those.
function localSParamBodySpans(text) {
  const spans = []
  const re = /function\s*(?:[A-Za-z_$][\w$]*)?\s*\(([^)]*)\)\s*\{/g
  let m
  while ((m = re.exec(text)) !== null) {
    const params = m[1].split(',').map((p) => p.trim().replace(/[={].*$/s, '').trim())
    if (params.indexOf('s') === -1) continue
    let i = m.index + m[0].length - 1   // sitting on the opening '{'
    let depth = 0
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') { depth--; if (depth === 0) break }
    }
    spans.push([m.index, i])
  }
  return spans
}
// The returned API object is the last `return { ... }` inside makeSession.
const apiStart = src.lastIndexOf('    return {\n      sessionId,')
if (apiStart === -1) findings.push('could not locate the session API return object')
else {
  const apiEnd = src.indexOf('\n    }\n  }', apiStart)
  const apiText = src.slice(apiStart, apiEnd === -1 ? apiStart + 4000 : apiEnd)
  const apiKeys = new Set()
  for (const m of apiText.matchAll(/(?:^|[\s{,])([A-Za-z_$][\w$]*)\s*:/g)) apiKeys.add(m[1])
  for (const m of apiText.matchAll(/(?:^|[\s{,])([A-Za-z_$][\w$]*)\s*,/g)) apiKeys.add(m[1])
  const localScopes = localSParamBodySpans(src)
  const inLocalScope = (idx) => localScopes.some(([a, b]) => idx >= a && idx <= b)
  const usedOnS = new Map()
  let shadowed = 0
  for (const m of src.matchAll(/(?<![\w$.])s\.([A-Za-z_$][\w$]*)\s*\(/g)) {
    if (inLocalScope(m.index)) { shadowed++; continue }
    if (!usedOnS.has(m[1])) usedOnS.set(m[1], lineOf(m.index))
  }
  for (const [k, line] of usedOnS) {
    if (!apiKeys.has(k)) findings.push('line ' + line + ': tool handler calls s.' + k + '() but the session API does not export it')
  }
  notes.push('session API keys: ' + apiKeys.size + '; s.*() called: ' + usedOnS.size +
    (shadowed ? '; skipped ' + shadowed + ' inside a local `function(s)` scope (a shadowing parameter, not the session API)' : ''))
}

// ---- 4. error codes ----------------------------------------------------
// Scan the RAW source: these patterns live inside string literals, which `src` strips.
const raised = new Set()
for (const m of raw.matchAll(/v5err\(\s*'(V5_[A-Z_]+)'/g)) raised.add(m[1])
for (const m of raw.matchAll(/code:\s*'(V5_[A-Z_]+)'/g)) raised.add(m[1])
const docs = readRaw('vibe-math-v5/实现方案.md')
const documented = new Set()
for (const m of docs.matchAll(/`(V5_[A-Z_]+)`/g)) documented.add(m[1])
const onlyDocs = new Set()
for (const m of docs.matchAll(/(V5_[A-Z_]+)/g)) onlyDocs.add(m[1])
const raisedNotDocumented = [...raised].filter(c => !onlyDocs.has(c))
const documentedNotRaised = [...documented].filter(c => !raised.has(c))
if (raisedNotDocumented.length) findings.push('error codes raised but absent from 实现方案.md: ' + raisedNotDocumented.join(', '))
if (documentedNotRaised.length) notes.push('documented but not raised in code (ok if advisory): ' + documentedNotRaised.join(', '))
notes.push('error codes raised: ' + raised.size)

// ---- 5. leftover scaffolding -------------------------------------------
for (const bad of ['@@V5_SECTION@@', 'TODO', 'FIXME', 'XXX', 'PLACEHOLDER']) {
  if (src.includes(bad)) findings.push('leftover development marker: ' + bad)
}
// every event type declared in EV must be appended somewhere
const evBlock = /const EV = \{([\s\S]*?)\n\}/.exec(raw)
if (evBlock) {
  const keys = [...evBlock[1].matchAll(/([A-Za-z]+):\s*'(vibe5\/[a-z]+)'/g)]
  for (const [, prop, literal] of keys) {
    const uses = (raw.match(new RegExp("EV\\." + prop + "\\b", 'g')) || []).length
    if (uses <= 1) findings.push('event type EV.' + prop + ' (' + literal + ') is declared but never committed')
  }
  notes.push('event types declared: ' + keys.length)
}

// ---- 6. composition sanity --------------------------------------------
// The v5 preset is a composition, and a typo in a row `name` is a mounting failure that
// no unit test of the plugin can catch (the mock calls apply() directly and never goes
// through the loader). v4 is a proven-good composition mounted on the same hosts, so any
// package row v5 names that v4 does not is either a genuine new dependency or a typo —
// and a new dependency must be justified, so surface it for review.
function packageRows(yaml) {
  const rows = []
  const lines = yaml.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const idm = /^\s*-\s*id:\s*(\S+)\s*$/.exec(lines[i])
    if (!idm) continue
    const row = { id: idm[1], name: '', disabled: false, line: i + 1 }
    for (let j = i + 1; j < lines.length && j < i + 12; j++) {
      if (/^\s*-\s*id:\s*\S+\s*$/.test(lines[j])) break
      const nm = /^\s*name:\s*'?([^'\n]+?)'?\s*$/.exec(lines[j])
      if (nm && !row.name) row.name = nm[1].trim()
      if (/^\s*disabled:\s*true/.test(lines[j])) row.disabled = true
    }
    if (row.name) rows.push(row)
  }
  return rows
}
const v5yaml = readRaw('vibe-math-v5/agent.cordis.yml')
const v4yaml = readRaw('vibe-math-v4/agent.cordis.yml')
const v5rows = packageRows(v5yaml)
const v4names = new Set(packageRows(v4yaml).map(r => r.name))
const RELATIVE_OK = new Set(['./vibe-math-v5.js'])
if (!v5rows.length) findings.push('composition: no rows parsed out of agent.cordis.yml (is the file still YAML?)')
for (const r of v5rows) {
  if (r.name === 'cordis:group') continue
  if (r.name.startsWith('./')) {
    if (!RELATIVE_OK.has(r.name)) findings.push('composition line ' + r.line + ': relative row name "' + r.name + '" has no matching file in the preset directory')
    continue
  }
  if (!v4names.has(r.name)) findings.push('composition line ' + r.line + ': row "' + r.id + '" names "' + r.name + '", which v4 does not — verify the package/name is correct')
}
// the preset must reference its own plugin row, and that file must exist
if (!v5rows.some(r => r.name === './vibe-math-v5.js')) findings.push('composition: the preset never mounts ./vibe-math-v5.js')
// prefix AND text are required on the persona row for the DSH schema and for back-compat
const personaBlock = /- id:\s*persona[\s\S]*?(?=\n-\s*id:)/.exec(v5yaml)
if (!personaBlock) findings.push('composition: no persona row found')
else {
  if (!/^\s*prefix:\s*\|/m.test(personaBlock[0])) findings.push('composition: persona row lacks the required `prefix` key')
  if (!/^\s*text:\s*\|/m.test(personaBlock[0])) findings.push('composition: persona row lacks the legacy `text` key')
}
notes.push('composition rows: ' + v5rows.length + '; non-v4 package rows: ' + v5rows.filter(r => r.name !== 'cordis:group' && !r.name.startsWith('./') && !v4names.has(r.name)).length)

// ---- 7. requirements traceability against the plan ---------------------
// "No missing logic" is only checkable mechanically if the SPEC is machine-readable.
// The plan's §15 names every tool and §16 every parameter, so compare those sets
// against the implementation: a name in the plan but not the code is an unimplemented
// requirement, and a name in the code but not the plan is undocumented surface.
{
  const plan = readRaw('vibe-math-v5/实现方案.md')
  const planTools = new Set()
  for (const m of plan.matchAll(/\bvibe_v5_[a-z_]+/g)) planTools.add(m[0])
  const codeTools = new Set()
  for (const m of raw.matchAll(/registerTool\(\s*'(vibe_v5_[a-z_]+)'/g)) codeTools.add(m[1])
  // documented-but-wildcarded placeholders are not real tools
  const IGNORE = new Set(['vibe_v5_', 'vibe_v5_record_', 'vibe_v5_lean_', 'vibe_v5_task_'])
  for (const t of planTools) {
    if (IGNORE.has(t)) continue
    if (!codeTools.has(t)) findings.push('plan names tool ' + t + ' but the plugin never registers it')
  }
  const undocumented = [...codeTools].filter(t => !planTools.has(t))
  if (undocumented.length) notes.push('tools registered but not named in the plan: ' + undocumented.join(', '))
  notes.push('plan tools: ' + planTools.size + '; registered tools: ' + codeTools.size)

  // Parameters: only the §16 default table, NOT the §15 tool tables (whose rows also
  // begin with a backticked name).
  const declared2 = new Set()
  if (dpBlock) for (const m of dpBlock[1].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*:/gm)) declared2.add(m[1])
  const sec16 = /##\s*16\.[\s\S]*?(?=\n##\s*17\.)/.exec(plan)
  const paramRows = new Set()
  if (sec16) {
    for (const m of sec16[0].matchAll(/^\|\s*`([A-Za-z][\w]*)`(?:\s*\/\s*`([A-Za-z][\w]*)`)?\s*\|/gm)) {
      paramRows.add(m[1])
      if (m[2]) paramRows.add(m[2])
    }
  } else findings.push('could not locate the plan\'s §16 parameter table')
  for (const p of paramRows) {
    if (!declared2.has(p)) findings.push('plan documents parameter `' + p + '` but DEFAULT_PARAMS does not declare it')
  }
  notes.push('plan §16 parameter rows: ' + paramRows.size)

  // F3 (docs-vs-behaviour sweep): `status()`'s machine surface. OWNERSHIP (agreed division, so the two
  // guards never both claim the same job):
  //   • FIELD-LEVEL reconciliation (field ↔ doc row, BOTH directions) is owned by
  //     `tests/audit-status-report-fields.mjs`, which carries the table and prints the
  //     `frozen / doc-rows / exceptions` counts;
  //   • THIS audit keeps ONLY this frozen-key drift check: the extracted 43 keys below, the printed
  //     `captured: N`, and the `<30` anti-vacuity floor. Any addition/removal of a top-level key must be
  //     an explicit decision here (and in the owning guard's reconciliation).
  // No "doc half" is promised or planned here — the note printed at the end points at the owner instead.
  const stIdx = raw.indexOf('function status() {')
  const statusKeys = []
  if (stIdx === -1) findings.push('could not locate status() — the machine-surface extraction has no anchor')
  else {
    const open = raw.indexOf('return {', stIdx)
    const close = raw.indexOf('\n      }', open)
    // Tokenise the returned literal: every key directly inside it — including SHORTHAND keys that share a
    // line (`institute: instituteName, project, key, phase,`) — while SKIPPING each value (so an
    // identifier used as a value can never be mistaken for a key).
    const body = open === -1 ? '' : raw.slice(open + 'return {'.length, close === -1 ? open + 9000 : close)
    // Comments must be skipped IN PLACE: the payload's comments contain prose with apostrophes, parens and
    // commas (`…delivered ONCE…`, `phase:'failed'`, `(installer review)`), which otherwise corrupt both the
    // depth tracking and the value skipping.
    const skipComment = (s, at) => {
      if (s[at + 1] === '/') { let j = at + 2; while (j < s.length && s[j] !== '\n') j += 1; return j }
      if (s[at + 1] === '*') { const j = s.indexOf('*/', at + 2); return j === -1 ? s.length : j + 2 }
      return -1
    }
    let i = 0, depth = 0
    while (i < body.length) {
      const ch = body[i]
      if (ch === '/') { const j = skipComment(body, i); if (j !== -1) { i = j; continue } }
      if (ch === '"' || ch === "'") { const q = ch; i += 1; while (i < body.length && body[i] !== q) { if (body[i] === '\\') i += 1; i += 1 } i += 1; continue }
      if (ch === '{' || ch === '[' || ch === '(') { depth += 1; i += 1; continue }
      if (ch === '}' || ch === ']' || ch === ')') { if (depth === 0) break; depth -= 1; i += 1; continue }
      if (depth === 0 && /[A-Za-z_$]/.test(ch)) {
        const m = /^[A-Za-z_$][\w$]*/.exec(body.slice(i))
        const after = body.slice(i + m[0].length).replace(/^[\s]+/, '')
        if (after[0] === ':') {
          statusKeys.push(m[0])
          i += m[0].length
          let d = 0
          while (i < body.length) {                       // skip the VALUE up to the next top-level comma
            const c = body[i]
            if (c === '/') { const j = skipComment(body, i); if (j !== -1) { i = j; continue } }
            if (c === '"' || c === "'") { const q = c; i += 1; while (i < body.length && body[i] !== q) { if (body[i] === '\\') i += 1; i += 1 } i += 1; continue }
            if (c === '{' || c === '[' || c === '(') { d += 1; i += 1; continue }
            if (c === '}' || c === ']' || c === ')') { if (d === 0) break; d -= 1; i += 1; continue }
            if (c === ',' && d === 0) { i += 1; break }
            i += 1
          }
          continue
        }
        if (after[0] === ',') { statusKeys.push(m[0]); i += m[0].length; continue }
        i += m[0].length; continue
      }
      i += 1
    }
  }
  notes.push('status() top-level keys captured: ' + statusKeys.length)
  if (statusKeys.length < 30) findings.push('status() key extraction captured only ' + statusKeys.length + ' keys (anchor or payload broke — this check must never pass vacuously)')
  for (const must of ['phase', 'members', 'quorum', 'chat', 'persistence']) {
    if (statusKeys.indexOf(must) === -1) findings.push('status() no longer exposes `' + must + '` (either the extraction anchor or the payload broke)')
  }
  const EXPECTED_STATUS_KEYS = ['ok', 'institute', 'project', 'key', 'phase', 'running', 'autoDone', 'runId', 'leanNotices', 'leanNoticesScope', 'fieldScopes', 'backend', 'diagnostics', 'debug', 'quorum', 'members', 'tasks', 'failedMembers', 'failedMembersNote', 'pendingSpawns', 'pendingSpawnsNote', 'chat', 'chatScope', 'officeRequests', 'officeRequestsShown', 'officeRequestsCap', 'officeRequestsDropped', 'officeRequestsTruncated', 'persistence', 'meeting', 'parkedMeeting', 'verify', 'verifyQueue', 'verified', 'verifiedTrue', 'concludedFalse', 'verifiedNote', 'undecided', 'solveVotes', 'formal', 'paper', 'lastProgressAt', 'params']
  const statusMissing = EXPECTED_STATUS_KEYS.filter((k) => statusKeys.indexOf(k) === -1)
  const statusAdded = statusKeys.filter((k) => EXPECTED_STATUS_KEYS.indexOf(k) === -1)
  if (statusMissing.length || statusAdded.length) {
    findings.push('status() field surface changed — missing=' + JSON.stringify(statusMissing) + ' added=' + JSON.stringify(statusAdded) +
      ': record the decision in this freeze AND let the field-level owner reconcile the documents (tests/audit-status-report-fields.mjs)')
  }
  notes.push('status() field-surface drift: frozen=' + statusKeys.length + ' keys (this audit owns ONLY this freeze + the <30 anti-vacuity floor); ' +
    'field-level reconciliation (field ↔ doc row, both directions) is OWNED BY tests/audit-status-report-fields.mjs, which prints frozen / doc-rows / exceptions')

  // F1 (docs-vs-behaviour): the README's TWO-CASE `resume` claim must stay paired with the behavioural
  // anchor that pins the in-instance case (the two CODE anchors are gates in the GATES table below). Only
  // the prose side is checked here, and every side reports how much it matched, so this cannot pass vacuously.
  {
    const readme = readRaw('README.md')
    const suite = readRaw('tests/e2e-v5-round2.test.mjs')
    const readmeClaims = [
      ['the two-case framing', /`resume`\s*后轮次计数的两种情形/],
      ['case 1 = a cross-process reload counts from 1', /跨进程重载[^\n]*从\s*\*\*1\*\*\s*重新计/],
      ['case 2 = an in-instance rebuild CONTINUES the numbering (轮次 2)', /同实例重建[^\n]*继续[^\n]*轮次 2/],
      ['a failed/invalid start no longer erases the existing count', /失败\/无效的启动\*\*不再抹掉\*\*已有计数/],
      ['the claim is pinned to a revision', /口径复核于\s*`?[0-9a-f]{7,40}`?/],
    ]
    let readmeHits = 0
    for (const [label, re] of readmeClaims) {
      if (re.test(readme)) readmeHits += 1
      else findings.push('README resume-claim side missing: ' + label)
    }
    const suiteClaims = [
      ['the in-instance rebuild is asserted as 轮次 2', /a FAILED resume must not move the round number backwards/],
      ['the founding round is asserted as 轮次 1', /the founding prompt starts the member at 轮次 1/],
    ]
    let suiteHits = 0
    for (const [label, re] of suiteClaims) {
      if (re.test(suite)) suiteHits += 1
      else findings.push('README resume-claim has no behavioural anchor: ' + label)
    }
    // The README cites exact code/test lines PINNED to a revision ("口径复核于 <sha>"). Those drift by
    // design, so the drift is a measured NOTE carrying the current lines — never a failure.
    const lineOf = (needle) => { const at = raw.indexOf(needle); return at === -1 ? -1 : raw.slice(0, at).split('\n').length }
    const startLine = lineOf('const startRound = (rounds.get(member.id) || 0) + 1')
    const applyLine = lineOf('rounds.set(member.id, startRound)')
    if (startLine === -1 || applyLine === -1) findings.push('the spawnMember round-count anchors are gone (startRound=' + startLine + ', applied=' + applyLine + ')')
    notes.push('F1 resume-claim pairing: README ' + readmeHits + '/' + readmeClaims.length + ' claims, behavioural anchors ' + suiteHits + '/' + suiteClaims.length + '; cited-line drift (README pins a revision): startRound now :' + startLine + ', applied now :' + applyLine)
  }

  // F2/G1 pairing (prose ↔ code): the v5 diagram must not state the PRE-G1 order, and must describe the
  // implemented one. Going through `readRaw` gives this block the same `V5_INTEGRITY_MUTATE` seam as every
  // other file, which is what the `--self-probe` case below relies on.
  {
    const diagram = readRaw('vibe-math-v5/架构图.md')
    const FORBID = /先\s*ack[^\n]{0,8}再构造/
    const CLAUSES = /构造[^\n]{0,12}(后|再)[^\n]{0,12}ack|ack[^\n]{0,12}(仅|只)[^\n]{0,12}(成功|送达)/
    if (FORBID.test(diagram)) findings.push('架构图 still states the pre-G1 order: ack before the prompt is built (F2/G1)')
    if (!CLAUSES.test(diagram)) findings.push('架构图 does not describe the implemented inbox order (construct first / ack only on success)')
    if (!raw.includes('if (ok && prompt.pending.length) await ackPending(')) findings.push('the ack is no longer gated by a successful wake (F2/G1 anchor missing)')
    notes.push('架构图 inbox pairing: forbid-hits=' + (FORBID.test(diagram) ? 1 : 0) + ', clauses=' + (CLAUSES.test(diagram) ? 1 : 0))
    // The PLAN uses the explicit pre-G1 phrases only: a sentence that legitimately QUOTES or FORBIDS the old
    // order must not trip this, so the pattern names the phrases instead of the bare `先 ack`.
    const planDoc = readRaw('vibe-math-v5/实现方案.md')
    const PLAN_FORBID = /先\s*ack\s*邮件[、,，]?\s*再构造|先\s*ack[、,，]?\s*后构造/
    if (PLAN_FORBID.test(planDoc)) findings.push('实现方案.md still states the pre-G1 order: ack the mail before building the prompt (F2/G1)')
    notes.push('实现方案.md inbox pairing: forbid-hits=' + (PLAN_FORBID.test(planDoc) ? 1 : 0))
    // The SAME class produced five instances, the last one inside the guard checklist itself, so the scan
    // covers every top-level docs/*.md. The phrase is NAMED (never the bare `先 ack`) so a sentence that
    // legitimately QUOTES or FORBIDS the old order cannot trip it. NOTE (applier): `HERE` is the REPO ROOT
    // (see `new URL(rel, HERE)` above), so the docs directory is `new URL('docs/', HERE)` — NOT `../docs/`.
    const DOC_FORBID = /先\s*ack[^\n]{0,8}再构造/
    let docHits = 0, docFiles = 0
    for (const f of readdirSync(new URL('docs/', HERE)).filter((n) => n.endsWith('.md'))) {
      docFiles += 1
      if (DOC_FORBID.test(readRaw('docs/' + f))) { docHits += 1; findings.push('docs/' + f + ' still states the pre-G1 order: ack the mail before building the prompt (F2/G1)') }
    }
    // The scan covers LIVE docs only. `docs/release-notes/**` is a FROZEN published record: the pre-G1
    // wording there is history, not a stale claim, so it must stay OUT of the scan — and the exemption is
    // ASSERTED (a missing/empty directory fails) so a future change to recursive scanning cannot silently
    // start scanning frozen history. Same convention as audit-readme-counts.mjs's frozen TOTAL-65 notes.
    let frozenNotes = []
    try { frozenNotes = readdirSync(new URL('docs/release-notes/', HERE)).filter((n) => n.endsWith('.md')) } catch (e) { frozenNotes = [] }
    if (!frozenNotes.length) findings.push('the frozen release-notes exemption is EMPTY or missing (docs/release-notes/*.md) — re-decide the scan scope explicitly, never widen it silently')
    notes.push('docs/** inbox pairing: files=' + docFiles + ', forbid-hits=' + docHits + '; frozen docs/release-notes/*.md exempted=' + frozenNotes.length)
    // The plan ALSO carried the pre-G1 re-send contract ("queued 不重发/永不重发") in two sketch lines while
    // its own M2 row already said "未 ack ⇒ 仍可重投". NAMED phrase only, scoped to the plan file, so a
    // sentence that legitimately quotes or forbids the old wording cannot trip it.
    const QUEUED_FORBID = /queued\s*(永不|不)重发/
    if (QUEUED_FORBID.test(planDoc)) findings.push('实现方案.md still states the pre-G1 re-send contract (queued 不重发/永不重发): unacked mail is re-deliverable (F2/G1)')
    notes.push('实现方案.md queued-no-resend phrasing: hits=' + (QUEUED_FORBID.test(planDoc) ? 1 : 0))
  }

  // The plan's philosophy is enforced by concrete gates; assert the load-bearing ones
  // still exist so a future edit cannot quietly drop a guard.
  const GATES = [
    ['temp workers cannot vote', "if (m.kind === 'temp') return   // no vote"],
    ['temp workers cannot hire', "if (caller.kind === 'temp') return { ok: false, code: 'V5_NOT_VOTER'"],
    ['only the academician assigns', "code: 'V5_NOT_ACADEMICIAN', message: 'only the academician (or the office) can assign tasks'"],
    ['only the academician sets priorities', "code: 'V5_NOT_ACADEMICIAN', message: 'only the academician (or the office) can set priorities'"],
    ['permanent-staff changes need the office', "code: 'V5_NOT_ACADEMICIAN', message: '解聘常驻研究员只能向所办提议，由所办批准（成员不能直接执行）'"],
    ['assignment objections are broadcast', 'if (p.reject_assign && typeof p.reject_assign === \'object\' && params.memberMayRejectAssign)'],
    ['the academician has no extra vote weight', 'const E = voters().map((m) => m.id)'],
    ['members may reject an assignment', "memberMayRejectAssign: true,"],
    ['the charter states the progress definition', "'  · Members/<你>/Progress/progress.md —— **你的研究日志**（叙述体，可追加）。'"],
    ['the charter describes the academician as organizer', "'  【四、你的组织职责与边界（院士）】'"],
    ['the framework never assigns on its own', "agenda: '本所较长时间没有新进展。请你们自行讨论：现在最该推进的是什么？谁来做？是否需要发起验证？'"],

    // ── PROMPT / INTERACTION CORRECTNESS GATES ─────────────────────────────
    // F1 (README two-case resume claim): the two code anchors the prose cites.
    ['the founding round is computed from the stored count (never reset)', 'const startRound = (rounds.get(member.id) || 0) + 1'],
    ['the founding round is applied only AFTER a successful start', 'rounds.set(member.id, startRound)'],
    // The 2026-09 field test shipped a framework whose every member brief named the WRONG
    // member. These gates keep the structural fixes in place, and the companion
    // prompt-v5-integrity.test.mjs asserts the TEXT those fixes produce.
    ['the status block takes the member it describes', 'function briefBlock(member, roundNo) {'],
    ['an unknown identity fails loudly instead of being guessed', "throw v5err('V5_INTERNAL', 'briefBlock: a member is required"],
    ['the status block is built from that member, never a global', 'function stateBlock(member, roundNo) {\n      return briefBlock(member, roundNo)\n    }'],
    ['the founding prompt is told the round it is starting (never a stored 0)', 'const prompt = initialPrompt(member, initialTask, mode, startRound)'],
    ['the joiner is committed to the roster BEFORE its brief is built', "member.phase = 'active'\n      member.childId = ''\n      await putMember(member)"],
    ['the charter is frozen at hire and reused on resume', 'const persona = member.persona || memberPersona(member)'],
    ['a rebuilt session is framed as a rebuild', "const resume = mode === 'resume'"],
    ['leadership text follows the live roster', 'function academicianId() {'],
    ['no charter invents a leader when there is none', "本所当前**没有在册院士**"],
    ['the office resolves as the office, never as a guessed member', "try { if (rootOf(agent) === agent) return 'office' } catch (e) { /* fall through */ }"],
    ['the mailbox is acked only AFTER the wake actually succeeded', "if (ok && prompt.pending.length) await ackPending(prompt.pending)"],
    // F2: the three REAL mailbox invariants, each at its own source anchor. `inFlightMessages` is a DSH
    // mailbox internal that v5 does NOT have (dedupe is `delivered` + the per-round injection marks), so
    // no gate may reference it.
    ['the acknowledgement is gated by the wake result AND a non-empty pending list', 'const ok = await wakeMember(member, prompt.text, kind)'],
    ['the delivered ledger is CAPPED (oldest evicted, never unbounded)', 'const capped = delivered.length > DELIVERED_CAP ? delivered.slice(delivered.length - DELIVERED_CAP) : delivered'],
    ['a prompt prepends only messages not already prepended in this round', 'const fresh = pending.filter((p) => !seen.has(p.id))'],
    ['the per-round injection mark is cleared with every concluded attempt', 'inboxInjected.delete(member.id)'],
    ['a prepended inbox suppresses the base block (exactly one inbox section per prompt)', "const pending = inboxSuppressed.has(member.id) ? [] : pendingFor(member.id)"],
    ['framework feedback has its own sender (never a self-message)', "return await say('framework', { to: memberId, kind: 'notice', text: String(text) })"],
    ['an assignment is framed by its true origin', "if (m.kind === 'assign') return (m.from === 'office' ? '【所办分派】' : '【院士分派】') + m.text"],
    ['a nudge is framed as supervision, not as an assignment', "to, kind: 'nudge',"],
    ['a voters-only broadcast is framed as such', "if (m.kind === 'voters') return '【研究所·致全体表决者 from ' + m.from + '】' + m.text"],
    ['relayed messages carry their true sender', "await say(callerId, { to: 'voters', kind: 'voters', text: '提议开会：「' + agenda + '」（' + kind + '）' })"],
    ['a member that failed to provision stays visible', "b.push('[未就位] ' + absent.map((m) => m.id + '（' + m.phase + '）').join('、'))"],
    ['the objection channel is documented in the reply spec', '"reject_assign": {"task_id":"t-3"'],
    ['the task-done channel is documented in the reply spec', '"task_done": "t-3",'],
    ['the meeting input channel is documented in the reply spec', '"input": "本轮会议/辩论的发言正文'],
    ['the work push is paced, not an unbounded loop', 'if ((now() - (lastActiveAt.get(m.id) || 0)) < idleMs) continue'],

    // ── LEAN FORMAL VERIFICATION GATES (docs/formal-verification.md) ─────────
    ['the formal-verification mode defaults to off', "formalVerify: 'off',"],
    ['an unknown mode degrades to off, never to a stronger mode', "indexOf(out.formalVerify) !== -1 ? out.formalVerify : 'off'"],
    ['the mode is read at prompt-build time (never frozen into the charter)', 'const formalOn = () => formalMode()'],
    ['a passing run — not merely an archived file — is what makes an object passed', 'const formalGateOk = (rec) => !!rec && (rec.status === \'passed\' || rec.status === \'blocked\')'],
    ['a passing Lean run switches the review subject to fidelity', '你的任务是**忠实性审查**'],
    ['the voting prompt tells voters not to re-derive once a proof exists', '**你不需要重新检查推导**'],
    ['require mode withholds a verdict without a formal record', 'if (formalMode() === \'require\' && !formalGateOk(rec)) {'],
    ['a withheld verdict is recorded as undecided with a machine-readable reason', 'formal-required：尚未取得 Lean 形式化通过'],
    ['the withheld object goes on a formalization TODO', "'Formal/TODO.md'"],
    ['a blocker record must carry a reason', "if (!note) return { ok: false, code: 'V5_INVALID_ARGUMENT', message: '阻塞记录必须写明原因（note）"],
    ['the proof of an object is archived under Verified/Lean/', "await writeTextRel('Verified/Lean/' + target + '.lean', body)"],
    ['reusable definitions live in the GLOBAL cross-project library', 'const okWrite = await writeTextAbs(instRootless(rel), body)'],
    ['the Lean path guard normalises .. (no string-prefix traversal hole)', 'const norm = normalizeAbsPath(abs)'],
    ['a missing toolchain degrades to a readable result, not a crash', "code: 'LEAN_NOT_FOUND'"],
    ['the formal record is durable state (folded into State/<institute>.v5state.json)', "formal: 'vibe5/formal',"],
    ['the state block advertises the formalization counts', "b.push('[形式化] ' + (formalMode()"],
    ['the reply contract carries the difficulty judgement', "L.push('  \"formal\": {"],
  ]
  for (const [label, needle] of GATES) {
    if (!raw.includes(needle)) findings.push('philosophy gate missing from the implementation: ' + label)
  }
  notes.push('philosophy gates checked: ' + GATES.length)
  gateCount = GATES.length

  // The prompt corpus is a SHIPPED deliverable, not a build artifact: a human must be able
  // to read the exact text every member receives without decoding session logs.
  const REPO_ROOT = new URL('../', import.meta.url)
  const needFiles = [
    ['the prompt-integrity suite is shipped', 'tests/prompt-v5-integrity.test.mjs'],
    ['the machine-readable prompt corpus is shipped', 'prompt-corpus-v5/prompt-corpus-v5.json'],
    ['the human-readable prompt corpus is shipped', 'prompt-corpus-v5/prompt-corpus-v5.md'],
    ['the persona-surface suite is shipped', 'tests/audit-persona-surface.test.mjs'],
    ['the four-preset persona corpus is shipped (machine-readable)', 'prompt-corpus-persona/persona-corpus.json'],
    ['the four-preset persona corpus is shipped (human-readable)', 'prompt-corpus-persona/persona-corpus.md'],
  ]
  for (const [label, rel] of needFiles) {
    let ok = false
    try { ok = existsSync(new URL(rel, REPO_ROOT)) } catch (e) { ok = false }
    if (!ok) findings.push('missing shipped prompt-correctness artifact: ' + label + ' (' + rel + ')')
  }
  notes.push('prompt-correctness artifacts checked: ' + needFiles.length)

  // The corpus must actually contain the interactions a reviewer needs to see, and must
  // never contain a wrong-identity brief.
  try {
    const corpusPath = new URL('prompt-corpus-v5/prompt-corpus-v5.json', REPO_ROOT)
    const c = JSON.parse(readRaw('prompt-corpus-v5/prompt-corpus-v5.json'))
    const kinds = new Set((c.prompts || []).map(p => p.kind))
    const need = ['founding', 'founding-temp', 'founding-leaderless', 'resume', 'normal', 'checkpoint',
      'verify', 'verify-debate', 'meeting', 'meeting-proposal', 'inbox-dm', 'inbox-voters', 'inbox-chat',
      'inbox-office', 'inbox-assign', 'inbox-nudge', 'inbox-office-assign', 'inbox-office-nudge',
      'notice', 'notice-claim', 'after-failure',
      // the Lean formal-verification interaction must be reviewable by a human too — including
      // the `require` gate wording and the state a member sees AFTER a fidelity defect withdrew
      // a proof (both were missing from the first corpus, so nobody could read them).
      'lean-work', 'lean-verify', 'lean-fidelity', 'lean-require', 'lean-after-defect']
    for (const k of need) if (!kinds.has(k)) findings.push('the prompt corpus is missing a ' + k + ' prompt')
    const all = (c.prompts || []).map(p => p.prompt + '\n' + (p.charter || '')).join('\n')
    if (/你是 \?/.test(all)) findings.push('the prompt corpus contains a wrong-identity "你是 ?" brief')
    if (/\[状态\][^\n]*你是\s+(\S+?)[^\n]*\n/.test(all)) {
      // every [状态] line must name a real member id, never a placeholder
      for (const m of all.match(/\[状态\][^\n]*/g) || []) {
        const id = (/\[状态\]\s*你是\s+(\S+?)（/.exec(m) || [])[1]
        if (!id || id === '?' || id === 'undefined') findings.push('the prompt corpus has a bad identity line: ' + m.slice(0, 60))
      }
    }
    notes.push('prompt corpus: ' + (c.total || 0) + ' prompts, ' + kinds.size + ' kinds')
  } catch (e) {
    findings.push('the prompt corpus could not be read/parsed: ' + String((e && e.message) || e))
  }

  // The persona surface of ALL FOUR presets is a shipped prompt-correctness artifact too:
  // it is the only prompt the MAIN agent receives, and no e2e suite loads the YAML, so a
  // human reviewer needs the corpus on disk (generated by audit-persona-surface.test.mjs).
  try {
    const pc = JSON.parse(readRaw('prompt-corpus-persona/persona-corpus.json'))
    for (const d of ['vibe-math-v2', 'vibe-math-v3', 'vibe-math-v4', 'vibe-math-v5']) {
      if (!(pc.presets || []).some((p) => p.preset === d)) findings.push('the persona corpus is missing preset ' + d)
    }
    const emptyBlocks = (pc.presets || []).filter((p) => !p.prefix || !p.text).map((p) => p.preset)
    if (emptyBlocks.length) findings.push('the persona corpus has an empty persona block: ' + emptyBlocks.join(', '))
    notes.push('persona corpus: ' + (pc.presets || []).length + ' presets')
  } catch (e) {
    findings.push('the persona corpus could not be read/parsed: ' + String((e && e.message) || e))
  }
}

// ---- scanner self-check -------------------------------------------------
// The whole audit rests on stripNoise(); a scanner that mis-lexes silently BLINDS it (that is how the
// regex-with-a-quote bug lived here). Two checks, both cheap and both measured to be sensitive:
//   · the stripped source must still PARSE (the pre-fix scanner produced a SyntaxError);
//   · a fixture with a quoted character class + a following comment must survive intact.
{
  const tmp = mkdtempSync(join(tmpdir(), 'v5-integrity-strip-'))
  try {
    const f = join(tmp, 'v5.mjs')
    writeFileSync(f, src)
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' })
    if (r.status !== 0) {
      findings.push('stripNoise() corrupted the source it scans (the stripped text does not parse) — every identifier check below is unreliable: ' +
        String(r.stderr || '').split('\n').filter((l) => l.trim()).slice(-2).join(' ').slice(0, 160))
    }
    const fixture = [
      'function f(s) { return s.replace(/["\']/g, "-") }',
      '// phantom_call( must not survive as a call site',
      'const div = 6 / 2',
    ].join('\n')
    const stripped = stripNoise(fixture)
    if (stripped.includes('phantom_call')) findings.push('stripNoise() left a comment in the code stream (a phantom call site would be reported)')
    if (!/'/.test(stripped)) findings.push('stripNoise() dropped a value placeholder')
    // The session-API scan must ignore a SHADOWING `function(s)` parameter while still seeing the
    // real arrow handlers. Without this, either the false `s.trim()` finding comes back or the
    // scope skip silently blinds every tool-handler call — both are failures worth failing on.
    const scopeFixture = [
      'const names = m[1].split(",").map(function(s){ return s.trim() })',   // local string param
      'registerTool("t", "d", {}, (s, a) => s.resume())',                     // the session API
    ].join('\n')
    const spans = localSParamBodySpans(scopeFixture)
    const idxShadow = scopeFixture.indexOf('s.trim()')
    const idxApi = scopeFixture.indexOf('s.resume()')
    if (!spans.some(([a, b]) => idxShadow >= a && idxShadow <= b)) findings.push('the session-API scan would report a PHANTOM finding for a shadowing `function(s)` parameter (s.trim())')
    if (spans.some(([a, b]) => idxApi >= a && idxApi <= b)) findings.push('the session-API scan would SKIP a real arrow tool handler (s.resume() was classified as shadowed)')
    notes.push('scanner self-check: stripped output parses=' + (r.status === 0) + '; quoted-class fixture=' + (!stripped.includes('phantom_call')) +
      '; shadowed-param skip=' + spans.length)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// ---- R10 gates (README/docs/02-rulings.md §7.2), targeting the v5r preset ---------------
// v5 is FROZEN and predates R10, so these gates speak about `vibe-math-v5r` only. They go through
// `readRaw()` so the `V5_INTEGRITY_MUTATE` self-probe seam reaches them like every other gate.
{
  const v5rRaw = readRaw('vibe-math-v5r/vibe-math-v5r.js').replace(/\r\n?/g, '\n')
  const gate = (cond, key, msg) => { gateCount += 1; if (!cond) findings.push(key + ': ' + msg) }
  const countOf = (re) => (v5rRaw.match(re) || []).length
  gate(/function aggregateOpinion\(vs\)/.test(v5rRaw)
    && /voters: E, votersAll: E0, provisional: true,/.test(v5rRaw),
    'R10[1]', 'aggregateOpinion() must exist and carry provisional: true (a process tally is never a verdict)')
  gate(/function judgeVerdict\(vs, endedBy\)/.test(v5rRaw)
    && /if \(!endedBy\) return Object\.assign\(base, \{ outcome: 'undecided'/.test(v5rRaw),
    'R10[2]', 'judgeVerdict must require an explicit endedBy (and fall back to undecided)')
  gate(!/judgeVerdict\(vs\)/.test(v5rRaw.replace(/function judgeVerdict\(vs, endedBy\)/g, '')),
    'R10[3]', 'a judgeVerdict(vs) call without endedBy exists — process tallies must never decide')
  gate(/judgeVerdict\(vs, 'round-complete'\)/.test(v5rRaw),
    'R10[4]', "the end-of-round aggregation must pass endedBy='round-complete'")
  gate(/boundOf\('idle'/.test(v5rRaw) && /boundOf\('round-cap'/.test(v5rRaw) && /revocable: true/.test(v5rRaw),
    'R10[5]', 'the idle/round-cap fallbacks must be NAMED bounds (boundOf) and revocable:true')
  gate(!/abandoned \(stuck\)/.test(v5rRaw)
    && /endedBy: 'bound:idle', bound,/.test(v5rRaw)
    && /endedBy: 'bound:round-cap', bound: boundOf\(/.test(v5rRaw),
    'R10[6]', "a fallback close no longer records its named bound (or the implicit 'abandoned (stuck)' settle is back)")
  gate(countOf(/尚未生效·仅供参考/g) >= 3 && countOf(/provisional: true/g) >= 2,
    'R10[7]', 'process tallies are exposed without the provisional marking (尚未生效·仅供参考 / provisional: true)')
  gate(/if \(base\.silent\.length\) \{/.test(v5rRaw) && /D3 参与门：未表态阻塞结题/.test(v5rRaw),
    'R11', 'D3: the participation gate must be present (silence blocks the conclusion AND is named in the reason)')
  gate(/raw === 'abstain'/.test(v5rRaw) && /v\.abstain === true/.test(v5rRaw) && /estimates \+= 1/.test(v5rRaw),
    'R12', 'L4: an EXPLICIT abstention channel must exist and stay separate from the 0<p<1 estimate')
  gate(/const E = E0\.filter\(\(id\) => !unableMap\[id\]\)/.test(v5rRaw) && /退出本次分母/.test(v5rRaw),
    'R13', 'D3: an explicit unable/不能应答 declaration must leave the denominator (and still be listed)')
  gate(/registerTool\('vibe_v5_end_verify'/.test(v5rRaw) && /async function endVerify\(memberId, target, reason\)/.test(v5rRaw) && /judgeVerdict\(vs, 'academician'\)/.test(v5rRaw),
    'R14', 'R10-2a: the academician explicit end-of-debate channel must exist and aggregate with endedBy=academician')
  gate(/沉默不是同意/.test(v5rRaw) && /阻塞结题/.test(v5rRaw) && !/沉默[^。\n]{0,10}(视为|等同|算作)[^。\n]{0,8}(同意|赞成|无异议)/.test(v5rRaw),
    'R15', 'R2/C1: agent-facing text must state silence is neither consent nor opposition, and must not fold silence into consent')
  gate(/const declaredWord =/.test(v5rRaw) && /isVerdictWord/.test(v5rRaw) && /declared === undefined \? declaredWord : declared/.test(v5rRaw),
    'R16', 'L4: the member turn-reply channel must accept abstain/unable exactly like the tool (no second-class channel)')
  gate(/registerTool\('vibe_v5_self_report'/.test(v5rRaw) && /selfReportTool/.test(v5rRaw),
    'R17', 'G6: the self-report command must be registered (update + audited read)')
  gate(/const timeKeys = Object\.keys\(args\)\.filter/.test(v5rRaw) && /时间由框架设置（G6 §7\.1）/.test(v5rRaw)
    && /\(At\|Ms\)\$\/i/.test(v5rRaw),
    'R18', 'G6: any user-supplied …At/…Ms must be refused with the framework-sets-time message — CASE-INSENSITIVELY (/(At|Ms)$/i; a lower-case expires_at/subgoal_at must not slip through)')
  gate(/history\.push\(\{ at, by: m\.id, field: c\.field, old: c\.old/.test(v5rRaw),
    'R19', 'G6: writing must append history with the OLD value (nothing silently dropped)')
  gate(/next\.deviation = \{ at, by: m\.id, keptAcademicianValue: ov\.old/.test(v5rRaw) && /已偏离院士设定/.test(v5rRaw),
    'R20', 'G6: a member editing an academician-set overall must record deviation and keep the original value/time')
  gate(/const audit = await selfViewAudit\(viewerId,/.test(v5rRaw) && /私聊内容永不进入/.test(v5rRaw) && /viewAuditTail/.test(v5rRaw),
    'R21', 'G6: the view must be audited and must never carry private-message fields')
  gate(/deduped: true, member: m\.id, fields: fieldsOf\(next\)/.test(v5rRaw),
    'R22', 'G6: same-value resubmission must be idempotent (deduped:true, no history append)')
  // ---- S4 (D1/D2/R4/R5): the chair and the procedural-objection relief channel -----------------
  // `bodyOf(sig)` slices ONE named function's body (from its declaration to the next 4-space closing
  // brace), so R26/R27/R28 can assert what that code must NOT read or touch. Every gate below has a
  // SINGLE-SITE self-probe mutation above that reddens it BY NAME.
  const bodyOf = (sig) => {
    const i = v5rRaw.indexOf(sig)
    if (i === -1) return ''
    const j = v5rRaw.indexOf('\n    }', i)
    return j === -1 ? '' : v5rRaw.slice(i, j)
  }
  const chairBody = bodyOf('async function chairProxyTool(memberId, a)')
  const objectionBody = bodyOf('async function proceduralObjectionTool(memberId, a)')
  const judgeBody = bodyOf('function judgeVerdict(vs, endedBy)')
  const RUNTIME_TOOLS = ['vibe_v5_end_verify', 'vibe_v5_self_report', 'vibe_v5_chair_proxy', 'vibe_v5_procedural_objection']
  const runtimeRegistered = RUNTIME_TOOLS.filter((n) => new RegExp("registerTool\\('" + n + "'").test(v5rRaw))
  gate(runtimeRegistered.length === RUNTIME_TOOLS.length,
    'R23', 'S4: the four v5r runtime tools (#43–#46: end_verify / self_report / chair_proxy / procedural_objection) must all be registered (42 platform commands + 4)')
  gate(!!chairBody && /V5_NOT_ACADEMICIAN/.test(chairBody)
    && /String\(args\.scope \|\| ''\) !== CHAIR_SCOPE_CLOSE/.test(chairBody)
    && /meeting\.chair = rec/.test(chairBody),
    'R24', 'S4/D1: appointing a proxy must be academician-only, scope must be the SINGLE value "close", and the record must be filed (meeting.chair + the durable chair)')
  gate(!!objectionBody && /chairReply: null/.test(objectionBody) && /chairReplyPending: true/.test(objectionBody),
    'R25', 'S4/D2: an objection must be filed with chairReply:null and chairReplyPending:true VISIBLE (a pending reply is never faked as answered)')
  gate(!!judgeBody && !/\bchair\b|\bproxy\b/.test(judgeBody),
    'R26', 'S4/R5: judgeVerdict must not read the chair/proxy record — the chair gets NO extra weight')
  gate(!!chairBody && !/voters\(|quorum|members\s*[.=]|\.push\(/.test(chairBody),
    'R27', 'S4/D1: appointing a proxy must not touch the electorate (a proxy never adds a vote)')
  gate(!!chairBody && /deduped: true/.test(chairBody) && !!objectionBody && /deduped: true/.test(objectionBody),
    'R28', 'S4: both runtime tools must carry a same-value idempotent branch (deduped:true)')
  notes.push('S4 (v5r): runtime tools registered=' + runtimeRegistered.length + '/4'
    + '; academician gate=' + /V5_NOT_ACADEMICIAN/.test(chairBody)
    + '; scope single value=' + /CHAIR_SCOPE_CLOSE/.test(chairBody)
    + '; chair filed (meeting.chair)=' + /meeting\.chair = rec/.test(chairBody)
    + '; objection pending visible=' + /chairReplyPending: true/.test(objectionBody)
    + '; judgeVerdict reads chair/proxy=' + /\bchair\b|\bproxy\b/.test(judgeBody)
    + '; proxy touches electorate=' + /voters\(|quorum|members\s*[.=]|\.push\(/.test(chairBody))
  notes.push('D3/L4 (v5r): participation gate=' + /if \(base\.silent\.length\) \{/.test(v5rRaw) + '; abstain channel=' + /raw === 'abstain'/.test(v5rRaw) + '; unable-out-of-denominator=' + /unableMap\[id\]/.test(v5rRaw) + '; end_verify(R10-2a)=' + /vibe_v5_end_verify/.test(v5rRaw))
  // ---- S5 (R1/D10): the framework only RECOMMENDS — it never drives -------------------------------
  // The stalled path gets ONE notice per stall episode ("who is waiting for whom"); it must never
  // convene / close / advance anything and must never speak for a member. R29 is the behaviour this
  // step CHANGED; R32/R33 are defence-in-depth (the pre-S5 tree did not violate them either). Each
  // gate has its own single-site self-probe mutation above.
  const passBody = bodyOf('async function schedulePass() {')
  const waitBody = bodyOf('function stallWaitingList() {')
  const noticeBody = bodyOf('async function emitStallNotice() {')
  const clampLoops = v5rRaw.match(/for \(const k of \[[^\]]*\]\) \{/g) || []
  gate(!!passBody && passBody.length > 800 && !/startMeeting\(/.test(passBody) && /emitStallNotice\(\)/.test(passBody)
    && !clampLoops.some((l) => l.indexOf('stallAutoMeetingMs') !== -1),
    'R29', 'S5/R1+D10: the stalled path must only NOTICE (once) — never convene — and the threshold must stay switchable OFF (a negative value must not be silently dropped by the non-positive clamp)')
  gate(!!noticeBody && /Number\(prev\.sinceAt\) === sinceAt\) return false/.test(noticeBody)
    && /if \(patch\.stallNotice !== undefined\) n\.stallNotice = /.test(v5rRaw),
    'R30', 'S5/D10: the stall notice must be ONE per stall episode (keyed on sinceAt) and its durable marker must pass the fold whitelist')
  gate(!!waitBody && /blocked\[0\]\.id/.test(waitBody) && /等有人认领/.test(waitBody) && /下一步等 /.test(waitBody) && /slice\(0, 3\)/.test(waitBody),
    'R31', 'S5/D10: the notice must list WHO IS WAITING FOR WHOM (blocked task / unclaimed task / longest-idle member, capped at 3 — the two in-flight classes are structurally unreachable in this branch)')
  gate(!!passBody && !/finalizeMeeting\(|closeVerify\(|finalizeUndecided\(|patchInstitute\(\{ phase/.test(passBody),
    'R32', 'S5/R1+D10+R4/H2: the stalled path must never close, adjourn or advance anything (no 顺手收束; defence-in-depth)')
  gate(!!passBody && !/castVerdict\(|putSolve\(|selfReport\(/.test(passBody),
    'R33', 'S5/R2+R3+D3/D8: the stalled path must never speak for a member (no ballot / solve vote / self-report; defence-in-depth)')
  notes.push('S5 (v5r): schedulePass len=' + passBody.length
    + '; stall path convenes=' + /startMeeting\(/.test(passBody)
    + '; one-shot key=' + /Number\(prev\.sinceAt\) === sinceAt\) return false/.test(noticeBody)
    + '; waiting sources=' + ['blocked[0].id', '等有人认领', '下一步等 '].filter((x) => waitBody.indexOf(x) !== -1).length + '/3'
    + '; in-flight classes in wait list=' + /busy|currentVerify\(/.test(waitBody)
    + '; off-switch reachable=' + !clampLoops.some((l) => l.indexOf('stallAutoMeetingMs') !== -1)
    + '; closes/advances=' + /finalizeMeeting\(|closeVerify\(|finalizeUndecided\(|patchInstitute\(\{ phase/.test(passBody)
    + '; speaks for member=' + /castVerdict\(|putSolve\(|selfReport\(/.test(passBody))
  // ---- S6 (D1/D2/D6/D8): temporary authorization — the ONE predicate + the event-typed ledger ---------
  // The grantable set is bounded to the four commands whose guard is the DEFAULT table; a command guarded
  // by an ADJUDICATION-LEVEL identity can never be delegated (end_verify / the chair / ballots / the
  // private face / authorization itself). Expiry is event-derived, never a "marked for collection" flag.
  const grantBody = bodyOf('async function grantTool(memberId, a)')
  const canDoBody = bodyOf('function canDo(callerId, command)')
  const defaultBody = bodyOf('function defaultAllowed(callerId, command)')
  const activeBody = bodyOf('function grantActive(g)')
  gate(/registerTool\('vibe_v5_grant'/.test(v5rRaw) && /registerTool\('vibe_v5_revoke'/.test(v5rRaw)
    && /if \(patch\.grants !== undefined\)/.test(v5rRaw)
    && /expiresOn:/.test(grantBody) && /revokedAt: 0/.test(grantBody),
    'R34', 'S6: the authorization ledger (#47/#48) must be registered, must pass the fold whitelist (patch.grants), and must carry expiresOn/revokedAt')
  gate(!!canDoBody && !!defaultBody && /const g = grantEffective\(callerId, command\)/.test(canDoBody)
    && /function grantEffective\(callerId, command\)/.test(v5rRaw)
    && /await gateDo\(memberId, 'assign'/.test(v5rRaw)
    && /await gateDo\(memberId, 'prioritize'/.test(v5rRaw)
    && /await gateDo\(callerId, 'nudge'/.test(v5rRaw)
    && /await gateDo\(member\.id, 'end_verify'/.test(v5rRaw)
    && /canDo\(callerId, 'convene'\)/.test(v5rRaw)
    && /canDo\(memberId, 'board'\)/.test(v5rRaw)
    && /authorized: true/.test(v5rRaw)
    && /GRANTABLE_COMMANDS = \['assign', 'prioritize', 'nudge', 'convene'\]/.test(v5rRaw),
    'R35', 'S6: ONE predicate (canDo = default table ∩ stage ∩ active grant − revoked) must gate all SIX permission points (assign/prioritize/nudge/end_verify/convene + the board plane), and the grantable set must stay the bounded four (assign/prioritize/nudge/convene) — the criterion: a command guarded by an ADJUDICATION-LEVEL identity can never be delegated')
  gate(!!grantBody && !/\bvoters\(|quorum|\bmembers\b/.test(grantBody),
    'R36', 'S6/D8: an authorization must NEVER add vote power (the grant path touches no electorate)')
  gate(!!grantBody && /V5_NOT_VOTER/.test(grantBody)
    && grantBody.indexOf('V5_NOT_VOTER') < grantBody.indexOf('patchInstitute({ grants:')
    && /target\.kind === 'academician' \|\| target\.kind === 'researcher'/.test(grantBody),
    'R37', 'S6/D8: only roster members may be authorized — a non-member must be refused BY NAME, and that check must run BEFORE anything is written to the ledger')
  gate(!!activeBody && /Number\(g\.revokedAt \|\| 0\) > 0\) return false/.test(activeBody)
    && /Number\(g\.expiredAt \|\| 0\) > 0\) return false/.test(activeBody)
    && /g\.grantScope === 'once'/.test(activeBody) && /Number\(g\.usedAt \|\| 0\) === 0/.test(activeBody)
    && /g\.grantScope === 'meeting'/.test(activeBody) && /String\(g\.meetingId \|\| ''\) === String\(meeting\.id\)/.test(activeBody)
    && /g\.grantScope === 'verify'/.test(activeBody) && /String\(g\.verifyTarget \|\| ''\) === String\(cv\.target\)/.test(activeBody)
    && /expiredAt: now\(\)/.test(v5rRaw),
    'R38', 'S6: expiry must be EVENT-derived and automatic (revoked / recorded-expired / once-used / the meeting or the verification is no longer the one it was granted for) — a grant must never stay effective merely because nobody marked it')
  notes.push('S6 (v5r): grant tools=' + ['vibe_v5_grant', 'vibe_v5_revoke'].filter((n) => new RegExp("registerTool\\('" + n + "'").test(v5rRaw)).length + '/2'
    + '; grantable=' + (v5rRaw.match(/GRANTABLE_COMMANDS = \[([^\]]*)\]/) || ['', ''])[1].replace(/['\s]/g, '')
    + '; predicate=canDo(' + /const g = grantEffective\(callerId, command\)/.test(canDoBody) + ')'
    + '; grant path touches electorate=' + /\bvoters\(|quorum|\bmembers\b/.test(grantBody)
    + '; D8 before ledger=' + (grantBody.indexOf('V5_NOT_VOTER') < grantBody.indexOf('patchInstitute({ grants:'))
    + '; event-derived expiry=' + /g\.grantScope === 'once'/.test(activeBody) + '/' + /g\.grantScope === 'meeting'/.test(activeBody) + '/' + /g\.grantScope === 'verify'/.test(activeBody)
    + '; meeting-close marks expired=' + /expiredAt: now\(\)/.test(v5rRaw))
  // ---- S7 (D3/D4/R9/K13): the poll board — six ruling §7.1 items + the TWO separate thresholds --------
  // `settled` reads ONLY min_votes+cast; the closure gate (quorum m / no pending voters) never reads
  // min_votes; an unmet min_votes leaves the poll UNSETTLED and writes no truth value; vote power comes
  // only from the electorate (never from a grant); nothing settles "on time"; a secret board exposes
  // the tally only.
  const pollOpenBody = bodyOf('async function pollOpenTool(memberId, a)')
  const pollVoteBody = bodyOf('async function pollVoteTool(memberId, a)')
  const pollCloseBody = bodyOf('async function pollCloseTool(memberId, a)')
  const ballotViewBody = bodyOf('function ballotView(b) {')
  const grantableLine = (v5rRaw.match(/const GRANTABLE_COMMANDS = \[[^\]]*\]/) || [''])[0]
  gate(/registerTool\('vibe_v5_poll_open'/.test(v5rRaw) && /registerTool\('vibe_v5_poll_vote'/.test(v5rRaw)
    && /registerTool\('vibe_v5_poll_close'/.test(v5rRaw)
    && /if \(patch\.ballots !== undefined\)/.test(v5rRaw)
    && /rules: \{ mode, max, min, minVotes, secret, allowAbstain, allowRevote \}/.test(v5rRaw)
    && /min_votes: I/.test(v5rRaw) && /secret: B/.test(v5rRaw),
    'R39', 'S7/§7.1: the poll board must be registered (open/vote/close), must pass the fold whitelist (patch.ballots), and must snapshot ALL six academician-set items (options/mode/max/min/min_votes/secret+abstain+revote) BEFORE the vote opens')
  gate(/const ballotSettled = \(b\) => !!b && ballotCast\(b\) >= Number\(\(\(b \|\| \{\}\)\.rules \|\| \{\}\)\.minVotes \|\| 0\)/.test(v5rRaw)
    && /const ballotQuorumReached = \(b\) => !!b && ballotPending\(b\)\.length === 0/.test(v5rRaw)
    && /const settled = ballotSettled\(b\)/.test(v5rRaw)
    && !/settled = [^\n]*quorumM\(\)/.test(v5rRaw)
    && !/(ballotPending|quorumReached|quorum_reached)[^\n]*minVotes/.test(v5rRaw),
    'R40', 'S7/K13: the two thresholds must stay separate and BIDIRECTIONAL — `settled` reads ONLY min_votes+cast, while the closure gate (no pending voters / quorum m) never reads min_votes')
  gate(!!pollCloseBody && /outcome: settled \? 'recorded' : 'unsettled'/.test(pollCloseBody)
    && /satisfied: settled, settled/.test(pollCloseBody)
    && !/putVerdict\(|putSolve\(|selfReport\(|patchInstitute\(\{ verdicts/.test(pollCloseBody)
    && !/putVerdict\(|putSolve\(|selfReport\(/.test(pollOpenBody)
    && !/putVerdict\(|putSolve\(/.test(pollVoteBody),
    'R41', 'S7/R9: an unmet min_votes must leave the poll UNSETTLED (outcome "unsettled") and the poll path must never write a truth value (no verdicts / no solve / no self-report) — the remaining votes are never used to infer a conclusion')
  gate(!!pollVoteBody && /voters\(\)\.some\(/.test(pollVoteBody) && /V5_NOT_VOTER/.test(pollVoteBody)
    && grantableLine.indexOf('poll_vote') === -1
    && !/grantEffective\(|grantsList\(/.test(pollVoteBody),
    'R42', 'S7/D8+H12: vote power comes ONLY from the electorate (voters()) — a non-member is refused by name, the poll path never consults the grant ledger, and poll_vote is NOT in the grantable set')
  gate(!/setTimeout\([^)]*pollCloseTool|armHeartbeat\([^)]*poll[Cc]lose/.test(v5rRaw)
    && /const secret = args\.secret === true/.test(pollOpenBody)
    && /named \? \(b\.votes \|\| \[\]\)\.map/.test(ballotViewBody)
    && /secret: !named/.test(ballotViewBody),
    'R43', 'S7/D10+D3: nothing settles a poll "on time" (closure is an EXPLICIT academician action only), `secret` defaults to false (named), and a secret board exposes the TALLY only — never who chose what')
  notes.push('S7 (v5r): poll tools=' + ['vibe_v5_poll_open', 'vibe_v5_poll_vote', 'vibe_v5_poll_close'].filter((n) => new RegExp("registerTool\\('" + n + "'").test(v5rRaw)).length + '/3'
    + '; ledger whitelist=' + /if \(patch\.ballots !== undefined\)/.test(v5rRaw)
    + '; settled reads only minVotes+cast=' + !/settled = [^\n]*quorumM\(\)/.test(v5rRaw)
    + '; closure gate reads minVotes=' + /(ballotPending|quorumReached|quorum_reached)[^\n]*minVotes/.test(v5rRaw)
    + '; poll_vote in grantable=' + (grantableLine.indexOf('poll_vote') !== -1)
    + '; secret default=' + /const secret = args\.secret === true/.test(pollOpenBody)
    + '; secret board hides choices=' + !/ballot: \(b\.votes/.test(ballotViewBody))
  // ---- S8 (R3/K12/B9): the temporal separation of ballots and speech --------------------------------
  // The freeze is DERIVED (an OPEN poll board), enforced BY NAME at BOTH member entries (the say tool
  // and the meeting reply), never inside `say()` (framework messages must keep flowing), never changes
  // the phase / closes anything / unfreezes on a timer, never touches a ballot, and the minutes carry
  // BOTH zones (rendered + structured).
  const frozenBody = bodyOf('function speechFrozen() {')
  const speechGateBody = bodyOf('function speechGate(callerId) {')
  const finalizeBody = bodyOf('async function finalizeMeeting(mn) {')
  const sayBody = bodyOf('async function say(from, opts) {')
  gate(/function speechFrozen\(\) \{/.test(v5rRaw) && /const b = openBallot\(\)/.test(frozenBody)
    && /表决期禁止发言/.test(speechGateBody) && /V5_INVALID_ARGUMENT/.test(speechGateBody)
    && /registerTool\('vibe_v5_say'[\s\S]{0,2000}s\.speechGate\(from\)/.test(v5rRaw)
    && /const frozenSpeech = speechFrozen\(\)\.frozen/.test(v5rRaw)
    && !/delete\s+meeting\.hands/.test(frozenBody + speechGateBody),
    'R44', 'S8/R3+K12+B9: during a ballot (an OPEN poll board) member speech must be refused BY NAME at BOTH member entries (vibe_v5_say + the meeting reply), and the freeze must NOT clear the raised-hand queue')
  gate(!!speechGateBody && !/finalizeMeeting\(|closeVerify\(|patchInstitute\(\{ phase|meeting\.phase =|setTimeout\(|armHeartbeat\(/.test(frozenBody + speechGateBody),
    'R45', 'S8/D10: the freeze is DERIVED and passive — it never changes the meeting phase, never closes anything, and has no timer (nothing unfreezes "on time")')
  gate(!!speechGateBody && !/putSolve\(|castVerdict\(|putVerdict\(|patchInstitute\(\{ ballots|verdicts/.test(speechGateBody)
    && !/patchInstitute\(\{ ballots/.test(frozenBody)
    && /recordSolveVote\(/.test(v5rRaw),
    'R46', 'S8/H3: the freeze touches NO ballot (no putSolve/castVerdict/putVerdict/ballots write) — a vote cast in the same reply still counts, and speech never becomes a vote')
  gate(/lines\.push\('## 发言区'\)/.test(finalizeBody) && /lines\.push\('## 投票区'\)/.test(finalizeBody)
    && /未投票名单/.test(finalizeBody)
    && /const speechZone = /.test(finalizeBody) && /const voteZone = /.test(finalizeBody)
    && /commit\(EV\.meeting, \{\s*index: \{ id: mn\.id \},\s*minutes: \{ at: now\(\), speechZone, voteZone/.test(finalizeBody),
    'R47', 'S8/K12: the minutes must carry BOTH zones — rendered (`## 发言区` / `## 投票区` with the unvoted list) AND structured (`minutes{speechZone,voteZone}` written back to the durable meeting entry)')
  gate(!!sayBody && !/speechGate\(|speechFrozen\(/.test(sayBody)
    && /registerTool\('vibe_v5_say'[\s\S]{0,2000}s\.speechGate\(from\)[\s\S]{0,400}s\.sayQuote\(from, a\)/.test(v5rRaw),
    'R48', 'S8: the gate lives at the MEMBER ENTRY (the vibe_v5_say handler), never inside say() — framework/system messages (assignments, nudges, broadcasts, poll progress) must keep flowing during a ballot')
  notes.push('S8 (v5r): freeze=' + (/const b = openBallot\(\)/.test(frozenBody) ? 'derived(open ballot)' : 'MISSING')
    + '; gate at say tool=' + /registerTool\('vibe_v5_say'[\s\S]{0,2000}s\.speechGate\(from\)/.test(v5rRaw)
    + '; gate inside say()=' + /speechGate\(|speechFrozen\(/.test(sayBody)
    + '; meeting reply refused=' + /const frozenSpeech = speechFrozen\(\)\.frozen/.test(v5rRaw)
    + '; passive(no phase/finalize/timer)=' + !/finalizeMeeting\(|closeVerify\(|patchInstitute\(\{ phase|meeting\.phase =|setTimeout\(|armHeartbeat\(/.test(frozenBody + speechGateBody)
    + '; touches ballot=' + /putSolve\(|castVerdict\(|putVerdict\(|patchInstitute\(\{ ballots/.test(speechGateBody)
    + '; zones=' + (/lines\.push\('## 发言区'\)/.test(finalizeBody) && /lines\.push\('## 投票区'\)/.test(finalizeBody) ? 'both' : 'MISSING')
    + '; structured minutes=' + /minutes: \{ at: now\(\), speechZone, voteZone \}/.test(finalizeBody))
  // ---- S9 (D5/D5a/U3): minority archiving + reconsideration -----------------------------------------
  // Minority opinions are FIRST-CLASS (sealed `minority[]` + a rendered section; abstain/unable/silent
  // never count); eligibility is DERIVED FROM THE RECORD (winner-only / any participant — never a role);
  // the threshold can only RISE; no new error code; nothing closes/settles or arms a timer; and a SECRET
  // board's reconsideration exposes aggregates only.
  const minorityBody = bodyOf('function minorityOf(rec) {')
  const sealBody = bodyOf('function sealRecord(rec) {')
  const reconsiderBody = bodyOf('async function reconsiderTool(memberId, a) {')
  const judgeVerdictBody = bodyOf('function judgeVerdict(vs, endedBy) {')
  gate(!!minorityBody && /if \(v\.abstain\) continue/.test(minorityBody)
    && /outcome === 'true'\) isMinority = p < 1/.test(minorityBody)
    && /outcome === 'false'\) isMinority = p > 0/.test(minorityBody)
    && /minority,/.test(sealBody) && /minorityCount: minority\.length/.test(sealBody)
    && /record: sealRecord\(record\)/.test(v5rRaw) && /mins\.length/.test(v5rRaw),
    'R49', 'S9/D5: minority opinions must be FIRST-CLASS (a sealed `minority[]` on every closed record + a rendered section) — abstain/unable/silent never count as minority')
  gate(/const hasWinner = outcome === 'true' \|\| outcome === 'false'/.test(reconsiderBody)
    && /const wanted = outcome === 'true' \? 1 : 0/.test(reconsiderBody)
    && /const participated = !!\(mine \|\| \(rec\.unable && rec\.unable\[memberId\]\)\)/.test(reconsiderBody)
    && /if \(hasWinner\) \{/.test(reconsiderBody)
    && /当初胜方之一\*\*提出/.test(reconsiderBody)
    && /let eligibility = 'any-participant'/.test(reconsiderBody)
    && !/academician/.test(reconsiderBody),
    'R50', 'S9/D5+D5a: eligibility is DERIVED FROM THE RECORD (winner-only with a clear winner; ANY participant when there is no winner, which may not be refused for "having no winner") — never from a role')
  gate(/const after = Math\.max\(before, floor, cap\)/.test(reconsiderBody)
    && /raisedBy: after - before, onlyUp: after >= before/.test(reconsiderBody)
    && /const raisedM = raisedThresholdOf\(vs\)/.test(judgeVerdictBody)
    && /if \(raisedM > Number\(base\.m \|\| 0\)\) base\.m = raisedM/.test(judgeVerdictBody)
    && /params\.reconsiderFloor\) \|\| 0\)\)/.test(v5rRaw),
    'R51', 'S9/U3: the reconsideration threshold can only RISE — after = max(before, reconsiderFloor, quorumCap), the raise is recorded, and judgeVerdict clamps to threshold.m')
  gate(!!reconsiderBody && /code: 'V5_INVALID_ARGUMENT'/.test(reconsiderBody)
    && !/code: 'V5_(?!INVALID_ARGUMENT|NOT_VOTER|MEMBER_NOT_FOUND|NOT_ACADEMICIAN|INVALID_VERDICT|NO_OPEN_MEETING)[A-Z_]+/.test(reconsiderBody),
    'R52', 'S9: the reconsideration path introduces NO new error code (it reuses the existing V5_INVALID_ARGUMENT / V5_NOT_VOTER / …)')
  gate(!!reconsiderBody && !/finalizeMeeting\(|closeVerify\(|patchInstitute\(\{ phase|meeting\.phase =|setTimeout\(|setInterval\(|armHeartbeat\(|putSolve\(|castVerdict\(/.test(reconsiderBody),
    'R53', 'S9: a reconsideration never changes the phase, never closes/settles anything, writes no ballot and arms no timer (R1/D10)')
  gate(/const bSecret = !!\(b\.rules && b\.rules\.secret\)/.test(reconsiderBody)
    && /secretSource: bSecret/.test(reconsiderBody)
    && !/choices/.test(reconsiderBody)
    && /不记名\*\*：只给聚合票数与门槛/.test(v5rRaw),
    'R54', 'S9×S7+B10: for a SECRET board the reconsideration exposes AGGREGATES ONLY (tally + threshold) — per-person choices are never decrypted')
  notes.push('S9 (v5r): minority sealed=' + /minorityCount: minority\.length/.test(sealBody)
    + '; seal point=' + /record: sealRecord\(record\)/.test(v5rRaw)
    + '; abstain excluded=' + /if \(v\.abstain\) continue/.test(minorityBody)
    + '; eligibility record-derived=' + (/const hasWinner = outcome === 'true' \|\| outcome === 'false'/.test(reconsiderBody) && /let eligibility = 'any-participant'/.test(reconsiderBody))
    + '; threshold only-up=' + /const after = Math\.max\(before, floor, cap\)/.test(reconsiderBody)
    + '; judge clamps=' + /if \(raisedM > Number\(base\.m \|\| 0\)\) base\.m = raisedM/.test(judgeVerdictBody)
    + '; new codes=' + /code: 'V5_(?!INVALID_ARGUMENT|NOT_VOTER|MEMBER_NOT_FOUND|NOT_ACADEMICIAN|INVALID_VERDICT|NO_OPEN_MEETING)[A-Z_]+/.test(reconsiderBody)
    + '; board branch=' + /const bSecret = !!\(b\.rules && b\.rules\.secret\)/.test(reconsiderBody)
    + '; secret aggregates only=' + !/choices/.test(reconsiderBody))
  // ---- S10 (D6/G5): the quoting boundary ------------------------------------------------------------
  // A quote carries ONLY a <=200-char summary + a stable pointer; the same-meeting rule is enforced
  // (cross-meeting ⇒ refused by name, `res:` only); a private message is not a source until its OWN
  // sender supplements it publicly (the fact is recorded, the text is not copied); the count cap
  // (default 2) refuses by name while the depth cap (default 3) COLLAPSES; a dangling anchor and a
  // secret board's per-person anchor are refused; no new error code; nothing is driven.
  const quoteBody = bodyOf('async function sayQuote(callerId, args) {')
  const anchorBody = bodyOf('async function resolveQuoteAnchor(ref) {')
  gate(/const QUOTE_EXCERPT_MAX = 200/.test(v5rRaw)
    && /s\.slice\(0, QUOTE_EXCERPT_MAX\), truncated: true/.test(v5rRaw)
    && /excerpt: capped \? '' : cut\.excerpt/.test(quoteBody)
    && !/fullText|originalText|quotedText/.test(quoteBody)
    && /quote: opts\.quote/.test(v5rRaw),
    'R55', 'S10/D6: a quote carries ONLY a <=200-char summary plus a stable pointer — the excerpt is deterministically truncated (truncated:true) and the full text is never copied')
  gate(/if \(String\(got\.meetingId \|\| ''\) !== curMeetingId\)/.test(quoteBody)
    && /引用\*\*仅限同一会议内\*\*（D6）/.test(quoteBody)
    && /\^res:/.test(anchorBody)
    && /res:latest/.test(anchorBody) && /resolutionsList\(\)/.test(anchorBody)
    && /悬空引用：找不到决议/.test(anchorBody)
    && /supersededBy: String\(rec\.supersededBy \|\| ''\)/.test(anchorBody)
    && !/尚未实现/.test(anchorBody),
    'R56', 'S10×S13/D6: quoting is limited to the SAME meeting for meeting-internal anchors (the meetingId must match; both-outside = the chat domain), while a RESOLUTION may be quoted across meetings via its stable id (`res:<n>` / `res:latest`, resolved against the durable `resolutions[]` ledger — a resolution that is not on file is a dangling refusal, and a superseded one carries supersededBy so the quote can be marked as reconsidered)')
  gate(/String\(found\.kind\) === 'dm'/.test(anchorBody) && /请先由\*\*本人\*\*用/.test(anchorBody)
    && /if \(String\(src\.from\) !== String\(callerId\)\)/.test(quoteBody)
    && /chatSupplements: \(list\)/.test(quoteBody)
    && !/src\.text/.test(quoteBody),
    'R57', 'S10/D6+G5: a private message is not a quotable source until its OWN SENDER supplements it publicly (supplement_of + why); the supplement path records only the FACT (chatSupplements) and never copies the private text into the public face')
  gate(/const QUOTE_DEFAULT_PER_MESSAGE = 2/.test(v5rRaw) && /const QUOTE_DEFAULT_DEPTH = 3/.test(v5rRaw)
    && /if \(refs\.length > quotesPerMessageMax\(\)\)/.test(quoteBody)
    && /const capped = depth > quoteDepthMax\(\)/.test(quoteBody)
    && /collapsed: capped/.test(quoteBody)
    && /折叠为\*\*「见第 k 轮发言 #n」/.test(quoteBody),
    'R58', 'S10/D6: at most quotesPerMessageMax (default 2) quotes per message are accepted (refused by name beyond that), while a chain deeper than quoteDepthMax (default 3) is COLLAPSED to an anchor instead of being refused (`04` §4)')
  gate(/\(!b \|\| !body\) return quoteRefused\('悬空引用/.test(anchorBody)
    && /'悬空引用：找不到消息 ' \+ id/.test(anchorBody)
    && /'悬空引用：找不到投票板 ' \+ bal\[1\]/.test(anchorBody)
    && /不记名板的\*\*逐人选择不可引用\*\*/.test(anchorBody)
    && /const secret = !!\(b\.rules && b\.rules\.secret\)/.test(anchorBody)
    && /domain: 'ballot'/.test(anchorBody),
    'R59', 'S10/D6+B10: EVERY anchor branch refuses a dangling reference by name (minutes speech / chat message / poll board), and a SECRET board may only be quoted as an aggregate (a per-person anchor is refused)')
  gate(!!quoteBody && /const quoteRefused = \(message\) => \(\{ ok: false, code: 'V5_INVALID_ARGUMENT', message \}\)/.test(v5rRaw)
    && !/code: 'V5_/.test(quoteBody + anchorBody)
    && !/finalizeMeeting\(|closeVerify\(|patchInstitute\(\{ phase|meeting\.phase =|setTimeout\(|setInterval\(|armHeartbeat\(|putSolve\(|castVerdict\(/.test(quoteBody),
    'R60', 'S10: the quote path introduces NO new error code (its only refusal helper hardcodes V5_INVALID_ARGUMENT and neither body inlines a code) and drives NOTHING (no phase change, no closure, no ballot write, no timer)')
  notes.push('S10 (v5r): excerpt max=' + (/const QUOTE_EXCERPT_MAX = 200/.test(v5rRaw) ? 200 : 'MISSING')
    + '; truncation=' + /s\.slice\(0, QUOTE_EXCERPT_MAX\), truncated: true/.test(v5rRaw)
    + '; same-domain gate=' + /if \(String\(got\.meetingId \|\| ''\) !== curMeetingId\)/.test(quoteBody)
    + '; res refused=' + (/\^res:/.test(anchorBody) && /#26/.test(anchorBody))
    + '; dm blocked=' + /String\(found\.kind\) === 'dm'/.test(anchorBody)
    + '; supplement own-sender=' + /if \(String\(src\.from\) !== String\(callerId\)\)/.test(quoteBody)
    + '; fact-only ledger=' + (/chatSupplements: \(list\)/.test(quoteBody) && !/src\.text/.test(quoteBody))
    + '; per-message max=' + (/const QUOTE_DEFAULT_PER_MESSAGE = 2/.test(v5rRaw) ? 2 : 'MISSING')
    + '; depth max=' + (/const QUOTE_DEFAULT_DEPTH = 3/.test(v5rRaw) ? 3 : 'MISSING')
    + '; collapse not refuse=' + /collapsed: capped/.test(quoteBody)
    + '; dangling refused=' + /悬空引用/.test(anchorBody)
    + '; secret per-person refused=' + /不记名板的\*\*逐人选择不可引用\*\*/.test(anchorBody)
    + '; new codes=' + /code: 'V5_(?!INVALID_ARGUMENT|MEMBER_NOT_FOUND)[A-Z_]+/.test(quoteBody + anchorBody)    + '; drives=' + /finalizeMeeting\(|closeVerify\(|patchInstitute\(\{ phase|meeting\.phase =|setTimeout\(|setInterval\(|armHeartbeat\(|putSolve\(|castVerdict\(/.test(quoteBody))
  // ---- S11 (GAPS 29): the meeting secretary (recording kept out of the chair's hands) -----------------
  const secretaryBody = bodyOf('async function secretaryTool(memberId, a) {')
  const minutesBody = bodyOf('async function minutesTool(memberId, a) {')
  gate(!!secretaryBody && /m\.kind === 'academician' \|\| isOffice\(who\)/.test(secretaryBody)
    && /主持人不得兼任唯一记录者/.test(secretaryBody)
    && /m\.kind === 'temp'/.test(secretaryBody) && /V5_NOT_VOTER/.test(secretaryBody),
    'R61', 'S11/GAPS 29: the chair may NEVER be the only recorder — appointing the academician/office is refused by name, and a temp worker (not an active member) is refused too')
  gate(/if \(patch\.secretaries !== undefined\)/.test(v5rRaw)
    && /patchInstitute\(\{ secretaries: \(list\) => \(Array\.isArray\(list\) \? list : \[\]\)\.concat\(\[/.test(secretaryBody),
    'R62', 'S11: the secretary ledger must pass the EV.institute fold whitelist (patch.secretaries) and be append-only (concat, never a rewrite)')
  gate(/if \(command === 'secretary'\) return acad/.test(v5rRaw)
    && /if \(command === 'minutes'\) return acad \|\| \(!!meeting && String\(meeting\.secretary \|\| ''\) === String\(callerId\)\)/.test(v5rRaw)
    && /V5_NOT_ACADEMICIAN/.test(secretaryBody)
    && grantableLine.indexOf('secretary') === -1 && grantableLine.indexOf('minutes') === -1,
    'R63', 'S11/`03` #27+#28: appointing is academician-only and writing entries is academician ∪ THIS meeting\'s secretary; neither command is grantable (R35 untouched)')
  gate(/lines\.push\('## 记录人补充'\)/.test(finalizeBody)
    && finalizeBody.indexOf("lines.push('## 记录人补充')") > finalizeBody.indexOf("lines.push('## 投票区')")
    && /lines\.push\('## 发言区'\)/.test(finalizeBody)
    && /appendMeetingTail\(meeting, '- 记录（/.test(minutesBody)
    && !/writeTextRel\(/.test(minutesBody),
    'R64', 'S11×S8×S10: the recorder section is a SEPARATE section pushed AFTER the two zones and entries are APPENDED (appendMeetingTail) — the zones and the `### <who>` speech anchors are never rewritten')
  gate(!!minutesBody && /if \(!text\) \{/.test(minutesBody) && /gaps\.push\(/.test(minutesBody)
    && /不自动补全/.test(minutesBody) && !/writeTextRel\(/.test(minutesBody),
    'R65', 'S11/R7: with no entry the tool only REPORTS gaps in a guarded branch (it never fabricates a complete-looking minutes) and the write path touches only the append helper')
  gate(!!secretaryBody && !!minutesBody
    && !/code: 'V5_(?!INVALID_ARGUMENT|NOT_ACADEMICIAN|MEMBER_NOT_FOUND|NOT_VOTER|NO_OPEN_MEETING)[A-Z_]+/.test(secretaryBody + minutesBody)
    && !/finalizeMeeting\(|closeVerify\(|patchInstitute\(\{ phase|meeting\.phase =|setTimeout\(|setInterval\(|armHeartbeat\(|putSolve\(|castVerdict\(|voters\(\)/.test(secretaryBody + minutesBody),
    'R66', 'S11: no new error code (only the existing five are reused), no vote power is touched (no voters()), nothing drives the phase/closure, and no timer exists')
  notes.push('S11 (v5r): self-appointment refused=' + /m\.kind === 'academician' \|\| isOffice\(who\)/.test(secretaryBody)
    + '; temp refused=' + /m\.kind === 'temp'/.test(secretaryBody)
    + '; fold whitelist=' + /if \(patch\.secretaries !== undefined\)/.test(v5rRaw)
    + '; ledger append-only=' + /concat\(\[/.test(secretaryBody)
    + '; appoint academician-only=' + /if \(command === 'secretary'\) return acad/.test(v5rRaw)
    + '; minutes=acad+secretary=' + /if \(command === 'minutes'\) return acad \|\| \(!!meeting/.test(v5rRaw)
    + '; not grantable=' + (grantableLine.indexOf('secretary') === -1 && grantableLine.indexOf('minutes') === -1)
    + '; separate section after zones=' + (finalizeBody.indexOf("lines.push('## 记录人补充')") > finalizeBody.indexOf("lines.push('## 投票区')"))
    + '; append-only entries=' + /appendMeetingTail\(meeting, '- 记录（/.test(minutesBody)
    + '; gaps-only=' + (/if \(!text\) \{/.test(minutesBody) && /gaps\.push\(/.test(minutesBody))
    + '; new codes=' + /code: 'V5_(?!INVALID_ARGUMENT|NOT_ACADEMICIAN|MEMBER_NOT_FOUND|NOT_VOTER|NO_OPEN_MEETING)[A-Z_]+/.test(secretaryBody + minutesBody)
    + '; votes/phase/timer touched=' + /finalizeMeeting\(|closeVerify\(|patchInstitute\(\{ phase|meeting\.phase =|setTimeout\(|armHeartbeat\(|putSolve\(|castVerdict\(|voters\(\)/.test(secretaryBody + minutesBody))
  // ---- S12 (D7/GAPS 22): meeting levels (a light meeting may never produce an entity conclusion) ----
  const levelBody = bodyOf('async function setMeetingLevel(callerId, a) {')
  const truthRefusalBody = bodyOf('const truthWriteRefusal = (what) => ({')
  gate(/const FORMAL_MEETING_KINDS = \['verify-request', 'solve-vote'\]/.test(v5rRaw)
    && /if \(mn\.formalAgenda === true\) return 'formal'/.test(v5rRaw)
    && /FORMAL_MEETING_KINDS\.indexOf\(String\(mn\.kind \|\| ''\)\) !== -1 \? 'formal' : 'light'/.test(v5rRaw)
    && /formalAgenda: opts\.formalAgenda === true/.test(v5rRaw)
    && /formal_agenda: B/.test(v5rRaw),
    'R67', 'S12/D7: the level is DERIVED from kind (verify-request/solve-vote ⇒ formal; sync/division ⇒ light) and the academician can override it with formal_agenda:true')
  gate(!!truthRefusalBody && /简流程不得产出实体定论/.test(truthRefusalBody)
    && !!minutesBody && /entryKind === 'decision' && isLightMeeting\(\)\) return truthWriteRefusal\(/.test(minutesBody)
    && !/putVerdict\(|putSolve\(|castVerdict\(|judgeVerdict\(/.test(truthRefusalBody + minutesBody)
    && /lvl === 'formal' \? '\*\*正式\*\*（决议类：可产出实体定论）' : \('\*\*简流程\*\*：' \+ LIGHT_LEVEL_NOTE\)/.test(finalizeBody),
    'R68', 'S12/D7: a light meeting REFUSES an entity conclusion (entry_kind:"decision" ⇒ named refusal from the single truthWriteRefusal point), that path never writes verdicts/solves, and the minutes render the level with the light warning')
  gate(/if \(command === 'meeting_level'\) return acad/.test(v5rRaw)
    && !!levelBody && /const gate = canDo\(callerId, 'meeting_level'\)/.test(levelBody)
    && /V5_NOT_ACADEMICIAN/.test(levelBody)
    && grantableLine.indexOf('meeting_level') === -1,
    'R69', 'S12/`03` #3★: setting the level is academician-only (default table) and never grantable (R35 untouched)')
  gate(!!levelBody && !!truthRefusalBody
    && !/finalizeMeeting\(|closeVerify\(|patchInstitute\(\{ phase|meeting\.phase =|setTimeout\(|setInterval\(|armHeartbeat\(|putSolve\(|castVerdict\(|putVerdict\(|voters\(\)/.test(levelBody + truthRefusalBody)
    && /deduped: true, level: before/.test(levelBody)
    && !/code: 'V5_(?!INVALID_ARGUMENT|NOT_ACADEMICIAN|MEMBER_NOT_FOUND|NOT_VOTER|NO_OPEN_MEETING)[A-Z_]+/.test(levelBody + truthRefusalBody),
    'R70', 'S12/D7: the level path is passive (no phase/closure/vote/timer), the same value is idempotent (deduped, no event) and no new error code is invented')
  notes.push('S12 (v5r): kinds derived formal=' + /const FORMAL_MEETING_KINDS = \['verify-request', 'solve-vote'\]/.test(v5rRaw)
    + '; explicit override=' + /if \(mn\.formalAgenda === true\) return 'formal'/.test(v5rRaw)
    + '; light refuses decision=' + /entryKind === 'decision' && isLightMeeting\(\)\) return truthWriteRefusal\(/.test(minutesBody)
    + '; single refusal point=' + !!truthRefusalBody
    + '; academician-only=' + /if \(command === 'meeting_level'\) return acad/.test(v5rRaw)
    + '; not grantable=' + (grantableLine.indexOf('meeting_level') === -1)
    + '; idempotent=' + /deduped: true, level: before/.test(levelBody)
    + '; level visible in minutes=' + /本场等级/.test(finalizeBody)
    + '; drives=' + /finalizeMeeting\(|closeVerify\(|patchInstitute\(\{ phase|meeting\.phase =|setTimeout\(|armHeartbeat\(|putSolve\(|castVerdict\(|putVerdict\(|voters\(\)/.test(levelBody + truthRefusalBody)
    + '; new codes=' + /code: 'V5_(?!INVALID_ARGUMENT|NOT_ACADEMICIAN|MEMBER_NOT_FOUND|NOT_VOTER|NO_OPEN_MEETING)[A-Z_]+/.test(levelBody + truthRefusalBody))
  // ---- S13 (G2/D6): the resolution entity, its effective time, and retrieval -------------------
  const resultBody = bodyOf('async function resultRecordTool(memberId, a) {')
  const resolutionsBody = bodyOf('function resolutionsTool(memberId, a) {')
  gate(/const RESOLUTION_KINDS = \['resolution', 'solve', 'org', 'procedure'\]/.test(v5rRaw)
    && /const nextResolutionId = \(\) => 'res-' \+ \(resolutionsList\(\)\.length \+ 1\)/.test(v5rRaw)
    && /effectiveAt: at, retroactive: args\.retroactive === true, declaredAt: args\.retroactive === true \? at : 0/.test(resultBody),
    'R71', 'S13/G2: the stable id `res-<n>` is allocated by the framework (institute-wide monotonic, never from the caller), the resolution takes effect ON ANNOUNCEMENT (effectiveAt === at) and a retroactive declaration is archived (declaredAt) without ever changing effectiveAt')
  gate(!!resultBody && /meetingLevelOf\(meeting\) !== 'formal'\) return truthWriteRefusal\('不得落决议'\)/.test(resultBody)
    && !/putVerdict\(|putSolve\(|castVerdict\(|judgeVerdict\(/.test(resultBody)
    && /悬空引用：找不到决议/.test(anchorBody),
    'R72', 'S13/S12/D6: a light meeting refuses a resolution through the SINGLE S12 truthWriteRefusal point, the resolution path never writes verdicts/solve (R6) and a resolution that is not on file can never be quoted (dangling refusal)')
  gate(/if \(command === 'result_record'\) return acad \|\| \(!!meeting && String\(meeting\.secretary \|\| ''\) === String\(callerId\)\)/.test(v5rRaw)
    && grantableLine.indexOf('result_record') === -1
    && /const same = resolutionsList\(\)\.filter/.test(resultBody)
    && /deduped: true, resolution: same/.test(resultBody)
    && /patchInstitute\(\{ resolutions: \(list\) => \(Array\.isArray\(list\) \? list : \[\]\)\.concat\(\[rec\]\) \}\)/.test(resultBody),
    'R73', 'S13/`03` #26: writing a resolution is academician ∪ THIS meeting\'s secretary and never grantable; the same resolution is idempotent (deduped) and the ledger is append-only (concat)')
  gate(/if \(patch\.resolutions !== undefined\)/.test(v5rRaw)
    && /resolutions: \{/.test(v5rRaw)
    && !/finalizeMeeting\(|closeVerify\(|patchInstitute\(\{ phase|meeting\.phase =|setTimeout\(|setInterval\(|armHeartbeat\(|putVerdict\(|putSolve\(|voters\(\)/.test(resultBody + resolutionsBody)
    && !/code: 'V5_(?!INVALID_ARGUMENT|NOT_ACADEMICIAN|MEMBER_NOT_FOUND|NOT_VOTER|NO_OPEN_MEETING)[A-Z_]+/.test(resultBody + resolutionsBody),
    'R74', 'S13/G2: the ledger passes the fold whitelist, the read-only face is exposed, nothing drives the meeting (no phase/closure/timer/vote) and no new error code is invented')
  gate(!!resolutionsBody && /args\.id/.test(resolutionsBody) && /args\.target/.test(resolutionsBody)
    && /args\.meetingId/.test(resolutionsBody) && /args\.kind/.test(resolutionsBody) && /args\.limit/.test(resolutionsBody)
    && /检索不接受时间参数/.test(resolutionsBody)
    && !/setTimeout\(|finalizeMeeting\(/.test(resolutionsBody),
    'R75', 'S13/G2: retrieval supports id/target/meetingId/kind/limit and REJECTS every time filter (time is for ordering/display only)')
  notes.push('S13 (v5r): stable id by framework=' + /const nextResolutionId = \(\) => 'res-'/.test(v5rRaw)
    + '; effectiveAt===at=' + /effectiveAt: at,/.test(resultBody)
    + '; retroactive keeps effectiveAt=' + /declaredAt: args\.retroactive === true \? at : 0/.test(resultBody)
    + '; light refused via single point=' + /truthWriteRefusal\('不得落决议'\)/.test(resultBody)
    + '; res quotable=' + /res:latest/.test(anchorBody) + '; not-on-file refused=' + /悬空引用：找不到决议/.test(anchorBody)
    + '; fold whitelist=' + /if \(patch\.resolutions !== undefined\)/.test(v5rRaw)
    + '; read-only face=' + /resolutions: \{/.test(v5rRaw)
    + '; time filters rejected=' + /检索不接受时间参数/.test(resolutionsBody)
    + '; new codes=' + /code: 'V5_(?!INVALID_ARGUMENT|NOT_ACADEMICIAN|MEMBER_NOT_FOUND|NOT_VOTER|NO_OPEN_MEETING)[A-Z_]+/.test(resultBody + resolutionsBody))
  // ---- S14 (migration & guards): the legacy-state contract, proven against the code --------------
  const FOLD_LEDGER_KEYS = ['grants', 'ballots', 'chatSupplements', 'secretaries', 'resolutions']
  gate(FOLD_LEDGER_KEYS.every((k) => new RegExp('if \\(patch\\.' + k + ' !== undefined\\)').test(v5rRaw))
    && FOLD_LEDGER_KEYS.every((k) => new RegExp('Array\\.isArray\\(n\\.' + k + '\\) \\? n\\.' + k + ' : \\[\\]').test(v5rRaw))
    && /if \(patch\.chair !== undefined\) n\.chair = patch\.chair === null \? null : Object\.assign\(\{\}, patch\.chair\)/.test(v5rRaw)
    && /if \(patch\.stallNotice !== undefined\) n\.stallNotice = patch\.stallNotice === null \? null : Object\.assign\(\{\}, patch\.stallNotice\)/.test(v5rRaw)
    && /const resolutionsList = \(\) => \{/.test(v5rRaw),
    'R76', 'S14: the migration matrix must be TRUE of the code — every S4–S13 key sits in the explicit fold whitelist AND the read end supplies a default (`null` for chair/stallNotice, `[]` for the five ledgers), so an old file missing them cannot crash')
  gate(/schema version mismatch/.test(v5rRaw)
    && /V5_STATE_NOT_LOADED/.test(v5rRaw)
    && /loadOk/.test(v5rRaw)
    && /if \(patch\.meetingOpen !== undefined\) n\.meetingOpen = patch\.meetingOpen === null \? null : Object\.assign\(\{\}, patch\.meetingOpen\)/.test(v5rRaw),
    'R77', 'S14: an old v5state.json must stay readable (version gate + missing keys take defaults, meetingOpen included) and a failed load must REFUSE commits (never overwrite a real file with an empty state) while staying visible')
  const runnerRaw = readRaw('tests/run-tests.mjs')
  gate(/has\('no-temp-hygiene'\) && !has\('self-check'\) && !has\('counts'\)/.test(runnerRaw)
    && /incrementalSkipped/.test(runnerRaw)
    && /--counts/.test(runnerRaw),
    'R78', 'S14: the machine modes must never delete anything (the temp sweep is skipped for --self-check/--counts) and --counts must keep reporting the DERIVED job list with incrementalSkipped included — the guard index and the doc counts depend on exactly that')
  notes.push('S14 (v5r): fold whitelist keys=' + FOLD_LEDGER_KEYS.join('|')
    + '; array defaults=' + FOLD_LEDGER_KEYS.every((k) => new RegExp('Array\\.isArray\\(n\\.' + k + '\\) \\? n\\.' + k + ' : \\[\\]').test(v5rRaw))
    + '; null defaults (chair/stallNotice)=' + (/patch\.chair === null \? null/.test(v5rRaw) && /patch\.stallNotice === null \? null/.test(v5rRaw))
    + '; version gate=' + /schema version mismatch/.test(v5rRaw)
    + '; not-loaded face=' + /V5_STATE_NOT_LOADED/.test(v5rRaw)
    + '; machine modes delete nothing=' + /has\('no-temp-hygiene'\) && !has\('self-check'\) && !has\('counts'\)/.test(runnerRaw)
    + '; derived counts=' + /incrementalSkipped/.test(runnerRaw))
  // ---- S15 (K4/GAPS 11–12): last-minutes confirmation + action-item tracking -------------------
  const taskUpdateBody = bodyOf('async function taskUpdate(memberId, o, meta) {')
  gate(/if \(patch\.minutesConfirmations !== undefined\)/.test(v5rRaw)
    && !!minutesBody && /minutesConfirmations: \(list\) => \(Array\.isArray\(list\) \? list : \[\]\)\.concat\(\[rec\]\)/.test(minutesBody)
    && /const gate = canDo\(memberId, 'minutes'\)/.test(minutesBody)
    && /deduped: true, confirmation: same/.test(minutesBody)
    && /const minutesConfirmationsList = \(\) => \{/.test(v5rRaw),
    'R79', 'S15/K4: the confirmation ledger passes the EV.institute fold whitelist, is append-only, is gated to the academician ∪ THIS meeting\'s secretary, and the same confirmation is idempotent (deduped)')
  gate(!!minutesBody && /trim\(\) === 'confirm'/.test(minutesBody)
    && /appendMeetingTail\(meeting, '## 上次纪要确认/.test(minutesBody)
    && /只改事实、不改结论/.test(minutesBody)
    && !/putVerdict\(|putSolve\(|castVerdict\(|writeTextRel\(/.test(minutesBody),
    'R80', 'S15/K4: a confirmation changes FACTS only — it never writes verdicts/solve, and the factual correction is APPENDED to THIS meeting\'s minutes as its own section, so the old minutes (and any conclusion) are never rewritten')
  gate(!!taskUpdateBody && /action === 'handover'/.test(taskUpdateBody)
    && /next\.state = 'handover'/.test(taskUpdateBody)
    && /only the academician or the office can hand a task over/.test(taskUpdateBody)
    && /next\.state = 'done'/.test(taskUpdateBody)
    && (taskUpdateBody.match(/next\.status = 'completed'/g) || []).length === 1
    && /action_items: \(\(\) =>/.test(v5rRaw)
    && /handover: handover\.length, overdue: overdue\.length/.test(v5rRaw),
    'R81', 'S15/K4/G3: the action-item state machine is explicit — only an explicit `complete` closes an item, `handover` (academician/office only) parks it as 待接手 without closing it, and status.meeting.action_items exposes open/handover/overdue')
  gate(!!minutesBody && !!taskUpdateBody
    && !/finalizeMeeting\(|closeVerify\(|patchInstitute\(\{ phase|meeting\.phase =|setTimeout\(|setInterval\(|armHeartbeat\(|putVerdict\(|putSolve\(/.test(minutesBody)
    && /minutes_confirmation: \(\(\) =>/.test(v5rRaw)
    && /action_items: \(\(\) =>/.test(v5rRaw)
    && !/code: 'V5_(?!INVALID_ARGUMENT|NOT_ACADEMICIAN|MEMBER_NOT_FOUND|NOT_VOTER|NO_OPEN_MEETING|TASK_NOT_FOUND|TASK_DELETED|TASK_STALE_REVISION|TASK_UNAUTHORIZED|TASK_INVALID_TRANSITION|TASK_ALREADY_CLAIMED|TASK_BLOCKED|TASK_HAS_DEPENDENTS|TASK_INVALID_TRANSITION|INVALID_WRITE_SCOPE)[A-Z_]+/.test(minutesBody),
    'R82', 'S15/K4: the confirm path drives nothing (no phase/closure/timer), the new read-only faces are SUB-KEYS only and no new error code is invented')
  notes.push('S15 (v5r): confirm ledger in fold whitelist=' + /if \(patch\.minutesConfirmations !== undefined\)/.test(v5rRaw)
    + '; append-only=' + /minutesConfirmations: \(list\) => \(Array\.isArray\(list\) \? list : \[\]\)\.concat\(\[rec\]\)/.test(minutesBody)
    + '; acad+secretary gate=' + /const gate = canDo\(memberId, 'minutes'\)/.test(minutesBody)
    + '; deduped=' + /deduped: true, confirmation: same/.test(minutesBody)
    + '; fact-only (no verdicts/solve)=' + !/putVerdict\(|putSolve\(|castVerdict\(/.test(minutesBody)
    + '; fact fix appended=' + /appendMeetingTail\(meeting, '## 上次纪要确认/.test(minutesBody)
    + '; handover state=' + /next\.state = 'handover'/.test(taskUpdateBody)
    + '; explicit close only=' + ((taskUpdateBody.match(/next\.status = 'completed'/g) || []).length === 1)
    + '; read-only sub-keys=' + (/minutes_confirmation: \(\(\) =>/.test(v5rRaw) && /action_items: \(\(\) =>/.test(v5rRaw))
    + '; new codes=' + /code: 'V5_(?!INVALID_ARGUMENT|NOT_ACADEMICIAN|MEMBER_NOT_FOUND|NOT_VOTER|NO_OPEN_MEETING|TASK_)[A-Z_]+/.test(minutesBody)
    + '; drives=' + /finalizeMeeting\(|closeVerify\(|patchInstitute\(\{ phase|meeting\.phase =|setTimeout\(|armHeartbeat\(/.test(minutesBody))
  // ---- S16 (G3/D-10): the opening roll-call NAMES the unfinished action items, before the
  // minutes-confirmation item, and still drives nothing -------------------------------------------------
  const promptStart = v5rRaw.indexOf('S16（G3/D-10）')
  const promptEnd = v5rRaw.indexOf('（G3 程序性点名 → K4 实质议程）')
  const promptWin = (promptStart >= 0 && promptEnd > promptStart) ? v5rRaw.slice(promptStart, promptEnd) : ''
  const rollcallIdx = promptWin.indexOf("bits.push('**程序性点名**")
  const minutesIdx = promptWin.indexOf("bits.push('上次纪要 '")
  gate(!!promptWin
    && /String\(t\.id\) \+ '（' \+ \(who \|\| '待接手'\) \+ \(over \? '｜\*\*逾期\*\*' : ''\) \+ '）'/.test(promptWin)
    && /const who = String\(t\.ownerId \|\| ''\)/.test(promptWin)
    && /over = String\(t\.due_in \|\| ''\) === 'next-meeting'/.test(promptWin)
    && /if \(items\.length\) \{/.test(promptWin)
    && rollcallIdx >= 0 && minutesIdx >= 0 && rollcallIdx < minutesIdx
    && !/finalizeMeeting\(|closeVerify\(|setTimeout\(|setInterval\(|armHeartbeat\(|putVerdict\(|putSolve\(|patchInstitute\(|meeting\.phase =/.test(promptWin),
    'R83', 'S16/G3: the opening roll-call NAMES every unfinished action item (stable `t-N` + owner or 待接手 + an overdue mark), only when the list is non-empty, it comes BEFORE the minutes-confirmation item (procedural item vs first substantive item), and it drives nothing')
  notes.push('S16 (v5r): named roll-call=' + /String\(t\.id\) \+ '（' \+ \(who \|\| '待接手'\)/.test(promptWin)
    + '; overdue mark=' + /'｜\*\*逾期\*\*'/.test(promptWin)
    + '; non-empty only=' + /if \(items\.length\) \{/.test(promptWin)
    + '; rollcall before minutes=' + (rollcallIdx >= 0 && minutesIdx >= 0 && rollcallIdx < minutesIdx)
    + '; drives=' + /finalizeMeeting\(|closeVerify\(|setTimeout\(|armHeartbeat\(/.test(promptWin))
  // ---- S17 (G3/D-10): `overview()` shows the ACTION ITEMS (counts + named 待接手/逾期), read-only --------
  const aiStart = v5rRaw.indexOf('const actionItemsView = () => {')
  const aiEnd = v5rRaw.indexOf('const nextResolutionId = () =>', aiStart)
  const aiWin = (aiStart >= 0 && aiEnd > aiStart) ? v5rRaw.slice(aiStart, aiEnd) : ''
  const ovStart = v5rRaw.indexOf("registerTool('vibe_v5_overview'")
  const ovEnd = v5rRaw.indexOf("registerTool(", ovStart + 10)
  const ovWin = (ovStart >= 0 && ovEnd > ovStart) ? v5rRaw.slice(ovStart, ovEnd) : ''
  const repStart = v5rRaw.indexOf('// S15（K4/GAPS 11＋12）：**上次纪要确认**')
  const repWin = repStart >= 0 ? v5rRaw.slice(repStart, repStart + 3000) : ''
  const aiRule = /String\(t\.due_in \|\| ''\) === 'next-meeting' && Number\(t\.createdAt \|\| 0\) < Number\(/
  const repRule = /String\(t\.due_in \|\| ''\) === 'next-meeting' && !!openM && Number\(t\.createdAt \|\| 0\) < Number\(/
  gate(!!aiWin && !!ovWin
    && /const actionItemsView = \(\) => \{/.test(v5rRaw)
    && /t\.status !== 'deleted'/.test(aiWin)
    && aiRule.test(aiWin)
    && repRule.test(repWin)
    && /minutesConfirmationsList, actionItemsView,/.test(v5rRaw)
    && /const ai = s\.actionItemsView\(\)/.test(ovWin)
    && /## 行动项（G3\/D-10）/.test(ovWin)
    && /'｜\*\*待接手\*\* ' \+ ai\.handover\.length/.test(ovWin)
    && /'｜\*\*逾期（未决项）\*\* ' \+ ai\.overdue\.length/.test(ovWin)
    && /String\(t\.ownerId \|\| ''\) \|\| '待接手'/.test(ovWin)
    && /if \(ai\.open\.length\) \{/.test(ovWin)
    && !/finalizeMeeting\(|closeVerify\(|setTimeout\(|setInterval\(|armHeartbeat\(|putVerdict\(|putSolve\(|patchInstitute\(|meeting\.phase =/.test(ovWin),
    'R84', 'S17/G3: `overview()` carries an ACTION-ITEMS section with the totals (共/未完成/待接手/逾期（未决项）) and one named line per open item (`t-N` + owner or 待接手 + overdue mark), using the SAME no-timer overdue rule as `report()`, it emits no section when there is nothing to show, and it drives nothing')
  notes.push('S17 (v5r): actionItemsView=' + /const actionItemsView = \(\) => \{/.test(v5rRaw)
    + '; overdue rule shared with report=' + (aiRule.test(aiWin) && repRule.test(repWin))
    + '; overview section=' + /## 行动项（G3\/D-10）/.test(ovWin)
    + '; counts=' + (/待接手\*\* ' \+ ai\.handover\.length/.test(ovWin) && /逾期（未决项）\*\* ' \+ ai\.overdue\.length/.test(ovWin))
    + '; named=' + /String\(t\.ownerId \|\| ''\) \|\| '待接手'/.test(ovWin)
    + '; non-empty only=' + /if \(ai\.open\.length\) \{/.test(ovWin)
    + '; exported=' + /minutesConfirmationsList, actionItemsView,/.test(v5rRaw)
    + '; drives=' + /finalizeMeeting\(|closeVerify\(|setTimeout\(|armHeartbeat\(/.test(ovWin))
  // ---- S18 (#23/#38; K3/K5/D4): motions + seconds ----------------------------------------------------
  const moStart = v5rRaw.indexOf('async function motionTool(memberId, a) {')
  const moEnd = v5rRaw.indexOf('async function minutesTool(memberId, a) {')
  const moWin = (moStart >= 0 && moEnd > moStart) ? v5rRaw.slice(moStart, moEnd) : ''
  const motionsHelperWin = (() => {
    const s = v5rRaw.indexOf('const motionsList = () => {')
    const e = v5rRaw.indexOf('const motionSecondsRequired = () => {')
    return (s >= 0 && e > s) ? v5rRaw.slice(s, e + 260) : ''
  })()
  gate(/if \(patch\.motions !== undefined\)/.test(v5rRaw)
    && /const motionsList = \(\) => \{/.test(v5rRaw)
    && /id: 'm-' \+ \(list\.length \+ 1\)/.test(moWin)
    && /motions: \(l\) => \(Array\.isArray\(l\) \? l : \[\]\)\.concat\(\[rec\]\)/.test(moWin)
    && /String\(cur0\.state\) === 'carried'\) return \{ ok: false/.test(moWin)
    && /String\(cur\.state\) === 'withdrawn'\) return \{ ok: false/.test(moWin)
    && /const motionSecondsRequired = \(\) => \{/.test(v5rRaw)
    && /needed: motionSecondsRequired\(\)/.test(moWin),
    'R85', 'S18/#23-#38: the motion ledger passes the fold whitelist, is append-only with a framework-allocated `m-<n>` id, and its state machine is ONE-WAY (a carried motion can no longer be withdrawn and a withdrawn motion can no longer be seconded)')
  gate(!!moWin && /const who = memberById\(memberId\)/.test(moWin)
    && (moWin.match(/code: 'V5_NOT_VOTER'/g) || []).length >= 2
    && /String\(cur0\.by\) === memberId \|\| isOffice\(memberId\) \|\| canDo\(memberId, 'board'\)\.ok/.test(moWin)
    && /String\(cur\.by\) === memberId\) return \{ ok: false, code: 'V5_INVALID_ARGUMENT', message: '\*\*不可附议自己的动议\*\*/.test(moWin)
    && /GRANTABLE_COMMANDS = \['assign', 'prioritize', 'nudge', 'convene'\]/.test(v5rRaw)
    && !/voters\(/.test(moWin),
    'R86', 'S18: proposing and seconding are ACTIVE-MEMBER rights (the mover cannot second their own motion); withdrawing is the mover OR the academician/office; the motion faces are NOT grantable (the bounded GRANTABLE_COMMANDS is untouched) and confer NO vote weight (voters() is never touched)')
  gate(!!moWin
    && /Number\.isFinite\(n\) && n >= 1 \? Math\.floor\(n\) : 1/.test(motionsHelperWin)
    && /next\.secondedBy\.length >= Math\.max\(1, Number\(next\.needed \|\| 1\)\)/.test(moWin)
    && /meetingLevelOf\(meeting\) !== 'formal'\) return truthWriteRefusal\('resolution 动议/.test(moWin)
    && !/putVerdict\(|putSolve\(|resolutions: |ballots: |castVerdict\(/.test(moWin),
    'R87', 'S18/#38: seconds carry the motion AT THE MOMENT the threshold (`motionSecondsRequired`, default 1) is reached, and a motion PRODUCES NO CONCLUSION — it never writes verdicts/solve/resolutions/ballots; inside a LIGHT meeting a `resolution` motion is refused by the single S12 truthWriteRefusal point')
  gate(!!moWin
    && !/finalizeMeeting\(|closeVerify\(|setTimeout\(|setInterval\(|armHeartbeat\(|meeting\.phase =|patchInstitute\(\{ phase/.test(moWin)
    && !/code: 'V5_(?!INVALID_ARGUMENT|NOT_VOTER|NO_OPEN_MEETING|NOT_ACADEMICIAN|MEMBER_NOT_FOUND|TASK_)[A-Z_]+/.test(moWin)
    && /motions: \(\(\) => \{/.test(v5rRaw)
    && /L\.push\('- 动议：共 ' \+ ms\.length/.test(v5rRaw)
    && /minutesConfirmationsList, actionItemsView, motionTool, secondTool, motionsList,/.test(v5rRaw),
    'R88', 'S18: the motion faces drive nothing (no phase change, closure or timer), invent no new error code, and the new read-only faces are SUB-KEYS only (status.meeting.motions + the report motion section)')
  notes.push('S18 (v5r): ledger in fold whitelist=' + /if \(patch\.motions !== undefined\)/.test(v5rRaw)
    + '; append-only=' + /motions: \(l\) => \(Array\.isArray\(l\) \? l : \[\]\)\.concat\(\[rec\]\)/.test(moWin)
    + '; one-way=' + (/String\(cur0\.state\) === 'carried'\) return \{ ok: false/.test(moWin) && /String\(cur\.state\) === 'withdrawn'\) return \{ ok: false/.test(moWin))
    + '; active-member only=' + ((moWin.match(/code: 'V5_NOT_VOTER'/g) || []).length >= 2)
    + '; self-second refused=' + /不可附议自己的动议/.test(moWin)
    + '; not grantable=' + /GRANTABLE_COMMANDS = \['assign', 'prioritize', 'nudge', 'convene'\]/.test(v5rRaw)
    + '; no vote power=' + !/voters\(/.test(moWin)
    + '; threshold=' + /next\.secondedBy\.length >= Math\.max\(1, Number\(next\.needed \|\| 1\)\)/.test(moWin)
    + '; no conclusion=' + !/putVerdict\(|putSolve\(|resolutions: |ballots: |castVerdict\(/.test(moWin)
    + '; light resolution refused=' + /truthWriteRefusal\('resolution 动议/.test(moWin)
    + '; read-only sub-keys=' + (/motions: \(\(\) => \{/.test(v5rRaw) && /L\.push\('- 动议：共 ' \+ ms\.length/.test(v5rRaw))
    + '; new codes=' + /code: 'V5_(?!INVALID_ARGUMENT|NOT_VOTER|NO_OPEN_MEETING|NOT_ACADEMICIAN|MEMBER_NOT_FOUND|TASK_)[A-Z_]+/.test(moWin)
    + '; drives=' + /finalizeMeeting\(|closeVerify\(|setTimeout\(|armHeartbeat\(|meeting\.phase =/.test(moWin))
  // ---- S19 (D-10 candidate 2): the seconds threshold becomes a settable integer (>=1) -----------------
  const setWin = (() => {
    const s = v5rRaw.indexOf('async function setParams(input) {')
    const e = v5rRaw.indexOf('const droppedSet = []', s)
    return (s >= 0 && e > s) ? v5rRaw.slice(s, e) : ''
  })()
  gate(/'motionSecondsRequired',/.test(v5rRaw)
    && /const motionSecondsRequired = \(\) => \{/.test(v5rRaw)
    && /const p = \(inst\(\) && inst\(\)\.params\) \|\| \{\}/.test(v5rRaw)
    && /Number\.isFinite\(n\) && n >= 1 \? Math\.floor\(n\) : 1/.test(v5rRaw)
    && (v5rRaw.match(/\.motionSecondsRequired/g) || []).length === 3
    && !!setWin && /motionSecondsRequired !== undefined/.test(setWin)
    && /Math\.floor\(n\) !== n \|\| n < 1/.test(setWin)
    && /code: 'V5_INVALID_ARGUMENT', message: 'motionSecondsRequired 必须是/.test(setWin),
    'R89', 'S19: the seconds threshold is a SETTABLE integer (`ints` whitelist), it has ONE reading rule (`motionSecondsRequired()` off `inst().params`; exactly two `.motionSecondsRequired` accesses — the setter and that one reader, so no second default can hide) and its domain (>=1 integer) is enforced by an explicit named refusal instead of a silent clamp')
  notes.push('S19 (v5r): settable=' + /'motionSecondsRequired'\]/.test(v5rRaw)
    + '; single reader=' + (/const motionSecondsRequired = \(\) => \{/.test(v5rRaw) && (v5rRaw.match(/\.motionSecondsRequired/g) || []).length === 3)
    + '; domain>=1 integer=' + (!!setWin && /Math\.floor\(n\) !== n \|\| n < 1/.test(setWin))
    + '; named refusal=' + /motionSecondsRequired 必须是/.test(setWin)
    + '; default=1=' + /Number\.isFinite\(n\) && n >= 1 \? Math\.floor\(n\) : 1/.test(v5rRaw))
  // ---- S20 (B-3(甲)): resolution supersede write face + res:latest single rule + from_resolution guard ----
  const supWin = (() => {
    const s = v5rRaw.indexOf("if (String(args.op || '').trim() === 'supersede') {")
    const e = v5rRaw.indexOf('const text = String(args.text ||', s)
    return (s >= 0 && e > s) ? v5rRaw.slice(s, e) : ''
  })()
  const quoteWin = (() => {
    const s = v5rRaw.indexOf("if (want === '' || want === 'latest') {")
    return s >= 0 ? v5rRaw.slice(s, s + 420) : ''
  })()
  const assignWin = (() => {
    const s = v5rRaw.indexOf("const fromRes = String(args.from_resolution")
    return s >= 0 ? v5rRaw.slice(s, s + 700) : ''
  })()
  gate(!!supWin
    && /const oldRec = list\.filter\(\(x\) => x && String\(x\.id\) === of\)\[0\]/.test(supWin)
    && /const supRec = list\.filter\(\(x\) => x && String\(x\.id\) === by\)\[0\]/.test(supWin)
    && /if \(of === by\) return \{ ok: false/.test(supWin)
    && /if \(!oldRec\) return \{ ok: false/.test(supWin)
    && /if \(!supRec\) return \{ ok: false/.test(supWin)
    && /String\(supRec\.supersededBy \|\| ''\)\) return \{ ok: false/.test(supWin)
    && /不得二次取代/.test(supWin)
    && /deduped: true, superseded: \{ of, by/.test(supWin)
    && /resolutions: \(l\) => \(Array\.isArray\(l\) \? l : \[\]\)\.map\(\(r\) => \(String\(r\.id\) === of \? nextRec : r\)\)/.test(supWin)
    && /effectiveAt` 不变/.test(supWin),
    'R90', 'S20/B-3(甲): superseding a resolution (same tool, `op:"supersede"`) requires BOTH ids to exist and to differ, refuses a second supersede and refuses a superseder that is itself superseded, is idempotent on the same pair, and it MAPS the ledger in place (the old entry is kept, effectiveAt unchanged)')
  gate(/const latestResolution = \(\) => \{/.test(v5rRaw)
    && /if \(!String\(list\[i\]\.supersededBy \|\| ''\)\) return list\[i\]/.test(v5rRaw)
    && (v5rRaw.match(/latestResolution\(\)/g) || []).length >= 6
    && !!quoteWin && /const latest = latestResolution\(\)/.test(quoteWin)
    && /全部已被取代/.test(quoteWin)
    && !/rec = \(live\.length \? live : all\)/.test(v5rRaw)
    && /latest_id: \(latestResolution\(\) \? String\(latestResolution\(\)\.id\) : ''\)/.test(v5rRaw)
    && /latest_effective_at: \(latestResolution\(\)/.test(v5rRaw)
    && /最新（未被取代）/.test(v5rRaw),
    'R91', 'S20: `latestResolution()` is the ONE rule for "the newest NOT-superseded resolution" — `res:latest`, `status.resolutions.latest_id/latest_effective_at` and the `report()` display all use it (no residual "last element" logic), and when EVERY resolution is superseded it yields null so `res:latest` is a NAMED dangling refusal instead of silently falling back to a superseded one')
  gate(!!assignWin
    && /const fromRes = String\(args\.from_resolution/.test(v5rRaw)
    && /找不到决议 ' \+ fromRes/.test(assignWin)
    && /已被取代.*不得据此派活/s.test(assignWin)
    && /resolution_id: fromRes/.test(v5rRaw)
    && /if \(meta\.resolution_id !== undefined\) next\.resolution_id/.test(v5rRaw)
    && !/putVerdict\(|putSolve\(/.test(assignWin),
    'R92', 'S20/B-3(甲): `vibe_v5_assign {from_resolution}` refuses a resolution that does not exist and NAMEDLY refuses one that has been superseded (so a superseded decision can no longer dispatch work); a live one is recorded as `tasks[].resolution_id` (inside the CAS write) and nothing here writes verdicts/solve')
  gate(!!supWin
    && /const gate = canDo\(memberId, 'result_record'\)/.test(v5rRaw)
    && /truthWriteRefusal\('不得落决议'\)/.test(v5rRaw)
    && /GRANTABLE_COMMANDS = \['assign', 'prioritize', 'nudge', 'convene'\]/.test(v5rRaw)
    && !/voters\(|castVerdict\(|ballot/.test(supWin)
    && !/code: 'V5_(?!INVALID_ARGUMENT|NOT_VOTER|NO_OPEN_MEETING|NOT_ACADEMICIAN|MEMBER_NOT_FOUND|TASK_)[A-Z_]+/.test(supWin),
    'R93', 'S20: supersede sits BEHIND the four existing #55 gates (academician ∪ the current secretary, an ongoing FORMAL meeting via the single truthWriteRefusal point, time keys rejected), it is NOT grantable (the bounded GRANTABLE_COMMANDS is untouched), it confers no vote weight (no voters/castVerdict/ballot access) and it invents no new error code')
  notes.push('S20 (v5r): supersede written=' + !!supWin
    + '; both ids must exist=' + /if \(!oldRec\) return \{ ok: false/.test(supWin)
    + '; one-way=' + /不得二次取代/.test(supWin)
    + '; idempotent=' + /deduped: true, superseded/.test(supWin)
    + '; entry kept (map)=' + /\.map\(\(r\) => \(String\(r\.id\) === of \? nextRec : r\)\)/.test(supWin)
    + '; latest single rule=' + /const latestResolution = \(\) => \{/.test(v5rRaw)
    + '; three call sites=' + ((v5rRaw.match(/latestResolution\(\)/g) || []).length >= 6)
    + '; no fallback=' + !/rec = \(live\.length \? live : all\)/.test(v5rRaw)
    + '; from_resolution guard=' + (!!assignWin && /不得据此派活/.test(assignWin))
    + '; resolution_id recorded=' + (/resolution_id: fromRes/.test(v5rRaw) && /if \(meta\.resolution_id !== undefined\) next\.resolution_id/.test(v5rRaw))
    + '; no verdicts=' + !/putVerdict\(|putSolve\(/.test(assignWin)
    + '; not grantable=' + /GRANTABLE_COMMANDS = \['assign', 'prioritize', 'nudge', 'convene'\]/.test(v5rRaw)
    + '; new codes=' + /code: 'V5_(?!INVALID_ARGUMENT|NOT_VOTER|NO_OPEN_MEETING|NOT_ACADEMICIAN|MEMBER_NOT_FOUND|TASK_)[A-Z_]+/.test(supWin))
  // ---- S25-A (issue #13 #1/#4): prompt-only constraints + the three resource parameters ---------------
  const resWin = (() => {
    const s = v5rRaw.indexOf('function resourceBlock() {')
    const e = v5rRaw.indexOf('function proofStatusBlock()', s)
    return (s >= 0 && e > s) ? v5rRaw.slice(s, e) : ''
  })()
  const proofWin = (() => {
    const s = v5rRaw.indexOf('function proofStatusBlock() {')
    return s >= 0 ? v5rRaw.slice(s, s + 900) : ''
  })()
  const domWin = (() => {
    const s = v5rRaw.indexOf('if (input && input.toolCallsPerTurnCap !== undefined) {')
    const e = v5rRaw.indexOf("      // S19（`D-10` 待办 ②", s)
    return (s >= 0 && e > s) ? v5rRaw.slice(s, e) : ''
  })()
  gate(/'resourceSelfCheck'\]/.test(v5rRaw)
    && /'toolCallsPerTurnCap', 'memoryCeilingMb'\]/.test(v5rRaw)
    && /resourceSelfCheck: false,/.test(v5rRaw)
    && /toolCallsPerTurnCap: 0,/.test(v5rRaw)
    && /memoryCeilingMb: 0,/.test(v5rRaw)
    && /const resourceSelfCheckOn = \(\) => params\.resourceSelfCheck === true/.test(v5rRaw)
    && !!resWin && /if \(!resourceSelfCheckOn\(\)\) return \[\]/.test(resWin),
    'R94', 'S25-A: the three resource parameters are SETTABLE (bool whitelist + int whitelist), their defaults are the do-nothing values (false / 0 / 0) and the 【资源】 block is gated by one off-switch (`if (!resourceSelfCheckOn()) return []`) so a default institute gets byte-identical prompts')
  gate((v5rRaw.match(/\.resourceSelfCheck/g) || []).length === 1
    && (v5rRaw.match(/\.toolCallsPerTurnCap/g) || []).length === 3
    && (v5rRaw.match(/\.memoryCeilingMb/g) || []).length === 3
    && /const toolCallsPerTurnCap = \(\) => \{/.test(v5rRaw)
    && /const memoryCeilingMb = \(\) => \{/.test(v5rRaw)
    && /Number\.isFinite\(n\) && n >= 0 \? Math\.floor\(n\) : 0/.test(v5rRaw)
    && !/toolCallsPerTurnCap\(\) *\{ *return 0/.test(v5rRaw),
    'R95', 'S25-A: ONE reading rule per parameter (`resourceSelfCheckOn()` / `toolCallsPerTurnCap()` / `memoryCeilingMb()`), with a fixed number of dotted accesses (1 / 3 / 3 — the setter guards and the single reader), so a second hard-coded default cannot hide')
  gate(!!domWin
    && (v5rRaw.match(/必须是 \*\*≥0 的整数\*\*/g) || []).length === 2
    && /Math\.floor\(n\) !== n \|\| n < 0\) \{\n          return \{ ok: false, code: 'V5_INVALID_ARGUMENT', message: 'toolCallsPerTurnCap 必须是/.test(domWin)
    && /code: 'V5_INVALID_ARGUMENT'/.test(domWin)
    && !/putVerdict\(|putSolve\(|finalizeMeeting\(/.test(resWin + proofWin),
    'R96', 'S25-A: both new integers have an explicit >=0 domain check that NAMEDLY refuses a negative/non-integer value (no silent clamp), and neither prompt block writes a verdict/solve or finalizes anything')
  gate((v5rRaw.match(/function resourceBlock\(\) \{/g) || []).length === 1
    && (v5rRaw.match(/function proofStatusBlock\(\) \{/g) || []).length === 1
    && (v5rRaw.match(/for \(const ln of resourceBlock\(\)\) L\.push\(ln\)/g) || []).length === 3
    && (v5rRaw.match(/for \(const ln of proofStatusBlock\(\)\) L\.push\(ln\)/g) || []).length === 2
    && /当前 ' \+ \(Number\.isFinite\(Number\(params\.maxParallel\)\)/.test(v5rRaw),
    'R97', 'S25-A: each block has exactly ONE definition and is injected from a fixed set of prompt builders (【资源】x3 = initial/normal/meeting, 【命题准入】x2 = meeting/verify), and the meeting prompt now reads the LIVE `maxParallel` (default 3 keeps the sentence byte-identical)')
  gate(/PROMPT TEXT ONLY and NEVER a machine decision/.test(v5rRaw)
    && /resourceSelfCheck: resourceSelfCheckOn\(\), toolCallsPerTurnCap: toolCallsPerTurnCap\(\), memoryCeilingMb: memoryCeilingMb\(\),/.test(v5rRaw)
    && !!proofWin && /证明尝试／证伪尝试/.test(proofWin)
    && /禁止/.test(proofWin),
    'R98', 'S25-A: the promise is stated where the office can see it — the `vibe_v5_set` description says PROMPT TEXT ONLY and NEVER a machine decision, `status().params` echoes all three keys (so the office can discover them), and the 【命题准入】 block explicitly forbids treating "证明尝试／证伪尝试" as "已论证"')
  notes.push('S25-A (v5r): settable=' + (/'resourceSelfCheck'\]/.test(v5rRaw) && /'toolCallsPerTurnCap', 'memoryCeilingMb'\]/.test(v5rRaw))
    + '; defaults do-nothing=' + (/resourceSelfCheck: false,/.test(v5rRaw) && /toolCallsPerTurnCap: 0,/.test(v5rRaw) && /memoryCeilingMb: 0,/.test(v5rRaw))
    + '; off-switch=' + (!!resWin && /if \(!resourceSelfCheckOn\(\)\) return \[\]/.test(resWin))
    + '; single readers=' + ((v5rRaw.match(/\.resourceSelfCheck/g) || []).length === 1 && (v5rRaw.match(/\.toolCallsPerTurnCap/g) || []).length === 3 && (v5rRaw.match(/\.memoryCeilingMb/g) || []).length === 3)
    + '; domain>=0=' + (!!domWin && (v5rRaw.match(/必须是 \*\*≥0 的整数\*\*/g) || []).length === 2)
    + '; blocks single=' + ((v5rRaw.match(/function resourceBlock\(\) \{/g) || []).length === 1 && (v5rRaw.match(/function proofStatusBlock\(\) \{/g) || []).length === 1)
    + '; injections=3+2=' + ((v5rRaw.match(/for \(const ln of resourceBlock\(\)\) L\.push\(ln\)/g) || []).length === 3 && (v5rRaw.match(/for \(const ln of proofStatusBlock\(\)\) L\.push\(ln\)/g) || []).length === 2)
    + '; live maxParallel=' + /当前 ' \+ \(Number\.isFinite\(Number\(params\.maxParallel\)\)/.test(v5rRaw)
    + '; echo=' + /resourceSelfCheck: resourceSelfCheckOn\(\), toolCallsPerTurnCap/.test(v5rRaw)
    + '; prompt-only promise=' + /PROMPT TEXT ONLY and NEVER a machine decision/.test(v5rRaw)
    + '; no machine writes=' + !/putVerdict\(|putSolve\(|finalizeMeeting\(/.test(resWin + proofWin))
  notes.push('R10 (v5r): gates=' + 7 + '; 过程标注=' + countOf(/尚未生效·仅供参考/g) + '; provisional: true=' + countOf(/provisional: true/g))
}

// ---- report ------------------------------------------------------------
// `--json` is the machine-readable contract the `--self-probe` children parse (same shape as
// audit-prompt-invariants.mjs): { gates, failed, findings, notes }. It is emitted BEFORE the human
// output so a child run's stdout is parseable in one piece.
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ gates: gateCount, failed: findings.length, findings, notes }))
  for (const f of findings) console.error('  FINDING: ' + f)
  process.exit(findings.length ? 1 : 0)
}
console.log('-- V5 integrity audit --')
for (const n of notes) console.log('  note: ' + n)
console.log('')
if (findings.length) {
  for (const f of findings) console.error('  FINDING: ' + f)
  console.error('')
  console.error(findings.length + ' finding(s)')
  process.exit(1)
}
console.log('clean: no undefined calls, no undeclared params keys, no missing session API, no leftover markers')
process.exit(0)
