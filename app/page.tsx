"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { AudioProvider } from "../lib/audio-context"
import GlitchNoiseOverlay from "../glitch-noise-overlay"
import LoadingSkeleton from "../loading-skeleton"
import "./globals.css"

const MusicPlayer = dynamic(() => import("../music-player"), {
  loading: () => <LoadingSkeleton componentName="MUSIC PLAYER" />,
})
const ReleaseSpotlight = dynamic(() => import("../release-spotlight"), {
  loading: () => <LoadingSkeleton componentName="RELEASE SPOTLIGHT" />,
})
const TerminalFileBrowser = dynamic(() => import("../terminal-file-browser"), {
  loading: () => <LoadingSkeleton componentName="FILE BROWSER" />,
})
const CommandLineInterface = dynamic(() => import("../command-line-interface"), {
  loading: () => <LoadingSkeleton componentName="COMMAND LINE" />,
})
const AsciiSpectrumAnalyzer = dynamic(() => import("../ascii-spectrum-analyzer"), {
  loading: () => <LoadingSkeleton componentName="SPECTRUM ANALYZER" />,
})

export default function Page() {
  const [activeComponent, setActiveComponent] = useState("player")
  const [glitchActive, setGlitchActive] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)

  const components = {
    player: { name: "MUSIC PLAYER", component: <MusicPlayer /> },
    spotlight: { name: "RELEASE SPOTLIGHT", component: <ReleaseSpotlight /> },
    browser: { name: "FILE BROWSER", component: <TerminalFileBrowser /> },
    terminal: { name: "COMMAND LINE", component: <CommandLineInterface /> },
    spectrum: { name: "SPECTRUM ANALYZER", component: <AsciiSpectrumAnalyzer /> },
  }

  return (
    <AudioProvider>
      <GlitchNoiseOverlay intensity={20} isActive={glitchActive}>
        <main className="min-h-screen bg-black text-white font-mono p-4">
          {/* ASCII Art Header */}
          <div className="text-center mb-8 text-xs">
            <pre className="text-white">
              {`
 █████╗ ███████╗ █████╗ 
██╔══██╗██╔════╝██╔══██╗
███████║███████╗███████║
██╔══██║╚════██║██╔══██║
██║  ██║███████║██║  ██║
╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
                        
    A.S.A. - VERSION 1.0.0
  `}
            </pre>
          </div>

          {/* Navigation */}
          <div className="flex justify-center mb-8">
            <div className="bg-white text-black p-2 flex gap-1 border-2 border-white">
              {Object.entries(components).map(([key, { name }]) => (
                <div key={key} className="flex items-center">
                  <button
                    onClick={() => setActiveComponent(key)}
                    className={`px-3 py-1 text-xs font-bold transition-colors ${
                      activeComponent === key ? "bg-black text-white" : "bg-white text-black hover:bg-gray-200"
                    }`}
                  >
                    {name}
                  </button>
                  {key === 'terminal' && activeComponent === key && (
                    <button
                      onClick={() => setShowInstructions(true)}
                      className="ml-1 px-2 py-1 text-xs font-bold bg-gray-300 text-black hover:bg-gray-400 transition-colors"
                      title="Show command reference"
                    >
                      ?
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => setGlitchActive(!glitchActive)}
                className={`px-3 py-1 text-xs font-bold transition-colors ml-4 ${
                  glitchActive ? "bg-red-500 text-white" : "bg-white text-black hover:bg-gray-200"
                }`}
              >
                GLITCH: {glitchActive ? "ON" : "OFF"}
              </button>
            </div>
          </div>

          {/* Active Component */}
          <div className="flex justify-center">{components[activeComponent as keyof typeof components].component}</div>

          {/* Instructions Modal */}
          {showInstructions && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
              <div className="bg-black border-2 border-white max-w-2xl w-full max-h-[80vh] overflow-auto">
                <div className="bg-white text-black p-2 flex justify-between items-center text-xs border-b-2 border-white">
                  <span className="font-bold">A.S.A. COMMAND LINE REFERENCE</span>
                  <button
                    onClick={() => setShowInstructions(false)}
                    className="w-6 h-6 bg-black text-white flex items-center justify-center hover:bg-gray-800"
                  >
                    ×
                  </button>
                </div>
                <div className="p-4 text-xs text-green-400 space-y-2">
                  <div className="text-white font-bold mb-4">AVAILABLE COMMANDS:</div>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="text-white font-bold">PLAYBACK CONTROL:</div>
                      <div className="ml-4 space-y-1">
                        <div><span className="text-white">PLAY [TRACK]</span> - Play specified track number (1) or resume current</div>
                        <div><span className="text-white">STOP</span> - Stop playback and clear current track</div>
                        <div><span className="text-white">PAUSE</span> - Pause/resume current playback</div>
                        <div><span className="text-white">NEXT [RANDOM]</span> - Play next track or a random next track</div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-white font-bold">INFORMATION:</div>
                      <div className="ml-4 space-y-1">
                        <div><span className="text-white">LIST</span> - Show all available tracks</div>
                        <div><span className="text-white">STATUS</span> - Display system status and current track info</div>
                        <div><span className="text-white">HELP</span> - Show command help</div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-white font-bold">AUDIO CONTROL:</div>
                      <div className="ml-4 space-y-1">
                        <div><span className="text-white">VOL [0-100]</span> - Set volume level (0-100%)</div>
                        <div><span className="text-white">VOLUME</span> - Show current volume level</div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-white font-bold">SYSTEM:</div>
                      <div className="ml-4 space-y-1">
                        <div><span className="text-white">CLEAR</span> - Clear terminal screen</div>
                        <div><span className="text-white">EXIT</span> - Shutdown audio system</div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-6 pt-4 border-t border-white/20">
                    <div className="text-white font-bold mb-2">EXAMPLES:</div>
                    <div className="ml-4 space-y-1 text-gray-400">
                      <div>play 1 → Play first track</div>
                      <div>vol 80 → Set volume to 80%</div>
                      <div>list → Show all tracks</div>
                      <div>status → Show system info</div>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-white/20 text-gray-400">
                    <div>Use UP/DOWN arrow keys to navigate command history</div>
                    <div>Commands are case-insensitive</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* System Info Footer */}
          <div className="mt-8 text-center text-xs text-gray-500">
            <div className="border border-white/20 p-2 max-w-2xl mx-auto">
              SYSTEM STATUS: ONLINE | CPU: 23% | RAM: 156MB/512MB | UPTIME: 47:23:12
              <br />
              AUDIO ENGINE: DSRPTV_CORE_V2.1 | SAMPLE RATE: 44.1KHZ | BUFFER: 512 SAMPLES
            </div>
          </div>
        </main>
      </GlitchNoiseOverlay>
    </AudioProvider>
  )
}
