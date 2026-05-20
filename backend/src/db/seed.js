// src/db/seed.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getDb } = require('./database');

async function seed() {
  const db = getDb();
  console.log('🌱 Seeding database...');

  // Demo user
  const userId = crypto.randomUUID();
  const passwordHash = await bcrypt.hash('Demo1234!', 12);

  try {
    db.prepare(`INSERT OR IGNORE INTO users (id, email, password_hash, first_name, last_name, country, verified, kyc_status)
      VALUES (?, ?, ?, ?, ?, ?, 1, 'approved')`
    ).run(userId, 'demo@nextrade.com', passwordHash, 'John', 'Doe', 'AE');
    console.log('✅ Demo user created: demo@nextrade.com / Demo1234!');
  } catch (e) {
    console.log('ℹ️  Demo user already exists');
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@nextrade.com');
    if (existing) {
      seedAccounts(db, existing.id);
      return;
    }
  }

  seedAccounts(db, userId);
}

function seedAccounts(db, userId) {
  // Live account
  const liveAccountId = crypto.randomUUID();
  db.prepare(`INSERT OR IGNORE INTO accounts (id, user_id, account_number, account_type, balance, equity, free_margin, leverage)
    VALUES (?, ?, ?, 'standard', 12450.75, 12983.20, 12663.20, 500)`
  ).run(liveAccountId, userId, '102938475');

  // Demo account
  const demoAccountId = crypto.randomUUID();
  db.prepare(`INSERT OR IGNORE INTO accounts (id, user_id, account_number, account_type, balance, equity, free_margin, leverage, is_demo)
    VALUES (?, ?, ?, 'standard', 100000.00, 100000.00, 100000.00, 500, 1)`
  ).run(demoAccountId, userId, '102938476');

  // Sample open positions on live account
  const positions = [
    { sym: 'EURUSD', dir: 'buy', vol: 0.10, open: 1.08210, curr: 1.08432, sl: 1.07900, tp: 1.09000, pl: 22.20 },
    { sym: 'XAUUSD', dir: 'buy', vol: 0.50, open: 2310.50, curr: 2341.50, sl: 2280.00, tp: 2400.00, pl: 155.00 },
    { sym: 'BTCUSD', dir: 'sell', vol: 0.01, open: 68200, curr: 67450, sl: 69000, tp: 65000, pl: 7.50 },
  ];

  for (const p of positions) {
    db.prepare(`INSERT OR IGNORE INTO positions (id, account_id, symbol, direction, volume, open_price, current_price, stop_loss, take_profit, profit_loss)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), liveAccountId, p.sym, p.dir, p.vol, p.open, p.curr, p.sl, p.tp, p.pl);
  }

  // Sample transactions
  const txns = [
    { type: 'deposit', amount: 10000, method: 'credit_card', ref: 'DEP001' },
    { type: 'deposit', amount: 5000, method: 'bank_wire', ref: 'DEP002' },
    { type: 'profit', amount: 532.45, method: null, ref: 'TRADE001' },
    { type: 'withdrawal', amount: 3000, method: 'credit_card', ref: 'WIT001' },
  ];

  for (const t of txns) {
    db.prepare(`INSERT OR IGNORE INTO transactions (id, account_id, type, amount, payment_method, reference)
      VALUES (?, ?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID(), liveAccountId, t.type, t.amount, t.method, t.ref);
  }

  console.log('✅ Accounts, positions, and transactions seeded');
  console.log('\n📋 Login credentials:');
  console.log('   Email:    demo@nextrade.com');
  console.log('   Password: Demo1234!');
  console.log('\n🚀 Run: npm start');
}

seed().catch(console.error);
