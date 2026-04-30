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
let rtpCapabilities: any;

//asks whaat codecs the machines supports
async function initRtpCapabilities() {
  rtpCapabilities = await mediasoup.getSupportedRtpCapabilities();
}

initRtpCapabilities();

//These are the only codecs allowed inside this SFU room.


//This creates a shared ICE listener.
//Instead of each transport opening random ports, all clients connect to:9.9.9.9:20000




  
    

    