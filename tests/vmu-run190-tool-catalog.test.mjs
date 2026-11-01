// RUN 190 (run 34 / FEEDBACK33 1.5): OUTSIDE A TURN, "WHAT CAN I CALL" WAS ONLY A REFUSAL.
//
// Run 34's members asked `vibe_v5_tool_help({member})` BETWEEN turns — to plan the next step before the turn opened — and
// got `tools:null` plus `VMU_MEMBER_SESSION_NOT_LIVE`. Both were true: the seat-scoped VISIBLE set genuinely needs a live
// Agent (activation starts a child per turn). But the DECLARATION is static: every name the pack publishes is the same
// list whatever the session state is. A reader who asks "what names exist" was answered with a session fact instead.
//
// WHAT THIS PROVES: the refusal keeps its fields (nothing is hidden), AND the declaration arrives in `catalog` marked as
// the declaration — never as "what you can call right now", because seat/meeting narrowing is exactly why the two differ.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TOOLS = readFileSync(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)

test('RUN 190 §0 — the fallback is declared where the forwarder returns', () => {
  has(TOOLS, 'const catalogFallback', '§0a the forwarder computes a catalog fallback')
  has(TOOLS, 'if (!view || Array.isArray(view.tools)) return null', '§0b ONLY when the live reading is absent (a live table is never replaced)')
  has(TOOLS, 'catalogMeans:', '§0c the fallback carries the sentence that says what it is')
  has(TOOLS, 'not your seat', '§0d ★ and says what it is NOT')
  has(TOOLS, 'catalogFallback || {}', '§0e it is merged into the receipt without overwriting the live reading')
})

test('RUN 190 §1 — a member asking between turns learns the published names, and still reads the refusal', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run190-'))
  try {
    const entry = await import(pathToFileURL(ENTRY).href)
    const specs = []
    const ctx = { effect(fn) { return fn() }, on() { return () => {} }, tools: { async register(s) { specs.push(s); return () => {} } } }
    const handle = await entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root: dir })
    await handle.ready()
    await handle.kernel.store.open()
    for (const h of [
      { id: 'r-acad', slot: 'chair', institution: 'math' },
      { id: 'r-1', slot: 'member', institution: 'math' },
    ]) await handle.kernel.members.hire(h)
    const spec = specs.filter((s) => s && s.name === 'vibe_v5_tool_help')[0]
    ok(!!spec, '§1a the face is declared')
    const raw = await spec.execute({ member: 'r-1' }, { kernel: handle.kernel })
    const got = raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
    ok(got.ok === true, '§1b the answer is still ok:true (a readable receipt, not a thrown dead end)', got.code)
    ok(got.tools === null, '§1c the LIVE visible set is honestly null outside a turn', got.tools)
    ok(got.refusal && typeof got.refusal.code === 'string', '§1d the refusal is still carried as a field', got.refusal)
    ok(Array.isArray(got.catalog) && got.catalog.length >= 40, '§1e ★ and the published names arrive', got.catalog && got.catalog.length)
    ok(got.catalog.includes('vibe_v5_tool_help') && got.catalog.includes('vibe_v5_meeting'),
      '§1f ★ the catalog is the pack surface, by name', got.catalog.slice(0, 5))
    has(got.catalogMeans, 'DECLARED', '§1g §1e is labelled as the declaration')
    has(got.catalogMeans, 'not your seat', '§1h and says it is not the seat-scoped set')
    has(got.catalogMeans, 'live Agent', '§1i and names what the live reading needs')
    // nothing about the live reading was overwritten
    ok(got.count === null && got.liveAgent === false && got.source === 'no-live-agent',
      '§1j the live-reading fields keep their values', { count: got.count, liveAgent: got.liveAgent, source: got.source })
  } finally {
    try { await rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})
