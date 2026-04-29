const { v4: uuidv4 } = require('uuid');
const { authenticateSocket } = require('../middleware/auth');
const { recordJoin, recordLeave } = require('./attendanceService');
const roomState = require('./roomStateService');
const { getDb } = require('../config/firebase');

const MAX_ROOM_SIZE = 12;
const onlineUsers = new Map(); // uid → userObject

const broadcastOnline = (io) => {
  io.emit('online_users', Array.from(onlineUsers.values()));
};

const setupSocketHandlers = (io) => {
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    if (!socket.user?.uid) { socket.disconnect(true); return; }

    const { uid, displayName, avatar } = socket.user;
    console.log(`🔌 Connected: ${displayName}`);

    // ── Update lastSeen + load status from Firestore on every connect ─────────
    let currentStatus = null;
    try {
      const db = getDb();
      const now = new Date().toISOString();
      await db.collection('users').doc(uid).update({ lastSeen: now });
      const doc = await db.collection('users').doc(uid).get();
      currentStatus = doc.data()?.currentStatus || null;
    } catch (err) {
      console.error('Connect update error:', err.message);
    }

    onlineUsers.set(uid, { uid, displayName, avatar, socketId: socket.id, status: currentStatus });
    broadcastOnline(io);
    socket.emit('online_users', Array.from(onlineUsers.values()));

    // ── Status update — save to Firestore AND broadcast ───────────────────────
    socket.on('update_status', async ({ status }) => {
      try {
        const db = getDb();
        const now = new Date().toISOString();
        await db.collection('users').doc(uid).update({ currentStatus: status, statusUpdatedAt: now });
        // Also write history
        await db.collection('statusHistory').add({ uid, displayName, status, timestamp: now });
      } catch (err) {
        console.error('update_status Firestore error:', err.message);
      }
      const user = onlineUsers.get(uid);
      if (user) { user.status = status; onlineUsers.set(uid, user); }
      broadcastOnline(io);
    });

    // ── JOIN ROOM ──────────────────────────────────────────────────────────────
    socket.on('join_room', async ({ roomId, roomName }) => {
      try {
        if (!roomId) { socket.emit('error', { message: 'roomId required' }); return; }
        if (roomState.getRoomUsers(roomId).length >= MAX_ROOM_SIZE) {
          socket.emit('error', { message: 'Room is full' }); return;
        }
        const existing = roomState.getUserInRoom(roomId, uid);
        if (existing) roomState.leaveRoom(existing.socketId);

        const sessionId = uuidv4();
        socket.join(roomId);
        roomState.joinRoom(roomId, uid, socket.id, displayName, sessionId);
        await recordJoin({ uid, displayName, roomId, roomName: roomName || roomId, sessionId });

        socket.emit('users_in_room', {
          users: roomState.getRoomUsers(roomId)
            .filter((u) => u.uid !== uid)
            .map((u) => ({ uid: u.uid, displayName: u.displayName, socketId: u.socketId })),
        });
        socket.to(roomId).emit('user_joined', { uid, displayName, avatar, socketId: socket.id });
      } catch (err) {
        console.error('join_room error:', err);
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    socket.on('leave_room', async () => handleLeave(socket, io));

    // ── WebRTC room signaling ──────────────────────────────────────────────────
    socket.on('offer', ({ targetUid, offer, roomId }) => {
      const t = roomState.getUserInRoom(roomId, targetUid);
      if (!t) { socket.emit('peer_unavailable', { targetUid }); return; }
      io.to(t.socketId).emit('offer', { offer, fromUid: uid, fromDisplayName: displayName, fromSocketId: socket.id });
    });
    socket.on('answer', ({ targetUid, answer, roomId }) => {
      const t = roomState.getUserInRoom(roomId, targetUid);
      if (t) io.to(t.socketId).emit('answer', { answer, fromUid: uid });
    });
    socket.on('ice_candidate', ({ targetUid, candidate, roomId }) => {
      const t = roomState.getUserInRoom(roomId, targetUid);
      if (t) io.to(t.socketId).emit('ice_candidate', { candidate, fromUid: uid });
    });
    socket.on('renegotiate', ({ targetUid, offer, roomId }) => {
      const t = roomState.getUserInRoom(roomId, targetUid);
      if (t) io.to(t.socketId).emit('renegotiate', { offer, fromUid: uid });
    });
    socket.on('renegotiate_answer', ({ targetUid, answer, roomId }) => {
      const t = roomState.getUserInRoom(roomId, targetUid);
      if (t) io.to(t.socketId).emit('renegotiate_answer', { answer, fromUid: uid });
    });

    // ── Media state (room) ────────────────────────────────────────────────────
    socket.on('media_state', ({ roomId, audioEnabled, videoEnabled, screenSharing }) => {
      socket.to(roomId).emit('peer_media_state', { uid, audioEnabled, videoEnabled, screenSharing });
    });

    // ── Room chat ─────────────────────────────────────────────────────────────
    socket.on('chat_message', async ({ roomId, message, fileUrl, fileType, fileName }) => {
      if (!roomId) return;
      try {
        const msgData = {
          id: uuidv4(), uid, displayName, avatar,
          message: message?.trim() || '',
          fileUrl: fileUrl || null, fileType: fileType || null, fileName: fileName || null,
          timestamp: new Date().toISOString(), roomId,
        };
        await getDb().collection('messages').doc(msgData.id).set(msgData);
        io.in(roomId).emit('chat_message', msgData);
      } catch (err) { console.error('chat_message error:', err); }
    });

    socket.on('typing', ({ roomId, isTyping }) => {
      if (roomId) socket.to(roomId).emit('user_typing', { uid, displayName, isTyping });
    });

    // ── Private 1v1 call signaling ─────────────────────────────────────────────
    socket.on('direct_call_request', ({ targetUid }) => {
      const t = onlineUsers.get(targetUid);
      if (!t) { socket.emit('direct_call_error', { message: 'User not online' }); return; }
      io.to(t.socketId).emit('direct_call_incoming', { fromUid: uid, fromDisplayName: displayName, fromAvatar: avatar });
      socket.emit('direct_call_ringing', { targetUid });
    });
    socket.on('direct_call_accept', ({ targetUid }) => {
      const t = onlineUsers.get(targetUid);
      if (t) io.to(t.socketId).emit('direct_call_accepted', { fromUid: uid, fromDisplayName: displayName });
    });
    socket.on('direct_call_reject', ({ targetUid }) => {
      const t = onlineUsers.get(targetUid);
      if (t) io.to(t.socketId).emit('direct_call_rejected', { fromUid: uid });
    });
    socket.on('direct_offer', ({ targetUid, offer }) => {
      const t = onlineUsers.get(targetUid);
      if (t) io.to(t.socketId).emit('direct_offer', { offer, fromUid: uid, fromDisplayName: displayName });
    });
    socket.on('direct_answer', ({ targetUid, answer }) => {
      const t = onlineUsers.get(targetUid);
      if (t) io.to(t.socketId).emit('direct_answer', { answer, fromUid: uid });
    });
    socket.on('direct_ice_candidate', ({ targetUid, candidate }) => {
      const t = onlineUsers.get(targetUid);
      if (t) io.to(t.socketId).emit('direct_ice_candidate', { candidate, fromUid: uid });
    });
    socket.on('direct_call_end', ({ targetUid }) => {
      const t = onlineUsers.get(targetUid);
      if (t) io.to(t.socketId).emit('direct_call_ended', { fromUid: uid });
    });

    // Direct call media state
    socket.on('direct_media_state', ({ targetUid, audioEnabled, videoEnabled, screenSharing }) => {
      const t = onlineUsers.get(targetUid);
      if (t) io.to(t.socketId).emit('direct_peer_media_state', { uid, audioEnabled, videoEnabled, screenSharing });
    });

    // Direct call chat — ONLY emit to target, sender adds locally in hook
    socket.on('direct_chat_message', ({ targetUid, message }) => {
      const t = onlineUsers.get(targetUid);
      if (!t || !message?.trim()) return;
      const msgData = {
        id: uuidv4(), uid, displayName, avatar,
        message: message.trim(),
        timestamp: new Date().toISOString(),
      };
      // Only send to target — sender adds it locally to avoid duplicate
      io.to(t.socketId).emit('direct_chat_message', msgData);
      // Echo back to sender with same id so both have it
      socket.emit('direct_chat_message', msgData);
    });

    // ── Disconnect ─────────────────────────────────────────────────────────────
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
  const info = roomState.leaveRoom(socket.id);
  if (!info) return;
  const { uid, roomId, displayName, sessionId } = info;
  socket.leave(roomId);
  const leaveData = await recordLeave({ uid, roomId, sessionId });
  io.in(roomId).emit('user_left', { uid, displayName, leaveTime: leaveData?.leaveTime, durationSeconds: leaveData?.durationSeconds });
};

module.exports = { setupSocketHandlers };
