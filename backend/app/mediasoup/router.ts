import * as mediasoup from "mediasoup";
import { createWorker } from "./worker";

const mediaCodecs: { kind: string; mimeType: string; clockRate: number; channels?: number; preferredPayloadType: number; parameters?: { [key: string]: any } }[] = [
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

// creating rooms
export const createRouter = async () => {
  const worker = await createWorker();

  const router = await worker.createRouter({
    mediaCodecs
  });

  console.log("Router created:", router.id);

  return router;
};