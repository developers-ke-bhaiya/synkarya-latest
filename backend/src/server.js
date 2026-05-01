require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { initFirebase, getDb } = require('./config/firebase');
const { setupSocketHandlers } = require('./services/socketService');

const authRoutes = require('./routes/auth');
const roomRoutes = require('./routes/rooms');
const analyticsRoutes = require('./routes/analytics');
const attendanceRoutes = require('./routes/attendance');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');

try {
  initFirebase();
} catch (err) {
  console.error('Firebase init failed:', err.message);
}

const app = express();

const isAllowedOrigin = (origin) => {
  if (!origin) return true;
  if (origin.includes('localhost')) return true;
  if (origin.includes('127.0.0.1')) return true;
  if (origin.endsWith('.vercel.app')) return true;
  if (origin.endsWith('.onrender.com')) return true;
  if (process.env.FRONTEND_URL && origin.startsWith(process.env.FRONTEND_URL)) return true;
  return false;
};

app.use(cors({
  origin: (origin, cb) => isAllowedOrigin(origin) ? cb(null, true) : cb(new Error(`CORS blocked: ${origin}`)),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.options('*', cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.json({ name: 'Synkarya Backend', status: 'running', version: '1.0.0' }));

app.get('/health', (req, res) => {
  let firebaseStatus = 'ok';
  try { getDb(); } catch (e) { firebaseStatus = `error: ${e.message}`; }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    firebase: firebaseStatus,
    env: {
      FIREBASE_PROJECT_ID:   process.env.FIREBASE_PROJECT_ID   ? '✅ set' : '❌ missing',
      FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? '✅ set' : '❌ missing',
      FIREBASE_PRIVATE_KEY:  process.env.FIREBASE_PRIVATE_KEY  ? `✅ set (${process.env.FIREBASE_PRIVATE_KEY.length} chars)` : '❌ missing',
      JWT_SECRET:            process.env.JWT_SECRET            ? '✅ set' : '❌ missing',
      FRONTEND_URL:          process.env.FRONTEND_URL          || '⚠️ not set',
    },
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);

app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({ error: isDev ? err.message : 'Internal server error' });
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, cb) => isAllowedOrigin(origin) ? cb(null, true) : cb(new Error(`Socket CORS blocked: ${origin}`)),
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  allowEIO3: true,
});

setupSocketHandlers(io);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`🚀 Synkarya backend running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

process.on('SIGTERM', () => {
  httpServer.close(() => { console.log('Server closed'); process.exit(0); });
});
