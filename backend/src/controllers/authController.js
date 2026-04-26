const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../config/firebase');
const { signToken } = require('../utils/jwt');

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const register = async (req, res) => {
  try {
    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'Email, password, and display name are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    if (displayName.trim().length < 2) {
      return res.status(400).json({ error: 'Display name must be at least 2 characters' });
    }

    const db = getDb();
    const normalizedEmail = email.toLowerCase().trim();

    const existing = await db.collection('users').where('email', '==', normalizedEmail).limit(1).get();
    if (!existing.empty) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const uid = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);
    const userData = {
      uid,
      email: normalizedEmail,
      displayName: displayName.trim(),
      passwordHash,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName.trim())}`,
      createdAt: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    };

    await db.collection('users').doc(uid).set(userData);
    const token = signToken({ uid });

    return res.status(201).json({
      message: 'Account created successfully',
      token,
      user: { uid, email: userData.email, displayName: userData.displayName, avatar: userData.avatar },
    });
  } catch (err) {
    console.error('Register error:', err.message);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const db = getDb();
    const normalizedEmail = email.toLowerCase().trim();

    const snapshot = await db.collection('users').where('email', '==', normalizedEmail).limit(1).get();
    if (snapshot.empty) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const userData = snapshot.docs[0].data();
    const isPasswordValid = await bcrypt.compare(password, userData.passwordHash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    db.collection('users').doc(userData.uid).update({ lastSeen: new Date().toISOString() }).catch(() => {});
    const token = signToken({ uid: userData.uid });

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: { uid: userData.uid, email: userData.email, displayName: userData.displayName, avatar: userData.avatar },
    });
  } catch (err) {
    console.error('Login error:', err.message);
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
