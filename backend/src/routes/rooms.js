const express = require('express');
const router = express.Router();
const { createRoom, getRooms, getRoomByCode, getRoomById } = require('../controllers/roomController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.post('/', createRoom);
router.get('/', getRooms);
router.get('/code/:code', getRoomByCode);
router.get('/:roomId', getRoomById);

module.exports = router;

// GET /api/rooms/ice-config — returns TURN credentials
router.get('/ice-config', authenticate, (req, res) => {
  res.json({
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:relay1.expressturn.com:3478', username: 'efRPNIBNMRBMBMAQBF', credential: 'YAuPUGTrWV3CtXIk' },
    ],
    iceCandidatePoolSize: 10,
  });
});
