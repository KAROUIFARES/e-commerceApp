const express = require('express');
const mongoose = require('mongoose');
const { Order, STATUSES, TRANSITIONS } = require('../models/Order');
const { getCustomer, CustomerServiceUnavailableError } = require('../clients/customerClient');
const { publishSafe } = require('../messaging/publisher');

const router = express.Router();

const isObjectId = (id) => mongoose.isValidObjectId(id) && String(new mongoose.Types.ObjectId(id)) === id;
const round2 = (n) => Math.round(n * 100) / 100;

// Identité vérifiée injectée par l'API Gateway (le gateway écrase tout en-tête fourni par le client).
const currentUserId = (req) => req.get('x-user-id') || null;

function httpError(status, message, details) {
  return Object.assign(new Error(message), { status, details });
}

function eventData(order) {
  return {
    orderId: order._id.toString(),
    customerId: order.customerId,
    status: order.status,
    total: order.total,
    items: order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
  };
}

// Valide le corps d'une création de commande et calcule les totaux côté serveur.
function parseCreateBody(body) {
  const errors = [];
  const { customerId, items, shippingAddress } = body ?? {};

  if (typeof customerId !== 'string' || !customerId.trim()) errors.push('customerId est requis');

  if (!Array.isArray(items) || items.length === 0) {
    errors.push('items doit contenir au moins un article');
  } else if (items.length > 100) {
    errors.push('100 articles maximum par commande');
  }

  const parsedItems = (Array.isArray(items) ? items : []).map((item, i) => {
    const { productId, productName, quantity, unitPrice } = item ?? {};
    if (typeof productId !== 'string' || !productId.trim()) errors.push(`items[${i}].productId est requis`);
    if (typeof productName !== 'string' || !productName.trim()) errors.push(`items[${i}].productName est requis`);
    if (!Number.isInteger(quantity) || quantity < 1) errors.push(`items[${i}].quantity doit être un entier >= 1`);
    if (typeof unitPrice !== 'number' || !Number.isFinite(unitPrice) || unitPrice < 0) {
      errors.push(`items[${i}].unitPrice doit être un nombre >= 0`);
    }
    return {
      productId: String(productId ?? '').trim(),
      productName: String(productName ?? '').trim(),
      quantity,
      unitPrice: round2(unitPrice),
      lineTotal: round2(quantity * unitPrice),
    };
  });

  if (errors.length) throw httpError(400, 'Requête invalide', errors);

  return {
    customerId: customerId.trim(),
    items: parsedItems,
    total: round2(parsedItems.reduce((sum, it) => sum + it.lineTotal, 0)),
    shippingAddress,
  };
}

// GET /api/orders?customerId=&status=&page=&pageSize=
router.get('/', async (req, res) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 100);

  const filter = {};
  const userId = currentUserId(req);
  if (userId) filter.customerId = userId;
  else if (typeof req.query.customerId === 'string') filter.customerId = req.query.customerId;
  if (typeof req.query.status === 'string') {
    const status = req.query.status.toUpperCase();
    if (!STATUSES.includes(status)) throw httpError(400, `status doit valoir : ${STATUSES.join(', ')}`);
    filter.status = status;
  }

  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize),
    Order.countDocuments(filter),
  ]);
  res.json({ items, total, page, pageSize });
});

// GET /api/orders/:id
router.get('/:id', async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(404, 'Commande introuvable');
  const order = await Order.findById(req.params.id);
  const userId = currentUserId(req);
  if (!order || (userId && order.customerId !== userId)) throw httpError(404, 'Commande introuvable');
  res.json(order);
});

// POST /api/orders
router.post('/', async (req, res) => {
  const data = parseCreateBody(req.body);
  const userId = currentUserId(req);
  if (userId && data.customerId !== userId) throw httpError(403, 'Vous ne pouvez commander que pour votre propre compte');

  let customer;
  try {
    customer = await getCustomer(data.customerId);
  } catch (err) {
    if (err instanceof CustomerServiceUnavailableError) throw httpError(503, err.message);
    throw err;
  }
  if (!customer) throw httpError(422, `Client ${data.customerId} introuvable`);

  // Adresse de livraison par défaut : celle du client.
  if (!data.shippingAddress && customer.address) data.shippingAddress = customer.address;

  const order = await Order.create({
    ...data,
    status: 'PENDING',
    statusHistory: [{ status: 'PENDING' }],
  });

  await publishSafe('order.created', eventData(order));
  res.status(201).location(`/api/orders/${order.id}`).json(order);
});

// PATCH /api/orders/:id/status  { "status": "CONFIRMED" }
router.patch('/:id/status', async (req, res) => {
  if (!isObjectId(req.params.id)) throw httpError(404, 'Commande introuvable');

  const next = typeof req.body?.status === 'string' ? req.body.status.toUpperCase() : null;
  if (!STATUSES.includes(next)) throw httpError(400, `status doit valoir : ${STATUSES.join(', ')}`);

  const current = await Order.findById(req.params.id);
  const userId = currentUserId(req);
  if (!current || (userId && current.customerId !== userId)) throw httpError(404, 'Commande introuvable');
  if (!TRANSITIONS[current.status].includes(next)) {
    throw httpError(409, `Transition ${current.status} -> ${next} interdite`);
  }

  // Le filtre sur le statut courant évite qu'une mise à jour concurrente soit écrasée.
  const order = await Order.findOneAndUpdate(
    { _id: current._id, status: current.status },
    { $set: { status: next }, $push: { statusHistory: { status: next, at: new Date() } } },
    { returnDocument: 'after', runValidators: true },
  );
  if (!order) throw httpError(409, 'La commande a été modifiée entre-temps, réessayez');

  await publishSafe(next === 'CANCELLED' ? 'order.cancelled' : 'order.status-changed', {
    ...eventData(order),
    previousStatus: current.status,
  });
  res.json(order);
});

module.exports = router;
