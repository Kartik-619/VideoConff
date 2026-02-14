import * as mediasoup from 'mediasoup';
import type { RtpCodecCapability } from "mediasoup/types";
//Worker    A C++ process that handles all RTP packets
//Router    One virtual SFU (one room)
//Transport One client’s connection
//Producer  One incoming media track
//Consumer  One outgoing media track
//RTP capabilities  Codec negotiation
//
let workerType: mediasoup.types.Worker;
let rtpParams: mediasoup.types.RtpParameters;

//asks whaat codecs the machines supports
const rtpCapabilities = await mediasoup.getSupportedRtpCapabilities();

const worker=await mediasoup.createWorker({
    logLevel:'error',
    rtcMinPort:10000, //Minimun RTC port for ICE, DTLS, RTP, etc.
    rtcMaxPort:59999, //Maximum RTC port for ICE, DTLS, RTP, etc.
});


//These are the only codecs allowed inside this SFU room.
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

//This creates a shared ICE listener.
//Instead of each transport opening random ports, all clients connect to:9.9.9.9:20000

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