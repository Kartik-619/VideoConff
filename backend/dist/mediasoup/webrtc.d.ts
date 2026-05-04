import * as mediasoup from 'mediasoup';
export declare const initializeMediasoup: () => Promise<{
    worker: mediasoup.types.Worker<mediasoup.types.AppData>;
    webRtcServer: mediasoup.types.WebRtcServer<mediasoup.types.AppData>;
}>;
export declare const getSharedWorker: () => mediasoup.types.Worker;
export declare const getSharedWebRtcServer: () => mediasoup.types.WebRtcServer;
//# sourceMappingURL=webrtc.d.ts.map