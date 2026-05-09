const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const Order = require('../models/Order');
const { protect, admin } = require('../middleware/auth');

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = process.env.MOMO_BASE_URL     || 'https://sandbox.momodeveloper.mtn.com';
const SUB_KEY  = process.env.MOMO_SUBSCRIPTION_KEY;
const API_USER = process.env.MOMO_API_USER;
const API_KEY  = process.env.MOMO_API_KEY;
const CURRENCY = process.env.MOMO_CURRENCY     || 'XAF';
const MOMO_ENV = process.env.MOMO_ENVIRONMENT  || 'sandbox';
const CALLBACK = process.env.MOMO_CALLBACK_URL || '';

// ── FUNCTION 1: CreateAccessToken ─────────────────────────────────────────────
async function createAccessToken() {
  const credentials = Buffer.from(`${API_USER}:${API_KEY}`).toString('base64');
  try {
    const { data } = await axios.post(
      `${BASE_URL}/collection/token/`,
      {},
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Ocp-Apim-Subscription-Key': SUB_KEY,
        },
      }
    );
    return data.access_token;
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[MoMo] CreateAccessToken failed:', JSON.stringify(detail));
    throw new Error(`MoMo auth failed: ${JSON.stringify(detail)}`);
  }
}

// ── FUNCTION 2: ValidateAccountHolderStatus ───────────────────────────────────
async function validateAccountHolder(phone) {
  const token = await createAccessToken();
  const msisdn = phone.replace(/\D/g, '').replace(/^0/, '');

  try {
    const { data } = await axios.get(
      `${BASE_URL}/collection/v1_0/accountholder/msisdn/${msisdn}/active`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Target-Environment': MOMO_ENV,
          'Ocp-Apim-Subscription-Key': SUB_KEY,
        },
      }
    );
    return data.result === true;
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[MoMo] ValidateAccountHolder failed:', JSON.stringify(detail));
    // Don't block checkout if validation itself errors — log and continue
    return true;
  }
}

// ── FUNCTION 3: RequesttoPay ──────────────────────────────────────────────────
async function requestToPay({ amount, phone, orderId, orderNumber }) {
  const token = await createAccessToken();
  const msisdn = phone.replace(/\D/g, '').replace(/^0/, '');
  const referenceId = uuidv4();

  if (process.env.NODE_ENV !== 'production') {
    console.log('[MoMo] RequesttoPay →', {
      amount: String(Math.round(amount)),
      currency: CURRENCY,
      msisdn,
      referenceId,
      environment: MOMO_ENV,
    });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    'X-Reference-Id': referenceId,
    'X-Target-Environment': MOMO_ENV,
    'Ocp-Apim-Subscription-Key': SUB_KEY,
    'Content-Type': 'application/json',
  }

  try {
    const response = await axios.post(
      `${BASE_URL}/collection/v1_0/requesttopay`,
      {
        amount: String(Math.round(amount)),
        currency: CURRENCY,
        externalId: orderId,
        payer: {
          partyIdType: 'MSISDN',
          partyId: msisdn,
        },
        payerMessage: `Payment for order ${orderNumber}`,
        payeeNote: `GlamourShop ${orderNumber}`,
      },
      { headers }
    );
    // MTN returns 202 Accepted on success — not 200
    if (process.env.NODE_ENV !== 'production') {
      console.log('[MoMo] RequesttoPay accepted, HTTP status:', response.status);
    }
    return referenceId;
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data || err.message;
    console.error(`[MoMo] RequesttoPay failed — HTTP ${status}:`, JSON.stringify(detail));
    throw new Error(`MoMo payment request failed (${status}): ${JSON.stringify(detail)}`);
  }
}

// ── FUNCTION 4: RequesttoPayTransactionStatus ─────────────────────────────────
async function getTransactionStatus(referenceId) {
  const token = await createAccessToken();
  try {
    const { data } = await axios.get(
      `${BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Target-Environment': MOMO_ENV,
          'Ocp-Apim-Subscription-Key': SUB_KEY,
        },
      }
    );
    return data;
  } catch (err) {
    const detail = err.response?.data || err.message;
    console.error('[MoMo] GetTransactionStatus failed:', JSON.stringify(detail));
    throw new Error(`MoMo status check failed: ${JSON.stringify(detail)}`);
  }
}

// ── Shared: mark order paid ───────────────────────────────────────────────────
async function markOrderPaid(order, financialTransactionId) {
  order.paymentStatus     = 'paid';
  order.orderStatus       = 'confirmed';
  order.momoTransactionId = financialTransactionId;
  order.statusHistory.push({
    status: 'confirmed',
    note: 'Payment confirmed via MTN MoMo',
  });
  await order.save();
}

// ─────────────────────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/payments/momo/validate
router.post('/momo/validate', asyncHandler(async (req, res) => {
  const { phone } = req.body;
  if (!phone) { res.status(400); throw new Error('Phone number required'); }

  const isActive = await validateAccountHolder(phone);
  res.json({
    success: true,
    valid: isActive,
    message: isActive
      ? 'MTN MoMo account is active'
      : 'This number is not registered on MTN MoMo.',
  });
}));

// POST /api/payments/momo/initiate
router.post('/momo/initiate', asyncHandler(async (req, res) => {
  const { orderId, phone } = req.body;
  if (!phone)   { res.status(400); throw new Error('Phone number required'); }
  if (!orderId) { res.status(400); throw new Error('Order ID required'); }

  const order = await Order.findById(orderId);
  if (!order)                         { res.status(404); throw new Error('Order not found'); }
  if (order.paymentStatus === 'paid') { res.status(400); throw new Error('Order already paid'); }

  const referenceId = await requestToPay({
    amount: order.total,
    phone,
    orderId: order._id.toString(),
    orderNumber: order.orderNumber,
  });

  order.momoReferenceId = referenceId;
  await order.save();

  res.json({
    success: true,
    referenceId,
    message: 'A payment prompt has been sent to your phone. Please approve it.',
  });
}));

// GET /api/payments/momo/status/:referenceId
router.get('/momo/status/:referenceId', asyncHandler(async (req, res) => {
  const { referenceId } = req.params;

  const txStatus = await getTransactionStatus(referenceId);
  const order    = await Order.findOne({ momoReferenceId: referenceId });

  if (txStatus.status === 'SUCCESSFUL' && order && order.paymentStatus !== 'paid') {
    await markOrderPaid(order, txStatus.financialTransactionId);
  }
  if (txStatus.status === 'FAILED' && order && order.paymentStatus !== 'failed') {
    order.paymentStatus = 'failed';
    await order.save();
  }

  res.json({
    success: true,
    momoStatus: txStatus.status,
    paymentStatus: order?.paymentStatus,
    orderId: order?._id,
    orderNumber: order?.orderNumber,
  });
}));

// POST /api/payments/momo/callback
router.post('/momo/callback', asyncHandler(async (req, res) => {
  const referenceId   = req.body.referenceId || req.body.externalId;
  const status        = req.body.status;
  const financialTxId = req.body.financialTransactionId;

  const order = await Order.findOne({ momoReferenceId: referenceId });
  if (order) {
    if (status === 'SUCCESSFUL' && order.paymentStatus !== 'paid') {
      await markOrderPaid(order, financialTxId);
    } else if (status === 'FAILED' && order.paymentStatus !== 'failed') {
      order.paymentStatus = 'failed';
      await order.save();
    }
  }
  res.status(200).json({ received: true });
}));

module.exports = router;
// ─────────────────────────────────────────────────────────────────────────────
// QR / SCREENSHOT FLOW
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/payments/momo/qr/:orderId
// Returns the MoMo merchant QR payload for the order.
// The QR encodes the merchant's number + amount so the client scans & pays.
router.get('/momo/qr/:orderId', asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.orderId);
  if (!order) { res.status(404); throw new Error('Order not found'); }

  const merchantNumber = process.env.MOMO_MERCHANT_NUMBER || process.env.VITE_WHATSAPP || '237653344368';
  const amount = order.total;
  const ref    = order.orderNumber;

  // Standard MoMo QR deeplink format used in Cameroon
  const qrPayload = `momo://pay?phone=${merchantNumber}&amount=${amount}&ref=${ref}&note=NQ+Order+${ref}`;

  res.json({
    success: true,
    qrPayload,
    merchantNumber,
    amount,
    orderNumber: ref,
    currency: 'XAF',
  });
}));

// POST /api/payments/momo/screenshot/:orderId
// Client uploads screenshot URL (already uploaded via /api/upload/image) as payment proof
router.post('/momo/screenshot/:orderId', asyncHandler(async (req, res) => {
  const { screenshotUrl } = req.body;
  if (!screenshotUrl) { res.status(400); throw new Error('Screenshot URL required'); }

  const order = await Order.findById(req.params.orderId);
  if (!order) { res.status(404); throw new Error('Order not found'); }

  order.paymentScreenshotUrl         = screenshotUrl;
  order.paymentScreenshotUploadedAt  = new Date();
  order.paymentStatus                = 'pending'; // awaiting admin verification
  order.statusHistory.push({ status: order.orderStatus, note: 'Payment screenshot uploaded — awaiting verification' });
  await order.save();

  res.json({ success: true, message: 'Screenshot received. Your order will be confirmed once payment is verified.' });
}));

// POST /api/payments/momo/verify/:orderId — admin verifies the screenshot
router.post('/momo/verify/:orderId', protect, admin, asyncHandler(async (req, res) => {
  const { approved, note } = req.body;
  const order = await Order.findById(req.params.orderId);
  if (!order) { res.status(404); throw new Error('Order not found'); }

  if (approved) {
    order.paymentStatus      = 'paid';
    order.orderStatus        = 'confirmed';
    order.screenshotVerified = true;
    order.statusHistory.push({ status: 'confirmed', note: note || 'Payment screenshot verified by admin' });
  } else {
    order.paymentStatus = 'failed';
    order.statusHistory.push({ status: order.orderStatus, note: note || 'Payment screenshot rejected by admin' });
  }
  await order.save();
  res.json({ success: true, order });
}));
