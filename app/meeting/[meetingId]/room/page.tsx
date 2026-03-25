'use client'

import * as mediasoupClient from "mediasoup-client"
import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
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
  FaThLarge,
  FaUserFriends,
  FaPhoneSlash
} from "react-icons/fa";

export default function MeetingRoom() {

  const params = useParams()
  const meetingId = params.meetingId as string

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

  const [screenSharing, setScreenSharing] = useState(false)

  const [connectionStatus, setConnectionStatus] =
    useState("Connecting...");
  const [participants, setParticipants] = useState(0);
  /* ---------------- PRODUCE CAMERA ---------------- */
  const allStreams = useMemo(() => {

    const streams: MediaStream[] = []
  
    if (localStream) {
      streams.push(localStream)
    }
  
    remoteStreams.forEach((stream) => {
      streams.push(stream)
    })
  
    return streams
  
  }, [localStream, remoteStreams])
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
    setLocalStream(stream);
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream
    }
    if (localThumbRef.current) {
      localThumbRef.current.srcObject = stream
    }

    await transport.produce({
      track: stream.getVideoTracks()[0],

      encodings: [
        {
          maxBitrate: 100000,
          scaleResolutionDownBy: 4
        },
        {
          maxBitrate: 300000,
          scaleResolutionDownBy: 2
        },
        {
          maxBitrate: 900000,
          scaleResolutionDownBy: 1
        }
      ],

      codecOptions: {
        videoGoogleStartBitrate: 1000
      }
    });

    await transport.produce({
      track: stream.getAudioTracks()[0]
    })

  }

  /* ---------------- SCREEN SHARE ---------------- */

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

  /* ---------------- WEBSOCKET ---------------- */

  function connectWebSocket() {

    const protocol =window.location.protocol === "https:" ? "wss" : "ws"
    const ws = new WebSocket( `${protocol}://${window.location.hostname}:8080`)
    wsRef.current = ws

    ws.onopen = () => {

      setConnectionStatus("Connected")

      ws.send(JSON.stringify({
        type: "join",
        roomId: meetingId,
        userId: session?.user?.id,
      }))

    }



    ws.onmessage = async (e) => {

      const data = JSON.parse(e.data)

      if (data.type === 'participants') {
        setParticipants(data.size);
      }

      if (data.type === "activeSpeaker") {
        setActiveSpeaker(data.producerId)
      }



      if (data.type === "meetingEnded") {
        alert("Meeting ended")
        cleanupAndExit()
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

        }



        else {

          transport = device.createRecvTransport(data.data)
          recvTransportRef.current = transport

          transport.on("connect", ({ dtlsParameters }, cb) => {

            ws.send(JSON.stringify({
              type: "connectTransport",
              transportId: transport.id,
              dtlsParameters
            }))

            cb()

          })

        }

      }



      if (data.type === "producer") {

        const transport = recvTransportRef.current
        const device = deviceRef.current

        if (!transport || !device) return

        setTimeout(() => {

          ws.send(JSON.stringify({
            type: "consumer",
            producerId: data.data.producerId,
            transportId: transport.id,
            rtpCapabilities: device.rtpCapabilities
          }))

        }, 200)

      }



      if (data.type === "consumerCreated") {

        const transport = recvTransportRef.current
        if (!transport) return

        const consumer =
          await transport.consume(data.data);
        //Instead of mapping by producerId,we merge tracks into the same MediaStream.
        setRemoteStreams(prev => {

          const updated = new Map(prev)

          let stream = updated.get(data.data.producerId)

          if (!stream) {
            stream = new MediaStream()
            updated.set(data.data.producerId, stream)
          }

          stream.addTrack(consumer.track)

          return updated
        })

        setActiveSpeaker(prev => prev ?? data.data.producerId)

        ws.send(JSON.stringify({
          type: "resumeConsumer",
          consumerId: consumer.id
        }))

      }

    }



    ws.onclose = () => {

      setConnectionStatus("Disconnected")

      if (reconnectAttempts.current < 5) {

        setTimeout(() => {
          reconnectAttempts.current++
          connectWebSocket()
        }, 2000)

      }

    }

  }

  useEffect(() => {

    if (!meetingId || !session?.user?.id) return
    if (startedRef.current) return

    startedRef.current = true
    connectWebSocket()

  }, [meetingId, session])

  /* ---------------- EXIT ---------------- */

  function cleanupAndExit() {

    sendTransportRef.current?.close()
    recvTransportRef.current?.close()
    wsRef.current?.close()

    router.push("/")

  }


  return (

    <div className="w-full h-screen bg-black flex flex-col">

      {/* STATUS */}
      <div className="absolute top-4 right-4 text-white bg-black/60 px-3 py-1 rounded">
        participants:{participants}
      </div>
      <div className="absolute top-4 left-4 text-white bg-black/60 px-3 py-1 rounded">
        {connectionStatus}
      </div>
      <LayoutCall participants={allStreams.length}>

        {allStreams.map((stream, i) => {

          if (stream.getVideoTracks().length === 0) return null

          return (
            <VideoTile
              key={i}
              stream={stream}
              muted={stream === localStream}
            />
          )

        })}

      </LayoutCall>
      {/* CONTROLS */}
      <video
        ref={localThumbRef}
        autoPlay
        muted
        playsInline
        className="absolute bottom-24 right-6 w-48 h-32 rounded-lg border border-white object-cover"
      />
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 bg-black/70 px-8 py-4 rounded-full">

        <button
          onClick={() => {
            const stream = localVideoRef.current?.srcObject as MediaStream
            stream?.getAudioTracks().forEach(t => t.enabled = !t.enabled)
            setIsMuted(p => !p)
          }}
          className="bg-gray-700 p-3 rounded-full text-white"
        >
          {isMuted ? <FaMicrophoneSlash /> : <FaMicrophone />}
        </button>

        <button
          onClick={() => {
            const stream = localVideoRef.current?.srcObject as MediaStream
            stream?.getVideoTracks().forEach(t => t.enabled = !t.enabled)
            setCameraOff(p => !p)
          }}
          className="bg-gray-700 p-3 rounded-full text-white"
        >
          {cameraOff ? <FaVideoSlash /> : <FaVideo />}
        </button>

        <button
          onClick={() => setViewMode("speaker")}
          className={`p-3 rounded-full text-white ${viewMode === "speaker" ? "bg-blue-600" : "bg-gray-700"
            }`}
        >
          <FaUserFriends />
        </button>

        <button
          onClick={startScreenShare}
          className={`p-3 rounded-full text-white ${screenSharing ? "bg-green-600" : "bg-blue-600"
            }`}
        >
          <FaDesktop />
        </button>

        <button
          onClick={cleanupAndExit}
          className="bg-red-600 p-3 rounded-full text-white"
        >
          <FaPhoneSlash />
        </button>

      </div>

    </div>

  )

}