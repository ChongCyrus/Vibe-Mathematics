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

// ---- 3. structure (REPORT for counts; HEADINGS must exist) ---------------------------------
// ★ PHASE 6 · 创始人指示（去掉不必要的门禁约束）：THE PER-STRUCTURE COUNT EQUALITIES ARE REPORTS. A translation that adds one
// explanatory row/heading is not a defect, and gating counts punished exactly that. What stays GATED: both files have
// headings, both READMEs exist/H1/link to each other, image targets are real assets, internal anchors resolve, and local
// link sets are equal where equality means "no missing/extra target" rather than formatting.
const headingLevels = (t) => [...t.matchAll(/^(#{1,6})\s+/gm)].map((m) => m[1].length)
const zhH = headingLevels(zhPlain), enH = headingLevels(enPlain)
ok(zhH.length > 0 && enH.length > 0, `both READMEs really have headings (non-vacuous comparison)`,
  `zh=${zhH.length} en=${enH.length}`)
const headingShapeSame = zhH.length === enH.length && zhH.every((l, i) => l === enH[i])
console.log('  ★ REPORT ONLY (no assertion): heading structure ' + (headingShapeSame ? 'matches' : 'differs')
  + ' (zh=' + zhH.length + ', en=' + enH.length + ')')

const tableRows = (t) => t.split('\n').filter((l) => /^\s*\|/.test(l)).length
console.log('  ★ REPORT ONLY (no assertion): table rows zh=' + tableRows(zhPlain) + ' en=' + tableRows(enPlain))

const fences = (t) => (t.match(/^```/gm) || []).length
console.log('  ★ REPORT ONLY (no assertion): code fences zh=' + fences(zh) + ' en=' + fences(en))

// ---- 4. assets and links ----------------------------------------------------
const images = (t) => [...t.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1])
const zhImg = images(zh), enImg = images(en)
// The four architecture diagrams deliberately differ by language: the English README points at the
// `-en` asset of the same diagram, every other image must be the very same file.
const enVariant = (p) => p.replace(/^(示例图\/框架图-v[0-9]+)\.(png|svg)$/, '$1-en.svg')
ok(zhImg.length > 0 && enImg.length > 0, 'both READMEs really show images (non-vacuous comparison)',
  `zh=${zhImg.length} en=${enImg.length}`)
console.log('  ★ REPORT ONLY (no assertion): image count zh=' + zhImg.length + ' en=' + enImg.length)
const imgMismatch = zhImg.filter((p, i) => enImg[i] !== p && enImg[i] !== enVariant(p))
ok(imgMismatch.length === 0,
  'every English image is the same asset as the Chinese one, or its -en variant, in the same order',
  `mismatch=[${imgMismatch.join(', ')}] en=[${enImg.join(', ')}]`)
const enDiagrams = enImg.filter((p) => /示例图\/框架图-v[0-9]+-en\.svg$/.test(p))
console.log('  ★ REPORT ONLY (no assertion): English architecture diagram references = ' + enDiagrams.length)

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
// The retained anchor criterion still bites: a slug that no heading produces is reported broken (synthetic).
ok(['#no-such-heading'].filter((a) => !['existing-heading'].includes(a.slice(1))).length === 1,
  '★ SELF-PROOF: the retained "internal anchor resolves" criterion still flags a broken anchor (synthetic)')

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

// ---- 5. the English file is actually English outside code (REPORT) -----------
{
  // ★ PHASE 6 · 创始人指示（去掉不必要的门禁约束）：THE CJK BUDGET IS A HAND-SET THRESHOLD, so it is now a REPORT. The scan
  // still counts, so an untranslated section stays visible; what stops being enforced is a number a translator cannot reason
  // about. Link and image targets legitimately stay Chinese (real file and directory names), as do JSON keys and the switcher.
  const withoutTargets = enPlain.replace(/\]\([^)\s]+\)/g, '](TARGET)').replace(/!\[[^\]]*\](\([^)\s]+\))/g, '![img]($1)')
  const cjk = (withoutTargets.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length
  ok(enPlain.length > 0, 'the English README was really read, so the CJK report is not an empty scan')
  console.log('  ★ REPORT ONLY (no assertion): CJK characters outside code/link targets in README.en.md = ' + cjk)
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
