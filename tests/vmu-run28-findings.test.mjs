// LIVE RUN 28's own acceptance report named four defects whose common shape is a promise with no field, or a face
// that cannot express what the rule says. This gate pins the fixes:
//   item 9  `vibe_v5_message` had NO sender parameter, so `from` was always "office" and a member-to-member message
//           could not be expressed — the receipt now carries `from` (the voice) AND `relayedBy` (who wrote it).
//   item 5  the ask face's DESCRIPTION promised `askedWhy says why`, and the receipt never carried the field.
//   item 3  `op:"reply"` is called 「首选」 in its description, but under activation/one-shot delivery there is never a
//           pending turn, so the refusal must name WHICH delivery path makes it permanent.
//   item 8  after two real turns the member-tool faces still read `session=(none learned yet)` while the STEP RECEIPT
//           carried `childSessionId` — the map must be fed from the receipt that already holds the answer.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0
const failed = []
const ok = (cond, name, detail) => {
  if (cond) { passed += 1; console.log('  ok   ' + name) } else { failed.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) }
}

const read = (rel) => readFileSync(REPO + '/' + rel, 'utf8')

// ── item 9: the mail face can carry a member's voice, and says who actually relayed it ────────────────────────────
const { V5R_PACK_TOOLS } = await import('../vibe-math-vmu/packs/v5r/tools.js')
const specOf = (name) => V5R_PACK_TOOLS.find((s) => s && s.name === name)
const msgSpec = specOf('vibe_v5_message')
const props = msgSpec && msgSpec.parameters ? Object.keys(msgSpec.parameters).sort() : []
ok(props.includes('member'), '★ R46a: the mail face DECLARES a sender parameter (without it a member-to-member message cannot exist)', props)
ok(/SENDER/.test(String(msgSpec.description)) && /relayedBy/.test(String(msgSpec.description)),
  '★ R46b: and its description names the split — `member` is the VOICE, `relayedBy` is who actually wrote it',
  String(msgSpec.description).slice(0, 120))

const stub = () => {
  const k = { members: { roster: () => [{ id: 'r-1', slot: 'member', state: 'live' }, { id: 'r-2', slot: 'member', state: 'live' }] }, _sent: null }
  k.mailbox = { send: (from, payload) => { k._sent = { from, payload }; return { ok: true, ids: ['m1'] } } }
  return k
}
const kA = stub()
const asMember = await msgSpec.handler({ to: 'r-2', content: 'probe', member: 'r-1' }, { kernel: kA })
ok(kA._sent && kA._sent.from === 'r-1', '★★ R46c: a named member is the SENDER the mailbox sees (the rule "members can message each other" becomes expressible)', kA._sent && kA._sent.from)
ok(asMember.from === 'r-1' && asMember.relayedBy === 'office',
  '★★ R46d: and the receipt names BOTH sides — `from:"r-1"` is the voice, `relayedBy:"office"` is who wrote it',
  { from: asMember.from, relayedBy: asMember.relayedBy })
ok(typeof asMember.fromMeans === 'string' && /OFFICE relayed it/.test(asMember.fromMeans),
  '★ R46e: with the reason spelled out, so nobody reads the receipt as "the member typed this"', asMember.fromMeans)
const kB = stub()
const asOffice = await msgSpec.handler({ to: 'r-2', content: 'probe' }, { kernel: kB })
ok(kB._sent.from === 'office' && asOffice.relayedBy === 'office' && /OFFICE itself is speaking/.test(String(asOffice.fromMeans)),
  '★ R46f: the REVERSE direction — no `member` means the office itself speaks, and the receipt says so', { from: kB._sent.from, fromMeans: asOffice.fromMeans })

// ── item 5: the ask face owes `askedWhy` because its own description promises it ──────────────────────────────────
const askSrc = read('vibe-math-vmu/packs/v5r/tools.js')
const askSpec = specOf('vibe_v5_verdict_ask')
const askDesc = String(askSpec && askSpec.description)
ok(/`askedWhy` says why/.test(askDesc), '★ R46g: the description still PROMISES `askedWhy` (the premise of the next assertion)', askDesc.slice(0, 90))
ok(/\n\s*askedWhy:/.test(askSrc), '★★ R46h: the receipt now CARRIES it — a promised field that does not exist is a described mechanism that is not there')
ok(/the population is the UNION of the meeting roster/.test(askSrc),
  '★ R46i: and its wording separates the RULE (a union) from what each side contributed (an empty speech record no longer reads as "speech")',
  askSrc.match(/askedWhy:[\s\S]{0,120}/)?.[0])

// ── item 3: the "preferred" channel must name WHY it is unreachable ──────────────────────────────────────────────
const turnSrc = read('vibe-math-vmu/kernel/turn/index.js')
ok(/CHANNEL: `op:"reply"` answers an AWAITING prompt/.test(turnSrc) && /permanently unreachable/.test(turnSrc),
  '★★ R46j: the no-pending-member refusal names the CHANNEL and that retrying cannot work on this delivery path',
  turnSrc.match(/CHANNEL:[\s\S]{0,140}/)?.[0])
ok(/REACHABLE INSTEAD/.test(turnSrc), '★ R46k: and it names the channel that IS reachable (the member\'s own turn), so the refusal is actionable', null)

// ── item 8: the child session is learned from the receipt that already reports it ────────────────────────────────
ok(/memberSessions\.set\(spec\.member, memberCallsReading\.childSessionId\)/.test(turnSrc),
  '★★ R46l: the member→child-session map is fed from the STEP RECEIPT\'s own `childSessionId` (run 28: the receipt had it and three member-tool faces still read "none learned yet")', null)
const hostSrc = read('vibe-math-vmu/host.js')
ok(/memberSession/.test(hostSrc), '★ R46m: and the face that was lying reads that map (so the learning lands where the reading was)', null)

console.log(`\n=== VMU RUN 28 FINDINGS: ${passed} passed, ${failed.length} failed ===`)
if (failed.length) { console.log('FAILURES:'); for (const f of failed) console.log('  - ' + f); process.exit(1) }
