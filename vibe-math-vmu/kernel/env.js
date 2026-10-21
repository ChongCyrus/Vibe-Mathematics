// vibe-math-vmu/kernel/env.js — PHASE 9 / goal 3: THE ENVIRONMENT ADAPTER (one face, one table, no per-ability copies).
//
// Contract:
//   · the NEED TABLE is policy data (`vmu.env.needs`, default from settings/env-needs.js). Adding an environment is a
//     data change; this kernel file does not name any particular tool except through that table;
//   · probe runs the table's `probe.command/args` through the INJECTED spawn seam and returns a RESULT (ok:false is a
//     normal answer, not an exception);
//   · report files a structured record through `records.put` — that is the main-agent notification channel;
//   · THIS FACE NEVER INSTALLS ANYTHING: installCommand is data returned to the caller, never executed here; there is
//     no network call and no permission request in this module.
import { ENV_NEEDS_DEFAULTS } from '../settings/env-needs.js'

export const apiVersion = 1
export const ENV_REPORT_TRACK = 'state'
export const ENV_REPORT_TAG = 'environment-missing'

export function refuse(code, message, hint) {
  const err = new Error(message)
  err.code = code
  err.hint = hint
  return err
}

const clone = (v) => JSON.parse(JSON.stringify(v))
const textOf = (v) => String(v === undefined || v === null ? '' : v)

export function createEnvFace({ settings = {}, spawn = null, records = null, log = () => {} } = {}) {
  const readKey = (k) => {
    if (settings && typeof settings.get === 'function') {
      const v = settings.get(k)
      if (v !== undefined) return v
    }
    if (settings && Object.prototype.hasOwnProperty.call(settings, k)) return settings[k]
    const nested = (settings && (settings.env || settings)) || {}
    const short = k.split('.').pop()
    if (nested && Object.prototype.hasOwnProperty.call(nested, short)) return nested[short]
    return undefined
  }
  const rawNeeds = readKey('vmu.env.needs')
  const table = () => {
    const raw = rawNeeds && typeof rawNeeds === 'object' && !Array.isArray(rawNeeds) ? rawNeeds : {}
    const merged = Object.assign({}, clone(ENV_NEEDS_DEFAULTS), clone(raw))
    return merged
  }
  const last = new Map()
  const known = () => Object.keys(table()).sort()
  const needOf = (name) => {
    const id = typeof name === 'string' ? name.trim() : ''
    if (!id || !Object.prototype.hasOwnProperty.call(table(), id)) {
      throw refuse('VMU_ENV_UNKNOWN_NEED', 'unknown environment need: ' + (id || '(empty)'),
        'known needs: ' + known().join(', '))
    }
    return id
  }
  const probeOne = async (id) => {
    const spec = table()[id]
    const probe = spec && spec.probe
    const base = {
      need: id,
      why: spec && spec.why ? String(spec.why) : null,
      installCommand: spec && spec.installCommand ? String(spec.installCommand) : null,
      requiresUser: spec && spec.requiresUser === true,
    }
    if (!probe || typeof probe.command !== 'string' || probe.command.length === 0) {
      return Object.assign(base, { ok: false, found: false, code: 'VMU_ENV_NO_PROBE',
        message: 'the need "' + id + '" declares no probe command', hint: 'add probe.command/probe.args to vmu.env.needs' })
    }
    if (typeof spawn !== 'function') {
      return Object.assign(base, { ok: false, found: false, code: 'VMU_ENGINE_UNAVAILABLE',
        message: 'no spawn seam is bound, so the environment cannot be probed',
        hint: 'the host installs the spawn seam (host-spawn.js); absence is named, never a fabricated version' })
    }
    let out = null
    // ★ PHASE 9 / round 5: the host's subprocess shape REQUIRES a positive grace budget. Without it the first real
    // probe was refused synchronously ("subprocess graceMs must be a positive finite number"). timeoutMs is what
    // host-spawn maps to the subprocess graceMs; graceMs is also carried for callers that read it directly.
    const probeTimeoutMs = (() => {
      const n = Math.floor(Number(readKey('vmu.env.probeTimeoutMs')))
      return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 2147483647) : 15000
    })()
    try {
      out = await spawn({ command: probe.command, args: Array.isArray(probe.args) ? probe.args.map(String) : [],
        timeoutMs: probeTimeoutMs, graceMs: probeTimeoutMs })
    } catch (e) {
      const result = Object.assign(base, { ok: false, found: false, code: (e && e.code) || 'VMU_ENV_PROBE_FAILED',
        message: 'probe threw: ' + String((e && e.message) || e), hint: (e && e.hint) || null })
      last.set(id, result)
      return result
    }
    const exitCode = out && Number.isFinite(Number(out.exitCode)) ? Number(out.exitCode) : null
    const stdout = textOf(out && out.stdout).trim()
    const stderr = textOf(out && out.stderr).trim()
    const found = exitCode === 0
    const version = found ? ((stdout.split(/\r?\n/).find((x) => x.trim()) || '').slice(0, 200) || null) : null
    const result = Object.assign(base, {
      ok: found,
      found,
      exitCode,
      resolved: out && typeof out.resolved === 'string' ? out.resolved : (out && out.resolved === null ? null : undefined),
      version,
      stdoutTail: stdout.slice(-500) || null,
      stderrTail: stderr.slice(-500) || null,
      hint: found ? null : 'not runnable here; installCommand is data for the caller/main agent — this face never installs anything; if it needs elevation, the main agent must ask the user and obtain authorization',
    })
    if (result.resolved === undefined) delete result.resolved
    last.set(id, result)
    return result
  }

  return {
    needs() { return table() },
    known,
    probe({ need = null, needs = null } = {}) {
      const names = Array.isArray(needs) ? needs.map((x) => needOf(x)) : [needOf(need)]
      return (async () => {
        const results = []
        for (const id of names) results.push(await probeOne(id))
        return names.length === 1 ? results[0] : { ok: results.every((r) => r.ok === true), results }
      })()
    },
    list() {
      const rows = known().map((id) => {
        const spec = table()[id]
        return { need: id, probe: spec && spec.probe ? clone(spec.probe) : null,
          installCommand: spec && spec.installCommand ? String(spec.installCommand) : null,
          requiresUser: !!(spec && spec.requiresUser === true),
          why: spec && spec.why ? String(spec.why) : null,
          auto: !(spec && spec.auto === false),
          last: last.has(id) ? clone(last.get(id)) : null }
      })
      return { ok: true, count: rows.length, needs: rows }
    },
    report({ need = null, why = null, detail = null } = {}) {
      const id = needOf(need)
      if (!records || typeof records.put !== 'function') {
        throw refuse('VMU_ENGINE_UNAVAILABLE', 'the records primitive is not mounted, so the missing environment cannot be reported',
          'assemble a kernel with records.put; this face never installs anything itself')
      }
      const body = JSON.stringify({ need: id, why: why === null ? null : String(why), detail: detail === null ? null : detail,
        hint: 'probe with vibe_vmu_env; installCommand is data only — ask the main agent/user for authorization before installing' })
      const rec = records.put({ track: ENV_REPORT_TRACK, kind: 'finding', title: 'environment missing: ' + id,
        body, tags: ['env', id, ENV_REPORT_TAG], settled: false, by: 'vibe_vmu_env' })
      log('vmu.env: reported missing ' + id + ' as ' + String(rec && rec.id))
      return { ok: true, need: id, track: ENV_REPORT_TRACK, kind: 'finding', record: rec && rec.id ? String(rec.id) : null,
        title: rec && rec.title ? String(rec.title) : null, tags: ['env', id, ENV_REPORT_TAG],
        hint: 'the main agent reads this finding and asks the user for authorization before installing anything; this face never installs' }
    },
  }
}
