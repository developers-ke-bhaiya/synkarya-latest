const admin = require('firebase-admin');

let db = null;

/**
 * Safely parse the Firebase private key from env.
 *
 * Render / Vercel / Railway all handle multiline env vars differently.
 * This function handles all known formats:
 *   1. Literal \n in the string  → replace with real newlines
 *   2. Already has real newlines  → use as-is
 *   3. Missing BEGIN/END header   → log a clear warning
 */
const parsePrivateKey = (raw) => {
  if (!raw) return null;

  // If the env var was set with literal \n (most common on Render)
  let key = raw.replace(/\\n/g, '\n');

  // Some CI systems double-escape: \\n → \n first pass above gives \n still escaped
  if (!key.includes('-----BEGIN')) {
    key = key.replace(/\\n/g, '\n');
  }

  // Strip any surrounding quotes that got accidentally included
  key = key.replace(/^["']|["']$/g, '');

  if (!key.includes('-----BEGIN RSA PRIVATE KEY-----') && !key.includes('-----BEGIN PRIVATE KEY-----')) {
    console.error(
      '❌ FIREBASE_PRIVATE_KEY does not look valid. ' +
      'Make sure to paste the full key including BEGIN/END lines, ' +
      'with \\n for newlines when setting on Render.'
    );
  }

  return key;
};

const initFirebase = () => {
  if (admin.apps.length > 0) {
    db = admin.firestore();
    return db;
  }

  // Validate required env vars before attempting init
  const required = [
    'FIREBASE_PROJECT_ID',
    'FIREBASE_PRIVATE_KEY',
    'FIREBASE_CLIENT_EMAIL',
  ];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`❌ Missing Firebase env vars: ${missing.join(', ')}`);
    console.error('   Backend will start but database calls will fail.');
    console.error('   Set these in your Render dashboard → Environment.');
    return null;
  }

  try {
    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || '',
      private_key: parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID || '',
      auth_uri: process.env.FIREBASE_AUTH_URI || 'https://accounts.google.com/o/oauth2/auth',
      token_uri: process.env.FIREBASE_TOKEN_URI || 'https://oauth2.googleapis.com/token',
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    db = admin.firestore();
    console.log('✅ Firebase Admin initialized successfully');
    console.log(`   Project: ${process.env.FIREBASE_PROJECT_ID}`);
    return db;
  } catch (err) {
    console.error('❌ Firebase Admin initialization failed:', err.message);
    console.error('   Check your FIREBASE_PRIVATE_KEY format on Render.');
    throw err; // Re-throw so server startup fails loudly, not silently
  }
};

const getDb = () => {
  if (!db) {
    return initFirebase();
  }
  return db;
};

module.exports = { initFirebase, getDb, admin };
