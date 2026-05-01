const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const { getDb } = require('../config/firebase');

// GET /api/analytics/work-summary?startDate=&endDate=
router.get('/work-summary', verifyToken, async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate, uid } = req.query;

    let query = db.collection('attendance').where('status', '==', 'completed');

    if (uid) query = query.where('uid', '==', uid);
    if (startDate) query = query.where('joinTime', '>=', new Date(startDate).toISOString());
    if (endDate) query = query.where('joinTime', '<=', new Date(endDate + 'T23:59:59').toISOString());

    const snap = await query.get();
    const records = snap.docs.map(d => d.data());

    // Group by user
    const byUser = {};
    for (const r of records) {
      if (!byUser[r.uid]) byUser[r.uid] = { uid: r.uid, displayName: r.displayName, sessions: [], totalSeconds: 0, rooms: new Set() };
      byUser[r.uid].sessions.push(r);
      byUser[r.uid].totalSeconds += r.durationSeconds || 0;
      byUser[r.uid].rooms.add(r.roomId);
    }

    const summary = Object.values(byUser).map(u => ({
      uid: u.uid,
      displayName: u.displayName,
      totalSeconds: u.totalSeconds,
      sessionCount: u.sessions.length,
      roomsVisited: u.rooms.size,
      sessions: u.sessions.sort((a, b) => new Date(b.joinTime) - new Date(a.joinTime)),
    })).sort((a, b) => b.totalSeconds - a.totalSeconds);

    res.json({ summary });
  } catch (err) {
    console.error('analytics/work-summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/status-timeline?startDate=&endDate=&uid=
router.get('/status-timeline', verifyToken, async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate, uid } = req.query;

    let query = db.collection('statusHistory').orderBy('timestamp', 'desc');
    if (uid) query = query.where('uid', '==', uid);
    if (startDate) query = query.where('timestamp', '>=', new Date(startDate).toISOString());
    if (endDate) query = query.where('timestamp', '<=', new Date(endDate + 'T23:59:59').toISOString());

    query = query.limit(500);
    const snap = await query.get();
    const entries = snap.docs.map(d => d.data());
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
