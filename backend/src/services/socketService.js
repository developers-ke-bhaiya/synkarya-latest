const { v4: uuidv4 } = require('uuid');
const { authenticateSocket } = require('../middleware/auth');
const { recordJoin, recordLeave } = require('./attendanceService');
const roomState = require('./roomStateService');
const { getDb } = require('../config/firebase');

const MAX_ROOM_SIZE = 12;

const setupSocketHandlers = (io) => {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    // Guard: if auth failed somehow, disconnect immediately
    if (!socket.user || !socket.user.uid) {
      console.warn('Socket connected without valid user — disconnecting');
      socket.disconnect(true);
      return;
    }

    const { uid, displayName, avatar } = socket.user;
    console.log(`🔌 Connected: ${displayName} (${uid}) [${socket.id}]`);

    // ── JOIN ROOM ──────────────────────────────────────────────────────────────
    socket.on('join_room', async ({ roomId, roomName }) => {
      try {
        if (!roomId) { socket.emit('error', { message: 'roomId is required' }); return; }

        const currentUsers = roomState.getRoomUsers(roomId);
        if (currentUsers.length >= MAX_ROOM_SIZE) {
          socket.emit('error', { message: 'Room is full (max 12 participants)' });
          return;
        }

        // Handle reconnect: remove old socket mapping
        const existing = roomState.getUserInRoom(roomId, uid);
        if (existing) roomState.leaveRoom(existing.socketId);

        const sessionId = uuidv4();
        socket.join(roomId);
        roomState.joinRoom(roomId, uid, socket.id, displayName, sessionId);

        await recordJoin({ uid, displayName, roomId, roomName: roomName || roomId, sessionId });

        // Send existing peers to joiner
        const usersInRoom = roomState.getRoomUsers(roomId).filter((u) => u.uid !== uid);
        socket.emit('users_in_room', {
          users: usersInRoom.map((u) => ({ uid: u.uid, displayName: u.displayName, socketId: u.socketId })),
        });

        // Notify existing users
        socket.to(roomId).emit('user_joined', { uid, displayName, avatar, socketId: socket.id });

        console.log(`📥 ${displayName} joined ${roomId} (${roomState.getRoomCount(roomId)} users)`);
      } catch (err) {
        console.error('join_room error:', err);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ── LEAVE ROOM ─────────────────────────────────────────────────────────────
    socket.on('leave_room', async () => { await handleLeave(socket, io); });

    // ── WebRTC SIGNALING ───────────────────────────────────────────────────────
    socket.on('offer', ({ targetUid, offer, roomId }) => {
      const target = roomState.getUserInRoom(roomId, targetUid);
      if (!target) { socket.emit('peer_unavailable', { targetUid }); return; }
      io.to(target.socketId).emit('offer', { offer, fromUid: uid, fromDisplayName: displayName, fromSocketId: socket.id });
    });

    socket.on('answer', ({ targetUid, answer, roomId }) => {
      const target = roomState.getUserInRoom(roomId, targetUid);
      if (!target) return;
      io.to(target.socketId).emit('answer', { answer, fromUid: uid });
    });

    socket.on('ice_candidate', ({ targetUid, candidate, roomId }) => {
      const target = roomState.getUserInRoom(roomId, targetUid);
      if (!target) return;
      io.to(target.socketId).emit('ice_candidate', { candidate, fromUid: uid });
    });

    socket.on('renegotiate', ({ targetUid, offer, roomId }) => {
      const target = roomState.getUserInRoom(roomId, targetUid);
      if (!target) return;
      io.to(target.socketId).emit('renegotiate', { offer, fromUid: uid });
    });

    socket.on('renegotiate_answer', ({ targetUid, answer, roomId }) => {
      const target = roomState.getUserInRoom(roomId, targetUid);
      if (!target) return;
      io.to(target.socketId).emit('renegotiate_answer', { answer, fromUid: uid });
    });

    // ── MEDIA STATE ────────────────────────────────────────────────────────────
    socket.on('media_state', ({ roomId, audioEnabled, videoEnabled, screenSharing }) => {
      socket.to(roomId).emit('peer_media_state', { uid, audioEnabled, videoEnabled, screenSharing });
    });

    // ── CHAT ───────────────────────────────────────────────────────────────────
    socket.on('chat_message', async ({ roomId, message, fileUrl, fileType, fileName }) => {
      try {
        if (!roomId) return;
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

        const db = getDb();
        await db.collection('messages').doc(msgData.id).set(msgData);
        io.in(roomId).emit('chat_message', msgData);
      } catch (err) {
        console.error('chat_message error:', err);
      }
    });

    socket.on('typing', ({ roomId, isTyping }) => {
      if (!roomId) return;
      socket.to(roomId).emit('user_typing', { uid, displayName, isTyping });
    });

    // ── DISCONNECT ─────────────────────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      console.log(`🔌 Disconnected: ${displayName} [${socket.id}] — ${reason}`);
      await handleLeave(socket, io);
    });

    socket.on('ping', () => socket.emit('pong', { timestamp: Date.now() }));
  });
};

const handleLeave = async (socket, io) => {
  const userInfo = roomState.leaveRoom(socket.id);
  if (!userInfo) return;

  const { uid, roomId, displayName, sessionId } = userInfo;
  socket.leave(roomId);

  const leaveData = await recordLeave({ uid, roomId, sessionId });

  io.in(roomId).emit('user_left', {
    uid,
    displayName,
    leaveTime: leaveData?.leaveTime,
    durationSeconds: leaveData?.durationSeconds,
  });

  console.log(`📤 ${displayName} left ${roomId}`);
};

module.exports = { setupSocketHandlers };
