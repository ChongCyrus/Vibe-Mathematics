// Second half of the round-6 fix: actually IMPORT external pack hook modules, name failures, expose the receipt.
import { readFileSync, writeFileSync } from 'node:fs'

const P = 'vibe-math-vmu/vibe-math-vmu.js'
let s = readFileSync(P, 'utf8')
if (s.includes('importExternalPackContribution')) { console.log('already applied'); process.exit(0) }
const NL = String.fromCharCode(10)

// 1) fix the candidate root field name (c.root, not c.dir) in the hooks probe
const BAD = "        const rootReal = realPathOrNull(c.dir === undefined ? dirname(dirname(c.real)) : c.dir)"
if (!s.includes(BAD)) throw new Error('root field anchor missing')
s = s.replace(BAD, "        const rootReal = realPathOrNull(c.root)")

// 2) the import helper, right after registerPackContribution
const HELPER_ANCHOR = '  const packContributionsRegistered = []'
if (!s.includes(HELPER_ANCHOR)) throw new Error('helper anchor missing')
const HELPER = [
  '  // ★ ROUND-6 GAP 3: an EXTERNAL (config.packDirs) pack keeps its code in its own folder. The entry imports',
  '  // `<packDir>/<id>/index.js` and collects its PACK_CONTRIBUTION exactly like a shipped pack; every outcome is NAMED.',
  '  const importExternalPackContribution = async (requestId) => {',
  '    const file = externalHooksByRequestId.get(requestId)',
  '    if (!file) return { attempted: false, found: false }',
  '    let mod = null',
  '    try { mod = await import(pathToFileURL(file).href) } catch (e) {',
  '      const failure = { id: requestId, file, code: (e && e.code) || \'VMU_PACK_CONTRIBUTION_IMPORT_FAILED\', message: String((e && e.message) || e) }',
  '      packDataErrors.push(failure)',
  '      return { attempted: true, found: true, registered: false, ...failure }',
  '    }',
  '    const reg = registerPackContribution(requestId, mod)',
  '    const row = { id: requestId, file, registered: reg.registered === true, why: reg.why || null }',
  '    if (!reg.registered) packDataErrors.push({ id: requestId, file, code: \'VMU_PACK_CONTRIBUTION_ABSENT\', message: \'the external pack has an index.js but exports no PACK_CONTRIBUTION: its DATA applies, its HOOKS do not\' })',
  '    return { attempted: true, found: true, ...row }',
  '  }',
  '  const externalHooksLoads = []',
  '  const packContributionsRegistered = []',
].join(NL)
s = s.replace(HELPER_ANCHOR, HELPER)

// 3) in the async pack loop's data-only branch, import external hooks and treat external data as an applied data-only pack
const BRANCH = '            if (loaded === null && inlineManifest === null) {'
if (!s.includes(BRANCH)) throw new Error('data-only branch anchor missing')
const BRANCH_NEW = [
  '            if (loaded === null && inlineManifest === null) {',
  '              // ★ ROUND-6 GAP 3: an external pack\'s HOOKS are imported from ITS folder (not from the shipped packs/).',
  '              // The outcome (registered / absent / import failed) is appended to externalHooksLoads AND packDataErrors.',
  '              if (externalHooksByRequestId.has(wanted)) {',
  '                const loadedHooks = await importExternalPackContribution(wanted)',
  '                externalHooksLoads.push(loadedHooks)',
  '                const externalDataRow = runtimePackData.find((d) => d.requestId === wanted && d.external)',
  '                if (externalDataRow) { appliedPacks.push({ id: wanted, applied: [], dataOnly: true, external: true, carries: { runtime: true }, hooks: { found: true, registered: loadedHooks.registered === true, file: loadedHooks.file } }); continue }',
  '              } else {',
  '                const externalDataRow = runtimePackData.find((d) => d.requestId === wanted && d.external)',
  '                if (externalDataRow) { appliedPacks.push({ id: wanted, applied: [], dataOnly: true, external: true, carries: { runtime: true }, hooks: { found: false } }); continue }',
  '              }',
].join(NL)
s = s.replace(BRANCH, BRANCH_NEW)

// 4) expose the external-hooks receipt on packRuntime()
const RECEIPT = "      contributions: packContributionsRegistered.slice(),"
if (!s.includes(RECEIPT)) throw new Error('receipt anchor missing')
s = s.replace(RECEIPT, RECEIPT + NL + "      externalHooks: externalHooksLoads.map((h) => Object.assign({}, h))," + NL + "      externalHookCandidates: [...externalHooksByRequestId.entries()].map(([id, file]) => ({ id, file })),")

writeFileSync(P, s)
console.log('external hooks wired')
