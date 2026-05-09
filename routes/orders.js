const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { protect, admin, optionalAuth } = require('../middleware/auth');

// @POST /api/orders — Create order (supports guest checkout)
router.post('/', optionalAuth, asyncHandler(async (req, res) => {
  const {
    items, shippingAddress, paymentMethod,
    guestEmail, guestPhone, source, medium, campaign,
    isGift, giftMessage,
  } = req.body;

  if (!items?.length) { res.status(400); throw new Error('No order items'); }

  // Verify stock & calculate totals
  let subtotal = 0;
  const orderItems = [];
  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product || !product.isActive) {
      res.status(404); throw new Error(`Product not available: ${item.product}`);
    }
    if (product.stock < item.quantity) {
      res.status(400); throw new Error(`Insufficient stock for ${product.name}`);
    }
    subtotal += product.price * item.quantity;
    orderItems.push({
      product: product._id,
      name: product.name,
      image: product.images[0]?.url,
      price: product.price,
      quantity: item.quantity,
      variant: item.variant,
    });
  }

  const shippingFee = subtotal >= 50000 ? 0 : 2000; // Free shipping over 50,000 XAF
  const total = subtotal + shippingFee;

  const order = await Order.create({
    user: req.user?._id,
    guestEmail,
    guestPhone,
    items: orderItems,
    shippingAddress,
    subtotal,
    shippingFee,
    total,
    paymentMethod,
    source, medium, campaign,
    isGift, giftMessage,
    statusHistory: [{ status: 'placed', note: 'Order placed successfully' }],
  });

  // Reduce stock
  for (const item of items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: -item.quantity, soldCount: item.quantity },
    });
  }

  res.status(201).json({ success: true, order });
}));

// @GET /api/orders/my — logged-in user orders
router.get('/my', protect, asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort('-createdAt');
  res.json({ success: true, orders });
}));

// @GET /api/orders/track/:orderNumber — track by order number (public)
router.get('/track/:orderNumber', asyncHandler(async (req, res) => {
  const order = await Order.findOne({ orderNumber: req.params.orderNumber })
    .select('-momoTransactionId -guestEmail');
  if (!order) { res.status(404); throw new Error('Order not found'); }
  res.json({ success: true, order });
}));

// @GET /api/orders/:id
router.get('/:id', protect, asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate('items.product', 'name images');
  if (!order) { res.status(404); throw new Error('Order not found'); }
  // Only owner or admin
  if (order.user?.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    res.status(403); throw new Error('Not authorized');
  }
  res.json({ success: true, order });
}));

// ─── Admin ────────────────────────────────────────────────────────────────────

// @GET /api/orders — all orders (admin)
router.get('/', protect, admin, asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const query = status ? { orderStatus: status } : {};
  const skip = (Number(page) - 1) * Number(limit);
  const [orders, total] = await Promise.all([
    Order.find(query).populate('user', 'name email').sort('-createdAt').skip(skip).limit(Number(limit)),
    Order.countDocuments(query),
  ]);
  res.json({ success: true, orders, total, pages: Math.ceil(total / Number(limit)) });
}));

// @PUT /api/orders/:id/status — admin update status
router.put('/:id/status', protect, admin, asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) { res.status(404); throw new Error('Order not found'); }
  order.orderStatus = status;
  order.statusHistory.push({ status, note: note || `Status updated to ${status}` });
  await order.save();
  res.json({ success: true, order });
}));

module.exports = router;
