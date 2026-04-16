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

  const [screenSharing, setScreenSharing] = useState(false)

  const [connectionStatus, setConnectionStatus] =
    useState("Connecting...");
  const [participants, setParticipants] = useState(0);

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
    return () => {
      wsRef.current?.close(); // 🔥 important cleanup
      producerPeerMap.current.clear(); // Clean up producerPeerMap
    };
  }, []);

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
          onClick={() => setViewMode("speaker")}
          className={`p-3 rounded-full text-white ${viewMode === "speaker" ? "bg-blue-600" : "bg-gray-700"}`}
        >
          <FaUserFriends />
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