import { useEffect, useState } from 'react'
import { api } from './api'

// Liste de clients (id -> client) pour afficher des noms au lieu d'identifiants.
export function useCustomers() {
  const [customers, setCustomers] = useState([])
  useEffect(() => {
    let alive = true
    api
      .customers({ pageSize: 100 })
      .then((r) => alive && setCustomers(r.items))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return { customers, byId: Object.fromEntries(customers.map((c) => [c.id, c])) }
}
