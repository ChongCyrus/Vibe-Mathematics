// TB-2716 — the RUN 76 prompt sync, held as a machine check against the REAL assembled text.
//
// The rule this file enforces: every "改后原文" cell in §16 of docs/acceptance/prompt-vs-receipts.md must be a
// sentence a seat actually reads (harness assembly, or the kernel prompt pipeline for the pack-declared paper
// phases). Historical sentences are allowed to stay in the document only when the line labels them as 旧句
// ("旧", "RUN 75", or a pointer to §16.1), so the table cannot quietly keep teaching a retired wording.
//
// The two anti-lamps at the bottom prove this criterion CAN fail: re-inserting the retired parked sentence, or
// deleting the §16.1 record, must turn the document checks red on a copy of the doc.
import { mkdtempSync } from 'node:fs'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const DOC = process.env.VMU_DOC_PROMPT_SYNC_DOC || join(REPO, 'docs', 'acceptance', 'prompt-vs-receipts.md')
const PROBLEM = '$a^2+b^2\\\\ge 2ab$（占位题，只作象征，不要真解）'

let passed = 0
const fails = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; return }
  fails.push({ label, detail })
  console.log('FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
}

// ── the five real assemblies ────────────────────────────────────────────────────────────────────────────────
const H = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'harness.mjs')).href)
const root = mkdtempSync(join(tmpdir(), 'tb2716-test-'))
const h = await H.boot({ root, clock: () => Date.parse('2026-11-10T00:00:00.000Z'), withPrompt: true, settings: { 'vmu.turn.objective': PROBLEM } })
await h.call('vibe_v5_start', { researcherCount: 3, problem: PROBLEM })
const convened = await h.call('vibe_v5_meeting', { member: 'r-acad', agenda: ['确认命题'], title: 'TB-2716 sync evidence meeting', type: 'ordinary' })
const MID = String(convened.meeting || convened.id || '')
const chairNormal = String(await h.prompts.assembleFor({ seat: 'chair', phase: 'normal' }))
const memberNormal = String(await h.prompts.assembleFor({ seat: 'member', phase: 'normal' }))
ok(chairNormal.length > 20000, '§0 chair-normal assembly is a full prompt', chairNormal.length)
ok(memberNormal.length > 20000, '§0 member-normal assembly is a full prompt', memberNormal.length)

const { PACK } = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'prompts', 'v5r-core.js')).href)
const { collectPackSections } = await import(pathToFileURL(join(VMU, 'kernel', 'pack.js')).href)
const { createPromptPipeline } = await import(pathToFileURL(join(VMU, 'kernel', 'prompt', 'index.js')).href)
const { promptSettings } = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'settings.mjs')).href)
const pipeline = createPromptPipeline({ sections: collectPackSections([PACK]), bindings: PACK.bindings, clock: () => '2026-11-10T00:00:00.000Z' })
const roster = 'r-acad (院士), r-1 (常驻研究员)'
const settings = promptSettings({ 'vmu.turn.objective': PROBLEM })
const assemblePaper = async (phase, role, roleLabel) => String((await pipeline.assemble({ settings, member: 'r-1', role, roleLabel, phase, round: 3, roster, quorum: 2 })).text || '')
const paperReview = await assemblePaper('paper-review', 'member', '常驻研究员')
const paperFinal = await assemblePaper('paper-final', 'chair', '院士')
const paperWrite = await assemblePaper('paper-write', 'member', '常驻研究员')
ok(paperReview.includes('三步取料'), '§0 paper-review assembly carries the review guide', paperReview.length)
ok(paperFinal.length > 20000, '§0 paper-final assembly is a full prompt', paperFinal.length)

const TEXTS = [
  ['chair-normal', chairNormal],
  ['member-normal', memberNormal],
  ['paper-review', paperReview],
  ['paper-final', paperFinal],
  ['paper-write', paperWrite],
]

// ── parse + check the §16 table ─────────────────────────────────────────────────────────────────────────────
const unescapeCell = (cell) => String(cell).replace(/\\`/g, '`').trim()

function tableRows(text) {
  const lines = text.split('\n')
  const head = lines.findIndex((l) => l.startsWith('| 编号 |'))
  if (head < 0) return []
  const rows = []
  for (let i = head + 1; i < lines.length; i += 1) {
    const l = lines[i]
    if (!l.startsWith('|')) break
    if (/^\|\s*-{2,}/.test(l)) continue
    const cells = l.split('|').slice(1, -1).map((c) => c.trim())
    rows.push(cells)
  }
  return rows
}

function checkDoc(text) {
  const local = []
  const fail = (label, detail) => local.push({ label, detail })
  const rows = tableRows(text)
  // twelve numbered rows plus the F75-03 row that opens the table
  if (rows.length !== 13) fail('§16 the table still has thirteen rows', rows.length)
  const body = rows.map((cells) => cells[3] || '')
  const ids = rows.map((cells, i) => String(cells[0] || String(i + 1)))
  for (let i = 0; i < body.length; i += 1) {
    const raw = unescapeCell(body[i])
    // REJECTED rows carry no taught sentence: "—（不改提示词）" / "—（旧句作为 … 引用保留）"
    if (raw.startsWith('—')) continue
    if (!raw) { fail('§16 row ' + ids[i] + ' has a quoted sentence', body[i]); continue }
    const needle = raw.replace(/^`+/, '').replace(/`+$/, '')
    const segments = needle.includes('…') ? needle.split('…').map((s) => unescapeCell(s)).filter((s) => s.length > 0) : [needle]
    const hit = segments.every((seg) => TEXTS.some(([, t]) => t.includes(seg)))
    if (!hit) fail('§16 row ' + ids[i] + ' quote is a sentence a seat really reads', needle)
  }
  // The retired parked sentence may only survive on a line that labels it as historical. Fenced blocks are
  // skipped: §16.1 quotes the anti-lamp red line verbatim, and a red line must not be rewritten to pass.
  let inFence = false
  for (const line of text.split('\n')) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue }
    if (inFence) continue
    if (!line.includes('VMU_TURN_PARKED_NEEDS_OWNER')) continue
    const labelled = line.includes('旧') || line.includes('RUN 75') || line.includes('§16.1') || line.includes('reply 无 parked')
    if (!labelled) fail('§16 a retired sentence must be labelled 旧句 / RUN 75 / §16.1', line.slice(0, 160))
  }
  // §16.1 record exists and names the four changes.
  const idx = text.indexOf('### RUN 76 同步记录')
  if (idx < 0) fail('§16.1 the RUN 76 sync record exists')
  else {
    const record = text.slice(idx, idx + 6000)
    for (const k of ['TB-2710', 'TB-2711', 'VMU_TURN_ALREADY_PARKED', '审阅对象：', 'part recordId', '读数｜来源｜取值时刻', '无现行版（rev 0，md 未落盘）', '无未结算行', 'vote_solved', 'set_solved']) {
      if (!record.includes(k)) fail('§16.1 record names ' + k, k)
    }
  }
  return local
}

const docText = readFileSync(DOC, 'utf8')
const docFails = checkDoc(docText)
for (const f of docFails) { fails.push(f); console.log('FAIL ' + f.label + (f.detail === undefined ? '' : ' :: ' + JSON.stringify(f.detail))) }
if (docFails.length === 0) passed += 1
ok(!/\r/.test(docText), '§16 the document is LF-only')

// §16.1 must also carry the two anti-lamp red lines once they have been measured (Lead asked for the red text
// to be quoted in the record, not only in this file).
if (docText.includes('### RUN 76 同步记录')) {
  const record = docText.slice(docText.indexOf('### RUN 76 同步记录'), docText.indexOf('## §17'))
  ok(record.includes('反关灯') && (record.includes('换回旧句') || record.includes('删掉本节')), '§16.1 quotes the two anti-lamp red lines')
  ok((record.match(/\n/g) || []).length <= 24, '§16.1 stays within ~20 lines', (record.match(/\n/g) || []).length)
}

// ── anti-lamps: the same document checks MUST go red on a doctored copy ─────────────────────────────────────
const tmpDoc = (name, text) => {
  const p = join(mkdtempSync(join(tmpdir(), 'tb2716-doc-')), name)
  writeFileSync(p, text, 'utf8')
  return p
}

// (a) re-insert the retired parked sentence into row 8
const oldParked = '上一回合**未答**（parked）时再派同一席＝具名拒 `VMU_TURN_PARKED_NEEDS_OWNER`；顺序：同席位先答 → 答不了就 `op:"abandon"`（带 turn、why）→ 再派。'
const lines0 = docText.split('\n')
// find row 8 INSIDE the §16 table (the doc has other tables whose rows also start with "| 8 |")
const head0 = lines0.findIndex((l) => l.startsWith('| 编号 |'))
const row8 = lines0.findIndex((l, i) => i > head0 && l.startsWith('| 8 '))
const cells8 = lines0[row8].split('|')
cells8[4] = ' `' + oldParked.replace(/`/g, '\\`') + '` '
lines0[row8] = cells8.join('|')
const doctored = lines0.join('\n')
const redA = checkDoc(doctored)
const redALabels = redA.map((f) => f.label).join(' ; ')
ok(redA.length > 0, 'ANTI-LAMP A: putting the retired parked sentence back turns §16 red', redALabels)
if (redA.length > 0) console.log('RED A :: ' + redA[0].label + ' :: ' + JSON.stringify(redA[0].detail))

// (b) delete the §16.1 record (from the pristine doc, so only the deletion is under test)
const at = docText.indexOf('### RUN 76 同步记录')
const end = docText.indexOf('## §17')
const cut = at >= 0 && end > at ? docText.slice(0, at) + docText.slice(end) : docText.replace('### RUN 76 同步记录', '### RUN 76 同步记录（已删除）')
const redB = checkDoc(cut)
const redBLabels = redB.map((f) => f.label).join(' ; ')
ok(redB.length > 0, 'ANTI-LAMP B: deleting the §16.1 record turns §16 red', redBLabels)
if (redB.length > 0) console.log('RED B :: ' + redB[0].label)

// ── summary ─────────────────────────────────────────────────────────────────────────────────────────────────
ok(process.env.VMU_DOC_PROMPT_SYNC_DOC === undefined || DOC !== join(REPO, 'docs', 'acceptance', 'prompt-vs-receipts.md'), 'the doc path is overridable for the anti-lamps')
if (fails.length === 0) {
  console.log(`=== PROMPT-SYNC: ${passed} passed, 0 failed ===`)
} else {
  console.log(`=== PROMPT-SYNC: ${passed} passed, ${fails.length} failed ===`)
  process.exitCode = 1
}
