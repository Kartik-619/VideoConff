'use client';
import * as mediasoupClient from "mediasoup-client";
import {
  types,
  version,
  Device,
  detectDevice,
  detectDeviceAsync,
  parseScalabilityMode,
  ortc,
  enhancedEvents,
  FakeHandler,
  testFakeParameters,
  debug
} from "mediasoup-client";
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

import { types as mediasoupTypes } from "mediasoup-client";




export default function MeetingRoom() {

  const params = useParams();
  const meetingId = params.meetingId as string;
  const sendTransportRef = useRef<mediasoupTypes.Transport | null>(null);
  const deviceRef = useRef<mediasoupClient.Device | null>(null);
  const router = useRouter();
  const { data: session } = useSession();
  //const sendTransport: mediasoupTypes.Transport;
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const recvTransportRef = useRef<types.Transport | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const producedRef = useRef(false);

  const [isHost, setIsHost] = useState(false);

  //  Check if host
  useEffect(() => {
    const checkHost = async () => {
      //host sees end meeting while other members see leave meeting
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

  //  Auto exit if meeting ended
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



  //  WebRTC + WebSocket
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8080");
    wsRef.current = ws;
    let device: mediasoupTypes.Device;
    let sendTransport: mediasoupTypes.Transport;


    async function startProducing(transport: mediasoupTypes.Transport) {
      if (producedRef.current) return;
      producedRef.current = true;

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });

      if (localVideoRef.current)
        localVideoRef.current.srcObject = stream;

      await transport.produce({
        track: stream.getVideoTracks()[0]
      });

      await transport.produce({
        track: stream.getAudioTracks()[0]
      });
    }


    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: "join",
        roomId: meetingId,
        userId: session?.user?.id
      }));
    };

    ws.onmessage = async (e) => {
      const data = JSON.parse(e.data);
      console.log("received the data ", e.data.type);

      if (data.type === 'rtpCapabilities') {
        try {
          const device = new mediasoupClient.Device();
          await device.load({ routerRtpCapabilities: data.data });
          deviceRef.current = device;
          console.log("device loaded successully");
          ws.send(JSON.stringify({
            type: "createTransport"
          }));
          // Request second transport for receiving
          ws.send(JSON.stringify({
            type: "createTransport"
          }));



        } catch (e) {
          console.warn("Browser not supported", e);
        }
      }
      if (data.type === 'transportCreated') {
        const transportData = data.data;
        let transport;
        if (!deviceRef.current) return;
        if (!sendTransportRef.current) {

          transport =
            deviceRef.current.createSendTransport(
              transportData
            );

          sendTransportRef.current = transport;

        }
        else {

          transport =
            deviceRef.current.createRecvTransport(
              transportData
            );

          recvTransportRef.current = transport;
        }


        transport.on("connect", async ({ dtlsParameters }, callback, errback) => {
          try {
            await wsRef.current?.send(JSON.stringify({
              type: "connectTransport",
              transportId: transport.id,
              dtlsParameters
            })),

              callback();
            if (transport === sendTransportRef.current) {
              startProducing(transport);
            }
          } catch (e) {
            //its a medisoup type for error
            errback(e as Error);
          }
        });

        transport.on("produce", async (parameters, callback, errback) => {
          try {
            // Signal parameters to the server side transport and retrieve the id of 
            // the server side new producer.
            const data = await wsRef.current?.send(JSON.stringify({
              type: "producer",
              transportId: transport.id,
              kind: parameters.kind,
              rtpParameters: parameters.rtpParameters,
              appData: parameters.appData
            }));

            // Let's assume the server included the created producer id in the response
            // data object.
            // Wait for the server response with producer ID
            const messageHandler = (event: MessageEvent) => {
              const response = JSON.parse(event.data);
              if (response.type === "produced") {
                // Tell the transport that parameters were transmitted and provide it with the
                // server side producer's id.
                wsRef.current?.removeEventListener("message", messageHandler);
                callback({ id: response.data.producerId });
              }
            };
            wsRef.current?.addEventListener("message", messageHandler);




          } catch (e) {
            errback(e as Error);
          }
        });


      }

      if (data.type === "producer") {

        wsRef.current?.send(JSON.stringify({
          type: "consumer",
          producerId: data.data.producerId,
          transportId:
            recvTransportRef.current?.id,
          rtpCapabilities:
            deviceRef.current?.rtpCapabilities
        }));
      }


      if (data.type === 'consumerCreated') {
        if (!recvTransportRef.current) return;
        try {
          //consuming the data using receiver ref
          const consumer = await recvTransportRef.current.consume({
            id: data.data.id,
            producerId: data.data.producerId,
            kind: data.data.kind,
            rtpParameters: data.data.rtpParameters
          });
          if (data.data.kind === "video" && remoteVideoRef.current) {
            const remoteStream = new MediaStream();
            remoteStream.addTrack(consumer.track);
            remoteVideoRef.current.srcObject = remoteStream;
          }

          // Resume the consumer (unpause)
          ws.send(JSON.stringify({
            type: "resumeConsumer",
            consumerId: consumer.id
          }));
        } catch (e) {
          console.error("consuming error", e);
        }

      }

    }
    //message to join the meeting
  }, [meetingId]);

  //  Leave
  const handleLeave = async () => {
    await fetch('/api/meeting/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId }),
    });

    cleanupAndExit();
  };

  //  End
  const handleEnd = async () => {
    await fetch('/api/meeting/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId }),
    });

    cleanupAndExit();
  };

  const cleanupAndExit = () => {
    pcRef.current?.close();
    wsRef.current?.close();
    router.push('/');
  };

  return (
    <div className="w-full h-screen bg-black flex flex-col">

      {/* GRID */}

      <div
        className="flex-1 grid grid-cols-2 gap-2 p-2"
      >

        {
          Array.from(remoteStreams.entries())
            .map(([id, stream]) => (

<video key={id} autoPlay playsInline ref={(video) => {if (video) video.srcObject = stream;}} className="  w-full h-full object-cover rounded-lg"/>

            ))
        }

      </div>


      {/* LOCAL */}

      <video
        ref={localVideoRef} autoPlay muted playsInline className=" w-48 h-36 absolute bottom-20 right-4 rounded-lg border border-white "
      />


      {/* CONTROLS */}

      <div
        className="
absolute
bottom-6
left-1/2
-translate-x-1/2
"
      >

        <button
          onClick={cleanupAndExit}
          className="
bg-red-600
px-6
py-3
rounded-full
text-white
"
        >

          {isHost
            ? "End Meeting"
            : "Leave"}

        </button>

      </div>

    </div>

  );
  
}
