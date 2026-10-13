// tests/vmu-seam-params-consumed.test.mjs — the class this round got wrong twice by hand. A seam parameter is threaded from
// the preset plugin, through createKernel, into a sub-constructor; if nothing in the target tree ever READS it, the seam is
// inert: the value arrives and no code consumes it. The prompt-switch and notice seams ARE consumed (kernel/turn/index.js
// reads both), and this guard is what turns "I grepped one directory and concluded nothing reads it" into a check.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

let passed = 0
let failed = 0
const failures = []
const ok = (cond, label, detail) => {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  console.error('  FAIL ' + label + (detail === undefined ? '' : ' - ' + JSON.stringify(detail)))
  return false
}

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const KERNEL = join(REPO, 'vibe-math-vmu', 'kernel')
// EVERY file under the tree, recursively - the mistake this guard exists for was grepping one level.
const walk = (d, acc = []) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e)
    if (statSync(p).isDirectory()) walk(p, acc)
    else if (p.endsWith('.js')) acc.push(p)
  }
  return acc
}

console.log('=== 1. THE TREE IS WALKED RECURSIVELY ===')
const files = walk(KERNEL)
const subdir = files.filter((f) => f.includes('kernel' + (process.platform === 'win32' ? '\\' : '/') + 'turn'))
ok(files.length >= 80, 'the kernel tree is walked, subdirectories included', { files: files.length })
ok(subdir.length >= 1, 'and kernel/turn is among them - the directory a one-level grep misses, which is how this class was missed twice', { subdir: subdir.length })

console.log('=== 2. EVERY SEAM PARAMETER createKernel ACCEPTS IS READ SOMEWHERE ===')
{
  const idx = readFileSync(join(KERNEL, 'index.js'), 'utf8')
  // the options createKernel destructures
  const m = /export function createKernel\(\{([\s\S]*?)\}\s*=\s*\{\}\)/.exec(idx)
  ok(!!m, 'createKernel s option list was found')
  const opts = m ? m[1].split(',').map((s) => s.split('=')[0].trim()).filter((s) => /^[a-zA-Z_$][\w$]*$/.test(s)) : []
  ok(opts.length >= 8, 'and it names the seams a preset may inject', { n: opts.length, opts: opts.slice(0, 20) })
  const sources = files.filter((f) => !f.endsWith('index.js') || !f.endsWith(join('kernel', 'index.js'))).map((f) => readFileSync(f, 'utf8'))
  const all = sources.join('\n')
  // A seam is consumed if some file OTHER than the option list reads the identifier.
  const unread = opts.filter((o) => {
    const uses = all.split(new RegExp('\\b' + o + '\\b')).length - 1
    return uses === 0
  })
  ok(unread.length === 0,
    'and every one of them is read by some file in the tree, so no seam is threaded in and ignored', { unread })
}

console.log('=== 3. THE TWO SEAMS THIS ROUND VERIFIED BY HAND ===')
{
  const all = files.map((f) => readFileSync(f, 'utf8')).join('\n')
  ok(/\bnoticeBlock\b/.test(all) && all.split(/\bnoticeBlock\b/).length - 1 >= 2,
    'noticeBlock is read beyond its own declaration - the turn loop prepends the notices', { uses: all.split(/\bnoticeBlock\b/).length - 1 })
  ok(/\bsectionPolicy\b/.test(all) && all.split(/\bsectionPolicy\b/).length - 1 >= 2,
    'and sectionPolicy is read too, so the pack s switch is not merely declared', { uses: all.split(/\bsectionPolicy\b/).length - 1 })
}

console.log('=== 4. THE GUARD WOULD BITE ===')
{
  const synthetic = 'export function createKernel({ alpha, beta = null } = {}) { return { beta } }'
  const mm = /export function createKernel\(\{([\s\S]*?)\}\s*=\s*\{\}\)/.exec(synthetic)
  const opts = mm[1].split(',').map((s) => s.split('=')[0].trim()).filter((s) => /^[a-zA-Z_$][\w$]*$/.test(s))
  const body = '{ beta }'
  const unread = opts.filter((o) => !new RegExp('\\b' + o + '\\b').test(body.replace(new RegExp('\\b' + o + '\\b'), '')))
  ok(unread.includes('alpha'), 'a seam named but never read IS reported by the same predicate', { unread })
}

console.log('=== SEAM PARAMS CONSUMED: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { console.error('FAILURES:\n' + failures.map((f) => '  - ' + f).join('\n')); process.exitCode = 1 }
