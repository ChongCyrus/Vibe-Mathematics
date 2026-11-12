// tests/vmu-run79-written-from-fold.test.mjs — RUN 79 / TB-2739 (A): provenance must TRAVEL WITH THE ROW.
//
// THE DEFECT THIS PINS (measured on the real machine, RUN 79, build 6c689c86): the office read 31 rows whose
// `writtenFrom` was `relayed` while the SAME turns said `deliveryPath:"activation"` and `memberActs:8` — one fact, two
// readings. The provenance is known only at dispatch time, so it is recorded when the row is written; but the fold and
// the re-hydration dropped it, so every reader that did not dispatch the write RE-DERIVED it from "a named writer and
// no caller", and that derivation can only say `relayed`. The write faces were right; the transport was not.
//
// WHAT THIS SUITE PROVES:
//   ① the fold carries `writtenFrom` OUT (snapshot projection) and BACK IN (hydration passes it to `put`);
//   ② a row adopted from the shared fold for the FIRST time keeps the fold provenance (`synchronize` added branch) —
//      a seat that wrote in its own turn is `own-turn` to every sibling kernel, not `relayed`;
//   ③ an adopted REWRITE keeps the fold provenance too (`synchronize` refresh branch), while an INVALID fold value is
//      ignored rather than coerced (a fold written before this key existed says nothing);
//   ④ the derivation itself is UNCHANGED: a named writer with no caller still writes `relayed`, an unnamed one
//      `unknown`, and an explicit invalid value is still refused BY NAME (no silent clamp);
//   ⑤ anti-lamp-off ×3 on REAL COPIES: the snapshot projection OUT, the first-adoption hand-over, and the rewrite
//      restore are each deleted in its own copy and each turns exactly its assertion RED; the copies are restored
//      byte-identically (sha256 shown). The hydration hand-over is pinned in §0 and exercised by §1 but not lamped:
//      deleting it leaves the fresh kernel GREEN because the pull path restores the same fact through the same fold row —
//      a second door, not the first, and a lamp whose mutant stays green is not a lamp.

// fs-purpose: read four source files for exact pins, boot kernels under temp roots, and copy the entry tree for three
// mutations that are restored byte-identically so no module is left mutated.
import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { tmpRoot as __tmpRoot } from './_lib/scratch.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')
const ENTRY = pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href
const RECORDS_SRC = readFileSync(join(VMU, 'kernel', 'records.js'), 'utf8')
const INDEX_SRC = readFileSync(join(VMU, 'kernel', 'index.js'), 'utf8')
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

const TRI = ['own-turn', 'relayed', 'unknown']
let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

// A mutable clock: the adoption rule is STRICTLY NEWER, so a rewrite must carry a later instant than the row it writes.
const T0 = 1_800_000_000_000
const clocks = []
const makeClock = () => { const c = { now: T0 }; clocks.push(c); return c }
const TMP_ROOT = process.env.VMU_TEST_TMP_ROOT || (existsSync(__tmpRoot()) ? __tmpRoot() : tmpdir())
const MUT_ROOT = join(TMP_ROOT, 'tb2739-written-from')
const roots = []
const mkRoot = async (tag) => { const d = await mkdtemp(join(TMP_ROOT, tag)); roots.push(d); return d }

const settings = () => ({ 'vmu.resume.writeThrough': true, 'vmu.resume.projections': ['members'] })

const bootWith = async (entryUrl, root, clockAt) => {
  const specs = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (s) => { specs.push(s); return () => {} } },
  }
  const e = await import(entryUrl)
  const handle = e.apply(ctx, { clock: () => clockAt.now, packs: ['v5r'], root, vmu: settings() })
  await handle.ready()
  await handle.kernel.store.open()
  return { handle, kernel: handle.kernel, specs, specOf: (n) => specs.find((s) => s && s.name === n) || null }
}
const call = async (b, name, args = {}) => {
  const spec = b.specOf(name)
  if (!spec) return { ok: false, code: 'NO_SUCH_TOOL', name }
  try {
    const raw = await spec.execute(args, { kernel: b.kernel })
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (e) {
    return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) }
  }
}
const settle = async (k) => { if (k.resumeService && typeof k.resumeService.settle === 'function') await k.resumeService.settle() }
const until = async (fn, ms = 5000) => {
  const t0 = Date.now()
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() - t0 > ms) return null
    await new Promise((r) => setTimeout(r, 25))
  }
}
const durableState = async (root) => JSON.parse(await readFile(join(root, 'vmu', 'state.json'), 'utf8'))
// The records fold row for one id, exactly as it sits on disk — the reading the hydration path consumes.
// The fold stores `records` as a plain ARRAY of rows (probed, not assumed); older shapes wrap it in value/data.
const durableRecordRow = async (root, id) => {
  const st = await durableState(root).catch(() => null)
  const raw = st && st.keys ? st.keys.records : null
  if (!raw) return null
  let rows = raw
  if (rows && !Array.isArray(rows) && rows.value !== undefined) rows = rows.value && rows.value.data !== undefined ? rows.value.data : rows.value
  if (typeof rows === 'string') { try { rows = JSON.parse(rows) } catch { return null } }
  if (rows && !Array.isArray(rows) && typeof rows === 'object' && Array.isArray(rows.__map)) rows = rows.__map.map((p) => (Array.isArray(p) ? Object.assign({ id: p[0] }, p[1]) : p))
  if (!Array.isArray(rows)) return null
  return rows.filter((r) => r && String(r.id) === String(id))[0] || null
}
const putRow = (k, spec) => {
  try {
    return k.records.put(Object.assign(
      { track: 'progress', kind: 'progress' },
      spec,
      spec.by === undefined ? { by: 'r-1' } : (spec.by === null ? {} : { by: spec.by }),
      spec.writtenFrom === undefined || spec.writtenFrom === null ? {} : { writtenFrom: spec.writtenFrom },
    ))
  } catch (e) {
    return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e), hint: (e && e.hint) || null }
  }
}
const readBack = (k, id) => {
  try {
    const got = k.records.get({ id })
    return got && got.ok === true ? got : { ok: false, error: 'not-ok' }
  } catch (e) { return { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) } }
}

// ── the three transport scenarios, each shareable with a MUTANT tree ────────────────────────────────────────────────
// (i) REHYDRATION: A writes, A flushes the fold, a NEW kernel boots over the same root and reads the row.
const scenarioRehydrate = async (entryUrl) => {
  const clock = makeClock()
  const root = await mkRoot('vmu-run79-wf-rehydrate-')
  const a = await bootWith(entryUrl, root, clock)
  const put = putRow(a.kernel, { id: 'rec-r1', title: 'r1|progress', body: 'r-1 自己写的进展：引理 A 已证。', writtenFrom: 'own-turn' })
  const id = put && put.ok === true ? String(put.id) : 'rec-r1'
  await settle(a.kernel)
  const durable = await until(async () => { const r = await durableRecordRow(root, id).catch(() => null); return r ? r : null })
  const b = await bootWith(entryUrl, root, clock)
  await settle(b.kernel)
  return { put, id, durable, fresh: readBack(b.kernel, id), a, b, root }
}
// (ii) FIRST ADOPTION: the reader kernel boots BEFORE the write, so the row arrives through `synchronize` added branch.
const scenarioAdded = async (entryUrl) => {
  const clock = makeClock()
  const root = await mkRoot('vmu-run79-wf-added-')
  const reader = await bootWith(entryUrl, root, clock)
  const writer = await bootWith(entryUrl, root, clock)
  clock.now += 1000
  const put = putRow(writer.kernel, { id: 'rec-a1', title: 'a1|progress', body: 'r-1 在激活回合里自己写下的进展。', writtenFrom: 'own-turn' })
  const id = put && put.ok === true ? String(put.id) : 'rec-a1'
  await settle(writer.kernel)
  const pulled = await until(async () => {
    const got = readBack(reader.kernel, id)
    return got && got.ok === true ? got : null
  })
  return { put, id, pulled, reader, writer, root }
}
// (iii) REWRITE ADOPTION: the reader holds the row (through its OWN write, so no in-flight pending masks the fold), then
// a sibling rewrites it with a LATER instant and other provenance.
const scenarioRefresh = async (entryUrl) => {
  const clock = makeClock()
  const root = await mkRoot('vmu-run79-wf-refresh-')
  const writer = await bootWith(entryUrl, root, clock)
  const first = putRow(writer.kernel, { id: 'rec-w1', title: 'w1|progress', body: '第一版：引理 A。', writtenFrom: 'own-turn' })
  const id = first && first.ok === true ? String(first.id) : 'rec-w1'
  await settle(writer.kernel)
  const reader = await bootWith(entryUrl, root, clock)
  await settle(reader.kernel)
  readBack(reader.kernel, id)                                     // hydrate + hold the row
  clock.now += 1000
  const own = putRow(reader.kernel, { id, title: 'w1|progress', body: '第一版（读者修订）：引理 A。', by: 'r-2', writtenFrom: 'own-turn' })
  await settle(reader.kernel)
  const settledOwn = await until(async () => {
    const row = await durableRecordRow(root, id).catch(() => null)
    return row && String(row.by || '') === 'r-2' ? row : null
  }, 8000)
  const before = readBack(reader.kernel, id)
  clock.now += 5000
  const rewrite = putRow(writer.kernel, { id, title: 'w1|progress', body: '第二版：引理 A 与 B。', writtenFrom: 'relayed' })
  await settle(writer.kernel)
  const landed = await until(async () => {
    const row = await durableRecordRow(root, id).catch(() => null)
    return row && String(row.body || '') === '第二版：引理 A 与 B。' ? row : null
  }, 8000)
  const after = await until(async () => {
    const got = readBack(reader.kernel, id)
    return got && got.ok === true && String(got.body || '') === '第二版：引理 A 与 B。' ? got : null
  }, 8000)
  return { first, own, settledOwn, rewrite, landed, id, before, after, reader, writer, root }
}

try {
  // ── §0 THE SOURCE: the three transport hunks exist, and the tri-state list did not grow ────────────────────────
  console.log('=== 0. SOURCE: provenance is projected out, carried back in, and adopted from the fold ===')
  {
    ok(/const WRITTEN_FROM_VALUES = Object\.freeze\(\['own-turn', 'relayed', 'unknown'\]\)/.test(RECORDS_SRC),
      'the provenance vocabulary is still exactly three values (no new word for the same fact)')
    ok(/writtenFrom: foldWrittenFrom/.test(INDEX_SRC),
      '★ §0 the records SNAPSHOT carries `writtenFrom` out to the fold (it used to drop it)')
    ok(/const foldProvenance = row\.writtenFrom === 'own-turn' \|\| row\.writtenFrom === 'relayed' \|\| row\.writtenFrom === 'unknown' \? row\.writtenFrom : null/.test(INDEX_SRC),
      '§0 hydration accepts only the three values from the fold (an absent/invalid one stays absent)')
    ok(/\.\.\.\(foldProvenance === null \? \{\} : \{ writtenFrom: foldProvenance \}\)/.test(INDEX_SRC),
      '★ §0 hydration HANDS the fold provenance to `put` instead of letting it re-derive')
    const provenanceReads = (RECORDS_SRC.match(/const provenanceOfRow = WRITTEN_FROM_VALUES\.indexOf\(row\.writtenFrom\) === -1 \? null : row\.writtenFrom/g) || []).length
    ok(provenanceReads === 2, '★ §0 BOTH adoption branches read the fold provenance (refresh + first adoption)', provenanceReads)
    ok(/if \(provenanceOfRow !== null\) held\.writtenFrom = provenanceOfRow/.test(RECORDS_SRC),
      '★ §0 an adopted REWRITE restores the provenance alongside title/body/by/owner')
    ok(/\.\.\.\(provenanceOfRow === null \? \{\} : \{ writtenFrom: provenanceOfRow \}\) \}\)/.test(RECORDS_SRC),
      '★ §0 a FIRST-ADOPTED row passes the fold provenance into `put` (no re-derivation in this kernel)')
    ok(/const provenanceOfRow = WRITTEN_FROM_VALUES\.indexOf\(row\.writtenFrom\) === -1 \? null : row\.writtenFrom\n          if \(provenanceOfRow !== null\) held\.writtenFrom = provenanceOfRow/.test(RECORDS_SRC),
      '§0 the refresh branch is guarded on a VALID value (a legacy fold row is not coerced to a word it never said)')
    ok(/const derivedWrittenFrom = deliveryPath === 'caller'\n        \? 'relayed'/.test(RECORDS_SRC),
      '§0 the DERIVATION itself is untouched (the change is transport, not a new rule)')
  }

  // ── §1 REHYDRATION: a restart must not re-derive what the write already established ──────────────────────────
  console.log('=== 1. REHYDRATION: the fold carries the provenance back into a kernel that never dispatched the write ===')
  {
    const r = await scenarioRehydrate(ENTRY)
    ok(r.durable !== null, '§1 precondition: the row reached the DURABLE fold', r.durable && r.durable.id)
    ok(r.durable && r.durable.writtenFrom === 'own-turn',
      '★ §1 the fold ROW says `own-turn` (the write established it; the fold used to drop the key)', r.durable && r.durable.writtenFrom)
    ok(r.fresh && r.fresh.ok === true, '§1 a fresh kernel over the same root reads the row', r.fresh && (r.fresh.code || r.fresh.message))
    ok(r.fresh && r.fresh.writtenFrom === 'own-turn',
      '★★ §1 the fresh kernel reads `own-turn`, not the `relayed` its own derivation would invent (RUN 79 V1)', r.fresh && r.fresh.writtenFrom)
    ok(r.fresh && typeof r.fresh.writtenFromMeans === 'string' && /own-turn = the named seat ran it/.test(String(r.fresh.writtenFromMeans)),
      '§1 the read face still explains the value it reports')
    ok(r.fresh && r.fresh.title === 'r1|progress' && String(r.fresh.body || '').includes('引理 A'),
      '§1 the row itself survived the restart intact')
  }

  // ── §2 FIRST ADOPTION: a sibling kernel learns the row (and its provenance) from the shared fold ─────────────
  console.log('=== 2. FIRST ADOPTION: a reader that booted BEFORE the write learns provenance from the fold ===')
  {
    const r = await scenarioAdded(ENTRY)
    ok(r.pulled !== null, '§2 the reader can read a row written AFTER it booted (the fold is shared)', r.pulled && (r.pulled.code || r.pulled.message))
    ok(r.pulled && r.pulled.writtenFrom === 'own-turn',
      '★★ §2 the first-adopted row says `own-turn` — this instance never dispatched the write, so the fold is the witness', r.pulled && r.pulled.writtenFrom)
    const pulls = r.reader.kernel.records.status ? r.reader.kernel.records.status().shared : null
    ok(pulls && Number.isInteger(pulls.pulled) && pulls.pulled >= 1,
      '★ §2 the row really came in through the shared-fold pull (not through a private write)', pulls && { pulled: pulls.pulled })
    ok(r.pulled && r.pulled.by === 'r-1' && r.pulled.owner === 'r-1',
      '§2 the three names are still intact after adoption (by/owner/writtenFrom are three facts)', r.pulled && { by: r.pulled.by, owner: r.pulled.owner })
  }

  // ── §3 REWRITE ADOPTION: the provenance travels with the NEW body ───────────────────────────────────────────
  console.log('=== 3. REWRITE ADOPTION: a newer rewrite brings its own provenance, not the one this kernel remembers ===')
  {
    const r = await scenarioRefresh(ENTRY)
    ok(r.before && r.before.ok === true && r.before.writtenFrom === 'own-turn',
      '§3 precondition: the reader holds its OWN revision of the row, with `own-turn`', r.before && r.before.writtenFrom)
    ok(r.landed !== null, '§3 precondition: the rewrite reached the DURABLE fold (a read cannot adopt what was never written)', r.landed && r.landed.id)
    ok(r.after !== null, '§3 the reader adopts the newer body from the fold', r.after && (r.after.code || r.after.message))
    ok(r.after && r.after.writtenFrom === 'relayed',
      '★★ §3 the adopted rewrite says `relayed` (its OWN provenance), not the stale `own-turn` this reader held', r.after && r.after.writtenFrom)
    ok(r.after && String(r.after.body || '') === '第二版：引理 A 与 B。',
      '§3 the body and the provenance were adopted together (one row, one revision of facts)')
    ok(r.after && r.after.by === 'r-1', '§3 the writer name came with it too (the three facts move as one row)', r.after && { by: r.after.by, wf: r.after.writtenFrom })
  }

  // ── §4 THE DERIVATION IS UNCHANGED, AND AN INVALID VALUE IS STILL REFUSED BY NAME ────────────────────────────
  console.log('=== 4. NO NEW RULE: named writer + no caller is still `relayed`; unnamed is `unknown`; `bogus` is refused ===')
  {
    const clock = makeClock()
    const root = await mkRoot('vmu-run79-wf-derive-')
    const k = await bootWith(ENTRY, root, clock)
    const named = putRow(k.kernel, { id: 'rec-d1', title: 'd1|progress', body: 'nobody dispatched this put.' })
    ok(named && named.ok === true && named.writtenFrom === 'relayed',
      '§4 a named writer with no caller is still `relayed` (the legacy derivation is untouched)', named && named.writtenFrom)
    const unnamed = putRow(k.kernel, { id: 'rec-d2', title: 'd2|progress', body: 'no writer, no caller.', by: null })
    ok(unnamed && unnamed.ok === true && unnamed.writtenFrom === 'unknown',
      '§4 no writer and no caller is still `unknown`', unnamed && unnamed.writtenFrom)
    const bogus = putRow(k.kernel, { id: 'rec-d3', title: 'd3|progress', body: 'x', writtenFrom: 'own-turn-ish' })
    ok(bogus && bogus.ok === false && bogus.code === 'VMU_INVALID_ARGUMENT',
      '§4 an explicit invalid provenance is refused BY NAME (no clamp, no silent coercion)', bogus && (bogus.code || bogus.message))
    ok(bogus && /own-turn = the seat ran it in its own turn/.test(String(bogus.message || '') + String(bogus.hint || '')),
      '§4 the refusal names the allowed values instead of just saying no', bogus && { message: bogus.message, hint: bogus.hint })
    await settle(k.kernel)
    const relayedDurable = await until(async () => { const row = await durableRecordRow(root, 'rec-d1').catch(() => null); return row ? row : null })
    ok(relayedDurable && relayedDurable.writtenFrom === 'relayed',
      '§4 the fold carries `relayed` too — the round-trip is faithful for all three values, not just the convenient one',
      relayedDurable && relayedDurable.writtenFrom)
    const unknownDurable = await durableRecordRow(root, 'rec-d2').catch(() => null)
    ok(unknownDurable && unknownDurable.writtenFrom === 'unknown',
      '§4 `unknown` is a recorded fact, not a missing key', unknownDurable && unknownDurable.writtenFrom)
    const viaTool = await call(k, 'vibe_vmu_records', { action: 'get', id: 'rec-d1' })
    const toolWrittenFrom = viaTool && (viaTool.writtenFrom !== undefined ? viaTool.writtenFrom : (viaTool.record && viaTool.record.writtenFrom))
    ok(viaTool && viaTool.ok === true && toolWrittenFrom === named.writtenFrom,
      '§4 the TOOL face and the kernel API report the same provenance (one fact, one reading)', viaTool && { tool: toolWrittenFrom, api: named && named.writtenFrom })
    ok(TRI.indexOf(named.writtenFrom) !== -1 && TRI.indexOf(unnamed.writtenFrom) !== -1,
      '§4 every value this suite writes is one of the declared three (no private vocabulary)', { named: named && named.writtenFrom, unnamed: unnamed && unnamed.writtenFrom })
  }

  // ── §5 ANTI-LAMP-OFF ×3: each transport hunk removed on a REAL COPY must turn its own assertion RED ──────────
  console.log('=== 5. ANTI-LAMP-OFF: three real copies, one mutation each; restore is byte-identical (sha256) ===')
  {
    mkdirSync(MUT_ROOT, { recursive: true })
    const REC_REL = join('kernel', 'records.js')
    const IDX_REL = join('kernel', 'index.js')
    const withMutant = async (name, rel, mutate, fn) => {
      const tree = join(MUT_ROOT, 'tree-' + name)
      await rm(tree, { recursive: true, force: true })
      cpSync(VMU, tree, { recursive: true })
      const file = join(tree, rel)
      const pristine = readFileSync(file, 'utf8')
      const pristineSha = sha256(pristine)
      const mutated = mutate(pristine)
      ok(mutated !== pristine, '§5 ' + name + ': the mutation actually changed the source text')
      await writeFile(file, mutated, 'utf8')
      try {
        return await fn({ tree, entry: pathToFileURL(join(tree, 'vibe-math-vmu.js')).href })
      } finally {
        await writeFile(file, pristine, 'utf8')
        ok(sha256(readFileSync(file, 'utf8')) === pristineSha, '§5 ' + name + ': the copy RESTORED byte-identically to the pristine sha256')
      }
    }

    // (a) drop the refresh-branch restore ⇒ a rewrite keeps the caller's stale provenance.
    await withMutant('refresh', REC_REL,
      (src) => src.replace('          if (provenanceOfRow !== null) held.writtenFrom = provenanceOfRow\n', ''),
      async (m) => {
        const r = await scenarioRefresh(m.entry)
        ok(r.before && r.before.writtenFrom === 'own-turn', '§5 (a) control: the mutant holds version 1 as `own-turn`', r.before && r.before.writtenFrom)
        ok(r.after !== null, '§5 (a) the mutant still adopts the newer body (only the provenance transport is gone)', r.after && (r.after.code || r.after.message))
        ok(r.after && r.after.writtenFrom === 'own-turn',
          '★ §5 (a) RED: with the restore removed the adopted rewrite keeps the stale `own-turn` instead of its own `relayed`', r.after && r.after.writtenFrom)
      })

    // (b) drop the first-adoption hand-over ⇒ a sibling kernel invents `relayed` for a seat own-turn write.
    await withMutant('added', REC_REL,
      (src) => src.replace('          ...(provenanceOfRow === null ? {} : { writtenFrom: provenanceOfRow }) })\n', '          })\n'),
      async (m) => {
        const r = await scenarioAdded(m.entry)
        ok(r.pulled !== null, '§5 (b) the mutant reader still pulls the row', r.pulled && (r.pulled.code || r.pulled.message))
        ok(r.pulled && r.pulled.writtenFrom === 'relayed',
          '★ §5 (b) RED: without the hand-over the first-adopted row re-derives `relayed` (the RUN 79 V1 sentence)', r.pulled && r.pulled.writtenFrom)
      })

    // (c) drop the SNAPSHOT projection ⇒ the fold row loses its provenance, so nothing downstream can carry it back.
    // NOTE: the hydration hand-over (`...(foldProvenance === null ? {} : { writtenFrom: foldProvenance })`) is NOT lamped
    // separately, and the reason is itself a measurement: on a real copy with that spread deleted the fresh kernel still
    // reads `own-turn`, because the pull path (first-adoption hand-over) restores the same fact through the same fold row.
    // A lamp whose mutant stays GREEN is not a lamp — it is a second door being credited to the first. The hydration hunk
    // is pinned in §0 and exercised by §1; the lamp belongs on the projection, the one hunk whose removal takes the fact
    // out of the fold itself.
    await withMutant('snapshot', IDX_REL,
      (src) => src.replace('            writtenFrom: foldWrittenFrom,\n', ''),
      async (m) => {
        const r = await scenarioRehydrate(m.entry)
        ok(r.durable !== null, '§5 (c) the mutant still writes a durable row (the row itself is not the casualty)', r.durable && r.durable.id)
        ok(r.durable && r.durable.writtenFrom === undefined,
          '★ §5 (c) RED: without the snapshot projection the DURABLE row carries no `writtenFrom` at all', r.durable && r.durable.writtenFrom)
        ok(r.fresh && r.fresh.ok === true, '§5 (c) the mutant fresh kernel still reads the row', r.fresh && (r.fresh.code || r.fresh.message))
        ok(r.fresh && r.fresh.writtenFrom === 'relayed',
          '★ §5 (c) RED: with the fact gone from the fold a restart re-derives `relayed` (the RUN 79 V1 sentence)', r.fresh && r.fresh.writtenFrom)
      })
  }

  console.log('')
  console.log('=== vmu-run79-written-from-fold: ' + passed + ' passed, ' + failed + ' failed ===')
  if (failed > 0) { console.log('failures:'); for (const f of failures) console.log('  - ' + f) }
  process.exitCode = failed === 0 ? 0 : 1
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}
