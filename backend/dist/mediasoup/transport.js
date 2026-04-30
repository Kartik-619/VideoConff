"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTransport = void 0;
//A WebRTC transport represents a network path negotiated by both, a WebRTC endpoint and mediasoup, 
// via ICE and DTLS procedures. A WebRTC transport may be used to receive media, to send media or to both receive and send. There is no limitation in mediasoup
const createTransport = async (
//the types for these router and webRTC server is inbuilt in it
router, webRtcServer) => {
    return await router.createWebRtcTransport({
        webRtcServer,
        enableUdp: true,
        enableTcp: true,
        preferUdp: true
    });
};
exports.createTransport = createTransport;
//# sourceMappingURL=transport.js.map