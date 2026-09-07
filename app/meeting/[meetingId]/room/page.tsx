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
  const [remotePeerCount, setRemotePeerCount] = useState(0)
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
    setRemotePeerCount(remoteStreams.size)

    const interval = setInterval(() => {
      setRemotePeerCount(remoteStreams.size)
    }, 2000)

    return () => clearInterval(interval)
  }, [remoteStreams, remoteParticipants])

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
      <MeetingHeader participantCount={remotePeerCount + 1} connectionStatus={connectionStatus} />

      {media.streamFailed.current && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4">
          <div className="bg-gray-900 border-2 border-red-500 rounded-2xl p-6 md:p-8 max-w-md w-full text-center shadow-2xl">
            <div className="text-red-400 text-lg md:text-xl font-bold mb-4">Camera/Microphone Access Denied</div>
            <p className="text-gray-300 mb-6 text-xs md:text-sm leading-relaxed">
              Your browser is blocking camera access. This is why you can't see others - WebRTC cannot start without camera permission.
            </p>
            <div className="text-left bg-gray-800/50 rounded-xl p-4 mb-6 text-[11px] md:text-xs text-gray-300 space-y-3 border border-gray-700">
              <p><strong className="text-white">How to fix:</strong></p>
              <div className="space-y-2">
                <p>1. Click the 🔒 <strong className="text-white">lock icon</strong> in the address bar</p>
                <p>2. Set Camera and Microphone to <strong className="text-green-400">Allow</strong></p>
                <p>3. <strong className="text-white">Refresh this page</strong> to join the call</p>
              </div>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full md:w-auto bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-xl font-bold transition-all active:scale-95 shadow-lg shadow-red-900/20"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

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
