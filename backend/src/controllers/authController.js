const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/firebase');
const { signToken } = require('../utils/jwt');

const register = async (req, res) => {
  try {
    const { username, password, displayName } = req.body;

    if (!username || !password || !displayName) {
      return res.status(400).json({ error: 'Username, password, and display name are required' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    // Username: only alphanumeric + underscore
    if (!/^[a-z0-9_]+$/i.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores' });
    }

    const db = getDb();

    // Check duplicate username — simple equality query, no index needed
    const existingUser = await db
      .collection('users')
      .where('username', '==', username.toLowerCase())
      .limit(1)
      .get();

    if (!existingUser.empty) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const uid = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);

    const userData = {
      uid,
      username: username.toLowerCase(),
      displayName: displayName.trim(),
      passwordHash,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    await db.collection('users').doc(uid).set(userData);

    const token = signToken({ uid });

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: {
        uid,
        username: userData.username,
        displayName: userData.displayName,
        avatar: userData.avatar,
      },
    });
  } catch (err) {
    console.error('Register error:', err.message, err.code || '');
    // Surface Firebase-specific errors clearly
    if (err.code === 'app/invalid-credential') {
      return res.status(500).json({ error: 'Firebase credentials are invalid. Check server env vars.' });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const db = getDb();

    // Simple equality query — no composite index needed
    const snapshot = await db
      .collection('users')
      .where('username', '==', username.toLowerCase())
      .limit(1)
      .get();

    if (snapshot.empty) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userDoc = snapshot.docs[0];
    const userData = userDoc.data();

    const isPasswordValid = await bcrypt.compare(password, userData.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last seen (non-blocking — don't await)
    db.collection('users').doc(userData.uid).update({
      lastSeen: new Date().toISOString(),
    }).catch(() => {});

    const token = signToken({ uid: userData.uid });

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        uid: userData.uid,
        username: userData.username,
        displayName: userData.displayName,
        avatar: userData.avatar,
      },
    });
  } catch (err) {
    console.error('Login error:', err.message, err.code || '');
    if (err.code === 'app/invalid-credential') {
      return res.status(500).json({ error: 'Firebase credentials are invalid. Check server env vars.' });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

const getMe = async (req, res) => {
  try {
    const { passwordHash, ...safeUser } = req.user;
    return res.status(200).json({ user: safeUser });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = { register, login, getMe };
