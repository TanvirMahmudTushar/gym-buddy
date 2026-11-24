export interface Bar {
  key: string
  name: string
  /** A short line under the name. */
  note?: string
  value: number
  /** How the value is written at the end of the bar. */
  label: string
}

// Names, bars and values on one scale, one per row. The bar repeats the number next to it, so it is hidden from
// screen readers.
export default function BarList({ bars }: { bars: Bar[] }) {
  const top = Math.max(0, ...bars.map((b) => b.value))
  return (
    <ul className="bar-list">
      {bars.map((b) => (
        <li key={b.key}>
          <span className="bar-name">
            {b.name}
            {b.note && <span className="hint">{b.note}</span>}
          </span>
          <span className="bar-track" aria-hidden="true">
            {b.value > 0 && <span className="bar-fill" style={{ width: `${(b.value / top) * 100}%` }} />}
          </span>
          <span className="bar-value">{b.label}</span>
        </li>
      ))}
    </ul>
  )
}
