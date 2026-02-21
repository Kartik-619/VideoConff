import * as mediasoup from 'mediasoup'
import type { WebSocket } from "ws";
export type Peer = {
    socket: WebSocket;
    transports?: Map<string,mediasoup.types.WebRtcTransport>;
    producers: Map<string, mediasoup.types.Producer>;
    consumers: Map<string, mediasoup.types.Consumer>;
  };

  export type Room = {
    router: mediasoup.types.Router;
    peers: Map<string, Peer>;
  };