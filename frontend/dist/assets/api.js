// assets/api.js - NexTrade API Client
const API_BASE = window.location.origin + '/api';

class NexTradeAPI {
  constructor() {
    this.token = localStorage.getItem('nt_token');
  }

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('nt_token', token);
    else localStorage.removeItem('nt_token');
  }

  async request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (this.token) opts.headers['Authorization'] = `Bearer ${this.token}`;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(API_BASE + path, opts);
    const data = await res.json();
    if (!res.ok) throw { status: res.status, ...data };
    return data;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  delete(path) { return this.request('DELETE', path); }

  // Auth
  login(email, password) { return this.post('/auth/login', { email, password }); }
  register(data) { return this.post('/auth/register', data); }
  getMe() { return this.get('/auth/me'); }
  updateProfile(data) { return this.put('/auth/profile', data); }

  // Accounts
  getAccounts() { return this.get('/accounts'); }
  getAccount(id) { return this.get(`/accounts/${id}`); }
  deposit(id, amount, method) { return this.post(`/accounts/${id}/deposit`, { amount, method }); }
  withdraw(id, amount, method) { return this.post(`/accounts/${id}/withdraw`, { amount, method }); }
  getTransactions(id) { return this.get(`/accounts/${id}/transactions`); }

  // Trading
  getPositions(accountId) { return this.get(`/trading/positions/${accountId}`); }
  placeOrder(data) { return this.post('/trading/order', data); }
  closePosition(id) { return this.delete(`/trading/position/${id}`); }
  modifyPosition(id, data) { return this.put(`/trading/position/${id}`, data); }
  getHistory(accountId, limit = 50) { return this.get(`/trading/history/${accountId}?limit=${limit}`); }

  // Market
  getInstruments(category = 'all') { return this.get(`/market/instruments?category=${category}`); }
  getPrices() { return this.get('/market/prices'); }
  getCandles(symbol, timeframe = '1H', count = 120) { return this.get(`/market/candles/${symbol}?timeframe=${timeframe}&count=${count}`); }
}

window.api = new NexTradeAPI();
