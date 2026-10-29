#!/usr/bin/env node
// vmu RUN 48 — A MULTI-PARAGRAPH CARD WAS WRITTEN BY ONE FACE AND UNREADABLE TO ANOTHER.
//
// THE OBSERVED DEFECT (run 48, F-23): the office asked a member to register a proposition card whose `statement`
// ran over three paragraphs. The card tool wrote the text verbatim (`- statement：…` followed by the paragraph
// lines), and reported `recordId: rec-5`. Then the debate gate refused that very card with
//     「命题卡 rec-5 没有「正式证明或证伪已写完」的任何登记…proofRef=空、proofState=空」
// although the body carried `- proofRef：Formal/p-close3.lean#m_unanimous_3` and `- proofState：complete` two
// lines further down (the read-back through `vibe_v5_read_library` shows them verbatim). The caller's only reading
// of that refusal is "register the proof again" — so it wrote a second card (rec-9) that happened to have a
// single-line statement and was accepted.
//
// TWO LAYERS, BOTH FIXED:
//   ① the PARSER called every paragraph line "unparsable", so the whole card became unjudgeable. A line that is not
//      a header but follows a header is the PREVIOUS FIELD CONTINUING (run 48); it is folded back, and `continuations`
//      reports how many lines were folded. A line with no field to continue is still `malformed`.
//   ② the PROJECTION reported proofRef/proofState as '' when the card could not be judged, and the gate forwarded
//      that as 「没有任何登记」. "Unjudgeable" and "declared nothing" are different answers; the gate now says which,
//      and quotes what the author wrote.
//
// THE OTHER DEFECT IN THE SAME RUN (F-22): `vibe_v5_say` on an unknown meeting id got the PRIMITIVE kernel's old
// one-line hint (`open: m1`) through the pack face, while the pack face itself had been taught (run 47) to name BOTH
// registries. The kernel's wording IS what the member sees, so the kernel refusal was brought up to the same bar.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const VERIFIED = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verified.js')
const GATES = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verification-gates.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const verified = await import(pathToFileURL(VERIFIED).href)
const gates = await import(pathToFileURL(GATES).href)
const { parseBody, parseCardBody, parseCard, CARD_TRACK, CARD_KIND } = verified

let NOW = 1000
const boot = async (config = {}) => {
  const state = { specs: [] }
  // C6a admits `proof_state:"complete"` only when the write carries Lean registration, so the fixture needs a
  // real Lean face — the host injects a `subprocess` seam exactly as tests/vmu-b3-c8-c10.test.mjs does.
  const subprocess = {
    resolveExecutable: async (name) => '/fake/bin/' + String(name),
    spawn: () => ({ done: Promise.resolve({ exitCode: 0, signal: null, stdout: 'Build completed successfully.\n', stderr: '' }), terminate() {} }),
  }
  const ctx = { effect(fn) { return fn() }, on() { return () => {} }, get: (what) => (what === 'subprocess' ? subprocess : undefined), tools: { register: async (spec) => { state.specs.push(spec); return () => {} } } }
  const handle = entry.apply(ctx, Object.assign({ clock: () => NOW, root: config.root, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specOf: (n) => state.specs.find((s) => s.name === n) }
}
const callJSON = async (b, name, args = {}, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  let raw
  try { raw = await spec.execute(args, ctx) } catch (e) {
    return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
  try { return { parsed: JSON.parse(raw) } } catch { return { raw } }
}

// ── ① the parser folds continuation lines back into the field they follow ──────────────────────────────────────
{
  const body = '- statement：在本所法定票数 m = 3 的结题裁决口径下：\n'
    + '\n'
    + '【范围声明】本命题只形式化 m = 3 这一个读数；一般 n 没有形式化。\n'
    + '\n'
    + '【执行语义】由 Lean 文件给出：27 种组合穷举，exit 0。\n'
    + '- value：0.75\n- motive：用途：走通形式化一环\n- p：0.9\n'
    + '- proofRef：Formal/p-close3.lean#m_unanimous_3\n- proofState：complete\n'
  const parsed = parseBody(body)
  ok(parsed.continuations >= 2, 'the paragraph lines are counted as continuations, not as damage', parsed)
  ok(parsed.malformed.length === 0, 'nothing in a multi-paragraph statement is reported as malformed', parsed.malformed)
  ok(/【范围声明】/.test(parsed.fields.statement) && /【执行语义】/.test(parsed.fields.statement),
    'both paragraphs are folded back into `statement` (in order)', parsed.fields.statement)
  ok(/\n\n【范围声明】/.test(parsed.fields.statement), 'the blank line between paragraphs is kept as a paragraph break')
  ok(parsed.fields.proofRef === 'Formal/p-close3.lean#m_unanimous_3', 'a field AFTER the multi-line one still parses (proofRef)')
  ok(parsed.fields.proofState === 'complete', 'and so does proofState')

  const card = parseCardBody(body)
  ok(card.ok === true && card.card !== null, 'a card whose statement runs over paragraphs is a CARD (ok, not unjudgeable)', card.problems)
  ok(card.card.p === 0.9, 'its probability is the number 0.9 (not a string)', card.card.p)
  ok(card.card.statement.includes('【执行语义】'), 'its statement carries the whole text')

  // a line with nothing to continue is STILL damage: the tolerance must not swallow stray text
  const stray = parseBody('no header at all\n- p：0.5\n')
  ok(stray.malformed.length === 1 && stray.malformed[0] === 'no header at all', 'leading text with no field to continue is still malformed')
  const dup = parseBody('- p：0.5\n- p：1\n')
  ok(dup.dupes.includes('p'), 'a duplicate field is still reported, never resolved silently')
  const trailing = parseBody('- p：1\n\n\n')
  ok(trailing.fields.p === '1', 'trailing blank lines are spacing, not part of the value', trailing.fields.p)
}

const root = await mkdtemp(join('D:/_tmp', 'vmu-run48-cardtext-'))
try {
  const b = await boot({ root, packs: ['v5r'] })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-c1', slot: 'chair' })

  // ── ② a card written by the CARD TOOL with a multi-paragraph statement is readable as a card ────────────────
  const multi = '第 48 轮的命题。\n\n【范围声明】只形式化 m = 3。\n\n【执行语义】27 种组合穷举。'
  // C6a: "完整证明" 现在要有 Lean 登记撑腰，所以先真跑一次（接缝注入，退出码 0），再拿这次作业当证据写卡。
  await mkdir(join(root, 'Formal'), { recursive: true })
  await writeFile(join(root, 'Formal', 'p-close3.lean'), 'theorem m_unanimous_3 : True := trivial\n', 'utf8')
  const leanRun = await callJSON(b, 'vibe_v5_lean_run', { statement: 'True', file: 'Formal/p-close3.lean' }, { kernel })
  const leanJob = leanRun.parsed && leanRun.parsed.id
  const settled = leanJob ? await kernel.lean.settle(leanJob) : null
  ok(!!settled && settled.passed === true, 'setup: a Lean run is settled and PASSED (the registration the card will cite)', settled)
  const written = await callJSON(b, 'vibe_v5_record_proposition', {
    member: 'r-c1', statement: multi, value: 0.75, motive: 'run 48 复验：多段落正文',
    p: 0.9, proof_ref: 'Formal/p-close3.lean#m_unanimous_3', proof_state: 'complete',
    lean_job: leanJob,
  }, { kernel })
  const rid = written.parsed && written.parsed.recordId
  ok(!!rid, 'the card tool accepted the multi-paragraph statement and minted an id', written)
  const row = kernel.records.get({ id: rid })
  ok(/proofRef/.test(row.body), 'the body carries the proof reference as a header line (the writer did its job)', row.body)
  const asCard = parseCard(row)
  ok(asCard.ok === true, 'the same body reads back as a CARD (writer and reader now agree)', asCard.problems)
  ok(asCard.fields && asCard.fields.proofRef === 'Formal/p-close3.lean#m_unanimous_3', 'the proof reference survives the round trip')
  ok(asCard.fields && asCard.fields.proofState === 'complete', 'so does the proof state')

  // ── ③ the debate gate admits it on the declaration alone (declaration-only basis, said out loud) ────────────
  const projection = { id: rid, p: asCard.card.p, proofRef: asCard.fields.proofRef, proofState: asCard.fields.proofState }
  const allowed = gates.debateSubjectGate({ meeting: { type: 'debate' }, subject: rid, evidence: { card: projection } })
  ok(allowed && allowed.allowed === true, 'the debate gate admits a card whose body runs over paragraphs', allowed)
  ok(allowed && allowed.proofBasis === 'declaration-only', 'and labels the admission as declaration-only (a self-report is not proof)', allowed && allowed.proofBasis)
  ok(allowed && allowed.declaredProofRef === 'Formal/p-close3.lean#m_unanimous_3', 'the receipt carries the declared reference')

  // ── ④ an UNJUDGEABLE card is reported as unjudgeable, quoting the author's own registration ───────────────
  const unjudgeableWithDeclaration = gates.debateSubjectGate({ meeting: { type: 'debate' }, subject: 'rec-5',
    evidence: { card: { id: 'rec-5', p: null, proofRef: 'Formal/p-close3.lean#m_unanimous_3', proofState: 'complete',
      unjudgeable: 'unparsable line(s): 2' } } })
  ok(unjudgeableWithDeclaration && unjudgeableWithDeclaration.allowed !== true, 'an unjudgeable card is still refused')
  ok(unjudgeableWithDeclaration.code === 'VMU_PACK_V5R_DEBATE_SUBJECT_UNPROVEN', 'with a NAMED code (the unproven family)', unjudgeableWithDeclaration.code)
  ok(/无法被判读/.test(unjudgeableWithDeclaration.message), 'the message says the card could not be JUDGED', unjudgeableWithDeclaration.message)
  ok(/proofRef=Formal\/p-close3/.test(unjudgeableWithDeclaration.message),
    'and quotes what the author wrote — it no longer claims the card declared nothing', unjudgeableWithDeclaration.message)
  ok(/不是"没有登记证明"/.test(unjudgeableWithDeclaration.message), 'the message draws the distinction explicitly')
  ok(/expand:true/.test(unjudgeableWithDeclaration.hint), 'the hint says HOW to look at the body (read it expanded)')

  const unjudgeableBare = gates.debateSubjectGate({ meeting: { type: 'debate' }, subject: 'rec-6',
    evidence: { card: { id: 'rec-6', p: null, proofRef: '', proofState: '', unjudgeable: 'missing required field(s): p' } } })
  ok(/无法被判读/.test(unjudgeableBare.message) && /missing required field\(s\): p/.test(unjudgeableBare.message),
    'an unjudgeable card with no declaration still names the parse problem')

  // ── ⑤ the PRIMITIVE kernel refusal (what a member's `vibe_v5_say` reaches) names both registries ────────
  kernel.meetings.open({ id: 'm-p48', kind: 'ordinary', subject: 'run 48', roster: ['r-c1'] })
  let kernelHint = null
  try { kernel.meetings.speak({ meeting: 'm-typo', member: 'r-c1', text: 'hello' }) } catch (e) { kernelHint = e }
  ok(!!kernelHint && kernelHint.code === 'VMU_NO_SUCH_OBJECT', 'an unknown id is refused by name', kernelHint && kernelHint.code)
  const kh = String(kernelHint && kernelHint.hint)
  ok(/PRIMITIVE/.test(kh), 'the hint names the PRIMITIVE table (the one this face addresses)')
  ok(/SERVICE/.test(kh), 'and the SERVICE table (where a `vibe_v5_meeting` meeting lives)')
  ok(/vibe_vmu_meeting \{action:"list"\}/.test(kh), 'it gives a COPYABLE call for the primitive table')
  ok(/vibe_v5_meeting \{action:"status"/.test(kh), 'and one for the service table')
  ok(!/^open: /.test(kh), 'the old one-line "open: …" hint is gone')

  const packSay = await callJSON(b, 'vibe_v5_say', { meeting: 'm-typo', member: 'r-c1', text: 'hello' }, { kernel })
  const ph = String(packSay.parsed && packSay.parsed.hint)
  ok(!!packSay.parsed && packSay.parsed.ok === false, 'the pack face refuses the same id', packSay)
  ok(/PRIMITIVE/.test(ph) && /SERVICE/.test(ph), 'and the wording a MEMBER sees names both tables', ph)
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

console.log('')
if (failed > 0) {
  console.error('=== VMU RUN 48 CARD TEXT: ' + passed + ' passed, ' + failed + ' failed ===')
  for (const f of failures) console.error('  - ' + f)
  process.exitCode = 1
} else {
  console.log('=== VMU RUN 48 CARD TEXT: ' + passed + ' passed, 0 failed ===')
}
