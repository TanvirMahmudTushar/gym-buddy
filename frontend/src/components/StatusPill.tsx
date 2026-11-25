import type { MemberStatus } from "../types/member"

const LOOK: Record<MemberStatus, [string, string]> = {
  active: ["Active", "good"],
  expired: ["Expired", "bad"],
  frozen: ["Frozen", "info"],
}

// Where a membership stands.
export default function StatusPill({ status }: { status: MemberStatus }) {
  const [label, look] = LOOK[status]
  return <span className={`pill ${look}`}>{label}</span>
}
