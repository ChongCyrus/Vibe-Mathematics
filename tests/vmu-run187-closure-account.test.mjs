// RUN 187 (RUN 185's follow-up accounting): THE FROZEN ACCOUNT NEEDED A DOOR.
//
// RUN 185 writes one durable row per close and the close RECEIPT names it. A reader who arrives later — another
// member, another kernel, the next session — had only that receipt, which is gone by the time they ask. The row was
// findable only by knowing its title convention. This face is the door: the LATEST as-of-close account, its id, its
// numbers, and (deliberately) no pass-word when the ledger has never frozen anything.
//
// The new detail is a SEPARATE value rather than more fields on `detail:"closure"`, because that face has a measured
// size contract (the harness reads it in one line) and growing it would quietly break the readability guarantee.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const ENTRY = join(ROOT, 'vibe-math-vmu', 'vibe-math-vmu.js')
const KERNEL = readFileSync(join(ROOT, 'vibe-math-vmu', 'kernel', 'index.js'), 'utf8')
const HOST = readFileSync(join(ROOT, 'vibe-math-vmu', 'host.js'), 'utf8')

const ok = (cond, msg, extra) => assert.ok(cond, msg + (extra === undefined ? '' : '\n' + JSON.stringify(extra, null, 2)))
const has = (hay, needle, msg) => ok(String(hay).includes(needle), msg + ' — missing: ' + needle)

test('RUN 187 §0 — the account has a gate on the kernel and its own status detail', () => {
  has(KERNEL, 'closureFreezeView({ meeting = null, track = \'state\' } = {})',
    '§0a the kernel answers "which frozen account exists"')
  has(KERNEL, "tags.includes('closure-freeze')", '§0b it reads the rows by the tag the writer set, not by parsing every body')
  has(KERNEL, 'this ledger holds NO as-of-close account', '§0c an empty ledger says so, and does not imply the vote was fine')
  has(HOST, "'closure-account'", '§0d the face is its own detail value')
  has(HOST, 'asOfClose', '§0e the receipt names the field')
  ok(!HOST.includes("closureVote: cv, frozenAtClose"), '§0f the live face was NOT grown (its size contract stays)')
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

test('RUN 187 §1 — the latest frozen account is readable after the receipt is gone, and a later vote cannot edit it', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'vmu-run187-'))
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

    // before any close: the door must answer "nothing was frozen", not "fine"
    const empty = await b.call('vibe_vmu_status', { detail: 'closure-account' })
    ok(empty && empty.ok === true, '§1a the face answers on an empty ledger', empty && empty.code)
    ok(empty.asOfClose && empty.asOfClose.count === 0 && empty.asOfClose.latest === null,
      '§1b with zero accounts and a null pointer', empty.asOfClose && { count: empty.asOfClose.count, latest: empty.asOfClose.latest })
    has(empty.asOfClose.means, 'NO as-of-close account', '§1c and a sentence that does not read as a pass')

    const opened = await b.call('vibe_v5_meeting', { type: 'ordinary', member: 'r-acad', agenda: 'RUN 187 账目' })
    const mid = opened && typeof opened.meeting === 'string' ? opened.meeting : (opened.id || null)
    ok(!!mid, '§1d a meeting was convened', opened)
    await b.call('vibe_vmu_vote', { member: 'r-acad', solved: true })
    await b.call('vibe_vmu_vote', { member: 'r-1', solved: true })
    await b.call('vibe_vmu_vote', { member: 'r-2', solved: true })
    const closed = await b.call('vibe_vmu_meeting', { action: 'close', id: mid, actor: 'r-acad', reason: 'RUN 187 账目' })
    const frozen = closed && closed.closureVoteFrozen
    ok(frozen && frozen.ok === true, '§1e the close froze the reading', frozen)

    const read = await b.call('vibe_vmu_status', { detail: 'closure-account' })
    const acct = read && read.asOfClose
    ok(acct && acct.count === 1, '§1f the door finds exactly one account', acct && acct.count)
    ok(acct.latest && acct.latest.recordId === frozen.recordId,
      '§1g ★ the pointer is the row the close named — no searching by title', acct && acct.latest)
    ok(acct.latest.votesCast === 3 && acct.latest.cast === true, '§1h with the numbers at close', acct.latest)
    ok(acct.latest.where === mid, '§1i and the meeting it belongs to', acct.latest && acct.latest.where)

    // the vote run 32 measured: cast AFTER the close. The live reading moves; the account must not.
    await b.call('vibe_vmu_vote', { member: 'r-2', solved: false })
    const after = await b.call('vibe_vmu_status', { detail: 'closure-account' })
    ok(after.asOfClose.latest.recordId === acct.latest.recordId && after.asOfClose.latest.votesCast === 3
      && after.asOfClose.latest.cast === true,
    '§1j ★ the account still says three and unanimously solved — history is not editable',
    after.asOfClose.latest)

    const live = await b.call('vibe_vmu_status', { detail: 'closure' })
    ok(live && live.closureVote && live.closureVote.cast === false,
      '§1k while the LIVE reading reflects the later dissent (two questions, two faces)', live && live.closureVote)

    // scoping by meeting must not return another meeting's account
    const other = await b.call('vibe_v5_meeting', { type: 'ordinary', member: 'r-acad', agenda: 'RUN 187 另一场' })
    const mid2 = other && typeof other.meeting === 'string' ? other.meeting : null
    const scoped = b.K.closureFreezeView({ meeting: mid2 })
    ok(scoped && scoped.count === 0 && scoped.latest === null, '§1l a meeting that never closed has no account', scoped && scoped.count)
  } finally {
    try { await rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})
