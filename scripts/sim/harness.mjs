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
import { performance } from 'node:perf_hooks'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promptSettings } from './settings.mjs'
import { tmpRoot as gateTmpRoot } from '../lib/tmp-root.mjs'

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

/**
 * Normalise what a scenario's `deliver` returns into one of FOUR NAMED ANSWERS (TB-2630).
 *
 * ★★★ RUN 254-B / P1-6 — AN OBJECT IS NOT A REPLY TEXT, AND `String(obj)` WAS HIDING THE SHAPE DEFECT. A scenario
 * that handed back a HOST DELIVERY ENVELOPE (`{output:[{type:'text',…}]}` — the shape a delegated child result has,
 * not the shape a reply has) used to be coerced into the literal `[object Object]` by the old pass-through. The kernel
 * then read 15 characters of prose, so "the host delivered the wrong shape" never reached the kernel and no gate
 * could refuse it: the simulator itself manufactured a well-formed-looking reply out of a defect.
 *
 * ★★★ TB-2630 — THE SIMULATOR MUST BE ABLE TO REPRODUCE THE ADAPTER'S REFUSALS, NOT ONLY THE MEMBER'S. The four
 * answers this function can return are deliberately different FACTS, and the caller turns the two named faults into
 * named refusals at the seam (a real host adapter that hands back junk makes the loop refuse; a simulator whose
 * adapter is scripted must make the SAME refusal, or "sim proves the mechanism" is false for this whole family):
 *   1. a string (or ContentBlock[] / {text} / {reply}) ⇒ the reply TEXT, judged by the kernel: prose without a fence
 *      is `VMU_TURN_NO_FENCE`, and the simulator must not pre-empt that judgement;
 *   2. an unrecognised OBJECT ⇒ `{ code: 'VMU_TURN_DELIVERY_SHAPE', keys, shape, value, means }`;
 *   3. `null` / `undefined` ⇒ `{ code: 'VMU_TURN_DELIVERY_NO_PAYLOAD', shape: 'no-payload', … }` — NO PAYLOAD is not
 *      a wrong shape: one says "the adapter sent the wrong thing", the other says "the adapter sent nothing", and
 *      they have different fixes (the two codes are asserted `notStrictEqual`).
 * Both named faults keep the original value under `value`, so a refusal (and a probe) names what actually arrived
 * instead of the 15-character `[object Object]` fabrication.
 */
export function replyTextOf(reply) {
  if (typeof reply === 'string') return reply
  if (Array.isArray(reply)) return promptTextOf(reply)
  if (reply && typeof reply === 'object' && typeof reply.text === 'string') return reply.text
  if (reply && typeof reply === 'object' && typeof reply.reply === 'string') return reply.reply
  // ★ TB-2630: FOUR ANSWERS, TWO NAMED FAULTS, AND THE TWO FAULTS ARE NOT THE SAME FAULT. "the adapter handed back no
  // payload at all" (null/undefined) and "the adapter handed back a shape this boundary cannot read" (an object) are
  // different defects with different fixes, so they carry different codes. Before this, `null` fell through to the
  // empty string and an unknown object was only a marker, so the one thing a corpus could never show was WHICH kind of
  // adapter fault it had seen. Texts (a bare string, ContentBlock[], {text}, {reply}) still return a STRING, because
  // the boundary must not change the shape the kernel judges: prose without a fence is the kernel's `VMU_TURN_NO_FENCE`.
  if (reply === undefined || reply === null) {
    return {
      code: 'VMU_TURN_DELIVERY_NO_PAYLOAD',
      shapeError: 'a scenario answered with no payload at all',
      shape: 'no-payload',
      keys: [],
      value: reply,
      means: 'the delivery adapter returned no payload at all — there is no reply text and no envelope, so this is SILENCE AT THE ADAPTER BOUNDARY: not a member that wrote prose without a fence (VMU_TURN_NO_FENCE), and not a shape that was read wrongly. Fix the adapter, not the member prompt',
    }
  }
  // An object this boundary does not recognise is a SHAPE ERROR, not text. Hand the structure down untouched: the
  // marker keeps the original value under `value` so the kernel refusal (and a probe) can name what actually arrived.
  return {
    code: 'VMU_TURN_DELIVERY_SHAPE',
    shapeError: 'a scenario answered with an object where a reply TEXT was expected',
    shape: reply && typeof reply === 'object' && Array.isArray(reply.output) ? 'delivery-envelope' : 'object',
    keys: reply && typeof reply === 'object' ? Object.keys(reply) : [],
    value: reply,
    means: 'the reply was not a string / ContentBlock[] / {text} / {reply}; the simulator passes the object through instead of stringifying it, so the kernel can refuse the delivery shape by name (VMU_TURN_DELIVERY_SHAPE) instead of reading [object Object] as a member answer',
  }
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
  /**
   * ★ TB-2630: A NAMED BOUNDARY FAULT MUST BE THROWN WHERE A REAL HOST WOULD HAVE RETURNED THE JUNK. The kernel's
   * `VMU_TURN_DELIVERY_SHAPE` gate sits ABOVE `deliverViaSubagents`, whose one-shot branch only resolves text out of
   * `result.output` / `result.reply` and otherwise throws `VMU_ENGINE_UNAVAILABLE` itself — so a scripted adapter that
   * merely "returns an object" can never reach that gate (measured: the receipt said `the host accepted the turn but
   * handed back no reply`). The sim's adapter therefore refuses at ITS boundary with the kernel's own code, carrying
   * the same keys/shape/value the kernel gate would have named. Throwing is what a real host service does too: a
   * service that answers with a shape its caller cannot read has broken the contract, and the loop records the code
   * unchanged (it never rewrites a seam's refusal into something friendlier).
   */
  const namedFault = (fault, kind, provider, label, text) => {
    const keys = Array.isArray(fault.keys) ? fault.keys : []
    const err = new Error(fault.code === 'VMU_TURN_DELIVERY_NO_PAYLOAD'
      ? 'the DELIVERY ADAPTER returned no payload at all: there is no reply text and no envelope, so this turn was never answered — this is NOT a member that stayed silent and NOT a reply without a fence'
      : 'the DELIVERY ADAPTER returned a shape this simulator cannot read: an object with keys [' + keys.join(', ') + '] — the reply text was never handed over by the seam, so this is NOT a member that stayed silent and NOT a reply without a fence')
    err.code = fault.code
    err.shape = fault.shape
    err.keys = keys
    err.value = fault.value
    err.replyShape = fault.shape === 'no-payload' ? 'no-payload' : 'shape-error'
    err.means = fault.means
    err.deliveryPath = 'simulated-subagents:' + kind
    err.deliveryAdapter = { kind, provider, label, replyShape: err.replyShape, shape: fault.shape, keys }
    err.hint = fault.code === 'VMU_TURN_DELIVERY_NO_PAYLOAD'
      ? 'a scripted adapter must resolve to one of the accepted reply shapes (docs/26 §3.22): a bare string, { reply: <string> }, or { text: <string> }. `null`/`undefined` is SILENCE AT THE ADAPTER, not a member answer — fix the script that produced the reply, and do not suppress this code downstream'
      : 'a scripted adapter must resolve to one of the accepted reply shapes (docs/26 §3.22): a bare string, { reply: <string> }, or { text: <string> }. The keys actually received are named above; the kernel\'s own gate uses the same code for the same fact (VMU_TURN_DELIVERY_SHAPE)'
    return err
  }
  const answer = async (kind, provider, request) => {
    seq += 1
    const text = promptTextOf(request && request.prompt)
    const label = String((request && request.label) || 'sim-child-' + seq)
    const reply = replyTextOf(await deliver({ provider, label, kind, text }))
    // ★ RUN 254-B / P1-6 + TB-2630: `reply` is TEXT unless the scripted adapter broke the contract; then it is the
    // NAMED fault marker, `replyShape` says which fault it was in the corpus (instead of a character count being
    // invented for it), and the seam throws it so the receipt carries the code instead of degrading to "no reply".
    const fault = typeof reply === 'string' ? null : reply
    delivered.push({ seq, kind, provider, label, chars: text.length,
      replyChars: typeof reply === 'string' ? reply.length : 0,
      replyShape: fault === null ? 'text' : (fault.shape === 'no-payload' ? 'no-payload' : 'shape-error'),
      faultCode: fault === null ? null : fault.code, text, reply })
    if (fault !== null) throw namedFault(fault, kind, provider, label, text)
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
  // ★ TB-2602 — THE OTHER HALF OF A RECEIPT: WHICH SEAT'S NEXT PROMPT CARRIED IT. Two additive ledgers make that a
  // measurement instead of a guess, and neither changes the shape of `receipts.jsonl`:
  //   `calls` — monotonic timing per call (startedAt/endedAt, ms since boot). A pair can then PROVE the prompt was
  //             assembled AFTER the receipt, instead of trusting array order.
  //   `mail`  — for every call that queued mail, the (mail id, recipient) rows it created, found by diffing each
  //             member's un-acked mailbox ids ACROSS that call. Attribution is observed, not inferred from wording.
  const calls = []
  const mail = []
  const bootAt = performance.now()
  const since = () => Math.round(performance.now() - bootAt)
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

  /** The live roster, as member ids. Empty before the institute is founded, which is why an early call diffs nothing. */
  const rosterIds = () => {
    try {
      const r = handle.kernel && handle.kernel.members && typeof handle.kernel.members.roster === 'function' ? handle.kernel.members.roster() : null
      return (Array.isArray(r) ? r : []).map((m) => (m && m.id) || m).filter(Boolean).map(String)
    } catch (e) { return [] }
  }
  /**
   * Every member's un-acked mailbox rows, right now. `noticeLines` is the NON-DESTRUCTIVE read the turn loop itself
   * uses (only `ack()` settles a row), so snapshotting it here changes nothing a scenario can observe — and it is the
   * same source the prompt's `[新到的消息]` block is rendered from, which is what makes the receipt-to-prompt pairing
   * evidence rather than correlation.
   */
  const boxesNow = () => {
    const out = {}
    const mb = handle.kernel && handle.kernel.mailbox
    if (!mb || typeof mb.noticeLines !== 'function') return out
    for (const m of rosterIds()) {
      try {
        const n = mb.noticeLines(m, { limit: 500 })
        out[m] = (Array.isArray(n.entries) ? n.entries : []).map((e) => ({
          id: String(e.id), from: e.from || null, kind: e.kind || null, subject: e.subject || null,
        }))
      } catch (e) { out[m] = [] }
    }
    return out
  }

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
      calls.push({ seq, tool: name, startedAt: since(), endedAt: since() })
      return miss
    }
    const exec = as === null ? { kernel: handle.kernel } : { kernel: handle.kernel, agent: as.agent }
    const startedAt = since()
    const boxesBefore = boxesNow()
    let raw
    let receipt
    try {
      raw = await spec.execute(args, exec)
      receipt = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (e) {
      receipt = { ok: false, code: (e && e.code) || null, message: String((e && e.message) || e) }
    }
    const endedAt = since()
    receipts.push({ seq, tool: name, as: as && as.agent ? as.agent.id : 'office', args, receipt })
    calls.push({ seq, tool: name, startedAt, endedAt })
    // Which mail this ONE call created: the ids that appeared in a member's box between the two snapshots. A mail id
    // that only becomes visible on a later read (a shared-store merge) is attributed to the call that first made it
    // visible, which is the honest answer for "what did this call tell the members".
    const boxesAfter = boxesNow()
    const fresh = []
    for (const m of Object.keys(boxesAfter)) {
      const had = new Set((boxesBefore[m] || []).map((x) => x.id))
      for (const e of boxesAfter[m]) if (!had.has(e.id)) fresh.push(Object.assign({ to: m }, e))
    }
    if (fresh.length) mail.push({ seq, tool: name, rows: fresh, means: 'the member boxes gained these rows during this call; the ids come from diffing mailbox.noticeLines before and after, so the attribution is observed rather than inferred from the wording' })
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
    // ★★★ RUN 254-B / P1-5 — THE SIMULATOR'S ASSEMBLY MUST READ THE SAME NOTICE PRODUCER AS A REAL TURN. This loop
    // used to be built WITHOUT `noticeBlock`/`noticeSource`, so a seat with un-acked mail rendered no
    // `[新到的消息]` block in a simulated prompt while the same seat's REAL turn (kernel/index.js wiring) did. A ruler
    // that measures a prompt without the notices under-measures the text a member reads — the same class of defect
    // RUN 226 (missing bindings/settings) and RUN 244 (missing faces) fixed. The pack's block wins and the kernel's is
    // the fallback, exactly as `vibe-math-vmu.js:573` chooses for the kernel (`noticeBlock || V5R_INBOX_BLOCK`).
    const { inboxBlock: kernelInboxBlock } = await import(pathToFileURL(join(VMU, 'kernel', 'notices.js')).href)
    let packInboxBlock = null
    if (Array.isArray(packs) && packs.includes('v5r')) {
      const packNotices = await import(pathToFileURL(join(VMU, 'packs', 'v5r', 'notices.js')).href)
      packInboxBlock = typeof packNotices.inboxBlock === 'function' ? packNotices.inboxBlock : null
    }
    const noticeBlock = packInboxBlock || kernelInboxBlock
    // The other half of the channel: the kernel's `noticeSource` (kernel/index.js:2990-3005) folds the Lean one-shot
    // notices with the member's mailbox lines (limit 8, newest first, non-destructive — only ack settles them). Without
    // this the block renders EMPTY even with mail waiting, which is the half that P1-5 measured.
    const noticeMailbox = handle.kernel && handle.kernel.mailbox && typeof handle.kernel.mailbox.noticeLines === 'function' ? handle.kernel.mailbox : null
    const noticeLean = handle.kernel && handle.kernel.lean && typeof handle.kernel.lean.takeNoticesFor === 'function' ? handle.kernel.lean : null
    // ★ TB-2602: the notice channel is also the RECEIPT-TO-PROMPT channel, so it is captured as data. `noticeCapture`
    // holds the exact lines this assembly handed to the renderer plus the mailbox rows they came from (same order:
    // `noticeLines()` renders `entries` one-for-one). A pair can then quote the line the model read AND name the mail
    // id it came from, instead of matching wording.
    let noticeCapture = null
    const noticeSource = (member) => {
      const leanNotices = noticeLean ? noticeLean.takeNoticesFor(member) : []
      let mailNotices = []
      let entries = []
      try {
        const notice = noticeMailbox ? noticeMailbox.noticeLines(String(member), { limit: 8 }) : null
        if (notice && Array.isArray(notice.lines)) mailNotices = notice.lines
        if (notice && Array.isArray(notice.entries)) entries = notice.entries
      } catch (e) { /* best effort, exactly like the kernel: a broken mailbox must not make every assembly fail */ }
      noticeCapture = {
        member: String(member),
        lines: mailNotices.slice(),
        mailIds: entries.map((e) => (e && e.id ? String(e.id) : null)),
        leanLines: (Array.isArray(leanNotices) ? leanNotices : []).slice(),
        means: 'the lines the kernel handed to noticeBlock for this assembly, aligned with the mailbox rows they were rendered from (noticeLines renders entries one-for-one); leanLines are the Lean one-shot notices, which carry no mail id',
      }
      return [...(Array.isArray(leanNotices) ? leanNotices : []), ...mailNotices]
    }
    loop = createTurnOrchestrator({
      sectionPolicy: decideSections,
      settings: layer,
      faces: (handle.kernel && handle.kernel.faces && typeof handle.kernel.faces === 'object') ? handle.kernel.faces : {},
      prompt: createPromptPipeline({ sections, bindings, clock: () => new Date(Number(clock())).toISOString() }),
      noticeBlock,
      noticeSource,
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
      noticeCapture = null
      const assembledAt = since()
      const asm = await loop.assemble(loop.open({ member: holder, role: seat, roleLabel: label, phase, round, roster, statusBlock, meeting, settings: layer }).turn)
      const text = String(asm.text || '')
      // ★ TB-2602: an assembly is ORDERED EVIDENCE, not just text. `assembly` is the global assembly number, and
      // `afterReceipts` is how many tool calls had already happened when this prompt was built — so a pair can prove
      // the prompt came after its receipt instead of relying on the order the scenario happened to log things.
      prompts.push({
        seat, phase, round, chars: text.length, text,
        assembly: prompts.length + 1,
        assembledAt,
        afterReceipts: receipts.length,
        member: holder,
        notices: noticeCapture,
      })
      return text
    }
  }

  const tree = (opts) => snapshotTree(root, opts)
  return { root, handle, kernel: handle.kernel, records: handle.kernel.records, specs, names, specOf, call, receipts, prompts, delivered, promptLayer, tree, mail, calls }
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

// A scenario's scratch space comes from the ONE temporary root (scripts/lib/tmp-root.mjs): which drive exists is a
// property of the machine, not of the mechanism under test, and VMU_TMP_ROOT must move this directory too.
export function tmpRoot(tag) {
  const base = join(gateTmpRoot(), 'sim')
  mkdirSync(base, { recursive: true })
  return mkdtempSync(join(base, tag + '-'))
}
