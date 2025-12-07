require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const crypto = require('crypto');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/attendance';
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// User Schema
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ['student', 'lecturer', 'admin'] },
  admissionNumber: { type: String, unique: true, sparse: true },
  phoneNumber: String,
  course: String,
  department: String,
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

// QR Code Schema
const qrCodeSchema = new mongoose.Schema({
  lecturerId: mongoose.Schema.Types.ObjectId,
  unitCode: String,
  unitName: String,
  qrString: String,
  expiresAt: Date,
  location: String,
  session: String,
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const QRCodeModel = mongoose.model('QRCode', qrCodeSchema);

// Attendance Schema
const attendanceSchema = new mongoose.Schema({
  studentId: mongoose.Schema.Types.ObjectId,
  qrCodeId: mongoose.Schema.Types.ObjectId,
  unitCode: String,
  unitName: String,
  lecturerId: mongoose.Schema.Types.ObjectId,
  scannedAt: { type: Date, default: Date.now },
  location: String,
  status: { type: String, default: 'present' }
});

const Attendance = mongoose.model('Attendance', attendanceSchema);

// Authentication Middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token provided' });
    
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = await User.findById(decoded.userId);
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Routes

// 1. Auth Routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, role, admissionNumber, phoneNumber } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });
    
    // Create user
    const user = new User({
      name,
      email,
      password,
      role,
      admissionNumber,
      phoneNumber
    });
    
    await user.save();
    
    // Generate token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        admissionNumber: user.admissionNumber
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });
    
    // Generate token
    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        admissionNumber: user.admissionNumber
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Student Routes
app.post('/api/student/scan', authenticate, async (req, res) => {
  try {
    const { qrString } = req.body;
    const studentId = req.user._id;
    
    // Find QR code
    const qrCode = await QRCodeModel.findOne({ 
      qrString, 
      isActive: true,
      expiresAt: { $gt: new Date() }
    });
    
    if (!qrCode) return res.status(400).json({ error: 'Invalid or expired QR code' });
    
    // Check if already scanned
    const existing = await Attendance.findOne({ studentId, qrCodeId: qrCode._id });
    if (existing) return res.status(400).json({ error: 'Already attended this session' });
    
    // Record attendance
    const attendance = new Attendance({
      studentId,
      qrCodeId: qrCode._id,
      unitCode: qrCode.unitCode,
      unitName: qrCode.unitName,
      lecturerId: qrCode.lecturerId,
      location: qrCode.location
    });
    
    await attendance.save();
    
    res.json({
      success: true,
      message: 'Attendance recorded successfully',
      attendance: {
        unitCode: attendance.unitCode,
        unitName: attendance.unitName,
        scannedAt: attendance.scannedAt,
        location: attendance.location
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/student/dashboard', authenticate, async (req, res) => {
  try {
    const studentId = req.user._id;
    
    // Get attendance summary
    const attendance = await Attendance.find({ studentId })
      .populate('lecturerId', 'name')
      .sort({ scannedAt: -1 });
    
    // Calculate statistics
    const unitStats = {};
    attendance.forEach(record => {
      if (!unitStats[record.unitCode]) {
        unitStats[record.unitCode] = {
          unitName: record.unitName,
          total: 0,
          attended: 0
        };
      }
      unitStats[record.unitCode].total += 1;
      unitStats[record.unitCode].attended += 1;
    });
    
    res.json({
      success: true,
      attendance,
      unitStats: Object.entries(unitStats).map(([code, stats]) => ({
        unitCode: code,
        unitName: stats.unitName,
        totalClasses: stats.total,
        attended: stats.attended,
        percentage: ((stats.attended / stats.total) * 100).toFixed(2)
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Lecturer Routes
app.post('/api/lecturer/generate-qr', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'lecturer') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const { unitCode, unitName, duration = 15, location, session } = req.body;
    
    // Generate unique QR string
    const qrString = crypto.randomBytes(32).toString('hex');
    
    // Calculate expiration
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + parseInt(duration));
    
    // Create QR code
    const qrCode = new QRCodeModel({
      lecturerId: req.user._id,
      unitCode,
      unitName,
      qrString,
      expiresAt,
      location,
      session
    });
    
    await qrCode.save();
    
    // Generate QR code image
    const qrImage = await QRCode.toDataURL(qrString);
    
    res.json({
      success: true,
      qrCode: {
        id: qrCode._id,
        qrImage,
        qrString,
        expiresAt,
        unitCode,
        unitName,
        location,
        session
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/lecturer/attendance/:qrCodeId', authenticate, async (req, res) => {
  try {
    const attendance = await Attendance.find({ qrCodeId: req.params.qrCodeId })
      .populate('studentId', 'name admissionNumber')
      .sort({ scannedAt: -1 });
    
    res.json({ success: true, attendance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Admin Routes
app.get('/api/admin/students', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const students = await User.find({ role: 'student' })
      .select('-password')
      .sort({ createdAt: -1 });
    
    // Get attendance for each student
    const studentsWithAttendance = await Promise.all(
      students.map(async (student) => {
        const attendance = await Attendance.find({ studentId: student._id });
        const totalClasses = await Attendance.distinct('qrCodeId', { studentId: student._id });
        
        return {
          ...student.toObject(),
          attendanceCount: attendance.length,
          classesAttended: totalClasses.length
        };
      })
    );
    
    res.json({ success: true, students: studentsWithAttendance });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`
  🚀 Attendance System Backend Started!
  🌐 URL: https://attendance-system-backend.onrender.com
  📅 Time: ${new Date().toLocaleString()}
  ⚡ Environment: ${process.env.NODE_ENV || 'development'}
  📊 Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}
  `);
});
