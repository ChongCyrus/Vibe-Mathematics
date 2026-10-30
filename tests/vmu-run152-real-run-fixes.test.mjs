/**
 * RUN 152 — the first full SLV simulation (real machine, vmu + v5r pack) reported eight defects. This suite pins the
 * fixes for the ones that were NOT wording-only:
 *
 *   F4  a paper started with `editor:"<chair-seated member id>"` could never be finalised: `start` stored the id
 *       verbatim and `recordFinal` only accepted the ROLE word "academician" — and the refusal said "this paper is not
 *       the academician's to finalise" even when the signer WAS the academician. (4 refused finalisations, 3 papers)
 *   F3  the quality gate pre-passed EVERY final, including `decision:"revise"` — so the repair path named by the
 *       refusal was itself refused; and `recordPart`'s hint named a move the flow cannot make ("advance it back").
 *   F1  a card whose proof is complete is locked (L14), yet L53 requires the framework to instruct the holder to change
 *       its probability, and `verdict_final.correction.call` printed exactly that write — which the lock refused, so the
 *       proposition could never reach p=1 or the Verified track. (Also: the printed call omitted statement/value/motive,
 *       which the tool schema requires, so it was not even copy-pasteable.)
 *   F2  a Lean job created in an earlier kernel process was invisible to `fidelity_conclude` until the durable mirror was
 *       hydrated, and the two job faces (Lean `Formal/Jobs` vs Python `Math/Jobs`) were indistinguishable in the text.
 *   F5  two concurrent `part` writes both said ok:true and the later one silently dropped the earlier member's part.
 *   F7  at a three-seat roster the L47 floor is satisfied by construction, so `VMU_MEETING_QUORUM_LOST` is unreachable —
 *       the receipt read like a live gate without saying when it can bite.
 *   F8  bold headings were escaped in the wrong order (`\\textbf\{…\}` ⇒ xelatex "Undefined control sequence") and the
 *       failure receipt pointed at an empty `stderrTail` while the compiler's words sat in `stdoutTail`.
 *   P1  the framework's own repair advice (`vibe_v5_configure {"member":…}`) named a parameter that tool refuses.
 *
 *   §0 the source-level contract (every site above)
 *   §1 real calls: the editor is normalised at start (or refused by name); a ruling settlement is admitted on a LOCKED
 *      card while every other write stays refused; the Lean-mirror refusal names both scopes
 *   §2 the receipt/description sentences that keep the next reader from re-learning the same lesson
 *
 * Run: node tests/vmu-run152-real-run-fixes.test.mjs
 * Last line: === VMU RUN152 REAL-RUN FIXES: N passed, M failed ===
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
const PACK_PAPER = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'paper.js')
const TOOLS = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')
const LEADERSHIP = join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'leadership.js')

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
const KIT = readFileSync(KIT_PAPER, 'utf8')
const PACK = readFileSync(PACK_PAPER, 'utf8')
const TOOLS_SRC = readFileSync(TOOLS, 'utf8')
const LEAD = readFileSync(LEADERSHIP, 'utf8')

const roots = []
const boot = async (settings = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'vmu-run152-'))
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
  // the three seats the rules name; every run of the first simulation had exactly this roster
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
const show = (r) => (r && (r.code || '') + ' ' + String((r && r.message) || '').slice(0, 110)).trim()

try {
  console.log('=== 0. 源码口径：真机跑 2 报的每个缺陷都有自己的站点 ===')
  {
    // F4 — the editor is resolved where it is still actionable, and the two refusals are two different facts.
    ok(/editorWord !== editorDefault && editorWord !== 'office'/.test(KIT) && /String\(seat\.slot\) === finalizerSlot/.test(KIT),
      '§0a ★★ F4 `start` 在写卡之前就把 editor 归一化（院士席成员 id ⇒ "academician"；其它席位具名拒）')
    ok(/state\.editor === 'office'/.test(KIT) && /named gap in this build/.test(KIT) && /finalises only an "academician"-edited paper/.test(KIT),
      '§0b ★★ F4 `recordFinal` 把「所办代定稿的缺口」与「不是院士编辑」拆成两句')
    ok(!/state\.editor \+ '": this paper is not the academician/.test(KIT),
      '§0c ★★★ F4 那句字面为假的话不再进任何 refusal（只留在注释里交代历史）')
    // F3 — only a deliverable is gated, so the revise repair path is reachable.
    ok(/String\(args\.decision \|\| ''\) === 'deliverable'/.test(PACK),
      '§0d ★★★ F3 预闸只对 `decision:"deliverable"` —— revise 不再被同一道门拒')
    ok(/decision: "revise"/.test(KIT) && !/advance it back to writing before recording a part/.test(KIT),
      '§0e ★★ F3 `recordPart` 的 hint 改成流程真能走的那一步（editor 发 revise），不再指一条不存在的路')
    // F8 — escape the text, then wrap the bold run; and the promised tail is never the empty stream.
    ok(/const escText = \(s\) => String\(s\)\.replace\(\/\(\[&%\$#_\{\}\]\)\/g/.test(KIT),
      '§0f ★★ F8 先把 TeX 特殊字符整体转义（`escText`），bold 只在转义之后包一层')
    ok(/escText\(String\(s\)\)\.replace\(\/\\\*\\\*/.test(KIT) && !/'\\\\\\\\textbf\{' \+ '\$1'/.test(KIT),
      '§0g ★★★ F8 顺序反了就会写出 `\\\\textbf\\{…\\}`（xelatex 的 Undefined control sequence 根因）—— 旧顺序已删')
    ok(/failure\.tailSource = 'stdout'/.test(KIT) && /failure\.tailSource = 'stderr'/.test(KIT),
      '§0h ★★ F8 回执承诺的那条尾部在引擎写 stdout 时放 stdout 尾部，`tailSource` 说明来源（不再指向空的 stderrTail）')
    // F1 — the sanctioned settlement on a locked card.
    ok(/rulingSettlement === null/.test(TOOLS_SRC) && /THE ONE SANCTIONED EDIT ON A LOCKED CARD IS A RULING SETTLEMENT/.test(TOOLS_SRC),
      '§0i ★★★ F1 锁定卡的唯一例外是「裁决落值」（p + debate_ruling），且工具说明里写明')
    ok(/debate_ruling must be an object carrying the ruled value/.test(TOOLS_SRC) && /a ruling settlement must set p to the ruled value/.test(TOOLS_SRC),
      '§0j ★★ F1 落值形状被核：必须给 0|1，且 p 必须等于该值（不是新估值）')
    ok(/subject: "' \+ propositionId \+ '"/.test(TOOLS_SRC) && /statement: ' \+ quoted\(/.test(TOOLS_SRC),
      '§0k ★★ F1 `correction.call` 现在带上卡的 statement/value/motive 与 `debate_ruling.subject`（照抄即可执行）')
    ok(/lockedCardNote/.test(TOOLS_SRC) && /settlement is ADMITTED even on a locked card/.test(TOOLS_SRC),
      '§0l ★ F1 回执告诉读者：内容不许改、概率可以按裁决落值')
    // F2 — hydrate the mirror before refusing, and name both job faces.
    ok(/const leanFace = kernel && kernel\.lean/.test(TOOLS_SRC) && /typeof leanFace\.listMirrors === 'function'/.test(TOOLS_SRC)
      && /await leanFace\.listMirrors\(\)/.test(TOOLS_SRC) && /durable job mirror knows that id/.test(TOOLS_SRC) && /Formal\/Jobs\/<id>\.json/.test(TOOLS_SRC),
      '§0m ★★★ F2 `fidelity_conclude` 在拒之前先水合 Lean 镜像，并把搜查的两个范围写进 refusal')
    ok(/TWO JOB FACES ARE NOT ONE/.test(TOOLS_SRC) && /Math\/Jobs/.test(TOOLS_SRC),
      '§0n ★★ F2 `vibe_v5_lean_job` 说明 Lean 镜像 `Formal/Jobs` 与计算作业 `Math/Jobs` 不是一回事')
    // F5 — the state row is compare-and-set.
    ok(/was changed by another writer between this call/.test(KIT) && /const seen = state && state\.__seen/.test(KIT),
      '§0o ★★★ F5 论文状态行写前比 revision —— 并发写被具名拒，不再静默丢写')
    // F7 — the floor says whether it could have bitten.
    ok(/bitesWhen/.test(TOOLS_SRC) && /vacuous/.test(TOOLS_SRC) && /cannot reach VMU_MEETING_QUORUM_LOST/.test(TOOLS_SRC),
      '§0p ★★ F7 `floor.gate` 带 `vacuous` 与 `bitesWhen`（本名册下该闸恒满足，不是没接线）')
    // P1 — the framework's own repair advice uses the declared shape.
    ok(/next = code === LEADERSHIP_STATES\.CHAIR_WITHOUT_ID\s*\n\s*\? 'vibe_v5_set \{"key":"vmu\.turn\.leaderId"/.test(LEAD),
      '§0q ★★ P1 修复建议改成 `vibe_v5_set {key,value,why}`（configure 不接受 member）')
  }

  console.log('=== 1. 真调用：编辑者归一化、锁定卡的裁决落值、Lean 镜面具名拒 ===')
  {
    const b = await boot()
    ok(Boolean(TOOL(b.specs, 'vibe_v5_paper')), '§1a 装配发布了 `vibe_v5_paper`')
    // F4: a CHAIR-SEATED member id is accepted and recorded as the role word, so finalisation stays reachable.
    const started = await call(b.specs, 'vibe_v5_paper', { action: 'start', target: 'p-run152-a', participants: ['r-1'], editor: 'r-chair' })
    ok(started.ok === true, '§1b ★★★ F4 用院士席成员 id 建论文不再埋雷（start 成功）', show(started))
    const statusA = await call(b.specs, 'vibe_v5_paper', { action: 'status', target: 'p-run152-a' })
    const editorNow = statusA && statusA.paper && statusA.paper.editor
    ok(editorNow === 'academician', '§1c ★★★ F4 卡上记的 editor 是 "academician"（不是被拒的成员 id）', editorNow)
    // F4: a NON-chair member id is refused by name BEFORE the paper exists.
    const badEditor = await call(b.specs, 'vibe_v5_paper', { action: 'start', target: 'p-run152-b', participants: ['r-1'], editor: 'r-1' })
    ok(badEditor.ok === false && badEditor.code === 'VMU_INVALID_ARGUMENT' && /neither the academician role nor a member seated in the chair slot/.test(String(badEditor.message || '')),
      '§1d ★★ F4 非院士席成员 id 在 start 就被具名拒（而不是等到定稿那一步）', show(badEditor))
    // F1: write a card with a finished proof (locked), then settle its probability by ruling — allowed — and prove that a
    // plain write on the same card is still refused.
    const card = await call(b.specs, 'vibe_v5_record_proposition', {
      statement: 'run152 §1 命题：n+n=2n', value: 1, motive: '算术恒等', p: 0.99, proof_ref: 'Members/r-1/Propos/run152.md#正式证明', proof_state: 'complete', member: 'r-1',
    })
    ok(card.ok === true && typeof card.recordId === 'string', '§1e 写了一张已完成的卡（p=0.99，proof_state complete）', show(card))
    const cardId = card && card.recordId
    const plain = await call(b.specs, 'vibe_v5_record_proposition', {
      id: cardId, statement: 'run152 §1 命题：n+n=2n', value: 1, motive: '算术恒等', p: 1, member: 'r-1',
    })
    ok(plain.ok === false && plain.code === 'VMU_STATE' && /is locked/.test(String(plain.message || '')),
      '§1f ★★ 锁定卡上的普通写入仍被具名拒（L14 没有被放松）', show(plain))
    const settled = await call(b.specs, 'vibe_v5_record_proposition', {
      id: cardId, statement: 'run152 §1 命题：n+n=2n', value: 1, motive: '算术恒等', p: 1,
      debate_ruling: { subject: cardId, value: 1, mode: 'unanimous', n: 2, decided: true, meeting: 'm-deb', by: 'r-chair' }, member: 'r-1',
    })
    ok(settled.ok === true && settled.settled === true, '§1g ★★★ F1 裁决落值在锁定卡上被接受（L53 要求的写改真能执行）', show(settled))
    const afterSettle = await call(b.specs, 'vibe_v5_paper', { action: 'status', target: 'p-run152-a' })
    ok(Boolean(afterSettle) && afterSettle.ok === true, '§1h 论文 status 在卡变动后仍可读（没被锁死）', show(afterSettle))
    // F2: an unknown Lean job names BOTH scopes in the hint (this deployment has no Lean face at all, so the message is
    // the "not readable on this deployment" one — the hint must still distinguish the two job directories).
    const leanMiss = await call(b.specs, 'vibe_v5_fidelity_conclude', { card: cardId, fidelity: 'conform', lean_job: 'lean-404', member: 'r-chair' })
    ok(leanMiss.ok === false && leanMiss.code === 'VMU_PACK_V5R_FIDELITY_LEAN_NOT_PASSED'
      && /not readable on this deployment|durable job mirror/.test(String(leanMiss.message || '')),
      '§1i ★★ F2 读不到的 Lean 作业：refusal 说清它查过哪里', show(leanMiss))
    ok(/Formal\/Jobs/.test(String((leanMiss && leanMiss.hint) || '')),
      '§1j ★ F2 hint 指对目录（`Formal/Jobs/<id>.json`，不是 `Math/Jobs`）', String((leanMiss && leanMiss.hint) || '').slice(0, 120))
  }

  console.log('=== 2. 句子的重量：这些是回执/说明书里必须留住的真话 ===')
  {
    ok(/ONCE A CARD IS COMPLETE IT IS LOCKED/.test(TOOLS_SRC) && /SANCTIONED EDIT ON A LOCKED CARD/.test(TOOLS_SRC),
      '§2a 工具说明同时说了「锁」与「裁决落值是唯一例外」')
    ok(/the lock protects the PROOF CONTENT/.test(TOOLS_SRC) || /lock protects the PROOF CONTENT/.test(TOOLS_SRC),
      '§2b 例外只到「概率」为止，理由写清（内容锁、概率由裁决定）')
    ok(!/advance it back to writing/.test(TOOLS_SRC) && /turns it back to writing/.test(KIT),
      '§2c 不再教一条不能走的回退路')
    ok(/office may finalise only after consulting the institute/.test(KIT),
      '§2d 所办代定稿仍如实写成「本构建里的具名缺口」，没有假装它能过')
    ok(/bitesWhen/.test(TOOLS_SRC) && /uncovered/.test(TOOLS_SRC),
      '§2e floor 回执同时给「差谁」与「什么时候会咬人」')
    ok(/RUN 152/.test(PACK) && /RUN 152/.test(LEAD),
      '§2f pack 与 leadership 的改动带 RUN 152 注记（可追溯）')
  }
} finally {
  const fs = await import('node:fs/promises')
  await Promise.all(roots.map((r) => fs.rm(r, { recursive: true, force: true }).catch(() => {})))
}

console.log('=== VMU RUN152 REAL-RUN FIXES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) console.error(failures.map((f) => '  - ' + f).join('\n'))
process.exit(failed ? 1 : 0)
