// Client HTTP unique : tout passe par l'API Gateway.
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:5000'
const TOKEN_KEY = 'ecomm.session'

export class ApiError extends Error {
  constructor(status, message, details = []) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY)) ?? null
  } catch {
    return null
  }
}

export function saveSession(session) {
  try {
    if (session) localStorage.setItem(TOKEN_KEY, JSON.stringify(session))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // stockage indisponible : la session ne survivra pas au rechargement
  }
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn
}

// Normalise les formats d'erreur : ProblemDetails (.NET) et { error, details } (order-service).
function toError(status, body) {
  const details = body?.errors ? Object.values(body.errors).flat() : (body?.details ?? [])
  const message = body?.detail ?? body?.error ?? body?.title ?? `Erreur ${status}`
  return new ApiError(status, message, details)
}

export async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = loadSession()?.accessToken
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Serveur injoignable. Vérifiez que le gateway est démarré.')
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // 401 sur une route protégée avec un token = session expirée ou révoquée.
    if (res.status === 401 && token && !path.startsWith('/api/auth/')) onUnauthorized()
    throw toError(res.status, data)
  }
  return data
}

const qs = (params = {}) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString()

export const api = {
  signUp: (payload) => request('/api/auth/signup', { method: 'POST', body: payload, auth: false }),
  signIn: (payload) => request('/api/auth/signin', { method: 'POST', body: payload, auth: false }),

  customers: (params) => request(`/api/customers?${qs(params)}`),
  createCustomer: (body) => request('/api/customers', { method: 'POST', body }),
  updateCustomer: (id, body) => request(`/api/customers/${id}`, { method: 'PUT', body }),
  deleteCustomer: (id) => request(`/api/customers/${id}`, { method: 'DELETE' }),

  products: (params) => request(`/api/products?${qs(params)}`),
  createProduct: (body) => request('/api/products', { method: 'POST', body }),
  updateProduct: (id, body) => request(`/api/products/${id}`, { method: 'PUT', body }),
  deleteProduct: (id) => request(`/api/products/${id}`, { method: 'DELETE' }),

  orders: (params) => request(`/api/orders?${qs(params)}`),
  orderStats: () => request('/api/orders/stats'),
  createOrder: (body) => request('/api/orders', { method: 'POST', body }),
  updateOrderStatus: (id, status) =>
    request(`/api/orders/${id}/status`, { method: 'PATCH', body: { status } }),
}
