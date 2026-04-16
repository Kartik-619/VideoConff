import { WebSocket } from "ws";
import * as mediasoup from "mediasoup";

export interface Peer {
  name:string;
  socket: WebSocket;
  transports: Map<string, mediasoup.types.WebRtcTransport>;
  producers: Map<string, mediasoup.types.Producer>;
  consumers: Map<string, mediasoup.types.Consumer>;
}

export interface Room {
  router: mediasoup.types.Router;
  peers: Map<string, Peer>;
}