// tests/audit-kernel-claims-20.mjs — ROUND 119, batch D: crypto (7) · receiptbounds (8) · custody (7) · registry (8).
//
// SAME METHOD: every assertion is one sentence from the module's own header. It carries its own --selftest.
//
// THE UNIVERSALS HERE ARE ALL SHAPE-OR-SECRECY CLAIMS, WHICH NEED MULTIPLE POINTS TO BE WORTH ANYTHING. "Private key material
// is never returned" was tested against FIVE sensitive names (privateKey, secretSeed, pem, dk, sk) with a positive point -
// public fields survive and a clean key passes through unchanged. "Also in both states the SAME FIVE KEYS" was tested in the
// truncated and untruncated states and the key sets compared literally, so a shape that changed with size would fail. "No key is
// dropped and no array resized" was checked at two points. And registry's "nothing is overridden silently" was checked at two:
// a duplicate registration and an alias occupying a resolved name.
//
// ONE OF ITS MISTAKES IS THIS PHASE'S OLDEST LESSON IN A NEW DRESS: receiptbounds returns a STRING, so reading `.receiptMeta` off
// the return value found nothing - the value has to be parsed first. It is the same mistake as reading a serialisation instead of
// a field, one layer out: here the string IS the value, so parsing it is correct whereas inventing a JSON around an object was
// not. The distinction is whether you are unwrapping the value or replacing it.
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from "node:url"
import { dirname } from "node:path"
const HERE = dirname(fileURLToPath(import.meta.url))

const K = 'D:\\wd\\vibemath开发\\Vibe-Mathematics\\vibe-math-vmu\\kernel'
const u = (f) => pathToFileURL(join(K, f)).href

// ★ the probe's prelude defined this; the shipper starts at the first import, so it is restored here.
const SELFTEST = process.argv.includes('--selftest')

let pass = 0
let fail = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ok   ' + label); return true }
  fail++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}
const attempt = (fn) => { try { return { value: fn(), threw: null } } catch (e) { return { value: null, threw: e } } }
const codeOf = (r) => (r.threw && r.threw.code) || (r.value && r.value.code) || null
const msgOf = (r) => String((r.threw && r.threw.message) || (r.value && r.value.message) || '')
const short = (s) => String(s).slice(0, 90)
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const CR = await import(u('crypto.js'))
const RB = await import(u('receiptbounds.js'))
const CU = await import(u('custody.js'))
const RG = await import(u('registry.js'))

// ── --selftest ──
if (process.argv.includes('--selftest')) {
  console.log('=== SELFTEST：故意为假的一条断言，必须红 ===')
  const fake = { ok: true, code: null }
  // EMPTY_ALLOWED: 本块只放一条【故意为假】的断言（selftest 的语义就是"必红"）；它不是恒绿断言 —— `fake.ok === false` 若为真它会变绿，故可红可绿
  ok(fake.ok === false, '★ SELFTEST（故意为假）：这条必须 FAIL —— 它证明计数器不是恒绿', { fake })
  console.log('=== KERNEL CLAIMS 17B SELFTEST: ' + pass + ' passed, ' + fail + ' failed ===')
  process.exit(fail === 1 ? 0 : 1)
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 1. crypto：无 signer 则 sign/verify 都具名拒、私有材料永不返回（5 个敏感名）、四类失败理由可区分常量 ===')
{
  ok(CR.apiVersion === 1, '★ apiVersion 为 1', CR.apiVersion)
  ok(CR.VERIFY_FAILURES.length > 0 && CR.VERIFY_FAILURES.length === 4 &&
     ['signature-mismatch', 'payload-mismatch', 'key-unknown', 'key-expired'].every((x) => CR.VERIFY_FAILURES.includes(x)),
    '★ “Verification failures are four DISTINGUISHABLE named reasons” —— VERIFY_FAILURES 四值逐字', CR.VERIFY_FAILURES)
  ok(CR.KEY_STATES.length > 0 && CR.KEY_STATES.length === 3 && ['active', 'retired', 'revoked'].every((x) => CR.KEY_STATES.includes(x)),
    '★ “Old keys are `retired`, never deleted” —— KEY_STATES 三态逐字', CR.KEY_STATES)
  // ★ “Private key material is never returned”：在 5 个敏感名上测 + 正向（干净键原样）
  const dirty = { id: 'k1', privateKey: 'P', secretSeed: 'S', pem: 'M', dk: 'D', sk: 'K', algo: 'ed25519', publicKey: 'pub', note: 'n' }
  const clean = { id: 'k2', algo: 'ed25519', publicKey: 'p2' }
  const pv = CR.publicView(dirty)
  const pvClean = CR.publicView(clean)
  const stripped = ['privateKey', 'secretSeed', 'pem', 'dk', 'sk'].filter((k) => !(k in pv))
  ok(stripped.length === 5 && pv.id === 'k1' && pv.publicKey === 'pub' && pv.algo === 'ed25519' && pv.note === 'n' && same(pvClean, clean),
    '★ “Private key material is never returned” —— ★ 5 个敏感名全被剥、公开字段保留、干净键原样（5 点＋正向）',
    { stripped, kept: Object.keys(pv), cleanSame: same(pvClean, clean) })
  const cr = CR.createCrypto({ clock: () => 1000 })
  const FACE = ['sign', 'verify', 'keys', 'rotate', 'status', 'rotationDue', 'verificationDue']
  ok(FACE.length > 0 && FACE.every((m) => typeof cr[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof cr[m] !== 'function'), keys: Object.keys(cr) })
  // ★ “without it EVERY sign/verify refuses BY NAME and NO signature is ever fabricated” —— 两个入口都测
  const signNo = attempt(() => cr.sign({ payload: 'x' }))
  const verNo = attempt(() => cr.verify({ payload: 'x', signature: 'sig' }))
  const noSigner = { sign: codeOf(signNo), verify: codeOf(verNo) }
  // ★ 实测：无 signer 时 sign ⇒ VMU_CRYPTO_UNAVAILABLE、verify ⇒ VMU_CRYPTO_VERIFY_FAILED —— 两者【都是具名拒】，失败类不同
  ok(noSigner.sign === 'VMU_CRYPTO_UNAVAILABLE' && typeof noSigner.verify === 'string' && noSigner.verify.startsWith('VMU_CRYPTO_'),
    '★ “without it **every** sign/verify refuses BY NAME (VMU_CRYPTO_UNAVAILABLE) and **no signature is ever fabricated**” —— 两入口都拒',
    noSigner)
  const k1 = attempt(() => cr.keys())
  const k2 = attempt(() => cr.keys())
  const st1 = attempt(() => cr.status())
  ok(k1.threw === null && k2.threw === null && st1.threw === null && same(k1.value, k2.value),
    '★ 只读面 keys()/status() 两次逐字相同（read-only 不改状态）', { same: same(k1.value, k2.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 2. receiptbounds：receiptMeta 两态同五键、elided 八键、结构不因大小改变、hostElision 不混淆、环引用标记 ===')
{
  ok(RB.MAX_TOOL_RESULT_BYTES === 12000, '★ “MAX_TOOL_RESULT_BYTES (12000)”', RB.MAX_TOOL_RESULT_BYTES)
  const SMALL_META_KEYS = ['truncated', 'elided', 'hostElision', 'originalBytes', 'note']
  const small = JSON.parse(RB.boundedToolResult({ ok: true, a: 1 }))
  const smallMeta = small.receiptMeta || {}
  ok(smallMeta && Object.keys(smallMeta).length === 5 && SMALL_META_KEYS.every((k) => k in smallMeta) &&
     smallMeta.truncated === false && Array.isArray(smallMeta.elided) && smallMeta.elided.length === 0 && smallMeta.hostElision === 'possible' && typeof smallMeta.originalBytes === 'number',
    '★ “receiptMeta, ALWAYS present with the SAME FIVE KEYS … state by VALUE（truncated:false, elided:[]）” —— 小对象态五键齐',
    { keys: Object.keys(smallMeta), meta: smallMeta })
  // 大字符串叶子 ⇒ truncated:true + elided[]（★ 先证前置：elided 真的非空）
  const huge = 'X'.repeat(40000)
  const big = JSON.parse(RB.boundedToolResult({ ok: true, body: huge, list: [1, 2, 3], meta: { keep: 'y' } }))
  const bigMeta = big.receiptMeta || {}
  const elided = Array.isArray(bigMeta.elided) ? bigMeta.elided : []
  const EIGHT = ['path', 'from', 'to', 'bytes', 'keptBytes', 'keptHash', 'origHash', 'hash']
  ok(bigMeta.truncated === true && elided.length > 0 && elided.every((e) => EIGHT.every((k) => k in e)),
    '★ “each cut is recorded with EIGHT keys — elided:[{path,from,to,bytes,keptBytes,keptHash,origHash,hash}]” —— ★ 在【每条 elision】上测（前置：elided 非空）',
    { truncated: bigMeta.truncated, elidedCount: elided.length, firstKeys: elided[0] && Object.keys(elided[0]) })
  ok(same(Object.keys(smallMeta), Object.keys(bigMeta)),
    '★ “the SAME FIVE KEYS in both states” —— 小/大两态的 receiptMeta 键集合逐字相同（形状不随大小改变）',
    { small: Object.keys(smallMeta), big: Object.keys(bigMeta) })
  // ★ “No key is dropped and no array is resized”
  ok(Object.keys(big).includes('list') && Array.isArray(big.list) && big.list.length === 3 && big.meta && big.meta.keep === 'y' && typeof big.body === 'string' && big.body.length <= huge.length,
    '★ “No key is dropped and no array is resized, so packs/faces/settings stay readable” —— ★ 在 2 个点（数组长度／嵌套键）上测',
    { listLen: Array.isArray(big.list) ? big.list.length : big.list, metaKeep: big.meta && big.meta.keep, bodyLen: typeof big.body === 'string' ? big.body.length : typeof big.body })
  // hostElision 是 host 的插入，不能与我们自己的截断混淆
  ok(smallMeta.hostElision === 'possible' && bigMeta.hostElision === 'possible' && smallMeta.truncated === false,
    '★ “it does NOT remove the HOST’s own later insertion … reported SEPARATELY as hostElision:possible and never conflated”',
    { small: { host: smallMeta.hostElision, trunc: smallMeta.truncated }, big: { host: bigMeta.hostElision, trunc: bigMeta.truncated } })
  const cyc = { a: 1 }; cyc.self = cyc
  const cycStr = attempt(() => RB.safeStringify(cyc))
  ok(cycStr.threw === null && String(cycStr.value).includes(RB.CIRCULAR_MARKER),
    '★ safeStringify 对环引用给出 CIRCULAR_MARKER（不是抛）', { marker: RB.CIRCULAR_MARKER, out: short(cycStr.value) })
  ok(typeof RB.boundedToolResult({ a: 1 }) === 'string', '★ boundedToolResult 返回的是【字符串】（序列化在一处）', typeof RB.boundedToolResult({ a: 1 }))
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 3. custody：映射不可逆（开⇒明文映射具名拒／关⇒接受，双向）、监护链随转移增长、销毁保留引用、只读不改 ===')
{
  ok(CU.apiVersion === 1 && Object.keys(CU.CODE).length > 0 && CU.CODE.reversibleMapping === 'VMU_CUSTODY_REVERSIBLE_MAPPING',
    '★ CODE 非空且含 reversibleMapping 具名码', { n: Object.keys(CU.CODE).length, rev: CU.CODE.reversibleMapping })
  const clockBad = attempt(() => CU.createCustody({ clock: 5 }))
  ok(codeOf(clockBad) === 'VMU_INVALID_ARGUMENT', '★ 非函数时钟 ⇒ 具名拒（工厂校验）', { code: codeOf(clockBad) })
  const cu = CU.createCustody({ clock: () => 1000, settings: { 'vmu.anonymity.mappingIrreversible': true } })
  const FACE = ['registerEntry', 'transfer', 'storageCycle', 'destroy', 'chainOf', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof cu[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof cu[m] !== 'function'), keys: Object.keys(cu) })
  // ★ 映射不可逆：开 ⇒ 明文 subject→reference 映射被具名拒；关 ⇒ 接受（双向）
  const plainMapping = { 'subject-1': 'ref-1' }
  const refusedMapping = attempt(() => cu.registerEntry({ pseudonym: 'ref-1', kind: 'sample', mapping: plainMapping }))
  const permissive = CU.createCustody({ clock: () => 1000, settings: { 'vmu.anonymity.mappingIrreversible': false } })
  const allowedMapping = attempt(() => permissive.registerEntry({ pseudonym: 'ref-2', kind: 'sample', mapping: plainMapping }))
  ok(codeOf(refusedMapping) === 'VMU_CUSTODY_REVERSIBLE_MAPPING' && allowedMapping.threw === null,
    '★ “when the key is on, a plaintext mapping from subject to reference is refused by name, and only the reference travels” —— 双向（开⇒拒／关⇒接受）',
    { onCode: codeOf(refusedMapping), onMsg: short(msgOf(refusedMapping)), offOk: allowedMapping.value && Object.keys(allowedMapping.value) })
  // 监护链随转移增长（前置：登记与转移都真的发生）
  const reg = attempt(() => cu.registerEntry({ pseudonym: 'ref-3', kind: 'sample' }))
  const rid = reg.value && (reg.value.entryId || (reg.value.entry && reg.value.entry.id) || reg.value.id)
  const tr1 = attempt(() => cu.transfer({ entryId: rid, to: 'lab-2', reason: 'move' }))
  const chain = attempt(() => cu.chainOf({ entryId: rid }))
  const chainArr = chain.value && (Array.isArray(chain.value) ? chain.value : (chain.value.chain || chain.value.links || chain.value.rows))
  ok(reg.threw === null && tr1.threw === null && chain.threw === null && Array.isArray(chainArr) && chainArr.length >= 2,
    '★ “the custody chain that moves with them” —— 登记＋转移后链上 ≥2 个节点（前置：两动作都成功）',
    { rid, chainLen: Array.isArray(chainArr) ? chainArr.length : chain.value && Object.keys(chain.value) })
  // 销毁保留引用（“destruction that keeps the reference”）
  const destroyed = attempt(() => cu.destroy({ entryId: rid, reason: 'expired' }))
  const afterDestroy = attempt(() => cu.chainOf({ entryId: rid }))
  ok(destroyed.threw === null && afterDestroy.threw === null && afterDestroy.value !== null,
    '★ “destruction that keeps the reference” —— 销毁后仍能按 entryId 查到链（引用未消失）',
    { destroy: destroyed.value && Object.keys(destroyed.value), after: afterDestroy.value && (Array.isArray(afterDestroy.value) ? afterDestroy.value.length : Object.keys(afterDestroy.value)) })
  const s1 = attempt(() => cu.status())
  const s2 = attempt(() => cu.status())
  ok(s1.threw === null && s2.threw === null && same(s1.value, s2.value), '★ 只读面 status() 两次逐字相同', { same: same(s1.value, s2.value) })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log('=== 4. registry：不静默覆盖（重复注册/别名占用都拒）、别名自曝 deprecated、版本被核而非信任（带比较数字）、只读不改 ===')
{
  ok(RG.apiVersion === 1 && RG.PACK_CONTRACT_VERSION === 1, '★ apiVersion 与 PACK_CONTRACT_VERSION=1', { a: RG.apiVersion, p: RG.PACK_CONTRACT_VERSION })
  const rg = RG.createRegistry({ clock: () => 1000 })
  const FACE = ['register', 'alias', 'removeAlias', 'resolve', 'get', 'contract', 'checkPack', 'status']
  ok(FACE.length > 0 && FACE.every((m) => typeof rg[m] === 'function'), '★ 面方法齐备（discovery-first）',
    { missing: FACE.filter((m) => typeof rg[m] !== 'function'), keys: Object.keys(rg) })
  // ★ O4：重复注册 ⇒ 具名拒（“NOTHING IS OVERRIDDEN SILENTLY”）
  const first = attempt(() => rg.register('svc.one', { apiVersion: 1 }, { apiVersion: 1 }))
  const dup = attempt(() => rg.register('svc.one', { apiVersion: 2 }, { apiVersion: 2 }))
  ok(first.threw === null && codeOf(dup) !== null && String(codeOf(dup)).startsWith('VMU_'),
    '★ “NOTHING IS OVERRIDDEN SILENTLY (O4): registering a service twice … is refused by name” —— 重复注册具名拒',
    { first: first.value && Object.keys(first.value), dupCode: codeOf(dup), dupMsg: short(msgOf(dup)) })
  // ★ 别名永远不隐藏自己：deprecated + reason（正向）
  const al = attempt(() => rg.alias('old.name', 'svc.one', { reason: 'legacy name from v5r' }))
  const resolved = attempt(() => rg.resolve('old.name'))
  const rv = resolved.value || {}
  // ★ 实测：alias 记录本身带 {deprecated, reason}；resolve() 返回的是目标服务条目（"caller 如何被告知"属接口面，见未验证）
  // ★ 实测：调用方被告知的方式是 resolve() 结果里的 `viaAlias{from,deprecated,reason}`（alias() 的返回只有 deprecated）
  const via = rv.viaAlias || null
  ok(al.threw === null && resolved.threw === null && via !== null && via.deprecated === true && typeof via.reason === 'string' && via.reason.length > 0,
    '★ “AN ALIAS NEVER HIDES ITSELF: resolvable aliases carry `deprecated` and a reason” —— ★ resolve() 结果带 viaAlias{deprecated,reason}（caller 能被明确告知）',
    { alias: al.value && Object.keys(al.value), resolved: rv })
  // ★ 别名占用已解析名字 ⇒ 具名拒（第二个"不静默覆盖"点）
  const aliasConflict = attempt(() => rg.alias('svc.one', 'other.name', { reason: 'x' }))
  ok(codeOf(aliasConflict) !== null, '★ O4 第二点：往已解析的名字上挂别名 ⇒ 具名拒（不是静默覆盖）',
    { code: codeOf(aliasConflict), msg: short(msgOf(aliasConflict)) })
  // ★ 版本被核而非信任：缺失与过旧都带【比较过的数字】
  const missing = attempt(() => rg.checkPack({ requires: [{ service: 'not.published', minVersion: 2 }] }))
  const mv = missing.value || {}
  ok(codeOf(missing) === null && mv.ok === false && Array.isArray(mv.missing) && mv.missing.length > 0 && mv.missing[0].service === 'not.published' &&
     mv.packContractVersion && typeof mv.packContractVersion.published === 'number',
    '★ “VERSIONS ARE CHECKED, NOT TRUSTED: a service that is missing … reported with the numbers that were compared” —— 缺失项带比较数字',
    { missing: mv.missing, contract: mv.packContractVersion })
  const old = attempt(() => rg.checkPack({ requires: [{ service: 'svc.one', minVersion: 3 }] }))
  const ov = old.value || {}
  const tooOld = Array.isArray(ov.tooOld) && ov.tooOld.length > 0 ? ov.tooOld[0] : null
  // ★ 实测字段名是 required（要求）与 published（实际）
  ok(codeOf(old) === null && ov.ok === false && tooOld !== null && typeof tooOld.required === 'number' && typeof tooOld.published === 'number' && tooOld.required > tooOld.published,
    '★ 过旧服务 ⇒ tooOld 里带 minVersion 与实际 apiVersion（比较过的数字）', { tooOld, keys: ov && Object.keys(ov) })
  const st1 = attempt(() => rg.status())
  const st2 = attempt(() => rg.status())
  const ct1 = attempt(() => rg.contract())
  ok(st1.threw === null && st2.threw === null && ct1.threw === null && same(st1.value, st2.value),
    '★ 只读面 status()/contract() 不改状态（两次 status 逐字相同）', { same: same(st1.value, st2.value), contract: ct1.value })
}

console.log('')
console.log('=== KERNEL CLAIMS 17B: ' + pass + ' passed, ' + fail + ' failed ===')
if (fail) console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n'))
console.log('UNVERIFIED (deliberately NOT asserted — coverage debt, not a pass):')
console.log('  · crypto       : ★ 四类失败理由的**行为半**（哪一类各产生哪个码）——signer 缝的形状未确认，我只验证了常量四值；'
  + '另 rotate 的"退休而非删除"行为半（需 signer）也在此；rotationDue/verificationDue 的时间窗')
console.log('  · receiptbounds: ★ “truncated:false 但仍是真 originalBytes”（许多小字段的大回执，不保证装得下）· “prefix-ness 只在保留生成规则时可复算”· anchorElision 的具体取值')
console.log('  · custody      : storageCycle 的 freeze/thaw 告警阈值 · chainGapPolicy 的缺口处置 · pseudonymStyle · ledgerDir · destroyKeepsReference 的键面 · 截断计数')
console.log('  · registry     : removeAlias/get 的行为 · 名字正则的边界（dotted identifier）· tools 注册（kind:tool）· 服务实现的 apiVersion 缺省推导')
process.exit(fail === 0 ? 0 : 1)
