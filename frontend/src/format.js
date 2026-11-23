export const money = (n) =>
  Number(n ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

export const dateTime = (d) =>
  new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })

export const ORDER_STATUS = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
}

// Transitions autorisées par l'order-service.
export const NEXT_STATUSES = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
}

export const fullName = (c) => (c ? `${c.firstName} ${c.lastName}` : '—')
