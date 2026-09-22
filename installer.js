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
//     wrote is replaced, the user's copy is kept under
//     <presetRoot>/.vibe-math-backup/<fromVersion>/<preset>/<file> and named in the log.
//   - same version: no-op (idempotent) — restarting DSH never rewrites a file or churns the
//     preset's generation stamp. Missing files are ALWAYS restored, at any version.
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

function writeState(path, state) {
  try {
    const tmp = path + '.tmp'
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8')
    renameSync(tmp, path)
  } catch (e) {
    // best-effort: state persistence failure must not break the copy step
  }
}

// DSH 适配性自检（能力检测，而非版本号——DSH 不向插件暴露版本）。
// 检查 preset 运行时需要的宿主服务与关键 API 形状是否可用，缺失时打 warning。
// Best-effort DSH host-version detection. DSH does NOT expose its version through a documented
// service/context property or a guaranteed env var, so we probe in order: an explicit env var
// (future-proofing), then the installed @deepseek-ai/dsh package.json. This is layout-dependent
// (works for a typical global install where @deepseek-ai/dsh is a sibling of this plugin); when it
// cannot resolve, the capability self-check below is still the authoritative gate.
const __require = createRequire(import.meta.url)
function detectDshVersion() {
  try { const v = process.env.DSH_VERSION; if (v && String(v).trim()) return String(v).trim() } catch (e) {}
  try {
    const p = __require.resolve('@deepseek-ai/dsh/package.json')
    const v = (JSON.parse(readFileSync(p, 'utf8')).version || '').trim()
    if (v) return v
  } catch (e) { /* host package not resolvable from here — rely on capability check */ }
  return undefined
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
    }    if (parsed.every((p) => matchesComparator(v, p))) return true
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
  const dshVersion = detectDshVersion()
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
  // v5 keeps its institute state in a HOST-ONLY session projection unit, so it wants
  // the projection registry and the session store. Both are mounted by dsh-base; if
  // either is absent v5 falls back to a hardened JSON state file, so this is a
  // degradation rather than a mounting gate.
  { svc: 'sessionProjections', methods: ['register', 'stateOf'], required: false },
  { svc: 'sessions', methods: ['flush'], required: false },
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
    logger?.warn?.('[dsh-vibe-math] 可选宿主服务缺失，功能会静默降级（不影响挂载）：' + degradations.join('；') + '。subprocess 缺失则无法用 shell 创建目录树（仅靠 fs 自动建父目录兜底）；sandboxPolicy 缺失则插件写入不带显式围栏；compaction 缺失则 v4 的真实 /compact 路径与 v5 的真实压缩不生效（v5 回退到自述浓缩）；sessionProjections 缺失则 v5 的研究所状态回退到加固 JSON 文件（权威源从会话日志投影变为 State/<institute>.v5state.json，跨进程恢复能力下降）。')
  }
  if (problems.length > 0) {
    logger?.warn?.('[dsh-vibe-math] 宿主自检：' + problems.length + ' 项不满足（' + problems.join('；') + '）。v2/v3/v4/v5 预设依赖这些宿主服务/API，旧版或未经声明兼容的 DSH 可能无法挂载' + (dshVersion ? '（当前检测到 DSH v' + dshVersion + '，本包适配 ' + (supported.length ? supported.join(' / ') : '(未声明)') + '）' : '') + '。')
  } else {
    logger?.info?.('[dsh-vibe-math] 宿主自检通过：subagents / agents / tools / commands / fs 服务及关键 API 均可用' + (degradations.length === 0 ? '，可选服务 subprocess / sandboxPolicy / compaction / sessionProjections / sessions 亦齐备' : '（可选服务有缺失，见上方警告）') + (dshVersion ? '（当前 DSH v' + dshVersion + '，本包已声明兼容 ' + supported.join(' / ') + '）' : '') + '。')
  }
}

export async function apply(ctx) {
  const logger = ctx && ctx.logger
  try {
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
    const here = dirname(fileURLToPath(import.meta.url))
    const presetRoot = join(dshHome, '.agent-presets')
    const stateFile = join(presetRoot, STATE_FILE)

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
    const replacedEdits = []
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
          writeFileSync(d, cur)
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
          kept += 1
          nextFiles[key] = typeof prevRec.hash === 'string' ? { hash: prevRec.hash, provenance: 'package' } : { provenance: 'package' }
          continue
        }
        // replacing: preserve the user's bytes when they are not what this installer last wrote
        // (a legacy state without a hash cannot tell, so it backs the file up rather than risk it)
        if (typeof prevRec.hash !== 'string' || destHash !== prevRec.hash) {
          if (backupReplacedFile(presetRoot, fromVersion, p.dst, f, destBuf) === 'failed') backupFailures.push(key)
          replacedEdits.push(key)
        }
        writeFileSync(d, cur)
        updated += 1
        nextFiles[key] = { hash: curHash, provenance: 'package' }
      }
    }

    // Clean up preset dirs that this bundle NO LONGER manages (e.g. vibe-math-v1 after it was
    // removed at v2.0.0). The copy loop only adds/updates PRESETS; it never deletes a preset that
    // was dropped, so an old removed preset would linger in the picker forever. Here we remove the
    // files this installer previously recorded as package-owned under a prefix that is no longer in
    // PRESETS, then drop the dir if it became empty. User-owned files (provenance 'user') are kept.
    const currentPrefixes = new Set(PRESETS.map(p => p.src + '/'))
    let removedFiles = 0
    let removedDirs = []
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
        if (rec.provenance === 'user') { dirEmpty = false; continue }   // 用户文件 → 保留
        const f = join(presetRoot, key)
        if (existsSync(f)) { try { unlinkSync(f); removedFiles += 1 } catch (e) {} }
        if (existsSync(f)) dirEmpty = false
      }
      const dir = join(presetRoot, prefix.slice(0, -1))
      if (dirEmpty && existsSync(dir)) { try { rmdirSync(dir); removedDirs.push(dir) } catch (e) {} }
    }

    writeState(stateFile, { version: pkgVersion || (state && state.version) || '', files: nextFiles, updatedAt: Date.now() })

    if (removedFiles > 0 || removedDirs.length > 0) {
      logger?.info?.('[dsh-vibe-math] preset cleanup: removed ' + removedFiles + ' file(s) from ' + removedDirs.length + ' stale preset dir(s) (' + removedDirs.map(d => d.split(/[\\/]/).pop()).join(', ') + ') that are no longer shipped.')
    }

    if (isUpgrade) {
      logger?.info?.('[dsh-vibe-math] preset auto-update: version ' + fromVersion + ' → ' + pkgVersion +
        ' — 新增 ' + installed + ' 个文件，更新 ' + updated + ' 个文件。' +
        (replacedEdits.length > 0
          ? '其中 ' + replacedEdits.length + ' 个文件与上一次安装的字节不同（被改过），已按版本一致化覆盖' +
            (backupFailures.length === 0
              ? '，原文备份在 ' + join(presetRoot, BACKUP_DIR, String(fromVersion)) + '：' + replacedEdits.join(', ')
              : '；这 ' + backupFailures.length + ' 个文件**备份失败**（原文未保留）：' + backupFailures.join(', ')) +
            '。要自定义 preset，请复制一份而不是改这几个文件——被管理的文件在下一次版本变更时一定会被替换。'
          : '') +
        '新版本 preset 将在新会话生效。')
    } else if (isBaseline) {
      logger?.info?.('[dsh-vibe-math] preset baseline: refreshed ' + (installed + updated) + ' file(s) to v' + pkgVersion +
        (replacedEdits.length > 0
          ? '，其中 ' + replacedEdits.length + ' 个原有文件与随包版本不同' +
            (backupFailures.length === 0 ? '，原文已备份在 ' + join(presetRoot, BACKUP_DIR, String(fromVersion))
              : '，但有 ' + backupFailures.length + ' 个备份失败（原文未保留）：' + backupFailures.join(', '))
          : '') +
        ' — 已启用版本化自动更新（后续版本变更会直接替换被管理的 preset 文件）。')
    } else if (installed > 0) {
      logger?.info?.('[dsh-vibe-math] restored ' + installed + ' missing preset file(s)')
    } else if (kept > 0) {
      // same version, and some managed file on disk differs from the package: reported, never
      // rewritten mid-version (it is replaced, with a backup, at the next version change)
      logger?.info?.('[dsh-vibe-math] preset files untouched (v' + pkgVersion + ' unchanged): ' + kept +
        ' file(s) differ from the shipped copy; they will be replaced on the next version change (原件会先备份)')
    }
    await checkHostCapabilities(ctx, logger)
  } catch (err) {
    logger?.warn?.('[dsh-vibe-math] preset install/update failed: %s', String((err && err.message) || err))
  }
}
