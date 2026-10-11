// A pre-flight wrapper for the throwaway scripts this work keeps producing.
//
// WHY IT EXISTS, MEASURED: nine times a script of mine died at PARSE TIME because a string literal contained an ASCII quotation
// mark or apostrophe (I write these scripts from PowerShell-adjacent strings, where the quoting is fragile). Each time the
// failure was silent in the sense that the script did nothing at all, and once it caused a commit whose message described work
// that had never landed. Vigilance failed nine times; this is the tool instead.
//
// It refuses to run anything that does not pass `node --check`, prints that fact loudly, and exits non-zero so a caller cannot
// mistake it for success. It runs the target in a CHILD process, so the target's own exit code is the wrapper's.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const target = process.argv[2]
if (!target) {
  console.log('usage: node scripts/dev/run-checked.mjs <script.mjs> [args...]')
  process.exit(2)
}
if (!existsSync(target)) {
  console.log('REFUSED: no such script: ' + target)
  process.exit(2)
}

const check = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' })
if (check.status !== 0) {
  console.log('REFUSED: the script does not parse, so running it would do NOTHING while looking like it ran.')
  console.log('  ' + String(check.stderr || '').trim().split('\n').slice(0, 4).join('\n  '))
  console.log('  (this is the nine-times-repeated failure: an ASCII quotation mark inside a string literal)')
  process.exit(3)
}
console.log('parse ok -> running ' + target)
const run = spawnSync(process.execPath, [target, ...process.argv.slice(3)], { stdio: 'inherit' })
process.exit(run.status === null ? 1 : run.status)
