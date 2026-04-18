// Peer type definition for WebSocket signaling
const Peer = {
  name: "",
  userId: "",
  socket: null,
  transports: new Map(),
  producers: new Map(),
  consumers: new Map(),
};

module.exports = { Peer };
