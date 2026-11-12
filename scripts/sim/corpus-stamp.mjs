#!/usr/bin/env node
// scripts/sim/corpus-stamp.mjs — ONE CORPUS, ONE GENERATION, OR NO COMPARISON.
//
// A sim corpus is a directory of files that are only meaningful TOGETHER: `receipts.jsonl` is what the kernel
// returned, `pairs.jsonl` is those receipts paired with the prompt that was assembled AFTER them, `prompts/` is the
// same prompt text as files a reviewer can open, and `manifest.json` records how many rows each one has. If two of
// those files come from different runs, every comparison built on them is a comparison across generations: the suite
// can go red for a reason that has nothing to do with the code ("prompt-lane compared new pairs against old prompt
// files" - measured), or, worse, go green because the two halves happened to agree.
//
// mtimes are NOT the criterion. A directory mtime does not change when a file inside it is overwritten: the measured
// case was `prompts/` showing Nov 7 14:01 while every file in it was rewritten at 20:08. So the stamp is a CONTENT
// digest, recorded by the generator (`scripts/sim/run.mjs`) in `manifest.json` at the moment it wrote the files, and
// recomputed here from the bytes on disk. Equality is the only green value.
//
//   node scripts/sim/corpus-stamp.mjs <temp root>/sim/e2e   # prints OK or the MIXED-GEN CORPUS diagnosis
//
// The formula is shared with the generator (it imports these helpers), so there is exactly one definition of what the
// stamp means. A hand-written manifest cannot satisfy it without also writing the files it describes, and that is the
// point: the stamp proves the corpus on disk is the corpus the manifest talks about.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

// The code printed when the two halves disagree. Written as one constant so a suite can assert the exact token
// instead of matching prose: "MIXED-GEN CORPUS" is the verdict, the rest of the line is the evidence.
export const MIXED_GEN = 'MIXED-GEN CORPUS'
// The code printed when the manifest is absent or predates the stamp: not a mismatch, but still not comparable.
export const UNSTAMPED = 'UNSTAMPED CORPUS'

export const sha256Of = (buf) => 'sha256:' + createHash('sha256').update(buf).digest('hex')

// One file's three facts: how many non-empty JSONL lines, how many bytes, and the digest of the exact bytes.
export function stampFile(path) {
  let buf = null
  try {
    buf = readFileSync(path)
  } catch {
    buf = null
  }
  if (buf === null) return { present: false, lines: 0, bytes: 0, sha256: null }
  return {
    present: true,
    lines: buf.toString('utf8').split('\n').filter((line) => line.length > 0).length,
    bytes: buf.length,
    sha256: sha256Of(buf),
  }
}

// The prompts directory is a SET of files, so its digest has to name each file: sorted `name + ' ' + sha256(bytes)`
// lines, hashed in that order. Sorting keeps the digest independent of directory order; including the name means
// renaming a file changes the stamp even when the bytes are identical.
export function stampPrompts(dir) {
  let names = []
  try {
    names = readdirSync(dir).filter((name) => name.endsWith('.txt')).sort()
  } catch {
    names = []
  }
  const digest = createHash('sha256')
  const files = []
  for (const name of names) {
    const buf = readFileSync(join(dir, name))
    const sha = sha256Of(buf)
    files.push({ name, bytes: buf.length, sha256: sha })
    digest.update(name + ' ' + sha + String.fromCharCode(10))
  }
  return { count: names.length, sha256: 'sha256:' + digest.digest('hex'), files }
}

// What the directory actually contains right now.
export function stampOf(dir) {
  return {
    receipts: stampFile(join(dir, 'receipts.jsonl')),
    pairs: stampFile(join(dir, 'pairs.jsonl')),
    prompts: stampPrompts(join(dir, 'prompts')),
    report: stampFile(join(dir, 'REPORT.md')),
    manifest: stampFile(join(dir, 'manifest.json')),
  }
}

const mtimeOf = (path) => {
  try {
    return new Date(statSync(path).mtimeMs).toISOString()
  } catch {
    return '(absent)'
  }
}

// The criterion every suite that reads a corpus must run BEFORE it compares anything.
// Returns `{ ok: true, ... }` or `{ ok: false, code, message }` where `message` names the disagreement, both digests
// and the mtimes (mtimes are evidence for a human, never the criterion).
export function checkCorpus(dir) {
  const manifestPath = join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      code: UNSTAMPED,
      dir,
      message: UNSTAMPED + ': ' + dir + ' has no manifest.json, so there is no record of what generation its files belong to; regenerate the corpus before comparing it',
    }
  }
  let manifest = null
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (e) {
    return {
      ok: false,
      code: UNSTAMPED,
      dir,
      message: UNSTAMPED + ': ' + dir + '/manifest.json is not readable JSON (' + String((e && e.message) || e).slice(0, 200) + '); a corpus whose manifest cannot be read cannot be compared',
    }
  }
  const declared = manifest && manifest.files
  if (!declared || typeof declared !== 'object' || !declared.receipts || !declared.prompts) {
    return {
      ok: false,
      code: UNSTAMPED,
      dir,
      message: UNSTAMPED + ': ' + dir + '/manifest.json predates the generation stamp (no files{receipts,pairs,prompts}); regenerate the corpus so it records the bytes it wrote',
    }
  }
  const actual = stampOf(dir)
  const disagreements = []
  const compare = (key, want, got) => {
    const wantSha = want && want.sha256 ? want.sha256 : null
    if (wantSha !== got.sha256) {
      disagreements.push(key + ' manifest ' + (wantSha || '(none)') + ' vs disk ' + (got.sha256 || '(absent)'))
    }
  }
  compare('receipts', declared.receipts, actual.receipts)
  if (declared.pairs) compare('pairs', declared.pairs, actual.pairs)
  compare('prompts', declared.prompts, actual.prompts)
  if (declared.prompts && Number.isInteger(declared.prompts.count) && declared.prompts.count !== actual.prompts.count) {
    disagreements.push('prompts manifest ' + declared.prompts.count + ' file(s) vs disk ' + actual.prompts.count)
  }
  if (disagreements.length === 0) {
    return {
      ok: true,
      dir,
      code: 'SINGLE_GENERATION',
      generatedAt: manifest.generatedAt || null,
      promptsSha256: declared.prompts.sha256,
      receiptsSha256: declared.receipts.sha256,
      pairsSha256: declared.pairs ? declared.pairs.sha256 : null,
      message: 'one generation: manifest and disk agree (generatedAt ' + String(manifest.generatedAt || '(unrecorded)') + ')',
    }
  }
  return {
    ok: false,
    code: MIXED_GEN,
    dir,
    disagreements,
    declared: { generatedAt: manifest.generatedAt || null, receipts: declared.receipts.sha256 || null, pairs: declared.pairs ? declared.pairs.sha256 : null, prompts: declared.prompts.sha256 || null },
    actual: { receipts: actual.receipts.sha256, pairs: actual.pairs.sha256, prompts: actual.prompts.sha256 },
    mtimes: {
      manifest: mtimeOf(manifestPath),
      receipts: mtimeOf(join(dir, 'receipts.jsonl')),
      pairs: mtimeOf(join(dir, 'pairs.jsonl')),
      promptsDir: mtimeOf(join(dir, 'prompts')),
    },
    message:
      MIXED_GEN + ': ' + dir + ' is not one generation — ' + disagreements.join('; ') +
      ' · mtimes: manifest ' + mtimeOf(manifestPath) + ', receipts ' + mtimeOf(join(dir, 'receipts.jsonl')) +
      ', pairs ' + mtimeOf(join(dir, 'pairs.jsonl')) + ', prompts/ ' + mtimeOf(join(dir, 'prompts')) +
      ' (mtimes are evidence only: a directory keeps its old mtime when a file inside is rewritten, which is how a mixed corpus looks fresh)',
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('usage: node scripts/sim/corpus-stamp.mjs <corpus-dir>')
    process.exit(2)
  }
  const verdict = checkCorpus(dir)
  console.log(verdict.message)
  if (!verdict.ok) process.exitCode = 1
}
