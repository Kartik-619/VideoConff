import * as mediasoup from 'mediasoup';

//Worker = One OS-level C++ process that handles all real-time media
//A dedicated real-time media CPU

const createWorker= async()=>{
    const worker=await mediasoup.createWorker({
        logLevel:'error',
        rtcMinPort:10000, //Minimun RTC port for ICE, DTLS, RTP, etc.
        rtcMaxPort:59999, //Maximum RTC port for ICE, DTLS, RTP, etc.
    });

    worker.on('died',()=>{
        //pid is the process Id of worker subprocess
        console.log("worker died ",worker.pid);
        setTimeout(()=>{
            process.exit(1);   
        },2000);
    });
    return worker;
}

export {createWorker};