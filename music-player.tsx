"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import Image from "next/image"
import { Play, Pause, SkipBack, SkipForward, Volume2, AlertCircle, Shuffle, AlertTriangle, TrendingDown, ZoomIn, ZoomOut } from 'lucide-react'
import { cn } from "@/lib/utils"
import { useAudio } from "./lib/audio-context"

interface PerformanceWarning {
  id: string
  type: 'fps_low' | 'fps_critical' | 'memory_high' | 'cpu_high'
  message: string
  suggestion: string
  suggestedQuality?: 'ultra' | 'high' | 'medium' | 'low'
  timestamp: number
  severity: 'warning' | 'critical'
}

export default function MusicPlayer() {
  const { 
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
    allTracks,
    play, 
    pause, 
    stop, 
    setVolume, 
    seek,
    updateQualitySettings
  } = useAudio()
  
  // Optimized state with reduced granularity
  const [glitchActive, setGlitchActive] = useState(false)
  const [shuffleMode, setShuffleMode] = useState(false)
  
  // Single optimized meter state
  const [meterData, setMeterData] = useState({
    vuLeft: 0, vuRight: 0,
    ppmLeft: 0, ppmRight: 0,
    vuPeakLeft: 0, vuPeakRight: 0,
    ppmPeakLeft: 0, ppmPeakRight: 0,
    loudness: -23,
    correlation: 0,
    phasePoints: [] as {x: number, y: number}[]
  })

  const [qualityLevel, setQualityLevel] = useState<'ultra' | 'high' | 'medium' | 'low'>('medium')
  
  // Performance monitoring with enhanced tracking
  const performanceRef = useRef({ 
    lastUpdate: 0, 
    frameCount: 0, 
    fps: 0,
    skipFrames: 0,
    avgFps: 0,
    fpsHistory: [] as number[],
    lowFpsCount: 0,
    criticalFpsCount: 0,
    lastWarningTime: 0,
    memoryUsage: 0,
    cpuUsage: 0
  })

  // Performance warnings state
  const [performanceWarnings, setPerformanceWarnings] = useState<PerformanceWarning[]>([])
  const [showPerformancePanel, setShowPerformancePanel] = useState(false)
  const [autoQualityEnabled, setAutoQualityEnabled] = useState(true)
  
  // Refs for optimization
  const animationFrameRef = useRef<number | undefined>(undefined)
  const lastMeterUpdateRef = useRef(0)
  const lastWaveformUpdateRef = useRef(0)
  
  // Performance thresholds
  const PERFORMANCE_THRESHOLDS = {
    fps: {
      warning: 45,    // Show warning below 45fps
      critical: 25,   // Critical warning below 25fps
      auto_downgrade: 30  // Auto-downgrade quality below 30fps
    },
    memory: {
      warning: 80,    // Warning at 80MB+ estimated usage
      critical: 120   // Critical at 120MB+
    },
    cpu: {
      warning: 70,    // Warning at 70%+ estimated usage
      critical: 85    // Critical at 85%+
    }
  }

  // Dynamic update intervals based on quality
  const getUpdateIntervals = (quality: string) => {
    switch (quality) {
      case 'ultra':
        return { meter: 50, waveform: 33, performance: 500 } // 20fps, 30fps
      case 'high':
        return { meter: 100, waveform: 66, performance: 1000 } // 10fps, 15fps
      case 'medium':
        return { meter: 200, waveform: 100, performance: 1000 } // 5fps, 10fps
      case 'low':
        return { meter: 500, waveform: 250, performance: 2000 } // 2fps, 4fps
      default:
        return { meter: 200, waveform: 100, performance: 1000 }
    }
  }

  const intervals = getUpdateIntervals(qualityLevel)
  const METER_UPDATE_INTERVAL = intervals.meter
  const WAVEFORM_UPDATE_INTERVAL = intervals.waveform
  const PERFORMANCE_CHECK_INTERVAL = intervals.performance

  const getWaveformBars = (quality: string) => {
    switch (quality) {
      case 'ultra': return 48
      case 'high': return 32
      case 'medium': return 24
      case 'low': return 12
      default: return 24
    }
  }

  const [waveformBars, setWaveformBars] = useState<number[]>(new Array(getWaveformBars(qualityLevel)).fill(15))

  // Enhanced oscilloscope state with zoom and pan
  const [oscilloscopeData, setOsciloscopeData] = useState<number[]>(new Array(128).fill(0)) // Increased buffer for zoom
  const [oscilloscopeMode, setOscilloscopeMode] = useState<'time' | 'freq'>('time')
  const [timeScale, setTimeScale] = useState<1 | 2 | 5 | 10>(10) // milliseconds (default 10ms)
  const [frequencyDataScope, setFrequencyDataScope] = useState<number[]>(new Array(128).fill(0))
  
  // Zoom and pan controls
  const [zoomLevel, setZoomLevel] = useState<0.0005 | 0.001 | 0.01 | 0.1 | 0.25 | 0.5 | 0.75 | 1 | 2 | 4 | 8 | 16>(1) // Extended zoom levels incl. 0.0005
  const [panOffset, setPanOffset] = useState(0) // Pan offset as percentage (0-100)
  const [amplitudeZoom, setAmplitudeZoom] = useState<1 | 2 | 4 | 8>(8) // Vertical zoom for amplitude (default 8x)
  
  // Mouse interaction state
  const [isDragging, setIsDragging] = useState(false)
  const [lastMouseX, setLastMouseX] = useState(0)
  const oscilloscopeRef = useRef<HTMLDivElement>(null)

  // Enhanced performance monitoring
  const updatePerformanceMetrics = useCallback(() => {
    const perf = performanceRef.current
    
    // Update FPS history (keep last 10 readings)
    perf.fpsHistory.push(perf.fps)
    if (perf.fpsHistory.length > 10) {
      perf.fpsHistory.shift()
    }
    
    // Calculate average FPS
    perf.avgFps = perf.fpsHistory.reduce((sum, fps) => sum + fps, 0) / perf.fpsHistory.length
    
    // Estimate memory usage based on quality and activity
    const baseMemory = 20 // Base memory usage in MB
    const qualityMultiplier = {
      ultra: 4,
      high: 2.5,
      medium: 1.5,
      low: 1
    }[qualityLevel]
    const activityMultiplier = isPlaying ? 1.5 : 1
    perf.memoryUsage = baseMemory * qualityMultiplier * activityMultiplier
    
    // Estimate CPU usage based on FPS and quality
    const targetFps = {
      ultra: 60,
      high: 45,
      medium: 30,
      low: 15
    }[qualityLevel]
    const fpsRatio = Math.min(1, perf.avgFps / targetFps)
    perf.cpuUsage = Math.max(10, Math.min(95, (1 - fpsRatio) * 100 + (isPlaying ? 20 : 5)))
    
    // Track low FPS occurrences
    if (perf.fps < PERFORMANCE_THRESHOLDS.fps.warning) {
      perf.lowFpsCount++
    } else {
      perf.lowFpsCount = Math.max(0, perf.lowFpsCount - 1)
    }
    
    if (perf.fps < PERFORMANCE_THRESHOLDS.fps.critical) {
      perf.criticalFpsCount++
    } else {
      perf.criticalFpsCount = Math.max(0, perf.criticalFpsCount - 1)
    }
  }, [qualityLevel, isPlaying])

  // Normalize zoom so values below 1 increase effective zoom (1/z)
  const effectiveZoom = useMemo(() => (zoomLevel >= 1 ? zoomLevel : 1 / zoomLevel), [zoomLevel])
  const zoomLabel = useMemo(() => {
    const z = effectiveZoom
    if (z >= 1000) return `${Math.round(z)}x`
    if (z >= 10) return `${z.toFixed(0)}x`
    return `${z.toFixed(2)}x`
  }, [effectiveZoom])

  // Generate performance warnings
  const checkPerformanceWarnings = useCallback(() => {
    const perf = performanceRef.current
    const now = Date.now()
    const warnings: PerformanceWarning[] = []
    
    // Only check if enough time has passed since last warning
    if (now - perf.lastWarningTime < 5000) return // 5 second cooldown
    
    // FPS warnings
    if (perf.criticalFpsCount >= 3) {
      const suggestedQuality = qualityLevel === 'ultra' ? 'high' : 
                              qualityLevel === 'high' ? 'medium' : 
                              qualityLevel === 'medium' ? 'low' : 'low'
      
      warnings.push({
        id: `fps_critical_${now}`,
        type: 'fps_critical',
        message: `CRITICAL: FPS dropped to ${perf.fps} (target: 30+)`,
        suggestion: `Reduce quality to ${suggestedQuality.toUpperCase()} for better performance`,
        suggestedQuality,
        timestamp: now,
        severity: 'critical'
      })
    } else if (perf.lowFpsCount >= 5 && perf.avgFps < PERFORMANCE_THRESHOLDS.fps.warning) {
      const suggestedQuality = qualityLevel === 'ultra' ? 'high' : 
                              qualityLevel === 'high' ? 'medium' : 'low'
      
      warnings.push({
        id: `fps_low_${now}`,
        type: 'fps_low',
        message: `WARNING: Average FPS is ${Math.round(perf.avgFps)} (target: 45+)`,
        suggestion: `Consider reducing quality to ${suggestedQuality.toUpperCase()}`,
        suggestedQuality,
        timestamp: now,
        severity: 'warning'
      })
    }
    
    // Memory warnings
    if (perf.memoryUsage > PERFORMANCE_THRESHOLDS.memory.critical) {
      warnings.push({
        id: `memory_critical_${now}`,
        type: 'memory_high',
        message: `CRITICAL: High memory usage (~${Math.round(perf.memoryUsage)}MB)`,
        suggestion: 'Reduce quality or restart the application',
        suggestedQuality: 'low',
        timestamp: now,
        severity: 'critical'
      })
    } else if (perf.memoryUsage > PERFORMANCE_THRESHOLDS.memory.warning) {
      warnings.push({
        id: `memory_warning_${now}`,
        type: 'memory_high',
        message: `WARNING: Memory usage is high (~${Math.round(perf.memoryUsage)}MB)`,
        suggestion: 'Consider reducing quality settings',
        suggestedQuality: qualityLevel === 'ultra' ? 'high' : 'medium',
        timestamp: now,
        severity: 'warning'
      })
    }
    
    // CPU warnings
    if (perf.cpuUsage > PERFORMANCE_THRESHOLDS.cpu.critical) {
      warnings.push({
        id: `cpu_critical_${now}`,
        type: 'cpu_high',
        message: `CRITICAL: High CPU usage (~${Math.round(perf.cpuUsage)}%)`,
        suggestion: 'Reduce quality immediately',
        suggestedQuality: 'low',
        timestamp: now,
        severity: 'critical'
      })
    } else if (perf.cpuUsage > PERFORMANCE_THRESHOLDS.cpu.warning) {
      warnings.push({
        id: `cpu_warning_${now}`,
        type: 'cpu_high',
        message: `WARNING: CPU usage is high (~${Math.round(perf.cpuUsage)}%)`,
        suggestion: 'Consider reducing quality',
        suggestedQuality: qualityLevel === 'ultra' ? 'high' : 'medium',
        timestamp: now,
        severity: 'warning'
      })
    }
    
    if (warnings.length > 0) {
      setPerformanceWarnings(prev => [...prev, ...warnings])
      perf.lastWarningTime = now
      
      // Auto-adjust quality if enabled and critical
      if (autoQualityEnabled && warnings.some(w => w.severity === 'critical')) {
        const criticalWarning = warnings.find(w => w.severity === 'critical')
        if (criticalWarning?.suggestedQuality && criticalWarning.suggestedQuality !== qualityLevel) {
          setTimeout(() => {
            setQualityLevel(criticalWarning.suggestedQuality!)
            setPerformanceWarnings(prev => [...prev, {
              id: `auto_adjust_${Date.now()}`,
              type: 'fps_low',
              message: `AUTO: Quality reduced to ${criticalWarning.suggestedQuality!.toUpperCase()}`,
              suggestion: 'Performance should improve now',
              timestamp: Date.now(),
              severity: 'warning'
            }])
          }, 1000)
        }
      }
    }
  }, [qualityLevel, autoQualityEnabled])

  // Memoized and heavily optimized audio processors
  const audioProcessors = useMemo(() => ({
    // Simplified RMS calculation with sampling
    calculateRMS: (samples: Uint8Array, sampleRate = 4) => {
      let sum = 0
      const length = samples.length
      for (let i = 0; i < length; i += sampleRate) { // Sample every 4th value
        const normalized = (samples[i] - 128) / 128
        sum += normalized * normalized
      }
      const rms = Math.sqrt(sum / (length / sampleRate))
      return Math.min(100, Math.max(0, rms * 150))
    },
    
    // Simplified peak calculation with sampling
    calculatePeak: (samples: Uint8Array, sampleRate = 4) => {
      let peak = 0
      const length = samples.length
      for (let i = 0; i < length; i += sampleRate) { // Sample every 4th value
        const normalized = Math.abs((samples[i] - 128) / 128)
        if (normalized > peak) peak = normalized
      }
      return Math.min(100, peak * 100)
    },
    
    // Simplified LUFS
    calculateLUFS: (leftRMS: number, rightRMS: number) => {
      const avgRMS = (leftRMS + rightRMS) / 2
      return Math.max(-60, Math.min(0, -50 + (avgRMS * 0.3)))
    }
  }), [])

  // Enhanced oscilloscope data generation with zoom support
  const updateOscilloscopeData = useCallback(() => {
    if (!isPlaying) {
      setOsciloscopeData(new Array(128).fill(0))
      setFrequencyDataScope(new Array(128).fill(0))
      return
    }

    if (oscilloscopeMode === 'time') {
      // Time domain visualization with zoom support
      if (audioData && audioData.length > 0) {
        const samples = 128 // Fixed number of display points
        const baseWindowSize = Math.floor(audioData.length * (timeScale / 10))
        const zoomedWindowSize = Math.floor(baseWindowSize / effectiveZoom) // Normalize zoom semantics
        
        // Calculate pan offset in samples
        const maxPanOffset = audioData.length - zoomedWindowSize
        const panSamples = Math.floor((panOffset / 100) * maxPanOffset)
        
        const startIndex = Math.max(0, Math.min(maxPanOffset, panSamples))
        const endIndex = Math.min(audioData.length, startIndex + zoomedWindowSize)
        const actualWindowSize = endIndex - startIndex
        
        // Evenly resample across the actual window without zero-filling
        const data = new Array(samples)
        for (let i = 0; i < samples; i++) {
          const t = i / (samples - 1)
          const sampleIndex = Math.min(endIndex - 1, startIndex + Math.floor(t * (actualWindowSize - 1)))
          // Convert from 0-255 to -1..1
          const rawValue = audioData[sampleIndex]
          const normalized = (rawValue - 128) / 128
          const scaledValue = normalized * 0.8
          data[i] = Math.max(-1, Math.min(1, scaledValue * amplitudeZoom))
        }
        
        setOsciloscopeData(data)
      }
    } else {
      // Frequency domain visualization with zoom support
      if (frequencyData && frequencyData.length > 0) {
        const samples = 128
        const totalFreqBins = frequencyData.length
        const zoomedBins = Math.floor(totalFreqBins / effectiveZoom)
        
        // Calculate frequency range based on pan and zoom
        const maxPanOffset = totalFreqBins - zoomedBins
        const panBins = Math.floor((panOffset / 100) * maxPanOffset)
        
        const startBin = Math.max(0, Math.min(maxPanOffset, panBins))
        const endBin = Math.min(totalFreqBins, startBin + zoomedBins)
        const actualBins = endBin - startBin
        
        const step = Math.max(1, Math.floor(actualBins / samples))
        const data = new Array(samples)
        
        for (let i = 0; i < samples; i++) {
          const freqIndex = startBin + (i * step)
          if (freqIndex < endBin && freqIndex < frequencyData.length) {
            // FIXED: Consistent frequency data normalization
            const rawValue = frequencyData[freqIndex]
            // Normalize frequency data consistently across quality levels
            const normalized = rawValue / 255 // 0 to 1 range
            const centered = (normalized - 0.5) * 2 // -1 to 1 range
            const scaledValue = centered * 0.6 // Base amplitude scale for frequency
            data[i] = Math.max(-1, Math.min(1, scaledValue * amplitudeZoom))
          } else {
            data[i] = 0
          }
        }
        
        setFrequencyDataScope(data)
        setOsciloscopeData(data)
      }
    }
  }, [audioData, frequencyData, isPlaying, oscilloscopeMode, timeScale, zoomLevel, effectiveZoom, panOffset, amplitudeZoom])

  // Zoom control functions
  const zoomIn = useCallback(() => {
    setZoomLevel(prev => {
      const levels: (0.0005 | 0.001 | 0.01 | 0.1 | 0.25 | 0.5 | 0.75 | 1 | 2 | 4 | 8 | 16)[] = [0.0005, 0.001, 0.01, 0.1, 0.25, 0.5, 0.75, 1, 2, 4, 8, 16]
      const currentIndex = levels.indexOf(prev)
      return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : prev
    })
  }, [])

  const zoomOut = useCallback(() => {
    setZoomLevel(prev => {
      const levels: (0.0005 | 0.001 | 0.01 | 0.1 | 0.25 | 0.5 | 0.75 | 1 | 2 | 4 | 8 | 16)[] = [0.0005, 0.001, 0.01, 0.1, 0.25, 0.5, 0.75, 1, 2, 4, 8, 16]
      const currentIndex = levels.indexOf(prev)
      if (currentIndex > 0) {
        const nextLevel = levels[currentIndex - 1]
        // Reset pan when zooming out to baseline or below
        if (nextLevel <= 1) setPanOffset(0)
        return nextLevel
      }
      return prev
    })
  }, [])

  const amplitudeZoomIn = useCallback(() => {
    setAmplitudeZoom(prev => {
      const levels: (1 | 2 | 4 | 8)[] = [1, 2, 4, 8]
      const currentIndex = levels.indexOf(prev)
      return currentIndex < levels.length - 1 ? levels[currentIndex + 1] : prev
    })
  }, [])

  const amplitudeZoomOut = useCallback(() => {
    setAmplitudeZoom(prev => {
      const levels: (1 | 2 | 4 | 8)[] = [1, 2, 4, 8]
      const currentIndex = levels.indexOf(prev)
      return currentIndex > 0 ? levels[currentIndex - 1] : prev
    })
  }, [])

  const resetZoom = useCallback(() => {
    setZoomLevel(1)
    setAmplitudeZoom(1)
    setPanOffset(0)
  }, [])

  // Mouse interaction handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (zoomLevel > 1) {
      setIsDragging(true)
      setLastMouseX(e.clientX)
    }
  }, [zoomLevel])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging && zoomLevel > 1) {
      const deltaX = e.clientX - lastMouseX
      const sensitivity = 0.5 // Adjust pan sensitivity
      const panDelta = (deltaX * sensitivity * zoomLevel) / 2 // More zoom = more sensitive pan
      
      setPanOffset(prev => {
        const newOffset = prev - panDelta // Negative for natural drag direction
        return Math.max(0, Math.min(100, newOffset))
      })
      
      setLastMouseX(e.clientX)
    }
  }, [isDragging, lastMouseX, zoomLevel])

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    if (e.shiftKey) {
      // Shift + wheel for amplitude zoom
      if (e.deltaY < 0) {
        amplitudeZoomIn()
      } else {
        amplitudeZoomOut()
      }
    } else {
      // Regular wheel for horizontal zoom
      if (e.deltaY < 0) {
        zoomIn()
      } else {
        zoomOut()
      }
    }
  }, [zoomIn, zoomOut, amplitudeZoomIn, amplitudeZoomOut])

  // Single optimized animation loop
  const updateVisuals = useCallback(() => {
    const now = performance.now()
    
    // Enhanced performance monitoring
    performanceRef.current.frameCount++
    if (now - performanceRef.current.lastUpdate > PERFORMANCE_CHECK_INTERVAL) {
      performanceRef.current.fps = Math.round((performanceRef.current.frameCount * 1000) / PERFORMANCE_CHECK_INTERVAL)
      performanceRef.current.frameCount = 0
      performanceRef.current.lastUpdate = now
      
      // Update performance metrics
      updatePerformanceMetrics()
      
      // Check for performance warnings
      if (isPlaying) {
        checkPerformanceWarnings()
      }
      
      // Skip frames if performance is poor
      if (performanceRef.current.fps < 30) {
        performanceRef.current.skipFrames = Math.max(1, Math.floor(60 / performanceRef.current.fps))
      } else {
        performanceRef.current.skipFrames = 0
      }
    }
    
    // Skip frames for performance
    if (performanceRef.current.skipFrames > 0 && 
        performanceRef.current.frameCount % performanceRef.current.skipFrames !== 0) {
      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(updateVisuals)
      }
      return
    }
    
    let shouldUpdateMeters = false
    let shouldUpdateWaveform = false
    
    // Throttled meter updates
    if (now - lastMeterUpdateRef.current > METER_UPDATE_INTERVAL) {
      shouldUpdateMeters = true
      lastMeterUpdateRef.current = now
    }
    
    // Throttled waveform updates
    if (now - lastWaveformUpdateRef.current > WAVEFORM_UPDATE_INTERVAL) {
      shouldUpdateWaveform = true
      lastWaveformUpdateRef.current = now
    }
    
    // Update waveform (less frequently)
    if (shouldUpdateWaveform) {
      if (frequencyData && frequencyData.length > 0) {
        const barCount = getWaveformBars(qualityLevel)
        const bars = new Array(barCount)
        const step = Math.floor(frequencyData.length / barCount)
        
        for (let i = 0; i < barCount; i++) {
          const freqIndex = i * step
          const frequency = frequencyData[freqIndex] || 0
          bars[i] = Math.min(100, Math.max(5, (frequency / 255) * 80))
        }
        
        setWaveformBars(bars)
      }
      
      // Update oscilloscope
      updateOscilloscopeData()
    }
    
    // Update meters (less frequently)
    if (shouldUpdateMeters && audioData && audioData.length > 0) {
      // Split channels more efficiently with sampling
      const halfLength = Math.floor(audioData.length / 2)
      const leftSamples = audioData.subarray(0, halfLength)
      const rightSamples = audioData.subarray(halfLength)
      
      // Calculate metrics with reduced precision
      const leftRMS = audioProcessors.calculateRMS(leftSamples)
      const rightRMS = audioProcessors.calculateRMS(rightSamples)
      const leftPeak = audioProcessors.calculatePeak(leftSamples)
      const rightPeak = audioProcessors.calculatePeak(rightSamples)
      
      // Simplified correlation (sample fewer points)
      let correlation = 0
      const corrSamples = Math.min(32, halfLength) // Much fewer samples
      for (let i = 0; i < corrSamples; i++) {
        const idx = Math.floor(i * halfLength / corrSamples)
        const l = (leftSamples[idx] - 128) / 128
        const r = (rightSamples[idx] - 128) / 128
        correlation += l * r
      }
      correlation = correlation / corrSamples
      
      // Batch meter updates with simplified ballistics
      setMeterData(prev => ({
        vuLeft: leftRMS > prev.vuLeft ? prev.vuLeft * 0.7 + leftRMS * 0.3 : prev.vuLeft * 0.9,
        vuRight: rightRMS > prev.vuRight ? prev.vuRight * 0.7 + rightRMS * 0.3 : prev.vuRight * 0.9,
        ppmLeft: leftPeak > prev.ppmLeft ? prev.ppmLeft * 0.8 + leftPeak * 0.2 : prev.ppmLeft * 0.95,
        ppmRight: rightPeak > prev.ppmRight ? prev.ppmRight * 0.8 + rightPeak * 0.2 : prev.ppmRight * 0.95,
        vuPeakLeft: Math.max(leftRMS, prev.vuPeakLeft * 0.98),
        vuPeakRight: Math.max(rightRMS, prev.vuPeakRight * 0.98),
        ppmPeakLeft: Math.max(leftPeak, prev.ppmPeakLeft * 0.99),
        ppmPeakRight: Math.max(rightPeak, prev.ppmPeakRight * 0.99),
        loudness: prev.loudness * 0.95 + audioProcessors.calculateLUFS(leftRMS, rightRMS) * 0.05,
        correlation: prev.correlation * 0.9 + correlation * 0.1,
        // Simplified phase scope with fewer points
        phasePoints: Array.from({ length: 8 }, (_, i) => {
          const idx = Math.floor(i * halfLength / 8)
          return {
            x: (leftSamples[idx] - 128) / 128,
            y: (rightSamples[idx] - 128) / 128
          }
        })
      }))
    }
    
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateVisuals)
    }
  }, [isPlaying, audioData, frequencyData, audioProcessors, qualityLevel, updatePerformanceMetrics, checkPerformanceWarnings, updateOscilloscopeData])

  // Start/stop animation loop
  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateVisuals)
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      
      // Decay meters when stopped
      const decayInterval = setInterval(() => {
        setMeterData(prev => {
          const allLow = prev.vuLeft < 1 && prev.vuRight < 1 && prev.ppmLeft < 1 && prev.ppmRight < 1
          if (allLow) {
            clearInterval(decayInterval)
            return prev
          }
          
          return {
            ...prev,
            vuLeft: prev.vuLeft * 0.9,
            vuRight: prev.vuRight * 0.9,
            ppmLeft: prev.ppmLeft * 0.95,
            ppmRight: prev.ppmRight * 0.95,
            vuPeakLeft: prev.vuPeakLeft * 0.95,
            vuPeakRight: prev.vuPeakRight * 0.95,
            ppmPeakLeft: prev.ppmPeakLeft * 0.98,
            ppmPeakRight: prev.ppmPeakRight * 0.98,
            correlation: prev.correlation * 0.98
          }
        })
      }, 500) // Much slower decay updates
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [isPlaying, updateVisuals])

  // Reduced glitch effect frequency
  useEffect(() => {
    if (!isPlaying) return

    const glitchInterval = setInterval(() => {
      if (Math.random() < 0.05) { // Reduced frequency
        setGlitchActive(true)
        setTimeout(() => setGlitchActive(false), 100)
      }
    }, 5000) // Much less frequent

    return () => clearInterval(glitchInterval)
  }, [isPlaying])

  // Update audio context when quality changes
  useEffect(() => {
    updateQualitySettings(qualityLevel)
    
    // Reset waveform bars with new count
    const barCount = getWaveformBars(qualityLevel)
    setWaveformBars(new Array(barCount).fill(15))
  }, [qualityLevel, updateQualitySettings])

  // Auto-dismiss warnings after 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setPerformanceWarnings(prev => 
        prev.filter(warning => now - warning.timestamp < 10000)
      )
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  // Global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseMove = (e: MouseEvent) => {
        const deltaX = e.clientX - lastMouseX
        const sensitivity = 0.5
        const panDelta = (deltaX * sensitivity * zoomLevel) / 2
        
        setPanOffset(prev => {
          const newOffset = prev - panDelta
          return Math.max(0, Math.min(100, newOffset))
        })
        
        setLastMouseX(e.clientX)
      }

      const handleGlobalMouseUp = () => {
        setIsDragging(false)
      }

      document.addEventListener('mousemove', handleGlobalMouseMove)
      document.addEventListener('mouseup', handleGlobalMouseUp)

      return () => {
        document.removeEventListener('mousemove', handleGlobalMouseMove)
        document.removeEventListener('mouseup', handleGlobalMouseUp)
      }
    }
  }, [isDragging, lastMouseX, zoomLevel])

  const togglePlay = useCallback(async () => {
    try {
      if (isPlaying) {
        pause()
      } else {
        await play(currentTrack || allTracks[0])
      }
    } catch (error) {
      console.error('Play error:', error)
    }
  }, [isPlaying, pause, play, currentTrack, allTracks])

  const playTrack = useCallback(async (track: any) => {
    try {
      await play(track)
    } catch (error) {
      console.error('Track load error:', error)
    }
  }, [play])

  const getNextTrack = useCallback(() => {
    if (!currentTrack) return allTracks[0]
    
    if (shuffleMode) {
      const otherTracks = allTracks.filter(t => t.id !== currentTrack.id)
      return otherTracks[Math.floor(Math.random() * otherTracks.length)]
    } else {
      const currentIndex = allTracks.findIndex(t => t.id === currentTrack.id)
      return allTracks[(currentIndex + 1) % allTracks.length]
    }
  }, [currentTrack, allTracks, shuffleMode])

  const getPreviousTrack = useCallback(() => {
    if (!currentTrack) return allTracks[0]
    
    if (shuffleMode) {
      const otherTracks = allTracks.filter(t => t.id !== currentTrack.id)
      return otherTracks[Math.floor(Math.random() * otherTracks.length)]
    } else {
      const currentIndex = allTracks.findIndex(t => t.id === currentTrack.id)
      return allTracks[(currentIndex - 1 + allTracks.length) % allTracks.length]
    }
  }, [currentTrack, allTracks, shuffleMode])

  const playNext = useCallback(() => {
    const nextTrack = getNextTrack()
    if (nextTrack) play(nextTrack)
  }, [getNextTrack, play])

  const playPrevious = useCallback(() => {
    const prevTrack = getPreviousTrack()
    if (prevTrack) play(prevTrack)
  }, [getPreviousTrack, play])

  const formatTime = useCallback((time: number) => {
    if (!time || isNaN(time)) return "0:00"
    const minutes = Math.floor(time / 60)
    const seconds = Math.floor(time % 60)
    return `${minutes}:${seconds.toString().padStart(2, '0')}`
  }, [])

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (duration > 0) {
      const rect = e.currentTarget.getBoundingClientRect()
      const percent = (e.clientX - rect.left) / rect.width
      const newTime = percent * duration
      seek(newTime)
    }
  }, [duration, seek])

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value))
  }, [setVolume])

  // Handle warning actions
  const applyQualitySuggestion = useCallback((warning: PerformanceWarning) => {
    if (warning.suggestedQuality) {
      setQualityLevel(warning.suggestedQuality)
      // Remove this warning
      setPerformanceWarnings(prev => prev.filter(w => w.id !== warning.id))
    }
  }, [])

  const dismissWarning = useCallback((warningId: string) => {
    setPerformanceWarnings(prev => prev.filter(w => w.id !== warningId))
  }, [])

  const clearAllWarnings = useCallback(() => {
    setPerformanceWarnings([])
  }, [])

  // Simplified meter color functions
  const meterColors = useMemo(() => ({
    getVuColor: (level: number) => {
      if (level < 30) return 'bg-green-500'
      if (level < 60) return 'bg-yellow-400'
      if (level < 85) return 'bg-orange-400'
      return 'bg-red-500'
    },
    
    getPpmColor: (level: number) => {
      if (level < 40) return 'bg-blue-500'
      if (level < 70) return 'bg-green-400'
      if (level < 90) return 'bg-orange-400'
      return 'bg-red-500'
    },
    
    getLoudnessColor: (lufs: number) => {
      if (lufs < -25) return 'text-green-400'
      if (lufs < -20) return 'text-yellow-400'
      return 'text-red-400'
    }
  }), [])

  const renderSimpleMeter = useCallback((level: number, peak: number, label: string, colorFn: (level: number) => string) => {
    const getSegmentCount = (quality: string) => {
      switch (quality) {
        case 'ultra': return 20
        case 'high': return 15
        case 'medium': return 10
        case 'low': return 5
        default: return 10
      }
    }
    
    const segments = getSegmentCount(qualityLevel)
    const segmentHeight = 100 / segments
    
    return (
      <div className="flex flex-col items-center">
        <div className="text-[0.6rem] text-white mb-1 font-bold">{label}</div>
        <div className="w-3 h-12 bg-black border border-white relative overflow-hidden">
          {Array.from({ length: segments }).map((_, i) => {
            const segmentLevel = (segments - i) * segmentHeight
            const isActive = level >= segmentLevel
            
            return (
              <div
                key={i}
                className={cn(
                  "absolute w-full transition-opacity duration-200",
                  isActive ? colorFn(segmentLevel) : 'bg-gray-900'
                )}
                style={{
                  height: `${segmentHeight * 0.8}%`,
                  top: `${i * segmentHeight}%`,
                  opacity: isActive ? 1 : 0.3
                }}
              />
            )
          })}
          {peak > 5 && (
            <div
              className="absolute w-full h-px bg-white"
              style={{ top: `${100 - peak}%` }}
            />
          )}
        </div>
        <div className="text-[0.6rem] text-white mt-1 w-6 text-center">
          {Math.round(level)}
        </div>
      </div>
    )
  }, [qualityLevel])

  const renderPhaseScope = useCallback(() => {
    return (
      <div className="w-12 h-12 bg-black border border-white relative">
        {/* Simplified grid */}
        <div className="absolute w-full h-px bg-white opacity-20" style={{ top: '50%' }} />
        <div className="absolute h-full w-px bg-white opacity-20" style={{ left: '50%' }} />
        
        {/* Phase points */}
        {meterData.phasePoints.map((point, i) => (
          <div
            key={i}
            className="absolute w-px h-px bg-green-400"
            style={{
              left: `${50 + point.x * 40}%`,
              top: `${50 - point.y * 40}%`
            }}
          />
        ))}
      </div>
    )
  }, [meterData.phasePoints])

  // Enhanced oscilloscope with zoom controls
const renderOscilloscope = useCallback(() => {
  const width = 120
  const height = 100 // Increased to match actual display area
  const centerY = height / 2

  return (
    <div className="w-full bg-black border border-white relative" style={{ height: '120px' }}>
      {/* Enhanced controls with zoom */}
      <div className="absolute top-0 left-0 right-0 bg-black/95 p-1 border-b border-white/30 z-10">
        <div className="flex justify-between items-center text-[0.45rem] text-white">
          {/* Mode controls */}
          <div className="flex gap-1">
            <button
              onClick={() => setOscilloscopeMode('time')}
              className={cn(
                "px-1 py-0.5 text-[0.45rem] font-bold transition-colors",
                oscilloscopeMode === 'time' ? "bg-white text-black" : "bg-transparent text-white border border-white/50"
              )}
            >
              TIME
            </button>
            <button
              onClick={() => setOscilloscopeMode('freq')}
              className={cn(
                "px-1 py-0.5 text-[0.45rem] font-bold transition-colors",
                oscilloscopeMode === 'freq' ? "bg-white text-black" : "bg-transparent text-white border border-white/50"
              )}
            >
              FREQ
            </button>
          </div>
          
          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={zoomOut}
              disabled={zoomLevel === 0.0005}
              className={cn(
                "w-4 h-4 flex items-center justify-center text-[0.4rem] font-bold transition-colors",
                zoomLevel === 0.0005 ? "text-gray-600" : "text-white hover:bg-white/20"
              )}
            >
              <ZoomOut className="w-2 h-2" />
            </button>
            <span className="text-[0.45rem] min-w-[12px] text-center">{zoomLabel}</span>
            <button
              onClick={zoomIn}
              disabled={zoomLevel === 16}
              className={cn(
                "w-4 h-4 flex items-center justify-center text-[0.4rem] font-bold transition-colors",
                zoomLevel === 16 ? "text-gray-600" : "text-white hover:bg-white/20"
              )}
            >
              <ZoomIn className="w-2 h-2" />
            </button>
          </div>
        </div>
        
        {/* Second row with time scale and amplitude zoom */}
        <div className="flex justify-between items-center mt-1">
          {oscilloscopeMode === 'time' && (
            <div className="flex items-center gap-1">
              <span className="text-[0.45rem]">SCALE:</span>
              <select
                value={timeScale}
                onChange={(e) => setTimeScale(Number(e.target.value) as 1 | 2 | 5 | 10)}
                className="bg-black text-white text-[0.45rem] border border-white/50 px-1"
              >
                <option value={1}>1ms</option>
                <option value={2}>2ms</option>
                <option value={5}>5ms</option>
                <option value={10}>10ms</option>
              </select>
            </div>
          )}
          
          {/* Amplitude zoom controls */}
          <div className="flex items-center gap-1">
            <span className="text-[0.45rem]">AMP:</span>
            <button
              onClick={amplitudeZoomOut}
              disabled={amplitudeZoom === 1}
              className={cn(
                "w-3 h-3 flex items-center justify-center text-[0.4rem] font-bold transition-colors",
                amplitudeZoom === 1 ? "text-gray-600" : "text-white hover:bg-white/20"
              )}
            >
              -
            </button>
            <span className="text-[0.45rem] min-w-[8px] text-center">{amplitudeZoom}x</span>
            <button
              onClick={amplitudeZoomIn}
              disabled={amplitudeZoom === 8}
              className={cn(
                "w-3 h-3 flex items-center justify-center text-[0.4rem] font-bold transition-colors",
                amplitudeZoom === 8 ? "text-gray-600" : "text-white hover:bg-white/20"
              )}
            >
              +
            </button>
            <button
              onClick={resetZoom}
              className="px-1 py-0.5 text-[0.4rem] font-bold text-white hover:bg-white/20 transition-colors"
            >
              RST
            </button>
          </div>
        </div>
      </div>

      {/* Interactive display area - now uses full remaining height */}
      <div 
        ref={oscilloscopeRef}
        className={cn(
          "absolute inset-0 cursor-crosshair",
          effectiveZoom > 1 && isDragging && "cursor-grabbing",
          effectiveZoom > 1 && !isDragging && "cursor-grab"
        )}
        style={{ top: '40px', height: '80px' }} // Full height minus controls
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Grid lines */}
        <div className="absolute inset-0">
          {/* Horizontal center line */}
          <div className="absolute w-full h-px bg-white opacity-30" style={{ top: '50%' }} />
          {/* Vertical grid lines */}
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="absolute h-full w-px bg-white opacity-20"
              style={{ left: `${(i + 1) * 20}%` }}
            />
          ))}
          {/* Horizontal grid lines */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-full h-px bg-white opacity-20"
              style={{ top: `${(i + 1) * 25}%` }}
            />
          ))}
        </div>

        {/* Waveform - now uses full display area height */}
        <svg className="absolute w-full h-full" viewBox={`0 0 ${width} 80`} preserveAspectRatio="none">
          {oscilloscopeMode === 'time' ? (
            // Time domain waveform - consistent scaling across all quality levels
            <polyline
              points={oscilloscopeData
                .map((value, index) => {
                  const x = (index / (oscilloscopeData.length - 1)) * width
                  // FIXED: Consistent Y scaling that works the same across all quality levels
                  const y = 40 - (value * 30) // Use 30 pixels for consistent amplitude display
                  return `${x},${y}`
                })
                .join(' ')}
              fill="none"
              stroke={isPlaying ? '#00ff00' : '#666666'}
              strokeWidth="1"
              className="transition-all duration-200"
            />
          ) : (
            // Frequency domain bars - consistent height scaling
            oscilloscopeData.map((value, index) => {
              const x = (index / oscilloscopeData.length) * width
              const barWidth = width / oscilloscopeData.length * 0.8
              // FIXED: Consistent bar height calculation
              const barHeight = Math.abs(value) * 30 // Use 30 pixels max height consistently
              return (
                <rect
                  key={index}
                  x={x - barWidth / 2}
                  y={40 - barHeight} // Start from center and go up
                  width={barWidth}
                  height={barHeight}
                  fill={isPlaying ? '#00ff00' : '#666666'}
                  opacity={0.8}
                />
              )
            })
          )}
        </svg>

        {/* Pan indicator */}
        {effectiveZoom > 1 && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
            <div 
              className="h-full bg-white/50"
              style={{ 
                width: `${100 / effectiveZoom}%`,
                left: `${panOffset * (1 - 1/effectiveZoom)}%`
              }}
            />
          </div>
        )}
      </div>

      {/* Status info */}
      <div className="absolute bottom-1 left-1 text-[0.45rem] text-white bg-black/80 px-1">
        {oscilloscopeMode === 'time' 
          ? (isPlaying ? `${timeScale}ms/div` : 'OFF')
          : (isPlaying ? '20Hz-20kHz' : 'OFF')
        }
        {effectiveZoom > 1 && ` | ${zoomLabel}`}
        {amplitudeZoom > 1 && ` | A${amplitudeZoom}x`}
      </div>
      
      {/* Mode indicator */}
      <div className="absolute bottom-1 right-1 text-[0.45rem] text-white bg-black/80 px-1">
        {oscilloscopeMode.toUpperCase()}
      </div>
    </div>
  )
}, [oscilloscopeData, isPlaying, oscilloscopeMode, timeScale, zoomLevel, amplitudeZoom, panOffset, isDragging, handleMouseDown, handleMouseMove, handleMouseUp, handleWheel, zoomIn, zoomOut, amplitudeZoomIn, amplitudeZoomOut, resetZoom])

  // Get performance status color
  const getPerformanceStatusColor = () => {
    const fps = performanceRef.current.fps
    if (fps < PERFORMANCE_THRESHOLDS.fps.critical) return 'text-red-500'
    if (fps < PERFORMANCE_THRESHOLDS.fps.warning) return 'text-yellow-500'
    return 'text-green-500'
  }

  return (
    <div className="w-full max-w-5xl h-[600px] mx-auto bg-black border-2 border-white relative overflow-hidden font-mono">
      {/* Performance warnings overlay */}
      {performanceWarnings.length > 0 && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-black/95 border-b-2 border-white">
          <div className="p-2 space-y-1">
            {performanceWarnings.slice(-3).map((warning) => (
              <div
                key={warning.id}
                className={cn(
                  "flex items-center justify-between text-xs p-2 border",
                  warning.severity === 'critical' 
                    ? "bg-red-900/50 border-red-500 text-red-100" 
                    : "bg-yellow-900/50 border-yellow-500 text-yellow-100"
                )}
              >
                <div className="flex items-center gap-2">
                  {warning.severity === 'critical' ? (
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-yellow-400" />
                  )}
                  <div>
                    <div className="font-bold">{warning.message}</div>
                    <div className="text-xs opacity-80">{warning.suggestion}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  {warning.suggestedQuality && (
                    <button
                      onClick={() => applyQualitySuggestion(warning)}
                      className="px-2 py-1 text-xs font-bold bg-white text-black hover:bg-gray-200 transition-colors"
                    >
                      FIX
                    </button>
                  )}
                  <button
                    onClick={() => dismissWarning(warning.id)}
                    className="px-2 py-1 text-xs font-bold border border-current hover:bg-current hover:text-black transition-colors"
                    >
                    ×
                  </button>
                </div>
              </div>
            ))}
            {performanceWarnings.length > 3 && (
              <div className="text-xs text-gray-400 text-center">
                +{performanceWarnings.length - 3} more warnings
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terminal header */}
      <div className="bg-white text-black p-2 flex justify-between items-center text-xs">
        <div className="flex items-center gap-4">
          <span className="font-bold">ASA_PLAYER_V2.1_OPTIMIZED</span>
          <span>PID: 1337</span>
          <span className={cn("font-bold", getPerformanceStatusColor())}>
            FPS: {performanceRef.current.fps}
          </span>
          <div className="flex items-center gap-2">
            <span>QUALITY:</span>
            <select
              value={qualityLevel}
              onChange={(e) => setQualityLevel(e.target.value as any)}
              className="bg-black text-white px-1 py-0.5 text-xs font-bold border border-white"
            >
              <option value="ultra">ULTRA</option>
              <option value="high">HIGH</option>
              <option value="medium">MEDIUM</option>
              <option value="low">LOW</option>
            </select>
          </div>
          <button
            onClick={() => setShowPerformancePanel(!showPerformancePanel)}
            className={cn(
              "px-2 py-0.5 text-xs font-bold transition-colors",
              showPerformancePanel ? "bg-black text-white" : "bg-transparent text-black border border-black"
            )}
          >
            PERF
          </button>
        </div>
        <div className="flex items-center gap-4">
          {/* Performance warnings indicator */}
          {performanceWarnings.length > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className={cn(
                "w-4 h-4",
                performanceWarnings.some(w => w.severity === 'critical') ? "text-red-600" : "text-yellow-600"
              )} />
              <span className="text-xs font-bold">
                {performanceWarnings.length} WARNING{performanceWarnings.length > 1 ? 'S' : ''}
              </span>
              <button
                onClick={clearAllWarnings}
                className="px-1 py-0.5 text-xs font-bold bg-gray-300 text-black hover:bg-gray-400"
              >
                CLEAR
              </button>
            </div>
          )}
          
          {/* Simplified status indicators */}
          {isPlaying && (
            <>
              <div className={cn("text-xs font-bold", 
                meterData.vuLeft > 80 || meterData.vuRight > 80 ? "text-red-600" : "text-green-600"
              )}>
                VU: {meterData.vuLeft > 80 || meterData.vuRight > 80 ? "HOT" : "OK"}
              </div>
              <div className={cn("text-xs font-bold",
                meterData.ppmLeft > 90 || meterData.ppmRight > 90 ? "text-red-600" : "text-green-600"
              )}>
                PPM: {meterData.ppmLeft > 90 || meterData.ppmRight > 90 ? "PEAK" : "OK"}
              </div>
            </>
          )}
          <div className="flex gap-1">
            <div className="w-3 h-3 bg-black"></div>
            <div className="w-3 h-3 bg-black"></div>
            <div className="w-3 h-3 bg-black"></div>
          </div>
        </div>
      </div>

      {/* Performance panel */}
      {showPerformancePanel && (
        <div className="bg-gray-900 text-white p-2 text-xs border-b-2 border-white">
          <div className="flex justify-between items-center mb-2">
            <span className="font-bold">PERFORMANCE MONITOR</span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={autoQualityEnabled}
                  onChange={(e) => setAutoQualityEnabled(e.target.checked)}
                  className="w-3 h-3"
                />
                AUTO-ADJUST
              </label>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <div className="font-bold">FPS</div>
              <div className={cn("text-lg font-bold", getPerformanceStatusColor())}>
                {performanceRef.current.fps}
              </div>
              <div className="text-xs text-gray-400">
                AVG: {Math.round(performanceRef.current.avgFps)}
              </div>
            </div>
            <div>
              <div className="font-bold">MEMORY</div>
              <div className={cn(
                "text-lg font-bold",
                performanceRef.current.memoryUsage > PERFORMANCE_THRESHOLDS.memory.critical ? "text-red-500" :
                performanceRef.current.memoryUsage > PERFORMANCE_THRESHOLDS.memory.warning ? "text-yellow-500" : "text-green-500"
              )}>
                {Math.round(performanceRef.current.memoryUsage)}MB
              </div>
            </div>
            <div>
              <div className="font-bold">CPU</div>
              <div className={cn(
                "text-lg font-bold",
                performanceRef.current.cpuUsage > PERFORMANCE_THRESHOLDS.cpu.critical ? "text-red-500" :
                performanceRef.current.cpuUsage > PERFORMANCE_THRESHOLDS.cpu.warning ? "text-yellow-500" : "text-green-500"
              )}>
                {Math.round(performanceRef.current.cpuUsage)}%
              </div>
            </div>
            <div>
              <div className="font-bold">QUALITY</div>
              <div className="text-lg font-bold text-white">
                {qualityLevel.toUpperCase()}
              </div>
              <div className="text-xs text-gray-400">
                SKIP: {performanceRef.current.skipFrames}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="bg-red-900 text-white p-2 text-xs flex items-center gap-2 border-b-2 border-white">
          <AlertCircle className="w-4 h-4" />
          <span>ERROR: {error}</span>
        </div>
      )}

      {/* Main content */}
      <div className="flex h-[calc(100%-2rem)]" style={{ 
        height: error ? 'calc(100% - 4rem)' : 
                showPerformancePanel ? 'calc(100% - 6rem)' :
                performanceWarnings.length > 0 ? 'calc(100% - 4rem)' : 'calc(100% - 2rem)' 
      }}>
        {/* Left column - Cover art and controls (expanded) */}
        <div className="w-80 bg-black border-r-2 border-white flex flex-col">
          {/* Cover art (expanded) */}
          <div className="w-80 h-80">
            <div className="w-full h-full relative overflow-hidden border-b-2 border-white">
              <Image
                src={currentRelease?.cover || "/placeholder.svg?height=320&width=320&text=AZULBIC"}
                alt="Album cover"
                fill
                className={cn(
                  "object-cover transition-all duration-300",
                  glitchActive && "hue-rotate-180 saturate-200 contrast-200",
                )}
              />

              {/* Quality-based scanlines */}
              {qualityLevel !== 'low' && (
                <div className="absolute inset-0 pointer-events-none">
                  {Array.from({ length: qualityLevel === 'ultra' ? 20 : qualityLevel === 'high' ? 16 : 12 }).map((_, i) => (
                    <div key={i} className="absolute w-full h-px bg-white opacity-10" style={{ top: `${i * (100 / (qualityLevel === 'ultra' ? 20 : qualityLevel === 'high' ? 16 : 12))}%` }} />
                  ))}
                </div>
              )}

              {/* Serial code overlay */}
              <div className="absolute top-2 left-2 bg-white text-black px-2 py-1 text-xs font-bold">
                {currentRelease?.id.toUpperCase() || "DSRPTV001"}
              </div>
              
              {/* Status indicator */}
              <div className="absolute bottom-2 right-2 bg-black/80 text-white px-2 py-1 text-xs">
                {error ? 'ERROR' : isPlaying ? 'PLAYING' : 'READY'}
              </div>
            </div>
          </div>

          {/* Progress bar (expanded) */}
          <div className="p-3 border-b-2 border-white">
            <div className="text-sm text-white mb-2 flex justify-between">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <div 
              className="w-full h-2 bg-white cursor-pointer relative"
              onClick={handleSeek}
            >
              <div 
                className="h-full bg-gray-400 transition-all duration-100"
                style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* Album info (expanded) */}
          <div className="p-4 bg-black text-white border-b-2 border-white">
            <div className="text-sm mb-2">
              <span className="text-white font-bold">ALBUM:</span> {currentRelease?.title || "UNKNOWN_RELEASE"}.ZIP
            </div>
            <div className="text-sm mb-2">
              <span className="text-white font-bold">ARTIST:</span> {currentTrack?.artist || "UNKNOWN"}
            </div>
            <div className="text-sm mb-2">
              <span className="text-white font-bold">YEAR:</span> {currentRelease?.year || "2024"}
            </div>
            <div className="text-sm mb-2">
              <span className="text-white font-bold">FORMAT:</span> 44.1KHZ/16BIT
            </div>
            <div className="text-sm">
              <span className="text-white font-bold">SIZE:</span> {currentRelease?.size || "0MB"}
            </div>
          </div>

          {/* Transport Controls (expanded) */}
          <div className="p-4 border-b-2 border-white">
            {/* Main control buttons */}
            <div className="flex gap-3 mb-4">
              <button
                onClick={playPrevious}
                className="flex-1 bg-white text-black hover:bg-gray-200 transition-colors duration-100 p-3 text-sm font-bold flex items-center justify-center"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={togglePlay}
                disabled={isInitializing}
                className="flex-[2] bg-white text-black hover:bg-gray-200 transition-colors duration-100 p-3 text-lg font-bold flex items-center justify-center gap-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {isInitializing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
                    PREPARING...
                  </>
                ) : isPlaying ? (
                  <>
                    <div className="flex gap-1">
                      <div className="w-1.5 h-5 bg-black"></div>
                      <div className="w-1.5 h-5 bg-black"></div>
                    </div>
                    PAUSE
                  </>
                ) : (
                  <>
                    <div className="w-0 h-0 border-l-[8px] border-l-black border-y-[5px] border-y-transparent"></div>
                    PLAY
                  </>
                )}
              </button>
              <button
                onClick={playNext}
                className="flex-1 bg-white text-black hover:bg-gray-200 transition-colors duration-100 p-3 text-sm font-bold flex items-center justify-center"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Shuffle and Volume */}
            <div className="space-y-3">
              <button
                onClick={() => setShuffleMode(!shuffleMode)}
                className={cn(
                  "w-full p-3 text-sm font-bold flex items-center justify-center gap-2 transition-colors duration-100",
                  shuffleMode 
                    ? "bg-white text-black" 
                    : "bg-transparent text-white border border-white hover:bg-white/20"
                )}
              >
                <Shuffle className="w-4 h-4" />
                SHUFFLE: {shuffleMode ? "ON" : "OFF"}
              </button>

              <div className="flex items-center gap-3">
                <Volume2 className="w-4 h-4 text-white" />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={volume}
                  onChange={handleVolumeChange}
                  className="flex-1 h-2 bg-white appearance-none cursor-pointer"
                  style={{
                    background: `linear-gradient(to right, #666 0%, #666 ${volume}%, #fff ${volume}%, #fff 100%)`
                  }}
                />
                <span className="text-white text-sm w-10">{volume}%</span>
              </div>
            </div>
          </div>

          {/* Remaining space for future expansion */}
          <div className="flex-1"></div>
        </div>

        {/* Right column - Analysis and tracks */}
        <div className="flex-1 bg-black text-white flex flex-col">
          {/* Simplified analysis container */}
          <div className="h-24 bg-black border-b-2 border-white flex">
            {/* Waveform - 1/4 width */}
            <div className="w-1/4 p-2 border-r border-white">
              <div className="text-xs mb-1 text-white flex justify-between items-center">
                <span className="font-bold">WAVEFORM</span>
                <div className="flex items-center gap-1">
                  <div className={cn("w-1 h-1", isPlaying ? "bg-green-400 animate-pulse" : "bg-gray-500")}></div>
                </div>
              </div>
              
              <div className="flex items-end justify-between gap-px h-12">
                {waveformBars.map((height, index) => (
                  <div
                    key={index}
                    className={cn(
                      "transition-all duration-200 ease-out",
                      isPlaying ? "bg-white" : "bg-gray-600"
                    )}
                    style={{
                      width: `${100 / waveformBars.length}%`,
                      height: `${height}%`,
                      opacity: isPlaying ? 0.9 : 0.4
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Simplified meters - 3/4 width */}
            <div className="w-3/4 px-2 py-2 flex items-center justify-around">
              {/* VU Meters */}
              {renderSimpleMeter(meterData.vuLeft, meterData.vuPeakLeft, "VU-L", meterColors.getVuColor)}
              {renderSimpleMeter(meterData.vuRight, meterData.vuPeakRight, "VU-R", meterColors.getVuColor)}
              
              {/* PPM Meters */}
              {renderSimpleMeter(meterData.ppmLeft, meterData.ppmPeakLeft, "PPM-L", meterColors.getPpmColor)}
              {renderSimpleMeter(meterData.ppmRight, meterData.ppmPeakRight, "PPM-R", meterColors.getPpmColor)}
              
              {/* Simplified Loudness */}
              <div className="flex flex-col items-center">
                <div className="text-[0.6rem] text-white mb-1 font-bold">LUFS</div>
                <div className="w-12 h-12 bg-black border border-white p-1 text-center flex flex-col justify-center">
                  <div className={cn("text-[0.7rem] font-bold", meterColors.getLoudnessColor(meterData.loudness))}>
                    {meterData.loudness.toFixed(1)}
                  </div>
                </div>
              </div>
              
              {/* Phase Scope */}
              <div className="flex flex-col items-center">
                <div className="text-[0.6rem] text-white mb-1 font-bold">PHASE</div>
                {renderPhaseScope()}
              </div>
            </div>
          </div>

          {/* Split container: Track list (3/4) and Oscilloscope + System Info (1/4) */}
          <div className="flex flex-1">
            {/* Track list section - 3/4 width */}
            <div className="w-3/4 flex flex-col border-r-2 border-white">
              {/* Track list header */}
              <div className="bg-white text-black p-2 text-xs font-bold flex justify-between border-b-2 border-white">
                <span>FILENAME</span>
                <span>SIZE</span>
                <span>DURATION</span>
              </div>

              {/* Track list */}
              <div className="flex-1 overflow-auto">
                {allTracks.map((track, index) => (
                  <div
                    key={track.id}
                    className={cn(
                      "flex items-center p-3 border-b border-white/20 cursor-pointer transition-colors duration-100 text-xs",
                      currentTrack?.id === track.id ? "bg-white text-black" : "hover:bg-white/10 text-white",
                    )}
                    onClick={() => playTrack(track)}
                  >
                    <div className="w-8 flex items-center justify-center">
                      {currentTrack?.id === track.id && isPlaying ? (
                        <div className="flex gap-px">
                          <div className="w-0.5 h-3 bg-current"></div>
                          <div className="w-0.5 h-3 bg-current"></div>
                        </div>
                      ) : (
                        <div className="w-0 h-0 border-l-[4px] border-l-current border-y-[3px] border-y-transparent"></div>
                      )}
                    </div>
                    <div className="w-8 text-center">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="flex-1">
                      <div className="font-bold">{track.title}</div>
                      <div className="text-xs opacity-70">{track.artist}</div>
                    </div>
                    <div className="w-20 text-right">{track.size}</div>
                    <div className="w-20 text-right">{track.duration}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Oscilloscope + System Info section - 1/4 width */}
            <div className="w-1/4 bg-black text-white flex flex-col">
              {/* Enhanced Oscilloscope with zoom */}
              <div className="border-b-2 border-white">
                <div className="bg-white text-black p-2 text-xs font-bold">
                  OSCILLOSCOPE
                </div>
                <div className="p-2">
                  {renderOscilloscope()}
                </div>
              </div>

              {/* System Info */}
              <div className="flex-1 p-3 text-xs text-white space-y-1">
                <div className="text-white font-bold mb-3 border-b border-white/20 pb-2">SYSTEM INFO</div>
                <div>CPU: {Math.round(performanceRef.current.cpuUsage)}%</div>
                <div className={cn("font-bold", getPerformanceStatusColor())}>
                  FPS: {performanceRef.current.fps}
                </div>
                <div>QUALITY: {qualityLevel.toUpperCase()}</div>
                <div>SKIP: {performanceRef.current.skipFrames}</div>
                <div>STATUS: {error ? "ERROR" : isPlaying ? "STREAMING" : "IDLE"}</div>
                <div>MODE: {shuffleMode ? "SHUFFLE" : "SEQUENTIAL"}</div>
                <div>AUTO: {autoQualityEnabled ? "ON" : "OFF"}</div>
                <div className="pt-2 border-t border-white/20 mt-3">
                  <div>MEMORY: {Math.round(performanceRef.current.memoryUsage)}MB</div>
                  <div>AVG FPS: {Math.round(performanceRef.current.avgFps)}</div>
                  <div>WARNINGS: {performanceWarnings.length}</div>
                  <div>ZOOM: {zoomLevel}x | AMP: {amplitudeZoom}x</div>
                  {zoomLevel > 1 && <div>PAN: {Math.round(panOffset)}%</div>}
                </div>
              </div>
            </div>
          </div>

          {/* Status bar */}
          <div className="bg-white text-black p-2 text-xs flex justify-between items-center">
            <div className="flex gap-4">
              <span>TRACKS: {allTracks.length}</span>
              <span>QUALITY: {qualityLevel.toUpperCase()}</span>
              <span className={cn("font-bold", getPerformanceStatusColor().replace('text-', 'text-'))}>
                FPS: {performanceRef.current.fps}
              </span>
              <span className="font-bold">
                VU: L{Math.round(meterData.vuLeft)} R{Math.round(meterData.vuRight)}
              </span>
              <span className="font-bold">
                PPM: L{Math.round(meterData.ppmLeft)} R{Math.round(meterData.ppmRight)}
              </span>
              <span className={cn("font-bold", meterColors.getLoudnessColor(meterData.loudness).replace('text-', 'text-'))}>
                LUFS: {meterData.loudness.toFixed(1)}
              </span>
            </div>
            {isPlaying && currentTrack && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-black animate-pulse"></div>
                <span>PLAYING: {currentTrack.title}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
