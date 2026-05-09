const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: String,
  image: String,
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  variant: String,
});

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // Guest checkout support
  guestEmail: String,
  guestPhone: String,
  items: [orderItemSchema],
  shippingAddress: {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    street: String,
    city: { type: String, required: true },
    country: { type: String, default: 'Cameroon' },
    notes: String,
  },
  subtotal: { type: Number, required: true },
  shippingFee: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  currency: { type: String, default: 'XAF' },
  paymentMethod: { type: String, enum: ['momo', 'cash_on_delivery'], required: true },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
  },
  momoTransactionId: String,
  momoReferenceId: String,
  // Client uploads screenshot of MoMo QR payment as proof
  paymentScreenshotUrl: { type: String },
  paymentScreenshotUploadedAt: { type: Date },
  screenshotVerified: { type: Boolean, default: false },
  orderStatus: {
    type: String,
    enum: ['placed', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
    default: 'placed',
  },
  statusHistory: [{
    status: String,
    note: String,
    updatedAt: { type: Date, default: Date.now },
  }],
  // UTM tracking for social media campaigns
  source: String,    // e.g. 'tiktok', 'whatsapp', 'instagram'
  medium: String,    // e.g. 'social', 'story'
  campaign: String,
  isGift: { type: Boolean, default: false },
  giftMessage: String,
}, { timestamps: true });

// Auto generate order number
orderSchema.pre('save', async function (next) {
  if (!this.orderNumber) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderNumber = `GLM-${String(count + 1).padStart(5, '0')}`;
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
