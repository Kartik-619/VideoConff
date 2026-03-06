'use client'

import * as mediasoupClient from "mediasoup-client"
import { useEffect,useRef,useState } from "react"
import { useParams,useRouter } from "next/navigation"
import { useSession } from "next-auth/react"
import { types as mediasoupTypes } from "mediasoup-client"

import {
FaMicrophone,
FaMicrophoneSlash,
FaVideo,
FaVideoSlash,
FaDesktop,
FaThLarge,
FaUserFriends,
FaPhoneSlash
} from "react-icons/fa"

export default function MeetingRoom(){

const params = useParams()
const meetingId = params.meetingId as string

const router = useRouter()
const { data:session } = useSession()

const wsRef = useRef<WebSocket|null>(null)
const reconnectAttempts = useRef(0)

const deviceRef = useRef<mediasoupClient.Device|null>(null)

const sendTransportRef = useRef<mediasoupTypes.Transport|null>(null)
const recvTransportRef = useRef<mediasoupTypes.Transport|null>(null)

const localVideoRef = useRef<HTMLVideoElement>(null)

const producedRef = useRef(false)
const startedRef = useRef(false)

const screenTrackRef = useRef<MediaStreamTrack|null>(null)

const [remoteStreams,setRemoteStreams] =
useState<Map<string,MediaStream>>(new Map())

const [activeSpeaker,setActiveSpeaker] =
useState<string|null>(null)

const [viewMode,setViewMode] =
useState<'grid'|'speaker'>('grid')

const [isMuted,setIsMuted] = useState(false)
const [cameraOff,setCameraOff] = useState(false)

const [screenSharing,setScreenSharing] = useState(false)

const [connectionStatus,setConnectionStatus] =
useState("Connecting...")

const participants = remoteStreams.size + 1



/* ---------------- GRID ALGORITHM ---------------- */

let gridCols = 1

if(participants<=1) gridCols=1
else if(participants<=4) gridCols=2
else if(participants<=9) gridCols=3
else gridCols=4



/* ---------------- PRODUCE CAMERA ---------------- */

async function startProducing(
transport:mediasoupTypes.Transport
){

if(producedRef.current) return
producedRef.current=true

const stream =
await navigator.mediaDevices.getUserMedia({
video:true,
audio:true
})

if(localVideoRef.current){
localVideoRef.current.srcObject = stream
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
track:stream.getAudioTracks()[0]
})

}



/* ---------------- SCREEN SHARE ---------------- */

async function startScreenShare(){

try{

if(screenSharing){

screenTrackRef.current?.stop()
setScreenSharing(false)
return

}

const stream =
await navigator.mediaDevices.getDisplayMedia({
video:true
})

const track = stream.getVideoTracks()[0]

const transport = sendTransportRef.current
if(!transport) return

await transport.produce({track})

screenTrackRef.current = track
setScreenSharing(true)

track.onended = ()=> setScreenSharing(false)

}catch(err){
console.error(err)
}

}



/* ---------------- WEBSOCKET ---------------- */

function connectWebSocket(){

const ws = new WebSocket("ws://localhost:8080")
wsRef.current = ws

ws.onopen = ()=>{

setConnectionStatus("Connected")

ws.send(JSON.stringify({
type:"join",
roomId:meetingId,
userId:session?.user?.id
}))

}



ws.onmessage = async(e)=>{

const data = JSON.parse(e.data)



if(data.type==="activeSpeaker"){
setActiveSpeaker(data.producerId)
}



if(data.type==="meetingEnded"){
alert("Meeting ended")
cleanupAndExit()
}



if(data.type==="rtpCapabilities"){

const device = new mediasoupClient.Device()

await device.load({
routerRtpCapabilities:data.data
})

deviceRef.current=device

ws.send(JSON.stringify({type:"createTransport",direction:"send"}))
ws.send(JSON.stringify({type:"createTransport",direction:"recv"}))

}



if(data.type==="transportCreated"){

const device = deviceRef.current
if(!device) return

let transport:mediasoupTypes.Transport



if(data.data.direction==="send"){

transport=device.createSendTransport(data.data)
sendTransportRef.current=transport

transport.on("connect",({dtlsParameters},cb)=>{

ws.send(JSON.stringify({
type:"connectTransport",
transportId:transport.id,
dtlsParameters
}))

cb()

})

transport.on("produce",(p,cb)=>{

ws.send(JSON.stringify({
type:"producer",
transportId:transport.id,
kind:p.kind,
rtpParameters:p.rtpParameters
}))

const handler=(e:MessageEvent)=>{

const res = JSON.parse(e.data)

if(res.type==="produced"){

cb({id:res.data.producerId})
ws.removeEventListener("message",handler)

}

}

ws.addEventListener("message",handler)

})

startProducing(transport)

}



else{

transport=device.createRecvTransport(data.data)
recvTransportRef.current=transport

transport.on("connect",({dtlsParameters},cb)=>{

ws.send(JSON.stringify({
type:"connectTransport",
transportId:transport.id,
dtlsParameters
}))

cb()

})

}

}



if(data.type==="producer"){

const transport=recvTransportRef.current
const device=deviceRef.current

if(!transport||!device) return

setTimeout(()=>{

ws.send(JSON.stringify({
type:"consumer",
producerId:data.data.producerId,
transportId:transport.id,
rtpCapabilities:device.rtpCapabilities
}))

},200)

}



if(data.type==="consumerCreated"){

const transport=recvTransportRef.current
if(!transport) return

const consumer =
await transport.consume(data.data)

const stream = new MediaStream()
stream.addTrack(consumer.track)

setRemoteStreams(prev=>{
const updated=new Map(prev)
updated.set(data.data.producerId,stream)
return updated
})

setActiveSpeaker(prev=>prev??data.data.producerId)

ws.send(JSON.stringify({
type:"resumeConsumer",
consumerId:consumer.id
}))

}

}



ws.onclose = ()=>{

setConnectionStatus("Disconnected")

if(reconnectAttempts.current<5){

setTimeout(()=>{
reconnectAttempts.current++
connectWebSocket()
},2000)

}

}

}



/* ---------------- INIT ---------------- */

useEffect(()=>{

if(!meetingId || !session?.user?.id) return
if(startedRef.current) return

startedRef.current=true
connectWebSocket()

},[meetingId,session])



/* ---------------- EXIT ---------------- */

function cleanupAndExit(){

sendTransportRef.current?.close()
recvTransportRef.current?.close()
wsRef.current?.close()

router.push("/")

}



/* ---------------- UI ---------------- */

return(

<div className="w-full h-screen bg-black flex flex-col">

{/* STATUS */}

<div className="absolute top-4 left-4 text-white bg-black/60 px-3 py-1 rounded">
{connectionStatus}
</div>

<div className="absolute top-4 right-4 text-white bg-black/60 px-3 py-1 rounded">
Participants: {participants}
</div>



{/* VIDEO AREA */}

<div
className={`flex-1 p-2 ${
viewMode==="grid"
? "grid gap-2 overflow-y-auto"
: "flex flex-col"
}`}
style={
viewMode==="grid"
?{gridTemplateColumns:`repeat(${gridCols},1fr)`}
:undefined
}
>



{/* SPEAKER VIEW */}

{viewMode==="speaker" && (

<div className="flex flex-col h-full">

<div className="flex-1 flex items-center justify-center">

{activeSpeaker && remoteStreams.get(activeSpeaker)?(

<video
autoPlay
playsInline
ref={v=>{
const s = remoteStreams.get(activeSpeaker)
if(v&&s)v.srcObject=s
}}
className="w-[80vw] h-[70vh] object-contain rounded-xl"
/>

):(

<video
autoPlay
muted
playsInline
ref={localVideoRef}
className="w-[80vw] h-[70vh] object-contain rounded-xl"
/>

)}

</div>



<div className="flex gap-2 overflow-x-auto p-2">

<video
autoPlay
muted
playsInline
ref={localVideoRef}
className="w-32 h-24 object-cover rounded"
/>

{Array.from(remoteStreams.entries()).map(([id,stream])=>(

<video
key={id}
autoPlay
playsInline
ref={v=>{
if(v&&v.srcObject!==stream)v.srcObject=stream
}}
className="w-32 h-24 object-cover rounded"
/>

))}

</div>

</div>

)}



{/* GRID VIEW */}

{viewMode==="grid" && (

<>

<video
autoPlay
muted
playsInline
ref={localVideoRef}
className="w-full h-full object-cover rounded"
/>

{Array.from(remoteStreams.entries()).map(([id,stream])=>(

<video
key={id}
autoPlay
playsInline
ref={v=>{
if(v&&v.srcObject!==stream)v.srcObject=stream
}}
className={`w-full h-full object-cover rounded ${
activeSpeaker===id?"ring-4 ring-blue-500":""
}`}
/>

))}

</>

)}

</div>



{/* CONTROLS */}

<div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-4 bg-black/70 px-8 py-4 rounded-full">

<button
onClick={()=>{
const stream=localVideoRef.current?.srcObject as MediaStream
stream?.getAudioTracks().forEach(t=>t.enabled=!t.enabled)
setIsMuted(p=>!p)
}}
className="bg-gray-700 p-3 rounded-full text-white"
>
{isMuted?<FaMicrophoneSlash/>:<FaMicrophone/>}
</button>

<button
onClick={()=>{
const stream=localVideoRef.current?.srcObject as MediaStream
stream?.getVideoTracks().forEach(t=>t.enabled=!t.enabled)
setCameraOff(p=>!p)
}}
className="bg-gray-700 p-3 rounded-full text-white"
>
{cameraOff?<FaVideoSlash/>:<FaVideo/>}
</button>

<button
onClick={()=>setViewMode("grid")}
className={`p-3 rounded-full text-white ${
viewMode==="grid"?"bg-blue-600":"bg-gray-700"
}`}
>
<FaThLarge/>
</button>

<button
onClick={()=>setViewMode("speaker")}
className={`p-3 rounded-full text-white ${
viewMode==="speaker"?"bg-blue-600":"bg-gray-700"
}`}
>
<FaUserFriends/>
</button>

<button
onClick={startScreenShare}
className={`p-3 rounded-full text-white ${
screenSharing?"bg-green-600":"bg-blue-600"
}`}
>
<FaDesktop/>
</button>

<button
onClick={cleanupAndExit}
className="bg-red-600 p-3 rounded-full text-white"
>
<FaPhoneSlash/>
</button>

</div>

</div>

)

}