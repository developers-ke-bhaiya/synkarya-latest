const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getDb } = require('../config/firebase');

// GET /api/analytics/work-summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&uid=
router.get('/work-summary', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate, uid } = req.query;

    // FIX: Simple single-field query — no composite index needed
    // Filter by status only, then filter date range in JS
    let query = db.collection('attendance')
      .where('status', '==', 'completed')
      .orderBy('joinTime', 'desc')
      .limit(1000);

    if (uid) query = query.where('uid', '==', uid);

    const snap = await query.get();
    let records = snap.docs.map(d => d.data());

    // Filter date range in application code — avoids needing composite index
    if (startDate) {
      const start = new Date(startDate + 'T00:00:00.000Z').toISOString();
      records = records.filter(r => r.joinTime >= start);
    }
    if (endDate) {
      const end = new Date(endDate + 'T23:59:59.999Z').toISOString();
      records = records.filter(r => r.joinTime <= end);
    }

    // Group by user
    const byUser = {};
    for (const r of records) {
      if (!byUser[r.uid]) {
        byUser[r.uid] = {
          uid: r.uid,
          displayName: r.displayName,
          sessions: [],
          totalSeconds: 0,
          rooms: new Set(),
        };
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
        sessions: u.sessions.sort((a, b) => new Date(b.joinTime) - new Date(a.joinTime)),
      }))
      .sort((a, b) => b.totalSeconds - a.totalSeconds);

    res.json({ summary });
  } catch (err) {
    console.error('analytics/work-summary error:', err);
    // Send specific error so frontend can show it
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/status-timeline?startDate=&endDate=&uid=
router.get('/status-timeline', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate, uid } = req.query;

    // FIX: Simple query — filter in JS
    let query = db.collection('statusHistory')
      .orderBy('timestamp', 'desc')
      .limit(500);

    if (uid) query = query.where('uid', '==', uid);

    const snap = await query.get();
    let entries = snap.docs.map(d => d.data());

    if (startDate) {
      const start = new Date(startDate + 'T00:00:00.000Z').toISOString();
      entries = entries.filter(e => e.timestamp >= start);
    }
    if (endDate) {
      const end = new Date(endDate + 'T23:59:59.999Z').toISOString();
      entries = entries.filter(e => e.timestamp <= end);
    }

    res.json({ entries });
  } catch (err) {
    console.error('analytics/status-timeline error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
