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
  const [debugOpen, setDebugOpen] = useState(false)
  const [remotePeerCount, setRemotePeerCount] = useState(0)
  const [peerConnectionStates, setPeerConnectionStates] = useState<Map<string, string>>(new Map())
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
    setRemotePeerCount(remoteStreams.size)
    const states = new Map<string, string>()
    webrtc.peerConnectionsRef.current.forEach((pc, id) => {
      states.set(id, pc.connectionState)
    })
    setPeerConnectionStates(states)

    const interval = setInterval(() => {
      const fresh = new Map<string, string>()
      webrtc.peerConnectionsRef.current.forEach((pc, id) => {
        fresh.set(id, pc.connectionState)
      })
      setPeerConnectionStates(fresh)
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
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80">
          <div className="bg-gray-900 border-2 border-red-500 rounded-2xl p-8 max-w-md text-center">
            <div className="text-red-400 text-xl font-bold mb-4">Camera/Microphone Access Denied</div>
            <p className="text-gray-300 mb-4 text-sm">
              Your browser is blocking camera access. This is why you can't see others - WebRTC cannot start without camera permission.
            </p>
            <div className="text-left bg-gray-800 rounded-lg p-4 mb-4 text-xs text-gray-300 space-y-2">
              <p><strong className="text-white">Fix in Chrome:</strong></p>
              <p>1. Click the 🔒 <strong className="text-white">lock icon</strong> in the address bar (left of the URL)</p>
              <p>2. Click <strong className="text-white">Site settings</strong></p>
              <p>3. Set Camera and Microphone to <strong className="text-green-400">Allow</strong></p>
              <p>4. <strong className="text-white">Refresh this page</strong></p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="bg-red-600 hover:bg-red-500 text-white px-6 py-2 rounded-lg font-semibold"
            >
              Retry
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

      <button
        onClick={() => setDebugOpen(!debugOpen)}
        className="fixed top-16 right-4 z-50 bg-yellow-600 text-white px-3 py-1 rounded-md text-xs font-bold hover:bg-yellow-500"
      >
        {debugOpen ? 'HIDE DEBUG' : 'DEBUG'}
      </button>

      {debugOpen && (
        <div className="fixed top-16 left-4 z-50 bg-gray-900/95 border border-yellow-500 text-green-400 p-4 rounded-lg text-xs font-mono space-y-1 max-w-sm shadow-2xl">
          <div className="text-yellow-400 font-bold text-sm mb-2 border-b border-yellow-500/50 pb-1">CONNECTION STATUS</div>
          <div>WS Status: <span className={connectionStatus === 'Connected' ? 'text-green-400' : 'text-red-400'}>{connectionStatus}</span></div>
          <div>My Peer ID: <span className="text-white">{socketIdRef.current || 'not set'}</span></div>
          <div>Local Stream: <span className={media.localStream ? 'text-green-400' : 'text-red-400'}>{media.localStream ? 'ready' : 'not ready'}</span></div>
          <div>Local Video Ready: <span className={media.localStreamReady.current ? 'text-green-400' : 'text-red-400'}>{media.localStreamReady.current ? 'yes' : 'no'}</span></div>
          <div>Camera: <span className={media.cameraOff ? 'text-red-400' : 'text-green-400'}>{media.cameraOff ? 'OFF' : 'ON'}</span></div>
          <div className="border-t border-yellow-500/50 pt-1 mt-1">
            Remote Participants: <span className="text-white">{remoteParticipants.size}</span>
          </div>
          <div>
            {Array.from(remoteParticipants.entries()).map(([id, p]) => (
              <div key={id} className="ml-2 text-cyan-400">- {p.name} ({id.slice(0,8)}...)</div>
            ))}
          </div>
          <div className="border-t border-yellow-500/50 pt-1 mt-1">
            Remote Streams: <span className="text-white">{remoteStreams.size}</span>
          </div>
          <div>
            {Array.from(remoteStreams.keys()).map(id => (
              <div key={id} className="ml-2 text-green-400">- stream from {id.slice(0,8)}...</div>
            ))}
          </div>
          <div className="border-t border-yellow-500/50 pt-1 mt-1">
            Peer Connections: <span className="text-white">{webrtc.peerConnectionsRef.current.size}</span>
          </div>
          <div>
            {Array.from(peerConnectionStates.entries()).map(([id, state]) => (
              <div key={id} className={`ml-2 ${state === 'connected' ? 'text-green-400' : state === 'connecting' ? 'text-yellow-400' : 'text-red-400'}`}>
                - {id.slice(0,8)}...: {state}
              </div>
            ))}
          </div>
          {remoteStreams.size === 0 && remoteParticipants.size > 0 && (
            <div className="border-t border-yellow-500/50 pt-1 mt-1 text-red-400">
              Participants connected but no streams received. Check WebRTC signaling.
            </div>
          )}
        </div>
      )}

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
