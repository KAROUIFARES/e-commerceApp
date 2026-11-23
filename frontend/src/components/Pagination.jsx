export default function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(Math.ceil(total / pageSize), 1)
  if (pages <= 1) return null
  return (
    <div className="row between pagination">
      <button className="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Précédent
      </button>
      <span>
        Page {page} / {pages} ({total})
      </span>
      <button className="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Suivant
      </button>
    </div>
  )
}
