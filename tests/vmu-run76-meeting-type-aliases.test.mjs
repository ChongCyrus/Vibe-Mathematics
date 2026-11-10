// TB-2715 / RUN 76 (FEEDBACK63 ①6 / C18): 会议类型的中文别名与英文 id 等价。
//
// THE DEFECT THIS PINS (measured on the real machine, not inferred): the chair convened with `type:"结题"` — the WORD
// the rule document and the taskbook use — and the pack face refused it `VMU_INVALID_ARGUMENT`, hint listing six
// English ids; the same call with `type:"closure"` succeeded. The vocabulary lives in the pack (D5), so the pack is
// where an accepted INPUT word must be resolved.
//
// WHAT THIS SUITE PROVES:
//   ① all six Chinese labels (正常会议/学术交流/辩论/结题/论文交流/未来规划策划) CONVENE, and the receipt's `type` is the
//      canonical English id with `typeMatchedBy:"alias"` and `typeInput` holding the word the caller actually used;
//   ② the English ids still work and say `typeMatchedBy:"id"`; no type at all says `"default"` and `typeInput:null`;
//   ③ the alias never becomes the stored type: summary()/meetingView() read back the id (one vocabulary downstream);
//   ④ an unknown word is refused BY NAME and the hint carries 「id（中文标签；别名…）」 pairs, not only English;
//   ⑤ `action:"types"` lists the accepted aliases next to each label (discoverable, not something to memorise);
//   ⑥ anti-lamp-off ×3, each booting a REAL COPY with ONE mutation: (a) the alias table cleared ⇒ the alias convene is
//      refused; (b) `type` echoed from the input ⇒ the receipt carries 结题 instead of closure; (c) the hint reduced to
//      English only ⇒ no pair list. Each mutation must turn its assertion RED, and the unmutated tree green.
//
// WHAT IT DOES NOT PROVE: it does not prove a model USES the Chinese word (a real-machine question), and it does not
// widen the vocabulary: an alias that is not in the pack's table is still unknown.

// fs-purpose: copy the whole entry tree three times so each mutation boots real modules without touching the working tree
import { cpSync, existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const entry = await import(ENTRY)
const proc = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'meeting-procedures.js')).href)

const bootWith = async (entryUrl, config) => {
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (s) => { specs.push(s); return () => {} } },
  }
  const e = await import(entryUrl)
  const handle = e.apply(ctx, Object.assign({ clock: () => 1_800_000_000_000, packs: ['v5r'] }, config))
  await handle.ready()
  return { handle, specs, specOf: (n) => specs.find((s) => s.name === n) }
}
const boot = (config) => bootWith(ENTRY, config)
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

const TMP_ROOT = process.env.VMU_TEST_TMP_ROOT || (existsSync('D:/_tmp') ? 'D:/_tmp' : tmpdir())
const root = await mkdtemp(join(TMP_ROOT, 'vmu-run76-alias-'))
let mutatedRoot = null
try {
  // ── ① 六个中文标签逐个开会 ────────────────────────────────────────────────────────────────────────────────
  console.log('=== 1. THE SIX CHINESE LABELS CONVENE (the rule\'s own words are legal input) ===')
  const b = await boot({ root })
  const kernel = b.handle.kernel
  await kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  const SIX = [
    ['正常会议', 'ordinary'],
    ['学术交流', 'academic'],
    ['辩论', 'debate'],
    ['结题', 'closure'],
    ['论文交流', 'paper'],
    ['未来规划策划', 'planning'],
  ]
  const convened = {}
  for (const [word, id] of SIX) {
    // 辩论额外要求「辩论对象」；file-ref 形态是 pack 允许的一种（subject_evidence.file 自报 readable+bytes）
    const extra = id === 'debate'
      ? { subject: 'Shared/Protocol.md', subject_evidence: { file: { readable: true, bytes: 1024, name: 'Shared/Protocol.md' } } }
      : {}
    const r = await call(b, 'vibe_v5_meeting', Object.assign({ member: 'r-acad', agenda: '别名开会：' + word, type: word }, extra))
    convened[id] = { word, r }
    ok(r.parsed && r.parsed.ok === true,
      '★ 中文输入「' + word + '」能开会（旧行为：VMU_INVALID_ARGUMENT）', r.parsed && (r.parsed.code || r.parsed.message))
    ok(r.parsed && r.parsed.type === id,
      '★ 回执 type 是英文 id（「' + word + '」⇒ ' + id + '），别名不成为存储的 type', r.parsed && r.parsed.type)
    ok(r.parsed && r.parsed.typeInput === word,
      '★ 回执 typeInput 保留调用者原文（' + word + '）', r.parsed && r.parsed.typeInput)
    ok(r.parsed && r.parsed.typeMatchedBy === 'alias',
      '★ 回执 typeMatchedBy==="alias"（说明走的是别名门）', r.parsed && r.parsed.typeMatchedBy)
    ok(r.parsed && typeof r.parsed.typeMatchedByMeans === 'string' && r.parsed.typeMatchedByMeans.length > 20,
      '回执用一句话解释命中门（不是只留一个枚举值）', r.parsed && r.parsed.typeMatchedByMeans)
  }
  // 归一后的 type 真的进了内核：summary/meetingView 读回 id（下游只有一个词汇表）
  for (const [word, id] of SIX) {
    const mid = convened[id].r.parsed && convened[id].r.parsed.meeting
    const sum = mid ? kernel.meetings.summary({ meeting: mid }) : null
    ok(!!sum && sum.type === id,
      '★ 「' + word + '」开的会，内核 summary().type 仍是 id（别名不落库）', sum && sum.type)
  }
  // 空白与斜杠容忍（同一条归一规则）
  const spaced = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: '规划会', type: ' 未来规划 / 策划 ' })
  ok(spaced.parsed && spaced.parsed.ok === true && spaced.parsed.type === 'planning' && spaced.parsed.typeMatchedBy === 'alias',
    '★ 空白与「/」容忍：「 未来规划 / 策划 」⇒ planning', spaced.parsed && (spaced.parsed.type + '/' + spaced.parsed.typeMatchedBy))

  // ── ② 英文 id 仍是 id 门；不传 type 是 default 门 ──────────────────────────────────────────────────────────
  console.log('=== 2. THE OLD SPELLINGS KEEP THEIR OLD MEANING ===')
  const byId = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: '英文 id', type: 'closure' })
  ok(byId.parsed && byId.parsed.ok === true && byId.parsed.type === 'closure' && byId.parsed.typeMatchedBy === 'id',
    '★ 英文 id 仍走 id 门（typeMatchedBy==="id"）', byId.parsed && byId.parsed.typeMatchedBy)
  ok(byId.parsed && byId.parsed.typeInput === 'closure', 'typeInput 是调用者原文', byId.parsed && byId.parsed.typeInput)
  const noType = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: '不写类型' })
  ok(noType.parsed && noType.parsed.ok === true && noType.parsed.type === 'ordinary' && noType.parsed.typeMatchedBy === 'default',
    '★ 不传 type ⇒ ordinary 且 typeMatchedBy==="default"（诚实说明是约定缺省，不是命中的词）', noType.parsed && noType.parsed.typeMatchedBy)
  ok(noType.parsed && noType.parsed.typeInput === null, '不传 type 时 typeInput 为 null（不伪造一个原文）', noType.parsed && noType.parsed.typeInput)

  // ── ③ 未知词：具名拒 + 「id（中文标签；别名…）」成对清单 ──────────────────────────────────────────────────
  console.log('=== 3. AN UNKNOWN WORD IS REFUSED BY NAME, AND THE HINT SPEAKS THE PAIR LIST ===')
  const bad = await call(b, 'vibe_v5_meeting', { member: 'r-acad', agenda: 'x', type: 'weekly-sync' })
  ok(bad.parsed && bad.parsed.ok === false && bad.parsed.code === 'VMU_INVALID_ARGUMENT',
    '未知词仍具名拒 VMU_INVALID_ARGUMENT', bad.parsed && bad.parsed.code)
  const hint = String((bad.parsed && bad.parsed.hint) || '')
  ok(/closure（结题/.test(hint), '★ hint 里至少有一个「id（中文标签」成对项（closure（结题）', hint.slice(0, 160))
  ok(/planning（未来规划\/策划/.test(hint), '★ hint 的成对清单点名 planning 的标签（未来规划/策划）', hint.slice(0, 160))
  ok(/ordinary, academic, debate/.test(hint), '英文 id 清单仍在（老读者不被抛下）', hint.slice(0, 120))
  ok(hint.split('、').length >= 6, 'hint 的成对清单覆盖六型（不是只列一两个）', hint.split('、').length)

  // ── ④ 目录读面把「接受的输入」摆在标签旁边 ────────────────────────────────────────────────────────────────
  console.log('=== 4. action:"types" LISTS THE ACCEPTED ALIASES NEXT TO EACH LABEL ===')
  const types = await call(b, 'vibe_v5_meeting', { action: 'types' })
  const rows = types.parsed && Array.isArray(types.parsed.types) ? types.parsed.types : []
  ok(rows.length === 6, 'types 仍只报六型（别名不冒充第七型）', rows.length)
  const closureRow = rows.find((t) => t.type === 'closure')
  ok(!!closureRow && Array.isArray(closureRow.aliases) && closureRow.aliases.includes('结题'),
    '★ closure 行带 aliases，且含「结题」', closureRow && closureRow.aliases)
  const planningRow = rows.find((t) => t.type === 'planning')
  ok(!!planningRow && Array.isArray(planningRow.aliases) && planningRow.aliases.includes('规划'),
    '★ planning 行带 aliases（规划）', planningRow && planningRow.aliases)
  ok(rows.length > 0 && rows.every((t) => Array.isArray(t.aliases)), '每行都有 aliases 数组（空表也是数组，不是缺键）', rows.map((t) => [t.type, Array.isArray(t.aliases)]))

  // ── ⑤ 反关灯 ×3：真实装 + 单点突变，每个突变都必须把断言弄红 ────────────────────────────────────────────────
  console.log('=== 5. ANTI-LAMP-OFF: THREE REAL-COPY MUTANTS, EACH MUST TURN ITS ASSERTION RED ===')
  const MUT_ROOT = await mkdtemp(join(TMP_ROOT, 'vmu-run76-alias-mut-'))
  mutatedRoot = MUT_ROOT
  const copyTree = async (tag) => {
    const dir = join(MUT_ROOT, tag, 'vibe-math-vmu')
    cpSync(join(REPO, 'vibe-math-vmu'), dir, { recursive: true })
    return dir
  }
  const bootCopy = (dir, tag) => bootWith(pathToFileURL(join(dir, 'vibe-math-vmu.js')).href, { root: join(MUT_ROOT, tag, 'root') })
  const aliasProbe = async (bCopy) => {
    const k = bCopy.handle.kernel
    await k.members.hire({ id: 'm-acad', slot: 'chair' })
    await k.members.hire({ id: 'm-1', slot: 'member' })
    const r = await call(bCopy, 'vibe_v5_meeting', { member: 'm-acad', agenda: '突变探针', type: '结题' })
    const badR = await call(bCopy, 'vibe_v5_meeting', { member: 'm-acad', agenda: 'x', type: 'weekly-sync' })
    const idR = await call(bCopy, 'vibe_v5_meeting', { member: 'm-acad', agenda: '英文', type: 'closure' })
    return {
      aliasOk: !!(r.parsed && r.parsed.ok === true),
      aliasType: r.parsed ? r.parsed.type : null,
      aliasMatchedBy: r.parsed ? r.parsed.typeMatchedBy : null,
      idOk: !!(idR.parsed && idR.parsed.ok === true),
      hint: String((badR.parsed && badR.parsed.hint) || ''),
    }
  }
  // 正控：未突变的拷贝必须绿（否则「突变导致红」证明不了任何事）
  const clean = await copyTree('clean')
  const cleanProbe = await aliasProbe(await bootCopy(clean, 'clean'))
  ok(cleanProbe.aliasOk && cleanProbe.aliasType === 'closure' && cleanProbe.aliasMatchedBy === 'alias',
    '★ 正控：未突变拷贝上「结题」照常开会（closure/alias）', cleanProbe)
  ok(cleanProbe.idOk, '★ 正控：未突变拷贝上英文 id 仍可用（对照突变只打别名门）', cleanProbe)

  // 突变 (a)：清空别名表 ⇒ 中文词必须被拒
  const mutA = await copyTree('a')
  const procPathA = join(mutA, 'packs', 'v5r', 'meeting-procedures.js')
  const srcA = await readFile(procPathA, 'utf8')
  const aliasLoop = 'for (const a of aliases) ALIAS_TO_ID.set(normalizeTypeWord(a), id)'
  ok(srcA.includes(aliasLoop), '突变 (a) 的锚点在真实源码里（patch 失败不能是静默 no-op）', aliasLoop)
  await writeFile(procPathA, srcA.replace(aliasLoop, 'void aliases; void id'))
  const probeA = await aliasProbe(await bootCopy(mutA, 'a'))
  ok(probeA.aliasOk === false, '★★ 反关灯 (a)：清空别名表后「结题」被拒 —— 别名真的来自那张表', probeA)
  ok(probeA.idOk === true, '★★ 反关灯 (a) 对照：英文 id 不受影响（突变只打别名门）', probeA)

  // 突变 (b)：把回执的 type 回显成调用者原文 ⇒ 别名必须泄漏成 stored type
  const mutB = await copyTree('b')
  const toolsPathB = join(mutB, 'packs', 'v5r', 'tools.js')
  const srcB = await readFile(toolsPathB, 'utf8')
  const receiptLine = '    type, subject: opened && opened.subject !== undefined ? opened.subject : null,'
  ok(srcB.includes(receiptLine), '突变 (b) 的锚点在 convene 回执里', receiptLine.slice(0, 40))
  await writeFile(toolsPathB, srcB.replace(receiptLine,
    '    type: (typeInput === null ? type : typeInput), subject: opened && opened.subject !== undefined ? opened.subject : null,'))
  const probeB = await aliasProbe(await bootCopy(mutB, 'b'))
  ok(probeB.aliasOk === true && probeB.aliasType === '结题', '★★ 反关灯 (b)：把输入原文当 type 回显时，回执变成「结题」—— 断言 type===closure 会红', probeB)

  // 突变 (c)：未命中 hint 只列英文 ⇒ 成对清单断言必须红
  const mutC = await copyTree('c')
  const toolsPathC = join(mutC, 'packs', 'v5r', 'tools.js')
  const srcC = await readFile(toolsPathC, 'utf8')
  const pairPart = "' — with Chinese aliases: ' + meetingTypePairs()"
  ok(srcC.includes(pairPart), '突变 (c) 的锚点是 hint 的成对清单', pairPart)
  await writeFile(toolsPathC, srcC.replace(pairPart, "''"))
  const probeC = await aliasProbe(await bootCopy(mutC, 'c'))
  ok(!/closure（结题/.test(probeC.hint), '★★ 反关灯 (c)：hint 只剩英文时，成对清单断言必红', probeC.hint.slice(0, 120))
  ok(probeC.aliasOk === true, '★★ 反关灯 (c) 对照：解析本身不受影响（只打提示面）', probeC)

  // ── ⑥ 目录/显示标签的既有契约没有被别名改造碰过 ──────────────────────────────────────────────────────────
  console.log('=== 6. THE DISPLAY LABELS ARE UNTOUCHED (alias is input, label is display) ===')
  const RULE_LABELS = ['正常会议', '学术交流', '辩论', '结题', '论文交流', '未来规划策划']
  const norm = (x) => String(x).replace(/[\s\/／]/g, '')
  ok(JSON.stringify(proc.MEETING_TYPES.map((t) => norm(t.label))) === JSON.stringify(RULE_LABELS),
    '★★ 六型显示标签仍是规则原文、按序（别名改造没有动 label）', proc.MEETING_TYPES.map((t) => t.label))
  ok(proc.MEETING_TYPE_ALIASES && Object.keys(proc.MEETING_TYPE_ALIASES).length === 6,
    '别名表与六型一一对应（没有第七型借别名混进来）', proc.MEETING_TYPE_ALIASES && Object.keys(proc.MEETING_TYPE_ALIASES))
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  if (mutatedRoot !== null) await rm(mutatedRoot, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }).catch(() => {})
}

console.log('')
if (failed === 0) {
  console.log('=== VMU RUN76 MEETING TYPE ALIASES: ' + passed + ' passed, 0 failed ===')
} else {
  console.log('=== VMU RUN76 MEETING TYPE ALIASES: ' + passed + ' passed, ' + failed + ' failed ===')
  console.log('FAILURES:')
  for (const f of failures) console.log('  · ' + f)
  process.exitCode = 1
}
