"use client"
import { useEffect, useRef } from "react"

// ──────────────────────────────────────────────────────────────────────────────
// OSCILLOSCOPE — an old analog CRT scope. Phosphor-green time-domain trace with
// afterglow persistence, a classic graticule, edge triggering for a stable
// waveform, soft bloom and scope readouts. Reads the live analyser at 60fps.
// ──────────────────────────────────────────────────────────────────────────────

interface Props {
  getAnalyser: () => AnalyserNode | null
  isPlaying: boolean
  volume: number
  sensitivity?: number
  mode?: "trace" | "dual" | "xy"
}

const DIV_X = 10  // horizontal divisions
const DIV_Y = 8   // vertical divisions
const WINDOW = 1024 // samples shown across the screen

export default function Oscilloscope({ getAnalyser, isPlaying, sensitivity = 1, mode = "trace" }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const getAnalyserRef = useRef(getAnalyser)
  const playingRef = useRef(isPlaying)
  const sensitivityRef = useRef(sensitivity)
  const modeRef = useRef(mode)
  useEffect(() => { getAnalyserRef.current = getAnalyser }, [getAnalyser])
  useEffect(() => { playingRef.current = isPlaying }, [isPlaying])
  useEffect(() => { sensitivityRef.current = sensitivity }, [sensitivity])
  useEffect(() => { modeRef.current = mode }, [mode])

  useEffect(() => {
    const canvas = canvasRef.current!
    const host = hostRef.current!
    const ctx = canvas.getContext("2d")!
    let raf = 0
    let wCss = 0, hCss = 0
    const buf = new Uint8Array(2048)
    const freq = new Uint8Array(1024)
    let vu = 0
    let triggerX = 0

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      wCss = host.clientWidth
      hCss = host.clientHeight
      canvas.width = Math.round(wCss * dpr)
      canvas.height = Math.round(hCss * dpr)
      canvas.style.width = wCss + "px"
      canvas.style.height = hCss + "px"
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = "#030a05"
      ctx.fillRect(0, 0, wCss, hCss)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(host)

    const graticule = () => {
      const dx = wCss / DIV_X, dy = hCss / DIV_Y
      ctx.lineWidth = 1
      ctx.strokeStyle = "rgba(70,170,100,0.13)"
      ctx.beginPath()
      for (let i = 1; i < DIV_X; i++) { ctx.moveTo(i * dx, 0); ctx.lineTo(i * dx, hCss) }
      for (let i = 1; i < DIV_Y; i++) { ctx.moveTo(0, i * dy); ctx.lineTo(wCss, i * dy) }
      ctx.stroke()

      // centre cross — brighter, with minor tick marks
      const cxp = wCss / 2, cyp = hCss / 2
      ctx.strokeStyle = "rgba(90,210,130,0.34)"
      ctx.beginPath()
      ctx.moveTo(cxp, 0); ctx.lineTo(cxp, hCss)
      ctx.moveTo(0, cyp); ctx.lineTo(wCss, cyp)
      ctx.stroke()
      ctx.strokeStyle = "rgba(90,210,130,0.5)"
      ctx.beginPath()
      const tick = 4
      for (let i = 1; i < DIV_X * 5; i++) { const x = (i * wCss) / (DIV_X * 5); ctx.moveTo(x, cyp - tick); ctx.lineTo(x, cyp + tick) }
      for (let i = 1; i < DIV_Y * 5; i++) { const y = (i * hCss) / (DIV_Y * 5); ctx.moveTo(cxp - tick, y); ctx.lineTo(cxp + tick, y) }
      ctx.stroke()

      // outer frame
      ctx.strokeStyle = "rgba(70,170,100,0.3)"
      ctx.lineWidth = 1
      ctx.strokeRect(0.5, 0.5, wCss - 1, hCss - 1)
    }

    const drawPanelChrome = (playing: boolean, currentMode: "trace" | "dual" | "xy") => {
      const g = ctx.createLinearGradient(0, 0, 0, hCss)
      g.addColorStop(0, "rgba(12,31,19,0.92)")
      g.addColorStop(0.5, "rgba(2,9,5,0.96)")
      g.addColorStop(1, "rgba(0,4,2,0.98)")
      ctx.fillStyle = g
      ctx.fillRect(0, 0, wCss, hCss)

      ctx.fillStyle = "rgba(58,208,122,0.06)"
      for (let x = 0; x < wCss; x += 18) ctx.fillRect(x, 0, 1, hCss)
      for (let y = 0; y < hCss; y += 18) ctx.fillRect(0, y, wCss, 1)

      ctx.fillStyle = "rgba(58,208,122,0.65)"
      ctx.font = "11px ui-monospace, monospace"
      ctx.textBaseline = "top"
      ctx.textAlign = "left"
      ctx.fillText(`ASA-SCOPE  ${currentMode.toUpperCase()} DISPLAY`, 12, 10)
      ctx.fillStyle = playing ? "rgba(90,255,150,0.95)" : "rgba(150,150,150,0.7)"
      ctx.textAlign = "right"
      ctx.fillText(playing ? "RUN  LOCK" : "STOP  ARMED", wCss - 12, 10)
    }

    const drawSideMeters = (level: number, playing: boolean) => {
      const meterW = 44
      const top = 34
      const bottom = hCss - 34
      const height = bottom - top
      const filled = height * Math.min(1, level * 1.7)

      ctx.fillStyle = "rgba(0,0,0,0.28)"
      ctx.fillRect(10, top, meterW, height)
      ctx.strokeStyle = "rgba(58,208,122,0.28)"
      ctx.strokeRect(10.5, top + 0.5, meterW - 1, height - 1)
      for (let i = 0; i <= 10; i++) {
        const y = bottom - (i / 10) * height
        ctx.fillStyle = i >= 8 ? "rgba(180,255,205,0.82)" : "rgba(90,255,150,0.5)"
        ctx.fillRect(14, y, i % 2 === 0 ? 14 : 8, 1)
      }
      const fill = ctx.createLinearGradient(0, bottom, 0, top)
      fill.addColorStop(0, "rgba(58,208,122,0.45)")
      fill.addColorStop(0.75, "rgba(150,255,120,0.7)")
      fill.addColorStop(1, "rgba(225,255,235,0.88)")
      ctx.fillStyle = playing ? fill : "rgba(90,120,100,0.18)"
      ctx.fillRect(24, bottom - filled, 16, filled)

      ctx.fillStyle = "rgba(120,230,150,0.55)"
      ctx.font = "9px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.fillText("VU", 32, hCss - 23)
    }

    const drawRadialGrid = (cx: number, cy: number, radius: number) => {
      ctx.save()
      ctx.strokeStyle = "rgba(58,208,122,0.16)"
      ctx.lineWidth = 1
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath()
        ctx.ellipse(cx, cy, radius * i / 4, radius * i / 4, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * radius * 0.16, cy + Math.sin(a) * radius * 0.16)
        ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
        ctx.stroke()
      }
      ctx.strokeStyle = "rgba(210,255,225,0.22)"
      ctx.beginPath()
      ctx.moveTo(cx - radius, cy)
      ctx.lineTo(cx + radius, cy)
      ctx.moveTo(cx, cy - radius)
      ctx.lineTo(cx, cy + radius)
      ctx.stroke()
      ctx.restore()
    }

    const drawXyTrace = (playing: boolean, sensitivityValue: number) => {
      const cx = wCss / 2
      const cy = hCss / 2 + 4
      const radius = Math.min(wCss - 96, hCss - 62) * 0.46
      const gain = Math.min(6.2, Math.max(0.32, Math.pow(sensitivityValue, 0.92)))
      let bass = 0
      let air = 0
      for (let i = 2; i < 48; i++) bass += freq[i]
      for (let i = 260; i < 760; i++) air += freq[i]
      bass = bass / 46 / 255
      air = air / 500 / 255

      drawRadialGrid(cx, cy, radius)

      const drawPhasePath = (phase: number, scale: number, color: string, width: number, glow: number) => {
        ctx.beginPath()
        for (let i = 0; i < WINDOW; i++) {
          const idx = (i * 2) % buf.length
          const a = (buf[idx] - 128) / 128
          const b = (buf[(idx + phase) % buf.length] - 128) / 128
          const swirl = Math.sin(i * 0.026 + phase * 0.011) * air * 0.42
          const x = cx + (a + b * swirl) * radius * scale * gain
          let y = cy + (b - a * swirl) * radius * scale * gain
          if (!playing) y = cy + Math.sin(i * 0.04 + phase) * 2
          if (i === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.lineJoin = "round"
        ctx.shadowColor = color
        ctx.shadowBlur = glow
        ctx.strokeStyle = color
        ctx.lineWidth = width
        ctx.stroke()
      }

      ctx.save()
      ctx.globalCompositeOperation = "lighter"
      drawPhasePath(96, 0.74 + bass * 0.18, "rgba(90,255,150,0.22)", 1.4, 14)
      drawPhasePath(256, 0.58 + air * 0.24, "rgba(180,255,205,0.16)", 1.1, 10)
      drawPhasePath(384, 0.9, "rgba(70,255,140,0.82)", 2.8, 28 + bass * 18)
      drawPhasePath(128, 0.98 + bass * 0.2, "rgba(220,255,230,0.95)", 0.9, 0)
      ctx.restore()

      ctx.shadowBlur = 0
      ctx.fillStyle = "rgba(160,255,190,0.68)"
      ctx.font = "10px ui-monospace, monospace"
      ctx.textAlign = "center"
      ctx.fillText("X-Y LASER", cx, 36)
      ctx.fillStyle = "rgba(210,255,225,0.72)"
      ctx.fillText(`GAIN ${sensitivityValue.toFixed(1)}x`, cx, hCss - 34)
    }

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const an = getAnalyserRef.current()
      const playing = playingRef.current
      const sensitivityValue = sensitivityRef.current
      const currentMode = modeRef.current

      // phosphor persistence: fade the previous frame instead of clearing
      ctx.fillStyle = "rgba(3,10,5,0.24)"
      ctx.fillRect(0, 0, wCss, hCss)
      drawPanelChrome(playing, currentMode)

      // gather samples
      if (an && playing) {
        an.getByteTimeDomainData(buf as Uint8Array<ArrayBuffer>)
        an.getByteFrequencyData(freq as Uint8Array<ArrayBuffer>)
      } else {
        for (let i = 0; i < buf.length; i++) buf[i] = 128
        for (let i = 0; i < freq.length; i++) freq[i] = 0
      }

      let sum = 0
      for (let i = 0; i < freq.length; i++) sum += freq[i]
      vu += ((sum / freq.length / 255) - vu) * 0.22

      // edge trigger: first rising zero-crossing in the first part of the buffer
      let trig = 0
      for (let i = 1; i < buf.length - WINDOW - 1; i++) {
        if (buf[i - 1] < 128 && buf[i] >= 128) { trig = i; break }
      }
      triggerX += (((trig / buf.length) * wCss) - triggerX) * 0.2

      if (currentMode !== "xy") graticule()

      const cyp = hCss / 2
      const gainValue = Math.pow(sensitivityValue, 1.08)
      const vgain = hCss * (currentMode === "dual" ? 0.18 : 0.34) * gainValue
      const marginX = 64
      const traceW = Math.max(10, wCss - marginX - 18)
      const path = (baseline = cyp, scale = 1, sampleOffset = 0, invert = false) => {
        ctx.beginPath()
        for (let i = 0; i < WINDOW; i++) {
          const s = buf[(trig + i + sampleOffset) % buf.length]
          const rawNorm = (s - 128) / 128
          const norm = invert ? -rawNorm : rawNorm
          const x = marginX + (i / (WINDOW - 1)) * traceW
          let y = baseline - norm * vgain * scale
          if (!playing) y = baseline + (Math.random() - 0.5) * 1.5
          if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
        }
      }

      if (currentMode === "xy") {
        drawXyTrace(playing, sensitivityValue)
        drawSideMeters(vu, playing)
      } else {
        if (currentMode === "dual") {
          const topY = hCss * 0.33
          const bottomY = hCss * 0.67
          ctx.strokeStyle = "rgba(58,208,122,0.22)"
          ctx.lineWidth = 1
          ctx.setLineDash([6, 8])
          ctx.beginPath()
          ctx.moveTo(marginX, cyp)
          ctx.lineTo(wCss - 18, cyp)
          ctx.stroke()
          ctx.setLineDash([])

          ctx.lineJoin = "round"
          ctx.shadowColor = "rgba(80,255,150,0.78)"
          ctx.shadowBlur = 16
          ctx.strokeStyle = "rgba(70,255,140,0.84)"
          ctx.lineWidth = 2.6
          path(topY, 0.9, 0, false); ctx.stroke()
          ctx.shadowBlur = 0
          ctx.strokeStyle = "rgba(220,255,230,0.95)"
          ctx.lineWidth = 1
          path(topY, 0.9, 0, false); ctx.stroke()

          ctx.shadowColor = "rgba(130,255,180,0.55)"
          ctx.shadowBlur = 12
          ctx.strokeStyle = "rgba(140,255,185,0.58)"
          ctx.lineWidth = 2
          path(bottomY, 0.72, 164, true); ctx.stroke()
          ctx.shadowBlur = 0
          ctx.strokeStyle = "rgba(210,255,225,0.62)"
          ctx.lineWidth = 0.9
          path(bottomY, 0.72, 164, true); ctx.stroke()

          ctx.fillStyle = "rgba(160,255,190,0.72)"
          ctx.font = "10px ui-monospace, monospace"
          ctx.textAlign = "left"
          ctx.fillText("CH1  TIME", 66, topY - 22)
          ctx.fillText("CH2  DELAYED / INVERTED", 66, bottomY - 22)
        } else {
          ctx.lineJoin = "round"
          ctx.shadowColor = "rgba(80,255,150,0.85)"
          ctx.shadowBlur = 22
          ctx.strokeStyle = "rgba(70,255,140,0.85)"
          ctx.lineWidth = 3.2
          path(cyp, 1.02); ctx.stroke()

          ctx.shadowBlur = 0
          ctx.strokeStyle = "rgba(220,255,230,0.96)"
          ctx.lineWidth = 1.2
          path(cyp, 1.02); ctx.stroke()

          ctx.fillStyle = "rgba(160,255,190,0.72)"
          ctx.font = "10px ui-monospace, monospace"
          ctx.textAlign = "left"
          ctx.fillText("CH1  TIME DOMAIN", 66, 36)
        }

        // trigger cursor
        ctx.strokeStyle = "rgba(210,255,225,0.42)"
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(marginX + triggerX * 0.12, 32)
        ctx.lineTo(marginX + triggerX * 0.12, hCss - 30)
        ctx.stroke()
        ctx.fillStyle = "rgba(210,255,225,0.68)"
        ctx.fillText("TRG", marginX + triggerX * 0.12 + 4, 35)

        drawSideMeters(vu, playing)
      }

      // readouts
      ctx.shadowBlur = 0
      ctx.fillStyle = "rgba(120,230,150,0.7)"
      ctx.font = "10px ui-monospace, monospace"
      ctx.textBaseline = "top"
      ctx.textAlign = "left"
      ctx.fillText("CH1  AC  50mV/DIV", 66, hCss - 30)
      ctx.fillText(`TIME 0.5ms/DIV  ${currentMode.toUpperCase()}  GAIN ${sensitivityValue.toFixed(1)}x`, 66, hCss - 18)
      ctx.textAlign = "right"
      ctx.fillStyle = playing ? "rgba(90,255,150,0.95)" : "rgba(150,150,150,0.7)"
      ctx.fillText(playing ? "● RUN   EDGE ▲ AUTO" : "○ STOP  NO SIGNAL", wCss - 12, hCss - 30)
      ctx.fillStyle = "rgba(120,230,150,0.55)"
      ctx.fillText(`LEVEL ${(vu * 100).toFixed(0).padStart(2, "0")}%`, wCss - 12, hCss - 18)
    }

    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return (
    <div style={{
      width: "100%", height: "100%", position: "relative", overflow: "hidden",
      background: "#020604", padding: 8, boxSizing: "border-box",
    }}>
      {/* bezel */}
      <div style={{
        width: "100%", height: "100%", position: "relative", borderRadius: 10,
        boxShadow: "inset 0 0 70px rgba(0,0,0,0.88), inset 0 0 8px rgba(80,255,150,0.35), 0 0 18px rgba(58,208,122,0.12)",
        overflow: "hidden", background: "#020805", border: "1px solid rgba(58,208,122,0.28)",
      }}>
        <div ref={hostRef} style={{ width: "100%", height: "100%" }}>
          <canvas ref={canvasRef} style={{ display: "block", filter: "drop-shadow(0 0 2px rgba(120,255,170,0.75)) drop-shadow(0 0 8px rgba(58,208,122,0.25))" }} />
        </div>
        {/* screen curvature glow + scanlines */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse at center, rgba(80,255,150,0.04) 0%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.66) 100%)",
        }} />
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "repeating-linear-gradient(0deg, rgba(0,0,0,0) 0, rgba(0,0,0,0) 2px, rgba(0,0,0,0.14) 3px)",
          mixBlendMode: "multiply",
        }} />
      </div>
    </div>
  )
}
