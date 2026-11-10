// ★ RUN 77 / TB-2727 (task-210) — THE BRIEF'S RULER MUST BE THE PRODUCT'S RECEIPT.
//
// MEASURED (run 77, build f84f6a31, all 13 checkpoints PASS): the brief template §3.2 said one thing about the
// parked refusal and the product did another. It said `VMU_TURN_ALREADY_PARKED` does NOT carry `parkedReason`;
// the receipt DOES, at the top level (same sentence as `parkedFacts.parkedReason`) plus `parkedMeans` and a
// `REACHABLE INSTEAD:` hint — TB-2710 promoted the reason to the top level, the template kept the old claim.
// A wrong ruler is more expensive than a wrong product: the next round reads a correct receipt as a defect.
//
// This suite pins the repair and, more importantly, keeps the pin honest:
//   §1 the template's §3.2 V8 row declares the fields a brief writer is told to expect
//   §2 the product really answers with those fields (REAL run of the two parked refusals, keys read off the receipt)
//   §3 the researcherCount arithmetic in §1 is the arithmetic `vibe_v5_start` really performs
//   §4 anti-lamps: drop a declared field / invent one / lose the table ⇒ the check goes red and NAMES the name
//
// A missing corpus or an unparseable row is a FAILURE, never a skip: "could not read the ruler" is exactly the
// failure mode this suite exists to prevent.
//
// Run: node tests/brief-claims-match-product.test.mjs   Last line: N passed, M failed

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
// The brief template lives beside the repo (the same place taskbooks/TB-*.md live), not inside it.
const TEMPLATE = join(REPO, '..', 'taskbooks', 'RUN-BRIEF-TEMPLATE.md')
const TEMPLATE_ENV = 'VMU_BRIEF_TEMPLATE_PATH'

const NL = String.fromCharCode(10)
const fence = (obj) => ['```json', JSON.stringify(obj), '```'].join(NL)

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
const section = (t) => console.log(NL + t)

// ── THE PARSER (narrow on purpose: one table, one row, backticked names) ────────────────────────────────────────
// A claim is `{ code, field, kind: 'top' | 'fact' }`. `hint` is special: its claim is that the hint CONTAINS the
// executable marker, not that a key exists. Anything else in the cell (prose, code names) is ignored, and the
// caller requires claims.length > 0 — an empty parse is a failure, not a pass.
const parseV8Claims = (text) => {
  const lines = String(text).split('\n')
  const h = lines.findIndex((l) => /^### 3\.2/.test(l))
  if (h === -1) return { claims: [], why: 'no "### 3.2" section heading' }
  const row = lines.slice(h).find((l) => /^\|\s*V8\s*\|/.test(l))
  if (!row) return { claims: [], why: 'no "| V8 |" row inside §3.2' }
  const cells = row.split('|')
  if (cells.length < 5) return { claims: [], why: 'V8 row has fewer than four columns' }
  const expect = cells[3]
  const claims = []
  for (const segment of expect.split('；')) {
    const code = (segment.match(/VMU_[A-Z][A-Z_]+/) || [null])[0]
    if (!code) continue
    const factsBlock = segment.match(/`parkedFacts\{([^}]*)\}`/)
    const facts = factsBlock ? factsBlock[1].split(',').map((s) => s.trim()).filter(Boolean) : []
    const rest = segment.replace(/`parkedFacts\{[^}]*\}`/g, '')
    for (const m of rest.matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g)) {
      const name = m[1]
      if (name.startsWith('VMU_')) continue
      if (name === 'parkedFacts') { if (!facts.length) claims.push({ code, field: 'parkedFacts', kind: 'top' }); continue }
      if (name === 'hint') continue
      claims.push({ code, field: name, kind: 'top' })
    }
    for (const name of facts) claims.push({ code, field: name, kind: 'fact' })
    if (rest.includes('`hint`') && rest.includes('REACHABLE INSTEAD:')) claims.push({ code, field: 'hint', kind: 'marker', marker: 'REACHABLE INSTEAD:' })
  }
  const seen = new Set()
  const unique = claims.filter((c) => { const k = c.code + '|' + c.field + '|' + c.kind; if (seen.has(k)) return false; seen.add(k); return true })
  if (!unique.length) return { claims: [], why: 'V8 row parsed but yielded zero field claims' }
  return { claims: unique, why: null }
}

// The checker: declared names must be keys of the receipt the product really produced. A `fact` name must be a key
// of `parkedFacts`; a `marker` claim checks the hint sentence is present. Problems carry the NAME, so a red run
// tells the reader which name in the brief no longer matches the product.
//
// REQUIRED is not an exemption list — it is the one claim run 77 proved by hand and this suite must not silently
// lose: the ALREADY_PARKED refusal DOES carry a top-level `parkedReason`. A ruler that stops declaring it is the
// stale ruler this task repaired, so its absence is a red, not a smaller check.
const REQUIRED = [{ code: 'VMU_TURN_ALREADY_PARKED', field: 'parkedReason', kind: 'top' }]
const checkClaims = (claims, receipts) => {
  const problems = []
  for (const req of REQUIRED) {
    if (!claims.some((c) => c.code === req.code && c.field === req.field && c.kind === req.kind)) {
      problems.push(req.code + ': the ruler no longer declares ' + req.field + ' (run 77 measured this key on the receipt)')
    }
  }
  for (const c of claims) {
    const receipt = receipts[c.code]
    if (!receipt) { problems.push(c.code + ': no receipt was produced for this code'); continue }
    if (c.kind === 'top') {
      if (!Object.prototype.hasOwnProperty.call(receipt, c.field)) problems.push(c.code + ': declared field ' + c.field + ' is missing from the receipt')
      continue
    }
    if (c.kind === 'fact') {
      const facts = receipt.parkedFacts
      if (!facts || typeof facts !== 'object') { problems.push(c.code + ': declared parkedFacts block is missing from the receipt'); continue }
      if (!Object.prototype.hasOwnProperty.call(facts, c.field)) problems.push(c.code + ': declared parkedFacts field ' + c.field + ' is missing from the receipt')
      continue
    }
    if (c.kind === 'marker') {
      if (!(typeof receipt.hint === 'string' && receipt.hint.includes(c.marker))) problems.push(c.code + ': hint does not contain ' + c.marker)
    }
  }
  return problems
}

// ── THE FIXTURE (same parked shape as tests/vmu-run76-attribution-and-parked.test.mjs; no logic copied) ─────────
const entry = await import(pathToFileURL(ENTRY).href)
const roots = []
const boot = async () => {
  const root = await mkdtemp(join(tmpdir(), 'brief-claims-'))
  roots.push(root)
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    get() { return null },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const options = { clock: () => 1000, packs: ['v5r'], root, vmu: {}, deliverMode: 'caller' }
  const handle = entry.apply(ctx, options)
  await handle.ready()
  const K = handle.kernel
  await K.store.open()
  const call = async (name, args) => {
    const spec = specs.find((s) => s.name === name)
    if (!spec) throw new Error('tool not registered: ' + name)
    let raw
    try { raw = await spec.execute(args, { kernel: K }) } catch (e) { return { threw: true, err: e } }
    return { threw: false, receipt: typeof raw === 'string' ? JSON.parse(raw) : raw }
  }
  return { K, call }
}

// Produce the two parked refusals through the REAL kernel and read their receipts. The tool wrapper returns the
// refusal as a JSON receipt; an unexpected throw is a fixture failure, not a skip.
const parkedReceipts = async () => {
  const out = {}
  {
    const b = await boot()
    await b.K.members.hire({ id: 'r-1', slot: 'member' })
    const park = await b.call('vibe_vmu_turn', { op: 'step', member: 'r-1', members: ['r-1'], phase: 'normal', why: 'brief-claims: park once' })
    const parkedKernel = park.threw ? park.err : park.receipt
    if (!parkedKernel || parkedKernel.awaiting !== true) throw new Error('fixture: the caller-played step did not park a prompt')
    const again = await b.call('vibe_vmu_turn', { op: 'step', member: 'r-1', members: ['r-1'], phase: 'normal', why: 'brief-claims: dispatch again over the parked prompt' })
    out.VMU_TURN_ALREADY_PARKED = again.threw ? again.err : again.receipt
  }
  {
    const c = await boot()
    await c.K.members.hire({ id: 'r-1', slot: 'member' })
    const noOwner = await c.call('vibe_vmu_turn', { op: 'step', member: 'r-1', reply: fence({ progress: '这句回答没有可答的提示。' }) })
    out.VMU_TURN_PARKED_NEEDS_OWNER = noOwner.threw ? noOwner.err : noOwner.receipt
  }
  return out
}

const readTemplate = async () => {
  const override = process.env[TEMPLATE_ENV]
  const path = override && override.trim() ? override.trim() : TEMPLATE
  return { path, text: await readFile(path, 'utf8') }
}

try {
  // ── §1 THE TEMPLATE DECLARES THE FIELDS ──────────────────────────────────────────────────────────────────────
  section('§1 the brief template §3.2 declares the parked fields, and the old claim is gone')
  let template = null
  let claims = []
  {
    try { template = await readTemplate() } catch (e) {
      // A missing corpus FAILS; it never skips. The message names the path so the reader can restore it.
      ok(false, '§1a the brief template is readable', { path: TEMPLATE, env: TEMPLATE_ENV, error: String(e && e.message) })
    }
    if (template) {
      ok(true, '§1a the brief template is readable (' + template.path + ')')
      const parsed = parseV8Claims(template.text)
      claims = parsed.claims
      ok(claims.length > 0, '§1b §3.2 V8 row parsed into field claims (an empty parse is a failure)', parsed.why || { claims: claims.length })
      ok(!/ALREADY_PARKED[^\n]*无 `parkedReason`|ALREADY_PARKED.*它没有 `parkedReason`/.test(template.text),
        '§1c ★ the old claim "ALREADY_PARKED has no parkedReason" is gone')
      ok(template.text.includes('顶层 `parkedReason`') && template.text.includes('parkedMeans'),
        '§1d the new claim states the TOP-LEVEL parkedReason and parkedMeans')
      ok(template.text.includes('前者=同一个调用者还握着 prompt') || template.text.includes('同一个调用者还握着 prompt'),
        '§1e and says the two codes are two triggers, not synonyms')
    }
  }

  // ── §2 THE PRODUCT ANSWERS WITH THOSE FIELDS ────────────────────────────────────────────────��────────────────
  section('§2 the product really produces the declared fields (receipt keys, not source grep)')
  let receipts = {}
  {
    try {
      receipts = await parkedReceipts()
      ok(Object.keys(receipts).length === 2, '§2a both parked refusals were produced by the real kernel', Object.keys(receipts))
      const already = receipts.VMU_TURN_ALREADY_PARKED
      ok(already && already.code === 'VMU_TURN_ALREADY_PARKED', '§2b the second dispatch is refused by ALREADY_PARKED', already && already.code)
      ok(already && typeof already.parkedReason === 'string' && already.parkedReason.length > 40,
        '§2c ★★ the receipt carries a TOP-LEVEL parkedReason (the claim the template got wrong)', already && (already.parkedReason || '').slice(0, 60))
      ok(already && already.parkedFacts && already.parkedFacts.parkedReason === already.parkedReason,
        '§2d and the nested facts carry the same sentence')
      const owner = receipts.VMU_TURN_PARKED_NEEDS_OWNER
      ok(owner && owner.code === 'VMU_TURN_PARKED_NEEDS_OWNER', '§2e a reply with no parked prompt is NEEDS_OWNER', owner && owner.code)
      ok(owner && owner.parkedReplyDiscarded === true, '§2f and that reply is discarded by name', owner && owner.parkedReplyDiscarded)
      const problems = checkClaims(claims, receipts)
      ok(problems.length === 0, '§2g every declared field exists on the real receipt', problems)
    } catch (e) {
      ok(false, '§2a both parked refusals were produced by the real kernel', String(e && e.message))
    }
  }

  // ── §3 THE SEAT ARITHMETIC IS THE ARITHMETIC THE PRODUCT PERFORMS ───────────────────────────────────────────
  section('§3 researcherCount:N means N researchers; the chair is counted separately')
  {
    if (template) {
      ok(/N 名研究员/.test(template.text) && /roster 共 \*\*?N\+1/.test(template.text),
        '§3a §1 states "N researchers (r-1..r-N), chair r-acad separate ⇒ N+1 seats"')
      ok(!/researcherCount[^\n]*= r-acad 主席 \+ r-1 \+ r-2/.test(template.text),
        '§3b and the old "3 = chair + r-1 + r-2" arithmetic is gone')
    } else ok(false, '§3a template readable')
    try {
      const b = await boot()
      const start = await b.call('vibe_v5_start', { problem: 'p^2+q^2>=2pq placeholder', researcherCount: 3 })
      const receipt = start.threw ? start.err : start.receipt
      const hired = receipt && receipt.hired
      ok(Array.isArray(hired) && hired.length === 4 && hired[0] === 'r-acad',
        '§3c ★ the product hires 4 seats for researcherCount:3 (chair first, then r-1..r-3)', hired)
      ok(Array.isArray(hired) && hired.includes('r-1') && hired.includes('r-2') && hired.includes('r-3') && !hired.includes('r-temp'),
        '§3d the four seats are exactly the chair and the three researchers (temp is hired separately)', hired)
    } catch (e) {
      ok(false, '§3c the product start receipt was readable', String(e && e.message))
    }
  }

  // ── §4 ANTI-LAMPS: A WRONG RULER MUST GO RED AND NAME THE NAME ──────────────────────────────────────────────
  section('§4 anti-lamps: dropping a declared field, inventing one, or losing the table turns the check red by name')
  {
    const hasFail = (problems, name) => problems.some((p) => p.includes(name))
    let base = null
    try { base = template ? template.text : (await readTemplate()).text } catch { /* handled in §1 */ }
    if (base) {
      // Lamp 1: delete the top-level parkedReason from the ALREADY claim (the exact stale claim that caused run 77).
      const dropped = base.replace('顶层 `parkedReason` + `parkedMeans`', '`parkedMeans`')
      const p1 = checkClaims(parseV8Claims(dropped).claims, receipts)
      ok(hasFail(p1, 'parkedReason'), '§4a ★ dropping the declared parkedReason goes red and names parkedReason', p1)
      console.log('       RED: ' + (p1.find((p) => p.includes('parkedReason')) || '(none)'))
      // Lamp 2: invent a field the product never sends.
      const invented = base.replace('顶层 `parkedReason`', '顶层 `parkedMood`')
      const p2 = checkClaims(parseV8Claims(invented).claims, receipts)
      ok(hasFail(p2, 'parkedMood'), '§4b ★ inventing parkedMood goes red and names parkedMood', p2)
      console.log('       RED: ' + (p2.find((p) => p.includes('parkedMood')) || '(none)'))
      // Lamp 3: lose the table entirely — an unreadable ruler is a failure, not a pass.
      const lost = parseV8Claims(base.replace(/^### 3\.2.*$/m, ''))
      ok(lost.claims.length === 0 && typeof lost.why === 'string', '§4c ★ a missing §3.2 heading is an explicit parse failure', lost.why)
      const emptyCheck = checkClaims(lost.claims, receipts)
      ok(emptyCheck.length > 0 && emptyCheck.some((p) => p.includes('parkedReason')),
        '§4d and zero parsed claims is a RED naming the missing declaration, never a pass', emptyCheck)
    } else ok(false, '§4a anti-lamps had a readable template')
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true, maxRetries: 3 }) } catch { /* best effort */ } }
}

if (failures.length > 0) {
  console.log(NL + 'failures:')
  for (const f of failures) console.log('  - ' + f)
}
console.log('')
console.log('=== BRIEF CLAIMS MATCH PRODUCT: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exitCode = 1
