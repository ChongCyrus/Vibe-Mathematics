// tests/vmu-run122-label-provenance.test.mjs — ROUND 122 / ledger E6（标签的来源要能读出来）。
//
// THE DEFECT THIS PINS（真机 r122a 量到）：
//   `vibe_v5_meeting` 的 convene 分支把 `kind` 默认为 'sync'，于是**没给任何标签**的召集到达内核时已经带着一个
//   调用者没写过的标签；`labelRequired` 这条轨在唯一打开它的面上永远不会触发（r122a：m2 无 title 无 kind，
//   回执读到 `"kind":"sync"`）。默认值本身保留（`sync` 是合法 kind），但**它的来源必须被打印**：读者要能分清
//   「我把这场会叫作 sync」和「框架替我填了 sync」。这就是 `kindSource`。
//
// WHAT THIS SUITE PROVES：
//   ① 不给 kind/title ⇒ 会议照常开成，`kind:"sync"`，`kindSource:"default"`，`kindSourceMeans` 说明没人选过它；
//   ② 给了 title ⇒ `kindSource:"default"` 仍在（title 不是 kind），但 title 回读是调用者写的那句；
//   ③ 给了 kind ⇒ `kindSource:"args"`，且读回同一个词；
//   ④ 声明之外的 kind 仍被具名拒（默认值没有把词表验证弄丢）；
//   ⑤ 这一面仍然是 `labelRequired` 唯一的打开者：内核自己（`createMeetings`）不传 labelRequired 时，无标签召集
//      照旧成功 —— 让读者知道「严格只发生在 pack 面上」。
//
// RULE E: 每个循环前先断言集合非空。

import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')).href)
const boot = async () => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const root = mkdtempSync(join(tmpdir(), 'vmu-label-'))
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  const kernel = handle.kernel
  await kernel.store.open()
  const call = async (args, extra = {}) => {
    const spec = state.specs.find((x) => x.name === 'vibe_v5_meeting')
    ok(!!spec, 'the pack publishes vibe_v5_meeting (a missing face cannot be tested)', spec && spec.name)
    try { return JSON.parse(await spec.execute(args, Object.assign({ kernel }, extra))) } catch (err) { return { ok: false, code: err && err.code, message: err && err.message } }
  }
  await kernel.members.hire({ id: 'r-acad', slot: 'chair', by: null })
  return { kernel, call }
}

try {
  console.log('§1 no label at all — the meeting still opens, and says the label was NOT chosen')
  {
    const b = await boot()
    const r = await b.call({ member: 'r-acad', agenda: '一次没有标签的会', type: 'academic' })
    ok(r && r.ok === true, 'an unlabelled convene still opens (the default label is legal)', r)
    ok(r.kind === 'sync', 'the kind read back is the framework default `sync`', r.kind)
    ok(r.kindSource === 'default', '★ kindSource says the label was FILLED IN, not chosen', r.kindSource)
    ok(typeof r.kindSourceMeans === 'string' && /nobody chose it/.test(r.kindSourceMeans) && /default kind/.test(r.kindSourceMeans),
      '★ kindSourceMeans states in words that nobody chose this label', r.kindSourceMeans && r.kindSourceMeans.slice(0, 80))
    ok(r.title === null, 'and no title was invented for it', r.title)
  }

  console.log('§2 a title is a label the caller chose — the kind is still the default')
  {
    const b = await boot()
    const r = await b.call({ member: 'r-acad', agenda: '议题', type: 'academic', title: '第一次学术交流' })
    ok(r && r.ok === true, 'the convene opens', r && r.ok)
    ok(r.title === '第一次学术交流', 'the title reads back exactly as written', r.title)
    ok(r.kindSource === 'default', 'a title does not make the kind a chosen one', r.kindSource)
  }

  console.log('§3 a kind the caller names is read back as theirs')
  {
    const b = await boot()
    const r = await b.call({ member: 'r-acad', agenda: '分工会议', type: 'academic', kind: 'division' })
    ok(r && r.ok === true, 'the convene opens', r && r.ok)
    ok(r.kind === 'division', 'the kind reads back the handed word', r.kind)
    ok(r.kindSource === 'args', '★ kindSource says the caller named it', r.kindSource)
    ok(typeof r.kindSourceMeans === 'string' && /the caller named/.test(r.kindSourceMeans),
      'kindSourceMeans agrees in words', r.kindSourceMeans && r.kindSourceMeans.slice(0, 60))
  }

  console.log('§4 the vocabulary is still enforced (a default value did not replace validation)')
  {
    const b = await boot()
    const r = await b.call({ member: 'r-acad', agenda: 'x', type: 'academic', kind: 'weekly-sync' })
    ok(r && r.ok === false && r.code === 'VMU_INVALID_ARGUMENT', 'an undeclared kind is refused by name', r && r.code)
    ok(typeof r.message === 'string' && r.message.includes('weekly-sync'),
      'the refusal names the word it got', r.message)
  }

  console.log('§5 the strict rail belongs to the pack face, not to the kernel (stated, not implied)')
  {
    const b = await boot()
    const opened = b.kernel.meetings.open({ type: 'academic', chair: 'r-acad', actor: 'r-acad', members: ['r-acad'], materials: 'x' })
    ok(!!opened && typeof opened.meeting === 'string', 'the kernel itself convenes without a label (opt-in rail)', opened && opened.meeting)
  }
} catch (err) {
  failed++
  failures.push('suite crashed: ' + (err && err.stack ? err.stack.split('\n')[0] : String(err)))
  console.error('  FAIL suite crashed: ' + (err && err.stack ? err.stack : err))
}

console.log('\n=== VMU RUN122 LABEL PROVENANCE: ' + passed + ' passed, ' + failed + ' failed ===')
console.log(failed === 0 ? 'ALL GREEN' : 'FAILURES: ' + failures.length)
process.exit(failed > 0 ? 1 : 0)
