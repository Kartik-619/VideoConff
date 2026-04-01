'use client'

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSession } from "next-auth/react"

import {
FaMicrophone,
FaMicrophoneSlash,
FaVideo,
FaVideoSlash,
FaDesktop,
FaPhoneSlash
} from "react-icons/fa"

export default function MeetingRoom(){

const {meetingId}=useParams()
const router=useRouter()
const {data:session}=useSession()

const wsRef=useRef<WebSocket|null>(null)

const peersRef=useRef<Map<string,RTCPeerConnection>>(new Map())

const [localStream,setLocalStream]=useState<MediaStream|null>(null)

const [remoteStreams,setRemoteStreams]=
useState<Map<string,MediaStream>>(new Map())

const localVideoRef=useRef<HTMLVideoElement>(null)

const [participants,setParticipants]=useState(1)

const [isMuted,setIsMuted]=useState(false)
const [cameraOff,setCameraOff]=useState(false)
const [screenSharing,setScreenSharing]=useState(false)

const configuration={
iceServers:[
{urls:"stun:stun.l.google.com:19302"}
]
}

async function startMedia(){

const stream=
await navigator.mediaDevices.getUserMedia({
video:true,
audio:true
})

setLocalStream(stream)

if(localVideoRef.current)
localVideoRef.current.srcObject=stream
}

function createPeerConnection(peerId:string){

const pc=new RTCPeerConnection(configuration)

localStream?.getTracks().forEach(track=>{
pc.addTrack(track,localStream)
})

pc.ontrack=(event)=>{

setRemoteStreams(prev=>{

const map=new Map(prev)

map.set(peerId,event.streams[0])

return map
})
}

pc.onicecandidate=(event)=>{

if(event.candidate){

wsRef.current?.send(JSON.stringify({
type:"ice-candidate",
target:peerId,
candidate:event.candidate
}))
}

}

peersRef.current.set(peerId,pc)

return pc
}

async function createOffer(peerId:string){

const pc=createPeerConnection(peerId)

const offer=await pc.createOffer()

await pc.setLocalDescription(offer)

wsRef.current?.send(JSON.stringify({
type:"offer",
target:peerId,
offer
}))
}

async function handleOffer(data:any){

const pc=createPeerConnection(data.from)

await pc.setRemoteDescription(data.offer)

const answer=await pc.createAnswer()

await pc.setLocalDescription(answer)

wsRef.current?.send(JSON.stringify({
type:"answer",
target:data.from,
answer
}))
}

async function handleAnswer(data:any){

  const pc = peersRef.current.get(data.from)
  
  if(!pc) return
  
  // prevent wrong state error
  if (pc.signalingState !== "have-local-offer") {
    console.log("Skipping answer, state:", pc.signalingState)
    return
  }
  
  await pc.setRemoteDescription(
    new RTCSessionDescription(data.answer)
  )
  }

async function handleIceCandidate(data:any){

const pc=peersRef.current.get(data.from)

if(!pc) return

await pc.addIceCandidate(data.candidate)
}

function connectWebSocket(){

const ws=new WebSocket("ws://localhost:8080")

wsRef.current=ws

ws.onopen=()=>{

ws.send(JSON.stringify({
type:"join",
roomId:meetingId,
userId:session?.user?.id
}))
}

ws.onmessage=async(event)=>{

const data=JSON.parse(event.data)

if(data.type==="participants")
setParticipants(data.size)

if(data.type==="new-peer"){
createOffer(data.peerId)
}

if(data.type==="offer")
handleOffer(data)

if(data.type==="answer")
handleAnswer(data)

if(data.type==="ice-candidate")
handleIceCandidate(data)

if(data.type==="peer-left"){

setRemoteStreams(prev=>{
const map=new Map(prev)
map.delete(data.peerId)
return map
})

const pc=peersRef.current.get(data.peerId)

pc?.close()

peersRef.current.delete(data.peerId)
}

}

}

useEffect(()=>{

if(!meetingId) return

startMedia().then(connectWebSocket)

},[meetingId])

function toggleMute(){

localStream?.getAudioTracks().forEach(
t=>t.enabled=!t.enabled
)

setIsMuted(p=>!p)
}

function toggleCamera(){

localStream?.getVideoTracks().forEach(
t=>t.enabled=!t.enabled
)

setCameraOff(p=>!p)
}

async function startScreenShare(){

if(screenSharing){
window.location.reload()
return
}

const stream=
await navigator.mediaDevices.getDisplayMedia({
video:true
})

const track=stream.getVideoTracks()[0]

peersRef.current.forEach(pc=>{

const sender=
pc.getSenders()
.find(s=>s.track?.kind==="video")

sender?.replaceTrack(track)

})

setScreenSharing(true)

track.onended=()=>{
window.location.reload()
}

}

function leaveMeeting(){

wsRef.current?.close()

peersRef.current.forEach(pc=>pc.close())

router.push("/")
}

return(

<div className="w-full h-screen bg-black">
<div className="grid grid-cols-2 gap-4 p-6 h-full">

{Array.from(remoteStreams.entries()).map(([peerId, stream]) => (
  <video
    key={peerId}
    autoPlay
    playsInline
    ref={(video)=>{
      if(video) video.srcObject = stream
    }}
    className="w-full rounded-lg border border-gray-700"
  />
))}

</div>
<video
ref={localVideoRef}
autoPlay
muted
playsInline
className="w-48 absolute bottom-24 right-6 rounded-lg border border-gray-700"/>

<div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 bg-gray-900/80 backdrop-blur px-6 py-3 rounded-full shadow-lg">

<button
onClick={toggleMute}
className="text-white text-xl p-3 bg-gray-700 rounded-full hover:bg-gray-600"
>
{isMuted ? <FaMicrophoneSlash/>:<FaMicrophone/>}
</button>

<button
onClick={toggleCamera}
className="text-white text-xl p-3 bg-gray-700 rounded-full hover:bg-gray-600"
>
{cameraOff ? <FaVideoSlash/>:<FaVideo/>}
</button>

<button
onClick={startScreenShare}
className="text-white text-xl p-3 bg-gray-700 rounded-full hover:bg-gray-600"
>
<FaDesktop/>
</button>

<button
onClick={leaveMeeting}
className="text-white text-xl p-3 bg-red-600 rounded-full hover:bg-red-500"
>
<FaPhoneSlash/>
</button>

</div>

</div>
)
}