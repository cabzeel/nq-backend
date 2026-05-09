const express = require('express');
const router  = express.Router();
const asyncHandler = require('express-async-handler');
const ChatMessage  = require('../models/ChatMessage');
const { protect, adminOnly } = require('../middleware/auth');

// GET /api/chat/sessions — admin: list all active sessions
router.get('/sessions', protect, adminOnly, asyncHandler(async (req, res) => {
  const sessions = await ChatMessage.aggregate([
    { $sort: { createdAt: -1 } },
    { $group: {
        _id: '$sessionId',
        lastMessage: { $first: '$text' },
        lastAt: { $first: '$createdAt' },
        visitorName: { $first: '$visitorName' },
        unread: { $sum: { $cond: [{ $and: [{ $eq: ['$sender','client'] }, { $eq: ['$read', false] }] }, 1, 0] } },
    }},
    { $sort: { lastAt: -1 } },
    { $limit: 100 },
  ]);
  res.json({ success: true, sessions });
}));

// GET /api/chat/:sessionId — get messages for a session
router.get('/:sessionId', asyncHandler(async (req, res) => {
  const messages = await ChatMessage.find({ sessionId: req.params.sessionId })
    .sort({ createdAt: 1 }).limit(200);
  res.json({ success: true, messages });
}));

// POST /api/chat/:sessionId/read — admin marks session as read
router.post('/:sessionId/read', protect, adminOnly, asyncHandler(async (req, res) => {
  await ChatMessage.updateMany(
    { sessionId: req.params.sessionId, sender: 'client', read: false },
    { $set: { read: true } }
  );
  res.json({ success: true });
}));

// POST /api/chat/:sessionId/reply — admin sends a message (REST fallback)
router.post('/:sessionId/reply', protect, adminOnly, asyncHandler(async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) { res.status(400); throw new Error('Message text is required'); }
  const msg = await ChatMessage.create({
    sessionId: req.params.sessionId,
    sender: 'admin',
    text: text.trim(),
    type: 'text',
  });
  // Push via socket.io if available
  const io = req.app.get('io');
  if (io) {
    io.to(`session:${req.params.sessionId}`).emit('message', msg);
  }
  res.status(201).json({ success: true, message: msg });
}));

module.exports = router;
