const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const authRoutes = require('./routes/auth');
const statusRoutes = require('./routes/status');
const userRoutes = require('./routes/users');
const logRoutes = require('./routes/logs');

const app = express();
const server = http.createServer(app);

// ─── CORS: allow Vercel frontend + localhost ──────────────────────────────────
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman, AI model)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    console.warn('[CORS] Blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// ✅ Handle preflight OPTIONS requests for ALL routes
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());

// ─── Socket.IO ────────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/users', userRoutes);
app.use('/api/logs', logRoutes);

// Shortcut alias for AI model: POST /api/update
app.post('/api/update', (req, res) => {
  req.url = '/update';
  statusRoutes(req, res);
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

// ─── WebRTC Signaling via Socket.IO ──────────────────────────────────────────
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId).add(socket.id);
    const peers = [...rooms.get(roomId)].filter(id => id !== socket.id);
    socket.emit('room-peers', peers);
    socket.to(roomId).emit('peer-joined', socket.id);
    console.log(`[WebRTC] ${socket.id} joined room ${roomId}`);
  });

  socket.on('leave-room', (roomId) => leaveRoom(socket, roomId));

  socket.on('webrtc-offer', ({ to, offer }) => {
    socket.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });
  socket.on('webrtc-answer', ({ to, answer }) => {
    socket.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });
  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    socket.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    rooms.forEach((members, roomId) => {
      if (members.has(socket.id)) leaveRoom(socket, roomId);
    });
  });
});

function leaveRoom(socket, roomId) {
  socket.leave(roomId);
  if (rooms.has(roomId)) {
    rooms.get(roomId).delete(socket.id);
    if (rooms.get(roomId).size === 0) rooms.delete(roomId);
    else socket.to(roomId).emit('peer-left', socket.id);
  }
}

// ─── MongoDB + Start Server ───────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('[DB] MongoDB connected');
    const PORT = process.env.PORT || 8080;
    server.listen(PORT, () => console.log(`[Server] Running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('[DB] Connection error:', err.message);
    process.exit(1);
  });

module.exports = { app, io };
