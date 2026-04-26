const { getDb } = require('../config/firebase');

const getAttendance = async (req, res) => {
  try {
    const { roomId } = req.params;
    const db = getDb();

    const snapshot = await db
      .collection('attendance')
      .where('roomId', '==', roomId)
      .orderBy('joinTime', 'desc')
      .get();

    const records = snapshot.docs.map((doc) => doc.data());

    return res.status(200).json({ attendance: records });
  } catch (err) {
    console.error('Get attendance error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const getMyAttendance = async (req, res) => {
  try {
    const { uid } = req.user;
    const db = getDb();

    const snapshot = await db
      .collection('attendance')
      .where('uid', '==', uid)
      .orderBy('joinTime', 'desc')
      .limit(50)
      .get();

    const records = snapshot.docs.map((doc) => doc.data());

    return res.status(200).json({ attendance: records });
  } catch (err) {
    console.error('Get my attendance error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { getAttendance, getMyAttendance };
