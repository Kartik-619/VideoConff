import { WebSocketServer, WebSocket } from 'ws';
import express from 'express';
import http from 'http'; // Import http module

const app = express();
app.use(express.static("public")); 

// Create HTTP server explicitly
const httpServer = http.createServer(app);

type roomStore = {
    [roomId: string]: {
        users: {
            [userId: string]: WebSocket
        }
    }
}

const room: roomStore = {};

// Create WebSocket server
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket: WebSocket) => { // Use WebSocket type instead of any
    let currentRoomId: string | null = null;
    let currentUserId: string | null = null;

    console.log("New client connected");

    socket.on('message', (msg: Buffer) => { // msg is Buffer
        try {
            const data = JSON.parse(msg.toString());
            
            if (data.type === "join_room") {
                const { roomId, userId } = data;
                currentRoomId = roomId;
                currentUserId = userId;

                if (!room[roomId]) {
                    room[roomId] = { users: {} };
                }

                room[roomId].users[userId] = socket;

                // Notify others in the room
                Object.keys(room[roomId].users).forEach((uid) => {
                    if (uid !== userId) {
                        room[roomId].users[uid].send(JSON.stringify({
                            type: "user_joined", // Changed to 'user_joined' for clarity
                            userId,
                            message: "User joined"
                        }));
                    }
                });

                // Notify the joining user about existing users
                const existingUsers = Object.keys(room[roomId].users)
                    .filter(uid => uid !== userId);
                
                if (existingUsers.length > 0) {
                    socket.send(JSON.stringify({
                        type: "existing_users",
                        users: existingUsers
                    }));
                }
            }
        } catch (e) {
            console.error("Signal error:", e);
        }
    });

    socket.on("close", () => {
        if (currentRoomId && currentUserId && room[currentRoomId]) {
            delete room[currentRoomId].users[currentUserId];
            
            // Notify remaining users
            Object.keys(room[currentRoomId].users).forEach((uid) => {
                room[currentRoomId!].users[uid].send(JSON.stringify({
                    type: "user_left",
                    userId: currentUserId,
                    message: "User disconnected"
                }));
            });
            
            if (Object.keys(room[currentRoomId].users).length === 0) {
                delete room[currentRoomId];
            }
        }
    });
});

// Start the server
const PORT = 8080;
httpServer.listen(PORT, () => {
    console.log(`Signaling server running on http://localhost:${PORT}`);
});