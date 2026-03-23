import { WebSocketServer, WebSocket } from "ws";
import express from "express";
import bodyParser from "body-parser";
import { randomUUID } from "crypto";

import { createRouter } from "../app/mediasoup/router";
import { createTransport } from "@/app/mediasoup/transport";
import { createWebRTCServer } from "@/app/mediasoup/webrtc";
import { prisma } from "@/lib/prisma";
import { Peer } from "./types/types";

const app = express();
app.use(bodyParser.json());

const rooms = new Map<string, any>();

/* ---------------- MEETING PARTICIPANTS BROADCAST ---------------- */
function particpantNumber(roomId:string){
  const room = rooms.get(roomId);
  if (!room) return;
  const size=room.peers.size;
  
  room.peers.forEach((peer:any)=>{
    peer.socket.send(JSON.stringify({
      type:'participants',
      size
    }));

})

}
/* ---------------- MEETING END BROADCAST ---------------- */

function broadcastMeetingEnded(roomId: string) {

  const room = rooms.get(roomId);
  if (!room) return;

  room.peers.forEach((peer:any)=>{
    peer.socket.send(JSON.stringify({
      type:"meetingEnded"
    }));
  });

  console.log("Meeting ended broadcast:", roomId);
}

app.post("/endMeeting",(req,res)=>{

  const { meetingId } = req.body;

  broadcastMeetingEnded(meetingId);

  res.json({ ok:true });

});


/* ---------------- SERVER START ---------------- */

async function startServer(){

  const WebRTCServer = await createWebRTCServer();

  const wss = new WebSocketServer({ port:8080 });

  console.log("WebSocket running ws://localhost:8080");



/* ---------------- CLIENT CONNECTION ---------------- */

  wss.on("connection",(ws:WebSocket)=>{

    let roomId:string;
    let peerId:string;



/* ---------------- CLIENT MESSAGE ---------------- */

    ws.on("message",async(message)=>{

      const data = JSON.parse(message.toString());



/* ---------------- JOIN ROOM ---------------- */

      if(data.type === "join"){

        const userId= await prisma.user.findFirst({
          where:{
            id:data.userId
          }
        });

        if(!userId){
          console.error('The User does not exists, Signup to continue');
          return;
        }


        roomId = data.roomId;
        peerId = randomUUID();

        if(!rooms.has(roomId)){

        const router = await createRouter();

          const audioLevelObserver =
          await router.createAudioLevelObserver({
            maxEntries:1,
            threshold:-80,
            interval:800
          });

          const room = {
            router,
            peers:new Map(),
            audioLevelObserver
          };
          //add broadcast particaipants 
 ;
          rooms.set(roomId,room);

          console.log("Room created:",roomId);
/* ---------------- ACTIVE SPEAKER DETECTION ---------------- */

          audioLevelObserver.on("volumes",(volumes)=>{

            const { producer } = volumes[0];

            room.peers.forEach((peer:any)=>{

              peer.socket.send(JSON.stringify({
                type:"activeSpeaker",
                producerId:producer.id
              }));

            });

          });

        }

        const name=await prisma.user.findFirst({
          where:{
            id:data.userId,
          }
        })

        const room = rooms.get(roomId);

          const peer:Peer = {
          name:userId.name,
          socket:ws,
          transports:new Map(),
          producers:new Map(),
          consumers:new Map()
        };

        room.peers.set(peerId,peer);

        console.log("Peer joined:",peerId);
        particpantNumber(roomId)



/* ---------------- SEND ROUTER CAPABILITIES ---------------- */

        ws.send(JSON.stringify({
          type:"rtpCapabilities",
          data:room.router.rtpCapabilities
        }));



/* ---------------- SEND EXISTING PRODUCERS ---------------- */

        room.peers.forEach((otherPeer:any,otherPeerId:string)=>{

          if(otherPeerId === peerId) return;

          otherPeer.producers.forEach((producer:any)=>{

            ws.send(JSON.stringify({
              type:"producer",
              data:{
                producerId:producer.id,
                kind:producer.kind,
                peerId:otherPeerId
              }
            }));

          });

        });

      }



/* ---------------- CREATE TRANSPORT ---------------- */

      if(data.type==="createTransport"){

        const room = rooms.get(roomId);
        const peer = room?.peers.get(peerId);

        if(!room || !peer) return;

        const transport =
        await createTransport(room.router,WebRTCServer);

        peer.transports.set(transport.id,transport);

        ws.send(JSON.stringify({
          type:"transportCreated",
          data:{
            direction:data.direction,
            id:transport.id,
            iceParameters:transport.iceParameters,
            iceCandidates:transport.iceCandidates,
            dtlsParameters:transport.dtlsParameters
          }
        }));

      }



/* ---------------- CONNECT TRANSPORT ---------------- */

      if(data.type==="connectTransport"){

        const room = rooms.get(roomId);
        const peer = room?.peers.get(peerId);

        const transport =
        peer?.transports.get(data.transportId);

        if(!transport) return;

        await transport.connect({
          dtlsParameters:data.dtlsParameters
        });

      }



/* ---------------- PRODUCER ---------------- */

      if(data.type==="producer"){

        const room = rooms.get(roomId);
        const peer = room?.peers.get(peerId);

        if(!room || !peer) return;

        const transport =
        peer.transports.get(data.transportId);

        if(!transport) return;

        const producer = await transport.produce({
          kind:data.kind,
          rtpParameters:data.rtpParameters
        });

        peer.producers.set(producer.id,producer);



/* ---------------- AUDIO LEVEL OBSERVER ---------------- */

        if(producer.kind === "audio"){

          room.audioLevelObserver.addProducer({
            producerId:producer.id
          });

        }



/* ---------------- CONFIRM PRODUCER ---------------- */

        ws.send(JSON.stringify({
          type:"produced",
          data:{producerId:producer.id}
        }));



/* ---------------- INFORM OTHER PEERS ---------------- */

        room.peers.forEach((p:any,id:string)=>{

          if(id === peerId) return;

          p.socket.send(JSON.stringify({
            type:"producer",
            data:{producerId:producer.id}
          }));

        });

      }



/* ---------------- CONSUMER ---------------- */

      if(data.type==="consumer"){

        const room = rooms.get(roomId);
        const peer = room?.peers.get(peerId);

        if(!room || !peer) return;

        const transport =
        peer.transports.get(data.transportId);

        if(!transport) return;

        if(!room.router.canConsume({
          producerId:data.producerId,
          rtpCapabilities:data.rtpCapabilities
        })) return;

        const consumer = await transport.consume({
          producerId:data.producerId,
          rtpCapabilities:data.rtpCapabilities,
          paused:true
        });

        peer.consumers.set(consumer.id,consumer);

        ws.send(JSON.stringify({
          type:"consumerCreated",
          data:{
            id:consumer.id,
            producerId:data.producerId,
            kind:consumer.kind,
            rtpParameters:consumer.rtpParameters
          }
        }));

      }



/* ---------------- RESUME CONSUMER ---------------- */

      if(data.type==="resumeConsumer"){

        const room = rooms.get(roomId);
        const peer = room?.peers.get(peerId);

        const consumer =
        peer?.consumers.get(data.consumerId);

        if(!consumer) return;

        await consumer.resume();

      }

    });



/* ---------------- PEER DISCONNECT ---------------- */

    ws.on("close",()=>{

      const room = rooms.get(roomId);
      if(!room) return;

      const peer = room.peers.get(peerId);
      if(!peer) return;

      peer.transports.forEach((t:any)=>t.close());
      peer.producers.forEach((p:any)=>p.close());
      peer.consumers.forEach((c:any)=>c.close());

      room.peers.delete(peerId);
      particpantNumber(roomId)

      console.log("Peer left:",peerId);



/* ---------------- ROOM CLEANUP ---------------- */

      setTimeout(()=>{

        const r = rooms.get(roomId);

        if(r && r.peers.size===0){
          rooms.delete(roomId);
          console.log("Room destroyed:",roomId);
        }

      },30000);

    });

  });



/* ---------------- HTTP SERVER ---------------- */

  app.listen(8080,'0.0.0.0',()=>{
    console.log("WebSocket running ws://localhost:8080");
  });

}

startServer();