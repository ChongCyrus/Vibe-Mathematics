// GENERATE cordis.patch.yml — the package's single bundle patch — from the frozen 0.1.x compositions.
//
// WHY ONE FILE: `dsh.bundle.patch` must stay a STRING. DSH >= 0.1.7 accepts a list of patch files,
// but 0.1.5/0.1.6 pass the value straight into a path join: an array makes `join()` throw
// `ERR_INVALID_ARG_TYPE` and the profile cannot boot at all. One patch file is valid on every line.
//
// WHY THE DECLARATION ROWS NAME OUR OWN MODULE: on DSH >= 0.1.7 an agent preset is a composition row
// whose config is `{id, name, description, order, plugins}`; `@deepseek-ai/dsh-agent-preset` performs
// `agentPresets.register(config)`. Naming that host package directly would make the same file fail to
// import on DSH <= 0.1.6 (the package does not exist there), and a `disabled: !!js` gate cannot be
// used because `ctx.get(...)` inside a patch expression throws there. Our own preset-declaration.js
// resolves on both lines: it performs the identical registration where the service exists and does
// nothing where it does not — and on <= 0.1.6 the installer row below writes the directory form.
//
// Usage: node scripts/build-preset-rows.mjs [--check]
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const CHECK = process.argv.includes('--check')
const VERSIONS = ['vmu']
const OUT = join(REPO, 'cordis.patch.yml')

/**
 * THE MEMBER SEAT'S PACK-TOOL ALLOW-LIST is DERIVED from the pack's own declaration, never hand-copied here.
 * Why: run 51/53 measured the child calling `vibe_v5_verdict_final`, which a fresh child kernel must refuse with
 * `VMU_NO_SUCH_OBJECT` — so the pack's rule 「本轮的最终裁决不得由代笔执行」 was enforced by a MISNAMED refusal instead of
 * by the child's wire. The framework cannot import a pack (docs/01 R1: the kernel holds no policy), so the row carries
 * `packToolAllow` and `host.js#toolSpecs` filters registration by it. `member-scope.js` is the single source of the
 * distinction (office-only vs seat-safe), and this import is the derivation that keeps the row honest.
 */
const { MEMBER_SAFE_TOOLS } = await import('../vibe-math-vmu/packs/v5r/member-scope.js')

/**
 * Every preset id this patch DECLARES — derived from the same two decisions that emit the sections, so a consumer
 * (tests/audit-preset-rows.test.mjs's set-equality row check) cannot drift from the generator.
 */
export const DECLARED_PRESET_IDS = Object.freeze([...VERSIONS.map((v) => 'vibe-math-' + v), 'vibe-math-vmu-member'])

/** Roster position: after the shipped presets (standard 1 … cordis 4). */
const ORDER = { v2: 20, v3: 21, v4: 22, v5: 23, v5r: 24, vmu: 25 }

/**
 * Every difference between the frozen 0.1.x composition and the composition shipped for >= 0.1.7.
 * Keep this table short, explicit and auditable — it IS the compatibility documentation.
 */
const TRANSFORMS = [
  {
    why: '@deepseek-ai/dsh-workflow-worker-thread was removed after 0.1.6; @deepseek-ai/dsh-workflow-ptc replaces it',
    find: "    - id: workflow-worker-thread\n      name: '@deepseek-ai/dsh-workflow-worker-thread'\n      config:\n        provider: spawn",
    replace: "    - id: workflow-ptc\n      name: '@deepseek-ai/dsh-workflow-ptc'\n      config:\n        provider: spawn",
  },
  {
    why: 'the legacy `persona.text` key (kept in the frozen file for DSH <= 0.1.2) is unknown from 0.1.3 on — `prefix` carries the same text',
    find: /\n    text: \|-\n[\s\S]*?\n(?=- id: agent-instructions)/,
    replace: '\n',
  },
  {
    why: "the framework row must name an installed package subpath: a declaration row's `name` is NOT rewritten to a file URL by app-boot (it only recurses into group configs), so a relative path would be resolved against the profile directory",
    find: (v) => `  name: './vibe-math-${v}.js'`,
    replace: (v) => `  name: 'dsh-vibe-math/vibe-math-${v}/vibe-math-${v}.js'`,
  },
  {
    why: 'comment follows the row above (`./vibe-math-vN.js` → the package subpath)',
    find: /(?:a preset-local plugin|this package's plugin) \(\.\/vibe-math-(?:v\d+r?|vmu)\.js\)/,
    replace: (v) => `this package's plugin (dsh-vibe-math/vibe-math-${v}/vibe-math-${v}.js)`,
  },
  {
    why: "`command-goal` (the human's /goal) is part of every shipped full preset and must be declared in-preset to reach the agent's scoped command registry",
    find: "- id: tool-goal\n  name: '@deepseek-ai/dsh-tool-goal'",
    replace: "- id: command-goal\n  name: '@deepseek-ai/dsh-command-goal'\n\n- id: tool-goal\n  name: '@deepseek-ai/dsh-tool-goal'",
  },
  {
    why: '`present` (deliverable cards) has no host row — it must be declared inside the preset',
    find: /(?=# ── Vibe Math (?:V\d|Unify) )/,
    replace: "- id: present\n  name: '@deepseek-ai/dsh-tool-present'\n\n",
  },
]

/**
 * ★ THE MEMBER-SEAT PRESET (the user's own question: "would restricting a member's tools stop it from doing
 * research?"). MEASURED before deciding (live multi-agent run `full-1025-092046.jsonl`, per-session tool histogram):
 * one member session did its whole round with 20/20 pack calls and ZERO host calls, while another made 82 calls of
 * which 70 were host tools — 58 of them `pwsh`, including reading the harness's own `app.asar`. The research work
 * therefore does not need a shell; the shell is the ESCAPE.
 *
 * KEEPS: the vmu framework row (all pack tools, including `vibe_vmu_bridge` — the SCOPED computation channel:
 * kernel-validated request, declared timeout, structured result, named refusal), workspace file tools, planning +
 * compaction (a long research turn needs both) and the skill rows.
 *
 * DROPS, each for a stated reason:
 *   · tool-bash / tool-pwsh — the escape channel measured above; computation goes through the vmu bridge, Lean through
 *     the pack's lean faces
 *   · tool-jobs — the shell's companion; without a shell a background job can only orphan a process
 *   · delegation — a member-spawned child is a roster entry the kernel cannot see (the roster-liveness round measured a
 *     fired member still selectable); hiring is the KERNEL's act (`vibe_v5_hire`)
 *   · tool-web — unscoped network read, owed to no rule, and a second escape
 *   · tool-ask-user — the rules give the institute exactly ONE user channel: report to the office (所办)
 *   · tool-goal / command-goal / present — human-facing session furniture (goal loop, deliverable cards), not a seat's
 */
const MEMBER_DROP = Object.freeze([
  ['tool-bash', 'the shell is the escape channel (58 pwsh calls in ONE member session, incl. reading app.asar)'],
  ['tool-pwsh', 'the same channel on Windows; computation goes through vibe_vmu_bridge and the pack lean faces'],
  ['tool-jobs', "the shell's companion - without a shell a background job can only orphan a process"],
  ['delegation', 'a member-spawned child is a roster entry the kernel cannot see; hiring is the kernel act vibe_v5_hire'],
  ['tool-web', 'unscoped network read, owed to no rule, and a second escape'],
  ['tool-ask-user', 'the rules give the institute one user channel only: report to the office'],
  ['tool-goal', 'the goal loop is human-facing session furniture, not a seat'],
  ['command-goal', 'same: /goal belongs to the human session'],
  ['present', 'deliverable cards are the office speaking to the human'],
])

/** The two keys of preset.yml that matter (no YAML dependency in this repo). */
function readPresetMeta(v) {
  const text = readFileSync(join(REPO, `vibe-math-${v}`, 'preset.yml'), 'utf8')
  const name = /^name:\s*(.+)$/m.exec(text)
  const description = /^description:\s*(.+)$/m.exec(text)
  if (name === null || description === null) throw new Error(`preset.yml of ${v} is missing name/description`)
  return { name: name[1].trim(), description: description[1].trim() }
}

/** Remove `- id: <id>` row blocks (a row plus its more-indented children) from a composition body. */
function dropRows(body, drops) {
  const lines = body.split('\n')
  for (const [id] of drops) {
    const start = lines.findIndex((l) => l === `- id: ${id}`)
    if (start < 0) throw new Error(`member preset: no row '- id: ${id}' to drop (the composition changed; fix MEMBER_DROP)`)
    let end = start + 1
    while (end < lines.length && !/^- id: /.test(lines[end])) end += 1
    // ONE splice, so the recorded end can never point past a shortened array (the first version spliced the
    // separating blank lines BEFORE slicing and silently removed the wrong rows)
    lines.splice(start, end - start)
    while (start > 0 && lines[start - 1] === '') lines.splice(start - 1, 1)
  }
  return lines.join('\n')
}

/** The 0.2.0-shaped composition of one preset, already indented under `plugins:`. */
function buildComposition(v, drops = null) {
  let body = readFileSync(join(REPO, `vibe-math-${v}`, 'agent.cordis.yml'), 'utf8').split('\r\n').join('\n')
  for (const t of TRANSFORMS) {
    const find = typeof t.find === 'function' ? t.find(v) : t.find
    const replace = typeof t.replace === 'function' ? t.replace(v) : t.replace
    const hits = typeof find === 'string' ? body.split(find).length - 1 : (body.match(find) || []).length
    if (hits !== 1) throw new Error(`transform matched ${hits} times (expected 1) in ${v}: ${t.why}`)
    body = typeof find === 'string' ? body.split(find).join(replace) : body.replace(find, replace)
  }
  if (drops !== null) body = dropRows(body.split('\r\n').join('\n'), drops)
  return body.replace(/\s*$/, '\n').split('\n').map((l) => (l === '' ? '' : '          ' + l)).join('\n')
}

export function buildPatch() {
  const head = `# dsh-vibe-math bundle patch — the profile layer this package contributes.
#
# It inserts the preset installer plus one agent-preset declaration per shipped preset, and it is
# GENERATED: edit scripts/build-preset-rows.mjs, not this file (tests/audit-preset-rows.test.mjs fails
# on drift).
#
# TWO DSH LINES, ONE FILE:
#   · DSH >= 0.1.7 — an agent preset is a composition row (\`agentPresets.register({id,plugins,…})\`).
#     The declarations below carry the full composition in \`config.plugins\` and name this package's
#     own preset-declaration.js, which performs that registration. The installer row then reports the
#     mechanism and skips the legacy directory.
#   · DSH <= 0.1.6 — nothing reads preset declarations; presets are directories under
#     <DSH_HOME>/.agent-presets, which the installer row writes (its directory branch). The four
#     declaration rows still load (they name our own module, which exists on both lines) but find no
#     \`agentPresets\` service and register nothing, so the older line boots without warnings.
#
# Composition source of truth: each preset's frozen vibe-math-vN/agent.cordis.yml. The only
# differences applied to it here:
${TRANSFORMS.map((t) => '#   · ' + t.why).join('\n')}
#
# Usage of the installer row's bare specifier: \`dsh-vibe-math/installer\` resolves through the profile's
# node_modules (where this package is installed) and is exported by package.json.

- insert:
    - id: vibe-math-preset-installer
      name: dsh-vibe-math/installer
`
  const sections = VERSIONS.map((v) => {
    const meta = readPresetMeta(v)
    // U14 (Round 5): the vmu preset ships ONE extra row — the DECLARATION OVERLAY target. It carries an EMPTY config,
    // so a deployment that declares nothing gets exactly the previous zero-mechanism behaviour; a deployment points a
    // `--patch` at this row to declare faces/packs for the preset's inner rows:
    //
    //   - id: vibe-math-vmu-overlay
    //     config:
    //       overlayFor: vibe-math-vmu
    //       rows: { vibe-math-vmu: { vmu: { tools: { faces: ['*'] }, packs: { active: ['v5r'] } } } }
    //
    // WHY A SEPARATE ROW (measured, not assumed): a loader patch REPLACES a row's `config` - it does not merge into it.
    // Patching the preset row itself with `config: {overlay: …}` overwrote `id/name/description/order/plugins` and made
    // the preset disappear (`agent-preset/not-found`). Here the payload IS the whole config, so replacement is right.
    // The overlay row is listed BEFORE the preset row; the merge itself is evaluated at REGISTER time inside
    // preset-declaration.js, so it does not depend on this order (docs/02 "部署 / 测试：可声明的 overlay").
    const overlay = v === 'vmu'
      ? `    # U14: the overlay target. Empty config ⇒ zero mechanism; a deployment patches THIS row, never the preset row.
    - id: vibe-math-vmu-overlay
      name: dsh-vibe-math/preset-declaration
      config: {}
`
      : ''
    return `
# ── ${meta.name} ──────────────────────────────────────────────────────────────
- insert:
${overlay}    - id: preset-vibe-math-${v}
      name: dsh-vibe-math/preset-declaration
      config:
        id: vibe-math-${v}
        name: ${JSON.stringify(meta.name)}
        description: ${JSON.stringify(meta.description)}
        order: ${ORDER[v]}
        plugins:
${buildComposition(v)}`
  }).join('\n')
  // ★ THE MEMBER SEAT (see MEMBER_DROP): the SAME frozen composition with the host-escape rows removed. It is a
  // SECOND preset rather than a flag because a deployment — or the framework's own delivery config — names a preset
  // PER CHILD, and because its presence or absence is then auditable in this one file, like every other preset.
  const memberMeta = readPresetMeta('vmu')
  const memberDescription = 'vmu 的「成员席」预设：与 vibe-math-vmu 同一套框架能力（会议/表决/任务/归档/提示词管线/'
    + '计算与形式化/资源与安全），但去掉了六类宿主出口 —— shell（bash/pwsh）、后台作业、自我分派子代理、联网读网页、'
    + '直接问用户、以及人类的 /goal 目标环。理由是可测量的：成员做研究用的是 pack 工具（实测一个成员会话 20/20 次全走 '
    + 'pack、零宿主调用），而 shell 才是那条让成员读到宿主 app.asar 的逃逸通道；计算走 vibe_vmu_bridge（内核校验请求、'
    + '超时、结构化结果、具名拒），Lean 走 pack 的 lean 面，向用户提要求只走「报告所办」这一条规则通道。'
  const memberSection = `
# ── ${memberMeta.name} · 成员席 ────────────────────────────────────────────────
- insert:
    - id: preset-vibe-math-vmu-member
      name: dsh-vibe-math/preset-declaration
      config:
        id: vibe-math-vmu-member
        name: ${JSON.stringify(memberMeta.name + ' · 成员席')}
        description: ${JSON.stringify(memberDescription)}
        order: 26
        packToolAllow:
${MEMBER_SAFE_TOOLS.map((n) => '          - ' + n).join('\n')}
        plugins:
${buildComposition('vmu', MEMBER_DROP)}`
  return head + sections + memberSection
}

// The CLI half runs only when this file is executed, never when a suite imports `buildPatch`
// (tests/audit-preset-rows.test.mjs imports it to prove the shipped file is what the generator emits).
const invokedDirectly = process.argv[1] !== undefined &&
  (await import('node:url')).pathToFileURL(process.argv[1]).href === import.meta.url
if (invokedDirectly) {
  const out = buildPatch()
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null
  if (current === out) { console.log('up to date  cordis.patch.yml') }
  else if (CHECK) { console.error('DRIFT       cordis.patch.yml — run: node scripts/build-preset-rows.mjs'); process.exit(1) }
  else {
    writeFileSync(OUT, out, 'utf8')
    console.log('wrote       cordis.patch.yml (' + out.split('\n').length + ' lines)')
  }
}
