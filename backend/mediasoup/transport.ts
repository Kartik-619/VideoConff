import * as mediasoup from "mediasoup";

//A WebRTC transport represents a network path negotiated by both, a WebRTC endpoint and mediasoup, 
// via ICE and DTLS procedures. A WebRTC transport may be used to receive media, to send media or to both receive and send. There is no limitation in mediasoup

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
