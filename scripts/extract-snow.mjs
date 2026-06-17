// Slices the full monochrome SNOW sprite sheet into individual pose grids so p5
// can redraw each pose procedurally. Cream background is removed with a
// flood-fill from the borders (the black outline encloses each cat), then
// connected components separate the poses. Output: lib/snow-frames.ts
//
//   palette: 0 transparent · 1 white · 2 black · 3 grey

import { PNG } from "pngjs"
import fs from "node:fs"

const SRC = "/Users/claytonborges/Downloads/Gemini_Generated_Image_dcnqdqdcnqdqdcnq.png"
const TARGET = 80          // largest pose dimension, in cells (global scale)
const png = PNG.sync.read(fs.readFileSync(SRC))
const W = png.width, H = png.height, D = png.data
const lumAt = (i) => 0.299 * D[i] + 0.587 * D[i + 1] + 0.114 * D[i + 2]
const satAt = (i) => Math.max(D[i], D[i + 1], D[i + 2]) - Math.min(D[i], D[i + 1], D[i + 2])

// ── 1. background flood-fill from the borders through light (cream) pixels ──
const bg = new Uint8Array(W * H)
const PASS = 198 // a pixel is background-passable if at least this light
const stack = []
const pushIf = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const p = y * W + x
  if (bg[p]) return
  if (lumAt(p * 4) >= PASS) { bg[p] = 1; stack.push(p) }
}
for (let x = 0; x < W; x++) { pushIf(x, 0); pushIf(x, H - 1) }
for (let y = 0; y < H; y++) { pushIf(0, y); pushIf(W - 1, y) }
while (stack.length) {
  const p = stack.pop()
  const x = p % W, y = (p / W) | 0
  pushIf(x + 1, y); pushIf(x - 1, y); pushIf(x, y + 1); pushIf(x, y - 1)
}

const isFg = (p) => !bg[p]

// ── 2. connected components of the foreground ──
const NAMEPLATE_Y = Math.floor(H * 0.80)
const label = new Int32Array(W * H).fill(-1)
const blobs = []
const cstack = []
for (let start = 0; start < W * H; start++) {
  if (label[start] !== -1 || !isFg(start)) continue
  const id = blobs.length
  let minX = W, minY = H, maxX = 0, maxY = 0, area = 0, satSum = 0
  cstack.length = 0
  cstack.push(start); label[start] = id
  while (cstack.length) {
    const p = cstack.pop()
    const x = p % W, y = (p / W) | 0
    area++; satSum += satAt(p * 4)
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const np = ny * W + nx
      if (label[np] === -1 && isFg(np)) { label[np] = id; cstack.push(np) }
    }
  }
  blobs.push({ id, minX, minY, maxX, maxY, bw: maxX - minX + 1, bh: maxY - minY + 1, area, sat: satSum / area })
}

// ── 3. keep real poses: drop tiny specks, the nameplate band, text & coloured swatch ──
const minArea = W * H * 0.0006
let poses = blobs.filter((b) =>
  b.area > minArea &&
  b.minY < NAMEPLATE_Y &&
  b.bw < W * 0.4 && b.bh < H * 0.45 &&
  b.bh > 24 && b.bw > 24 &&
  b.sat < 26)            // skip the coloured Siamese head swatch

// reunite a cat's detached parts (tail tip / mask separated by a gap in the
// outline) WITHOUT merging two distinct poses: only absorb a much smaller
// fragment into a larger nearby blob.
const near = (a, b, pad) =>
  a.minX - pad <= b.maxX && b.minX - pad <= a.maxX &&
  a.minY - pad <= b.maxY && b.minY - pad <= a.maxY
let merged = true
while (merged) {
  merged = false
  for (let i = 0; i < poses.length; i++) {
    for (let j = i + 1; j < poses.length; j++) {
      const a = poses[i], b = poses[j]
      const fragment = Math.min(a.area, b.area) < 0.22 * Math.max(a.area, b.area)
      if (fragment && near(a, b, 14)) {
        a.minX = Math.min(a.minX, b.minX); a.minY = Math.min(a.minY, b.minY)
        a.maxX = Math.max(a.maxX, b.maxX); a.maxY = Math.max(a.maxY, b.maxY)
        a.bw = a.maxX - a.minX + 1; a.bh = a.maxY - a.minY + 1; a.area += b.area
        a.ids = (a.ids || [a.id]).concat(b.ids || [b.id])
        poses.splice(j, 1); merged = true; j--
      }
    }
  }
}

// ── 4. order by row (4 bands) then x ──
const rowH = NAMEPLATE_Y / 4
for (const b of poses) { b.row = Math.min(3, Math.floor((b.minY + b.bh / 2) / rowH)) }
poses.sort((a, b) => a.row - b.row || a.minX - b.minX)
poses.forEach((b, i) => { b.col = i })

// ── 5. global scale, then sample each pose into a grid ──
const globalMax = Math.max(...poses.map((b) => Math.max(b.bw, b.bh)))
const scale = TARGET / globalMax
const memberSet = (b) => new Set(b.ids || [b.id])

function classify(lum) { return lum < 95 ? "2" : lum > 200 ? "1" : "3" }

function gridOf(b) {
  const ids = memberSet(b)
  const gw = Math.max(1, Math.round(b.bw * scale))
  const gh = Math.max(1, Math.round(b.bh * scale))
  const sxPerCell = b.bw / gw, syPerCell = b.bh / gh
  const rows = []
  for (let gy = 0; gy < gh; gy++) {
    let row = ""
    for (let gx = 0; gx < gw; gx++) {
      const sx0 = b.minX + gx * sxPerCell, sy0 = b.minY + gy * syPerCell
      let lumSum = 0, fg = 0, tot = 0
      const step = Math.max(1, Math.floor(Math.min(sxPerCell, syPerCell) / 3))
      for (let dy = 0; dy < syPerCell; dy += step) {
        for (let dx = 0; dx < sxPerCell; dx += step) {
          const sx = Math.floor(sx0 + dx), sy = Math.floor(sy0 + dy)
          if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue
          tot++
          const p = sy * W + sx
          if (isFg(p) && ids.has(label[p])) { fg++; lumSum += lumAt(p * 4) }
        }
      }
      if (tot === 0 || fg / tot < 0.4) { row += "0"; continue }
      row += classify(lumSum / fg)
    }
    rows.push(row)
  }
  return { w: gw, h: gh, row: b.row, col: b.col, rows }
}

const frames = poses.map(gridOf)

const out = `// AUTO-GENERATED by scripts/extract-snow.mjs — do not edit by hand.
// SNOW poses redrawn procedurally. Each frame: { w, h, row, col, rows } where
// rows are palette strings (0 transparent · 1 white · 2 black · 3 grey).
export interface SnowFrame { w: number; h: number; row: number; col: number; rows: string[] }
export const SNOW_FRAMES: SnowFrame[] = ${JSON.stringify(frames)}
`
fs.writeFileSync("lib/snow-frames.ts", out)
console.log(`poses kept: ${frames.length}  (globalScale ${scale.toFixed(3)})`)
poses.forEach((b, i) => console.log(`  [${i}] row${b.row} x=${b.minX} y=${b.minY}  ${frames[i].w}x${frames[i].h}`))
