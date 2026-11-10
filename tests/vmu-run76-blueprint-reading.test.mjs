// RUN 76 / TB-2712 — THE BLUEPRINT LIVE READING: TWO NAMED ABSENCES, ONE KERNEL PARSER, ONE REAL PRODUCTION FACE.
//
// THE DEFECT THIS SUITE PINS (run 76, measured): every turn of a real institute reported
//   liveReadings.blueprint = { value: null, why: "records.mdParse 没有注入", at: null, atSource: null }
// although the records service had mdParse all along. The orchestrator is handed `facesFrom(...)`, and that map binds
// only the operations STATUS_BOARD_READ_OPS declares (`vmu.records: ['list','get']`), so the md parser never reached
// the only production call site. Two separate lies shared one sentence: "nobody proposed a blueprint yet" and "the
// parser is not reachable" were indistinguishable, and the member never saw a [蓝图] line.
//
// WHAT THIS PIN REQUIRES, in the order a reader needs them:
//   §1 an EMPTY institute names `no-current-blueprint` (not a parser story) and says it has no content time;
//   §2 a RESTRICTED face (list/get only, i.e. the run-76 production shape) still parses a real blueprint row with the
//      kernel's own md parser - the reading does not depend on an external mdParse injection;
//   §3 the REAL kernel face carries mdParse/mdDigest, so turn.status().liveReadings and the assembled [蓝图] line
//      agree, and the draft-file predicates answer (the production path, not just a direct call);
//   §4 a row whose body holds no fields names `md-parser-unavailable` - the second absence, said out loud;
//   §5 `at`/`atSource` are the ROW's time (two different kernel clocks ⇒ two different at), never a constant.
//
// The three reverse lamps are run outside this file (the taskbook's §3.3): fallback removed ⇒ §2/§3 red; the two
// why codes collapsed ⇒ §1/§4 red; `at` pinned to a constant ⇒ §5 red.
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(HERE)
const ENTRY = join(REPO, 'vibe-math-vmu', 'vibe-math-vmu.js')
const TURN_MOD = join(REPO, 'vibe-math-vmu', 'kernel', 'turn', 'index.js')
const KERNEL_MOD = join(REPO, 'vibe-math-vmu', 'kernel', 'index.js')
const DOCS03 = join(REPO, 'vibe-math-vmu', 'docs', '03-interface-contract.md')

let passed = 0
let failed = 0
const ok = (cond, msg, extra) => {
  if (cond) { passed += 1; console.log('  ok ' + msg) }
  else { failed += 1; console.log('  FAIL ' + msg + (extra === undefined ? '' : '\n    ' + JSON.stringify(extra))) }
}
const sha = (s) => createHash('sha256').update(String(s), 'utf8').digest('hex')
const roots = []
const readText = async (p) => (await import('node:fs')).readFileSync(p, 'utf8')

const entry = await import(pathToFileURL(ENTRY).href)
const turnMod = await import(pathToFileURL(TURN_MOD).href)
const { liveStatusReadings, renderLiveStatus } = turnMod

const boot = async (clockMs = 1000) => {
  const root = mkdtempSync(join(tmpdir(), 'vmu-r76bp-'))
  roots.push(root)
  const specs = []
  const ctx = { effect: (fn) => fn(), on: () => () => {}, tools: { register: async (s) => { specs.push(s); return () => {} } } }
  const handle = entry.apply(ctx, { clock: () => clockMs, packs: ['v5r'], root, deliverMode: 'caller' })
  await handle.ready()
  await handle.kernel.store.open()
  const call = async (name, args = {}) => {
    const spec = specs.filter((s) => s && s.name === name)[0] || null
    if (!spec) throw Object.assign(new Error('no such face ' + name), { code: 'NO_SUCH_FACE' })
    const raw = await spec.execute(args, { kernel: handle.kernel })
    return raw && typeof raw === 'object' ? raw : JSON.parse(String(raw))
  }
  return { root, handle, K: handle.kernel, call }
}

// RUN 255 fs-first: the draft file is written through the kernel md door, then the same mdPath is proposed. This is
// the shape a member produces, and it makes the row body the md body the reader must parse.
const seedBlueprint = async (K, call) => {
  const started = await call('vibe_v5_start', { problem: 'blueprint live reading' })
  const bpRel = 'Shared/Drafts/Protocol-r1.md'
  const wrote = K.records.mdWrite({
    path: bpRel, title: 'Protocol', track: 'blueprint', kind: 'blueprint',
    fields: { path: 'VibeMath/Protocol.md', status: 'draft', revision: 1, proposedBy: 'r-acad', proposedAt: '2026-11-09T00:00:00.000Z' },
    text: 'draft body',
  })
  const proposed = await call('vibe_v5_blueprint', { action: 'propose', path: 'VibeMath/Protocol.md', member: 'r-acad', mdPath: bpRel })
  return { started, wrote, proposed, bpRel }
}

console.log('\n§0 the seam, the two names and the fallback are IN THE SOURCE, not only in a receipt')
const turnSrc = await readText(TURN_MOD)
const kernelSrc = await readText(KERNEL_MOD)
const docsSrc = await readText(DOCS03)
for (const [needle, name] of [
  ["'no-current-blueprint'", 'the no-blueprint absence is a machine-readable name'],
  ["'md-parser-unavailable'", 'the parser absence is a DIFFERENT machine-readable name'],
  ['blueprintGap', 'one constructor stamps both the code and the human sentence'],
  ['mdParserSource: blueprintParser.source', 'the reading says WHICH md parser answered'],
  ["import { mdParseText } from '../records.js'", 'the fallback is the framework own parser, not a second implementation'],
]) ok(turnSrc.indexOf(needle) >= 0, name, needle)
// This line used to be pinned as the whole literal `const mdOps = ['mdParse', 'mdDigest', 'mdRead']`. TB-2723 (RUN 77)
// added a FOURTH op to the same array (`beginTurnDelivery`, so a reply row records how its turn was delivered) and the
// whole-line pin went red for a change that never touched the md wiring. The pin is now the fact this suite is about:
// the three md operations are in that array, and the delivery seam is named in the same array so a future reader knows
// it belongs there (it is bound by the same loop, so dropping it silently would take the md ops with it).
const mdOpsLine = (kernelSrc.split('\n').find((l) => l.includes('const mdOps = [')) || '')
ok(['mdParse', 'mdDigest', 'mdRead'].every((op) => mdOpsLine.includes("'" + op + "'")),
  'the production face is GIVEN the md operations', mdOpsLine)
ok(mdOpsLine.includes("'beginTurnDelivery'"),
  'and the same binding loop also carries the turn-delivery seam (TB-2723)', mdOpsLine)
ok(kernelSrc.indexOf("turnFaces['vmu.records'][op] = records[op].bind(records)") >= 0,
  'and they are bound to the same real records instance')
ok(docsSrc.indexOf('TB-2712') >= 0 && docsSrc.indexOf('no-current-blueprint') >= 0 && docsSrc.indexOf('md-parser-unavailable') >= 0,
  'docs/03 names both absences and the production wiring (a contract nobody can read is not a contract)')

console.log('\n§1 EMPTY institute ⇒ the FIRST absence by name, with its missing content time said out loud')
const empty = await boot()
const liveEmpty = liveStatusReadings({ records: empty.K.records })
ok(liveEmpty.blueprint && liveEmpty.blueprint.value === null, 'no blueprint row ⇒ value is null (not an invented sentence)', liveEmpty.blueprint)
ok(liveEmpty.blueprint.why === 'no-current-blueprint', 'the absent reading NAMES the absence (no-current-blueprint)', liveEmpty.blueprint.why)
ok(typeof liveEmpty.blueprint.whyText === 'string' && liveEmpty.blueprint.whyText.trim() !== '', 'and still carries the human sentence for a reader', liveEmpty.blueprint.whyText)
ok(liveEmpty.blueprint.at === null && typeof liveEmpty.blueprint.timeWhy === 'string' && liveEmpty.blueprint.timeWhy.trim() !== '',
  'an absence has NO at and says why (no read clock is borrowed as a content time - RUN 102 byte determinism)', liveEmpty.blueprint)
ok(typeof liveEmpty.blueprint.source === 'string' && liveEmpty.blueprint.source.indexOf('blueprint') >= 0, 'the source names the ledger it looked at')
// ★ TB-2724 / RUN 77 (B): OLD world — a null group printed nothing, so an all-null reading rendered zero lines and the
// `[蓝图]` row simply vanished from the board. That silence is the hole: `why:"no-current-blueprint"` already named the
// cause, so the empty institute must say "no current blueprint", not say nothing. paper/closure stay silent this round.
ok(renderLiveStatus(liveEmpty) === '[蓝图] 无现行版（rev 0，md 未落盘）',
  'an all-null world renders ONE named line — the blueprint absence, not silence', renderLiveStatus(liveEmpty))

console.log('\n§2 RESTRICTED face (list/get only - the run-76 production shape) ⇒ the kernel fallback parser still reads it')
const one = await boot(1000)
const seeded = await seedBlueprint(one.K, one.call)
ok(seeded.proposed.ok === true && seeded.proposed.filed === true, 'the blueprint really exists through the tool face', seeded.proposed && (seeded.proposed.code || seeded.proposed.filed))
const restricted = { list: one.K.records.list.bind(one.K.records), get: one.K.records.get.bind(one.K.records) }
const liveRestricted = liveStatusReadings({ records: restricted })
ok(liveRestricted.blueprint && liveRestricted.blueprint.value !== null, 'a row body is read WITHOUT records.mdParse on the face', liveRestricted.blueprint && liveRestricted.blueprint.value)
ok(liveRestricted.blueprint.value.indexOf('状态 draft') >= 0 && liveRestricted.blueprint.value.indexOf('修订 1') >= 0,
  'the value carries status and revision parsed from the md body', liveRestricted.blueprint.value)
ok(liveRestricted.blueprint.detail && liveRestricted.blueprint.detail.revision === 1 && liveRestricted.blueprint.detail.status === 'draft',
  'the detail is derived (status/revision), not copied from a sentence', liveRestricted.blueprint.detail)
ok(liveRestricted.blueprint.detail && liveRestricted.blueprint.detail.mdParserSource === 'kernel-own-md-parse',
  'and the reading says the FALLBACK parsed it (one vocabulary: the field names the real door)', liveRestricted.blueprint.detail)

console.log('\n§3 PRODUCTION wiring: the real turn face carries mdParse/mdDigest ⇒ status and prompt agree, [蓝图] renders')
const two = await boot(1000)
await seedBlueprint(two.K, two.call)
const opened = two.K.turn.open({ member: 'r-acad', phase: 'normal', roleLabel: '院士', rosterIds: ['r-acad', 'r-1', 'r-2'], round: 1 })
ok(opened && opened.ok === true, 'a real turn opens on the real kernel', opened && opened.code)
const asm = await two.K.turn.assemble(opened.turn)
ok(asm && asm.ok === true && typeof asm.text === 'string', 'the real pipeline assembled a prompt', asm && (asm.code || (asm.text && asm.text.length)))
const st = two.K.turn.status({ roster: ['r-acad', 'r-1', 'r-2'] })
const liveProd = st && st.liveReadings ? st.liveReadings.blueprint : null
ok(liveProd && liveProd.value !== null, 'the production orchestrator now reports a blueprint READING (the run-76 null is gone)', liveProd && liveProd.value)
ok(liveProd && liveProd.detail && liveProd.detail.mdParserSource === 'records.mdParse',
  'through the WIRED face the records parser answers (fallback takes over only when it is absent)', liveProd && liveProd.detail)
ok(liveProd && liveProd.detail.draftMdMissing === false, 'the draft-file predicate answers through mdDigest (the seam carried both doors)', liveProd && liveProd.detail)
ok(asm.text.indexOf('[蓝图]') >= 0, 'the assembled prompt carries the [蓝图] line a member can read')
ok(asm.text.indexOf(String(liveProd.value)) >= 0, 'and it is the SAME value status() reports (one read, no drift)')

console.log('\n§4 a body with no fields ⇒ the SECOND absence by name (parser could not read what is there)')
const three = await boot(1000)
const badRow = three.K.records.put({ track: 'blueprint', kind: 'blueprint', title: 'Bad', body: 'no field lines here, just prose' })
ok(badRow && badRow.id === 'rec-1', 'a malformed blueprint row really exists on the track', badRow && badRow.id)
const liveBad = liveStatusReadings({ records: { list: three.K.records.list.bind(three.K.records), get: three.K.records.get.bind(three.K.records) } })
ok(liveBad.blueprint && liveBad.blueprint.value === null, 'an unreadable body produces NO value (never a fake draft)', liveBad.blueprint)
ok(liveBad.blueprint.why === 'md-parser-unavailable', 'the second absence is NAMED md-parser-unavailable', liveBad.blueprint.why)
ok(typeof liveBad.blueprint.whyText === 'string' && liveBad.blueprint.whyText.indexOf('rec-1') >= 0, 'the sentence names the row it could not read', liveBad.blueprint.whyText)
ok(liveBad.blueprint.why !== 'no-current-blueprint', 'the two absences are NOT one answer (the defect this task removes)')

console.log('\n§5 at/atSource are the ROW time: two kernel clocks ⇒ two different at, never a constant')
const four = await boot(5000)
await seedBlueprint(four.K, four.call)
const liveFive = liveStatusReadings({ records: four.K.records })
const rowFive = four.K.records.list({ track: 'blueprint', limit: 0 }).items.filter((r) => String(r.kind) === 'blueprint')[0]
const expectedAt = new Date(Number(rowFive.updatedAt)).toISOString()
ok(liveFive.blueprint.at === expectedAt, 'at equals the row own updatedAt (content time, not the moment of reading)', { at: liveFive.blueprint.at, expectedAt })
ok(liveFive.blueprint.atSource === 'records 的 updatedAt', 'atSource names where that time came from')
const five = await boot(6000)
await seedBlueprint(five.K, five.call)
const liveSix = liveStatusReadings({ records: five.K.records })
ok(liveSix.blueprint.at !== liveFive.blueprint.at, 'a different kernel clock produces a different at (a hardcoded at cannot pass)', { at5: liveFive.blueprint.at, at6: liveSix.blueprint.at })

console.log('\n=== VMU RUN 76 BLUEPRINT READING: ' + String(passed) + ' passed, ' + String(failed) + ' failed ===')
for (const d of roots) { try { rmSync(d, { recursive: true, force: true }) } catch (e) { /* a temp dir must not fail the suite */ } }
if (failed > 0) process.exitCode = 1
