#!/usr/bin/env node
// tests/sim-corpus-stamp.test.mjs — ONE CORPUS, ONE GENERATION, OR NO COMPARISON (TB-2648 §7 MIXED-GEN).
//
// A sim corpus is meaningful only as a set: receipts.jsonl (what the kernel returned), pairs.jsonl (those receipts
// paired with the prompt assembled AFTER them), prompts/ (the same text as openable files) and manifest.json (the
// counts). Two of those files from different runs make every comparison built on them a cross-generation comparison:
// it can go red for a reason that is not in the code, or green because the halves happened to agree.
//
// mtimes are NOT the criterion (measured: `prompts/` kept a Nov 7 directory mtime while every file inside was rewritten
// at 20:08). The generator records the BYTES it wrote in manifest.json, and this suite proves three things:
//   1. a fresh corpus satisfies its own stamp, and the stamp covers receipts/pairs/prompts (not just a count);
//   2. one changed byte in prompts/ (or in receipts.jsonl) turns the criterion RED with `MIXED-GEN CORPUS`, prints both
//      digests and the mtimes, and restoring the byte turns it green again — the anti-gate-off the lead asked for;
//   3. a regeneration into a directory that still holds the PREVIOUS generation's files cleans them first, so the new
//      stamp cannot describe two runs at once (this is the write-order defect, not a cosmetic one).
//
// Budget: no network, no model, no LaTeX; two end-to-end runs (about 3 s each) are the only expensive part.

import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = dirname(HERE)
const TMP = join(tmpdir(), 'sim-tests-stamp-' + process.pid)
mkdirSync(TMP, { recursive: true })

const { checkCorpus, MIXED_GEN, UNSTAMPED, stampOf } = await import(pathToFileURL(join(REPO, 'scripts', 'sim', 'corpus-stamp.mjs')).href)

let passed = 0
let failed = 0
const failures = []
const ok = (cond, name, detail) => {
  if (cond) {
    passed += 1
    console.log('ok ' + passed + ' — ' + name)
  } else {
    failed += 1
    failures.push(name)
    console.log('FAIL — ' + name)
    if (detail !== undefined) console.log('       ' + JSON.stringify(detail).slice(0, 1400))
  }
  return Boolean(cond)
}
const readText = (path) => readFileSync(path, 'utf8')
const listPrompts = (dir) => {
  try {
    return readdirSync(join(dir, 'prompts')).filter((name) => name.endsWith('.txt')).sort()
  } catch {
    return []
  }
}
const runCorpus = (out, timeoutMs) =>
  spawnSync(process.execPath, [join(REPO, 'scripts', 'sim', 'run.mjs'), '--scenario', 'end-to-end', '--out', out], {
    cwd: REPO,
    env: { ...process.env, DSH_SIM_ZERO_TOKEN: '1' },
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  })

// ── A. a fresh corpus satisfies its own stamp, and the stamp really covers the files ───────────────────────────
const CORPUS = mkdtempSync(join(TMP, 'stamp-corpus-'))
const first = runCorpus(CORPUS, 120_000)
ok(first.status === 0, 'a fresh end-to-end corpus builds and exits 0 (the base for every check below)', { status: first.status, stderr: String(first.stderr || '').slice(-600) })

const verdict = checkCorpus(CORPUS)
ok(verdict.ok, 'the fresh corpus is ONE generation: manifest digests == bytes on disk', verdict)
const manifest = JSON.parse(readText(join(CORPUS, 'manifest.json')))
ok(typeof manifest.generatedAt === 'string' && manifest.generatedAt.length >= 10, 'manifest records generatedAt (when the bytes were written)', { generatedAt: manifest.generatedAt })
ok(manifest.files && manifest.files.receipts && manifest.files.pairs && manifest.files.prompts, 'manifest carries files{receipts,pairs,prompts} stamps, not only row counts', manifest.files)
ok(manifest.promptsSha256 === manifest.files.prompts.sha256, 'manifest.promptsSha256 is the same digest as files.prompts.sha256 (one formula)', { a: manifest.promptsSha256, b: manifest.files.prompts && manifest.files.prompts.sha256 })
const onDisk = stampOf(CORPUS)
ok(manifest.files.receipts.sha256 === onDisk.receipts.sha256, 'the receipts digest in the manifest equals the receipts.jsonl on disk', { declared: manifest.files.receipts.sha256, disk: onDisk.receipts.sha256 })
ok(manifest.files.receipts.lines === onDisk.receipts.lines && manifest.files.receipts.lines > 0, 'the receipts line count in the manifest equals the file (and is non-zero)', { declared: manifest.files.receipts.lines, disk: onDisk.receipts.lines })
ok(manifest.files.pairs.sha256 === onDisk.pairs.sha256, 'the pairs digest in the manifest equals pairs.jsonl on disk', { declared: manifest.files.pairs.sha256, disk: onDisk.pairs.sha256 })
ok(manifest.files.prompts.count === listPrompts(CORPUS).length && manifest.files.prompts.count > 0, 'the prompts count in the manifest equals the prompts/ files (and is non-zero)', { declared: manifest.files.prompts.count, disk: listPrompts(CORPUS).length })
ok(manifest.files.prompts.count === onDisk.prompts.files.length, 'the prompts digest covers every prompt file (a file added to the directory would change it)', { declared: manifest.files.prompts.count, covered: onDisk.prompts.files.length })
ok(manifest.files.prompts.sha256 === onDisk.prompts.sha256, 'the prompts directory digest in the manifest equals the digest recomputed from the bytes', { declared: manifest.files.prompts.sha256, disk: onDisk.prompts.sha256 })

// ── B. one changed byte in prompts/ is MIXED-GEN, and restoring it is green again (anti-gate-off) ───────────────
const MUT = mkdtempSync(join(TMP, 'stamp-mut-'))
cpSync(CORPUS, MUT, { recursive: true })
const promptNames = listPrompts(MUT)
ok(promptNames.length > 0, 'the copy holds prompt files to mutate', { files: promptNames.length })
const victim = join(MUT, 'prompts', promptNames[0])
const original = readFileSync(victim)
const before = original.toString('utf8')
writeFileSync(victim, before + ' ')
const tampered = checkCorpus(MUT)
ok(!tampered.ok && tampered.code === MIXED_GEN, 'one changed byte in prompts/ turns the criterion RED with MIXED-GEN CORPUS', { code: tampered.code, ok: tampered.ok })
ok(String(tampered.message).includes(MIXED_GEN), 'the diagnosis names the verdict token MIXED-GEN CORPUS (a code, not prose)', { message: String(tampered.message).slice(0, 400) })
ok(String(tampered.message).includes(tampered.declared.prompts) && String(tampered.message).includes(tampered.actual.prompts), 'the diagnosis prints BOTH digests (manifest vs disk), so a reader can see which half changed', { declared: tampered.declared && tampered.declared.prompts, actual: tampered.actual && tampered.actual.prompts })
ok(String(tampered.message).includes('mtimes:'), 'the diagnosis prints mtimes as evidence (never as the criterion)', { message: String(tampered.message).slice(0, 400) })
writeFileSync(victim, original)
const restored = checkCorpus(MUT)
ok(restored.ok, 'restoring the byte makes the corpus pass again (the criterion is content, not a one-way latch)', restored)

// ── C. a change in receipts.jsonl is caught too, and the manifest is required ───────────────────────────────────
const receiptsPath = join(MUT, 'receipts.jsonl')
const receiptsBefore = readText(receiptsPath)
writeFileSync(receiptsPath, receiptsBefore + String.fromCharCode(10))
const tamperedReceipts = checkCorpus(MUT)
ok(!tamperedReceipts.ok && tamperedReceipts.code === MIXED_GEN, 'a changed receipts.jsonl is MIXED-GEN as well (the stamp is not prompts-only)', tamperedReceipts)
writeFileSync(receiptsPath, receiptsBefore)
ok(checkCorpus(MUT).ok, 'restoring receipts.jsonl returns the corpus to one generation', {})

const manifestPath = join(MUT, 'manifest.json')
const manifestBefore = readText(manifestPath)
rmSync(manifestPath, { force: true })
const unstamped = checkCorpus(MUT)
ok(!unstamped.ok && unstamped.code === UNSTAMPED, 'a corpus without manifest.json is UNSTAMPED CORPUS (named), not silently comparable', { code: unstamped.code })
writeFileSync(manifestPath, manifestBefore)
ok(checkCorpus(MUT).ok, 'restoring the manifest returns the corpus to one generation', {})

// ── D. regeneration is ATOMIC IN EFFECT: the previous generation does not survive ───────────────────────────────
const REUSED = mkdtempSync(join(TMP, 'stamp-reused-'))
// Seed the directory with files only an OLDER run could have written: a prompt the current run does not assemble, a
// stale pair row, a stale step file, a stale report. A naive overwrite would leave them behind and the next stamp would
// describe two generations at once.
mkdirSync(join(REUSED, 'prompts'), { recursive: true })
mkdirSync(join(REUSED, 'steps'), { recursive: true })
writeFileSync(join(REUSED, 'prompts', '99-stale-seat.txt'), 'stale prompt from a previous generation')
writeFileSync(join(REUSED, 'pairs.jsonl'), '{"pairIndex":999,"stale":true}' + String.fromCharCode(10))
writeFileSync(join(REUSED, 'steps', 'stale.json'), '{"stale":true}')
writeFileSync(join(REUSED, 'REPORT.md'), 'stale report')
const reused = runCorpus(REUSED, 120_000)
ok(reused.status === 0, 'a regeneration into a dirty directory exits 0', { status: reused.status, stderr: String(reused.stderr || '').slice(-600) })
ok(!existsSync(join(REUSED, 'prompts', '99-stale-seat.txt')), 'the stale prompt file from the previous generation is GONE after regeneration', { files: listPrompts(REUSED) })
ok(!existsSync(join(REUSED, 'steps', 'stale.json')), 'the stale step file from the previous generation is GONE after regeneration', {})
const reusedManifest = JSON.parse(readText(join(REUSED, 'manifest.json')))
ok(reusedManifest.files.prompts.count === listPrompts(REUSED).length, 'the new stamp counts only the files THIS run wrote', { declared: reusedManifest.files.prompts.count, disk: listPrompts(REUSED).length })
const reusedVerdict = checkCorpus(REUSED)
ok(reusedVerdict.ok, 'the regenerated corpus is one generation (the criterion would have caught a surviving stale file)', reusedVerdict)
const reusedPairs = readText(join(REUSED, 'pairs.jsonl'))
ok(!reusedPairs.includes('"stale":true'), 'the stale pair row was replaced, not appended to', { chars: reusedPairs.length })

console.log('')
console.log('=== sim corpus stamp: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed > 0) {
  console.log('failed: ' + failures.join(' | '))
  process.exitCode = 1
} else {
  console.log('generation stamp: manifest digests == disk bytes; ' + MIXED_GEN + ' is the only red verdict a reader sees')
}
try {
  for (const dir of [CORPUS, MUT, REUSED]) rmSync(dir, { recursive: true, force: true })
} catch { /* temp cleanup is not a verdict */ }
