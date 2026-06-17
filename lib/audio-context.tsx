"use client"

import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react'

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

// Named AudioPlayerContextType to avoid collision with the window.AudioContext Web API
interface AudioPlayerContextType {
  currentTrack: Track | null
  currentRelease: Release | null
  isPlaying: boolean
  isInitializing: boolean
  volume: number
  currentTime: number
  duration: number
  level: number               // overall amplitude 0-1, for lightweight UI accents (VU meter)
  error: string | null
  releases: Release[]
  allTracks: Track[]
  addLocalTrack: (file: File) => Track | null
  play: (track?: Track) => void
  pause: () => void
  stop: () => void
  setVolume: (volume: number) => void
  seek: (time: number) => void
  setCurrentRelease: (release: Release) => void
  // Stable getter so visualizations can read the live analyser at 60fps via rAF
  // instead of going through choppy ~16fps React state.
  getAnalyser: () => AnalyserNode | null
}

// AudioPlayerContext avoids shadowing the global window.AudioContext
const AudioPlayerContext = createContext<AudioPlayerContextType | null>(null)

const releasesData: Release[] = [
  {
    id: 'azulbic-unreleased',
    title: 'UNRELEASED_DEMOS',
    artist: 'AZULBIC',
    year: '2026',
    genre: 'ELECTRONIC',
    format: 'DIGITAL',
    size: '73.2MB',
    cover: 'placeholder.svg',
    tracks: [
      {
        id: 1,
        title: 'BPF.MP3',
        artist: 'AZULBIC + ARMENIATEK',
        duration: '05:46',
        size: '5.3MB',
        file: 'audio/azulbic-armeniatek-bpf.mp3',
        releaseId: 'azulbic-unreleased',
      },
      {
        id: 2,
        title: 'TAVINI.MP3',
        artist: 'AZULBIC + ARMENIATEK',
        duration: '06:24',
        size: '5.9MB',
        file: 'audio/azulbic-armeniatek-tavini.mp3',
        releaseId: 'azulbic-unreleased',
      },
      {
        id: 3,
        title: 'UDT.MP3',
        artist: 'AZULBIC + ARMENIATEK',
        duration: '05:27',
        size: '5.0MB',
        file: 'audio/azulbic-armeniatek-udt.mp3',
        releaseId: 'azulbic-unreleased',
      },
      {
        id: 4,
        title: 'TAPA_NA_BUNDA_E_JOGA_NA_CAMA.WAV',
        artist: 'AZULBIC',
        duration: '05:36',
        size: '57.0MB',
        file: 'audio/azulbic-tapa-na-bunda-e-joga-na-cama-atividade-ludica.wav',
        releaseId: 'azulbic-unreleased',
      },
    ],
  },
]

const allTracksData = releasesData.flatMap(release => release.tracks)
const defaultTrack = allTracksData[0] ?? null
const defaultRelease = releasesData[0] ?? null
const LINKED_RELEASE_ID = 'linked'
const linkedReleaseBase: Release = {
  id: LINKED_RELEASE_ID,
  title: 'LOCAL_AUDIO',
  artist: 'USER_FILE',
  year: 'LIVE',
  genre: 'EXTERNAL',
  format: 'FILE',
  size: 'LOCAL',
  cover: 'placeholder.svg',
  tracks: [],
}

// Fixed FFT size: 2048 gives 1024 frequency bins, matching what ASCII Spectrum Analyzer expects
const FFT_SIZE = 2048
const FREQUENCY_BIN_COUNT = FFT_SIZE / 2  // 1024
const AUDIO_UPDATE_INTERVAL = 60           // ~16fps

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [currentTrack, setCurrentTrack] = useState<Track | null>(defaultTrack)
  const [currentRelease, setCurrentReleaseState] = useState<Release | null>(defaultRelease)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [volume, setVolumeState] = useState(75)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [linkedTracks, setLinkedTracks] = useState<Track[]>([])
  const allTracks = useMemo(() => [...allTracksData, ...linkedTracks], [linkedTracks])
  const linkedRelease = useMemo<Release>(() => ({
    ...linkedReleaseBase,
    tracks: linkedTracks,
  }), [linkedTracks])

  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Ref typed as the Web API AudioContext (no naming conflict since the React context is AudioPlayerContext)
  const webAudioContextRef = useRef<globalThis.AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const audioUpdateIntervalRef = useRef<number | undefined>(undefined)

  // Stable getter — visualizations call this inside their own rAF loop to read
  // the live analyser at full 60fps without depending on React state.
  const getAnalyser = useCallback(() => analyserRef.current, [])

  // Lightweight overall-level tracker (drives the shell VU meter). Cheap: one
  // small allocation reused, ~20fps, single scalar setState.
  const levelBufferRef = useRef<Uint8Array>(new Uint8Array(FREQUENCY_BIN_COUNT))
  const allTracksRef = useRef<Track[]>(allTracks)
  const objectUrlsRef = useRef<string[]>([])
  useEffect(() => {
    allTracksRef.current = allTracks
  }, [allTracks])

  const addLocalTrack = useCallback((file: File) => {
    if (!file.type.startsWith('audio/')) return null

    const objectUrl = URL.createObjectURL(file)
    objectUrlsRef.current.push(objectUrl)

    const title = file.name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_-]+/g, ' ').toUpperCase()
    const sizeMb = `${(file.size / 1024 / 1024).toFixed(1)}MB`
    const track: Track = {
      id: Date.now(),
      title: title || `LOCAL_${linkedTracks.length + 1}`,
      artist: 'LOCAL_FILE',
      duration: 'LOCAL',
      size: sizeMb,
      file: objectUrl,
      releaseId: LINKED_RELEASE_ID,
    }

    setLinkedTracks(current => [...current, track])
    return track
  }, [linkedTracks.length])

  const updateLevel = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser || !isPlaying) return
    const buf = levelBufferRef.current
    analyser.getByteFrequencyData(buf as Uint8Array<ArrayBuffer>)
    let sum = 0
    for (let i = 0; i < buf.length; i++) sum += buf[i]
    setLevel(sum / buf.length / 255)
  }, [isPlaying])

  useEffect(() => {
    if (isPlaying && analyserRef.current) {
      audioUpdateIntervalRef.current = window.setInterval(updateLevel, AUDIO_UPDATE_INTERVAL)
    } else {
      clearInterval(audioUpdateIntervalRef.current)
      setLevel(0)
    }

    return () => {
      clearInterval(audioUpdateIntervalRef.current)
    }
  }, [isPlaying, updateLevel])

  // Synchronous Web Audio init — must not await anything so the user gesture
  // remains active when audio.play() is called immediately after.
  const initWebAudio = useCallback(() => {
    if (webAudioContextRef.current || !audioRef.current) return
    try {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext
      const ctx = new AudioContextCtor({ latencyHint: 'interactive' })
      const analyser = ctx.createAnalyser()
      analyser.fftSize = FFT_SIZE
      analyser.smoothingTimeConstant = 0.18
      const source = ctx.createMediaElementSource(audioRef.current)
      source.connect(analyser)
      analyser.connect(ctx.destination)
      webAudioContextRef.current = ctx
      analyserRef.current = analyser
      sourceRef.current = source
      // Resume if suspended — non-blocking; browser permits this after user gesture
      if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    } catch (e) {
      console.error('Web Audio init failed:', e)
    }
  }, [])

  const play = useCallback((track?: Track) => {
    if (!audioRef.current) return

    const targetTrack = track ?? currentTrack
    if (!targetTrack) return

    setError(null)
    setIsInitializing(true)

    // Set src synchronously before any async work so the network request starts immediately
    if (track && track.id !== currentTrack?.id) {
      setCurrentTrack(track)
      const rel = track.releaseId === LINKED_RELEASE_ID ? linkedRelease : releasesData.find(r => r.id === track.releaseId)
      if (rel) setCurrentReleaseState(rel)
      audioRef.current.src = track.file
      audioRef.current.load()
    } else if (!audioRef.current.src) {
      audioRef.current.src = targetTrack.file
      audioRef.current.load()
    }

    // Init Web Audio synchronously (no await) — preserves user gesture for audio.play()
    initWebAudio()

    setIsPlaying(true)
    setIsInitializing(false)

    audioRef.current.play().catch(e => {
      console.error('Playback failed:', e.name, e.message)
      setError('Playback failed.')
      setIsPlaying(false)
    })
  }, [currentTrack, initWebAudio, linkedRelease])

  // Stable ref so the ended handler always calls the latest play/currentTrack values
  // without needing to re-add the event listener every time they change.
  const playNextTrackRef = useRef<() => void>(() => {})
  useEffect(() => {
    playNextTrackRef.current = () => {
      if (!currentTrack) return
      const currentList = allTracksRef.current
      if (currentList.length === 0) return
      const currentIndex = currentList.findIndex(t => t.id === currentTrack.id)
      if (currentIndex < 0) return
      const nextTrack = currentList[(currentIndex + 1) % currentList.length]
      if (nextTrack) setTimeout(() => play(nextTrack), 1000)
    }
  }, [currentTrack, play])

  // Create audio element once and add stable event listeners.
  // Empty dep array so this never re-runs (avoids React StrictMode double-invocation issues
  // where an early-return on re-run would leave listeners removed forever).
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio()
      audioRef.current.preload = 'auto'
      audioRef.current.crossOrigin = 'anonymous'
    }

    const audio = audioRef.current

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleDurationChange = () => setDuration(audio.duration || 0)
    const handleEnded = () => {
      setIsPlaying(false)
      setCurrentTime(0)
      playNextTrackRef.current()
    }
    const handleError = () => {
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
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100
    }
  }, [volume])

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((objectUrl) => URL.revokeObjectURL(objectUrl))
      objectUrlsRef.current = []
    }
  }, [])

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

  return (
    <AudioPlayerContext.Provider value={{
      currentTrack,
      currentRelease,
      isPlaying,
      isInitializing,
      volume,
      currentTime,
      duration,
      level,
      error,
      releases: linkedTracks.length ? [...releasesData, linkedRelease] : releasesData,
      allTracks,
      addLocalTrack,
      play,
      pause,
      stop,
      setVolume,
      seek,
      setCurrentRelease,
      getAnalyser,
    }}>
      {children}
    </AudioPlayerContext.Provider>
  )
}

export function useAudio() {
  const context = useContext(AudioPlayerContext)
  if (!context) {
    throw new Error('useAudio must be used within an AudioProvider')
  }
  return context
}

export { releasesData as releases, allTracksData as allTracks }
