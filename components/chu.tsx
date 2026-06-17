"use client"
import { useEffect, useRef } from "react"
import type p5Type from "p5"
import { SNOW_FRAMES } from "@/lib/snow-frames"

// ──────────────────────────────────────────────────────────────────────────────
// CHU (SNOW) — recreated in Processing (p5.js). Redrawn every frame as procedural
// pixel art (one rect per cell) from poses sliced off the reference sprite sheet.
// A small state machine drives her with the live audio: she sleeps when paused,
// sits idle when quiet, walks, then runs as it gets louder, and pounces on big
// beats. Phosphor outline + lightweight reactive halo + glow.
// Palette: 1 light phosphor · 2 near-black green · 3 mid phosphor.
// ──────────────────────────────────────────────────────────────────────────────

interface Props {
  getAnalyser: () => AnalyserNode | null
  isPlaying: boolean
  volume: number
}

// pose indices into SNOW_FRAMES (see scripts/extract-snow.mjs ordering)
const POSE = {
  sleep: [21, 22],          // curled on the cushion
  idle: [1, 2],             // sitting front, slow blink
  walk: [7, 8, 9, 10],      // walk cycle
  run: [11, 12, 13],        // run cycle
  jump: [17, 18, 15],       // pounce → jump → leap (one-shot)
}
const globalMaxDim = Math.max(...SNOW_FRAMES.map((f) => Math.max(f.w, f.h)))

type State = "sleep" | "idle" | "walk" | "run" | "jump"

export default function Chu({ getAnalyser, isPlaying }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const getAnalyserRef = useRef(getAnalyser)
  const playingRef = useRef(isPlaying)
  useEffect(() => { getAnalyserRef.current = getAnalyser }, [getAnalyser])
  useEffect(() => { playingRef.current = isPlaying }, [isPlaying])

  useEffect(() => {
    let p5i: p5Type | null = null
    let disposed = false

    import("p5").then(({ default: P5 }) => {
      if (disposed || !hostRef.current) return

      const sketch = (p: p5Type) => {
        const freq = new Uint8Array(1024)
        let amp = 0, bass = 0, prevBass = 0, energy = 0, avgE = 0
        let state: State = "sleep"
        let frameAccum = 0, frameIdx = 0
        let jumpTimer = 0
        let bob = 0, squash = 0
        let blink = 0

        const RING = 48
        const ringVals = new Float32Array(RING)
        type Ripple = { x: number; y: number; r: number; life: number; strength: number }
        type Dust = { x: number; y: number; vx: number; vy: number; life: number; size: number }
        const ripples: Ripple[] = []
        const dust: Dust[] = []

        p.setup = () => {
          const el = hostRef.current!
          const c = p.createCanvas(el.clientWidth, el.clientHeight)
          c.parent(el)
          p.frameRate(60)
          p.noStroke()
        }
        p.windowResized = () => {
          const el = hostRef.current
          if (el) p.resizeCanvas(el.clientWidth, el.clientHeight)
        }

        const readAudio = () => {
          const an = getAnalyserRef.current()
          if (an && playingRef.current) {
            an.getByteFrequencyData(freq as Uint8Array<ArrayBuffer>)
            let s = 0
            for (let i = 0; i < freq.length; i++) s += freq[i]
            const a = s / freq.length / 255
            let b = 0
            for (let i = 0; i < 36; i++) b += freq[i]
            const bb = b / 36 / 255
            amp += (a - amp) * 0.25
            bass += (bb - bass) * 0.35
            for (let i = 0; i < RING; i++) {
              const bin = Math.floor(Math.pow(i / RING, 1.7) * 480) + 1
              ringVals[i] += (freq[bin] / 255 - ringVals[i]) * 0.4
            }
          } else {
            amp += (0 - amp) * 0.12
            bass += (0 - bass) * 0.12
            for (let i = 0; i < RING; i++) ringVals[i] *= 0.9
          }
          energy = Math.max(amp * 1.4, bass)
        }

        // draw one pose. mode 0 = palette, 1 = flat colour (outline/glow silhouette)
        const drawPose = (f: typeof SNOW_FRAMES[number], cell: number, mode: 0 | 1, r = 0, gn = 0, b = 0, a = 0) => {
          const gw = f.w * cell, gh = f.h * cell
          const ox = -gw / 2, oy = -gh // bottom-centre anchor
          if (mode === 1) p.fill(r, gn, b, a)
          for (let ry = 0; ry < f.rows.length; ry++) {
            const row = f.rows[ry]
            for (let cx = 0; cx < row.length; cx++) {
              const v = row.charCodeAt(cx) - 48
              if (v === 0) continue
              if (mode === 0) {
                if (v === 1) p.fill(202, 255, 218)
                else if (v === 2) p.fill(3, 12, 7)
                else p.fill(72, 190, 112)
              }
              p.rect(ox + cx * cell, oy + ry * cell, cell + 0.6, cell + 0.6)
            }
          }
        }

        p.draw = () => {
          const dt = Math.min(0.05, p.deltaTime / 1000)
          readAudio()
          const playing = playingRef.current
          const w = p.width, h = p.height, cx = w / 2, cy = h / 2
          const g = p.drawingContext as CanvasRenderingContext2D

          // background + vignette
          p.background(7, 11, 9)
          const grd = g.createRadialGradient(cx, cy, h * 0.1, cx, cy, h * 0.75)
          grd.addColorStop(0, "rgba(20,40,28,0.55)")
          grd.addColorStop(1, "rgba(0,0,0,0)")
          g.fillStyle = grd
          g.fillRect(0, 0, w, h)

          const baseR = Math.min(w, h) * 0.32

          // lightweight mascot halo; the dedicated spectrum panel carries the heavy analyzer work.
          p.push()
          p.translate(cx, cy)
          g.globalCompositeOperation = "lighter"
          for (let i = 0; i < RING; i++) {
            const ang = (i / RING) * p.TWO_PI - p.HALF_PI
            const v = ringVals[i]
            const len = baseR * 0.12 + v * baseR * 0.85
            const t = v
            p.strokeWeight(2 + v * 2)
            p.stroke(60 + t * 195, 220 - t * 40, 110 - t * 70, 150 + v * 105)
            p.line(Math.cos(ang) * baseR, Math.sin(ang) * baseR,
              Math.cos(ang) * (baseR + len), Math.sin(ang) * (baseR + len))
          }
          p.rotate(p.millis() * 0.00028)
          p.strokeWeight(1)
          p.stroke(90, 255, 160, 34 + amp * 70)
          for (let k = 0; k < 3; k++) {
            const rr = baseR * (0.78 + k * 0.16 + amp * 0.08)
            p.arc(0, 0, rr * 2, rr * 2, k * 1.7, k * 1.7 + 1.9 + amp * 0.7)
          }
          p.noStroke()
          g.globalCompositeOperation = "source-over"
          p.pop()

          // glow halo
          p.push()
          g.globalCompositeOperation = "lighter"
          const halo = baseR * (1.1 + amp * 0.5)
          for (let k = 3; k >= 1; k--) {
            p.fill(40 + amp * 60, 200, 120, 11 + amp * 24)
            p.ellipse(cx, cy + h * 0.04, halo * k * 0.55, halo * k * 0.5)
          }
          g.globalCompositeOperation = "source-over"
          p.pop()

          // ── state machine ──
          const beat = bass - prevBass
          prevBass = bass
          // adaptive: she walks at the track's typical energy and breaks into a
          // run only on sections louder than its moving average — works on any track
          avgE += (energy - avgE) * 0.015
          let base: State = "sleep"
          if (!playing) base = "sleep"
          else if (energy < 0.07) base = "idle"
          else base = energy >= Math.max(0.06, avgE) * 1.25 ? "run" : "walk"

          if (jumpTimer > 0) jumpTimer -= dt
          const strongBeat = playing && base !== "idle" && beat > 0.06 && bass > 0.42
          if (strongBeat && jumpTimer <= 0) {
            jumpTimer = 0.52
            ripples.push({ x: cx, y: cy + h * 0.20, r: 8, life: 1, strength: Math.min(1, bass + beat) })
            for (let i = 0; i < 8 && dust.length < 40; i++) {
              dust.push({
                x: cx + p.random(-44, 44),
                y: cy + h * 0.20 + p.random(-2, 8),
                vx: p.random(-1.6, 1.6),
                vy: p.random(-1.8, -0.3),
                life: p.random(0.45, 0.9),
                size: p.random(1.5, 4),
              })
            }
          }

          const next: State = jumpTimer > 0 ? "jump" : base
          if (next !== state) { state = next; frameAccum = 0; frameIdx = 0 }

          const seq = POSE[state]
          const fps =
            state === "sleep" ? 1.2 :
            state === "idle" ? 1.6 :
            state === "walk" ? 7 + energy * 14 :
            state === "run" ? 11 + energy * 16 :
            seq.length / 0.52  // jump plays once across the timer
          frameAccum += dt * fps
          while (frameAccum >= 1) { frameAccum -= 1; frameIdx = (frameIdx + 1) % seq.length }
          // idle: hold mostly on frame 0, brief blink to frame 1
          if (state === "idle") {
            blink += dt
            frameIdx = (blink % 3.2 > 3.0) ? 1 : 0
          }
          const frame = SNOW_FRAMES[seq[frameIdx % seq.length]]

          // motion: bob + squash on beats
          squash += ((Math.max(0, beat) * 0.45) - squash) * 0.25
          squash = Math.min(0.09, squash)
          const bobSpeed = state === "run" ? 9 : state === "walk" ? 5 : 2.5
          bob = -Math.abs(Math.sin(p.millis() / 1000 * (bobSpeed + amp * 6))) * (1.5 + amp * 12)
          if (state === "jump") bob -= (1 - Math.abs(jumpTimer / 0.52 - 0.5) * 2) * 40 // arc

          // sizing: global scale keeps all poses proportional to each other
          const cell = Math.min(w * 0.74 / globalMaxDim, h * 0.62 / globalMaxDim)
          const groundY = cy + h * 0.20

          // expanding bass ripples on the floor
          p.push()
          g.globalCompositeOperation = "lighter"
          p.noFill()
          for (let i = ripples.length - 1; i >= 0; i--) {
            const rp = ripples[i]
            rp.r += dt * (160 + rp.strength * 140)
            rp.life -= dt * 0.85
            if (rp.life <= 0) { ripples.splice(i, 1); continue }
            p.stroke(80, 255, 150, rp.life * 120)
            p.strokeWeight(1 + rp.strength * 3)
            p.ellipse(rp.x, rp.y + 6, rp.r * 2.2, rp.r * 0.42)
          }
          p.noStroke()
          g.globalCompositeOperation = "source-over"
          p.pop()

          // floor shadow
          p.fill(0, 0, 0, 90)
          p.ellipse(cx, groundY + 4, frame.w * cell * 0.7, frame.h * cell * 0.07)

          // low dust pixels kicked up by the beat
          p.push()
          for (let i = dust.length - 1; i >= 0; i--) {
            const d = dust[i]
            d.x += d.vx
            d.y += d.vy
            d.vy += 0.035
            d.life -= dt
            if (d.life <= 0) { dust.splice(i, 1); continue }
            p.fill(110, 255, 170, d.life * 150)
            p.rect(d.x, d.y, d.size, d.size)
          }
          p.pop()

          // ── draw Chu ──
          p.push()
          p.translate(cx, groundY + bob)
          p.scale(1 + squash * 0.8, 1 - squash * 0.5)

          // outer additive glow (breathes with audio)
          g.globalCompositeOperation = "lighter"
          const gd = Math.max(3, cell * 0.7)
          for (const [dx, dy] of [[gd, 0], [-gd, 0], [0, gd], [0, -gd]]) {
            p.push(); p.translate(dx, dy); drawPose(frame, cell, 1, 60, 255, 150, 18 + amp * 60); p.pop()
          }
          g.globalCompositeOperation = "source-over"

          // crisp phosphor outline (offset silhouettes)
          const bw = Math.max(2, cell * 0.4)
          for (const [dx, dy] of [[bw, 0], [-bw, 0], [0, bw], [0, -bw], [bw, bw], [-bw, bw], [bw, -bw], [-bw, -bw]]) {
            p.push(); p.translate(dx, dy); drawPose(frame, cell, 1, 74, 255, 150, 230); p.pop()
          }

          drawPose(frame, cell, 0)

          // tiny audio-reactive highlights along the sprite body
          if (playing && amp > 0.025) {
            g.globalCompositeOperation = "lighter"
            p.fill(160, 255, 190, 30 + amp * 120)
            const glints = 4 + Math.floor(amp * 12)
            for (let i = 0; i < glints; i++) {
              const gx = p.random(-frame.w * cell * 0.34, frame.w * cell * 0.34)
              const gy = p.random(-frame.h * cell * 0.82, -frame.h * cell * 0.18)
              p.rect(gx, gy, Math.max(1.5, cell * 0.22), Math.max(1.5, cell * 0.22))
            }
            g.globalCompositeOperation = "source-over"
          }
          p.pop()

          // labels
          p.textAlign(p.CENTER, p.CENTER)
          p.textStyle(p.NORMAL)
          p.textSize(11)
          p.fill(90, 150, 110, 160)
          p.text("[ CHU ]", cx, h - 30)
          const label =
            state === "sleep" ? "zZz dreaming" :
            state === "idle" ? "chilling" :
            state === "walk" ? "strolling" :
            state === "run" ? "running" : "pounce"
          p.fill(state === "run" || state === "jump" ? 150 : 90, state === "sleep" ? 150 : 235, 170, 200)
          p.textSize(10)
          p.text(label, cx, h - 15)
        }
      }

      p5i = new P5(sketch)
    })

    return () => { disposed = true; p5i?.remove() }
  }, [])

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", background: "#070b09" }}>
      <div ref={hostRef} style={{ width: "100%", height: "100%" }} />
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none",
        background: "repeating-linear-gradient(0deg, rgba(0,0,0,0) 0, rgba(0,0,0,0) 2px, rgba(0,0,0,0.12) 3px)",
        mixBlendMode: "multiply",
      }} />
    </div>
  )
}
