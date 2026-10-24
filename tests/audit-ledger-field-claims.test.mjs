// tests/audit-ledger-field-claims.test.mjs — a LEDGER MUST NOT NAME A FIELD THE CODE NEVER EMITS.
//
// Why this gate exists: the phase-12 ledger twice claimed a reading that did not exist —
//   · §33 said a `allFor` field was added to the closing-vote reading (the real field is `for`);
//   · §33 row k said the turn receipt carries `selectionIgnored{requested,reason,pending}` while the code emitted
//     three parallel scalars instead.
// Both were caught by an AGENT reading the ledger and then probing the live tool — i.e. by luck, one run later. A doc
// that names a field the product does not have is the same defect family as a gate that asserts a retired mechanism: the
// reader cannot tell an omission from a lie, and the next round "fixes" a field that was never there.
//
// The rule: every camelCase identifier a ledger cell puts in backticks must appear SOMEWHERE in the product source
// (`vibe-math-vmu/**/*.js`) — the ledger describes the product, so a name it promises has to exist in the product. A name
// that is deliberately the DOC's own vocabulary is exempt ONLY by being listed below with a reason, and the list is
// SHRINK-ONLY: an exemption must still be used by the ledger AND must still be absent from the product (if either stops
// being true, the entry is stale and the gate goes red).
//
// WHAT THIS PROVES: the ledger's promised identifiers exist in the product's source text.
// WHAT IT DOES NOT PROVE: that the field is on the receipt the ledger describes, nor that it is correctly typed — only a
// real call proves that. This gate catches the "named but never written" class, which is what actually happened twice.
//
// MODES: no argument runs the gate; `--selftest` proves the gate can go RED by judging fixtures (a leak, a clean doc, a
// stale exemption, a name that is prose) and checking each verdict.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const LEDGER = join(REPO, 'docs', 'acceptance', 'phase12-v5r-rules-conformance.md')

/** Identifiers the DOC owns: not a product field, with the reason it is exempt. SHRINK-ONLY. */
const DOC_OWN_VOCABULARY = Object.freeze({
  // A name the ledger uses to describe something the product deliberately does NOT have any more. The gate's rule
  // (exemptions must be absent from product source) is exactly what makes this legitimate: 'captureNeedles' was a
  // TEST-internal list whose assertion pinned a retired mechanism, and the ledger records it as removed — so its absence
  // from `vibe-math-vmu/**/*.js` is the proof that the removal happened.
  captureNeedles: 'historical: the name of a test-internal list the ledger records as REMOVED from the gate (it must not exist in the product)',
})

const CLAIM = /`([a-z][A-Za-z0-9]{2,})`/g
const ROW = /^\|\s*\*{0,2}[A-F]\d/

/** Every camelCase identifier a ledger TABLE row puts in backticks. Pure. */
const claimedNames = (ledgerText, vocabulary) => {
  const out = new Map()
  for (const row of ledgerText.split('\n').filter((l) => ROW.test(l))) {
    CLAIM.lastIndex = 0
    let m
    while ((m = CLAIM.exec(row)) !== null) {
      const name = m[1]
      if (vocabulary[name] !== undefined) continue
      if (!/[A-Z]/.test(name)) continue // a single lowercase word is prose (`ok`, `cast`, `type`), not a field name
      if (!out.has(name)) out.set(name, row.slice(0, 60))
    }
  }
  return out
}

/** Judge a ledger text against a product source text. Pure — which is what makes `--selftest` possible. */
const judge = ({ ledgerText, source, vocabulary }) => {
  const rows = ledgerText.split('\n').filter((l) => ROW.test(l))
  const claims = claimedNames(ledgerText, vocabulary)
  const missing = [...claims].filter(([name]) => !source.includes(name)).map(([name, context]) => ({ name, context }))
  const staleExemptions = Object.entries(vocabulary).filter(([name]) => source.includes(name)).map(([name]) => name)
  return { rows: rows.length, claims: claims.size, missing, staleExemptions }
}

const readProductSource = (root) => {
  const files = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.js')) files.push(p)
    }
  }
  walk(join(root, 'vibe-math-vmu'))
  return { files, source: files.map((f) => readFileSync(f, 'utf8')).join('\n') }
}

if (process.argv.slice(2).includes('--selftest')) {
  let pass = 0
  const bad = []
  const check = (cond, label, detail) => { if (cond) pass += 1; else bad.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail))) }
  const product = 'const x = { propositionId: 1, castMeaning: "y" }\n'
  const clean = '| **A1** | a row naming `propositionId` and `castMeaning` |\n'
  const leak = '| **A2** | a row naming `neverWrittenField7` |\n'

  const j1 = judge({ ledgerText: clean, source: product, vocabulary: {} })
  check(j1.missing.length === 0, '★ 正控：账本只承诺产品真有的名字 ⇒ 不报缺', j1.missing)
  check(j1.claims === 2, '★ 正控：两个驼峰标识都被提取（提取器不是空转）', j1.claims)

  const j2 = judge({ ledgerText: leak, source: product, vocabulary: {} })
  check(j2.missing.length === 1 && j2.missing[0].name === 'neverWrittenField7', '★★ 反控：承诺了产品没有的名字 ⇒ 必须报缺', j2.missing)

  const j3 = judge({ ledgerText: '| **A3** | `prose` only, no camel case here |\n', source: '', vocabulary: {} })
  check(j3.missing.length === 0 && j3.claims === 0, '全部小写/非驼峰的词不算承诺（否则每一行散文都会误报）', j3)

  const vocab = { removedThing: 'historical: removed' }
  const j4 = judge({ ledgerText: '| **A4** | `removedThing` is recorded as gone |\n', source: product, vocabulary: vocab })
  check(j4.missing.length === 0, '豁免名单里的名字不被报缺', j4.missing)
  const j5 = judge({ ledgerText: '| **A5** | `removedThing` |\n', source: product + 'const removedThing = 1\n', vocabulary: vocab })
  check(j5.staleExemptions.includes('removedThing'), '★★ 豁免的名字若又出现在产品里 ⇒ 豁免过期，必须报（否则豁免掩盖真缺口）', j5.staleExemptions)

  const j6 = judge({ ledgerText: 'not a table at all\n', source: product, vocabulary: {} })
  check(j6.rows === 0 && j6.claims === 0, '非表格输入 ⇒ 零行零承诺（不抛异常）', j6)

  check(pass + bad.length === 7, '自检断言数量固定为 7（少一条就说明某个判定被删了）', pass + bad.length)
  console.log('SELFTEST PASS: ' + pass + ' checks; the judge reports a fabricated claim and a stale exemption, and stays quiet on a clean doc')
  for (const b of bad) console.log('  FAIL ' + b)
  process.exit(bad.length ? 1 : 0)
}

let passed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; return }
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
}

const { files, source } = readProductSource(REPO)
ok(files.length > 200, 'the product tree was actually walked (a green over zero files would be vacuous)', files.length)
const j = judge({ ledgerText: readFileSync(LEDGER, 'utf8'), source, vocabulary: DOC_OWN_VOCABULARY })
ok(j.rows >= 40, 'the ledger table was found and is non-trivial (guard against a reformatted doc silently emptying this gate)', j.rows)
ok(j.claims >= 10, 'the ledger really promises identifiers (a list this short means the extractor broke, not that the doc is clean)', j.claims)

console.log('=== every identifier the ledger promises exists in the product source ===')
ok(j.missing.length === 0, 'no ledger-promised identifier is absent from `vibe-math-vmu/**/*.js`', j.missing.slice(0, 8))
console.log(`  rows=${j.rows} claimed=${j.claims} present=${j.claims - j.missing.length} missing=${j.missing.length}`)

console.log('=== the exemption list is needed and SHRINK-ONLY ===')
for (const [name, why] of Object.entries(DOC_OWN_VOCABULARY)) {
  ok(typeof why === 'string' && why.length > 10, `exemption ${name} carries a reason`, why)
  ok(!source.includes(name), `exemption ${name} is not also a real product identifier (otherwise the exemption hides a real claim)`, name)
}
ok(j.staleExemptions.length === 0, 'no exemption is stale', j.staleExemptions)

// TEETH: the judge must be able to say NO on the very text this run judged.
const teeth = judge({ ledgerText: readFileSync(LEDGER, 'utf8') + '\n| **A9** | a fabricated claim `thisFieldNeverExists9` |\n', source, vocabulary: DOC_OWN_VOCABULARY })
ok(teeth.missing.some((m) => m.name === 'thisFieldNeverExists9'), 'TEETH: a fabricated claim planted in THIS ledger is caught', teeth.missing.map((m) => m.name))
ok(!source.includes('thisFieldNeverExists9'), 'TEETH: the planted identifier is genuinely absent from the product', 'thisFieldNeverExists9')
ok(source.includes('propositionId'), 'TEETH: a real field (`propositionId`) is present, so the check is not a blanket refusal', 'propositionId')

console.log('')
console.log('=== AUDIT LEDGER FIELD CLAIMS: ' + passed + ' passed, ' + failures.length + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failures.length ? 1 : 0)
