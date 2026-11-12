// scripts/sim/redteam/corpus-copy.mjs — copy a frozen corpus into a fixture layer, and DATE IT BEFORE THE REPORT.
//
// WHY THIS IS ITS OWN MODULE. The red team builds every fixture layer by copying the committed corpus. `fs.cpSync`
// preserves mtimes on Windows but NOT on POSIX: on Linux, every copied file is stamped NOW. The release gate reads
// `generatedAt + 1000 < newest receipts mtime` as "the report was written before the corpus it claims to measure"
// (AUDIT_CORPUS_STALE in scripts/sim/audit/release-ready.mjs). A layer copied seconds into a fixture run therefore
// looks newer than the report that is about to describe it, and A3/A4/A16/A16b get masked by an artefact of the
// platform: green on Windows, red on the shard. Backdating the receipts to clearly before generatedAt takes the
// platform out of the verdict, and the pin below turns a silently-different copy into a loud fixture error.
import fs from 'node:fs'
import path from 'node:path'

// Ten minutes is far outside the gate's 1000 ms tolerance, so the ordering it checks is not a race between two
// clock reads in the same second.
export const BACKDATE_MS = 600_000

/** rm -rf dest, copy corpusDir into it, backdate every receipts.jsonl to generatedAt - BACKDATE_MS, then VERIFY. */
export function copyCorpus(dest, corpusDir, generatedAt) {
  const generatedMs = Date.parse(String(generatedAt === undefined || generatedAt === null ? '' : generatedAt))
  if (!Number.isFinite(generatedMs)) {
    throw new Error('copyCorpus needs a generatedAt ISO string: the copy must be dated BEFORE the report that will use it, and an unparseable stamp cannot be compared')
  }
  fs.rmSync(dest, { recursive: true, force: true })
  fs.mkdirSync(dest, { recursive: true })
  fs.cpSync(corpusDir, dest, { recursive: true })
  const when = (generatedMs - BACKDATE_MS) / 1000
  const receipts = []
  for (const name of fs.readdirSync(dest)) {
    const file = path.join(dest, name, 'receipts.jsonl')
    if (fs.existsSync(file)) {
      fs.utimesSync(file, when, when)
      receipts.push(file)
    }
  }
  if (receipts.length === 0) {
    throw new Error('the corpus copied from ' + corpusDir + ' holds no corpus-*/receipts.jsonl: a layer whose mtime cannot be read is not a layer this suite can judge')
  }
  const newer = receipts.filter((file) => !(fs.statSync(file).mtimeMs < generatedMs))
  if (newer.length) {
    throw new Error('copied receipts are not older than generatedAt ' + String(generatedAt) + ': ' + newer.map((f) => path.basename(path.dirname(f))).join(', ') + ' (fs.cpSync on POSIX stamps the copy with NOW, so the backdate above must run before this pin)')
  }
  return dest
}
