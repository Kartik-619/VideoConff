"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWebRTCServer = void 0;
const worker_1 = require("./worker");
//A WebRTC server exists within the context of a Worker, meaning that if your app launches N workers it also needs to create N WebRTC servers listening on different ports (to not collide).
//The WebRTC transport implementation of mediasoup is ICE Lite, meaning that it does not initiate ICE connections but expects ICE Binding Requests from endpoints.
//WebRtcServerOptions
const createWebRTCServer = async () => {
    const worker = await (0, worker_1.createWorker)();
    const webRtcServer = await worker.createWebRtcServer({
        listenInfos: [
            {
                protocol: 'udp',
                ip: '0.0.0.0',
                //  announcedIp: "YOUR_PUBLIC_IP",,
                announcedIp: "127.0.0.1",
                port: 20000
            },
            {
                protocol: 'tcp',
                ip: '0.0.0.0',
                //  announcedIp: "YOUR_PUBLIC_IP",
                announcedIp: "127.0.0.1",
                port: 20000
            }
        ]
    });
    console.log("WebRTC Server created:", webRtcServer.id);
    return webRtcServer;
};
exports.createWebRTCServer = createWebRTCServer;
//# sourceMappingURL=webrtc.js.map