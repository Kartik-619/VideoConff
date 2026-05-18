'use client'

import { useMemo } from "react"
import { useSession } from "next-auth/react"
import { LayoutCall } from "../../../../components/CallRoom/components/callLayout"
import VideoTile from '../../../../components/CallRoom/components/VideoTile'

interface Props {
  localStream: MediaStream | null
  remoteStreams: Map<string, MediaStream>
  remoteParticipants: Map<string, { name: string; userId: string }>
  socketId: string | null
  cameraOff: boolean
}

interface ParticipantItem {
  id: string
  stream: MediaStream | null
  isLocal: boolean
  userName: string
  userImage: string | undefined
  hasStream: boolean
  isVideoOff: boolean
}

export function VideoGrid({ localStream, remoteStreams, remoteParticipants, socketId, cameraOff }: Props) {
  const { data: session } = useSession()

  const participants: ParticipantItem[] = useMemo(() => {
    const result: ParticipantItem[] = []

    result.push({
      id: "local",
      stream: localStream,
      isLocal: true,
      userName: session?.user?.name || "You",
      userImage: session?.user?.image || undefined,
      hasStream: !!localStream,
      isVideoOff: cameraOff || !localStream
    })

    remoteParticipants.forEach((participant, peerId) => {
      if (peerId === socketId) return

      const stream = remoteStreams.get(peerId)
      if (stream) {
        const videoTracks = stream.getVideoTracks()
        const videoEnabled = videoTracks.length > 0 && videoTracks[0]!.enabled
        result.push({
          id: peerId,
          stream,
          isLocal: false,
          userName: participant.name || `User ${peerId.slice(0, 6)}`,
          userImage: undefined,
          hasStream: true,
          isVideoOff: !videoEnabled
        })
      } else {
        result.push({
          id: peerId,
          stream: null,
          isLocal: false,
          userName: participant.name || `User ${peerId.slice(0, 6)}`,
          userImage: undefined,
          hasStream: false,
          isVideoOff: true
        })
      }
    })

    return result
  }, [localStream, remoteStreams, remoteParticipants, socketId, cameraOff, session?.user?.name, session?.user?.image])

  const totalCount = participants.length

  function renderTile(item: ParticipantItem) {
    if (!item.hasStream) {
      return (
        <div key={item.id} className="relative w-full h-full bg-gray-900 rounded-xl overflow-hidden flex items-center justify-center">
          <div className="text-center space-y-2 p-2">
            <div className={`w-16 h-16 md:w-20 md:h-20 mx-auto rounded-full flex items-center justify-center text-white text-xl md:text-2xl font-bold ${
              item.isLocal
                ? 'bg-gradient-to-br from-indigo-600 to-purple-600'
                : 'bg-gradient-to-br from-cyan-600 to-blue-600 animate-pulse'
            }`}>
              {item.userName.charAt(0).toUpperCase()}
            </div>
            <p className="text-white font-medium text-sm md:text-base truncate max-w-[120px] md:max-w-none mx-auto">{item.userName}</p>
            {!item.isLocal && (
              <p className="text-yellow-400 text-[10px] md:text-xs font-semibold animate-pulse">Connecting...</p>
            )}
            {item.isLocal && (
              <p className="text-red-400 text-[10px] md:text-xs font-semibold">Camera permission needed</p>
            )}
          </div>
          <div className="absolute bottom-2 left-2 md:bottom-3 md:left-3 bg-black/70 backdrop-blur-sm text-white px-2 py-1 md:px-3 md:py-1.5 rounded-lg text-[10px] md:text-sm font-medium">
            {item.userName}
          </div>
          {!item.isLocal && (
            <div className="absolute top-2 left-2 md:top-3 md:left-3 bg-yellow-500 text-black px-1.5 py-0.5 rounded-full text-[10px] md:text-xs font-semibold">
              Connecting
            </div>
          )}
        </div>
      )
    }

    return (
      <VideoTile
        key={item.id}
        stream={item.stream!}
        isVideoOff={item.isVideoOff}
        userName={item.userName}
        userImage={item.userImage}
        isLocal={item.isLocal}
      />
    )
  }

  return (
    <div className="flex-1 min-h-0">
      <LayoutCall count={totalCount}>
        {participants.map(renderTile)}
      </LayoutCall>
    </div>
  )
}
