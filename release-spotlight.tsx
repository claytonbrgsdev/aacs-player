"use client"

import { useState, useEffect, useRef } from "react"
import Image from "next/image"
import { Play, Pause, ChevronLeft, ChevronRight, Disc } from 'lucide-react'
import { cn } from "@/lib/utils"
import { useAudio } from "./lib/audio-context"
import CircularVisualizer from "./circular-visualizer"

export default function ReleaseSpotlight() {
  const { 
    releases, 
    currentTrack, 
    isPlaying, 
    play, 
    pause,
    setCurrentRelease: setGlobalRelease
  } = useAudio()
  
  const [currentReleaseIndex, setCurrentReleaseIndex] = useState(0)
  const [parallax, setParallax] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  const spotlightRelease = releases[currentReleaseIndex]

  useEffect(() => {
    setGlobalRelease(spotlightRelease)
  }, [spotlightRelease, setGlobalRelease])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    const { left, top, width, height } = containerRef.current.getBoundingClientRect()
    const x = (e.clientX - left) / width - 0.5
    const y = (e.clientY - top) / height - 0.5
    setParallax({ x: -x * 20, y: -y * 20 })
  }

  const handleMouseLeave = () => {
    setParallax({ x: 0, y: 0 })
  }

  const nextRelease = () => {
    setCurrentReleaseIndex((prev) => (prev + 1) % releases.length)
  }

  const prevRelease = () => {
    setCurrentReleaseIndex((prev) => (prev - 1 + releases.length) % releases.length)
  }

  const togglePlay = (track: any) => {
    if (currentTrack?.id === track.id && isPlaying) {
      pause()
    } else {
      play(track)
    }
  }

  return (
    <div 
      ref={containerRef}
      className="w-full max-w-5xl h-[600px] bg-black text-white font-mono border-2 border-white relative overflow-hidden mx-auto flex"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Left column - Cover art and info */}
      <div className="w-2/5 border-r-2 border-white flex flex-col justify-center items-center p-8">
        <div className="relative w-80 h-80 mb-8" style={{ perspective: '1000px' }}>
          <div 
            className="absolute inset-0 transition-transform duration-300 ease-out"
            style={{
              transform: `rotateY(${parallax.x / 2}deg) rotateX(${parallax.y / 2}deg)`
            }}
          >
            <Image
              src={spotlightRelease.cover || "/placeholder.svg"}
              alt={`${spotlightRelease.title} by ${spotlightRelease.artist}`}
              fill
              className="object-cover border-4 border-white/50"
            />
            <div 
              className="absolute inset-0 bg-black transition-opacity duration-300"
              style={{ opacity: isPlaying ? 0.2 : 0.5 }}
            />
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-widest">{spotlightRelease.title}</h2>
          <p className="text-lg text-gray-400">{spotlightRelease.artist}</p>
          <p className="text-sm text-gray-500 mt-2">{spotlightRelease.year} • {spotlightRelease.genre}</p>
        </div>
        <div className="flex items-center gap-4 mt-8">
          <button
            onClick={prevRelease}
            className="p-3 border border-white text-white flex items-center justify-center hover:bg-white hover:text-black transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="text-lg font-bold">
            {currentReleaseIndex + 1} / {releases.length}
          </span>
          <button
            onClick={nextRelease}
            className="p-3 border border-white text-white flex items-center justify-center hover:bg-white hover:text-black transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Right column - Tracks and visualizer */}
      <div className="w-3/5 flex flex-col">
        {/* Track list */}
        <div className="flex-1 overflow-auto scrollbar-thin">
          <div className="bg-white text-black p-2 text-xs font-bold flex border-b-2 border-white sticky top-0 z-10">
            <div className="w-12">#</div>
            <div className="flex-1">TITLE</div>
            <div className="w-20">TIME</div>
            <div className="w-16"></div>
          </div>
          {spotlightRelease.tracks.map((track, index) => (
            <div
              key={track.id}
              className={cn(
                "flex items-center p-3 border-b border-white/20 text-sm transition-colors duration-100 group",
                currentTrack?.id === track.id ? "bg-white text-black" : "hover:bg-white/10",
              )}
            >
              <div className="w-12 text-gray-400 group-hover:text-white transition-colors">
                {currentTrack?.id === track.id && isPlaying ? (
                  <Disc className="w-5 h-5 animate-spin-slow" />
                ) : (
                  String(index + 1).padStart(2, "0")
                )}
              </div>
              <div className="flex-1 font-bold">{track.title}</div>
              <div className="w-20 text-right text-gray-400 group-hover:text-white transition-colors">{track.duration}</div>
              <div className="w-16 text-center">
                <button
                  onClick={() => togglePlay(track)}
                  className={cn(
                    "w-8 h-8 flex items-center justify-center border rounded-full transition-all duration-200",
                    currentTrack?.id === track.id && isPlaying
                      ? "bg-white text-black border-white"
                      : "bg-transparent border-current group-hover:bg-white group-hover:text-black",
                  )}
                >
                  {currentTrack?.id === track.id && isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Visualizer */}
        <div className="h-80 border-t-2 border-white">
          <CircularVisualizer quality="medium" />
        </div>
      </div>
    </div>
  )
}
