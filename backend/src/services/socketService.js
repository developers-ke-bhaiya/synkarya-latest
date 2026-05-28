const { v4: uuidv4 } = require('uuid');
const { authenticateSocket } = require('../middleware/auth');
const { isLeadership } = require('../middleware/auth');
const { recordJoin, recordLeave } = require('./attendanceService');
const roomState = require('./roomStateService');
const { getDb } = require('../config/firebase');
const admin = require('firebase-admin');

const MAX_ROOM_SIZE = 12;
const onlineUsers = new Map(); // uid → userObject

const broadcastOnline = (io) => {
  io.emit('online_users', Array.from(onlineUsers.values()));
};

const sendIncomingCallPush = async ({ targetUid, fromUid, fromDisplayName }) => {
  try {
    const doc = await getDb().collection('users').doc(targetUid).get();
    if (!doc.exists) return false;
    const user = doc.data();
    if (user.explicitLogout || user.reachable === false) return false;
    const tokens = Object.keys(user.pushTokens || {});
    if (!tokens.length) return false;
    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: 'Incoming Synkarya call',
        body: `${fromDisplayName || 'A teammate'} is calling you`,
      },
      data: {
        type: 'direct_call',
        fromUid: fromUid || '',
        fromDisplayName: fromDisplayName || '',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'default',
          sound: 'default',
          priority: 'high',
          clickAction: 'OPEN_SYNKARYA_CALL',
        },
      },
    });
    return true;
  } catch (err) {
    console.error('sendIncomingCallPush error:', err.message);
    return false;
  }
};

const getReachableUsers = async ({ excludeUid, scope, roomId }) => {
  const db = getDb();
  let allowedRoomUids = null;
  if (scope === 'room' && roomId) {
    allowedRoomUids = new Set(roomState.getRoomUsers(roomId).map((u) => u.uid));
  }

  const snapshot = await db.collection('users').where('reachable', '==', true).limit(300).get();
  return snapshot.docs
    .map((doc) => doc.data())
    .filter((user) => user.uid && user.uid !== excludeUid)
    .filter((user) => !user.explicitLogout && Object.keys(user.pushTokens || {}).length > 0)
    .filter((user) => !allowedRoomUids || allowedRoomUids.has(user.uid));
};

const sendMeetingPush = async ({ users, meeting, fromDisplayName }) => {
  const tokens = users.flatMap((user) => Object.keys(user.pushTokens || {}));
  if (!tokens.length) return { success: 0, failure: 0 };
  const isEmergency = meeting.type === 'emergency';
  try {
    const result = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: isEmergency ? 'Emergency Synkarya meeting' : 'Synkarya meeting scheduled',
        body: isEmergency
          ? `${fromDisplayName || 'Leadership'} called: ${meeting.title}`
          : `${meeting.title} has been scheduled`,
      },
      data: {
        type: isEmergency ? 'emergency_meeting' : 'scheduled_meeting',
        meetingId: meeting.id || '',
        title: meeting.title || '',
        scope: meeting.scope || '',
        roomCode: meeting.roomCode || '',
        startsAt: meeting.startsAt || '',
        createdBy: fromDisplayName || '',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: isEmergency ? 'emergency' : 'default',
          sound: 'default',
          priority: 'high',
          clickAction: isEmergency ? 'OPEN_EMERGENCY_MEETING' : 'OPEN_SYNKARYA_MEETING',
        },
      },
    });
    return { success: result.successCount, failure: result.failureCount };
  } catch (err) {
    console.error('sendMeetingPush error:', err.message);
    return { success: 0, failure: tokens.length };
  }
};

const saveAndBroadcastMeeting = async ({ io, socket, uid, displayName, meeting }) => {
  const db = getDb();
  const now = new Date().toISOString();
  const cleanMeeting = {
    id: meeting.id || uuidv4(),
    type: meeting.type === 'emergency' ? 'emergency' : 'scheduled',
    title: String(meeting.title || 'Synkarya meeting').trim().slice(0, 120),
    scope: meeting.scope || 'all',
    roomId: meeting.roomId || null,
    roomCode: meeting.roomCode || '',
    startsAt: meeting.startsAt || null,
    createdAt: meeting.createdAt || now,
    createdBy: displayName,
    createdByUid: uid,
    status: meeting.type === 'emergency' ? 'active' : 'scheduled',
  };

  await db.collection('meetings').doc(cleanMeeting.id).set(cleanMeeting, { merge: true });
  const reachableUsers = await getReachableUsers({ excludeUid: uid, scope: cleanMeeting.scope, roomId: cleanMeeting.roomId });
  const push = await sendMeetingPush({ users: reachableUsers, meeting: cleanMeeting, fromDisplayName: displayName });

  const onlinePayload = {
    ...cleanMeeting,
    message: cleanMeeting.type === 'emergency'
      ? `${cleanMeeting.title} has been called`
      : `${cleanMeeting.title} has been scheduled`,
  };

  if (cleanMeeting.scope === 'room' && cleanMeeting.roomId) {
    socket.to(cleanMeeting.roomId).emit(cleanMeeting.type === 'emergency' ? 'emergency_meeting' : 'scheduled_meeting', onlinePayload);
  } else {
    socket.broadcast.emit(cleanMeeting.type === 'emergency' ? 'emergency_meeting' : 'scheduled_meeting', onlinePayload);
  }

  socket.emit('meeting_saved', { meeting: cleanMeeting, push });
};

const setupSocketHandlers = (io) => {
  io.use(authenticateSocket);

  io.on('connection', async (socket) => {
    if (!socket.user?.uid) { socket.disconnect(true); return; }
    const { uid, displayName, avatar, email } = socket.user;
    console.log(`🔌 Connected: ${displayName} [${socket.id}]`);

    let currentStatus = null;
    try {
      const db = getDb();
      await db.collection('users').doc(uid).update({ lastSeen: new Date().toISOString() });
      const doc = await db.collection('users').doc(uid).get();
      currentStatus = doc.data()?.currentStatus || null;
    } catch (err) { console.error('Connect DB error:', err.message); }

    onlineUsers.set(uid, { uid, displayName, email, avatar, socketId: socket.id, status: currentStatus, connectedAt: new Date().toISOString() });
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
      if (u) { u.status = status; u.socketId = socket.id; onlineUsers.set(uid, u); }
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
      io.in(roomId).emit('room_roster', {
        roomId,
        users: roomState.getRoomUsers(roomId).map(u => ({ uid: u.uid, displayName: u.displayName, socketId: u.socketId })),
      });
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

    socket.on('direct_call_request', async ({ targetUid }) => {
      const t = onlineUsers.get(targetUid);
      if (!t) {
        const pushed = await sendIncomingCallPush({ targetUid, fromUid: uid, fromDisplayName: displayName });
        if (!pushed) socket.emit('direct_call_error', { message: 'User is not reachable' });
        else socket.emit('direct_call_ringing', { targetUid, push: true });
        return;
      }
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
    socket.on('emergency_meeting', async (meeting = {}) => {
      try {
        if (!isLeadership(socket.user)) {
          socket.emit('meeting_error', { message: 'Leadership access required' });
          return;
        }
        await saveAndBroadcastMeeting({
          io,
          socket,
          uid,
          displayName,
          meeting: { ...meeting, type: 'emergency' },
        });
      } catch (err) {
        console.error('emergency_meeting error:', err.message);
        socket.emit('meeting_error', { message: err.message || 'Could not create emergency meeting' });
      }
    });

    socket.on('schedule_meeting', async (meeting = {}) => {
      try {
        if (!isLeadership(socket.user)) {
          socket.emit('meeting_error', { message: 'Leadership access required' });
          return;
        }
        if (!meeting.startsAt) {
          socket.emit('meeting_error', { message: 'startsAt required' });
          return;
        }
        await saveAndBroadcastMeeting({
          io,
          socket,
          uid,
          displayName,
          meeting: { ...meeting, type: 'scheduled' },
        });
      } catch (err) {
        console.error('schedule_meeting error:', err.message);
        socket.emit('meeting_error', { message: err.message || 'Could not schedule meeting' });
      }
    });

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
      const u = onlineUsers.get(uid);
      if (u) {
        u.socketId = socket.id;
        u.lastPing = new Date().toISOString();
        onlineUsers.set(uid, u);
      }
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
  io.in(roomId).emit('room_roster', {
    roomId,
    users: roomState.getRoomUsers(roomId).map(u => ({ uid: u.uid, displayName: u.displayName, socketId: u.socketId })),
  });
};

module.exports = { setupSocketHandlers };
