const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getDb } = require('../config/firebase');

router.use(authenticate);

// Get all users who logged in today
router.get('/online', async (req, res) => {
  try {
    const db = getDb();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // Simple query — no composite index needed
    const snapshot = await db
      .collection('users')
      .where('lastSeen', '>=', todayStart.toISOString())
      .limit(100)
      .get();

    const users = snapshot.docs
      .map((doc) => {
        const d = doc.data();
        return {
          uid: d.uid,
          displayName: d.displayName,
          email: d.email,
          avatar: d.avatar,
          lastSeen: d.lastSeen,
          currentStatus: d.currentStatus || null,
          statusUpdatedAt: d.statusUpdatedAt || null,
        };
      })
      .filter((u) => u.uid !== req.user.uid);

    return res.status(200).json({ users });
  } catch (err) {
    console.error('Get online users error:', err.message);
    // Fallback: return empty list instead of 500
    return res.status(200).json({ users: [], error: err.message });
  }
});

// Update status — save to Firestore
router.post('/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status?.trim()) return res.status(400).json({ error: 'Status required' });

    const db = getDb();
    const now = new Date().toISOString();

    await db.collection('users').doc(req.user.uid).update({
      currentStatus: status.trim(),
      statusUpdatedAt: now,
    });

    await db.collection('statusHistory').add({
      uid: req.user.uid,
      displayName: req.user.displayName,
      status: status.trim(),
      timestamp: now,
    });

    return res.status(200).json({ message: 'Status updated', status: status.trim() });
  } catch (err) {
    console.error('Update status error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Get status history
router.get('/status-history/:uid', async (req, res) => {
  try {
    const db = getDb();
    const snapshot = await db
      .collection('statusHistory')
      .where('uid', '==', req.params.uid)
      .limit(50)
      .get();

    const history = snapshot.docs.map((d) => d.data());
    history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    return res.status(200).json({ history });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
