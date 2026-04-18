require("dotenv").config();

const jwt = require("jsonwebtoken");
const express = require("express");
const bodyParser = require("body-parser");
const { WebSocketServer, WebSocket } = require("ws");
const { randomUUID } = require("crypto");
const { getToken } = require("next-auth/jwt");

const { createRouter } = require("../app/mediasoup/router");
const { createTransport } = require("../app/mediasoup/transport");
const { createWebRTCServer } = require("../app/mediasoup/webrtc");

const { prisma } = require("../lib/prisma");
const { redis } = require("../lib/redis");

const app = express();
app.use(bodyParser.json());

// Health check endpoint for Render
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    service: 'videoconff-signaling',
    timestamp: new Date().toISOString()
  });
});

const rooms = new Map();

/* ---------------- LOBBY BROADCAST ---------------- */
async function broadcastLobby(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  try {
    const ids = await redis.smembers(`meeting:${roomId}:participants`);

    let participants = [];

    if (ids.length) {
      participants = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
    }

    room.peers.forEach((peer) => {
      peer.socket.send(
        JSON.stringify({
          type: "lobbyUpdate",
          participants,
        })
      );
    });
  } catch (err) {
    console.error("broadcastLobby error:", err);
  }
}

/* ---------------- MEETING END ---------------- */
function broadcastMeetingEnded(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.peers.forEach((peer) => {
    peer.socket.send(JSON.stringify({ type: "meetingEnded" }));
  });
}

/* ---------------- HTTP ---------------- */

app.post("/endMeeting", (req, res) => {
  broadcastMeetingEnded(req.body.meetingId);
  res.json({ ok: true });
});

app.post("/startMeeting", async (req, res) => {
  const roomId = req.body.meetingId;
  const room = rooms.get(roomId);

  // Send event to ALL connected users
  if (room) {
    room.peers.forEach((peer) => {
      peer.socket.send(
        JSON.stringify({
          type: "meetingStarted"
        })
      );
    });
  }

  await broadcastLobby(roomId);

  res.json({ ok: true });
});

/* ---------------- SERVER ---------------- */

async function startServer() {
  const webRtcServer = await createWebRTCServer();

  const server = app.listen(8080, () => {
    console.log("WS Server running on 8080");
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws, req) => {
    let roomId;
    let peerId;
    let userId;

    ws.on("message", async (message) => {
      const data = JSON.parse(message.toString());

      if (data.type === "getParticipants") {
        if(!roomId) return;

        const room = rooms.get(roomId);
        if (!room) return;

        const participants = Array.from(room.peers.values()).map((p) => ({
          id: p.userId,
          name: p.name,
        }));

        ws.send(JSON.stringify({
          type: "lobbyUpdate",
          participants
        }));
      }

      /* ---------------- JOIN ---------------- */
      if (data.type === "join") {
        try {
          const url = new URL(req.url, "http://localhost");
          const token = url.searchParams.get("token");

          if (!token) {
            console.log("No token in WS");
            ws.close();
            return;
          }

          try {
            const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET);

            if (!decoded?.id) {
              throw new Error("Invalid token");
            }

            userId = decoded.id;
            console.log("WS Authenticated:", userId);

          } catch (err) {
            console.log("Invalid WS token");
            ws.close();
            return;
          }

          let user = await prisma.user.findUnique({
            where: { id: userId },
          });

          if (!user) {
            console.log("User not found");
            ws.close();
            return;
          }

          roomId = data.roomId;
          peerId = randomUUID();

          if (!rooms.has(roomId)) {
            const router = await createRouter();

            const audioLevelObserver =
              await router.createAudioLevelObserver({
                maxEntries: 1,
                threshold: -80,
                interval: 800,
              });

            const room = {
              router,
              peers: new Map(),
              audioLevelObserver,
            };

            rooms.set(roomId, room);

            audioLevelObserver.on("volumes", (volumes) => {
              const { producer } = volumes[0];

              room.peers.forEach((peer) => {
                peer.socket.send(
                  JSON.stringify({
                    type: "activeSpeaker",
                    producerId: producer.id,
                  })
                );
              });
            });
          }

          const room = rooms.get(roomId);

          // Store userId in peer
          const peer = {
            name: user.name,
            userId: userId,
            socket: ws,
            transports: new Map(),
            producers: new Map(),
            consumers: new Map(),
          };

          room.peers.set(peerId, peer);

          await redis.sadd(`meeting:${roomId}:participants`, userId);

          console.log("Peer joined:", peerId);

          ws.send(JSON.stringify({
            type: "joined",
            peerId
          }));

          const participants = Array.from(room.peers.values()).map((p) => ({
            id: p.userId,
            name: p.name,
          }));

          ws.send(JSON.stringify({
            type: "lobbyUpdate",
            participants
          }));

          await broadcastLobby(roomId);

        } catch (err) {
          console.error("Join error:", err);
          ws.close();
        }
      }

      /* ---------------- TRANSPORT ---------------- */
      if (data.type === "createTransport") {
        try {
          const room = rooms.get(roomId);
          if (!room) return;

          const transport = await createTransport(room.router, data.direction);

          room.peers.get(peerId).transports.set(transport.id, transport);

          ws.send(JSON.stringify({
            type: "transportCreated",
            id: transport.id,
            iceParameters: transport.iceParameters,
            dtlsParameters: transport.dtlsParameters,
            direction: transport.direction
          }));

        } catch (err) {
          console.error("Transport error:", err);
        }
      }

      if (data.type === "connectTransport") {
        try {
          const room = rooms.get(roomId);
          if (!room) return;

          const transport = room.peers.get(peerId).transports.get(data.transportId);
          await transport.connect({ dtlsParameters: data.dtlsParameters });

          ws.send(JSON.stringify({ type: "transportConnected" }));

        } catch (err) {
          console.error("Connect transport error:", err);
        }
      }

      /* ---------------- PRODUCE ---------------- */
      if (data.type === "produce") {
        try {
          const room = rooms.get(roomId);
          if (!room) return;

          const transport = room.peers.get(peerId).transports.get(data.transportId);
          const producer = await transport.produce({
            kind: data.kind,
            rtpParameters: data.rtpParameters,
            appData: data.appData,
          });

          room.peers.get(peerId).producers.set(producer.id, producer);

          ws.send(JSON.stringify({
            type: "produced",
            id: producer.id
          }));

          // Broadcast to other peers
          room.peers.forEach((peer, otherPeerId) => {
            if (otherPeerId !== peerId) {
              peer.socket.send(JSON.stringify({
                type: "newProducer",
                id: producer.id,
                kind: producer.kind,
                appData: producer.appData
              }));
            }
          });

        } catch (err) {
          console.error("Produce error:", err);
        }
      }

      /* ---------------- CONSUME ---------------- */
      if (data.type === "consume") {
        try {
          const room = rooms.get(roomId);
          if (!room) return;

          const transport = room.peers.get(peerId).transports.get(data.transportId);
          const producer = room.peers.get(peerId).producers.get(data.producerId);

          const consumer = await transport.consume({
            producerId: data.producerId,
            rtpCapabilities: data.rtpCapabilities,
            paused: true
          });

          room.peers.get(peerId).consumers.set(consumer.id, consumer);

          ws.send(JSON.stringify({
            type: "consumed",
            id: consumer.id,
            producerId: consumer.producerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters
          }));

        } catch (err) {
          console.error("Consume error:", err);
        }
      }

      if (data.type === "resumeConsumer") {
        try {
          const room = rooms.get(roomId);
          if (!room) return;

          const consumer = room.peers.get(peerId).consumers.get(data.consumerId);
          await consumer.resume();

          ws.send(JSON.stringify({ type: "consumerResumed" }));

        } catch (err) {
          console.error("Resume consumer error:", err);
        }
      }

      /* ---------------- CHAT ---------------- */
      if (data.type === "chat") {
        try {
          const room = rooms.get(roomId);
          if (!room) return;

          const message = {
            id: randomUUID(),
            userId: userId,
            message: data.message,
            timestamp: new Date().toISOString()
          };

          // Broadcast to all peers in room
          room.peers.forEach((peer) => {
            peer.socket.send(JSON.stringify({
              type: "chat",
              message
            }));
          });

        } catch (err) {
          console.error("Chat error:", err);
        }
      }

      /* ---------------- LEAVE ---------------- */
      if (data.type === "leave") {
        try {
          const room = rooms.get(roomId);
          if (!room) return;

          room.peers.delete(peerId);
          await redis.srem(`meeting:${roomId}:participants`, userId);

          // Broadcast participant left
          const participants = Array.from(room.peers.values()).map((p) => ({
            id: p.userId,
            name: p.name,
          }));

          room.peers.forEach((peer) => {
            peer.socket.send(JSON.stringify({
              type: "lobbyUpdate",
              participants
            }));
          });

          await broadcastLobby(roomId);

          ws.close();

        } catch (err) {
          console.error("Leave error:", err);
        }
      }
    });

    ws.on("close", async () => {
      try {
        if (roomId && peerId) {
          const room = rooms.get(roomId);
          if (room) {
            room.peers.delete(peerId);
            await redis.srem(`meeting:${roomId}:participants`, userId);

            // Broadcast participant left
            const participants = Array.from(room.peers.values()).map((p) => ({
              id: p.userId,
              name: p.name,
            }));

            room.peers.forEach((peer) => {
              peer.socket.send(JSON.stringify({
                type: "lobbyUpdate",
                participants
              }));
            });

            await broadcastLobby(roomId);
          }
        }
      } catch (err) {
        console.error("Close error:", err);
      }
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
    });
  });

  console.log("WebSocket server started");
}

startServer().catch(console.error);
