const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
require('dotenv').config();

async function generateWeeklyReports() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    console.log('Connected to MongoDB');
    
    // Calculate date range (last 7 days)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    
    // Get attendance statistics for the week
    const weeklyStats = await Attendance.aggregate([
      {
        $match: {
          scannedAt: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: '$unitCode',
          unitName: { $first: '$unitName' },
          totalScans: { $count: {} },
          uniqueStudents: { $addToSet: '$student' }
        }
      },
      {
        $project: {
          unitCode: '$_id',
          unitName: 1,
          totalScans: 1,
          uniqueStudentCount: { $size: '$uniqueStudents' }
        }
      }
    ]);
    
    console.log('Weekly Statistics:', weeklyStats);
    
    // Here you could:
    // 1. Send email reports to admins
    // 2. Generate PDF reports
    // 3. Update dashboard statistics
    
    console.log('Weekly report generation completed');
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('Weekly report error:', error);
  }
}

generateWeeklyReports();
