# ⚡ Synkarya — Real-Time Communication Platform

A production-ready Zoom + Discord hybrid: HD video calling, group calls, real-time chat, screen sharing, and attendance tracking.

---

## 🏗 Architecture Overview

```
synkarya/
├── backend/               # Node.js + Express + Socket.io
│   └── src/
│       ├── config/        # Firebase Admin init
│       ├── controllers/   # auth, rooms, attendance
│       ├── middleware/     # JWT auth (REST + Socket)
│       ├── routes/        # Express route files
│       ├── services/      # socketService, attendanceService, roomStateService
│       ├── utils/         # JWT sign/verify
│       └── server.js      # Entry point
│
└── frontend/              # React + Vite + Tailwind
    └── src/
        ├── components/
        │   ├── auth/      # Login, Register pages
        │   ├── call/      # VideoTile, VideoGrid, ControlBar, ParticipantsPanel
        │   ├── chat/      # ChatPanel
        │   ├── attendance/# AttendancePanel
        │   ├── layout/    # Sidebar, TopBar, EmptyState
        │   └── ui/        # Avatar, Spinner, Toast
        ├── hooks/         # useWebRTC, useChat, useAttendance
        ├── pages/         # CallPage, MyAttendancePage
        ├── services/      # api.js (axios), socket.js, webrtc.js
        ├── store/         # authStore, callStore, chatStore (Zustand)
        └── utils/         # formatters
```

### Key Architecture Decisions

**WebRTC — Full Mesh**
Every user establishes a direct `RTCPeerConnection` to every other user. For up to 12 users (configurable). Signaling flows through Socket.io. ICE candidates are relayed. Glare handling (offer collision) uses the polite-peer rollback pattern per the WebRTC spec.

**Signaling Flow**
1. User A joins → emits `join_room`
2. Server sends `users_in_room` list to A
3. A creates peers + sends `offer` to each existing user
4. Each existing user receives `offer` → answers → ICE flows
5. Renegotiation used for screen share track replacement

**State**
- Zustand stores (callStore, chatStore, authStore) — no Redux overhead
- In-memory room state on backend (low-latency signaling)
- Firestore for persistence: users, attendance, messages, rooms

**Attendance**
- On `join_room`: writes `attendance/{uid}_{roomId}_{sessionId}` doc with `joinTime`
- On `leave_room` / `disconnect`: updates `leaveTime`, `durationSeconds`, `status: completed`

---

## 🚀 Local Setup

### Prerequisites
- Node.js 18+
- Firebase project with Firestore enabled
- Firebase Admin SDK service account JSON

### 1. Firebase Setup
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a project → Enable **Firestore Database**
3. Go to Project Settings → Service Accounts → **Generate new private key**
4. Download the JSON file

### 2. Backend Setup

```bash
cd backend
cp .env.example .env
# Fill in your Firebase credentials from the service account JSON
npm install
npm run dev
```

Your `.env` should look like:
```
PORT=5000
JWT_SECRET=your_min_32_char_secret_here
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_ID=abc123
FIREBASE_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxx@your-project.iam.gserviceaccount.com
FIREBASE_CLIENT_ID=123456789
FRONTEND_URL=http://localhost:5173
```

### 3. Frontend Setup

```bash
cd frontend
cp .env.example .env
# .env already points to localhost:5000 by default
npm install
npm run dev
```

Open **http://localhost:5173**

---

## 🌐 Deployment

### Backend → Render

1. Push `backend/` folder to a GitHub repo
2. Create a new **Web Service** on [render.com](https://render.com)
3. Set build command: `npm install`
4. Set start command: `node src/server.js`
5. Add all environment variables from `.env.example`
6. Note your Render URL: `https://synkarya-backend-xxxx.onrender.com`

### Frontend → Vercel

1. Push `frontend/` folder to GitHub
2. Import on [vercel.com](https://vercel.com)
3. Add environment variables:
   - `VITE_API_URL` = your Render backend URL
   - `VITE_SOCKET_URL` = your Render backend URL
4. Deploy

> **Important**: Update `FRONTEND_URL` in your Render backend env vars to your Vercel URL so CORS works.

---

## 🔌 Socket.io Events Reference

| Event | Direction | Description |
|---|---|---|
| `join_room` | Client → Server | Join a room |
| `users_in_room` | Server → Client | List of existing users |
| `user_joined` | Server → Room | New user joined |
| `user_left` | Server → Room | User disconnected |
| `offer` | Client → Server → Peer | WebRTC offer |
| `answer` | Client → Server → Peer | WebRTC answer |
| `ice_candidate` | Client → Server → Peer | ICE candidate |
| `renegotiate` | Client → Server → Peer | Screen share renegotiation |
| `media_state` | Client → Server → Room | Mute/camera/screen state |
| `chat_message` | Bidirectional | Room chat |
| `typing` | Client → Server → Room | Typing indicator |
| `leave_room` | Client → Server | Explicit leave |

---

## 🔒 Security Notes

- Passwords hashed with bcrypt (12 rounds)
- JWT signed with HS256, expires in 7 days
- All Socket.io connections authenticated via JWT middleware
- All REST endpoints protected by `authenticate` middleware
- CORS restricted to `FRONTEND_URL`

---

## 📊 Firestore Collections

| Collection | Document ID | Description |
|---|---|---|
| `users` | `{uid}` | User profiles (no raw passwords) |
| `rooms` | `{roomId}` | Room metadata |
| `attendance` | `{uid}_{roomId}_{sessionId}` | Per-session attendance records |
| `messages` | `{messageId}` | Chat messages per room |

---

## 🛠 Firestore Indexes Required

Run these in Firebase Console → Firestore → Indexes:

```
Collection: attendance
Fields: roomId ASC, joinTime DESC

Collection: attendance  
Fields: uid ASC, joinTime DESC

Collection: messages
Fields: roomId ASC, timestamp DESC

Collection: rooms
Fields: type ASC, isActive ASC, createdAt DESC
```

Firebase will prompt you to create these automatically when the queries first run.
