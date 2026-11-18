// vibe-math-vmu/kernel/jobmirror.js — THE ONE JOB-MIRROR PRIMITIVE (TB-2794 Step 5, extracted from mathjobs.js).
//
// WHY THIS FILE EXISTS: the durable <dir>/<jobId>.json ledger is shared by the computation face (now
// packs/research-core/mathjobs.js) and the KERNEL Lean engine (kernel/lean.js). Keeping it in the kernel means the Lean
// engine keeps working without importing a pack, and retention/capability-report rules exist ONCE.

/**
 * THE ONE JOB-MIRROR primitive (Round 2 · target 5): the durable `<dir>/<jobId>.json` ledger shared by the
 * computation face (`createMathJobs`) and the Lean face (`kernel/lean.js`). Extracted so retention and the
 * honest capability report exist ONCE (a second copy would be two authorities for one rule).
 *
 * Contract:
 *   · `write(jobId, rec)` — best-effort; the caller COUNTS failures. Returns
 *     `{ok:true, rel, exclusive}` | `{ok:false, code:'VMU_MATH_JOBS_MIRROR_UNWIRED'}` |
 *     `{ok:false, code:'VMU_MATH_JOB_ID_TAKEN'}` (**a SECOND process already owns this jobId**) |
 *     `{ok:false, reason:'retention-cap-without-removeText'}` (cap reached and no `removeText` seam: stop
 *     writing rather than grow without bound — counted, never silent) and reports `evicted` when it removed
 *     the oldest entry instead.
 *   · CROSS-PROCESS OWNERSHIP: when the host supplies `fs.writeTextExclusive(rel, text)` (implemented with
 *     `{ flag: 'wx' }` / `O_EXCL`), the FIRST write of a job id CLAIMS it atomically; a second process that
 *     minted the same id (ids are process-local unless the counter is durable) gets `VMU_MATH_JOB_ID_TAKEN`
 *     instead of silently overwriting the other process's mirror. Without that seam the face stays in the
 *     honest degraded mode (`admission().exclusiveCreate === false`, `crossProcess:'not-enforced'`).
 *   · `list()` — reads the directory; a file whose JSON is unreadable or carries a foreign `schema` is
 *     reported `corrupt:true` (never silently dropped).
 *   · `status()` — the capability facts an `admission()` can quote verbatim.
 */
export function createJobMirror({ fs = null, dir = null, keep = 0, clock = () => 0, onNote = () => {}, schema = null } = {}) {
  const records = new Map()
  const stats = { written: 0, failed: 0, skipped: 0, evicted: 0, listed: 0, corrupt: 0, idTaken: 0, exclusiveWrites: 0, leases: 0, leasesHeld: 0, leasesStolen: 0, leasesUnenforced: 0 }
  const enabled = () => !!(fs && typeof fs.writeText === 'function' && typeof fs.readText === 'function' && dir)
  const exclusiveCreate = () => !!(enabled() && typeof fs.writeTextExclusive === 'function')
  const relOf = (jobId) => String(dir).replace(/\/+$/, '') + '/' + String(jobId) + '.json'

  async function remove(jobId) {
    if (!enabled() || typeof fs.removeText !== 'function') return false
    try { await fs.removeText(relOf(jobId)); records.delete(String(jobId)); return true } catch (e) { return false }
  }

  async function write(jobId, rec) {
    const id = String(jobId)
    if (!enabled()) { stats.failed += 1; return { ok: false, code: 'VMU_MATH_JOBS_MIRROR_UNWIRED', message: '未注入 fs 接缝或镜像目录不可用' } }
    if (keep > 0 && !records.has(id) && records.size >= keep) {
      if (typeof fs.removeText !== 'function') {
        stats.skipped += 1
        onNote('mirror-skipped', id, { reason: 'retention-cap-without-removeText', cap: keep })
        return { ok: false, code: 'VMU_MATH_JOBS_MIRROR_UNWIRED', reason: 'retention-cap-without-removeText' }
      }
      const oldest = [...records.keys()][0]
      await remove(oldest)
      stats.evicted += 1
    }
    const payload = Object.assign({}, rec, { at: clock() })
    const body = JSON.stringify(payload, null, 1) + '\n'
    const isNew = !records.has(id)
    // CROSS-PROCESS CLAIM: the FIRST write of a job id is exclusive when the host offers the primitive.
    // Updates (same process, same id) keep the plain overwrite — the id is already ours.
    if (isNew && exclusiveCreate()) {
      let claimed
      try {
        claimed = await fs.writeTextExclusive(relOf(id), body)
      } catch (e) {
        const exists = !!(e && (e.code === 'EEXIST' || /exist/i.test(String(e && e.message))))
        if (!exists) {
          stats.failed += 1
          onNote('mirror-failed', id, { error: String((e && e.message) || e) })
          return { ok: false, code: 'VMU_MATH_JOBS_MIRROR_UNWIRED', error: String((e && e.message) || e) }
        }
        claimed = false
      }
      if (claimed === false) {
        stats.idTaken += 1
        onNote('job-id-taken', id, { reason: 'another process already owns this jobId (exclusive create refused)' })
        return { ok: false, code: 'VMU_MATH_JOB_ID_TAKEN', reason: 'exclusive-create-refused', rel: relOf(id) }
      }
      stats.exclusiveWrites += 1
      records.set(id, payload)
      stats.written += 1
      return { ok: true, rel: relOf(id), exclusive: true }
    }
    try {
      const okWrite = await fs.writeText(relOf(id), body)
      if (okWrite === false) throw new Error('writeText returned false')
      records.set(id, payload)
      stats.written += 1
      return { ok: true, rel: relOf(id), exclusive: false }
    } catch (e) {
      stats.failed += 1
      onNote('mirror-failed', id, { error: String((e && e.message) || e) })
      return { ok: false, code: 'VMU_MATH_JOBS_MIRROR_UNWIRED', error: String((e && e.message) || e) }
    }
  }

  /**
   * ROUND 9 · C — RECOVERY LEASE. The claim (`writeTextExclusive`) makes a jobId OURS at submit; it says nothing
   * about two instances that both find a crashed `running` mirror and both re-run it (measured: the same job was
   * executed twice, last mirror write wins). The same host primitive can lease the RECOVERY: a fresh
   * `<id>.lease` blocks the others, a STALE one is stolen.
   *
   * Honest limits (do not read this as a consensus lock):
   *   · it needs the host's exclusive create; without it, `enforced:false` is returned BY NAME;
   *   · the TTL is a clock guess — the caller passes `ttlMs` (≥ the job's own budget), so an ACTIVE run is not
   *     stolen, but a suspended machine can still lose its lease;
   *   · a recovering instance that dies mid-recovery still leaves an at-least-once run (inherent to crash
   *     recovery without a quorum).
   */
  const leaseRel = (jobId) => String(dir).replace(/\/+$/, '') + '/' + String(jobId) + '.lease'
  async function takeLease(jobId, owner, ttlMs) {
    if (!enabled()) return { ok: false, code: 'VMU_MATH_JOBS_MIRROR_UNWIRED' }
    const rel = leaseRel(jobId)
    const body = JSON.stringify({ owner: String(owner || ''), at: clock() })
    if (!exclusiveCreate()) {
      stats.leasesUnenforced += 1
      return { ok: true, held: true, stole: false, enforced: false, reason: 'no writeTextExclusive seam: no exclusion is possible' }
    }
    try {
      await fs.writeTextExclusive(rel, body)
      stats.leases += 1
      return { ok: true, held: true, stole: false, enforced: true }
    } catch (e) {
      const exists = !!(e && (e.code === 'EEXIST' || /exist/i.test(String(e && e.message))))
      if (!exists) return { ok: false, code: 'VMU_MATH_JOBS_MIRROR_UNWIRED', error: String((e && e.message) || e) }
    }
    let cur = null
    try { cur = JSON.parse(await fs.readText(rel)) } catch (e2) { cur = null }
    const age = cur && Number(cur.at) ? (clock() - Number(cur.at)) : Infinity
    if (age <= Math.max(0, Number(ttlMs) || 0)) {
      stats.leasesHeld += 1
      return { ok: true, held: false, enforced: true, owner: (cur && cur.owner) || '', ageMs: age }
    }
    try {
      await fs.writeText(rel, body)
      stats.leasesStolen += 1
      return { ok: true, held: true, stole: true, enforced: true, ageMs: age }
    } catch (e3) {
      return { ok: false, code: 'VMU_MATH_JOBS_MIRROR_UNWIRED', error: String((e3 && e3.message) || e3) }
    }
  }
  async function releaseLease(jobId) {
    if (!enabled() || typeof fs.removeText !== 'function') return false
    try { await fs.removeText(leaseRel(jobId)); return true } catch (e) { return false }
  }

  async function read(jobId) {
    if (!enabled()) return null
    try { return JSON.parse((await fs.readText(relOf(jobId))) || 'null') } catch (e) { return null }
  }

  async function list() {
    if (!enabled()) return []
    let entries = []
    try { entries = (await fs.listDir(dir)) || [] } catch (e) { entries = [] }
    const out = []
    for (const e of entries) {
      if (!e || e.type !== 'file' || !/\.json$/.test(String(e.name))) continue
      const jobId = String(e.name).replace(/\.json$/, '')
      const rec = await read(jobId)
      stats.listed += 1
      if (!rec || (schema && rec.schema !== schema)) { stats.corrupt += 1; out.push({ jobId, corrupt: true, rec: null }); continue }
      records.set(jobId, rec)
      out.push({ jobId, corrupt: false, rec })
    }
    return out
  }

  const status = () => ({
    enabled: enabled(),
    dir,
    keep,
    removeText: !!(fs && typeof fs.removeText === 'function'),
    exclusiveCreate: exclusiveCreate(),
    retention: (fs && typeof fs.removeText === 'function') ? 'evict-oldest-counted' : 'append-only-refuse-after-cap',
    count: records.size,
    written: stats.written, failed: stats.failed, skipped: stats.skipped, evicted: stats.evicted,
    listed: stats.listed, corrupt: stats.corrupt,
    idTaken: stats.idTaken, exclusiveWrites: stats.exclusiveWrites,
    leases: stats.leases, leasesHeld: stats.leasesHeld, leasesStolen: stats.leasesStolen, leasesUnenforced: stats.leasesUnenforced,
  })

  return { write, read, list, remove, status, enabled, exclusiveCreate, relOf, records, takeLease, releaseLease }
}
