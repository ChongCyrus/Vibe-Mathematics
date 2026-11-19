import { mkdtemp } from 'node:fs/promises'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { REPO } from './_lib/repo-root.mjs'

const VMU = join(REPO, 'vibe-math-vmu')
let passed = 0
const failures = []
const ok = (cond, name, detail) => { if (cond) { passed += 1; console.log('  ok ' + name) } else { failures.push(name); console.log('  FAIL ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))) } }

const B = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'blueprint.js')).href)
const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
const root = await mkdtemp(join(tmpdir(), 'vmu-bpf-'))
const specs = []
const ctx = { effect: (fn) => fn(), on: () => () => {}, tools: { register: async (s) => { specs.push(s); return () => {} } } }
const handle = entry.apply(ctx, { root, packs: ['v5r'], clock: () => Date.parse('2020-01-01T00:00:00.000Z') })
await handle.ready()
const kernel = handle.kernel
await kernel.members.hire({ id: 'acad', slot: 'chair' })
await kernel.members.hire({ id: 'r-1', slot: 'member' })
const T0 = Date.parse('2020-01-01T00:00:00.000Z')
const PATH = 'Shared/Fields.md'
const shape = () => ({
  evaluationNow: '当前评价：主干清楚，细节不足。',
  initialPlan: { plan: '先建立骨架', inspiration: '来自问题分解', initialTargets: '完成第一阶段' },
  relatedPlans: ['补充引理 A 的计划'],
  feasibility: { assessment: '可行', reasons: '已有两条路径' },
  value: { assessment: '高', reasons: '决定后两阶段' },
  findings: [{ kind: '命题', note: '需要一条引理' }],
  obstacles: [{ what: '缺关键引理', why: '尚未证明' }],
  obstacleSolutions: [{ obstacleRef: 'o1', plan: '先证引理' }],
  implementation: { status: '进行中', effects: '已缩短一步', lessons: '先列依赖' },
  pastExperience: ['上一轮先写骨架更有效'],
})
const node = (id, extra = {}) => Object.assign({ id, title: '路线 ' + id, depth: 1, fields: shape(), fieldsSchema: B.BLUEPRINT_FIELDS_SCHEMA }, extra)
const call = async (args) => { try { return { ok: true, parsed: JSON.parse(await specs.find((s) => s.name === 'vibe_v5_blueprint').execute(args)) } } catch (e) { return { ok: false, e, code: e && e.code } } }

console.log('=== 1. THE SCHEMA IS PACK-DECLARED ===')
ok(B.BLUEPRINT_FIELDS_SCHEMA === 'vmu.blueprint.fields@1' && Array.isArray(B.BLUEPRINT_REQUIRED_FIELDS) && B.BLUEPRINT_REQUIRED_FIELDS.length === 10,
  'the pack declares TEN named fields and the schema version', B.BLUEPRINT_REQUIRED_FIELDS.map((f) => f.key))
ok(B.BLUEPRINT_REQUIRED_FIELDS.every((f) => typeof f.cn === 'string' && f.cn.length > 0),
  'every field carries its Chinese label from the rule text', B.BLUEPRINT_REQUIRED_FIELDS.map((f) => f.cn))

console.log('=== 2. MISSING FIELDS REFUSED BY NAME ===')
{
  const partial = node('o1', { fields: { evaluationNow: 'only one' } })
  let err = null
  try { B.proposeBlueprint({ records: kernel.records, path: PATH, text: 'strict', by: 'r-1', seat: 'member', at: T0, materialize: true, fieldsSchema: B.BLUEPRINT_FIELDS_SCHEMA, outline: [partial] }) } catch (e) { err = e }
  ok(err && err.code === 'VMU_BLUEPRINT_FIELDS_MISSING' && err.detail && Array.isArray(err.detail.missing) && err.detail.missing.length === 9,
    'a 1/10-field node is REFUSED by name with detail.missing', err && { code: err.code, missing: err.detail && err.detail.missing })
  ok(err && err.detail && Array.isArray(err.detail.missingCn) && err.detail.missingCn.length === 9 && err.detail.missingCn.every((s) => /[\u4e00-\u9fff]/.test(s)),
    'the refusal carries Chinese labels for every missing field', err && err.detail && err.detail.missingCn)
  ok(err && /fields/.test(String(err.hint)) && err.detail && typeof err.detail.shape === 'string' && /evaluationNow/.test(err.detail.shape),
    'the hint prints the legal shape', err && String(err.hint).slice(0, 60))
}

console.log('=== 3. FULL FIELDS OK; READ FACE; LEGACY HONEST ===')
{
  const full = B.proposeBlueprint({ records: kernel.records, path: PATH, text: 'strict full', by: 'r-1', seat: 'member', at: T0, materialize: true, fieldsSchema: B.BLUEPRINT_FIELDS_SCHEMA, outline: [node('o1'), node('o2')] })
  ok(full && full.ok === true && typeof full.id === 'string', 'fixture: complete proposal writes', full && full.id)
  const st = await call({ action: 'read', id: full.id })
  const rows = st.parsed && Array.isArray(st.parsed.outline) ? st.parsed.outline : []
  ok(st.ok && rows.length === 2 && rows.every((r) => r.fieldsComplete === true && r.fields && Object.keys(r.fields).length === 10),
    'view: outline[].fields carries TEN fields and fieldsComplete:true', { rows: rows.length, keys: rows[0] && Object.keys(rows[0].fields || {}).length })
  ok(st.parsed.outlineFieldsComplete === true && Array.isArray(st.parsed.outlineFieldsMissing) && st.parsed.outlineFieldsMissing.length === 0,
    'read face aggregates fieldsComplete/fieldsMissing', st.parsed && { c: st.parsed.outlineFieldsComplete, m: st.parsed.outlineFieldsMissing })
  // Legacy row: write a full record, then REWRITE its outline header to the OLD shape (no fields), exactly like a row
  // written before TB-2795. Read faces must report fields:null / fieldsComplete:false — never a fake complete.
  const legacyFull = B.proposeBlueprint({ records: kernel.records, path: 'Shared/Legacy.md', text: 'legacy', by: 'r-1', seat: 'member', at: T0, materialize: true, outline: [node('l1')] })
  const lrowRaw = kernel.records.get({ id: legacyFull.id })
  const legacyBody = String(lrowRaw && lrowRaw.body || '').split(String.fromCharCode(10)).map((line) => line.startsWith('- outline：') ? '- outline：' + JSON.stringify([{ id: 'l1', title: 'old', depth: 1 }]) : line).join(String.fromCharCode(10))
  kernel.records.put({ id: legacyFull.id, track: 'blueprint', title: lrowRaw.title, body: legacyBody, by: 'test' })
  const lst = await call({ action: 'read', id: legacyFull.id })
  const lrow = lst.parsed && Array.isArray(lst.parsed.outline) ? lst.parsed.outline[0] : null
  ok(legacyFull.ok === true && lrow && lrow.fields === null && lrow.fieldsComplete === false && Array.isArray(lrow.fieldsMissing) && lrow.fieldsMissing.length === 10,
    'legacy node: fields:null + fieldsComplete:false + 10 missing (compat, not fake complete)', lrow && { f: lrow.fields, c: lrow.fieldsComplete, n: lrow.fieldsMissing && lrow.fieldsMissing.length })
}

console.log('=== 4. LAMP: deleting validation accepts missing fields ===')
{
  const dir = await mkdtemp(join(tmpdir(), 'vmu-bpf-lamp-'))
  cpSync(VMU, join(dir, 'vibe-math-vmu'), { recursive: true })
  const file = join(dir, 'vibe-math-vmu', 'packs', 'v5r', 'blueprint.js')
  const src = readFileSync(file, 'utf8')
  const marker = '    if (bad.length > 0) {'
  ok(src.includes(marker), 'lamp-setup: validation branch locatable')
  writeFileSync(file, src.replace(marker, '    if (false && bad.length > 0) {'), 'utf8')
  const lamp = await import(pathToFileURL(file).href + '?lamp=' + Date.now())
  let lampErr = null
  try { lamp.proposeBlueprint({ records: kernel.records, path: 'Shared/Lamp.md', text: 'lamp', by: 'r-1', seat: 'member', at: T0, materialize: true, fieldsSchema: B.BLUEPRINT_FIELDS_SCHEMA, outline: [node('o1', { fields: { evaluationNow: 'only one' } })] }) } catch (e) { lampErr = e }
  ok(lampErr === null, 'LAMP RED-worthy: without validation a 1/10-field node is ACCEPTED', lampErr && lampErr.code)
}

console.log('=== VMU BLUEPRINT FIELDS: ' + passed + ' passed, ' + failures.length + ' failed ===')
if (failures.length) { console.log('FAILURES:'); for (const f of failures) console.log('  - ' + f) }
process.exit(failures.length ? 1 : 0)
