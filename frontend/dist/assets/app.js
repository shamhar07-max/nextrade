// NexTrade — Main Application Logic
'use strict';

// ─── STATE ─────────────────────────────────────────────────────────────────
const state = {
  user: null,
  accounts: [],
  activeAccount: null,
  positions: [],
  instruments: [],
  prices: {},
  currentSymbol: 'EURUSD',
  direction: 'buy',
  orderType: 'market',
  leverage: 500,
  timeframe: '4H',
  chartType: 'candle',
  candleData: [],
  ws: null,
  dashChartsInit: false,
  selectedDepositMethod: 'card',
  selectedWithdrawMethod: 'card',
  histFilter: 'all',
};

// ─── INIT ──────────────────────────────────────────────────────────────────
async function init() {
  animateLoader();
  const token = localStorage.getItem('nt_token');
  if (!token) {
    hideLoader();
    return;
  }
  try {
    const { user } = await api.getMe();
    state.user = user;
    await bootApp();
  } catch {
    localStorage.removeItem('nt_token');
    api.setToken(null);
    hideLoader();
  }
}

function animateLoader() {
  let p = 0;
  const fill = document.getElementById('loaderFill');
  const iv = setInterval(() => {
    p += Math.random() * 15;
    if (p > 90) { clearInterval(iv); return; }
    fill.style.width = p + '%';
  }, 200);
}

function hideLoader() {
  const loader = document.getElementById('pageLoader');
  document.getElementById('loaderFill').style.width = '100%';
  setTimeout(() => loader.classList.add('hidden'), 400);
}

async function bootApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');

  setUserUI();
  await loadAccounts();
  await loadInstruments();
  connectWebSocket();
  startPositionRefresh();
  renderWatchlist();
  buildTicker();
  navigate('terminal', document.querySelector('[data-page=terminal]'));
  hideLoader();
}

function setUserUI() {
  const u = state.user;
  const initials = ((u.firstName||'?')[0] + (u.lastName||'?')[0]).toUpperCase();
  document.getElementById('tb-avatar').textContent = initials;
  document.getElementById('sfUser').textContent = u.email;
  document.getElementById('apc-avatar').textContent = initials;
  document.getElementById('apc-name').textContent = `${u.firstName} ${u.lastName}`;
  document.getElementById('apc-email').textContent = u.email;
  document.getElementById('pf-first').value = u.firstName || '';
  document.getElementById('pf-last').value = u.lastName || '';
  document.getElementById('pf-email').value = u.email || '';
  document.getElementById('pf-phone').value = u.phone || '';
}

// ─── ACCOUNTS ──────────────────────────────────────────────────────────────
async function loadAccounts() {
  try {
    const { accounts } = await api.getAccounts();
    state.accounts = accounts;
    const sel = document.getElementById('accountSelect');
    sel.innerHTML = accounts.map(a =>
      `<option value="${a.id}">${a.isDemo ? '🎯 Demo' : '💼 Live'} — ${a.accountNumber}</option>`
    ).join('');
    if (accounts.length) await switchAccount(accounts[0].id, false);
  } catch (e) { console.error('Load accounts error', e); }
}

async function switchAccount(id, reload = true) {
  try {
    const { account } = await api.getAccount(id);
    state.activeAccount = account;
    updateSidebarSummary(account);
    document.getElementById('wh-amount').textContent = '$' + account.balance.toLocaleString('en-US', { minimumFractionDigits: 2 });
    if (reload) await refreshPositions();
    renderAccountsList();
  } catch (e) { console.error('Switch account error', e); }
}

function updateSidebarSummary(acc) {
  const fmt = v => '$' + (v||0).toLocaleString('en-US', { minimumFractionDigits: 2 });
  document.getElementById('ss-balance').textContent = fmt(acc.balance);
  document.getElementById('ss-equity').textContent = fmt(acc.equity || acc.balance);
  document.getElementById('ss-margin').textContent = fmt(acc.margin);
  document.getElementById('ss-free').textContent = fmt(acc.freeMargin || acc.balance);
  const lvl = acc.marginLevel || 0;
  const lvlEl = document.getElementById('ss-level');
  lvlEl.textContent = lvl > 0 ? lvl.toFixed(0) + '%' : '∞';
  lvlEl.className = 'ss-val ' + (lvl > 200 ? 'green' : lvl > 100 ? 'gold' : 'red');
}

// ─── INSTRUMENTS & PRICES ──────────────────────────────────────────────────
async function loadInstruments() {
  try {
    const { instruments } = await api.getInstruments();
    state.instruments = instruments;
    document.getElementById('nav-markets-badge').textContent = instruments.length;
    buildOrderSymbolSelect();
    instruments.forEach(i => { state.prices[i.symbol] = { bid: i.bid || i.basePrice, ask: i.ask || i.basePrice, ...i }; });
    renderMarkets();
    selectSymbol(state.currentSymbol);
  } catch (e) { console.error('Load instruments error', e); }
}

function buildOrderSymbolSelect() {
  const sel = document.getElementById('orderSymbol');
  const cats = ['forex','metals','crypto','indices','stocks','commodities'];
  sel.innerHTML = cats.map(cat => {
    const items = state.instruments.filter(i => i.category === cat);
    if (!items.length) return '';
    return `<optgroup label="${cat.toUpperCase()}">${items.map(i => `<option value="${i.symbol}" ${i.symbol === state.currentSymbol ? 'selected' : ''}>${i.symbol} — ${i.name}</option>`).join('')}</optgroup>`;
  }).join('');
}

// ─── WEBSOCKET ──────────────────────────────────────────────────────────────
function connectWebSocket() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${location.host}/ws`;
  try {
    state.ws = new WebSocket(wsUrl);
    state.ws.onopen = () => {
      if (api.token) state.ws.send(JSON.stringify({ type: 'auth', token: api.token }));
    };
    state.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'prices') handlePriceUpdate(msg.data);
      } catch (_) {}
    };
    state.ws.onclose = () => setTimeout(connectWebSocket, 3000);
    state.ws.onerror = () => state.ws.close();
  } catch (_) {
    // Fallback: poll REST API
    setInterval(async () => {
      try {
        const { prices } = await api.getPrices();
        handlePriceUpdate(prices);
      } catch (_) {}
    }, 2000);
  }
}

function handlePriceUpdate(data) {
  const prevPrice = state.prices[state.currentSymbol];
  data.forEach(item => { state.prices[item.symbol] = item; });
  updateTopbar();
  updateOrderPrices();
  updatePositionsPL();
  renderWatchlist();
  buildTicker();
  updateChart();
}

// ─── TOPBAR ────────────────────────────────────────────────────────────────
function updateTopbar() {
  const p = state.prices[state.currentSymbol];
  if (!p) return;
  const priceEl = document.getElementById('tb-price');
  const prevVal = parseFloat(priceEl.textContent.replace(/,/g, ''));
  const newVal = p.bid || p.price;
  priceEl.textContent = formatPrice(state.currentSymbol, newVal);
  if (newVal > prevVal) { priceEl.className = 'tb-price flash-up'; }
  else if (newVal < prevVal) { priceEl.className = 'tb-price flash-dn'; }
  setTimeout(() => priceEl.className = 'tb-price', 350);

  const chgEl = document.getElementById('tb-change');
  const chg = p.changePct || p.change || 0;
  const isUp = chg >= 0;
  chgEl.textContent = `${isUp ? '+' : ''}${chg.toFixed(2)}%`;
  chgEl.className = `tb-change ${isUp ? 'up' : 'dn'}`;

  document.getElementById('tbs-spread').textContent = p.spread != null ? p.spread : '—';
  document.getElementById('tbs-high').textContent = p.high ? formatPrice(state.currentSymbol, p.high) : '—';
  document.getElementById('tbs-low').textContent = p.low ? formatPrice(state.currentSymbol, p.low) : '—';
  document.getElementById('tbs-vol').textContent = p.volume ? fmtVol(p.volume) : '—';
}

function fmtVol(v) {
  if (v >= 1e9) return (v/1e9).toFixed(1)+'B';
  if (v >= 1e6) return (v/1e6).toFixed(1)+'M';
  if (v >= 1e3) return (v/1e3).toFixed(1)+'K';
  return v.toString();
}

// ─── SYMBOL SELECTION ──────────────────────────────────────────────────────
function selectSymbol(symbol) {
  state.currentSymbol = symbol;
  state.candleData = [];
  document.getElementById('tb-symbol').textContent = symbol.replace('USD', '/USD').replace('EUR/', 'EUR/');
  document.getElementById('chart-sym').textContent = symbol;
  document.getElementById('orderSymbol').value = symbol;
  updateTopbar();
  updateOrderPrices();
  loadCandleData();
  document.querySelectorAll('.wl-item').forEach(el => el.classList.toggle('active', el.dataset.sym === symbol));
}

async function loadCandleData() {
  try {
    const { candles } = await api.getCandles(state.currentSymbol, state.timeframe, 120);
    state.candleData = candles;
    drawChart();
    updateChartOHLC(candles[candles.length - 1]);
  } catch (_) {}
}

function onSymbolChange(symbol) { selectSymbol(symbol); }

// ─── WATCHLIST ─────────────────────────────────────────────────────────────
function renderWatchlist(filter = '') {
  const el = document.getElementById('watchlistEl');
  const list = filter
    ? state.instruments.filter(i => i.symbol.toLowerCase().includes(filter.toLowerCase()) || i.name.toLowerCase().includes(filter.toLowerCase()))
    : state.instruments;
  el.innerHTML = list.slice(0, 30).map(i => {
    const p = state.prices[i.symbol] || {};
    const bid = p.bid || i.basePrice || 0;
    const chg = p.changePct || 0;
    const isUp = chg >= 0;
    return `<div class="wl-item ${i.symbol === state.currentSymbol ? 'active' : ''}" data-sym="${i.symbol}" onclick="selectSymbol('${i.symbol}')">
      <div class="wl-dot ${isUp ? 'up' : 'down'}"></div>
      <div class="wl-sym">${i.symbol}</div>
      <div class="wl-price">${formatPrice(i.symbol, bid)}</div>
      <div class="wl-chg ${isUp ? 'up' : 'down'}">${isUp ? '+' : ''}${chg.toFixed(2)}%</div>
    </div>`;
  }).join('');
}

function filterWatchlist(v) { renderWatchlist(v); }

// ─── TICKER ────────────────────────────────────────────────────────────────
function buildTicker() {
  const items = [...state.instruments, ...state.instruments].map(i => {
    const p = state.prices[i.symbol] || {};
    const price = p.bid || i.basePrice || 0;
    const chg = p.changePct || 0;
    return `<span class="ticker-item">
      <span class="ticker-sym">${i.symbol}</span>
      <span class="ticker-price">${formatPrice(i.symbol, price)}</span>
      <span class="${chg >= 0 ? 'up' : 'dn'}">${chg >= 0 ? '▲' : '▼'}${Math.abs(chg).toFixed(2)}%</span>
    </span>`;
  }).join('');
  document.getElementById('tickerInner').innerHTML = items;
}

// ─── MARKETS PAGE ──────────────────────────────────────────────────────────
function renderMarkets(filter = 'all') {
  const grid = document.getElementById('marketsGrid');
  const shown = filter === 'all' ? state.instruments : state.instruments.filter(i => i.category === filter);
  grid.innerHTML = shown.map(i => {
    const p = state.prices[i.symbol] || {};
    const price = p.bid || i.basePrice || 0;
    const chg = p.changePct || 0;
    const isUp = chg >= 0;
    return `<div class="mkt-card" onclick="selectSymbol('${i.symbol}');navigate('terminal',document.querySelector('[data-page=terminal]'))">
      <div class="mc-sym">${i.symbol}</div>
      <div class="mc-name">${i.name}</div>
      <div class="mc-price">${formatPrice(i.symbol, price)}</div>
      <div class="mc-change ${isUp ? 'up' : 'dn'}">${isUp ? '+' : ''}${chg.toFixed(2)}%</div>
      <div class="mc-spread">Spread: ${i.spread || '—'}</div>
    </div>`;
  }).join('');
}

function filterMkt(filter, btn) {
  document.querySelectorAll('.mf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderMarkets(filter);
}

// ─── POSITIONS ──────────────────────────────────────────────────────────────
async function refreshPositions() {
  if (!state.activeAccount) return;
  try {
    const { positions } = await api.getPositions(state.activeAccount.id);
    state.positions = positions;
    renderPositions();
    updateFloatingPL();
  } catch (_) {}
}

function startPositionRefresh() {
  setInterval(refreshPositions, 5000);
}

function renderPositions() {
  const tbody = document.getElementById('positionsBody');
  const empty = document.getElementById('posEmpty');
  const badge = document.getElementById('openPosBadge');
  const open = state.positions.filter(p => p.status === 'open');
  badge.textContent = open.length;
  if (!open.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = open.map((p, i) => {
    const pl = p.profitLoss || 0;
    const isUp = pl >= 0;
    const t = new Date(p.openedAt).toLocaleTimeString();
    return `<tr>
      <td>#${i + 1}</td>
      <td class="sym-cell">${p.symbol}</td>
      <td class="${p.direction === 'buy' ? 'dir-buy' : 'dir-sell'}">${p.direction.toUpperCase()}</td>
      <td>${p.volume.toFixed(2)}</td>
      <td>${formatPrice(p.symbol, p.openPrice)}</td>
      <td>${formatPrice(p.symbol, p.currentPrice || p.openPrice)}</td>
      <td>${p.stopLoss ? formatPrice(p.symbol, p.stopLoss) : '—'}</td>
      <td>${p.takeProfit ? formatPrice(p.symbol, p.takeProfit) : '—'}</td>
      <td class="${p.swap >= 0 ? 'pl-pos' : 'pl-neg'}">${(p.swap || 0).toFixed(2)}</td>
      <td class="${isUp ? 'pl-pos' : 'pl-neg'}">${isUp ? '+' : ''}$${pl.toFixed(2)}</td>
      <td>${t}</td>
      <td><button class="tbl-action" onclick="closePosition('${p.id}')">Close</button></td>
    </tr>`;
  }).join('');
}

function updatePositionsPL() {
  // Live price updates for open positions
  state.positions.forEach(p => {
    if (p.status !== 'open') return;
    const price = state.prices[p.symbol];
    if (!price) return;
    const inst = state.instruments.find(i => i.symbol === p.symbol);
    const curr = p.direction === 'buy' ? price.bid : price.ask;
    const diff = p.direction === 'buy' ? curr - p.openPrice : p.openPrice - curr;
    const cs = inst?.contractSize || 100000;
    p.currentPrice = curr;
    p.profitLoss = +(diff * p.volume * cs / (inst?.digits > 3 ? 10000 : 100)).toFixed(2);
  });
  renderPositions();
  updateFloatingPL();
}

function updateFloatingPL() {
  const open = state.positions.filter(p => p.status === 'open');
  const total = open.reduce((s, p) => s + (p.profitLoss || 0), 0);
  const el = document.getElementById('op-floating');
  if (el) { el.textContent = `${total >= 0 ? '+' : ''}$${total.toFixed(2)}`; el.className = 'mb-val ' + (total >= 0 ? 'green' : 'red'); }
  const cnt = document.getElementById('op-count');
  if (cnt) cnt.textContent = open.length;
}

// ─── TRADING ───────────────────────────────────────────────────────────────
function setDirection(d) {
  state.direction = d;
  document.getElementById('dirBuy').classList.toggle('active', d === 'buy');
  document.getElementById('dirSell').classList.toggle('active', d === 'sell');
  const btn = document.getElementById('placeBtn');
  const ot = state.orderType === 'market' ? 'Market' : state.orderType === 'limit' ? 'Limit' : 'Stop';
  btn.textContent = `${d === 'buy' ? 'Buy' : 'Sell'} ${ot}`;
  btn.className = 'btn-place' + (d === 'sell' ? ' sell-mode' : '');
}

function setOrderType(type, el) {
  state.orderType = type;
  document.querySelectorAll('.op-tab').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('limitPriceField').style.display = type !== 'market' ? '' : 'none';
  setDirection(state.direction);
}

function setLev(el, lev) {
  state.leverage = lev;
  document.querySelectorAll('.lev-pill').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  updateMarginCalc();
}

function adjustVol(delta) {
  const inp = document.getElementById('volInput');
  inp.value = Math.max(0.01, (parseFloat(inp.value) || 0.01) + delta).toFixed(2);
  updateMarginCalc();
}

function updateMarginCalc() {
  const p = state.prices[state.currentSymbol];
  const inst = state.instruments.find(i => i.symbol === state.currentSymbol);
  const vol = parseFloat(document.getElementById('volInput').value) || 0.01;
  if (!p || !inst) return;
  const price = p.bid || inst.basePrice;
  const cs = inst.contractSize || 100000;
  const margin = (vol * cs * price) / state.leverage;
  const pipVal = (vol * cs * 0.0001);
  const spreadCost = (inst.spread || 0) * vol * (cs / 10000);
  document.getElementById('reqMargin').textContent = '$' + margin.toFixed(2);
  document.getElementById('pipVal').textContent = '$' + pipVal.toFixed(2);
  document.getElementById('spreadCost').textContent = '$' + spreadCost.toFixed(2);
}

function updateOrderPrices() {
  const p = state.prices[state.currentSymbol];
  if (!p) return;
  document.getElementById('askPrice').textContent = formatPrice(state.currentSymbol, p.ask || (p.bid || 0) + (p.spread || 0));
  document.getElementById('bidPrice').textContent = formatPrice(state.currentSymbol, p.bid || 0);
  updateMarginCalc();
}

async function placeOrder() {
  if (!state.activeAccount) return showToast('error', 'No Account', 'Select an account first');
  const vol = parseFloat(document.getElementById('volInput').value);
  const sl = parseFloat(document.getElementById('slInput').value) || null;
  const tp = parseFloat(document.getElementById('tpInput').value) || null;
  const limitPrice = parseFloat(document.getElementById('limitPriceInput').value) || null;
  if (isNaN(vol) || vol <= 0) return showToast('error', 'Invalid Volume', 'Enter a valid lot size');

  const btn = document.getElementById('placeBtn');
  btn.disabled = true;
  btn.textContent = 'Placing…';

  try {
    const { position, execPrice } = await api.placeOrder({
      accountId: state.activeAccount.id,
      symbol: state.currentSymbol,
      direction: state.direction,
      volume: vol,
      orderType: state.orderType,
      stopLoss: sl,
      takeProfit: tp,
      limitPrice,
    });
    showToast('success', 'Order Executed', `${state.direction.toUpperCase()} ${vol.toFixed(2)} ${state.currentSymbol} @ ${formatPrice(state.currentSymbol, execPrice)}`);
    await refreshPositions();
    await switchAccount(state.activeAccount.id);
  } catch (e) {
    showToast('error', 'Order Failed', e.message || 'Could not place order');
  } finally {
    btn.disabled = false;
    setDirection(state.direction);
  }
}

function quickOrder(dir) {
  setDirection(dir);
  placeOrder();
}

async function closePosition(id) {
  try {
    const { closePrice, profitLoss } = await api.closePosition(id);
    showToast('success', 'Position Closed', `P/L: ${profitLoss >= 0 ? '+' : ''}$${profitLoss.toFixed(2)}`);
    await refreshPositions();
    await switchAccount(state.activeAccount.id);
  } catch (e) {
    showToast('error', 'Close Failed', e.message || 'Could not close position');
  }
}

// ─── HISTORY ───────────────────────────────────────────────────────────────
async function loadHistory() {
  if (!state.activeAccount) return;
  try {
    const { history, stats } = await api.getHistory(state.activeAccount.id, 100);
    renderHistory(history);
    renderHistorySummary(stats);
  } catch (_) {}
}

function renderHistory(rows) {
  const tbody = document.getElementById('historyBody');
  const empty = document.getElementById('histEmpty');
  if (!rows.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  tbody.innerHTML = rows.map(p => {
    const pl = p.profitLoss || 0;
    const isUp = pl >= 0;
    const t = new Date(p.closedAt).toLocaleString();
    return `<tr>
      <td>${t}</td>
      <td class="sym-cell">${p.symbol}</td>
      <td class="${p.direction === 'buy' ? 'dir-buy' : 'dir-sell'}">${p.direction.toUpperCase()}</td>
      <td>${p.volume.toFixed(2)}</td>
      <td>${formatPrice(p.symbol, p.openPrice)}</td>
      <td>${formatPrice(p.symbol, p.closePrice || 0)}</td>
      <td>${p.stopLoss ? formatPrice(p.symbol, p.stopLoss) : '—'}</td>
      <td>${p.takeProfit ? formatPrice(p.symbol, p.takeProfit) : '—'}</td>
      <td class="${isUp ? 'pl-pos' : 'pl-neg'}">${isUp ? '+' : ''}$${pl.toFixed(2)}</td>
    </tr>`;
  }).join('');
}

function renderHistorySummary(stats) {
  if (!stats) return;
  const container = document.getElementById('histSummary');
  const wr = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(1) : '0.0';
  container.innerHTML = [
    { l: 'Total Trades', v: stats.total || 0 },
    { l: 'Net P/L', v: `${(stats.netPL||0) >= 0 ? '+' : ''}$${(stats.netPL||0).toFixed(2)}`, cl: (stats.netPL||0) >= 0 ? 'green' : 'red' },
    { l: 'Win Rate', v: `${wr}%`, cl: parseFloat(wr) >= 50 ? 'green' : 'red' },
    { l: 'Best Trade', v: `+$${(stats.bestTrade||0).toFixed(2)}`, cl: 'green' },
  ].map(k => `<div class="hs-card"><div class="kpi-label">${k.l}</div><div class="kpi-val ${k.cl||''}">${k.v}</div></div>`).join('');
}

function setHistFilter(f, btn) {
  document.querySelectorAll('.hist-filters .mf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadHistory();
}

function exportCSV() {
  const rows = [['Closed','Symbol','Dir','Volume','Open','Close','P/L']];
  document.querySelectorAll('#historyBody tr').forEach(tr => {
    rows.push([...tr.querySelectorAll('td')].map(td => td.textContent.trim()));
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download = 'nextrade_history.csv';
  a.click();
}

// ─── WALLET ────────────────────────────────────────────────────────────────
async function loadTransactions() {
  if (!state.activeAccount) return;
  try {
    const { transactions } = await api.getTransactions(state.activeAccount.id);
    const tbody = document.getElementById('txnBody');
    const statusColors = { completed: 'green', pending: 'gold', failed: 'red', cancelled: 'red' };
    tbody.innerHTML = transactions.map(t => `<tr>
      <td>${new Date(t.created_at).toLocaleString()}</td>
      <td class="sym-cell" style="text-transform:capitalize">${t.type}</td>
      <td class="${t.type === 'withdrawal' || t.type === 'loss' ? 'pl-neg' : 'pl-pos'}">${t.type === 'withdrawal' ? '-' : '+'}$${t.amount.toFixed(2)}</td>
      <td>${t.payment_method || '—'}</td>
      <td style="font-family:'DM Mono',monospace;font-size:11px">${t.reference || '—'}</td>
      <td class="${statusColors[t.status] || ''}" style="text-transform:capitalize">${t.status}</td>
    </tr>`).join('');
  } catch (_) {}
}

// ─── DEPOSIT / WITHDRAW ────────────────────────────────────────────────────
async function doDeposit() {
  const amount = parseFloat(document.getElementById('dep-amount').value);
  if (!amount || amount < 10) return showToast('error', 'Invalid Amount', 'Minimum deposit is $10');
  try {
    await api.deposit(state.activeAccount.id, amount, state.selectedDepositMethod);
    closeModal('depositModal');
    showToast('success', 'Deposit Successful', `$${amount.toLocaleString()} added to your account`);
    await switchAccount(state.activeAccount.id);
  } catch (e) {
    showToast('error', 'Deposit Failed', e.message || 'Could not process deposit');
  }
}

async function doWithdraw() {
  const amount = parseFloat(document.getElementById('wth-amount').value);
  if (!amount || amount < 10) return showToast('error', 'Invalid Amount', 'Minimum withdrawal is $10');
  try {
    await api.withdraw(state.activeAccount.id, amount, state.selectedWithdrawMethod);
    closeModal('withdrawModal');
    showToast('success', 'Withdrawal Requested', `$${amount.toLocaleString()} — processing now`);
    await switchAccount(state.activeAccount.id);
  } catch (e) {
    showToast('error', 'Withdrawal Failed', e.message || e.message);
  }
}

function selectMethod(el, method) {
  el.closest('.modal-methods').querySelectorAll('.mm-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
  if (el.closest('#depositModal')) state.selectedDepositMethod = method;
  else state.selectedWithdrawMethod = method;
}

function setAmt(inputId, val) { document.getElementById(inputId).value = val; }

// ─── ACCOUNT SETTINGS ──────────────────────────────────────────────────────
async function saveProfile() {
  const data = { firstName: document.getElementById('pf-first').value, lastName: document.getElementById('pf-last').value, phone: document.getElementById('pf-phone').value };
  try {
    await api.updateProfile(data);
    showToast('success', 'Profile Updated', 'Your changes have been saved');
  } catch (e) { showToast('error', 'Update Failed', e.message); }
}

async function changePassword() {
  const curr = document.getElementById('sec-curr').value;
  const nw = document.getElementById('sec-new').value;
  const conf = document.getElementById('sec-confirm').value;
  if (nw !== conf) return showToast('error', 'Passwords Mismatch', 'New passwords do not match');
  if (nw.length < 8) return showToast('error', 'Password Too Short', 'Min 8 characters required');
  try {
    await api.post('/auth/change-password', { currentPassword: curr, newPassword: nw });
    showToast('success', 'Password Changed', 'Your password has been updated');
    ['sec-curr', 'sec-new', 'sec-confirm'].forEach(id => document.getElementById(id).value = '');
  } catch (e) { showToast('error', 'Change Failed', e.message); }
}

function renderAccountsList() {
  const el = document.getElementById('accAccountsList');
  if (!el) return;
  el.innerHTML = state.accounts.map(a => `
    <div class="acc-acc-item">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div>
          <div style="font-weight:600;font-size:13px">${a.isDemo ? '🎯 Demo' : '💼 Live'} Account</div>
          <div style="font-size:11px;color:var(--text3);font-family:'DM Mono',monospace">#${a.accountNumber}</div>
        </div>
        <div style="text-align:right">
          <div style="font-family:'DM Mono',monospace;font-size:14px;color:var(--text)">$${(a.balance||0).toLocaleString('en-US', {minimumFractionDigits:2})}</div>
          <div style="font-size:11px;color:var(--text3)">Lev 1:${a.leverage}</div>
        </div>
      </div>
    </div>
  `).join('');
}

// ─── DASHBOARD ──────────────────────────────────────────────────────────────
async function loadDashboard() {
  if (!state.activeAccount) return;
  renderDashKPIs();
  if (!state.dashChartsInit) {
    state.dashChartsInit = true;
    initDashCharts();
  }
  renderTopInstruments();
}

function renderDashKPIs() {
  const acc = state.activeAccount;
  if (!acc) return;
  const open = state.positions.filter(p => p.status === 'open');
  const floatPL = open.reduce((s, p) => s + (p.profitLoss || 0), 0);
  const container = document.getElementById('dashKPIs');
  container.innerHTML = [
    { l: 'Account Balance', v: '$' + (acc.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) },
    { l: 'Floating P/L', v: `${floatPL >= 0 ? '+' : ''}$${floatPL.toFixed(2)}`, cl: floatPL >= 0 ? 'green' : 'red' },
    { l: 'Free Margin', v: '$' + (acc.freeMargin || acc.balance || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }), cl: 'gold' },
    { l: 'Margin Level', v: acc.marginLevel > 0 ? acc.marginLevel.toFixed(0) + '%' : '∞', cl: 'green' },
  ].map(k => `<div class="kpi-card"><div class="kpi-label">${k.l}</div><div class="kpi-val ${k.cl || ''}">${k.v}</div></div>`).join('');
}

function initDashCharts() {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const equity = [10000,10200,10150,10600,10450,11000,11200,10800,11400,12100,12300,12450];
  new Chart(document.getElementById('equityChart'), {
    type: 'line',
    data: { labels: months, datasets: [{ data: equity, borderColor: '#00d4aa', backgroundColor: 'rgba(0,212,170,0.06)', fill: true, tension: 0.4, borderWidth: 2, pointRadius: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#506070', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } }, y: { ticks: { color: '#506070', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } }
  });

  new Chart(document.getElementById('assetChart'), {
    type: 'doughnut',
    data: { labels: ['Forex', 'Metals', 'Crypto', 'Indices'], datasets: [{ data: [45, 25, 20, 10], backgroundColor: ['#00d4aa', '#4d9fff', '#fbbf24', '#a78bfa'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#8ba3bf', font: { size: 10 }, boxWidth: 10, padding: 8 } } } }
  });

  const monthly = [-80, 120, 200, -50, 340, 180, 420, 280, -120, 510, 380, 220];
  new Chart(document.getElementById('monthChart'), {
    type: 'bar',
    data: { labels: months, datasets: [{ data: monthly, backgroundColor: monthly.map(v => v >= 0 ? 'rgba(0,212,170,0.7)' : 'rgba(239,83,80,0.7)'), borderRadius: 4, borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { color: '#506070', font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: '#506070', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } } } }
  });

  new Chart(document.getElementById('winLossChart'), {
    type: 'doughnut',
    data: { labels: ['Wins', 'Losses'], datasets: [{ data: [64, 36], backgroundColor: ['rgba(0,212,170,0.8)', 'rgba(239,83,80,0.8)'], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'bottom', labels: { color: '#8ba3bf', font: { size: 10 }, boxWidth: 10, padding: 8 } } } }
  });
}

function renderTopInstruments() {
  const el = document.getElementById('topInstruments');
  const top = state.instruments.slice(0, 5);
  const max = Math.max(...top.map(i => Math.abs(state.prices[i.symbol]?.changePct || 0)), 1);
  el.innerHTML = top.map(i => {
    const chg = state.prices[i.symbol]?.changePct || 0;
    const pct = Math.abs(chg) / max * 100;
    return `<div class="ti-row">
      <span class="ti-sym">${i.symbol}</span>
      <div class="ti-bar"><div class="ti-fill" style="width:${pct}%;background:${chg >= 0 ? 'var(--green)' : 'var(--red)'}"></div></div>
      <span class="${chg >= 0 ? 'up' : 'dn'}" style="font-size:12px;font-family:'DM Mono',monospace">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%</span>
    </div>`;
  }).join('');
}

// ─── CHART ─────────────────────────────────────────────────────────────────
let chartCanvas, chartCtx;

function initChart() {
  chartCanvas = document.getElementById('mainChart');
  if (!chartCanvas) return;
  chartCtx = chartCanvas.getContext('2d');
  resizeChart();
  window.addEventListener('resize', () => { resizeChart(); drawChart(); });
}

function resizeChart() {
  const wrap = document.getElementById('chartWrap');
  if (!wrap || !chartCanvas) return;
  chartCanvas.width = wrap.clientWidth;
  chartCanvas.height = wrap.clientHeight;
}

function drawChart() {
  if (!chartCtx || !chartCanvas || !state.candleData.length) return;
  const w = chartCanvas.width, h = chartCanvas.height;
  const data = state.candleData;
  const pad = { top: 20, right: 72, bottom: 30, left: 6 };
  const cw = w - pad.left - pad.right;
  const ch = h - pad.top - pad.bottom - 30; // 30 for vol bars

  chartCtx.clearRect(0, 0, w, h);
  chartCtx.fillStyle = '#080c18';
  chartCtx.fillRect(0, 0, w, h);

  const minP = Math.min(...data.map(c => c.low)) * 0.9998;
  const maxP = Math.max(...data.map(c => c.high)) * 1.0002;
  const range = maxP - minP || 1;

  // Grid lines
  chartCtx.strokeStyle = 'rgba(255,255,255,0.04)';
  chartCtx.lineWidth = 0.5;
  for (let i = 0; i <= 5; i++) {
    const y = pad.top + (i / 5) * ch;
    chartCtx.beginPath(); chartCtx.moveTo(pad.left, y); chartCtx.lineTo(w - pad.right, y); chartCtx.stroke();
    const price = maxP - (i / 5) * range;
    const inst = state.instruments.find(x => x.symbol === state.currentSymbol);
    chartCtx.fillStyle = '#4a6070';
    chartCtx.font = '9px DM Mono, monospace';
    chartCtx.textAlign = 'left';
    chartCtx.fillText(price.toFixed(inst?.digits || 5), w - pad.right + 4, y + 3);
  }

  // MA 20
  const ma = data.map((c, i) => {
    const s = data.slice(Math.max(0, i - 19), i + 1);
    return s.reduce((sum, x) => sum + x.close, 0) / s.length;
  });
  chartCtx.strokeStyle = 'rgba(77,159,255,0.5)';
  chartCtx.lineWidth = 1;
  chartCtx.beginPath();
  ma.forEach((p, i) => {
    const x = pad.left + (i / data.length) * cw + cw / (2 * data.length);
    const y = pad.top + ((maxP - p) / range) * ch;
    i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
  });
  chartCtx.stroke();

  // Candles or line
  const cw2 = Math.max(2, (cw / data.length) * 0.65);
  if (state.chartType === 'line') {
    chartCtx.strokeStyle = '#00d4aa';
    chartCtx.lineWidth = 1.5;
    chartCtx.beginPath();
    data.forEach((c, i) => {
      const x = pad.left + (i / data.length) * cw + cw / (2 * data.length);
      const y = pad.top + ((maxP - c.close) / range) * ch;
      i === 0 ? chartCtx.moveTo(x, y) : chartCtx.lineTo(x, y);
    });
    chartCtx.stroke();
  } else {
    data.forEach((c, i) => {
      const x = pad.left + (i / data.length) * cw + cw / (2 * data.length);
      const yH = pad.top + ((maxP - c.high) / range) * ch;
      const yL = pad.top + ((maxP - c.low) / range) * ch;
      const yO = pad.top + ((maxP - c.open) / range) * ch;
      const yC = pad.top + ((maxP - c.close) / range) * ch;
      const isUp = c.close >= c.open;
      chartCtx.strokeStyle = isUp ? '#00d4aa' : '#ef5350';
      chartCtx.lineWidth = 1;
      chartCtx.beginPath(); chartCtx.moveTo(x, yH); chartCtx.lineTo(x, yL); chartCtx.stroke();
      chartCtx.fillStyle = isUp ? 'rgba(0,212,170,0.85)' : 'rgba(239,83,80,0.85)';
      const bh = Math.max(1, Math.abs(yC - yO));
      chartCtx.fillRect(x - cw2 / 2, Math.min(yO, yC), cw2, bh);
    });
  }

  // Volume bars
  const maxV = Math.max(...data.map(c => c.volume || 0), 1);
  const volH = 24;
  const volY = h - pad.bottom - volH;
  data.forEach((c, i) => {
    if (!c.volume) return;
    const x = pad.left + (i / data.length) * cw;
    const bh = (c.volume / maxV) * volH;
    chartCtx.fillStyle = c.close >= c.open ? 'rgba(0,212,170,0.2)' : 'rgba(239,83,80,0.2)';
    chartCtx.fillRect(x + 1, volY + (volH - bh), (cw / data.length) - 2, bh);
  });

  // Current price line
  const last = data[data.length - 1];
  const yLast = pad.top + ((maxP - last.close) / range) * ch;
  chartCtx.strokeStyle = 'rgba(0,212,170,0.5)';
  chartCtx.setLineDash([4, 4]);
  chartCtx.lineWidth = 1;
  chartCtx.beginPath(); chartCtx.moveTo(pad.left, yLast); chartCtx.lineTo(w - pad.right, yLast); chartCtx.stroke();
  chartCtx.setLineDash([]);
  chartCtx.fillStyle = '#00d4aa';
  const priceTagW = pad.right - 3;
  chartCtx.fillRect(w - pad.right + 2, yLast - 8, priceTagW, 16);
  const inst = state.instruments.find(x => x.symbol === state.currentSymbol);
  chartCtx.fillStyle = '#080c18';
  chartCtx.font = 'bold 9px DM Mono, monospace';
  chartCtx.textAlign = 'center';
  chartCtx.fillText(last.close.toFixed(inst?.digits || 5), w - pad.right + 2 + priceTagW / 2, yLast + 3);
}

function updateChart() {
  if (!state.candleData.length) return;
  const p = state.prices[state.currentSymbol];
  if (p && state.candleData.length) {
    const last = state.candleData[state.candleData.length - 1];
    last.close = p.bid || last.close;
    last.high = Math.max(last.high, last.close);
    last.low = Math.min(last.low, last.close);
    updateChartOHLC(last);
  }
  drawChart();
}

function updateChartOHLC(c) {
  if (!c) return;
  const inst = state.instruments.find(x => x.symbol === state.currentSymbol);
  const d = inst?.digits || 5;
  document.getElementById('chartOHLC').textContent =
    `O ${c.open.toFixed(d)}  H ${c.high.toFixed(d)}  L ${c.low.toFixed(d)}  C ${c.close.toFixed(d)}`;
}

function setTimeframe(tf, el) {
  state.timeframe = tf;
  document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  state.candleData = [];
  loadCandleData();
}

function setChartType(type, el) {
  state.chartType = type;
  document.querySelectorAll('.ct-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  drawChart();
}

// ─── NAVIGATION ─────────────────────────────────────────────────────────────
function navigate(page, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  if (target) target.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(e => e.classList.remove('active'));
  if (el) el.classList.add('active');
  // Page-specific load
  if (page === 'terminal') { setTimeout(() => { initChart(); loadCandleData(); }, 50); }
  if (page === 'markets') renderMarkets();
  if (page === 'dashboard') loadDashboard();
  if (page === 'history') loadHistory();
  if (page === 'wallet') loadTransactions();
}

function setPosTab(el, type) {
  document.querySelectorAll('.pos-tab').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
}

// ─── MODAL ──────────────────────────────────────────────────────────────────
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
function overlayClose(e, id) { if (e.target === e.currentTarget) closeModal(id); }

// ─── TOAST ──────────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(type, title, msg) {
  const toast = document.getElementById('toast');
  document.getElementById('toastTitle').textContent = title;
  document.getElementById('toastMsg').textContent = msg;
  const icon = document.getElementById('toastIcon');
  icon.className = `toast-icon ${type}`;
  icon.textContent = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 4000);
}

// ─── AUTH ──────────────────────────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  const btn = document.getElementById('loginBtn');
  btn.textContent = 'Signing in…'; btn.disabled = true;
  errEl.classList.add('hidden');
  try {
    const { token, user } = await api.login(email, pass);
    api.setToken(token);
    state.user = user;
    await bootApp();
  } catch (e) {
    errEl.textContent = e.message || 'Invalid credentials';
    errEl.classList.remove('hidden');
  } finally {
    btn.textContent = 'Sign In'; btn.disabled = false;
  }
}

async function doRegister() {
  const errEl = document.getElementById('registerError');
  errEl.classList.add('hidden');
  const data = { firstName: document.getElementById('regFirst').value, lastName: document.getElementById('regLast').value, email: document.getElementById('regEmail').value, password: document.getElementById('regPassword').value, country: document.getElementById('regCountry').value };
  if (!data.firstName || !data.email || !data.password) { errEl.textContent = 'Please fill all required fields'; errEl.classList.remove('hidden'); return; }
  try {
    const { token, user } = await api.register(data);
    api.setToken(token);
    state.user = user;
    await bootApp();
  } catch (e) {
    errEl.textContent = e.message || 'Registration failed';
    errEl.classList.remove('hidden');
  }
}

function demoLogin() {
  document.getElementById('loginEmail').value = 'demo@nextrade.com';
  document.getElementById('loginPassword').value = 'Demo1234!';
  doLogin();
}

function showForm(id) {
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function doLogout() {
  api.setToken(null);
  state.user = null;
  state.accounts = [];
  state.activeAccount = null;
  state.positions = [];
  if (state.ws) state.ws.close();
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
}

// ─── UTILS ──────────────────────────────────────────────────────────────────
function formatPrice(symbol, price) {
  if (!price && price !== 0) return '—';
  const inst = state.instruments.find(i => i.symbol === symbol);
  const digits = inst?.digits || 5;
  if (digits <= 2) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toFixed(digits);
}

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'b' || e.key === 'B') { setDirection('buy'); quickOrder('buy'); }
  if (e.key === 's' || e.key === 'S') { setDirection('sell'); quickOrder('sell'); }
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
});

// ─── BOOT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);
