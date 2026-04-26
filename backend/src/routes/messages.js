const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { getDb } = require('../config/firebase');

router.use(authenticate);

router.get('/room/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const limit = parseInt(req.query.limit) || 50;
    const db = getDb();

    const snapshot = await db
      .collection('messages')
      .where('roomId', '==', roomId)
      .limit(limit)
      .get();

    const messages = snapshot.docs.map((doc) => doc.data());
    // Sort in memory — avoids needing Firestore composite index
    messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return res.status(200).json({ messages });
  } catch (err) {
    console.error('Get messages error:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

module.exports = router;
