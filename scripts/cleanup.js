const mongoose = require('mongoose');
const QRCode = require('../models/QRCode');
const Attendance = require('../models/Attendance');
require('dotenv').config();

async function cleanupExpiredQR() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('Connected to MongoDB');
    
    // Find and deactivate expired QR codes
    const expiredQRCodes = await QRCode.find({
      expiresAt: { $lt: new Date() },
      isActive: true
    });
    
    console.log(`Found ${expiredQRCodes.length} expired QR codes`);
    
    // Deactivate expired QR codes
    await QRCode.updateMany(
      { expiresAt: { $lt: new Date() }, isActive: true },
      { isActive: false }
    );
    
    console.log('Deactivated expired QR codes');
    
    // Close connection
    await mongoose.connection.close();
    console.log('Cleanup completed successfully');
  } catch (error) {
    console.error('Cleanup error:', error);
    process.exit(1);
  }
}

cleanupExpiredQR();
