const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  qrCode: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QRCode',
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
  lecturer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  scannedAt: {
    type: Date,
    default: Date.now
  },
  location: {
    type: String
  },
  status: {
    type: String,
    enum: ['present', 'late', 'absent'],
    default: 'present'
  },
  isVerified: {
    type: Boolean,
    default: true
  }
});

AttendanceSchema.index({ student: 1, qrCode: 1 }, { unique: true });
AttendanceSchema.index({ scannedAt: -1 });
AttendanceSchema.index({ unitCode: 1, student: 1 });

module.exports = mongoose.model('Attendance', AttendanceSchema);
