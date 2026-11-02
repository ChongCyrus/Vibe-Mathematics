// RUN 186 (FEEDBACK29 D8 + D4): a hint that quotes a truncated name, and a vocabulary that half-accepts a word.
//
// D8 (run 29): the prose gate refuses a deliverable that does not carry every settled conclusion, and its message told
// the author to paste the conclusion's "title line" — the SAME line the receipt had just truncated with `…`. Pasting it
// fails the gate, so the only reachable repair is to notice the truncation and go read the record. The message now
// quotes the FULL statement when the title was truncated, and says plainly that the line is a prefix.
//
// D4 (run 29): a member passed `warrant_kind:"debate"`. The receipt of `verdict_final` calls the same form
// `debate-unanimous`, and the refusal listed the three contract forms while dropping the short word the caller had
// just read. The three forms stay the contract; the short words became addresses, and the receipt says which one was
// read so nothing is silently rewritten.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

// ★★ RUN 201 (run 40 / FEEDBACK39 1.1): a ruling NAME is now RESOLVED against the institute's own records — run 40 wrote
// p=1 while naming a ballot that held ZERO votes, so `debate_ruling` has to prove "a decision people made", not "a
// string that looks like an id". A made-up id is refused by name (`VMU_PACK_V5R_CORE_P1_RULING_UNRESOLVED`), so these
// fixtures seed a REAL box with a REAL vote instead of inventing an id.
function seedVotingBallot(kernel, tag) {
  const box = kernel.ballotbox.open({ question: tag + ' 是否成立', options: ['1', '0'], rules: { minVotes: 0 } })
  const id = String(box.boxId === undefined ? box.id : box.boxId)
  kernel.ballotbox.cast({ boxId: id, by: 'r-1', choice: '1' })
  return id
}


const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const QUALITY = join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'paper-quality.js')
const QUALITY_SRC = readFileSync(QUALITY, 'utf8')
const TOOLS_SRC = readFileSync(join(ROOT, 'vibe-math-vmu', 'packs', 'v5r', 'tools.js'), 'utf8')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)
const hasNot = (hay, needle, msg) => ok(!String(hay).includes(needle), msg + ' — unexpectedly present: ' + needle)

test('RUN 186 §0 — both repairs are seams in the source, not wording sprinkled at one call site', () => {
  has(QUALITY_SRC, 'first.requiredLineTruncated && first.requiredLineFull',
    '§0a the message branches on the truncation the same receipt reports')
  has(QUALITY_SRC, '完整陈述', '§0b it quotes the full statement the gate actually accepts')
  has(QUALITY_SRC, '只是前缀，以 `…` 收尾', '§0c and says the line name is a prefix, so a reader knows why pasting it failed')
  has(QUALITY_SRC, '粘进正文的是它，不是行名', '§0d the instruction is unambiguous about WHICH string goes into the prose')
  has(TOOLS_SRC, 'const KIND_ALIAS = {', '§0e the short addresses live in one table')
  has(TOOLS_SRC, "debate: 'debate-unanimous'", '§0f "debate" is an address for the contract form')
  has(TOOLS_SRC, 'warrantKindGiven', '§0g the receipt keeps the word the caller typed')
  has(TOOLS_SRC, 'warrantKindAliased', '§0h and says whether it was rewritten')
  has(TOOLS_SRC, 'the short words debate/ballot/lean/literature_reference are only ways to say them',
    '§0i the contract/address distinction is stated where the caller reads it')
})

function stubView(over = {}) {
  const rows = {
    'rec-part': { id: 'rec-part', track: 'paper', kind: 'paper-part', fingerprint: 'fpp',
      body: JSON.stringify({ member: 'r-1', evidence: ['rec-2'], methods: 'x' }) },
    'rec-2': { id: 'rec-2', track: 'propositions', kind: 'proposition', fingerprint: 'fp2', body: '- statement：某结论' },
  }
  const get = (arg) => {
    const id = typeof arg === 'string' ? arg : String((arg && (arg.id || arg.cardId)) || '')
    const row = rows[id]
    if (!row) throw Object.assign(new Error('unknown ' + id), { code: 'VMU_NO_SUCH_OBJECT' })
    return row
  }
  return Object.assign({
    records: { get, list: () => ({ items: Object.values(rows) }) },
    verified: () => ({ items: [{
      id: 'rec-9', cardId: 'p-9', fingerprint: 'fp9',
      title: '已验证｜a long conclusion name that stops at the ceiling because of Sum_{k=1}^{n} k(k+1) = n(n+1)(2n+1)/6 …',
      statement: '任意 n 个正整数的平方和等于 n(n+1)(2n+1)/6',
    }] }),
    subproblems: () => ({ items: [] }),
  }, over)
}

test('RUN 186 §1 — the refusal quotes the string the gate accepts, not the truncated one it just showed', async () => {
  const q = await import(pathToFileURL(QUALITY).href)
  const out = q.checkQuality({
    md: '正文没有这条结论',
    state: { status: 'awaiting-editor', parts: { 'r-1': { recordId: 'rec-part', round: 1 } } },
    view: stubView(),
  })
  ok(out && out.ok === false, '§1a the deliverable is refused', out && out.code)
  ok(out.code === 'VMU_PACK_V5R_CORE_PAPER_VERIFIED_MISSING', '§1b for the missing conclusion', out.code)
  has(out.message, '完整陈述', '§1c the message marks the paste-able string')
  has(out.message, '任意 n 个正整数的平方和等于 n(n+1)(2n+1)/6', '§1d and quotes it in full')
  has(out.message, '只是前缀，以 `…` 收尾', '§1e it explains why the line name is not the answer')
  hasNot(out.message, '可直接粘进正文的标题行', '§1f the old instruction (paste the title line) is gone')
  ok(Array.isArray(out.missing) && out.missing[0] && out.missing[0].requiredLineTruncated === true,
    '§1g the structured field still reports the truncation', out.missing && out.missing[0])
  ok(out.missing[0].requiredLineFull === '任意 n 个正整数的平方和等于 n(n+1)(2n+1)/6',
    '§1h and carries the full statement for machine readers', out.missing[0] && out.missing[0].requiredLineFull)
})

function boots(entry) {
  return async function boot(root, settings = {}) {
    const state = { specs: [] }
    const ctx = {
      effect(fn) { return fn() },
      on() { return () => {} },
      tools: { async register(spec) { state.specs.push(spec); return () => {} } },
    }
    const handle = await entry.apply(ctx, Object.assign({ clock: () => 1000, packs: ['v5r'], root }, settings))
    await handle.ready()
    await handle.kernel.store.open()
    const specOf = (name) => state.specs.filter((s) => s && s.name === name)[0] || null
    const call = async (name, args, exec) => {
      const spec = specOf(name)
      ok(!!spec, 'tool declared: ' + name)
      let raw = null
      try { raw = await spec.execute(args || {}, exec) } catch (e) {
        raw = { ok: false, code: e && e.code, message: e && e.message, hint: e && e.hint }
      }
      return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
    }
    return { handle, K: handle.kernel, specOf, call, state }
  }
}

test('RUN 186 §2 — a short warrant word is an address, and the receipt says it was one', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run186-'))
  try {
    const entry = await import(pathToFileURL(ENTRY).href)
    const b = await boots(entry)(dir, {})
    for (const h of [
      { id: 'r-acad', slot: 'chair', institution: 'math' },
      { id: 'r-1', slot: 'member', institution: 'math' },
      { id: 'r-2', slot: 'member', institution: 'math' },
    ]) {
      try { await b.K.members.hire(h) } catch (e) { ok(false, 'hire ' + h.id, String(e && e.message)) }
    }

    const ballot186 = seedVotingBallot(b.K, 'ballot-r186')
    const card = await b.call('vibe_v5_record_proposition', {
      statement: '任意奇数的平方都是 8 的倍数加 1', value: 1, motive: 'RUN 186 别名',
      p: 1, member: 'r-1', debate_ruling: { mode: 'unanimous', value: 1, ballotId: ballot186 },
    })
    ok(card && card.ok !== false && typeof card.recordId === 'string', '§2a a settled card exists', card)

    const promoted = await b.call('vibe_v5_verified_promote', {
      card: card.recordId, member: 'r-1', warrant: ballot186, warrant_kind: 'debate',
      debate_ruling: { mode: 'unanimous', value: 1, ballotId: ballot186 },
    })
    ok(promoted && promoted.ok === true, '§2b the short word "debate" promotes (it is an address, not a typo)', promoted)
    ok(promoted.warrant && promoted.warrant.kind === 'debate-unanimous',
      '§2c the row records the CONTRACT form', promoted && promoted.warrant)
    ok(promoted.warrantKindGiven === 'debate', '§2d the receipt keeps the word that was typed', promoted.warrantKindGiven)
    ok(promoted.warrantKindAliased === true, '§2e and marks it as rewritten', promoted.warrantKindAliased)
    has(promoted.warrantKindMeans, 'debate-unanimous', '§2f the receipt names the canonical form it was resolved to')

    const canonical = await b.call('vibe_v5_verified_promote', {
      card: card.recordId, member: 'r-1', warrant: ballot186, warrant_kind: 'debate-unanimous',
      debate_ruling: { mode: 'unanimous', value: 1, ballotId: ballot186 },
    })
    ok(canonical && canonical.ok === true, '§2g the contract word still works', canonical && canonical.code)
    ok(canonical.warrantKindAliased === false, '§2h and is not reported as an alias', canonical.warrantKindAliased)
    ok(canonical.warrantKindGiven === 'debate-unanimous', '§2i given == canonical, unchanged', canonical.warrantKindGiven)

    const wrong = await b.call('vibe_v5_verified_promote', {
      card: card.recordId, member: 'r-1', warrant: ballot186, warrant_kind: 'guesswork',
      debate_ruling: { mode: 'unanimous', value: 1, ballotId: ballot186 },
    })
    ok(wrong && wrong.ok === false && wrong.code === 'VMU_INVALID_ARGUMENT',
      '§2j a word that is neither contract nor address is still refused', wrong && wrong.code)
    has(wrong.message, 'not one of the admitted conclusion forms', '§2k the refusal names the problem, not the caller')
    has(wrong.hint, 'debate-unanimous, lean-conformance, literature', '§2l and lists the contract forms')
  } finally {
    try { await rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})
