/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import { useEffect, useRef, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useMedia } from "./hooks/useMedia"
import { useWebRTC } from "./hooks/useWebRTC"
import { useWebSocket } from "./hooks/useWebSocket"
import { MeetingHeader } from "./components/MeetingHeader"
import { VideoGrid } from "./components/VideoGrid"
import { ChatPanel } from "./components/ChatPanel"
import { MeetingControlBar } from "./components/ControlBar"
import type { ChatMessage, PeerJoinData } from "./types"

const MAX_MESSAGES = 500

export default function MeetingRoom() {
  const params = useParams()
  const meetingId = params.meetingId as string
  const router = useRouter()
  const { data: session } = useSession()

  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, { name: string; userId: string }>>(new Map())
  const [hostId, setHostId] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState("Connecting...")
  const [participantCount, setParticipantCount] = useState(0)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const meetingEndedRef = useRef(false)
  const isCleaningUpRef = useRef(false)
  const socketIdRef = useRef<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const chatInputRef = useRef<HTMLInputElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const media = useMedia()
  const webrtc = useWebRTC({
    localStreamRef: media.localStreamRef,
    localStreamReady: media.localStreamReady,
    streamFailed: media.streamFailed,
    isCleaningUp: isCleaningUpRef,
    wsRef,
    socketIdRef,
    onAppendRemoteStream: useCallback((peerId: string, stream: MediaStream) => {
      setRemoteStreams(prev => {
        if (prev.has(peerId)) return prev
        const updated = new Map(prev)
        updated.set(peerId, stream)
        return updated
      })
    }, []),
    onClosePeerConnection: useCallback((peerId: string) => {
      setRemoteStreams(prev => {
        const updated = new Map(prev)
        updated.delete(peerId)
        return updated
      })
    }, [])
  })

  const ws = useWebSocket({
    meetingId,
    localStreamReady: media.localStreamReady,
    streamFailed: media.streamFailed,
    socketIdRef,
    wsRef,
    onJoined: useCallback((data: { peerId: string; hostId: string | null }) => {
      socketIdRef.current = data.peerId
      setHostId(data.hostId)
      setRemoteStreams(new Map())
      setRemoteParticipants(new Map())
      webrtc.resetAll()
    }, []),
    onExistingPeers: useCallback(async (peers: PeerJoinData[]) => {
      for (const peer of peers) {
        setRemoteParticipants(prev => {
          const updated = new Map(prev)
          updated.set(peer.peerId, {
            name: peer.name || `User ${(peer.peerId || "").slice(0, 6)}`,
            userId: peer.userId
          })
          return updated
        })

        if (media.streamFailed.current) {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: "stream-unavailable",
              senderPeerId: socketIdRef.current,
              targetPeerId: peer.peerId,
            }))
          }
        } else if (media.localStreamReady.current) {
          await webrtc.setupPeerConnection(peer.peerId)
        } else {
          webrtc.enqueuePendingPeer(peer)
        }
      }
    }, []),
    onPeerJoined: useCallback(async (peerId: string, name: string, userId: string) => {
      setRemoteParticipants(prev => {
        const updated = new Map(prev)
        updated.set(peerId, { name: name || `User ${peerId.slice(0, 6)}`, userId })
        return updated
      })

      if (media.streamFailed.current) {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "stream-unavailable",
            senderPeerId: socketIdRef.current,
            targetPeerId: peerId,
          }))
        }
      } else if (media.localStreamReady.current) {
        await webrtc.setupPeerConnection(peerId)
      } else {
        webrtc.enqueuePendingPeer({ peerId, name, userId })
      }
    }, []),
    onPeerLeft: useCallback((peerId: string) => {
      webrtc.closePeerConnection(peerId)
      setRemoteParticipants(prev => {
        const updated = new Map(prev)
        updated.delete(peerId)
        return updated
      })
    }, []),
    onOffer: useCallback(async (data) => {
      await webrtc.handleOffer(data)
    }, []),
    onAnswer: useCallback(async (data) => {
      await webrtc.handleAnswer(data)
    }, []),
    onIceCandidate: useCallback(async (data) => {
      await webrtc.handleIceCandidate(data)
    }, []),
    onStreamUnavailable: useCallback((senderPeerId: string) => {
      webrtc.closePeerConnection(senderPeerId)
    }, []),
    onChatMessage: useCallback((data) => {
      setMessages(prev => {
        const next = [...prev, {
          text: data.message,
          name: data.name,
          userId: data.userId,
          timestamp: data.timestamp,
        }]
        if (next.length > MAX_MESSAGES) {
          return next.slice(next.length - MAX_MESSAGES)
        }
        return next
      })
    }, []),
    onMeetingEnded: useCallback(() => {
      if (meetingEndedRef.current || isCleaningUpRef.current) return
      isCleaningUpRef.current = true
      meetingEndedRef.current = true
      wsRef.current?.close()
      wsRef.current = null
      setRemoteStreams(new Map())
      setRemoteParticipants(new Map())
      router.replace("/")
    }, []),
    onLobbyUpdate: useCallback(() => {}, []),
    onConnectionStatusChange: useCallback((status: string) => {
      setConnectionStatus(status)
    }, []),
    onParticipantCountChange: useCallback((count: number) => {
      setParticipantCount(count)
    }, [])
  })

  const connectAndRequestMedia = useCallback(async () => {
    await ws.connect()

    const success = await media.requestMedia()
    if (success) {
      await webrtc.processPendingOffers()
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "getParticipants" }))
      }
    } else {
      webrtc.rejectPendingOffers(wsRef.current, socketIdRef.current)
    }
  }, [])

  const cleanupAndExit = useCallback(() => {
    if (meetingEndedRef.current || isCleaningUpRef.current) return
    isCleaningUpRef.current = true
    meetingEndedRef.current = true
    media.cleanup()
    webrtc.cleanupAll()
    ws.disconnect()
    setRemoteStreams(new Map())
    setRemoteParticipants(new Map())
    router.replace("/")
  }, [])

  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => {
        chatInputRef.current?.focus()
      }, 100)
    }
  }, [chatOpen])

  useEffect(() => {
    return () => {
      wsRef.current?.close()
    }
  }, [])

  const joinInitRef = useRef(false)

  useEffect(() => {
    if (!meetingId || !session?.user?.id) return
    if (joinInitRef.current) return
    joinInitRef.current = true

    connectAndRequestMedia()

    return () => {
      isCleaningUpRef.current = true
      ws.disconnect()
    }
  }, [meetingId, session?.user?.id])

  const handleSendMessage = useCallback((msg: string) => {
    ws.sendMessage("chatMessage", { message: msg })
  }, [])

  const handleToggleScreenShare = useCallback(async () => {
    const result = await media.toggleScreenShare()

    if (media.screenSharing) {
      const cameraTrack = media.localStreamRef.current?.getVideoTracks()[0]
      webrtc.peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          sender.replaceTrack(cameraTrack || null)
        } else if (cameraTrack) {
          pc.addTrack(cameraTrack, media.localStreamRef.current!)
        }
      })
    } else if (result) {
      webrtc.peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          sender.replaceTrack(result)
        } else {
          pc.addTrack(result, media.localStreamRef.current!)
        }
      })
    }
  }, [media.screenSharing])

  return (
    <div className="w-full h-screen bg-black flex flex-col">
      <MeetingHeader participantCount={participantCount} connectionStatus={connectionStatus} />

      <VideoGrid
        localStream={media.localStream}
        remoteStreams={remoteStreams}
        remoteParticipants={remoteParticipants}
        socketId={socketIdRef.current}
        cameraOff={media.cameraOff}
      />

      {chatOpen && (
        <ChatPanel
          messages={messages}
          chatEndRef={chatEndRef}
          chatInputRef={chatInputRef}
          onSendMessage={handleSendMessage}
          onClose={() => setChatOpen(false)}
        />
      )}

      <MeetingControlBar
        isMuted={media.isMuted}
        cameraOff={media.cameraOff}
        chatOpen={chatOpen}
        screenSharing={media.screenSharing}
        isHost={session?.user?.id === hostId}
        meetingId={meetingId}
        onToggleMute={media.toggleMute}
        onToggleCamera={media.toggleCamera}
        onToggleChat={() => setChatOpen(prev => !prev)}
        onToggleScreenShare={handleToggleScreenShare}
        onLeave={cleanupAndExit}
      />
    </div>
  )
}
