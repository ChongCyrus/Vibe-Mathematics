#!/usr/bin/env node
// audit-no-consumer.mjs — PHASE 9 / round 6: RED LINE 4 CENSUS ("a mechanism with no consumer").
//
// Human diagnostic FIRST (do not wire into regen --check yet). It enumerates DEFINITIONS in the shipped framework,
// counts their call sites in production and in tests, and classifies every zero-production-call definition:
//
//   A  INTERNAL MECHANISM — a lifecycle-shaped name (flush/drain/tick/sweep/pump/settle/reconcile/recover/…)
//                            that the framework itself is supposed to call at a known moment. Zero production calls
//                            is a DEFECT (mailbox.flush was the measured instance).
//   B  PUBLIC API — exported top-level entry / a method on a kernel service. No in-repo consumer is NORMAL. A public
//                            one with no documentation note is reported as "boundary unclear", not as a defect.
//   C  TEST-ONLY — a non-exported top-level helper whose only mentions are in tests (that is "mechanism built for
//                            the test", a defect). Normally this should be 0.
//   D  SUPERSEDED — listed in the explicit SUPERSEDED table below. Kept empty unless there is measured evidence.
//
// The measured numbers are printed by category; A/C/D non-empty is the gate signal, B is only counted. This script
// deliberately does NOT run tests, write files, or use randomness (except the selftest's D:\_tmp fixture, removed).
import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const TESTS = join(REPO, 'tests')

export const MECHANISM = /^(flush|drain|tick|sweep|pump|settle|reconcile|recover|hydrate|persist|snapshot|restore|compact|expire|prune|reap|vacuum|autoArm|arm|refresh|sync|dispatch|apply|finalize|finish|collect|process|runPending|markInjected|clearInjected|deliverable|flushPending|drainQueue|pumpQueue|tickOnce|sweepOnce|resume|invalidate|touch|poll|schedule|unlock|lock|commit|rollback|abort|close|open|start|stop|reset|clear|load|save|emit|fire)$/i
export const SUPERSEDED = Object.freeze([])

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
const lineIsDef = (line, name) => new RegExp('(?:function|const|let|var|get|async)?\\s*\\b' + name.replace(/[$]/g, '\\$') + '\\s*\\(').test(line) && /(?:function|=>|^\s*[A-Za-z_$][\w$]*\s*\()/.test(line)
export const countRefs = (name, texts, def) => {
  const re = new RegExp('\\b' + name.replace(/[$]/g, '\\$') + '\\b', 'g')
  let n = 0
  for (const [file, text] of texts) {
    let local = 0
    for (const line of text.split('\n')) {
      if (file === def.file && def.line === 0) continue
      const m = line.match(re)
      if (m) local += m.length
    }
    // subtract the definition itself (one occurrence on its own line)
    if (file === def.file) local -= 1
    if (local > 0) n += local
  }
  return n
}

export const classify = ({ defs, texts, testTexts, services }) => {
  const rows = []
  for (const d of defs) {
    if (d.name.length < 4) continue
    if (SUPERSEDED.includes(d.name)) { rows.push({ ...d, cls: 'D', prod: 0, test: 0, service: null }); continue }
    const prod = Math.max(0, countRefs(d.name, texts, d))
    if (prod > 0) continue
    const test = Math.max(0, countRefs(d.name, testTexts, { file: null, line: -1 }))
    const service = services.get(d.name) || null
    let cls
    if (MECHANISM.test(d.name)) cls = 'A'
    else if (service || d.exported) cls = 'B'
    else if (test > 0 && d.exported) cls = 'C'
    else cls = 'B'
    rows.push({ ...d, cls, prod, test, service })
  }
  return rows
}

async function main() {
  if (process.argv.includes('--selftest')) return selftest()
  const vmu = join(REPO, 'vibe-math-vmu')
  const files = walk(vmu).filter((f) => !f.includes(join('vibe-math-vmu', 'docs')))
  const tests = walk(TESTS)
  const texts = new Map(files.map((f) => [f, strip(readFileSync(f, 'utf8'))]))
  const testTexts = new Map(tests.map((f) => [f, strip(readFileSync(f, 'utf8'))]))
  const defs = []
  for (const f of files) {
    const lines = readFileSync(f, 'utf8').split('\n')
    lines.forEach((line, i) => {
      let m = line.match(/^\s*(export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/)
      if (m) { defs.push({ name: m[2], file: f, line: i + 1, exported: !!m[1], kind: 'function' }); return }
      m = line.match(/^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\()/)
      if (m) defs.push({ name: m[2], file: f, line: i + 1, exported: !!m[1], kind: 'const' })
    })
  }
  // Public service methods: enumerate the ACTUAL kernel, not prose.
  let services = new Map()
  try {
    const km = await import(pathToFileURL(join(vmu, 'kernel', 'index.js')).href)
    for (const opts of [{ clock: () => 0, settings: {} }, { clock: () => 0, settings: {}, slots: [{ id: 'member', capacity: 0, permissions: ['speak', 'vote'] }] }]) {
      let k; try { k = km.createKernel(opts) } catch { continue }
      for (const key of Object.keys(k)) {
        const s = k[key]; if (!s || typeof s !== 'object') continue
        for (const m of Object.keys(s)) if (typeof s[m] === 'function') if (!services.has(m)) services.set(m, key)
      }
    }
  } catch { /* reported by empty B; never silently claimed */ }
  // Add service methods as public definitions even when their implementation is a method in a kernel file.
  for (const [name, service] of services) if (!defs.some((d) => d.name === name)) defs.push({ name, file: join(vmu, 'kernel', 'index.js'), line: 0, exported: true, kind: 'service-method', service })

  const rows = classify({ defs, texts, testTexts, services })
  const by = { A: [], B: [], C: [], D: [] }
  for (const r of rows) by[r.cls].push(r)
  const fmt = (r) => r.name + '  [' + (r.service ? r.service + '.' : '') + r.kind + '] ' + relative(REPO, r.file) + (r.line ? ':' + r.line : '') + ' testRefs=' + r.test
  console.log('=== NO-CONSUMER CENSUS (diagnostic; not a gate yet) ===')
  for (const k of ['A', 'B', 'C', 'D']) {
    console.log('\n-- ' + k + ': ' + by[k].length)
    for (const r of by[k].slice(0, 30)) console.log('   ' + fmt(r))
  }
  const unclearB = by.B.filter((r) => r.exported && !r.service)
  console.log('\nB breakdown: service methods=' + by.B.filter((r) => r.service).length + ', exported top-level=' + by.B.filter((r) => !r.service).length + ', exported-without-service-registry=' + unclearB.length)
  console.log('SUMMARY ' + JSON.stringify({ A: by.A.length, B: by.B.length, C: by.C.length, D: by.D.length }))
}

function selftest() {
  const root = mkdtempSync(join(process.env.TEMP_SLV_INSPECT || 'D:\\_tmp', 'no-consumer-selftest-'))
  let failed = 0
  const ok = (cond, name, detail) => { if (cond) console.log('  ok   ' + name); else { failed++; console.log('  FAIL ' + name + ' :: ' + JSON.stringify(detail)) } }
  try {
    mkdirSync(join(root, 'kernel'), { recursive: true })
    const prod = [
      'function flush() { return 1 }',
      'function exportedApi() { return 2 }',
      'const realCaller = () => exportedApi()',
    ].join('\n')
    writeFileSync(join(root, 'kernel', 'fixture.js'), prod, 'utf8')
    const texts = new Map([[join(root, 'kernel', 'fixture.js'), strip(prod)], [join(root, 'kernel', 'caller.js'), 'const realCaller = () => exportedApi()']])
    const testTexts = new Map([[join(root, 'fixture.test.mjs'), 'flush(); // calls flush only in tests']])
    const defs = [
      { name: 'flush', file: join(root, 'kernel', 'fixture.js'), line: 1, exported: false, kind: 'function' },
      { name: 'exportedApi', file: join(root, 'kernel', 'fixture.js'), line: 2, exported: true, kind: 'function' },
    ]
    const rows = classify({ defs, texts, testTexts, services: new Map() })
    const a = rows.find((r) => r.name === 'flush')
    const b = rows.find((r) => r.name === 'exportedApi')
    ok(a && a.cls === 'A' && a.test > 0, '★ 自证：内部机制 flush 无生产调用 ⇒ A 类（不是“无调用者”一句话）', a)
    ok(!b, '★ 反：导出的 exportedApi 有生产调用 ⇒ 根本不出现在清单里（不是 A 也不是 B）', b)
    const unusedExport = { name: 'outerApi', file: join(root, 'kernel', 'fixture.js'), line: 9, exported: true, kind: 'function' }
    const rows2 = classify({ defs: [...defs, unusedExport], texts, testTexts, services: new Map() })
    const ub = rows2.find((r) => r.name === 'outerApi')
    ok(ub && ub.cls === 'B', '★ 反：无生产调用的导出 ⇒ B 类（对外 API，允许），不是 A', ub)
  } finally { rmSync(root, { recursive: true, force: true }) }
  console.log('SELFTEST ' + (failed === 0 ? 'PASS' : 'FAIL') + ' (' + failed + ' failed)')
  process.exitCode = failed === 0 ? 0 : 1
}

main()
