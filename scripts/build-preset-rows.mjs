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
const VERSIONS = ['v2', 'v3', 'v4', 'v5']
const OUT = join(REPO, 'cordis.patch.yml')

/** Roster position: after the four shipped presets (standard 1 … cordis 4). */
const ORDER = { v2: 20, v3: 21, v4: 22, v5: 23 }

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
    find: /a preset-local plugin \(\.\/vibe-math-v\d\.js\)/,
    replace: (v) => `this package's plugin (dsh-vibe-math/vibe-math-${v}/vibe-math-${v}.js)`,
  },
  {
    why: "`command-goal` (the human's /goal) is part of every shipped full preset and must be declared in-preset to reach the agent's scoped command registry",
    find: "- id: tool-goal\n  name: '@deepseek-ai/dsh-tool-goal'",
    replace: "- id: command-goal\n  name: '@deepseek-ai/dsh-command-goal'\n\n- id: tool-goal\n  name: '@deepseek-ai/dsh-tool-goal'",
  },
  {
    why: '`present` (deliverable cards) has no host row — it must be declared inside the preset',
    find: /(?=# ── Vibe Math V\d )/,
    replace: "- id: present\n  name: '@deepseek-ai/dsh-tool-present'\n\n",
  },
]

/** The two keys of preset.yml that matter (no YAML dependency in this repo). */
function readPresetMeta(v) {
  const text = readFileSync(join(REPO, `vibe-math-${v}`, 'preset.yml'), 'utf8')
  const name = /^name:\s*(.+)$/m.exec(text)
  const description = /^description:\s*(.+)$/m.exec(text)
  if (name === null || description === null) throw new Error(`preset.yml of ${v} is missing name/description`)
  return { name: name[1].trim(), description: description[1].trim() }
}

/** The 0.2.0-shaped composition of one preset, already indented under `plugins:`. */
function buildComposition(v) {
  let body = readFileSync(join(REPO, `vibe-math-${v}`, 'agent.cordis.yml'), 'utf8').split('\r\n').join('\n')
  for (const t of TRANSFORMS) {
    const find = typeof t.find === 'function' ? t.find(v) : t.find
    const replace = typeof t.replace === 'function' ? t.replace(v) : t.replace
    const hits = typeof find === 'string' ? body.split(find).length - 1 : (body.match(find) || []).length
    if (hits !== 1) throw new Error(`transform matched ${hits} times (expected 1) in ${v}: ${t.why}`)
    body = typeof find === 'string' ? body.split(find).join(replace) : body.replace(find, replace)
  }
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
    return `
# ── ${meta.name} ──────────────────────────────────────────────────────────────
- insert:
    - id: preset-vibe-math-${v}
      name: dsh-vibe-math/preset-declaration
      config:
        id: vibe-math-${v}
        name: ${JSON.stringify(meta.name)}
        description: ${JSON.stringify(meta.description)}
        order: ${ORDER[v]}
        plugins:
${buildComposition(v)}`
  }).join('\n')
  return head + sections
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
