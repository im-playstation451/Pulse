const express = require('express');
const router = express.Router();

router.post('/:targetUserId', (req, res) => {
  const targetUserId = req.params.targetUserId;
  const callerId = req.body.callerId;

  req.app.get('io').to(targetUserId).emit('incoming-call', { callerId: callerId });
  res.status(200).send('Call signal sent.');
});

module.exports = router;