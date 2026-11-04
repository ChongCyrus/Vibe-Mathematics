// scripts/sim/scenarios/mainline.mjs — the main line of an institute, driven by a SCRIPT, not by a language model.
//
// The scenario is deliberately boring: it walks the same path a live chair walks (start the institute, put a claim on
// the record, agree a blueprint, write a paper, settle a vote, close the meeting, deliver) and records the receipt of
// every call. A live run needs 30 minutes and a model to produce these receipts; this needs one second. What the corpus
// is FOR is the audit: receipts that answer the wrong question, faces that promise what they cannot do, md files that
// disagree with their index rows — all of it shows up here without a model in the loop.

/**
 * @param {{ call: Function, receipts: Array, prompts: any, tree: Function }} h — the harness from ../harness.mjs
 * @param {{ log?: Function }} [opts]
 */
export async function mainline(h, { log = () => {} } = {}) {
  const steps = []
  const step = async (name, fn) => {
    const before = h.tree ? h.tree().length : 0
    const out = await fn()
    const after = h.tree ? h.tree().length : 0
    steps.push({ name, at: h.receipts.length, files: { before, after }, ok: !(out && out.ok === false), code: out && out.code ? out.code : null })
    log(name + (out && out.ok === false ? '  [' + (out.code || 'refused') + ']' : ''))
    return out
  }

  // ① the institute exists
  const started = await step('institute/start', () => h.call('vibe_v5_start', {
    problem: '前 n 个奇数之和等于 n 的平方（占位题：本场景只压机制，不压数学）。',
    researcherCount: 2,
  }))

  // ② a claim goes on the record (chair states it, as a proposition card)
  const claim = await step('record/proposition', () => h.call('vibe_v5_record_proposition', {
    statement: '前 n 个奇数之和 = n^2',
    value: '对任意正整数 n 成立',
    p: 0.9,
    motive: '主线命题：由蓝图与论文共同承载',
    member: 'r-1',
  }, { as: { agent: { id: 'r-1' } } }))

  // ③ a blueprint draft, then adoption (the md file is the truth; the row is its index)
  const draft = await step('blueprint/propose', () => h.call('vibe_v5_blueprint', {
    action: 'propose',
    path: 'Shared/Protocol.md',
    member: 'r-acad',
    text: '# 公共蓝图\n- 命题：前 n 个奇数之和 = n²。\n- 路线：对 n 归纳；奇数是 n²-(n-1)² 的差分。',
  }))
  const draftId = (draft && (draft.id || draft.recordId)) || null
  const codesign = await step('blueprint/codesign', () => h.call('vibe_v5_blueprint', {
    action: 'propose',
    draft: draftId,
    path: 'Shared/Protocol.md',
    member: 'r-1',
    text: '## 共同设计补充｜r-1' + String.fromCharCode(10) + '- 复核归纳步：n=1 时 1=1² 成立。',
  }, { as: { agent: { id: 'r-1' } } }))
  const adopted = await step('blueprint/adopt', () => h.call('vibe_v5_blueprint', {
    action: 'adopt',
    path: 'Shared/Protocol.md',
    draft: draftId,
    member: 'r-acad',
  }))
  const blueprintRead = await step('blueprint/read', () => h.call('vibe_v5_blueprint', { action: 'read', id: draftId }))
  const reindex = await step('record/reindex', () => h.call('vibe_vmu_records', { action: 'reindex', track: 'blueprint' }))

  // ④ a paper: start → part → advance → review → final → render → compile
  const paper = await step('paper/start', () => h.call('vibe_v5_paper', {
    action: 'start',
    participants: ['r-1', 'r-2'],
    target: 'sim-paper-mainline',
    title: '前 n 个奇数之和 = n²',
  }))
  const part = await step('paper/part', () => h.call('vibe_v5_paper', {
    action: 'part',
    target: 'sim-paper-mainline',
    part: 'theorem',
    member: 'r-1',
    body: '命题：对任意正整数 n，前 n 个奇数之和等于 $n^2$。',
  }, { as: { agent: { id: 'r-1' } } }))
  const advanced = await step('paper/advance', () => h.call('vibe_v5_paper', { action: 'advance', target: 'sim-paper-mainline', member: 'r-acad' }))
  const reviewed = await step('paper/review', () => h.call('vibe_v5_paper', {
    action: 'review',
    target: 'sim-paper-mainline',
    member: 'r-2',
    deliverable: true,
  }, { as: { agent: { id: 'r-2' } } }))
  const rendered = await step('paper/render', () => h.call('vibe_v5_paper', { action: 'render', target: 'sim-paper-mainline', member: 'r-acad' }))
  const compiled = await step('paper/compile', () => h.call('vibe_v5_paper', { action: 'compile', target: 'sim-paper-mainline', member: 'r-acad' }))

  // ⑤ a meeting: convene (with the durable invitation), attend, motion, vote, close
  const meeting = await step('meeting/open', () => h.call('vibe_v5_meeting', {
    agenda: '确认主线命题与论文定稿',
    kind: 'sync',
    member: 'r-acad',
  }))
  const meetingId = meeting && (meeting.meeting || meeting.id) ? (meeting.meeting || meeting.id) : null
  const attendance = []
  for (const seat of ['r-acad', 'r-1', 'r-2']) {
    attendance.push(await step('meeting/attend/' + seat, () => h.call('vibe_vmu_meeting', { action: 'attend', id: meetingId, member: seat }, { as: { agent: { id: seat } } })))
  }
  const motion = await step('meeting/motion', () => h.call('vibe_v5_motion', { meeting: meetingId, kind: 'resolution', text: '本主线命题以现有证据通过', member: 'r-acad' }))
  const motionId = motion && (motion.motion || motion.id) ? (motion.motion || motion.id) : null
  const votes = []
  for (const seat of ['r-1', 'r-2']) {
    votes.push(await step('meeting/vote/' + seat, () => h.call('vibe_vmu_meeting', { action: 'vote', meeting: meetingId, motion: motionId, member: seat, value: 1 }, { as: { agent: { id: seat } } })))
  }
  const closed = await step('meeting/close', () => h.call('vibe_vmu_meeting', { action: 'close', id: meetingId, member: 'r-acad', by: 'r-acad' }))

  // ⑥ what the seats would have been told (prompt capture, one assembly per seat)
  const promptChars = {}
  if (h.prompts && h.prompts.assembleFor) {
    for (const seat of ['chair', 'member', 'temp']) {
      const text = await h.prompts.assembleFor({ seat, phase: 'normal' })
      promptChars[seat] = text.length
    }
  }

  return {
    steps,
    ids: { meeting: meetingId, motion: motionId, paper: (paper && (paper.started || paper)) || null },
    receipts: h.receipts,
    promptChars,
    tree: h.tree ? h.tree() : [],
    highlights: { started, claim, draft, codesign, adopted, blueprintRead, reindex, paper, part, advanced, reviewed, rendered, compiled, closed },
  }
}
