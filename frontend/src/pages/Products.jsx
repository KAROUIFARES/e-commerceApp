import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import ConfirmButton from '../components/ConfirmButton'
import ErrorMessage from '../components/ErrorMessage'
import Modal from '../components/Modal'
import Pagination from '../components/Pagination'
import { money } from '../format'

const EMPTY = { name: '', category: '', description: '', imageUrl: '', price: '', stock: '' }
const PAGE_SIZE = 15

function ProductForm({ product, onSaved, onClose }) {
  const [form, setForm] = useState(
    product
      ? {
          name: product.name,
          category: product.category ?? '',
          description: product.description ?? '',
          imageUrl: product.imageUrl ?? '',
          price: String(product.price),
          stock: String(product.stock),
        }
      : EMPTY,
  )
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (f) => (e) => setForm({ ...form, [f]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const payload = {
      name: form.name,
      category: form.category.trim() || null,
      description: form.description.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      price: Number(form.price),
      stock: Number(form.stock),
    }
    try {
      if (product) await api.updateProduct(product.id, payload)
      else await api.createProduct(payload)
      onSaved()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <Modal title={product ? 'Modifier le produit' : 'Nouveau produit'} onClose={onClose}>
      <form onSubmit={submit} className="form">
        <div className="row">
          <label>Nom<input value={form.name} onChange={set('name')} required maxLength={200} /></label>
          <label>Catégorie<input value={form.category} onChange={set('category')} maxLength={100} /></label>
        </div>
        <label>Description<textarea rows={3} value={form.description} onChange={set('description')} maxLength={2000} /></label>
        <label>URL de l'image<input type="url" value={form.imageUrl} onChange={set('imageUrl')} /></label>
        <div className="row">
          <label>Prix (€)<input type="number" min="0" step="0.01" value={form.price} onChange={set('price')} required /></label>
          <label>Stock<input type="number" min="0" step="1" value={form.stock} onChange={set('stock')} required /></label>
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

export default function Products() {
  const [data, setData] = useState({ items: [], total: 0 })
  const [loaded, setLoaded] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    try {
      setError(null)
      setData(await api.products({ search, page, pageSize: PAGE_SIZE }))
      setLoaded(true)
    } catch (err) {
      setError(err)
    }
  }, [search, page])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  async function remove(p) {
    try {
      await api.deleteProduct(p.id)
      load()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <section>
      <div className="row between">
        <h1>Produits</h1>
        <button onClick={() => setEditing('new')}>Nouveau produit</button>
      </div>
      <input
        className="search"
        type="search"
        placeholder="Rechercher un produit…"
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
              <th>Catégorie</th>
              <th>Prix</th>
              <th>Stock</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.items.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.category ?? '—'}</td>
                <td>{money(p.price)}</td>
                <td className={p.stock <= 5 ? 'text-danger' : ''}>{p.stock === 0 ? 'Rupture' : p.stock}</td>
                <td className="actions">
                  <button className="secondary" onClick={() => setEditing(p)}>Modifier</button>
                  <ConfirmButton onConfirm={() => remove(p)}>Supprimer</ConfirmButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loaded && data.items.length === 0 && <p className="muted">Aucun produit{search && ' pour cette recherche'}.</p>}
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} />
      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
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
