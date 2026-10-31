import type { MemberStatus } from "../members"

const LABELS: Record<MemberStatus, string> = { active: "Active", expired: "Expired", frozen: "Frozen" }

export default function StatusPill({ status }: { status: MemberStatus }) {
  return <span className={`pill ${status}`}>{LABELS[status]}</span>
}
