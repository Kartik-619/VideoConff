import * as mediasoup from "mediasoup";

export const createTransport = async (
  //the types for these router and webRTC server is inbuilt in it
  router: mediasoup.types.Router,
  webRtcServer: mediasoup.types.WebRtcServer
) : Promise<mediasoup.types.WebRtcTransport>=> {
  return await router.createWebRtcTransport({
    webRtcServer,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true
  });
};
