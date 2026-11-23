import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import ErrorMessage from './ErrorMessage'

const money = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

function ProductForm({ onCreated }) {
  const [form, setForm] = useState({ name: '', category: '', price: '', stock: '' })
  const [error, setError] = useState(null)
  const set = (f) => (e) => setForm({ ...form, [f]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError(null)
    try {
      await api.createProduct({
        name: form.name,
        category: form.category || null,
        price: Number(form.price),
        stock: Number(form.stock),
      })
      setForm({ name: '', category: '', price: '', stock: '' })
      onCreated()
    } catch (err) {
      setError(err)
    }
  }

  return (
    <form className="card row wrap" onSubmit={submit}>
      <label>
        Nom
        <input value={form.name} onChange={set('name')} required />
      </label>
      <label>
        Catégorie
        <input value={form.category} onChange={set('category')} />
      </label>
      <label>
        Prix (€)
        <input type="number" min="0" step="0.01" value={form.price} onChange={set('price')} required />
      </label>
      <label>
        Stock
        <input type="number" min="0" step="1" value={form.stock} onChange={set('stock')} required />
      </label>
      <button type="submit">Ajouter le produit</button>
      <ErrorMessage error={error} />
    </form>
  )
}

export default function Catalog({ user, addToCart }) {
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      setError(null)
      const res = await api.products({ ...(search && { search }), pageSize: 100 })
      setProducts(res.items)
      setLoaded(true)
    } catch (err) {
      setError(err)
    }
  }, [search])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  return (
    <section>
      <input
        className="search"
        placeholder="Rechercher un produit…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <ErrorMessage error={error} />
      {user && <ProductForm onCreated={load} />}
      <div className="grid">
        {products.map((p) => (
          <article key={p.id} className="card product">
            <h3>{p.name}</h3>
            {p.category && <span className="tag">{p.category}</span>}
            {p.description && <p>{p.description}</p>}
            <strong>{money(p.price)}</strong>
            <small>{p.stock > 0 ? `${p.stock} en stock` : 'Rupture de stock'}</small>
            <button disabled={p.stock < 1} onClick={() => addToCart(p)}>
              Ajouter au panier
            </button>
          </article>
        ))}
        {loaded && products.length === 0 && !error && <p className="muted">Aucun produit.</p>}
      </div>
    </section>
  )
}
