// tests/vmu-run2691-read-faces.test.mjs — TB-2691 / task-174: 读数面只说实话（四条：F75-11 / F75-13 / F75-15 / F75-09）。
//
// 本文件按 taskbook 的「外部源判定」写法组织：每一个 § 都用**工具面回执**当证据，不读被测代码的中间变量；
// 反关灯（§C3/§A3 等）用「删掉默认注入后判据必须变红」的方式取证，取证输出写进验收报告，不在测试里自我修改源码。
//
// 本套件先落 B（F75-13）：office 在 run 75 只能跳到 `vibe_vmu_mailbox {action:"status"}` 才能读到
// 「所有箱子里还有多少行欠 ack」，`vibe_v5_inbox {action:"list"}` 只有 count/rows —— 同一件事两张面给出不同答案。
// 修法（已验证）：`noticeBlockOf(per)` 是唯一生产者，status().notice 与 list().notice 返回同一个块；
// 包侧的 inbox list 只**原样转发**这个块（没有第二次求和）。
//
// Run: node tests/vmu-run2691-read-faces.test.mjs   (targeted only)
import { mkdtemp, readFile, rm, writeFile, appendFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const MAILBOX_SRC_PATH = join(REPO, 'vibe-math-vmu', 'kernel', 'mailbox.js')
const PACK_TOOLS_PATH = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const LATEX_SRC_PATH = join(REPO, 'vibe-math-vmu', 'kernel', 'latex.js')
const KIT_PAPER_PATH = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  return false
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const waitFor = async (pred, ms = 4000) => {
  const end = Date.now() + ms
  while (Date.now() < end) { if (pred()) return true; await sleep(5) }
  return !!pred()
}

let NOW = 1700000000000
const entry = await import(pathToFileURL(ENTRY).href)
const MAILBOX_SRC = await readFile(MAILBOX_SRC_PATH, 'utf8')
const PACK_TOOLS_SRC = await readFile(PACK_TOOLS_PATH, 'utf8')

const boot = async (root, config = {}) => {
  const state = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { state.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
    // §C needs the kernel's REAL latex face (its pdfReading hashes a disk file). The entry constructs the face only
    // when a host-spawn seam can be built, and that seam is built only when the context can carry services — so the
    // boot answers "no service", and the seam refuses runs by name (this suite never runs LaTeX).
    get() { return null },
  }
  const handle = entry.apply(ctx, Object.assign({ root, clock: () => NOW }, config))
  await handle.ready()
  const specOf = (n) => state.specs.find((s) => s.name === n)
  return {
    handle, state, kernel: handle.kernel, specOf,
    async call(name, args = {}) {
      const spec = specOf(name)
      if (!spec) return { missing: true }
      const raw = await spec.execute(args, {})
      try { return { raw, parsed: JSON.parse(raw) } } catch { return { raw, parsed: undefined } }
    },
  }
}
const closeBoot = async (b) => {
  if (!b) return
  if (typeof b.handle.cleanups === 'function') await b.handle.cleanups()
  else if (typeof b.handle.close === 'function') await b.handle.close()
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: true }
  const raw = await spec.execute(args, {})
  try { return { raw, parsed: JSON.parse(raw) } } catch { return { raw, parsed: undefined } }
}

const root = await mkdtemp(join(__tmpRoot(), 'vmu-run2691-read-faces-'))
let b = null
try {
  b = await boot(root, { packs: ['v5r'] })
  const kernel = b.kernel
  await kernel.members.hire({ id: 'r-boss', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })

  // ── 0. 单一生产者：这个块只能由 noticeBlockOf 产出，包侧只转发 ────────────────────────────────────────
  console.log('\n=== 0. 单一生产者：noticeBlockOf 唯一派生点；包侧 inbox list 不重算 ===')
  const refs = (MAILBOX_SRC.match(/noticeBlockOf\(/g) || []).length
  ok(refs >= 3, '★★ 内核 noticeBlockOf 被 status 与 list 共用（定义 + 2 调用点，>= 3）', refs)
  ok(/const noticeBlockOf\s*=/.test(MAILBOX_SRC), '★ 块由具名 noticeBlockOf 产出，不在调用点内联复制', /const noticeBlockOf/.test(MAILBOX_SRC))
  ok(/const notice = r && r\.notice/.test(PACK_TOOLS_SRC), '★★ 包侧 inbox list 原样转发 r.notice（不重建块）', /const notice = r/.test(PACK_TOOLS_SRC))
  ok(!/unackedRowsAllBoxes\s*[+]/.test(PACK_TOOLS_SRC), '★★ 包侧没有对 unackedRowsAllBoxes 的第二次求和', /unackedRowsAllBoxes/.test(PACK_TOOLS_SRC))

  // ── 1. 同一时刻两张面给出同一个读数（真实 run 75 是 27 行）────────────────────────────────────────
  console.log('\n=== 1. inbox list 与 mailbox status 的 all-boxes 读数一致（27 行夹具）===')
  const ids = []
  for (let i = 1; i <= 27; i += 1) {
    const sent = await b.call('vibe_vmu_mailbox', { action: 'send', from: 'r-boss', to: 'r-2', subject: 'F75-13 probe ' + i, text: 'RUN2691 F75-13 夹具第 ' + i + ' 封。' })
    const p = sent && sent.parsed
    ok(p && p.ok === true && Array.isArray(p.ids) && p.ids.length === 1, '前置：第 ' + i + ' 封 mail 入箱并回 id', p && { ok: p.ok, ids: p.ids })
    if (p && p.ids && p.ids[0]) ids.push(p.ids[0])
  }
  ok(ids.length === 27, '前置：27 个 mail id 全部拿到', ids.length)

  const st = await b.call('vibe_vmu_mailbox', { action: 'status' })
  const stp = st && st.parsed
  const stNotice = stp && stp.notice
  ok(stNotice && stNotice.unackedRowsAllBoxes === 27, '★★★ status().notice.unackedRowsAllBoxes === 27（真实 run 75 的行数）', stNotice && stNotice.unackedRowsAllBoxes)

  const inb = await b.call('vibe_v5_inbox', { action: 'list', member: 'r-2' })
  const inbp = inb && inb.parsed
  ok(inbp && inbp.ok === true && inbp.notice !== undefined && inbp.notice !== null, '★★★ inbox list 回执带 notice 块（修前为 undefined）', inbp && { ok: inbp.ok, keys: inbp && Object.keys(inbp) })
  const inbNotice = inbp && inbp.notice
  ok(inbNotice && inbNotice.unackedRowsAllBoxes === 27, '★★★ inbox list 的 unackedRowsAllBoxes === 27（与 status 同数）', inbNotice && inbNotice.unackedRowsAllBoxes)
  ok(inbNotice && stNotice && Object.keys(inbNotice).length > 0 && Object.keys(stNotice).length > 0 && JSON.stringify(inbNotice) === JSON.stringify(stNotice), '★★★ 两张面的 notice 块逐字节相等（同一生产者、同一 asOf）', { st: stNotice, inb: inbNotice })
  const sum = stNotice && stNotice.perBox ? Object.values(stNotice.perBox).reduce((a, n) => a + Number(n || 0), 0) : -1
  ok(sum === stNotice.unackedRowsAllBoxes, '★★ perBox 独立求和 === unackedRowsAllBoxes（27）', { sum, total: stNotice && stNotice.unackedRowsAllBoxes })
  ok(stNotice && stNotice.asOf === NOW && stNotice.asOfSource === 'mailbox.boxes() of this kernel instance, after pullShared', '★ asOf 是这一块自己的时钟读数，asOfSource 具名来源', stNotice && { asOf: stNotice.asOf, asOfSource: stNotice.asOfSource })
  ok(stNotice && typeof stNotice.means === 'string' && stNotice.means.includes('ALL-BOXES'), '★ means 仍点名 ALL-BOXES（读数没被改名）', stNotice && stNotice.means)

  // ── 2. ack 一行：两张面同减 1（真实 run 75 为 27→26）───────────────────────────────────────────────
  console.log('\n=== 2. ack 一行后两张面同时 27→26 ===')
  const ack = await b.call('vibe_vmu_mailbox', { action: 'ack', member: 'r-2', ids: [ids[0]] })
  const ackp = ack && ack.parsed
  ok(ackp && ackp.ok === true, '前置：ack 一行成功', ackp && { ok: ackp.ok, code: ackp.code })
  const dropped = await waitFor(() => {
    return kernel.mailbox.status().notice.unackedRowsAllBoxes === 26
  })
  ok(dropped, '★★ 读侧结算后总数确实到 26', kernel.mailbox.status().notice.unackedRowsAllBoxes)
  const st2 = await b.call('vibe_vmu_mailbox', { action: 'status' })
  const inb2 = await b.call('vibe_v5_inbox', { action: 'list', member: 'r-2' })
  const st2n = st2 && st2.parsed && st2.parsed.notice
  const inb2n = inb2 && inb2.parsed && inb2.parsed.notice
  ok(st2n && st2n.unackedRowsAllBoxes === 26, '★★★ ack 后 status 减 1（27→26）', st2n && st2n.unackedRowsAllBoxes)
  ok(inb2n && inb2n.unackedRowsAllBoxes === 26, '★★★ ack 后 inbox list 同减 1（27→26）', inb2n && inb2n.unackedRowsAllBoxes)
  ok(inb2n && st2n && Object.keys(inb2n).length > 0 && Object.keys(st2n).length > 0 && JSON.stringify(inb2n) === JSON.stringify(st2n), '★★ ack 后两张面仍逐字节相等（不是各算各的）', { st: st2n, inb: inb2n })

  // ── 3. 视野级布尔与行数同源：acked/ackRequired 不能与 all-boxes 数打架 ────────────────────────────
  console.log('\n=== 3. view 级 acked/ackRequired 与 all-boxes 数同源 ===')
  ok(st2n && st2n.acked === false && st2n.ackRequired === true, '★ 还有 26 行未结算 ⇒ acked=false, ackRequired=true', st2n && { acked: st2n.acked, ackRequired: st2n.ackRequired })
  const settleRest = ids.slice(1)
  ok(settleRest.length > 0, '前置：首封已 ack，仍有待结算的行可迭代（不是空循环）', settleRest.length)
  for (const id of settleRest) {
    const r = await b.call('vibe_vmu_mailbox', { action: 'ack', member: 'r-2', ids: [id] })
    ok((r && r.parsed && r.parsed.ok === true) || (r && r.parsed && r.parsed.code === 'VMU_MAILBOX_ALREADY_ACKED'), '前置：其余行逐条结算（' + id + '）', r && r.parsed && { ok: r.parsed.ok, code: r.parsed.code })
  }
  const st3 = await b.call('vibe_vmu_mailbox', { action: 'status' })
  const inb3 = await b.call('vibe_v5_inbox', { action: 'list', member: 'r-2' })
  const st3n = st3 && st3.parsed && st3.parsed.notice
  const inb3n = inb3 && inb3.parsed && inb3.parsed.notice
  ok(st3n && st3n.unackedRowsAllBoxes === 0 && st3n.acked === true && st3n.ackRequired === false, '★★★ 全部结算后 0 行、acked=true、ackRequired=false', st3n && { total: st3n.unackedRowsAllBoxes, acked: st3n.acked, ackRequired: st3n.ackRequired })
  ok(inb3n && st3n && Object.keys(inb3n).length > 0 && Object.keys(st3n).length > 0 && JSON.stringify(inb3n) === JSON.stringify(st3n), '★★ 全结算后两张面仍逐字节相等', { st: st3n, inb: inb3n })

  // ── D. 只读面不得复用写面归属句（F75-09；run 75 实测 read_library 说“written IN THAT SEAT'S NAME”）────────────
  console.log('\n=== D. 只读面写自己的句子：viewedBy/readForMember/wroteAnything；写面保留原句 ===')
  const WRITE_SENTENCE = "written IN THAT SEAT'S NAME"
  // 夹具：office 以 r-1 名义写一张卡（失败重放的真实形状：caller 是 office，args.member 是 r-1）
  const w = await b.call('vibe_v5_record_proposition', { member: 'r-1', statement: 'F75-09 own/relayed wording probe', value: 0.9, motive: 'D 段夹具', p: 0.5 })
  const wp = w && w.parsed
  ok(wp && wp.ok === true && wp.recordId, '前置：写面成功写下一张 card（office 代 r-1）', wp && { ok: wp.ok, code: wp.code, recordId: wp.recordId })
  ok(wp && typeof wp.memberActedMeans === 'string' && wp.memberActedMeans.includes(WRITE_SENTENCE), '★★ D2 反关灯：写面回执仍逐字保留“…written IN THAT SEAT\'S NAME…”，修法不是全局删句', wp && wp.memberActedMeans)

  const rl = await b.call('vibe_v5_read_library', { member: 'r-1' })
  const rlp = rl && rl.parsed
  ok(rlp && rlp.ok === true, '前置：read_library 读到 r-1 的库', rlp && { ok: rlp.ok, code: rlp.code })
  ok(rlp && Object.prototype.hasOwnProperty.call(rlp, 'viewedBy') && rlp.viewedBy === null, '★★ D1 只读面回执带 viewedBy（office 调用为 null，而不是把 null 省略成“不知道”）', rlp && { viewedBy: rlp.viewedBy, has: rlp && Object.prototype.hasOwnProperty.call(rlp, 'viewedBy') })
  ok(rlp && rlp.readForMember === 'r-1', '★★ D1 只读面回执带 readForMember（读了哪个成员的库）', rlp && rlp.readForMember)
  ok(rlp && rlp.wroteAnything === false, '★★ D1 只读面回执具名 wroteAnything:false（读没有写任何东西）', rlp && rlp.wroteAnything)
  ok(rlp && typeof rlp.memberActedMeans === 'string' && rlp.memberActedMeans.includes('READ') && rlp.memberActedMeans.includes('wrote nothing'), '★★★ D1 只读面 means 自述是 READ 且“wrote nothing in any seat name”', rlp && rlp.memberActedMeans)
  ok(rlp && typeof rlp.memberActedMeans === 'string' && !rlp.memberActedMeans.includes(WRITE_SENTENCE), '★★★ D1 反关灯：只读面回执不再出现写面的“…written IN THAT SEAT\'S NAME…”', rlp && rlp.memberActedMeans)
  ok(rlp && typeof rlp.memberActed === 'boolean', '★ D1 memberActed 仍是布尔（成员席会问“这次调用是否从该席运行”，与“是否写”分开）', rlp && rlp.memberActed)

  // ── A. 写的来源（F75-11）：own-turn 与 relayed 在行上可分，两张读数面默认都说 ────────────────────────────
  console.log('\n=== A. writtenFrom：own-turn ≠ relayed（写时记下，读时默认带出；不叫 writerSource）===')
  const callAs = async (name, args, exec) => {
    const spec = b.specOf(name)
    if (!spec) return { missing: true }
    const raw = await spec.execute(args, exec)
    try { return { raw, parsed: JSON.parse(raw) } } catch { return { raw, parsed: undefined } }
  }
  const ownW = await callAs('vibe_v5_record_proposition',
    { member: 'r-1', statement: 'A probe: own turn', value: 0.9, motive: 'A own', p: 0.5 }, { agent: { id: 'r-1' } })
  const relW = await callAs('vibe_v5_record_proposition',
    { member: 'r-1', statement: 'A probe: relayed', value: 0.9, motive: 'A relayed', p: 0.5 }, {})
  ok(ownW && ownW.parsed && ownW.parsed.ok === true && ownW.parsed.writtenFrom === 'own-turn',
    '★★ A1 写回执：成员在自己会话里跑 ⇒ writtenFrom:"own-turn"', ownW && ownW.parsed && { ok: ownW.parsed.ok, writtenFrom: ownW.parsed.writtenFrom })
  ok(relW && relW.parsed && relW.parsed.ok === true && relW.parsed.writtenFrom === 'relayed',
    '★★ A1 写回执：office 以 r-1 名义写（没在该席运行）⇒ writtenFrom:"relayed"', relW && relW.parsed && { ok: relW.parsed.ok, writtenFrom: relW.parsed.writtenFrom })
  const ownId = ownW && ownW.parsed && ownW.parsed.recordId
  const relId = relW && relW.parsed && relW.parsed.recordId

  const recA = await b.call('vibe_vmu_records', { action: 'list', track: 'propositions', limit: 0 })
  const recAp = recA && recA.parsed
  const rowsA = (recAp && recAp.records) || []
  const rowOwn = rowsA.find((r) => r.id === ownId)
  const rowRel = rowsA.find((r) => r.id === relId)
  ok(rowOwn && rowOwn.writtenFrom === 'own-turn', '★★★ A2 records list 行：own-turn 行说 own-turn', rowOwn && { id: rowOwn.id, writtenFrom: rowOwn.writtenFrom })
  ok(rowRel && rowRel.writtenFrom === 'relayed', '★★★ A2 records list 行：relayed 行说 relayed（修前两者一模一样）', rowRel && { id: rowRel.id, writtenFrom: rowRel.writtenFrom })
  ok(rowOwn && !Object.prototype.hasOwnProperty.call(rowOwn, 'writerSource'), '★ A2 行上没有 writerSource：那个名字保持旧义（哪个字段 answer），不在这里被改义', rowOwn && Object.keys(rowOwn).filter((k) => k.includes('writer')))
  ok(recAp && recAp.withWriter === true && recAp.writtenFromOmitted === false, '★★ A2 records 回执自述默认带出（withWriter:true）', recAp && { withWriter: recAp.withWriter, omitted: recAp.writtenFromOmitted })

  const rlA = await b.call('vibe_v5_read_library', { member: 'r-1' })
  const rlAp = rlA && rlA.parsed
  const cardsA = (rlAp && rlAp.cards) || []
  const cardOwn = cardsA.find((r) => r.id === ownId)
  const cardRel = cardsA.find((r) => r.id === relId)
  ok(cardOwn && cardOwn.writtenFrom === 'own-turn', '★★★ A3 read_library 卡片：own-turn 行说 own-turn', cardOwn && { id: cardOwn.id, writtenFrom: cardOwn.writtenFrom })
  ok(cardRel && cardRel.writtenFrom === 'relayed', '★★★ A3 read_library 卡片：relayed 行说 relayed（同一批 records 行）', cardRel && { id: cardRel.id, writtenFrom: cardRel.writtenFrom })
  ok(rlAp && rlAp.withWriter === true && rlAp.writtenFromOmitted === false, '★★ A3 read_library 回执自述默认带出', rlAp && { withWriter: rlAp.withWriter, omitted: rlAp.writtenFromOmitted })

  const rlOff = await b.call('vibe_v5_read_library', { member: 'r-1', withWriter: false })
  const rlOffp = rlOff && rlOff.parsed
  const offCards = (rlOffp && rlOffp.cards) || []
  ok(offCards.length > 0 && offCards.every((r) => !Object.prototype.hasOwnProperty.call(r, 'writtenFrom')),
    '★★ A4 withWriter:false ⇒ 每张卡都不再带 writtenFrom（真的省略，不是空串）', offCards.length)
  ok(rlOffp && rlOffp.writtenFromOmitted === true, '★★ A4 省略被具名回答：writtenFromOmitted:true', rlOffp && { omitted: rlOffp.writtenFromOmitted })
  const recOff = await b.call('vibe_vmu_records', { action: 'list', track: 'propositions', limit: 0, withWriter: false })
  const recOffp = recOff && recOff.parsed
  const offRows = (recOffp && recOffp.records) || []
  ok(offRows.length > 0 && offRows.every((r) => !Object.prototype.hasOwnProperty.call(r, 'writtenFrom')),
    '★★ A4 records 面 withWriter:false 同样省略行字段', offRows.length)
  ok(recOffp && recOffp.writtenFromOmitted === true, '★★ A4 records 回执同时说 writtenFromOmitted:true', recOffp && { omitted: recOffp.writtenFromOmitted })

  // ── C. 编译出的 PDF 文件指纹（F75-15）：bytes 与 sha256 同源，status 能与磁盘对账 ──────────────────────
  console.log('\n=== C. pdfSha256：归档行与磁盘同一份字节；篡改具名（RUN 75 的 ARITHMETIC-BLOCKED 根因）===')
  const LATEX_SRC = await readFile(LATEX_SRC_PATH, 'utf8')
  const KIT_PAPER_SRC = await readFile(KIT_PAPER_PATH, 'utf8')
  ok(/const pdfReading\s*=/.test(LATEX_SRC) && /createHash\('sha256'\)/.test(LATEX_SRC),
    '★ C0 latex 接缝：同一次 readBytes 的 buffer 同时算 pdfBytes 与 pdfSha256，并 expose pdfReading',
    { hasFace: /const pdfReading\s*=/.test(LATEX_SRC), hasHash: /createHash\('sha256'\)/.test(LATEX_SRC) })
  ok(/pdfSha256: r\.pdfSha256/.test(KIT_PAPER_SRC) && /body\.pdfSha256/.test(KIT_PAPER_SRC),
    '★★ C0 kit/paper：paper-pdf 行把 r.pdfSha256 写进 body，compiledPdfRow 读回它（与 pdfBytes 同源）',
    { writes: /pdfSha256: r\.pdfSha256/.test(KIT_PAPER_SRC), reads: /body\.pdfSha256/.test(KIT_PAPER_SRC) })
  ok(/pdfSha256Mismatch/.test(PACK_TOOLS_SRC) && /pdfSha256MatchesDisk/.test(PACK_TOOLS_SRC),
    '★★ C0 status 把「磁盘与行是否同一份字节」当具名读数，不留给读者推断',
    { mismatch: /pdfSha256Mismatch/.test(PACK_TOOLS_SRC), matches: /pdfSha256MatchesDisk/.test(PACK_TOOLS_SRC) })

  const pdfC1 = join(root, 'c1.pdf')
  await writeFile(pdfC1, 'PDF-1.7\nTB2691 C fixture\n')
  const c1Buf = await readFile(pdfC1)
  const c1Sha = createHash('sha256').update(c1Buf).digest('hex')
  const c1Read = kernel.latex && typeof kernel.latex.pdfReading === 'function' ? await kernel.latex.pdfReading(pdfC1) : null
  ok(c1Read && c1Read.ok === true && c1Read.pdfSha256 === c1Sha && c1Read.pdfBytes === c1Buf.length,
    '★★ C1 pdfReading 对真实文件：bytes 与 sha256 来自同一次读，且等于外部算出的 sha256(file)', c1Read && { bytes: c1Read.pdfBytes, sha: c1Read.pdfSha256, want: c1Sha })
  const c1Missing = kernel.latex && typeof kernel.latex.pdfReading === 'function' ? await kernel.latex.pdfReading(join(root, 'no-such-pdf.pdf')) : null
  ok(c1Missing && c1Missing.ok === false && c1Missing.exists === false && /no file/i.test(String(c1Missing.why || '')),
    '★ C1 不存在的 PDF 是具名缺席（ok:false + why），不是 bytes:0 的假读数', c1Missing)

  const putState = (id, target) => kernel.records.put({ track: 'paper', kind: 'paper-state', title: id + '|state', body: JSON.stringify({ target, id, status: 'finalized', stage: 'finalized', round: 1 }), settled: true })
  const putPdf = (id, target, body) => kernel.records.put({ track: 'paper', kind: 'paper-pdf', title: id + '|' + target + '|pdf', body: JSON.stringify(body), settled: true })
  putState('paper-c1', 'c1')
  putPdf('paper-c1', 'c1', { pdfPath: pdfC1, pdfBytes: c1Buf.length, pdfSha256: c1Sha, engine: 'xelatex', tried: ['xelatex'], argv: [] })
  const stC1 = await b.call('vibe_v5_paper', { action: 'status', target: 'c1' })
  const pcC1 = stC1 && stC1.parsed && stC1.parsed.pdfCompiled
  ok(pcC1 && pcC1.produced === true && pcC1.pdfSha256 === c1Sha,
    '★★ C1 status.pdfCompiled 报出编译行记录的 pdfSha256（run 75 的归档行没有这个键）', pcC1 && { produced: pcC1.produced, rowSha: pcC1.pdfSha256 })
  ok(pcC1 && pcC1.diskPdfSha256 === c1Sha && pcC1.diskPdfBytes === c1Buf.length,
    '★★ C1 同一份回执报出磁盘读数 diskPdfSha256/diskPdfBytes', pcC1 && { diskSha: pcC1.diskPdfSha256, diskBytes: pcC1.diskPdfBytes })
  ok(pcC1 && pcC1.pdfSha256MatchesDisk === true && pcC1.pdfSha256Mismatch === false,
    '★★★ C1 行 sha == 磁盘 sha ⇒ matches:true / mismatch:false（可算，不再 ARITHMETIC-BLOCKED）', pcC1 && { matches: pcC1.pdfSha256MatchesDisk, mismatch: pcC1.pdfSha256Mismatch })
  ok(stC1 && stC1.parsed && Array.isArray(stC1.parsed.missing) && !stC1.parsed.missing.includes('pdfSha256'),
    '★ C1 有 sha 时 missing 不点它', stC1 && stC1.parsed && stC1.parsed.missing)

  await appendFile(pdfC1, 'X')
  const stC1b = await b.call('vibe_v5_paper', { action: 'status', target: 'c1' })
  const pcC1b = stC1b && stC1b.parsed && stC1b.parsed.pdfCompiled
  ok(pcC1b && pcC1b.diskPdfSha256 !== c1Sha,
    '★ C2 篡改后磁盘 sha 变了（前提）', pcC1b && pcC1b.diskPdfSha256)
  ok(pcC1b && pcC1b.pdfSha256MatchesDisk === false && pcC1b.pdfSha256Mismatch === true,
    '★★★ C2 篡改 1 字节 ⇒ 具名 pdfSha256Mismatch:true（不是静默通过，也不是缺字段）', pcC1b && { matches: pcC1b.pdfSha256MatchesDisk, mismatch: pcC1b.pdfSha256Mismatch })
  ok(pcC1b && typeof pcC1b.pdfSha256Means === 'string' && pcC1b.pdfSha256Means.includes('TAMPERED OR REPLACED') && pcC1b.pdfSha256Means.includes(c1Sha),
    '★★ C2 means 点名 TAMPERED 并给出两个 sha（行里记的 + 磁盘现在的）', pcC1b && pcC1b.pdfSha256Means)

  const pdfC2 = join(root, 'c2.pdf')
  await writeFile(pdfC2, 'PDF-1.7\nlegacy row without sha\n')
  const c2Buf = await readFile(pdfC2)
  putState('paper-c2', 'c2')
  putPdf('paper-c2', 'c2', { pdfPath: pdfC2, pdfBytes: c2Buf.length, engine: 'xelatex', tried: ['xelatex'], argv: [] })
  const stC2 = await b.call('vibe_v5_paper', { action: 'status', target: 'c2' })
  const pcC2 = stC2 && stC2.parsed && stC2.parsed.pdfCompiled
  ok(pcC2 && pcC2.pdfSha256 === null && pcC2.pdfSha256MatchesDisk === null && pcC2.pdfSha256Mismatch === false,
    '★★ C3 旧行没有 sha ⇒ 行 sha:null、matches:null（不是 true），mismatch 不谎报', pcC2 && { rowSha: pcC2.pdfSha256, matches: pcC2.pdfSha256MatchesDisk })
  // ★★★ TB-2691 correction (RUN 252 / F72-7): the absence is NAMED — but not in the ACTION-scoped `missing` list.
  // `missing` answers "did this action lack an input"; folding evidence into it made a receipt read `produced:true`
  // beside `missing:["pdfSha256"]`. The named absence is `pdfCompiled.pdfSha256:null` + the `pdfSha256Means` sentence,
  // which is where this assertion now reads it (the capability is kept, the list's meaning is single again).
  ok(stC2 && stC2.parsed && Array.isArray(stC2.parsed.missing) && !stC2.parsed.missing.includes('pdfSha256'),
    '★★★ C3 缺 sha 是【证据】缺席，不进动作 read 的 missing（TB-2691 correction）', stC2 && stC2.parsed && stC2.parsed.missing)
  ok(pcC2 && typeof pcC2.pdfSha256Means === 'string' && pcC2.pdfSha256Means.includes('pdfSha256') && /claim/.test(pcC2.pdfSha256Means),
    '★★ C3 pdfSha256Means 点名这条缺席并说明字节数只是 claim（不拿字节数冒充“磁盘就是这份”）', pcC2 && String(pcC2.pdfSha256Means).slice(0, 80))

  console.log('\n=== SUMMARY: ' + passed + ' passed / ' + failed + ' failed ===')
  if (failed > 0) {
    console.log('failures:')
    for (const f of failures) console.log('  - ' + f)
    process.exitCode = 1
  }
} finally {
  await closeBoot(b)
  try { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }) } catch { /* a pending durable flush may hold the dir; the tmp root is disposable */ }
}
