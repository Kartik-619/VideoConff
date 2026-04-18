const mediasoup = require("mediasoup");

const createWorker = async () => {
  const worker = await mediasoup.createWorker({
    logLevel: "warn",
    logTags: ["info", "ice", "dtls", "rtp", "srtp", "rtcp"],
    rtcMinPort: 10000,
    rtcMaxPort: 20000,
  });

  worker.on("died", (error) => {
    console.error("mediasoup worker died, exiting in 2 seconds...", error);
    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
};

module.exports = { createWorker };
