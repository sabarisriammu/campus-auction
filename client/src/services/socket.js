import { io } from "socket.io-client";

const SOCKET_URL = "http://localhost:5000";

let socket = null;
let currentToken = null;

/**
 * Initializes or returns the authenticated Socket.IO connection.
 * @param {string} token - JWT bearer token
 * @returns {object|null}
 */
export function getSocket(token) {
  if (!token) {
    disconnectSocket();
    return null;
  }

  // Reuse existing socket if token is unchanged
  if (socket && currentToken === token) {
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  // Clean up existing socket before creating new one
  if (socket) {
    socket.disconnect();
  }

  currentToken = token;
  socket = io(SOCKET_URL, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
    transports: ["websocket", "polling"],
  });

  socket.on("connect_error", (err) => {
    console.warn("Socket.IO connection error:", err.message);
  });

  return socket;
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
