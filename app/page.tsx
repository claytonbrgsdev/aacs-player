"use client"

import { useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { AudioProvider, useAudio } from "@/lib/audio-context"
import type { Track } from "@/lib/audio-context"

const AsciiSpectrum = dynamic(() => import("@/components/ascii-spectrum"), { ssr: false })
const Chu = dynamic(() => import("@/components/chu"), { ssr: false })
const Oscilloscope = dynamic(() => import("@/components/oscilloscope"), { ssr: false })

// ── theme ─────────────────────────────────────────────────────────────────────
const PHOS = "#3ad07a"
const PHOS_DIM = "rgba(58,208,122,0.45)"
const PHOS_FAINT = "rgba(58,208,122,0.18)"
const DISPLAY_BG = "#040705"
const UI_BG = "#f3ead4"
const UI_PANEL = "#e7dbc0"
const UI_PANEL_DARK = "#d5c29b"
const UI_TEXT = "#2e2619"
const UI_MUTED = "rgba(46,38,25,0.58)"
const UI_LINE = "rgba(46,38,25,0.28)"
const UI_ACCENT = "#8b5e2f"
const UI_ACCENT_DARK = "#5b3b1d"
const UI_ACCENT_FAINT = "rgba(139,94,47,0.28)"
const OSC_MODES = ["trace", "dual", "xy"] as const
type OscMode = typeof OSC_MODES[number]

function formatTime(t: number): string {
  if (!t || isNaN(t)) return "0:00"
  return `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`
}

// ── live VU meter (16 segments) ─────────────────────────────────────────────────
function VuMeter({ level }: { level: number }) {
  const SEG = 16
  const lit = Math.round(Math.min(1, level * 1.4) * SEG)
  return (
    <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
      {Array.from({ length: SEG }).map((_, i) => {
        const on = i < lit
        const col = i < 9 ? UI_ACCENT_DARK : i < 13 ? UI_ACCENT : "#9f3d2f"
        return (
          <span
            key={i}
            style={{
              width: 3, height: 9, borderRadius: 1,
              background: on ? col : "rgba(46,38,25,0.15)",
              boxShadow: on ? `0 0 4px ${col}` : "none",
              transition: "background 0.05s, box-shadow 0.05s",
            }}
          />
        )
      })}
    </div>
  )
}

function PlayerApp() {
  const audio = useAudio()
  const [shuffleMode, setShuffleMode] = useState(false)
  const [fileInputError, setFileInputError] = useState<string | null>(null)
  const [scopeSensitivity, setScopeSensitivity] = useState(1.4)
  const [scopeMode, setScopeMode] = useState<OscMode>("xy")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audio.duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect()
      audio.seek(((e.clientX - rect.left) / rect.width) * audio.duration)
    }
  }

  const togglePlay = () => {
    if (audio.isPlaying) audio.pause()
    else audio.play(audio.currentTrack ?? audio.allTracks[0])
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0]
    if (!file) return
    const track = audio.addLocalTrack(file)
    if (!track) {
      setFileInputError("Arquivo de audio invalido.")
      e.currentTarget.value = ""
      return
    }

    setFileInputError(null)
    e.currentTarget.value = ""
    audio.play(track)
  }

  const playNext = () => {
    const idx = audio.allTracks.findIndex((t) => t.id === audio.currentTrack?.id)
    if (shuffleMode) {
      const others = audio.allTracks.filter((t) => t.id !== audio.currentTrack?.id)
      if (others.length > 0) audio.play(others[Math.floor(Math.random() * others.length)])
    } else {
      audio.play(audio.allTracks[(idx + 1) % audio.allTracks.length])
    }
  }

  const playPrev = () => {
    const idx = audio.allTracks.findIndex((t) => t.id === audio.currentTrack?.id)
    if (shuffleMode) {
      const others = audio.allTracks.filter((t) => t.id !== audio.currentTrack?.id)
      if (others.length > 0) audio.play(others[Math.floor(Math.random() * others.length)])
    } else {
      audio.play(audio.allTracks[(idx - 1 + audio.allTracks.length) % audio.allTracks.length])
    }
  }

  const statusColor = audio.error ? "#9f3d2f" : audio.isPlaying ? UI_ACCENT_DARK : UI_MUTED
  const statusLabel = audio.error ? "ERROR" : audio.isPlaying ? "PLAYING" : "IDLE"
  const progressPct = audio.duration > 0 ? Math.min(100, (audio.currentTime / audio.duration) * 100) : 0

  const visualizationProps = useMemo(() => ({
    getAnalyser: audio.getAnalyser,
    isPlaying: audio.isPlaying,
    volume: audio.volume,
  }), [audio.getAnalyser, audio.isPlaying, audio.volume])

  const timeline = (
    <div style={{
      height: 42, flexShrink: 0, borderBottom: `1px solid ${UI_LINE}`,
      padding: "8px 10px", boxSizing: "border-box",
      background: `linear-gradient(180deg, ${UI_PANEL}, ${UI_BG})`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 5, color: UI_ACCENT_DARK, letterSpacing: 1 }}>
        <span>{formatTime(audio.currentTime)}</span>
        <span style={{ color: UI_MUTED, padding: "0 12px" }}>PLAYER TRANSPORT</span>
        <span style={{ opacity: 0.55 }}>{formatTime(audio.duration)}</span>
      </div>
      <div
        onClick={handleSeek}
        style={{ height: 7, background: "rgba(46,38,25,0.16)", cursor: "pointer", position: "relative", borderRadius: 3 }}
      >
        <div style={{
          height: "100%", width: `${progressPct}%`, background: UI_ACCENT, borderRadius: 3,
          boxShadow: `0 0 10px ${UI_ACCENT_FAINT}`, pointerEvents: "none", position: "relative",
        }}>
          <span style={{
            position: "absolute", right: -4, top: -3, width: 12, height: 12, borderRadius: "50%",
            background: UI_BG, border: `1px solid ${UI_ACCENT_DARK}`, boxShadow: `0 0 10px ${UI_ACCENT_FAINT}`, display: progressPct > 0 ? "block" : "none",
          }} />
        </div>
      </div>
    </div>
  )

  const playerPanel = (
    <div style={{ padding: 12, borderBottom: `1px solid ${UI_LINE}`, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 5 }}>
        <button onClick={playPrev} style={ctrlBtn()}>|◀</button>
        <button onClick={togglePlay} style={{
          ...ctrlBtn(), flex: 2, background: UI_ACCENT_DARK, color: UI_BG, border: "none", fontWeight: 800,
          boxShadow: audio.isPlaying ? `0 0 10px ${UI_ACCENT_FAINT}` : "none",
        }}>
          {audio.isInitializing ? "···" : audio.isPlaying ? "▌▌ PAUSE" : "▶ PLAY"}
        </button>
        <button onClick={playNext} style={ctrlBtn()}>▶|</button>
      </div>
      <button
        onClick={() => setShuffleMode((s) => !s)}
        style={{
          ...ctrlBtn(), width: "100%", fontSize: 10,
          background: shuffleMode ? UI_ACCENT_DARK : "transparent", color: shuffleMode ? UI_BG : UI_ACCENT_DARK,
          boxShadow: shuffleMode ? `0 0 10px ${UI_ACCENT_FAINT}` : "none",
        }}
      >⤮ SHUFFLE {shuffleMode ? "ON" : "OFF"}</button>
      <div style={{ paddingTop: 2 }}>
        <div style={{ fontSize: 10, marginBottom: 5, display: "flex", justifyContent: "space-between", color: UI_MUTED }}>
          <span>VOL</span><span style={{ color: UI_ACCENT_DARK }}>{audio.volume}%</span>
        </div>
        <input
          type="range" min={0} max={100} value={audio.volume}
          onChange={(e) => audio.setVolume(Number(e.target.value))}
          style={{ width: "100%", accentColor: UI_ACCENT_DARK, cursor: "pointer" }}
        />
      </div>
    </div>
  )

  const trackIdentity = (
    <div style={{ padding: "10px 12px", borderBottom: `1px solid ${UI_LINE}`, fontSize: 11, lineHeight: 1.65, flexShrink: 0 }}>
      <div style={{ color: UI_MUTED, fontSize: 10, letterSpacing: 1 }}>TITLE</div>
      <div style={{ color: UI_TEXT, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {audio.currentTrack?.title ?? "—"}
      </div>
      <div style={{ color: UI_MUTED, fontSize: 10, letterSpacing: 1, marginTop: 6 }}>ARTISTA</div>
      <div style={{ color: UI_ACCENT_DARK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {audio.currentTrack?.artist ?? "—"}
      </div>
    </div>
  )

  const releaseIdentity = (
    <div style={{ padding: "9px 12px", borderBottom: `1px solid ${UI_LINE}`, fontSize: 11, lineHeight: 1.7, flexShrink: 0 }}>
      {([
        ["ALB", audio.currentRelease?.title ?? "—"],
        ["YR", audio.currentRelease?.year ?? "—"],
      ] as [string, string][]).map(([k, v]) => (
        <div key={k} style={{ display: "flex", gap: 6 }}>
          <span style={{ color: UI_MUTED, width: 34, flexShrink: 0 }}>{k}</span>
          <span style={{ color: UI_TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v}</span>
        </div>
      ))}
    </div>
  )

  const trackList = (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
      {audio.allTracks.map((track: Track, i: number) => {
        const active = audio.currentTrack?.id === track.id
        const playing = active && audio.isPlaying
        return (
          <div
            key={track.id}
            onClick={() => audio.play(track)}
            style={{
              padding: "6px 10px", borderBottom: `1px solid ${UI_LINE}`, cursor: "pointer",
              background: active ? "rgba(139,94,47,0.14)" : "transparent",
              borderLeft: active ? `2px solid ${UI_ACCENT_DARK}` : "2px solid transparent",
              display: "flex", gap: 7, alignItems: "center", fontSize: 10,
              transition: "background 0.1s",
            }}
          >
            <span style={{ color: active ? UI_ACCENT_DARK : UI_MUTED, minWidth: 16, flexShrink: 0 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            <div style={{ overflow: "hidden", flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 700, color: active ? UI_ACCENT_DARK : UI_TEXT,
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{track.title}</div>
              <div style={{ opacity: 0.55, fontSize: 9 }}>{track.artist} · {track.duration}</div>
            </div>
            {playing && <EqBars />}
          </div>
        )
      })}
    </div>
  )

  const fileAudioPanel = (
    <div style={{ padding: "10px 12px", borderTop: `1px solid ${UI_LINE}`, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 10, color: UI_MUTED, display: "flex", justifyContent: "space-between", letterSpacing: 1 }}>
        <span>INPUT AUDIO</span>
        <span style={{ color: UI_ACCENT_DARK }}>LOCAL</span>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileInput}
        style={{
          width: "100%", background: UI_BG, color: UI_TEXT,
          border: `1px solid ${fileInputError ? "#9f3d2f" : UI_LINE}`, padding: "7px 8px",
          fontSize: 10, fontFamily: "ui-monospace, monospace", outline: "none",
        }}
      />
      <button type="button" onClick={() => fileInputRef.current?.click()} style={{ ...ctrlBtn(), width: "100%", flex: "unset", padding: "7px 0", fontSize: 10 }}>
        SELECT / PLAY
      </button>
      <div style={{ minHeight: 11, fontSize: 9, color: fileInputError ? "#9f3d2f" : UI_MUTED, lineHeight: 1.2 }}>
        {fileInputError ?? "Arquivo local: mp3, wav, ogg, m4a."}
      </div>
    </div>
  )

  const scopeControlsPanel = (
    <div style={{ flexShrink: 0, borderBottom: `1px solid ${UI_LINE}` }}>
      <div style={{ height: 170, borderBottom: `1px solid ${UI_LINE}` }}>
        <ScopeKnob
          label="MODE"
          value={OSC_MODES.indexOf(scopeMode)}
          min={0}
          max={OSC_MODES.length - 1}
          steps={OSC_MODES.length}
          resetValue={OSC_MODES.indexOf("xy")}
          display={scopeMode.toUpperCase()}
          onChange={(value) => setScopeMode(OSC_MODES[Math.round(value)] ?? "trace")}
        />
      </div>
      <div style={{ height: 170 }}>
        <ScopeKnob
          label="SENS"
          value={scopeSensitivity}
          min={0.25}
          max={8}
          resetValue={1.4}
          display={`${scopeSensitivity.toFixed(scopeSensitivity >= 2 ? 1 : 2)}x`}
          onChange={setScopeSensitivity}
        />
      </div>
    </div>
  )

  return (
    <div style={{
      width: "100vw", height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column",
      background: UI_BG, color: UI_TEXT, fontFamily: "ui-monospace, monospace", fontSize: 12,
      position: "relative",
    }}>
      {/* global vignette + faint scanlines */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50,
        background: "radial-gradient(ellipse at center, rgba(255,255,255,0) 62%, rgba(89,62,34,0.16) 100%)",
      }} />
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50, opacity: 0.18,
        background: "repeating-linear-gradient(0deg, rgba(0,0,0,0) 0, rgba(0,0,0,0) 2px, rgba(89,62,34,0.18) 3px)",
      }} />

      {/* ── HEADER ── */}
      <div style={{
        height: 40, flexShrink: 0, borderBottom: `1px solid ${UI_LINE}`,
        display: "flex", alignItems: "center", padding: "0 14px", gap: 12,
        fontSize: 11, letterSpacing: 1, overflow: "hidden", whiteSpace: "nowrap",
        background: `linear-gradient(180deg, ${UI_PANEL}, ${UI_BG})`,
      }}>
        <span style={{ fontWeight: 800, letterSpacing: 4, color: UI_ACCENT_DARK }}>A.S.A.</span>
        <span style={{ color: UI_LINE }}>▐</span>
        <span style={{ opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220, color: UI_TEXT }}>
          {audio.currentTrack?.title ?? "NO TRACK"}
        </span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span style={{ opacity: 0.7, color: UI_ACCENT_DARK }}>{audio.currentTrack?.artist ?? "—"}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          <VuMeter level={audio.level} />
          <span style={{
            color: statusColor, fontWeight: 700, letterSpacing: 2,
          }}>{statusLabel}</span>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0 }}>
        {/* ══ LEFT ══ */}
        <div style={{
          width: 232, flexShrink: 0, borderRight: `1px solid ${UI_LINE}`,
          display: "flex", flexDirection: "column", overflow: "hidden",
          background: UI_PANEL,
        }}>
          <div style={{
            position: "relative", width: "100%", aspectRatio: "1 / 1", flexShrink: 0, overflow: "hidden",
            background: UI_PANEL_DARK,
          }}>
            <img
              src={audio.currentRelease?.cover ?? "/placeholder.svg"}
              alt="cover"
              style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", filter: "saturate(1.1) contrast(1.05)" }}
            />
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "repeating-linear-gradient(0deg, rgba(0,0,0,0) 0, rgba(0,0,0,0) 2px, rgba(0,0,0,0.22) 3px)",
            }} />
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              boxShadow: "inset 0 0 40px rgba(0,0,0,0.6)",
            }} />
            <div style={{
              position: "absolute", top: 6, left: 6, background: UI_ACCENT_DARK, color: UI_BG,
              padding: "1px 7px", fontSize: 10, fontWeight: 800, letterSpacing: 1,
              boxShadow: `0 0 10px ${UI_ACCENT_FAINT}`,
            }}>
              {audio.currentRelease?.id?.toUpperCase() ?? "DSRPTV001"}
            </div>
          </div>
          {trackIdentity}
          {playerPanel}
          {releaseIdentity}
          {trackList}
        </div>

        {/* ══ CENTER / PRIMARY OSCILLOSCOPE ══ */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, background: UI_BG }}>
          <div style={{
            height: 32, flexShrink: 0, borderBottom: `1px solid ${UI_LINE}`,
            display: "flex", alignItems: "center", padding: "0 10px", gap: 6,
            background: UI_PANEL,
          }}>
            <span style={{ color: UI_ACCENT_DARK, fontWeight: 800, letterSpacing: 2 }}>
              OSCILLOSCOPE
            </span>
            <span style={{ color: UI_LINE }}>▐</span>
            {OSC_MODES.map((mode) => {
              const active = scopeMode === mode
              return (
                <button
                  key={mode}
                  onClick={() => setScopeMode(mode)}
                  style={{
                    background: active ? UI_ACCENT_DARK : "transparent", color: active ? UI_BG : UI_ACCENT_DARK,
                    border: `1px solid ${active ? UI_ACCENT_DARK : UI_LINE}`, padding: "3px 10px",
                    fontSize: 11, fontWeight: active ? 800 : 500, letterSpacing: 1, cursor: "pointer",
                    fontFamily: "ui-monospace, monospace",
                    boxShadow: active ? `0 0 10px ${UI_ACCENT_FAINT}` : "none", transition: "all 0.12s",
                  }}
                >{mode.toUpperCase()}</button>
              )
            })}
            <span style={{ marginLeft: "auto", fontSize: 10, color: UI_MUTED, letterSpacing: 1 }}>
              PRIMARY DISPLAY · GAIN {scopeSensitivity.toFixed(scopeSensitivity >= 2 ? 1 : 2)}x
            </span>
          </div>

          <div style={{ flex: 1, overflow: "hidden", display: "flex", minHeight: 0, padding: 8 }}>
            <div style={{
              flex: 1, minHeight: 0, minWidth: 0, border: `1px solid ${UI_ACCENT_DARK}`,
              overflow: "hidden", position: "relative", borderRadius: 2,
              boxShadow: `inset 0 0 80px rgba(0,0,0,0.75), 0 0 28px rgba(58,208,122,0.08)`,
              background: DISPLAY_BG,
            }}>
              <Oscilloscope
                getAnalyser={audio.getAnalyser}
                isPlaying={audio.isPlaying}
                volume={audio.volume}
                sensitivity={scopeSensitivity}
                mode={scopeMode}
              />
            </div>
          </div>
        </div>

        {/* ══ RIGHT ══ */}
        <div style={{
          width: 212, flexShrink: 0, borderLeft: `1px solid ${UI_LINE}`,
          display: "flex", flexDirection: "column", overflow: "hidden",
          background: UI_PANEL,
        }}>
          {scopeControlsPanel}
          {fileAudioPanel}
          <div style={{ flex: 1, minHeight: 0 }} />
        </div>
      </div>

      {/* ── SECONDARY VISUALIZER + PLAYER TIMELINE ── */}
      <div style={{
        height: "clamp(185px, 26vh, 280px)", flexShrink: 0, borderTop: `1px solid ${UI_LINE}`,
        display: "flex", alignItems: "stretch",
        background: `linear-gradient(180deg, ${UI_PANEL}, ${UI_PANEL_DARK})`,
      }}>
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {timeline}
          <div style={{
            height: 30, flexShrink: 0, borderBottom: `1px solid ${UI_LINE}`,
            display: "flex", alignItems: "center", padding: "0 10px", gap: 6,
          }}>
            <span style={{ color: UI_ACCENT_DARK, fontWeight: 800, letterSpacing: 2 }}>SPECTRUM</span>
            <span style={{ color: UI_LINE }}>▐</span>
            <span style={{ color: UI_ACCENT_DARK, fontWeight: 800, letterSpacing: 2 }}>CHU MONITOR</span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: UI_MUTED, letterSpacing: 1 }}>
              SECONDARY DISPLAYS · THREE-VIEW MODE
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <div style={{
              width: "100%", height: "100%", border: `1px solid ${UI_ACCENT_DARK}`,
              borderTop: "none", boxSizing: "border-box", overflow: "hidden",
              display: "flex", alignItems: "stretch",
              boxShadow: `inset 0 0 40px rgba(0,0,0,0.72)`,
              background: DISPLAY_BG,
            }}>
              <div style={{ flex: 1, minWidth: 0, height: "100%", overflow: "hidden" }}>
                <AsciiSpectrum {...visualizationProps} />
              </div>
              <div style={{
                width: 182, flexShrink: 0, borderLeft: `1px solid ${UI_ACCENT_DARK}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "radial-gradient(circle at 50% 45%, rgba(58,208,122,0.07), rgba(0,0,0,0.42))",
              }}>
                <div className="chu-monitor-shell" style={{
                  width: 150, height: 150, position: "relative", overflow: "hidden",
                  border: `1px solid ${PHOS_DIM}`, background: "#020604",
                  boxShadow: `inset 0 0 28px rgba(0,0,0,0.86), inset 0 0 10px rgba(58,208,122,0.2), 0 0 18px ${PHOS_FAINT}`,
                }}>
                  <div className="chu-monitor-screen" style={{
                    position: "absolute", inset: 8, overflow: "hidden",
                    background: "#050a06",
                  }}>
                    <Chu {...visualizationProps} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ScopeKnob({
  label,
  value,
  min,
  max,
  steps,
  resetValue,
  display,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  steps?: number
  resetValue?: number
  display: string
  onChange: (value: number) => void
}) {
  const dragRef = useRef<{ y: number; value: number } | null>(null)
  const pct = max === min ? 0 : (value - min) / (max - min)
  const clampedPct = Math.max(0, Math.min(1, pct))
  const angle = -135 + clampedPct * 270
  const tickCount = steps ?? 17
  const knobSize = 112
  const tickRadius = knobSize * 0.45
  const needleHeight = knobSize * 0.38
  const commitValue = (raw: number) => {
    const bounded = Math.max(min, Math.min(max, raw))
    if (steps && steps > 1) {
      const step = (max - min) / (steps - 1)
      onChange(min + Math.round((bounded - min) / step) * step)
    } else {
      onChange(Math.round(bounded * 100) / 100)
    }
  }

  const updateFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const delta = (drag.y - e.clientY) / 120
    commitValue(drag.value + delta * (max - min))
  }

  return (
    <div style={{
      width: "100%", height: "100%", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", gap: 6, padding: 8,
      boxSizing: "border-box", fontFamily: "ui-monospace, monospace",
    }}>
      <div style={{ color: UI_MUTED, fontSize: 10, letterSpacing: 2 }}>{label}</div>
      <div
        className="scope-knob-shell"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragRef.current = { y: e.clientY, value }
          updateFromPointer(e)
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) updateFromPointer(e)
        }}
        onPointerUp={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
          dragRef.current = null
        }}
        onPointerCancel={() => { dragRef.current = null }}
        onWheel={(e) => {
          e.preventDefault()
          const direction = e.deltaY > 0 ? -1 : 1
          const amount = steps ? 1 : (max - min) * 0.045
          commitValue(value + direction * amount)
        }}
        onDoubleClick={() => commitValue(resetValue ?? min)}
        style={{
          width: knobSize, height: knobSize, minWidth: knobSize, minHeight: knobSize,
          flex: `0 0 ${knobSize}px`, aspectRatio: "1 / 1", cursor: "ns-resize", position: "relative",
          background: "radial-gradient(circle at 32% 28%, #f8f0dc, #cdb78c 48%, #6d4d2b 100%)",
          border: `1px solid ${UI_ACCENT_DARK}`,
          boxShadow: `inset -10px -14px 28px rgba(67,44,22,0.42), inset 8px 8px 20px rgba(255,255,255,0.32), 0 0 18px ${UI_ACCENT_FAINT}`,
          touchAction: "none",
        }}
      >
        <div className="scope-knob-ring" style={{
          position: "absolute", inset: -4,
          background: `conic-gradient(from 225deg, ${UI_ACCENT_DARK} 0deg, ${UI_ACCENT} ${clampedPct * 270}deg, rgba(46,38,25,0.16) ${clampedPct * 270}deg, rgba(46,38,25,0.16) 270deg, transparent 270deg)`,
          mask: "radial-gradient(circle, transparent 64%, black 66%)",
          WebkitMask: "radial-gradient(circle, transparent 64%, black 66%)",
        }} />
        <div className="scope-knob-inner" style={{
          position: "absolute", inset: 10,
          border: `1px solid ${UI_ACCENT_FAINT}`,
          boxShadow: "inset 0 0 18px rgba(67,44,22,0.28)",
        }} />
        <div className="scope-knob-needle" style={{
          position: "absolute", left: "50%", top: "50%", width: 5, height: needleHeight,
          transformOrigin: "50% 100%", transform: `translate(-50%, -100%) rotate(${angle}deg)`,
          background: UI_ACCENT_DARK, boxShadow: `0 0 10px ${UI_ACCENT_FAINT}`,
        }} />
        <div className="scope-knob-hub" style={{
          position: "absolute", left: "50%", top: "50%", width: 24, height: 24,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle at 35% 30%, #fff8e8, #d8be8c 48%, #5b3b1d 100%)",
          boxShadow: `0 0 12px ${UI_ACCENT_FAINT}, inset 0 0 9px rgba(67,44,22,0.35)`,
        }} />
        {Array.from({ length: tickCount }).map((_, i) => {
          const tickAngle = -135 + (i / (tickCount - 1)) * 270
          const active = i / (tickCount - 1) <= clampedPct
          return (
            <span
              key={i}
              style={{
                position: "absolute", left: "50%", top: "50%", width: 2,
                height: i === 0 || i === tickCount - 1 || (steps && i === 1) ? 14 : 8,
                background: active ? UI_ACCENT_DARK : "rgba(46,38,25,0.22)",
                boxShadow: active ? `0 0 5px ${UI_ACCENT_FAINT}` : "none",
                transformOrigin: `50% ${tickRadius}px`, transform: `translate(-50%, -${tickRadius}px) rotate(${tickAngle}deg)`,
              }}
            />
          )
        })}
      </div>
      <div style={{
        minHeight: 18, maxWidth: "100%", color: UI_ACCENT_DARK, fontSize: 12, fontWeight: 800,
        letterSpacing: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {display}
      </div>
    </div>
  )
}

// tiny animated equalizer for the now-playing row
function EqBars() {
  return (
    <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end", height: 12, flexShrink: 0 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 2, background: UI_ACCENT_DARK, borderRadius: 1, boxShadow: `0 0 4px ${UI_ACCENT_FAINT}`,
          animation: `eq 0.6s ease-in-out ${i * 0.15}s infinite alternate`,
          height: 4 + i * 2,
        }} />
      ))}
      <style>{`@keyframes eq { from { height: 3px; opacity: 0.6 } to { height: 12px; opacity: 1 } }`}</style>
    </div>
  )
}

function ctrlBtn(): React.CSSProperties {
  return {
    flex: 1, background: "transparent", color: UI_ACCENT_DARK, border: `1px solid ${UI_LINE}`,
    padding: "8px 0", fontSize: 11, fontWeight: 700, cursor: "pointer", letterSpacing: 1,
    fontFamily: "ui-monospace, monospace",
  }
}

export default function Page() {
  return (
    <AudioProvider>
      <PlayerApp />
    </AudioProvider>
  )
}
