import { WebSocketServer, WebSocket } from "ws";
import * as mediasoup from 'mediasoup';
import { randomUUID } from "crypto";
import { Peer, Room } from './types/types';
import { createRouter } from '../app/mediasoup/router';
import { createTransport } from "@/app/mediasoup/transport";
import { createWebRTCServer } from '@/app/mediasoup/webrtc';

async function startServer(){
const WebRTCServer = await createWebRTCServer();
const wss = new WebSocketServer({ port: 8080 });


console.log(" Signaling server running on ws://localhost:8080");

const rooms = new Map<string, Room>();


wss.on("connection", (ws: WebSocket) => {
  let roomId: string;
  let peerId: string;

  ws.on("message", async (message: WebSocket.RawData) => {
    const data = JSON.parse(message.toString());

    // ===== JOIN =====
    if (data.type === "join") {
      roomId = data.roomId;

      peerId = randomUUID();
      (ws as any).id = peerId;

      if (!rooms.has(roomId)) {
        const router = await createRouter();

        rooms.set(data.roomId,
          {
            router,
            peers: new Map()
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
    // In your server.ts, update the connectTransport handler:
if (data.type === "connectTransport") {
  const { transportId, dtlsParameters } = data;
  console.log("🔌 Server received connectTransport for:", transportId);
  console.log("🔌 Room ID:", roomId, "Peer ID:", peerId);
  
  if (!roomId || !peerId) {
    console.error("❌ Missing roomId or peerId");
    return;
  }
  
  const room = rooms.get(roomId);
  if (!room) {
    console.error("❌ Room not found:", roomId);
    return;
  }
  
  const peer = room?.peers.get(peerId);
  if (!peer || !peer.transports) {
    console.error("❌ Peer or transport missing");
    return;
  }

  const transport = peer?.transports.get(transportId);
  if (!transport) {
    console.log("❌ Transport not found:", transportId);
    return;
  }

  try {
    console.log("🔌 Connecting transport:", transportId);
    await transport.connect({ dtlsParameters });
    
    console.log("✅ Transport connected successfully:", transportId);
    
    ws.send(JSON.stringify({
      type: "transportConnected",
      transportId: transportId
    }));
    
    console.log("📤 Sent transportConnected for:", transportId);
  } catch (error) {
    console.error("❌ Transport connect error:", error);
  }
}
    if (data.type === "createTransport") {
      const {direction}=data;
      const room = rooms.get(roomId!);
      const peer = room?.peers.get(peerId!);
      if (!room || !peer) return;

      const transport = await createTransport(room.router, WebRTCServer);
      if (!transport) return;
      peer.transports?.set(transport.id, transport);

      ws.send(JSON.stringify({
        type: "transportCreated",
        data: {
          direction,
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters
        }
      }));
    }

    if (data.type === "producer") {
      const { transportId, kind, rtpParameters } = data;

      const room = rooms.get(roomId!);
      const peer = room?.peers.get(peerId!);
      if (!room || !peer) return;

      const transport = await peer.transports?.get(transportId);
      if (!transport) {
        console.log("No transport Found");
        return
      };

      try {
        const producer = await transport.produce({
          kind, rtpParameters
        });
        peer.producers.set(producer.id, producer);
        //pipeline is valid only when you're connecting different workers with different routers but at the moment we are just writing the room logic
        //  const pipeline= await room.router.pipeToRouter({producerId:producer.id,router:room.router});

        //notify the host and server
        ws.send(JSON.stringify({
          type: "produced",
          data: {
            producerId: producer.id
          }
        })
        );

        //notify all the other peers about the consumer
        room.peers.forEach((otherPeer, otherPeerId) => {
          if (otherPeerId !== peerId) {
            otherPeer.socket.send(JSON.stringify({
              type: "producer",
              data: {
                producerId: producer.id
              }
            }));
          }
        });

        producer.on("transportclose", () => {
          producer.close();
          console.log("transport closed so producer closed");
          ws.send(JSON.stringify({
            type:"producerclosed"
          }));
        })

      } catch (e) {
        console.error("producer error", e);
      }


    }

    //created the consumer
    if (data.type === "consumer") {
      const { producerId, kind, transportId, rtpCapabilities } = data;
      const room = rooms.get(roomId!);
      const peer = room?.peers.get(peerId!);
      if (!room || !peer) return;
      const transport = await peer.transports?.get(transportId);
      if (!transport) {
        console.log("No transport Found");
        return
      };
      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        console.log("Router can consume no more");
        return;
      }
      try {
        const consumer = await transport.consume({
          producerId,
          rtpCapabilities,
          paused: true
        });
        peer.consumers.set(consumer.id, consumer);

        ws.send(JSON.stringify({
          type: "consumerCreated",
          data: {
            id: consumer.id,
            producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters
          }

        }));
        consumer.on("producerclose",()=>{
          console.log("Producer is closed so we need to close the consumer");
          consumer.close();
          ws.send(JSON.stringify({
            type:"consumerclosed"
          }));
        });
      } catch (e) {
        console.error("The consumer error while signaling ", e);
      }
    }

    if (data.type === "resumeConsumer") {
      const { consumerId } = data;

      const room = rooms.get(roomId!);
      const peer = room?.peers.get(peerId!);
      if (!room || !peer) return;

      const consumer = peer.consumers.get(consumerId);
      if (!consumer) return;

      await consumer.resume();
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
}

startServer().catch((err)=>{
  console.error("Server failed to start ",err);
})