const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/firebase');

/**
 * Record user joining a room
 */
const recordJoin = async ({ uid, displayName, roomId, roomName, sessionId }) => {
  try {
    const db = getDb();
    const recordId = `${uid}_${roomId}_${sessionId}`;

    const record = {
      recordId,
      sessionId,
      uid,
      displayName,
      roomId,
      roomName,
      joinTime: new Date().toISOString(),
      leaveTime: null,
      durationSeconds: null,
      status: 'active',
    };

    await db.collection('attendance').doc(recordId).set(record);

    // Increment room participant count
    await db
      .collection('rooms')
      .doc(roomId)
      .update({
        participantCount: require('firebase-admin').firestore.FieldValue.increment(1),
      })
      .catch(() => {}); // Room might not exist in DB for dynamic rooms

    return record;
  } catch (err) {
    console.error('Record join error:', err);
  }
};

/**
 * Record user leaving a room
 */
const recordLeave = async ({ uid, roomId, sessionId }) => {
  try {
    const db = getDb();
    const recordId = `${uid}_${roomId}_${sessionId}`;

    const docRef = db.collection('attendance').doc(recordId);
    const doc = await docRef.get();

    if (!doc.exists) return;

    const data = doc.data();
    const joinTime = new Date(data.joinTime);
    const leaveTime = new Date();
    const durationSeconds = Math.floor((leaveTime - joinTime) / 1000);

    await docRef.update({
      leaveTime: leaveTime.toISOString(),
      durationSeconds,
      status: 'completed',
    });

    // Decrement room participant count
    await db
      .collection('rooms')
      .doc(roomId)
      .update({
        participantCount: require('firebase-admin').firestore.FieldValue.increment(-1),
      })
      .catch(() => {});

    return { leaveTime: leaveTime.toISOString(), durationSeconds };
  } catch (err) {
    console.error('Record leave error:', err);
  }
};

module.exports = { recordJoin, recordLeave };
