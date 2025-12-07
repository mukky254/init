const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const QRCode = require('../models/QRCode');
const { protect, authorize } = require('../middleware/auth');

// @route   GET /api/admin/dashboard
router.get('/dashboard', protect, authorize('admin'), async (req, res) => {
  try {
    // Get system statistics
    const totalStudents = await User.countDocuments({ role: 'student' });
    const totalLecturers = await User.countDocuments({ role: 'lecturer' });
    const totalAttendance = await Attendance.countDocuments();
    const totalQRCodes = await QRCode.countDocuments();
    
    // Get recent activity
    const recentAttendance = await Attendance.find()
      .populate('student', 'name admissionNumber')
      .populate('lecturer', 'name')
      .sort({ scannedAt: -1 })
      .limit(10);
    
    // Get attendance by course
    const attendanceByCourse = await Attendance.aggregate([
      {
        $group: {
          _id: '$unitCode',
          unitName: { $first: '$unitName' },
          totalAttendance: { $count: {} },
          uniqueStudents: { $addToSet: '$student' }
        }
      },
      {
        $project: {
          unitCode: '$_id',
          unitName: 1,
          totalAttendance: 1,
          uniqueStudentsCount: { $size: '$uniqueStudents' }
        }
      }
    ]);
    
    res.json({
      success: true,
      stats: {
        totalStudents,
        totalLecturers,
        totalAttendance,
        totalQRCodes
      },
      recentAttendance,
      attendanceByCourse
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/admin/students
router.get('/students', protect, authorize('admin'), async (req, res) => {
  try {
    const students = await User.find({ role: 'student' })
      .select('-password')
      .sort({ createdAt: -1 });
    
    // Get attendance data for each student
    const studentsWithAttendance = await Promise.all(
      students.map(async (student) => {
        const attendanceStats = await Attendance.aggregate([
          { $match: { student: student._id } },
          {
            $group: {
              _id: '$unitCode',
              unitName: { $first: '$unitName' },
              attended: { $count: {} }
            }
          }
        ]);
        
        return {
          ...student.toObject(),
          attendanceStats
        };
      })
    );
    
    res.json({ success: true, students: studentsWithAttendance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/admin/student/:id
router.get('/student/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const student = await User.findById(req.params.id).select('-password');
    
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }
    
    // Get detailed attendance
    const attendance = await Attendance.find({ student: student._id })
      .populate('lecturer', 'name')
      .sort({ scannedAt: -1 });
    
    // Get attendance summary by unit
    const summary = await Attendance.aggregate([
      { $match: { student: student._id } },
      {
        $group: {
          _id: '$unitCode',
          unitName: { $first: '$unitName' },
          totalClasses: { 
            $count: {} 
          },
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
    
    res.json({
      success: true,
      student,
      attendance,
      summary
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   GET /api/admin/lecturers
router.get('/lecturers', protect, authorize('admin'), async (req, res) => {
  try {
    const lecturers = await User.find({ role: 'lecturer' })
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json({ success: true, lecturers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @route   POST /api/admin/create-user
router.post('/create-user', protect, authorize('admin'), async (req, res) => {
  try {
    const { name, email, password, role, admissionNumber, phoneNumber, course } = req.body;
    
    const user = await User.create({
      name,
      email,
      password,
      role,
      admissionNumber,
      phoneNumber,
      course
    });
    
    res.status(201).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
