const express   = require('express');
const http      = require('http');
const cors      = require('cors');
const helmet    = require('helmet');
const morgan    = require('morgan');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const connectDB   = require('./lib/mongodb');
const ChatMessage = require('./models/ChatMessage');
require('dotenv').config();

const app    = express();
const server = http.createServer(app);

// ── CORS origins ──────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
].filter(Boolean);

// ── Socket.io ─────────────────────────────────────────────────────────────────
// IMPORTANT: Vercel does NOT support WebSockets.
// Force long-polling only so Socket.io works on Vercel serverless.
// For production WebSocket support, migrate to Railway / Render / a VPS.
const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true },
  transports: ['polling'],          // no 'websocket' — Vercel blocks it
  allowEIO3: true,
  path: '/socket.io',
});

const adminSockets = new Set();

io.on('connection', async (socket) => {
  await connectDB();
  const { sessionId, visitorName, isAdmin } = socket.handshake.query;

  if (isAdmin === 'true') {
    adminSockets.add(socket.id);
    socket.join('admin-room');

    socket.on('admin:join-session', (sid) => socket.join(`session:${sid}`));

    socket.on('admin:send', async ({ sessionId: sid, text }) => {
      if (!text?.trim()) return;
      const msg = await ChatMessage.create({ sessionId: sid, sender: 'admin', text: text.trim(), type: 'text' });
      io.to(`session:${sid}`).emit('message', msg);
    });

    socket.on('disconnect', () => adminSockets.delete(socket.id));
  } else {
    const sid  = sessionId || socket.id;
    const name = visitorName || 'Guest';
    socket.join(`session:${sid}`);

    ChatMessage.find({ sessionId: sid }).sort({ createdAt: 1 }).limit(50)
      .then(msgs => socket.emit('history', msgs));

    socket.on('client:send', async ({ text, type = 'text', imageUrl }) => {
      if (!text?.trim() && !imageUrl) return;
      const msg = await ChatMessage.create({
        sessionId: sid, sender: 'client', text: text?.trim(), type, imageUrl, visitorName: name,
      });
      io.to(`session:${sid}`).emit('message', msg);
      io.to('admin-room').emit('client:new-message', {
        sessionId: sid, visitorName: name, preview: text?.trim() || 'Image', at: msg.createdAt,
      });
    });
  }
});

app.set('io', io);

// ── Security ──────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
app.use('/api/', limiter);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// ── DB middleware — ensures connection before every request ───────────────────
// Critical for Vercel: each serverless invocation may be a cold start.
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('DB connection failed:', err.message);
    res.status(503).json({ success: false, message: 'Database unavailable. Please try again.' });
  }
});

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/',           (_, res) => res.json({ status: 'NQ Shop API ✅' }));
app.get('/api/health', (_, res) => res.json({ ok: true, env: process.env.NODE_ENV }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/products',   require('./routes/products'));
app.use('/api/orders',     require('./routes/orders'));
app.use('/api/payments',   require('./routes/payments'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/upload',     require('./routes/upload'));
app.use('/api/stats',      require('./routes/stats'));
app.use('/api/chat',       require('./routes/chat'));

// ── SEO ───────────────────────────────────────────────────────────────────────
app.get('/sitemap.xml', require('./controllers/seoController').sitemap);
app.get('/robots.txt',  (_, res) => {
  res.type('text/plain');
  res.send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\nSitemap: ${process.env.CLIENT_URL || ''}/sitemap.xml`);
});

// ── 404 / Error ───────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
connectDB().then(() => {
  server.listen(PORT, () => console.log(`🚀 Server on port ${PORT} (Socket.io enabled)`));
  require('./config/seedAdmin')();
}).catch(err => {
  console.error('❌ DB error:', err.message);
  process.exit(1);
});

module.exports = app;
module.exports = app;