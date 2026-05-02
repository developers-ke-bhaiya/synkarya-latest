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
    console.log(`🔌 Connected: ${displayName} [${socket.id}]`);

    let currentStatus = null;
    try {
      const db = getDb();
      await db.collection('users').doc(uid).update({ lastSeen: new Date().toISOString() });
      const doc = await db.collection('users').doc(uid).get();
      currentStatus = doc.data()?.currentStatus || null;
    } catch (err) { console.error('Connect DB error:', err.message); }

    onlineUsers.set(uid, { uid, displayName, avatar, socketId: socket.id, status: currentStatus });
    broadcastOnline(io);

    // ── Status ────────────────────────────────────────────────────────────
    socket.on('update_status', async ({ status }) => {
      try {
        const db = getDb();
        const now = new Date().toISOString();
        await db.collection('users').doc(uid).update({ currentStatus: status, statusUpdatedAt: now });
        // Dedup: don't save if same status was saved in last 60 seconds
        // Simple query — only uid filter, no composite index needed
        const recent = await db.collection('statusHistory')
          .where('uid', '==', uid)
          .orderBy('timestamp', 'desc')
          .limit(1)
          .get();
        const lastEntry = recent.docs[0]?.data();
        const lastTime = lastEntry ? new Date(lastEntry.timestamp).getTime() : 0;
        const isSameStatus = lastEntry?.status === status;
        const isRecent = Date.now() - lastTime < 60000;
        if (!(isSameStatus && isRecent)) {
          await db.collection('statusHistory').add({ uid, displayName, status, timestamp: now });
        }
      } catch (err) { console.error('update_status error:', err.message); }
      const u = onlineUsers.get(uid);
      if (u) { u.status = status; onlineUsers.set(uid, u); }
      broadcastOnline(io);
    });

    // ── Room join ─────────────────────────────────────────────────────────
    socket.on('join_room', async ({ roomId, roomName }) => {
      if (!roomId) { socket.emit('error', { message: 'roomId required' }); return; }
      if (roomState.getRoomUsers(roomId).length >= MAX_ROOM_SIZE) {
        socket.emit('error', { message: 'Room is full' }); return;
      }
      const prev = roomState.getUserInRoom(roomId, uid);
      if (prev) roomState.leaveRoom(prev.socketId);

      const sessionId = uuidv4();
      socket.join(roomId);
      roomState.joinRoom(roomId, uid, socket.id, displayName, sessionId);
      await recordJoin({ uid, displayName, roomId, roomName: roomName || roomId, sessionId });

      const peers = roomState.getRoomUsers(roomId)
        .filter(u => u.uid !== uid)
        .map(u => ({ uid: u.uid, displayName: u.displayName, socketId: u.socketId }));

      socket.emit('users_in_room', { users: peers });
      socket.to(roomId).emit('user_joined', { uid, displayName, avatar, socketId: socket.id });
    });

    socket.on('leave_room', async () => handleLeave(socket, io));

    // ── Room WebRTC ───────────────────────────────────────────────────────
    socket.on('offer', ({ targetUid, offer, roomId }) => {
      const t = roomState.getUserInRoom(roomId, targetUid);
      if (!t) { socket.emit('peer_unavailable', { targetUid }); return; }
      io.to(t.socketId).emit('offer', { offer, fromUid: uid, fromDisplayName: displayName });
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

    // ── Room media state ──────────────────────────────────────────────────
    socket.on('media_state', ({ roomId, audioEnabled, videoEnabled, screenSharing }) => {
      if (roomId) socket.to(roomId).emit('peer_media_state', { uid, audioEnabled, videoEnabled, screenSharing });
    });

    // ── Room chat ─────────────────────────────────────────────────────────
    socket.on('chat_message', async ({ roomId, message, fileUrl, fileType, fileName }) => {
      if (!roomId) { console.error(`[chat] Missing roomId from ${displayName}`); return; }
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

    // ── Private 1v1 call ──────────────────────────────────────────────────
    const toPeer = (targetUid, event, data) => {
      const t = onlineUsers.get(targetUid);
      if (t) io.to(t.socketId).emit(event, data);
    };

    socket.on('direct_call_request', ({ targetUid }) => {
      const t = onlineUsers.get(targetUid);
      if (!t) { socket.emit('direct_call_error', { message: 'User not online' }); return; }
      io.to(t.socketId).emit('direct_call_incoming', { fromUid: uid, fromDisplayName: displayName, fromAvatar: avatar });
      socket.emit('direct_call_ringing', { targetUid });
    });
    socket.on('direct_call_accept', ({ targetUid }) => toPeer(targetUid, 'direct_call_accepted', { fromUid: uid, fromDisplayName: displayName }));
    socket.on('direct_call_reject', ({ targetUid }) => toPeer(targetUid, 'direct_call_rejected', { fromUid: uid }));
    socket.on('direct_offer', ({ targetUid, offer }) => toPeer(targetUid, 'direct_offer', { offer, fromUid: uid, fromDisplayName: displayName }));
    socket.on('direct_answer', ({ targetUid, answer }) => toPeer(targetUid, 'direct_answer', { answer, fromUid: uid }));
    socket.on('direct_ice_candidate', ({ targetUid, candidate }) => toPeer(targetUid, 'direct_ice_candidate', { candidate, fromUid: uid }));
    socket.on('direct_call_end', ({ targetUid }) => toPeer(targetUid, 'direct_call_ended', { fromUid: uid }));
    socket.on('direct_media_state', ({ targetUid, audioEnabled, videoEnabled, screenSharing }) =>
      toPeer(targetUid, 'direct_peer_media_state', { uid, audioEnabled, videoEnabled, screenSharing }));

    // FIX: DM uses separate event 'dm_message' — NOT 'direct_chat_message'
    // direct_chat_message is only for in-call private chat
    socket.on('dm_message', ({ targetUid, message }) => {
      const t = onlineUsers.get(targetUid);
      if (!t || !message?.trim()) return;
      const msg = {
        id: uuidv4(), uid, displayName, avatar,
        message: message.trim(),
        timestamp: new Date().toISOString(),
      };
      // Send to receiver
      io.to(t.socketId).emit('dm_message', { ...msg, fromUid: uid });
      // Echo back to sender as confirmation
      socket.emit('dm_message_sent', { ...msg, toUid: targetUid });
    });

    // In-call private chat (during direct video call)
    socket.on('direct_chat_message', ({ targetUid, message }) => {
      const t = onlineUsers.get(targetUid);
      if (!t || !message?.trim()) return;
      const msg = { id: uuidv4(), uid, displayName, avatar, message: message.trim(), timestamp: new Date().toISOString() };
      io.to(t.socketId).emit('direct_chat_message', msg);
      socket.emit('direct_chat_message', msg);
    });

    // ── Ping ─────────────────────────────────────────────────────────────
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: Date.now() });
      socket.emit('online_users', Array.from(onlineUsers.values()));
    });

    // ── Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', async (reason) => {
      console.log(`🔌 Disconnected: ${displayName} [${socket.id}] — ${reason}`);
      const current = onlineUsers.get(uid);
      if (current && current.socketId === socket.id) {
        onlineUsers.delete(uid);
        broadcastOnline(io);
      }
      await handleLeave(socket, io);
    });
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
