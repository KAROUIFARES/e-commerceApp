const express = require('express');
const mongoose = require('mongoose');
const config = require('./config');
const ordersRouter = require('./routes/orders');
const { isConnected } = require('./messaging/publisher');

const app = express();

app.use(express.json({ limit: '100kb' }));

// CORS minimal pour le frontend Vite.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && config.corsOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/health', async (_req, res) => {
  const mongo = mongoose.connection.readyState === 1 ? 'up' : 'down';
  const rabbitmq = (await isConnected()) ? 'up' : 'down';
  const ok = mongo === 'up' && rabbitmq === 'up';
  res.status(ok ? 200 : 503).json({ status: ok ? 'ok' : 'degraded', mongo, rabbitmq });
});

app.use('/api/orders', ordersRouter);

app.use((_req, res) => res.status(404).json({ error: 'Route introuvable' }));

// Express 5 transmet automatiquement les erreurs des handlers async ici.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON invalide' });
  }
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: 'Requête invalide', details: Object.values(err.errors).map((e) => e.message) });
  }
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: status >= 500 && !err.status ? 'Erreur interne' : err.message,
    ...(err.details && { details: err.details }),
  });
});

module.exports = app;
