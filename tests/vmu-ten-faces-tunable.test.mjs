// tests/vmu-ten-faces-tunable.test.mjs — the dimension objective 5 names that nobody had checked: 可调控参数. Every face must have
// at least one settings key that tunes it, read from SETTING_DEFS with its real field name (the entry shape was read, not guessed).
import { SETTING_DEFS } from '../vibe-math-vmu/settings/schema.js'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

console.log('=== THE SCHEMA PUBLISHES TUNABLE KEYS ===')
ok(Array.isArray(SETTING_DEFS), 'the setting definitions are enumerable as a list')
const defs = Array.isArray(SETTING_DEFS) ? SETTING_DEFS : []
ok(defs.length > 500, 'and there are many of them, so a face without one would be conspicuous rather than typical', { n: defs.length })
const keys = defs.map((d) => d && d.key).filter(Boolean)
ok(defs.length > 0 && keys.length === defs.length, 'every definition carries its key, so the count cannot hide malformed entries - and the list is non-empty, so the comparison cannot pass as zero against zero', { keys: keys.length, defs: defs.length })
const dotted = keys.filter((k) => /^vmu\.[a-z][a-z0-9]*\.[A-Za-z0-9_.]+$/.test(k))
ok(dotted.length === keys.length, 'and every key is a dotted vmu path, which is what a deployment sets', { bad: keys.filter((k) => !/^vmu\./.test(k)).slice(0, 5) })

console.log('=== EVERY ONE OF THE TEN FACES IS TUNABLE ===')
const FACES = [
  ['(a) 数学研究', /math|lean|formal|proof|cache/],
  ['(b) 形式化', /formal|lean|axiom|sorry|proof/],
  ['(c) 计算与工具', /tool|sandbox|compute|cache|limit|job/],
  ['(d) 代理通信与会议', /meeting|conference|ballot|agenda|message|notify|inbox/],
  ['(e) 代理间协作', /collab|agreement|delegat|bidding|contract/],
  ['(f) 工作流', /task|workflow|board|budget|idempot|retention/],
  ['(g) 控制流', /clock|turn|phase|pause|control|rate/],
  ['(h) 文件归档', /archive|custody|store|capacity|migrat|trash/],
  ['(i) 评审与出版', /review|publish|audit|ip|funding|grade/],
  ['(j) 代理自组织', /topolog|charter|recruit|ship|member|role|trust|identity/],
]
const counts = {}
// FACES is a literal list of ten, and its length is asserted, so this loop cannot be an empty run.
ok(FACES.length === 10, 'all ten faces are listed, so the loop below cannot pass by covering a subset', { n: FACES.length })
FACES.forEach(([face, re]) => {
  const hits = keys.filter((k) => re.test(k))
  counts[face] = hits.length
  ok(hits.length > 0,
    face + ' has adjustable parameters (' + hits.length + ' keys) - a face you cannot tune is a face you cannot fit to your own institution',
    { sample: hits.slice(0, 3) })
})
console.log('  counts: ' + JSON.stringify(counts))
ok(Object.values(counts).every((n) => n > 0), 'and none of the ten is left without one', counts)

console.log('=== TEN FACES TUNABLE: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
