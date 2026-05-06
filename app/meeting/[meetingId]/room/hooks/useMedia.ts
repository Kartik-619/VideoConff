'use client'

import { useRef, useState, useCallback } from "react"
import toast from "react-hot-toast"

interface UseMediaReturn {
  localStream: MediaStream | null
  localStreamRef: React.MutableRefObject<MediaStream | null>
  localVideoRef: React.MutableRefObject<HTMLVideoElement | null>
  localThumbRef: React.MutableRefObject<HTMLVideoElement | null>
  screenTrackRef: React.MutableRefObject<MediaStreamTrack | null>
  isMuted: boolean
  cameraOff: boolean
  screenSharing: boolean
  localStreamReady: React.MutableRefObject<boolean>
  streamFailed: React.MutableRefObject<boolean>
  requestMedia: () => Promise<boolean>
  toggleMute: () => void
  toggleCamera: () => void
  toggleScreenShare: () => Promise<MediaStreamTrack | null>
  cleanup: () => void
}

export function useMedia(): UseMediaReturn {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)

  const localStreamRef = useRef<MediaStream | null>(null)
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const localThumbRef = useRef<HTMLVideoElement | null>(null)
  const screenTrackRef = useRef<MediaStreamTrack | null>(null)
  const localStreamReady = useRef(false)
  const streamFailed = useRef(false)

  const requestMedia = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      })

      localStreamRef.current = stream
      setLocalStream(stream)
      localStreamReady.current = true

      if (localVideoRef.current) localVideoRef.current.srcObject = stream
      if (localThumbRef.current) localThumbRef.current.srcObject = stream

      return true
    } catch (err) {
      streamFailed.current = true

      const isNotAllowed = (err as DOMException)?.name === 'NotAllowedError'
      if (isNotAllowed) {
        toast.error("Camera/mic permission denied. Please allow access in your browser settings and rejoin.")
      } else {
        toast.error("Failed to access camera/microphone")
      }
      return false
    }
  }, [])

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setIsMuted(!track.enabled)
  }, [])

  const toggleCamera = useCallback(() => {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setCameraOff(!track.enabled)
  }, [])

  const toggleScreenShare = useCallback(async () => {
    if (screenSharing) {
      screenTrackRef.current?.stop()
      setScreenSharing(false)
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0]
      return cameraTrack || null
    }

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      } as DisplayMediaStreamOptions)
      const track = displayStream.getVideoTracks()[0]
      screenTrackRef.current = track
      setScreenSharing(true)

      track.onended = () => {
        screenTrackRef.current = null
        setScreenSharing(false)
      }

      return track
    } catch (err) {
      console.error("Screen share error:", err)
      return null
    }
  }, [screenSharing])

  const cleanup = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      setLocalStream(null)
      localStreamRef.current = null
    }
    localStreamReady.current = false
    streamFailed.current = false
    if (screenTrackRef.current) {
      screenTrackRef.current.stop()
      screenTrackRef.current = null
    }
    setScreenSharing(false)
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (localThumbRef.current) localThumbRef.current.srcObject = null
  }, [])

  return {
    localStream,
    localStreamRef,
    localVideoRef,
    localThumbRef,
    screenTrackRef,
    isMuted,
    cameraOff,
    screenSharing,
    localStreamReady: localStreamReady,
    streamFailed: streamFailed,
    requestMedia,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
    cleanup
  }
}
