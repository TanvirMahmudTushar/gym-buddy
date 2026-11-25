interface Props {
  offset: number
  limit: number
  total: number
  loading?: boolean
  onChange: (offset: number) => void
}

// Under a list: which rows are shown, and Previous / Next when there is more than one page.
export default function Pager({ offset, limit, total, loading = false, onChange }: Props) {
  if (total === 0) return null
  const pages = Math.ceil(total / limit)
  const page = Math.floor(offset / limit) + 1
  return (
    <div className="list-foot">
      <span aria-live="polite">{pages === 1 ? `${total} in total` : `${offset + 1}–${Math.min(offset + limit, total)} of ${total}`}</span>
      {pages > 1 && (
        <div className="actions" role="group" aria-label="Pages">
          <button type="button" className="small" onClick={() => onChange(offset - limit)} disabled={loading || page === 1}>
            Previous
          </button>
          <span>
            Page {page} of {pages}
          </span>
          <button type="button" className="small" onClick={() => onChange(offset + limit)} disabled={loading || page === pages}>
            Next
          </button>
        </div>
      )}
    </div>
  )
}
