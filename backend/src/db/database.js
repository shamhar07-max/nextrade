// src/db/database.js
// Using built-in SQLite (Node 22+) - no external dependency needed
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(dbDir, 'nextrade.db');

let db;

function getDb() {
  if (!db) {
    db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone TEXT,
      country TEXT,
      verified INTEGER DEFAULT 0,
      kyc_status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      account_number TEXT UNIQUE NOT NULL,
      account_type TEXT DEFAULT 'standard',
      currency TEXT DEFAULT 'USD',
      balance REAL DEFAULT 10000.00,
      equity REAL DEFAULT 10000.00,
      margin REAL DEFAULT 0,
      free_margin REAL DEFAULT 10000.00,
      margin_level REAL DEFAULT 0,
      leverage INTEGER DEFAULT 500,
      swap_free INTEGER DEFAULT 0,
      is_demo INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS positions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      symbol TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('buy','sell')),
      volume REAL NOT NULL,
      open_price REAL NOT NULL,
      current_price REAL NOT NULL,
      stop_loss REAL,
      take_profit REAL,
      swap REAL DEFAULT 0,
      commission REAL DEFAULT 0,
      profit_loss REAL DEFAULT 0,
      status TEXT DEFAULT 'open' CHECK(status IN ('open','closed','pending')),
      order_type TEXT DEFAULT 'market' CHECK(order_type IN ('market','limit','stop')),
      opened_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT,
      close_price REAL,
      close_reason TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      type TEXT NOT NULL CHECK(type IN ('deposit','withdrawal','profit','loss','swap','commission')),
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'USD',
      status TEXT DEFAULT 'completed' CHECK(status IN ('pending','completed','failed','cancelled')),
      payment_method TEXT,
      reference TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS price_alerts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      symbol TEXT NOT NULL,
      condition TEXT NOT NULL CHECK(condition IN ('above','below')),
      price REAL NOT NULL,
      triggered INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_positions_account ON positions(account_id, status);
    CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
  `);
}

module.exports = { getDb };
