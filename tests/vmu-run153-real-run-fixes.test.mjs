/**
 * RUN 153 — the third real SLV simulation (real machine, vmu + v5r, continuation of the first institute) finished with
 * all A/B/C segments working and N1/N2/N3 fixed, but its agent report (`FEEDBACK2.md` G1–G10) named four mechanism
 * defects that only a real run exposes. This suite pins the fixes:
 *
 *   G1  a ruling settlement (rule L53) reached the ORDINARY card write, which rebuilds the body from the arguments it was
 *       handed: settling a LOCKED card's probability therefore DELETED its title and its `proofRef`/`proofState`/
 *       `leanJob`/`leanConformance` fields — and with `proofState` gone the rule-L14 lock stopped biting, so the next
 *       plain write rewrote a completed card. The settlement is now a PATCH (only the `p` line + one ruling row).
 *   G2  the LaTeX face handed xelatex a Windows RELATIVE path built with `join` (`Paper\paper-p5\paper-p5.tex`); TeX read
 *       `\paper` as a control sequence and produced no PDF, while the same file compiled to 3 pages with forward slashes.
 *       The face now resolves a relative outDir to an ABSOLUTE forward-slash path, and names the PDF after the .tex it
 *       was given (a `p5.tex` compile used to be looked for at `main.pdf`).
 *   G3  `vibe_v5_lean_job { jobId }` said `VMU_LEAN_NOT_FOUND` about a job whose `Formal/Jobs/<id>.json` sat on disk: the
 *       durable mirror is only readable after it has been LISTED, and the read never hydrated it. It hydrates now, and a
 *       real miss names BOTH places that were searched.
 *   G4  `verdict_final` produced no aggregate id, so a unanimous 2/2 ruling had to cite ONE member's ruling card as the
 *       warrant of the promotion. The ruling now has its own stable tally id (`warrantFor`, `tally`).
 *   G10 the FINAL receipt's `pdf` block carried none of the compiler's words while `action:"compile"` did — one failure
 *       structure on both doors now.
 *
 *   §0 the source-level contract
 *   §1 real behaviour: the settlement patch keeps the card and its lock; the LaTeX face produces an absolute,
 *      forward-slash argv and a pdf named after the source
 *   §2 the sentences that keep the next reader from re-learning the same lesson
 *
 * Run: node tests/vmu-run153-real-run-fixes.test.mjs
 * Last line: === VMU RUN153 REAL-RUN FIXES: N passed, M failed ===
 */
import { mkdtemp } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href
const KIT_PAPER = join(REPO, 'vibe-math-vmu', 'kit', 'paper.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const EXTRAS = join(REPO, 'vibe-math-vmu', 'kit', 'extras.js')
const LATEX = join(REPO, 'vibe-math-vmu', 'kernel', 'latex.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' — ' + String(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + String(detail)))
  return false
}

const entry = await import(ENTRY)
const latexMod = await import(pathToFileURL(LATEX).href)
const KIT = readFileSync(KIT_PAPER, 'utf8')
const TOOLS_SRC = readFileSync(TOOLS, 'utf8')
const EXTRAS_SRC = readFileSync(EXTRAS, 'utf8')
const LATEX_SRC = readFileSync(LATEX, 'utf8')

const roots = []
const boot = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run153-'))
  roots.push(root)
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ root, packs: ['v5r'], clock: () => 1000, deliverMode: 'caller' }, settings))
  await handle.ready()
  const kernel = handle.kernel
  await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
  await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-t', slot: 'temp' })
  return { root, kernel, specs: state.specs }
}
const TOOL = (specs, name) => specs.find((s) => s.name === name)
const parse = (res) => (typeof res === 'string' ? JSON.parse(res) : res)
const call = async (specs, name, args) => {
  const spec = TOOL(specs, name)
  if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', message: name }
  try { return parse(await spec.execute(args, {})) } catch (e) {
    return { ok: false, code: e && e.code, message: e && e.message, hint: e && e.hint }
  }
}
const show = (r) => (r && (r.code || '') + ' ' + String((r && r.message) || '').slice(0, 120)).trim()

try {
  console.log('=== 0. 源码口径：真机跑 3 报的每个缺陷都有自己的站点 ===')
  {
    // G1 — the settlement is a patch, and the ordinary write is no longer reached for it.
    ok(/function settleRulingOnCard\(/.test(TOOLS_SRC) && /res = settleRulingOnCard\(\{/.test(TOOLS_SRC),
      '§0a ★★★ G1 裁决落值走 `settleRulingOnCard`（补丁写），不再落到重建 body 的普通写')
    ok(/if \(res === undefined\) res = inner\(args, ctx\)/.test(TOOLS_SRC),
      '§0b ★★ G1 只有「不是结算」时才落到 `inner(args, ctx)`')
    ok(/wrote: \['p', 'debateRuling'\]/.test(TOOLS_SRC) && /left exactly as it was, so the rule-L14 lock still bites/.test(TOOLS_SRC),
      '§0c ★★★ G1 补丁只改 `p` 与一行 `debateRuling`，其余字段（含锁判据）原样保留')
    ok(/if \(\/\^- \*debateRuling \*\[：:\]\/\.test\(line\)\) \{ droppedEarlierRuling = true; continue \}/.test(TOOLS_SRC),
      '§0d ★★ G1 第二次结算替换旧裁决行，不在卡体里堆两行互相矛盾的裁决')
    // G2 — absolute, forward-slash path; pdf named after the source. (Pins are substring facts, not regex tours: the
    // separator normalizer is one literal `replace(/\\/g, '/')` and counting it is the honest check.)
    const slashNorm = (LATEX_SRC.match(/replace\(\/\\{2}\/g, '\/'\)/g) || []).length
    ok(LATEX_SRC.includes('isAbsolute(outDir)') && LATEX_SRC.includes('resolve(outDir)') && slashNorm >= 2,
      '§0e ★★★ G2 相对 outDir 先解析成绝对路径并转成正斜杠（Windows 反斜杠会被 TeX 当控制序列）')
    ok(!LATEX_SRC.includes("join(outDir, 'main.pdf')") && LATEX_SRC.includes('basename(texFile)'),
      '§0f ★★★ G2 PDF 名字从 `.tex` 推出来（`p5.tex` ⇒ `p5.pdf`，不再假定 `main.pdf`）')
    ok(LATEX_SRC.includes('texFile = join(outDir,') && slashNorm >= 2,
      '§0f2 ★★★ G2 `.tex` 路径本身也转成正斜杠（`join` 会把平台分隔符加回来）')
    ok(/ev\.debate\.subject === undefined \|\| ev\.debate\.subject === null/.test(readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verification-gates.js'), 'utf8')),
      '§0f3 ★★ G1 邻：裁决证据的 subject 缺省是"本卡"，不是字符串 "null"（`String(null)` 曾让裁决证据对不上卡）')
    // G3 — hydrate before refusing; name both searched places.
    ok(/typeof lean\.listMirrors === 'function' \? await lean\.listMirrors\(\)/.test(EXTRAS_SRC) && /hydrated: true/.test(EXTRAS_SRC),
      '§0g ★★★ G3 `vibe_v5_lean_job` 读之前先 `listMirrors()` 水合（上一内核进程写的作业才读得到）')
    ok(/本内核进程没有它，作业镜像/.test(EXTRAS_SRC) && /两者都没有才叫「没有这个作业」/.test(EXTRAS_SRC),
      '§0h ★★ G3 真找不到时点名「进程内表格」与「持久镜像」两个范围')
    ok(/searched: \{ process:/.test(EXTRAS_SRC) && /return \{ ok: false, code: 'VMU_LEAN_NOT_FOUND'/.test(EXTRAS_SRC),
      '§0h2 ★★ G3 找不到是【回执】不是异常（F-56p 的上层契约不许被这条修法破掉），且 `searched` 让「查过哪里」可核')
    // G4 — one aggregate tally id.
    ok(/const tallyId = 'tally-' \+ \[str\(meeting\), propositionId\]\.map\(rulingSlugOf\)\.join\('-'\)/.test(TOOLS_SRC),
      '§0i ★★★ G4 裁决铸一个汇总 id（`tally-<meeting>-<proposition>`，同一次裁决恒定）')
    ok(/warrantFor: \{/.test(TOOLS_SRC) && /tally: \{/.test(TOOLS_SRC) && /the aggregate tally of this ruling, not one member/.test(TOOLS_SRC),
      '§0j ★★ G4 回执给出 `warrantFor`/`tally`：promote 可以引用裁决本身，而不是某位成员的卡')
    // G10 — one pdf-failure structure on both doors.
    ok(/argv: Array\.isArray\(e && e\.argv\) \? e\.argv\.slice\(0, 16\) : \[\]/.test(KIT) && /tailSource: \(e && e\.tailSource\) \|\| null/.test(KIT),
      '§0k ★★ G10 `final` 的 pdf 失败块带上 argv/stderrTail/stdoutTail/tailSource/signal')
    ok(/tailSource: finalized\.pdf\.tailSource \|\| null/.test(TOOLS_SRC),
      '§0l ★★ G10 工具回执把同一结构原样投影出去')
    ok(/RUN 153/.test(TOOLS_SRC) && /RUN 153/.test(LATEX_SRC) && /RUN 153/.test(EXTRAS_SRC) && /RUN 153/.test(KIT),
      '§0m 四处改动都带 RUN 153 注记（可追溯）')
  }

  console.log('=== 1. 真调用：结算不毁卡、锁还在、argv 绝对且正斜杠 ===')
  {
    const b = await boot()
    // G1 — a completed card is locked; settling its probability must keep EVERYTHING else.
    const card = await call(b.specs, 'vibe_v5_record_proposition', {
      id: 'rec-153-g1', statement: 'run153 §1 命题：n+n=2n', value: 1, motive: '算术恒等', p: 0.99,
      proof_ref: 'Members/r-1/Propos/run153.md#正式证明', proof_state: 'complete', member: 'r-1', title: '辩论对象卡 run153',
    })
    ok(card.ok === true, '§1a 写了一张已完成的卡（p=0.99，proof_state complete）', show(card))
    const rowBefore = (() => { try { return b.kernel.records.get({ id: 'rec-153-g1' }) } catch { return null } })()
    const bodyBefore = String((rowBefore && (rowBefore.record ? rowBefore.record.body : rowBefore.body)) || '')
    const titleBefore = String((rowBefore && (rowBefore.record ? rowBefore.record.title : rowBefore.title)) || '')
    ok(bodyBefore.includes('proofState') && titleBefore.length > 0,
      '§1b 结算前：卡体带 `proofState`，标题是 caller 给的那个', JSON.stringify({ titleBefore, hasProofState: bodyBefore.includes('proofState') }))
    const settled = await call(b.specs, 'vibe_v5_record_proposition', {
      id: 'rec-153-g1', statement: 'run153 §1 命题：n+n=2n', value: 1, motive: '算术恒等', p: 1,
      debate_ruling: { subject: 'rec-153-g1', value: 1, mode: 'unanimous', n: 2, decided: true, meeting: 'm-deb-1', by: 'r-chair' }, member: 'r-1',
    })
    ok(settled.ok === true && settled.settled === true && settled.p === 1,
      '§1c ★★★ G1 裁决落值在锁定卡上成功（L53 要求的写改能执行）', show(settled))
    ok(settled && settled.settlement && settled.settlement.patch === true,
      '§1d ★★★ G1 回执自述这是一次补丁写（`settlement.patch:true`），不是整条重写', JSON.stringify(settled && settled.settlement))
    const rowAfter = (() => { try { return b.kernel.records.get({ id: 'rec-153-g1' }) } catch { return null } })()
    const bodyAfter = String((rowAfter && (rowAfter.record ? rowAfter.record.body : rowAfter.body)) || '')
    const titleAfter = String((rowAfter && (rowAfter.record ? rowAfter.record.title : rowAfter.title)) || '')
    ok(titleAfter === titleBefore, '§1e ★★★ G1 标题没有被塌成 id（结算前后同一标题）', JSON.stringify({ titleBefore, titleAfter }))
    ok(/proofState *[：:] *complete/.test(bodyAfter), '§1f ★★★ G1 `proofState:complete` 还在卡体里（锁判据没被删）', bodyAfter.slice(0, 200))
    ok(bodyAfter.includes('proofRef') && bodyAfter.includes('statement'), '§1g ★★ G1 statement/proofRef 都还在（不是只剩五行）', bodyAfter.slice(0, 200))
    ok(/debateRuling *[：:]/.test(bodyAfter), '§1h ★★★ G1 裁决落进了卡体（`debateRuling` 行）', bodyAfter.slice(-200))
    ok(/pk|p *[：:] *1\b/.test(bodyAfter) || /p *[：:] *1/.test(bodyAfter), '§1i ★★ G1 卡体的 p 已改成裁决值 1', bodyAfter.slice(0, 200))
    const plain = await call(b.specs, 'vibe_v5_record_proposition', {
      id: 'rec-153-g1', statement: 'run153 §1 命题：n+n=2n', value: 1, motive: '算术恒等', p: 0.5, member: 'r-1',
    })
    ok(plain.ok === false && plain.code === 'VMU_STATE' && /is locked/.test(String(plain.message || '')),
      '§1j ★★★ G1 结算之后普通写入仍被具名拒 —— 锁在结算后依然咬人（真机跑 3 里它不咬了）', show(plain))
    // G1 (second settlement replaces the first ruling row instead of stacking two)
    const settledAgain = await call(b.specs, 'vibe_v5_record_proposition', {
      id: 'rec-153-g1', statement: 'run153 §1 命题：n+n=2n', value: 1, motive: '算术恒等', p: 0,
      debate_ruling: { subject: 'rec-153-g1', value: 0, mode: 'unanimous', n: 2, decided: true, meeting: 'm-deb-2', by: 'r-chair' }, member: 'r-1',
    })
    const bodyFinal = (() => { try { const r = b.kernel.records.get({ id: 'rec-153-g1' }); return String((r && (r.record ? r.record.body : r.body)) || '') } catch { return '' } })()
    ok(settledAgain.ok === true && (bodyFinal.match(/debateRuling/g) || []).length === 1,
      '§1k ★★ G1 第二次结算替换旧裁决行（卡体里只有一行 debateRuling）', JSON.stringify({ repeated: (bodyFinal.match(/debateRuling/g) || []).length }))
  }

  console.log('=== 1. 真调用：LaTeX 面交出去的是绝对路径 + 正斜杠，PDF 按源文件命名 ===')
  {
    const writes = []
    const face = latexMod.createLatexFace({
      settings: { get: () => undefined },
      fs: {
        writeText: async (p, t) => { writes.push({ p, t }) },
        exists: async () => true,
        readBytes: async () => Buffer.from('%PDF-1.4 run153'),
      },
      clock: (() => { let t = 0; return () => (t += 5) })(),
      spawn: async ({ command, args }) => (args && args[0] === '--version' ? { exitCode: 0, stdout: 'XeTeX' } : { exitCode: 0, stdout: 'ok' }),
    })
    const r = await face.check({ source: '\\documentclass{article}', outDir: 'Paper/p-run153', sourceName: 'p-run153.tex' })
    ok(r && r.ok === true, '§1l LaTeX 面用相对 outDir 也能编译成功（假 spawn）', show(r))
    const argvTex = r && Array.isArray(r.argv) ? r.argv[r.argv.length - 1] : ''
    ok(typeof argvTex === 'string' && argvTex.toLowerCase().endsWith('p-run153.tex'),
      '§1m ★★ argv 最后一项是 .tex 路径', String(argvTex))
    ok(typeof argvTex === 'string' && argvTex.includes('/') && !argvTex.includes('\\'),
      '§1n ★★★ G2 argv 里的路径用正斜杠（Windows 反斜杠会被 TeX 读成控制序列）', String(argvTex))
    ok(typeof argvTex === 'string' && (argvTex.startsWith('/') || /^[A-Za-z]:\//.test(argvTex)),
      '§1o ★★★ G2 argv 里的路径是绝对路径（不再依赖内核 cwd）', String(argvTex))
    ok(typeof (r && r.pdfPath) === 'string' && r.pdfPath.toLowerCase().endsWith('p-run153.pdf'),
      '§1p ★★★ G2 PDF 按源文件命名（`p-run153.tex` ⇒ `p-run153.pdf`，不是 main.pdf）', String(r && r.pdfPath))
    ok(writes.length === 1 && String(writes[0].t).includes('documentclass'),
      '§1q 写出来的 .tex 就是调用方给的 source（没有悄悄改写内容）', JSON.stringify(writes.map((w) => w.p)))
  }

  console.log('=== 1½. A CARD BORN FROM A DEBATE IS CREATED, THEN PATCHED — not "patched before it exists" ===')
  {
    // ★★★ RUN 153 — this branch is why the fix was not "one line": the first write of a card may carry
    // `debate_ruling` (a card born from a debate). Taking the settlement-patch path there asked the records face to
    // patch a row nobody had written ⇒ VMU_NO_SUCH_OBJECT. The create falls through to the ordinary write (which carries
    // p, hence settled), and the SAME patch function then layers the ruling line on the row it just wrote.
    const b2 = await boot()
    const created = await call(b2.specs, 'vibe_v5_record_proposition', {
      id: 'rec-153-born', title: 'born 卡', statement: '诞生即带裁决', value: 3, motive: 'run153', p: 1,
      debate_ruling: { subject: 'rec-153-born', value: 1, mode: 'unanimous', n: 2, decided: true, meeting: 'm-deb-3', by: 'r-chair' },
      member: 'r-1',
    })
    ok(created && created.ok === true && created.track === 'propositions', '§1r ★★ 带裁决的新卡被【创建】成功（不是 NO_SUCH_OBJECT）', show(created))
    ok(created && created.settled === true, '§1r2 新卡 p=1 ⇒ settled:true（回执仍是创建回执）', created && created.settled)
    ok(created && created.settlement && created.settlement.patch === true,
      '§1r3 回执自述：裁决是在创建之后【补丁】上去的', JSON.stringify(created && created.settlement))
    const row = (() => { try { return b2.kernel.records.get({ id: 'rec-153-born' }) } catch { return null } })()
    const body = String((row && (row.record ? row.record.body : row.body)) || '')
    ok(/debateRuling *[：:]/.test(body) && body.includes('m-deb-3'),
      '§1r4 新卡卡体里真有裁决行（含会议 id）', body.split('\n').filter((l) => /debateRuling/.test(l)).join(' | '))
    const pLine = (body.match(/^- p *[：:].*$/m) || [''])[0]
    ok(pLine.trim() === '- p：1', '§1r5 卡体的 p 就是裁决值（没有第二条 p 行）', pLine)
  }

  console.log('=== 2. 句子的重量：回执/说明书里必须留住的真话 ===')
  {
    ok(/the settlement is therefore a PATCH/i.test(TOOLS_SRC) || /settlement is a PATCH/.test(TOOLS_SRC),
      '§2a G1 说明书说清「结算是补丁」而不是整条重写')
    ok(/not a card rewrite/.test(TOOLS_SRC),
      '§2b G1 回执字段自述「不是重写卡」')
    ok(/mirror has been LISTED|only readable after it has been LISTED|filled by `list\(\)`/.test(EXTRAS_SRC),
      '§2c G3 说明为什么必须先 list 才能读镜像')
    ok(/stable per \(meeting, proposition\)/.test(TOOLS_SRC) && /settles a proposition once/.test(TOOLS_SRC),
      '§2d G4 tally id 的稳定性有理由（L53 只结算一次）')
    ok(/the most important door|least informative one/.test(KIT),
      '§2e G10 为什么两处必须共用同一失败结构（写进了代码注释）')
  }

  console.log('=== 3. 第二批（G5/G6/G7/G8/G9）：真机报告的「读不懂/答不上」也在自己的站点修了 ===')
  {
    const PQ = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')).href)
    const QUALITY_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js'), 'utf8')
    const KERNEL_PAPER_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'kernel', 'paper.js'), 'utf8')
    const MC_SRC = readFileSync(join(REPO, 'vibe-math-vmu', 'math-computation.js'), 'utf8')

    // G6 — a bare record id is a legal evidence pointer (the appendix indexes BY ID), and a bare id that names no
    // record is still a NAMED miss rather than "not-a-member-file-pointer".
    const b3 = await boot()
    const card = await call(b3.specs, 'vibe_v5_record_proposition', {
      id: 'rec-153-g6', statement: 'G6 命题：可被裸 id 引用', value: 1, motive: 'run153', p: 0.5, member: 'r-1' })
    ok(card.ok === true, '§3a 准备一张可被引用的卡', show(card))
    const bare = PQ.checkEvidencePointers({ evidence: ['rec-153-g6'], records: b3.kernel.records })
    ok(bare.ok === true && bare.resolved.length === 1 && bare.resolved[0].cardId === 'rec-153-g6',
      '§3b ★★★ G6 裸记录 id 是可解析的证据指针（真机里成员写了卡上的 id，被判 not-a-member-file-pointer）', JSON.stringify(bare.unknown))
    const bareMiss = PQ.checkEvidencePointers({ evidence: ['rec-nope-404'], records: b3.kernel.records })
    ok(bareMiss.ok === false && bareMiss.unknown.length === 1 && bareMiss.unknown[0].reason === 'no-such-record',
      '§3c ★★ G6 裸 id 指不到记录时说的是 `no-such-record`，不是「不是成员文件指针」', JSON.stringify(bareMiss.unknown))
    const memForm = PQ.checkEvidencePointers({ evidence: ['Members/r-1/Propos/rec-153-g6.md'], records: b3.kernel.records })
    ok(memForm.ok === true && memForm.resolved.length === 1, '§3d 旧的成员文件形仍然可用（只增不改）', JSON.stringify(memForm.unknown))
    ok(/BARE_CARD_ID/.test(QUALITY_SRC) && /or a bare record id such as/.test(QUALITY_SRC),
      '§3e ★★ G6 说明书里写明了裸 id 这种合法形')

    // G5 — the verified-coverage refusal hands back the exact line to paste.
    ok(/requiredLine/.test(QUALITY_SRC) && /可直接粘进正文的标题行/.test(QUALITY_SRC),
      '§3f ★★★ G5 verified 覆盖门的回执给出可直接粘贴的标题行（真机里成员手工剥「已验证｜」前缀，剥错一次）')

    // G7 — the auto-filled §1 line says WHOSE objective it is.
    ok(/本所本期目标（设置键 `vmu\.turn\.objective`，是【全所】的目标、不一定是本篇论文的研究对象/.test(QUALITY_SRC),
      '§3g ★★★ G7 自动填充的第 1 节改口：是全所目标，不一定是本篇的研究对象（真机里 n+n=2n 的论文把 n² 的总目标当引言）')

    // G8 — the receipt says the argv shape it produced, and names the conflict when the caller already had an input.
    ok(/scriptConflict/.test(MC_SRC) && /already names an input of its own/.test(MC_SRC),
      '§3h ★★★ G8 计算面回执说明「脚本被追加」这件事，并在调用方已自带输入时点名冲突（真机里 xelatex 变成两个输入）')
    ok(!/appendScript = .*&& !namesOwnInput/.test(MC_SRC),
      '§3i ★★ G8 追加规则本身没被偷偷改掉（文档契约 "[command, ...cli.argv, <archived script>]" 仍然成立）')

    // G9 — the consult-required refusal names the paper the answer must address.
    ok(/target: p\.id, paperId: p\.id/.test(KERNEL_PAPER_SRC),
      '§3j ★★★ G9 `VMU_OFFICE_CONSULT_REQUIRED` 回执带 `target`（真机里所办答复先撞一次 no target was given）')
  }
} finally {
  const fs = await import('node:fs/promises')
  await Promise.all(roots.map((r) => fs.rm(r, { recursive: true, force: true }).catch(() => {})))
}

console.log('=== VMU RUN153 REAL-RUN FIXES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('FAILURES:')
  for (const f of failures) console.error(' - ' + f)
  process.exit(1)
}
