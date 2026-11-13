const mongoose = require('mongoose');

const STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

// Transitions autorisées du cycle de vie d'une commande.
const TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

const itemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true, trim: true },
    productName: { type: String, required: true, trim: true, maxlength: 200 },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    customerId: { type: String, required: true, index: true },
    items: {
      type: [itemSchema],
      validate: [(v) => v.length > 0, 'La commande doit contenir au moins un article'],
    },
    total: { type: Number, required: true, min: 0 },
    status: { type: String, enum: STATUSES, default: 'PENDING', index: true },
    shippingAddress: {
      street: String,
      city: String,
      postalCode: String,
      country: String,
    },
    statusHistory: [
      {
        _id: false,
        status: { type: String, enum: STATUSES },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      },
    },
  },
);

orderSchema.index({ customerId: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);

module.exports = { Order, STATUSES, TRANSITIONS };
