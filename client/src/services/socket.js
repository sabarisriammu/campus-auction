import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:5000";

let socket = null;
let currentToken = null;

/**
 * Initializes or returns the Socket.IO connection.
 * If token is provided, authenticates the connection for user-specific rooms.
 * If token is omitted, establishes a public connection for watching live auction updates.
 * @param {string|null} token - JWT bearer token (optional)
 * @returns {object}
 */
export function getSocket(token = null) {
  // Reuse existing socket if token has not changed
  if (socket && currentToken === token) {
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  // Clean up previous socket if token changed
  if (socket) {
    socket.disconnect();
  }

  currentToken = token;

  const authPayload = token ? { token } : {};

  socket = io(SOCKET_URL, {
    auth: authPayload,
    reconnection: true,
    reconnectionAttempts: 15,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 5000,
    transports: ["websocket", "polling"],
  });

  socket.on("connect_error", (err) => {
    console.warn("Socket.IO connection error:", err.message);
  });

  return socket;
}

/**
 * Join an auction's live update room
 * @param {string} listingId
 */
export function joinAuctionRoom(listingId) {
  if (!socket || !listingId) return;
  socket.emit("auction:join", { listingId });
}

/**
 * Leave an auction's live update room
 * @param {string} listingId
 */
export function leaveAuctionRoom(listingId) {
  if (!socket || !listingId) return;
  socket.emit("auction:leave", { listingId });
}

/**
 * Disconnects the socket and resets connection state.
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  currentToken = null;
}
