'use client'

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import toast from "react-hot-toast"
import { useSession } from "next-auth/react"
import { LayoutCall } from "../../../components/CallRoom/components/callLayout"
import VideoTile from '../../../components/CallRoom/components/VideoTile'
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaDesktop,
  FaPhoneSlash
} from "react-icons/fa"
import { MessageSquare } from "lucide-react"

interface StreamInfo {
  id: string
  stream: MediaStream
  isLocal: boolean
  userName?: string
  userImage?: string
  isVideoOff?: boolean
}

interface PeerInfo {
  name: string
  userId: string
}

export default function MeetingRoom() {
  const params = useParams()
  const meetingId = params.meetingId as string
  const router = useRouter()
  const { data: session } = useSession()

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localThumbRef = useRef<HTMLVideoElement>(null)
  const socketIdRef = useRef<string | null>(null)
  const screenTrackRef = useRef<MediaStreamTrack | null>(null)
  const chatInputRef = useRef<HTMLInputElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, PeerInfo>>(new Map())
  const [isMuted, setIsMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const meetingEndedRef = useRef(false)
  const [hostId, setHostId] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [screenSharing, setScreenSharing] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState("Connecting...")
  const [participants, setParticipants] = useState(0)
  const [messages, setMessages] = useState<any[]>([])
  const joinSentRef = useRef(false)
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const pendingOffersRef = useRef<any[]>([])
  const pendingPeersRef = useRef<Array<{peerId: string; name: string; userId: string}>>([])

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
      if (peerId === socketIdRef.current) return
      const participant = remoteParticipants.get(peerId)
      const hasVideo = stream.getVideoTracks().length > 0
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
  }, [localStream, remoteStreams, remoteParticipants, cameraOff, session?.user])

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

  useEffect(() => {
    if (chatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, chatOpen])

  function sendMessage(msg: string) {
    if (!wsRef.current) return
    wsRef.current.send(JSON.stringify({
      type: "chatMessage",
      message: msg,
    }))
  }

  async function createPeerConnection(peerId: string, isInitiator: boolean) {
    if (peerConnectionsRef.current.has(peerId)) {
      closePeerConnection(peerId)
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    })

    peerConnectionsRef.current.set(peerId, pc)

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received track from ${peerId}:`, event.track.kind)
      const [remoteStream] = event.streams
      if (remoteStream) {
        setRemoteStreams(prev => {
          const updated = new Map(prev)
          updated.set(peerId, remoteStream)
          return updated
        })
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: "ice-candidate",
          candidate: event.candidate,
          targetPeerId: peerId,
        }))
      }
    }

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state for ${peerId}:`, pc.connectionState)
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        console.log(`[WebRTC] Connection lost with ${peerId}`)
        closePeerConnection(peerId)
      }
    }

    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream)
      })
    }

    if (isInitiator) {
      try {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        if (wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: "offer",
            sdp: pc.localDescription,
            targetPeerId: peerId,
          }))
          console.log(`[WebRTC] Sent offer to ${peerId}`)
        }
      } catch (err) {
        console.error("Error creating offer:", err)
      }
    }

    return pc
  }

  function closePeerConnection(peerId: string) {
    const pc = peerConnectionsRef.current.get(peerId)
    if (pc) {
      pc.close()
      peerConnectionsRef.current.delete(peerId)
    }
    setRemoteStreams(prev => {
      const updated = new Map(prev)
      updated.delete(peerId)
      return updated
    })
  }

  async function startScreenShare() {
    try {
      if (screenSharing) {
        screenTrackRef.current?.stop()
        setScreenSharing(false)
        return
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const track = stream.getVideoTracks()[0]
      screenTrackRef.current = track
      setScreenSharing(true)

      peerConnectionsRef.current.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          sender.replaceTrack(track)
        }
      })

      track.onended = () => {
        screenTrackRef.current = null
        setScreenSharing(false)
        const cameraTrack = localStream?.getVideoTracks()[0]
        if (cameraTrack) {
          peerConnectionsRef.current.forEach((pc) => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video')
            if (sender) {
              sender.replaceTrack(cameraTrack)
            }
          })
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const connectingRef = useRef(false)

  async function connectWebSocket() {
    if (
      connectingRef.current ||
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return
    }
    connectingRef.current = true

    const res = await fetch("/api/ws-token")
    if (!res.ok) {
      console.error("Failed to get WS token")
      connectingRef.current = false
      return
    }

    const { token } = await res.json()
    const wsUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL?.replace('https', 'wss').replace('http', 'ws') || 'ws://localhost:8080'}?token=${token}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    joinSentRef.current = false

    ws.onopen = () => {
      if (joinSentRef.current) return
      joinSentRef.current = true
      ws.send(JSON.stringify({
        type: "join",
        roomId: meetingId
      }))
    }

    ws.onmessage = async (e) => {
      const data = JSON.parse(e.data)

      if (data.type === "lobbyUpdate") {
        setParticipants(data.participants.length)
      }

      if (data.type === "chatMessage") {
        setMessages(prev => [
          ...prev,
          {
            text: data.data.message,
            name: data.data.name,
            userId: data.data.userId,
            timestamp: data.data.timestamp,
          }
        ])
      }

      if (data.type === "meetingEnded") {
        if (meetingEndedRef.current) return
        toast.error("Meeting ended by host")
        cleanupAndExit()
        wsRef.current?.close()
      }

      if (data.type === "joined") {
        socketIdRef.current = data.peerId
        setHostId(data.hostId)
        setRemoteStreams(new Map())
        setRemoteParticipants(new Map())
        peerConnectionsRef.current.clear()
        pendingOffersRef.current = []
        pendingPeersRef.current = []
        reconnectAttempts.current = 0

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
          })
          setLocalStream(stream)
          if (localVideoRef.current) localVideoRef.current.srcObject = stream
          if (localThumbRef.current) localThumbRef.current.srcObject = stream

          const peersToConnect = [...pendingPeersRef.current]
          pendingPeersRef.current = []
          for (const peer of peersToConnect) {
            await createPeerConnection(peer.peerId, true)
          }

          while (pendingOffersRef.current.length > 0) {
            const pendingOffer = pendingOffersRef.current.shift()
            if (pendingOffer) {
              await handleOffer(pendingOffer)
            }
          }
        } catch (err) {
          console.error("Error getting user media:", err)
        }

        ws.send(JSON.stringify({ type: "getParticipants" }))
      }

      if (data.type === "existingPeers") {
        console.log("[existingPeers] Received existing peers:", data.peers)
        for (const peer of data.peers) {
          setRemoteParticipants(prev => {
            const updated = new Map(prev)
            updated.set(peer.peerId, {
              name: peer.name || `User ${peer.peerId.slice(0, 6)}`,
              userId: peer.userId
            })
            return updated
          })

          if (localStream) {
            await createPeerConnection(peer.peerId, true)
          } else {
            pendingPeersRef.current.push(peer)
          }
        }
      }

      if (data.type === "peerJoined") {
        console.log("[peerJoined] New peer joined:", data.peerId)
        setRemoteParticipants(prev => {
          const updated = new Map(prev)
          updated.set(data.peerId, {
            name: data.name || `User ${data.peerId.slice(0, 6)}`,
            userId: data.userId
          })
          return updated
        })
      }

      if (data.type === "peerLeft") {
        console.log("[peerLeft] Peer left:", data.peerId)
        closePeerConnection(data.peerId)
        setRemoteParticipants(prev => {
          const updated = new Map(prev)
          updated.delete(data.peerId)
          return updated
        })
      }

      if (data.type === "offer") {
        console.log("[offer] Received offer from:", data.senderPeerId)
        await handleOffer(data)
      }

      if (data.type === "answer") {
        console.log("[answer] Received answer from:", data.senderPeerId)
        const pc = peerConnectionsRef.current.get(data.senderPeerId)
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
            console.log(`[WebRTC] Set remote description from answer for ${data.senderPeerId}`)
          } catch (err) {
            console.error("Error handling answer:", err)
          }
        }
      }

      if (data.type === "ice-candidate") {
        const pc = peerConnectionsRef.current.get(data.senderPeerId)
        if (pc && data.candidate) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
          } catch (err) {
            console.error("Error adding ICE candidate:", err)
          }
        }
      }
    }

    ws.onclose = () => {
      console.log("WS closed")
      setConnectionStatus("Disconnected")
      wsRef.current = null
      connectingRef.current = false
    }

    ws.onerror = (e) => {
      console.error("WebSocket error:", e)
      setConnectionStatus("Error")
    }
  }

  async function handleOffer(data: any) {
    const peerId = data.senderPeerId
    if (!localStream) {
      console.log("[offer] Local stream not ready, queuing offer from:", peerId)
      pendingOffersRef.current.push(data)
      return
    }
    let pc = peerConnectionsRef.current.get(peerId)
    if (!pc) {
      await createPeerConnection(peerId, false)
      pc = peerConnectionsRef.current.get(peerId)
    }
    if (!pc) return

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({
          type: "answer",
          sdp: pc.localDescription,
          targetPeerId: peerId,
        }))
        console.log(`[WebRTC] Sent answer to ${peerId}`)
      }
    } catch (err) {
      console.error("Error handling offer:", err)
    }
  }

  const joinedRef = useRef(false)

  useEffect(() => {
    if (!meetingId || !session?.user?.id) return
    if (joinedRef.current) return
    joinedRef.current = true
    connectWebSocket()
    return () => {
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

  function cleanupAndExit() {
    if (meetingEndedRef.current) return
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
      setLocalStream(null)
    }
    if (screenTrackRef.current) {
      screenTrackRef.current.stop()
      screenTrackRef.current = null
    }
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (localThumbRef.current) localThumbRef.current.srcObject = null
    peerConnectionsRef.current.forEach(pc => pc.close())
    peerConnectionsRef.current.clear()
    wsRef.current?.close()
    wsRef.current = null
    setRemoteStreams(new Map())
    setRemoteParticipants(new Map())
    meetingEndedRef.current = true
    router.replace("/")
  }

  return (
    <div className="w-full h-screen bg-black flex flex-col">
      <div className="absolute top-4 right-4 text-white bg-black/60 px-3 py-1 rounded">
        participants:{participants}
      </div>
      <div className="absolute top-4 left-4 text-white bg-black/60 px-3 py-1 rounded">
        {connectionStatus}
      </div>

      <LayoutCall count={allStreams.length}>
        {allStreams.map(({ id, stream, isLocal, userName, userImage, isVideoOff }) => {
          const hasVideo = stream.getVideoTracks().length > 0
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

      {chatOpen && (
        <div className="absolute right-4 top-16 w-80 h-[420px] bg-[#0f172a] text-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-700">
          <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900">
            <span className="font-semibold text-sm">💬 Chat</span>
            <button onClick={() => setChatOpen(false)} className="text-gray-400 hover:text-white">✕</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
            {messages.map((msg, i) => {
              const isMe = msg.userId === session?.user?.id
              return (
                <div key={i} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                  <div className={`px-4 py-2 rounded-2xl max-w-[75%] text-sm shadow-md ${
                    isMe ? "bg-blue-600 text-white rounded-br-sm" : "bg-gray-700 text-gray-100 rounded-bl-sm"
                  }`}>
                    {!isMe && <div className="text-xs text-gray-400 mb-1 font-medium">{msg.name}</div>}
                    <div>{msg.text}</div>
                  </div>
                </div>
              )
            })}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-gray-700 flex gap-2 items-center">
            <input
              ref={chatInputRef}
              type="text"
              placeholder="Type a message..."
              className="flex-1 p-2 rounded-lg bg-gray-800 text-white outline-none text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const msg = e.currentTarget.value.trim()
                  if (!msg) return
                  sendMessage(msg)
                  e.currentTarget.value = ""
                  chatInputRef.current?.focus()
                }
              }}
            />
            <button
              onClick={() => {
                const input = chatInputRef.current
                if (!input) return
                const msg = input.value.trim()
                if (!msg) return
                sendMessage(msg)
                input.value = ""
                input.focus()
              }}
              className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm"
            >
              Send
            </button>
          </div>
        </div>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 bg-black/70 px-8 py-4 rounded-full">
        <button
          onClick={() => {
            if (!localStream) return
            const audioTrack = localStream.getAudioTracks()[0]
            if (!audioTrack) return
            audioTrack.enabled = !audioTrack.enabled
            setIsMuted(!audioTrack.enabled)
          }}
          className="bg-gray-700 p-3 rounded-full text-white"
        >
          {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
        </button>

        <button
          onClick={() => {
            const track = localStream?.getVideoTracks()[0]
            if (!track) return
            track.enabled = !track.enabled
            setCameraOff(!track.enabled)
          }}
          className="bg-gray-700 p-3 rounded-full text-white"
        >
          {cameraOff ? <FaVideoSlash /> : <FaVideo />}
        </button>

        <button
          onClick={() => setChatOpen(prev => !prev)}
          className={`p-3 rounded-full text-white transition ${chatOpen ? "bg-blue-600" : "bg-gray-700"}`}
        >
          <MessageSquare size={20} />
        </button>

        <button
          onClick={startScreenShare}
          className={`p-3 rounded-full text-white ${screenSharing ? "bg-green-600" : "bg-blue-600"}`}
        >
          <FaDesktop />
        </button>

        <button
          onClick={async () => {
            try {
              if (session?.user?.id === hostId) {
                await fetch("/api/meeting/end", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ meetingId })
                })
              }
            } catch(e) {
              console.error(e)
            }
            cleanupAndExit()
          }}
          className="bg-red-600 p-3 rounded-full text-white"
        >
          <FaPhoneSlash />
        </button>
      </div>
    </div>
  )
}
