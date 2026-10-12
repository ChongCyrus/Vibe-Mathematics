// vibe-math-vmu — THE FRAMEWORK NOTICE SHAPES, checked against the lines the ORIGINAL really sent.
//
// The acceptance measurement found this family by counting lines rather than items: the original prepends short
// notices to a member's next prompt, and no section-by-section transcription would ever have produced them, because
// they are not sections. Four shapes appear in the delivered-prompt corpus.
//
// The check is not "does our template look right". For each notice really present in the corpus, this suite extracts
// the variable parts, runs them through the formatter, and requires the result to equal the captured line VERBATIM. A
// paraphrase would fail, and so would a template that drops or reorders a clause.
//
// Run: node tests/vmu-notice-shapes.test.mjs
import { PROMPTS } from '../vibe-math-vmu/packs/v5r/prompts/v5r-prompts.js'
import { assignmentNotice, nudgeNotice, chatNotice, officeNotice, formatNotice, NOTICE_SHAPES, inboxBlock, INBOX_HEADER } from '../vibe-math-vmu/packs/v5r/notices.js'

let passed = 0
let failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}

const corpus = PROMPTS.map((p) => String(p.text || ''))
const lines = corpus.flatMap((t) => t.split('\n').map((l) => l.trim())).filter(Boolean)
const pick = (prefix) => [...new Set(lines.filter((l) => l.startsWith(prefix)))]

console.log('=== 1. THE ASSIGNMENT NOTICE, reproduced from its own captured fields ===')
{
  const captured = pick('【所办分派】').concat(pick('【院士分派】'))
  ok(captured.length >= 2, 'the corpus carries assignment notices under both labels', { count: captured.length })
  let matched = 0
  const bad = []
  for (const line of captured) {
    // 【{label}分派】任务 {id}「{title}」分派给你。理由：{why}｜验收标准：{acceptance}。默认应当执行；…
    const m = /^【(.+?)分派】任务 (.+?)「(.+?)」分派给你。理由：(.+?)｜验收标准：(.+?)。默认应当执行；/.exec(line)
    if (!m) { bad.push(line.slice(0, 60)); continue }
    const mine = assignmentNotice({ assignerLabel: m[1], taskId: m[2], title: m[3], why: m[4], acceptance: m[5] })
    if (mine === line) matched += 1
    else bad.push(line.slice(0, 60))
  }
  ok(matched === captured.length,
    'every captured assignment notice is reproduced VERBATIM from its own fields, so the sentence after the label is right down to the promise that the reason is broadcast and the instruction to file a reject_assign',
    { captured: captured.length, matched, bad })
}

console.log('=== 2. THE NUDGE, with its optional suggestion handled the way the corpus does ===')
{
  const captured = pick('【督办 from')
  ok(captured.length >= 1, 'the corpus carries nudge notices', { count: captured.length })
  let matched = 0
  const bad = []
  for (const line of captured) {
    const m = /^【督办 from (.+?)】(.+?)督办：(.+?)(?:｜建议的下一步：(.+))?$/.exec(line)
    if (!m) { bad.push(line.slice(0, 60)); continue }
    const mine = nudgeNotice({ by: m[1], byLabel: m[2], why: m[3], nextStep: m[4] })
    if (mine === line) matched += 1
    else bad.push(line.slice(0, 60))
  }
  ok(matched === captured.length,
    'every captured nudge is reproduced, INCLUDING the one with no suggestion: the suggestion is optional in the source, so requiring it would refuse a notice the original really sends',
    { captured: captured.length, matched, bad })
}

console.log('=== 3. THE CHAT RELAY AND THE OFFICE NOTICE ===')
{
  const chats = pick('【研究所·群聊】')
  const offices = pick('【所办通知】')
  ok(chats.length >= 1 && offices.length >= 1, 'the corpus carries both', { chats: chats.length, offices: offices.length })
  const chatOk = chats.every((l) => {
    const m = /^【研究所·群聊】(.+?)：(.+)$/.exec(l)
    return m && chatNotice({ member: m[1], text: m[2] }) === l
  })
  const officeOk = offices.every((l) => {
    const m = /^【所办通知】(.+)$/.exec(l)
    return m && officeNotice({ text: m[1] }) === l
  })
  ok(chatOk, 'a relayed chat line is reproduced exactly')
  ok(officeOk, 'an office notice is reproduced exactly, heading and all')
}

console.log('=== 4. A MISSING FIELD IS REFUSED BY NAME, never rendered as a hole ===')
{
  let err = null
  try { assignmentNotice({ assignerLabel: '所办', taskId: 't-1' }) } catch (e) { err = e }
  ok(err !== null && err.code === 'VMU_INVALID_ARGUMENT' && /title/.test(err.message),
    'an assignment notice missing its title refuses and NAMES the field, because a model reading "任务 t-1「undefined」" is worse than a refusal',
    { code: err && err.code })
  let kindErr = null
  try { formatNotice('nope', {}) } catch (e) { kindErr = e }
  ok(kindErr !== null && kindErr.code === 'VMU_INVALID_ARGUMENT',
    'an unknown notice kind is refused rather than guessed', { code: kindErr && kindErr.code })
  ok(Object.keys(NOTICE_SHAPES).length === 4, 'the four shapes are the four the corpus carries', { shapes: Object.keys(NOTICE_SHAPES) })
}

console.log('=== 5. THE INBOX BLOCK: the header, the indentation and the blank line, exactly as the corpus writes them ===')
{
  // Twenty of the sixty-seven captured prompts begin with this block, a third of the corpus, and it cannot be measured
  // by the assembly comparison at all: the header line is shorter than the comparison's minimum length and the notice
  // bodies are data rather than prose. Its SHAPE is what has to be right, so it is asserted here.
  const captured = PROMPTS.map((p) => String(p.text || '')).filter((t) => t.startsWith(INBOX_HEADER))
  ok(captured.length >= 10, 'a third of the corpus begins with the inbox header', { count: captured.length })
  const sample = captured[0]
  const lines = sample.split('\n')
  ok(lines[0] === INBOX_HEADER, 'the block starts with the header on its own line')
  const indented = lines.slice(1).filter((l) => l.startsWith('  '))
  ok(indented.length >= 1, 'the notices under it are INDENTED by two spaces, which is what separates what the framework is telling the member from what the round is asking', { indented: indented.length })
  const firstNonEmptyAfter = lines.slice(1).find((l) => l.trim() !== '' && !l.startsWith('  '))
  ok(typeof firstNonEmptyAfter === 'string' && firstNonEmptyAfter.startsWith('【第'),
    'and the ordinary round heading follows the block, so the block sits ABOVE the round rather than inside its status',
    { next: String(firstNonEmptyAfter).slice(0, 30) })
  const mine = inboxBlock(['【研究所提示】demo 未生效（V5_DEMO）：x'])
  ok(mine === INBOX_HEADER + '\n  【研究所提示】demo 未生效（V5_DEMO）：x\n',
    'our renderer produces exactly that shape: header, indented line, trailing blank line',
    { mine: JSON.stringify(mine) })
  ok(inboxBlock([]) === '', 'and an empty queue renders NOTHING rather than a bare header, so a round with no news looks like a round with no news')
}

console.log('=== NOTICE SHAPES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exit(1) }
