import dotenv from "dotenv";
import path from "path";

// Load dotenv before other imports to ensure process.env is ready
dotenv.config({
  path: path.resolve(__dirname, "../../.env")
});

import jwt from "jsonwebtoken";
import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";
import cors from "cors";

import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

import { Peer, Room } from "./types/types";

const app = express();

// CORS configuration - allow frontend
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? process.env.NEXTAUTH_URL 
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

app.use(bodyParser.json());

app.get('/', (req, res) => {
  res.send("Backend running");
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    service: 'videoconff-signaling',
    timestamp: new Date().toISOString()
  });
});

const rooms = new Map<string, Room>();
const roomCreationLocks = new Map<string, Promise<Room>>();
const deletionTimers = new Map<string, ReturnType<typeof setTimeout>>();

/* ---------------- HELPERS ---------------- */

function safeSend(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function cancelDeletionTimer(roomId: string) {
  if (deletionTimers.has(roomId)) {
    clearTimeout(deletionTimers.get(roomId));
    deletionTimers.delete(roomId);
    console.log(`[room] Cancelled deletion timer for ${roomId}`);
  }
}

async function getOrCreateRoom(roomId: string): Promise<Room> {
  // Room already exists — reuse it
  if (rooms.has(roomId)) {
    cancelDeletionTimer(roomId);
    console.log(`[room] Reusing existing room ${roomId} (${rooms.get(roomId)!.peers.size} peers)`);
    return rooms.get(roomId)!;
  }

  // Another call is creating it — wait for that
  if (roomCreationLocks.has(roomId)) {
    cancelDeletionTimer(roomId);
    console.log(`[room] Waiting for lock on room ${roomId}`);
    const room = await roomCreationLocks.get(roomId)!;
    // After awaiting, check again in case it was created + deleted
    if (rooms.has(roomId)) {
      cancelDeletionTimer(roomId);
      return rooms.get(roomId)!;
    }
    // Room was somehow removed while we waited — create a new one
    console.log(`[room] Room ${roomId} disappeared after lock — recreating`);
    return getOrCreateRoom(roomId);
  }

  // We are the creator
  console.log(`[room] Acquiring lock to create room ${roomId}`);

  const creationPromise = (async () => {
    const room: Room = { peers: new Map() };

    // Double-check: another call might have created the room during our async work
    if (rooms.has(roomId)) {
      console.log(`[room] Room ${roomId} already exists — discarding`);
      return rooms.get(roomId)!;
    }

    rooms.set(roomId, room);
    console.log(`[room] Created room ${roomId}`);
    return room;
  })();

  roomCreationLocks.set(roomId, creationPromise);
  try {
    return await creationPromise;
  } finally {
    roomCreationLocks.delete(roomId);
  }
}

function scheduleRoomDeletion(roomId: string) {
  const room = rooms.get(roomId);
  if (!room || room.peers.size > 0) return;

  // Cancel any existing timer
  if (deletionTimers.has(roomId)) {
    clearTimeout(deletionTimers.get(roomId));
  }

  deletionTimers.set(roomId, setTimeout(() => {
    deletionTimers.delete(roomId);
    const latestRoom = rooms.get(roomId);
    if (latestRoom && latestRoom.peers.size === 0) {
      rooms.delete(roomId);
      console.log(`[room] Deleted room ${roomId} after idle timeout`);
    }
  }, 30000));

  console.log(`[room] Scheduled deletion for empty room ${roomId} in 30s`);
}

/* ---------------- LOBBY BROADCAST ---------------- */
async function broadcastLobby(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  try {
    const ids = await redis.smembers(`meeting:${roomId}:participants`);
    let participants: any[] = [];

    if (ids.length) {
      participants = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
    }

    room.peers.forEach((peer: Peer) => {
      safeSend(peer.socket, {
        type: "lobbyUpdate",
        participants,
      });
    });
  } catch (err) {
    console.error("broadcastLobby error:", err);
  }
}

/* ---------------- HTTP ---------------- */

app.post("/leave", async (req, res) => {
  const { meetingId, userId, token } = req.body;
  if (!meetingId || !userId) {
    return res.status(400).json({ error: "meetingId and userId required" });
  }

  if (token) {
    try {
      jwt.verify(token, process.env.NEXTAUTH_SECRET!);
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  const room = rooms.get(meetingId);
  if (room) {
    const peersToRemove: string[] = [];
    for (const [existingPeerId, peer] of room.peers.entries()) {
      if (peer.userId === userId) {
        peersToRemove.push(existingPeerId);
      }
    }

    for (const existingPeerId of peersToRemove) {
      const peer = room.peers.get(existingPeerId);
      if (!peer) continue;
      (peer.socket as any).__replaced = true;
      peer.socket.close();
      room.peers.delete(existingPeerId);
    }

    if (peersToRemove.length > 0) {
      await redis.srem(`meeting:${meetingId}:participants`, userId);
      room.peers.forEach((otherPeer) => {
        safeSend(otherPeer.socket, {
          type: "peerLeft",
          senderPeerId: userId,
        });
      });
      await broadcastLobby(meetingId);
    }

    if (room.peers.size === 0) {
      scheduleRoomDeletion(meetingId);
    }
  }

  res.json({ ok: true });
});

app.post("/endMeeting", async (req, res) => {
  const { meetingId, token } = req.body;
  if (!meetingId) {
    return res.status(400).json({ error: "meetingId required" });
  }

  if (token) {
    try {
      jwt.verify(token, process.env.NEXTAUTH_SECRET!);
    } catch {
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  const room = rooms.get(meetingId);
  if (room) {
    room.peers.forEach((peer) => {
      safeSend(peer.socket, { type: "meetingEnded" });
      (peer.socket as any).__replaced = true;
      peer.socket.close();
    });
    room.peers.clear();
    rooms.delete(meetingId);
    cancelDeletionTimer(meetingId);

    try {
      await redis.del(`meeting:${meetingId}:participants`);
    } catch (err) {
      console.error("Redis cleanup error for endMeeting:", err);
    }
  }

  res.json({ ok: true });
});

app.post("/startMeeting", async (req, res) => {
  const roomId = req.body.meetingId;
  const room = rooms.get(roomId);

  if (room) {
    room.peers.forEach((peer: Peer) => {
      safeSend(peer.socket, { type: "meetingStarted" });
    });
  }
  await broadcastLobby(roomId);

  res.json({ ok: true });
});

/* ---------------- SERVER ---------------- */

async function startServer() {
  if (!process.env.NEXTAUTH_SECRET) {
    console.error("FATAL: NEXTAUTH_SECRET is not set");
    process.exit(1);
  }

  const PORT = process.env.PORT || 8080;
  const server = app.listen(PORT, () => console.log(`WS Server running on ${PORT}`));

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket, req) => {
    let roomId: string | null = null;
    let peerId: string | null = null;
    let userId: string | null = null;

    ws.on("message", async (message) => {
      const raw = message.toString();

      if (raw.length > 100 * 1024) {
        console.error("[ws] Message too large, rejecting");
        return;
      }

      try {
        const data = JSON.parse(raw);

        if (data.type === "getParticipants") {
          if (!roomId) return;
          const room = rooms.get(roomId);
          if (!room) return;

          const participants = Array.from(room.peers.values()).map((p: Peer) => ({
            id: p.userId,
            name: p.name,
          }));

          safeSend(ws, { type: "lobbyUpdate", participants });
        }

        /* ---------------- JOIN ---------------- */
        if (data.type === "join") {
          try {
            const url = new URL(req.url!, "http://localhost");
            const token = url.searchParams.get("token");

            if (!token) return ws.close();

            try {
              const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as any;
              userId = decoded.id;
            } catch (err) {
              return ws.close();
            }

            const user = await prisma.user.findUnique({ where: { id: userId! } });
            if (!user) return ws.close();

            roomId = data.roomId;
            peerId = randomUUID();

            const room = await getOrCreateRoom(roomId!);

            // Fix: Replace existing peer socket WITHOUT triggering cleanup cascade
            room.peers.forEach((existingPeer, existingPeerId) => {
              if (existingPeer.userId === userId) {
                console.log(`[join] Replacing socket for user ${userId} in room ${roomId}`);
                // Mark as replaced so ws.on("close") skips cleanup
                (existingPeer.socket as any).__replaced = true;
                existingPeer.socket.close();
                room.peers.delete(existingPeerId);
              }
            });

            const peer: Peer = {
              name: user.name,
              userId: userId!,
              socket: ws,
            };

            room.peers.set(peerId, peer);
            await redis.sadd(`meeting:${roomId}:participants`, userId!);

            // Cancel any pending deletion — room is active again
            cancelDeletionTimer(roomId!);

            safeSend(ws, { type: "joined", peerId, hostId: room.peers.get(Array.from(room.peers.keys())[0])?.userId || null });
            await broadcastLobby(roomId!);

            // Send list of existing peers to the new joiner
            const existingPeers = Array.from(room.peers.entries())
              .filter(([id]) => id !== peerId)
              .map(([id, peer]) => ({
                peerId: id,
                name: peer.name,
                userId: peer.userId,
              }));
            
            if (existingPeers.length > 0) {
              safeSend(ws, {
                type: "existingPeers",
                peers: existingPeers,
              });
              console.log(`[join] Sent ${existingPeers.length} existing peers to new peer ${peerId}`);
            }

            // Notify other peers about new peer (for WebRTC offer)
            room.peers.forEach((otherPeer, otherId) => {
              if (otherId === peerId) return;
              safeSend(otherPeer.socket, {
                type: "peerJoined",
                peerId: peerId,
                name: user.name,
                userId: userId,
              });
            });
          } catch (err) {
            console.error("Join error:", err);
          }
        }

        if (data.type === "chatMessage") {
          const room = rooms.get(roomId!);
          const peer = room?.peers.get(peerId!);
          if (!room || !peer || !data.message) return;

          const messagePayload = {
            type: "chatMessage",
            data: {
              message: data.message.trim(),
              userId: peer.userId,
              name: peer.name,
              timestamp: Date.now(),
            },
          };
          room.peers.forEach((p: Peer) => safeSend(p.socket, messagePayload));
        }

        /* ---------------- WEBRTC SIGNALING ---------------- */
        
        // Relay offer to target peer
        if (data.type === "offer") {
          if (!roomId || !peerId) return;
          const room = rooms.get(roomId);
          if (!room) return;
          if (!room.peers.has(peerId)) return;
          if (!data.targetPeerId || !data.sdp) return;

          const targetPeer = room.peers.get(data.targetPeerId);
          if (targetPeer) {
            safeSend(targetPeer.socket, {
              type: "offer",
              sdp: data.sdp,
              senderPeerId: peerId,
              senderName: room.peers.get(peerId)?.name,
            });
          }
        }

        // Relay answer to target peer
        if (data.type === "answer") {
          if (!roomId || !peerId) return;
          const room = rooms.get(roomId);
          if (!room) return;
          if (!room.peers.has(peerId)) return;
          if (!data.targetPeerId || !data.sdp) return;

          const targetPeer = room.peers.get(data.targetPeerId);
          if (targetPeer) {
            safeSend(targetPeer.socket, {
              type: "answer",
              sdp: data.sdp,
              senderPeerId: peerId,
            });
          }
        }

        // Relay ICE candidate to target peer
        if (data.type === "ice-candidate") {
          if (!roomId || !peerId) return;
          const room = rooms.get(roomId);
          if (!room) return;
          if (!room.peers.has(peerId)) return;
          if (!data.targetPeerId || !data.candidate) return;

          const targetPeer = room.peers.get(data.targetPeerId);
          if (targetPeer) {
            safeSend(targetPeer.socket, {
              type: "ice-candidate",
              candidate: data.candidate,
              senderPeerId: peerId,
            });
          }
        }
      } catch (err) {
        console.error("WS Message Error:", err);
      }
    });

    /* ---------------- DISCONNECT ---------------- */
    ws.on("close", async () => {
      // Skip cleanup if this peer was replaced by a newer connection from same user
      if ((ws as any).__replaced) {
        console.log("[close] Peer was replaced, skipping cleanup");
        return;
      }

      if (!roomId || !peerId) return;
      const room = rooms.get(roomId);
      if (!room) return;

      const peer = room.peers.get(peerId);
      if (!peer) return;

      room.peers.delete(peerId);
      if (userId) await redis.srem(`meeting:${roomId}:participants`, userId);

      // Notify other peers about disconnection
      room.peers.forEach((otherPeer) => {
        safeSend(otherPeer.socket, {
          type: "peerLeft",
          senderPeerId: peerId,
        });
      });

      await broadcastLobby(roomId);

      // Schedule deletion if room is now empty
      scheduleRoomDeletion(roomId!);
    });
  });
}

startServer();
