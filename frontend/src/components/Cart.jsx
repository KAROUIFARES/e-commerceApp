import { useState } from 'react'
import { api } from '../api'
import ErrorMessage from './ErrorMessage'

const money = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

export default function Cart({ user, cart, setQuantity, clear, onOrdered }) {
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const lines = Object.values(cart)
  const total = lines.reduce((s, l) => s + l.product.price * l.quantity, 0)

  async function checkout() {
    setBusy(true)
    setError(null)
    try {
      await api.createOrder({
        customerId: user.id,
        items: lines.map((l) => ({
          productId: l.product.id,
          productName: l.product.name,
          quantity: l.quantity,
          unitPrice: l.product.price,
        })),
      })
      clear()
      onOrdered()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  if (lines.length === 0) return <p className="muted">Votre panier est vide.</p>

  return (
    <section>
      <table>
        <thead>
          <tr>
            <th>Produit</th>
            <th>Prix</th>
            <th>Quantité</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map(({ product, quantity }) => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>{money(product.price)}</td>
              <td>
                <input
                  type="number"
                  min="0"
                  max={product.stock}
                  value={quantity}
                  onChange={(e) => setQuantity(product, Number(e.target.value))}
                />
              </td>
              <td>{money(product.price * quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="total">Total : {money(total)}</p>
      <ErrorMessage error={error} />
      <button onClick={checkout} disabled={busy}>
        {busy ? '…' : 'Passer la commande'}
      </button>
    </section>
  )
}
