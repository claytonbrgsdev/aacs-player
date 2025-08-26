"use client"

import type React from "react"

import { useState, useEffect } from "react"

interface GlitchNoiseOverlayProps {
  intensity?: number
  isActive?: boolean
  children: React.ReactNode
}

export default function GlitchNoiseOverlay({ intensity = 30, isActive = false, children }: GlitchNoiseOverlayProps) {
  const [glitchLines, setGlitchLines] = useState<Array<{ top: number; height: number; opacity: number }>>([])
  const [staticNoise, setStaticNoise] = useState<string>("")
  const [scanlinePosition, setScanlinePosition] = useState(0)

  // Generate random glitch lines
  useEffect(() => {
    if (!isActive) {
      setGlitchLines([])
      return
    }

    const interval = setInterval(() => {
      if (Math.random() * 100 < intensity) {
        const newLines = Array.from({ length: Math.floor(Math.random() * 3) + 1 }, () => ({
          top: Math.random() * 100,
          height: Math.random() * 5 + 1,
          opacity: Math.random() * 0.8 + 0.2,
        }))
        setGlitchLines(newLines)

        // Clear glitch lines after short duration
        setTimeout(() => setGlitchLines([]), 100 + Math.random() * 200)
      }
    }, 200)

    return () => clearInterval(interval)
  }, [isActive, intensity])

  // Generate static noise pattern
  useEffect(() => {
    if (!isActive) {
      setStaticNoise("")
      return
    }

    const interval = setInterval(() => {
      const chars = "█▓▒░▄▀▐▌▬▲▼◄►"
      let noise = ""
      for (let i = 0; i < 50; i++) {
        noise += chars[Math.floor(Math.random() * chars.length)]
      }
      setStaticNoise(noise)
    }, 50)

    return () => clearInterval(interval)
  }, [isActive])

  // Animate scanline
  useEffect(() => {
    if (!isActive) return

    const interval = setInterval(() => {
      setScanlinePosition((prev) => (prev + 2) % 100)
    }, 50)

    return () => clearInterval(interval)
  }, [isActive])

  return (
    <div className="relative overflow-hidden">
      {children}

      {isActive && (
        <>
          {/* Glitch lines */}
          {glitchLines.map((line, index) => (
            <div
              key={index}
              className="absolute left-0 right-0 bg-white mix-blend-difference pointer-events-none z-50"
              style={{
                top: `${line.top}%`,
                height: `${line.height}px`,
                opacity: line.opacity,
                transform: `translateX(${(Math.random() - 0.5) * 10}px)`,
              }}
            />
          ))}

          {/* Static noise overlay */}
          <div className="absolute inset-0 pointer-events-none z-40 opacity-10">
            <div className="w-full h-full text-white text-xs leading-none overflow-hidden whitespace-pre-wrap break-all">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i}>{staticNoise}</div>
              ))}
            </div>
          </div>

          {/* Scanline */}
          <div
            className="absolute left-0 right-0 h-px bg-white opacity-20 pointer-events-none z-50"
            style={{
              top: `${scanlinePosition}%`,
              boxShadow: "0 0 4px rgba(255,255,255,0.5)",
            }}
          />

          {/* RGB shift effect */}
          <div className="absolute inset-0 pointer-events-none z-30 mix-blend-screen opacity-30">
            <div
              className="absolute inset-0 bg-red-500"
              style={{
                transform: `translate(${Math.sin(Date.now() * 0.01) * 2}px, 0)`,
                mixBlendMode: "multiply",
              }}
            />
            <div
              className="absolute inset-0 bg-green-500"
              style={{
                transform: `translate(${Math.cos(Date.now() * 0.01) * 2}px, 0)`,
                mixBlendMode: "multiply",
              }}
            />
            <div
              className="absolute inset-0 bg-blue-500"
              style={{
                transform: `translate(${Math.sin(Date.now() * 0.01 + Math.PI) * 2}px, 0)`,
                mixBlendMode: "multiply",
              }}
            />
          </div>

          {/* Digital artifacts */}
          <div className="absolute inset-0 pointer-events-none z-20">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-1 h-1 bg-white opacity-50"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animation: `blink ${0.5 + Math.random()}s infinite`,
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
