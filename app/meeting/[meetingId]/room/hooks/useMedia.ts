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
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        toast.error("Your browser doesn't support camera/microphone")
        streamFailed.current = true
        return false
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 360, ideal: 720, max: 1080 },
          frameRate: { min: 15, ideal: 30, max: 60 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      localStreamRef.current = stream
      setLocalStream(stream)
      localStreamReady.current = true

      if (localVideoRef.current) localVideoRef.current.srcObject = stream
      if (localThumbRef.current) localThumbRef.current.srcObject = stream

      return true
    } catch (err) {
      streamFailed.current = true

      const error = err as DOMException
      if (error.name === 'NotAllowedError') {
        toast.error("Camera/mic permission DENIED. Click the lock icon in your browser's address bar and allow Camera & Microphone.", { duration: 10000 })
      } else if (error.name === 'NotFoundError') {
        toast.error("No camera or microphone found on this device.", { duration: 10000 })
      } else if (error.name === 'NotReadableError') {
        toast.error("Camera/mic is in use by another app. Close it and try again.", { duration: 10000 })
      } else {
        toast.error(`Failed to access camera/microphone: ${error.name}. Click the lock icon in the address bar and allow permissions.`, { duration: 10000 })
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
