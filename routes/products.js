const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Product = require('../models/Product');
const { protect, admin, optionalAuth } = require('../middleware/auth');

// @GET /api/products — public, with filters & SEO-friendly
router.get('/', asyncHandler(async (req, res) => {
  const { category, search, minPrice, maxPrice, sort, page = 1, limit = 12,
    featured, isNew, tag } = req.query;

  const query = { isActive: true };
  if (category) query.category = category;
  if (featured === 'true') query.isFeatured = true;
  if (isNew === 'true') query.isNewArrival = true;
  if (tag) query.tags = tag;
  if (search) query.$text = { $search: search };
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = Number(minPrice);
    if (maxPrice) query.price.$lte = Number(maxPrice);
  }

  const sortMap = {
    newest: '-createdAt',
    oldest: 'createdAt',
    'price-asc': 'price',
    'price-desc': '-price',
    popular: '-soldCount',
    rating: '-rating',
  };
  const sortBy = sortMap[sort] || '-createdAt';

  const skip = (Number(page) - 1) * Number(limit);
  const [products, total] = await Promise.all([
    Product.find(query).populate('category', 'name slug').sort(sortBy).skip(skip).limit(Number(limit)),
    Product.countDocuments(query),
  ]);

  res.json({
    success: true,
    products,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
}));

// @GET /api/products/featured
router.get('/featured', asyncHandler(async (req, res) => {
  const products = await Product.find({ isActive: true, isFeatured: true })
    .populate('category', 'name slug').limit(8).sort('-createdAt');
  res.json({ success: true, products });
}));

// @GET /api/products/new-arrivals
router.get('/new-arrivals', asyncHandler(async (req, res) => {
  const products = await Product.find({ isActive: true, isNewArrival: true })
    .populate('category', 'name slug').limit(8).sort('-createdAt');
  res.json({ success: true, products });
}));

// @GET /api/products/:slug — by slug for SEO
router.get('/:slug', optionalAuth, asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true })
    .populate('category', 'name slug')
    .populate('reviews.user', 'name');
  if (!product) { res.status(404); throw new Error('Product not found'); }
  res.json({ success: true, product });
}));

// @POST /api/products/:id/review
router.post('/:id/review', protect, asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const product = await Product.findById(req.params.id);
  if (!product) { res.status(404); throw new Error('Product not found'); }

  const alreadyReviewed = product.reviews.find(r => r.user.toString() === req.user._id.toString());
  if (alreadyReviewed) { res.status(400); throw new Error('Already reviewed'); }

  product.reviews.push({ user: req.user._id, name: req.user.name, rating: Number(rating), comment });
  product.updateRating();
  await product.save();
  res.status(201).json({ success: true, message: 'Review added' });
}));

// ─── Admin Routes ─────────────────────────────────────────────────────────────

// @POST /api/products — admin
router.post('/', protect, admin, asyncHandler(async (req, res) => {
  const product = await Product.create(req.body);
  res.status(201).json({ success: true, product });
}));

// @PUT /api/products/:id — admin
router.put('/:id', protect, admin, asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!product) { res.status(404); throw new Error('Product not found'); }
  res.json({ success: true, product });
}));

// @DELETE /api/products/:id — admin (soft delete)
router.delete('/:id', protect, admin, asyncHandler(async (req, res) => {
  await Product.findByIdAndUpdate(req.params.id, { isActive: false });
  res.json({ success: true, message: 'Product deactivated' });
}));

// @GET /api/products/admin/all — admin, includes inactive
router.get('/admin/all', protect, admin, asyncHandler(async (req, res) => {
  const products = await Product.find({}).populate('category', 'name').sort('-createdAt');
  res.json({ success: true, products });
}));

module.exports = router;
