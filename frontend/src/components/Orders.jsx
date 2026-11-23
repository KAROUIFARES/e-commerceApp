import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import ErrorMessage from './ErrorMessage'

const money = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
const LABELS = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmée',
  SHIPPED: 'Expédiée',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
}

export default function Orders({ user }) {
  const [orders, setOrders] = useState([])
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      setError(null)
      const [list, customer] = await Promise.all([
        api.orders({ pageSize: 100 }),
        // Profil client alimenté de façon asynchrone par RabbitMQ (user.registered, order.*).
        api.customer(user.id).catch(() => null),
      ])
      setOrders(list.items)
      setProfile(customer)
      setLoaded(true)
    } catch (err) {
      setError(err)
    }
  }, [user.id])

  useEffect(() => {
    load()
  }, [load])

  async function cancel(id) {
    try {
      await api.updateOrderStatus(id, 'CANCELLED')
      load()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <section>
      {profile && (
        <p className="card">
          {profile.firstName} {profile.lastName} — {profile.orderCount} commande(s) active(s), total dépensé :{' '}
          <strong>{money(profile.totalSpent)}</strong>
        </p>
      )}
      <ErrorMessage error={error} />
      {loaded && orders.length === 0 && !error && <p className="muted">Aucune commande.</p>}
      {orders.map((o) => (
        <article key={o.id} className="card">
          <header className="row between">
            <strong>Commande …{o.id.slice(-6)}</strong>
            <span className={`tag status-${o.status}`}>{LABELS[o.status]}</span>
          </header>
          <ul>
            {o.items.map((i) => (
              <li key={i.productId}>
                {i.quantity} × {i.productName} — {money(i.lineTotal)}
              </li>
            ))}
          </ul>
          <div className="row between">
            <span>Total : {money(o.total)}</span>
            {(o.status === 'PENDING' || o.status === 'CONFIRMED') && (
              <button className="secondary" onClick={() => cancel(o.id)}>
                Annuler
              </button>
            )}
          </div>
        </article>
      ))}
      <button className="secondary" onClick={load}>
        Actualiser
      </button>
    </section>
  )
}
