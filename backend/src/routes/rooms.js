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
