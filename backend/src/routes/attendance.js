const express = require('express');
const router = express.Router();
const { getAttendance, getMyAttendance } = require('../controllers/attendanceController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/me', getMyAttendance);
router.get('/room/:roomId', getAttendance);

module.exports = router;
