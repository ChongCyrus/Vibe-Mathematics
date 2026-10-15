// tests/vmu-panel-falsify.test.mjs — FAMILY 3 of the falsify routine: `kernel/panel.js` (the running sub-task field is
// really written and its state vocabulary is really enforced). Run: node tests/vmu-panel-falsify.test.mjs
//
// Same recipe (see `docs/acceptance/activity-round5-report.md`). The panel face is where D-08 baseline B lives: the
// `subtasks` field is the ONE field the v5r line did not have, so "it is really written, and an unknown state is
// refused by name" is exactly the kind of claim that must be shown able to fail.
import { falsifyFamily, formatFamilyReport } from './_lib/falsify.mjs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const PANEL = join(HERE, '..', 'vibe-math-vmu', 'kernel', 'panel.js')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

/**
 * THE PROBE. Two invariants, each with its control direction:
 *   · WRITTEN — a `subtasks` write lands in the row, in the board row, and in the append-only history;
 *   · NORMALISED — a plain string becomes `{title, state:'running'}` (so the "written" reading is about the field,
 *     not about the caller's shape);
 *   · VOCABULARY — an unknown state is refused BY NAME (so a typo cannot silently become a running task).
 */
async function panelProbe(mod) {
  const mk = () => mod.createPanel({ clock: () => 1000, log: () => {}, settings: {}, bus: null, members: null })
  const p = mk()
  const write = await p.set('m1', { overall: 'solve it', subtasks: [{ title: 'run the experiment', state: 'running' }] }, { by: 'm1' })
  const view = p.get('m1')
  const board = p.board()
  const historyEntries = p.history('m1').entries.length
  let badState = null
  try { await p.set('m1', { subtasks: [{ title: 'x', state: 'nonsense' }] }, { by: 'm1' }) } catch (e) { badState = (e && e.code) || String((e && e.message) || e) }
  const p2 = mk()
  await p2.set('m2', { subtasks: 'plain string task' }, { by: 'm2' })
  const stringSub = p2.get('m2').subtasks
  return {
    wroteSubtasks: view.subtasks.length, firstState: view.subtasks[0] && view.subtasks[0].state,
    boardRunning: board.length ? board[0].running : null, changed: write.changed.join(','), historyEntries, badState,
    stringCount: stringSub.length, stringState: stringSub[0] && stringSub[0].state,
  }
}

const family = await falsifyFamily({
  name: 'panel — the running sub-task field is written, and its vocabulary is enforced',
  cases: [{
    name: 'panel.js',
    module: PANEL,
    probe: panelProbe,
    mutations: [
      { label: 'subtasks field dropped on write', name: 'panel-drop',
        find: '          next.subtasks = val\n', replace: '          next.subtasks = []   // MUTANT: the write is dropped\n' },
      { label: 'subtask state vocabulary not enforced', name: 'panel-vocab',
        find: 'if (!PANEL_SUBTASK_STATES.includes(state)) {', replace: 'if (false) {   // MUTANT: any state is accepted' },
    ],
  }],
})

console.log('=== CONTROL GROUP: the unmutated module writes the field and enforces the vocabulary ===')
ok(family.cases[0].real.wroteSubtasks === 1 && family.cases[0].real.firstState === 'running' && family.cases[0].real.boardRunning === 1,
  '★ the sub-task is written to the row AND visible as running on the board', family.cases[0].real)
ok(family.cases[0].real.changed === 'overall,subtasks' && family.cases[0].real.historyEntries === 2,
  'and the append-only history records both changed fields', { changed: family.cases[0].real.changed, history: family.cases[0].real.historyEntries })
ok(family.cases[0].real.badState === 'VMU_INVALID_ARGUMENT',
  '★ an unknown sub-task state is refused BY NAME (a typo cannot become a running task)', family.cases[0].real.badState)
ok(family.cases[0].real.stringCount === 1 && family.cases[0].real.stringState === 'running',
  'and a plain string is normalised to {state:"running"} (control direction)', family.cases[0].real)

console.log('=== FALSIFICATION: drop the field or the vocabulary and the SAME probe goes red ===')
ok(family.ok, '★ both panel mutations are caught (control green + each mutant red)', formatFamilyReport(family))
const byLabel = (needle) => family.results.find((r) => r.label.includes(needle))
const dropRed = byLabel('subtasks field dropped') && byLabel('subtasks field dropped').red
const vocabRed = byLabel('subtask state vocabulary') && byLabel('subtask state vocabulary').red
ok(!!dropRed && dropRed.wroteSubtasks === 0 && dropRed.boardRunning === 0,
  '★ "field dropped": the running sub-task disappears from both the row and the board', dropRed)
ok(!!vocabRed && vocabRed.badState === null && vocabRed.wroteSubtasks === 1,
  '★ "vocabulary not enforced": an unknown state is ACCEPTED and lands in the row', vocabRed)
ok(family.results.length > 0 && family.results.every((r) => r.applied && r.importable && r.falsified),
  'and every mutation applied to a unique anchor, imported, and produced a DIFFERENT reading (non-vacuous: the family really ran mutations)', family.results.map((r) => ({ label: r.label, applied: r.applied, importable: r.importable })))
ok(family.cases[0].leftovers.length === 0, 'the mutated copies were written to D:\\_tmp and deleted again', family.cases[0].leftovers)

console.log('')
console.log('=== VMU PANEL FALSIFY: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')) }
process.exitCode = failed === 0 ? 0 : 1
