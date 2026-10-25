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
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

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
const cardDefs = toolsSource.match(/name: 'vibe_v5_record_proposition'[\s\S]{0,2600}/)
ok(!!cardDefs, '5 the proposition-card tool definition is findable')
const cardBlock = cardDefs ? cardDefs[0] : ''
ok(cardBlock.includes('REGISTRAR DUTY'), '6 the office duty paragraph is in the TOOL DESCRIPTION (prompt-visible)')
ok(cardBlock.includes('owner') && cardBlock.includes('member'), '7 the duty says the owner is the `member` argument')
ok(/member:\s*\{\s*type:\s*'string'\s*\}/.test(cardBlock), '8 `member` is a DECLARED parameter (not an undeclared argument)')

// ── 3. attribution source: the one place that turns `member` into the record's owner
ok(/const by = has\(args\.member\) \? str\(args\.member\) : null/.test(toolsSource),
  '9 gatedCardHandler derives the author from args.member')
const recordsSource = read('vibe-math-vmu/kernel/records.js')
ok(/owner: rec\.by/.test(recordsSource), '10 the record\'s owner IS `by` (attribution is a kernel fact, not prose)')

// ── 4. teeth: the two texts are NOT the same paragraph (a single copy would satisfy neither side honestly)
ok(!cardBlock.includes('记录本契约') && !fixtureText.includes('REGISTRAR DUTY'),
  '11 the two sides carry different duties (member: draft; office: register), not one shared slogan')

console.log('=== VMU MEMBER REGISTRATION CONTRACT: ' + passed + ' passed, ' + failed + ' failed ===')
process.exit(failed ? 1 : 0)
