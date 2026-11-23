import { AuthProvider, useAuth } from './AuthContext'
import Layout from './components/Layout'
import Login from './components/Login'
import Customers from './pages/Customers'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Products from './pages/Products'
import { useRoute } from './router'
import './App.css'

const PAGES = {
  dashboard: Dashboard,
  clients: Customers,
  produits: Products,
  commandes: Orders,
}

function Shell() {
  const { user } = useAuth()
  const route = useRoute()
  if (!user) return <Login />
  const Page = PAGES[route]
  return (
    <Layout route={route}>
      <Page />
    </Layout>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  )
}
