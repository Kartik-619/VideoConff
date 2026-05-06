'use client'

import { useMemo } from "react"
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
      const videoTracks = stream.getVideoTracks()
      const hasVideo = videoTracks.length > 0 && videoTracks[0]!.enabled
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
  }, [localStream, remoteStreams, remoteParticipants, cameraOff, session?.user?.name, session?.user?.image, socketId])

  return (
    <LayoutCall count={allStreams.length}>
      {allStreams.map(({ id, stream, isLocal, userName, userImage, isVideoOff }) => {
        const hasVideo = stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0]!.enabled
        return (
          <VideoTile
            key={id}
            stream={stream}
            muted={isLocal}
            isVideoOff={isVideoOff || !hasVideo}
            userName={userName}
            userImage={userImage}
            isLocal={isLocal}
          />
        )
      })}
    </LayoutCall>
  )
}
