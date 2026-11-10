/**
 * ONE definition of the generator CLI contract. Every script that owns a generated document derives its mode from
 * here, so the family cannot drift into "some of us write with no flag and some of us refuse".
 *
 * THE CONTRACT (TB-2698):
 *   no flag            => READ  : compute, report what WOULD change, write nothing, exit 0;
 *   --check            => CHECK : same report, exit 1 when anything would change;
 *   --write            => WRITE : rewrite the generated document(s);
 *   --write + --check  => refused (CONFLICTING_MODES), exit 2;
 *   any other `-flag`  => refused (UNKNOWN_FLAG), named, exit 2.
 *
 * WHY THE DEFAULT IS READ AND NOT WRITE. On 2026-11-10 `node scripts/update-doc-counts.mjs` (whose header said
 * "rewrite in place") and `node scripts/generate-coverage-debt.mjs` (whose write had no mode branch at all) dirtied
 * six documents during what their caller believed was a verification run. A read-only-looking command must not change
 * what it measures, and a rule that only works when someone remembers a flag is not a rule. Refusing an unknown flag
 * is the same idea from the other side: a typo must not silently select a mode.
 *
 * USAGE
 *   import { modeFrom } from './_lib/generator-cli.mjs'
 *   const MODE = modeFrom(process.argv, { script: 'generate-foo.mjs', allow: ['--json'] })
 *   if (MODE === 'write') { ...write... } else { ...report, and process.exit(MODE === 'check' && stale ? 1 : 0)... }
 *
 * `allow` names the non-mode flags the script legitimately takes (`--json`, `--out=`, ...). A trailing `=` means the
 * flag consumes the next argument as its value. Flags passed to node itself never reach this parser: it reads argv and
 * skips argv[0]/argv[1] exactly like a normal CLI.
 */

export const MODES = ['read', 'check', 'write']

/** A refusal that must end the process with exit 2: the caller asked for something ambiguous, not for a result. */
export class CliRefusal extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'CliRefusal'
    this.code = code
  }
}

const MODE_FLAGS = new Set(['--write', '--check'])
const READ_ALIASES = new Set(['--dry', '--dry-run'])

/**
 * Parse a generator's argv into exactly one mode plus the declared extras.
 * Throws CliRefusal (never exits) so callers/tests can state the contract without a subprocess.
 */
export function parseMode(argv, { script = 'generator', allow = [] } = {}) {
  const args = Array.isArray(argv) ? argv.slice(2) : []
  const allowed = new Set()
  const withValue = new Set()
  for (const a of allow) {
    if (a.endsWith('=')) withValue.add(a.slice(0, -1))
    else allowed.add(a)
  }
  let write = false
  let check = false
  const extras = []
  const unknown = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (MODE_FLAGS.has(a)) {
      if (a === '--write') write = true
      else check = true
      continue
    }
    if (READ_ALIASES.has(a)) continue
    if (allowed.has(a)) { extras.push(a); continue }
    if (withValue.has(a)) {
      const v = args[i + 1]
      if (v === undefined || v.startsWith('-')) throw new CliRefusal('MISSING_VALUE', script + ': ' + a + ' needs a value')
      extras.push(a, v)
      i++
      continue
    }
    if (a.startsWith('-')) unknown.push(a)
    else extras.push(a)
  }
  if (unknown.length) {
    throw new CliRefusal('UNKNOWN_FLAG', script + ': refusing unknown flag(s) ' + unknown.map((u) => JSON.stringify(u)).join(', ') +
      ' - accepted: --write, --check (no flag = read-only)' + (allow.length ? ', ' + allow.join(', ') : ''))
  }
  if (write && check) {
    throw new CliRefusal('CONFLICTING_MODES', script + ': refusing --write together with --check - they ask for opposite outcomes')
  }
  return { mode: write ? 'write' : check ? 'check' : 'read', extras, args }
}

/**
 * parseMode, but a refusal is printed and becomes exit 2. This is the call a script makes at start-up: it must happen
 * before any work, so a refused invocation cannot write a single byte.
 */
export function modeFrom(argv, opts = {}) {
  try {
    return parseMode(argv, opts).mode
  } catch (e) {
    if (!(e instanceof CliRefusal)) throw e
    process.stderr.write(e.message + '\n')
    process.stderr.write('GENERATOR-CLI: refused (' + e.code + '), exit 2\n')
    process.exit(2)
  }
}

/** True for the only mode allowed to touch a generated file. */
export const isWriteMode = (mode) => mode === 'write'

/** The exit code for a read/check report: a stale tree is a RED under --check and a REPORT under no flag. */
export const exitCodeFor = (mode, stale) => (mode === 'check' && stale ? 1 : 0)
