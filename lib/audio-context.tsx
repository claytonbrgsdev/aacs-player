"use client"

import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react'

export interface Track {
id: number
title: string
artist: string
duration: string
size: string
file: string
releaseId: string
}

export interface Release {
id: string
title: string
artist: string
year: string
genre: string
format: string
size: string
cover: string
tracks: Track[]
}

interface AudioContextType {
currentTrack: Track | null
currentRelease: Release | null
isPlaying: boolean
isInitializing: boolean
volume: number
currentTime: number
duration: number
audioData: Uint8Array
frequencyData: Uint8Array
error: string | null
releases: Release[]
allTracks: Track[]
play: (track?: Track) => void
pause: () => void
stop: () => void
setVolume: (volume: number) => void
seek: (time: number) => void
setCurrentRelease: (release: Release) => void
updateQualitySettings: (quality: 'ultra' | 'high' | 'medium' | 'low') => void
}

const AudioContext = createContext<AudioContextType | null>(null)

const releasesData: Release[] = [
{
  id: "azulbic001",
  title: "DREAM_VISITORS",
  artist: "AZULBIC",
  year: "2024",
  genre: "ELECTRONIC",
  format: "DIGITAL",
  size: "32.4MB",
  cover: "/covers/azulbic_dream_visitors.png",
  tracks: [
    {
      id: 1,
      title: "TRACK_A.MP3",
      artist: "AZULBIC",
      duration: "04:12",
      size: "9.6MB",
      file: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SOUNDLABS%20azulbic%20-%20A-w4lBXEz1yILw6eaH8NrtLJOUnPfILT.mp3",
      releaseId: "azulbic001"
    },
    {
      id: 2,
      title: "TRACK_C.MP3",
      artist: "AZULBIC",
      duration: "03:45",
      size: "8.5MB",
      file: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SOUNDLABS%20azulbic%20-%20C-wXBLLyuyvBpMkp5ezWlyBeJzdpZwkg.mp3",
      releaseId: "azulbic001"
    },
    {
      id: 3,
      title: "TRACK_E.MP3",
      artist: "AZULBIC",
      duration: "05:21",
      size: "7.8MB",
      file: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SOUNDLABS%20%20azulbic%20-%20E-nZ4ZxpvsNSyTpirNeTHl2qGJ1NSCzZ.mp3",
      releaseId: "azulbic001"
    },
    {
      id: 4,
      title: "TRACK_G.MP3",
      artist: "AZULBIC",
      duration: "03:33",
      size: "6.5MB",
      file: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SOUNDLABS%20azulbic%20-%20G-rN4qEJ9tywdFBbRrZ6AO1pSHEBgxe4.mp3",
      releaseId: "azulbic001"
    }
  ]
},
{
  id: "azulbic002",
  title: "ESSA_NAO_EH_PRA_VC",
  artist: "AZULBIC",
  year: "2024",
  genre: "ELECTRONIC",
  format: "DIGITAL",
  size: "28.7MB",
  cover: "/covers/azulbic_essa_nao_eh_pra_vc.png",
  tracks: [
    {
      id: 5,
      title: "ESSA_NAO_EH_PRA_VC.MP3",
      artist: "AZULBIC",
      duration: "04:45",
      size: "8.9MB",
      file: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SOUNDLABS%20azulbic%20-%20essa%20n%20e%CC%81%20pra%20vc-HOtLnbphPsXIkBI1RFo3oqON1IeEal.mp3",
      releaseId: "azulbic002"
    },
    {
      id: 6,
      title: "TRACK_B.MP3",
      artist: "AZULBIC",
      duration: "03:28",
      size: "6.2MB",
      file: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SOUNDLABS%20azulbic%20-%20B-kzIH3z2Kd0hKI9q1cWq41HGMQt120p.mp3",
      releaseId: "azulbic002"
    },
    {
      id: 7,
      title: "TRACK_D.MP3",
      artist: "AZULBIC",
      duration: "04:01",
      size: "7.1MB",
      file: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SOUNDLABS%20azulbic%20-%20D-4IfssJEIA4prSbXme1XF8AY2qcncbh.mp3",
      releaseId: "azulbic002"
    },
    {
      id: 8,
      title: "TRACK_F.MP3",
      artist: "AZULBIC",
      duration: "03:52",
      size: "6.5MB",
      file: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/SOUNDLABS%20azulbic%20-%20F-cPxRkHq3epa1PCZztxrrYGrtEX03EA.mp3",
      releaseId: "azulbic002"
    }
  ]
}
]

const allTracksData = releasesData.flatMap(release => release.tracks)

export function AudioProvider({ children }: { children: React.ReactNode }) {
const [currentTrack, setCurrentTrack] = useState<Track | null>(allTracksData[0])
const [currentRelease, setCurrentReleaseState] = useState<Release | null>(releasesData[0])
const [isPlaying, setIsPlaying] = useState(false)
const [isInitializing, setIsInitializing] = useState(false)
const [volume, setVolumeState] = useState(75)
const [currentTime, setCurrentTime] = useState(0)
const [duration, setDuration] = useState(0)
const [audioData, setAudioData] = useState<Uint8Array>(new Uint8Array(64))
const [frequencyData, setFrequencyData] = useState<Uint8Array>(new Uint8Array(64))
const [error, setError] = useState<string | null>(null)

const audioRef = useRef<HTMLAudioElement | null>(null)
const audioContextRef = useRef<AudioContext | null>(null)
const analyserRef = useRef<AnalyserNode | null>(null)
const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
const audioUpdateIntervalRef = useRef<number>()

const AUDIO_UPDATE_INTERVAL = 100

const updateAudioData = useCallback(() => {
  if (!analyserRef.current || !isPlaying) return

  try {
    const bufferLength = analyserRef.current.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    const freqArray = new Uint8Array(bufferLength)
    
    analyserRef.current.getByteTimeDomainData(dataArray)
    analyserRef.current.getByteFrequencyData(freqArray)
    
    setAudioData(dataArray)
    setFrequencyData(freqArray)
  } catch (error) {
    console.error('Error updating audio data:', error)
  }
}, [isPlaying])

useEffect(() => {
  if (isPlaying && analyserRef.current) {
    audioUpdateIntervalRef.current = window.setInterval(updateAudioData, AUDIO_UPDATE_INTERVAL)
  } else {
    if (audioUpdateIntervalRef.current) {
      clearInterval(audioUpdateIntervalRef.current)
    }
  }
  
  return () => {
    if (audioUpdateIntervalRef.current) {
      clearInterval(audioUpdateIntervalRef.current)
    }
  }
}, [isPlaying, updateAudioData])

const initializeAudioContext = useCallback(async (fftSize = 128) => {
  if (audioContextRef.current || !audioRef.current) return

  try {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (context.state === 'suspended') {
      await context.resume()
    }
    
    const analyser = context.createAnalyser()
    analyser.fftSize = fftSize
    analyser.smoothingTimeConstant = 0.8
    
    const source = context.createMediaElementSource(audioRef.current)
    source.connect(analyser)
    analyser.connect(context.destination)
    
    audioContextRef.current = context
    analyserRef.current = analyser
    sourceRef.current = source
  } catch (e) {
    console.error('Error initializing audio context:', e)
    setError('Could not initialize audio context.')
  }
}, [])

const play = useCallback(async (track?: Track) => {
  if (!audioRef.current) return

  setIsInitializing(true)
  try {
    setError(null)
    
    if (!audioContextRef.current) {
      await initializeAudioContext()
    }

    const targetTrack = track || currentTrack
    if (!targetTrack) {
      setError('No track selected')
      return
    }

    if (track && track.id !== currentTrack?.id) {
      setCurrentTrack(track)
      const trackRelease = releasesData.find(r => r.id === track.releaseId)
      if (trackRelease) setCurrentReleaseState(trackRelease)
      audioRef.current.src = track.file
      await audioRef.current.load()
    } else if (!audioRef.current.src && targetTrack) {
      audioRef.current.src = targetTrack.file
      await audioRef.current.load()
    }

    await audioRef.current.play()
    setIsPlaying(true)
  } catch (e) {
    console.error('Error playing audio:', e)
    setError('Playback failed.')
    setIsPlaying(false)
  } finally {
    setIsInitializing(false)
  }
}, [currentTrack, initializeAudioContext])

const playNextTrack = useCallback(() => {
  if (!currentTrack) return
  const currentIndex = allTracksData.findIndex(t => t.id === currentTrack.id)
  const nextTrack = allTracksData[(currentIndex + 1) % allTracksData.length]
  if (nextTrack) {
    setTimeout(() => play(nextTrack), 1000)
  }
}, [currentTrack, play])

useEffect(() => {
  if (audioRef.current) return

  audioRef.current = new Audio()
  audioRef.current.preload = 'metadata'
  audioRef.current.crossOrigin = 'anonymous'
  
  const audio = audioRef.current
  
  const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
  const handleDurationChange = () => setDuration(audio.duration || 0)
  const handleEnded = () => {
    setIsPlaying(false)
    setCurrentTime(0)
    playNextTrack()
  }
  const handleError = (e: Event) => {
    setError('Audio playback error.')
    setIsPlaying(false)
  }

  audio.addEventListener('timeupdate', handleTimeUpdate)
  audio.addEventListener('durationchange', handleDurationChange)
  audio.addEventListener('ended', handleEnded)
  audio.addEventListener('error', handleError)

  return () => {
    audio.removeEventListener('timeupdate', handleTimeUpdate)
    audio.removeEventListener('durationchange', handleDurationChange)
    audio.removeEventListener('ended', handleEnded)
    audio.removeEventListener('error', handleError)
  }
}, [playNextTrack])

useEffect(() => {
  if (audioRef.current) {
    audioRef.current.volume = volume / 100
  }
}, [volume])

const pause = useCallback(() => {
  if (audioRef.current) {
    audioRef.current.pause()
    setIsPlaying(false)
  }
}, [])

const stop = useCallback(() => {
  if (audioRef.current) {
    audioRef.current.pause()
    audioRef.current.currentTime = 0
    setIsPlaying(false)
    setCurrentTime(0)
  }
}, [])

const setVolume = useCallback((newVolume: number) => setVolumeState(newVolume), [])

const seek = useCallback((time: number) => {
  if (audioRef.current) {
    audioRef.current.currentTime = time
    setCurrentTime(time)
  }
}, [])

const setCurrentRelease = useCallback((release: Release) => {
  setCurrentReleaseState(release)
  if (release.tracks.length > 0 && currentTrack?.releaseId !== release.id) {
    setCurrentTrack(release.tracks[0])
  }
}, [currentTrack])

const updateQualitySettings = useCallback((quality: 'ultra' | 'high' | 'medium' | 'low') => {
  const fftSizes = { ultra: 512, high: 256, medium: 128, low: 64 }
  const bufferSizes = { ultra: 256, high: 128, medium: 64, low: 32 }
  
  const fftSize = fftSizes[quality]
  const bufferSize = bufferSizes[quality]
  
  setAudioData(new Uint8Array(bufferSize))
  setFrequencyData(new Uint8Array(bufferSize))
  
  if (analyserRef.current) {
    analyserRef.current.fftSize = fftSize
  }
}, [])

return (
  <AudioContext.Provider value={{
    currentTrack,
    currentRelease,
    isPlaying,
    isInitializing,
    volume,
    currentTime,
    duration,
    audioData,
    frequencyData,
    error,
    releases: releasesData,
    allTracks: allTracksData,
    play,
    pause,
    stop,
    setVolume,
    seek,
    setCurrentRelease,
    updateQualitySettings
  }}>
    {children}
  </AudioContext.Provider>
)
}

export function useAudio() {
const context = useContext(AudioContext)
if (!context) {
  throw new Error('useAudio must be used within an AudioProvider')
}
return context
}

export { releasesData as releases, allTracksData as allTracks }
