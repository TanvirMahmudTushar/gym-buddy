import type { Selection } from "../hooks/useSelection"

// The tick box in a table's heading: ticks or unticks every row shown.
export default function TickAll({ selection, label }: { selection: Selection; label: string }) {
  return (
    <th className="tick">
      <input
        type="checkbox"
        aria-label={label}
        checked={selection.all}
        ref={(el) => {
          if (el) el.indeterminate = selection.some
        }}
        onChange={selection.toggleAll}
      />
    </th>
  )
}
