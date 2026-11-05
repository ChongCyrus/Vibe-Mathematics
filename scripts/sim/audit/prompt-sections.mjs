// scripts/sim/audit/prompt-sections.mjs — slice the REAL assembled prompt into provenance-traceable sections.
//
// WHY THIS EXISTS: `scripts/sim/run.mjs` only stores whole assembled prompt texts (`prompts.jsonl`). An audit of
// "which part is long / which sentence repeats / is this said at the wrong time" cannot be done from whole texts:
// it needs every section's chars, text and position, per seat × phase. This script therefore calls the SAME
// assembly path the turn loop calls (`harness.prompts.assembleFor`, built in `scripts/sim/harness.mjs:215-222` over
// the real `createPromptPipeline` + `createTurnOrchestrator`), and then splits THAT text on its own section
// headings (`# <section-id>` lines the pipeline itself emits). It never renders a second time, so the sum of the
// slices is the text a seat would actually read.
//
// Usage:
//   node scripts/sim/audit/prompt-sections.mjs [--out <dir>] [--slots chair,member,temp] [--phases normal,meeting,checkpoint,verify]
// Outputs (default `D:/_tmp/sim`):
//   prompt-sections.json      {generatedAt, combos:[{slot,phase,chars,headings}], sections:[{slot,phase,sectionId,order,chars,text}]}
//   prompt-sections-index.md  per slot/phase totals + section ranking + first-line summaries + duplicate appendix
//
// READ-ONLY over the product: it boots the kernel in a throwaway workspace and writes only the two files above.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { REPO, boot, tmpRoot } from '../harness.mjs'

const DEFAULT_SLOTS = ['chair', 'member', 'temp']
const DEFAULT_PHASES = ['normal', 'meeting', 'checkpoint', 'verify']

function argOf(flag) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? String(process.argv[i + 1] || '') : ''
}
const OUT = argOf('--out') || 'D:/_tmp/sim'
const SLOTS = (argOf('--slots') || DEFAULT_SLOTS.join(',')).split(',').map((s) => s.trim()).filter(Boolean)
const PHASES = (argOf('--phases') || DEFAULT_PHASES.join(',')).split(',').map((s) => s.trim()).filter(Boolean)

/** Split one assembled text on the `# <section-id>` heading lines the pipeline emits. */
export function splitSections(text) {
  const heads = [...text.matchAll(/^# ([a-z0-9][a-z0-9_-]*)$/gm)]
  const rows = []
  if (!heads.length) return rows
  const preamble = text.slice(0, heads[0].index).replace(/\n{2,}$/, '')
  if (preamble.trim() !== '') rows.push({ sectionId: '<preamble>', chars: preamble.length, text: preamble })
  for (let i = 0; i < heads.length; i += 1) {
    const start = heads[i].index + heads[i][0].length + 1
    const end = i + 1 < heads.length ? heads[i + 1].index : text.length
    const body = text.slice(start, end).replace(/\n{2,}$/, '')
    rows.push({ sectionId: heads[i][1], chars: body.length, text: body })
  }
  return rows
}

/** Sentence-ish units for duplicate analysis: split after 。！？ and on newlines; a clause split (；) stays inside a
 *  sentence so a duplicate "句" is a unit a reader would actually call a sentence. Drop empties under 8 chars. */
function sentencesOf(text) {
  return text
    .split(/(?<=[。！？\n])/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 8)
}

const norm = (s) => s.replace(/\s+/g, '')

async function main() {
  mkdirSync(OUT, { recursive: true })
  const root = tmpRoot('p240-sections-')
  const harness = await boot({ root, withPrompt: true })
  const sections = []
  const combos = []
  for (const slot of SLOTS) {
    for (const phase of PHASES) {
      const text = await harness.prompts.assembleFor({ seat: slot, phase })
      const parts = splitSections(text)
      combos.push({ slot, phase, chars: text.length, headings: parts.length })
      for (let i = 0; i < parts.length; i += 1) {
        sections.push({ slot, phase, sectionId: parts[i].sectionId, order: i, chars: parts[i].chars, text: parts[i].text })
      }
      process.stdout.write(`  ${slot}/${phase}: ${text.length} chars in ${parts.length} sections\n`)
    }
  }
  rmSync(root, { recursive: true, force: true })

  writeFileSync(join(OUT, 'prompt-sections.json'), JSON.stringify({ generatedAt: new Date().toISOString(), repo: REPO, combos, sections }, null, 2) + '\n')

  // ── duplicate appendix: the same sentence in two different sections is said twice, whatever the reason ───────────
  const canonical = new Map() // sectionId -> text (first combo that renders it; bindings differ by slot, keep all)
  for (const r of sections) {
    const key = r.sectionId + '\u0000' + norm(r.text)
    if (!canonical.has(key)) canonical.set(key, r)
  }
  const sentenceHits = new Map() // normalized sentence -> Set(sectionId)
  const gramHits = new Map() // 25-char window -> Set(sectionId)
  for (const r of canonical.values()) {
    for (const s of sentencesOf(r.text)) {
      const k = norm(s)
      if (!sentenceHits.has(k)) sentenceHits.set(k, new Set())
      sentenceHits.get(k).add(r.sectionId)
      if (k.length >= 25) {
        for (let i = 0; i + 25 <= k.length; i += 1) {
          const g = k.slice(i, i + 25)
          if (!gramHits.has(g)) gramHits.set(g, new Set())
          gramHits.get(g).add(r.sectionId)
        }
      }
    }
  }
  const exactDups = [...sentenceHits.entries()].filter(([, ids]) => ids.size >= 2).map(([sentence, ids]) => ({ sentence, sections: [...ids].sort() }))

  // ── near-duplicate spans: ≥25 consecutive chars shared by two sections ───────────────────────────────────────────
  // Raw 25-char windows produce 25 shifted variants of ONE shared passage, which is exactly what "Top 80 windows" listed
  // before: a single JSON sample filled the whole top of the table. Merge consecutive qualifying windows into the MAXIMAL
  // shared span, then dedupe identical spans which several sections render independently.
  const nearDupeMap = new Map() // span text + other-section set -> {gram, sections, chars}
  for (const r of canonical.values()) {
    const t = norm(r.text)
    let runStart = -1
    const flush = (endExclusive) => {
      if (runStart === -1) return
      const span = t.slice(runStart, endExclusive)
      const others = new Set()
      for (let i = runStart; i + 25 <= endExclusive; i += 1) {
        for (const id of gramHits.get(t.slice(i, i + 25)) || []) if (id !== r.sectionId) others.add(id)
      }
      runStart = -1
      if (others.size === 0) return
      const key = span
      const prev = nearDupeMap.get(key)
      if (prev) { for (const id of [r.sectionId, ...others]) prev.sections.add(id) }
      else nearDupeMap.set(key, { gram: span, sections: new Set([r.sectionId, ...others]), chars: span.length })
    }
    for (let i = 0; i + 25 <= t.length; i += 1) {
      const ids = gramHits.get(t.slice(i, i + 25))
      if (ids && ids.size >= 2) { if (runStart === -1) runStart = i } else flush(i)
    }
    flush(t.length)
  }
  // Drop spans contained in a longer kept span (overlapping runs from adjacent canonical copies still produce suffixes).
  const nearAll = [...nearDupeMap.values()].map((n) => ({ gram: n.gram, chars: n.chars, sections: [...n.sections].sort() })).sort((a, b) => b.chars - a.chars || b.sections.length - a.sections.length)
  const nearDups = []
  for (const n of nearAll) {
    if (nearDups.some((kept) => kept.gram.includes(n.gram))) continue
    nearDups.push(n)
    if (nearDups.length >= 80) break
  }

  // ── timing/position: a phase-presence matrix, NOT keywords ───────────────────────────────────────────────────────
  // A keyword test ("section mentions a meeting but also renders in normal") flags every tools list that merely NAMES
  // `vibe_v5_meeting`, which is legitimate. What can be judged from the bytes alone is WHERE each section carries text:
  // a section that renders (chars>1) only in some phases is phase-gated; one that renders in normal although its id
  // marks a stage (formal/paper/verify/meeting/resume/checkpoint) is a candidate mismatch; one that never carries any
  // text in any phase is a declared-but-dead section.
  const phaseRows = new Map() // sectionId -> { slots, phases, live, charsByPhase, sample }
  for (const r of sections) {
    const row = phaseRows.get(r.sectionId) ?? { sectionId: r.sectionId, slots: new Set(), phases: new Set(), live: new Set(), charsByPhase: {}, sample: null }
    row.slots.add(r.slot)
    row.phases.add(r.phase)
    row.charsByPhase[r.phase] = Math.max(row.charsByPhase[r.phase] || 0, r.chars)
    if (r.chars > 1) {
      row.live.add(r.phase)
      if (!row.sample) row.sample = r
    }
    phaseRows.set(r.sectionId, row)
  }
  // Stage words are matched as id TOKENS: `v5r-turn-meeting-schedule` marks a meeting stage even though `meeting` is not
  // the second token, which a `v5r-meeting` prefix test would miss.
  const stageTokens = new Set(['formal', 'paper', 'verify', 'meeting', 'resume', 'checkpoint', 'agenda'])
  const stageOf = (id) => id.split('-').find((t) => stageTokens.has(t)) || null
  const timing = []
  for (const row of phaseRows.values()) {
    const phases = [...row.phases].sort()
    const livePhases = [...row.live].sort()
    const slotSet = [...row.slots].sort()
    const base = { sectionId: row.sectionId, slotSet, phases, livePhases }
    const stage = stageOf(row.sectionId)
    if (livePhases.length === 0) {
      timing.push({ ...base, kind: 'always-empty', chars: 0, firstLine: '', reason: '声明在全部相位，但每个相位都渲染为空：这一节从不承载文本（绑定缺失或死节）' })
    } else if (livePhases.length < phases.length) {
      timing.push({ ...base, kind: 'phase-gated', chars: row.charsByPhase[livePhases[0]] ?? 0, firstLine: firstLine(row.sample.text), reason: `只在 ${livePhases.join('/')} 有文本，其余相位为空（相位门闸生效）` })
    } else if (stage && row.phases.has('normal') && row.live.has('normal')) {
      timing.push({ ...base, kind: 'stage-in-normal', chars: row.charsByPhase.normal ?? 0, firstLine: firstLine(row.sample.text), reason: `section id 标为 ${stage} 阶段，却在全部相位（含 normal 常规回合）渲染同样的 ${row.charsByPhase.normal ?? 0} chars` })
    }
  }
  timing.sort((a, b) => a.kind.localeCompare(b.kind) || b.chars - a.chars)

  const md = buildIndex({ combos, sections, exactDups, nearDups, timing })
  writeFileSync(join(OUT, 'prompt-sections-index.md'), md)
  writeFileSync(join(OUT, 'prompt-sections-dups.json'), JSON.stringify({ exactDups, nearDups, timing }, null, 2) + '\n')
  process.stdout.write(`\nwrote ${join(OUT, 'prompt-sections.json')}, ${join(OUT, 'prompt-sections-index.md')}, ${join(OUT, 'prompt-sections-dups.json')}\n`)
  process.stdout.write(`exact duplicate sentences: ${exactDups.length} · near-duplicate 25-char windows: ${nearDups.length} · timing candidates: ${timing.length}\n`)
}

function firstLine(text) {
  const line = String(text).split('\n').map((l) => l.trim()).filter((l) => l !== '')[0] || ''
  return line.length > 120 ? line.slice(0, 120) + '…' : line
}

function buildIndex({ combos, sections, exactDups, nearDups, timing }) {
  const out = []
  out.push('# 提示词分段索引（prompt-sections-index）')
  out.push('')
  out.push('生成方式：`scripts/sim/audit/prompt-sections.mjs` 调真实装配路径（`harness.prompts.assembleFor`），')
  out.push('再按装配文本自身的 `# <section-id>` 标题切段；切片合计即该席位该相位读到的全文。')
  out.push('')
  out.push('## 一、每 slot × phase 字数')
  out.push('')
  out.push('| slot | phase | chars | sections |')
  out.push('| --- | --- | ---: | ---: |')
  for (const c of combos) out.push(`| ${c.slot} | ${c.phase} | ${c.chars} | ${c.headings} |`)
  const worst = combos.slice().sort((a, b) => b.chars - a.chars)[0]
  const best = combos.slice().sort((a, b) => a.chars - b.chars)[0]
  out.push('')
  out.push(`最长：${worst.slot}/${worst.phase} ${worst.chars} · 最短：${best.slot}/${best.phase} ${best.chars}`)
  out.push('')
  for (const c of combos) {
    const rows = sections.filter((r) => r.slot === c.slot && r.phase === c.phase).slice().sort((a, b) => b.chars - a.chars)
    out.push(`### ${c.slot} / ${c.phase}（${c.chars} chars，${rows.length} sections）`)
    out.push('')
    out.push('| # | sectionId | chars | 首行 |')
    out.push('| ---: | --- | ---: | --- |')
    rows.forEach((r, i) => out.push(`| ${i + 1} | ${r.sectionId} | ${r.chars} | ${firstLine(r.text).replace(/\|/g, '\\|')} |`))
    out.push('')
  }
  out.push('## 二、精确重复句（同一句出现在 ≥2 个 section）')
  out.push('')
  out.push(`共 ${exactDups.length} 句。`)
  out.push('')
  for (const d of exactDups.slice(0, 200)) out.push(`- \`${d.sentence}\` — sections: ${d.sections.join(' · ')}`)
  out.push('')
  out.push('## 三、近似重复（≥25 字连续相同，已合并为极大共享片段，Top 80）')
  out.push('')
  for (const n of nearDups) out.push(`- ${n.chars} chars — \`${n.gram}…\` — sections: ${n.sections.join(' · ')}`)
  out.push('')
  out.push('## 四、时机/位置候选（相位存在矩阵判据）')
  out.push('')
  out.push('判据不看关键词（正文提到 `vibe_v5_meeting` 的工具清单是正当的），只看每节在哪些相位真正有文本（chars>1）：')
  out.push('`always-empty`＝任何相位都空；`stage-in-normal`＝id 标阶段却在含 normal 的全部相位渲染；`phase-gated`＝只在部分相位有文本（门闸生效，正例）。')
  out.push('')
  const kinds = [...new Set(timing.map((t) => t.kind))]
  out.push(`共 ${timing.length} 条：${kinds.map((k) => `${k} ${timing.filter((t) => t.kind === k).length}`).join(' · ')}。`)
  out.push('')
  for (const k of kinds) {
    out.push(`### ${k}`)
    out.push('')
    for (const t of timing.filter((x) => x.kind === k)) {
      out.push(`- ${t.sectionId}（${t.chars} chars；slots=${t.slotSet.join('/')}；phases=${t.phases.join('/')}；live=${t.livePhases.join('/') || '∅'}）— ${t.reason}${t.firstLine ? '；首行：' + t.firstLine : ''}`)
    }
    out.push('')
  }
  return out.join('\n') + '\n'
}

// Allow importing the splitter for other audits without booting a kernel.
if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('prompt-sections.mjs')) {
  main().catch((e) => { process.stderr.write('prompt-sections: ' + (e && e.stack ? e.stack : e) + '\n'); process.exit(1) })
}
