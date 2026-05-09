const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  sender: { type: String, enum: ['client', 'admin'], required: true },
  text: { type: String },
  type: { type: String, enum: ['text', 'image', 'system'], default: 'text' },
  imageUrl: { type: String },
  read: { type: Boolean, default: false },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  visitorName: { type: String, default: 'Guest' },
}, { timestamps: true });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
