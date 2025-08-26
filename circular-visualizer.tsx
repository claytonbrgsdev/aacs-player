"use client"

import { useEffect, useRef } from 'react'
import { useAudio } from './lib/audio-context'
import { cn } from '@/lib/utils'

interface CircularVisualizerProps {
  quality: 'ultra' | 'high' | 'medium' | 'low'
}

export default function CircularVisualizer({ quality }: CircularVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { frequencyData, isPlaying } = useAudio()

  const settings = {
    ultra: { bars: 128, radius: 100, barWidth: 3, smoothing: 0.85 },
    high: { bars: 96, radius: 100, barWidth: 4, smoothing: 0.8 },
    medium: { bars: 64, radius: 100, barWidth: 5, smoothing: 0.75 },
    low: { bars: 32, radius: 100, barWidth: 6, smoothing: 0.7 },
  }[quality]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    const lastHeights = new Array(settings.bars).fill(0)

    const render = () => {
      const { width, height } = canvas
      const centerX = width / 2
      const centerY = height / 2

      ctx.clearRect(0, 0, width, height)

      // Draw center circle
      ctx.beginPath()
      ctx.arc(centerX, centerY, settings.radius * 0.3, 0, 2 * Math.PI)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'
      ctx.stroke()

      if (frequencyData && frequencyData.length > 0) {
        const step = Math.floor(frequencyData.length / settings.bars)

        for (let i = 0; i < settings.bars; i++) {
          const freqIndex = i * step
          const value = frequencyData[freqIndex] || 0
          const barHeight = (value / 255) * (settings.radius * 0.6)

          // Apply smoothing
          lastHeights[i] = lastHeights[i] * settings.smoothing + barHeight * (1 - settings.smoothing)
          const smoothedHeight = lastHeights[i]

          const angle = (i / settings.bars) * 2 * Math.PI
          const startX = centerX + Math.cos(angle) * settings.radius
          const startY = centerY + Math.sin(angle) * settings.radius
          const endX = centerX + Math.cos(angle) * (settings.radius + smoothedHeight)
          const endY = centerY + Math.sin(angle) * (settings.radius + smoothedHeight)

          ctx.beginPath()
          ctx.moveTo(startX, startY)
          ctx.lineTo(endX, endY)
          
          const intensity = smoothedHeight / (settings.radius * 0.6)
          const hue = 120 - intensity * 120 // Green to Blue/Purple
          ctx.strokeStyle = `hsla(${hue}, 100%, 60%, ${0.5 + intensity * 0.5})`
          ctx.lineWidth = settings.barWidth
          ctx.stroke()
        }
      }
      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [frequencyData, settings, isPlaying])

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <canvas ref={canvasRef} width="300" height="300" className={cn("transition-opacity", !isPlaying ? 'opacity-30' : 'opacity-100')} />
      <div className="absolute text-center">
        <div className="text-xs text-gray-400">AUDIO SPECTRUM</div>
        <div className="text-lg font-bold text-white">{isPlaying ? 'ACTIVE' : 'IDLE'}</div>
      </div>
    </div>
  )
}
