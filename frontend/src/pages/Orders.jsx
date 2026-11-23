import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import ErrorMessage from '../components/ErrorMessage'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import { useCustomers } from '../hooks'
import { dateTime, fullName, money, NEXT_STATUSES, ORDER_STATUS } from '../format'

const PAGE_SIZE = 15

function NewOrder({ customers, onSaved, onClose }) {
  const [products, setProducts] = useState([])
  const [customerId, setCustomerId] = useState('')
  const [lines, setLines] = useState([{ productId: '', quantity: 1 }])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.products({ pageSize: 100 }).then((r) => setProducts(r.items)).catch(setError)
  }, [])

  const byId = Object.fromEntries(products.map((p) => [p.id, p]))
  const total = lines.reduce((s, l) => s + (byId[l.productId]?.price ?? 0) * l.quantity, 0)
  const setLine = (i, patch) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await api.createOrder({
        customerId,
        items: lines.map((l) => ({
          productId: l.productId,
          productName: byId[l.productId].name,
          quantity: l.quantity,
          unitPrice: byId[l.productId].price,
        })),
      })
      onSaved()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <Modal title="Nouvelle commande" onClose={onClose}>
      <form onSubmit={submit} className="form">
        <label>
          Client
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            <option value="" disabled>Choisir un client…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.firstName} {c.lastName} — {c.email}</option>
            ))}
          </select>
        </label>
        {lines.map((l, i) => (
          <div className="row end" key={i}>
            <label>
              Produit
              <select value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })} required>
                <option value="" disabled>Choisir un produit…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.stock < 1}>
                    {p.name} — {money(p.price)} ({p.stock} en stock)
                  </option>
                ))}
              </select>
            </label>
            <label className="qty">
              Qté
              <input
                type="number"
                min="1"
                max={byId[l.productId]?.stock ?? undefined}
                step="1"
                value={l.quantity}
                onChange={(e) => setLine(i, { quantity: Number(e.target.value) })}
                required
              />
            </label>
            <button type="button" className="secondary" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>
              Retirer
            </button>
          </div>
        ))}
        <button type="button" className="secondary" onClick={() => setLines([...lines, { productId: '', quantity: 1 }])}>
          Ajouter une ligne
        </button>
        <p className="total">Total : {money(total)}</p>
        <ErrorMessage error={error} />
        <div className="row end">
          <button type="button" className="secondary" onClick={onClose}>Annuler</button>
          <button type="submit" disabled={busy || customers.length === 0}>{busy ? '…' : 'Créer la commande'}</button>
        </div>
        {customers.length === 0 && <p className="muted">Créez d'abord un client.</p>}
      </form>
    </Modal>
  )
}

function OrderDetail({ order, customer, onChanged, onClose }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function change(status) {
    setBusy(true)
    setError(null)
    try {
      await api.updateOrderStatus(order.id, status)
      onChanged()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  const next = NEXT_STATUSES[order.status]
  return (
    <Modal title={`Commande …${order.id.slice(-6)}`} onClose={onClose}>
      <p>
        <strong>{fullName(customer)}</strong> · {dateTime(order.createdAt)} ·{' '}
        <span className={`tag status-${order.status}`}>{ORDER_STATUS[order.status]}</span>
      </p>
      <table>
        <thead>
          <tr><th>Produit</th><th>Prix</th><th>Qté</th><th>Total</th></tr>
        </thead>
        <tbody>
          {order.items.map((i) => (
            <tr key={i.productId}>
              <td>{i.productName}</td><td>{money(i.unitPrice)}</td><td>{i.quantity}</td><td>{money(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="total">Total : {money(order.total)}</p>
      {order.shippingAddress?.street && (
        <p className="muted">
          Livraison : {order.shippingAddress.street}, {order.shippingAddress.postalCode} {order.shippingAddress.city}
        </p>
      )}
      <h3>Historique</h3>
      <ul className="plain">
        {order.statusHistory.map((h, i) => (
          <li key={i}>{dateTime(h.at)} — {ORDER_STATUS[h.status]}</li>
        ))}
      </ul>
      <ErrorMessage error={error} />
      {next.length > 0 && (
        <div className="row end">
          {next.map((s) => (
            <button key={s} className={s === 'CANCELLED' ? 'danger' : ''} disabled={busy} onClick={() => change(s)}>
              {s === 'CANCELLED' ? 'Annuler la commande' : `Passer à « ${ORDER_STATUS[s]} »`}
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}

export default function Orders() {
  const { customers, byId } = useCustomers()
  const [data, setData] = useState({ items: [], total: 0 })
  const [loaded, setLoaded] = useState(false)
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState(null) // { type: 'new' } | { type: 'detail', order }
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setData(await api.orders({ status, page, pageSize: PAGE_SIZE }))
      setLoaded(true)
    } catch (err) {
      setError(err)
    }
  }, [status, page])

  useEffect(() => {
    load()
  }, [load])

  const refresh = () => {
    setModal(null)
    load()
  }

  return (
    <section>
      <div className="row between">
        <h1>Commandes</h1>
        <button onClick={() => setModal({ type: 'new' })}>Nouvelle commande</button>
      </div>
      <label className="filter">
        Statut
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1) }}>
          <option value="">Tous</option>
          {Object.entries(ORDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <ErrorMessage error={error} />
      <div className="card table-wrap">
        <table>
          <thead>
            <tr><th>Date</th><th>Référence</th><th>Client</th><th>Articles</th><th>Total</th><th>Statut</th><th /></tr>
          </thead>
          <tbody>
            {data.items.map((o) => (
              <tr key={o.id}>
                <td>{dateTime(o.createdAt)}</td>
                <td>…{o.id.slice(-6)}</td>
                <td>{fullName(byId[o.customerId])}</td>
                <td>{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                <td>{money(o.total)}</td>
                <td><span className={`tag status-${o.status}`}>{ORDER_STATUS[o.status]}</span></td>
                <td className="actions">
                  <button className="secondary" onClick={() => setModal({ type: 'detail', order: o })}>Détails</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loaded && data.items.length === 0 && <p className="muted">Aucune commande.</p>}
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
      {modal?.type === 'new' && <NewOrder customers={customers} onClose={() => setModal(null)} onSaved={refresh} />}
      {modal?.type === 'detail' && (
        <OrderDetail order={modal.order} customer={byId[modal.order.customerId]} onClose={() => setModal(null)} onChanged={refresh} />
      )}
    </section>
  )
}
