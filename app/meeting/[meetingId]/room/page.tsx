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

interface PendingOffer {
  senderPeerId: string
  sdp: RTCSessionDescriptionInit
}

interface PendingPeer {
  peerId: string
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
  const maxReconnectAttempts = 10
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
  const pendingOffersRef = useRef<PendingOffer[]>([])
  const pendingPeersRef = useRef<PendingPeer[]>([])
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const localStreamReadyRef = useRef(false)
  const reconnectedRef = useRef(false)

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
      const videoTracks = stream.getVideoTracks()
      const hasVideo = videoTracks.length > 0 && videoTracks[0].enabled
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
      console.log(`[WebRTC] PC already exists for ${peerId}, reusing`)
      return peerConnectionsRef.current.get(peerId)!
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    })

    peerConnectionsRef.current.set(peerId, pc)

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received track from ${peerId}:`, event.track.kind)
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0]
        setRemoteStreams(prev => {
          const updated = new Map(prev)
          updated.set(peerId, remoteStream)
          return updated
        })
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
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
        console.log(`[WebRTC] Connection lost with ${peerId}, attempting reconnect`)
        setRemoteStreams(prev => {
          const updated = new Map(prev)
          updated.delete(peerId)
          return updated
        })
        peerConnectionsRef.current.delete(peerId)
        if (localStream && !reconnectedRef.current) {
          reconnectedRef.current = true
          setTimeout(() => {
            reconnectedRef.current = false
            createPeerConnection(peerId, true)
          }, 2000)
        }
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state for ${peerId}:`, pc.iceConnectionState)
    }

    pc.onnegotiationneeded = async () => {
      console.log(`[WebRTC] Negotiation needed for ${peerId}`)
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        await pc.setLocalDescription(offer)
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: "offer",
            sdp: pc.localDescription,
            targetPeerId: peerId,
          }))
          console.log(`[WebRTC] Sent renegotiation offer to ${peerId}`)
        }
      } catch (err) {
        console.error("Error during renegotiation:", err)
      }
    }

    if (localStream) {
      localStream.getTracks().forEach(track => {
        try {
          pc.addTrack(track, localStream)
        } catch (e) {
          console.warn("Track already added:", e)
        }
      })
    }

    const bufferedCandidates = pendingIceCandidatesRef.current.get(peerId)
    if (bufferedCandidates && bufferedCandidates.length > 0) {
      console.log(`[WebRTC] Flushing ${bufferedCandidates.length} buffered ICE candidates for ${peerId}`)
      for (const candidate of bufferedCandidates) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.error("Error adding buffered ICE candidate:", err)
        }
      }
      pendingIceCandidatesRef.current.delete(peerId)
    }

    if (isInitiator) {
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        await pc.setLocalDescription(offer)
        if (wsRef.current?.readyState === WebSocket.OPEN) {
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
        const cameraTrack = localStream?.getVideoTracks()[0]
        if (cameraTrack) {
          peerConnectionsRef.current.forEach((pc) => {
            const sender = pc.getSenders().find(s => s.track?.kind === 'video')
            if (sender) {
              sender.replaceTrack(cameraTrack)
            }
          })
        }
        return
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: { cursor: "always" },
        audio: false
      })
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
      console.error("Screen share error:", err)
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

    try {
      const res = await fetch("/api/ws-token")
      if (!res.ok) {
        console.error("Failed to get WS token")
        connectingRef.current = false
        return
      }

      const { token } = await res.json()
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8080'
      const wsUrl = `${backendUrl.replace(/^https/, 'wss').replace(/^http/, 'ws')}?token=${token}`
      
      console.log(`[WS] Connecting to: ${wsUrl}`)
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws
      joinSentRef.current = false

      ws.onopen = () => {
        console.log("[WS] Connected")
        if (joinSentRef.current) return
        joinSentRef.current = true
        setConnectionStatus("Connected")
        reconnectAttempts.current = 0
        ws.send(JSON.stringify({
          type: "join",
          roomId: meetingId
        }))
      }

      ws.onmessage = async (e) => {
        try {
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
            console.log("[joined] Socket ID:", data.peerId, "Host:", data.hostId)
            socketIdRef.current = data.peerId
            setHostId(data.hostId)
            setRemoteStreams(new Map())
            setRemoteParticipants(new Map())
            peerConnectionsRef.current.clear()
            pendingOffersRef.current = []
            pendingPeersRef.current = []
            pendingIceCandidatesRef.current.clear()
            reconnectAttempts.current = 0

            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: { echoCancellation: true, noiseSuppression: true }
              })
              
              console.log("[Media] Got local stream with tracks:", stream.getTracks().map(t => `${t.kind}:${t.label}`))
              setLocalStream(stream)
              localStreamReadyRef.current = true
              
              if (localVideoRef.current) localVideoRef.current.srcObject = stream
              if (localThumbRef.current) localThumbRef.current.srcObject = stream

              const peersToConnect = [...pendingPeersRef.current]
              pendingPeersRef.current = []
              
              for (const peer of peersToConnect) {
                const iAmHigher = (socketIdRef.current || "") > peer.peerId
                console.log(`[WebRTC] Processing pending peer ${peer.peerId}, I am higher: ${iAmHigher}`)
                if (iAmHigher) {
                  await createPeerConnection(peer.peerId, true)
                } else {
                  createPeerConnection(peer.peerId, false)
                }
              }

              while (pendingOffersRef.current.length > 0) {
                const pendingOffer = pendingOffersRef.current.shift()
                if (pendingOffer) {
                  console.log(`[WebRTC] Processing pending offer from: ${pendingOffer.senderPeerId}`)
                  await handleOffer(pendingOffer)
                }
              }
            } catch (err) {
              console.error("Error getting user media:", err)
              toast.error("Failed to access camera/microphone")
            }

            ws.send(JSON.stringify({ type: "getParticipants" }))
          }

          if (data.type === "existingPeers") {
            console.log("[existingPeers] Received:", data.peers)
            const myId = socketIdRef.current
            for (const peer of data.peers) {
              setRemoteParticipants(prev => {
                const updated = new Map(prev)
                updated.set(peer.peerId, {
                  name: peer.name || `User ${peer.peerId.slice(0, 6)}`,
                  userId: peer.userId
                })
                return updated
              })

              if (localStreamReadyRef.current) {
                const iAmHigher = (myId || "") > peer.peerId
                console.log(`[WebRTC] Peer ${peer.peerId}, I am higher: ${iAmHigher}`)
                if (iAmHigher) {
                  console.log(`[WebRTC] Creating PC (initiator) for existing peer: ${peer.peerId}`)
                  await createPeerConnection(peer.peerId, true)
                } else {
                  console.log(`[WebRTC] Creating PC (non-initiator) for existing peer: ${peer.peerId}`)
                  createPeerConnection(peer.peerId, false)
                }
              } else {
                console.log(`[WebRTC] Queueing existing peer: ${peer.peerId}`)
                pendingPeersRef.current.push(peer)
              }
            }
          }

          if (data.type === "peerJoined") {
            console.log("[peerJoined] New peer:", data.peerId, data.name)
            setRemoteParticipants(prev => {
              const updated = new Map(prev)
              updated.set(data.peerId, {
                name: data.name || `User ${data.peerId.slice(0, 6)}`,
                userId: data.userId
              })
              return updated
            })
            
            if (localStreamReadyRef.current) {
              const newPeerId = data.peerId
              const myId = socketIdRef.current
              const theyAreNewer = newPeerId > (myId || "")
              
              if (!theyAreNewer) {
                console.log(`[WebRTC] I have higher peerId, initiating to: ${newPeerId}`)
                await createPeerConnection(newPeerId, true)
              } else {
                console.log(`[WebRTC] Pre-creating PC for ${newPeerId} (waiting for their offer)`)
                createPeerConnection(newPeerId, false)
              }
            } else {
              console.log(`[WebRTC] Queueing new peer: ${data.peerId}`)
              pendingPeersRef.current.push({
                peerId: data.peerId,
                name: data.name,
                userId: data.userId
              })
            }
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
            console.log("[offer] Received from:", data.senderPeerId)
            if (localStreamReadyRef.current) {
              await handleOffer(data)
            } else {
              console.log("[offer] Queuing (stream not ready)")
              pendingOffersRef.current.push({
                senderPeerId: data.senderPeerId,
                sdp: data.sdp
              })
            }
          }

          if (data.type === "answer") {
            console.log("[answer] Received from:", data.senderPeerId)
            const pc = peerConnectionsRef.current.get(data.senderPeerId)
            if (pc) {
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
                console.log(`[WebRTC] Set remote description from ${data.senderPeerId}, state: ${pc.signalingState}`)
              } catch (err) {
                console.error("Error handling answer:", err)
              }
            } else {
              console.warn(`[WebRTC] No PC found for answer from ${data.senderPeerId}`)
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
            } else if (data.candidate) {
              if (!pendingIceCandidatesRef.current.has(data.senderPeerId)) {
                pendingIceCandidatesRef.current.set(data.senderPeerId, [])
              }
              pendingIceCandidatesRef.current.get(data.senderPeerId)!.push(data.candidate)
              console.log(`[ICE] Buffered candidate for ${data.senderPeerId} (PC not ready yet)`)
            }
          }
        } catch (err) {
          console.error("WS message parse error:", err)
        }
      }

      ws.onclose = (event) => {
        console.log(`[WS] Closed: code=${event.code}, reason=${event.reason}`)
        wsRef.current = null
        connectingRef.current = false
        
        if (meetingEndedRef.current) return
        
        setConnectionStatus("Disconnected")
        
        if (reconnectAttempts.current < maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 10000)
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1})`)
          setConnectionStatus(`Reconnecting... (${reconnectAttempts.current + 1})`)
          
          setTimeout(() => {
            reconnectAttempts.current++
            connectWebSocket()
          }, delay)
        } else {
          setConnectionStatus("Connection lost")
          toast.error("Lost connection to server")
        }
      }

      ws.onerror = (e) => {
        console.error("[WS] Error:", e)
        setConnectionStatus("Error")
      }
    } catch (err) {
      console.error("WebSocket setup error:", err)
      connectingRef.current = false
    }
  }

  async function handleOffer(data: { senderPeerId: string; sdp: RTCSessionDescriptionInit }) {
    const peerId = data.senderPeerId
    if (!localStreamReadyRef.current) {
      console.log("[offer] Local stream not ready, queuing offer from:", peerId)
      pendingOffersRef.current.push(data)
      return
    }
    
    let pc = peerConnectionsRef.current.get(peerId)
    if (!pc) {
      pc = await createPeerConnection(peerId, false)
    }
    if (!pc) return

    try {
      if (pc.signalingState === "have-local-offer") {
        console.log(`[WebRTC] Rolling back local offer for ${peerId}`)
        await pc.setLocalDescription({ type: "rollback" } as RTCSessionDescription)
      }
      
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      
      if (wsRef.current?.readyState === WebSocket.OPEN) {
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
    localStreamReadyRef.current = false
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
      <div className="absolute top-4 right-4 text-white bg-black/60 px-3 py-1 rounded z-10">
        participants:{participants}
      </div>
      <div className="absolute top-4 left-4 text-white bg-black/60 px-3 py-1 rounded z-10">
        {connectionStatus}
      </div>

      <LayoutCall count={allStreams.length}>
        {allStreams.map(({ id, stream, isLocal, userName, userImage, isVideoOff }) => {
          const hasVideo = stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled
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
        <div className="absolute right-4 top-16 w-80 h-[420px] bg-[#0f172a] text-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-700 z-10">
          <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900">
            <span className="font-semibold text-sm"> Chat</span>
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

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 bg-black/70 px-8 py-4 rounded-full z-10">
        <button
          onClick={() => {
            if (!localStream) return
            const audioTrack = localStream.getAudioTracks()[0]
            if (!audioTrack) return
            audioTrack.enabled = !audioTrack.enabled
            setIsMuted(!audioTrack.enabled)
          }}
          className="bg-gray-700 p-3 rounded-full text-white hover:bg-gray-600 transition"
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
          className="bg-gray-700 p-3 rounded-full text-white hover:bg-gray-600 transition"
        >
          {cameraOff ? <FaVideoSlash /> : <FaVideo />}
        </button>

        <button
          onClick={() => setChatOpen(prev => !prev)}
          className={`p-3 rounded-full text-white transition ${chatOpen ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"}`}
        >
          <MessageSquare size={20} />
        </button>

        <button
          onClick={startScreenShare}
          className={`p-3 rounded-full text-white transition ${screenSharing ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"}`}
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
          className="bg-red-600 p-3 rounded-full text-white hover:bg-red-700 transition"
        >
          <FaPhoneSlash />
        </button>
      </div>
    </div>
  )
}
