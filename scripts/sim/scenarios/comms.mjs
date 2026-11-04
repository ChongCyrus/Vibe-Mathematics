// scripts/sim/scenarios/comms.mjs — the COMMUNICATION line of an institute, driven by a SCRIPT, not by a language model.
//
// What this scenario is FOR: the comms/social mechanisms of the institute are the ones a live run exercises constantly and
// the ones whose receipts are easiest to misread — "was that mail delivered or only hinted?", "who actually spoke in the
// group chat?", "was this vote a meeting ballot or the independent ballot box?", "may this seat write that panel?".
// A model takes half an hour to produce these receipts by conversation; this script produces them in one second, so the
// audit (scripts/sim/audit/receipts.mjs) can read them without a model in the loop.
//
// Coverage (each line below is one mechanism, and its receipt is what the corpus keeps):
//   · mailbox (kernel face `vibe_vmu_mailbox`): send / pending / anchor / ack / list / open / setState / unread / status / plan
//     — non-urgent mail is a HINT (body stays behind `open`), `open` sets read:true, `setState` sets todo, `ack` is the
//     DELIVERY settlement (not "read") and drops the body, `anchor` refuses a delivered id by name (probed under --probes).
//   · the v5r inbox face `vibe_v5_inbox`: list → open (sets read) → mark (read/todo), plus the relayed mail rows.
//   · chat (`vibe_vmu_chat`): send(by=) / list / status / policy / setpolicy / mute / unmute / quota / admin grant+revoke,
//     and the G1 private→public path supplement / supplementof / supplements (body withheld, authorship recorded as the
//     face can verify it).
//   · relay (`vibe_v5_message`): the OFFICE carries a member's voice — the receipt separates `from` (the voice) from
//     `relayedBy` (the office that carried it), the one place where that difference is expressible.
//   · the INDEPENDENT ballot box (`vibe_v5_poll_open` / `vibe_v5_poll_vote` / `vibe_v5_poll_close`): chair opens, the
//     voting seats vote, the chair closes; the tally comes back with the floor the rules declared. This is NOT a meeting
//     ballot — meeting votes go through `vibe_vmu_meeting` (see the mainline scenario).
//   · panels (`vibe_vmu_panel`): a seat writes its OWN panel; the office may record a panel for any member. The refusal
//     path (a member naming another member's panel) is a NAMED refusal: it runs only under `--probes` and is declared in
//     `expectedRefusals` (see the probe block at the end) — the default corpus contains zero refusals.
//   · report + nudge: `vibe_v5_report` (read-only composition), `vibe_vmu_report` (the declared auto-report face), and
//     `vibe_v5_nudge` (a nudge is delivered as durable mail — the nudged seat sees a `kind:"nudge"` row).
//   · the REFUSAL path (`--probes`): a member writing another member's panel, a temporary worker voting, a temporary
//     worker recording a card, a mailbox send under another seat's name, and an anchor on an already-acked mail. Each is a
//     NAMED refusal whose code is registered in docs/03-interface-contract.md and whose receipt carries a hint.
//
// Run: node scripts/sim/run.mjs --scenario comms --out D:/_tmp/sim/corpus-comms
// Probes: node scripts/sim/run.mjs --scenario comms --probes --out D:/_tmp/sim/corpus-comms-probes
// Audit: node scripts/sim/audit/receipts.mjs D:/_tmp/sim/corpus-comms
//
// NOTE ON THE PROBE RUN (measured, not assumed): `scripts/sim/run.mjs` honours `result.expectedRefusals` — a predicted
// refusal appears in the report with its code but is not counted as a mechanism refusal, so `--probes` exits 0 with
// "refusals: 5 (0 mechanism · 5 expected · 0 environmental)". `scripts/sim/audit/receipts.mjs` does NOT read that
// declaration yet: its A1 still reports each predicted refusal as a STEP_REFUSED finding. So the probe run is green at the
// runner and 5 A1 findings at the audit — a disagreement between the two tools, not a scenario defect.

// The refusal probes are opt-in because the DEFAULT corpus must be refusal-free (that is what the runner's exit code
// means). `--probes` is read from argv, which the runner passes through untouched; SIM_PROBES=1 is the same switch for a
// caller that imports this module directly.
const PROBES = process.argv.includes('--probes') || process.env.SIM_PROBES === '1'


/**
 * The green comms line. Every call here is expected to SUCCEED; a refusal in this scenario is a finding.
 * @param {{ call: Function, receipts: Array, prompts: any, tree: Function }} h — the harness from ../harness.mjs
 * @param {{ log?: Function }} [opts]
 */
export const comms = async (h, { log = () => {} } = {}) => {
  const steps = []
  const step = async (name, fn) => {
    const before = h.tree ? h.tree().length : 0
    const out = await fn()
    const after = h.tree ? h.tree().length : 0
    steps.push({ name, at: h.receipts.length, files: { before, after }, ok: !(out && out.ok === false), code: out && out.code ? out.code : null })
    log(name + (out && out.ok === false ? '  [' + (out.code || 'refused') + ']' : ''))
    return out
  }
  const as = (id) => ({ as: { agent: { id } } })
  const ids = {}

  // ① the institute exists: the academician (chair), two permanent researchers, one temporary worker
  const started = await step('institute/start', () => h.call('vibe_v5_start', {
    problem: '通信主线：压信箱、群聊、中继、独立票箱、面板与督办（占位题，本场景只压机制）。',
    researcherCount: 2,
  }))
  const roster = (started && Array.isArray(started.hired) && started.hired.length ? started.hired : ['r-acad', 'r-1', 'r-2'])
  ids.roster = roster
  const chair = roster[0]
  const r1 = roster[1]
  const r2 = roster[2]
  const tmp = 'tmp-comms'
  await step('institute/hire-temp', () => h.call('vibe_v5_hire', {
    to: tmp,
    purpose: '通信机制演示',
    initial_task: '读信箱并把过程写回回执',
  }, as(chair)))

  // ② MAILBOX (kernel face): a non-urgent mail is a HINT — the body waits behind `open`
  const mailToR1 = await step('mailbox/send', () => h.call('vibe_vmu_mailbox', {
    action: 'send', from: chair, to: r1, subject: '任务：读信箱', text: '请打开这封信，并把「已读 + 待办」两个状态都标上。',
  }))
  const r1MailId = mailToR1 && mailToR1.ids && mailToR1.ids[0]
  ids.mailToR1 = r1MailId
  await step('mailbox/list/unread-hint', () => h.call('vibe_vmu_mailbox', { action: 'list', member: r1, status: 'unread' }))
  await step('mailbox/open', () => h.call('vibe_vmu_mailbox', { action: 'open', member: r1, id: r1MailId }))
  await step('mailbox/list/read-marked', () => h.call('vibe_vmu_mailbox', { action: 'list', member: r1 }))
  await step('mailbox/setState/todo', () => h.call('vibe_vmu_mailbox', { action: 'setState', member: r1, id: r1MailId, read: true, todo: true }))
  await step('mailbox/list/todo', () => h.call('vibe_vmu_mailbox', { action: 'list', member: r1, status: 'todo' }))

  // urgent mail: only an explicit sender's urgent:true carries the body into the hint
  const urgent = await step('mailbox/send/urgent', () => h.call('vibe_vmu_mailbox', {
    action: 'send', from: chair, to: tmp, subject: '指派的初始任务', text: '先读信箱，再按回执格式回报。', urgent: true,
  }))
  ids.mailUrgent = urgent && urgent.ids && urgent.ids[0]

  // the delivery lifecycle of one second mail: pending → anchor → ack → the body is gone from the box
  const mailToR2 = await step('mailbox/send/for-ack', () => h.call('vibe_vmu_mailbox', {
    action: 'send', from: chair, to: r2, subject: '复核请求', text: '读完后把结论回执给我。',
  }))
  const r2MailId = mailToR2 && mailToR2.ids && mailToR2.ids[0]
  ids.mailToR2 = r2MailId
  await step('mailbox/pending', () => h.call('vibe_vmu_mailbox', { action: 'pending', member: r2 }))
  await step('mailbox/anchor', () => h.call('vibe_vmu_mailbox', { action: 'anchor', id: r2MailId }))
  await step('mailbox/ack', () => h.call('vibe_vmu_mailbox', { action: 'ack', member: r2, ids: [r2MailId] }))
  await step('mailbox/unread/after-ack', () => h.call('vibe_vmu_mailbox', { action: 'unread', member: r2 }))
  await step('mailbox/status', () => h.call('vibe_vmu_mailbox', { action: 'status' }))
  await step('mailbox/plan', () => h.call('vibe_vmu_mailbox', { action: 'plan', members: [r1, r2, tmp], budget: 2 }))

  // ③ the v5r INBOX face: list rows carry no body, `open` returns it AND sets read, `mark` sets read/todo
  const inboxList = await step('inbox/list', () => h.call('vibe_v5_inbox', { action: 'list', member: tmp }, as(tmp)))
  const tmpInboxId = inboxList && inboxList.rows && inboxList.rows[0] && inboxList.rows[0].id
  await step('inbox/open', () => h.call('vibe_v5_inbox', { action: 'open', member: tmp, id: tmpInboxId }, as(tmp)))
  await step('inbox/mark/todo', () => h.call('vibe_v5_inbox', { action: 'mark', member: tmp, id: tmpInboxId, read: true, todo: true }, as(tmp)))

  // ④ CHAT: a member speaks in its own voice (the pack face), then the office does the admin chores
  const sayGroup = await step('chat/say', () => h.call('vibe_v5_say', { member: r1, text: '（群聊）信箱读完了，开始复核结论。' }, as(r1)))
  ids.chatMsg = sayGroup && sayGroup.receipt && sayGroup.receipt.id
  // the kernel chat face records ONE voice and has no relay field — its receipt says so (voiceMeans). The office typing a
  // member's sentence here is exactly the move the field warns about, so the script shows it once, on the record.
  await step('chat/send/by', () => h.call('vibe_vmu_chat', { action: 'send', member: r1, by: r1, text: '（办公室代录 r-1 的口述，回执里 voiceMeans 说明这一点）' }))
  await step('chat/list', () => h.call('vibe_vmu_chat', { action: 'list', limit: 10 }))
  await step('chat/status', () => h.call('vibe_vmu_chat', { action: 'status' }))
  await step('chat/policy', () => h.call('vibe_vmu_chat', { action: 'policy' }))

  // admin chores: mute/unmute, quota, admin grant+revoke, setpolicy — all must be acted by a declared admin
  await step('chat/mute', () => h.call('vibe_vmu_chat', { action: 'mute', member: r2, by: chair, reason: '演示：会后静音一分钟', durationMs: 60000 }))
  await step('chat/status/muted', () => h.call('vibe_vmu_chat', { action: 'status' }))
  await step('chat/unmute', () => h.call('vibe_vmu_chat', { action: 'unmute', member: r2, by: chair, reason: '演示：解除静音' }))
  await step('chat/quota', () => h.call('vibe_vmu_chat', { action: 'quota', member: r1, by: chair, quota: 8, windowMs: 60000 }))
  await step('chat/admin/grant', () => h.call('vibe_vmu_chat', { action: 'admin', member: r1, by: chair }))
  await step('chat/admin/revoke', () => h.call('vibe_vmu_chat', { action: 'admin', member: r1, by: chair, op: 'revoke' }))
  await step('chat/setpolicy', () => h.call('vibe_vmu_chat', {
    action: 'setpolicy', member: r1, by: chair, speakQuota: 8, speakQuotaWindowMs: 60000, muteDefaultMs: 30000, historyCap: 200,
  }))

  // ⑤ the G1 private→public path: a private message (urgent mail form of `say`) is supplemented by its own sender
  const priv = await step('chat/say/private', () => h.call('vibe_v5_say', { member: r1, to: r2, text: '私下说：结论我想再核一遍。', urgent: true }, as(r1)))
  const privMailId = priv && priv.receipt && priv.receipt.ids && priv.receipt.ids[0]
  ids.privateMail = privMailId
  await step('chat/supplement', () => h.call('vibe_vmu_chat', {
    action: 'supplement', member: r1, by: r1, of: privMailId, why: '这条私信与结论复核有关，请求入公开记录（正文仍扣留）', publicRef: 'Shared/Protocol.md',
  }))
  await step('chat/supplementof', () => h.call('vibe_vmu_chat', { action: 'supplementof', member: r1, of: privMailId }))
  await step('chat/supplements', () => h.call('vibe_vmu_chat', { action: 'supplements' }))

  // ⑥ RELAY: the office carries a member's voice — `from` is the voice, `relayedBy` is the office
  const relay = await step('message/relay-member-voice', () => h.call('vibe_v5_message', {
    to: r2, content: '我核过了，结论成立；请你也过一遍。', subject: '转达 r-1 的话', member: r1,
  }))
  ids.relay = relay && relay.sent && relay.sent.ids ? relay.sent.ids[0] : null
  await step('message/office-voice', () => h.call('vibe_v5_message', {
    to: r2, content: '办公室转达：通信主线进入复核。', subject: '转达',
  }))
  await step('inbox/list/relayed', () => h.call('vibe_v5_inbox', { action: 'list', member: r2 }, as(r2)))

  // ⑦ the INDEPENDENT ballot box (NOT a meeting ballot): chair opens, voting seats vote, chair closes
  const poll = await step('poll/open', () => h.call('vibe_v5_poll_open', {
    question: '是否采纳「前 n 个奇数之和 = n²」的结论？', options: ['采纳', '驳回'], min_votes: 2, member: chair,
  }, as(chair)))
  const boxId = poll && (poll.boxId || poll.ballotId)
  ids.poll = boxId
  await step('poll/vote/' + r1, () => h.call('vibe_v5_poll_vote', { ballot_id: boxId, choice: '采纳', member: r1 }, as(r1)))
  await step('poll/vote/' + r2, () => h.call('vibe_v5_poll_vote', { ballot_id: boxId, choices: ['采纳'], member: r2 }, as(r2)))
  await step('poll/vote/' + chair, () => h.call('vibe_v5_poll_vote', { ballot_id: boxId, abstain: false, choice: '采纳', member: chair }, as(chair)))
  const closed = await step('poll/close', () => h.call('vibe_v5_poll_close', { ballot_id: boxId, member: chair }, as(chair)))
  ids.pollResult = closed && closed.result ? closed.result : null

  // ⑧ PANELS: a seat writes its OWN panel; the office may record a panel for any member (the difference the refusal probe
  //     under --probes states). Subtasks are the panel's declared shape, not free text.
  await step('panel/set/own', () => h.call('vibe_vmu_panel', {
    action: 'set', member: r1, overall: '已读信箱，正在复核结论', subgoal: '复核 r-2 的结论',
    plan: ['读信箱', '复核结论'], status: 'working',
    subtasks: [{ id: 's1', title: '读信箱', state: 'done' }, { id: 's2', title: '复核结论', state: 'running' }],
  }, as(r1)))
  await step('panel/set/office-for-member', () => h.call('vibe_vmu_panel', {
    action: 'set', member: r2, overall: '办公室代记 r-2 的面板（面板是成员自己的报告，办公室只代记）', source: 'academician',
  }))
  await step('panel/get', () => h.call('vibe_vmu_panel', { action: 'get', member: r1, viewer: chair }, as(chair)))

  // ⑨ REPORT + NUDGE: the report is a read-only composition; a nudge is delivered as durable mail
  await step('report/read', () => h.call('vibe_v5_report', {}, as(chair)))
  await step('report/status', () => h.call('vibe_vmu_report', { action: 'status' }))
  await step('nudge', () => h.call('vibe_v5_nudge', { to: tmp, why: '初始任务还没有回报', next_step: '打开信箱并按要求回报' }, as(chair)))
  await step('inbox/list/nudged', () => h.call('vibe_v5_inbox', { action: 'list', member: tmp }, as(tmp)))

  // ⑩ the REFUSAL path (opt-in, `--probes`): "this MUST be refused" is evidence too, but the runner fails on any refusal
  //     it was not told to expect — so these steps run only under --probes and each entry below is declared in
  //     `expectedRefusals`. A code that does not match the declaration is a defect of the MECHANISM (or of this script),
  //     so it is thrown instead of being papered over. (`vibe_vmu_panel` writes its permission check at the face; the
  //     other four refuse either at the face (`VMU_TOOL_NOT_IN_FACE`) or in the kernel (`VMU_NOT_PERMITTED`,
  //     `VMU_MAILBOX_ANCHOR_DANGLING`).)
  const expectedRefusals = []
  if (PROBES) {
    const probe = async (name, tool, code, fn) => {
      const out = await step('probe/' + name, fn)
      const got = out && typeof out.code === 'string' ? out.code : null
      const hint = out && typeof out.hint === 'string' && out.hint.length > 0
      steps[steps.length - 1].expected = { code, got, hint }
      if (got !== code) throw new Error('probe ' + name + ': expected ' + code + ', got ' + got)
      expectedRefusals.push({ tool, code })
      return out
    }
    await probe('panel/write-another-member', 'vibe_vmu_panel', 'VMU_NOT_PERMITTED', () => h.call('vibe_vmu_panel', {
      action: 'set', member: r2, overall: '越权替 r-2 写面板',
    }, as(r1)))
    const probePoll = await step('probe/poll/open', () => h.call('vibe_v5_poll_open', {
      question: '拒绝探针：临时工可以投票吗？', options: ['可以', '不可以'], member: chair,
    }, as(chair)))
    const probeBox = probePoll && (probePoll.boxId || probePoll.ballotId)
    await probe('poll/vote/temp', 'vibe_v5_poll_vote', 'VMU_TOOL_NOT_IN_FACE', () => h.call('vibe_v5_poll_vote', {
      ballot_id: probeBox, choice: '不可以', member: tmp,
    }, as(tmp)))
    await probe('record/card/temp', 'vibe_v5_record_proposition', 'VMU_TOOL_NOT_IN_FACE', () => h.call('vibe_v5_record_proposition', {
      statement: '拒绝探针：临时工没有卡片面', value: 'x', p: 0.5, motive: '拒绝探针', member: tmp,
    }, as(tmp)))
    await probe('mailbox/impersonate', 'vibe_vmu_mailbox', 'VMU_NOT_PERMITTED', () => h.call('vibe_vmu_mailbox', {
      action: 'send', from: chair, to: r2, text: '以院士名义发信（冒名）',
    }, as(r1)))
    await probe('mailbox/anchor/acked', 'vibe_vmu_mailbox', 'VMU_MAILBOX_ANCHOR_DANGLING', () => h.call('vibe_vmu_mailbox', {
      action: 'anchor', id: ids.mailToR2,
    }))
  }

  // ⑪ what the seats would have been told (prompt capture, one assembly per seat)
  const promptChars = {}
  if (h.prompts && h.prompts.assembleFor) {
    for (const seat of ['chair', 'member', 'temp']) {
      const text = await h.prompts.assembleFor({ seat, phase: 'normal' })
      promptChars[seat] = text.length
    }
  }

  return {
    steps,
    ids,
    receipts: h.receipts,
    promptChars,
    tree: h.tree ? h.tree() : [],
    expectedRefusals,
    highlights: { started, mailToR1, urgent, mailToR2, sayGroup, priv, relay, poll, closed, closedResult: ids.pollResult },
  }
}

