import { useCallback, useState } from 'react'
import { AuthProvider, useAuth } from './AuthContext'
import AuthForm from './components/AuthForm'
import Cart from './components/Cart'
import Catalog from './components/Catalog'
import Orders from './components/Orders'
import './App.css'

function Shop() {
  const { user, signOut } = useAuth()
  const [tab, setTab] = useState('catalog')
  const [cart, setCart] = useState({}) // productId -> { product, quantity }

  const addToCart = useCallback((product) => {
    setCart((c) => {
      const qty = Math.min((c[product.id]?.quantity ?? 0) + 1, product.stock)
      return { ...c, [product.id]: { product, quantity: qty } }
    })
  }, [])

  const setQuantity = useCallback((product, quantity) => {
    setCart((c) => {
      const { [product.id]: _removed, ...rest } = c
      return quantity > 0 ? { ...rest, [product.id]: { product, quantity } } : rest
    })
  }, [])

  const cartCount = Object.values(cart).reduce((s, l) => s + l.quantity, 0)

  return (
    <>
      <header className="topbar">
        <h1>E-Commerce</h1>
        <nav>
          <button className={tab === 'catalog' ? 'active' : ''} onClick={() => setTab('catalog')}>
            Catalogue
          </button>
          {user && (
            <>
              <button className={tab === 'cart' ? 'active' : ''} onClick={() => setTab('cart')}>
                Panier ({cartCount})
              </button>
              <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}>
                Mes commandes
              </button>
            </>
          )}
        </nav>
        {user ? (
          <span>
            {user.firstName} <button className="link" onClick={signOut}>Déconnexion</button>
          </span>
        ) : (
          <button onClick={() => setTab('auth')}>Connexion</button>
        )}
      </header>

      <main>
        {tab === 'auth' && !user && <AuthForm />}
        {tab === 'catalog' && <Catalog user={user} addToCart={addToCart} />}
        {user && tab === 'cart' && (
          <Cart
            user={user}
            cart={cart}
            setQuantity={setQuantity}
            clear={() => setCart({})}
            onOrdered={() => setTab('orders')}
          />
        )}
        {user && tab === 'orders' && <Orders user={user} />}
      </main>
    </>
  )
}

function Root() {
  const { user } = useAuth()
  // key : repart d'un état propre (panier, onglet) quand l'utilisateur change.
  return <Shop key={user?.id ?? 'anon'} />
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  )
}
