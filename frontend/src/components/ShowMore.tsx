interface Props {
  shown: number
  total: number
  loading: boolean
  onClick: () => void
}

// The button under a short list, while there is more to show.
export default function ShowMore({ shown, total, loading, onClick }: Props) {
  if (shown === 0 || shown >= total) return null
  return (
    <div className="actions">
      <button type="button" className="small" onClick={onClick} disabled={loading}>
        {loading ? "Loading…" : `Show more (${total - shown})`}
      </button>
    </div>
  )
}
