// dsh-vibe-math merged bundle installer — VERSIONED AUTO-UPDATE.
// When this bundle is installed (e.g. `dsh plugin --profile <name> add dsh-vibe-math`, or from the
// dsh-market), this plugin copies ALL FOUR agent presets out of the package into
// the DSH preset root, so the user immediately gets four presets in the picker:
//   vibe-math-v2/  (probability-driven architecture)
//   vibe-math-v3/  (THIRD-generation: paper-style Markdown knowledge base +
//                   planner-agent scheduling + universal theory/method library)
//   vibe-math-v4/  (FOURTH-generation: persistent self-organizing resident
//                   subagents — message bus / meetings / unanimous-consensus
//                   verification / per-resident libraries)
//   vibe-math-v5/  (FIFTH-generation: research institute — academician who
//                   assigns work, permanent researchers who vote, temp workers,
//                   group chat + meetings + m-vote consensus)
//
// (vibe-math-v1 — the classic pipeline — was removed at v2.0.0; this bundle now
//  ships v2/v3/v4/v5.)
//
// UPDATE POLICY (state recorded in <presetRoot>/.vibe-math-installed.json):
//   - FORCE-REPLACE ON VERSION CHANGE. When the recorded version differs from this package's
//     version — or there is no record at all (an install made by an older installer) — every
//     managed file is overwritten with the shipped bytes. This is deliberately NOT conditional on
//     the file being unmodified. Two reasons:
//       · a preset assembled from two different versions (the old policy updated a file's
//         neighbours and kept the file the user had touched) is exactly the state that fails to
//         mount or misbehaves subtly, and the user has no way to see that from the outside;
//       · editing a shipped preset in place is not the supported way to customize one — DSH
//         provides a real one (copy the preset: the picker's copy action, or a new directory
//         under <presetRoot>), which leaves the managed set updatable.
//   - Nothing is destroyed silently: before a file whose bytes are not what the installer last
//     wrote is REPLACED — or DELETED along with a preset this bundle no longer ships — the user's
//     copy is kept under <presetRoot>/.vibe-math-backup/<fromVersion>/<preset>/<file> and named in
//     the log. A file that still matches the hash recorded for it is a copy of the package, so
//     removing it destroys nothing and needs no backup.
//   - Files are written ATOMICALLY: a uniquely named temp file is written and then renamed over the
//     destination, so an interrupted boot (a kill, a full disk, two sessions writing at once) can
//     never leave a half-written preset for the next same-version run to mistake for a user edit.
//   - same version: no-op (idempotent) — restarting DSH never rewrites a preset file, never churns
//     the preset's generation stamp and never rewrites this state file (it is written only when its
//     content actually changes). Missing files are ALWAYS restored, at any version.
//   - force a full refresh at any time: delete the preset dirs and restart DSH.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'vibe-math-preset-installer'

// Exported so the shipped policy suite can prove the managed list still covers what each preset
// needs at runtime (a file present in the preset directory but missing here is copied by nobody,
// and the installed preset then cannot mount).
export const PRESETS = [
  {
    src: 'vibe-math-v2',
    dst: 'vibe-math-v2',
    files: ['agent.cordis.yml', 'preset.yml', 'vibe-math-v2.js', '实现方案.md'],
  },
  {
    src: 'vibe-math-v3',
    dst: 'vibe-math-v3',
    files: ['agent.cordis.yml', 'preset.yml', 'vibe-math-v3.js', '实现方案.md'],
  },
  {
    src: 'vibe-math-v4',
    dst: 'vibe-math-v4',
    files: ['agent.cordis.yml', 'preset.yml', 'vibe-math-v4.js', '实现方案.md'],
  },
  {
    src: 'vibe-math-v5',
    dst: 'vibe-math-v5',
    // 架构图.md belongs here for the same reason 实现方案.md does: the installer's policy is to put
    // the preset's documentation next to the preset, and the shipped v5 directory carries both.
    files: ['agent.cordis.yml', 'preset.yml', 'vibe-math-v5.js', '实现方案.md', '架构图.md'],
  },
]

const STATE_FILE = '.vibe-math-installed.json'
// where a replaced user edit is preserved; a leading dot keeps DSH's preset discovery from ever
// treating it as a preset directory (ids must match [a-z0-9][a-z0-9-]*)
const BACKUP_DIR = '.vibe-math-backup'

function sha256(buf) { return createHash('sha256').update(buf).digest('hex') }

let presetTmpSeq = 0
/**
 * Write one preset file ATOMICALLY: a uniquely named temp sibling, then a rename over the
 * destination. An in-place `writeFileSync` can be interrupted (a killed or crashed DSH, a full disk,
 * two sessions writing the same path) and leave a TRUNCATED preset behind — and the next
 * same-version boot would take those bytes for the user's own edit and never repair them (a
 * same-version run only restores MISSING files). The pid plus a per-process sequence make the temp
 * name unique, so concurrent writers cannot rename each other's half-written file. A leftover temp
 * (possible only after SIGKILL between the two calls) is inert: DSH reads the named preset files.
 */
function writePresetFile(dest, buf) {
  const tmp = dest + '.' + process.pid + '.' + (presetTmpSeq++) + '.vibe-math-tmp'
  try {
    writeFileSync(tmp, buf)
    renameSync(tmp, dest)
  } catch (e) {
    try { unlinkSync(tmp) } catch (e2) { /* nothing of ours to clean up */ }
    throw e
  }
}

/**
 * Preserve one file that is about to be replaced by the shipped version, under
 * `<presetRoot>/.vibe-math-backup/<fromVersion>/<preset>/<file>`.
 *
 * Returns `'written'` (a copy was made now), `'kept'` (a copy for this version was already there —
 * the earliest edit is the one worth keeping, and a re-run must not overwrite it with an
 * already-replaced file) or `'failed'`. A caller must not report `'kept'` as a failure: the user's
 * bytes are preserved, just from an earlier run.
 */
function backupReplacedFile(presetRoot, fromVersion, presetDir, fileName, buf) {
  try {
    const dir = join(presetRoot, BACKUP_DIR, String(fromVersion || 'unversioned'), presetDir)
    const dst = join(dir, fileName)
    if (existsSync(dst)) return 'kept' // the earliest copy for this version is the one worth keeping
    mkdirSync(dir, { recursive: true })
    writeFileSync(dst, buf)
    return 'written'
  } catch (e) {
    return 'failed' // a backup failure must never stop the update; it is reported by the caller
  }
}

function readState(path) {
  try {
    const raw = readFileSync(path, 'utf8')
    const obj = JSON.parse(raw)
    if (obj && typeof obj === 'object' && obj.files && typeof obj.files === 'object') return obj
  } catch (e) { /* missing or corrupt — treat as no state (baseline) */ }
  return null
}

/**
 * Does the new payload equal the recorded one? Compared field by field (never as JSON text) so key
 * ORDER cannot fake a change, and the timestamp is ignored on purpose: `updatedAt` records when the
 * file was written, not that anything happened.
 */
function sameStatePayload(previous, next) {
  if (!previous || !next) return false
  if (String(previous.version || '') !== String(next.version || '')) return false
  const a = previous.files || {}
  const b = next.files || {}
  const ka = Object.keys(a).sort()
  const kb = Object.keys(b).sort()
  if (ka.length !== kb.length) return false
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false
    const ra = a[ka[i]] || {}
    const rb = b[kb[i]] || {}
    if (String(ra.hash || '') !== String(rb.hash || '')) return false
    if (String(ra.provenance || '') !== String(rb.provenance || '')) return false
  }
  return true
}

let stateTmpSeq = 0
let stateWriteWarned = false
/**
 * Persist the state file, atomically. Three things here are deliberate:
 *   · an UNCHANGED payload is not written at all — a same-version boot must not churn this file (the
 *     "restarting DSH writes nothing" promise covers the state file too, not only the presets);
 *   · the temp name carries the pid and a sequence, so two concurrent boots cannot rename each
 *     other's half-written file (with a fixed `path + '.tmp'` the loser's rename failed and the
 *     whole write vanished without a word);
 *   · a failure is REPORTED once instead of being swallowed. The copy step already did its work; a
 *     missing state only means the next boot re-compares everything (at worst it backs up one extra
 *     original, it never overwrites a user edit).
 */
function writeState(path, state, previous, logger) {
  if (sameStatePayload(previous, state)) return 'unchanged'
  const tmp = path + '.' + process.pid + '.' + (stateTmpSeq++) + '.tmp'
  try {
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8')
    renameSync(tmp, path)
    return 'written'
  } catch (e) {
    try { unlinkSync(tmp) } catch (e2) { /* nothing of ours to clean up */ }
    if (!stateWriteWarned) {
      stateWriteWarned = true
      logger?.warn?.('[dsh-vibe-math] 状态文件写入失败（' + path + '）：' + String((e && e.message) || e) +
        '。preset 文件本身已按上面的日志处理完毕；下一次启动会按「没有记录」重新比对（最坏情况是多备份一份原文，不会覆盖你的改动）。')
    }
    return 'failed'
  }
}

// DSH 适配性自检（版本 + preset 形态 + 能力）。
// 检查 preset 运行时需要的宿主服务与关键 API 形状是否可用，缺失时打 warning。
// Best-effort DSH host-version detection, in order of authority:
//   1. `process.env.DSH_VERSION` — an explicit override, always honoured first;
//   2. the `pluginManager` service's bundle list — every host bundle carries the runtime version and
//      `@deepseek-ai/dsh-base` is present in every base-backed profile (service since 0.1.7);
//   3. `@deepseek-ai/dsh-app-boot`'s exported `getDshRuntimeVersion()` — the documented API; it only
//      resolves when this plugin's module scope can reach the host packages;
//   4. the installed `@deepseek-ai/dsh/package.json` — the historical probe, still the only source
//      that works on a global <= 0.1.6 install.
// When none resolves, the capability self-check below is still the authoritative gate.
const __require = createRequire(import.meta.url)

// The detected version is only ever used for diagnostics, and this probe sits on the installer ROW's
// activation path: a service that never answers must not hold the boot there. On timeout (or on a
// rejection) the next source is tried instead — no verdict depends on this value.
const LIST_BUNDLES_TIMEOUT_MS = 1500
function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    let settled = false
    let timer
    const done = (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value) } }
    timer = setTimeout(() => { if (!settled) { settled = true; resolve(undefined) } }, ms)
    if (timer && typeof timer.unref === 'function') timer.unref()
    Promise.resolve(promise).then(done, () => done(undefined))
  })
}

async function detectDshVersion(ctx) {
  try { const v = process.env.DSH_VERSION; if (v && String(v).trim()) return { version: String(v).trim(), source: 'DSH_VERSION' } } catch (e) {}
  try {
    const pm = (ctx && ctx.get) ? ctx.get('pluginManager') : undefined
    if (pm && typeof pm.listBundles === 'function') {
      // withTimeout: a slow or stuck pluginManager falls through to the next source instead of
      // stalling this row's activation (non-fatal either way — see the constant's comment).
      const bundles = await withTimeout(pm.listBundles(), LIST_BUNDLES_TIMEOUT_MS)
      const host = (bundles || []).find((b) => b && (b.name === '@deepseek-ai/dsh-base' || b.name === '@deepseek-ai/dsh'))
      if (host && host.version) return { version: String(host.version), source: 'pluginManager:' + host.name }
    }
  } catch (e) { /* no such service, or it cannot list yet */ }
  try {
    const boot = await import('@deepseek-ai/dsh-app-boot')
    if (boot && typeof boot.getDshRuntimeVersion === 'function') {
      return { version: String(boot.getDshRuntimeVersion()), source: 'dsh-app-boot' }
    }
  } catch (e) { /* host packages are not reachable from this plugin's module scope */ }
  try {
    const p = __require.resolve('@deepseek-ai/dsh/package.json')
    const v = (JSON.parse(readFileSync(p, 'utf8')).version || '').trim()
    if (v) return { version: v, source: '@deepseek-ai/dsh/package.json' }
  } catch (e) { /* not a global install layout — rely on the capability check */ }
  return undefined
}

/**
 * How this host declares agent presets.
 *   'rows'      — DSH >= 0.1.7: composition rows declared in this package's cordis.patch.yml (the rows
 *                 name our own preset-declaration module, which calls `agentPresets.register`).
 *                 Nothing reads the preset directory any more.
 *   'directory' — DSH <= 0.1.6: <DSH_HOME>/.agent-presets/<id>/agent.cordis.yml, which is what the
 *                 copy in apply() installs.
 *
 * Judged from the LOADER TREE first, then from the one capability that actually differs between the
 * two lines: the `agentPresets` service. That service exists on BOTH lines with different meaning (a
 * directory scanner below 0.1.7, a row registry from 0.1.7 on) and may not be up yet when a bundle is
 * activated on its own, which is why the tree is asked first — but when only the service can be seen,
 * `register` (never `list`, which both have) is what tells them apart. Missing the row line would skip
 * the only working install path, so this decision has to be the reliable one.
 */
export function detectPresetMechanism(ctx) {
  // 1) the LOADER TREE: only the row-based line mounts the agent-preset package (or its registry).
  //    This is visible before any plugin activates, which matters because a bundle activation can run
  //    this installer before the services are up (then ctx.get('agentPresets') is still undefined).
  try {
    const loader = (ctx && ctx.get) ? ctx.get('loader') : undefined
    if (loader && typeof loader.entries === 'function') {
      const entries = loader.entries()
      for (const entry of entries) {
        const name = entry && entry.options ? entry.options.name : undefined
        if (name === '@deepseek-ai/dsh-agent-preset' || name === '@deepseek-ai/dsh-agent-preset-registry') return 'rows'
      }
    }
  } catch (e) { /* no loader service: fall through to the service probe */ }
  // 2) the service itself, when it is already available. The PRECISE capability difference between
  //    the two lines is `register`: the >= 0.1.7 row registry has it, the <= 0.1.6 directory scanner
  //    is INFERRED to lack it. The record is partial — a real 0.1.6-alpha.2 boot exposed the service
  //    and its `list()` returned the directory roster (_oneoff/roster-016a2.json), but that probe
  //    never ASKED for `register`; the inference follows from the package difference (npm:
  //    0.1.6-alpha.2 ships no `@deepseek-ai/dsh-agent-preset`, while 0.1.7-rc.2 adds it). The
  //    misclassification this guards against is therefore a LATENT RISK, not an observed failure:
  //    testing `list` (which BOTH lines have) would classify a service-ready old host as the row
  //    line, and apply() would then return before writing a single preset directory — "installed but
  //    invisible", the 2.4.0 defect mirrored onto the older line. That outcome was never observed:
  //    the recorded 0.1.6 boot DID write all four preset directories. Never test a capability both
  //    lines share.
  try {
    const ap = (ctx && ctx.get) ? ctx.get('agentPresets') : undefined
    if (ap !== undefined) return typeof ap.register === 'function' ? 'rows' : 'directory'
  } catch (e) { /* no service to ask: the directory form */ }
  return 'directory'
}

/**
 * Minimal semver-range matcher for the host requirement.
 *
 * WHY THIS EXISTS: the DSH requirement a host is judged against lives in `package.json`
 * (`engines.dsh` / `dsh.engines.dsh`) — the same declaration dsh-market shows on a plugin's card.
 * Judging the host by a *second* source (the `dsh.compatibility.dshReleases` map) let the two
 * disagree: the card could say "compatible" while this self-check warned, or the reverse. So the
 * range is evaluated here, and the map remains only a fallback for manifests that declare no range.
 *
 * Supported: `*`, exact, `^`, `~`, `>=`, `>`, `<=`, `<`, whitespace-separated sets, `||`
 * alternatives — everything the ecosystem publishes (see `dshmarket`'s own
 * `^0.1.0-rc.7 || ^0.1.1-rc.2 || ^0.1.2-alpha.2` shape). Anything else returns null = unknown
 * (reported, never asserted), never a silent "incompatible".
 *
 * PRERELEASE RULE (npm's, applied per comparator SET — one `||` alternative is one set): a version
 * carrying a prerelease tag satisfies a set only when at least one comparator in that set shares its
 * [major, minor, patch] tuple AND carries a prerelease of its own. This is why
 * `>=0.1.2-rc.1 <0.2.0` does NOT match `0.1.5-rc.2`, and why this package declares explicit
 * per-tuple branches instead. Callers pass `includePrerelease: true` for host checks because every
 * published DSH release line is itself a prerelease.
 */
export function satisfiesDshRange(version, range, options = {}) {
  const v = parseSemver(version)
  if (v === null || typeof range !== 'string' || range.trim() === '') return null
  const versionHasPre = v.pre.length > 0
  let sawUnknown = false
  for (const set of range.split('||')) {
    const parts = set.trim().split(/\s+/).filter((p) => p !== '')
    if (parts.length === 0) return true // an empty alternative is `*`
    const parsed = parts.map(comparator)
    if (parsed.some((p) => p === null)) { sawUnknown = true; continue }
    if (versionHasPre && options.includePrerelease !== true) {
      const admitted = parsed.some((p) => p.target !== null && p.target.pre.length > 0 &&
        p.target.major === v.major && p.target.minor === v.minor && p.target.patch === v.patch)
      if (!admitted) continue
    }
    if (parsed.every((p) => matchesComparator(v, p))) return true
  }
  return sawUnknown ? null : false
}

function parseSemver(value) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value == null ? '' : value).trim())
  if (m === null) return null
  const pre = m[4] === undefined ? [] : m[4].split('.')
  for (const id of pre) if (/^\d+$/.test(id) && id.length > 1 && id[0] === '0') return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre }
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1
  if (a.pre.length === 0 && b.pre.length === 0) return 0
  if (a.pre.length === 0) return 1  // a release outranks its prereleases
  if (b.pre.length === 0) return -1
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const xn = /^\d+$/.test(x), yn = /^\d+$/.test(y)
    if (xn && yn) { const d = Number(x) - Number(y); if (d !== 0) return d < 0 ? -1 : 1; continue }
    if (xn !== yn) return xn ? -1 : 1 // numeric identifiers sort below alphanumeric ones
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

/** One comparator such as `^0.1.0-rc.7`. Returns null when the target is not a version. */
function comparator(part) {
  const p = part.trim()
  // `*`, `x`, `X` and an empty token mean "any version" (npm: still not a prerelease unless the
  // caller opts into includePrerelease — the set-level gate below is what enforces that).
  if (p === '' || p === '*' || p === 'x' || p === 'X') return { op: 'any', target: null }
  const m = /^(\^|~|>=|<=|>|<)?(.*)$/.exec(p)
  const op = m === null || m[1] === undefined ? '' : m[1]
  const target = parseSemver(m === null ? '' : m[2])
  return target === null ? null : { op, target }
}

function matchesComparator(v, { op, target }) {
  if (op === 'any') return true
  const c = compareSemver(v, target)
  switch (op) {
    case '': return c === 0
    case '>=': return c >= 0
    case '>': return c > 0
    case '<=': return c <= 0
    case '<': return c < 0
    case '^': {
      const upper = target.major > 0
        ? { major: target.major + 1, minor: 0, patch: 0, pre: [ '0' ] }
        : target.minor > 0
          ? { major: 0, minor: target.minor + 1, patch: 0, pre: [ '0' ] }
          : { major: 0, minor: 0, patch: target.patch + 1, pre: [ '0' ] }
      return c >= 0 && compareSemver(v, upper) < 0
    }
    case '~': {
      const upper = { major: target.major, minor: target.minor + 1, patch: 0, pre: [ '0' ] }
      return c >= 0 && compareSemver(v, upper) < 0
    }
    default: return false
  }
}

/**
 * The host verdict for a DSH version against a package manifest.
 * Prefers the declared range (`engines.dsh`, then `dsh.engines.dsh`); falls back to the
 * `dsh.compatibility.dshReleases` map so packages that declare only that keep working.
 */
export function dshVersionVerdict(version, manifest) {
  const pkg = manifest && typeof manifest === 'object' ? manifest : {}
  const declared = (pkg.engines && typeof pkg.engines.dsh === 'string' && pkg.engines.dsh.trim() !== '')
    ? pkg.engines.dsh
    : (pkg.dsh && pkg.dsh.engines && typeof pkg.dsh.engines.dsh === 'string' && pkg.dsh.engines.dsh.trim() !== '')
      ? pkg.dsh.engines.dsh
      : null
  if (declared !== null) {
    // includePrerelease: the whole published DSH line is prerelease builds.
    const sat = satisfiesDshRange(version, declared, { includePrerelease: true })
    return {
      basis: 'engines',
      requirement: declared,
      status: sat === true ? 'compatible' : sat === false ? 'incompatible' : 'unknown',
    }
  }
  const rel = (pkg.dsh && pkg.dsh.compatibility && pkg.dsh.compatibility.dshReleases) || {}
  const status = rel[version]
  if (status === 'compatible' || status === 'incompatible') {
    return { basis: 'dshReleases', requirement: null, status }
  }
  return { basis: 'dshReleases', requirement: null, status: status === 'unknown' ? 'unknown' : 'undeclared' }
}

async function checkHostCapabilities(ctx, logger) {
  const problems = []
  // 1) DSH version compatibility (best-effort, only when the version is detectable).
  //    The AUTHORITATIVE source is the declared range `engines.dsh` / `dsh.engines.dsh` — the same
  //    field dsh-market renders on the plugin card, so the two verdicts cannot disagree. The
  //    `dsh.compatibility.dshReleases` map is the fallback for manifests without a range.
  let manifest = {}
  try { manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'package.json'), 'utf8')) } catch (e) {}
  const dshRel = (manifest.dsh && manifest.dsh.compatibility && manifest.dsh.compatibility.dshReleases) || {}
  const supported = Object.keys(dshRel).sort()
  const detected = await detectDshVersion(ctx)
  const dshVersion = detected && detected.version
  const versionSource = detected && detected.source
  const mechanism = detectPresetMechanism(ctx)
  if (dshVersion) {
    const verdict = dshVersionVerdict(dshVersion, manifest)
    if (verdict.status === 'incompatible') {
      problems.push(verdict.basis === 'engines'
        ? '当前 DSH 版本 v' + dshVersion + ' 不满足本包声明的宿主版本要求（engines.dsh = ' + verdict.requirement + '）。'
        : '当前 DSH 版本 v' + dshVersion + ' 被本包声明为 incompatible；请使用 ' + supported.join(' / ') + '。')
    } else if (verdict.status === 'undeclared' || (verdict.status === 'unknown' && verdict.basis === 'dshReleases')) {
      problems.push('当前 DSH 版本 v' + dshVersion + ' 尚未被本包声明为兼容（dshReleases 仅声明 ' + supported.join(' / ') + '）；建议使用 ' + supported.join(' / ') + '，或将该版本在 dshReleases 中标注后再自行验证。')
    } else if (verdict.status === 'unknown' && verdict.basis === 'engines') {
      problems.push('当前 DSH 版本 v' + dshVersion + ' 无法与 engines.dsh 的范围比对（声明值 ' + verdict.requirement + ' 不是本安装器能解析的范围）；请按该范围自行确认。')
    }
  }
  // 2) capability self-check (the authoritative mounting gate; also covers hosts whose version
  //    could not be read). subagents / agents / tools / commands / fs shapes + v4 capabilities.
  // `required: true` services are the mounting gate; the rest are optional services the presets
  // read with ctx.get(). Their absence does not stop a mount but degrades SILENTLY, so report
  // them instead of letting the field discover them: without `subprocess` no directory-creation
  // shell runs, without `sandboxPolicy` writes carry no explicit fence, without `compaction` the
  // v4 real /compact path is inert.
  const checks = [
    // subagents 服务的续做/唤醒方法是 sendMessage(sender, targetId, content, {signal})；
    // followup 不是 subagents 服务的方法（它只是 Agent 对象方法）。同时探测两者，能用一个即可。
    { svc: 'subagents', methods: ['startContinuable', 'interrupt'], required: true },
    { svc: 'agents', methods: ['roots'], required: true },
    { svc: 'tools', methods: ['register'], required: true },
    { svc: 'commands', methods: ['register'], required: true },
    { svc: 'fs', methods: ['resolve', 'stat', 'readText', 'writeText', 'listDir'], required: true },
    { svc: 'subprocess', methods: ['spawn'], required: false },
    { svc: 'sandboxPolicy', methods: ['resolve'], required: false },
    { svc: 'compaction', methods: ['compactIfNeeded'], required: false },
  // v5 keeps its institute state in a hardened JSON file (State/<institute>.v5state.json) and does
  // NOT use the session-projection registry or the session store any more: DSH refuses to load a
  // session whose log carries event types outside its known set, so writing institute events into
  // the user's session used to make that session unresumable. Neither service is checked here.
  ]
  const degradations = []
  for (let i = 0; i < checks.length; i++) {
    const svc = checks[i].svc
    const methods = checks[i].methods
    const required = checks[i].required === true
    const report = required ? ((m) => problems.push(m)) : ((m) => degradations.push(m))
    let s
    try { s = (ctx && ctx.get) ? ctx.get(svc) : undefined } catch (e) { s = undefined }
    if (s === undefined) { report('宿主缺少服务 ' + svc); continue }
    for (let j = 0; j < methods.length; j++) {
      if (typeof s[methods[j]] !== 'function') report(svc + '.' + methods[j] + ' 不可用（宿主版本可能过旧）')
    }
    // subagents continuation (wake) API: sendMessage (modern) OR followup (legacy) must exist.
    if (svc === 'subagents' && typeof s.sendMessage !== 'function' && typeof s.followup !== 'function') {
      problems.push('subagents 缺少续做/唤醒方法（需 sendMessage 或 followup 至少其一）')
    }
  }
  // fs API shape: DSH 0.1.1 起 resolve 返回 {targetKey, displayPath} 对象（旧版返回字符串路径）
  try {
    const f = (ctx && ctx.get) ? ctx.get('fs') : undefined
    if (f && typeof f.resolve === 'function') {
      const r = await f.resolve('x', { cwd: process.cwd() })
      if (typeof r !== 'object' || r === null || typeof r.targetKey !== 'string') {
        problems.push('fs.resolve 返回形状不符（期望 {targetKey, displayPath}，v3/v4 预设要求 DSH ≥ 0.1.1）')
      }
    }
  } catch (e) { problems.push('fs.resolve 能力检测失败：' + String((e && e.message) || e)) }
  // v4 依赖 subagents.startContinuable 的 agentOptions / toolFilter 能力（DSH 0.1.2 起由
  // dsh-subagent 声明 SubagentCapabilities.agentOptions；spawn/fork 进程内 provider 均支持。
  // 缺省 provider 名按 spawn 探测；探测失败不视为致命（等价于回退到再试一次、只警告）。
  try {
    const sa = (ctx && ctx.get) ? ctx.get('subagents') : undefined
    if (sa && typeof sa.list === 'function') {
      const names = (sa.list ? sa.list() : [])
      const name = names.indexOf('spawn') !== -1 ? 'spawn' : (names[0] || '')
      if (name && typeof sa.getProvider === 'function') {
        const cap = (sa.getProvider(name) || {}).capabilities
        if (cap && cap.agentOptions === false) problems.push('subagents provider "' + name + '" 不支持 agentOptions（v4 指定常驻模型/路由需要）')
        if (cap && cap.toolFilter === false) problems.push('subagents provider "' + name + '" 不支持 toolFilter（v4 常驻工具权限需要）')
      }
    }
  } catch (e) { /* 探测失败不致命 */ }
  if (degradations.length > 0) {
    logger?.warn?.('[dsh-vibe-math] 可选宿主服务缺失，功能会静默降级（不影响挂载）：' + degradations.join('；') + '。subprocess 缺失则无法用 shell 创建目录树（仅靠 fs 自动建父目录兜底）；sandboxPolicy 缺失则插件写入不带显式围栏；compaction 缺失则 v4 的真实 /compact 路径与 v5 的真实压缩不生效（v5 回退到自述浓缩）')
  }
  if (problems.length > 0) {
    logger?.warn?.('[dsh-vibe-math] 宿主自检：' + problems.length + ' 项不满足（' + problems.join('；') + '）。v2/v3/v4/v5 预设依赖这些宿主服务/API，旧版或未经声明兼容的 DSH 可能无法挂载' + (dshVersion ? '（当前检测到 DSH v' + dshVersion + '，来源 ' + versionSource + '，本包适配 ' + (supported.length ? supported.join(' / ') : '(未声明)') + '）' : '') + '。')
  } else {
    logger?.info?.('[dsh-vibe-math] 宿主自检通过：subagents / agents / tools / commands / fs 服务及关键 API 均可用' + (degradations.length === 0 ? '，可选服务 subprocess / sandboxPolicy / compaction 亦齐备' : '（可选服务有缺失，见上方警告）') + (dshVersion ? '（当前 DSH v' + dshVersion + '，来源 ' + versionSource + '；本包已声明兼容 ' + supported.join(' / ') + '）' : '') + '。')
  }
  return { dshVersion, versionSource, mechanism }
}

export async function apply(ctx) {
  const logger = ctx && ctx.logger
  try {
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
    const here = dirname(fileURLToPath(import.meta.url))
    const presetRoot = join(dshHome, '.agent-presets')
    const stateFile = join(presetRoot, STATE_FILE)

    // WHICH MECHANISM THIS HOST USES decides whether the directory work below means anything, so it
    // is decided (and reported) before anything is written. The host self-check runs here too.
    const host = await checkHostCapabilities(ctx, logger)
    if (host && host.mechanism === 'rows') {
      logger?.info?.('[dsh-vibe-math] preset 声明方式：本宿主以组合行声明 agent preset' +
        (host.dshVersion ? '（DSH v' + host.dshVersion + '）' : '') + '，本包随附的 cordis.patch.yml 已声明四个 preset（dsh-vibe-math/preset-declaration）；' +
        '跳过 ' + presetRoot + ' 目录同步（该目录自 DSH 0.1.7 起不再被读取）。')
      if (existsSync(stateFile)) {
        logger?.info?.('[dsh-vibe-math] 提示：' + presetRoot + ' 里还留着旧版 DSH（≤ 0.1.6）读取过的 preset 副本，' +
          '当前宿主不会再读它们，可以安全删除（要自定义 preset，请在预设选择器里复制一份，或改 profile 的 cordis.patch.yml）。')
      }
      return
    }

    // current package version (the source of truth for "is this an upgrade?")
    let pkgVersion = ''
    try { pkgVersion = String((JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).version) || '') } catch (e) { pkgVersion = '' }

    const state = readState(stateFile)
    const prevFiles = (state && state.files) || {}
    const isUpgrade = state !== null && pkgVersion !== '' && state.version !== pkgVersion
    const isBaseline = state === null // no recorded history → refresh everything
    // A version change (or a first sighting) REPLACES the managed files; only a same-version boot
    // leaves the working tree alone. See UPDATE POLICY at the top of this file.
    const refresh = isBaseline || isUpgrade
    const fromVersion = (state && state.version) || '(unversioned)'
    if (pkgVersion === '') {
      // Without a version there is nothing to compare against, so this run must NOT replace
      // anything (a wrong guess would overwrite files for no reason); it still restores missing
      // ones and keeps the previously recorded version, so the next readable run reports the
      // right "from" version.
      logger?.warn?.('[dsh-vibe-math] 读不到本包版本（package.json 缺失或损坏）：本次不做版本比对，只补回缺失的 preset 文件。')
    }
    // A recorded version NEWER than this package means this run replaces preset bytes BACKWARDS.
    // The policy still does it — "the preset directory equals the installed package" is the whole
    // point — but a silent downgrade (an old bundle still installed in the profile while the presets
    // were synced from a newer one) is exactly the surprise worth naming.
    if (isUpgrade) {
      const recorded = parseSemver(fromVersion)
      const installed = parseSemver(pkgVersion)
      if (recorded !== null && installed !== null && compareSemver(recorded, installed) > 0) {
        logger?.warn?.('[dsh-vibe-math] 记录里的版本（' + fromVersion + '）比本包版本（' + pkgVersion + '）新，本次会把 preset 换回旧字节。' +
          '若这不是你想要的，请先升级 profile 里的依赖：dsh plugin --profile <name> add dsh-vibe-math@latest，再重启 DSH。')
      }
    }

    const nextFiles = {}
    let installed = 0, updated = 0, kept = 0
    let userEditedKept = 0
    const replacedEdits = []
    const unknownPrev = []
    const backupFailures = []

    for (const p of PRESETS) {
      const srcDir = join(here, p.src)
      const dstDir = join(presetRoot, p.dst)
      if (!existsSync(srcDir)) continue
      mkdirSync(dstDir, { recursive: true })
      for (const f of p.files) {
        const s = join(srcDir, f)
        const d = join(dstDir, f)
        if (!existsSync(s)) continue
        const key = p.src + '/' + f
        const cur = readFileSync(s)
        const curHash = sha256(cur)
        if (!existsSync(d)) {
          // missing file: always restore, whatever the version
          writePresetFile(d, cur)
          installed += 1
          nextFiles[key] = { hash: curHash, provenance: 'package' }
          continue
        }
        const destBuf = readFileSync(d)
        const destHash = sha256(destBuf)
        const prev = prevFiles[key]
        const prevRec = (prev && typeof prev === 'object') ? prev : { hash: prev, provenance: 'package' }
        if (destHash === curHash) {
          // already the shipped bytes: never rewrite, so the file's mtime (which keys the preset's
          // DSH generation) stays put
          nextFiles[key] = { hash: curHash, provenance: 'package' }
          continue
        }
        if (!refresh) {
          // same version: nothing is being updated, so a file that differs from the package is left
          // exactly as it is. The recorded hash stays "what this installer last wrote" (or unknown),
          // so the drift is still recognised — and backed up — at the next version change.
          //
          // PROVENANCE, recorded honestly: when the on-disk bytes are NOT what this installer last
          // wrote, something else edited this managed file, so it is marked user-owned — which is
          // what makes the stale-preset cleanup below KEEP it instead of unlinking it. A legacy
          // state with no hash cannot tell, so it stays 'package' (it is still backed up before any
          // version-change replacement; the cleanup backs it up before deleting too).
          kept += 1
          const userEdited = typeof prevRec.hash === 'string' && destHash !== prevRec.hash
          if (userEdited) userEditedKept += 1
          nextFiles[key] = userEdited
            ? { hash: prevRec.hash, provenance: 'user' }
            : typeof prevRec.hash === 'string' ? { hash: prevRec.hash, provenance: 'package' } : { provenance: 'package' }
          continue
        }
        // replacing: preserve the user's bytes when they are not what this installer last wrote.
        // The two cases are NOT the same claim and are counted apart: bytes that differ from the
        // recorded hash are a provable edit, while a legacy state WITHOUT a hash cannot tell — that
        // file is backed up all the same, but the log must not call it "被改过" (it cannot know).
        if (typeof prevRec.hash !== 'string') {
          if (backupReplacedFile(presetRoot, fromVersion, p.dst, f, destBuf) === 'failed') backupFailures.push(key)
          unknownPrev.push(key)
        } else if (destHash !== prevRec.hash) {
          if (backupReplacedFile(presetRoot, fromVersion, p.dst, f, destBuf) === 'failed') backupFailures.push(key)
          replacedEdits.push(key)
        }
        writePresetFile(d, cur)
        updated += 1
        nextFiles[key] = { hash: curHash, provenance: 'package' }
      }
    }

    // Clean up preset dirs that this bundle NO LONGER manages (e.g. vibe-math-v1 after it was
    // removed at v2.0.0). The copy loop only adds/updates PRESETS; it never deletes a preset that
    // was dropped, so an old removed preset would linger in the picker forever. Here we remove the
    // files this installer previously recorded as package-owned under a prefix that is no longer in
    // PRESETS, then drop the dir if it became empty. Files recorded as user-owned are KEPT.
    //
    // DELETION IS THE ONE PATH THAT DOES NOT REPLACE, so it obeys the same rule as the replacement
    // path: a file whose bytes are not what this installer last wrote is copied to
    // <presetRoot>/.vibe-math-backup/<fromVersion>/<preset>/<file> FIRST and named in the log. A file
    // that still matches its recorded hash IS the package's copy, so removing it destroys nothing.
    const currentPrefixes = new Set(PRESETS.map(p => p.src + '/'))
    let removedFiles = 0
    let matchedPackageFiles = 0
    let keptUserFiles = 0
    const removedDirs = []
    const backedUpStale = []
    const backupFailedStale = []
    const unreadableStale = []
    const keptUserDirs = new Set()
    const stale = new Map() // prefix -> [keys]
    for (const key of Object.keys(prevFiles)) {
      const slash = key.indexOf('/')
      if (slash === -1) continue
      const prefix = key.slice(0, slash + 1)
      if (currentPrefixes.has(prefix)) continue
      if (!stale.has(prefix)) stale.set(prefix, [])
      stale.get(prefix).push(key)
    }
    for (const [prefix, keys] of stale) {
      let dirEmpty = true
      for (const key of keys) {
        const rec = (prevFiles[key] && typeof prevFiles[key] === 'object') ? prevFiles[key] : { provenance: 'package' }
        if (rec.provenance === 'user') { dirEmpty = false; keptUserFiles += 1; keptUserDirs.add(prefix.slice(0, -1)); continue }   // 用户文件 → 保留
        const f = join(presetRoot, key)
        if (existsSync(f)) {
          let buf = null
          try { buf = readFileSync(f) } catch (e) { /* unreadable: treated as "cannot prove it is ours" */ }
          // A file that still matches its recorded hash IS the copy this installer wrote, so deleting
          // it destroys nothing. Anything else — edited bytes, or a legacy record with no hash that
          // cannot tell — is copied to the backup root first. Deletion is allowed ONLY when nothing of
          // the user's can be lost: a package copy, or bytes that really were preserved. An unreadable
          // file cannot be backed up, and a FAILED backup means the bytes were not preserved either —
          // both are KEPT and named in the log. A stale directory left behind is cosmetic; destroyed
          // user bytes are not. (The REPLACEMENT path above keeps its own rule — a failed backup must
          // not block a version upgrade — because there the file is overwritten, not removed.)
          const isPackageCopy = buf !== null && typeof rec.hash === 'string' && sha256(buf) === rec.hash
          let mayDelete = false
          if (isPackageCopy) {
            matchedPackageFiles += 1
            mayDelete = true
          } else if (buf !== null) {
            const cut = key.lastIndexOf('/')
            const backup = backupReplacedFile(presetRoot, fromVersion, key.slice(0, cut), key.slice(cut + 1), buf)
            if (backup === 'failed') backupFailedStale.push(key)
            else { backedUpStale.push(key); mayDelete = true }
          } else {
            unreadableStale.push(key)
          }
          if (mayDelete) { try { unlinkSync(f); removedFiles += 1 } catch (e) {} }
        }
        if (existsSync(f)) dirEmpty = false
      }
      const dir = join(presetRoot, prefix.slice(0, -1))
      if (dirEmpty && existsSync(dir)) { try { rmdirSync(dir); removedDirs.push(dir) } catch (e) {} }
    }

    writeState(stateFile, { version: pkgVersion || (state && state.version) || '', files: nextFiles, updatedAt: Date.now() }, state, logger)

    const cleanupNotes = []
    if (matchedPackageFiles > 0) cleanupNotes.push(matchedPackageFiles + ' 个仍是本安装器写入的字节（删掉的不是你的改动）')
    if (backedUpStale.length > 0) cleanupNotes.push(backedUpStale.length + ' 个的字节与上一次安装不同（被改过），原文已备份在 ' + join(presetRoot, BACKUP_DIR, String(fromVersion)) + '：' + backedUpStale.join(', '))
    if (backupFailedStale.length > 0) cleanupNotes.push(backupFailedStale.length + ' 个被改过的文件**备份失败**（原文未保留，已跳过删除并保留原文件）：' + backupFailedStale.join(', '))
    if (unreadableStale.length > 0) cleanupNotes.push(unreadableStale.length + ' 个文件**无法读取**（既不能证明是本安装器写入的，也无法备份），已跳过删除并保留原文件：' + unreadableStale.join(', '))
    if (keptUserFiles > 0) cleanupNotes.push(keptUserFiles + ' 个记为用户所有的文件被保留（' + [...keptUserDirs].join(', ') + '），要清理请手动删除')
    if (removedFiles > 0 || removedDirs.length > 0 || cleanupNotes.length > 0) {
      logger?.info?.('[dsh-vibe-math] preset cleanup: removed ' + removedFiles + ' file(s) from ' + removedDirs.length + ' stale preset dir(s) (' + removedDirs.map(d => d.split(/[\\/]/).pop()).join(', ') + ') that are no longer shipped' +
        (cleanupNotes.length > 0 ? '；' + cleanupNotes.join('；') : '') + '。')
    }

    const backupsDir = join(presetRoot, BACKUP_DIR, String(fromVersion))
    // Two kinds of preserved bytes, reported apart because they are not the same claim:
    //   · replacedEdits — the bytes on disk are NOT what this installer last wrote: a provable edit.
    //   · unknownPrev   — a legacy state with no hash cannot tell; backed up all the same, and never
    //                     called "被改过" (the old wording claimed an edit it could not see).
    const editClause = replacedEdits.length > 0
      ? '其中 ' + replacedEdits.length + ' 个文件与上一次安装的字节不同（被改过），已按版本一致化覆盖' +
        (backupFailures.length === 0
          ? '，原文备份在 ' + backupsDir + '：' + replacedEdits.join(', ')
          : '；这 ' + backupFailures.length + ' 个文件**备份失败**（原文未保留）：' + backupFailures.join(', ')) +
        '。要自定义 preset，请复制一份而不是改这几个文件——被管理的文件在下一次版本变更时一定会被替换。'
      : ''
    const unknownClause = unknownPrev.length > 0
      ? '另有 ' + unknownPrev.length + ' 个文件在旧版状态里没有哈希（无法判断你是否改过），已先备份原文到 ' + backupsDir + ' 再替换' +
        (backupFailures.length > 0 ? '（其中备份失败：' + backupFailures.join(', ') + '）' : '') + '。'
      : ''

    if (isUpgrade) {
      logger?.info?.('[dsh-vibe-math] preset auto-update: version ' + fromVersion + ' → ' + pkgVersion +
        ' — 新增 ' + installed + ' 个文件，更新 ' + updated + ' 个文件。' +
        editClause + unknownClause +
        '新版本 preset 将在新会话生效。')
    } else if (isBaseline) {
      logger?.info?.('[dsh-vibe-math] preset baseline: refreshed ' + (installed + updated) + ' file(s) to v' + pkgVersion +
        (replacedEdits.length > 0
          ? '，其中 ' + replacedEdits.length + ' 个原有文件与随包版本不同' +
            (backupFailures.length === 0 ? '，原文已备份在 ' + backupsDir
              : '，但有 ' + backupFailures.length + ' 个备份失败（原文未保留）：' + backupFailures.join(', '))
          : '') +
        unknownClause +
        ' — 已启用版本化自动更新（后续版本变更会直接替换被管理的 preset 文件）。')
    } else if (installed > 0 || kept > 0) {
      // SAME VERSION, and BOTH facts are reported: a missing file being restored must not hide the
      // drift notice (the audit's repro: the log said "restored 1" and never mentioned the drift).
      const parts = []
      if (installed > 0) parts.push('restored ' + installed + ' missing preset file(s)')
      if (kept > 0) {
        parts.push(kept + ' file(s) differ from the shipped copy and were left untouched (v' + pkgVersion + ' 未变)' +
          (userEditedKept > 0 ? '，其中 ' + userEditedKept + ' 个是安装之后的改动（记为用户所有：弃用 preset 的清理不会删除它们）' : '') +
          '；下一次版本变更会先备份原文再替换')
      }
      logger?.info?.('[dsh-vibe-math] preset files: ' + parts.join('；') + '。')
    }
    /* the host self-check ran at the top of apply() — it also decides the preset mechanism */
  } catch (err) {
    logger?.warn?.('[dsh-vibe-math] preset install/update failed: %s', String((err && err.message) || err))
  }
}
