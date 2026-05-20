// src/services/websocket.js
const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const { updatePrices, getAllPrices } = require('./marketData');

let wss;
const clients = new Map(); // clientId -> { ws, subscriptions, userId }

function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const clientId = Math.random().toString(36).slice(2);
    clients.set(clientId, { ws, subscriptions: new Set(['ALL']), userId: null });

    ws.send(JSON.stringify({ type: 'connected', clientId, message: 'Connected to NexTrade market feed' }));
    // Send initial prices
    ws.send(JSON.stringify({ type: 'prices', data: getAllPrices(), timestamp: Date.now() }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleMessage(clientId, msg);
      } catch (_) {}
    });

    ws.on('close', () => clients.delete(clientId));
    ws.on('error', () => clients.delete(clientId));
  });

  // Broadcast price updates at interval
  const interval = parseInt(process.env.PRICE_UPDATE_INTERVAL) || 1500;
  setInterval(() => {
    updatePrices();
    const prices = getAllPrices();
    const msg = JSON.stringify({ type: 'prices', data: prices, timestamp: Date.now() });

    for (const [, client] of clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(msg);
      }
    }
  }, interval);

  console.log(`🔌 WebSocket server ready at /ws`);
  return wss;
}

function handleMessage(clientId, msg) {
  const client = clients.get(clientId);
  if (!client) return;

  switch (msg.type) {
    case 'auth': {
      try {
        const decoded = jwt.verify(msg.token, process.env.JWT_SECRET);
        client.userId = decoded.userId;
        client.ws.send(JSON.stringify({ type: 'auth_success', userId: decoded.userId }));
      } catch {
        client.ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }));
      }
      break;
    }
    case 'subscribe': {
      if (msg.symbols) msg.symbols.forEach(s => client.subscriptions.add(s));
      break;
    }
    case 'unsubscribe': {
      if (msg.symbols) msg.symbols.forEach(s => client.subscriptions.delete(s));
      break;
    }
    case 'ping': {
      client.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    }
  }
}

function broadcastToUser(userId, message) {
  for (const [, client] of clients) {
    if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }
}

module.exports = { initWebSocket, broadcastToUser };
