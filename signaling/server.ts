import { WebSocketServer, WebSocket } from "ws";
import * as mediasoup from 'mediasoup';
import { randomUUID } from "crypto";
import {Peer,Room} from './types/types';
import {createRouter} from '../app/mediasoup/router';
const wss = new WebSocketServer({ port: 8080 });

console.log(" Signaling server running on ws://localhost:8080");

const rooms = new Map<string, Room>();


wss.on("connection", (ws: WebSocket) => {
  let currentRoom: string | null = null;

  ws.on("message",async (message: WebSocket.RawData) => {
    const data = JSON.parse(message.toString());

    // ===== JOIN =====
    if (data.type === "join") {
      const roomId = data.roomId;
      currentRoom = roomId;
      const socketId = crypto.randomUUID();
      ws["id"] = socketId;

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

      const peers:Peer = {
        
        socket:ws,
        producers: new Map(),
        consumers: new Map()
      }

      
      rooms.peers.set(socketId, peer);
      // If 2 users → first creates offer
      console.log("User joined room", roomId, "peer:", socketId);
      ws.send(JSON.stringify({
        type: "rtpCapabilities",
        data: rooms.router.rtpCapabilities
      }));
      return;
    }

    // ===== SIGNAL FORWARD =====
    if (!currentRoom) return;

    const room = rooms.get(currentRoom);
    if (!room) return;

   room.peers.forEach(client => {
      if (peer.socket !== ws && peer.socket.readyState === WebSocket.OPEN) {
        peer.socket.send(JSON.stringify(data));
      }
    });
  });

  ws.on("close", () => {
    if (!currentRoom) return;

    const peers = rooms.get(currentRoom);
    if (!peers) return;

    peers.delete(ws);

    if (peers.size === 0) {
      rooms.delete(currentRoom);
    }

    console.log("User left:", currentRoom);
  });
});
