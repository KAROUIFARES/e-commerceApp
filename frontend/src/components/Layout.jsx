import { useAuth } from '../AuthContext'
import { ROUTES } from '../router'

export default function Layout({ route, children }) {
  const { user, signOut } = useAuth()
  return (
    <>
      <header className="topbar">
        <strong className="brand">E-CommerceApp · Vendeur</strong>
        <nav aria-label="Navigation principale">
          {ROUTES.map((r) => (
            <a key={r.path} href={`#/${r.path}`} className={route === r.path ? 'active' : ''} aria-current={route === r.path ? 'page' : undefined}>
              {r.label}
            </a>
          ))}
        </nav>
        <span className="user">
          {user.firstName} {user.lastName}
          <button className="link" onClick={signOut}>
            Déconnexion
          </button>
        </span>
      </header>
      <main>{children}</main>
    </>
  )
}
