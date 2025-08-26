"use client"

import { useState, useEffect, useMemo } from "react"
import { cn } from "@/lib/utils"
import { useAudio } from "./lib/audio-context"

const VIZ_COLS = 140
const VIZ_ROWS = 16
const MIN_FREQ = 20
const MAX_FREQ = 22000
const SAMPLE_RATE = 44100
// FFT size is dynamic (depends on quality). We'll derive from frequencyData.length.

export default function AsciiSpectrumAnalyzer() {
  const { isPlaying, frequencyData } = useAudio()
  const [frequencies, setFrequencies] = useState<number[]>(() => Array(VIZ_COLS).fill(0))
  const [isActive, setIsActive] = useState(false)
  const [mode, setMode] = useState<"bars" | "wave" | "matrix">("bars")
  const [intensity, setIntensity] = useState(70)

  // Derived FFT size for display: frequencyBinCount * 2
  const derivedFftSize = useMemo(() => {
    const bins = frequencyData?.length || 0
    return bins > 0 ? bins * 2 : 0
  }, [frequencyData?.length])

  const asciiChars = [' ', '·', ':', '-', '=', '≡', '▓', '█']
  const waveChars = ["_", "—", "≈", "~", "¯"]

  // Map each column to a frequency bin index using logarithmic spacing across the actual buffer length
  const logIndexMap = useMemo(() => {
    const map = new Uint32Array(VIZ_COLS)
    const availableBins = Math.max(1, (frequencyData?.length || 0))
    const maxIndex = availableBins - 1
    const logMin = Math.log10(MIN_FREQ)
    const logMax = Math.log10(MAX_FREQ)
    const logRange = logMax - logMin

    for (let i = 0; i < VIZ_COLS; i++) {
      const logFreq = logMin + (logRange * i) / (VIZ_COLS - 1)
      const freq = Math.pow(10, logFreq)
      const index = Math.round((freq / (SAMPLE_RATE / 2)) * availableBins)
      map[i] = Math.min(maxIndex, Math.max(0, index))
    }
    return map
  }, [frequencyData?.length])

  useEffect(() => {
    if (!isActive) {
      const decayInterval = setInterval(() => {
        setFrequencies(prev => {
          const newFreqs = prev.map(f => Math.max(0, f * 0.95 - 1))
          if (newFreqs.every(f => f === 0)) {
            clearInterval(decayInterval)
          }
          return newFreqs
        })
      }, 50)
      return () => clearInterval(decayInterval)
    }

    if (isPlaying && frequencyData && frequencyData.length > 0) {
      const newFreqs = new Array(VIZ_COLS).fill(0)
      for (let i = 0; i < VIZ_COLS; i++) {
        const startIndex = logIndexMap[i]
        const endIndex = i < VIZ_COLS - 1 ? logIndexMap[i + 1] : Math.min(startIndex + 1, frequencyData.length)
        
        let sum = 0
        for (let j = startIndex; j < endIndex; j++) {
          sum += frequencyData[j] || 0
        }
        
        const binCount = Math.max(1, endIndex - startIndex)
        const avg = sum / binCount
        
        // Normalize without overweighting lower bands to distribute energy across width
        const normalized = Math.min(100, (avg / 255) * 100 * (intensity / 50))
        newFreqs[i] = normalized
      }
      setFrequencies(newFreqs)
    }
  }, [isActive, isPlaying, frequencyData, logIndexMap, intensity])

  const getAsciiChar = (value: number, chars: string[]) => {
    const index = Math.floor((value / 100) * (chars.length - 1))
    return chars[Math.max(0, Math.min(chars.length - 1, index))]
  }

  const renderBars = () => {
    const result = []
    for (let row = VIZ_ROWS - 1; row >= 0; row--) {
      let line = ""
      for (let col = 0; col < VIZ_COLS; col++) {
        const height = (frequencies[col] / 100) * VIZ_ROWS
        const char = row < height ? getAsciiChar(frequencies[col], asciiChars) : " "
        line += char
      }
      result.push(line)
    }
    return result
  }

  const renderWave = () => {
    const result = []
    for (let row = 0; row < VIZ_ROWS; row++) {
      let line = ""
      for (let col = 0; col < VIZ_COLS; col++) {
        const normalizedFreq = frequencies[col] / 100
        const waveHeight = Math.sin(col * 0.2 + Date.now() * 0.005) * normalizedFreq * (VIZ_ROWS / 2)
        const rowPosition = (VIZ_ROWS / 2) + waveHeight
        const char = Math.abs(row - rowPosition) < 1 ? getAsciiChar(frequencies[col], waveChars) : " "
        line += char
      }
      result.push(line)
    }
    return result
  }

  const renderMatrix = () => {
    const result = []
    for (let row = 0; row < VIZ_ROWS; row++) {
      let line = ""
      for (let col = 0; col < VIZ_COLS; col++) {
        const intensityValue = frequencies[col] || 0
        const shouldShow = Math.random() * 100 < intensityValue
        const char = shouldShow ? asciiChars[Math.floor(Math.random() * asciiChars.length)] : " "
        line += char
      }
      result.push(line)
    }
    return result
  }

  const renderVisualization = () => {
    switch (mode) {
      case "bars": return renderBars()
      case "wave": return renderWave()
      case "matrix": return renderMatrix()
      default: return renderBars()
    }
  }

  const getFreqLabelPosition = (freq: number) => {
    const logMin = Math.log10(MIN_FREQ)
    const logMax = Math.log10(MAX_FREQ)
    const logRange = logMax - logMin
    const logFreq = Math.log10(freq)
    return ((logFreq - logMin) / logRange) * 100
  }

  const freqLabels = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]

  return (
    <div className="w-full max-w-5xl h-[600px] mx-auto bg-black text-green-400 font-mono border-2 border-white flex flex-col">
      {/* Header */}
      <div className="bg-white text-black p-2 flex justify-between items-center text-xs border-b-2 border-white">
        <div className="flex items-center gap-4">
          <span className="font-bold">ASCII_SPECTRUM_ANALYZER_V2.2</span>
          <span>MODE: {mode.toUpperCase()}</span>
          <span>INTENSITY: {intensity}%</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsActive(!isActive)}
            className={cn(
              "px-2 py-1 text-xs font-bold transition-colors",
              isActive ? "bg-red-500 text-white" : "bg-gray-300 text-black",
            )}
          >
            {isActive ? "STOP" : "START"}
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="bg-gray-900 p-2 border-b-2 border-white flex gap-4 text-xs">
        <div className="flex gap-2">
          <span className="text-white">MODE:</span>
          {["bars", "wave", "matrix"].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m as any)}
              className={cn(
                "px-2 py-1 transition-colors",
                mode === m ? "bg-white text-black" : "bg-transparent text-white hover:bg-white/20",
              )}
            >
              {m.toUpperCase()}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white">INTENSITY:</span>
          <input
            type="range"
            min="0"
            max="100"
            value={intensity}
            onChange={(e) => setIntensity(Number.parseInt(e.target.value))}
            className="w-20"
          />
          <span className="text-white w-8">{intensity}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white">AUDIO:</span>
          <div className={cn("w-2 h-2", isPlaying ? "bg-green-400 animate-pulse" : "bg-gray-500")}></div>
          <span className="text-white">{isPlaying ? "LIVE" : "IDLE"}</span>
        </div>
      </div>

      {/* Visualization area */}
      <div className="flex-1 p-4 overflow-hidden flex items-center">
        <div className="w-full text-xs leading-tight whitespace-pre font-mono">
          {renderVisualization().map((line, index) => (
            <div key={index}>{line}</div>
          ))}
        </div>
      </div>

      {/* Frequency labels */}
      <div className="bg-gray-800 text-white p-2 text-xs relative border-t-2 border-white h-10">
        {freqLabels.map(freq => {
          const position = getFreqLabelPosition(freq)
          const label = freq < 1000 ? `${freq}` : `${freq / 1000}k`
          return (
            <div key={freq} className="absolute top-1" style={{ left: `${position}%`, transform: 'translateX(-50%)' }}>
              <div className="flex flex-col items-center">
                <span className="text-gray-400">|</span>
                <span className="mt-1 text-gray-300">{label}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Status */}
      <div className="bg-black p-2 text-xs flex justify-between items-center">
        <div className="flex gap-4">
          <span className="text-green-400">SAMPLE RATE: {SAMPLE_RATE / 1000}kHz</span>
          <span className="text-green-400">FFT SIZE: {derivedFftSize}</span>
          <span className="text-green-400">SCALE: LOGARITHMIC</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2", isActive && isPlaying ? "bg-green-400 animate-pulse" : "bg-gray-500")}></div>
          <span className="text-green-400">{isActive && isPlaying ? "ANALYZING" : "IDLE"}</span>
        </div>
      </div>
    </div>
  )
}
