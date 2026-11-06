/**
 * GATE — 第 10 轮：B（成员真跑 + 所办代记）的**契约**层。
 *
 * WHY THIS EXISTS: under activation/subagents delivery a member turn runs in its OWN kernel instance, so a card a
 * member writes is a PRIVATE DRAFT — the institute's record book never sees it (measured: a live run's record book
 * had 12 records and every owner was the office). The user's ruling (m21840) is B: members run for real and the
 * OFFICE registers on their behalf. The attribution capability already existed
 * (`gatedCardHandler`: `by = args.member` → `records.js:332 owner: rec.by`), so what was missing is the CONTRACT:
 * the member must be told its own record book is a draft, and the office must be told it is the registrar.
 *
 * This gate pins the contract TEXT and the attribution SOURCE. It does not claim the live behaviour; that is what
 * the multi-agent acceptance run is for.
 */
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

let passed = 0, failed = 0
const fail = (name, detail) => { failed++; console.log('FAIL ' + name + (detail ? ' — ' + detail : '')) }
const ok = (cond, name, detail) => { if (cond) { passed++ } else fail(name, detail) }

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/[\/]$/, '')
const read = (rel) => readFileSync(REPO + '/' + rel, 'utf8')

// ── 1. member-facing contract, on the section members actually receive
const prompts = await import('../vibe-math-vmu/packs/v5r/prompts/v5r-core.js')
const fixture = prompts.v5rFixtureTools
const rawText = fixture && (typeof fixture.text === 'function' ? fixture.text() : fixture.text)
ok(!!fixture, '1 the tool-catalogue section is exported')
const fixtureText = Array.isArray(rawText) ? rawText.join('\n') : String(rawText || '')
ok(fixtureText.includes('记录本契约'), '2 member contract paragraph present', fixtureText.slice(0, 80))
ok(fixtureText.includes('草稿') && fixtureText.includes('回执') && fixtureText.includes('所办'),
  '3 the contract names draft / receipt / office (all three, not a vague hint)')
const roles = (fixture.scope && fixture.scope.role) || []
ok(roles.includes('chair') && roles.includes('member') && !roles.includes('office'),
  '4 the contract goes to SEATS only (the office must not read its own duty as "keep a draft")', JSON.stringify(roles))

// ── 2. office-facing registrar duty, on the tool the office must use
const toolsSource = read('vibe-math-vmu/packs/v5r/tools.js')
const cardDefs = toolsSource.match(/name: 'vibe_v5_record_proposition'[\s\S]{0,5200}/)
ok(!!cardDefs, '5 the proposition-card tool definition is findable')
const cardBlock = cardDefs ? cardDefs[0] : ''
ok(cardBlock.includes('REGISTRAR DUTY'), '6 the office duty paragraph is in the TOOL DESCRIPTION (prompt-visible)')
ok(cardBlock.includes('owner') && cardBlock.includes('member'), '7 the duty says the owner is the `member` argument')
ok(/member:\s*\{\s*type:\s*'string'/.test(cardBlock), '8 `member` is a DECLARED parameter (not an undeclared argument)')

// ── 3. attribution source: the one place that turns `member` into the record's owner
ok(/const by = has\(args\.member\) \? str\(args\.member\)\s*: \(\(typeof ctx\.callerMember/.test(toolsSource),
  '9 gatedCardHandler derives the author from args.member (a caller turn is the fallback) — RUN 249 kept the source, changed the fallback')
ok(toolsSource.includes("const SOURCE_WORD = /^(argument|caller|unknown|field-argument") &&
  toolsSource.includes("writerSource = writer === null ? 'unknown'"),
  '9b ★ RUN 249 / F-05: the ruling writer is resolved by NAME and the receipt reports WHICH source produced it (a field-source word is never an author)')
ok(!/by: has\(by\) \? str\(by\) : 'argument'/.test(toolsSource),
  '9c ★★ the measured defect is gone: no write path falls back to the literal author "argument" (if someone restores that, this gate goes red)')
const recordsSource = read('vibe-math-vmu/kernel/records.js')
// RUN 239: `owner` is now a STORED field, so a correction by another seat cannot silently transfer ownership;
// `by` is reported separately as the WRITER. What this contract still means: with no explicit transfer the owner is the author.
ok(/owner: rec.owner === undefined || rec.owner === null ? rec.by : rec.owner/.test(recordsSource), '10 the record owner defaults to `by` and only changes by an explicit transfer (attribution is a kernel fact, not prose)')

// ── 4. teeth: the two texts are NOT the same paragraph (a single copy would satisfy neither side honestly)
ok(!cardBlock.includes('记录本契约') && !fixtureText.includes('REGISTRAR DUTY'),
  '11 the two sides carry different duties (member: draft; office: register), not one shared slogan')

// ── 5. RUNTIME: attribution is a KERNEL FACT, and a missing author is a NAMED refusal ─────────────────────
// The pins above are source-shaped; this block boots the real pack and asks the faces. RUN 249 / F-04 measured rows
// whose owner/writer/by were all null: the write path must refuse by name instead of filing one.
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const entry = await import(pathToFileURL(ENTRY).href)
const root = mkdtempSync(join('D:/_tmp', 'vmu-registration-contract-'))
const rtSpecs = []
const rtHandle = entry.apply({ effect(fn) { return fn() }, on() { return () => {} }, tools: { register: async (spec) => { rtSpecs.push(spec); return () => {} } } }, { clock: () => 1000, root, packs: ['v5r'] })
await rtHandle.ready()
const rtCall = async (name, args) => {
  const spec = rtSpecs.find((x) => x.name === name)
  if (!spec) return { ok: false, missing: true }
  try { return JSON.parse(await spec.execute(args, {})) } catch (e) { return { ok: false, thrown: String(e && e.message) } }
}
await rtHandle.kernel.members.hire({ id: 'r-1', slot: 'member' })
const noAuthor = await rtCall('vibe_v5_feedback', { op: 'add', category: 'x', route: 'institute', phenomenon: 'p', impact: 'i', action: 'a' })
ok(noAuthor && noAuthor.ok === false && noAuthor.code === 'VMU_INVALID_ARGUMENT',
  '12 ★★★ RUNTIME: a feedback write with NO author is REFUSED by name (the measured defect filed a row whose owner/writer/by were all null)',
  { code: noAuthor && noAuthor.code, message: String(noAuthor && noAuthor.message || '').slice(0, 160) })
ok(noAuthor && /no author/.test(String(noAuthor.message || '')) && /member/.test(String(noAuthor.hint || '')),
  '12b ★ the refusal says WHAT is missing and HOW to fix it (a rail with a door, not a dead end)',
  { hint: String(noAuthor && noAuthor.hint || '').slice(0, 160) })
const card = await rtCall('vibe_v5_record_proposition', { statement: '契约层：作者是内核事实', value: 'objects', motive: 'RUN 249 §5', p: 0.5, member: 'r-1' })
ok(card && card.ok === true && typeof card.recordId === 'string' && card.recordId !== '',
  '13 ★ RUNTIME precondition: an attributed card is admitted', card && { code: card.code })
const recorded = card && card.recordId !== undefined ? rtHandle.kernel.records.get({ id: card.recordId }) : null
const cardRow = recorded && recorded.record ? recorded.record : recorded
ok(cardRow && cardRow.owner === 'r-1',
  '14 ★★★ and the ROW carries that member as OWNER — the egg is in the record book, not in the receipt',
  { owner: cardRow && cardRow.owner, by: cardRow && cardRow.by })
rmSync(root, { recursive: true, force: true })

console.log('=== VMU MEMBER REGISTRATION CONTRACT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
