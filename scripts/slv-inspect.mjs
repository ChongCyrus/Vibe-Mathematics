#!/usr/bin/env node
// slv-inspect.mjs — PHASE 9 / goal 5: ONE command to inspect what a real member actually saw and did.
//
//   node scripts/slv-inspect.mjs <sessionDirOrJsonl> [--member <id>] [--json] [--root <dir>]
//   node scripts/slv-inspect.mjs --selftest
//
// It reads DSH session files (`session.v4.jsonl.zstd`, multi-frame zstd, or plain `.jsonl`), never a live host:
//   · visible tools   — request/header tools (count + names + presentation flags);
//   · prompt outline  — # headings + char counts + the "本轮可用的工具" block verbatim;
//   · interactions    — tool/call names + argument summaries + assistant receipts (truncated);
//   · AUTO CHECKS     — promptTools vs wireTools (both directions), unknown tool calls, call/result count mismatch,
//                       and presentation markers (deferLoading / run_code / ptc).
//
// THIS IS A HUMAN DIAGNOSTIC, NOT A GATE: it is intentionally NOT wired into regen --check and it writes nothing
// except the selftest's temporary fixture (removed at the end).
import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, basename, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import zlib from 'node:zlib'

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const CAP = { receipt: 1200, toolBlock: 2000, arg: 220 }

function decompressZstd(b) {
  let off = b.indexOf(MAGIC)
  let all = Buffer.alloc(0)
  while (off >= 0) {
    try { all = Buffer.concat([all, zlib.zstdDecompressSync(b.subarray(off))]) } catch { /* skip a bad frame */ }
    const n = b.indexOf(MAGIC, off + 4)
    if (n < 0) break
    off = n
  }
  return all.toString('utf8')
}
function readSessionText(file) {
  const b = readFileSync(file)
  if (file.endsWith('.zstd')) return decompressZstd(b)
  return b.toString('utf8')
}
function walk(o, fn) {
  if (!o || typeof o !== 'object') return
  fn(o)
  for (const k of Object.keys(o)) walk(o[k], fn)
}
function oneLine(s, cap = CAP.arg) {
  const t = String(s === undefined || s === null ? '' : s).replace(/\s+/g, ' ').trim()
  return t.length <= cap ? t : t.slice(0, cap - 1) + '…'
}
function extractMember(text) {
  const m = /代号：\s*([A-Za-z0-9_-]+)/.exec(text) || /【本轮面向的成员】[^\n]*?([A-Za-z0-9][A-Za-z0-9_-]*)/.exec(text)
  return m ? m[1] : null
}
function sectionsOf(text) {
  const sections = []
  let cur = null
  for (const line of String(text || '').split('\n')) {
    const h = /^#\s+(.+?)\s*$/.exec(line)
    if (h) { cur = { title: h[1], chars: 0 }; sections.push(cur); continue }
    if (cur) cur.chars += Buffer.byteLength(line, 'utf8') + 1
  }
  return sections
}
function toolBlockOf(text) {
  const s = String(text || '')
  const at = s.indexOf('【本轮可用的工具')
  if (at >= 0) {
    const tail = s.slice(at)
    const end = tail.search(/\n#\s/)
    const block = (end < 0 ? tail : tail.slice(0, end)).trim()
    return block.length > CAP.toolBlock ? block.slice(0, CAP.toolBlock - 1) + '…' : block
  }
  const generic = s.indexOf('【本轮可用工具】')
  if (generic >= 0) {
    const tail = s.slice(generic)
    const end = tail.indexOf('\n\n')
    const block = (end < 0 ? tail : tail.slice(0, end)).trim()
    return block.length > CAP.toolBlock ? block.slice(0, CAP.toolBlock - 1) + '…' : block
  }
  return null
}
function toolsNamedInPrompt(block) {
  if (!block) return []
  const names = new Set()
  for (const line of block.split('\n')) {
    if (!/^\s*·/.test(line)) continue
    for (const m of line.matchAll(/vibe_[A-Za-z0-9_]+/g)) names.add(m[0])
  }
  return [...names].sort()
}
/**
 * ★ PHASE 9 / round 7 — THE SAME-SOURCE BLOCK, WHICH IS NOT A BULLET LIST.
 * The host appends a one-line block `【本轮你实际能调用的工具｜<slot>】N 个：a、b（…以本段为准）` to a SEPARATE
 * `system-prompt` message. It has no bullets, so `toolsNamedInPrompt` (bullet scanner) can never see it — the reason
 * this tool used to report a false RED. The two regexes below are deliberately tight:
 *   · the title MUST carry `｜` (the static sentence "以【本轮你实际能调用的工具】为准" does not), and
 *   · the title must be followed by `N 个：`/`N 个（`, so the pack's own PLACEHOLDER text (which has no count) is not
 *     mistaken for a rendered block.
 */
function effectiveBlocksOf(text) {
  const out = []
  const s = String(text || '')
  const re = /【本轮你实际能调用的工具｜[^】]*】\s*(\d+)\s*个[：（]([^（）\n]*)/g
  let m
  while ((m = re.exec(s)) !== null) out.push({ count: Number(m[1]), raw: m[0], namesRaw: m[2] })
  return out
}
function namesInEffectiveBlocks(text) {
  const blocks = effectiveBlocksOf(text)
  const names = new Set()
  for (const b of blocks) {
    for (const n of String(b.namesRaw || '').split(/[、,，\s]+/)) {
      const t = n.trim()
      if (/^vibe_[A-Za-z0-9_]+$/.test(t)) names.add(t)
    }
  }
  return { found: blocks.length, names: [...names].sort(), blocks }
}
function readEvents(file) {
  const text = readSessionText(file)
  const events = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try { events.push(JSON.parse(line)) } catch { /* not an event line */ }
  }
  return events
}

export function analyzeSession(file, { memberFilter = null } = {}) {
  const events = readEvents(file)
  const headers = []
  const calls = []
  let results = 0
  const assistant = []
  let prompt = ''
  let promptScore = -1
  let memberToken = null
  const seenText = new Set()
  // ★ PHASE 9 / round 7: model-visible text that is NOT the user/charter message. The host appends the same-source
  // tool block and the mailbox notice to a `system-prompt` message; ignoring it is what produced the false RED.
  const appendedTexts = []
  const promptScoreOf = (t) => {
    let score = 0
    if (/代号：/.test(t)) score += 8
    if (/【本轮面向的成员】/.test(t)) score += 6
    if (/【本轮可用的工具/.test(t)) score += 4
    if (/^#\s+/m.test(t)) score += 2
    return score
  }
  const considerPrompt = (t) => {
    if (typeof t !== 'string' || t.length < 80) return
    const m = /代号：\s*([A-Za-z0-9_-]+)/.exec(t)
    if (m) memberToken = m[1]
    const score = promptScoreOf(t)
    if (score > promptScore || (score === promptScore && t.length > prompt.length)) { promptScore = score; prompt = t }
  }
  for (const ev of events) {
    walk(ev, (x) => {
      if (x.type === 'request/header' && x.data && x.data.header && Array.isArray(x.data.header.tools)) headers.push(x.data.header)
      if (x.type === 'tool/call' && x.data && typeof x.data.name === 'string') calls.push({ name: x.data.name, args: x.data.arguments })
      if (x.type === 'tool/result') results += 1
      if (x.message && x.message.role === 'assistant' && Array.isArray(x.message.content)) {
        const t = x.message.content.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('\n').trim()
        if (t.length > 40 && !seenText.has(t)) { seenText.add(t); assistant.push(t) }
      }
      if (typeof x.text === 'string' && /【本轮可用的工具|#\s+/.test(x.text) && x.text.length > 80 && !seenText.has(x.text)) {
        seenText.add(x.text)
        considerPrompt(x.text)
      }
      if (x.message && x.message.role === 'user' && Array.isArray(x.message.content)) {
        for (const b of x.message.content) {
          if (b && typeof b.text === 'string' && b.text.length > 80 && /【本轮可用的工具|#\s+/.test(b.text)) considerPrompt(b.text)
        }
      }
      // ★ the appended model-visible message(s): `source.kind === 'system-prompt'`. Collected for BOTH the prompt union
      // and the same-source self-check; nothing here is treated as the user/charter prompt.
      const srcKind = (x.source && x.source.kind) || (x.message && x.message.source && x.message.source.kind) || null
      if (srcKind === 'system-prompt') {
        const content = Array.isArray(x.content) ? x.content : (x.message && Array.isArray(x.message.content) ? x.message.content : null)
        if (content) {
          const t = content.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('\n').trim()
          if (t && !appendedTexts.includes(t)) appendedTexts.push(t)
        }
      }
    })
  }
  const member = memberToken || extractMember(prompt) || null
  if (memberFilter && member !== memberFilter) return null
  const header = headers.length ? headers[headers.length - 1] : null
  const wireTools = header && Array.isArray(header.tools) ? header.tools.map((t) => (t && typeof t === 'object' ? (t.name || t.id) : t)).filter((n) => typeof n === 'string') : []
  const block = toolBlockOf(prompt)
  const userTools = toolsNamedInPrompt(block)
  const appendedText = appendedTexts.join('\n\n')
  const fromAppended = namesInEffectiveBlocks(appendedText)
  const fromPrompt = namesInEffectiveBlocks(prompt)
  const sameSource = {
    present: fromAppended.found > 0 || fromPrompt.found > 0,
    tools: [...new Set([...fromAppended.names, ...fromPrompt.names])].sort(),
    raw: (fromAppended.blocks[0] || fromPrompt.blocks[0] || {}).raw || null,
  }
  const promptTools = [...new Set([...userTools, ...sameSource.tools])].sort()
  const promptToolsBySource = { user: userTools.slice(), 'system-prompt': fromAppended.names.slice(), union: promptTools.slice() }
  // ★ THE COMPARISON SOURCE: a same-source block is AUTHORITATIVE — the static list says so itself ("静态清单只作职责
  // 说明，以本段为准"), so a difference between the static list and the wire is INFO, never RED. Without a block the old
  // behaviour is kept (compare the static list), and the renderer labels that reading as a possible false RED.
  const compareTools = sameSource.present ? sameSource.tools : userTools
  const hasPromptToolBlock = !!block || sameSource.present
  const missingFromWire = member && hasPromptToolBlock ? compareTools.filter((n) => !wireTools.includes(n)) : []
  const extraOnWire = member && hasPromptToolBlock ? wireTools.filter((n) => !compareTools.includes(n) && n !== 'run_code') : []
  const staticDiff = sameSource.present
    ? { missingFromWire: userTools.filter((n) => !wireTools.includes(n)), extraOnWire: wireTools.filter((n) => !userTools.includes(n) && n !== 'run_code') }
    : null
  const sameSourceMismatch = sameSource.present && member && (missingFromWire.length > 0 || extraOnWire.length > 0)
  const runCode = wireTools.includes('run_code')
  const callsNotInWire = [...new Set(calls.map((c) => c.name).filter((n) => !wireTools.includes(n)))]
  // Under PTC the SDK dispatches inner tools inside run_code; those are NOT direct wire names, so they are reported
  // separately instead of being called "unknown".
  const defer = header ? header.tools.filter((t) => t && t.deferLoading === true).map((t) => t.name) : []
  const unknownCalls = runCode ? [] : callsNotInWire
  const ptcNestedCalls = runCode ? callsNotInWire : []
  const callCount = calls.length
  const countMismatch = callCount !== results
  const sections = sectionsOf(prompt)
  return {
    file,
    member,
    root: !member,
    headerCount: headers.length,
    wireTools,
    wireCount: wireTools.length,
    promptTools,
    promptToolsBySource,
    sameSource,
    sameSourceMismatch,
    staticDiff,
    appendedCount: appendedTexts.length,
    promptToolBlock: block,
    promptSections: sections,
    promptChars: prompt.length,
    promptScore,
    missingFromWire,
    extraOnWire,
    unknownCalls,
    ptcNestedCalls,
    deferLoading: defer,
    runCode,
    calls: calls.map((c) => ({ name: c.name, args: oneLine(typeof c.args === 'string' ? c.args : JSON.stringify(c.args || {}), CAP.arg) })),
    callCount,
    resultCount: results,
    countMismatch,
    receipts: assistant.slice(-4).map((t) => (t.length > CAP.receipt ? t.slice(0, CAP.receipt - 1) + '…' : t)),
    red: missingFromWire.length > 0 || extraOnWire.length > 0 || unknownCalls.length > 0 || countMismatch,
  }
}

function sessionFiles(input) {
  const p = resolve(input)
  const st = statSync(p)
  if (st.isFile()) return [p]
  const out = []
  const visit = (dir, depth) => {
    if (depth > 2) return
    let rows = []
    try { rows = readdirSync(dir, { withFileTypes: true }) } catch { return }
    if (rows.some((r) => r.isFile() && /^session\.v4\.jsonl(\.zstd)?$/.test(r.name))) {
      const f = rows.find((r) => r.isFile() && /^session\.v4\.jsonl(\.zstd)?$/.test(r.name))
      out.push(join(dir, f.name))
      return
    }
    for (const r of rows) if (r.isDirectory()) visit(join(dir, r.name), depth + 1)
  }
  visit(p, 0)
  return out
}

function render(s) {
  const lines = []
  lines.push('=== member: ' + (s.member || '(root)') + ' | ' + s.file + ' ===')
  lines.push('visible tools: ' + s.wireCount + ' | headers=' + s.headerCount)
  lines.push('  ' + s.wireTools.join(', '))
  if (s.promptChars) lines.push('prompt chars: ' + s.promptChars + ' (score ' + s.promptScore + ')')
  if (s.appendedCount) lines.push('appended model-visible message(s): ' + s.appendedCount + ' (source: system-prompt)')
  if (s.promptToolsBySource) {
    lines.push('promptToolsBySource:')
    lines.push('  user (' + s.promptToolsBySource.user.length + '): ' + s.promptToolsBySource.user.join(', '))
    lines.push('  system-prompt (' + s.promptToolsBySource['system-prompt'].length + '): ' + s.promptToolsBySource['system-prompt'].join(', '))
    lines.push('  union (' + s.promptToolsBySource.union.length + '): ' + s.promptToolsBySource.union.join(', '))
  }
  if (s.sameSource && s.sameSource.present) {
    lines.push('same-source block (verbatim):')
    lines.push('  ' + oneLine(s.sameSource.raw, 500))
  }
  if (s.promptSections.length) {
    lines.push('prompt outline:')
    for (const sec of s.promptSections) lines.push('  # ' + sec.title + ' (' + sec.chars + ' chars)')
  } else lines.push('prompt outline: (no # headings found)')
  if (s.promptToolBlock) {
    lines.push('tool section (verbatim, truncated):')
    lines.push(s.promptToolBlock.split('\n').map((l) => '  ' + l).join('\n'))
  }
  lines.push('presentation: run_code=' + s.runCode + ' deferLoading=[' + s.deferLoading.join(',') + ']')
  lines.push('calls (' + s.callCount + ') vs results (' + s.resultCount + ')' + (s.countMismatch ? '  <<< RED: COUNT MISMATCH' : ''))
  for (const c of s.calls) lines.push('  · ' + c.name + ' ' + c.args)
  lines.push('receipts (last, truncated):')
  for (const r of s.receipts) lines.push('  ' + oneLine(r, 400))
  lines.push('AUTO CHECKS:')
  if (s.sameSource && s.sameSource.present) {
    if (s.sameSourceMismatch) {
      lines.push('  RED 同源块与 wire 不一致: block=[' + s.sameSource.tools.join(', ') + '] blockOnly=[' + s.missingFromWire.join(', ') +
        '] wireOnly=[' + s.extraOnWire.join(', ') + ']')
    }
  } else if (!s.root) {
    lines.push('  INFO 旧格式：没有同源块（【本轮你实际能调用的工具｜…】）；promptTools 取自静态清单，差集可能误报')
  }
  if (s.staticDiff && (s.staticDiff.missingFromWire.length || s.staticDiff.extraOnWire.length)) {
    lines.push('  INFO 静态清单与 wire 不同（职责说明，已被同源块取代）: missing=' + s.staticDiff.missingFromWire.join(', ') +
      ' extra=' + s.staticDiff.extraOnWire.join(', '))
  }
  if (s.missingFromWire.length) lines.push('  RED promptTools missing from wire: ' + s.missingFromWire.join(', '))
  if (s.extraOnWire.length) lines.push('  RED wire tools not named in prompt: ' + s.extraOnWire.join(', '))
  if (s.unknownCalls.length) lines.push('  RED tool calls not in wire: ' + s.unknownCalls.join(', '))
  if (s.ptcNestedCalls && s.ptcNestedCalls.length) lines.push('  PTC inner calls (inside run_code, not direct wire names): ' + s.ptcNestedCalls.join(', '))
  if (s.countMismatch) lines.push('  RED tool/call count != tool/result count')
  if (!s.red) lines.push('  OK: prompt/wire names consistent; all calls visible; counts match')
  lines.push('')
  return lines.join('\n')
}

function writeFixture(root, name, events) {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.v4.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf8')
  return join(dir, 'session.v4.jsonl')
}

function buildSelftest() {
  const root = mkdtempSync(join(process.env.TEMP_SLV_INSPECT || 'D:\\_tmp', 'slv-inspect-selftest-'))
  // (A) OLD-FORMAT session: no same-source block. Its static bullet list still drives the two-direction comparison, so
  // the four original findings must stay detectable — and the renderer must label it as a POSSIBLE false RED.
  const oldFormat = writeFixture(root, 'session-old', [
    { type: 'request/header', data: { header: { tools: [{ name: 'vibe_a' }, { name: 'vibe_b', deferLoading: true }] } } },
    { message: { role: 'user', content: [{ type: 'text', text: '# role\n【本轮面向的成员】代号：member-x\n\n【本轮可用的工具｜成员】\n· vibe_a —— a tool\n· vibe_ghost —— should not be called\n' }] } },
    { type: 'tool/call', data: { name: 'vibe_a', arguments: { x: 1 } } },
    { type: 'tool/call', data: { name: 'vibe_ghost', arguments: { y: 2 } } },
    { type: 'tool/result', data: { message: { role: 'tool', content: [{ type: 'text', text: 'ok' }] } } },
    { message: { role: 'assistant', content: [{ type: 'text', text: 'this is a synthetic receipt and it is long enough to be captured by the inspector' }] } },
  ])
  // (B) NEW-FORMAT, CONSISTENT: the same-source block arrives in a separate `system-prompt` message and its names EQUAL
  // the wire. The static list still names vibe_ghost, which must become INFO (not RED).
  const blockOk = writeFixture(root, 'session-block-ok', [
    { type: 'request/header', data: { header: { tools: [{ name: 'vibe_a' }] } } },
    { message: { role: 'user', content: [{ type: 'text', text: '# role\n【本轮面向的成员】代号：member-x\n\n【本轮可用的工具｜成员】\n· vibe_a —— a tool\n· vibe_ghost —— static-only, superseded\n' }] } },
    { content: [{ type: 'text', text: '# runtime\n【本轮你实际能调用的工具｜member】1 个：vibe_a（这份列表与你这回合的 wire 完全一致；角色段里的静态清单只作职责说明，以本段为准）' }], source: { kind: 'system-prompt' }, id: 'ctx-ok' },
  ])
  // (C) NEW-FORMAT, INCONSISTENT: the block names vibe_ghost while the wire has vibe_a ⇒ a REAL finding, and it must be
  // named "同源块与 wire 不一致" (not the generic prompt-tools message).
  const blockBad = writeFixture(root, 'session-block-bad', [
    { type: 'request/header', data: { header: { tools: [{ name: 'vibe_a' }] } } },
    { message: { role: 'user', content: [{ type: 'text', text: '# role\n【本轮面向的成员】代号：member-x\n\n【本轮可用的工具｜成员】\n· vibe_a —— a tool\n· vibe_extra_static —— only in the static list, which is superseded\n' }] } },
    { content: [{ type: 'text', text: '# runtime\n【本轮你实际能调用的工具｜member】1 个：vibe_ghost（同源块与 wire 不一致的合成反例）' }], source: { kind: 'system-prompt' }, id: 'ctx-bad' },
  ])
  return { root, oldFormat, blockOk, blockBad }
}

function runSelftest() {
  const fx = buildSelftest()
  let failures = 0
  const ok = (cond, name, detail) => {
    if (cond) console.log('  ok   ' + name)
    else { failures++; console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
  }
  try {
    // ── the original four finding classes (old format, no same-source block) ──────────────────────────────────────
    const s = analyzeSession(fx.oldFormat)
    ok(s.member === 'member-x' && s.wireCount === 2, 'parses member + wire count', { member: s.member, wire: s.wireTools })
    ok(s.missingFromWire.includes('vibe_ghost') && s.extraOnWire.includes('vibe_b') && !s.extraOnWire.includes('vibe_a'),
      'detects BOTH directions: prompt names missing from wire (vibe_ghost) and wire tools not named (vibe_b; run_code is transport)', { missing: s.missingFromWire, extra: s.extraOnWire })
    ok(s.unknownCalls.includes('vibe_ghost'), 'detects a call to a tool not in the wire', s.unknownCalls)
    ok(s.callCount === 2 && s.resultCount === 1 && s.countMismatch === true, 'detects call/result count mismatch', { calls: s.callCount, results: s.resultCount })
    ok(s.deferLoading.includes('vibe_b') && s.runCode === false, 'reports presentation markers', { defer: s.deferLoading, runCode: s.runCode })
    const out = render(s)
    ok(/RED promptTools|RED wire tools|RED tool calls|RED tool\/call/.test(out), 'rendered text really shows RED findings', out.slice(0, 400))
    ok(/INFO 旧格式：没有同源块/.test(out), '★ old format is labelled INFO (no same-source block ⇒ possible false RED)', out.split('\n').filter((l) => /INFO/.test(l)))
    ok(s.receipts.length === 1 && /synthetic receipt/.test(s.receipts[0]), 'captures an assistant receipt', s.receipts)

    // ── (B) POSITIVE: block lives in the system-prompt append and EQUALS the wire ⇒ 0 RED ────────────────────────
    const good = analyzeSession(fx.blockOk)
    ok(good.sameSource.present && good.sameSource.tools.join(',') === 'vibe_a',
      '★ new format: the same-source block is READ from the system-prompt append (not from the static bullet list)', good.sameSource)
    ok(good.promptToolsBySource.user.includes('vibe_ghost') && good.promptToolsBySource['system-prompt'].includes('vibe_a') && good.promptTools.includes('vibe_a'),
      '★ promptToolsBySource separates user vs system-prompt and the union carries both', good.promptToolsBySource)
    ok(good.missingFromWire.length === 0 && good.extraOnWire.length === 0 && good.sameSourceMismatch === false && good.red === false,
      '★ POSITIVE: block names == wire names ⇒ NO RED (the static list difference is INFO only)',
      { missing: good.missingFromWire, extra: good.extraOnWire, red: good.red })
    ok(good.staticDiff && good.staticDiff.missingFromWire.includes('vibe_ghost'),
      '★ the superseded static list difference is still REPORTED (as staticDiff INFO), not hidden', good.staticDiff)
    const goodOut = render(good)
    ok(/OK: prompt\/wire names consistent/.test(goodOut) && /INFO 静态清单与 wire 不同/.test(goodOut) && !/RED /.test(goodOut),
      '★ POSITIVE render: OK line + INFO for the static list, and no RED line at all', goodOut.split('\n').filter((l) => /AUTO|OK|INFO|RED/.test(l)))

    // ── (C) NEGATIVE: block names ≠ wire ⇒ RED, named "同源块与 wire 不一致" ─────────────────────────────────────
    const bad = analyzeSession(fx.blockBad)
    ok(bad.sameSource.present && bad.sameSourceMismatch === true && bad.red === true,
      '★ NEGATIVE: a block whose names differ from the wire is RED', { block: bad.sameSource.tools, wire: bad.wireTools, red: bad.red })
    const badOut = render(bad)
    ok(/RED 同源块与 wire 不一致/.test(badOut) && /blockOnly=\[vibe_ghost\]/.test(badOut) && /wireOnly=\[vibe_a\]/.test(badOut),
      '★ NEGATIVE render: the finding is NAMED "同源块与 wire 不一致" with both directions (blockOnly=block names not on the wire; wireOnly=wire names absent from the block)', badOut.split('\n').filter((l) => /同源块/.test(l)))
  } finally {
    rmSync(fx.root, { recursive: true, force: true })
  }
  console.log('SELFTEST ' + (failures === 0 ? 'PASS' : 'FAIL') + ' (' + failures + ' failed)')
  process.exitCode = failures === 0 ? 0 : 1
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--selftest')) { runSelftest(); return }
  const flags = { json: argv.includes('--json') }
  const get = (name) => { const i = argv.indexOf(name); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null }
  flags.member = get('--member')
  const root = get('--root')
  const positional = argv.filter((a) => !a.startsWith('--') && a !== flags.member && a !== root)
  const input = positional[0] || root
  if (!input) {
    console.error('usage: node scripts/slv-inspect.mjs <sessionDirOrJsonl> [--member <id>] [--json] [--root <dir>]')
    process.exit(2)
  }
  const files = sessionFiles(input)
  const sessions = files.map((f) => analyzeSession(f, { memberFilter: flags.member })).filter(Boolean)
  if (!sessions.length) {
    console.error('no sessions found under ' + input + (flags.member ? ' for member ' + flags.member : ''))
    process.exit(2)
  }
  if (flags.json) {
    console.log(JSON.stringify({ source: input, sessions }, null, 2))
  } else {
    for (const s of sessions) console.log(render(s))
    const red = sessions.filter((s) => s.red).length
    console.log('SUMMARY: ' + sessions.length + ' session(s), ' + red + ' with RED checks')
  }
  process.exitCode = sessions.some((s) => s.red) ? 1 : 0
}

main()
