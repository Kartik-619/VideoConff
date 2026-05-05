import { WebSocket } from "ws";
export interface Peer {
    name: string;
    userId: string;
    socket: WebSocket;
}
export interface Room {
    peers: Map<string, Peer>;
}
//# sourceMappingURL=types.d.ts.map