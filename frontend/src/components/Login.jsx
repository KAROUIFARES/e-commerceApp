import { useState } from 'react'
import { useAuth } from '../AuthContext'
import ErrorMessage from './ErrorMessage'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState('signin')
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signin') await signIn({ email: form.email, password: form.password })
      else await signUp(form)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card auth" onSubmit={submit}>
      <h1>Espace vendeur</h1>
      <h2>{mode === 'signin' ? 'Connexion' : 'Créer un compte'}</h2>
      {mode === 'signup' && (
        <div className="row">
          <label>
            Prénom
            <input value={form.firstName} onChange={set('firstName')} required maxLength={100} />
          </label>
          <label>
            Nom
            <input value={form.lastName} onChange={set('lastName')} required maxLength={100} />
          </label>
        </div>
      )}
      <label>
        Email
        <input type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
      </label>
      <label>
        Mot de passe
        <input
          type="password"
          value={form.password}
          onChange={set('password')}
          required
          minLength={mode === 'signup' ? 8 : undefined}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        />
      </label>
      <ErrorMessage error={error} />
      <button type="submit" disabled={busy}>
        {busy ? '…' : mode === 'signin' ? 'Se connecter' : "S'inscrire"}
      </button>
      <button
        type="button"
        className="link"
        onClick={() => {
          setMode(mode === 'signin' ? 'signup' : 'signin')
          setError(null)
        }}
      >
        {mode === 'signin' ? 'Pas de compte ? Créer un compte' : 'Déjà inscrit ? Se connecter'}
      </button>
    </form>
  )
}
