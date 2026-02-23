import { WebSocketServer, WebSocket } from "ws";
import * as mediasoup from 'mediasoup';
import { randomUUID } from "crypto";
import {Peer,Room} from './types/types';
import {createRouter} from '../app/mediasoup/router';
import { createTransport } from "@/app/mediasoup/transport";
import {createWebRTCServer} from '@/app/mediasoup/webrtc';

const WebRTCServer= await createWebRTCServer();
const wss = new WebSocketServer({ port: 8080 });


console.log(" Signaling server running on ws://localhost:8080");

const rooms = new Map<string, Room>();


wss.on("connection", (ws: WebSocket) => {
  let roomId: string;
  let peerId: string ;

  ws.on("message",async (message: WebSocket.RawData) => {
    const data = JSON.parse(message.toString());

    // ===== JOIN =====
    if (data.type === "join") {
       roomId = data.roomId;
      
      peerId = randomUUID();
      (ws as any).id = peerId;

      if (!rooms.has(roomId)) {
       const router=await createRouter();
      
       rooms.set(data.roomId, 
        {
          router,
          peers:new Map()
        });
      }

      rooms.get(roomId)!;

      console.log("User joined:", roomId);

      const peer: Peer = {
        socket: ws,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map()
      };

      const room = rooms.get(roomId);
      if (!room) return;
      
      room.peers.set(peerId, peer);

      console.log(`Peer ${peerId} joined room ${roomId}`);
    
      ws.send(JSON.stringify({
        type: "rtpCapabilities",
        data: room.router.rtpCapabilities
      }));
    }

    // ===== SIGNAL FORWARD =====
    if(data.type==="connectTransport"){
      const { transportId, dtlsParameters } = data;
      if(!roomId||!peerId) return;
      const room=rooms.get(roomId);
      if(!room ) return;
      const peer=await room?.peers.get(peerId);
      if (!peer || !peer.transports) {
        console.error("Peer or transport missing");
        return;
      }
      
      const transport=peer?.transports.get(transportId);
      if (!transport){
        console.log("Error in transport in signalling server");
        return;
      };

      await transport.connect({
        //- Indicates whether the endpoint acts as a DTLS client or server. In WebRTC, one side must take the "client" role and the other the "server" role to complete the handshake.
        //A list of cryptographic fingerprints (hashes of the certificate) used to verify the identity of the remote peer
        dtlsParameters: data.dtlsParameters
      });
       ws.send(JSON.stringify({
        type: "transportConnected",

      }));
    }
    if (data.type === "createTransport") {
      const room = rooms.get(roomId!);
      const peer = room?.peers.get(peerId!);
      if (!room || !peer) return;
    
      const transport = await createTransport(room.router,WebRTCServer);
      if(!transport) return;
      peer.transports?.set(transport.id, transport);
    
      ws.send(JSON.stringify({
        type: "transportCreated",
        data: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters
        }
      }));
    }

    if(data.type==="producer"){
      const { transportId, kind, rtpParameters } = data;

      const room = rooms.get(roomId!);
      const peer = room?.peers.get(peerId!);
      if (!room || !peer) return;
    
      const transport = await peer.transports?.get(transportId);
      if(!transport){
          console.log("No transport Found");
        return};

      try{const producer=await transport.produce({
        kind, rtpParameters
      });
        peer.producers.set(producer.id,producer);
    }catch(e){
        console.error("producer error", e);
      }
 
    }
   
  });

  ws.on("close", () => {
    if (!roomId || !peerId) return;
  
    const room = rooms.get(roomId);
    if (!room) return;
  
    room.peers.delete(peerId);
  
    if (room.peers.size === 0) {
      rooms.delete(roomId);
      console.log("Room destroyed:", roomId);
    }
  
    console.log("Peer left:", peerId);
  });
  
});
