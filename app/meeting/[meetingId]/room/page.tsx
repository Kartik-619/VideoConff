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
import next from "next";

let producer: mediasoupTypes.Producer;
let rtpParameters: mediasoupTypes.RtpParameters;


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
          ws.send(JSON.stringify({
            type: "createTransport"
          }));

          // Request second transport for receiving
          setTimeout(() => {
            ws.send(JSON.stringify({
              type: "createTransport"
            }));
          }, 100);
        } catch (e) {
          console.warn("Browser not supported", e);
        }
      }
      if (data.type === 'transportCreated') {
        const transportData = data.data;
        if (!deviceRef.current) return;
        const transport= deviceRef.current?.createSendTransport(transportData);
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = stream.getVideoTracks()[0];
        const producer = await transport.produce(
          {
            track: videoTrack,
            encodings:
              [
                { maxBitrate: 100000 },
                { maxBitrate: 300000 },
                { maxBitrate: 900000 }
              ],
            codecOptions:
            {
              videoGoogleStartBitrate: 1000
            }
          });
        if (!sendTransportRef.current) {
          sendTransportRef.current = transport;
        } else if (!recvTransportRef.current) {
          recvTransportRef.current = transport;
        }
      }

    if(data.type==="createTransport"){
      if (!deviceRef.current) return;

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
    <div className="w-full h-screen bg-black relative">

      {/* Remote Video */}
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover absolute inset-0"
      />

      {/* Local Video */}
      <video
        ref={localVideoRef}
        autoPlay
        muted
        playsInline
        className="w-48 h-36 object-cover absolute bottom-4 right-4 rounded-lg border border-white"
      />

      {/* Controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4">
        {isHost ? (
          <button
            onClick={handleEnd}
            className="bg-red-600 px-6 py-3 rounded-full text-white font-semibold"
          >
            End Meeting
          </button>
        ) : (
          <button
            onClick={handleLeave}
            className="bg-red-500 px-6 py-3 rounded-full text-white font-semibold"
          >
            Leave
          </button>
        )}
      </div>

    </div>
  );
}
