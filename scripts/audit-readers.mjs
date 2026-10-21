#!/usr/bin/env node
// audit-readers.mjs — RED LINE 4, the READER census (renamed from audit-no-consumer.mjs).
//
// WHY THIS NAME. `docs/01-philosophy.md` §1.4.1 (:46, :51-54) defines 消费者 as a USER'S POSSIBLE NEED - never
// "does in-repo code reference it". §1.4.2 (:70-76) says the two layers must be called differently: the design /
// admission layer asks 消费者, the WIRING / gate layer asks 读点／读取者 (reader)... and it warns, verbatim, that
// using the wide sense on the table "等于把'没人读'说成'有人读'". This tool audits the WIRING layer, so calling a
// zero-caller mechanism "no consumer" was precisely the mix-up §1.4.2 forbids (it turns a wiring defect into
// "something to delete"). §1.4.3 (:80-83) adds: zero in-repo references is NOT a deletion reason - it only
// triggers "can a user reach it?", and §1.4.4 (:87) refuses to let "a user might" keep a SILENT false declaration.
// Hence: the classes below speak reader-language, and B is explicitly normal rather than a defect.
//
// CLASSES (wiring layer = "does anything READ it"):
//   A  INTERNAL MECHANISM, NO READER  -> the framework is supposed to call it at a known moment, so zero readers is
//                                        a DEFECT (mailbox.flush was the measured instance), not a deletion candidate.
//   B  EXTERNAL API, NO IN-REPO READER -> NORMAL: that is what an API is (AGENTS.md §7.1). Each B entry must be
//                                        either annotated in PUBLIC_API below (with the reason it exists) or it is
//                                        reported as BOUNDARY-UNCLEAR; `--strict` fails on the latter so the boundary
//                                        cannot stay unclear forever.
//   C  TEST-ONLY READER               -> production has no reader; only tests read it (a mechanism built for the test).
//   D  DEAD CODE                      -> superseded (explicit table) or unreachable: unrelated to readers, kept apart.
//
// Human diagnostic, FIRST. `--check` IS NOT APPLICABLE: this tool must never be wired into regen --check (it is a
// census, and AGENTS.md §7.4 requires --check to stay deterministic and side-effect free).
// It does not run tests, write files, or use randomness, except the selftest's D:\_tmp fixture, removed afterwards.
//
// Usage: node scripts/audit-readers.mjs [--selftest] [--deep] [--strict] [--list-b]
import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const TESTS = join(REPO, 'tests')

// Mechanism verbs: names a lifecycle owns. Extended set keeps the deep mode's noise down (see --deep below).
export const MECHANISM = /^(flush|drain|tick|sweep|pump|settle|reconcile|recover|hydrate|persist|snapshot|restore|compact|expire|prune|reap|vacuum|autoArm|arm|refresh|sync|dispatch|apply|finalize|finish|collect|process|runPending|markInjected|clearInjected|deliverable|flushPending|drainQueue|pumpQueue|tickOnce|sweepOnce|resume|invalidate|touch|poll|schedule|unlock|lock|commit|rollback|abort|close|open|start|stop|reset|clear|load|save|emit|fire)/i
// Superseded definitions, by "relpath::name". Emptied unless there is measured evidence (same rule as before).
export const SUPERSEDED = Object.freeze([])

// ---------------------------------------------------------------------------------------------------------------
// PUBLIC API registry — the annotation required for class B (task 2 of the rename). Every entry answers ONE
// question: WHO is meant to read this, given that no framework code does? Keep the reason short and checkable;
// an entry whose reason cannot be checked is worse than no entry. If a symbol is genuinely unreachable, do NOT
// annotate it: it belongs to the defect column and must be wired or removed by its owner.
// Entries are keyed "moduleRelativeToVibeMathVmu::symbol" so a rename cannot silently keep a stale annotation.
export const PUBLIC_API = Object.freeze({
  'kernel/bus.js::hookRegistryProblems': '总线自检面：把注册表问题（重名/未登记）暴露给诊断者；正常运行时问题集合为空，故无仓内调用者。',
  'kernel/guard.js::readSafetyMemoryMb': '内存安全阈值的读取面：由宿主/部署方在装配时问“你们期望多少内存”，框架不自设策略。',
  'kernel/ids.js::currentIds': 'id 快照读取面：供宿主/观察者读取当前 id 集；框架内部走增量 id，不读全量快照。',
  'kernel/guard.js::requiresApproval': 'guard 的审批判定面：导出给宿主/策略层与验证套件使用；仓内正常路径由 guardWriteExtended 一并判定。',
  'kernel/guard.js::capabilityOf': 'guard 的能力归类面：导出给宿主/策略层与验证套件；仓内正常路径不逐个调用。',
  'kernel/guard.js::cpuBudgetExceeded': 'guard 的 CPU 预算判定面：导出给宿主/验证套件；生产路径由 guardWriteExtended 合并判定。',
  'kernel/guard.js::guardWriteExtended': 'guard 的写保护扩展判定面：宿主/部署方按需调用；导出属于对外 API，测试是当前唯一读点。',
  'kernel/index.js::createMembersList': '成员名册的构造接缝：供宿主/测试按依赖注入构造；主装配走 createMembers。',
  'kernel/turn/index.js::extractFence': '从模型回复中取 JSON 围栏的解析工具：导出给宿主/中间件与验证套件复用。',
  'kit/tools.js::selectKitTools': 'Kit 工具选择器：供宿主/测试构造裁剪后的工具面；主路径由 Kit 装配消费。',
  'math-engines.js::isKnownMathEngine': '数学引擎名校验面：供宿主/配置校验与验证套件使用。',
  'settings/schema.js::renameNotice': '设置改名公告的生成面：供迁移/诊断与验证套件读取；主路径不逐条调用。',
  'settings/schema.js::toJsonSchema': '设置 schema 的 JSON Schema 导出面：供外部工具/宿主消费（导出即 API）。',
})

// ---------------------------------------------------------------------------------------------------------------
// KNOWN DEFECTS — the third outcome of an adjudication ("是缺陷 ⇒ 修它"). Kept HERE, with the evidence and the
// owner, instead of being quietly annotated as an API: per docs/01 §1.4.4 an unread export must NOT be kept alive
// by "a user might need it". `--strict` fails while this list is non-empty, so a defect cannot become a habit.
// Each entry: module::symbol → { why, evidence, owner }.
export const KNOWN_DEFECTS = Object.freeze({
  'kernel/reportfeedback.js::assertFiniteOrder': {
    why: '应被接线却没接：本模块头部声明它是“宿主不校验 order ⇒ 我们自己校验”的调用侧守卫，而实际投递路径（kernel/reportfeedbackdelivery.js）没有调用它。',
    evidence: '全仓（含 packs/tests/docs）除自身定义与注释外 0 读点；docs/acceptance/phase2-pack-round11-a1-wire.md:24-25,53 记录投递侧仍在把 undefined order 传下去并“另记一处既存不一致”。',
    owner: 'kernel/reportfeedbackdelivery.js 的写者（本轮 kernel 不在我的写域，已具名移交）',
  },
  'kernel/reportfeedback.js::boundFeedback': {
    why: '应被接线却没接：截断必须“自述被截断”，投递路径若不用它，就没人保证截断被如实报告。',
    evidence: '全仓除自身定义与注释外 0 读点（测试也不读）。',
    owner: 'kernel/reportfeedbackdelivery.js 的写者（同上）',
  },
})

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e); const st = statSync(p)
    if (st.isDirectory()) {
      if (['node_modules', '.git', 'packs'].includes(e)) continue
      walk(p, out)
    } else if (p.endsWith('.js') || p.endsWith('.mjs')) out.push(p)
  }
  return out
}
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** Count mentions of `name` in `texts`, minus its own definition line. */
export const countRefs = (name, texts, def) => {
  const re = new RegExp('\\b' + name.replace(/[$]/g, '\\$') + '\\b', 'g')
  let n = 0
  for (const [file, text] of texts) {
    let local = 0
    for (const line of text.split('\n')) {
      const m = line.match(re)
      if (m) local += m.length
    }
    if (def && file === def.file) local -= 1
    if (local > 0) n += local
  }
  return n
}

/** Object-literal method definitions (`name(args) {`) — the deep mode's raw material. */
export const objectMethods = (file, src) => {
  const out = []
  src.split('\n').forEach((line, i) => {
    const m = line.match(/^\s{2,}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/)
    if (!m) return
    const name = m[1]
    if (/^(if|for|while|switch|catch|function|return|else|do|try)$/.test(name)) return
    out.push({ name, file, line: i + 1, exported: false, kind: 'object-method' })
  })
  return out
}

/**
 * @param {object} p
 * @param {Array} p.defs definitions ({name,file,line,exported,kind})
 * @param {Map}   p.texts production texts (file → comment-stripped source)
 * @param {Map}   p.testTexts test texts
 * @param {Map}   p.services service-method names → service name
 * @param {Map}   p.annotations "module::name" → why (PUBLIC_API)
 */
export const classify = ({ defs, texts, testTexts, services, annotations = new Map(), defects = new Map(), relOf = (f) => f }) => {
  const rows = []
  for (const d of defs) {
    if (d.name.length < 4) continue
    const key = relOf(d.file) + '::' + d.name
    if (SUPERSEDED.includes(key) || SUPERSEDED.includes(d.name)) { rows.push({ ...d, cls: 'D', prod: 0, test: 0, service: null, why: 'superseded' }); continue }
    const service = services.get(d.name) || null
    const prod = Math.max(0, countRefs(d.name, texts, d))
    if (prod > 0) continue
    const test = Math.max(0, countRefs(d.name, testTexts, { file: null, line: -1 }))
    let cls
    // An explicit PUBLIC_API annotation is an ADJUDICATION: the symbol is an outward API even when the only in-repo
    // reader is a test. Without this branch the annotation was decorative (it never changed the class), and --strict
    // could never be satisfied for a legitimate exported seam.
    if (annotations.has(key)) cls = 'B'
    // An OBJECT METHOD that only tests read is not "the framework forgot to call it" (it is a face method the test
    // exercises): decide by readers first for that kind, so the deep mode cannot inflate A with public face methods.
    else if (d.kind === 'object-method') cls = test > 0 ? 'C' : 'A'
    else if (MECHANISM.test(d.name)) cls = 'A'
    else if (test > 0) cls = 'C'
    else if (d.exported || service) cls = 'B'
    else cls = 'D'
    rows.push({ ...d, cls, prod, test, service, why: annotations.get(key) || null, defect: defects.get(key) || null })
  }
  return rows
}

const fmt = (r, rel) => r.name + '  [' + (r.service ? r.service + '.' : '') + r.kind + (r.exported ? ',exported' : '') + '] '
  + rel(r.file) + (r.line ? ':' + r.line : '') + ' testRefs=' + r.test + (r.cls === 'B' ? (r.why ? '  ANNOTATED' : '  ★ BOUNDARY-UNCLEAR') : '')

async function census({ deep = false } = {}) {
  // DEFINITIONS come from the framework; READERS come from the framework AND from the shipped packs (a pack is
  // production code: it is what a deployment actually runs). The old census skipped `packs/`, which reported
  // `kit/tools.js::kitCardHandler` as unread even though `packs/v5r/tools.js:4` imports it - a scanner blind spot
  // (AGENTS.md §7.2: a zero must be proven to have matched something).
  const defFiles = walk(VMU).filter((f) => !f.includes(join('vibe-math-vmu', 'docs')))
  const readerFiles = defFiles.concat(walk(join(VMU, 'packs')))
  const tests = walk(TESTS)
  const texts = new Map(readerFiles.map((f) => [f, strip(readFileSync(f, 'utf8'))]))
  const testTexts = new Map(tests.map((f) => [f, strip(readFileSync(f, 'utf8'))]))
  const rel = (f) => relative(VMU, f).replace(/\\/g, '/')
  const defs = []
  for (const f of defFiles) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      let m = line.match(/^\s*(export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/)
      if (m) { defs.push({ name: m[2], file: f, line: i + 1, exported: !!m[1], kind: 'function' }); return }
      m = line.match(/^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\()/)
      if (m) defs.push({ name: m[2], file: f, line: i + 1, exported: !!m[1], kind: 'const' })
    })
    // NOISE CONTROL (the measured 1000+ false-positive lesson): deep mode only expands DEFINITION EXTRACTION to
    // object-literal methods, and then keeps only MECHANISM-named ones - a method whose name a lifecycle owns is
    // supposed to be called by the framework; ordinary private helpers are not a wiring claim at all.
    if (deep) for (const d of objectMethods(f, readFileSync(f, 'utf8'))) if (MECHANISM.test(d.name)) defs.push(d)
  }
  // Public service methods: enumerate the ACTUAL kernel, not prose.
  const services = new Map()
  try {
    const km = await import(pathToFileURL(join(VMU, 'kernel', 'index.js')).href)
    for (const opts of [{ clock: () => 0, settings: {} }, { clock: () => 0, settings: {}, slots: [{ id: 'member', capacity: 0, permissions: ['speak', 'vote'] }] }]) {
      let k; try { k = km.createKernel(opts) } catch { continue }
      for (const key of Object.keys(k)) {
        const s = k[key]; if (!s || typeof s !== 'object') continue
        for (const m of Object.keys(s)) if (typeof s[m] === 'function') if (!services.has(m)) services.set(m, key)
      }
    }
  } catch { /* reported by an empty B; never silently claimed */ }
  for (const [name, service] of services) if (!defs.some((d) => d.name === name)) defs.push({ name, file: join(VMU, 'kernel', 'index.js'), line: 0, exported: true, kind: 'service-method', service })
  const annotations = new Map(Object.entries(PUBLIC_API))
  const defects = new Map(Object.entries(KNOWN_DEFECTS))
  return { rows: classify({ defs, texts, testTexts, services, annotations, defects, relOf: rel }), rel }
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest()
  const deep = process.argv.includes('--deep')
  const strict = process.argv.includes('--strict')
  const listB = process.argv.includes('--list-b')
  const { rows, rel } = await census({ deep })
  const by = { A: [], B: [], C: [], D: [] }
  for (const r of rows) by[r.cls].push(r)
  const unclear = by.B.filter((r) => !r.why && !r.defect)
  const defectRows = rows.filter((r) => r.defect)
  console.log('=== READER CENSUS (wiring layer: does anything READ it?) ' + (deep ? '[DEEP]' : '') + ' ===')
  const titles = {
    A: '内部机制【无读点】—— 应被接线却没接（缺陷）',
    B: '对外 API【无仓内读点】—— 常态，不是缺陷',
    C: '仅【测试读点】—— 生产无读点',
    D: '死代码 —— 与读点无关（另一件事）',
  }
  for (const k of ['A', 'B', 'C', 'D']) {
    console.log('\n-- ' + k + ': ' + by[k].length + '  ' + titles[k])
    for (const r of by[k].slice(0, listB || k !== 'B' ? 60 : 30)) console.log('   ' + fmt(r, rel))
  }
  console.log('\n-- 已裁定为缺陷（待修；owner 已具名，不是“边界不清”）：' + defectRows.length)
  for (const r of defectRows) {
    console.log('   DEFECT  ' + rel(r.file) + '::' + r.name + '  [' + r.defect.owner + ']')
    console.log('           why=' + r.defect.why)
    console.log('           evidence=' + r.defect.evidence)
  }
  console.log('\nB breakdown: service methods=' + by.B.filter((r) => r.service).length
    + ', annotated=' + by.B.filter((r) => r.why).length
    + ', ★ BOUNDARY-UNCLEAR=' + unclear.length)
  if (unclear.length) for (const r of unclear) console.log('   BOUNDARY-UNCLEAR  ' + rel(r.file) + '::' + r.name)
  console.log('SUMMARY ' + JSON.stringify({ A: by.A.length, B: by.B.length, C: by.C.length, D: by.D.length, unclear: unclear.length, defects: defectRows.length, deep }))
  if (strict && (by.A.length > 0 || by.C.length > 0 || unclear.length > 0 || defectRows.length > 0)) {
    console.error('STRICT: A (no reader) / C (test-only) / BOUNDARY-UNCLEAR / KNOWN DEFECTS must all be empty')
    process.exitCode = 1
  }
}

function selftest() {
  const root = mkdtempSync(join(process.env.TEMP_SLV_INSPECT || 'D:\\_tmp', 'readers-selftest-'))
  let failed = 0
  const ok = (cond, name, detail) => { if (cond) console.log('  ok   ' + name); else { failed++; console.log('  FAIL ' + name + ' :: ' + JSON.stringify(detail)) } }
  try {
    mkdirSync(join(root, 'kernel'), { recursive: true })
    // Fixture 1: a top-level mechanism with no production reader, an exported API that IS read, an unread EXPORT.
    const prod = [
      'function flush() { return 1 }',
      'function exportedApi() { return 2 }',
      'const realCaller = () => exportedApi()',
      'export function mysteryApi() { return 3 }',
    ].join('\n')
    writeFileSync(join(root, 'kernel', 'fixture.js'), prod, 'utf8')
    const texts = new Map([[join(root, 'kernel', 'fixture.js'), strip(prod)], [join(root, 'kernel', 'caller.js'), 'const realCaller = () => exportedApi()']])
    const testTexts = new Map([[join(root, 'fixture.test.mjs'), 'flush(); // calls flush only in tests']])
    const defs = [
      { name: 'flush', file: join(root, 'kernel', 'fixture.js'), line: 1, exported: false, kind: 'function' },
      { name: 'exportedApi', file: join(root, 'kernel', 'fixture.js'), line: 2, exported: false, kind: 'function' },
      { name: 'mysteryApi', file: join(root, 'kernel', 'fixture.js'), line: 4, exported: true, kind: 'function' },
    ]
    const rows = classify({ defs, texts, testTexts, services: new Map() })
    const a = rows.find((r) => r.name === 'flush')
    const b = rows.find((r) => r.name === 'mysteryApi')
    const read = rows.find((r) => r.name === 'exportedApi')
    ok(a && a.cls === 'A', '★ 正：内部机制 flush 无读点 ⇒ A（说“无读点”，不说“无消费者”）', a)
    ok(!read, '★ 反：有生产读点的 exportedApi 根本不进清单（A/B 都不是）', read)
    ok(b && b.cls === 'B' && !b.why, '★ 正：无读点的导出 ⇒ B 且【边界不清】（未标注）', b)
    const annotated = classify({ defs, texts, testTexts, services: new Map(), annotations: new Map([[join(root, 'kernel', 'fixture.js') + '::mysteryApi', 'why']]) })
    const ab = annotated.find((r) => r.name === 'mysteryApi')
    ok(ab && ab.cls === 'B' && ab.why, '★ 反：同一个导出被 PUBLIC_API 标注后 ⇒ 不再是边界不清', ab)
    // Fixture 2: test-only reader ⇒ C (the old classification could never reach C: exported was captured by B first).
    const tOnly = { name: 'probeHelper', file: join(root, 'kernel', 'fixture.js'), line: 7, exported: false, kind: 'function' }
    const rowsC = classify({ defs: [...defs, tOnly], texts, testTexts: new Map([[join(root, 'fixture.test.mjs'), 'probeHelper()']]), services: new Map() })
    const c = rowsC.find((r) => r.name === 'probeHelper')
    ok(c && c.cls === 'C' && c.test > 0, '★ 正：只有测试读它 ⇒ C（仅测试读点）—— 旧分类器到不了这一类', c)
    // Fixture 3 (--deep): a PRIVATE object method that nothing reads must be reported; one that is called must not.
    const objSrc = [
      'const mech = {',
      '  sweepOnce() { return 1 },',
      '  drainNow() { return 2 },',
      '  caller() { return this.drainNow() },',
      '}',
    ].join('\n')
    const om = objectMethods(join(root, 'kernel', 'obj.js'), strip(objSrc))
    // ONE entry only: counting the same source twice would count the definition line's mentions twice and make the
    // unread method look read (the fixture must mirror the real census, where a file appears once).
    const deepTexts = new Map([[join(root, 'kernel', 'obj.js'), strip(objSrc)]])
    const deepRows = classify({ defs: om, texts: deepTexts, testTexts: new Map(), services: new Map() })
    const sweep = deepRows.find((r) => r.name === 'sweepOnce')
    const drain = deepRows.find((r) => r.name === 'drainNow')
    ok(!!sweep && sweep.cls === 'A', '★ 正：--deep 的私有对象方法 sweepOnce 无读点 ⇒ A（对象内部方法不再漏检）', sweep)
    ok(!drain, '★ 反：被 this.drainNow() 读到的私有方法不进清单（防噪声的关键：靠引用计数，而不是靠猜）', drain)
  } finally { rmSync(root, { recursive: true, force: true }) }
  console.log('SELFTEST ' + (failed === 0 ? 'PASS' : 'FAIL') + ' (' + failed + ' failed)')
  process.exitCode = failed === 0 ? 0 : 1
}

main()
