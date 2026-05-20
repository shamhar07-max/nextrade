// src/server.js
require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const tradingRoutes = require('./routes/trading');
const marketRoutes = require('./routes/market');
const { initWebSocket } = require('./services/websocket');

const app = express();
const server = http.createServer(app);

// ─── Security & Middleware ─────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*').split(',');
app.use(cors({
  origin: (origin, cb) => cb(null, true), // Allow all in Railway
  credentials: true,
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth/', authLimiter);

// ─── API Routes ────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/trading', tradingRoutes);
app.use('/api/market', marketRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ─── Serve Frontend ────────────────────────────────────────────────────────
const frontendPath = path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
  app.get('/{*path}', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// ─── Error Handler ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || 'Internal server error' });
});

// ─── Auto-seed on first start ──────────────────────────────────────────────
async function autoSeed() {
  try {
    const { getDb } = require('./db/database');
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = { v4: () => crypto.randomUUID() };
    const db = getDb();

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@nextrade.com');
    if (!existing) {
      console.log('🌱 Auto-seeding demo data...');
      const userId = crypto.randomUUID();
      const passwordHash = await bcrypt.hash('Demo1234!', 12);
      db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, first_name, last_name, country, verified, kyc_status) VALUES (?, ?, ?, ?, ?, ?, 1, 'approved')`)
        .run(userId, 'demo@nextrade.com', passwordHash, 'John', 'Doe', 'AE');

      const liveId = crypto.randomUUID();
      const demoId = crypto.randomUUID();
      db.prepare(`INSERT OR IGNORE INTO accounts (id, user_id, account_number, account_type, balance, equity, free_margin, is_demo) VALUES (?, ?, ?, 'standard', 12450.75, 12983.20, 12663.20, 0)`)
        .run(liveId, userId, '102938475');
      db.prepare(`INSERT OR IGNORE INTO accounts (id, user_id, account_number, account_type, balance, equity, free_margin, is_demo) VALUES (?, ?, ?, 'standard', 100000, 100000, 100000, 1)`)
        .run(demoId, userId, '102938476');

      const positions = [
        { sym: 'EURUSD', dir: 'buy', vol: 0.10, open: 1.08210, curr: 1.08432, sl: 1.07900, tp: 1.09000, pl: 22.20 },
        { sym: 'XAUUSD', dir: 'buy', vol: 0.50, open: 2310.50, curr: 2341.50, sl: 2280.00, tp: 2400.00, pl: 155.00 },
      ];
      for (const p of positions) {
        db.prepare(`INSERT OR IGNORE INTO positions (id, account_id, symbol, direction, volume, open_price, current_price, stop_loss, take_profit, profit_loss) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(crypto.randomUUID(), liveId, p.sym, p.dir, p.vol, p.open, p.curr, p.sl, p.tp, p.pl);
      }
      db.prepare(`INSERT OR IGNORE INTO transactions (id, account_id, type, amount, payment_method, reference) VALUES (?, ?, 'deposit', 10000, 'card', 'DEP001')`)
        .run(crypto.randomUUID(), liveId);

      console.log('✅ Demo data seeded — demo@nextrade.com / Demo1234!');
    } else {
      console.log('ℹ️  Demo user already exists');
    }
  } catch (e) {
    console.error('Seed error (non-fatal):', e.message);
  }
}

// ─── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, async () => {
  console.log(`\n🚀 NexTrade API running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  await autoSeed();
});

initWebSocket(server);

module.exports = { app, server };
