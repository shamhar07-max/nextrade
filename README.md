# NexTrade — Professional Trading Platform

A full-stack, production-ready trading platform inspired by Exness/MetaTrader — featuring live price streaming, candlestick charting, real-time P/L, multi-account support, and a clean dark UI.

---

## 🚀 Quick Deploy (Docker)

```bash
git clone <repo-url> && cd nextrade
./deploy.sh
```

Open **http://localhost** — done.

---

## 🔑 Demo Credentials

| Field    | Value                |
|----------|----------------------|
| Email    | demo@nextrade.com    |
| Password | Demo1234!            |

---

## 🏗 Architecture

```
nextrade/
├── backend/            # Node.js 22 + Express + SQLite + WebSocket
│   ├── src/
│   │   ├── server.js          # Entry point, HTTP + WS server
│   │   ├── db/
│   │   │   ├── database.js    # SQLite init + schema
│   │   │   └── seed.js        # Demo data seeder
│   │   ├── routes/
│   │   │   ├── auth.js        # Register, login, profile
│   │   │   ├── accounts.js    # Account management, deposit, withdraw
│   │   │   ├── trading.js     # Orders, positions, history
│   │   │   └── market.js      # Instruments, prices, candles
│   │   ├── middleware/
│   │   │   └── auth.js        # JWT middleware
│   │   └── services/
│   │       ├── marketData.js  # 30-instrument price simulator
│   │       └── websocket.js   # Real-time price broadcast
│   └── Dockerfile
├── frontend/
│   └── dist/
│       ├── index.html         # SPA shell (all 6 pages)
│       └── assets/
│           ├── style.css      # Dark trading UI theme
│           ├── api.js         # REST client wrapper
│           └── app.js         # Full application logic + canvas chart
├── nginx/
│   └── nginx.conf             # Reverse proxy + rate limiting
├── docker-compose.yml
└── deploy.sh                  # One-click deployment
```

---

## 📦 Stack

| Layer     | Technology |
|-----------|------------|
| Runtime   | Node.js 22 (built-in SQLite, no external DB needed) |
| API       | Express 5, Helmet, Morgan, express-rate-limit |
| Auth      | JWT (jsonwebtoken), bcryptjs |
| Real-time | WebSocket (ws library), REST fallback |
| Frontend  | Vanilla JS + CSS (zero framework, zero build step) |
| Charts    | HTML5 Canvas (custom candlestick renderer) + Chart.js dashboards |
| Proxy     | Nginx 1.25 (rate limiting, gzip, WebSocket upgrade) |
| Deploy    | Docker + Docker Compose |

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Get JWT token |
| GET  | `/api/auth/me` | Current user |
| PUT  | `/api/auth/profile` | Update profile |

### Market
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/market/instruments` | All instruments (filter by `?category=forex`) |
| GET | `/api/market/prices` | Live snapshot of all prices |
| GET | `/api/market/candles/:symbol` | OHLCV candles (`?timeframe=1H&count=120`) |

### Trading
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/api/trading/positions/:accountId` | Open positions |
| POST   | `/api/trading/order` | Place market/limit/stop order |
| DELETE | `/api/trading/position/:id` | Close position |
| PUT    | `/api/trading/position/:id` | Modify SL/TP |
| GET    | `/api/trading/history/:accountId` | Closed trade history + stats |

### Accounts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET  | `/api/accounts` | All accounts for user |
| GET  | `/api/accounts/:id` | Account with live equity |
| POST | `/api/accounts/:id/deposit` | Deposit funds |
| POST | `/api/accounts/:id/withdraw` | Withdraw funds |
| GET  | `/api/accounts/:id/transactions` | Transaction history |

### WebSocket — `ws://host/ws`
```json
// Auth after connect
{ "type": "auth", "token": "<jwt>" }

// Receive: price broadcast every ~1.5s
{ "type": "prices", "data": [...], "timestamp": 1234567890 }

// Ping/pong
{ "type": "ping" }  →  { "type": "pong", "timestamp": ... }
```

---

## ⚙️ Configuration (`backend/.env`)

```env
NODE_ENV=production
PORT=4000
JWT_SECRET=<strong-random-string>     # MUST change for production
JWT_EXPIRES_IN=7d
DB_PATH=./data/nextrade.db
ALLOWED_ORIGINS=https://yourdomain.com
PRICE_UPDATE_INTERVAL=1500            # ms between WS price broadcasts
RATE_LIMIT_MAX=200                    # requests per window per IP
```

---

## 🔒 Production Hardening

1. **Change JWT_SECRET** — generate with `openssl rand -hex 32`
2. **SSL/TLS** — uncomment the HTTPS block in `nginx/nginx.conf`, add certs to `nginx/ssl/`
3. **Domain** — set `DOMAIN=yourdomain.com` in your shell, update `ALLOWED_ORIGINS`
4. **Real market data** — replace `updatePrices()` in `backend/src/services/marketData.js` with a live feed (e.g. Twelve Data, Polygon.io, FXCM streaming API)
5. **Backups** — the SQLite DB lives in the `nextrade_db` Docker volume; back it up with `docker run --rm -v nextrade_db:/data alpine tar czf - /data > backup.tar.gz`

---

## 🖥 Features

- **Terminal** — Candlestick/line chart (canvas), 7 timeframes, MA-20 overlay, volume bars, live price tag
- **Order Panel** — Market / Limit / Stop orders, Buy/Sell toggle, SL/TP, leverage pills (1:50 – 1:2000), real-time margin calculator
- **Positions** — Live P/L updating every second from WebSocket feed, close with one click
- **Markets** — 30 instruments across Forex, Metals, Crypto, Indices, Stocks, Commodities — filterable grid
- **Dashboard** — Equity curve, Asset distribution, Monthly P/L bar chart, Win/Loss ratio (Chart.js)
- **History** — Closed trades with stats (win rate, net P/L, best trade), CSV export
- **Wallet** — Deposit/Withdraw flows (card, bank wire, crypto, e-wallet), transaction history
- **Account** — Profile edit, password change, KYC status, multi-account switcher
- **Keyboard shortcuts** — `B` = quick buy, `S` = quick sell, `Esc` = close modals
