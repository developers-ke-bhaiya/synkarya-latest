const express = require('express');
const router = express.Router();
const { authenticate, requireLeadership } = require('../middleware/auth');
const { getDb } = require('../config/firebase');

router.use(authenticate);
router.use(requireLeadership);

// GET /api/analytics/work-summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get('/work-summary', async (req, res) => {
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
router.get('/status-timeline', async (req, res) => {
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

router.get('/export.csv', async (req, res) => {
  try {
    const db = getDb();
    const { startDate, endDate, uid } = req.query;
    let attendanceSnap = await db.collection('attendance').limit(1500).get();
    let attendance = attendanceSnap.docs.map((doc) => doc.data());
    if (uid) attendance = attendance.filter((r) => r.uid === uid);
    if (startDate) attendance = attendance.filter((r) => r.joinTime >= `${startDate}T00:00:00.000Z`);
    if (endDate) attendance = attendance.filter((r) => r.joinTime <= `${endDate}T23:59:59.999Z`);
    attendance.sort((a, b) => new Date(b.joinTime) - new Date(a.joinTime));

    const rows = [
      ['Name', 'UID', 'Room', 'Join Time', 'Leave Time', 'Duration Seconds', 'Status'],
      ...attendance.map((r) => [
        r.displayName || '',
        r.uid || '',
        r.roomName || r.roomId || '',
        r.joinTime || '',
        r.leaveTime || '',
        r.durationSeconds || 0,
        r.status || '',
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="synkarya-report-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error('analytics/export.csv error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
