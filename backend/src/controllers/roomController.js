const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/firebase');

const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const createRoom = async (req, res) => {
  try {
    const { name, type = 'open' } = req.body;
    const { uid, displayName } = req.user;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Room name must be at least 2 characters' });
    }

    const db = getDb();
    const roomId = uuidv4();
    const roomCode = generateRoomCode();

    const roomData = {
      roomId,
      name: name.trim(),
      code: roomCode,
      type,
      hostUid: uid,
      hostName: displayName,
      createdAt: new Date().toISOString(),
      isActive: true,
      participantCount: 0,
    };

    await db.collection('rooms').doc(roomId).set(roomData);
    return res.status(201).json({ message: 'Room created', room: roomData });
  } catch (err) {
    console.error('Create room error:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

const getRooms = async (req, res) => {
  try {
    const db = getDb();
    // Simple query — no composite index needed
    const snapshot = await db
      .collection('rooms')
      .where('type', '==', 'open')
      .where('isActive', '==', true)
      .limit(50)
      .get();

    const rooms = snapshot.docs.map((doc) => {
      const { passwordHash, ...safe } = doc.data();
      return safe;
    });

    // Sort in memory to avoid needing a Firestore composite index
    rooms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return res.status(200).json({ rooms });
  } catch (err) {
    console.error('Get rooms error:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

const getRoomByCode = async (req, res) => {
  try {
    const { code } = req.params;
    const db = getDb();

    const snapshot = await db
      .collection('rooms')
      .where('code', '==', code.toUpperCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const roomData = snapshot.docs[0].data();
    return res.status(200).json({
      room: {
        roomId: roomData.roomId,
        name: roomData.name,
        code: roomData.code,
        type: roomData.type,
        hostName: roomData.hostName,
        hostUid: roomData.hostUid,
        participantCount: roomData.participantCount,
      },
    });
  } catch (err) {
    console.error('Get room by code error:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

const getRoomById = async (req, res) => {
  try {
    const { roomId } = req.params;
    const db = getDb();
    const doc = await db.collection('rooms').doc(roomId).get();
    if (!doc.exists) return res.status(404).json({ error: 'Room not found' });
    return res.status(200).json({ room: doc.data() });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

module.exports = { createRoom, getRooms, getRoomByCode, getRoomById };
