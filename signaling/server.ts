import { WebSocketServer, WebSocket } from "ws";

const wss = new WebSocketServer({ port: 8080 });

console.log("✅ Signaling server running on ws://localhost:8080");

const rooms = new Map<string, Set<WebSocket>>();

wss.on("connection", (ws: WebSocket) => {
  let currentRoom: string | null = null;

  ws.on("message", (message: WebSocket.RawData) => {
    const data = JSON.parse(message.toString());

    // ===== JOIN =====
    if (data.type === "join") {
      const roomId: string = data.roomId;
      currentRoom = roomId;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
      }

      rooms.get(roomId)!.add(ws);

      console.log("User joined:", roomId);

      const peers = rooms.get(roomId)!;

      // If 2 users → first creates offer
      if (peers.size === 2) {
        const [first] = Array.from(peers);
        first.send(JSON.stringify({ type: "create-offer" }));
      }

      return;
    }

    // ===== SIGNAL FORWARD =====
    if (!currentRoom) return;

    const peers = rooms.get(currentRoom);
    if (!peers) return;

    peers.forEach(client => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  });

  ws.on("close", () => {
    if (!currentRoom) return;

    const peers = rooms.get(currentRoom);
    if (!peers) return;

    peers.delete(ws);

    if (peers.size === 0) {
      rooms.delete(currentRoom);
    }

    console.log("User left:", currentRoom);
  });
});
