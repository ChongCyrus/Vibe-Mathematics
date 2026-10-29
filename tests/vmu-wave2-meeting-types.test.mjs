#!/usr/bin/env node
// tests/vmu-wave2-meeting-types.test.mjs — E33 的读面证据：会议类型的目录读得出来，而且是从声明里读的。
//
// 规则原文（docs/acceptance/rules-ledger.json，E33 行）：`vibe_v5_meeting` 应支持 `action:"types"` 读面
// （六型 + 各自 procedure.steps 数 + 工具面收窄 + typeCatalogSource）。
//
// 这个文件测的机制（不是文案）：
//   ① `action:"types"` 是一次 READ：不要求 agenda、不要求 member、不要求任何会议 id——它在 convene 的校验之前分派。
//   ② 六行就是 `packs/v5r/meeting-procedures.js` 的 `MEETING_TYPE_IDS`（同一份目录），行数、id、label 都对得上。
//   ③ 每行的 `procedure.steps` 与该型在 `MEETING_PROCEDURES` 里的步骤**逐字相等**（不是数出来再手写一遍），
//      `procedureSteps` 是同一个 length；`ordinary` 没有绑定步骤，`hasProcedure:false` 而不是编一组假步骤。
//   ④ 收窄读的是 `packs/v5r/meeting-tool-face.js` 的 `MEETING_TYPE_TOOL_FACES`：debate 收窄且允许表逐项相等，
//      ordinary 不收窄且有 reason。
//   ⑤ `typeCatalogSource` 同时点名这两份声明文件——「目录住在哪」是可查的事实，不是注释里的承诺。
//
// 运行：`node tests/vmu-wave2-meeting-types.test.mjs`（末行打印 ALL GREEN / 失败时 exitCode=1）。
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'

import { MEETING_TYPE_IDS, MEETING_PROCEDURES, procedureFor } from '../vibe-math-vmu/packs/v5r/meeting-procedures.js'
import { MEETING_TYPE_TOOL_FACES, meetingTypeFace } from '../vibe-math-vmu/packs/v5r/meeting-tool-face.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 500)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail).slice(0, 500)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const ROOT = await mkdtemp(join(tmpdir(), 'vmu-wave2-types-'))
await mkdir(join(ROOT, 'Formal'), { recursive: true })

/** 宿主注入 `subprocess` 缝（与其它 pack 测试同一种 boot）；本文件不跑 Lean，只是让 pack 正常装载。 */
const boot = async () => {
  const state = { specs: [] }
  const subprocess = {
    resolveExecutable: async (name) => '/fake/bin/' + String(name),
    spawn: () => ({
      done: Promise.resolve({ exitCode: 0, signal: null, stdout: 'Build completed successfully.\n', stderr: '' }),
      terminate() {},
    }),
  }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    get: (what) => (what === 'subprocess' ? subprocess : undefined),
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  let NOW = 1000
  const handle = entry.apply(ctx, { clock: () => NOW + (NOW += 1000), packs: ['v5r'], root: ROOT })
  await handle.ready()
  return { handle, kernel: handle.kernel, specOf: (name) => state.specs.find((s) => s.name === name) }
}

const call = async (b, name, args = {}, ctx = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { missing: name }
  let raw
  try { raw = await spec.execute(args, { kernel: b.kernel, ...ctx }) } catch (e) {
    return { thrown: true, code: e && e.code, message: String(e && e.message), hint: e && e.hint }
  }
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return { raw } } }
  return raw || {}
}

try {
  const b = await boot()

  // ── §1 读面本身就成立：只要 action，不要 agenda / member / id ────────────────────────────────────────────
  console.log('=== §1 `action:"types"` 是一次 READ：不借 convene 的门 ===')
  const catalog = await call(b, 'vibe_v5_meeting', { action: 'types' })
  ok(catalog.ok === true && catalog.action === 'types', '只给 action:"types" 就拿到回执（没有被 convene 的 agenda 校验拦下）', catalog && (catalog.code || catalog.action))
  ok(catalog.count === MEETING_TYPE_IDS.length, 'count 等于目录里的型数（' + MEETING_TYPE_IDS.length + ' 型）', catalog && catalog.count)
  ok(MEETING_TYPE_IDS.length > 0 && Array.isArray(catalog.types) && catalog.types.length === MEETING_TYPE_IDS.length, 'types 数组逐型一行，长度与目录相等', catalog && catalog.types && catalog.types.length)
  ok(MEETING_TYPE_IDS.length === 6, '声明里就是六型（E33 的「六型」是可核的事实）', MEETING_TYPE_IDS)

  // ── §2 每一行：id 对上目录，且 procedure.steps 逐字等于声明里的步骤 ────────────────────────────────────
  console.log('\n=== §2 每行的 procedure.steps 与 MEETING_PROCEDURES 逐字相等（读的，不是抄的） ===')
  ok(MEETING_TYPE_IDS.length === 6 && Array.isArray(catalog.types) && catalog.types.length === 6, 'the catalogue is non-empty before the per-type loop (a loop over nothing proves nothing)', catalog && catalog.types && catalog.types.length)
  for (const id of ['ordinary', 'academic', 'debate', 'closure', 'paper', 'planning']) {
    const row = catalog.types.find((t) => t.type === id)
    const declared = MEETING_PROCEDURES[id]
    const expected = declared && Array.isArray(declared.steps) ? declared.steps : []
    ok(!!row, '型 "' + id + '" 在读面里有一行', catalog.types.map((t) => t.type))
    if (!row) continue
    ok(Array.isArray(row.procedure && row.procedure.steps) && JSON.stringify(row.procedure.steps) === JSON.stringify(expected),
      '型 "' + id + '" 的 procedure.steps 与声明逐字相等（' + expected.length + ' 步）', row.procedure)
    ok(row.procedureSteps === expected.length && row.procedure.count === expected.length,
      '型 "' + id + '" 的 procedureSteps / procedure.count 都是那个 length', { procedureSteps: row.procedureSteps })
    ok(row.hasProcedure === (expected.length > 0), '型 "' + id + '" 的 hasProcedure 与「有没有绑定步骤」一致', row.hasProcedure)
    ok(typeof row.kind === 'string' && row.kind !== '', '型 "' + id + '" 带 kind', row.kind)
    const typeInfo = procedureFor(id)
    ok(row.subjectRequired === (typeInfo.subjectRequired === true), '型 "' + id + '" 的 subjectRequired 与目录一致', { row: row.subjectRequired, catalog: typeInfo.subjectRequired })
    ok(row.label === String((typeInfo && typeInfo.label) || ''), '型 "' + id + '" 的 label 与目录一致', row.label)
  }
  const ordinary = catalog.types.find((t) => t.type === 'ordinary')
  ok(!!ordinary && ordinary.procedureSteps === 0 && ordinary.hasProcedure === false && ordinary.procedure.steps.length === 0,
    'ordinary 没有绑定步骤：0 步且 hasProcedure:false（没有编一组假步骤）', ordinary && ordinary.procedure)

  // ── §3 收窄读的是 meeting-tool-face.js：debate 逐项相等，ordinary 不收窄且有 reason ──────────────────────
  console.log('\n=== §3 工具面收窄与 MEETING_TYPE_TOOL_FACES 逐项相等（同一份声明） ===')
  for (const id of ['ordinary', 'academic', 'debate', 'closure', 'paper', 'planning']) {
    const row = catalog.types.find((t) => t.type === id)
    const face = meetingTypeFace(id)
    const declaredFace = MEETING_TYPE_TOOL_FACES[id]
    if (!row) continue
    ok(row.narrowed === (face.narrowed === true), '型 "' + id + '" 的 narrowed 与声明一致（' + (face.narrowed === true) + '）', row.narrowed)
    if (face.narrowed === true) {
      const allow = Array.isArray(declaredFace && declaredFace.allow) ? declaredFace.allow : []
      ok(Array.isArray(row.allowedTools) && JSON.stringify(row.allowedTools) === JSON.stringify(allow),
        '型 "' + id + '" 的允许表逐项等于声明里的 allow（' + allow.length + ' 项）', row.allowedTools)
      ok(row.narrowingTo === allow.length, '型 "' + id + '" 的 narrowingTo 是允许表长度', row.narrowingTo)
      ok(row.narrowingReason === null || typeof row.narrowingReason === 'string', '型 "' + id + '" 的 reason 形状正常', row.narrowingReason)
    } else {
      ok(row.allowedTools === null && row.narrowingTo === null, '型 "' + id + '" 不收窄：allowedTools 与 narrowingTo 都是 null（不是空数组冒充）', { allowedTools: row.allowedTools })
      ok(typeof row.narrowingReason === 'string' && row.narrowingReason !== '', '型 "' + id + '" 不收窄时给出 reason，读面能说清为什么', row.narrowingReason)
    }
  }
  const debate = catalog.types.find((t) => t.type === 'debate')
  ok(!!debate && debate.narrowed === true, 'debate 型声明了收窄（工具面只能变小）', debate && debate.narrowed)

  // ── §4 typeCatalogSource 点名两份声明文件 ───────────────────────────────────────────────────────────────
  console.log('\n=== §4 typeCatalogSource 点名目录住在哪 ===')
  const src = String(catalog.typeCatalogSource || '')
  ok(/meeting-procedures\.js/.test(src), 'typeCatalogSource 点名 packs/v5r/meeting-procedures.js（型的步骤）', src)
  ok(/meeting-tool-face\.js/.test(src), 'typeCatalogSource 点名 packs/v5r/meeting-tool-face.js（工具面收窄）', src)
  ok(/procedure\.steps/.test(src), 'typeCatalogSource 说明 procedure.steps 出自哪里', src)

  // ── §5 对照：convene 用的还是同一份目录（未知型仍被具名拒，且列出六型） ─────────────────────────────────
  console.log('\n=== §5 对照：convene 的型校验仍对着同一份目录 ===')
  await b.kernel.members.hire({ id: 'r-acad', slot: 'chair' })
  const unknown = await call(b, 'vibe_v5_meeting', { type: 'seminar', agenda: 'x', member: 'r-acad' })
  ok(unknown.ok !== true && String(unknown.message || '').includes('seminar'), '未知型 "seminar" 仍被具名拒', unknown && (unknown.code || unknown.message))
  ok(String(unknown.hint || '').includes(MEETING_TYPE_IDS.join(', ')), '拒绝的 hint 仍列出目录里的六型（与读面同一份）', unknown && unknown.hint)
} catch (error) {
  failed++
  failures.push('THREW ' + (error && error.stack ? error.stack : String(error)))
  console.error('  FAIL THREW ' + (error && error.stack ? error.stack : String(error)))
} finally {
  await rm(ROOT, { recursive: true, force: true })
}

console.log('\n=== VMU WAVE2 MEETING TYPES: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.error('\nfailures:\n' + failures.map((f) => ' - ' + f).join('\n'))
  process.exitCode = 1
} else {
  console.log('ALL GREEN')
}
