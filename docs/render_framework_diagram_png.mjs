#!/usr/bin/env node
// ============================================================
// 把生成好的框架图 SVG 光栅化为**完整**的高清 PNG（无头 Chrome）。
//
//   node docs/render_framework_diagram_png.mjs 示例图/框架图-v5.svg 示例图/框架图-v5.png 2
//
// 为什么需要这个脚本（2.3.15 修掉的真实缺陷）：过去那条一行命令
//   chrome --headless=new --window-size=1720,1204 --screenshot=框架图-v5.png …
// 截的是**窗口**，而页面**视口**比窗口矮约 96px（浏览器 UI）——
// 于是 SVG 底部那一截（图例行）根本没被绘制，而 PNG 的尺寸又恰好等于 SVG 的画布尺寸，
// 所以"少了 96px"这件事从尺寸上看不出来，一直没人发现。
//
// 因此这里：
//   1. 用**多留一段窗口高度**的方式渲染（保证整个视口都被绘制）；
//   2. 把顶部 `svg宽 × svg高 × scale` 区域裁出来；
//   3. **校验**结果：尺寸必须精确相等，且"墨迹"必须到达 SVG 自身内容的底边——
//      凡是比原图矮/被裁的产物都会**直接报错退出**，不会再悄悄发布出去。
// ============================================================
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { deflateSync, inflateSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
const CHROME = process.env.CHROME_PATH || CHROME_CANDIDATES.find((p) => existsSync(p))
const PAD = 240 // 额外窗口高度：必须大于 new-headless 的浏览器 UI 高度

// ---------- SVG ----------
export function svgSize(file) {
  const head = readFileSync(file, 'utf8').slice(0, 800)
  const w = Number((head.match(/\bwidth="(\d+(?:\.\d+)?)"/) || [])[1])
  const h = Number((head.match(/\bheight="(\d+(?:\.\d+)?)"/) || [])[1])
  if (!w || !h) throw new Error('无法从 ' + file + ' 读出 width/height')
  return { w, h }
}

/** SVG 内容（含嵌套 translate）的真实外接框，用来判断光栅是否被裁。 */
export function contentBox(file) {
  const svg = readFileSync(file, 'utf8')
  const stack = [{ x: 0, y: 0 }]
  let maxBottom = -Infinity, maxRight = -Infinity
  const re = /<(\/?)(g|rect|text|line|circle|polyline|polygon|path|image)\b([^>]*)>/g
  let m
  while ((m = re.exec(svg)) !== null) {
    const [, close, tag, attrs] = m
    if (tag === 'g') {
      if (close) { if (stack.length > 1) stack.pop(); continue }
      const t = /transform="translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(attrs)
      const cur = stack[stack.length - 1]
      stack.push({ x: cur.x + (t ? Number(t[1]) : 0), y: cur.y + (t ? Number(t[2]) : 0) })
      continue
    }
    if (close) continue
    const cur = stack[stack.length - 1]
    const num = (n) => { const r = new RegExp('\\b' + n + '="(-?[\\d.]+)"').exec(attrs); return r ? Number(r[1]) : null }
    let bottom = null, right = null
    if (tag === 'rect' || tag === 'image') {
      const y = num('y'), h = num('height'), x = num('x'), w = num('width')
      if (y !== null && h !== null) bottom = cur.y + y + h
      if (x !== null && w !== null) right = cur.x + x + w
    } else if (tag === 'text') {
      const y = num('y')
      if (y !== null) bottom = cur.y + y + (num('font-size') || 13) * 0.32
    } else if (tag === 'line') {
      const y1 = num('y1'), y2 = num('y2'), x1 = num('x1'), x2 = num('x2')
      if (y1 !== null && y2 !== null) bottom = cur.y + Math.max(y1, y2)
      if (x1 !== null && x2 !== null) right = cur.x + Math.max(x1, x2)
    } else if (tag === 'circle') {
      const cy = num('cy'), r = num('r')
      if (cy !== null && r !== null) bottom = cur.y + cy + r
    } else if (tag === 'polyline' || tag === 'polygon') {
      const pts = /points="([^"]+)"/.exec(attrs)
      if (pts) {
        const v = pts[1].trim().split(/[\s,]+/).map(Number)
        const ys = v.filter((_, i) => i % 2 === 1)
        if (ys.length) bottom = cur.y + Math.max(...ys)
      }
    } else if (tag === 'path') {
      const d = /d="([^"]+)"/.exec(attrs)
      if (d) {
        const nums = d[1].match(/-?\d+(?:\.\d+)?/g) || []
        const ys = nums.map(Number).filter((_, i) => i % 2 === 1)
        if (ys.length) bottom = cur.y + Math.max(...ys)
      }
    }
    if (bottom !== null && bottom > maxBottom) maxBottom = bottom
    if (right !== null && right > maxRight) maxRight = right
  }
  return { bottom: maxBottom, right: maxRight }
}

// ---------- PNG（只处理浏览器截图会产生的 8bit RGB/RGBA 非隔行） ----------
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG')
  let off = 8, w = 0, h = 0, depth = 0, color = 0, interlace = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; color = data[9]; interlace = data[12] } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6)) throw new Error(`不支持的 PNG（depth=${depth} color=${color} interlace=${interlace}）`)
  const bpp = color === 6 ? 4 : 3
  const stride = w * bpp
  const raw = inflateSync(Buffer.concat(idat))
  const px = Buffer.alloc(h * stride)
  let p = 0
  for (let y = 0; y < h; y++) {
    const ft = raw[p++]
    const row = raw.subarray(p, p + stride); p += stride
    const out = px.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[i - bpp] : 0
      const b = prev ? prev[i] : 0
      const c = prev && i >= bpp ? prev[i - bpp] : 0
      let v = row[i]
      if (ft === 1) v = (v + a) & 0xff
      else if (ft === 2) v = (v + b) & 0xff
      else if (ft === 3) v = (v + ((a + b) >> 1)) & 0xff
      else if (ft === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff
      }
      out[i] = v
    }
  }
  return { w, h, bpp, px }
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c }
  return t
})()
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0 }
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length)
  return out
}
function encodePng(w, h, bpp, px) {
  const stride = w * bpp
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    px.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = bpp === 4 ? 6 : 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 墨迹范围（相对背景色）：用来断言"图没被裁"。 */
function inkExtent(img) {
  const { w, h, bpp, px } = img
  const bg = [px[0], px[1], px[2]]
  let lastInk = -1, lastX = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w * bpp + x * bpp
      if (Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 12) {
        if (y > lastInk) lastInk = y
        if (x > lastX) lastX = x
      }
    }
  }
  return { lastInk, lastX }
}

/**
 * 同一个问题的**快速**版本：想知道"墨迹最低到哪一行、最右到哪一列"，
 * 从底边向上、从右边向左扫，命中即停——守卫里对 3400×2400 的图也只花毫秒级。
 */
export function inkExtentFast(img) {
  const { w, h, bpp, px } = img
  const bg = [px[0], px[1], px[2]]
  const isInk = (x, y) => {
    const i = y * w * bpp + x * bpp
    return Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 12
  }
  let lastInk = -1
  for (let y = h - 1; y >= 0 && lastInk < 0; y--) {
    for (let x = 0; x < w; x++) if (isInk(x, y)) { lastInk = y; break }
  }
  let lastX = -1
  for (let x = w - 1; x >= 0 && lastX < 0; x--) {
    for (let y = 0; y < h; y++) if (isInk(x, y)) { lastX = x; break }
  }
  return { lastInk, lastX }
}

// ---------- render ----------
function asciiTempDir() {
  for (const c of [process.env.TEMP, process.env.TMP, tmpdir(), '/tmp']) {
    if (c && /^[\x20-\x7e]+$/.test(c) && existsSync(c)) return c
  }
  throw new Error('找不到纯 ASCII 的临时目录；无头 Chrome 打不开非 ASCII 路径')
}

export function renderSvgToPng(svgPath, outPng, scale = 2) {
  if (!CHROME) throw new Error('找不到 Chrome/Edge；可用 CHROME_PATH 指定。试过：\n  ' + CHROME_CANDIDATES.join('\n  '))
  const { w, h } = svgSize(svgPath)
  const { bottom, right } = contentBox(svgPath)
  const dir = mkdtempSync(join(asciiTempDir(), 'svg-png-'))
  try {
    const inSvg = join(dir, 'in.svg')
    const shot = join(dir, 'shot.png')
    copyFileSync(svgPath, inSvg)
    const args = ['--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run', '--hide-scrollbars',
      `--force-device-scale-factor=${scale}`, `--window-size=${w},${h + PAD}`,
      `--user-data-dir=${join(dir, 'profile')}`, `--screenshot=${shot}`, 'file:///' + inSvg.replace(/\\/g, '/')]
    const r = spawnSync(CHROME, args, { encoding: 'utf8' })
    if (!existsSync(shot)) throw new Error('Chrome 没有产出截图：' + String(r.stderr || '').slice(-300))

    const img = decodePng(readFileSync(shot))
    const needW = Math.round(w * scale), needH = Math.round(h * scale)
    if (img.w < needW || img.h < needH) throw new Error(`截图 ${img.w}x${img.h} 小于所需 ${needW}x${needH}`)
    // 裁掉多留的高度（以及 new-headless 的浏览器 UI 区域）
    const stride = img.w * img.bpp
    const cropped = Buffer.alloc(needW * img.bpp * needH)
    for (let y = 0; y < needH; y++) {
      img.px.copy(cropped, y * needW * img.bpp, y * stride, y * stride + needW * img.bpp)
    }
    const out = { w: needW, h: needH, bpp: img.bpp, px: cropped }
    const ink = inkExtent(out)
    const tol = 14 * scale
    const problems = []
    if (ink.lastInk < Math.round(bottom * scale) - tol) {
      problems.push(`墨迹只到第 ${ink.lastInk} 行，而 SVG 内容底边在 ${Math.round(bottom * scale)} 行 —— 底部被裁掉了`)
    }
    if (right > 0 && ink.lastX < Math.round(right * scale) - tol) {
      problems.push(`墨迹最右只到第 ${ink.lastX} 列，而 SVG 内容右边界在 ${Math.round(right * scale)} 列 —— 右侧被裁掉了`)
    }
    if (problems.length) throw new Error('光栅化结果不完整：\n  - ' + problems.join('\n  - '))
    writeFileSync(outPng, encodePng(out.w, out.h, out.bpp, out.px))
    return { svg: { w, h }, png: { w: out.w, h: out.h }, scale, ink, content: { bottom, right } }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const invokedDirectly = process.argv[1] && basename(process.argv[1]) === 'render_framework_diagram_png.mjs'
if (invokedDirectly) {
  const [svg, png, scale] = process.argv.slice(2)
  if (!svg || !png) { console.error('用法: node docs/render_framework_diagram_png.mjs <svg> <png> [scale=2]'); process.exit(2) }
  try {
    const r = renderSvgToPng(svg, png, Number(scale || 2))
    console.log(`wrote ${png}: svg ${r.svg.w}x${r.svg.h} × ${r.scale} → ${r.png.w}x${r.png.h}`
      + `  (ink to row ${r.ink.lastInk}/${r.png.h - 1}, content bottom ${r.content.bottom.toFixed(0)})`)
  } catch (e) {
    console.error(String(e.message || e))
    process.exit(1)
  }
}
