const mongoose = require('mongoose');

const QRCodeSchema = new mongoose.Schema({
  lecturer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  unitCode: {
    type: String,
    required: true
  },
  unitName: {
    type: String,
    required: true
  },
  qrCodeString: {
    type: String,
    required: true,
    unique: true
  },
  expiresAt: {
    type: Date,
    required: true
  },
  location: {
    type: String,
    default: 'Main Campus'
  },
  session: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

QRCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('QRCode', QRCodeSchema);
