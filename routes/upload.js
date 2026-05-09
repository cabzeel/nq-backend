const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { protect, admin } = require('../middleware/auth');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'));
  },
});

// @POST /api/upload/image
router.post('/image', protect, admin, upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) { res.status(400); throw new Error('No image provided'); }

  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'nq-shop', quality: 'auto', fetch_format: 'auto' },
      (err, result) => err ? reject(err) : resolve(result)
    );
    stream.end(req.file.buffer);
  });

  res.json({
    success: true,
    url: result.secure_url,
    publicId: result.public_id,
  });
}));

// @DELETE /api/upload/image/:publicId
router.delete('/image/:publicId', protect, admin, asyncHandler(async (req, res) => {
  await cloudinary.uploader.destroy(decodeURIComponent(req.params.publicId));
  res.json({ success: true });
}));

module.exports = router;
