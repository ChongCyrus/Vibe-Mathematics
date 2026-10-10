// vmu kernel guard — the ENFORCEMENT point for the resolved settings that otherwise only exist on paper.
//
// CONVENTION (learned by getting it wrong): a key is "wired" when a RUNTIME SOURCE reads it, and the settings
// table and the docs audit both decide that by scanning file text for the key LITERAL. Composing the key from
// parts hides the read from both scanners and makes the two checks disagree, so the readers below use plain
// literals; only the human-facing hint text composes the name.
import { dirname, isAbsolute, join, normalize, relative } from 'node:path'

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
