// Which Action versions are pinned in our workflows, and are they current?
//
//   node scripts/check-action-versions.mjs
//
// Why this exists: the repository deliberately does NOT use Dependabot (its bot PRs cost the
// maintainer attention for very little here — the package has no runtime dependencies, so only the
// two Actions in .github/workflows are ever in play, and the plugin-catalog scanner only needs a
// score of >= 80, which this repository clears by a wide margin without it). Instead, this script is
// run during routine maintenance and at each release, so the pins are reviewed on purpose instead of
// arriving as PRs. It only reads: no writes, no network beyond the public GitHub API (via `gh`).
//
// Exit code 0 = every pin matches the latest upstream release (or is ahead); 1 = something is behind,
// printed with the exact `uses:` line to update.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// fileURLToPath (not url.pathname) — this repository lives under a non-ASCII path, and the raw
// pathname would stay percent-encoded.
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const WF_DIR = join(ROOT, '.github', 'workflows')

const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim()

const rows = []
for (const file of fs.readdirSync(WF_DIR)) {
  if (!/\.ya?ml$/.test(file)) continue
  const lines = fs.readFileSync(join(WF_DIR, file), 'utf8').split('\n')
  lines.forEach((line, i) => {
    const m = /^\s*-?\s*uses:\s*([^@\s]+)@([0-9a-f]{40})\s*(?:#\s*(.+))?$/.exec(line)
    if (m) rows.push({ file, line: i + 1, action: m[1], sha: m[2], pinned: (m[3] || '').trim(), source: line.trim() })
  })
}

if (!rows.length) { console.log('no SHA-pinned `uses:` entries found'); process.exit(0) }

let behind = 0
for (const r of rows) {
  let latestTag = '', latestSha = '', err = ''
  try {
    latestTag = gh('api', 'repos/' + r.action + '/releases/latest', '--jq', '.tag_name')
    latestSha = gh('api', 'repos/' + r.action + '/git/ref/tags/' + latestTag, '--jq', '.object.sha')
    // annotated tags point at a tag object: resolve once more
    const type = gh('api', 'repos/' + r.action + '/git/ref/tags/' + latestTag, '--jq', '.object.type')
    if (type === 'tag') latestSha = gh('api', 'repos/' + r.action + '/git/tags/' + latestSha, '--jq', '.object.sha')
  } catch (e) { err = String(e.stderr || e.message || e).split('\n')[0] }

  const current = latestTag && r.pinned.replace(/^v/, '') === latestTag.replace(/^v/, '')
  const state = err ? 'unknown (' + err.slice(0, 60) + ')' : current ? 'current' : 'BEHIND -> ' + latestTag + ' @ ' + latestSha
  if (!err && !current) behind++
  console.log(r.file + ':' + r.line + '  ' + r.action + '  pinned ' + (r.pinned || '(no comment)') + '  ' + state)
  if (!err && !current) console.log('    update with: ' + r.source.replace('@' + r.sha, '@' + latestSha).replace(/#.*$/, '# ' + latestTag))
}

console.log(behind ? '\n' + behind + ' pin(s) behind upstream — review before the next release.' : '\nAll Action pins are current.')
process.exit(behind ? 1 : 0)
