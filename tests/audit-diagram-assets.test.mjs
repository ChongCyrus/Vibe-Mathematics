// ============================================================================================
// DIAGRAM ASSETS — does each committed raster actually contain its own artwork?
//
// The defect this guards (2.3.15): the v4/v5 PNGs were produced with
//   chrome --headless=new --window-size=<svg width>,<svg height> --screenshot=…
// which screenshots the WINDOW while the page VIEWPORT is ~96px shorter (browser UI). The artwork
// was therefore cut exactly 96px above its bottom edge — and because the PNG still measured
// PRECISELY the SVG's own size, the loss was invisible to every size-based check. The v4/v5 images
// had been missing their bottom legend row for two releases.
//
// So this suite compares a raster against the artwork it is supposed to show, using zero
// dependencies: it measures the SVG's true content box (including nested transforms) and the PNG's
// ink extent, and requires the ink to reach the artwork's own bottom/right edge. A raster that is
// short of its artwork fails here — in the checkout, not in someone's marketplace listing.
//
// It also checks the two matplotlib diagrams (v2/v3): those are exported with bbox_inches="tight",
// so their artwork must sit inside the canvas with a margin, never flush against an edge.
//
// PACKAGING CONTRACT — REPOSITORY-ONLY, deliberately not in `package.json` `files`: the v4/v5 PNGs
// are marketplace assets fetched from GitHub and are NOT shipped in the tarball, so this suite
// cannot run inside an installed package. The last assertion enforces that.
//
// Usage: node tests/audit-diagram-assets.test.mjs
// ============================================================================================
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname, resolve } from 'node:path'
import { decodePng, inkExtentFast, svgSize, contentBox } from '../docs/render_framework_diagram_png.mjs'

const HERE = fileURLToPath(new URL('./', import.meta.url))
const REPO = resolve(HERE, '..')
const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
const SCALE = 2 // the high-resolution scale the committed rasters are exported at

let passed = 0, failed = 0
const failures = []
function ok(cond, label, detail) {
  if (cond) { passed++; console.log('  ok   ' + label); return true }
  failed++; failures.push(label + (detail ? ' — ' + detail : ''))
  console.error('  FAIL ' + label + (detail ? ' — ' + detail : ''))
  return false
}
const at = (rel) => join(REPO, rel)
const raster = (rel) => decodePng(readFileSync(at(rel)))

// ---------------------------------------------------------------------------------------------
// 1. the SVG-generated diagrams (v4/v5): the raster must reach the artwork's own edges
// ---------------------------------------------------------------------------------------------
for (const v of ['v4', 'v5']) {
  const svgRel = `示例图/框架图-${v}.svg`
  const pngRel = `示例图/框架图-${v}.png`
  if (!ok(existsSync(at(svgRel)) && existsSync(at(pngRel)), `${v}: the SVG and its PNG both exist`)) continue
  const { w, h } = svgSize(at(svgRel))
  const content = contentBox(at(svgRel))
  const img = raster(pngRel)
  const ink = inkExtentFast(img)
  ok(img.w === w * SCALE && img.h === h * SCALE,
    `${v}: the PNG is the SVG canvas at ${SCALE}× (${w}×${h} → ${w * SCALE}×${h * SCALE})`,
    `got ${img.w}x${img.h}`)
  const tol = 14 * SCALE
  ok(ink.lastInk >= Math.round(content.bottom * SCALE) - tol,
    `${v}: the ink reaches the artwork's bottom edge (the old --headless=new bug cut it 96px short)`,
    `ink stops at row ${ink.lastInk}, artwork bottom is row ${Math.round(content.bottom * SCALE)} (tolerance ${tol})`)
  ok(ink.lastX >= Math.round(content.right * SCALE) - tol,
    `${v}: the ink reaches the artwork's right edge`,
    `ink stops at column ${ink.lastX}, artwork right edge is ${Math.round(content.right * SCALE)}`)
  ok(ink.lastInk < img.h - 1, `${v}: nothing is painted flush to the last pixel row (there is a real margin)`, `lastInk=${ink.lastInk} of ${img.h - 1}`)
}

// ---------------------------------------------------------------------------------------------
// 2. the matplotlib diagrams (v2/v3): tight-cropped, so the artwork must NOT touch an edge
// ---------------------------------------------------------------------------------------------
for (const v of ['v2', 'v3']) {
  const pngRel = `示例图/框架图-${v}.png`
  if (!ok(existsSync(at(pngRel)), `${v}: the PNG exists`)) continue
  const img = raster(pngRel)
  const ink = inkExtentFast(img)
  ok(img.w >= 2000 && img.h >= 1400, `${v}: the raster is high-resolution (${img.w}×${img.h})`)
  ok(img.h - 1 - ink.lastInk > 8, `${v}: bbox_inches="tight" left a margin below the artwork (not flush)`, `bottom margin ${img.h - 1 - ink.lastInk}px`)
  ok(ink.lastX < img.w - 1, `${v}: ...and to its right (not flush)`, `right margin ${img.w - 1 - ink.lastX}px`)
}

// ---------------------------------------------------------------------------------------------
// 3. the marketplace carousel lists exactly these four, and this suite does not ship
// ---------------------------------------------------------------------------------------------
{
  const shots = JSON.parse(readFileSync(at('screenshots.json'), 'utf8'))
  const want = ['示例图/框架图-v5.png', '示例图/框架图-v4.png', '示例图/框架图-v3.png', '示例图/框架图-v2.png']
  ok(want.every((p) => shots.includes(p)), 'screenshots.json shows all four diagrams', JSON.stringify(shots))
  ok(!(pkg.files || []).includes('tests/audit-diagram-assets.test.mjs'),
    'this repository-only guard is NOT listed in package.json files (the v4/v5 rasters it reads do not ship)')
}

console.log('')
console.log('=== DIAGRAM ASSETS: ' + passed + ' passed, ' + failed + ' failed ===')
if (failed) { for (const f of failures) console.error('  - ' + f); process.exit(1) }
console.log('ALL GREEN')
