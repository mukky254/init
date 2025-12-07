const express = require('express');
const router = express.Router();
const QRCode = require('../models/QRCode');
const Attendance = require('../models/Attendance');
const { protect, authorize } = require('../middleware/auth');
const qrcode = require('qrcode');
const crypto = require('crypto');

// Generate unique QR code string
const generateQRString = () => {
  return crypto.randomBytes(20).toString('hex');
};

// @route   POST /api/lecturer/generate-qr
router.post('/generate-qr', protect, authorize('lecturer'), async (req, res) => {
  try {
    const { unitCode, unitName, duration, location, session } = req.body;
    const lecturerId = req.user._id;
    
    // Generate unique QR string
    const qrString = generateQRString();
    
    // Calculate expiration
    const expiresAt = new Date(Date.now() + duration * 60000); // duration in minutes
    
    // Create QR code data
    const qrData = {
      unitCode,
      unitName,
      lecturerId,
      qrString,
      expiresAt: expiresAt.toISOString(),
      location,
      session
    };
    
    // Generate QR code image
    const qrImage = await qrcode.toDataURL(JSON.stringify(qrData));
    
    // Save to database
    const qrCode = await QRCode.create({
      lecturer: lecturerId,
      unitCode,
      unitName,
      qrCodeString: qrString,
      expiresAt,
      location,
      session,
      isActive: true
    });
    
    res.json({
      success: true,
      qrCode: {
        id: qrCode._id,
        qrImage,
        qrString,
        expiresAt,
        unitCode,
        unitName,
        session,
        location
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/lecturer/dashboard
router.get('/dashboard', protect, authorize('lecturer'), async (req, res) => {
  try {
    const lecturerId = req.user._id;
    
    // Get generated QR codes
    const qrCodes = await QRCode.find({ lecturer: lecturerId })
      .sort({ createdAt: -1 })
      .limit(10);
    
    // Get attendance summary
    const attendanceSummary = await Attendance.aggregate([
      {
        $lookup: {
          from: 'qrcodes',
          localField: 'qrCode',
          foreignField: '_id',
          as: 'qrCodeInfo'
        }
      },
      { $unwind: '$qrCodeInfo' },
      { $match: { 'qrCodeInfo.lecturer': lecturerId } },
      {
        $group: {
          _id: '$unitCode',
          unitName: { $first: '$unitName' },
          totalAttendance: { $count: {} },
          sessions: { $addToSet: '$qrCode' }
        }
      },
      {
        $project: {
          unitCode: '$_id',
          unitName: 1,
          totalAttendance: 1,
          totalSessions: { $size: '$sessions' }
        }
      }
    ]);
    
    // Get recent scans
    const recentScans = await Attendance.find({})
      .populate({
        path: 'qrCode',
        match: { lecturer: lecturerId }
      })
      .populate('student', 'name admissionNumber')
      .sort({ scannedAt: -1 })
      .limit(20);
    
    res.json({
      success: true,
      qrCodes,
      attendanceSummary,
      recentScans: recentScans.filter(scan => scan.qrCode)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/lecturer/attendance/:qrCodeId
router.get('/attendance/:qrCodeId', protect, authorize('lecturer'), async (req, res) => {
  try {
    const attendance = await Attendance.find({ 
      qrCode: req.params.qrCodeId 
    })
    .populate('student', 'name admissionNumber phoneNumber')
    .sort({ scannedAt: -1 });
    
    res.json({ success: true, attendance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/lecturer/qr-codes
router.get('/qr-codes', protect, authorize('lecturer'), async (req, res) => {
  try {
    const qrCodes = await QRCode.find({ lecturer: req.user._id })
      .sort({ createdAt: -1 });
    
    res.json({ success: true, qrCodes });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
