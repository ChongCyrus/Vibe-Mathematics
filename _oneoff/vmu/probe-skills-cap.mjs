// Probe: does retire() free the per-member cap? (Integrator diagnostic for tests/vmu-skills.test.mjs:133)
import { createSkills } from '../../vibe-math-vmu/kernel/skills.js'

let t = 0
const c = () => t
const s = createSkills({ clock: c, settings: { 'vmu.skills.maxSkillsPerMember': 3 } })
const d = (skill) => {
  try { return s.declare({ memberId: 'm1', skill, level: 'novice', evidence: ['e'] }) } catch (e) { return { err: e.code, msg: e.message } }
}
console.log('declare a:', JSON.stringify(d('a')))
console.log('declare b:', JSON.stringify(d('b')))
console.log('declare c:', JSON.stringify(d('c')))
console.log('declare d (expect refusal):', JSON.stringify(d('d')))
console.log('--- status before retire:', JSON.stringify(s.status()))
let ret
try { ret = s.retire({ memberId: 'm1', skill: 'a' }) } catch (e) { ret = { err: e.code, msg: e.message } }
console.log('retire a:', JSON.stringify(ret))
console.log('--- status after retire:', JSON.stringify(s.status()))
console.log('declare d after retire (expect ok):', JSON.stringify(d('d')))
console.log('level a (expect known:false):', JSON.stringify(s.level({ memberId: 'm1', skill: 'a' })))
