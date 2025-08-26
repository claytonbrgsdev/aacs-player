"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { useAudio } from "./lib/audio-context"

interface Command {
input: string
output: string[]
timestamp: string
}

export default function CommandLineInterface() {
const { 
  currentTrack, 
  currentRelease,
  isPlaying, 
  volume, 
  currentTime, 
  duration,
  allTracks,
  releases,
  play, 
  pause, 
  stop, 
  setVolume 
} = useAudio()

const [input, setInput] = useState("")
const [history, setHistory] = useState<Command[]>([])
const [historyIndex, setHistoryIndex] = useState(-1)
const inputRef = useRef<HTMLInputElement>(null)

useEffect(() => {
  // Initialize with welcome message
  setHistory([
    {
      input: "",
      output: [
        "AZULBIC AUDIO CONTROL SYSTEM V3.1",
        "COPYRIGHT (C) 2024 AZULBIC",
        "AZULBIC COLLECTION LOADED",
        "TYPE 'HELP' FOR AVAILABLE COMMANDS",
        "",
      ],
      timestamp: new Date().toLocaleTimeString(),
    },
  ])
}, [])

const formatTime = (time: number) => {
  const minutes = Math.floor(time / 60)
  const seconds = Math.floor(time % 60)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

const executeCommand = (cmd: string) => {
  const timestamp = new Date().toLocaleTimeString()
  const args = cmd.trim().toLowerCase().split(" ")
  const command = args[0]
  let output: string[] = []

  switch (command) {
    case "help":
      output = [
        "AVAILABLE COMMANDS:",
        "  PLAY [TRACK]     - PLAY SPECIFIED TRACK OR CURRENT",
        "  STOP            - STOP PLAYBACK",
        "  PAUSE           - PAUSE/RESUME PLAYBACK",
        "  NEXT [RANDOM]   - PLAY NEXT TRACK (OR RANDOM)",
        "  LIST            - LIST ALL TRACKS",
        "  RELEASES        - LIST ALL RELEASES",
        "  VOL [0-100]     - SET VOLUME LEVEL",
        "  STATUS          - SHOW SYSTEM STATUS",
        "  CLEAR           - CLEAR TERMINAL",
        "  EXIT            - SHUTDOWN SYSTEM",
        "",
      ]
      break

    case "play":
      if (args[1]) {
        const trackNum = Number.parseInt(args[1]) - 1
        if (trackNum >= 0 && trackNum < allTracks.length) {
          play(allTracks[trackNum])
          output = [`NOW PLAYING: ${allTracks[trackNum].title}`, "PLAYBACK STARTED"]
        } else {
          output = ["ERROR: INVALID TRACK NUMBER", `USE 1-${allTracks.length}`]
        }
      } else if (currentTrack) {
        play(currentTrack)
        output = [`RESUMING: ${currentTrack.title}`]
      } else {
        play(allTracks[0])
        output = [`PLAYING: ${allTracks[0].title}`]
      }
      break

    case "stop":
      stop()
      output = ["PLAYBACK STOPPED"]
      break

    case "pause":
      if (isPlaying) {
        pause()
        output = ["PLAYBACK PAUSED"]
      } else if (currentTrack) {
        play(currentTrack)
        output = ["PLAYBACK RESUMED"]
      } else {
        output = ["ERROR: NO ACTIVE PLAYBACK"]
      }
      break

    case "next":
      if (args[1] === "random") {
        const candidates = allTracks.filter(t => !currentTrack || t.id !== currentTrack.id)
        const nextTrack = candidates[Math.floor(Math.random() * candidates.length)] || allTracks[0]
        play(nextTrack)
        output = [
          `NOW PLAYING (RANDOM): ${nextTrack.title}`
        ]
      } else {
        if (!currentTrack) {
          play(allTracks[0])
          output = [`PLAYING: ${allTracks[0].title}`]
        } else {
          const idx = allTracks.findIndex(t => t.id === currentTrack.id)
          const nextTrack = allTracks[(idx + 1) % allTracks.length]
          play(nextTrack)
          output = [`NOW PLAYING: ${nextTrack.title}`]
        }
      }
      break

    case "list":
      output = ["AVAILABLE TRACKS:"]
      allTracks.forEach((track, index) => {
        const status = currentTrack?.id === track.id && isPlaying ? " [PLAYING]" : ""
        const release = releases.find(r => r.id === track.releaseId)
        output.push(`  ${index + 1}. ${track.title} (${release?.title})${status}`)
      })
      output.push("")
      break

    case "releases":
      output = ["AVAILABLE RELEASES:"]
      releases.forEach((release, index) => {
        const status = currentRelease?.id === release.id ? " [CURRENT]" : ""
        output.push(`  ${index + 1}. ${release.title} - ${release.artist} (${release.tracks.length} tracks)${status}`)
      })
      output.push("")
      break

    case "vol":
    case "volume":
      if (args[1]) {
        const newVol = Number.parseInt(args[1])
        if (newVol >= 0 && newVol <= 100) {
          setVolume(newVol)
          output = [`VOLUME SET TO ${newVol}%`]
        } else {
          output = ["ERROR: VOLUME MUST BE 0-100"]
        }
      } else {
        output = [`CURRENT VOLUME: ${volume}%`]
      }
      break

    case "status":
      output = [
        "SYSTEM STATUS:",
        `  PLAYBACK: ${isPlaying ? "ACTIVE" : "IDLE"}`,
        `  CURRENT TRACK: ${currentTrack?.title || "NONE"}`,
        `  CURRENT RELEASE: ${currentRelease?.title || "NONE"}`,
        `  TIME: ${formatTime(currentTime)} / ${formatTime(duration)}`,
        `  VOLUME: ${volume}%`,
        `  TOTAL TRACKS: ${allTracks.length}`,
        `  TOTAL RELEASES: ${releases.length}`,
        `  CPU USAGE: ${isPlaying ? "67%" : "8%"}`,
        `  MEMORY: 42MB/128MB`,
        "",
      ]
      break

    case "clear":
      setHistory([])
      return

    case "exit":
      stop()
      output = ["SHUTTING DOWN AUDIO SYSTEM...", "GOODBYE"]
      break

    case "":
      output = []
      break

    default:
      output = [`UNKNOWN COMMAND: ${command}`, "TYPE 'HELP' FOR AVAILABLE COMMANDS"]
  }

  setHistory((prev) => [...prev, { input: cmd, output, timestamp }])
}

const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault()
  if (input.trim()) {
    executeCommand(input)
    setInput("")
    setHistoryIndex(-1)
  }
}

const handleKeyDown = (e: React.KeyboardEvent) => {
  if (e.key === "ArrowUp") {
    e.preventDefault()
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      setInput(history[history.length - 1 - newIndex]?.input || "")
    }
  } else if (e.key === "ArrowDown") {
    e.preventDefault()
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      setInput(history[history.length - 1 - newIndex]?.input || "")
    } else if (historyIndex === 0) {
      setHistoryIndex(-1)
      setInput("")
    }
  }
}

return (
  <div className="w-full max-w-5xl h-[600px] mx-auto bg-black text-green-400 font-mono border-2 border-white">
    {/* Terminal header */}
    <div className="bg-white text-black p-2 flex justify-between items-center text-xs border-b-2 border-white">
      <div className="flex items-center gap-4">
        <span className="font-bold">DSRPTV_TERMINAL_V3.1</span>
        <span>SESSION: {Date.now().toString().slice(-6)}</span>
        <span>TTY: /DEV/AUDIO0</span>
      </div>
      <div className="flex items-center gap-2">
        <div className={cn("w-2 h-2", isPlaying ? "bg-red-500 animate-pulse" : "bg-gray-500")}></div>
        <span className="text-xs">{isPlaying ? "ACTIVE" : "IDLE"}</span>
      </div>
    </div>

    {/* Terminal content */}
    <div className="h-[calc(100%-4rem)] overflow-auto p-4 text-xs">
      {history.map((cmd, index) => (
        <div key={index} className="mb-2">
          {cmd.input && (
            <div className="flex items-center">
              <span className="text-white">DSRPTV@AUDIO:~$</span>
              <span className="ml-2 text-green-400">{cmd.input}</span>
              <span className="ml-auto text-gray-500 text-xs">[{cmd.timestamp}]</span>
            </div>
          )}
          {cmd.output.map((line, lineIndex) => (
            <div key={lineIndex} className="text-green-400 ml-4">
              {line}
            </div>
          ))}
        </div>
      ))}

      {/* Current input line */}
      <form onSubmit={handleSubmit} className="flex items-center">
        <span className="text-white">AZULBIC@AUDIO:~$</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="ml-2 bg-transparent text-green-400 outline-none flex-1 caret-green-400"
          autoFocus
        />
        <div className="w-2 h-4 bg-green-400 animate-pulse ml-1"></div>
      </form>
    </div>

    {/* Status bar */}
    <div className="bg-white text-black p-2 text-xs flex justify-between items-center border-t-2 border-white">
      <div className="flex gap-4">
        <span>TRACK: {currentTrack?.title || "NONE"}</span>
        <span>VOL: {volume}%</span>
        <span>STATUS: {isPlaying ? "PLAYING" : "STOPPED"}</span>
      </div>
      <div className="flex gap-2">
        <span>F1: HELP</span>
        <span>F2: LIST</span>
        <span>F3: RELEASES</span>
      </div>
    </div>
  </div>
)
}
