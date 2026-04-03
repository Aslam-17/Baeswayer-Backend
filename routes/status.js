const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const { protect } = require('../middleware/auth');

// GET /api/status — latest baby status (authenticated users)
router.get('/', protect, async (req, res) => {
  try {
    const latest = await Log.findOne().sort({ createdAt: -1 });
    res.json({ success: true, status: latest || null });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch status' });
  }
});

// POST /api/update — from AI model (no auth required, use a shared secret or whitelist)
// The Python model sends: { "status": "crying", "confidence": 85 }
router.post('/update', async (req, res) => {
  try {
    const { status, confidence, metadata } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, message: 'status field is required' });
    }

    const validStatuses = ['crying', 'silent', 'sleeping'];
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const log = await Log.create({
      status: status.toLowerCase(),
      confidence: confidence ?? 0,
      source: 'ai_model',
      metadata: metadata || {},
    });

    // Emit real-time update to all connected frontend clients
    const io = req.app.get('io');
    io.emit('status-update', {
      status: log.status,
      confidence: log.confidence,
      timestamp: log.createdAt,
      logId: log._id,
    });

    console.log(`[AI] Status update: ${log.status} (${log.confidence}%)`);

    res.json({ success: true, message: 'Status updated', log });
  } catch (err) {
    console.error('[Status] Update error:', err);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// Alias: POST /api/status/update (same handler)
router.post('/', protect, async (req, res) => {
  // Manual status update from authenticated users
  try {
    const { status, confidence } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'status required' });

    const log = await Log.create({
      status: status.toLowerCase(),
      confidence: confidence ?? 0,
      source: 'manual',
    });

    const io = req.app.get('io');
    io.emit('status-update', {
      status: log.status,
      confidence: log.confidence,
      timestamp: log.createdAt,
      logId: log._id,
    });

    res.json({ success: true, log });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

module.exports = router;
