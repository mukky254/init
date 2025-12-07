const express = require('express');
const router = express.Router();
const QRCode = require('../models/QRCode');
const Attendance = require('../models/Attendance');
const { protect, authorize } = require('../middleware/auth');
const qrcode = require('qrcode');

// @route   GET /api/student/dashboard
router.get('/dashboard', protect, authorize('student'), async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get attendance summary
    const attendanceSummary = await Attendance.aggregate([
      { $match: { student: userId } },
      {
        $group: {
          _id: '$unitCode',
          unitName: { $first: '$unitName' },
          totalClasses: { $count: {} },
          attended: {
            $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          unitCode: '$_id',
          unitName: 1,
          totalClasses: 1,
          attended: 1,
          percentage: {
            $multiply: [
              { $divide: ['$attended', '$totalClasses'] },
              100
            ]
          }
        }
      }
    ]);
    
    // Get recent attendance
    const recentAttendance = await Attendance.find({ student: userId })
      .sort({ scannedAt: -1 })
      .limit(10)
      .populate('lecturer', 'name')
      .populate('qrCode', 'session location');
    
    res.json({
      success: true,
      summary: attendanceSummary,
      recentAttendance,
      totalClasses: attendanceSummary.reduce((sum, item) => sum + item.totalClasses, 0),
      totalAttended: attendanceSummary.reduce((sum, item) => sum + item.attended, 0)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/student/scan
router.post('/scan', protect, authorize('student'), async (req, res) => {
  try {
    const { qrCodeString } = req.body;
    const studentId = req.user._id;
    
    // Find active QR code
    const qrCode = await QRCode.findOne({ 
      qrCodeString,
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).populate('lecturer');
    
    if (!qrCode) {
      return res.status(400).json({ 
        success: false, 
        message: 'QR code is invalid or expired' 
      });
    }
    
    // Check if already scanned
    const existingAttendance = await Attendance.findOne({
      student: studentId,
      qrCode: qrCode._id
    });
    
    if (existingAttendance) {
      return res.status(400).json({ 
        success: false, 
        message: 'Attendance already recorded for this session' 
      });
    }
    
    // Record attendance
    const attendance = await Attendance.create({
      student: studentId,
      qrCode: qrCode._id,
      unitCode: qrCode.unitCode,
      unitName: qrCode.unitName,
      lecturer: qrCode.lecturer._id,
      location: qrCode.location,
      scannedAt: new Date()
    });
    
    res.json({
      success: true,
      message: 'Attendance recorded successfully',
      attendance: {
        unitCode: attendance.unitCode,
        unitName: attendance.unitName,
        scannedAt: attendance.scannedAt,
        location: attendance.location,
        lecturer: qrCode.lecturer.name
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/student/attendance/:unitCode
router.get('/attendance/:unitCode', protect, authorize('student'), async (req, res) => {
  try {
    const attendance = await Attendance.find({
      student: req.user._id,
      unitCode: req.params.unitCode
    }).sort({ scannedAt: -1 });
    
    res.json({ success: true, attendance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
