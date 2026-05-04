"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSharedWebRtcServer = exports.getSharedWorker = exports.initializeMediasoup = void 0;
const worker_1 = require("./worker");
// A WebRTC server exists within the context of a Worker.
// The WebRTC transport implementation of mediasoup is ICE Lite.
// We create a single worker and WebRTC server to be shared across all routers
let sharedWorker = null;
let sharedWebRtcServer = null;
const initializeMediasoup = async () => {
    if (sharedWorker)
        return { worker: sharedWorker, webRtcServer: sharedWebRtcServer };
    sharedWorker = await (0, worker_1.createWorker)();
    sharedWebRtcServer = await sharedWorker.createWebRtcServer({
        listenInfos: [
            {
                protocol: 'udp',
                ip: '0.0.0.0',
                announcedIp: "127.0.0.1",
                port: 20000
            },
            {
                protocol: 'tcp',
                ip: '0.0.0.0',
                announcedIp: "127.0.0.1",
                port: 20000
            }
        ]
    });
    console.log("Mediasoup initialized - Worker:", sharedWorker.pid, "WebRTC Server:", sharedWebRtcServer.id);
    return { worker: sharedWorker, webRtcServer: sharedWebRtcServer };
};
exports.initializeMediasoup = initializeMediasoup;
const getSharedWorker = () => {
    if (!sharedWorker)
        throw new Error("Mediasoup not initialized");
    return sharedWorker;
};
exports.getSharedWorker = getSharedWorker;
const getSharedWebRtcServer = () => {
    if (!sharedWebRtcServer)
        throw new Error("Mediasoup not initialized");
    return sharedWebRtcServer;
};
exports.getSharedWebRtcServer = getSharedWebRtcServer;
//# sourceMappingURL=webrtc.js.map