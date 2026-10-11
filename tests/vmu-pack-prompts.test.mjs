// vibe-math-vmu —— v5r 包【正文轴】的机械证明（packs/v5r-prompts.js ⇄ prompt-corpus-v5/*.json）。
//
// 这套测试要证明的不是"我们说了包含"，而是**逐字相同**：把生成物里的每一条正文与语料里对应的一条做严格比较，
// 并核对语料自身的 sha256（生成物把它写在模块里 ✓）。生成物一旦与语料不一致 ⇒ **红**，而不是悄悄多出一份副本。
//
// 运行：`node tests/vmu-pack-prompts.test.mjs`（末行 `=== VMU PACK PROMPTS: N passed, M failed ===`）。

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { PROMPTS, COUNTS, KIND_HISTOGRAM, SOURCE_REL, SOURCE_SHA256 } from '../vibe-math-vmu/packs/v5r-prompts.js'
import { PACK } from '../vibe-math-vmu/packs/v5r-core.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; return }
  failed += 1
  failures.push(name + (detail === undefined ? '' : ' [' + detail + ']'))
}

const RAW = readFileSync(new URL('../' + SOURCE_REL, import.meta.url))
const corpus = JSON.parse(String(RAW))

// ① 来源可追溯：生成物记录的 sha256 必须等于语料**当前**的 sha256
{
  const actual = createHash('sha256').update(RAW).digest('hex')
  ok(SOURCE_SHA256 === actual, '★ the recorded corpus sha256 equals the corpus on disk (no silent drift)', SOURCE_SHA256.slice(0, 12) + ' vs ' + actual.slice(0, 12))
  ok(/^[0-9a-f]{64}$/.test(SOURCE_SHA256), 'the recorded hash is a well-formed sha256')
  ok(SOURCE_REL === 'prompt-corpus-v5/prompt-corpus-v5.json', 'the source path is the corpus the repo ships', SOURCE_REL)
}

// ② 条数与分栏：语料 ⇄ 生成物 ⇄ 包声明，三者必须一致
{
  ok(Array.isArray(corpus.prompts) && corpus.prompts.length > 0, 'the corpus carries a prompts array', String(corpus.prompts.length))
  ok(PROMPTS.length === corpus.prompts.length, '★ entry count equals the corpus count', PROMPTS.length + ' vs ' + corpus.prompts.length)
  ok(COUNTS.total === PROMPTS.length, 'the recorded total equals the array length', String(COUNTS.total))
  const chars = PROMPTS.reduce((n, p) => n + p.text.length, 0)
  ok(COUNTS.chars === chars, 'the recorded character total equals the sum of the texts', COUNTS.chars + ' vs ' + chars)
  ok(Object.keys(KIND_HISTOGRAM).length === COUNTS.kinds, 'the kind histogram has the recorded number of kinds', String(COUNTS.kinds))
  ok(PACK.prompts && PACK.prompts.count === COUNTS.total && PACK.prompts.chars === COUNTS.chars,
    '★ the pack declaration matches the generated module (not a hand-typed number)')
  ok(PACK.prompts && PACK.prompts.source === SOURCE_REL && PACK.prompts.sourceSha256 === SOURCE_SHA256,
    'the pack names the same source and the same sha256 the module recorded')
  ok(PACK.prompts && PACK.prompts.module === './v5r-prompts.js', 'the pack names the module that carries the text', String(PACK.prompts && PACK.prompts.module))
}

// ③ ★ 逐字相同：这一条才是"内容完全一致"的证据（不是同义改写，也不是"我们尽力了"）
{
  let mismatched = 0
  let firstBad = null
  for (let i = 0; i < corpus.prompts.length; i += 1) {
    const want = String(corpus.prompts[i].prompt === undefined || corpus.prompts[i].prompt === null ? '' : corpus.prompts[i].prompt)
    const got = PROMPTS[i] && PROMPTS[i].text
    if (got !== want) { mismatched += 1; if (firstBad === null) firstBad = 'index ' + i + ' (' + (PROMPTS[i] && PROMPTS[i].id) + ')' }
  }
  ok(mismatched === 0, '★★ EVERY prompt text is byte-for-byte the corpus text (verbatim, in corpus order)', mismatched + ' mismatched, first ' + firstBad)
  const emptyTexts = PROMPTS.filter((p) => p.text.trim().length === 0).map((p) => p.id)
  ok(emptyTexts.length === 0, 'no entry carries empty text (an empty prompt would be a silent hole)', emptyTexts.slice(0, 4).join(','))
  const ids = PROMPTS.map((p) => p.id)
  ok(new Set(ids).size === ids.length, 'entry ids are unique (kind#n), so a prompt can be named in an audit')
  ok(PROMPTS.every((p) => typeof p.kind === 'string' && p.kind.length > 0), 'every entry carries its kind')
  ok(PROMPTS[0].id === PROMPTS[0].kind + '#1', 'the id shape is <kind>#<ordinal-within-kind>', PROMPTS[0].id)
}

// ④ 生成物不得被手改：它是 GENERATED，且包【装载计划】里必须看得到这条正文来源
{
  const src = readFileSync(new URL('../vibe-math-vmu/packs/v5r-prompts.js', import.meta.url), 'utf8')
  ok(src.indexOf('GENERATED FILE') !== -1, 'the module says it is generated (so a hand edit is recognisable)')
  ok(Object.isFrozen(PROMPTS), 'the prompt table is frozen (no runtime mutation)')
  const { createPackLoader } = await import('../vibe-math-vmu/kernel/pack.js')
  const loader = createPackLoader({})
  const plan = loader.plan(PACK)
  ok(plan.ok === true, 'the pack plans cleanly', JSON.stringify(plan.problems))
  const action = plan.actions.filter((a) => a.kind === 'prompts')[0]
  ok(!!action, '★ the plan reports a `prompts` action (the declaration has a CONSUMER, not a silent field)')
  ok(!!action && action.count === COUNTS.total, 'and that action carries the real count', action && String(action.count))
  const bad = loader.plan({ id: 'probe', prompts: { module: '', count: -1 } })
  ok(bad.ok === false && bad.problems.some((p) => p.indexOf('prompts.module') === 0) && bad.problems.some((p) => p.indexOf('prompts.count') === 0),
    'a malformed `prompts` field is refused by name instead of being ignored', JSON.stringify(bad.problems))
}

console.log('=== VMU PACK PROMPTS: ' + passed + ' passed, ' + failed + ' failed ===')
for (const f of failures) console.log('  FAIL ' + f)
process.exit(failed === 0 ? 0 : 1)
