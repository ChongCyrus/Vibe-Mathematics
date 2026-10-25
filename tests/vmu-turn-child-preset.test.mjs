// ============================================================================================
// THE MEMBER SEAT IS WIRED, NOT JUST DECLARED — the setting must reach the child CREATION request.
//
// WHY (the user's own question: "would restricting a member's tools stop it from doing research, and can we do the
// restricted work for it?"). The answer taken was NOT "give the member fewer pack tools" — that would remove
// `vibe_vmu_bridge`, the only scoped computation channel — but "give the child a different PRESET whose composition
// drops the host escapes". The host offers exactly three per-child knobs (`cwd`, `agentPreset`, `outputSchema`), so a
// preset name is the only supported way to change a seat's tool surface at creation time.
//
// THE DEFECT CLASS THIS GATE EXISTS FOR: a setting that is declared, documented and read by nobody. The phase has hit
// it repeatedly (a `formal_agenda` parameter that was only echoed, a `prompt.turnId` that named no turn, a receipt
// field with no writer), and a declared preset that never reaches a request would be the same failure one layer up:
// the composition would exist, be gated, appear in `cordis.patch.yml` — and change nothing.
//
// WHAT IT PINS
//   (a) the bridge forwards the seat onto the ONE-SHOT request and onto the ACTIVATION request's `request` object;
//   (b) the default (no setting, or '') leaves the request byte-identical — no `agentPreset` key at all, so "inherit
//       the caller's preset" stays the behaviour every existing deployment already has;
//   (c) the seam READS the declared setting name, and the schema DECLARES it wired (two halves that can drift apart);
//   (d) the generated patch actually declares the preset that the setting would name — a seat name that resolves to no
//       composition would be a silently ignored instruction at the host.
//
// Usage: node tests/vmu-turn-child-preset.test.mjs
// ============================================================================================
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, resolve } from 'node:path'
import { deliverViaSubagents } from '../vibe-math-vmu/kernel/turn/index.js'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) {
    passed += 1
  } else {
    failed += 1
    failures.push({ label, detail })
    console.log('  FAIL  ' + label + (detail === undefined ? '' : '  [' + JSON.stringify(detail) + ']'))
  }
}

const turn = Object.freeze({ id: 't-9', member: 'member-2', why: 'gate', nextStep: 'gate' })
const parent = Object.freeze({})

/** A fake host that records what it was asked to create and answers with one text block. */
function recordingHost({ activation = false } = {}) {
  const seen = []
  const host = {
    list: () => ['opencode-go'],
    start: (provider, request) => {
      seen.push({ path: 'one-shot', provider, request })
      return { reply: 'ok', text: 'ok' }
    },
    startActivation: (spec) => {
      seen.push({ path: 'activation', spec })
      return { childId: 'c-1', result: Promise.resolve({ output: [{ type: 'text', text: 'ok' }], stopReason: 'end' }), dispose: () => {} }
    },
  }
  // the two creation verbs are mutually exclusive on a real host, and the bridge prefers one-shot — so a host that
  // "offers only startActivation()" must NOT also expose start(), or the activation branch is never reached (the first
  // version of this fake kept both and the three activation assertions failed for that reason, not for a code defect).
  if (!activation) delete host.startActivation
  if (activation) delete host.start
  return { host, seen }
}

// ── (a1) the ONE-SHOT request carries the seat ─────────────────────────────────────────────────────────────────
{
  const { host, seen } = recordingHost()
  const deliver = deliverViaSubagents(host, null, { provider: 'opencode-go', parent, agentPreset: 'vibe-math-vmu-member' })
  await deliver({ turn, text: 'round text' })
  const req = seen[0] && seen[0].request
  ok(seen.length === 1 && seen[0].path === 'one-shot', 'the bridge took the one-shot path (the path a real host uses)', seen.map((s) => s.path))
  ok(!!req && req.agentPreset === 'vibe-math-vmu-member', '★★★ the SEAT reaches the one-shot creation request (a declared preset that never arrives changes nothing)', req && req.agentPreset)
  ok(!!req && typeof req.prompt !== 'undefined' && req.prompt !== null, '★ the request still carries the prompt it always did (the seat was ADDED, not substituted)', req && Object.keys(req))
}

// ── (a2) the ACTIVATION request carries it inside `request` ───────────────────────────────────────────────────
{
  const { host, seen } = recordingHost({ activation: true })
  const deliver = deliverViaSubagents(host, null, { provider: 'opencode-go', parent, agentPreset: 'vibe-math-vmu-member' })
  await deliver({ turn, text: 'round text' })
  const spec = seen[0] && seen[0].spec
  ok(seen.length === 1 && seen[0].path === 'activation', 'the activation path was taken when the host offers only startActivation()', seen.map((s) => s.path))
  ok(!!spec && spec.request && spec.request.agentPreset === 'vibe-math-vmu-member', '★★★ on the activation path the seat sits on `spec.request` (SubagentActivationSpec.request is the start request)', spec && spec.request && spec.request.agentPreset)
  ok(!!spec && spec.delivery === 'caller', '★ the activation still asks for caller delivery (the reply must come back to the turn loop)', spec && spec.delivery)
}

// ── (b) the default is INHERIT: no key at all ─────────────────────────────────────────────────────────────────
{
  const { host, seen } = recordingHost()
  const deliver = deliverViaSubagents(host, null, { provider: 'opencode-go', parent })
  await deliver({ turn, text: 'round text' })
  const req = seen[0] && seen[0].request
  ok(!!req && !('agentPreset' in req), '★★ the unset default adds NO key — "inherit the caller\'s preset" stays byte-identical for every existing deployment', req && Object.keys(req))
}

// ── (c) the seam reads the declared key, and the schema declares it wired ────────────────────────────────────
const seamSrc = readFileSync(join(REPO, 'vibe-math-vmu', 'host-deliver.js'), 'utf8')
ok(/settings\['vmu\.turn\.childPreset'\]/.test(seamSrc), '★★★ the delivery seam READS `vmu.turn.childPreset` (the setting half)', null)
ok(/agentPreset:\s*configuredPreset/.test(seamSrc), '★★★ …and FORWARDS it to the bridge (the wiring half; the two halves have drifted before in this project)', null)

const { SETTING_DEFS } = await import('../vibe-math-vmu/settings/schema.js')
const def = SETTING_DEFS.find((d) => d && d.key === 'vmu.turn.childPreset')
ok(def !== undefined, '★★ the schema DECLARES `vmu.turn.childPreset`', null)
ok(!!def && def.type === 'string' && def.def === '', '★★ it is a string defaulting to the empty string (= inherit, not a guessed preset name)', def && { type: def.type, def: def.def })
ok(!!def && typeof def.doc === 'string' && /MEMBER_DROP/.test(def.doc), '★ its doc names where the preset comes from (a setting whose meaning lives only in a commit message is unreadable)', def && def.doc)

// ── (d) the seat name the setting would carry is actually DECLARED in the generated patch ────────────────────
const patch = readFileSync(join(REPO, 'cordis.patch.yml'), 'utf8')
ok(/id: preset-vibe-math-vmu-member/.test(patch), '★★★ the generated patch declares the seat, so the name the setting would carry resolves to a real composition', null)

console.log('')
if (failed > 0) {
  console.log('FAILURES:')
  for (const f of failures) console.log('  · ' + f.label)
  process.exit(1)
}
console.log('=== VMU TURN CHILD PRESET: ' + passed + ' passed, ' + failed + ' failed ===')
