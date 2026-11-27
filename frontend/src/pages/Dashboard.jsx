import { useEffect, useState } from 'react'
import { api } from '../api'
import ErrorMessage from '../components/ErrorMessage'
import { useCustomers } from '../hooks'
import { dateTime, fullName, money, ORDER_STATUS } from '../format'

const LOW_STOCK = 5

export default function Dashboard() {
  const { byId } = useCustomers()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      api.customers({ pageSize: 1 }),
      api.products({ pageSize: 1 }),
      api.products({ maxStock: LOW_STOCK, pageSize: 10 }),
      api.orderStats(),
      api.orders({ pageSize: 5 }),
    ])
      .then(([customers, products, lowStock, stats, recent]) => {
        if (alive) setData({ customers, products, lowStock, stats, recent })
      })
      .catch((err) => alive && setError(err))
    return () => {
      alive = false
    }
  }, [])

  if (error) return <ErrorMessage error={error} />
  if (!data) return <p className="muted">Chargement…</p>

  const { customers, products, lowStock, stats, recent } = data
  const maxCount = Math.max(...Object.values(stats.byStatus), 1)

  return (
    <section>
      <h1>Dashboard</h1>
      <div className="kpis">
        <a className="card kpi" href="#/clients">
          <span>Client</span>
          <strong>{customers.total}</strong>
        </a>
        <a className="card kpi" href="#/produits">
          <span>Produits</span>
          <strong>{products.total}</strong>
        </a>
        <a className="card kpi" href="#/commandes">
          <span>Commandes</span>
          <strong>{stats.total}</strong>
        </a>
        <div className="card kpi">
          <span>Chiffre d'affaires</span>
          <strong>{money(stats.revenue)}</strong>
          <small>hors commandes annulées</small>
        </div>
      </div>

      <div className="two-cols">
        <div className="card">
          <h2>Commandes par statut</h2>
          {Object.entries(stats.byStatus).map(([status, count]) => (
            <div key={status} className="bar-row">
              <span>{ORDER_STATUS[status]}</span>
              <div className="bar">
                <div className={`bar-fill status-${status}`} style={{ width: `${(count / maxCount) * 100}%` }} />
              </div>
              <strong>{count}</strong>
            </div>
          ))}
        </div>

        <div className="card">
          <h2>Stock faible (≤ {LOW_STOCK})</h2>
          {lowStock.items.length === 0 ? (
            <p className="muted">Aucun produit en stock faible.</p>
          ) : (
            <ul className="plain">
              {lowStock.items.map((p) => (
                <li key={p.id} className="row between">
                  <span>{p.name}</span>
                  <strong className={p.stock === 0 ? 'text-danger' : ''}>{p.stock === 0 ? 'Rupture' : p.stock}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Dernières commandes</h2>
        {recent.items.length === 0 ? (
          <p className="muted">Aucune commande.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Total</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {recent.items.map((o) => (
                <tr key={o.id}>
                  <td>{dateTime(o.createdAt)}</td>
                  <td>{fullName(byId[o.customerId])}</td>
                  <td>{money(o.total)}</td>
                  <td>
                    <span className={`tag status-${o.status}`}>{ORDER_STATUS[o.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
