import { useEffect, useState } from 'react'

export const ROUTES = [
  { path: 'dashboard', label: 'Dashboard' },
  { path: 'clients', label: 'Clients' },
  { path: 'produits', label: 'Produits' },
  { path: 'commandes', label: 'Commandes' },
]

const read = () => {
  const p = window.location.hash.replace(/^#\/?/, '')
  return ROUTES.some((r) => r.path === p) ? p : 'dashboard'
}

// Routage par hash : la page survit au rechargement, sans dépendance.
export function useRoute() {
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onChange = () => setRoute(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
