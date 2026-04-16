'use client'

import * as mediasoupClient from "mediasoup-client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import toast from "react-hot-toast";
import { useSession } from "next-auth/react"
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

import { MessageSquare } from "lucide-react";

export default function MeetingRoom() {

  const params = useParams()
  const meetingId = params.meetingId as string
  const producerPeerMap = useRef<Map<string, string>>(new Map());
  const pendingProducers = useRef<any[]>([]);

  const router = useRouter()
  const { data: session } = useSession()

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectAttempts = useRef(0)

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

  const [remoteStreams, setRemoteStreams] =
    useState<Map<string, MediaStream>>(new Map())

  const [activeSpeaker, setActiveSpeaker] =
    useState<string | null>(null)

  const [viewMode, setViewMode] =
    useState<'speaker'>('speaker')

  const [isMuted, setIsMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const meetingEndedRef = useRef(false);

  const [chatOpen, setChatOpen] = useState(false);

  const [screenSharing, setScreenSharing] = useState(false)

  const [connectionStatus, setConnectionStatus] =
    useState("Connecting...");
  const [participants, setParticipants] = useState(0);

  const [messages, setMessages] = useState<any[]>([]);

  const allStreams = useMemo(() => {
  const result: { id: string; stream: MediaStream; isLocal: boolean }[] = [];

 

  // local stream
  if (localStream) {
    result.push({
      id: "local",
      stream: localStream,
      isLocal: true
    });
  }

  // remote streams (already Map<peerId, stream>)
  remoteStreams.forEach((stream, peerId) => {
    if (peerId === socketIdRef.current) return;
    result.push({
      id: peerId,
      stream,
      isLocal: false
    });
  });

  return result;
}, [localStream, remoteStreams]);



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

      await transport.produce({ track })

      screenTrackRef.current = track
      setScreenSharing(true)

      track.onended = () => setScreenSharing(false)

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

  pendingProducers.current.forEach((data) => {
    producerPeerMap.current.set(
      data.data.producerId,
      data.data.peerId
    );

    wsRef.current?.send(
      JSON.stringify({
        type: "consumer",
        producerId: data.data.producerId,
        transportId: transport.id,
        rtpCapabilities: device.rtpCapabilities,
      })
    );
  });

  pendingProducers.current = [];
}


  async function connectWebSocket() {
    if (wsRef.current) return;

    const res = await fetch("/api/ws-token");
    if (!res.ok) {
      console.error("Failed to get WS token");
      return;
    }

    const { token } = await res.json();
    
    const ws = new WebSocket(`ws://localhost:8080?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {

      setConnectionStatus("Connected");

      ws.send(JSON.stringify({
        type: "join",
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

        setRemoteStreams((prev) => {
          const updated = new Map(prev);

          const peerId = producerPeerMap.current.get(producerId);

          // remove mapping
          producerPeerMap.current.delete(producerId);

          if (!peerId) return prev;

          const stream = updated.get(peerId);

          if (stream) {
            stream.getTracks().forEach((track) => track.stop());
            updated.delete(peerId);
          }

          return updated;
        });
      }

      if (data.type === "joined") {
        socketIdRef.current = data.peerId;
        setRemoteStreams(new Map());
        producerPeerMap.current.clear();
        producedRef.current = false;
        reconnectAttempts.current = 0;

        ws.send(JSON.stringify({
         type: "getParticipants"
       }));
      }

      if (data.type === "rtpCapabilities") {

        const device = new mediasoupClient.Device()

        await device.load({
          routerRtpCapabilities: data.data
        })

        deviceRef.current = device

        ws.send(JSON.stringify({ type: "createTransport", direction: "send" }))
        ws.send(JSON.stringify({ type: "createTransport", direction: "recv" }))
      }

      if (data.type === "transportCreated") {

        const device = deviceRef.current
        if (!device) return

        let transport: mediasoupTypes.Transport

        if (data.data.direction === "send") {

          transport = device.createSendTransport(data.data)
          sendTransportRef.current = transport

          transport.on("connect", ({ dtlsParameters }, cb) => {
            ws.send(JSON.stringify({
              type: "connectTransport",
              transportId: transport.id,
              dtlsParameters
            }))
            cb()
          })

          transport.on("produce", (p, cb) => {

            ws.send(JSON.stringify({
              type: "producer",
              transportId: transport.id,
              kind: p.kind,
              rtpParameters: p.rtpParameters
            }))

            const handler = (e: MessageEvent) => {

              const res = JSON.parse(e.data)

              if (res.type === "produced") {
                cb({ id: res.data.producerId })
                ws.removeEventListener("message", handler)
              }
            }

            ws.addEventListener("message", handler)
          })

          startProducing(transport)

        } else {

          transport = device.createRecvTransport(data.data)
          recvTransportRef.current = transport
          ws.send(JSON.stringify({
            type: "syncProducers"
          }));
          // ✅ process immediately
          processPendingProducers();

          transport.on("connect", ({ dtlsParameters }, cb) => {

            ws.send(JSON.stringify({
              type: "connectTransport",
              transportId: transport.id,
              dtlsParameters
            }))

            cb()

            // ✅ safety replay (if anything missed)
            processPendingProducers();

            
          // 🔥 Process queued producers
          pendingProducers.current.forEach((data) => {
            const device = deviceRef.current;
            const transport = recvTransportRef.current;

            if (!device || !transport) return;

            producerPeerMap.current.set(
              data.data.producerId,
              data.data.peerId
            );

            wsRef.current?.send(
              JSON.stringify({
                type: "consumer",
                producerId: data.data.producerId,
                transportId: transport.id,
                rtpCapabilities: device.rtpCapabilities,
              })
            );
          });

          // clear queue after processing
          pendingProducers.current = [];

          })
        }
      }

      if (data.type === "producer") {

        // ignore self producer by userId
        if (socketIdRef.current && data.data.peerId === socketIdRef.current) return;

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
      }
    }

    ws.onclose = () => {
      console.log("WS closed");

      setConnectionStatus("Disconnected");
      wsRef.current = null;
    }
  }

  useEffect(() => {

    if (!meetingId) return
    if (!session?.user?.id) return

    startedRef.current = true
    connectWebSocket()

  }, [meetingId, session?.user?.id])

  function cleanupAndExit() {

  if (meetingEndedRef.current) return;

  // 🔥 stop camera + mic
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    setLocalStream(null);
  }

  // 🔥 release camera
  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => stream.getTracks().forEach(track => track.stop()))
    .catch(() => {});

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
  if (sendTransportRef.current && !sendTransportRef.current.closed) {
    sendTransportRef.current.close();
    sendTransportRef.current = null;
  }

  if (recvTransportRef.current && !recvTransportRef.current.closed) {
    recvTransportRef.current.close();
    recvTransportRef.current = null;
  }

  // 🔥 close socket
  wsRef.current?.close();
  wsRef.current = null;

  setRemoteStreams(new Map());

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
        {allStreams.map(({ id, stream, isLocal }) => {
          const hasVideo = stream.getVideoTracks().length > 0;

          if (!hasVideo) return null;

          return (
            <VideoTile
              key={id}
              stream={stream}
              muted={isLocal}
            />
          );
        })}
      </LayoutCall>

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
            if (!videoProducerRef.current) return;

            if (videoProducerRef.current.paused) {
              videoProducerRef.current.resume(); // ON
              setCameraOff(false);
            } else {
              videoProducerRef.current.pause(); // OFF
              setCameraOff(true);
            }
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
              await fetch("/api/meeting/end", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ meetingId }),
              });
            } catch (e) {
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