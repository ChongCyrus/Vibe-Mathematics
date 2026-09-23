// ============================================================================================
// BILINGUAL README — the Chinese README is the default; README.en.md is a full translation of it.
// Two documents that are supposed to say the same thing rot apart silently, so this suite pins the
// parts that must stay identical no matter how either side is edited:
//
//   · a switcher line near the top of each file linking to the other;
//   · identical heading STRUCTURE (same ordered sequence of heading levels, ignoring fenced code —
//     a `#` shell comment inside a code fence is not a heading);
//   · identical image lists, identical local link targets, identical table-row and code-fence counts
//     (a translation preserves rows 1:1, so a mismatch means content was dropped or merged);
//   · the English file must actually be English outside code (CJK characters are only allowed in
//     fenced/inline code, where the rules keep user-facing example strings in the original language);
//   · both files ship in `package.json` `files`;
//   · the Chinese README is still the default `README.md` (npm and GitHub render that one).
//
// Usage: node tests/audit-readme-bilingual.test.mjs
// ============================================================================================
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, resolve } from 'node:path'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))

let passed = 0, failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}

const ZH = 'README.md'
const EN = 'README.en.md'
if (!ok(existsSync(join(REPO, ZH)) && existsSync(join(REPO, EN)), 'both README.md and README.en.md exist')) {
  console.log('\n=== BILINGUAL README: ' + passed + ' passed, ' + failed + ' failed ===')
  process.exit(1)
}
const zh = readFileSync(join(REPO, ZH), 'utf8')
const en = readFileSync(join(REPO, EN), 'utf8')

// ---- 1. switcher ------------------------------------------------------------
{
  const head = (t) => t.split(/\r?\n/).slice(0, 12).join('\n')
  ok(/\[English\]\(README\.en\.md\)/.test(head(zh)), 'the Chinese README links to the English one near the top')
  ok(/\[中文\]\(README\.md\)/.test(head(en)) || /\[简体中文\]\(README\.md\)/.test(head(en)),
    'the English README links back to the Chinese one near the top')
  ok(zh.trimStart().startsWith('# ') && en.trimStart().startsWith('# '), 'both files start with an H1 title')
}

// ---- 2. strip code before structure comparison ------------------------------
/** Markdown with fenced blocks and inline code replaced by placeholders (so their contents — which
 *  are allowed to differ in language — cannot influence counting or CJK checks). */
function stripCode(t) {
  return t
    .replace(/```[\s\S]*?```/g, '\n```CODE```\n')
    .replace(/`[^`\n]*`/g, '`CODE`')
}
const zhPlain = stripCode(zh)
const enPlain = stripCode(en)

// ---- 3. structure -----------------------------------------------------------
const headingLevels = (t) => [...t.matchAll(/^(#{1,6})\s+/gm)].map((m) => m[1].length)
const zhH = headingLevels(zhPlain), enH = headingLevels(enPlain)
ok(zhH.length === enH.length && zhH.every((l, i) => l === enH[i]),
  `the heading structure matches (${zhH.length} headings, levels in the same order)`,
  `zh=[${zhH.join(',')}] en=[${enH.join(',')}]`)

const tableRows = (t) => t.split('\n').filter((l) => /^\s*\|/.test(l)).length
ok(tableRows(zhPlain) === tableRows(enPlain), 'the table-row count matches (translations preserve rows 1:1)',
  `zh=${tableRows(zhPlain)} en=${tableRows(enPlain)}`)

const fences = (t) => (t.match(/^```/gm) || []).length
ok(fences(zh) === fences(en), 'the code-fence count matches', `zh=${fences(zh)} en=${fences(en)}`)

// ---- 4. assets and links ----------------------------------------------------
const images = (t) => [...t.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1])
const zhImg = images(zh), enImg = images(en)
// The four architecture diagrams deliberately differ by language: the English README points at the
// `-en` asset of the same diagram, every other image must be the very same file.
const enVariant = (p) => p.replace(/^(示例图\/框架图-v[0-9]+)\.(png|svg)$/, '$1-en.svg')
ok(zhImg.length > 0 && zhImg.length === enImg.length, 'both READMEs show the same number of images',
  `zh=[${zhImg.join(', ')}] en=[${enImg.join(', ')}]`)
const imgMismatch = zhImg.filter((p, i) => enImg[i] !== p && enImg[i] !== enVariant(p))
ok(imgMismatch.length === 0,
  'every English image is the same asset as the Chinese one, or its -en variant, in the same order',
  `mismatch=[${imgMismatch.join(', ')}] en=[${enImg.join(', ')}]`)
const enDiagrams = enImg.filter((p) => /示例图\/框架图-v[0-9]+-en\.svg$/.test(p))
ok(enDiagrams.length === 4, 'the English README references all four English architecture diagrams',
  `en=[${enImg.join(', ')}]`)

// Internal anchors must resolve inside their OWN file: translating a heading renames its slug, so
// an anchor copied from the Chinese README breaks. (GitHub maps EVERY whitespace to a hyphen and
// does not collapse runs — a slugger that collapses them reports valid anchors as broken.)
const slug = (heading) => heading.replace(/^#{1,6}\s+/, '').trim().toLowerCase()
  .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-')
const headingsWithSlugs = (file) => {
  const text = readFileSync(join(REPO, file), 'utf8')
  const inFence = []
  let fence = false
  for (const l of text.split('\n')) { if (/^```/.test(l)) { fence = !fence; inFence.push(false); continue } inFence.push(fence) }
  return { text, slugs: text.split('\n').filter((l, i) => !inFence[i] && /^#{1,6}\s+/.test(l)).map(slug) }
}
for (const file of [ZH, EN]) {
  const { text, slugs } = headingsWithSlugs(file)
  const anchors = [...new Set([...text.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]))]
  const broken = anchors.filter((a) => !slugs.includes(a))
  ok(broken.length === 0, `${file}: every internal anchor matches one of its own headings (${anchors.length} anchors)`,
    'broken: #' + broken.join(', #'))
}

const localLinks = (t) => [...new Set([...t.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]))]
  .filter((p) => !/^[a-z][a-z0-9+.-]*:/i.test(p) && !p.startsWith('#'))
  .filter((p) => p !== 'README.md' && p !== 'README.en.md') // the switcher is intentionally asymmetric
  .sort()
const zhLinks = localLinks(zh), enLinks = localLinks(en)
// The four architecture diagrams are the single documented exception: the English README points at
// the `-en` asset of the same diagram. Normalizing just that difference keeps the guard strict about
// every other local target (a genuinely missing or extra link still fails).
const diagramKey = (p) => {
  const m = /^示例图\/框架图-(v[0-9]+)(?:-en)?\.(?:png|svg)$/.exec(p)
  return m ? '示例图/框架图-' + m[1] + '.<diagram>' : p
}
const zhKeys = zhLinks.map(diagramKey).sort(), enKeys = enLinks.map(diagramKey).sort()
ok(zhKeys.join('|') === enKeys.join('|'),
  'both READMEs link to the same local targets, up to the four language-specific diagrams',
  'only in zh: ' + zhLinks.filter((p) => !enKeys.includes(diagramKey(p))).join(', ')
  + ' | only in en: ' + enLinks.filter((p) => !zhKeys.includes(diagramKey(p))).join(', '))

// ---- 5. the English file is actually English outside code --------------------
{
  // Link and image TARGETS legitimately stay Chinese (real file and directory names), as do the real
  // JSON keys, the literal session-rebuild marker and the switcher label. What is left is that small
  // set of literals — a real untranslated paragraph would be in the hundreds.
  const withoutTargets = enPlain.replace(/\]\([^)\s]+\)/g, '](TARGET)').replace(/!\[[^\]]*\](\([^)\s]+\))/g, '![img]($1)')
  const cjk = (withoutTargets.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length
  ok(cjk <= 150, `no untranslated prose outside code and link targets (${cjk} CJK characters, budget 150)`,
    'a count in the hundreds means a section was left in Chinese')
}

// ---- 6. packaging + default -------------------------------------------------
ok((pkg.files || []).includes(ZH) && (pkg.files || []).includes(EN), 'both READMEs are listed in package.json files',
  JSON.stringify((pkg.files || []).filter((f) => /^README/.test(f))))
ok(existsSync(join(REPO, 'README.zh.md')) === false,
  'the Chinese README is still the default README.md (no README.zh.md duplicate to maintain)')

console.log('')
console.log('=== BILINGUAL README: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
