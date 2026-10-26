#!/usr/bin/env node
// tests/vmu-run34-findings.test.mjs — ROUND 34: four receipts from a live run, three defects and one misreading.
//
// WHY THIS FILE EXISTS. Run 34 (build 891a5bdd) finished green on every machine check and still exposed these:
//
//   ① `vibe_vmu_chat` COULD NOT BE USED AT ALL. `tools/chat.js` declared
//        const need = (v, what) => { if (…) throw … }
//      and every call site passes its RESULT to the kernel (`chat.mute(need(member,'member'), …)`). A validator that
//      validates but does not RETURN hands `undefined` downstream, so the kernel's own refusal («mute needs a member
//      id», hint «pass { member }») was printed for callers who HAD passed one. Measured live: every
//      `{action:"mute", member:"res-02", by:"office"}` returned that message, `status().muted` stayed empty, and the
//      "muted" member spoke anyway (`msg-5`). Every sibling face (`tools/mailbox.js`, `tools/meeting.js`,
//      `tools/minutes.js`, `tools/panel.js`, `tools/task.js`) already ends its `need` with `; return v` — chat was the
//      only one that did not, which is why a "did it throw a named error?" check would have passed.
//
//   ② THE STATUS BOARD COULD NOT SEE THE ROW IT EXISTS TO SHOW. `records.list` sorts by `updatedAt` ASCENDING and then
//      keeps the first `vmu.records.headListAt` (7) rows, so the NEWEST rows — exactly the ones 「当前小任务」 needs —
//      are the ones a full head list drops. Measured: the board printed
//      「该成员（res-02）在 progress 轨上还没有记录（records.list 报 6 条可见表头）」 while `r-14` (owner res-02, track
//      progress, live) was the newest of 7 rows. A kernel-internal reader must ask for the whole track and, if the
//      answer is still truncated, say so instead of reading as "this member wrote nothing".
//
//   ③ THE SEQUENCE RECEIPT NAMED A FIELD THAT DOES NOT EXIST. `sequenceMeans` said «`next` is the id of the meeting
//      that follows» while the value is the declared ROW (`{type,kind,subject}`): an id exists only once a meeting is
//      actually convened. The office read it, looked for an id, and reported a missing field.
//
//   ④ NOT A DEFECT (kept here so nobody re-files it): the board's 「总任务」 disagreed with the pack's default
//      objective because `vibe_v5_start{problem}` OVERWRITES `vmu.turn.objective` (packs/v5r/tools.js:2745). The board
//      printed the CURRENT setting, correctly. The lesson is about reading a value's history, not about the board.
//
// Run:  node tests/vmu-run34-findings.test.mjs        (exit 1 = one of the three defects is back)
import { mkdtemp, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = join(HERE, '..')
const VMU = join(REPO, 'vibe-math-vmu')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + label); return true }
  failed += 1
  failures.push(label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' — ' + JSON.stringify(detail)))
  return false
}
const J = (o) => JSON.stringify(o)

const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
const turnMod = await import(pathToFileURL(join(VMU, 'kernel', 'turn', 'index.js')).href)
const statusBoardReadings = turnMod.statusBoardReadings

const roots = []
const freshRoot = async () => {
  const r = await mkdtemp(join(tmpdir(), 'vmu-run34-findings-'))
  roots.push(r)
  return r
}

const boot = async (config = {}) => {
  const state = { specs: [] }
  const ctx = {
    effect(fn) { return fn() },
    on() { return () => {} },
    tools: { register: async (spec) => { state.specs.push(spec); return () => {} } },
  }
  const handle = entry.apply(ctx, Object.assign({ clock: () => 1000 }, config))
  await handle.ready()
  return { handle, state, kernel: handle.kernel, spec: (n) => state.specs.find((s) => s.name === n) }
}

try {
  // ── ① THE VALIDATOR IS AN ACCESSOR: what it checked must COME BACK ────────────────────────────────────────
  console.log('=== 1. vibe_vmu_chat: every write verb reaches the kernel (need() returns its argument) ===')
  {
    // `vmu.chat.admins: ['office']` is what a deployment would declare to let the office administer chat; the point of
    // this section is NOT the policy but the plumbing, so we give the office the grant and then check that the server
    // received the member id / text at all. (Run 34's failure was upstream of any policy check.)
    const b = await boot({ root: await freshRoot(), packs: ['v5r'], vmu: { 'vmu.chat.admins': ['office'] } })
    const k = b.kernel
    const spec = b.spec('vibe_vmu_chat')
    ok(!!spec, 'the chat face is registered by the real entry', !!spec)
    await k.members.hire({ id: 'r-1', slot: 'member' })
    const call = async (args) => JSON.parse(await spec.execute(args, {}))

    const muted = await call({ action: 'mute', member: 'r-1', by: 'office', durationMs: 60000 })
    ok(muted.ok === true, '★ mute with a member id SUCCEEDS (run 34: «mute needs a member id» for a caller that passed one — the validator returned nothing)', muted)
    const status = k.chat.status()
    const mutedList = J(status.muted || status.Muted || [])
    ok(mutedList.includes('r-1'), '★ the muting actually reached the ledger (a receipt without state would pass a "no throw" check)', { muted: status.muted })

    const sent = await call({ action: 'send', by: 'office', text: '第 34 轮回归：成员 id 与正文都必须真的到达内核' })
    ok(sent.ok === true, '★ send with by+text SUCCEEDS (both arguments were accessors of the same broken `need`)', sent)
    const listed = k.chat.list()
    const msgs = Array.isArray(listed) ? listed : (listed && listed.messages) || []
    ok(msgs.length === 1 && String(msgs[0].from) === 'office' && String(msgs[0].text).includes('第 34 轮回归'),
      '★ the message is IN the ledger, attributed to the caller (the id and the body travelled as values)', { count: msgs.length, first: msgs[0] })

    const refused = await call({ action: 'mute', by: 'office' })
    ok(refused.ok === false && refused.code === 'VMU_INVALID_ARGUMENT',
      'the validator still REFUSES a genuinely missing member (returning the value did not make it permissive)', refused)

    // ★ THE MIRROR: the source must not regress to a validator that only throws. Comment stripping first, so the
    // run-34 history quoted in the file's own comment cannot satisfy this check.
    const src = readFileSync(join(VMU, 'tools', 'chat.js'), 'utf8')
    const codeOnly = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    ok(/const need = \([\s\S]{0,400}?\breturn v\b/.test(codeOnly),
      '★ the `need` helper RETURNS its value (a validator that only throws passes `undefined` downstream — run 34)', { hit: (codeOnly.match(/const need = \([\s\S]{0,200}/) || [])[0] })
  }

  // ── ② THE BOARD MUST SEE THE NEWEST ROW, NOT THE HEAD CAP ─────────────────────────────────────────────────
  console.log('=== 2. status board ④「当前小任务」: the newest progress row is not the one the head cap drops ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'], vmu: { 'vmu.records.headListAt': 2 } })
    const k = b.kernel
    // Three rows by someone else (older), then one by r-2 (newest). With headListAt=2 the newest rows fall outside a
    // default head list — exactly run 34's shape, where the member's own row was the 7th of 7.
    for (const n of [1, 2, 3]) {
      k.records.put({ track: 'progress', kind: 'progress', title: 'r-1 的第 ' + n + ' 条', body: '别人的进度 ' + n, by: 'r-1', bySource: 'argument' })
    }
    const mine = k.records.put({ track: 'progress', kind: 'progress', title: 'r-2 的最新一条', body: '本轮我做了这件事。\n第二行', by: 'r-2', bySource: 'argument' })
    ok(!!mine && !!mine.id, 'the fixture created the member\'s progress row through the real records service', mine)

    const r = statusBoardReadings({ tasks: k.tasks, records: k.records, member: 'r-2' })
    ok(typeof r.current.value === 'string' && r.current.value.includes('r-2 的最新一条'),
      '★ 当前小任务 is the member\'s NEWEST row even when the head list would have cut it (run 34: «还没有记录» for a member who had one)',
      { value: r.current.value, why: r.current.why })
    ok(!String(r.current.why || '').includes('还没有记录'), '★ the board does not claim the member wrote nothing', r.current.why)

    // And the truncation, when it does happen, is NAMED rather than reading as "no records".
    const lying = statusBoardReadings({
      tasks: k.tasks,
      records: { list: () => ({ ok: true, items: [{ id: 'x-1', owner: 'r-9', updatedAt: 1 }], available: 40, truncated: true }) },
      member: 'r-2',
    })
    ok(String(lying.current.why || '').includes('还没有记录') && String(lying.current.why || '').includes('40'),
      '★ a TRUNCATED answer says how many rows the track holds (a count we saw and a count the ledger holds are two claims)',
      { why: lying.current.why })
    // run 44: the reader still had to guess WHOSE rows those were, so the line now names the member's own count.
    ok(String(lying.current.why || '').includes('其中 0 条属于该成员'),
      '★ the same line says how many of the visible rows belong to THIS member (run 44 asked "1 条可见表头" — whose?)',
      { why: lying.current.why })
  }

  // ── ③ THE SEQUENCE RECEIPT MUST NAME WHAT `next` REALLY IS ────────────────────────────────────────────────
  console.log('=== 3. vibe_v5_meeting{sequence}: `next` is the declared ROW, not an id that does not exist yet ===')
  {
    const src = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')
    ok(/`next` is the SEQUENCE ROW/.test(src),
      '★ sequenceMeans says `next` is the SEQUENCE ROW (run 34: it said "the id of the meeting that follows")',
      { hit: (src.match(/`next` is[^`]{0,80}/) || [])[0] })
    ok(!/`next` is the id of the meeting that follows/.test(src),
      '★ the old claim (an id exists at declaration time) is GONE from the source',
      { hit: (src.match(/is the id of the meeting that follows/) || [])[0] })
    ok(/\{type,kind,subject\}/.test(src) && /an id exists only once/.test(src),
      '★ and it explains where the id comes from (the open receipt of that meeting), so a caller knows what to do next',
      { hasRow: /\{type,kind,subject\}/.test(src), hasWhen: /an id exists only once/.test(src) })
  }

  // ── ④ NOT A DEFECT: the objective the board prints is the CURRENT setting, and `vibe_v5_start` overwrites it ──
  console.log('=== 4. 「总任务」 tracks the LIVE setting (the pack overwrites it; the board is not stale) ===')
  {
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    const before = statusBoardReadings({ tasks: k.tasks, records: k.records, member: null, settings: k.settingsSnapshot() })
    ok(typeof before.objective.value === 'string' && before.objective.value.length > 0,
      'the board reads an objective out of the box (the pack declares one)', { value: String(before.objective.value).slice(0, 40) })
    const written = k.setSettingsValue('vmu.turn.objective', '第 34 轮写进来的目标', { by: 'office' })
    ok(written && written.ok !== false, 'the office can overwrite vmu.turn.objective at runtime', written)
    const after = statusBoardReadings({ tasks: k.tasks, records: k.records, member: null, settings: k.settingsSnapshot() })
    ok(String(after.objective.value) === '第 34 轮写进来的目标',
      '★ the board prints the WRITTEN value on the next read (run 34\'s "disagreement" was `vibe_v5_start` overwriting the setting, not a stale board)',
      { value: after.objective.value })
    const packSrc = readFileSync(join(VMU, 'packs', 'v5r', 'tools.js'), 'utf8')
    ok(/applyDeclaredSetting\(kernel, 'vmu\.turn\.objective', str\(args\.problem\)\)/.test(packSrc),
      '★ and the overwrite is the documented act of vibe_v5_start{problem} (so "the board disagrees with the pack default" is expected, not a bug)',
      { hit: (packSrc.match(/applyDeclaredSetting\(kernel, 'vmu\.turn\.objective'[^\n]{0,40}/) || [])[0] })
  }
  // ── ⑤ THE ADMIN LIST MUST NAME SOMETHING THAT CAN EXIST (a seat, not a minted id) ─────────────────────────
  console.log("=== 5. vmu.chat.admins names the CHAIR SEAT, so the rule 「院士为群管理员」 has a mechanism ===")
  {
    // Pack defaults are folded UNDER the caller's settings, so this boot uses the v5r value layer as shipped.
    const b = await boot({ root: await freshRoot(), packs: ['v5r'] })
    const k = b.kernel
    const spec = b.spec('vibe_vmu_chat')
    await k.members.hire({ id: 'r-acad', slot: 'chair' })
    await k.members.hire({ id: 'r-1', slot: 'member' })
    const call = async (args) => JSON.parse(await spec.execute(args, {}))
    const st = k.chat.status()
    ok(J(st.admins || []).includes('chair'),
      '★ the v5r default admin list names the SEAT `chair` (run 34: it named `acad`, an id no roster can hold, so the list was empty in effect)',
      { admins: st.admins })

    const byChair = await call({ action: 'mute', member: 'r-1', by: 'r-acad', durationMs: 60000 })
    ok(byChair.ok === true, "★ the academician CAN administer chat (the rule 「院士为群管理员」 now has a mechanism)", byChair)
    ok(J(k.chat.status().muted || []).includes('r-1'), '★ and the mute is in the ledger', { muted: k.chat.status().muted })

    const byMember = await call({ action: 'mute', member: 'r-1', by: 'r-1', durationMs: 60000 })
    ok(byMember.ok === false && byMember.code === 'VMU_CHAT_NOT_ADMIN',
      'a member (not the chair) is still refused by name — the grant is the SEAT, not everybody', byMember)

    const byOffice = await call({ action: 'mute', member: 'r-1', by: 'office', durationMs: 60000 })
    ok(byOffice.ok === false && byOffice.code === 'VMU_CHAT_NOT_ADMIN' && String(byOffice.hint).includes('vmu.chat.admins'),
      '★ the office is NOT an admin by default, and the refusal names the DECLARATION a deployment would change (policy stays in the key)',
      { code: byOffice.code, hint: byOffice.hint })

    // The seam must stay un-injected, so `enforced` keeps naming the declaration rather than a kernel-private rule.
    // (`status()` does not publish an `adminSeam` field, so the fact is read where it is DECIDED: the kernel's own
    // `createChat` call site must not pass `isAdmin` — an injected predicate would make `adminEnforced()` return [] and
    // the refusal would stop naming `vmu.chat.admins`.)
    const kernelSrc = readFileSync(join(VMU, 'kernel', 'index.js'), 'utf8')
    const chatCall = (kernelSrc.match(/createChat\(\{[\s\S]{0,400}?\}\)/) || [''])[0]
    ok(chatCall !== '' && !/isAdmin/.test(chatCall),
      '★ no `isAdmin` seam is injected at the kernel call site (the policy stays the declared list, so refusals keep naming it)',
      { call: chatCall.slice(0, 160) })
    const seatSrc = readFileSync(join(VMU, 'kernel', 'chat.js'), 'utf8')
    ok(/seatOf/.test(seatSrc) && /admins\.has\(String\(slot\)\)/.test(seatSrc),
      '★ the resolution is a SEAT lookup against the same declared list (not a second list, not a hardcoded `chair`)',
      { hasSeatOf: /seatOf/.test(seatSrc) })
  }
} finally {
  for (const r of roots) { try { await rm(r, { recursive: true, force: true }) } catch { /* best effort */ } }
}

console.log('')
if (failed === 0) console.log('=== VMU RUN 34 FINDINGS: ' + passed + ' passed, 0 failed ===')
else { console.log('=== VMU RUN 34 FINDINGS: ' + passed + ' passed, ' + failed + ' failed ==='); for (const f of failures) console.log('  FAILED: ' + f) }
process.exit(failed === 0 ? 0 : 1)
