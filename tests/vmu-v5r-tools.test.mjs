// tests/vmu-v5r-tools.test.mjs — PHASE 7 / goal 2 (first batch): the v5r PACK-DECLARED tool face (6 tools).
//
// THE DEFECT CLASS THIS PINS (measured in docs/acceptance/phase7-coverage-matrix.md §2): `packs/v5r` declared **0
// tools** while its prompts taught members to call `vibe_v5_record_progress/_proposition/_method/_subproblem`,
// `vibe_v5_say` and `vibe_v5_message` — 17 taught names, 0 declared. So this suite proves, on the REAL entry:
//   · with no pack, NOT ONE v5r tool exists (zero mechanism);
//   · with packs=['v5r'], exactly the six DECLARED names are published, and the framework tool table holds none;
//   · every tool receipt is a JSON STRING whose parse is an OBJECT (stringified exactly once — `receiptMeta`);
//   · a refusal carries a REGISTERED code + a hint (never a bare exception, never a silent empty success);
//   · the tools really do their job (a record lands on its track, a group message exists, mail reaches a member);
//   · `say` refuses an EMPTY sender and an UNKNOWN sender by name — it never invents a speaker;
//   · the per-role tool-discovery SECTIONS are role-scoped and non-source-derived (discoverability, part ②);
//   · unload RETRACTS the declarations, so the names stop being publishable.
//
// RULE E: every loop/every() below is preceded by an explicit NON-EMPTY assertion.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const J = (o) => JSON.stringify(o)

const entry = await import(pathToFileURL(ENTRY).href)
const v5r = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'index.js')).href)
const toolsMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js')).href)

/** The six names the pack is expected to declare — usually read FROM the manifest, asserted once against this list. */
const EXPECTED = ['vibe_v5_record_progress', 'vibe_v5_record_proposition', 'vibe_v5_record_method',
  'vibe_v5_record_subproblem', 'vibe_v5_say', 'vibe_v5_message']
/** The codes a refusal may carry: REGISTERED ones only (docs/03 §8). */
const REGISTERED_CODES = ['VMU_INVALID_ARGUMENT', 'VMU_NO_SUCH_OBJECT', 'VMU_STATE', 'VMU_ENGINE_UNAVAILABLE',
  'VMU_NOT_FOUND', 'VMU_CONFLICT', 'VMU_QUOTA_EXCEEDED']

const boot = async (config = {}) => {
  const state = { specs: [], effects: [] }
  const ctx = {
    effect(fn, label) { state.effects.push(label); return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, names: state.specs.map((s) => s.name), specOf: (n) => state.specs.find((s) => s.name === n) }
}
const receipt = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { raw: undefined, parsed: undefined, missing: true }
  const raw = await spec.execute(args, {})
  let parsed
  try { parsed = JSON.parse(raw) } catch { parsed = undefined }
  return { raw, parsed, missing: false }
}

const countOf = (kernel, track) => {
  const listed = kernel.records.list({ track, limit: 500 })
  if (Array.isArray(listed.items)) return listed.items.length
  if (typeof listed.available === 'number') return listed.available
  if (typeof listed.total === 'number') return listed.total
  return -1
}
// TEMP ROOT ON D: — this repository's rule is that scratch files never land on the C: drive (AGENTS.md §6).
const root = await mkdtemp(join('D:/_tmp', 'vmu-v5r-tools-'))
try {
  // ── ① ZERO MECHANISM ────────────────────────────────────────────────────────────────────────────────────────
  console.log('=== 1. NO PACK ⇒ NOT ONE v5r TOOL EXISTS ===')
  const bare = await boot({ root })
  ok(EXPECTED.length === 6, 'the expected list is non-empty (RULE E)', EXPECTED.length)
  const bareHits = EXPECTED.filter((n) => bare.names.includes(n))
  ok(bareHits.length === 0, 'without the pack none of the six names is published', bareHits)

  // ── ② THE DECLARATION (the names come FROM the pack) ───────────────────────────────────────────────────────
  console.log('=== 2. WITH packs=["v5r"] THE SIX DECLARED NAMES ARE PUBLISHED ===')
  const PACK = v5r.PACK
  ok(Array.isArray(PACK.tools) && PACK.tools.length === 6, 'the loaded manifest DECLARES six tools', PACK.tools && PACK.tools.length)
  const declaredNames = PACK.tools.map((t) => t.name)
  ok(declaredNames.length > 0 && EXPECTED.filter((n) => declaredNames.includes(n)).length === EXPECTED.length,
    'the declaration is exactly the six expected names', declaredNames)
  const v5rBoot = await boot({ root, packs: ['v5r'] })
  const published = EXPECTED.filter((n) => v5rBoot.names.includes(n))
  ok(published.length === EXPECTED.length, 'all six are published through the real host adapter', { published, names: v5rBoot.names.length })
  ok(v5rBoot.handle.kernel.packTools().length === 6, 'the KERNEL holds the six declarations', v5rBoot.handle.kernel.packTools().length)
  const kernelStatus = v5rBoot.handle.kernel.status({ detail: 'summary' })
  ok(Array.isArray(kernelStatus.packTools) && kernelStatus.packTools.length === 6,
    'kernel.status() reports the declared names (observable, not implicit)', kernelStatus.packTools && kernelStatus.packTools.length)
  const hostNames = Object.values((await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'host.js')).href)).TOOL_NAMES)
  const leaked = EXPECTED.filter((n) => hostNames.includes(n))
  ok(leaked.length === 0, 'no v5r tool name exists in the framework tool table', leaked)

  // ── ③ THE TOOLS REALLY DO THEIR JOB ────────────────────────────────────────────────────────────────────────
  console.log('=== 3. THE HANDLERS LAND ON THE REAL FACES ===')
  const kernel = v5rBoot.handle.kernel
  // A live member is required by `say` (the roster is created by the pack's slots; hire seats one).
  const hired = await kernel.members.hire({ id: 'r-1', slot: 'member' })
  await kernel.members.hire({ id: 'r-2', slot: 'member' })
  ok(!!hired && kernel.members.roster().some((m) => m.id === 'r-1') && kernel.members.roster().some((m) => m.id === 'r-2'),
    'precondition: TWO real members are on the roster', kernel.members.roster().map((m) => m.id))

  const before = countOf(kernel, 'progress')
  const progress = await receipt(v5rBoot, 'vibe_v5_record_progress', { content: '本轮推导：先证引理 A', member: 'r-1' })
  ok(typeof progress.raw === 'string', 'record_progress: execute() returns a STRING', typeof progress.raw)
  ok(progress.parsed && progress.parsed.ok === true && progress.parsed.track === 'progress', 'record_progress writes onto the progress track', progress.parsed)
  ok(progress.parsed && typeof progress.parsed.receiptMeta === 'object',
    'record_progress: it went through the ONE serializer (receiptMeta present)', progress.parsed && Object.keys(progress.parsed.receiptMeta || {}).length)
  const after = countOf(kernel, 'progress')
  ok(after === before + 1, 'the progress track grew by exactly one', { before, after })

  const propBefore = countOf(kernel, 'propositions')
  const prop = await receipt(v5rBoot, 'vibe_v5_record_proposition',
    { id: 'p-tools-1', title: '引理 A', statement: 'A 成立', value: 3, motive: '主证明的一步', p: 1 })
  ok(prop.parsed && prop.parsed.ok === true && prop.parsed.track === 'propositions', 'record_proposition writes onto the propositions track', prop.parsed)
  ok(prop.parsed && prop.parsed.settled === true, 'p=1 settles the card (the original card key is carried, not interpreted)', prop.parsed && prop.parsed.settled)
  ok(countOf(kernel, 'propositions') === propBefore + 1, 'the propositions track grew by exactly one', propBefore)
  const meth = await receipt(v5rBoot, 'vibe_v5_record_method', { content: '方法：反证 + 极值', value: 2, motive: '复用', p: 0 })
  ok(meth.parsed && meth.parsed.ok === true && meth.parsed.track === 'methods' && meth.parsed.settled === true,
    'record_method writes onto the methods track (p=0 ⇒ settled, which is what the pack stance demands)', meth.parsed)
  // ★ THE PACK'S OWN STANCE, asserted rather than hidden: `vmu.records.requireSettledRecords:true` (declared in
  // v5r-core's manifest) refuses an UNDECIDED card BY NAME. The original allowed p∈(0,1) drafts; this is the one
  // place where the institution's declared policy is stricter than v5r, and the refusal is named, never silent.
  const draft = await receipt(v5rBoot, 'vibe_v5_record_proposition', { statement: '未定稿的命题', value: 1, motive: '待定', p: 0.5 })
  ok(draft.parsed && draft.parsed.ok === false && draft.parsed.code === 'VMU_STATE' && /SETTLED/.test(String(draft.parsed.message)),
    '★ an UNDECIDED card (p=0.5) is refused by name — the pack declares settled-only archiving (policy, not a bug)', draft.parsed)
  const sub = await receipt(v5rBoot, 'vibe_v5_record_subproblem', { statement: '子问题：边界情形', value: 1, motive: '补洞', p: 0 })
  ok(sub.parsed && sub.parsed.ok === true && sub.parsed.track === 'problems', 'record_subproblem writes onto the problems track', sub.parsed)

  const said = await receipt(v5rBoot, 'vibe_v5_say', { member: 'r-1', text: '各位，引理 A 已进库' })
  ok(said.parsed && said.parsed.ok === true && said.parsed.via === 'chat' && said.parsed.member === 'r-1',
    'say (no `to`) speaks in the GROUP CHAT as the real member', said.parsed)
  const dm = await receipt(v5rBoot, 'vibe_v5_say', { member: 'r-1', text: '私信：请看引理 A', to: 'r-2' })
  ok(dm.parsed && dm.parsed.ok === true && dm.parsed.via === 'mailbox', 'say with `to` uses the MAILBOX (per-recipient durable mail)', dm.parsed)
  const msg = await receipt(v5rBoot, 'vibe_v5_message', { to: 'r-1', content: '所办通知：本周五开会' })
  ok(msg.parsed && msg.parsed.ok === true && msg.parsed.from === 'office', 'message relays in the OFFICE voice (the original sender)', msg.parsed)

  // ── ④ REFUSALS ARE NAMED (the 一正一反 the fixture verified: empty sender) ──────────────────────────────────
  console.log('=== 4. REFUSALS CARRY A REGISTERED CODE + A HINT ===')
  const noP = await receipt(v5rBoot, 'vibe_v5_record_proposition', { statement: '缺 p 的命题' })
  ok(noP.parsed && noP.parsed.ok === false && noP.parsed.code === 'VMU_INVALID_ARGUMENT', 'a card missing its REQUIRED p is refused by name', noP.parsed)
  ok(noP.parsed && REGISTERED_CODES.includes(noP.parsed.code) && typeof noP.parsed.hint === 'string' && noP.parsed.hint.length > 0,
    'the card refusal carries a REGISTERED code AND a next step (hint)', noP.parsed && { code: noP.parsed.code, hint: noP.parsed.hint })
  const emptySender = await receipt(v5rBoot, 'vibe_v5_say', { text: '没有发言者的一句话' })
  ok(emptySender.parsed && emptySender.parsed.ok === false && emptySender.parsed.code === 'VMU_INVALID_ARGUMENT',
    '★ say with an EMPTY sender is refused by name (a pack handler has no agent→member map: it never invents one)', emptySender.parsed)
  const unknownSender = await receipt(v5rBoot, 'vibe_v5_say', { member: 'r-does-not-exist', text: '未知发言者' })
  ok(unknownSender.parsed && unknownSender.parsed.ok === false && unknownSender.parsed.code === 'VMU_NO_SUCH_OBJECT',
    '★ say with an UNKNOWN member is refused by name with the roster in the message', unknownSender.parsed)
  const badTrack = await receipt(v5rBoot, 'vibe_v5_record_progress', { content: 'x', track: 'no-such-track' })
  ok(badTrack.parsed && badTrack.parsed.ok === false && badTrack.parsed.code === 'VMU_INVALID_ARGUMENT',
    'an unknown progress track is refused by name (vmu.records.tracks declares the set)', badTrack.parsed)

  // ── ⑤ THE DISCOVERY SECTIONS (part ②: a tool a member cannot SEE is a paper capability) ────────────────────
  console.log('=== 5. PER-ROLE TOOL DISCOVERY SECTIONS (non-source-derived, role-scoped, unique markers) ===')
  const sections = PACK.sections
  ok(Array.isArray(sections) && sections.length > 0, 'the manifest declares a non-empty section list (RULE E)', sections.length)
  const toolSections = sections.filter((s) => s && s.source === 'v5r-fixture:tools')
  ok(toolSections.length === 3, 'three tool-discovery sections exist (one per role)', toolSections.map((s) => s.name))
  const rolesScoped = toolSections.map((s) => s.scope && s.scope.role)
  ok(J(rolesScoped.sort()) === J(['academician', 'researcher', 'temp']), 'each is scoped to exactly ONE role (no cross-role prelude)', rolesScoped)
  const markers = toolSections.map((s) => String(s.text).split('\n')[0])
  ok(new Set(markers).size === 3 && markers.every((m) => m.startsWith('【本轮可用的工具｜')),
    'every marker is unique and names its own role', markers)
  const placeholders = toolSections.filter((s) => /\{\{/.test(String(s.text)))
  ok(placeholders.length === 0, 'no tool-discovery section contains a {{ }} placeholder (static per-role text)', placeholders.map((s) => s.name))
  const sourceDerived = toolSections.filter((s) => String(s.source).startsWith('v5r-charter:') || String(s.source).startsWith('v5r-corpus:'))
  ok(sourceDerived.length === 0, 'none of them is source-derived (the charter verbatim gate stays untouched)', sourceDerived.map((s) => s.name))

  // The sections must really RENDER for their role, and NOT for another role — the observable difference.
  const promptMod = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'prompt', 'index.js')).href)
  const pipe = promptMod.createPromptPipeline({ sections, bindings: PACK.bindings || [], settings: {}, counts: {} })
  const textFor = async (role) => (await pipe.assemble({ member: 'r-1', role, roleLabel: role, phase: 'normal' })).text
  const asResearcher = await textFor('researcher')
  const asTemp = await textFor('temp')
  const asAcademician = await textFor('academician')
  ok(asResearcher.includes('vibe_v5_record_proposition') && asResearcher.includes('【本轮可用的工具｜研究员】'),
    'the researcher\'s assembly carries the researcher tool list', asResearcher.length)
  ok(asAcademician.includes('vibe_v5_message') && asAcademician.includes('【本轮可用的工具｜院士】'),
    'the academician sees the office-relay tool (the researcher\'s list does not have it)', asAcademician.length)
  // THE SUBSET IS CHECKED ON THE SECTION ITSELF (the assembled prompt legitimately mentions these names elsewhere in
  // the charter, so a whole-prompt grep would confuse prose with a tool list).
  const tempSection = toolSections.filter((s) => s.scope && s.scope.role === 'temp')[0]
  const researcherSection = toolSections.filter((s) => s.scope && s.scope.role === 'researcher')[0]
  const acadSection = toolSections.filter((s) => s.scope && s.scope.role === 'academician')[0]
  ok(!!tempSection && !!researcherSection && !!acadSection, 'precondition: all three role sections are present', { temp: !!tempSection, res: !!researcherSection, acad: !!acadSection })
  ok(!String(tempSection.text).includes('vibe_v5_record_proposition') && String(tempSection.text).includes('vibe_v5_record_progress'),
    'the TEMP section lists only its own subset (progress + say, no library cards)', String(tempSection.text).length)
  ok(String(tempSection.text).includes('vibe_v5_say') && !String(tempSection.text).includes('vibe_v5_message'),
    'the temp list has `say` and NOT the office-relay tool', String(tempSection.text).length)
  ok(asTemp.includes('【本轮可用的工具｜临时成员】') && !asTemp.includes('【本轮可用的工具｜研究员】'),
    'the TEMP assembly carries its OWN marker and not another role\'s', asTemp.length)
  ok(!asResearcher.includes('【本轮可用的工具｜临时成员】') && !asAcademician.includes('【本轮可用的工具｜研究员】'),
    'no role sees another role\'s tool list (no cross-role leak)', { researcherHasTemp: asResearcher.includes('｜临时成员'), acadHasRes: asAcademician.includes('｜研究员') })

  // ── ⑥ UNLOAD RETRACTS THE DECLARATIONS ─────────────────────────────────────────────────────────────────────
  console.log('=== 6. UNLOAD RETRACTS THE NAMES (the pack is the mechanism, and it comes off) ===')
  const km = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')).href)
  const pm = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'kernel', 'pack.js')).href)
  const k2 = km.createKernel({ clock: () => 1000, root })
  const loader = pm.createPackLoader({ kernel: k2, registry: k2.registry })
  const applied = await loader.apply({ id: 'v5r-tools-probe', version: '1.0.0', tools: toolsMod.V5R_PACK_TOOLS })
  ok(applied && applied.ok === true, 'a manifest carrying the six declarations APPLIES', applied && (applied.code || applied.id))
  ok(k2.packTools().length === 6, 'the kernel holds the six names after apply', k2.packTools().length)
  const unloaded = await loader.unload('v5r-tools-probe')
  ok(unloaded && unloaded.ok === true && unloaded.residueFree === true, 'unload reports no residue', unloaded)
  ok(k2.packTools().length === 0, 'the declarations are RETRACTED (nothing left to publish)', k2.packTools().length)
} finally {
  // The store writes atomically through temp+rename, so a removal can race one in-flight file: retry, and never let
  // a cleanup failure turn a green run red (the assertions above already reported the truth).
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {})
}

console.log('\n=== VMU V5R TOOLS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) { console.error('FAILURES:'); for (const f of failures) console.error('  - ' + f) }
process.exit(failed > 0 ? 1 : 0)
