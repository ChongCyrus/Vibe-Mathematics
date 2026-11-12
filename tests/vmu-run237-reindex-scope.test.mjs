// tests/vmu-run237-reindex-scope.test.mjs — RUN 237 (FEEDBACK60 M6): `reindex` answered a narrower question than it
// was asked, and called other people's documents "broken".
//
// Measured on run 60: `vibe_vmu_records { action: "reindex", track: "blueprint" }` returned a `skipped` list holding
// ruling cards under `Members/r-1/Propos/ruling-*.md` with `why: "no \"## 正文\" section marker"`. Three separate
// facts were sharing one bucket and one word:
//   (a) a file that could not be READ        — a real problem, wants a human;
//   (b) a file that is not a vmu document    — a member's own notes; nothing is wrong with it;
//   (c) a card whose track is not declared   — a configuration fact, not a broken file.
// and `track` read like "only scan this track" while the walk always covered the whole root.
//
// This suite pins the new receipt: every skip names its `whyClass`, the counts are split, and `scanScope` states what
// the walk covered and what `track` did and did not narrow — through the PUBLIC face, not just the kernel method.
//
// Run: node tests/vmu-run237-reindex-scope.test.mjs

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const VMU = join(REPO, 'vibe-math-vmu')
const TMP = __tmpRoot() + '/run237'

const SRC_RECORDS = readFileSync(join(VMU, 'kernel', 'records.js'), 'utf8')

let passed = 0
let failed = 0
const failures = []
function ok(cond, name, detail) {
  if (cond) {
    passed += 1
    console.log('  ok   ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail)))
  }
}
function has(text, needle, name) {
  ok(typeof text === 'string' && text.indexOf(needle) !== -1, name, { needle })
}

async function boot(tag) {
  mkdirSync(TMP, { recursive: true })
  const root = mkdtempSync(join(TMP, 'k-' + tag + '-'))
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  await handle.kernel.store.open()
  const specOf = (name) => specs.filter((s) => s && s.name === name)[0] || null
  const call = async (name, args = {}) => {
    const spec = specOf(name)
    if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', name }
    let raw
    try {
      raw = await spec.execute(args, { kernel: handle.kernel })
    } catch (e) {
      return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) }
    }
    if (typeof raw === 'string') {
      try { return JSON.parse(raw) } catch (e) { return { ok: false, code: 'NON_JSON', raw } }
    }
    return raw
  }
  return { root, handle, specs, specOf, call }
}

// ── §0 the new vocabulary exists in source (so a silent revert is red here too) ───────────────────────────────────
{
  console.log('\n=== §0 §0 the skip vocabulary and the scan report exist in source ===')
  has(SRC_RECORDS, 'whyClass', 'records.js stamps a whyClass on every skip')
  has(SRC_RECORDS, 'skippedByClass', 'records.js keeps a per-class skip count')
  has(SRC_RECORDS, 'noteSkip', 'records.js routes every skip through one classifier')
  has(SRC_RECORDS, 'scanScope', 'records.js reports the scan scope')
  has(SRC_RECORDS, 'walked: files.length', 'the walk count is the files the walk actually visited')
  has(SRC_RECORDS, 'not a vmu document (no `- ', 'a foreign md is described as foreign, not as broken')
}

// ── §1 a foreign md under the library root is NOT a broken index row ─────────────────────────────────────────────
const b = await boot('scope')
{
  console.log('\n=== §1 a member’s own md is left alone and named for what it is ===')
  const foreignRel = join('Members', 'r-1', 'Propos', 'notes.md')
  const foreignAbs = join(b.root, 'VibeMath', foreignRel)
  mkdirSync(join(b.root, 'VibeMath', 'Members', 'r-1', 'Propos'), { recursive: true })
  writeFileSync(foreignAbs, '# 我的推导草稿\n\n随便写写，不打算进索引。\n', 'utf8')

  const dry = b.handle.kernel.records.mdReindex({ dryRun: true })
  // ★ RUN 259 / AUDIT-14 P0-3: a reindex that leaves a file unindexed is NOT a success — the old `ok:true` + skipped
  // pair let callers (and hints) treat "nothing happened" as "done". The skip is still named in `skipped`, and the
  // refusal is named in blocked[] with a reachable repair.
  ok(dry && dry.ok === false, 'reindex (dryRun) answers ok:false when a file was skipped for a SHAPE reason')
  ok(dry && dry.code === 'VMU_RECORDS_REINDEX_BLOCKED', '...by name (VMU_RECORDS_REINDEX_BLOCKED)', dry && dry.code)
  ok(dry && dry.partial === true, '...and marks the receipt partial', dry && dry.partial)
  const dryBlocked = (dry && dry.blocked) || []
  ok(dryBlocked.some((x) => String(x.path || '').indexOf('notes.md') !== -1),
    '...and blocked[] NAMES the file it could not index', dryBlocked.map((x) => x.path))
  ok(dryBlocked.every((x) => typeof x.reachableInstead === 'string' && x.reachableInstead.length > 0),
    '...and every blocked entry says what would unblock it')
  ok(dry.walked >= 1, 'the walk reports how many md files it visited', { walked: dry.walked })
  const foreign = (dry.skipped || []).filter((s) => String(s.path || '').indexOf('notes.md') !== -1)[0]
  ok(!!foreign, 'the foreign md is named in skipped', { skipped: (dry.skipped || []).map((s) => s.path) })
  ok(foreign && foreign.whyClass === 'not-a-vmu-md', 'and its whyClass says not-a-vmu-md', foreign && foreign.whyClass)
  ok(foreign && /not a vmu document/i.test(String(foreign.why)), 'the sentence says it is not a vmu document', foreign && foreign.why)
  ok(foreign && !/broken/i.test(String(foreign.why)), 'it is never called a broken file', foreign && foreign.why)
  ok(dry.skippedByClass && dry.skippedByClass['not-a-vmu-md'] >= 1, 'the class counter counts it', dry.skippedByClass)
  ok(dry.skippedByClass && dry.skippedByClass.unreadable === 0, 'and nothing is filed as unreadable', dry.skippedByClass)
  ok(dry.counts && dry.counts.skippedByClass && dry.counts.skippedByClass['not-a-vmu-md'] >= 1,
    'the counts block carries the same split', dry.counts && dry.counts.skippedByClass)
}

// ── §2 `track` narrows what is ACCOUNTED, and the receipt says so ───────────────────────────────────────────────
{
  console.log('\n=== §2 track narrows the accounting, not the walk — and the receipt states it ===')
  const dryAll = b.handle.kernel.records.mdReindex({ dryRun: true })
  const dryBp = b.handle.kernel.records.mdReindex({ dryRun: true, track: 'blueprint' })
  // A track filter narrows ACCOUNTING, not the walk: the foreign file is still walked, still cannot be indexed,
  // so the receipt is still a named refusal (RUN 259 / AUDIT-14 P0-3).
  ok(dryBp && dryBp.ok === false && dryBp.code === 'VMU_RECORDS_REINDEX_BLOCKED',
    'reindex with a track filter refuses by name for the same unindexable file', dryBp && dryBp.code)
  ok(dryBp && ((dryBp.blocked || []).some((x) => String(x.path || '').indexOf('notes.md') !== -1)),
    '...and names that file in blocked[] through the filtered scan too')
  ok(!!dryBp.scanScope && dryBp.scanScope.recursive === true, 'scanScope says the walk is recursive', dryBp.scanScope)
  ok(dryBp.scanScope && dryBp.scanScope.trackFilter === 'blueprint', 'scanScope names the filter it was given', dryBp.scanScope)
  ok(dryBp.scanScope && /whole root/.test(String(dryBp.scanScope.trackNarrows)),
    'and says the walk still covers the whole root', dryBp.scanScope && dryBp.scanScope.trackNarrows)
  ok(dryBp.walked === dryAll.walked, 'the walk count does not shrink when a track is named',
    { walkedWithTrack: dryBp.walked, walkedAll: dryAll.walked })
  ok(dryBp.counts && dryBp.counts.walked >= dryBp.counts.scanned,
    'counts: walked >= accounted (a track filter can only shrink the accounted side)',
    dryBp.counts && { walked: dryBp.counts.walked, scanned: dryBp.counts.scanned })
  ok(dryBp.scanScope && dryBp.scanScope.walked >= dryBp.scanScope.accounted,
    'scanScope repeats both numbers so the reader can compare them',
    dryBp.scanScope && { walked: dryBp.scanScope.walked, accounted: dryBp.scanScope.accounted })
  ok(Array.isArray(dryBp.paths) && Array.isArray(dryBp.skipped), 'paths and skipped are still arrays (shape unchanged)')
  ok(Object.prototype.hasOwnProperty.call(dryBp, 'scanned') && Object.prototype.hasOwnProperty.call(dryBp, 'unchanged'),
    'the older scalar readings still exist (this was additive)')
}

// ── §3 the SAME facts come out of the public tool face (a receipt that drops them is not a fix) ─────────────────
{
  console.log('\n=== §3 the public face relays what the kernel now knows (not only the kernel method) ===')
  const viaTool = await b.call('vibe_vmu_records', { action: 'reindex', dryRun: true, track: 'blueprint' })
  ok(viaTool && viaTool.ok === false && viaTool.code === 'VMU_RECORDS_REINDEX_BLOCKED',
    'vibe_vmu_records reindex refuses by name when it left a file unindexed', viaTool && viaTool.code)
  ok(viaTool && (viaTool.blocked || []).every((x) => typeof x.reachableInstead === 'string' && x.reachableInstead.length > 0),
    '...and the tool receipt relays blocked[].reachableInstead (the repair crosses the face)')
  ok(viaTool && typeof viaTool.walked === 'number', 'the tool receipt carries `walked`', viaTool && viaTool.walked)
  ok(viaTool && !!viaTool.scanScope && viaTool.scanScope.trackFilter === 'blueprint',
    'the tool receipt carries scanScope.trackFilter', viaTool && viaTool.scanScope)
  ok(viaTool && !!viaTool.skippedByClass && viaTool.skippedByClass['not-a-vmu-md'] >= 1,
    'the tool receipt carries the split counters', viaTool && viaTool.skippedByClass)
  const foreignViaTool = (viaTool.skipped || []).filter((s) => String(s.path || '').indexOf('notes.md') !== -1)[0]
  ok(foreignViaTool && foreignViaTool.whyClass === 'not-a-vmu-md',
    'and the foreign md keeps its class through the face', foreignViaTool && foreignViaTool.whyClass)
}

console.log('\nTOTAL ' + (passed + failed) + ' PASS ' + passed + ' FAIL ' + failed)
if (failures.length > 0) {
  console.log('\nFAILURES:')
  for (const f of failures) console.log('  - ' + f)
  process.exitCode = 1
}
