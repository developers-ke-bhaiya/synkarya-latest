const { getDb } = require('../config/firebase');

const getAttendance = async (req, res) => {
  try {
    const { roomId } = req.params;
    const db = getDb();

    const snapshot = await db
      .collection('attendance')
      .where('roomId', '==', roomId)
      .limit(100)
      .get();

    const records = snapshot.docs.map((doc) => doc.data());
    records.sort((a, b) => new Date(b.joinTime) - new Date(a.joinTime));

    return res.status(200).json({ attendance: records });
  } catch (err) {
    console.error('Get attendance error:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

const getMyAttendance = async (req, res) => {
  try {
    const { uid } = req.user;
    const db = getDb();

    const snapshot = await db
      .collection('attendance')
      .where('uid', '==', uid)
      .limit(50)
      .get();

    const records = snapshot.docs.map((doc) => doc.data());
    records.sort((a, b) => new Date(b.joinTime) - new Date(a.joinTime));

    return res.status(200).json({ attendance: records });
  } catch (err) {
    console.error('Get my attendance error:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

module.exports = { getAttendance, getMyAttendance };
