// tests/vmu-run259-audit14.test.mjs — RUN 259 / TB-2650 + TB-2655: FOUR CRITERIA FROM AUDIT-14, MEASURED.
//
// P0-3 (the circular hint): the drift refusal taught "run reindex", reindex answered ok:true while skipping the plain
//   markdown draft (not-a-vmu-md), and the next adopt refused with the SAME code. A repairable defect must have a repair
//   that CHANGES what the next call accepts, and the criterion must WALK it, not compare words.
// P1-2 (the clock reading): clockReadingOf stamped 0, -1, -86400000, 8640000000000001, '2026-01-01', '2026/01/01' and
//   'not-a-time' as kernel-clock (or silently fell back to wall clock). A measuring clock is not a caller payload.
// P1-9 (fs-first default): the default propose wrote nothing and said so, but the suite around it had ONE behaviour
//   assertion and three source-literal pins, so the fs-first contract could break without the suite noticing.
// TB-2655 (the seam flag): boot({clock: () => 1000}) — the harness clock, not a real instant — was refused by the range
//   gate because one internal call forgot to forward stampFromKernel. The pair is asserted here: seam 1000 is accepted,
//   caller payload 1000 is refused by name, and the flag is NOT reachable from tool args.
//
// Run: node tests/vmu-run259-audit14.test.mjs

import { createHash } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const VMU = join(ROOT, 'vibe-math-vmu')
const ENTRY = join(VMU, 'vibe-math-vmu.js')
const BP_PATH = join(VMU, 'packs', 'v5r', 'blueprint.js')
const TOOLS_PATH = join(VMU, 'packs', 'v5r', 'tools.js')
const RECORDS_PATH = join(VMU, 'kernel', 'records.js')
const DOCS_PATH = join(VMU, 'docs', '03-interface-contract.md')
const BP_SRC = readFileSync(BP_PATH, 'utf8')
const TOOLS_SRC = readFileSync(TOOLS_PATH, 'utf8')
const RECORDS_SRC = readFileSync(RECORDS_PATH, 'utf8')
const DOCS_SRC = readFileSync(DOCS_PATH, 'utf8')
const BP = await import(pathToFileURL(BP_PATH).href)
const entry = await import(pathToFileURL(ENTRY).href)

let n = 0
const ok = (cond, msg, extra) => {
  n += 1
  assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
}
const eq = (actual, expected, msg) => ok(actual === expected, msg, { actual, expected })
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const hasOwn = (obj, key, msg) => ok(obj !== null && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key), msg, obj)

// ── booting helpers ─────────────────────────────────────────────────────────────────────────────────────────────
const boots = []
async function boot({ clock = () => 1000 } = {}) {
  const tmp = mkdtempSync(join(tmpdir(), 'vmu-run259-'))
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  const handle = await entry.apply(ctx, { clock, packs: ['v5r'], root: tmp })
  await handle.ready()
  await handle.kernel.store.open()
  await handle.kernel.members.hire({ id: 'acad-01', slot: 'chair', institution: 'sim' })
  await handle.kernel.members.hire({ id: 'r-1', slot: 'member', institution: 'sim' })
  const b = {
    tmp, handle, specs,
    ws: join(tmp, 'VibeMath'),
    call: async (name, args = {}) => {
      const spec = specs.filter((s) => s && s.name === name)[0]
      if (!spec) return { ok: false, code: 'NO_SUCH_FACE', name }
      const raw = await spec.execute(args, { kernel: handle.kernel })
      return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
    },
    abs: (rel) => join(tmp, 'VibeMath', rel),
    write: (rel, text) => {
      const abs = join(tmp, 'VibeMath', rel)
      mkdirSync(dirname(abs), { recursive: true })
      writeFileSync(abs, text, 'utf8')
      return abs
    },
    read: (rel) => readFileSync(join(tmp, 'VibeMath', rel), 'utf8'),
    countFiles: () => readdirSync(tmp, { recursive: true }).filter((p) => typeof p === 'string').length,
    // A recursive count taken while the durable store still has a write SCHEDULED measures the scheduler,
    // not the default path: under a loaded machine (T1 runs this suite at concurrency 3) one bookkeeping
    // file can land between the two counts and §4f then reports "the workspace gained a file" for a write
    // that has nothing to do with the draft (RUN 269 observed exactly that: actual 6 / expected 5).
    // settleFiles() joins the kernel's own flush point and then waits until the count stops moving, so the
    // before/after pair is read from the same quiescent state. The assertion itself stays byte-strict.
    settleFiles: async () => {
      const join1 = handle && handle.kernel && handle.kernel.flushRecordsFold
      if (typeof join1 === 'function') await join1()
      let last = -1
      let stable = 0
      const deadline = Date.now() + 2000
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5))
        const n = b.countFiles()
        if (n === last) { stable += 1; if (stable >= 3) return n } else { last = n; stable = 0 }
      }
      return last
    },
  }
  boots.push(b)
  return b
}
// "What did this adoption overwrite?" must be RECOMPUTABLE from the receipt: the sha256 and byte length of the
// canonical file the receipt claims are compared against the bytes actually on disk (RUN 259 / Lead review).
const sha256Of = (buf) => 'sha256:' + createHash('sha256').update(buf).digest('hex')
const bytesOfFile = (b, rel) => readFileSync(join(b.ws, rel))

test('RUN 259 / AUDIT-14: the drift hint has a repair that changes the next answer', async () => {
  // ── §0 the code the criterion leans on is present (a pin, not the criterion itself) ─────────────────────────
  has(RECORDS_SRC, "code: blocked.length === 0 ? null : 'VMU_RECORDS_REINDEX_BLOCKED'",
    '§0a reindex reports a named refusal when a file was skipped for a SHAPE reason')
  has(RECORDS_SRC, 'blockedMeans', '§0b ...and explains what ok:false means on that receipt')
  has(RECORDS_SRC, 'reachableInstead', '§0c ...and every blocked entry carries a reachable repair')
  has(DOCS_SRC, 'VMU_RECORDS_REINDEX_BLOCKED', '§0d the new code is registered in docs/03 §8 (hand-written row)')
  has(BP_SRC, 'refreshFingerprint', '§0e the drift repair is named in blueprint.js')
  has(TOOLS_SRC, 'refreshFingerprint: { type:', '§0f the tool face declares refreshFingerprint (an undeclared key is refused, not dropped)')

  // ── §1 P0-3 walk: plain markdown draft → drift → reindex is honest → refreshFingerprint repairs ────────────
  const b = await boot()
  const PROTO = 'Shared/Run259.md'
  const DRAFT = 'Shared/Drafts/Run259-r1.md'
  const v1 = '# 草案（成员 fs 写，纯 markdown）\n\n- 命题：前 n 个奇数之和 = n^2。\n- 路线：归纳。\n'
  b.write(DRAFT, v1)
  const p1 = await b.call('vibe_v5_blueprint', { action: 'propose', path: PROTO, member: 'r-1', mdPath: DRAFT })
  eq(p1.ok, true, '§1a a member-file propose is admitted')
  eq(p1.md.writtenBy, 'member-file', '§1b the row credits the member with the file')
  const draftId = p1.id
  const co = await b.call('vibe_v5_blueprint', { action: 'propose', path: PROTO, member: 'acad-01', mdPath: DRAFT })
  eq(co.ok, true, '§1c the chair co-designs the same draft (same mdPath)')
  eq((co.authors || []).map((a) => a.seat).join(','), 'member,chair', '§1d both seats are authors now, so adopt is allowed past NEEDS_CODESIGN')
  b.write(DRAFT, v1 + '\n## 共同设计补充｜r-1\n\n- 归纳步：k+1 时加 2k+1。\n')
  const drift = await b.call('vibe_v5_blueprint', { action: 'adopt', path: PROTO, member: 'acad-01', draft: draftId })
  eq(drift.ok, false, '§1e a draft file changed after indexing is REFUSED')
  eq(drift.code, BP.BLUEPRINT_MD_DRIFT, '§1f ...by name (MD_DRIFT)')
  const shaInMessage = /sha256:[0-9a-f]{8}/g.exec(String(drift.message || ''))
  ok(shaInMessage !== null, '§1g ★ the refusal prints the sha256 values (the two byte sequences it is talking about)', String(drift.message || ''))
  has(String(drift.hint || ''), 'refreshFingerprint:true', '§1h ★ the hint names the repair that changes the answer')
  has(String(drift.hint || ''), 'REACHABLE INSTEAD:', '§1i ...and it carries the ASCII contract marker')
  has(String(drift.hint || ''), '不要用 reindex 修 drift', '§1j ★★★ ...and it does NOT send the caller into the reindex loop (that advice is retracted by name)')
  // Without the repair the answer is still the same code — that is what makes it a repair and not a rerun.
  const again = await b.call('vibe_v5_blueprint', { action: 'adopt', path: PROTO, member: 'acad-01', draft: draftId })
  eq(again.code, BP.BLUEPRINT_MD_DRIFT, '§1k calling adopt again without the repair gets the SAME code')
  // The old advice, measured: reindex cannot index a plain markdown draft, and now says so.
  const rx = await b.call('vibe_vmu_records', { action: 'reindex' })
  eq(rx.ok, false, '§1l reindex on a workspace holding a plain markdown draft is NOT reported as a success')
  eq(rx.code, 'VMU_RECORDS_REINDEX_BLOCKED', '§1m ...it is a named refusal')
  eq(rx.partial, true, '§1n ...marked partial')
  const blocked = Array.isArray(rx.blocked) ? rx.blocked : []
  ok(blocked.some((x) => String(x.path).replace(/\\/g, '/').includes('Drafts/Run259-r1.md')), '§1o ★ blocked[] NAMES the draft file', blocked)
  ok(blocked.every((x) => typeof x.reachableInstead === 'string' && x.reachableInstead.length > 0), '§1p ★ every blocked entry carries a reachable repair', blocked)
  has(String(rx.hint || ''), 'REACHABLE INSTEAD:', '§1q the reindex refusal carries the marker too')
  ok(Array.isArray(rx.skipped) && rx.skipped.length > 0, '§1r skipped is still present (kept as detail, no longer as success evidence)')
  // Now walk the hint: one adopt with the repair.
  const fixed = await b.call('vibe_v5_blueprint', { action: 'adopt', path: PROTO, member: 'acad-01', draft: draftId, refreshFingerprint: true })
  eq(fixed.ok, true, '§1s ★★★ following the hint (refreshFingerprint:true) makes the SECOND call succeed')
  ok(fixed.mdDrift !== null && typeof fixed.mdDrift === 'object', '§1t the receipt records the drift it admitted instead of forgetting it')
  ok(fixed.mdDrift.indexedFingerprint !== fixed.mdDrift.fileFingerprint, '§1u ★ the two sha256 values in mdDrift DIFFER (the file really had changed: this is not a no-op)')
  eq(fixed.fingerprintRefreshed, true, '§1v fingerprintRefreshed===true')
  eq(fixed.refreshFingerprint, true, '§1w refreshFingerprint===true (the caller intent is echoed)')
  const canon = b.read(PROTO)
  has(canon, '归纳步：k+1 时加 2k+1', '§1x ★ the CURRENT bytes went into force (the canonical document carries the edited prose)')
  has(canon, 'status：current', '§1y ...composed as the CURRENT blueprint md, not a byte copy of the draft')
  const st = await b.call('vibe_v5_blueprint', { action: 'state', path: PROTO })
  eq(st.mdFingerprint, st.indexFingerprint, '§1z the index now vouches for exactly the bytes on disk')
  eq(st.mdChangedSinceIndex, false, '§1aa ...so mdChangedSinceIndex is false')
  // ★ Lead review (m06706): "ok:true" must not be the only answer to "what did this adoption overwrite".
  // The canonical file is read from DISK and its sha256 / byte length are compared with the receipt's own claim.
  const canonBytes = bytesOfFile(b, PROTO)
  eq(sha256Of(canonBytes), fixed.mdWrite.fingerprint, '§1ab ★ the canonical sha256 in the receipt is recomputable from disk')
  eq(canonBytes.length, fixed.mdWrite.bytes, '§1ac ★ ...and so is its byte length')
  eq(fixed.mdWrite.fingerprint, st.mdFingerprint, '§1ad the receipt and the index agree on the bytes now in force')
  ok(fixed.mdDrift.indexedFingerprint !== fixed.mdWrite.fingerprint, '§1ae ★ the bytes now in force are NOT the bytes the index vouched for before the refresh (the overwrite is visible)')

  // ── §2 P0-3 the other shape: a vmu-md draft (kernel-materialized) — the hint still names ONE repair ────────
  const b2 = await boot()
  const p2 = await b2.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Run259b.md', member: 'r-1', text: '# 草案二\n\n正文一。\n', materialize: true })
  eq(p2.ok, true, '§2a the legacy materialize path files a draft')
  const mdRel2 = p2.mdPath
  const co2 = await b2.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Run259b.md', member: 'acad-01', mdPath: mdRel2 })
  eq(co2.ok, true, '§2b the chair co-designs the materialized draft too')
  // edited AFTER the row indexed the file — that is what drift is, and the order matters: an edit before the co-design
  // is simply the bytes the row indexes, not a disagreement with them.
  b2.write(mdRel2, b2.read(mdRel2) + '\n追加一段。\n')
  const d2 = await b2.call('vibe_v5_blueprint', { action: 'adopt', path: 'Shared/Run259b.md', member: 'acad-01', draft: p2.id })
  eq(d2.code, BP.BLUEPRINT_MD_DRIFT, '§2c a vmu-md draft edited after indexing also refuses DRIFT')
  has(String(d2.hint || ''), 'refreshFingerprint:true', '§2d the same hint names the same repair')
  // ★ Lead review (m06706): the vmu-md shape gets the same walk, and the overwrite must be RECOMPUTABLE:
  // the sha256/bytes of what went into force and of the file that carried the edit must match the disk.
  const editedBytes = bytesOfFile(b2, mdRel2)
  const f2 = await b2.call('vibe_v5_blueprint', { action: 'adopt', path: 'Shared/Run259b.md', member: 'acad-01', draft: p2.id, refreshFingerprint: true })
  eq(f2.ok, true, '§2e ★★★ the same repair changes the answer for a vmu-md draft too')
  ok(f2.mdDrift.indexedFingerprint !== f2.mdDrift.fileFingerprint, '§2f ★ the two sha256 values DIFFER (a real edit, not a no-op)')
  eq(f2.mdDrift.fileFingerprint, sha256Of(editedBytes), '§2g ★ ...and fileFingerprint is recomputable from the edited draft bytes on disk')
  const c2 = b2.read('Shared/Run259b.md')
  has(c2, '追加一段。', '§2h the edited prose went into force')
  const c2Bytes = bytesOfFile(b2, 'Shared/Run259b.md')
  eq(sha256Of(c2Bytes), f2.mdWrite.fingerprint, '§2i ★ the canonical sha256 in the receipt is recomputable from disk (the overwrite is measurable, not just ok:true)')
  eq(c2Bytes.length, f2.mdWrite.bytes, '§2j ★ ...and so is the canonical byte length')
  ok(f2.mdWrite.fingerprint !== f2.mdDrift.indexedFingerprint, '§2k ★ what is in force now is NOT what the index had before the refresh')
})

test('RUN 259 / AUDIT-14 P1-2: a measuring clock is not a caller payload', async () => {
  const bad = [0, -1, -86400000, 8640000000000001, '2026-01-01', '2026/01/01', 'not-a-time', '0000-00-00']
  for (const v of bad) {
    let code = null
    try { BP.clockReadingOf(v, 'run259') } catch (e) { code = e && e.code }
    eq(code, 'VMU_V5R_CLOCK_VALUE_INVALID', '§3a clockReadingOf(' + JSON.stringify(v) + ') is refused BY NAME instead of being stamped', { code })
  }
  const good = BP.clockReadingOf(1767225600000, 'run259')
  eq(good.at, 1767225600000, '§3b a whole millisecond inside 2000-2100 is the kernel clock')
  eq(good.atSource, 'kernel-clock', '§3c ...labelled kernel-clock')
  const goodIso = BP.clockReadingOf('2026-01-01T00:00:00+08:00', 'run259')
  eq(goodIso.at, 1767196800000, '§3d an ISO-8601 string with an EXPLICIT offset is parsed with that offset')
  const wall = BP.clockReadingOf(null, 'run259')
  eq(wall.atSource, 'wall-clock', '§3e null is the ONE fallback: the counted wall-clock read')
  const seam = BP.clockReadingOf(1000, 'run259', { kernelClock: true })
  eq(seam.atSource, 'kernel-clock', '§3f the seam flag lets an injected measuring clock (1000) through')
  eq(seam.clockValue, 'kernel-clock-seam', '§3g ...and the receipt says WHICH path admitted it')
  // The caller cannot relabel the measurement by passing a label of its own.
  const b = await boot()
  const p = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Clock.md', member: 'r-1', text: '# c\n', materialize: true })
  eq(p.ok, true, '§3h the tool face works under the injected harness clock')
  const st = await b.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Clock.md' })
  eq(st.freshness.stampSource, 'kernel-clock', '§3i the freshness stamp is measured, not labelled by the caller')
  eq(st.freshness.stamp, 1000, '§3j ...and it is the injected value')
  let payloadCode = null
  try {
    BP.proposeBlueprint({ records: b.handle.kernel.records, path: 'Shared/Clock2.md', text: '# c2\n', by: 'r-1', at: 1000 })
  } catch (e) { payloadCode = e && e.code }
  eq(payloadCode, 'VMU_V5R_CLOCK_VALUE_INVALID', '§3k ★ a caller payload at:1000 WITHOUT the seam flag is still refused by name (the pair: 3f and 3k)')
})

test('RUN 259 / AUDIT-14 P1-9 + TB-2655: the default writes nothing; the seam cannot be forged', async () => {
  // ── §4 P1-9 fs-first default: BEHAVIOUR, not a source literal ──────────────────────────────────────────────
  const b = await boot()
  const before = await b.settleFiles()
  const d = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Default.md', member: 'r-1', text: '# 默认\n' })
  const after = await b.settleFiles()
  eq(d.ok, true, '§4a the default propose is not an error')
  eq(d.filed, false, '§4b ...but filed===false')
  eq(d.draftMdMissing, true, '§4c ...and it names the missing draft md')
  eq(d.id, null, '§4d ...with id===null: no row for a document that does not exist')
  eq(d.mdOwner, null, '§4e ...and mdOwner===null (nothing was written, so nobody owns a file)')
  eq(after, before, '§4f ★★★ the workspace gained ZERO files on the default path (recursive count, before/after)', { before, after })
  ok(!existsSync(join(b.tmp, 'VibeMath', 'Drafts', 'Default-r1.md')), '§4g ★ ...and the derived draft md is not on disk')
  const m = await b.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Default2.md', member: 'r-1', text: '# 显式物化\n', materialize: true })
  eq(m.ok, true, '§4h materialize:true is the explicit legacy path')
  eq(m.filed, true, '§4i ...and it files')
  eq(m.md.writtenBy, 'kernel-materialized', '§4j ...crediting the kernel with the bytes')
  const mdRel = m.mdPath
  ok(existsSync(b.abs(mdRel)), '§4k ★ ...and the file EXISTS on disk (the one behaviour assertion the default lacked)')
  eq(typeof m.md.fingerprint, 'string', '§4l the receipt carries the sha256 of the bytes it wrote')
  has(m.md.fingerprint, 'sha256:', '§4m ...in the sha256: form')
  // The default did NOT file, so state reports no current revision (still true after materialize on another path).
  const stDefault = await b.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Default.md' })
  eq(stDefault.hasCurrent, false, '§4n state for the default path says hasCurrent===false: nothing was invented')

  // ── §5 TB-2655: seam accepted, payload refused, flag NOT reachable from tool args ─────────────────────────
  const b2 = await boot({ clock: () => 1000 })
  const clockBefore = BP.blueprintClockSourcesOf()
  const p = await b2.call('vibe_v5_blueprint', { action: 'propose', path: 'Shared/Seam.md', member: 'r-1', text: '# 缝\n', materialize: true })
  const clockAfter = BP.blueprintClockSourcesOf()
  eq(p.ok, true, '§5a ★ boot({clock:()=>1000}) is a legal measuring clock: propose is ACCEPTED (the defect refused here)')
  eq(p.atSource, 'kernel-clock', '§5b ...and the receipt names the kernel clock')
  eq(clockAfter.wallClockReads - clockBefore.wallClockReads, 0, '§5c ...with ZERO new wall-clock reads (module counter delta, not an absolute: earlier tests share the counter)', { before: clockBefore.wallClockReads, after: clockAfter.wallClockReads })
  const st = await b2.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Seam.md' })
  eq(st.ok, true, '§5d state recomputes freshness under the same clock without refusing itself')
  eq(st.freshness.stamp, 1000, '§5e ...stamp is the seam value')
  const forged = await b2.call('vibe_v5_blueprint', { action: 'state', path: 'Shared/Seam.md', kernelClock: true, at: 0, now: 0 })
  eq(forged.ok, false, '§5f ★★ passing kernelClock/at/now as TOOL ARGS is refused, not silently dropped')
  eq(forged.code, 'VMU_INVALID_ARGUMENT', '§5g ...by name')
  has(String(forged.message || ''), 'kernelClock', '§5h ★★ ...naming the undeclared key: the seam flag cannot be forged through the tool face')
  has(String(forged.message || ''), 'does not accept parameter', '§5i ...and saying the face does not accept it')
})

test('RUN 259 / AUDIT-14: the booted kernels are released', async () => {
  eq(boots.length > 0, true, '§6 at least one kernel was booted')
  for (const b of boots) {
    try { await b.handle.dispose() } catch (e) {}
  }
  console.log('[run259-audit14] assertions=' + n)
})
