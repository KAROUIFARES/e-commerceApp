import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import ConfirmButton from '../components/ConfirmButton'
import ErrorMessage from '../components/ErrorMessage'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import { money } from '../format'

const EMPTY = { firstName: '', lastName: '', email: '', phone: '', street: '', city: '', postalCode: '', country: '' }
const PAGE_SIZE = 15

function toForm(c) {
  return {
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone ?? '',
    street: c.address?.street ?? '',
    city: c.address?.city ?? '',
    postalCode: c.address?.postalCode ?? '',
    country: c.address?.country ?? '',
  }
}

function toPayload(f) {
  const address = { street: f.street, city: f.city, postalCode: f.postalCode, country: f.country }
  const hasAddress = Object.values(address).some((v) => v.trim())
  return {
    firstName: f.firstName,
    lastName: f.lastName,
    email: f.email,
    phone: f.phone.trim() || null,
    address: hasAddress ? address : null,
  }
}

function CustomerForm({ customer, onSaved, onClose }) {
  const [form, setForm] = useState(customer ? toForm(customer) : EMPTY)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (f) => (e) => setForm({ ...form, [f]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (customer) await api.updateCustomer(customer.id, toPayload(form))
      else await api.createCustomer(toPayload(form))
      onSaved()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <Modal title={customer ? 'Modifier le client' : 'Nouveau client'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="row">
          <label>Prénom<input value={form.firstName} onChange={set('firstName')} required maxLength={100} /></label>
          <label>Nom<input value={form.lastName} onChange={set('lastName')} required maxLength={100} /></label>
        </div>
        <div className="row">
          <label>Email<input type="email" value={form.email} onChange={set('email')} required /></label>
          <label>Téléphone<input value={form.phone} onChange={set('phone')} /></label>
        </div>
        <label>Adresse<input value={form.street} onChange={set('street')} /></label>
        <div className="row">
          <label>Code postal<input value={form.postalCode} onChange={set('postalCode')} /></label>
          <label>Ville<input value={form.city} onChange={set('city')} /></label>
          <label>Pays<input value={form.country} onChange={set('country')} /></label>
        </div>
        <ErrorMessage error={error} />
        <div className="row end">
          <button type="button" className="secondary" onClick={onClose}>Annuler</button>
          <button type="submit" disabled={busy}>{busy ? '…' : 'Enregistrer'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function Customers() {
  const [data, setData] = useState({ items: [], total: 0 })
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null) // null | 'new' | customer
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setData(await api.customers({ search, page, pageSize: PAGE_SIZE }))
      setLoaded(true)
    } catch (err) {
      setError(err)
    }
  }, [search, page])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  async function remove(c) {
    try {
      await api.deleteCustomer(c.id)
      load()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <section>
      <div className="row between">
        <h1>Clients</h1>
        <button onClick={() => setEditing('new')}>Nouveau client</button>
      </div>
      <input
        className="search"
        type="search"
        placeholder="Rechercher par nom ou email…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setPage(1)
        }}
      />
      <ErrorMessage error={error} />
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Téléphone</th>
              <th>Commandes actives</th>
              <th>Total dépensé</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((c) => (
              <tr key={c.id}>
                <td>{c.firstName} {c.lastName}</td>
                <td>{c.email}</td>
                <td>{c.phone ?? '—'}</td>
                <td>{c.orderCount}</td>
                <td>{money(c.totalSpent)}</td>
                <td className="actions">
                  <button className="secondary" onClick={() => setEditing(c)}>Modifier</button>
                  <ConfirmButton onConfirm={() => remove(c)}>Supprimer</ConfirmButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loaded && data.items.length === 0 && <p className="muted">Aucun client{search && ' pour cette recherche'}.</p>}
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
      {editing && (
        <CustomerForm
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </section>
  )
}
