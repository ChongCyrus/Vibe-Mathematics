// scripts/sim/audit/receipt-texts.mjs — every word a receipt says, extracted and counted.
//
// WHY THIS EXISTS: a receipt's TEXT is half its interface. The audit round after RUN 239 found the same sentence
// repeated across tools, hints that name an action/parameter the tool does not have, and one instruction delivered
// from six different receipts. None of that is visible in a passing test: tests assert `ok===true`, not what the
// reader was told. This script reads the simulated corpora (`receipts.jsonl` only — never re-runs a scenario), pulls
// every human-facing string field out of every receipt, and reports duplicates + hints that point at a dead end.
//
// Usage:
//   node scripts/sim/audit/receipt-texts.mjs [--out <dir>] [--corpus <dir> ...]
//   (no --corpus ⇒ every directory under the sim root that has a receipts.jsonl; corpus-r240-* preferred)
// Outputs (default `<temp root>/sim`):
//   receipt-texts.jsonl       {corpus,tool,seq,code,field,text}
//   receipt-texts-stats.md    top-20 repeated sentences, cross-tool repeats, suspicious hint tokens
//
// READ-ONLY over the product and over the corpora: it writes only the two files above.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpRoot as gateTmpRoot } from '../../lib/tmp-root.mjs'
import { boot, tmpRoot } from '../harness.mjs'

const TEXT_FIELDS = /^(means|hint|message|note|why)$/i
const MEANS_FIELD = /Means$/

const argOf = (flag) => {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? String(process.argv[i + 1] || '') : ''
}
const OUT = argOf('--out') || join(gateTmpRoot(), 'sim')
const SIM = join(gateTmpRoot(), 'sim')

const readJsonl = (file) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => { try { return JSON.parse(l) } catch { return null } })
    .filter(Boolean)

/** Collect every human-facing string in a receipt, with its dotted field path and the nearest refusal code. */
export function extractTexts(receipt, corpus, tool, seq) {
  const rows = []
  const walk = (node, path, code) => {
    if (node === null || typeof node !== 'object') return
    const code2 = typeof node.code === 'string' ? node.code : code
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`, code2))
      return
    }
    for (const [k, v] of Object.entries(node)) {
      const p = path === '' ? k : `${path}.${k}`
      if (typeof v === 'string' && (TEXT_FIELDS.test(k) || MEANS_FIELD.test(k))) {
        rows.push({ corpus, tool, seq, code: code2 || null, field: p, text: v })
      } else if (v && typeof v === 'object') {
        walk(v, p, code2)
      }
    }
  }
  walk(receipt, '', null)
  return rows
}

const norm = (s) => String(s).replace(/\s+/g, ' ').trim()
const sentencesOf = (text) => text.split(/(?<=[。！？；\n])/).map(norm).filter((s) => s.length >= 6)

/** Every object key seen in the receipts — a hint may legitimately tell the reader to look at a receipt field. */
function collectKeys(node, set) {
  if (Array.isArray(node)) {
    for (const v of node) collectKeys(v, set)
    return
  }
  if (node === null || typeof node !== 'object') return
  for (const [k, v] of Object.entries(node)) {
    set.add(k)
    if (v && typeof v === 'object') collectKeys(v, set)
  }
}

function corpusDirs() {
  const asked = process.argv.slice(2).filter((a) => a !== '--out' && !a.endsWith('receipt-texts.mjs') && existsSync(join(a, 'receipts.jsonl')))
  if (asked.length) return asked.slice(0, 10)
  const all = readdirSync(SIM, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(SIM, e.name, 'receipts.jsonl')))
    .map((e) => join(SIM, e.name))
  const r240 = all.filter((d) => /corpus-r240-/.test(d))
  return (r240.length ? r240 : all).sort()
}

async function vocabulary() {
  const root = tmpRoot('p240-receipts-')
  const harness = await boot({ root, withPrompt: false })
  const tools = harness.names()
  const params = new Set()
  const enums = new Set()
  const actions = new Map()
  const collect = (schema) => {
    if (!schema || typeof schema !== 'object') return
    if (Array.isArray(schema.enum)) schema.enum.forEach((v) => typeof v === 'string' && enums.add(v))
    for (const [k, v] of Object.entries(schema.properties || {})) {
      params.add(k)
      collect(v)
    }
    if (schema.items) collect(schema.items)
  }
  for (const name of tools) {
    const spec = harness.specOf(name)
    collect(spec && spec.parameters)
    const a = spec && spec.parameters && spec.parameters.properties && spec.parameters.properties.action
    if (a && Array.isArray(a.enum)) actions.set(name, a.enum)
  }
  return { tools, params, enums, actions }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const dirs = corpusDirs()
  if (!dirs.length) throw new Error('no corpus directory with a receipts.jsonl was found')
  const rows = []
  const fieldNames = new Set()
  for (const dir of dirs) {
    const file = join(dir, 'receipts.jsonl')
    for (const r of readJsonl(file)) {
      collectKeys(r.receipt || {}, fieldNames)
      rows.push(...extractTexts(r.receipt || {}, dir.split(/[\\/]/).pop(), r.tool, r.seq))
    }
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'receipt-texts.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n')

  const vocab = await vocabulary()
  const byText = new Map()
  for (const r of rows) {
    const k = norm(r.text)
    if (k === '') continue
    if (!byText.has(k)) byText.set(k, { text: r.text, tools: new Set(), fields: new Set(), codes: new Set(), count: 0 })
    const e = byText.get(k)
    e.count += 1
    e.tools.add(r.tool)
    e.fields.add(r.field)
    if (r.code) e.codes.add(r.code)
  }
  const top20 = [...byText.values()].sort((a, b) => b.count - a.count).slice(0, 20)
  const crossTool = [...byText.values()].filter((e) => e.tools.size >= 2).sort((a, b) => b.tools.size - a.tools.size || b.count - a.count)

  const sentenceHits = new Map()
  for (const r of rows) {
    for (const s of sentencesOf(r.text)) {
      if (!sentenceHits.has(s)) sentenceHits.set(s, { tools: new Set(), count: 0 })
      const e = sentenceHits.get(s)
      e.count += 1
      e.tools.add(r.tool)
    }
  }
  const repeatedSentences = [...sentenceHits.entries()]
    .filter(([, e]) => e.count >= 2)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 40)

  // ── suspicious hints: a hint that names a tool/action/parameter which does not exist ────────────────────────────
  // Only `hint` fields are prescriptions ("pass X", "use tool Y") — `*Means`/`note` prose is explanation, so it is
  // not scanned here. The vocabulary is widened with every field name that actually appears in the receipts, because
  // a hint legitimately talks about receipt fields ("see `rosterBefore`"); only names absent from EVERY vocabulary
  // are reported. Plain English in backticks (`already`, `ONLY`, `process`) is prose, not an identifier: a candidate
  // must be toolish (vibe_ prefix) or identifier-shaped (underscore or camelCase).
  const suspicious = []
  const known = new Set([...vocab.tools, ...vocab.params, ...vocab.enums, ...fieldNames])
  const hintish = (f) => f === 'hint' || f.endsWith('.hint') || f.endsWith('.hints') || f.endsWith('.hintText')
  const pushFinding = (r, kind, token, extra) => suspicious.push({ tool: r.tool, code: r.code, field: r.field, kind, token, ...extra, text: r.text })
  for (const r of rows) {
    if (!hintish(r.field)) continue
    if (typeof r.text !== 'string' || r.text.trim() === '') continue
    // (a) named tools must exist in the booted pack
    for (const m of r.text.matchAll(/vibe_[a-z0-9_]+/g)) {
      if (!vocab.tools.includes(m[0])) pushFinding(r, 'unknown-tool', m[0], { detail: 'not a tool of the booted pack' })
    }
    // (b) action/op values must be in that tool's declared action enum (when it has one)
    for (const m of r.text.matchAll(/(?:action|op)\s*:\s*`?"?([A-Za-z0-9_-]+)/g)) {
      const val = m[1]
      if (vocab.actions.has(r.tool) && !vocab.actions.get(r.tool).includes(val)) {
        pushFinding(r, 'bad-action', val, { detail: `not in ${r.tool} action enum [${vocab.actions.get(r.tool).join('|')}]` })
      }
    }
    // (c) parameter-like identifiers quoted as arguments ("pass `field`" / `field:"…"`)
    const quoted = []
    for (const m of r.text.matchAll(/`([^`\n]{1,80})`/g)) quoted.push(m[1].trim())
    for (const m of r.text.matchAll(/([A-Za-z_][A-Za-z0-9_]{2,})\s*:"/g)) quoted.push(m[1])
    for (const tok of quoted) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tok)) continue
      if (known.has(tok)) continue
      if (!(tok.startsWith('vibe_') || /_/.test(tok) || /^[a-z]+([A-Z][a-z0-9]+)+$/.test(tok))) continue
      pushFinding(r, 'unknown-identifier', tok, { detail: 'absent from tools, params, enums and receipt field names' })
    }
  }
  const suspiciousUnique = []
  const seen = new Set()
  for (const s of suspicious) {
    const k = s.tool + '\u0000' + s.kind + '\u0000' + s.token + '\u0000' + norm(s.text)
    if (seen.has(k)) continue
    seen.add(k)
    suspiciousUnique.push(s)
  }
  suspiciousUnique.sort((a, b) => a.kind.localeCompare(b.kind) || a.tool.localeCompare(b.tool) || a.token.localeCompare(b.token))

  const md = buildStats({ rows, dirs, byText, top20, crossTool, repeatedSentences, suspiciousUnique, vocab })
  writeFileSync(join(OUT, 'receipt-texts-stats.md'), md)
  process.stdout.write(`wrote ${join(OUT, 'receipt-texts.jsonl')} (${rows.length} strings from ${dirs.length} corpora), ${join(OUT, 'receipt-texts-stats.md')}\n`)
  process.stdout.write(`unique texts: ${byText.size} · cross-tool repeats: ${crossTool.length} · repeated sentences: ${repeatedSentences.length} · suspicious hint tokens: ${suspiciousUnique.length}\n`)
}

function buildStats({ rows, dirs, byText, top20, crossTool, repeatedSentences, suspiciousUnique, vocab }) {
  const out = []
  out.push('# 回执文字统计（receipt-texts-stats）')
  out.push('')
  out.push(`语料：${dirs.map((d) => d.split(/[\\/]/).pop()).join(', ')}`)
  out.push(`抽出文字面：${rows.length} 条（去重后 ${byText.size} 句）；工具 ${vocab.tools.length} 个。`)
  out.push('')
  out.push('## 一、出现最多的 20 句')
  out.push('')
  for (const e of top20) out.push(`- ×${e.count} · tools=${[...e.tools].join(',')} · fields=${[...e.fields].join(',')} · codes=${[...e.codes].join(',') || '-'}`)
  out.push('')
  out.push('## 二、跨工具重复句（同一句 ≥2 个工具）')
  out.push('')
  out.push(`共 ${crossTool.length} 句。`)
  out.push('')
  for (const e of crossTool.slice(0, 120)) out.push(`- tools=${[...e.tools].join(',')} · ${norm(e.text)}`)
  out.push('')
  out.push('## 三、重复最多的句子片段（≥2 次，Top 40）')
  out.push('')
  for (const [s, e] of repeatedSentences) out.push(`- ×${e.count} · tools=${[...e.tools].join(',')} · ${s}`)
  out.push('')
  out.push('## 四、可疑 hint 串（hint 指向不存在的工具 / 动作值 / 参数名）')
  out.push('')
  out.push(`共 ${suspiciousUnique.length} 条。判据：只扫 \`hint\` 字段（\`*Means\`/\`note\` 是解释文，不是指路文）；(a) 出现的 \`vibe_*\` 必须是已装载工具；`)
  out.push('(b) `action:"值"`/`op:"值"` 必须在该工具的 action 枚举内；(c) 反引号里的参数名必须出现在工具名、参数名、枚举值或**真实回执字段名**词表中；纯英文散文词（already/ONLY/process）不报。')
  out.push('')
  for (const s of suspiciousUnique.slice(0, 200)) out.push(`- [${s.kind}] [${s.tool}${s.code ? ' ' + s.code : ''}] token=\`${s.token}\` · ${s.detail} · field=${s.field} · hint=${norm(s.text)}`)
  out.push('')
  return out.join('\n') + '\n'
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('receipt-texts.mjs')) {
  main().catch((e) => { process.stderr.write('receipt-texts: ' + (e && e.stack ? e.stack : e) + '\n'); process.exit(1) })
}
