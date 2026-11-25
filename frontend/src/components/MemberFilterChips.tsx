import type { MemberFilter } from "../types/member"
import { membersLink } from "../utils/member"

export type MemberTab = MemberFilter | "all" | "waiting"

export const MEMBER_TABS: { value: MemberTab; label: string; empty: string }[] = [
  { value: "all", label: "All", empty: "No members yet. Add the first one." },
  { value: "active", label: "Active", empty: "No active members." },
  { value: "expiring_soon", label: "Expiring soon", empty: "No active membership ends in the next 7 days." },
  { value: "expired", label: "Expired", empty: "No expired members." },
  { value: "frozen", label: "Frozen", empty: "No frozen members." },
  { value: "waiting", label: "Waiting for a membership", empty: "Nobody is waiting for a membership." },
]

// Which members to list. They are links, so the choice is in the address and survives a reload.
export default function MemberFilterChips({ tab }: { tab: MemberTab }) {
  return (
    <div className="chips" role="group" aria-label="Which members to show">
      {MEMBER_TABS.map((t) => (
        <a key={t.value} className="chip" href={membersLink({ filter: t.value })} aria-current={t.value === tab ? "true" : undefined}>
          {t.label}
        </a>
      ))}
    </div>
  )
}
