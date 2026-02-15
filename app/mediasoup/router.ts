import * as mediasoup from 'mediasoup';
import type { RtpCodecCapability } from "mediasoup/types";

import { createWorker } from './worker';

const worker=await createWorker();

const mediaCodecs: RtpCodecCapability[] = [
    {
        kind: "audio",
        mimeType: "audio/opus",
        clockRate: 48000,
        channels: 2,
        preferredPayloadType: 0
    },
    {
        kind: "video",
        mimeType: "video/VP8",
        clockRate: 90000,
        preferredPayloadType: 0
    },
    {
        kind: "video",
        mimeType: "video/H264",
        clockRate: 90000,
        parameters: {
            "packetization-mode": 1,
            "profile-level-id": "42e01f",
            "level-asymmetry-allowed": 1
        },
        preferredPayloadType: 0
    }
  ];
  

//creating rooms
const router=await worker.createRouter({mediaCodecs});

export {router};