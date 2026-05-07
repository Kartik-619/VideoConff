'use client'

import { useMemo, useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { LayoutCall } from "../../../../components/CallRoom/components/callLayout"
import VideoTile from '../../../../components/CallRoom/components/VideoTile'
import type { StreamInfo } from "../types"

interface Props {
  localStream: MediaStream | null
  remoteStreams: Map<string, MediaStream>
  remoteParticipants: Map<string, { name: string; userId: string }>
  socketId: string | null
  cameraOff: boolean
}

export function VideoGrid({ localStream, remoteStreams, remoteParticipants, socketId, cameraOff }: Props) {
  const { data: session } = useSession()
  const [videoStates, setVideoStates] = useState<Map<string, boolean>>(new Map())

  useEffect(() => {
    const newStates = new Map<string, boolean>()

    remoteStreams.forEach((stream, peerId) => {
      const tracks = stream.getVideoTracks()
      const enabled = tracks.length > 0 && tracks[0]!.enabled
      newStates.set(peerId, enabled)

      const updateState = () => {
        const t = stream.getVideoTracks()
        const en = t.length > 0 && t[0]!.enabled
        setVideoStates(prev => {
          const next = new Map(prev)
          next.set(peerId, en)
          return next
        })
      }

      tracks.forEach(track => {
        track.addEventListener('ended', updateState)
        track.addEventListener('mute', updateState)
        track.addEventListener('unmute', updateState)
      })
    })

    setVideoStates(prev => {
      const merged = new Map(prev)
      newStates.forEach((val, key) => merged.set(key, val))
      return merged
    })

    return () => {
      remoteStreams.forEach(stream => {
        stream.getTracks().forEach(track => {
          track.removeEventListener('ended', () => {})
          track.removeEventListener('mute', () => {})
          track.removeEventListener('unmute', () => {})
        })
      })
    }
  }, [remoteStreams])

  const allStreams = useMemo(() => {
    const result: StreamInfo[] = []

    if (localStream) {
      result.push({
        id: "local",
        stream: localStream,
        isLocal: true,
        userName: session?.user?.name || undefined,
        userImage: session?.user?.image || undefined,
        isVideoOff: cameraOff
      })
    }

    remoteStreams.forEach((stream, peerId) => {
      if (peerId === socketId) return
      const participant = remoteParticipants.get(peerId)
      const hasVideo = videoStates.get(peerId) ?? true
      result.push({
        id: peerId,
        stream,
        isLocal: false,
        userName: participant?.name || `User ${peerId.slice(0, 6)}`,
        userImage: undefined,
        isVideoOff: !hasVideo
      })
    })

    return result
  }, [localStream, remoteStreams, remoteParticipants, cameraOff, session?.user?.name, session?.user?.image, socketId, videoStates])

  return (
    <LayoutCall count={allStreams.length}>
      {allStreams.map(({ id, stream, isLocal, userName, userImage, isVideoOff }) => {
        return (
          <VideoTile
            key={id}
            stream={stream}
            muted={isLocal}
            isVideoOff={isVideoOff}
            userName={userName}
            userImage={userImage}
            isLocal={isLocal}
          />
        )
      })}
    </LayoutCall>
  )
}
