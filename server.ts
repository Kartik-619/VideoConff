import { WebSocketServer, WebSocket } from "ws"
import { randomUUID } from "crypto"

type Peer = {
 id:string
 socket:WebSocket
}

const rooms = new Map<string, Map<string, Peer>>()

const wss = new WebSocketServer({ port:8080 })
console.log("WebSocket server running on ws://localhost:8080")
wss.on("connection",(ws)=>{
    console.log("New client connected")
let roomId:string
let peerId:string

ws.on("message",(msg)=>{

const data = JSON.parse(msg.toString())

if(data.type==="join"){

roomId = data.roomId
peerId = randomUUID()

if(!rooms.has(roomId))
 rooms.set(roomId,new Map())

const room = rooms.get(roomId)!

room.set(peerId,{id:peerId,socket:ws})

room.forEach(peer=>{

 if(peer.id===peerId) return

 peer.socket.send(JSON.stringify({
  type:"new-peer",
  peerId
 }))

})

room.forEach(peer=>{
 peer.socket.send(JSON.stringify({
  type:"participants",
  size:room.size
 }))
})

}

if(data.type==="offer"){

rooms.get(roomId)
 ?.get(data.target)
 ?.socket.send(JSON.stringify({
  type:"offer",
  from:peerId,
  offer:data.offer
 }))

}

if(data.type==="answer"){

rooms.get(roomId)
 ?.get(data.target)
 ?.socket.send(JSON.stringify({
  type:"answer",
  from:peerId,
  answer:data.answer
 }))

}

if(data.type==="ice-candidate"){

rooms.get(roomId)
 ?.get(data.target)
 ?.socket.send(JSON.stringify({
  type:"ice-candidate",
  from:peerId,
  candidate:data.candidate
 }))

}

})

ws.on("close",()=>{

const room = rooms.get(roomId)
if(!room) return

room.delete(peerId)

room.forEach(peer=>{
 peer.socket.send(JSON.stringify({
  type:"peer-left",
  peerId
 }))
})

room.forEach(peer=>{
 peer.socket.send(JSON.stringify({
  type:"participants",
  size:room.size
 }))
})

if(room.size===0)
 rooms.delete(roomId)

})

})