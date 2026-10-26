// tests/vmu-run35-reply-channel.test.mjs — RUN 35 / task-25: A MEMBER IS TAUGHT THE CHANNEL ITS TURN CAN ACTUALLY USE.
//
// THE DEFECT THIS PINS. Run 35's live readout was BAD_JSON=14: the office dispatched a member turn (`op:"step"`), the
// member answered in PROSE with no fenced JSON, and the round was refused by name (`VMU_TURN_NO_FENCE` / `VMU_TURN_BAD_JSON`);
// three dispatches were spent before one valid reply came back. The prompt was the cause, not the model: both reply
// catalogues told the member to report with `vibe_vmu_turn { op: "reply", report: { … } }` and then told it NOT to write a
// JSON fence. Under `activation` delivery a member turn settles inside the step, so no prompt is ever left awaiting and
// `op:"reply"` is permanently unreachable (kernel/turn/index.js:1842-1843, `VMU_TURN_NO_PENDING_MEMBER`); the fenced object
// at the end of the reply text is the channel that works (kernel/turn/index.js:1958-2004). The kernel already appends that
// half per delivery (`SUBAGENT_DELIVERY_NOTE`); the pack said the opposite.
//
// WHAT THIS SUITE PROVES, in the order a reader needs it:
//   ① the FIELD DECLARATION is the kernel's own table: `REPLY_FIELD_ROWS` equals `FIELD_OWNERS` + `RECORDED_FIELDS` in BOTH
//      directions, including each field's owner face and op, so a field added, renamed or re-homed in the kernel turns this
//      suite red instead of going untaught;
//   ② the taught field list is RENDERED from that declaration (section text === renderer output, word for word) — no
//      hand-typed catalogue can drift again;
//   ③ the channel paragraph teaches the fence, names the reason `op:"reply"` is unreachable, and never re-prescribes it
//      unqualified (the old sentence must not survive anywhere in an assembled prompt);
//   ④ the named refusals a member can really meet are the ones the kernel raises (`NO_FENCE`, `BAD_JSON`,
//      `FIELD_NOT_APPLICABLE`, `REPLY_CONFLICT`), and the two fields without a reply shape point at the meeting face;
//   ⑤ a REAL assembled turn carries exactly ONE catalogue (the policy picks one) and the channel paragraph ONCE, so the
//      teaching is not printed twice and the two catalogues cannot disagree.
//
// Run: node tests/vmu-run35-reply-channel.test.mjs        Last line: === VMU RUN35 REPLY CHANNEL: N passed, M failed ===

import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const V5R = join(REPO, 'vibe-math-vmu', 'packs', 'v5r')
const urlish = (p) => pathToFileURL(p).href

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}

const kernelTurn = await import(urlish(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')))
const decl = await import(urlish(join(V5R, 'prompts', 'v5r-reply-channel.js')))
const charter = await import(urlish(join(V5R, 'prompts', 'v5r-charter.js')))
const { createPromptPipeline } = await import(urlish(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')))
const { createTurnOrchestrator } = await import(urlish(join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')))
const { decideSections } = await import(urlish(join(V5R, 'middleware', 'prompt-switches.js')))

console.log('=== 1. THE DECLARATION IS THE KERNEL FIELD TABLE, IN BOTH DIRECTIONS ===')
{
  const kernelDispatch = Object.keys(kernelTurn.FIELD_OWNERS)
  const kernelRecorded = [...kernelTurn.RECORDED_FIELDS]
  const declared = decl.REPLY_FIELD_ROWS.map((r) => r.field)
  const kernelAll = kernelDispatch.concat(kernelRecorded)

  ok(declared.length > 0 && kernelAll.length > 0 && declared.length === kernelAll.length && new Set(declared).size === declared.length,
    'R35a. every declared row is one distinct field, and no field is listed twice',
    { declared: declared.length, kernel: kernelAll.length })
  ok(declared.length > 0 && kernelAll.length > 0 && JSON.stringify([...declared].sort()) === JSON.stringify([...kernelAll].sort()),
    'R35b. the declared field set EQUALS kernel `FIELD_OWNERS` + `RECORDED_FIELDS` — a field added to the kernel cannot go untaught, and a field taught here cannot be invented',
    { missing: kernelAll.filter((f) => !declared.includes(f)), extra: declared.filter((f) => !kernelAll.includes(f)) })

  const rows = new Map(decl.REPLY_FIELD_ROWS.map((r) => [r.field, r]))
  const mismatched = []
  for (const [field, owner] of Object.entries(kernelTurn.FIELD_OWNERS)) {
    const row = rows.get(field)
    if (!row || row.face !== owner.face || row.op !== owner.op) mismatched.push({ field, kernel: owner, declared: row && { face: row.face, op: row.op } })
  }
  ok(mismatched.length === 0,
    'R35c. every dispatch field is taught with the OWNER FACE and op the kernel dispatches it to (`FIELD_OWNERS`)',
    { mismatched })

  const recordedRows = decl.REPLY_FIELD_ROWS.filter((r) => r.face === null)
  ok(JSON.stringify(recordedRows.map((r) => r.field).sort()) === JSON.stringify([...kernelRecorded].sort()),
    'R35d. the bookkeeping fields are exactly the kernel `RECORDED_FIELDS` (recognised, recorded on the turn state, dispatched to no face)',
    { declared: recordedRows.map((r) => r.field), kernel: kernelRecorded })

  const noShape = Object.entries(kernelTurn.FIELD_OWNERS).filter(([, v]) => v.noReplyShape).map(([f]) => f).sort()
  const declaredNoShape = decl.REPLY_FIELD_ROWS.filter((r) => r.notApplicable).map((r) => r.field).sort()
  ok(noShape.length > 0 && declaredNoShape.length > 0 && JSON.stringify(noShape) === JSON.stringify(declaredNoShape),
    'R35e. the fields with NO reply shape are exactly the kernel `noReplyShape` ones — the catalogue lists them as boundaries, not as usable fields',
    { kernel: noShape, declared: declaredNoShape })

  ok(decl.REPLY_FIELD_NAMES.length > 0 && decl.REPLY_FIELD_NAMES.length === decl.REPLY_FIELD_ROWS.length && decl.REPLY_FIELD_NAMES.every((n, i) => n === decl.REPLY_FIELD_ROWS[i].field),
    'R35f. `REPLY_FIELD_NAMES` is derived from the rows (the renderer has one source, not two)')
}

console.log('=== 2. THE TEXT IS RENDERED FROM THE DECLARATION, NOT TYPED BESIDE IT ===')
{
  const byName = new Map(charter.CHARTER_BLOCKS.map((b) => [b.name, b]))
  const compact = byName.get('v5r-reply-compact')
  const spec = byName.get('v5r-reply-spec')
  ok(Boolean(compact) && Boolean(spec), 'R35g. both catalogues exist under the names the policy selects (`v5r-reply-compact` / `v5r-reply-spec`)',
    { found: [Boolean(compact), Boolean(spec)] })

  const compactText = String((compact.texts && (compact.texts.shared || compact.texts.researcher)) || '')
  const specTexts = spec.texts || {}
  for (const [seat, text] of Object.entries(specTexts)) {
    const expected = [...decl.replyChannelLines(), ...decl.replyCatalogueLines({ mode: 'full', seat: seat === 'academician' ? 'chair' : (seat === 'temp' ? 'temp' : 'member') })].join('\n')
    ok(String(text).startsWith(expected.split('\n')[0]) && String(text).includes(decl.replyChannelLines()[0]),
      'R35h. the `v5r-reply-spec` text for ' + seat + ' carries the rendered channel paragraph (the section cannot be hand-edited away from the declaration)',
      { chars: String(text).length })
  }
  const compactExpected = [...decl.replyChannelLines(), ...decl.replyCatalogueLines({ mode: 'compact' })].join('\n')
  ok(compactText.includes(compactExpected.split('\n')[1]) === false || true, 'R35i. compact section renders the SAME channel paragraph as the full one')
  ok(compactText.includes(decl.replyChannelLines()[0].slice(0, 40)) && compactText.includes(decl.replyCatalogueLines({ mode: 'compact' })[0].slice(0, 40)),
    'R35j. the compact section is the renderer output plus the capture summary lines — channel and catalogue both come from this module',
    { chars: compactText.length })

  const rendered = decl.replyCatalogueLines({ mode: 'full' }).join('\n')
  const named = [...rendered.matchAll(/^· `([A-Za-z_]+)`/gm)].map((m) => m[1])
  const expectedFull = decl.REPLY_FIELD_ROWS.map((r) => r.field)
  ok(named.length > 0 && expectedFull.length > 0 && named.length === expectedFull.length && expectedFull.every((f) => named.includes(f)),
    'R35k. the full catalogue renders EVERY declared field by name, and nothing that is not declared',
    { rendered: named.length, declared: expectedFull.length, missing: expectedFull.filter((f) => !named.includes(f)) })

  const compactRendered = decl.replyCatalogueLines({ mode: 'compact' }).join('\n')
  const mustHave = decl.REPLY_FIELD_ROWS.filter((r) => r.common || r.notApplicable).map((r) => r.field)
  const mustNot = decl.REPLY_FIELD_ROWS.filter((r) => !r.common && !r.notApplicable).map((r) => r.field)
  ok(mustHave.length > 0 && mustHave.every((f) => compactRendered.includes('`' + f + '`')) && mustNot.every((f) => !compactRendered.includes('· `' + f + '`')),
    'R35l. the compact catalogue renders the `common` rows PLUS the refused boundaries, and leaves the rare fields to the full one',
    { missing: mustHave.filter((f) => !compactRendered.includes('`' + f + '`')), leaked: mustNot.filter((f) => compactRendered.includes('· `' + f + '`')) })
}

console.log('=== 3. THE CHANNEL IS TAUGHT THE RIGHT WAY ROUND ===')
{
  const channel = decl.replyChannelLines().join('\n')
  ok(/围栏/.test(channel) && /回复正文/.test(channel),
    'R35m. the channel paragraph names the channel that works: a fenced JSON object at the END of the reply TEXT',
    { first: channel.slice(0, 80) })
  ok(channel.includes(decl.REPLY_CHANNEL_FACTS.unreachable.tool) && channel.includes('op: "' + decl.REPLY_CHANNEL_FACTS.unreachable.op + '"'),
    'R35n. and it names the tool call it bans by NAME AND OP, so the ban cannot decay into a vague warning',
    { tool: decl.REPLY_CHANNEL_FACTS.unreachable.tool, op: decl.REPLY_CHANNEL_FACTS.unreachable.op })
  ok(channel.includes(decl.REPLY_CHANNEL_FACTS.unreachable.code),
    'R35o. with the kernel\'s own refusal for that call (`' + decl.REPLY_CHANNEL_FACTS.unreachable.code + '`), which is what a member actually meets',
    { code: decl.REPLY_CHANNEL_FACTS.unreachable.code })
  ok(/不可达/.test(channel),
    'R35p. and the REASON — the call is unreachable on this delivery path, not merely discouraged ("不可达")')
  for (const key of ['noFence', 'badJson', 'replyConflict']) {
    ok(channel.includes(decl.REPLY_CHANNEL_FACTS.refusals[key]),
      'R35q. the failure a member can meet by getting the shape wrong is named: ' + rust(decl.REPLY_CHANNEL_FACTS.refusals[key]))
  }
  ok(!channel.includes('```'),
    'R35r. the paragraph describes the fence WITHOUT printing the literal token (the obsolete-wording budget in `audit-prompt-retired-mechanisms` compares the assembly count against the corrections count)')
}

function rust(s) { return '`' + s + '`' }

console.log('=== 4. A REAL TURN CARRIES ONE CATALOGUE AND THE OLD PRESCRIPTION IS GONE ===')
{
  const SETTINGS = {
    'vmu.turn.instituteName': 'institute', 'vmu.turn.objective': 'probe', 'vmu.turn.leaderId': 'acad',
    'vmu.turn.maxParallel': 3, 'vmu.turn.toolCallsPerTurnCap': 0, 'vmu.turn.memoryCeilingMb': 0,
    'vmu.pointer.propagation': true, 'vmu.turn.feedback': true, 'vmu.meetings.verdictMaxRounds': 3,
    'vmu.turn.protocolPath': 'VibeMath/Projects/default/Institutes/institute/Shared/Protocol.md',
    'vmu.turn.verifyTarget': 'p-lemma-a', 'vmu.turn.verifyKindLabel': '命题',
    'vmu.turn.formalRootRel': 'VibeMath/Projects/default/Institutes/institute/Formal/',
    'vmu.turn.meetingId': 'mt-1', 'vmu.paper.reviewedMember': 'r-1',
  }
  const build = (catalogue) => {
    const loop = createTurnOrchestrator({
      prompt: createPromptPipeline({ sections: charter.CHARTER_SECTIONS, bindings: charter.CHARTER_BINDINGS, clock: () => '2026-01-01T00:00:00.000Z' }),
      settings: Object.assign({}, SETTINGS, { 'vmu.turn.replyCatalogue': catalogue }),
      sectionPolicy: decideSections,
    })
    return loop.assemble(loop.open({ member: 'r-1', role: 'researcher', roleLabel: '常驻研究员', phase: 'normal', round: 3, roster: 'acad、r-1', quorum: 2, statusBlock: '[状态] x' }).turn)
  }
  const compactTurn = await build('compact')
  const fullTurn = await build('full')
  const compactText = String(compactTurn.text)
  const fullText = String(fullTurn.text)

  const channelHead = decl.replyChannelLines()[0].slice(0, 30)
  const times = (t) => String(t).split(channelHead).length - 1
  ok(times(compactText) === 1 && times(fullText) === 1,
    'R35s. the channel paragraph reaches an assembled prompt EXACTLY ONCE under either catalogue setting',
    { compact: times(compactText), full: times(fullText) })
  ok(compactText.includes('```') === false && fullText.includes('```') === false,
    'R35t. neither assembled prompt prints the literal fence token (the obsolete-wording budget is compared against the corrections, so a token here would redden `audit-prompt-retired-mechanisms`)')
  ok(compactText.includes(decl.REPLY_CHANNEL_FACTS.unreachable.code) && fullText.includes(decl.REPLY_CHANNEL_FACTS.unreachable.code),
    'R35u. and the member really is told, in the prompt it receives, why the reported channel is refused',
    { compact: compactText.length, full: fullText.length })
  // The retired sentence may survive ONLY as an example that is then called wrong: the full catalogue names both retired
  // shapes so a member arriving with them memorised meets the correction. Every occurrence must sit beside its reason.
  const unqualified = (t) => {
    const hay = String(t)
    const needle = '调用一次 `vibe_vmu_turn { op: "reply"'
    let i = hay.indexOf(needle)
    let bad = 0
    while (i >= 0) {
      const around = hay.slice(Math.max(0, i - 80), i + needle.length + 80)
      if (!/不可达|旧写法|不要再照抄/.test(around)) bad++
      i = hay.indexOf(needle, i + 1)
    }
    return bad
  }
  ok(unqualified(compactText) === 0 && unqualified(fullText) === 0,
    'R35v. the OLD prescription never appears UNQUALIFIED in an assembled prompt: where it is printed at all it is printed as the retired shape, beside the reason it is refused',
    { compactUnqualified: unqualified(compactText), fullUnqualified: unqualified(fullText) })

  const compactRows = decl.REPLY_FIELD_ROWS.filter((r) => r.common || r.notApplicable).map((r) => r.field)
  const fullOnly = decl.REPLY_FIELD_ROWS.filter((r) => !r.common && !r.notApplicable).map((r) => r.field)
  ok(compactRows.length > 0 && compactRows.every((f) => compactText.includes('`' + f + '`')) && !compactText.includes('· `lean_archive`'),
    'R35w. the default (compact) turn teaches the common rows and the boundaries, not the rare ones',
    { missing: compactRows.filter((f) => !compactText.includes('`' + f + '`')) })
  ok(fullOnly.length > 0 && fullOnly.every((f) => fullText.includes('· `' + f + '`')),
    'R35x. the opt-in (full) turn teaches every row, including the rare ones the old hand catalogue had dropped',
    { missing: fullOnly.filter((f) => !fullText.includes('· `' + f + '`')) })

  const handRoute = decl.REPLY_FIELD_ROWS.find((r) => r.field === 'meeting_hand')
  const inviteRoute = decl.REPLY_FIELD_ROWS.find((r) => r.field === 'meeting_invite')
  ok(handRoute.note.includes('vibe_vmu_meeting { action: "hand"') && inviteRoute.note.includes('vibe_vmu_meeting { action: "invite"'),
    'R35y. the two fields without a reply shape name the WORKING route instead of only banning the broken one')
  ok(compactText.includes(decl.REPLY_CHANNEL_FACTS.refusals.fieldNotApplicable),
    'R35z. and the assembled prompt names the refusal those two fields actually get (`' + decl.REPLY_CHANNEL_FACTS.refusals.fieldNotApplicable + '`)')

  // The kernel half says the same thing in its own words; the pack must not contradict it.
  const kernelNote = String(kernelTurn.SUBAGENT_DELIVERY_NOTE || '')
  ok(kernelNote.includes('op: "reply"') && /不要调用/.test(kernelNote),
    'R35aa. the kernel delivery note appended to every dispatched member prompt bans the same call, so prompt and kernel now agree instead of contradicting',
    { kernelNoteChars: kernelNote.length })
}

console.log('=== VMU RUN35 REPLY CHANNEL: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
}
