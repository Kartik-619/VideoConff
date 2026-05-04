"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRouter = void 0;
const webrtc_1 = require("./webrtc");
const mediaCodecs = [
    {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
        preferredPayloadType: 111
    },
    {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        preferredPayloadType: 96
    },
    {
        kind: "video",
        mimeType: "video/H264",
        clockRate: 90000,
        preferredPayloadType: 102,
        parameters: {
            "packetization-mode": 1,
            "profile-level-id": "42e01f",
            "level-asymmetry-allowed": 1
        }
    }
];
// creating rooms - uses shared worker from webrtc.ts
const createRouter = async () => {
    const worker = (0, webrtc_1.getSharedWorker)();
    const router = await worker.createRouter({
        mediaCodecs
    });
    console.log("Router created:", router.id);
    return router;
};
exports.createRouter = createRouter;
//# sourceMappingURL=router.js.map