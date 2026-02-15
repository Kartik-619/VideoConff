import * as mediasoup from 'mediasoup';
import {router} from './router';



const transport = await router.createWebRtcTransport({
    webRtcServer,
    enableUdp: true,
    enableTcp: true,
    preferUdp: true
  });