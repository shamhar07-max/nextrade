// src/services/marketData.js
// Simulates live market data with realistic price movements
// In production, replace updatePrices() with a real feed (e.g. Twelve Data, Polygon.io, FXCM)

const instruments = [
  // FOREX
  { symbol: 'EURUSD', name: 'Euro / US Dollar', category: 'forex', basePrice: 1.08432, spread: 0.00010, pipValue: 10, contractSize: 100000, digits: 5 },
  { symbol: 'GBPUSD', name: 'British Pound / US Dollar', category: 'forex', basePrice: 1.27105, spread: 0.00020, pipValue: 10, contractSize: 100000, digits: 5 },
  { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen', category: 'forex', basePrice: 149.842, spread: 0.020, pipValue: 6.68, contractSize: 100000, digits: 3 },
  { symbol: 'AUDUSD', name: 'Australian Dollar / USD', category: 'forex', basePrice: 0.65120, spread: 0.00015, pipValue: 10, contractSize: 100000, digits: 5 },
  { symbol: 'USDCAD', name: 'US Dollar / Canadian Dollar', category: 'forex', basePrice: 1.36580, spread: 0.00020, pipValue: 7.33, contractSize: 100000, digits: 5 },
  { symbol: 'EURGBP', name: 'Euro / British Pound', category: 'forex', basePrice: 0.85220, spread: 0.00015, pipValue: 11.74, contractSize: 100000, digits: 5 },
  { symbol: 'NZDUSD', name: 'New Zealand Dollar / USD', category: 'forex', basePrice: 0.59840, spread: 0.00020, pipValue: 10, contractSize: 100000, digits: 5 },
  { symbol: 'USDCHF', name: 'US Dollar / Swiss Franc', category: 'forex', basePrice: 0.89140, spread: 0.00015, pipValue: 11.22, contractSize: 100000, digits: 5 },
  { symbol: 'EURJPY', name: 'Euro / Japanese Yen', category: 'forex', basePrice: 162.340, spread: 0.030, pipValue: 6.68, contractSize: 100000, digits: 3 },
  { symbol: 'GBPJPY', name: 'British Pound / Japanese Yen', category: 'forex', basePrice: 190.820, spread: 0.040, pipValue: 6.68, contractSize: 100000, digits: 3 },
  // METALS
  { symbol: 'XAUUSD', name: 'Gold / US Dollar', category: 'metals', basePrice: 2341.50, spread: 0.30, pipValue: 1, contractSize: 100, digits: 2 },
  { symbol: 'XAGUSD', name: 'Silver / US Dollar', category: 'metals', basePrice: 27.842, spread: 0.030, pipValue: 50, contractSize: 5000, digits: 3 },
  { symbol: 'XPTUSD', name: 'Platinum / US Dollar', category: 'metals', basePrice: 962.30, spread: 2.00, pipValue: 0.50, contractSize: 50, digits: 2 },
  // CRYPTO
  { symbol: 'BTCUSD', name: 'Bitcoin / US Dollar', category: 'crypto', basePrice: 67450.00, spread: 50, pipValue: 1, contractSize: 1, digits: 2 },
  { symbol: 'ETHUSD', name: 'Ethereum / US Dollar', category: 'crypto', basePrice: 3580.20, spread: 5, pipValue: 1, contractSize: 1, digits: 2 },
  { symbol: 'XRPUSD', name: 'Ripple / US Dollar', category: 'crypto', basePrice: 0.5840, spread: 0.002, pipValue: 1, contractSize: 1, digits: 4 },
  { symbol: 'SOLUSD', name: 'Solana / US Dollar', category: 'crypto', basePrice: 175.40, spread: 0.50, pipValue: 1, contractSize: 1, digits: 2 },
  { symbol: 'ADAUSD', name: 'Cardano / US Dollar', category: 'crypto', basePrice: 0.4520, spread: 0.001, pipValue: 1, contractSize: 1, digits: 4 },
  // INDICES
  { symbol: 'US30', name: 'Dow Jones 30', category: 'indices', basePrice: 39248.50, spread: 2, pipValue: 1, contractSize: 1, digits: 2 },
  { symbol: 'SPX500', name: 'S&P 500', category: 'indices', basePrice: 5248.80, spread: 0.50, pipValue: 1, contractSize: 1, digits: 2 },
  { symbol: 'NAS100', name: 'NASDAQ 100', category: 'indices', basePrice: 18340.20, spread: 1, pipValue: 1, contractSize: 1, digits: 2 },
  { symbol: 'GER40', name: 'DAX 40', category: 'indices', basePrice: 18520.30, spread: 1, pipValue: 1, contractSize: 1, digits: 2 },
  { symbol: 'UK100', name: 'FTSE 100', category: 'indices', basePrice: 8240.60, spread: 1, pipValue: 1, contractSize: 1, digits: 2 },
  // STOCKS
  { symbol: 'AAPL', name: 'Apple Inc.', category: 'stocks', basePrice: 189.50, spread: 0.20, pipValue: 1, contractSize: 1, digits: 2 },
  { symbol: 'TSLA', name: 'Tesla Inc.', category: 'stocks', basePrice: 248.30, spread: 0.50, pipValue: 1, contractSize: 1, digits: 2 },
  { symbol: 'MSFT', name: 'Microsoft Corp.', category: 'stocks', basePrice: 420.80, spread: 0.30, pipValue: 1, contractSize: 1, digits: 2 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', category: 'stocks', basePrice: 185.60, spread: 0.30, pipValue: 1, contractSize: 1, digits: 2 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.', category: 'stocks', basePrice: 875.40, spread: 0.80, pipValue: 1, contractSize: 1, digits: 2 },
  // OIL
  { symbol: 'USOIL', name: 'US Crude Oil', category: 'commodities', basePrice: 78.42, spread: 0.04, pipValue: 10, contractSize: 1000, digits: 2 },
  { symbol: 'UKOIL', name: 'UK Brent Oil', category: 'commodities', basePrice: 82.15, spread: 0.05, pipValue: 10, contractSize: 1000, digits: 2 },
];

// Current prices (live)
const prices = {};
instruments.forEach(i => {
  prices[i.symbol] = {
    bid: i.basePrice,
    ask: i.basePrice + i.spread,
    high: i.basePrice * 1.005,
    low: i.basePrice * 0.995,
    change: 0,
    changePct: 0,
    open: i.basePrice,
    volume: Math.floor(Math.random() * 1000000),
    timestamp: Date.now(),
  };
});

// Volatility per category
const volatility = { forex: 0.00025, metals: 0.0015, crypto: 0.008, indices: 0.0008, stocks: 0.0012, commodities: 0.002 };

function updatePrices() {
  instruments.forEach(inst => {
    const vol = volatility[inst.category] || 0.001;
    const move = inst.basePrice * vol * (Math.random() - 0.48); // slight upward bias
    const p = prices[inst.symbol];
    p.bid = Math.max(p.bid + move, inst.basePrice * 0.5);
    p.ask = p.bid + inst.spread;
    p.high = Math.max(p.high, p.bid);
    p.low = Math.min(p.low, p.bid);
    p.change = p.bid - p.open;
    p.changePct = (p.change / p.open) * 100;
    p.volume += Math.floor(Math.random() * 100);
    p.timestamp = Date.now();
  });
}

function getPrice(symbol) {
  return prices[symbol] || null;
}

function getAllPrices() {
  return Object.entries(prices).map(([symbol, p]) => {
    const inst = instruments.find(i => i.symbol === symbol);
    return { symbol, ...inst, ...p };
  });
}

function getInstrument(symbol) {
  return instruments.find(i => i.symbol === symbol) || null;
}

function getAllInstruments() {
  return instruments.map(i => ({ ...i, ...prices[i.symbol] }));
}

// OHLC candle history generator (simulated)
function getCandleHistory(symbol, timeframe = '1H', count = 100) {
  const inst = instruments.find(i => i.symbol === symbol);
  if (!inst) return [];
  const vol = volatility[inst.category] || 0.001;
  const candles = [];
  let price = inst.basePrice;
  const now = Date.now();
  const tfMs = { '1M': 60000, '5M': 300000, '15M': 900000, '1H': 3600000, '4H': 14400000, '1D': 86400000, '1W': 604800000 };
  const interval = tfMs[timeframe] || 3600000;

  for (let i = count; i >= 0; i--) {
    const o = price;
    const move = price * vol * 3 * (Math.random() - 0.48);
    const c = Math.max(o + move, inst.basePrice * 0.3);
    const h = Math.max(o, c) + Math.abs(price * vol * Math.random());
    const l = Math.min(o, c) - Math.abs(price * vol * Math.random());
    const v = Math.floor(50000 + Math.random() * 500000);
    candles.push({ time: now - i * interval, open: +o.toFixed(inst.digits), high: +h.toFixed(inst.digits), low: +l.toFixed(inst.digits), close: +c.toFixed(inst.digits), volume: v });
    price = c;
  }
  return candles;
}

module.exports = { updatePrices, getPrice, getAllPrices, getInstrument, getAllInstruments, getCandleHistory, instruments };
