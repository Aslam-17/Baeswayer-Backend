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

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Make io accessible in routes
app.set('io', io);

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/users', userRoutes);
app.use('/api/logs', logRoutes);

// Shortcut alias for AI model: POST /api/update → /api/status/update
app.post('/api/update', (req, res) => {
  req.url = '/update';
  statusRoutes(req, res);
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

// ─── WebRTC Signaling via Socket.IO ──────────────────────────────────────────

// Track rooms: roomId -> Set of socket IDs
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // ── WebRTC Room Management ──
  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId).add(socket.id);

    const peers = [...rooms.get(roomId)].filter(id => id !== socket.id);
    socket.emit('room-peers', peers);
    socket.to(roomId).emit('peer-joined', socket.id);
    console.log(`[WebRTC] ${socket.id} joined room ${roomId}`);
  });

  socket.on('leave-room', (roomId) => {
    leaveRoom(socket, roomId);
  });

  // ── WebRTC Signaling (offer/answer/ice) ──
  socket.on('webrtc-offer', ({ to, offer }) => {
    socket.to(to).emit('webrtc-offer', { from: socket.id, offer });
  });

  socket.on('webrtc-answer', ({ to, answer }) => {
    socket.to(to).emit('webrtc-answer', { from: socket.id, answer });
  });

  socket.on('webrtc-ice-candidate', ({ to, candidate }) => {
    socket.to(to).emit('webrtc-ice-candidate', { from: socket.id, candidate });
  });

  // ── Disconnect cleanup ──
  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
    rooms.forEach((members, roomId) => {
      if (members.has(socket.id)) {
        leaveRoom(socket, roomId);
      }
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

// ─── MongoDB Connection ───────────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(() => {
    console.log('[DB] MongoDB connected');
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => console.log(`[Server] Running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('[DB] Connection error:', err.message);
    process.exit(1);
  });

module.exports = { app, io };
