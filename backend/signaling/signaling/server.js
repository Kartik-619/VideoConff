"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
dotenv_1.default.config();
const jsonwebtoken_1 = require("jsonwebtoken");
const express_1 = require("express");
const body_parser_1 = require("body-parser");
const ws_1 = require("ws");
const crypto_1 = require("crypto");
const router_1 = require("../app/mediasoup/router");
const transport_1 = require("@/app/mediasoup/transport");
const webrtc_1 = require("@/app/mediasoup/webrtc");
const prisma_1 = require("@/lib/prisma");
const redis_1 = require("@/lib/redis");
const app = (0, express_1.default)();
app.use(body_parser_1.default.json());
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
    if (!room)
        return;
    try {
        const ids = await redis_1.redis.smembers(`meeting:${roomId}:participants`);
        let participants = [];
        if (ids.length) {
            participants = await prisma_1.prisma.user.findMany({
                where: { id: { in: ids } },
                select: { id: true, name: true },
            });
        }
        room.peers.forEach((peer) => {
            peer.socket.send(JSON.stringify({
                type: "lobbyUpdate",
                participants,
            }));
        });
    }
    catch (err) {
        console.error("broadcastLobby error:", err);
    }
}
/* ---------------- MEETING END ---------------- */
function broadcastMeetingEnded(roomId) {
    const room = rooms.get(roomId);
    if (!room)
        return;
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
    // 🔥 send event to ALL connected users
    if (room) {
        room.peers.forEach((peer) => {
            peer.socket.send(JSON.stringify({
                type: "meetingStarted"
            }));
        });
    }
    await broadcastLobby(roomId);
    res.json({ ok: true });
});
/* ---------------- SERVER ---------------- */
async function startServer() {
    const webRtcServer = await (0, webrtc_1.createWebRTCServer)();
    const server = app.listen(8080, () => {
        console.log("WS Server running on 8080");
    });
    const wss = new ws_1.WebSocketServer({ server });
    wss.on("connection", (ws, req) => {
        let roomId;
        let peerId;
        let userId;
        ws.on("message", async (message) => {
            const data = JSON.parse(message.toString());
            if (data.type === "getParticipants") {
                if (!roomId)
                    return;
                const room = rooms.get(roomId);
                if (!room)
                    return;
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
                        console.log("❌ No token in WS");
                        ws.close();
                        return;
                    }
                    try {
                        const decoded = jsonwebtoken_1.default.verify(token, process.env.NEXTAUTH_SECRET);
                        if (!decoded?.id) {
                            throw new Error("Invalid token");
                        }
                        userId = decoded.id;
                        console.log("✅ WS Authenticated:", userId);
                    }
                    catch (err) {
                        console.log("❌ Invalid WS token");
                        ws.close();
                        return;
                    }
                    let user = await prisma_1.prisma.user.findUnique({
                        where: { id: userId },
                    });
                    if (!user) {
                        console.log("User not found");
                        ws.close();
                        return;
                    }
                    roomId = data.roomId;
                    peerId = (0, crypto_1.randomUUID)();
                    if (!rooms.has(roomId)) {
                        const router = await (0, router_1.createRouter)();
                        const audioLevelObserver = await router.createAudioLevelObserver({
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
                                peer.socket.send(JSON.stringify({
                                    type: "activeSpeaker",
                                    producerId: producer.id,
                                }));
                            });
                        });
                    }
                    const room = rooms.get(roomId);
                    // ✅ store userId in peer
                    const peer = {
                        name: user.name,
                        userId: userId,
                        socket: ws,
                        transports: new Map(),
                        producers: new Map(),
                        consumers: new Map(),
                    };
                    room.peers.set(peerId, peer);
                    await redis_1.redis.sadd(`meeting:${roomId}:participants`, userId);
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
                    ws.send(JSON.stringify({
                        type: "rtpCapabilities",
                        data: room.router.rtpCapabilities,
                    }));
                    // send existing producers
                    room.peers.forEach((otherPeer, otherPeerId) => {
                        if (otherPeerId === peerId)
                            return;
                        otherPeer.producers.forEach((producer) => {
                            ws.send(JSON.stringify({
                                type: "producer",
                                data: {
                                    producerId: producer.id,
                                    kind: producer.kind,
                                    peerId: otherPeerId,
                                    userId: otherPeer.userId,
                                },
                            }));
                        });
                    });
                }
                catch (err) {
                    console.error("Join error:", err);
                }
            }
            if (data.type === "syncProducers") {
                const room = rooms.get(roomId);
                if (!room)
                    return;
                room.peers.forEach((otherPeer, otherPeerId) => {
                    if (otherPeerId === peerId)
                        return;
                    otherPeer.producers.forEach((producer) => {
                        ws.send(JSON.stringify({
                            type: "producer",
                            data: {
                                producerId: producer.id,
                                peerId: otherPeerId,
                                kind: producer.kind,
                                userId: otherPeer.userId,
                            },
                        }));
                    });
                });
            }
            // ---------------- CHAT ----------------
            if (data.type === "chatMessage") {
                if (!data.message || typeof data.message !== "string")
                    return;
                const message = data.message.trim();
                if (!message)
                    return;
                const room = rooms.get(roomId);
                const peer = room?.peers.get(peerId);
                if (!room || !peer)
                    return;
                const messagePayload = {
                    type: "chatMessage",
                    data: {
                        message,
                        userId: peer.userId,
                        name: peer.name,
                        timestamp: Date.now(),
                    },
                };
                room.peers.forEach((p) => {
                    p.socket.send(JSON.stringify(messagePayload));
                });
            }
            /* ---------------- CREATE TRANSPORT ---------------- */
            if (data.type === "createTransport") {
                const room = rooms.get(roomId);
                const peer = room?.peers.get(peerId);
                if (!room || !peer)
                    return;
                const transport = await (0, transport_1.createTransport)(room.router, webRtcServer);
                peer.transports.set(transport.id, transport);
                ws.send(JSON.stringify({
                    type: "transportCreated",
                    data: {
                        direction: data.direction,
                        id: transport.id,
                        iceParameters: transport.iceParameters,
                        iceCandidates: transport.iceCandidates,
                        dtlsParameters: transport.dtlsParameters,
                    },
                }));
            }
            /* ---------------- CONNECT TRANSPORT ---------------- */
            if (data.type === "connectTransport") {
                const room = rooms.get(roomId);
                const peer = room?.peers.get(peerId);
                const transport = peer?.transports.get(data.transportId);
                if (!transport)
                    return;
                await transport.connect({
                    dtlsParameters: data.dtlsParameters,
                });
            }
            /* ---------------- PRODUCER ---------------- */
            if (data.type === "producer") {
                const room = rooms.get(roomId);
                const peer = room?.peers.get(peerId);
                if (!room || !peer)
                    return;
                const transport = peer.transports.get(data.transportId);
                if (!transport)
                    return;
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
                ws.send(JSON.stringify({
                    type: "produced",
                    data: { producerId: producer.id },
                }));
                // notify others
                room.peers.forEach((p, id) => {
                    if (id === peerId)
                        return; // DO NOT SEND TO SELF
                    p.socket.send(JSON.stringify({
                        type: "producer",
                        data: {
                            producerId: producer.id,
                            peerId,
                            kind: producer.kind,
                            userId: peer.userId,
                        },
                    }));
                });
                setTimeout(() => {
                    room.peers.forEach((p, id) => {
                        if (id === peerId)
                            return;
                        p.socket.send(JSON.stringify({
                            type: "producer",
                            data: {
                                producerId: producer.id,
                                peerId,
                                kind: producer.kind,
                                userId: peer.userId,
                            },
                        }));
                    });
                }, 300);
            }
            /* ---------------- CONSUMER ---------------- */
            if (data.type === "consumer") {
                const room = rooms.get(roomId);
                const peer = room?.peers.get(peerId);
                if (!room || !peer)
                    return;
                const transport = peer.transports.get(data.transportId);
                if (!transport)
                    return;
                if (!room.router.canConsume({
                    producerId: data.producerId,
                    rtpCapabilities: data.rtpCapabilities,
                }))
                    return;
                const consumer = await transport.consume({
                    producerId: data.producerId,
                    rtpCapabilities: data.rtpCapabilities,
                    paused: true,
                });
                peer.consumers.set(consumer.id, consumer);
                ws.send(JSON.stringify({
                    type: "consumerCreated",
                    data: {
                        id: consumer.id,
                        producerId: data.producerId,
                        kind: consumer.kind,
                        rtpParameters: consumer.rtpParameters,
                    },
                }));
            }
            /* ---------------- RESUME ---------------- */
            if (data.type === "resumeConsumer") {
                const room = rooms.get(roomId);
                const peer = room?.peers.get(peerId);
                if (!peer) {
                    console.log("❌ No peer for resume");
                    return;
                }
                const consumer = peer.consumers.get(data.consumerId);
                if (!consumer) {
                    console.log("❌ Consumer not found:", data.consumerId);
                    return;
                }
                await consumer.resume();
                console.log("✅ Consumer resumed:", consumer.id);
            }
        });
        /* ---------------- DISCONNECT ---------------- */
        ws.on("close", async () => {
            const room = rooms.get(roomId);
            if (!room)
                return;
            const peer = room.peers.get(peerId);
            if (!peer)
                return;
            peer.transports.forEach((t) => t.close());
            peer.producers.forEach((p) => {
                //  notify all other peers
                room.peers.forEach((otherPeer) => {
                    otherPeer.socket.send(JSON.stringify({
                        type: "producerClosed",
                        producerId: p.id,
                    }));
                });
                p.close();
            });
            peer.consumers.forEach((c) => c.close());
            room.peers.delete(peerId);
            if (userId && roomId) {
                await redis_1.redis.srem(`meeting:${roomId}:participants`, userId);
            }
            await broadcastLobby(roomId);
            console.log("Peer left:", peerId);
        });
    });
}
startServer();
