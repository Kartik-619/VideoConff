'use client'

import * as mediasoupClient from "mediasoup-client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import toast from "react-hot-toast";
import { useSession } from "next-auth/react"
<<<<<<< Updated upstream
import { types as mediasoupTypes } from "mediasoup-client";
import { LayoutCall } from "../../../components/CallRoom/components/callLayout";
import VideoTile from '../../../components/CallRoom/components/VideoTile';
import {
  FaMicrophone,
  FaMicrophoneSlash,
  FaVideo,
  FaVideoSlash,
  FaDesktop,
  FaUserFriends,
  FaPhoneSlash
} from "react-icons/fa";
=======
import { useMedia } from "./hooks/useMedia"
import { useMediasoup } from "./hooks/useMediasoup"
import { useWebSocket } from "./hooks/useWebSocket"
import { MeetingHeader } from "./components/MeetingHeader"
import { VideoGrid } from "./components/VideoGrid"
import { ChatPanel } from "./components/ChatPanel"
import { MeetingControlBar } from "./components/ControlBar"
import type { ChatMessage, PeerJoinData } from "./types"
>>>>>>> Stashed changes

import { MessageSquare } from "lucide-react";

export default function MeetingRoom() {

  const params = useParams()
  const meetingId = params.meetingId as string
  const producerPeerMap = useRef<Map<string, string>>(new Map());
  const pendingProducers = useRef<any[]>([]);

  const router = useRouter()
  const { data: session } = useSession()

<<<<<<< Updated upstream
=======
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, { name: string; userId: string }>>(new Map())
  const [hostId, setHostId] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState("Connecting...")
  const [participantCount, setParticipantCount] = useState(0)
  const [debugOpen, setDebugOpen] = useState(false)
  const [remotePeerCount, setRemotePeerCount] = useState(0)
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const meetingEndedRef = useRef(false)
  const isCleaningUpRef = useRef(false)
  const socketIdRef = useRef<string | null>(null)
>>>>>>> Stashed changes
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)

<<<<<<< Updated upstream

  const consumedProducersRef = useRef<Set<string>>(new Set());

  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const deviceRef = useRef<mediasoupClient.Device | null>(null)

  const sendTransportRef = useRef<mediasoupTypes.Transport | null>(null)
  const recvTransportRef = useRef<mediasoupTypes.Transport | null>(null)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localThumbRef = useRef<HTMLVideoElement>(null)
  const socketIdRef = useRef<string | null>(null);

  const videoProducerRef = useRef<mediasoupTypes.Producer | null>(null);
  const audioProducerRef = useRef<mediasoupTypes.Producer | null>(null);

  const producedRef = useRef(false)
  const startedRef = useRef(false)
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const screenTrackRef = useRef<MediaStreamTrack | null>(null)
  const pendingCallbacks = useRef<
  Map<string,(arg?: any)=>void>
 >(new Map());
 
 const [remoteStreams, setRemoteStreams] =
    useState<Map<string, MediaStream>>(new Map())

  const [activeSpeaker, setActiveSpeaker] =
    useState<string | null>(null)

  const [viewMode, setViewMode] =
    useState<'speaker'>('speaker')

  const [isMuted, setIsMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const meetingEndedRef = useRef(false);

  const [hostId,setHostId] = useState<string | null>(null);

  const [chatOpen, setChatOpen] = useState(false);

  const [screenSharing, setScreenSharing] = useState(false)

  const [connectionStatus, setConnectionStatus] =
    useState("Connecting...");
  const [participants, setParticipants] = useState(0);

  const [messages, setMessages] = useState<any[]>([]);
  const joinSentRef = useRef(false);

  const allStreams = useMemo(() => {
  const result: { 
    id: string; 
    stream: MediaStream; 
    isLocal: boolean;
    userName?: string;
    userImage?: string;
    isVideoOff?: boolean;
  }[] = [];

 

  // local stream
  if (localStream) {
    result.push({
      id: "local",
      stream: localStream,
      isLocal: true,
      userName: session?.user?.name || undefined,
      userImage: session?.user?.image || undefined,
      isVideoOff: cameraOff
    });
  }

  // remote streams (already Map<peerId, stream>)
  remoteStreams.forEach((stream, peerId) => {
    if (peerId === socketIdRef.current) return;
    result.push({
      id: peerId,
      stream,
      isLocal: false,
      userName: `User ${peerId.slice(0, 6)}`, // Fallback for remote users
      userImage: undefined,
      isVideoOff: false // We'll need to track remote video state separately
    });
  });

  return result;
}, [localStream, remoteStreams, cameraOff, session?.user]);



useEffect(() => {
  if (chatOpen) {
    setTimeout(() => {
      chatInputRef.current?.focus();
    }, 100);
  }
}, [chatOpen]);

  useEffect(() => {
    return () => {
      wsRef.current?.close(); // 🔥 important cleanup
      producerPeerMap.current.clear(); // Clean up producerPeerMap
    };
  }, []);

  useEffect(() => {
  if (chatOpen) {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }
}, [messages, chatOpen]);

  async function startProducing(
    transport: mediasoupTypes.Transport
  ) {

    if (producedRef.current) return
    producedRef.current = true

    const stream =
      await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })

    setLocalStream(stream)

    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    if (localThumbRef.current) localThumbRef.current.srcObject = stream

    const videoProducer = await transport.produce({
      track: stream.getVideoTracks()[0],
      encodings: [
        { maxBitrate: 100000, scaleResolutionDownBy: 4 },
        { maxBitrate: 300000, scaleResolutionDownBy: 2 },
        { maxBitrate: 900000, scaleResolutionDownBy: 1 }
      ],
      codecOptions: {
        videoGoogleStartBitrate: 1000
      }
    });

    videoProducerRef.current = videoProducer;

    const audioProducer = await transport.produce({
  track: stream.getAudioTracks()[0]
});

audioProducerRef.current = audioProducer;
  }

  async function startScreenShare() {

    try {

      if (screenSharing) {
        screenTrackRef.current?.stop()
        setScreenSharing(false)
        return
      }

      const stream =
        await navigator.mediaDevices.getDisplayMedia({
          video: true
        })

      const track = stream.getVideoTracks()[0]

      const transport = sendTransportRef.current
      if (!transport) return

      const screenProducer = await transport.produce({
        track
      });
      
      screenTrackRef.current = track;
      setScreenSharing(true);
      
      track.onended = () => {
        screenProducer.close();
        track.stop();
        screenTrackRef.current = null;
        setScreenSharing(false);
      };

    } catch (err) {
      console.error(err)
    }

  }

  function sendMessage(msg: string) {
    if (!wsRef.current) return;

    wsRef.current.send(
      JSON.stringify({
        type: "chatMessage",
        message: msg,
      })
    );
  }

  function processPendingProducers() {
    const device = deviceRef.current;
    const transport = recvTransportRef.current;
  
    if (!device || !transport) return;
  
    pendingProducers.current.forEach((producerData) => {
      producerPeerMap.current.set(
        producerData.data.producerId,
        producerData.data.peerId
      );
  
      wsRef.current?.send(
        JSON.stringify({
          type: "consumer",
          producerId: producerData.data.producerId,
          transportId: transport.id,
          rtpCapabilities: device.rtpCapabilities,
        })
      );
    });
  
    pendingProducers.current = [];
  }

  const connectingRef=useRef(false);

  async function connectWebSocket() {
    if (
      connectingRef.current ||
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
     ){
      return;
     }
    connectingRef.current=true;

    const res = await fetch("/api/ws-token");
    if (!res.ok) {
      console.error("Failed to get WS token");
      connectingRef.current = false;
      return;
    }

    const { token } = await res.json();
    
    const ws = new WebSocket(`${process.env.NEXT_PUBLIC_BACKEND_URL?.replace('https', 'wss').replace('http', 'ws') || 'ws://localhost:8080'}?token=${token}`);
    wsRef.current = ws;
    joinSentRef.current = false;

    ws.onopen = () => {

      if (joinSentRef.current) return;
      joinSentRef.current = true;

      ws.send(JSON.stringify({
        type:"join",
        roomId: meetingId
      }));
      };

    ws.onmessage = async (e) => {

      const data = JSON.parse(e.data)

      if (data.type === "lobbyUpdate") {
        setParticipants(data.participants.length);
      }

      if (data.type === "activeSpeaker") {
        setActiveSpeaker(data.producerId)
      }

      if (data.type === "chatMessage") {
        setMessages(prev => [
          ...prev,
          {
            text: data.data.message,
            name: data.data.name,
            userId: data.data.userId,
            timestamp: data.data.timestamp,
          },
        ]);
      }

      if (data.type === "meetingEnded") {

        if (meetingEndedRef.current) return; 

        toast.error("Meeting ended by host"); // ✅ better UX

        cleanupAndExit(); // 🔥 FIRST

        wsRef.current?.close(); // 🔥 AFTER
      }

      if (data.type === "producerClosed") {
        const producerId = data.producerId;
      
        // remove producer from dedupe set
        consumedProducersRef.current.delete(producerId);
      
        setRemoteStreams((prev) => {
          const updated = new Map(prev);
      
          const peerId = producerPeerMap.current.get(producerId);
      
          // remove producer -> peer mapping
          producerPeerMap.current.delete(producerId);
      
          if (!peerId) return prev;
      
          const stream = updated.get(peerId);
      
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
            updated.delete(peerId);
          }
      
          return updated;
        });
      }

      if (data.type === "joined") {
        socketIdRef.current = data.peerId;
        setHostId(data.hostId);
      deviceRef.current=null;
        setRemoteStreams(new Map());
      
        producerPeerMap.current.clear();
        consumedProducersRef.current.clear(); // add
        pendingProducers.current = [];        // add
        pendingCallbacks.current.clear();     // add
      
        producedRef.current = false;
        reconnectAttempts.current = 0;
      
        ws.send(JSON.stringify({
          type: "getParticipants"
        }));
      }

      if (data.type === "rtpCapabilities") {

        if (deviceRef.current) return; // add
      
        const device = new mediasoupClient.Device();
      
        await device.load({
          routerRtpCapabilities: data.data
        });
      
        deviceRef.current = device;
      
        ws.send(JSON.stringify({
          type:"createTransport",
          direction:"send"
        }));
      
        ws.send(JSON.stringify({
          type:"createTransport",
          direction:"recv"
        }));
      }

      if (data.type === "transportCreated") {

        const device = deviceRef.current;
        if (!device) return;
      
        let transport: mediasoupTypes.Transport;
      
        if (data.data.direction === "send") {
      
          // prevent duplicate send transport
          if (sendTransportRef.current) return;
      
          transport = device.createSendTransport(data.data);
          sendTransportRef.current = transport;

          transport.on("connect", ({ dtlsParameters }, cb, errback) => {
            try{
              const requestId = crypto.randomUUID();
          
              pendingCallbacks.current.set(requestId, cb);
          
              ws.send(JSON.stringify({
                type:"connectTransport",
                requestId,
                transportId: transport.id,
                dtlsParameters
              }));
            } catch(e){
              errback(e as Error);
            }
          });

          transport.on("produce", (p, cb) => {

            const requestId = crypto.randomUUID();
          
            pendingCallbacks.current.set(requestId, cb);
          
            ws.send(JSON.stringify({
              type:"producer",
              requestId,
              transportId: transport.id,
              kind: p.kind,
              rtpParameters: p.rtpParameters
            }));
          });
          startProducing(transport)

        } else {

          // prevent duplicate recv transport
          if (recvTransportRef.current) return;
       
          transport = device.createRecvTransport(data.data);
          recvTransportRef.current = transport;
          
          ws.send(JSON.stringify({
            type: "syncProducers"
          }));
          
          processPendingProducers();
          
          transport.on("connect", ({ dtlsParameters }, cb, errback) => {
            const requestId = crypto.randomUUID();
          
            pendingCallbacks.current.set(requestId, () => {
              cb();
              processPendingProducers();
            });
          
            ws.send(JSON.stringify({
              type: "connectTransport",
              requestId,
              transportId: transport.id,
              dtlsParameters
            }));
          });
        }
      }

      if (data.type === "produced") {

        const cb = pendingCallbacks.current.get(data.requestId);
      
        if (cb) {
          cb({
            id: data.producerId
          });
      
          pendingCallbacks.current.delete(data.requestId);
        }
      
        return;
      }


      if (data.type === "transportConnected") {

        const cb = pendingCallbacks.current.get(data.requestId);
      
        if (cb) {
          cb();
          pendingCallbacks.current.delete(data.requestId);
        }
      
        return;
      }

      if (data.type === "producer") {

        // ignore self producer by userId
        if (socketIdRef.current && data.data.peerId === socketIdRef.current) return;

        if (consumedProducersRef.current.has(data.data.producerId)) return;

        consumedProducersRef.current.add(data.data.producerId);
        
        const transport = recvTransportRef.current;
        const device = deviceRef.current;

        if (!transport || !device) {
          pendingProducers.current.push(data);
          return;
        }

        producerPeerMap.current.set(
          data.data.producerId,
          data.data.peerId
        );

        ws.send(
          JSON.stringify({
            type: "consumer",
            producerId: data.data.producerId,
            transportId: transport.id,
            rtpCapabilities: device.rtpCapabilities,
          })
        );
      }


      if (data.type === "consumerCreated") {

        // skip self stream by checking producer userId against session user id
        const peerId = producerPeerMap.current.get(data.data.producerId);
        if (socketIdRef.current && peerId === socketIdRef.current) return;

        const transport = recvTransportRef.current;
        if (!transport) return;

        try {
          const consumer = await transport.consume(data.data);

          consumer.on("transportclose", () => {
            consumer.close();
          });

          setRemoteStreams(prev => {

            const updated = new Map(prev);

            const peerId = producerPeerMap.current.get(data.data.producerId);
            if (!peerId) return prev;

            let stream = updated.get(peerId);

            if (!stream) {
              stream = new MediaStream();
              updated.set(peerId, stream);
            }

            const alreadyExists = stream.getTracks().some(
              (t) => t.id === consumer.track.id
            );

            if (!alreadyExists) {
              stream.getTracks().forEach((t) => {
                if (t.kind === consumer.track.kind) {
                  stream.removeTrack(t);
                }
              });

              stream.addTrack(consumer.track);
            }

            return updated;
          });
          if (consumer.track.kind === "audio") {
            const audio = new Audio();
            audio.srcObject = new MediaStream([consumer.track]);
            audio.autoplay = true;
            audio.muted = false;
            audio.play().catch(() => {});
          }

          setActiveSpeaker(prev => prev ?? data.data.producerId);

          ws.send(JSON.stringify({
            type: "resumeConsumer",
            consumerId: consumer.id
          }));
        } catch (error) {
          console.error("Error consuming stream:", error);
        }
=======
  const media = useMedia()
  const mediasoup = useMediasoup({
    wsRef,
    onAppendRemoteStream: useCallback((peerId: string, stream: MediaStream) => {
      setRemoteStreams(prev => {
        const updated = new Map(prev)
        updated.set(peerId, stream)
        return updated
      })
    }, []),
    onRemoveRemoteStream: useCallback((peerId: string) => {
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
      }
    }, []),
    onPeerJoined: useCallback(async (peerId: string, name: string, userId: string) => {
      setRemoteParticipants(prev => {
        const updated = new Map(prev)
        updated.set(peerId, { name: name || `User ${peerId.slice(0, 6)}`, userId })
        return updated
      })
    }, []),
    onPeerLeft: useCallback((peerId: string) => {
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
    }, []),
    onRtpCapabilities: useCallback(async (rtpCapabilities) => {
      await mediasoup.createDevice(rtpCapabilities)
      ws.sendMessage("createTransport", { direction: "send" })
      ws.sendMessage("createTransport", { direction: "recv" })
    }, []),
    onTransportCreated: useCallback(async (data) => {
      await mediasoup.handleTransportCreated(data)
      if (data.direction === "send" && media.localStreamReady.current) {
        const tracks = media.localStreamRef.current?.getTracks() || []
        for (const track of tracks) {
          await mediasoup.produce(track)
        }
      }
    }, [media.localStreamReady.current]),
    onProduced: useCallback(async (data) => {
      console.log("Track produced:", data.producerId)
    }, []),
    onConsumerCreated: useCallback(async (data) => {
      await mediasoup.handleConsumerCreated(data)
    }, []),
    onProducer: useCallback(async (data) => {
      await mediasoup.consume(data.producerId, data.senderPeerId)
    }, []),
    onProducerClosed: useCallback(() => {}, []),
    onConsumerClosed: useCallback(() => {}, []),
    onStreamUnavailable: useCallback((senderPeerId: string) => {
      setRemoteStreams(prev => {
        const updated = new Map(prev)
        updated.delete(senderPeerId)
        return updated
      })
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
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "getParticipants" }))
>>>>>>> Stashed changes
      }
    }

<<<<<<< Updated upstream
    ws.onclose = () => {
      console.log("WS closed");
=======
  const cleanupAndExit = useCallback(() => {
    if (meetingEndedRef.current || isCleaningUpRef.current) return
    isCleaningUpRef.current = true
    meetingEndedRef.current = true
    media.cleanup()
    mediasoup.cleanup()
    ws.disconnect()
    setRemoteStreams(new Map())
    setRemoteParticipants(new Map())
    router.replace("/")
  }, [])
>>>>>>> Stashed changes

      setConnectionStatus("Disconnected");
      wsRef.current = null;
      connectingRef.current=false;
    }

    ws.onerror = (e) => {
      console.error("WebSocket error:", e);
      setConnectionStatus("Error");
    };
  
  }

  const joinedRef = useRef(false);

  useEffect(() => {
<<<<<<< Updated upstream

    if (!meetingId || !session?.user?.id) return;
=======
    setRemotePeerCount(remoteStreams.size)

    const interval = setInterval(() => {
      setRemotePeerCount(remoteStreams.size)
    }, 2000)
>>>>>>> Stashed changes

    if (startedRef.current) return; // prevents strict mode double mount
    startedRef.current = true;
  
    connectWebSocket();
  
    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    };
  
  }, []);

  function cleanupAndExit() {

  if (meetingEndedRef.current) return;

  // 🔥 stop camera + mic
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    setLocalStream(null);
  }

  // 🔥 stop screen share
  if (screenTrackRef.current) {
    screenTrackRef.current.stop();
    screenTrackRef.current = null;
  }

  // 🔥 clear video elements
  if (localVideoRef.current) localVideoRef.current.srcObject = null;
  if (localThumbRef.current) localThumbRef.current.srcObject = null;

  // 🔥 close producers safely
  if (videoProducerRef.current && !videoProducerRef.current.closed) {
    videoProducerRef.current.close();
    videoProducerRef.current = null;
  }

  if (audioProducerRef.current && !audioProducerRef.current.closed) {
    audioProducerRef.current.close();
    audioProducerRef.current = null;
  }

  // 🔥 close transports safely
  try {
    if (sendTransportRef.current && !sendTransportRef.current.closed) {
      sendTransportRef.current.close();
    }
  } catch (e) {
    console.warn("send transport already closing");
  } finally {
    sendTransportRef.current = null;
  }
  
  try {
    if (recvTransportRef.current && !recvTransportRef.current.closed) {
      recvTransportRef.current.close();
    }
  } catch (e) {
    console.warn("recv transport already closing");
  } finally {
    recvTransportRef.current = null;
  }

  // 🔥 close socket
  wsRef.current?.close();
  wsRef.current = null;

  setRemoteStreams(new Map());

producerPeerMap.current.clear();
consumedProducersRef.current.clear();
pendingProducers.current = [];
pendingCallbacks.current.clear();

deviceRef.current = null;

producedRef.current = false;
connectingRef.current = false;

startedRef.current = false;
meetingEndedRef.current = true;

router.replace("/");
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
          const hasVideo = stream.getVideoTracks().length > 0;

<<<<<<< Updated upstream
          // Always show VideoTile, even without video tracks (for avatar display)
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
          );
        })}
      </LayoutCall>
=======
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
        </div>
      )}
>>>>>>> Stashed changes

      {chatOpen && (
  <div className="absolute right-4 top-16 w-80 h-[420px] bg-[#0f172a] text-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-700">

    {/* HEADER */}
    <div className="p-3 border-b border-gray-700 flex justify-between items-center bg-gray-900">
  <span className="font-semibold text-sm">💬 Chat</span>
  <button
    onClick={() => setChatOpen(false)}
    className="text-gray-400 hover:text-white"
  >
    ✕
  </button>
</div>

    {/* MESSAGES */}
<div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
  {messages.map((msg, i) => {
    const isMe = msg.userId === session?.user?.id;

    return (
      <div
        key={i}
        className={`flex ${isMe ? "justify-end" : "justify-start"}`}
      >
        <div
          className={`px-4 py-2 rounded-2xl max-w-[75%] text-sm shadow-md ${
            isMe
              ? "bg-blue-600 text-white rounded-br-sm"
              : "bg-gray-700 text-gray-100 rounded-bl-sm"
          }`}
        >
          {!isMe && (
            <div className="text-xs text-gray-400 mb-1 font-medium">
              {msg.name}
            </div>
          )}
          <div>{msg.text}</div>
        </div>
      </div>
    );
  })}

  {/* 🔥 AUTO SCROLL TARGET */}
  <div ref={chatEndRef} />
</div>

    {/* INPUT */}
    <div className="p-3 border-t border-gray-700 flex gap-2 items-center">

  <input
    ref={chatInputRef}
    type="text"
    placeholder="Type a message..."
    className="flex-1 p-2 rounded-lg bg-gray-800 text-white outline-none text-sm"
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        const msg = e.currentTarget.value.trim();
        if (!msg) return;

        sendMessage(msg);
        e.currentTarget.value = "";
        chatInputRef.current?.focus();
      }
    }}
  />

  <button
    onClick={() => {
      const input = chatInputRef.current;
      if (!input) return;

      const msg = input.value.trim();
      if (!msg) return;

      sendMessage(msg);
      input.value = "";
      input.focus();
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
            if (!localStream) return;

            const audioTrack = localStream.getAudioTracks()[0];
            if (!audioTrack) return;

            audioTrack.enabled = !audioTrack.enabled;
            setIsMuted(!audioTrack.enabled);
          }}
          className="bg-gray-700 p-3 rounded-full text-white"
        >
          {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
        </button>

        <button
  onClick={() => {
    const track = localStream?.getVideoTracks()[0];
    if (!track) return;

    track.enabled = !track.enabled;
    setCameraOff(!track.enabled);
  }}
  className="bg-gray-700 p-3 rounded-full text-white"
>
  {cameraOff ? <FaVideoSlash /> : <FaVideo />}
</button>

        <button
          onClick={() => setChatOpen(prev => !prev)}
          className={`p-3 rounded-full text-white transition ${
            chatOpen ? "bg-blue-600" : "bg-gray-700"
          }`}
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
          
              // only host should end room
              if (session?.user?.id === hostId) {
                await fetch("/api/meeting/end", {
                  method: "POST",
                  headers: {
                    "Content-Type":"application/json"
                  },
                  body: JSON.stringify({
                    meetingId
                  })
                });
              }
          
            } catch(e) {
              console.error(e);
            }
          
            cleanupAndExit();
          }}
          className="bg-red-600 p-3 rounded-full text-white"
        >
          <FaPhoneSlash />
        </button>

      </div>
    </div>
  )
}