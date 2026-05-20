// src/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { getDb } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

// POST /api/auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  body('firstName').trim().isLength({ min: 2, max: 50 }),
  body('lastName').trim().isLength({ min: 2, max: 50 }),
  body('country').optional().isLength({ min: 2, max: 3 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
  }

  const { email, password, firstName, lastName, phone, country } = req.body;
  const db = getDb();

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();
    const liveAccountId = crypto.randomUUID();
    const demoAccountId = crypto.randomUUID();
    const liveAccNum = Math.floor(100000000 + Math.random() * 900000000).toString();
    const demoAccNum = Math.floor(100000000 + Math.random() * 900000000).toString();

    db.prepare(`INSERT INTO users (id, email, password_hash, first_name, last_name, phone, country, verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
    ).run(userId, email, passwordHash, firstName, lastName, phone || null, country || null);

    // Create live + demo accounts automatically
    db.prepare(`INSERT INTO accounts (id, user_id, account_number, account_type, balance, equity, free_margin, is_demo)
      VALUES (?, ?, ?, 'standard', 0, 0, 0, 0)`
    ).run(liveAccountId, userId, liveAccNum);

    db.prepare(`INSERT INTO accounts (id, user_id, account_number, account_type, balance, equity, free_margin, is_demo)
      VALUES (?, ?, ?, 'standard', 100000, 100000, 100000, 1)`
    ).run(demoAccountId, userId, demoAccNum);

    const token = generateToken(userId);
    const user = db.prepare('SELECT id, email, first_name, last_name, country, verified FROM users WHERE id = ?').get(userId);

    res.status(201).json({ success: true, message: 'Account created', token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Invalid credentials format' });

  const { email, password } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ success: false, message: 'Invalid email or password' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ success: false, message: 'Invalid email or password' });

  const token = generateToken(user.id);
  const safeUser = { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, country: user.country, verified: user.verified, kycStatus: user.kyc_status };

  res.json({ success: true, token, user: safeUser });
});

// GET /api/auth/me
router.get('/me', authenticateToken, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, first_name, last_name, phone, country, verified, kyc_status, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, user: { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, phone: user.phone, country: user.country, verified: user.verified, kycStatus: user.kyc_status, createdAt: user.created_at } });
});

// PUT /api/auth/profile
router.put('/profile', authenticateToken, [
  body('firstName').optional().trim().isLength({ min: 2, max: 50 }),
  body('lastName').optional().trim().isLength({ min: 2, max: 50 }),
  body('phone').optional().trim(),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });
  const { firstName, lastName, phone } = req.body;
  const db = getDb();
  db.prepare('UPDATE users SET first_name=COALESCE(?,first_name), last_name=COALESCE(?,last_name), phone=COALESCE(?,phone), updated_at=datetime(\'now\') WHERE id=?')
    .run(firstName || null, lastName || null, phone || null, req.user.id);
  res.json({ success: true, message: 'Profile updated' });
});

// POST /api/auth/change-password
router.post('/change-password', authenticateToken, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) return res.status(401).json({ success: false, message: 'Current password incorrect' });
  const newHash = await bcrypt.hash(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
  res.json({ success: true, message: 'Password changed successfully' });
});

module.exports = router;
