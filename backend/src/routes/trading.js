// src/routes/trading.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { getPrice, getInstrument } = require('../services/marketData');

const router = express.Router();

// GET /api/trading/positions/:accountId
router.get('/positions/:accountId', authenticateToken, (req, res) => {
  const db = getDb();
  const account = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(req.params.accountId, req.user.id);
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

  const positions = db.prepare("SELECT * FROM positions WHERE account_id = ? AND status = 'open' ORDER BY opened_at DESC").all(account.id);

  // Update P/L with live prices
  const updated = positions.map(p => {
    const price = getPrice(p.symbol);
    if (price) {
      const inst = getInstrument(p.symbol);
      const currentPrice = p.direction === 'buy' ? price.bid : price.ask;
      const priceDiff = p.direction === 'buy' ? currentPrice - p.open_price : p.open_price - currentPrice;
      const pl = priceDiff * p.volume * (inst?.contractSize || 100000) / (inst?.digits > 3 ? 10000 : 100);
      db.prepare('UPDATE positions SET current_price = ?, profit_loss = ? WHERE id = ?').run(currentPrice, +pl.toFixed(2), p.id);
      return { ...formatPosition(p), currentPrice, profitLoss: +pl.toFixed(2) };
    }
    return formatPosition(p);
  });

  res.json({ success: true, positions: updated });
});

// POST /api/trading/order - place order
router.post('/order', authenticateToken, [
  body('accountId').notEmpty(),
  body('symbol').notEmpty().isLength({ max: 20 }),
  body('direction').isIn(['buy', 'sell']),
  body('volume').isFloat({ min: 0.01, max: 1000 }),
  body('orderType').isIn(['market', 'limit', 'stop']),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  const { accountId, symbol, direction, volume, orderType, stopLoss, takeProfit, limitPrice } = req.body;
  const db = getDb();

  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ? AND is_active = 1').get(accountId, req.user.id);
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

  const inst = getInstrument(symbol);
  if (!inst) return res.status(400).json({ success: false, message: 'Unknown instrument' });

  const price = getPrice(symbol);
  if (!price) return res.status(500).json({ success: false, message: 'Price unavailable' });

  const execPrice = orderType === 'market'
    ? (direction === 'buy' ? price.ask : price.bid)
    : (limitPrice || price.bid);

  // Margin calculation
  const requiredMargin = (volume * inst.contractSize * execPrice) / account.leverage;

  if (account.free_margin < requiredMargin && !account.is_demo) {
    return res.status(400).json({ success: false, message: 'Insufficient margin', required: requiredMargin, available: account.free_margin });
  }

  const posId = uuidv4();
  const status = orderType === 'market' ? 'open' : 'pending';

  db.prepare(`INSERT INTO positions (id, account_id, symbol, direction, volume, open_price, current_price, stop_loss, take_profit, order_type, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(posId, accountId, symbol, direction, volume, execPrice, execPrice, stopLoss || null, takeProfit || null, orderType, status);

  // Deduct margin
  if (status === 'open') {
    db.prepare('UPDATE accounts SET margin = margin + ?, free_margin = free_margin - ? WHERE id = ?')
      .run(requiredMargin, requiredMargin, accountId);
  }

  const position = db.prepare('SELECT * FROM positions WHERE id = ?').get(posId);
  res.status(201).json({ success: true, message: `Order ${status === 'open' ? 'executed' : 'placed'}`, position: formatPosition(position), execPrice });
});

// DELETE /api/trading/position/:id - close position
router.delete('/position/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const position = db.prepare(`
    SELECT p.*, a.user_id, a.leverage FROM positions p
    JOIN accounts a ON p.account_id = a.id
    WHERE p.id = ? AND a.user_id = ? AND p.status = 'open'
  `).get(req.params.id, req.user.id);

  if (!position) return res.status(404).json({ success: false, message: 'Position not found or already closed' });

  const price = getPrice(position.symbol);
  const closePrice = price ? (position.direction === 'buy' ? price.bid : price.ask) : position.current_price;
  const inst = getInstrument(position.symbol);
  const priceDiff = position.direction === 'buy' ? closePrice - position.open_price : position.open_price - closePrice;
  const pl = priceDiff * position.volume * (inst?.contractSize || 100000) / (inst?.digits > 3 ? 10000 : 100);
  const requiredMargin = (position.volume * (inst?.contractSize || 100000) * position.open_price) / (position.leverage || 500);

  db.prepare(`UPDATE positions SET status='closed', close_price=?, profit_loss=?, closed_at=datetime('now'), close_reason='manual' WHERE id=?`)
    .run(closePrice, +pl.toFixed(2), position.id);

  // Return margin and apply P/L to balance
  db.prepare('UPDATE accounts SET margin = MAX(0, margin - ?), free_margin = free_margin + ?, balance = balance + ?, equity = equity + ? WHERE id = ?')
    .run(requiredMargin, requiredMargin + pl, pl, pl, position.account_id);

  // Record transaction
  db.prepare('INSERT INTO transactions (id, account_id, type, amount, reference) VALUES (?, ?, ?, ?, ?)')
    .run(uuidv4(), position.account_id, pl >= 0 ? 'profit' : 'loss', Math.abs(pl), 'POS' + position.id.slice(0, 8).toUpperCase());

  res.json({ success: true, message: 'Position closed', closePrice, profitLoss: +pl.toFixed(2) });
});

// PUT /api/trading/position/:id - modify SL/TP
router.put('/position/:id', authenticateToken, (req, res) => {
  const { stopLoss, takeProfit } = req.body;
  const db = getDb();
  const position = db.prepare(`
    SELECT p.id FROM positions p JOIN accounts a ON p.account_id = a.id
    WHERE p.id = ? AND a.user_id = ? AND p.status = 'open'
  `).get(req.params.id, req.user.id);

  if (!position) return res.status(404).json({ success: false, message: 'Position not found' });
  db.prepare('UPDATE positions SET stop_loss = ?, take_profit = ? WHERE id = ?').run(stopLoss || null, takeProfit || null, req.params.id);
  res.json({ success: true, message: 'Position modified' });
});

// GET /api/trading/history/:accountId
router.get('/history/:accountId', authenticateToken, (req, res) => {
  const db = getDb();
  const account = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(req.params.accountId, req.user.id);
  if (!account) return res.status(404).json({ success: false, message: 'Account not found' });

  const { limit = 50, offset = 0 } = req.query;
  const history = db.prepare("SELECT * FROM positions WHERE account_id = ? AND status = 'closed' ORDER BY closed_at DESC LIMIT ? OFFSET ?")
    .all(account.id, parseInt(limit), parseInt(offset));
  const total = db.prepare("SELECT COUNT(*) as cnt FROM positions WHERE account_id = ? AND status = 'closed'").get(account.id);

  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(profit_loss) as netPL,
      SUM(CASE WHEN profit_loss > 0 THEN 1 ELSE 0 END) as wins,
      SUM(CASE WHEN profit_loss < 0 THEN 1 ELSE 0 END) as losses,
      MAX(profit_loss) as bestTrade,
      MIN(profit_loss) as worstTrade,
      AVG(profit_loss) as avgPL
    FROM positions WHERE account_id = ? AND status = 'closed'
  `).get(account.id);

  res.json({ success: true, history: history.map(formatPosition), total: total.cnt, stats });
});

function formatPosition(p) {
  return {
    id: p.id,
    accountId: p.account_id,
    symbol: p.symbol,
    direction: p.direction,
    volume: p.volume,
    openPrice: p.open_price,
    currentPrice: p.current_price,
    closePrice: p.close_price,
    stopLoss: p.stop_loss,
    takeProfit: p.take_profit,
    swap: p.swap,
    commission: p.commission,
    profitLoss: p.profit_loss,
    status: p.status,
    orderType: p.order_type,
    openedAt: p.opened_at,
    closedAt: p.closed_at,
    closeReason: p.close_reason,
  };
}

module.exports = router;
