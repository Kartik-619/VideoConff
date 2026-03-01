'use client';

import * as mediasoupClient from "mediasoup-client";
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { types as mediasoupTypes } from "mediasoup-client";

export default function MeetingRoom() {
  const params = useParams();
  const meetingId = params.meetingId as string;
  const router = useRouter();
  const { data: session } = useSession();

  const sendTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const deviceRef = useRef<mediasoupClient.Device | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const recvTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const producedRef = useRef(false);
  const mountedRef = useRef(true); // ADD THIS
  const startedRef = useRef(false);


  const [isHost, setIsHost] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>("Connecting...");
  const [wsError, setWsError] = useState<string | null>(null);

  // Check if host
  useEffect(() => {
    const checkHost = async () => {
      const res = await fetch(`/api/meeting/${meetingId}`);
      const data = await res.json();
      if (data.host?.id === session?.user?.id) {
        setIsHost(true);
      }
    };

    if (session?.user?.id) {
      checkHost();
    }
  }, [meetingId, session]);

  // Auto exit if meeting ended
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/meeting/${meetingId}`);
      const data = await res.json();
      if (data.status === "ENDED") {
        cleanupAndExit();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [meetingId]);

  async function startProducing(transport: mediasoupTypes.Transport) {
    if (producedRef.current) {
      console.log("⏭️ Already producing, skipping...");
      return;
    }
    producedRef.current = true;

    try {
      console.log("🎥 Requesting camera access...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      console.log("✅ Camera access granted");

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        console.log("✅ Local video element updated");
      }

      console.log("📹 Producing video track...");
      const videoProducer = await transport.produce({
        track: stream.getVideoTracks()[0]
      });
      console.log("✅ Video producer created:", videoProducer.id);

      console.log("🎤 Producing audio track...");
      const audioProducer = await transport.produce({
        track: stream.getAudioTracks()[0]
      });
      console.log("✅ Audio producer created:", audioProducer.id);

      console.log("✅ Producing started successfully");
    } catch (error) {
      console.error("❌ Failed to access media devices:", error);
      setCameraError("Could not access camera/microphone. Please check permissions.");
      producedRef.current = false;
    }
  }

  // WebRTC + WebSocket
  useEffect(() => {

    mountedRef.current = true; // ADD THIS

    if (!meetingId || !session?.user?.id) {
      console.log("⏳ Waiting for meetingId and session...");
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;

    function connectWebSocket() {
      if (!mountedRef.current) return; // ADD THIS

      console.log("🔌 Creating WebSocket connection...");
      setConnectionStatus("Connecting...");

      const ws = new WebSocket("ws://localhost:8080");
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) {
          ws.close();
          return;
        }
        console.log("✅ WebSocket connected");
        setConnectionStatus("Connected");
        setWsError(null);
        reconnectAttempts = 0;

        ws.send(JSON.stringify({
          type: "join",
          roomId: meetingId,
          userId: session?.user?.id
        }));
      };

      ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error);
        setConnectionStatus("Error");
        setWsError("Failed to connect to signaling server");
      };

      ws.onclose = () => {
        console.log("🔌 WebSocket closed");
        setConnectionStatus("Disconnected");

        // Try to reconnect if not maximum attempts reached and component is still mounted
        if (mountedRef.current && reconnectAttempts < maxReconnectAttempts) {
          reconnectAttempts++;
          console.log(`🔄 Reconnecting... Attempt ${reconnectAttempts}/${maxReconnectAttempts}`);
          setTimeout(connectWebSocket, 2000);
        } else if (mountedRef.current) {
          setWsError("Unable to connect to server. Please refresh the page.");
        }
      };

      ws.onmessage = async (e) => {
        if (!mountedRef.current) return;

        const data = JSON.parse(e.data);
        console.log("📩 Received:", data.type);

        if (data.type === 'rtpCapabilities') {
          try {
            console.log("📦 Creating device with router capabilities...");
            const device = new mediasoupClient.Device();
            await device.load({ routerRtpCapabilities: data.data });
            deviceRef.current = device;
            console.log("✅ Device loaded successfully");

            console.log("📤 Requesting send transport...");
            ws.send(JSON.stringify({ type: "createTransport", direction: "send" }));

            console.log("📥 Requesting receive transport...");
            ws.send(JSON.stringify({ type: "createTransport", direction: "recv" }));
          } catch (e) {
            console.warn("❌ Browser not supported:", e);
          }
        }

        if (data.type === 'transportCreated') {
          const transportData = data.data;

          if (!deviceRef.current) {
            console.log("⏳ Device not ready yet...");
            return;
          }

          console.log(
            "🚚 Transport created:",
            transportData.id,
            "direction:",
            transportData.direction
          );

          let transport: mediasoupTypes.Transport;

          // ✅ SEND TRANSPORT
          if (transportData.direction === "send") {
            console.log("📤 Creating SEND transport...");

            transport = deviceRef.current.createSendTransport({
              id: transportData.id,
              iceParameters: transportData.iceParameters,
              iceCandidates: transportData.iceCandidates,
              dtlsParameters: transportData.dtlsParameters
            });
            console.log("📤 SEND transport ICE parameters:", transportData.iceParameters);
            console.log("📤 SEND transport ICE candidates:", transportData.iceCandidates);
            sendTransportRef.current = transport;

            transport.on("connectionstatechange", (state) => {
              console.log("🔄 SEND transport state changed:", state);

              
            });
            startProducing(transport);
          } else {
            // ✅ RECEIVE TRANSPORT
            console.log("📥 Creating RECEIVE transport...");

            transport = deviceRef.current.createRecvTransport({
              id: transportData.id,
              iceParameters: transportData.iceParameters,
              iceCandidates: transportData.iceCandidates,
              dtlsParameters: transportData.dtlsParameters
            });
            console.log("Receive the transport Id", transport.direction)

            recvTransportRef.current = transport;

            transport.on("connectionstatechange", (state) => {
              console.log("🔄 RECEIVE transport state:", state);
            });
          }

          // ===== CONNECT ===== (Single handler for both transports)
          // In your transport creation section, update the CONNECT handler:

          // ===== CONNECT ===== (Single handler for both transports)
          transport.on("connect", ({ dtlsParameters }, callback, errback) => {
            console.log("🔌 Transport connect event fired for:", transport.id);
            console.log("🔌 DTLS Parameters:", dtlsParameters);

            // Send connect request to server
            ws.send(JSON.stringify({
              type: "connectTransport",
              transportId: transport.id,
              dtlsParameters
            }));

            // Wait for server confirmation
            const handleConnected = (event: MessageEvent) => {
              const response = JSON.parse(event.data);
              if (response.type === "transportConnected" && response.transportId === transport.id) {
                console.log("✅ Transport connected confirmed for:", transport.id);
                ws.removeEventListener("message", handleConnected);
                callback();
              }
            };

            ws.addEventListener("message", handleConnected);
          });

          // IMPORTANT: Also add this after creating the transports
          // This will trigger the connection process
          if (transportData.direction === "send") {
            // For send transport, we need to produce to trigger connection
            // But we'll wait for the connectionstatechange event
            console.log("📤 Send transport created, waiting for connection...");
          } else {
            // For receive transport, we need to consume to trigger connection
            // But we'll wait for producers from other peers
            console.log("📥 Receive transport created, waiting for producers...");
          }

          // ===== PRODUCE ===== (Only for send transport)
          if (transportData.direction === "send") {
            transport.on("produce", (parameters, callback, errback) => {
              console.log("🎬 Produce event for:", parameters.kind);

              ws.send(JSON.stringify({
                type: "producer",
                transportId: transport.id,
                kind: parameters.kind,
                rtpParameters: parameters.rtpParameters
              }));

              const messageHandler = (event: MessageEvent) => {
                const response = JSON.parse(event.data);

                if (response.type === "produced") {
                  console.log("✅ Producer confirmed:", response.data.producerId);
                  ws.removeEventListener("message", messageHandler);
                  callback({ id: response.data.producerId });
                }
              };

              ws.addEventListener("message", messageHandler);
            });
          }
        }
        if (data.type === "producer") {
          console.log("👤 New producer from peer:", data.data.producerId);

          if (!recvTransportRef.current) {
            console.log("⏳ Receive transport not ready yet");
            return;
          }
          if (!deviceRef.current) {
            console.log("⏳ Device not ready yet");
            return;
          }

          ws.send(JSON.stringify({
            type: "consumer",
            producerId: data.data.producerId,
            transportId: recvTransportRef.current.id,
            rtpCapabilities: deviceRef.current.rtpCapabilities
          }));
        }

        if (data.type === 'consumerCreated') {
          console.log("📺 Consumer created for:", data.data.producerId);

          if (!recvTransportRef.current) {
            console.log("❌ No receive transport for consumer");
            return;
          }

          try {
            const consumer = await recvTransportRef.current.consume({
              id: data.data.id,
              producerId: data.data.producerId,
              kind: data.data.kind,
              rtpParameters: data.data.rtpParameters
            });

            console.log(`✅ Consumer ${data.data.kind} created successfully`);

            if (data.data.kind === "video") {
              const remoteStream = new MediaStream();
              remoteStream.addTrack(consumer.track);

              setRemoteStreams(prev => {
                const updated = new Map(prev);
                updated.set(data.data.producerId, remoteStream);
                console.log("📺 Remote streams updated, count:", updated.size);
                return updated;
              });
            }

            console.log("▶️ Resuming consumer...");
            ws.send(JSON.stringify({
              type: "resumeConsumer",
              consumerId: consumer.id
            }));
          } catch (e) {
            console.error("❌ Consuming error:", e);
          }
        }
      };
    }

    connectWebSocket();

    return () => {
      mountedRef.current = false;
      // Don't cleanup during development Fast Refresh
      if (process.env.NODE_ENV === 'development') {
        console.log("⚠️ Skipping cleanup in development (Fast Refresh)");
        return;
      }
      console.log("🧹 Cleaning up...");
      if (localVideoRef.current?.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }

      sendTransportRef.current?.close();
      recvTransportRef.current?.close();
      pcRef.current?.close();

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [meetingId, session]);

  const cleanupAndExit = () => {
    mountedRef.current = false;
    console.log("🧹 Cleaning up...");
    if (localVideoRef.current?.srcObject) {
      const stream = localVideoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }

    sendTransportRef.current?.close();
    recvTransportRef.current?.close();
    pcRef.current?.close();

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close();
    }

    router.push('/');
  };

  return (
    <div className="w-full h-screen bg-black flex flex-col">
      {/* Status Messages */}
      <div className="absolute top-4 left-4 z-50 flex flex-col gap-2">
        <div className="bg-black/50 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-sm flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${connectionStatus === "Connected" ? 'bg-green-500 animate-pulse' :
              connectionStatus === "Error" ? 'bg-red-500' : 'bg-yellow-500'
            }`} />
          <span>{connectionStatus}</span>
        </div>
        {wsError && (
          <div className="bg-red-600/90 text-white px-4 py-2 rounded-lg text-sm">
            {wsError}
          </div>
        )}
      </div>

      {/* Camera Error Message */}
      {cameraError && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg z-50">
          {cameraError}
        </div>
      )}

      {/* GRID */}
      <div className="flex-1 grid grid-cols-2 gap-2 p-2">
        {Array.from(remoteStreams.entries()).map(([id, stream]) => (
          <video
            key={id}
            autoPlay
            playsInline
            ref={(video) => {
              if (video && video.srcObject !== stream) {
                console.log("🎬 Setting remote video for:", id);
                video.srcObject = stream;
              }
            }}
            className="w-full h-full object-cover rounded-lg"
          />
        ))}
        {remoteStreams.size === 0 && (
          <div className="col-span-2 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <div className="text-6xl mb-4">📹</div>
              <div>Waiting for others to join...</div>
            </div>
          </div>
        )}
      </div>

      {/* LOCAL */}
      <video
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
        className="w-48 h-36 absolute bottom-20 right-4 rounded-lg border border-white object-cover"
      />

      {/* CONTROLS */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
        <button
          onClick={cleanupAndExit}
          className="bg-red-600 px-6 py-3 rounded-full text-white hover:bg-red-700 transition-colors"
        >
          {isHost ? "End Meeting" : "Leave"}
        </button>
      </div>
    </div>
  );
}