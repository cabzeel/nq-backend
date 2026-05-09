const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');
const { protect, admin } = require('../middleware/auth');

router.get('/dashboard', protect, admin, asyncHandler(async (req, res) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

  const [
    totalRevenue, monthRevenue, lastMonthRevenue,
    totalOrders, monthOrders, pendingOrders,
    totalProducts, lowStockProducts,
    totalCustomers, recentOrders,
    topProducts, salesBySource,
  ] = await Promise.all([
    Order.aggregate([{ $match: { paymentStatus: 'paid' } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Order.aggregate([{ $match: { paymentStatus: 'paid', createdAt: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Order.aggregate([{ $match: { paymentStatus: 'paid', createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth } } }, { $group: { _id: null, total: { $sum: '$total' } } }]),
    Order.countDocuments(),
    Order.countDocuments({ createdAt: { $gte: startOfMonth } }),
    Order.countDocuments({ orderStatus: 'placed' }),
    Product.countDocuments({ isActive: true }),
    Product.countDocuments({ isActive: true, stock: { $lte: 5 } }),
    User.countDocuments({ role: 'customer' }),
    Order.find().sort('-createdAt').limit(5).populate('user', 'name email'),
    Product.find({ isActive: true }).sort('-soldCount').limit(5).select('name soldCount images price'),
    Order.aggregate([
      { $match: { source: { $ne: null } } },
      { $group: { _id: '$source', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      { $sort: { revenue: -1 } },
    ]),
  ]);

  res.json({
    success: true,
    stats: {
      revenue: {
        total: totalRevenue[0]?.total || 0,
        thisMonth: monthRevenue[0]?.total || 0,
        lastMonth: lastMonthRevenue[0]?.total || 0,
      },
      orders: { total: totalOrders, thisMonth: monthOrders, pending: pendingOrders },
      products: { total: totalProducts, lowStock: lowStockProducts },
      customers: { total: totalCustomers },
    },
    recentOrders,
    topProducts,
    salesBySource,
  });
}));

// Monthly revenue chart data
router.get('/revenue-chart', protect, admin, asyncHandler(async (req, res) => {
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  const data = await Order.aggregate([
    { $match: { paymentStatus: 'paid' } },
    { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
  ]);

  const chartData = months.map(m => {
    const found = data.find(d => d._id.year === m.year && d._id.month === m.month);
    return {
      label: `${m.year}-${String(m.month).padStart(2, '0')}`,
      revenue: found?.revenue || 0,
      orders: found?.orders || 0,
    };
  });

  res.json({ success: true, chartData });
}));

module.exports = router;
