require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { initFirebase, getDb } = require('./config/firebase');
const { setupSocketHandlers } = require('./services/socketService');

const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const attendanceRoutes = require('./routes/attendance');
const messageRoutes = require('./routes/messages');

// ─── Initialize Firebase ──────────────────────────────────────────────────────
try {
  initFirebase();
} catch (err) {
  console.error('Firebase init failed at startup:', err.message);
  // Continue — health endpoint will surface the error clearly
}

// ─── Express App ──────────────────────────────────────────────────────────────
const app = express();

/**
 * CORS: Allow all of:
 *  - Localhost (any port)
 *  - *.vercel.app  (all Vercel deployments including previews)
 *  - *.onrender.com (sibling Render services)
 *  - Exact FRONTEND_URL env var (your production Vercel URL)
 */
const isAllowedOrigin = (origin) => {
  if (!origin) return true;                                      // Postman, curl
  if (origin.includes('localhost')) return true;
  if (origin.includes('127.0.0.1')) return true;
  if (origin.endsWith('.vercel.app')) return true;
  if (origin.endsWith('.onrender.com')) return true;
  if (process.env.FRONTEND_URL && origin.startsWith(process.env.FRONTEND_URL)) return true;
  return false;
};

app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked origin: ${origin}`);
        callback(new Error(`CORS blocked: ${origin}`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Handle preflight OPTIONS for all routes
app.options('*', cors());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ───────────────────────────────────────────────────────────────────

// Root — so visiting the backend URL directly gives useful info, not 404
app.get('/', (req, res) => {
  res.json({
    name: 'Synkarya Backend',
    status: 'running',
    version: '1.0.0',
    health: '/health',
  });
});

// Health check — open this URL on Render to debug env var problems
app.get('/health', (req, res) => {
  let firebaseStatus = 'ok';
  try {
    getDb();
  } catch (e) {
    firebaseStatus = `error: ${e.message}`;
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    firebase: firebaseStatus,
    env: {
      FIREBASE_PROJECT_ID:  process.env.FIREBASE_PROJECT_ID   ? '✅ set' : '❌ missing',
      FIREBASE_CLIENT_EMAIL:process.env.FIREBASE_CLIENT_EMAIL ? '✅ set' : '❌ missing',
      FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY
        ? `✅ set (${process.env.FIREBASE_PRIVATE_KEY.length} chars)`
        : '❌ missing',
      JWT_SECRET:           process.env.JWT_SECRET            ? '✅ set' : '❌ missing',
      FRONTEND_URL:         process.env.FRONTEND_URL          || '⚠️  not set',
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/messages', messageRoutes);

// 404
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// Global error handler — show full error in dev, generic message in prod
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'Internal server error',
    ...(isDev && { stack: err.stack }),
  });
});

// ─── HTTP + Socket.io ─────────────────────────────────────────────────────────
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) callback(null, true);
      else callback(new Error(`Socket CORS blocked: ${origin}`));
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true, // Required for some proxies (Render uses nginx)
});

setupSocketHandlers(io);

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Synkarya backend running on port ${PORT}`);
  console.log(`📡 Socket.io ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔒 FRONTEND_URL: ${process.env.FRONTEND_URL || 'not set (permissive mode)'}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  httpServer.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
