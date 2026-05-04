import * as mediasoup from 'mediasoup';
import { createWorker } from './worker';

// A WebRTC server exists within the context of a Worker.
// The WebRTC transport implementation of mediasoup is ICE Lite.

// We create a single worker and WebRTC server to be shared across all routers
let sharedWorker: mediasoup.types.Worker | null = null;
let sharedWebRtcServer: mediasoup.types.WebRtcServer | null = null;

export const initializeMediasoup = async () => {
  if (sharedWorker) return { worker: sharedWorker, webRtcServer: sharedWebRtcServer! };
  
  sharedWorker = await createWorker();
  sharedWebRtcServer = await sharedWorker.createWebRtcServer(
    {
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
    }
  );
  
  console.log("Mediasoup initialized - Worker:", sharedWorker.pid, "WebRTC Server:", sharedWebRtcServer.id);
  return { worker: sharedWorker, webRtcServer: sharedWebRtcServer };
};

export const getSharedWorker = (): mediasoup.types.Worker => {
  if (!sharedWorker) throw new Error("Mediasoup not initialized");
  return sharedWorker;
};

export const getSharedWebRtcServer = (): mediasoup.types.WebRtcServer => {
  if (!sharedWebRtcServer) throw new Error("Mediasoup not initialized");
  return sharedWebRtcServer;
};

