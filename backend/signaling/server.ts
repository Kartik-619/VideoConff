import dotenv from "dotenv";
dotenv.config();

import jwt from "jsonwebtoken";

import express from "express";
import bodyParser from "body-parser";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "crypto";

import { createRouter } from "../mediasoup/router";
import { createTransport } from "../mediasoup/transport";
import { createWebRTCServer } from "../mediasoup/webrtc";

import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";

import { Peer } from "./types/types";

const app = express();
app.use(bodyParser.json());

// Root endpoint to test backend
app.get('/', (req, res) => {
  res.send("Backend running");
});

// Health check endpoint for Render
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    service: 'videoconff-signaling',
    timestamp: new Date().toISOString()
  });
});

const rooms = new Map<string, any>();

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

    room.peers.forEach((peer: any) => {
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
function broadcastMeetingEnded(roomId: string) {
  const room = rooms.get(roomId);
  if (!room) return;

  room.peers.forEach((peer: any) => {
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

  // send event to ALL connected users
  if (room) {
    room.peers.forEach((peer: any) => {
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

  const PORT = process.env.PORT || 8080;
  const server = app.listen(PORT, () => {
    console.log(`WS Server running on ${PORT}`);
  });

  const wss = new WebSocketServer({ server });

  wss.on("connection", (ws: WebSocket, req) => {
    let roomId: string;
    let peerId: string;
    let userId: string;

    ws.on("message", async (message) => {
      const data = JSON.parse(message.toString());

      if (data.type === "getParticipants") {

        if(!roomId) return;

        const room = rooms.get(roomId);
        if (!room) return;

        const participants = Array.from(room.peers.values()).map((p: any) => ({
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
          const url = new URL(req.url!, "http://localhost");
          const token = url.searchParams.get("token");

          if (!token) {
            console.log(" No token in WS");
            ws.close();
            return;
          }

          try {
            const decoded = jwt.verify(token, process.env.NEXTAUTH_SECRET!) as any;

            if (!decoded?.id) {
              throw new Error("Invalid token");
            }

            userId = decoded.id;
            console.log(" WS Authenticated:", userId);

          } catch (err) {
            console.log(" Invalid WS token");
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

              room.peers.forEach((peer: any) => {
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



          // store userId in peer
          const peer: Peer = {
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

        const participants = Array.from(room.peers.values()).map((p: any) => ({
          id: p.userId,
          name: p.name,
        }));
          ws.send(JSON.stringify({
            type: "lobbyUpdate",
            participants
          }))

          await broadcastLobby(roomId);

          ws.send(
            JSON.stringify({
              type: "rtpCapabilities",
              data: room.router.rtpCapabilities,
            })
          );

          // send existing producers
          room.peers.forEach((otherPeer: any, otherPeerId: string) => {
            if (otherPeerId === peerId) return;

            otherPeer.producers.forEach((producer: any) => {
              ws.send(
                JSON.stringify({
                  type: "producer",
                  data: {
                    producerId: producer.id,
                    kind: producer.kind,
                    peerId: otherPeerId,
                    userId: otherPeer.userId,
                  },
                })
              );
            });
          });

        } catch (err) {
          console.error("Join error:", err);
        }
      }

      if (data.type === "syncProducers") {
  const room = rooms.get(roomId);
  if (!room) return;

  room.peers.forEach((otherPeer: any, otherPeerId: string) => {
    if (otherPeerId === peerId) return;

    otherPeer.producers.forEach((producer: any) => {
      ws.send(
        JSON.stringify({
          type: "producer",
          data: {
            producerId: producer.id,
            peerId: otherPeerId,
            kind: producer.kind,
            userId: otherPeer.userId,
          },
        })
      );
    });
  });
}


// ---------------- CHAT ----------------
if (data.type === "chatMessage") {
  if (!data.message || typeof data.message !== "string") return;

  const message = data.message.trim();
  if (!message) return;

  const room = rooms.get(roomId);
  const peer = room?.peers.get(peerId);
  if (!room || !peer) return;

  const messagePayload = {
    type: "chatMessage",
    data: {
      message,
      userId: peer.userId,
      name: peer.name,
      timestamp: Date.now(),
    },
  };

  room.peers.forEach((p: any) => {
    p.socket.send(JSON.stringify(messagePayload));
  });
}

      /* ---------------- CREATE TRANSPORT ---------------- */
      if (data.type === "createTransport") {
        const room = rooms.get(roomId);
        const peer = room?.peers.get(peerId);
        if (!room || !peer) return;

        const transport = await createTransport(
          room.router,
          webRtcServer
        );

        peer.transports.set(transport.id, transport);

        ws.send(
          JSON.stringify({
            type: "transportCreated",
            data: {
              direction: data.direction,
              id: transport.id,
              iceParameters: transport.iceParameters,
              iceCandidates: transport.iceCandidates,
              dtlsParameters: transport.dtlsParameters,
            },
          })
        );
      }

      /* ---------------- CONNECT TRANSPORT ---------------- */
      if (data.type === "connectTransport") {
        const room = rooms.get(roomId);
        const peer = room?.peers.get(peerId);
        const transport = peer?.transports.get(data.transportId);
        if (!transport) return;

        await transport.connect({
          dtlsParameters: data.dtlsParameters,
        });
      }

      /* ---------------- PRODUCER ---------------- */
      if (data.type === "producer") {
        const room = rooms.get(roomId);
        const peer = room?.peers.get(peerId);
        if (!room || !peer) return;

        const transport = peer.transports.get(data.transportId);
        if (!transport) return;

        const producer = await transport.produce({
          kind: data.kind,
          rtpParameters: data.rtpParameters,
        });

        peer.producers.set(producer.id, producer);

        if (producer.kind === "audio") {
          room.audioLevelObserver.addProducer({
            producerId: producer.id,
          });
        }

        ws.send(
          JSON.stringify({
            type: "produced",
            data: { producerId: producer.id },
          })
        );

        // notify others
       room.peers.forEach((p: any, id: string) => {
          if (id === peerId) return; // DO NOT SEND TO SELF

          p.socket.send(
            JSON.stringify({
              type: "producer",
              data: {
                producerId: producer.id,
                peerId,
                kind: producer.kind,
                userId: peer.userId,
              },
            })
          );
        });

        setTimeout(() => {
  room.peers.forEach((p: any, id: string) => {
    if (id === peerId) return;

    p.socket.send(
      JSON.stringify({
        type: "producer",
        data: {
          producerId: producer.id,
          peerId,
          kind: producer.kind,
          userId: peer.userId,
        },
      })
    );
  });
}, 300);
      }

      

      /* ---------------- CONSUMER ---------------- */
      if (data.type === "consumer") {
        const room = rooms.get(roomId);
        const peer = room?.peers.get(peerId);
        if (!room || !peer) return;

        const transport = peer.transports.get(data.transportId);
        if (!transport) return;

        if (
          !room.router.canConsume({
            producerId: data.producerId,
            rtpCapabilities: data.rtpCapabilities,
          })
        )
          return;

        const consumer = await transport.consume({
          producerId: data.producerId,
          rtpCapabilities: data.rtpCapabilities,
          paused: true,
        });

        peer.consumers.set(consumer.id, consumer);

        ws.send(
          JSON.stringify({
            type: "consumerCreated",
            data: {
              id: consumer.id,
              producerId: data.producerId,
              kind: consumer.kind,
              rtpParameters: consumer.rtpParameters,
            },
          })
        );
      }

      /* ---------------- RESUME ---------------- */
      if (data.type === "resumeConsumer") {
        const room = rooms.get(roomId);
        const peer = room?.peers.get(peerId);

        if (!peer) {
          console.log(" No peer for resume");
          return;
        }

        const consumer = peer.consumers.get(data.consumerId);

        if (!consumer) {
          console.log(" Consumer not found:", data.consumerId);
          return;
        }

        await consumer.resume();
        console.log(" Consumer resumed:", consumer.id);
      }
    });

    /* ---------------- DISCONNECT ---------------- */
    ws.on("close", async () => {
      const room = rooms.get(roomId);
      if (!room) return;

      const peer = room.peers.get(peerId);
      if (!peer) return;

      peer.transports.forEach((t: any) => t.close());
      peer.producers.forEach((p: any) => {
        //  notify all other peers
        room.peers.forEach((otherPeer: any) => {
          otherPeer.socket.send(
            JSON.stringify({
              type: "producerClosed",
              producerId: p.id,
            })
          );
        });

        p.close();
      });
      peer.consumers.forEach((c: any) => c.close());

      room.peers.delete(peerId);

      if (userId && roomId) {
        await redis.srem(`meeting:${roomId}:participants`, userId);
      }

      await broadcastLobby(roomId);

      console.log("Peer left:", peerId);
    });
  });
}

startServer();
