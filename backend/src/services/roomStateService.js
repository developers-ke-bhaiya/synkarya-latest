/**
 * In-memory room state manager.
 * Tracks socket connections, user mappings, and room membership.
 * This is intentionally in-memory for low-latency signaling.
 * Persistence (attendance) goes to Firestore.
 */

// Map<roomId, Map<uid, { socketId, displayName, uid, sessionId }>>
const rooms = new Map();

// Map<socketId, { uid, roomId, displayName, sessionId }>
const socketToUser = new Map();

const joinRoom = (roomId, uid, socketId, displayName, sessionId) => {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  const room = rooms.get(roomId);
  room.set(uid, { uid, socketId, displayName, sessionId, joinTime: Date.now() });
  socketToUser.set(socketId, { uid, roomId, displayName, sessionId });
};

const leaveRoom = (socketId) => {
  const userInfo = socketToUser.get(socketId);
  if (!userInfo) return null;

  const { uid, roomId } = userInfo;
  const room = rooms.get(roomId);

  if (room) {
    room.delete(uid);
    if (room.size === 0) {
      rooms.delete(roomId);
    }
  }

  socketToUser.delete(socketId);
  return userInfo;
};

const getRoomUsers = (roomId) => {
  const room = rooms.get(roomId);
  if (!room) return [];
  return Array.from(room.values());
};

const getUserInRoom = (roomId, uid) => {
  const room = rooms.get(roomId);
  if (!room) return null;
  return room.get(uid) || null;
};

const getUserBySocket = (socketId) => {
  return socketToUser.get(socketId) || null;
};

const getRoomCount = (roomId) => {
  const room = rooms.get(roomId);
  return room ? room.size : 0;
};

module.exports = {
  joinRoom,
  leaveRoom,
  getRoomUsers,
  getUserInRoom,
  getUserBySocket,
  getRoomCount,
};
