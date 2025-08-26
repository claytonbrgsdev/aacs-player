"use client"

import { useState, useMemo } from "react"
import { ChevronRight, Folder, FileAudio, Play, Pause, ImageIcon, Info } from 'lucide-react'
import Image from "next/image"
import { cn } from "@/lib/utils"
import { useAudio } from "./lib/audio-context"
import type { Release, Track } from "./lib/audio-context"

interface FileNode {
  id: string
  name: string
  type: 'directory' | 'track' | 'image' | 'info'
  children?: FileNode[]
  data: Release | Track | { content: string } | { src: string }
}

export default function TerminalFileBrowser() {
  const { releases, allTracks, play, pause, isPlaying, currentTrack } = useAudio()
  
  const fileSystem = useMemo<FileNode>(() => {
    return {
      id: 'root',
      name: "DSRPTV_ARCHIVE",
      type: "directory",
      data: { content: "Root directory of the Disruptive Records archive." },
      children: releases.map(release => ({
        id: release.id,
        name: release.title,
        type: 'directory',
        data: release,
        children: [
          ...release.tracks.map(track => ({
            id: track.id.toString(),
            name: `${track.title}.MP3`,
            type: 'track' as const,
            data: track,
          })),
          {
            id: `${release.id}_cover`,
            name: 'COVER.PNG',
            type: 'image' as const,
            data: { src: release.cover }
          },
          {
            id: `${release.id}_info`,
            name: 'INFO.TXT',
            type: 'info' as const,
            data: { content: `Artist: ${release.artist}\nYear: ${release.year}\nGenre: ${release.genre}` }
          }
        ]
      }))
    }
  }, [releases])

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() => new Set(releases.map(r => r.id).concat(['root'])))
  const [selectedNode, setSelectedNode] = useState<FileNode | null>(null)
  const [terminalOutput, setTerminalOutput] = useState<string[]>([
    "> DSRPTV FILE SYSTEM INITIALIZED",
    "> SCANNING ARCHIVES...",
    `> FOUND ${releases.length} RELEASES, ${allTracks.length} AUDIO FILES`,
    "> READY.",
  ])

  const toggleDirectory = (path: string) => {
    const newExpanded = new Set(expandedDirs)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedDirs(newExpanded)
  }

  const handleNodeClick = (node: FileNode) => {
    setSelectedNode(node)
    if (node.type === 'directory') {
      toggleDirectory(node.id)
    } else if (node.type === 'track') {
      const trackData = node.data as Track
      if (currentTrack?.id === trackData.id && isPlaying) {
        pause()
        setTerminalOutput(prev => [...prev, `> PAUSED: ${node.name}`])
      } else {
        play(trackData)
        setTerminalOutput(prev => [...prev, `> PLAYING: ${node.name}`])
      }
    }
  }

  const renderFileTree = (node: FileNode, depth = 0) => {
    const isExpanded = expandedDirs.has(node.id)

    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center py-1 px-2 text-xs cursor-pointer hover:bg-white/10 transition-colors",
            selectedNode?.id === node.id && "bg-white text-black",
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => handleNodeClick(node)}
        >
          {node.type === 'directory' ? (
            <>
              <ChevronRight className={cn("w-3 h-3 mr-1 transition-transform", isExpanded && "rotate-90")} />
              <Folder className="w-3 h-3 mr-2" />
              <span className="font-bold">{node.name}</span>
            </>
          ) : (
            <>
              <div className="w-4 mr-1"></div>
              {node.type === 'track' && <FileAudio className="w-3 h-3 mr-2" />}
              {node.type === 'image' && <ImageIcon className="w-3 h-3 mr-2" />}
              {node.type === 'info' && <Info className="w-3 h-3 mr-2" />}
              <span className="flex-1">{node.name}</span>
              {node.type === 'track' && (
                <>
                  <span className="text-gray-400 mr-2">{(node.data as Track).size}</span>
                  <span className="text-gray-400 mr-2">{(node.data as Track).duration}</span>
                  {currentTrack?.id === (node.data as Track).id && isPlaying ? (
                    <Pause className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                </>
              )}
            </>
          )}
        </div>
        {node.type === 'directory' && isExpanded && node.children && (
          <div>{node.children.map((child) => renderFileTree(child, depth + 1))}</div>
        )}
      </div>
    )
  }

  const renderPreview = () => {
    if (!selectedNode) {
      return <div className="text-gray-500">SELECT A FILE TO PREVIEW</div>
    }

    switch (selectedNode.type) {
      case 'directory':
        const releaseData = selectedNode.data as Release
        return (
          <div>
            <h3 className="font-bold text-white mb-2">{releaseData.title}</h3>
            <div className="relative w-full h-48 mb-2">
              <Image src={releaseData.cover || '/placeholder.svg'} alt={releaseData.title} fill className="object-contain" />
            </div>
            <p>Artist: {releaseData.artist}</p>
            <p>Year: {releaseData.year}</p>
            <p>Tracks: {releaseData.tracks.length}</p>
          </div>
        )
      case 'track':
        const trackData = selectedNode.data as Track
        return (
          <div>
            <h3 className="font-bold text-white mb-2">{trackData.title}</h3>
            <p>Artist: {trackData.artist}</p>
            <p>Duration: {trackData.duration}</p>
            <p>Size: {trackData.size}</p>
            <p>Release: {(releases.find(r => r.id === trackData.releaseId))?.title}</p>
            <p>Status: {currentTrack?.id === trackData.id && isPlaying ? 'PLAYING' : 'IDLE'}</p>
          </div>
        )
      case 'image':
        const imageData = selectedNode.data as { src: string }
        return (
          <div>
            <h3 className="font-bold text-white mb-2">{selectedNode.name}</h3>
            <div className="relative w-full h-48">
              <Image src={imageData.src || "/placeholder.svg"} alt={selectedNode.name} fill className="object-contain" />
            </div>
          </div>
        )
      case 'info':
        const infoData = selectedNode.data as { content: string }
        return (
          <div>
            <h3 className="font-bold text-white mb-2">{selectedNode.name}</h3>
            <pre className="whitespace-pre-wrap">{infoData.content}</pre>
          </div>
        )
      default:
        return <div className="text-gray-500">NO PREVIEW AVAILABLE</div>
    }
  }

  return (
    <div className="w-full max-w-5xl h-[600px] mx-auto bg-black text-white font-mono border-2 border-white">
      <div className="bg-white text-black p-2 flex justify-between items-center text-xs border-b-2 border-white">
        <span className="font-bold">DSRPTV_FILE_EXPLORER_V3.0</span>
        <div className="flex gap-1">
          <div className="w-3 h-3 bg-black"></div>
          <div className="w-3 h-3 bg-black"></div>
          <div className="w-3 h-3 bg-black"></div>
        </div>
      </div>

      <div className="flex h-[calc(100%-2rem)]">
        {/* File tree */}
        <div className="w-1/2 border-r-2 border-white flex flex-col">
          <div className="bg-white text-black p-2 text-xs font-bold border-b-2 border-white">FILE BROWSER</div>
          <div className="flex-1 overflow-auto scrollbar-thin">{renderFileTree(fileSystem)}</div>
        </div>

        {/* Right pane */}
        <div className="w-1/2 flex flex-col">
          {/* Preview */}
          <div className="h-2/3 border-b-2 border-white p-4 text-xs">
            <div className="bg-white text-black p-2 text-xs font-bold mb-4 -m-4 border-b-2 border-white">PREVIEW</div>
            {renderPreview()}
          </div>
          {/* Terminal output */}
          <div className="h-1/3 flex flex-col">
            <div className="bg-white text-black p-2 text-xs font-bold border-b-2 border-white">SYSTEM LOG</div>
            <div className="flex-1 p-2 text-xs space-y-1 overflow-auto scrollbar-thin">
              {terminalOutput.slice(-10).map((line, index) => (
                <div key={index} className="text-green-400">
                  {line}
                </div>
              ))}
              <div className="flex items-center text-green-400">
                <span>{">"}</span>
                <div className="w-2 h-3 bg-green-400 ml-1 animate-pulse"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
