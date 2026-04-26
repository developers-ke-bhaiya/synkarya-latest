const { v4: uuidv4 } = require('uuid');
const { authenticateSocket } = require('../middleware/auth');
const { recordJoin, recordLeave } = require('./attendanceService');
const roomState = require('./roomStateService');
const { getDb } = require('../config/firebase');

const MAX_ROOM_SIZE = 12;

const setupSocketHandlers = (io) => {
  // Auth middleware for all socket connections
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const { uid, displayName, avatar } = socket.user;
    console.log(`🔌 Socket connected: ${displayName} (${uid}) [${socket.id}]`);

    // ─────────────────────────────────────────────
    // JOIN ROOM
    // ─────────────────────────────────────────────
    socket.on('join_room', async ({ roomId, roomName }) => {
      try {
        const currentUsers = roomState.getRoomUsers(roomId);

        if (currentUsers.length >= MAX_ROOM_SIZE) {
          socket.emit('error', { message: 'Room is full (max 12 participants)' });
          return;
        }

        // Check if user is already in room (reconnect scenario)
        const existing = roomState.getUserInRoom(roomId, uid);
        if (existing) {
          // Remove old socket mapping
          roomState.leaveRoom(existing.socketId);
        }

        const sessionId = uuidv4();
        socket.join(roomId);
        roomState.joinRoom(roomId, uid, socket.id, displayName, sessionId);

        // Record attendance
        await recordJoin({ uid, displayName, roomId, roomName: roomName || roomId, sessionId });

        // Send existing users list to the new joiner
        const usersInRoom = roomState.getRoomUsers(roomId).filter((u) => u.uid !== uid);
        socket.emit('users_in_room', {
          users: usersInRoom.map((u) => ({
            uid: u.uid,
            displayName: u.displayName,
            socketId: u.socketId,
          })),
        });

        // Notify existing users that someone joined
        socket.to(roomId).emit('user_joined', {
          uid,
          displayName,
          avatar,
          socketId: socket.id,
        });

        console.log(`📥 ${displayName} joined room ${roomId} (${roomState.getRoomCount(roomId)} users)`);
      } catch (err) {
        console.error('join_room error:', err);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ─────────────────────────────────────────────
    // LEAVE ROOM (explicit)
    // ─────────────────────────────────────────────
    socket.on('leave_room', async () => {
      await handleLeave(socket, io);
    });

    // ─────────────────────────────────────────────
    // WebRTC SIGNALING
    // ─────────────────────────────────────────────

    // Offer: sender → specific peer
    socket.on('offer', ({ targetUid, offer, roomId }) => {
      const targetUser = roomState.getUserInRoom(roomId, targetUid);
      if (!targetUser) {
        socket.emit('peer_unavailable', { targetUid });
        return;
      }
      io.to(targetUser.socketId).emit('offer', {
        offer,
        fromUid: uid,
        fromDisplayName: displayName,
        fromSocketId: socket.id,
      });
    });

    // Answer: receiver → offerer
    socket.on('answer', ({ targetUid, answer, roomId }) => {
      const targetUser = roomState.getUserInRoom(roomId, targetUid);
      if (!targetUser) return;
      io.to(targetUser.socketId).emit('answer', {
        answer,
        fromUid: uid,
      });
    });

    // ICE candidate relay
    socket.on('ice_candidate', ({ targetUid, candidate, roomId }) => {
      const targetUser = roomState.getUserInRoom(roomId, targetUid);
      if (!targetUser) return;
      io.to(targetUser.socketId).emit('ice_candidate', {
        candidate,
        fromUid: uid,
      });
    });

    // ─────────────────────────────────────────────
    // RENEGOTIATION (for screen share switches)
    // ─────────────────────────────────────────────
    socket.on('renegotiate', ({ targetUid, offer, roomId }) => {
      const targetUser = roomState.getUserInRoom(roomId, targetUid);
      if (!targetUser) return;
      io.to(targetUser.socketId).emit('renegotiate', {
        offer,
        fromUid: uid,
      });
    });

    socket.on('renegotiate_answer', ({ targetUid, answer, roomId }) => {
      const targetUser = roomState.getUserInRoom(roomId, targetUid);
      if (!targetUser) return;
      io.to(targetUser.socketId).emit('renegotiate_answer', {
        answer,
        fromUid: uid,
      });
    });

    // ─────────────────────────────────────────────
    // MEDIA STATE BROADCAST (mute/camera/screen)
    // ─────────────────────────────────────────────
    socket.on('media_state', ({ roomId, audioEnabled, videoEnabled, screenSharing }) => {
      socket.to(roomId).emit('peer_media_state', {
        uid,
        audioEnabled,
        videoEnabled,
        screenSharing,
      });
    });

    // ─────────────────────────────────────────────
    // CHAT
    // ─────────────────────────────────────────────
    socket.on('chat_message', async ({ roomId, message, fileUrl, fileType, fileName }) => {
      try {
        const msgData = {
          id: uuidv4(),
          uid,
          displayName,
          avatar,
          message: message?.trim() || '',
          fileUrl: fileUrl || null,
          fileType: fileType || null,
          fileName: fileName || null,
          timestamp: new Date().toISOString(),
          roomId,
        };

        // Persist to Firestore
        const db = getDb();
        await db.collection('messages').doc(msgData.id).set(msgData);

        // Broadcast to entire room (including sender for consistency)
        io.in(roomId).emit('chat_message', msgData);
      } catch (err) {
        console.error('chat_message error:', err);
      }
    });

    // Typing indicator
    socket.on('typing', ({ roomId, isTyping }) => {
      socket.to(roomId).emit('user_typing', { uid, displayName, isTyping });
    });

    // ─────────────────────────────────────────────
    // DISCONNECT
    // ─────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      console.log(`🔌 Socket disconnected: ${displayName} [${socket.id}] — ${reason}`);
      await handleLeave(socket, io);
    });

    // ─────────────────────────────────────────────
    // PING/PONG (keep-alive)
    // ─────────────────────────────────────────────
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
    });
  });
};

const handleLeave = async (socket, io) => {
  const userInfo = roomState.leaveRoom(socket.id);
  if (!userInfo) return;

  const { uid, roomId, displayName, sessionId } = userInfo;
  socket.leave(roomId);

  // Record attendance leave
  const leaveData = await recordLeave({ uid, roomId, sessionId });

  // Notify room
  io.in(roomId).emit('user_left', {
    uid,
    displayName,
    leaveTime: leaveData?.leaveTime,
    durationSeconds: leaveData?.durationSeconds,
  });

  console.log(`📤 ${displayName} left room ${roomId}`);
};

module.exports = { setupSocketHandlers };
