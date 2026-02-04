"use client";
import { useEffect, useRef } from "react";

export default function Sender() {
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef=useRef<WebSocket|null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');
    wsRef.current=ws;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    pcRef.current = pc;

    async function getMedia() {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            width:1280,
            height:720,
            facingMode:"user"
        },
        audio: true
      });

      streamRef.current = stream;

      // Show local video
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

  //returns media stream(audio+video) and then we add it to the RTCconnection using addTrack()
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });
    }

    getMedia();
  }, []);

  return (
    <div>
      <video ref={localVideoRef} autoPlay playsInline muted />
    </div>
  );
}
