import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, loadSession, saveSession, setUnauthorizedHandler } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession)

  const signOut = useCallback(() => {
    saveSession(null)
    setSession(null)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(signOut)
  }, [signOut])

  const authenticate = useCallback(async (call, payload) => {
    const result = await call(payload)
    saveSession(result)
    setSession(result)
  }, [])

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      signIn: (payload) => authenticate(api.signIn, payload),
      signUp: (payload) => authenticate(api.signUp, payload),
      signOut,
    }),
    [session, authenticate, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext)
