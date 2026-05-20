// src/routes/accounts.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/accounts - list all accounts for user
router.get('/', authenticateToken, (req, res) => {
  const db = getDb();
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? AND is_active = 1').all(req.user.id);
  res.json({ success: true, accounts: accounts.map(formatAccount) });
});

// GET /api/accounts/:id - single account with live equity
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

  // Calculate live equity from open positions
  const positions = db.prepare("SELECT profit_loss FROM positions WHERE account_id = ? AND status = 'open'").all(req.params.id);
  const floatingPL = positions.reduce((sum, p) => sum + p.profit_loss, 0);
  const equity = account.balance + floatingPL;
  const freeMargin = equity - account.margin;
  const marginLevel = account.margin > 0 ? (equity / account.margin) * 100 : 0;

  res.json({ success: true, account: { ...formatAccount(account), equity: +equity.toFixed(2), freeMargin: +freeMargin.toFixed(2), marginLevel: +marginLevel.toFixed(2), floatingPL: +floatingPL.toFixed(2) } });
});

// POST /api/accounts/:id/deposit
router.post('/:id/deposit', authenticateToken, (req, res) => {
  const { amount, method } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

  const db = getDb();
  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

  const txId = uuidv4();
  const ref = 'DEP' + Date.now().toString(36).toUpperCase();

  db.prepare('UPDATE accounts SET balance = balance + ?, free_margin = free_margin + ?, equity = equity + ? WHERE id = ?')
    .run(amount, amount, amount, account.id);
  db.prepare('INSERT INTO transactions (id, account_id, type, amount, payment_method, reference) VALUES (?, ?, \'deposit\', ?, ?, ?)')
    .run(txId, account.id, amount, method || 'card', ref);

  const updated = db.prepare('SELECT * FROM accounts WHERE id = ?').get(account.id);
  res.json({ success: true, message: 'Deposit successful', reference: ref, account: formatAccount(updated) });
});

// POST /api/accounts/:id/withdraw
router.post('/:id/withdraw', authenticateToken, (req, res) => {
  const { amount, method } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

  const db = getDb();
  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
  if (account.free_margin < amount) return res.status(400).json({ success: false, message: 'Insufficient free margin' });

  const ref = 'WIT' + Date.now().toString(36).toUpperCase();
  db.prepare('UPDATE accounts SET balance = balance - ?, free_margin = free_margin - ?, equity = equity - ? WHERE id = ?')
    .run(amount, amount, amount, account.id);
  db.prepare('INSERT INTO transactions (id, account_id, type, amount, payment_method, reference, status) VALUES (?, ?, \'withdrawal\', ?, ?, ?, \'pending\')')
    .run(uuidv4(), account.id, amount, method || 'card', ref);

  res.json({ success: true, message: 'Withdrawal request submitted', reference: ref });
});

// GET /api/accounts/:id/transactions
router.get('/:id/transactions', authenticateToken, (req, res) => {
  const db = getDb();
  const account = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });
  const transactions = db.prepare('SELECT * FROM transactions WHERE account_id = ? ORDER BY created_at DESC LIMIT 100').all(account.id);
  res.json({ success: true, transactions });
});

function formatAccount(a) {
  return {
    id: a.id,
    accountNumber: a.account_number,
    accountType: a.account_type,
    currency: a.currency,
    balance: +a.balance.toFixed(2),
    equity: +a.equity.toFixed(2),
    margin: +a.margin.toFixed(2),
    freeMargin: +a.free_margin.toFixed(2),
    marginLevel: +a.margin_level.toFixed(2),
    leverage: a.leverage,
    swapFree: !!a.swap_free,
    isDemo: !!a.is_demo,
    isActive: !!a.is_active,
    createdAt: a.created_at,
  };
}

module.exports = router;
