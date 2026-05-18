'use client'

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { useMedia } from "./hooks/useMedia"
import { useMediasoup } from "./hooks/useMediasoup"
import { useWebSocket } from "./hooks/useWebSocket"
import { LayoutCall } from "@/app/components/CallRoom/components/callLayout"
import { MessageSquare } from "lucide-react"
import { FaMicrophone, FaMicrophoneSlash, FaVideo, FaVideoSlash, FaDesktop, FaPhoneSlash } from "react-icons/fa"
import type { ChatMessage, PeerJoinData } from "./types"

const MAX_MESSAGES = 100

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
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [screenSharing, setScreenSharing] = useState(false)

  const meetingEndedRef = useRef(false)
  const isCleaningUpRef = useRef(false)
  const socketIdRef = useRef<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const screenTrackRef = useRef<MediaStreamTrack | null>(null)

  const media = useMedia()

  const mediasoup = useMediasoup({
    wsRef,
    onAppendRemoteStream: (peerId: string, stream: MediaStream) => {
      setRemoteStreams(prev => {
        const updated = new Map(prev)
        updated.set(peerId, stream)
        return updated
      })
    },
    onRemoveRemoteStream: (peerId: string) => {
      setRemoteStreams(prev => {
        const updated = new Map(prev)
        updated.delete(peerId)
        return updated
      })
    }
  })

  const ws = useWebSocket({
    meetingId,
    localStreamReady: media.localStreamReady,
    streamFailed: media.streamFailed,
    socketIdRef,
    wsRef,
    onJoined: (data) => {
      socketIdRef.current = data.peerId
      setHostId(data.hostId)
    },
    onExistingPeers: (peers: PeerJoinData[]) => {
      setRemoteParticipants(prev => {
        const updated = new Map(prev)
        for (const peer of peers) {
          updated.set(peer.peerId, {
            name: peer.name || `User ${peer.peerId.slice(0, 6)}`,
            userId: peer.userId
          })
        }
        return updated
      })
    },
    onPeerJoined: (peerId, name, userId) => {
      setRemoteParticipants(prev => {
        const updated = new Map(prev)
        updated.set(peerId, { name: name || `User ${peerId.slice(0, 6)}`, userId })
        return updated
      })
    },
    onPeerLeft: (peerId) => {
      setRemoteParticipants(prev => {
        const updated = new Map(prev)
        updated.delete(peerId)
        return updated
      })
      setRemoteStreams(prev => {
        const updated = new Map(prev)
        updated.delete(peerId)
        return updated
      })
    },
    onRtpCapabilities: async (rtpCapabilities) => {
      await mediasoup.createDevice(rtpCapabilities)
      ws.sendMessage("createTransport", { direction: "send" })
      ws.sendMessage("createTransport", { direction: "recv" })
    },
    onTransportCreated: async (data) => {
      await mediasoup.handleTransportCreated(data)
      if (data.direction === "send" && media.localStreamReady.current) {
        const tracks = media.localStreamRef.current?.getTracks() || []
        for (const track of tracks) {
          await mediasoup.produce(track)
        }
      }
    },
    onProduced: async (data) => {
      console.log("Track produced:", data.producerId)
    },
    onConsumerCreated: async (data) => {
      await mediasoup.handleConsumerCreated(data)
    },
    onProducer: async (data) => {
      await mediasoup.consume(data.producerId, data.senderPeerId)
    },
    onProducerClosed: () => {},
    onConsumerClosed: () => {},
    onStreamUnavailable: (senderPeerId: string) => {
      setRemoteStreams(prev => {
        const updated = new Map(prev)
        updated.delete(senderPeerId)
        return updated
      })
    },
    onChatMessage: (data) => {
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
    },
    onMeetingEnded: () => {
      cleanupAndExit()
    },
    onLobbyUpdate: () => {},
    onConnectionStatusChange: (status: string) => {
      setConnectionStatus(status)
    },
    onParticipantCountChange: (count: number) => {
      setParticipantCount(count)
    }
  })

  const cleanupAndExit = useCallback(() => {
    if (isCleaningUpRef.current) return
    isCleaningUpRef.current = true
    meetingEndedRef.current = true
    media.cleanup()
    mediasoup.cleanup()
    ws.disconnect()
    setRemoteStreams(new Map())
    setRemoteParticipants(new Map())
    router.replace("/")
  }, [media, mediasoup, ws, router])

  useEffect(() => {
    const init = async () => {
      await ws.connect()
      const success = await media.requestMedia()
      if (!success) {
        console.error("Failed to get media")
      }
    }
    init()
    return () => {
      // cleanup handled by cleanupAndExit or implicit in hooks
    }
  }, [])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const sendMessage = (text: string) => {
    if (!text.trim()) return
    ws.sendMessage("chatMessage", { message: text })
  }

  const startScreenShare = async () => {
    if (screenSharing) {
      if (screenTrackRef.current) {
        screenTrackRef.current.stop()
        screenTrackRef.current = null
      }
      setScreenSharing(false)
      // Note: we might need a way to tell the server to stop this producer
      return
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const track = stream.getVideoTracks()[0]
      screenTrackRef.current = track
      setScreenSharing(true)
      
      await mediasoup.produce(track)
      
      track.onended = () => {
        setScreenSharing(false)
        screenTrackRef.current = null
      }
    } catch (error) {
      console.error("Screen share error:", error)
    }
  }

  const allStreams = useMemo(() => {
    const list = []
    if (media.localStream) {
      list.push({
        id: 'local',
        stream: media.localStream,
        isLocal: true,
        userName: session?.user?.name || 'You',
        userImage: session?.user?.image,
        isVideoOff: media.cameraOff
      })
    }
    remoteStreams.forEach((stream, peerId) => {
      const participant = remoteParticipants.get(peerId)
      list.push({
        id: peerId,
        stream,
        isLocal: false,
        userName: participant?.name || 'Remote User',
        userId: participant?.userId,
        isVideoOff: false
      })
    })
    return list
  }, [media.localStream, media.cameraOff, remoteStreams, remoteParticipants, session])

  return (
    <div className="w-full h-screen bg-black flex flex-col relative overflow-hidden">
      {/* HEADER INFO */}
      <div className="absolute top-4 right-4 z-10 text-white bg-black/60 px-3 py-1 rounded-full text-sm backdrop-blur-md border border-white/10">
        Participants: {participantCount}
      </div>

      <div className="absolute top-4 left-4 z-10 text-white bg-black/60 px-3 py-1 rounded-full text-sm backdrop-blur-md border border-white/10">
        {connectionStatus}
      </div>

      {/* VIDEO GRID */}
      <div className="flex-1 flex items-center justify-center p-4">
        <LayoutCall count={allStreams.length}>
          {allStreams.map((item) => (
            <div key={item.id} className="relative w-full h-full rounded-2xl overflow-hidden bg-gray-900 border border-white/5 shadow-2xl">
              <VideoTile stream={item.stream} isLocal={item.isLocal} userName={item.userName} isVideoOff={item.isVideoOff} />
            </div>
          ))}
        </LayoutCall>
      </div>

      {/* DEBUG TOGGLE */}
      <button
        onClick={() => setDebugOpen(!debugOpen)}
        className="fixed top-16 right-4 z-50 bg-yellow-600/80 text-white px-3 py-1 rounded-md text-xs font-bold hover:bg-yellow-500 backdrop-blur-md transition-all"
      >
        {debugOpen ? 'HIDE DEBUG' : 'DEBUG'}
      </button>

      {/* DEBUG PANEL */}
      {debugOpen && (
        <div className="fixed top-16 left-4 z-50 bg-gray-900/95 border border-yellow-500/50 text-green-400 p-4 rounded-xl text-xs font-mono space-y-2 max-w-sm shadow-2xl backdrop-blur-lg">
          <div className="text-yellow-400 font-bold text-sm mb-2 border-b border-yellow-500/30 pb-1 flex justify-between">
            <span>CONNECTION STATUS</span>
            <span className="text-[10px] bg-yellow-900/50 px-1 rounded">PRO</span>
          </div>
          <div>WS Status: <span className={connectionStatus === 'Connected' ? 'text-green-400' : 'text-red-400'}>{connectionStatus}</span></div>
          <div>My Peer ID: <span className="text-white">{socketIdRef.current || 'not set'}</span></div>
          <div>Local Stream: <span className={media.localStream ? 'text-green-400' : 'text-red-400'}>{media.localStream ? 'ready' : 'not ready'}</span></div>
          <div>Camera: <span className={media.cameraOff ? 'text-red-400' : 'text-green-400'}>{media.cameraOff ? 'OFF' : 'ON'}</span></div>
          <div className="border-t border-yellow-500/30 pt-2 mt-1">
            Remote Participants: <span className="text-white">{remoteParticipants.size}</span>
          </div>
          <div className="max-h-32 overflow-y-auto custom-scrollbar">
            {Array.from(remoteParticipants.entries()).map(([id, p]) => (
              <div key={id} className="ml-2 text-cyan-400 flex justify-between">
                <span>- {p.name}</span>
                <span className="text-[10px] text-gray-500">{id.slice(0,6)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-yellow-500/30 pt-2 mt-1">
            Remote Streams: <span className="text-white">{remoteStreams.size}</span>
          </div>
          <div className="max-h-32 overflow-y-auto custom-scrollbar">
            {Array.from(remoteStreams.keys()).map(id => (
              <div key={id} className="ml-2 text-green-400">- stream from {id.slice(0,8)}...</div>
            ))}
          </div>
        </div>
      )}

      {/* CHAT PANEL */}
      {chatOpen && (
        <div className="absolute right-4 top-16 bottom-24 w-80 bg-gray-900/95 text-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-white/10 backdrop-blur-xl z-40">
          <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <MessageSquare size={16} className="text-blue-400" />
              Chat
            </h3>
            <button onClick={() => setChatOpen(false)} className="text-gray-400 hover:text-white transition-colors">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {messages.map((msg, i) => {
              const isMe = msg.userId === session?.user?.id;
              return (
                <div key={i} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                  {!isMe && <span className="text-[10px] text-gray-400 ml-2 mb-1">{msg.name}</span>}
                  <div className={`px-4 py-2 rounded-2xl max-w-[85%] text-sm shadow-lg ${
                    isMe ? "bg-blue-600 text-white rounded-tr-none" : "bg-gray-800 text-gray-100 rounded-tl-none border border-white/5"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 border-t border-white/10 bg-white/5">
            <div className="flex gap-2">
              <input
                ref={chatInputRef}
                type="text"
                placeholder="Message everyone..."
                className="flex-1 px-4 py-2 rounded-xl bg-gray-800 border border-white/5 text-white outline-none text-sm focus:border-blue-500/50 transition-all"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    sendMessage(e.currentTarget.value);
                    e.currentTarget.value = "";
                  }
                }}
              />
              <button
                onClick={() => {
                  if (chatInputRef.current) {
                    sendMessage(chatInputRef.current.value);
                    chatInputRef.current.value = "";
                  }
                }}
                className="bg-blue-600 hover:bg-blue-500 p-2 rounded-xl transition-colors shadow-lg shadow-blue-900/20"
              >
                <MessageSquare size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTROL BAR */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-gray-900/80 px-8 py-4 rounded-3xl backdrop-blur-2xl border border-white/10 shadow-2xl z-50">
        <button
          onClick={() => media.toggleAudio()}
          className={`p-4 rounded-2xl transition-all ${
            media.isMuted ? "bg-red-500/20 text-red-500 border border-red-500/50" : "bg-gray-800 text-white hover:bg-gray-700"
          }`}
        >
          {media.isMuted ? <FaMicrophoneSlash size={20} /> : <FaMicrophone size={20} />}
        </button>

        <button
          onClick={() => media.toggleVideo()}
          className={`p-4 rounded-2xl transition-all ${
            media.cameraOff ? "bg-red-500/20 text-red-500 border border-red-500/50" : "bg-gray-800 text-white hover:bg-gray-700"
          }`}
        >
          {media.cameraOff ? <FaVideoSlash size={20} /> : <FaVideo size={20} />}
        </button>

        <button
          onClick={() => setChatOpen(prev => !prev)}
          className={`p-4 rounded-2xl transition-all ${
            chatOpen ? "bg-blue-600 text-white" : "bg-gray-800 text-white hover:bg-gray-700"
          }`}
        >
          <MessageSquare size={20} />
        </button>

        <button
          onClick={startScreenShare}
          className={`p-4 rounded-2xl transition-all ${
            screenSharing ? "bg-green-600 text-white" : "bg-gray-800 text-white hover:bg-gray-700"
          }`}
        >
          <FaDesktop size={20} />
        </button>

        <div className="w-px h-8 bg-white/10 mx-2" />

        <button
          onClick={async () => {
            if (session?.user?.id === hostId) {
              await fetch("/api/meeting/end", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ meetingId })
              });
            }
            cleanupAndExit();
          }}
          className="bg-red-600 hover:bg-red-500 p-4 rounded-2xl text-white transition-all shadow-lg shadow-red-900/40"
        >
          <FaPhoneSlash size={20} />
        </button>
      </div>
    </div>
  )
}

function VideoTile({ stream, isLocal, userName, isVideoOff }: { stream: MediaStream, isLocal: boolean, userName: string, isVideoOff: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className="w-full h-full relative group">
      {isVideoOff ? (
        <div className="w-full h-full flex items-center justify-center bg-gray-800">
          <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold text-white shadow-2xl">
            {userName.charAt(0).toUpperCase()}
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
        />
      )}
      <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/50 backdrop-blur-md rounded-lg text-white text-xs border border-white/10 opacity-0 group-hover:opacity-100 transition-opacity">
        {userName} {isLocal ? '(You)' : ''}
      </div>
    </div>
  )
}
