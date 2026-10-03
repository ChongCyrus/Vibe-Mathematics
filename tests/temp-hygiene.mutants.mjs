// Falsifiability driver for scripts/clean-temp.mjs (task-12): a SINGLE-SITE edit in the sweeper must
// turn its own guard (`--self-test`) NAMED-red, while the unmutated control stays green. The mutated
// copy is written as a DOT-SIBLING inside scripts/ so the module still resolves REPO/tests correctly
// (a copy in %TEMP% would fail the prefix-extraction check for the wrong reason), and it is always
// removed in `finally`.
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..')
const SRC = join(REPO, 'scripts', 'clean-temp.mjs')

const FAMILIES = [
  {
    // The age threshold is the whole safety property: without it every suite dir looks deletable.
    name: 'the age threshold is dropped (a FRESH suite dir starts looking stale)',
    from: '.filter((e) => Number(e.mtimeMs) < cut)',
    to: '.filter(() => true)',
    expect: /a FRESH suite dir is never swept/,
  },
  {
    // The prefix test keeps the sweeper from touching ANY top-level directory of the temp root.
    name: 'the suite-prefix test is dropped (any top-level dir starts looking like ours)',
    from: 'prefixes.some((p) => String(e.name).startsWith(p))',
    to: 'true',
    expect: /only exact suite prefixes are swept/,
  },
]

function runSelftest(scriptPath) {
  const r = spawnSync(process.execPath, [scriptPath, '--self-test'], { encoding: 'utf8', timeout: 60000, cwd: REPO })
  return { code: r.status, out: String(r.stdout || '') + String(r.stderr || '') }
}

const control = runSelftest(SRC)
console.log('control (unmutated sweeper): exit=' + control.code + (control.code === 0 ? '  green, as required' : '  NOT GREEN'))
if (control.code !== 0) console.log(control.out.split(/\r?\n/).filter((l) => /FAIL/.test(l)).slice(0, 3).join('\n'))

let red = 0
for (const f of FAMILIES) {
  const dest = join(REPO, 'scripts', '.tmp-hygiene-' + Math.random().toString(36).slice(2, 10) + '.mjs')
  let ok = false
  try {
    let text = readFileSync(SRC, 'utf8').replace(/\r\n?/g, '\n')
    if (/\r/.test(text)) { console.error('SETUP-FAIL - the anchor source was not EOL-normalised (CR leaked into anchor matching)'); process.exit(1) }
    const hits = text.split(f.from).length - 1
    if (hits !== 1) { console.error('SETUP-FAIL - anchor ' + JSON.stringify(f.from) + ' matched ' + hits + ' time(s), expected exactly 1'); process.exit(1) }
    writeFileSync(dest, text.replace(f.from, f.to), 'utf8')
    const r = runSelftest(dest)
    const named = r.out.split(/\r?\n/).filter((l) => /^\s*FAIL - /.test(l) && f.expect.test(l)).map((l) => l.trim())
    ok = r.code !== 0 && named.length > 0
    console.log((ok ? '  ok - ' : '  FAIL - ') + f.name + ' [exit=' + r.code + ']' + (named.length ? ' :: ' + named[0].slice(0, 140) : ' :: no named red (exit=' + r.code + ')'))
    if (ok) red++
  } finally {
    try { rmSync(dest, { force: true }) } catch (e) { /* best effort */ }
  }
}

console.log('')
console.log('mutant families reddening the temp-hygiene guard by name: ' + red + '/' + FAMILIES.length)
console.log('control green: ' + (control.code === 0))
if (red !== FAMILIES.length || control.code !== 0) process.exit(1)
console.log('ALL MUTANTS RED AS REQUIRED')
