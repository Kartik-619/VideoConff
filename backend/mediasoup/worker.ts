import * as mediasoup from "mediasoup";

let worker: mediasoup.types.Worker | null = null;

export const createWorker = async () => {

  // ✅ already created
  if (worker) {
    return worker;
  }

  worker = await mediasoup.createWorker({
    logLevel: "error",
    rtcMinPort: 10000,
    rtcMaxPort: 59999
  });

  console.log("Worker created:", worker.pid);

  worker.on("died", () => {
    console.error("Worker died:", worker?.pid);

    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
};