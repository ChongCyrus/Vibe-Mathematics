// scripts/dev/capture-persona-corpus.mjs — DEV-ONLY extraction step (docs/26 section 3.7).
//
// It drives the ORIGINAL preset once, takes the persona each member is handed, splits it at the numbered section
// headings, and writes prompt-corpus-v5/persona-corpus-v5.json. The SHIPPED generator then reads that JSON and writes
// the pack module, so no shipped script imports the original line - the same discipline the prompt corpus already
// follows (capture once, cite with a hash, and let a difference be a check failure rather than a silent drift).
//
// Run: node scripts/dev/capture-persona-corpus.mjs

import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, renameSync, mkdtempSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { legacyEntry } from '../../tests/_lib/legacy-presets.mjs'

const OUT = 'prompt-corpus-v5/persona-corpus-v5.json'
const mod = await import(pathToFileURL(legacyEntry('vibe-math-v5r')).href)
const workspace = mkdtempSync(join(tmpdir(), 'v5r-persona-capture-'))
const root = { id: 'capture-root', session: { id: 'capture-root', header: { cwd: workspace } }, options: {} }
const captured = []
const registry = new Map()
let seq = 0

mod.apply({
  agents: { roots: () => [root], get: (id) => (id === root.id ? root : undefined), list: () => [root] },
  subagents: { list: () => ['spawn'], async startContinuable(spec) { seq += 1; captured.push(spec); return { childId: 'c-' + seq, messageId: 'm' } }, async sendMessage() { return 'm' }, interrupt() {}, async drainContinuableChildren() {} },
  fs: {
    resolve: async (p) => { const s = String(p); return /^([A-Za-z]:[\\/]|\/)/.test(s) ? s : join(workspace, s) },
    stat: async (p) => (existsSync(p) ? { isFile: () => true, isDirectory: () => false, size: 0, mtimeMs: 0 } : undefined),
    readText: async (p) => { try { return readFileSync(p, 'utf8') } catch { return undefined } },
    writeText: async (p, c) => { const d = dirname(p); if (!existsSync(d)) mkdirSync(d, { recursive: true }); writeFileSync(p, String(c)); return { operation: 'write' } },
    readFileSync: (p, e) => readFileSync(p, e), existsSync: (p) => existsSync(p), mkdirSync: (p, o) => mkdirSync(p, o),
    writeFileSync: (p, d) => { const dd = dirname(p); if (!existsSync(dd)) mkdirSync(dd, { recursive: true }); writeFileSync(p, d) },
    renameSync: (a, b) => renameSync(a, b), readdirSync: (p, o) => readdirSync(p, o), listDir: async () => [],
  },
  tools: { register(spec) { registry.set(spec.name, spec); return () => {} } },
  commands: { register() { return () => {} } },
  timer: { setTimeout: (fn, ms) => { const h = setTimeout(fn, Math.min(Number(ms) || 0, 5)); if (h && h.unref) h.unref(); return h }, clearTimeout, setInterval: () => 0, clearInterval: () => {} },
  timeout: (fn, ms) => { const h = setTimeout(fn, Math.min(Number(ms) || 0, 5)); if (h && h.unref) h.unref(); return () => clearTimeout(h) },
  get: (w) => (w === 'subprocess' ? { resolveExecutable: async (n) => '/fake/' + n, spawn: () => ({ done: Promise.resolve({ exitCode: 0, signal: null }), terminate() {} }) } : undefined),
  on() { return () => {} }, effect(fn) { try { const d = fn(); return typeof d === 'function' ? d : () => {} } catch { return () => {} } }, logger: { info() {}, warn() {}, error() {} },
})

// The seam is the capture point: the persona is the charter the ORIGINAL hands this member.
// The numbered headings may be INDENTED (the academician's 【四】 sits under a two-space indent), so the pattern
// allows leading whitespace - measured: without it the academician lost a whole section and the split looked correct.
const SPLIT = /^\s*【([一二三四五六七八九十]+)、([^】]*)】/
const blocksOf = (persona) => {
  const out = []
  let current = { key: 'opening', heading: '开头（角色与研究对象）', lines: [] }
  for (const line of persona.split('\n')) {
    const m = line.match(SPLIT)
    if (m) { out.push(current); current = { key: 's' + m[1], heading: m[2].trim(), lines: [] } }
    else current.lines.push(line)
  }
  out.push(current)
  return out
    .map((b) => ({ key: b.key, heading: b.heading, text: b.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() }))
    .filter((b) => b.text.length > 0)
}

// START THE INSTITUTE: without this no member is seated and no persona is ever handed out.
{
  const start = registry.get('vibe_v5_start')
  if (!start) { console.error('FAIL - the capture: the registry has no vibe_v5_start'); process.exit(1) }
  await start.execute({}, { agent: root, session: root.session })
  console.log('  captured ' + captured.length + ' spawned turns')
}

const roles = {}
for (const spec of captured) {
  const label = String(spec && spec.label ? spec.label : '')
  const persona = spec && spec.request && typeof spec.request.persona === 'string' ? spec.request.persona : ''
  if (!persona) continue
  const id = (label.match(/vibe5 ([a-z0-9-]+)/) || [])[1] || ('member-' + Object.keys(roles).length)
  if (roles[id]) continue
  roles[id] = { role: id === 'acad' ? 'academician' : 'researcher', label, chars: persona.length, blocks: blocksOf(persona) }
}
const payload = { note: 'captured persona sections from the original preset (docs/26 section 3.7)', total: Object.keys(roles).length, roles }
const text = JSON.stringify(payload, null, 2) + '\n'
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, text)
console.log('  wrote ' + OUT + '  (' + text.length + ' bytes, sha256 ' + createHash('sha256').update(text).digest('hex').slice(0, 12) + ')')
for (const [id, v] of Object.entries(roles)) console.log('    ' + id.padEnd(6) + ' role=' + v.role.padEnd(12) + ' chars=' + String(v.chars).padStart(5) + '  blocks=' + v.blocks.length + '  [' + v.blocks.map((b) => b.key).join(' ') + ']')
rmSync(workspace, { recursive: true, force: true })
process.exit(Object.keys(roles).length >= 2 ? 0 : 1)
