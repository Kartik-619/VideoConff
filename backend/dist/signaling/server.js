"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load dotenv before other imports to ensure process.env is ready
dotenv_1.default.config({
    path: path_1.default.resolve(__dirname, "../../.env")
});
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const ws_1 = require("ws");
const crypto_1 = require("crypto");
const cors_1 = __importDefault(require("cors"));
const router_1 = require("../mediasoup/router");
const transport_1 = require("../mediasoup/transport");
const webrtc_1 = require("../mediasoup/webrtc");
const prisma_1 = require("../lib/prisma");
const redis_1 = require("../lib/redis");
const app = (0, express_1.default)();
// CORS configuration - allow frontend
app.use((0, cors_1.default)({
    origin: process.env.NODE_ENV === 'production'
        ? process.env.NEXTAUTH_URL
        : ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true
}));
app.use(body_parser_1.default.json());
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
const rooms = new Map();
const roomCreationLocks = new Map();
const deletionTimers = new Map();
/* ---------------- HELPERS ---------------- */
function safeSend(ws, data) {
    if (ws.readyState === ws_1.WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}
function cancelDeletionTimer(roomId) {
    if (deletionTimers.has(roomId)) {
        clearTimeout(deletionTimers.get(roomId));
        deletionTimers.delete(roomId);
        console.log(`[room] Cancelled deletion timer for ${roomId}`);
    }
}
async function getOrCreateRoom(roomId) {
    // Room already exists — reuse it
    if (rooms.has(roomId)) {
        cancelDeletionTimer(roomId);
        console.log(`[room] Reusing existing room ${roomId} (${rooms.get(roomId).peers.size} peers)`);
        return rooms.get(roomId);
    }
    // Another call is creating it — wait for that
    if (roomCreationLocks.has(roomId)) {
        cancelDeletionTimer(roomId);
        console.log(`[room] Waiting for lock on room ${roomId}`);
        const room = await roomCreationLocks.get(roomId);
        // After awaiting, check again in case it was created + deleted
        if (rooms.has(roomId)) {
            cancelDeletionTimer(roomId);
            return rooms.get(roomId);
        }
        // Room was somehow removed while we waited — create a new one
        console.log(`[room] Room ${roomId} disappeared after lock — recreating`);
        return getOrCreateRoom(roomId);
    }
    // We are the creator
    console.log(`[room] Acquiring lock to create room ${roomId}`);
    const creationPromise = (async () => {
        console.log(`[room][pid:${process.pid}] Creating router for room ${roomId}`);
        const router = await (0, router_1.createRouter)();
        const audioLevelObserver = await router.createAudioLevelObserver({
            maxEntries: 1,
            threshold: -80,
            interval: 800,
        });
        const room = { router, peers: new Map(), audioLevelObserver };
        // Double-check: another call might have created the room during our async work
        if (rooms.has(roomId)) {
            console.log(`[room] Room ${roomId} already exists — discarding duplicate router ${router.id}`);
            audioLevelObserver.close();
            router.close();
            return rooms.get(roomId);
        }
        rooms.set(roomId, room);
        console.log(`[room] Router created for room ${roomId} (routerId=${router.id})`);
        return room;
    })();
    roomCreationLocks.set(roomId, creationPromise);
    try {
        return await creationPromise;
    }
    finally {
        roomCreationLocks.delete(roomId);
    }
}
function scheduleRoomDeletion(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.peers.size > 0)
        return;
    // Cancel any existing timer
    if (deletionTimers.has(roomId)) {
        clearTimeout(deletionTimers.get(roomId));
    }
    deletionTimers.set(roomId, setTimeout(() => {
        deletionTimers.delete(roomId);
        const latestRoom = rooms.get(roomId);
        if (latestRoom && latestRoom.peers.size === 0) {
            latestRoom.audioLevelObserver.close();
            latestRoom.router.close();
            rooms.delete(roomId);
            console.log(`[room] Deleted room ${roomId} after idle timeout`);
        }
    }, 30000));
    console.log(`[room] Scheduled deletion for empty room ${roomId} in 30s`);
}
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
            safeSend(peer.socket, {
                type: "lobbyUpdate",
                participants,
            });
        });
    }
    catch (err) {
        console.error("broadcastLobby error:", err);
    }
}
function broadcastMeetingEnded(roomId) {
    const room = rooms.get(roomId);
    if (!room)
        return;
    room.peers.forEach((peer) => {
        safeSend(peer.socket, { type: "meetingEnded" });
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
    if (room) {
        room.peers.forEach((peer) => {
            safeSend(peer.socket, { type: "meetingStarted" });
        });
    }
    await broadcastLobby(roomId);
    res.json({ ok: true });
});
/* ---------------- SERVER ---------------- */
async function startServer() {
    const webRtcServer = await (0, webrtc_1.createWebRTCServer)();
    const PORT = process.env.PORT || 8080;
    const server = app.listen(PORT, () => console.log(`WS Server running on ${PORT}`));
    const wss = new ws_1.WebSocketServer({ server });
    wss.on("connection", (ws, req) => {
        let roomId = null;
        let peerId = null;
        let userId = null;
        ws.on("message", async (message) => {
            try {
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
                    safeSend(ws, { type: "lobbyUpdate", participants });
                }
                /* ---------------- JOIN ---------------- */
                if (data.type === "join") {
                    try {
                        const url = new URL(req.url, "http://localhost");
                        const token = url.searchParams.get("token");
                        if (!token)
                            return ws.close();
                        try {
                            const decoded = jsonwebtoken_1.default.verify(token, process.env.NEXTAUTH_SECRET);
                            userId = decoded.id;
                        }
                        catch (err) {
                            return ws.close();
                        }
                        const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
                        if (!user)
                            return ws.close();
                        roomId = data.roomId;
                        peerId = (0, crypto_1.randomUUID)();
                        const room = await getOrCreateRoom(roomId);
                        // Fix: ✅ Replace existing peer socket WITHOUT triggering cleanup cascade
                        room.peers.forEach((existingPeer, existingPeerId) => {
                            if (existingPeer.userId === userId) {
                                console.log(`[join] Replacing socket for user ${userId} in room ${roomId}`);
                                // Mark as replaced so ws.on("close") skips cleanup
                                existingPeer.socket.__replaced = true;
                                existingPeer.socket.close();
                                room.peers.delete(existingPeerId);
                            }
                        });
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
                        // Cancel any pending deletion — room is active again
                        cancelDeletionTimer(roomId);
                        safeSend(ws, { type: "joined", peerId });
                        await broadcastLobby(roomId);
                        safeSend(ws, {
                            type: "rtpCapabilities",
                            data: room.router.rtpCapabilities,
                        });
                        // Send existing producers to new peer
                        room.peers.forEach((otherPeer, otherId) => {
                            if (otherId === peerId)
                                return;
                            otherPeer.producers.forEach((producer) => {
                                safeSend(ws, {
                                    type: "producer",
                                    data: {
                                        producerId: producer.id,
                                        kind: producer.kind,
                                        peerId: otherId,
                                        userId: otherPeer.userId,
                                    },
                                });
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
                    room.peers.forEach((otherPeer, otherId) => {
                        if (otherId === peerId)
                            return;
                        otherPeer.producers.forEach((producer) => {
                            safeSend(ws, {
                                type: "producer",
                                data: {
                                    producerId: producer.id,
                                    peerId: otherId,
                                    kind: producer.kind,
                                    userId: otherPeer.userId,
                                },
                            });
                        });
                    });
                }
                if (data.type === "chatMessage") {
                    const room = rooms.get(roomId);
                    const peer = room?.peers.get(peerId);
                    if (!room || !peer || !data.message)
                        return;
                    const messagePayload = {
                        type: "chatMessage",
                        data: {
                            message: data.message.trim(),
                            userId: peer.userId,
                            name: peer.name,
                            timestamp: Date.now(),
                        },
                    };
                    room.peers.forEach((p) => safeSend(p.socket, messagePayload));
                }
                /* ---------------- MEDIASOUP ACTIONS ---------------- */
                if (data.type === "createTransport") {
                    const room = rooms.get(roomId);
                    const peer = room?.peers.get(peerId);
                    if (!room || !peer)
                        return;
                    const transport = await (0, transport_1.createTransport)(room.router, webRtcServer);
                    peer.transports.set(transport.id, transport);
                    safeSend(ws, {
                        type: "transportCreated",
                        data: {
                            direction: data.direction,
                            id: transport.id,
                            iceParameters: transport.iceParameters,
                            iceCandidates: transport.iceCandidates,
                            dtlsParameters: transport.dtlsParameters,
                        },
                    });
                }
                if (data.type === "connectTransport") {
                    const transport = rooms.get(roomId)?.peers.get(peerId)?.transports.get(data.transportId);
                    if (!transport)
                        return;
                    await transport.connect({ dtlsParameters: data.dtlsParameters });
                    if (data.requestId) {
                        const peer = rooms.get(roomId)?.peers.get(peerId);
                        if (peer) {
                            safeSend(peer.socket, { type: "transportConnected", requestId: data.requestId });
                        }
                    }
                }
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
                        room.audioLevelObserver.addProducer({ producerId: producer.id });
                    }
                    safeSend(ws, { type: "produced", data: { producerId: producer.id } });
                    room.peers.forEach((p, id) => {
                        if (id === peerId)
                            return;
                        safeSend(p.socket, {
                            type: "producer",
                            data: {
                                producerId: producer.id,
                                peerId: peerId,
                                kind: producer.kind,
                                userId: peer.userId,
                            },
                        });
                    });
                }
                /* ---------------- CONSUMER ---------------- */
                if (data.type === "consumer") {
                    if (!roomId || !peerId)
                        return;
                    const room = rooms.get(roomId);
                    const peer = room?.peers.get(peerId);
                    if (!room || !peer)
                        return;
                    const transport = peer.transports.get(data.transportId);
                    if (!transport)
                        return;
                    if (!room.router.canConsume({ producerId: data.producerId, rtpCapabilities: data.rtpCapabilities }))
                        return;
                    const consumer = await transport.consume({
                        producerId: data.producerId,
                        rtpCapabilities: data.rtpCapabilities,
                        paused: true,
                    });
                    peer.consumers.set(consumer.id, consumer);
                    safeSend(ws, {
                        type: "consumerCreated",
                        data: {
                            id: consumer.id,
                            producerId: data.producerId,
                            kind: consumer.kind,
                            rtpParameters: consumer.rtpParameters,
                        },
                    });
                }
                if (data.type === "resumeConsumer") {
                    if (!roomId || !peerId)
                        return;
                    const peer = rooms.get(roomId)?.peers.get(peerId);
                    const consumer = peer?.consumers.get(data.consumerId);
                    if (consumer) {
                        await consumer.resume();
                        console.log("Consumer resumed:", consumer.id);
                    }
                }
            }
            catch (err) {
                console.error("WS Message Error:", err);
            }
        });
        /* ---------------- DISCONNECT ---------------- */
        ws.on("close", async () => {
            // Skip cleanup if this peer was replaced by a newer connection from same user
            if (ws.__replaced) {
                console.log("[close] Peer was replaced, skipping cleanup");
                return;
            }
            if (!roomId || !peerId)
                return;
            const room = rooms.get(roomId);
            if (!room)
                return;
            const peer = room.peers.get(peerId);
            if (!peer)
                return;
            peer.transports.forEach((t) => t.close());
            peer.producers.forEach((p) => {
                room.peers.forEach((other) => {
                    safeSend(other.socket, { type: "producerClosed", producerId: p.id });
                });
                p.close();
            });
            peer.consumers.forEach((c) => c.close());
            room.peers.delete(peerId);
            if (userId)
                await redis_1.redis.srem(`meeting:${roomId}:participants`, userId);
            await broadcastLobby(roomId);
            // Schedule deletion if room is now empty
            scheduleRoomDeletion(roomId);
        });
    });
}
startServer();
//# sourceMappingURL=server.js.map