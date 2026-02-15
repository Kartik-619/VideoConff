import * as mediasoup from 'mediasoup';
import { createWorker } from './worker';


const worker=await createWorker();

const webRtcServer = await worker.createWebRtcServer(
    {
      listenInfos :
      [
        {
          protocol : 'udp',
          ip       : '9.9.9.9',
          //  announcedIp: "YOUR_PUBLIC_IP",,
          port     : 20000
        },
        {
          protocol : 'tcp',
          ip       : '9.9.9.9',
        //  announcedIp: "YOUR_PUBLIC_IP",
          port     : 20000
        }
      ]
    });