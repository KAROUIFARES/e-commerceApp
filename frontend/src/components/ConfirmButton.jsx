import { useEffect, useState } from 'react'

// Deux temps pour les actions destructrices : 1er clic = armer, 2e clic = confirmer.
export default function ConfirmButton({ onConfirm, children, confirmLabel = 'Confirmer ?' }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return undefined
    const t = setTimeout(() => setArmed(false), 3500)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      type="button"
      className={armed ? 'danger' : 'secondary'}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
    >
      {armed ? confirmLabel : children}
    </button>
  )
}
