const mongoose = require('mongoose');

const logSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['crying', 'silent', 'sleeping'],
      required: true,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    source: {
      type: String,
      enum: ['ai_model', 'manual', 'system'],
      default: 'ai_model',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Index for fast queries
logSchema.index({ createdAt: -1 });
logSchema.index({ status: 1 });

module.exports = mongoose.model('Log', logSchema);
