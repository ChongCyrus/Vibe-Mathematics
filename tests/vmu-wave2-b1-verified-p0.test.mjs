#!/usr/bin/env node
// WAVE 2 — B1: a promoted DISPROOF must not be written down as "conclusion 真 (p=1)".
//
// THE DEFECT (measured, not imagined): `packs/v5r/verified.js` ADMITS `p === 0` (its guard refuses only values other
// than 0/1), but the row body it composed hardcoded `'; conclusion 真 (p=1)'`. So a card the debate had REFUTED walked
// into the verified track carrying a sentence saying it was proven — the worst kind of lie, because the row is the
// institute's conclusion register and every later reader trusts its prose.
//
// WHAT THIS FILE MEASURES (through the real pack tool `vibe_v5_verified_promote`, not a local helper):
//   · p=0 + a unanimous-0 debate ruling ⇒ the row says 假 (p=0), names the disproof warrant, and never says 真 (p=1);
//   · p=1 still says 真 (p=1) (the fix must not blur the two conclusions into one);
//   · p=0.4 is still refused VMU_STATE — the admission of p=0 must not widen into "any p may be promoted".
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')

let passed = 0
let failed = 0
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const entry = await import(pathToFileURL(ENTRY).href)
const { listVerified, parseVerified } = await import(pathToFileURL(join(REPO, 'vibe-math-vmu', 'packs', 'v5r', 'verified.js')).href)

async function boot() {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const root = await mkdtemp(join(tmpdir(), 'vmu-wave2-b1-'))
  const handle = entry.apply(ctx, { clock: () => 1000, packs: ['v5r'], root })
  await handle.ready()
  const call = async (name, args) => {
    const spec = state.specs.find((s) => s.name === name)
    if (!spec) return { missing: true }
    let raw
    try { raw = await spec.execute(args, { kernel: handle.kernel }) } catch (e) {
      return { thrown: true, code: e && e.code, message: e && e.message, hint: e && e.hint }
    }
    try { return JSON.parse(raw) } catch { return { raw } }
  }
  return { kernel: handle.kernel, call, root }
}

const CARD = (p) => '- statement：对任意 n，2 是 n(n+1) 的因子\n- value：组合计数\n- motive：构造配对\n- p：' + p + '\n'
const cardBody = (row) => {
  const got = row && row.record ? row.record : row
  return String((got && got.body) || '')
}

const { kernel, call, root } = await boot()
await kernel.members.hire({ id: 'r-chair', slot: 'chair' })
await kernel.members.hire({ id: 'r-1', slot: 'member' })

// ── §1 the disproof is promoted, and reads as a disproof ───────────────────────────────────────────────────────────
console.log('§1 B1 — a refuted card enters the verified track as 假 (p=0), with its disproof warrant named')
{
  const card = await kernel.records.put({ track: 'propositions', kind: 'proposition', title: '命题-被否证', body: CARD(0), by: 'r-1' })
  const promoted = await call('vibe_v5_verified_promote', {
    card: card.id, member: 'r-chair', warrant: 'b-0', warrant_kind: 'debate-unanimous',
    debate_ruling: { mode: 'unanimous', value: 0, subject: card.id, ballotId: 'b-0' },
  })
  ok(promoted.ok === true && promoted.p === 0, 'the p=0 card is ADMITTED (the documented p∈{0,1} rule)', promoted)
  ok(promoted.conclusion === false, 'the receipt says conclusion:false for p=0', promoted.conclusion)
  const body = cardBody(kernel.records.get({ id: promoted.id }))
  ok(/conclusion 假 \(p=0\)/.test(body), 'the verified row says 假 (p=0)', body.split('\n').filter((l) => /conclusion/.test(l)))
  ok(!/真 \(p=1\)/.test(body), 'the row NEVER says 真 (p=1) — the B1 lie is gone', /真 \(p=1\)/.test(body))
  ok(/disproved/.test(body), 'the row names the row as a DISPROOF (not a proof)', body)
  ok(/b-0/.test(body) && /debate-unanimous/.test(body),
    'the disproof warrant is named in the row (id + kind), not left as "some warrant"', body.split('\n').filter((l) => /warrant/.test(l)))
}

// ── §2 p=1 is untouched: one sentence must not become a blur ──────────────────────────────────────────────────────
console.log('§2 B1 — p=1 still reads 真 (p=1), with no disproof language')
{
  const card = await kernel.records.put({ track: 'propositions', kind: 'proposition', title: '命题-成立', body: CARD(1), by: 'r-1' })
  const promoted = await call('vibe_v5_verified_promote', {
    card: card.id, member: 'r-chair', warrant: 'b-1', warrant_kind: 'debate-unanimous',
    debate_ruling: { mode: 'unanimous', value: 1, subject: card.id, ballotId: 'b-1' },
  })
  const body = cardBody(kernel.records.get({ id: promoted.id }))
  ok(promoted.ok === true && promoted.p === 1 && promoted.conclusion === true, 'the p=1 card is admitted as a proof', promoted)
  ok(/conclusion 真 \(p=1\)/.test(body), 'the row says 真 (p=1)', body)
  ok(!/假/.test(body) && !/disproved/.test(body), 'the row says nothing about a disproof', body)
}

// ── §3 the admission is exact: p in (0,1) is still refused ────────────────────────────────────────────────────────
console.log('§3 B1 — the guard still refuses an unsettled probability (p=0.4)')
{
  const card = await kernel.records.put({ track: 'propositions', kind: 'proposition', title: '命题-未定', body: CARD(0.4), by: 'r-1' })
  const refused = await call('vibe_v5_verified_promote', {
    card: card.id, member: 'r-chair', warrant: 'b-2', warrant_kind: 'debate-unanimous',
    debate_ruling: { mode: 'unanimous', value: 1, subject: card.id, ballotId: 'b-2' },
  })
  ok(refused.ok === false, 'p=0.4 is refused', refused)
  ok(refused.code === 'VMU_STATE', 'the code is VMU_STATE (the same settled-ness refusal)', refused.code)
  ok(/is not settled \(p=0\.4\)/.test(String(refused.message)), 'the message names the value that is not settled', refused.message)
  const rows = listVerified(kernel.records)
  ok(!rows.items.some((r) => r && r.cardId === card.id), 'the refused card left NO verified row behind', rows.items.map((r) => r.cardId))
}

// ── §4 the disproof is readable through the verified reader, not only as raw text ─────────────────────────────────
console.log('§4 B1 — the verified READER parses the disproof back as conclusion:false (the register is self-consistent)')
{
  const rows = listVerified(kernel.records)
  ok(rows.ok === true, 'the verified track lists', rows)
  ok(rows.bad.length === 0, 'no row in the verified track is unparsable', rows.bad)
  const zero = rows.items.filter((r) => r.p === 0)
  const one = rows.items.filter((r) => r.p === 1)
  ok(zero.length === 1 && zero[0].conclusion === false, 'the p=0 row parses as conclusion:false', zero.map((r) => ({ p: r.p, conclusion: r.conclusion })))
  const parsedZero = parseVerified(kernel.records.get({ id: zero[0].id }))
  ok(parsedZero.ok === true && /disproved/.test(String(parsedZero.verified && parsedZero.verified.basis)),
    'the parsed 判定依据 carries the disproof sentence', parsedZero.verified && parsedZero.verified.basis)
  ok(one.length === 1 && one[0].conclusion === true, 'the p=1 row parses as conclusion:true', one.map((r) => ({ p: r.p, conclusion: r.conclusion })))
}

await rm(root, { recursive: true, force: true, maxRetries: 10 })
console.log('=== VMU WAVE2 B1 (verified p=0): ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) process.exit(1)
console.log('ALL GREEN — tests/vmu-wave2-b1-verified-p0.test.mjs (' + passed + ' checks)')
