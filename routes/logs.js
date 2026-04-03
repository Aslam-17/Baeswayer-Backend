const express = require('express');
const router = express.Router();
const Log = require('../models/Log');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/logs — paginated logs (authenticated)
router.get('/', protect, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const filter = status ? { status } : {};

    const [logs, total] = await Promise.all([
      Log.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Log.countDocuments(filter),
    ]);

    res.json({
      success: true,
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch logs' });
  }
});

// GET /api/logs/stats — summary stats (admin)
router.get('/stats', protect, adminOnly, async (req, res) => {
  try {
    const [total, cryingCount, silentCount, sleepingCount, recent] = await Promise.all([
      Log.countDocuments(),
      Log.countDocuments({ status: 'crying' }),
      Log.countDocuments({ status: 'silent' }),
      Log.countDocuments({ status: 'sleeping' }),
      Log.find().sort({ createdAt: -1 }).limit(10),
    ]);

    res.json({
      success: true,
      stats: {
        total,
        crying: cryingCount,
        silent: silentCount,
        sleeping: sleepingCount,
      },
      recent,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// DELETE /api/logs — clear all logs (admin only)
router.delete('/', protect, adminOnly, async (req, res) => {
  try {
    await Log.deleteMany({});
    res.json({ success: true, message: 'All logs cleared' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to clear logs' });
  }
});

module.exports = router;
