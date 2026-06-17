"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"

// ──────────────────────────────────────────────────────────────────────────────
// ASCII Spectrum Analyzer — canvas-rendered, 60fps, per-character colour + glow.
// Reads the live AnalyserNode directly each frame (via getAnalyser) so it never
// depends on React state cadence. Log frequency scale, peak-hold caps, thermal
// phosphor palette. Pure ASCII glyphs, drawn as text — never bitmap bars.
// ──────────────────────────────────────────────────────────────────────────────

// Display sensitivity. Lower = less likely to slam into the red zone at normal
// listening volume (the analyser input scales with the player volume).
const SENS = 0.55

const COLS = 120
const ROWS = 36
const MIN_FREQ = 20
const MAX_FREQ = 20000
const NYQUIST = 22050
const FFT_BINS = 1024
const MAX_DPR = 1.5
const FRAME_MS = 1000 / 30

const PEAK_CHAR = "━"
const TRACE_CHAR = "•"
const UI_BG = "#aeb7c2"
const UI_PANEL = "#c4ccd5"
const UI_TEXT = "#121a24"
const UI_MUTED = "rgba(18,26,36,0.58)"
const UI_LINE = "rgba(18,26,36,0.28)"
const UI_ACCENT_DARK = "#1b344d"
const UI_ACCENT_FAINT = "rgba(61,111,147,0.3)"

const FREQ_LABELS: [number, string][] = [
  [30, "30"], [60, "60"], [120, "120"], [250, "250"], [500, "500"],
  [1000, "1k"], [2000, "2k"], [4000, "4k"], [8000, "8k"], [16000, "16k"],
]

type Mode = "bars" | "mirror" | "wave"

interface Props {
  getAnalyser: () => AnalyserNode | null
  isPlaying: boolean
  volume: number
}

// ── log bin→column map ─────────────────────────────────────────────────────────
function buildLogIndexMap(): Uint32Array {
  const map = new Uint32Array(COLS + 1)
  const logMin = Math.log10(MIN_FREQ)
  const logMax = Math.log10(MAX_FREQ)
  for (let col = 0; col <= COLS; col++) {
    const hz = Math.pow(10, logMin + ((logMax - logMin) * col) / COLS)
    map[col] = Math.min(FFT_BINS - 1, Math.max(0, Math.round((hz / NYQUIST) * FFT_BINS)))
  }
  return map
}

function freqToCol(hz: number): number {
  const logMin = Math.log10(MIN_FREQ)
  const logMax = Math.log10(MAX_FREQ)
  return (Math.log10(Math.max(MIN_FREQ, hz)) - logMin) / (logMax - logMin)
}

// ── thermal phosphor palette: green → lime → amber → hot ────────────────────────
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }
function palette(t: number): [number, number, number] {
  t = Math.max(0, Math.min(1, t))
  if (t < 0.5) {
    const k = t / 0.5
    return [lerp(40, 150, k), lerp(255, 255, k), lerp(120, 40, k)]
  } else if (t < 0.84) {
    const k = (t - 0.5) / 0.34
    return [lerp(150, 255, k), lerp(255, 210, k), lerp(40, 30, k)]
  } else {
    const k = (t - 0.84) / 0.16
    return [lerp(255, 255, k), lerp(210, 70, k), lerp(30, 40, k)]
  }
}

export default function AsciiSpectrum({ getAnalyser, isPlaying, volume }: Props) {
  const [mode, setMode] = useState<Mode>("bars")
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  const logIndexMap = useMemo(() => buildLogIndexMap(), [])

  // persistent per-column animation state
  const barsRef = useRef<Float32Array>(new Float32Array(COLS))
  const peaksRef = useRef<Float32Array>(new Float32Array(COLS))
  const peakHoldRef = useRef<Float32Array>(new Float32Array(COLS))
  const floorRef = useRef<Float32Array>(new Float32Array(COLS))
  const curveRef = useRef<Float32Array>(new Float32Array(COLS))
  const targetsRef = useRef<Float32Array>(new Float32Array(COLS))
  const freqBuf = useRef<Uint8Array>(new Uint8Array(FFT_BINS))
  const timeBuf = useRef<Uint8Array>(new Uint8Array(2048))

  // refs that the rAF loop reads without re-subscribing
  const modeRef = useRef(mode)
  const playingRef = useRef(isPlaying)
  useEffect(() => { modeRef.current = mode }, [mode])
  useEffect(() => { playingRef.current = isPlaying }, [isPlaying])

  // keep the backing store crisp & sized to the container
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1, cw: 0, ch: 0 })
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1)
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = w + "px"
    canvas.style.height = h + "px"
    // reserve 2 rows at the bottom for the frequency ruler
    sizeRef.current = { w, h, dpr, cw: (w * dpr) / COLS, ch: (h * dpr) / (ROWS + 2) }
  }, [])

  useEffect(() => {
    resize()
    const ro = new ResizeObserver(resize)
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [resize])

  // ── the render loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    let raf = 0
    let t0 = performance.now()
    let lastPaint = 0
    const ctx = canvasRef.current?.getContext("2d")

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      const canvas = canvasRef.current
      if (!canvas || !ctx) return
      if (now - lastPaint < FRAME_MS) return
      lastPaint = now
      const { cw, ch } = sizeRef.current
      if (cw === 0 || ch === 0) return

      const analyser = getAnalyser()
      const playing = playingRef.current
      const dt = Math.min(0.05, Math.max(0.001, (now - t0) / 1000))
      t0 = now

      // 1. pull live data → per-column targets
      const targets = targetsRef.current
      if (analyser && playing) {
        analyser.getByteFrequencyData(freqBuf.current as Uint8Array<ArrayBuffer>)
        const f = freqBuf.current
        for (let col = 0; col < COLS; col++) {
          const start = logIndexMap[col]
          const end = Math.max(start + 1, logIndexMap[col + 1])
          let sum = 0, n = 0
          for (let b = start; b < end && b < FFT_BINS; b++) { sum += f[b]; n++ }
          const avg = n > 0 ? sum / n : 0
          const boost = 1 + (col / COLS) * 0.9           // gentle tilt up the highs
          targets[col] = Math.min(1, (avg / 255) * boost * SENS)
        }
      } else {
        // idle: a slow breathing baseline so it never looks dead
        for (let col = 0; col < COLS; col++) {
          const wv = Math.sin(now * 0.0011 + col * 0.18) * 0.5 + 0.5
          targets[col] = 0.035 + wv * 0.055 * (Math.sin(now * 0.0005) * 0.5 + 0.5)
          targets[col] = Math.max(0, targets[col])
        }
      }

      // 2. smooth (fast attack, slow release) + peak hold
      const bars = barsRef.current, peaks = peaksRef.current, hold = peakHoldRef.current
      const floor = floorRef.current, curve = curveRef.current
      for (let col = 0; col < COLS; col++) {
        const tgt = targets[col]
        const attack = tgt > bars[col] ? 0.46 : 0.1
        bars[col] += (tgt - bars[col]) * attack
        floor[col] += (Math.max(tgt, floor[col] * 0.985) - floor[col]) * 0.08
        if (bars[col] >= peaks[col]) { peaks[col] = bars[col]; hold[col] = 0.55 }
        else if (hold[col] > 0) { hold[col] -= 1 / 60 }
        else { peaks[col] = Math.max(bars[col], peaks[col] - 0.012) }
      }
      for (let col = 0; col < COLS; col++) {
        const left = bars[Math.max(0, col - 1)]
        const center = bars[col]
        const right = bars[Math.min(COLS - 1, col + 1)]
        curve[col] += (((left + center * 2 + right) / 4) - curve[col]) * 0.34
      }

      // 3. paint
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.font = `${ch}px ui-monospace, monospace`
      ctx.textBaseline = "top"
      ctx.textAlign = "left"
      drawBackdrop(ctx, cw, ch, now, playing)

      const m = modeRef.current
      if (m === "wave") {
        drawWave(ctx, analyser, playing, cw, ch, timeBuf.current)
      } else {
        const mirror = m === "mirror"
        const usableRows = mirror ? Math.floor(ROWS * 0.55) : ROWS - 3
        const baseRow = mirror ? Math.floor(ROWS * 0.56) : ROWS - 2

        for (let col = 0; col < COLS; col++) {
          const x = col * cw
          const barLevel = Math.min(1, bars[col] * 1.08)
          const floorLevel = Math.min(1, floor[col] * 0.7)
          const filledRows = Math.max(0, Math.round(barLevel * usableRows))
          const ghostRows = Math.max(filledRows, Math.round(floorLevel * usableRows))
          const bodyGlyph = col % 3 === 0 ? "█" : col % 3 === 1 ? "▌" : "▐"

          for (let r = 0; r < usableRows; r++) {
            const active = r < filledRows
            const ghost = !active && r < ghostRows
            if (!active && !ghost) continue
            const heightT = r / usableRows
            const [rr, gg, bb] = palette(heightT)
            const yUp = (baseRow - 1 - r) * ch
            ctx.fillStyle = active
              ? `rgba(${rr | 0},${gg | 0},${bb | 0},0.94)`
              : `rgba(${rr | 0},${gg | 0},${bb | 0},0.13)`
            ctx.fillText(active ? bodyGlyph : "░", x, yUp)
            if (mirror) {
              const fade = (active ? 0.24 : 0.08) * (1 - r / usableRows)
              ctx.fillStyle = `rgba(${rr | 0},${gg | 0},${bb | 0},${fade.toFixed(3)})`
              ctx.fillText(active ? "╹" : "·", x, (baseRow + r) * ch)
            }
          }

          const curveRow = (baseRow - 1) - Math.round(curve[col] * usableRows)
          if (curveRow >= 0 && curveRow < ROWS) {
            const [rr, gg, bb] = palette(Math.min(1, curve[col] * 1.2))
            ctx.fillStyle = `rgba(${rr | 0},${gg | 0},${bb | 0},0.9)`
            ctx.fillText(TRACE_CHAR, x, curveRow * ch)
            if (col > 0 && Math.abs(curve[col] - curve[col - 1]) > 0.035) {
              ctx.fillStyle = `rgba(${rr | 0},${gg | 0},${bb | 0},0.45)`
              ctx.fillText(curve[col] > curve[col - 1] ? "╱" : "╲", x, curveRow * ch)
            }
          }

          if (peaks[col] > 0.02) {
            const pr = Math.min(usableRows - 1, Math.round(peaks[col] * usableRows) - 1)
            if (pr >= 0) {
              ctx.fillStyle = "rgba(255,255,255,0.92)"
              ctx.fillText(PEAK_CHAR, x, (baseRow - 1 - pr) * ch)
            }
          }
        }
        drawEnergyBands(ctx, cw, ch, bars, dt)
      }

      // 4. frequency ruler (always at the bottom 2 rows)
      drawRuler(ctx, cw, ch)
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [getAnalyser, logIndexMap])

  function drawBackdrop(ctx: CanvasRenderingContext2D, cw: number, ch: number, now: number, playing: boolean) {
    ctx.fillStyle = "rgba(4,10,6,0.98)"
    ctx.fillRect(0, 0, canvasRef.current?.width ?? 0, canvasRef.current?.height ?? 0)

    ctx.fillStyle = "rgba(58,208,122,0.08)"
    for (let row = 4; row < ROWS - 2; row += 4) {
      for (let col = 0; col < COLS; col += 2) ctx.fillText(row % 8 === 0 ? "─" : "·", col * cw, row * ch)
    }

    ctx.fillStyle = "rgba(58,208,122,0.16)"
    for (let col = 0; col < COLS; col += 12) {
      for (let row = 0; row < ROWS - 1; row++) ctx.fillText(row % 4 === 0 ? "┆" : "·", col * cw, row * ch)
    }

    if (!playing) {
      const scan = Math.floor((now * 0.006) % ROWS)
      ctx.fillStyle = "rgba(58,208,122,0.08)"
      for (let col = 0; col < COLS; col += 4) ctx.fillText("─", col * cw, scan * ch)
    }
  }

  function drawEnergyBands(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    bars: Float32Array,
    dt: number,
  ) {
    const bands: [number, number, string][] = [
      [0, 26, "SUB"],
      [26, 54, "LOW"],
      [54, 86, "MID"],
      [86, COLS, "AIR"],
    ]
    const y = 1 * ch
    for (const [start, end, label] of bands) {
      let sum = 0
      for (let col = start; col < end; col++) sum += bars[col]
      const value = Math.min(1, (sum / (end - start)) * 1.45)
      const width = Math.max(1, Math.round((end - start) * value))
      const [rr, gg, bb] = palette(value)
      ctx.fillStyle = "rgba(58,208,122,0.28)"
      ctx.fillText(label, start * cw, y)
      ctx.fillStyle = `rgba(${rr | 0},${gg | 0},${bb | 0},0.5)`
      for (let col = start; col < start + width; col += 2) ctx.fillText("═", col * cw, y)
    }
    void dt
  }

  // ── ruler ───────────────────────────────────────────────────────────────────
  function drawRuler(ctx: CanvasRenderingContext2D, cw: number, ch: number) {
    const tickY = ROWS * ch
    const labelY = (ROWS + 1) * ch
    ctx.fillStyle = "rgba(80,200,120,0.55)"
    for (const [hz, label] of FREQ_LABELS) {
      const col = Math.round(freqToCol(hz) * (COLS - 1))
      const x = col * cw
      ctx.fillStyle = "rgba(90,210,130,0.5)"
      ctx.fillText("╵", x, tickY)
      ctx.fillStyle = "rgba(120,230,150,0.7)"
      const lx = Math.max(0, x - (label.length * cw) / 2)
      ctx.fillText(label, lx, labelY)
    }
  }

  // ── waveform (time domain oscilloscope, ASCII) ────────────────────────────────
  function drawWave(
    ctx: CanvasRenderingContext2D,
    analyser: AnalyserNode | null,
    playing: boolean,
    cw: number,
    ch: number,
    buf: Uint8Array,
  ) {
    const mid = ROWS / 2
    if (analyser && playing) {
      analyser.getByteTimeDomainData(buf as Uint8Array<ArrayBuffer>)
    } else {
      for (let i = 0; i < buf.length; i++) buf[i] = 128
    }
    const step = buf.length / COLS
    let prevRow = mid
    for (let col = 0; col < COLS; col++) {
      const s = buf[Math.floor(col * step)]
      const norm = (s - 128) / 128
      const row = mid - norm * (mid - 1)
      const intensity = Math.min(1, Math.abs(norm) * 1.6 + 0.15)
      const [rr, gg, bb] = palette(intensity)
      ctx.fillStyle = `rgb(${rr | 0},${gg | 0},${bb | 0})`
      ctx.fillText("•", col * cw, Math.round(row) * ch)
      // connect to previous sample with a faint vertical run
      const lo = Math.min(prevRow, row), hi = Math.max(prevRow, row)
      ctx.fillStyle = `rgba(${rr | 0},${gg | 0},${bb | 0},0.35)`
      for (let r = Math.ceil(lo); r < Math.floor(hi); r++) {
        ctx.fillText("│", col * cw, r * ch)
      }
      prevRow = row
    }
    // centre line
    ctx.fillStyle = "rgba(80,200,120,0.18)"
    for (let col = 0; col < COLS; col += 2) ctx.fillText("·", col * cw, Math.round(mid) * ch)
  }

  // ── chrome ────────────────────────────────────────────────────────────────────
  const MODE_LABELS: Record<Mode, string> = { bars: "BARS", mirror: "MIRROR", wave: "WAVE" }

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", background: UI_BG }}>
      {/* header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "3px 8px", borderBottom: `1px solid ${UI_LINE}`,
        fontSize: 10, fontFamily: "ui-monospace, monospace", color: UI_ACCENT_DARK, letterSpacing: "1px",
        flexShrink: 0,
        background: `linear-gradient(180deg, ${UI_PANEL}, ${UI_BG})`,
      }}>
        <span style={{ color: UI_MUTED }}>SPECTRUM · 44.1kHz · FFT 2048 · PRECISION</span>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {(["bars", "mirror", "wave"] as Mode[]).map((mm) => (
            <button
              key={mm}
              onClick={() => setMode(mm)}
              style={{
                fontFamily: "ui-monospace, monospace", fontSize: 10, padding: "1px 8px", cursor: "pointer",
                border: "1px solid",
                borderColor: mode === mm ? UI_ACCENT_DARK : UI_LINE,
                background: mode === mm ? UI_ACCENT_DARK : "transparent",
                color: mode === mm ? UI_BG : UI_ACCENT_DARK,
                fontWeight: mode === mm ? 700 : 400, letterSpacing: "1px",
                boxShadow: mode === mm ? `0 0 8px ${UI_ACCENT_FAINT}` : "none",
              }}
            >
              {MODE_LABELS[mm]}
            </button>
          ))}
          <span style={{
            marginLeft: 6, width: 6, height: 6, borderRadius: "50%",
            background: isPlaying ? UI_ACCENT_DARK : "rgba(18,26,36,0.24)",
            boxShadow: isPlaying ? `0 0 6px ${UI_ACCENT_FAINT}` : "none", display: "inline-block",
          }} />
        </div>
      </div>

      {/* canvas field with CRT bloom + scanlines */}
      <div ref={wrapRef} style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", background: "#040806" }}>
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute", inset: 0, display: "block",
            filter: "drop-shadow(0 0 1px rgba(120,255,170,0.7)) drop-shadow(0 0 5px rgba(80,255,150,0.35))",
          }}
        />
        {/* scanlines */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "repeating-linear-gradient(0deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 2px, rgba(0,0,0,0.18) 3px, rgba(0,0,0,0) 4px)",
          mixBlendMode: "multiply",
        }} />
        {/* vignette */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.55) 100%)",
        }} />
      </div>
    </div>
  )
}
