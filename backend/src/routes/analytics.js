const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getDb } = require('../config/firebase');

// GET /api/analytics/work-summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/work-summary', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate, uid } = req.query;

    // FIX: Only single-field filter — no orderBy — no composite index needed
    let query = db.collection('attendance').where('status', '==', 'completed');
    if (uid) query = query.where('uid', '==', uid);

    const snap = await query.get();
    let records = snap.docs.map(d => d.data());

    // Date filter in JS — avoids any Firestore index requirement
    if (startDate) {
      const start = startDate + 'T00:00:00.000Z';
      records = records.filter(r => r.joinTime >= start);
    }
    if (endDate) {
      const end = endDate + 'T23:59:59.999Z';
      records = records.filter(r => r.joinTime <= end);
    }

    // Sort by joinTime desc in JS
    records.sort((a, b) => new Date(b.joinTime) - new Date(a.joinTime));

    // Group by user
    const byUser = {};
    for (const r of records) {
      if (!byUser[r.uid]) {
        byUser[r.uid] = { uid: r.uid, displayName: r.displayName, sessions: [], totalSeconds: 0, rooms: new Set() };
      }
      byUser[r.uid].sessions.push(r);
      byUser[r.uid].totalSeconds += r.durationSeconds || 0;
      byUser[r.uid].rooms.add(r.roomId);
    }

    const summary = Object.values(byUser)
      .map(u => ({
        uid: u.uid,
        displayName: u.displayName,
        totalSeconds: u.totalSeconds,
        sessionCount: u.sessions.length,
        roomsVisited: u.rooms.size,
        sessions: u.sessions,
      }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds);

    res.json({ summary });
  } catch (err) {
    console.error('analytics/work-summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/status-timeline?startDate=&endDate=&uid=
router.get('/status-timeline', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate, uid } = req.query;

    // Simple single-field query only
    let query = db.collection('statusHistory');
    if (uid) query = query.where('uid', '==', uid);

    const snap = await query.limit(1000).get();
    let entries = snap.docs.map(d => d.data());

    if (startDate) entries = entries.filter(e => e.timestamp >= startDate + 'T00:00:00.000Z');
    if (endDate) entries = entries.filter(e => e.timestamp <= endDate + 'T23:59:59.999Z');

    entries.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json({ entries });
  } catch (err) {
    console.error('analytics/status-timeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
