// vmu kernel guard — the ENFORCEMENT point for the resolved settings that otherwise only exist on paper.
//
// CONVENTION (learned by getting it wrong): a key is "wired" when a RUNTIME SOURCE reads it, and the settings
// table and the docs audit both decide that by scanning file text for the key LITERAL. Composing the key from
// parts hides the read from both scanners and makes the two checks disagree, so the readers below use plain
// literals; only the human-facing hint text composes the name.
import { dirname, isAbsolute, join, normalize, relative } from 'node:path'
import { lstatSync } from 'node:fs'   // ROUND 217: the symlink gate reads the filesystem (only to DECIDE, never to write)

export const apiVersion = 1

const K_PATH_POLICY = ['vmu', 'safety', 'pathPolicy'].join('.')
const K_MEMORY_CEILING = ['vmu', 'limits', 'memoryCeilingMb'].join('.')

const POLICIES = Object.freeze(['workspace-only', 'workspace+shared'])

/** The house refusal shape: a named code plus a hint that names the path, the policy and how to open it. */
export function refuse(code, message, hint) {
  const e = new Error(message)
  e.code = code
  if (hint !== undefined) e.hint = hint
  return e
}

/** The resolved policy, read from the live settings object. The read is a LITERAL on purpose: the settings
 *  table (and the docs audit that recomputes it independently) decides "wired" by finding the key's literal in
 *  a runtime source, so hiding it behind a composed string makes the key look unread and the two checks
 *  disagree. A literal that is genuinely read is the honest signal. */
export function readPathPolicy(settings) {
  const raw = settings ? settings['vmu.safety.pathPolicy'] : undefined
  return POLICIES.includes(raw) ? raw : 'workspace-only'
}

/** The resolved ceiling in MB; 0 (the schema default) means "no ceiling". Literal read, same reason. */
export function readMemoryCeilingMb(settings) {
  const n = Number(settings ? settings['vmu.limits.memoryCeilingMb'] : 0)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/**
 * The shared exchange area is the sibling `Shared` directory of the workspace root; `workspace+shared`
 * adds it to the write set. Exported so callers can show exactly what a policy opens.
 */
export function sharedRootFor(root) {
  return join(dirname(String(root || '.')), 'Shared')
}

/** `{ policy, writableRoots, note }` — what the CURRENT settings allow, for回执/日志/自检. */
export function describePolicy(settings, { root = process.cwd() } = {}) {
  const policy = readPathPolicy(settings)
  const writableRoots = policy === 'workspace+shared'
    ? [normalize(String(root)), normalize(sharedRootFor(root))]
    : [normalize(String(root))]
  return {
    policy,
    writableRoots,
    note: policy === 'workspace+shared'
      ? 'workspace root plus its sibling Shared area are writable'
      : 'only the workspace root is writable (the shared area is read-only under this policy)',
  }
}

function inside(roots, abs) {
  return roots.some((r) => {
    const rel = relative(r, abs)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  })
}

/**
 * Decide a write. Allowed ⇒ `{ ok:true, path }`; outside the policy ⇒ throw a NAMED refusal whose message
 * names the rejected path and whose hint names the current policy and how to open it.
 */
export function guardWrite({ settings = {}, root, target, kind = 'write' } = {}) {
  if (!root) throw refuse('VMU_INVALID_ARGUMENT', 'guardWrite needs a workspace root', 'pass { root }')
  const { policy, writableRoots } = describePolicy(settings, { root })
  const abs = normalize(isAbsolute(String(target)) ? String(target) : join(String(root), String(target)))
  if (!inside(writableRoots, abs)) {
    const opener = ['vmu', 'safety', 'pathPolicy'].join('.')
    const openValue = 'workspace+shared'
    throw refuse(
      'VMU_NOT_PERMITTED',
      'the ' + kind + ' is refused: the target path is outside the allowed roots: ' + abs,
      'current policy is "' + policy + '" which allows only ' + writableRoots.join(' and ') +
      '; to allow this path set ' + opener + '="' + openValue + '" (or move the target under an allowed root)',
    )
  }
  return { ok: true, path: abs }
}

/** Same judgement for a spawn cwd (this module only DECIDES; the caller owns the actual spawn). */
export function guardSpawnCwd({ settings = {}, root, cwd } = {}) {
  const target = (cwd === undefined || cwd === null || String(cwd).trim() === '') ? root : cwd
  const g = guardWrite({ settings, root, target, kind: 'spawn cwd' })
  return { ok: true, path: g.path }
}

/**
 * Compare the HOST PROCESS RSS against the resolved ceiling. Wording matters: the number is the host
 * process's resident set size (the framework cannot measure its own "net" memory), not the vmu's own.
 */
export function memoryCeilingExceeded({ settings = {}, rssBytes = 0 } = {}) {
  const ceilingMb = readMemoryCeilingMb(settings)
  const rssMb = Math.max(0, Math.round(Number(rssBytes || 0) / (1024 * 1024)))
  return { exceeded: ceilingMb > 0 && rssMb > ceilingMb, ceilingMb, rssMb }
}

// ── ROUND 217: the security family（docs/20 §2／§4／§12）. Every reader below uses a LITERAL key read, for the reason this
// fileの header states: a composed key hides the read from both the settings table and the docs audit. Every value is
// validated, and every judgement refuses BY NAME with a hint that names the key and the way out.

/** `vmu.safety.killSwitch`: the global stop. Default false（docs/20 §12）. */
export function readKillSwitch(settings) {
  return settings ? settings['vmu.safety.killSwitch'] === true : false
}

/** `vmu.safety.maxPathLength`: default 4096（docs/20 §4）. */
export function readMaxPathLength(settings) {
  const n = Number(settings ? settings['vmu.safety.maxPathLength'] : 0)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 4096
}

/** `vmu.safety.followSymlinks`: default false（docs/20 §4）. */
export function readFollowSymlinks(settings) {
  return settings ? settings['vmu.safety.followSymlinks'] === true : false
}

/** `vmu.safety.netPolicy`: default `off` - the volume says "默认禁网 + 显式放行". */
export function readNetPolicy(settings) {
  const v = settings ? settings['vmu.safety.netPolicy'] : undefined
  return ['off', 'allowlist', 'allow'].includes(v) ? v : 'off'
}

/** `vmu.safety.execAllowlist`: which executables may be started. Empty ⇒ nothing is pre-approved. */
export function readExecAllowlist(settings) {
  const a = settings ? settings['vmu.safety.execAllowlist'] : undefined
  return Array.isArray(a) ? a.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : []
}

/** `vmu.safety.maxCpuMs`: 0 means no ceiling. */
export function readMaxCpuMs(settings) {
  const n = Number(settings ? settings['vmu.safety.maxCpuMs'] : 0)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** `vmu.safety.maxMemoryMb`: 0 means no ceiling. It是 the SECURITY gate; `vmu.limits.memoryCeilingMb` remains the limits one. */
export function readSafetyMemoryMb(settings) {
  const n = Number(settings ? settings['vmu.safety.maxMemoryMb'] : 0)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** `vmu.safety.capabilityMatrix`: the built-in minimal set gives an external reviewer read-only artifacts（docs/20 §2）. */
export function readCapabilityMatrix(settings) {
  const raw = settings ? settings['vmu.safety.capabilityMatrix'] : undefined
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
  return { 'external-reviewer': ['read-artifacts'] }
}

/** `vmu.safety.approvalRequired` ∪ `vmu.safety.askOn` - declared with the same default in docs/20, so one judgement reads both. */
export function readApprovalRequired(settings) {
  const a = settings ? settings['vmu.safety.approvalRequired'] : undefined
  const b = settings ? settings['vmu.safety.askOn'] : undefined
  const list = []
  if (Array.isArray(a)) list.push(...a)
  if (Array.isArray(b)) list.push(...b)
  const kept = list.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim())
  return kept.length ? [...new Set(kept)] : ['publish', 'delete', 'network-egress']
}

/** Does this action need a human? Named, so a caller never has to guess. */
export function requiresApproval(settings, action) {
  const need = readApprovalRequired(settings)
  return { required: need.includes(String(action)), action: String(action), list: need }
}

/** Is this capability granted to this slot? Unknown slot ⇒ nothing is granted（closed by default）. */
export function capabilityOf(settings, { slot, capability } = {}) {
  const m = readCapabilityMatrix(settings)
  const granted = Array.isArray(m[String(slot)]) ? m[String(slot)] : []
  return { granted: granted.includes(String(capability)), slot: String(slot), capability: String(capability), grantedList: granted.slice() }
}

/** Commands that reach the network. A conservative, named list rather than a heuristic. */
const NET_CMDS = Object.freeze(['curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'nc', 'ncat', 'telnet'])   // ROUND 217: local `git` and package managers are NOT here - refusing them would break routine local work under the default no-network policy

/**
 * Decide a subprocess start. Refuses by name when the kill switch is on, when an allow-list exists and the command is not
 * in it, or when the network policy is `off` and the command is a known network client.
 */
export function guardExec({ settings = {}, argv = [] } = {}) {
  if (readKillSwitch(settings)) {
    throw refuse('VMU_SAFETY_KILL_SWITCH', 'vmu.safety.killSwitch=true: no subprocess may start',
      'clear vmu.safety.killSwitch (it is the global stop)')
  }
  const cmd = String((Array.isArray(argv) ? argv[0] : argv) || '').trim()
  if (!cmd) throw refuse('VMU_INVALID_ARGUMENT', 'guardExec needs a command', 'pass { argv: [cmd, …] }')
  const allow = readExecAllowlist(settings)
  const base = cmd.split(/[\\/]/).pop()
  if (allow.length > 0 && !allow.includes(cmd) && !allow.includes(base)) {
    throw refuse('VMU_SAFETY_EXEC_NOT_ALLOWED', 'the command is not in vmu.safety.execAllowlist: ' + cmd,
      'allowed: ' + allow.join(', ') + ' (vmu.safety.execAllowlist)')
  }
  const net = readNetPolicy(settings)
  if (net === 'off' && NET_CMDS.includes(base)) {
    throw refuse('VMU_SAFETY_NET_DENIED', 'vmu.safety.netPolicy=off but this command reaches the network: ' + base,
      'set vmu.safety.netPolicy=allowlist (and declare the host) or drop the command (vmu.safety.netPolicy)')
  }
  return { ok: true, command: cmd, base, netPolicy: net, allowlisted: allow.length === 0 ? null : true }
}

/** Compare elapsed CPU against `vmu.safety.maxCpuMs` - the twin of the memory gate above. */
export function cpuBudgetExceeded({ settings = {}, cpuMs = 0 } = {}) {
  const ceilingMs = readMaxCpuMs(settings)
  const used = Math.max(0, Math.round(Number(cpuMs || 0)))
  return { exceeded: ceilingMs > 0 && used > ceilingMs, ceilingMs, cpuMs: used }
}

/**
 * ROUND 217 extensions to the write guard: the kill switch stops every write; a path longer than `maxPathLength` is
 * refused; and when `followSymlinks` is false, an existing symlink anywhere on the path is refused BY NAME（docs/20 §4）.
 */
export function guardWriteExtended({ settings = {}, root, target, kind = 'write' } = {}) {
  if (readKillSwitch(settings)) {
    throw refuse('VMU_SAFETY_KILL_SWITCH', 'vmu.safety.killSwitch=true: the ' + kind + ' is refused',
      'clear vmu.safety.killSwitch (it is the global stop)')
  }
  const maxLen = readMaxPathLength(settings)
  const asText = String(target === undefined || target === null ? '' : target)
  if (asText.length > maxLen) {
    throw refuse('VMU_SAFETY_PATH_TOO_LONG', 'the path is longer than vmu.safety.maxPathLength: ' + asText.length + ' > ' + maxLen,
      'shorten the path, or raise vmu.safety.maxPathLength')
  }
  const g = guardWrite({ settings, root, target, kind })
  if (!readFollowSymlinks(settings)) {
    const abs = g.path
    const parts = String(abs).split(/[\\/]/).filter(Boolean)
    let cur = /^[\\/]/.test(String(abs)) ? '' : ''
    for (const p of parts) {
      cur = cur ? cur + '/' + p : (/^[A-Za-z]:$/.test(p) ? p + '/' : p)
      try { if (lstatSync(cur).isSymbolicLink()) throw refuse('VMU_SAFETY_SYMLINK_DENIED', 'vmu.safety.followSymlinks=false and the path crosses a symlink: ' + cur, 'resolve the link, or set vmu.safety.followSymlinks=true') } catch (e) { if (e && e.code === 'VMU_SAFETY_SYMLINK_DENIED') throw e }
    }
  }
  return g
}
