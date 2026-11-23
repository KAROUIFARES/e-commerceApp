import { useEffect, useRef } from 'react'

// <dialog> natif : focus piégé, Échap pour fermer.
export default function Modal({ title, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
  }, [])
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <header className="row between">
        <h2>{title}</h2>
        <button type="button" className="link" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </header>
      {children}
    </dialog>
  )
}
