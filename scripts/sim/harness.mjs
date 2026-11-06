// scripts/sim/harness.mjs — a FAITHFUL, LLM-FREE driver for the real vmu kernel.
//
// WHY THIS EXISTS: a live SLV run costs ~30 minutes and a language model, so the mechanism can only be probed a few
// times a day. This harness boots the REAL kernel (same `apply()` entry, same packs, same tool registry) in a throwaway
// workspace and drives it with a SCRIPTED agent, recording three things per step:
//
//   ① the complete receipt (JSON, exactly what a member would read),
//   ② the complete prompt text a turn would have been assembled from,
//   ③ a snapshot of the workspace file tree (paths + sizes + sha256).
//
// What it proves: the mechanism is coherent (faces reach state, receipts answer their own questions, files and rows
// agree). What it does NOT prove: how a language model behaves — that still needs the live run. The corpus it writes is
// the input to the audits in `scripts/sim/audit/`.

import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promptSettings } from './settings.mjs'

// DERIVED, never hard-coded: this file lives at <repo>/scripts/sim/harness.mjs, so two hops up is the repo.
export const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const VMU = join(REPO, 'vibe-math-vmu')

const sha = (buf) => 'sha256:' + createHash('sha256').update(buf).digest('hex')

/** Walk a directory into stable, comparable records: [{ path, bytes, sha256 }] (sorted by path). */
export function snapshotTree(root, { skip = ['node_modules', '.git'] } = {}) {
  const out = []
  const walk = (dir) => {
    let entries
    try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (skip.includes(e.name)) continue
      const abs = join(dir, e.name)
      if (e.isDirectory()) { walk(abs); continue }
      let st
      try { st = statSync(abs) } catch { continue }
      let digest = null
      try { digest = sha(readFileSync(abs)) } catch { digest = null }
      out.push({ path: relative(root, abs).split('\\').join('/'), bytes: st.size, sha256: digest })
    }
  }
  walk(root)
  return out
}

/** Load the pack's section list once: the same PACK the runtime loads for a `packs:['v5r']` institute. */
async function packSections() {
  const { PACK } = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'prompts', 'v5r-core.js')).href)
  const { collectPackSections } = await import(pathToFileURL(join(VMU, 'kernel', 'pack.js')).href)
  return { sections: collectPackSections([PACK]), bindings: PACK.bindings }
}

/** The text a prompt block list carries: the same reading the kernel's delivery face does. */
function promptTextOf(prompt) {
  if (typeof prompt === 'string') return prompt
  if (Array.isArray(prompt)) return prompt.map((b) => (b && b.type === 'text' ? String(b.text || '') : '')).join('')
  if (prompt && typeof prompt === 'object' && typeof prompt.text === 'string') return prompt.text
  return prompt === undefined || prompt === null ? '' : String(prompt)
}

/** Normalise what a scenario's `deliver` returns (a string, {text}, or ContentBlock[]) into one string. */
function replyTextOf(reply) {
  if (typeof reply === 'string') return reply
  if (Array.isArray(reply)) return promptTextOf(reply)
  if (reply && typeof reply === 'object' && typeof reply.text === 'string') return reply.text
  if (reply && typeof reply === 'object' && typeof reply.reply === 'string') return reply.reply
  return reply === undefined || reply === null ? '' : String(reply)
}

/**
 * A HOST-SHAPED subagents service, driven by a scenario-supplied `deliver`.
 *
 * WHY A SERVICE AND NOT A `config.deliver` HOOK: the production entry builds its turn deliverer from the HOST's
 * `ctx.get('subagents')` (`vibe-math-vmu.js:483`, `host-deliver.js:81`); `config.deliver` is only the REPORT transport.
 * A simulator that injected a reply hook there would be exercising a seam the deployment does not have. So the seam
 * this harness adds is the one the real host occupies: a service with the documented verbs, whose `start` /
 * `startActivation` asks the scenario for the child's answer. That is what DELEGATED means here - the kernel really
 * goes through `deliverViaSubagents`, the really-real refusal paths stay reachable, and only the language model is
 * replaced by script.
 *
 * Both verbs are provided: `list()` names a provider so the one-shot path is reachable (the path a real host takes per
 * `host-deliver.js`'s header), and `startActivation` is there for the activation path when the caller prefers it.
 */
function simulateSubagents(deliver, delivered) {
  let seq = 0
  const answer = async (kind, provider, request) => {
    seq += 1
    const text = promptTextOf(request && request.prompt)
    const label = String((request && request.label) || 'sim-child-' + seq)
    const reply = replyTextOf(await deliver({ provider, label, kind, text }))
    delivered.push({ seq, kind, provider, label, chars: text.length, replyChars: reply.length, text, reply })
    return { output: [{ type: 'text', text: reply }], stopReason: 'end_turn' }
  }
  const activationOf = async (spec) => {
    const result = await answer('activation', spec && spec.provider, spec && spec.request)
    return { childId: 'sim-child-' + seq, messageId: 'sim-msg-' + seq, result: Promise.resolve(result), dispose: async () => {} }
  }
  return {
    list: () => ['sim'],
    interrupt: async () => {},
    sendMessage: async () => 'sim-msg',
    async start(provider, request) {
      const result = await answer('one-shot', provider, request)
      return { childId: 'sim-child-' + seq, messageId: 'sim-msg-' + seq, result: Promise.resolve(result), dispose: async () => {} }
    },
    startActivation: activationOf,
  }
}

/**
 * Boot a real kernel and hand back a `call` that goes through the tool registry exactly like the host does.
 *
 * opts:
 *   root      workspace directory (created if missing; pass mkdtempSync for a throwaway one)
 *   packs     pack ids to load (default ['v5r'])
 *   clock     () => number|string — a FIXED clock keeps the corpus comparable between runs
 *   withPrompt  also boot the prompt pipeline + turn orchestrator for prompt capture (default true)
 *   settings  the `config.vmu` a deployment declares (null = the deployment defaults)
 *   deliver   ★ THE DELEGATED SEAM: `async ({ provider, label, kind, text }) => reply`. When present, `ctx.get`
 *             answers 'subagents' with a host-shaped service (see `simulateSubagents`) and 'agents' with a minimal
 *             service exposing the root Agent the delivery seam needs as `parent`. ABSENT (the default) ⇒ the ctx has
 *             no `get` at all, so `boot()` behaves exactly as before and the missing-seam refusal stays observable.
 */
export async function boot({ root, packs = ['v5r'], clock = () => 1_800_000_000_000, withPrompt = true, settings = null, deliver = null } = {}) {
  mkdirSync(root, { recursive: true })
  const specs = []
  const receipts = []
  const prompts = []
  const delivered = []
  const ctx = {
    effect: (fn) => fn(),
    on: () => () => {},
    tools: { register: async (spec) => { specs.push(spec); return () => {} } },
  }
  // ★ THE DELEGATED SEAM (task-15 / RUN 226): only installed when the scenario asked for it, so the default ctx is
  // byte-for-byte the old one. The root Agent is what `host-deliver.js:211` demands before a tick-driven member turn
  // may be delegated at all; its shape is the one the seam reads (`options` + `session.header`).
  if (typeof deliver === 'function') {
    const subs = simulateSubagents(deliver, delivered)
    const rootAgent = { options: { provider: 'sim', model: 'sim' }, session: { id: 'sim-session', header: { id: 'sim-session' } } }
    const agents = { list: () => ['sim-session'], get: () => rootAgent, currentInitiator: () => rootAgent }
    ctx.get = (name) => (name === 'subagents' ? subs : name === 'agents' ? agents : null)
  }
  const entry = await import(pathToFileURL(join(VMU, 'vibe-math-vmu.js')).href)
  // SETTINGS ARE PART OF THE MECHANISM, NOT A TEST DETAIL. A policy whose default makes a path unreachable
  // (`vmu.meetings.lateAfterMs` defaults to 0, so nobody is ever late) can only be exercised if the deployment can
  // declare it — and real deployments do exactly this under `config.vmu`. A scenario that cannot declare settings can
  // only test the defaults, which is how a whole feature (late admission) stayed unexercised in the simulator.
  const handle = entry.apply(ctx, Object.assign({ clock, packs, root }, settings === null ? {} : { vmu: settings }))
  await handle.ready()
  await handle.kernel.store.open()

  const specOf = (name) => specs.filter((s) => s && s.name === name)[0] || null
  const names = () => specs.map((s) => s && s.name).filter(Boolean).sort()

  /**
   * Call one tool. `as` is the caller identity the host would supply: omit it for the office (root), or pass
   * `{ agent: { id: 'r-1' } }` to act as a member's own session. This is the same shape `resolveTurnMember` reads, so a
   * simulated member call produces `memberActed:true` exactly like a live one.
   */
  const call = async (name, args = {}, { as = null } = {}) => {
    const spec = specOf(name)
    const seq = receipts.length + 1
    if (!spec) {
      const miss = { ok: false, tool: name, code: 'NO_SUCH_TOOL', at: seq }
      receipts.push({ seq, tool: name, as: as && as.agent ? as.agent.id : 'office', args, receipt: miss })
      return miss
    }
    const exec = as === null ? { kernel: handle.kernel } : { kernel: handle.kernel, agent: as.agent }
    let raw
    let receipt
    try {
      raw = await spec.execute(args, exec)
      receipt = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      receipt = { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) }
    }
    receipts.push({ seq, tool: name, as: as && as.agent ? as.agent.id : 'office', args, receipt })
    return receipt
  }

  // ── prompt capture: the SAME pipeline the turn loop uses, so the text is the text a seat would read ──────────────
  let loop = null
  let promptLayer = null
  if (withPrompt) {
    const { createPromptPipeline } = await import(pathToFileURL(join(VMU, 'kernel', 'prompt', 'index.js')).href)
    const { createTurnOrchestrator } = await import(pathToFileURL(join(VMU, 'kernel', 'turn', 'index.js')).href)
    const { decideSections } = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'middleware', 'prompt-switches.js')).href)
    // SAME PARAMETERS AS THE ENTRY (vibe-math-vmu.js:658, :1159-1164; kernel/turn/index.js:2001-2013): without
    // `bindings` the role sections do not render (the chair prompt comes out ~4.6 K short) and without `settings` the
    // phase switches fall back to schema defaults. A simulated prompt SHORTER than the real one reports headroom that
    // does not exist, which is exactly the defect RUN 226 fixed in the budget gate.
    //
    // ★ RUN 226 FOLLOW-UP: THE SETTINGS LAYER IS NO LONGER REBUILT HERE. This block used to import a `defaultsOf` that
    // the schema module did not export, swallow the failed import with `.catch`, and assemble from `{}` — the same seat
    // then measured 1 304 characters shorter than the budget gate's number, so the simulator reported headroom that
    // does not exist. It now reads `scripts/sim/settings.mjs` — the ONE helper the gate also reads — and it is passed
    // to `createTurnOrchestrator`, exactly as the gate does (leaving it out silently resolved every phase switch to
    // the schema default, which was the second half of the same split).
    const layer = promptSettings(settings === null ? {} : settings)
    promptLayer = layer
    const { sections, bindings } = await packSections()
    // ★★★ RUN 244 — THE MEASUREMENT WAS MISSING THE FACTS CHANNEL, SO IT MEASURED A PROMPT NOBODY RECEIVES.
    // `createTurnOrchestrator` takes `faces` (a map of kernel service faces) and, when a turn is BOUND to a meeting,
    // reads `faces['vmu.meetings'].summary({meeting})` to fill `{{ setting:vmu.turn.meetingType }}` /
    // `…meetingChair` / `…meetingAgenda` (the `meetingFacts` block in `kernel/turn/index.js`). The entry always passes
    // that map; this harness did NOT, so every simulated meeting-phase prompt rendered the agenda line with EMPTY
    // values (`议程：（类型：，主席：）。`) and came out shorter than the text a real seat reads — the same class of
    // defect RUN 226 fixed for `bindings`/`settings`: a ruler that under-measures reports headroom that is not there.
    // The kernel exposes the SAME map it hands the entry, as `kernel.faces`.
    loop = createTurnOrchestrator({
      sectionPolicy: decideSections,
      settings: layer,
      faces: (handle.kernel && handle.kernel.faces && typeof handle.kernel.faces === 'object') ? handle.kernel.faces : {},
      prompt: createPromptPipeline({ sections, bindings, clock: () => new Date(Number(clock())).toISOString() }),
    })
    /**
     * Assemble the prompt a given seat WOULD receive in this phase, and record it.
     * `member` defaults to the seat's natural holder (`r-acad` for the chair, `r-1` otherwise), and can be pinned so a
     * measurement can use the EXACT inputs another ruler uses (the budget gate assembles every role as member `r-1`).
     */
    // `meeting` is what the turn is BOUND to. RUN 242 gated the on-floor manual (`v5r-turn-meeting-chamber`) and the
    // agenda line on `scope.meetingId === 'required'`, because a meeting-PHASE turn with no meeting bound was being fed
    // the manual for a floor that does not exist (FEEDBACK65 / sim-audit-prompts A7). So a measurement of what a
    // chair/member actually reads IN a meeting has to pass the id - `phase:'meeting'` alone no longer implies one.
    prompts.assembleFor = async ({ seat = 'chair', roleLabel = null, phase = 'normal', round = 1, roster = null, statusBlock = null, member = null, meeting = null }) => {
      const label = roleLabel === null ? (seat === 'chair' ? '院士' : seat === 'temp' ? '临时工' : '常驻研究员') : roleLabel
      const holder = member === null ? (seat === 'chair' ? 'r-acad' : 'r-1') : member
      const asm = await loop.assemble(loop.open({ member: holder, role: seat, roleLabel: label, phase, round, roster, statusBlock, meeting, settings: layer }).turn)
      const text = String(asm.text || '')
      prompts.push({ seat, phase, round, chars: text.length, text })
      return text
    }
  }

  const tree = (opts) => snapshotTree(root, opts)
  return { root, handle, kernel: handle.kernel, records: handle.kernel.records, specs, names, specOf, call, receipts, prompts, delivered, promptLayer, tree }
}

/** A corpus writer: one directory per run, three JSONL files plus a manifest. */
export function corpusAt(dir) {
  mkdirSync(dir, { recursive: true })
  return {
    dir,
    manifest: (obj) => writeJson(join(dir, 'manifest.json'), obj),
    receipts: (rows) => writeJsonl(join(dir, 'receipts.jsonl'), rows),
    prompts: (rows) => writeJsonl(join(dir, 'prompts.jsonl'), rows),
    tree: (rows) => writeJson(join(dir, 'tree.json'), rows),
    step: (name, obj) => writeJson(join(dir, 'steps', name + '.json'), obj),
  }
}

function writeJson(p, obj) {
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, JSON.stringify(obj, null, 2) + String.fromCharCode(10))
}
function writeJsonl(p, rows) {
  mkdirSync(join(p, '..'), { recursive: true })
  writeFileSync(p, rows.map((r) => JSON.stringify(r)).join(String.fromCharCode(10)) + String.fromCharCode(10))
}

export function tmpRoot(tag) {
  const base = 'D:/_tmp/sim'
  mkdirSync(base, { recursive: true })
  return mkdtempSync(join(base, tag + '-'))
}
