'use client'

import { useRef, useState, useCallback } from "react"

export function useMedia() {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const localStreamReady = useRef(false)
  const streamFailed = useRef(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [isMuted, setIsMuted] = useState(false)

  const requestMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })
      setLocalStream(stream)
      localStreamRef.current = stream
      localStreamReady.current = true
      streamFailed.current = false
      return true
    } catch (error) {
      console.error("Error accessing media devices:", error)
      streamFailed.current = true
      return false
    }
  }, [])

  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
    }
    setLocalStream(null)
    localStreamRef.current = null
    localStreamReady.current = false
  }, [])

  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setCameraOff(!videoTrack.enabled)
      }
    }
  }, [])

  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMuted(!audioTrack.enabled)
      }
    }
  }, [])

  return {
    localStream,
    localStreamRef,
    localStreamReady,
    streamFailed,
    cameraOff,
    isMuted,
    requestMedia,
    cleanup,
    toggleVideo,
    toggleAudio,
    setCameraOff,
    setIsMuted
  }
}
