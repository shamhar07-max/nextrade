// src/routes/market.js
const express = require('express');
const { getAllInstruments, getPrice, getCandleHistory, getAllPrices } = require('../services/marketData');

const router = express.Router();

// GET /api/market/instruments
router.get('/instruments', (req, res) => {
  const { category } = req.query;
  let instruments = getAllInstruments();
  if (category && category !== 'all') {
    instruments = instruments.filter(i => i.category === category);
  }
  res.json({ success: true, instruments });
});

// GET /api/market/prices
router.get('/prices', (req, res) => {
  res.json({ success: true, prices: getAllPrices(), timestamp: Date.now() });
});

// GET /api/market/price/:symbol
router.get('/price/:symbol', (req, res) => {
  const price = getPrice(req.params.symbol.toUpperCase());
  if (!price) return res.status(404).json({ success: false, message: 'Symbol not found' });
  res.json({ success: true, symbol: req.params.symbol.toUpperCase(), ...price });
});

// GET /api/market/candles/:symbol
router.get('/candles/:symbol', (req, res) => {
  const { timeframe = '1H', count = 100 } = req.query;
  const candles = getCandleHistory(req.params.symbol.toUpperCase(), timeframe, Math.min(parseInt(count), 500));
  if (!candles.length) return res.status(404).json({ success: false, message: 'Symbol not found' });
  res.json({ success: true, symbol: req.params.symbol.toUpperCase(), timeframe, candles });
});

module.exports = router;
