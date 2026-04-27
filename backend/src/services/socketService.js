const { v4: uuidv4 } = require('uuid');
const { authenticateSocket } = require('../middleware/auth');
const { recordJoin, recordLeave } = require('./attendanceService');
const roomState = require('./roomStateService');
const { getDb } = require('../config/firebase');

const MAX_ROOM_SIZE = 12;

// uid → { uid, displayName, avatar, socketId, status, statusUpdatedAt }
const onlineUsers = new Map();

const broadcastOnline = (io) => {
  io.emit('online_users', Array.from(onlineUsers.values()));
};

const setupSocketHandlers = (io) => {
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    if (!socket.user || !socket.user.uid) {
      socket.disconnect(true);
      return;
    }

    const { uid, displayName, avatar } = socket.user;
    console.log(`🔌 Connected: ${displayName} (${uid})`);

    // ── AUTO-UPDATE lastSeen on every connect (fixes online list bug) ─────────
    try {
      const db = getDb();
      const now = new Date().toISOString();
      await db.collection('users').doc(uid).update({ lastSeen: now });

      // Fetch current status to include in online list
      const userDoc = await db.collection('users').doc(uid).get();
      const userData = userDoc.data() || {};

      onlineUsers.set(uid, {
        uid, displayName, avatar,
        socketId: socket.id,
        status: userData.currentStatus || null,
        statusUpdatedAt: userData.statusUpdatedAt || null,
      });
    } catch (err) {
      console.error('lastSeen update error:', err.message);
      onlineUsers.set(uid, { uid, displayName, avatar, socketId: socket.id, status: null });
    }

    broadcastOnline(io);
    socket.emit('online_users', Array.from(onlineUsers.values()));

    // ── STATUS UPDATE ──────────────────────────────────────────────────────────
    socket.on('update_status', ({ status }) => {
      const user = onlineUsers.get(uid);
      if (user) {
        user.status = status;
        user.statusUpdatedAt = new Date().toISOString();
        onlineUsers.set(uid, user);
        broadcastOnline(io);
      }
    });

    // ── JOIN ROOM ──────────────────────────────────────────────────────────────
    socket.on('join_room', async ({ roomId, roomName }) => {
      try {
        if (!roomId) { socket.emit('error', { message: 'roomId is required' }); return; }

        const currentUsers = roomState.getRoomUsers(roomId);
        if (currentUsers.length >= MAX_ROOM_SIZE) {
          socket.emit('error', { message: 'Room is full (max 12 participants)' });
          return;
        }

        const existing = roomState.getUserInRoom(roomId, uid);
        if (existing) roomState.leaveRoom(existing.socketId);

        const sessionId = uuidv4();
        socket.join(roomId);
        roomState.joinRoom(roomId, uid, socket.id, displayName, sessionId);
        await recordJoin({ uid, displayName, roomId, roomName: roomName || roomId, sessionId });

        const usersInRoom = roomState.getRoomUsers(roomId).filter((u) => u.uid !== uid);
        socket.emit('users_in_room', {
          users: usersInRoom.map((u) => ({ uid: u.uid, displayName: u.displayName, socketId: u.socketId })),
        });

        socket.to(roomId).emit('user_joined', { uid, displayName, avatar, socketId: socket.id });
        console.log(`📥 ${displayName} joined ${roomId} (${roomState.getRoomCount(roomId)} users)`);
      } catch (err) {
        console.error('join_room error:', err);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

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

    // ── PRIVATE 1v1 CALL SIGNALING ─────────────────────────────────────────────
    socket.on('direct_call_request', ({ targetUid }) => {
      const targetUser = onlineUsers.get(targetUid);
      if (!targetUser) { socket.emit('direct_call_error', { message: 'User is not online' }); return; }
      io.to(targetUser.socketId).emit('direct_call_incoming', { fromUid: uid, fromDisplayName: displayName, fromAvatar: avatar });
      socket.emit('direct_call_ringing', { targetUid });
    });

    socket.on('direct_call_accept', ({ targetUid }) => {
      const targetUser = onlineUsers.get(targetUid);
      if (!targetUser) return;
      io.to(targetUser.socketId).emit('direct_call_accepted', { fromUid: uid, fromDisplayName: displayName });
    });

    socket.on('direct_call_reject', ({ targetUid }) => {
      const targetUser = onlineUsers.get(targetUid);
      if (!targetUser) return;
      io.to(targetUser.socketId).emit('direct_call_rejected', { fromUid: uid });
    });

    socket.on('direct_offer', ({ targetUid, offer }) => {
      const targetUser = onlineUsers.get(targetUid);
      if (!targetUser) return;
      io.to(targetUser.socketId).emit('direct_offer', { offer, fromUid: uid, fromDisplayName: displayName });
    });

    socket.on('direct_answer', ({ targetUid, answer }) => {
      const targetUser = onlineUsers.get(targetUid);
      if (!targetUser) return;
      io.to(targetUser.socketId).emit('direct_answer', { answer, fromUid: uid });
    });

    socket.on('direct_ice_candidate', ({ targetUid, candidate }) => {
      const targetUser = onlineUsers.get(targetUid);
      if (!targetUser) return;
      io.to(targetUser.socketId).emit('direct_ice_candidate', { candidate, fromUid: uid });
    });

    socket.on('direct_call_end', ({ targetUid }) => {
      const targetUser = onlineUsers.get(targetUid);
      if (!targetUser) return;
      io.to(targetUser.socketId).emit('direct_call_ended', { fromUid: uid });
    });

    // Direct call chat
    socket.on('direct_chat_message', ({ targetUid, message }) => {
      const targetUser = onlineUsers.get(targetUid);
      if (!targetUser) return;
      const msgData = {
        id: uuidv4(), uid, displayName, avatar,
        message: message?.trim() || '',
        timestamp: new Date().toISOString(),
      };
      // Send to both
      io.to(targetUser.socketId).emit('direct_chat_message', msgData);
      socket.emit('direct_chat_message', msgData);
    });

    // ── MEDIA STATE ────────────────────────────────────────────────────────────
    socket.on('media_state', ({ roomId, audioEnabled, videoEnabled, screenSharing }) => {
      socket.to(roomId).emit('peer_media_state', { uid, audioEnabled, videoEnabled, screenSharing });
    });

    socket.on('direct_media_state', ({ targetUid, audioEnabled, videoEnabled, screenSharing }) => {
      const targetUser = onlineUsers.get(targetUid);
      if (!targetUser) return;
      io.to(targetUser.socketId).emit('direct_peer_media_state', { uid, audioEnabled, videoEnabled, screenSharing });
    });

    // ── ROOM CHAT ──────────────────────────────────────────────────────────────
    socket.on('chat_message', async ({ roomId, message, fileUrl, fileType, fileName }) => {
      try {
        if (!roomId) return;
        const msgData = {
          id: uuidv4(), uid, displayName, avatar,
          message: message?.trim() || '',
          fileUrl: fileUrl || null, fileType: fileType || null, fileName: fileName || null,
          timestamp: new Date().toISOString(), roomId,
        };
        const db = getDb();
        await db.collection('messages').doc(msgData.id).set(msgData);
        // Emit to room — sender is IN the room so they receive too
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
      console.log(`🔌 Disconnected: ${displayName} — ${reason}`);
      onlineUsers.delete(uid);
      broadcastOnline(io);
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
    uid, displayName,
    leaveTime: leaveData?.leaveTime,
    durationSeconds: leaveData?.durationSeconds,
  });
};

module.exports = { setupSocketHandlers };
