// tests/vmu-run176-prune-list-truth.test.mjs — RUN 176 (run 20 / FEEDBACK20 item ③, the last unclosed account of that run).
//
// THE DEFECT THIS PINS: `vibe_vmu_records { action: "prune", track: "paper" }` answered with a list of `{id, title,
// state, purgeAt}` and NO track on any line. That list is exactly where a reader checks "am I deleting the right rows?" —
// and run 20 produced it one round after RUN 174 fixed ONE ID LIVING IN TWO TRACKS (FEEDBACK19 F3/F10). A prune receipt
// that cannot say where a row lived makes that failure unreadable at the one moment it matters: the rows are leaving.
// The `track` argument says which track the CALL pruned; it says nothing about the row in front of the reader.
//
// WHAT RUN 176 CHANGED (`vibe-math-vmu/host.js`, action `prune`): every line of `pruned` (dry run and real) carries its
// own `track`, and the receipt adds `prunedRowsMeans` saying the track is PER ROW rather than a restatement of the call.
//
// RULE E: every collection assertion states its non-emptiness (or exact shape) in the same expression.
import { mkdtemp, mkdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const BASE = 'D:/_tmp/r176/prune-list'
const newRoot = async (tag) => { await mkdir(BASE, { recursive: true }); return mkdtemp(join(BASE, tag + '-')) }
let tick = 1000
const boot = async (root) => {
  const specs = []
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => tick++ })
  await handle.ready()
  const call = async (name, args) => {
    const spec = specs.filter((s) => s.name === name)[0]
    if (!spec) throw new Error('no tool ' + name)
    try { return JSON.parse(await spec.execute(args, {})) } catch (e) {
      return { ok: false, code: (e && e.code) || 'THROW', message: String((e && e.message) || e), hint: (e && e.hint) || null }
    }
  }
  return { handle, kernel: handle.kernel, call }
}
const SEATS = [['r-acad', 'chair'], ['r-1', 'member'], ['r-2', 'member']]
const hire = async (k) => { for (const [id, slot] of SEATS) await k.members.hire({ id, slot, institution: 'inst' }) }

// ── §0 the source says what this pins ───────────────────────────────────────────────────────────────────────────────
{
  const host = readFileSync(join(REPO, 'vibe-math-vmu', 'host.js'), 'utf8')
  ok(/const rowTrack = row\.track === undefined \|\| row\.track === null \? pruneTrack : String\(row\.track\)/.test(host),
    '§0 a pruned line takes its OWN track from the row (and only falls back to the call\'s argument when the row has none)')
  ok(/moved\.push\(\{ id: row\.id, track: rowTrack, title:/.test(host) && (host.match(/moved\.push\(\{ id: row\.id, track: rowTrack, title:/g) || []).length === 2,
    '§0 …and BOTH the dry-run line and the real line carry it (one list, one shape)')
  ok(host.includes("prunedRowsMeans: 'every line of `pruned` and `pinned` names its own `track`"),
    '§0 the receipt says the track is PER ROW, not a restatement of the call')
}

// ── §1 a dry-run prune list names each row's track ─────────────────────────────────────────────────────────────────
{
  const root = await newRoot('dry')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  for (let i = 0; i < 3; i += 1) {
    A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'run176 row ' + i, body: 'body ' + i })
  }
  const dry = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 1, dryRun: true })
  ok(dry && dry.ok === true, '§1 the dry run answers', dry && (dry.code || dry.ok))
  const lines = dry && Array.isArray(dry.pruned) ? dry.pruned : []
  ok(lines.length === 2, '§1 …with the two oldest rows listed', lines.length)
  ok(lines.length === 2 && lines.every((r) => r.track === 'paper'),
    '§1 ★★ every line names the track it lived on (run 20 FEEDBACK ③: the list had none)', lines.map((r) => r.track))
  ok(lines.length === 2 && lines.every((r) => typeof r.id === 'string' && r.state === 'would-be-trashed' && r.purgeAt === null),
    '§1 …and nothing was actually moved (dry run is dry)', lines.map((r) => r.state))
  ok(typeof (dry && dry.prunedRowsMeans) === 'string' && String(dry.prunedRowsMeans).includes('WHICH rows are leaving'),
    '§1 …and the means says why the line carries it', dry && String(dry.prunedRowsMeans || '').slice(0, 70))
}

// ── §2 a real prune list carries the same shape, and the rows really leave ─────────────────────────────────────────
{
  const root = await newRoot('real')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  for (let i = 0; i < 3; i += 1) {
    A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'run176 real ' + i, body: 'body real ' + i })
  }
  const real = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 1 })
  ok(real && real.ok === true && real.prunedCount === 2, '§2 the real prune moves two rows', real && real.prunedCount)
  const lines = real && Array.isArray(real.pruned) ? real.pruned : []
  ok(lines.length === 2 && lines.every((r) => r.track === 'paper' && r.state === 'trashed' && typeof r.purgeAt === 'number'),
    '§2 ★★ the real list has the same shape (track + trashed + purgeAt)', lines.map((r) => ({ t: r.track, s: r.state })))
  const listed = A.kernel.records.list({ track: 'paper', limit: 0 })
  ok(listed && listed.available === 1,
    '§2 …and the track really holds one live row afterwards', listed && listed.available)
  const st = A.kernel.records.status()
  ok(st && st.records && st.records.trashed === 2,
    '§2 …while the trash counts them (nothing is silently deleted)', st && st.records && st.records.trashed)
}

// ── §3 a row that moved tracks is reported with the track it was FOUND ON, not the one being pruned ────────────────
// This is the case RUN 174 fixed in the writer (one id lived in two tracks). The receipt side must not undo that fix by
// restating the argument: whatever the track argument says, the line describes the row that was read.
{
  const root = await newRoot('mixed')
  const A = await boot(root)
  await hire(A.kernel)
  tick += 10
  const kept = A.kernel.records.put({ track: 'paper', kind: 'paper-part', title: 'run176 kept', body: 'kept body' })
  const stray = A.kernel.records.put({ track: 'propositions', kind: 'proposition', title: 'run176 stray', body: 'stray body' })
  ok(!!kept && !!kept.id && !!stray && !!stray.id, '§3 setup: two rows on two tracks', { kept: kept && kept.id, stray: stray && stray.id })
  const dry = await A.call('vibe_vmu_records', { action: 'prune', track: 'paper', keep: 0, dryRun: true })
  const lines = dry && Array.isArray(dry.pruned) ? dry.pruned : []
  ok(lines.length === 1 && lines[0].id === kept.id && lines[0].track === 'paper',
    '§3 ★★ the line is the PAPER row, and it says paper — the propositions row is untouched by a paper prune',
    lines.map((r) => ({ id: r.id, track: r.track })))
  const propLive = A.kernel.records.list({ track: 'propositions', limit: 0 })
  ok(propLive && propLive.available === 1, '§3 …and the other track still holds its row', propLive && propLive.available)
}

// ── summary ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log('\nRUN 176: ' + passed + ' passed, ' + failed + ' failed')
if (failed > 0) { console.error('failures:\n  ' + failures.join('\n  ')); process.exit(1) }
