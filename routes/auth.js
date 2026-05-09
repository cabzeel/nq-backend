const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// @POST /api/auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    res.status(400); throw new Error('Please provide name, email and password');
  }
  const exists = await User.findOne({ email });
  if (exists) { res.status(400); throw new Error('Email already registered'); }

  const user = await User.create({ name, email, password, phone });
  res.status(201).json({
    success: true,
    token: user.getSignedToken(),
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  });
}));

// @POST /api/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) { res.status(400); throw new Error('Email and password required'); }

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    res.status(401); throw new Error('Invalid credentials');
  }
  if (!user.isActive) { res.status(403); throw new Error('Account deactivated'); }

  res.json({
    success: true,
    token: user.getSignedToken(),
    user: { id: user._id, name: user.name, email: user.email, role: user.role },
  });
}));

// @GET /api/auth/me
router.get('/me', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate('wishlist', 'name price images slug');
  res.json({ success: true, user });
}));

// @PUT /api/auth/profile
router.put('/profile', protect, asyncHandler(async (req, res) => {
  const { name, phone, addresses } = req.body;
  const user = await User.findById(req.user._id);
  if (name) user.name = name;
  if (phone) user.phone = phone;
  if (addresses) user.addresses = addresses;
  await user.save();
  res.json({ success: true, user });
}));

// @PUT /api/auth/password
router.put('/password', protect, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matchPassword(currentPassword))) {
    res.status(401); throw new Error('Current password is incorrect');
  }
  user.password = newPassword;
  await user.save();
  res.json({ success: true, message: 'Password updated' });
}));

// @POST /api/auth/wishlist/:productId
router.post('/wishlist/:productId', protect, asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const pid = req.params.productId;
  const idx = user.wishlist.indexOf(pid);
  if (idx > -1) {
    user.wishlist.splice(idx, 1);
  } else {
    user.wishlist.push(pid);
  }
  await user.save();
  res.json({ success: true, wishlist: user.wishlist });
}));

module.exports = router;
