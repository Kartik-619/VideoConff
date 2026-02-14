'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function MeetingRoom() {
  const params = useParams();
  const meetingId = params.meetingId as string;

  const router = useRouter();
  const { data: session } = useSession();

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

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

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    pcRef.current = pc;

    //receive video (remote)
    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

  // Send ICE safely
    pc.onicecandidate = (event) => {
      if (event.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "ice",
          roomId: meetingId,
          payload: event.candidate
        }));
      }
    };

    //function for camera access
    async function getMedia() {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          width: 1280, height: 720, facingMode: "user" },
        audio: true,
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });
    }
      //message to join the meeting
    ws.onopen = async () => {
      ws.send(JSON.stringify({
        type: "join",
        roomId: meetingId
      }));

      await getMedia();
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);

      if (data.type === "create-offer") {
        if (pc.signalingState !== "closed") {
          
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
      
          ws.send(JSON.stringify({
            type: "offer",
            roomId: meetingId,
            payload: offer
          }));
        }
      }

      if (data.type === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data.payload));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        ws.send(JSON.stringify({
          type: "answer",
          roomId: meetingId,
          payload: answer
        }));
      }

      if (data.type === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(data.payload));
      }

      if (data.type === "ice-candidate") {
        if (pc.remoteDescription) {
          try{
            await pc.addIceCandidate(new RTCIceCandidate(data.payload));

          }catch(e){
            console.log("Error while using ice candidates",e)
          }
        }
      }
    };

    return () => {
      pc.close();
      ws.close();
    };

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
