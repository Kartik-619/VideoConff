import * as mediasoup from 'mediasoup';
import { createWorker } from './worker';


const worker=await createWorker();

//A WebRTC server exists within the context of a Worker, meaning that if your app launches N workers it also needs to create N WebRTC servers listening on different ports (to not collide).
//The WebRTC transport implementation of mediasoup is ICE Lite, meaning that it does not initiate ICE connections but expects ICE Binding Requests from endpoints.
//WebRtcServerOptions
export const createWebRTCServer=async()=>{
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
        },
      );
      console.log("WebRTC Server created:", webRtcServer.id);
    return webRtcServer;
}

