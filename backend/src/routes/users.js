const express = require('express');
const router = express.Router();
const { authenticate, isLeadership } = require('../middleware/auth');
const { getDb } = require('../config/firebase');

router.use(authenticate);

const pickProfile = (d = {}) => ({
  role: d.role || 'Member',
  status: d.currentStatus || d.status || '',
  avatarUrl: d.avatarUrl || d.avatar || '',
  title: d.title || '',
  department: d.department || '',
  phone: d.phone || '',
  location: d.location || '',
  skills: d.skills || '',
  github: d.github || '',
  portfolio: d.portfolio || '',
  bio: d.bio || '',
});

router.get('/profile', async (req, res) => {
  try {
    const safeUser = {
      uid: req.user.uid,
      email: req.user.email,
      displayName: req.user.displayName,
      avatar: req.user.avatarUrl || req.user.avatar,
    };
    return res.status(200).json({ user: safeUser, profile: pickProfile(req.user) });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

router.put('/profile', async (req, res) => {
  try {
    const allowedRoles = new Set([
      'Founder',
      'Co-founder',
      'Admin',
      'Chief Technology Officer',
      'Head of Engineering',
      'Head of Media and Community',
      'Member',
      'Intern',
      'Advisor',
    ]);
    const body = req.body || {};
    const displayName = String(body.displayName || req.user.displayName || '').trim().slice(0, 80);
    const currentRole = req.user.role || 'Member';
    const requestedRole = allowedRoles.has(body.role) ? body.role : currentRole;
    const role = isLeadership(req.user) ? requestedRole : currentRole;
    const currentStatus = String(body.status || '').trim().slice(0, 120);
    const update = {
      displayName: displayName || req.user.displayName,
      role,
      currentStatus,
      avatarUrl: String(body.avatarUrl || '').trim().slice(0, 500),
      title: String(body.title || '').trim().slice(0, 100),
      department: String(body.department || '').trim().slice(0, 100),
      phone: String(body.phone || '').trim().slice(0, 50),
      location: String(body.location || '').trim().slice(0, 100),
      skills: String(body.skills || '').trim().slice(0, 300),
      github: String(body.github || '').trim().slice(0, 250),
      portfolio: String(body.portfolio || '').trim().slice(0, 250),
      bio: String(body.bio || '').trim().slice(0, 800),
      profileUpdatedAt: new Date().toISOString(),
    };

    const db = getDb();
    await db.collection('users').doc(req.user.uid).set(update, { merge: true });
    const user = {
      uid: req.user.uid,
      email: req.user.email,
      displayName: update.displayName,
      avatar: update.avatarUrl || req.user.avatar,
    };
    return res.status(200).json({ user, profile: pickProfile(update) });
  } catch (err) {
    console.error('Update profile error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

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
          avatar: d.avatarUrl || d.avatar,
          role: d.role || 'Member',
          title: d.title || '',
          department: d.department || '',
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

router.post('/push-token', async (req, res) => {
  try {
    const { token, platform = 'unknown' } = req.body;
    if (!token?.trim()) return res.status(400).json({ error: 'Push token required' });
    const db = getDb();
    const now = new Date().toISOString();
    await db.collection('users').doc(req.user.uid).set({
      pushTokens: {
        [token.trim()]: { platform, updatedAt: now },
      },
      reachable: true,
      lastSeen: now,
      explicitLogout: false,
    }, { merge: true });
    return res.status(200).json({ message: 'Push token saved' });
  } catch (err) {
    console.error('Save push token error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

router.delete('/push-token', async (req, res) => {
  try {
    const db = getDb();
    await db.collection('users').doc(req.user.uid).set({
      pushTokens: {},
      reachable: false,
      explicitLogout: true,
      loggedOutAt: new Date().toISOString(),
    }, { merge: true });
    return res.status(200).json({ message: 'Push tokens cleared' });
  } catch (err) {
    console.error('Clear push token error:', err.message);
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
