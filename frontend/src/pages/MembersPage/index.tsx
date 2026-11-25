import { useState } from "react"
import AddMemberForm from "../../components/AddMemberForm"
import Icon from "../../components/Icon"
import MemberDetail from "../../components/MemberDetail"
import MemberFilterChips, { MEMBER_TABS } from "../../components/MemberFilterChips"
import MemberTable from "../../components/MemberTable"
import Modal from "../../components/Modal"
import PageHeader from "../../components/PageHeader"
import WaitingTable from "../../components/WaitingTable"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import { useHashValue } from "../../hooks/useHashValue"
import { hashId, hashParams } from "../../utils/hash"
import { membersLink } from "../../utils/member"

/** The list named in the address (#/members?filter=expiring_soon), so other pages can link straight to it. */
const tabFromHash = () => MEMBER_TABS.find((t) => t.value === hashParams().get("filter")) ?? MEMBER_TABS[0]

function MemberList() {
  const tab = useHashValue(tabFromHash)
  const [search, setSearch] = useState("")
  const q = useDebouncedValue(search.trim())
  // The Add member dialog, with the email filled in when it was opened from the waiting list.
  const [adding, setAdding] = useState<{ email?: string } | null>(null)

  return (
    <div className="page">
      <PageHeader title="Members" subtitle="A member signs up in the app first; then the front desk starts their membership.">
        <button type="button" className="primary" onClick={() => setAdding({})}>
          <Icon name="plus" /> Add member
        </button>
      </PageHeader>
      <section className="card">
        <div className="toolbar">
          <MemberFilterChips tab={tab.value} />
          <div className="filters">
            <div className="field grow">
              <input
                type="search"
                aria-label="Search by name, email or phone"
                placeholder="Search name, email or phone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                maxLength={100}
              />
            </div>
          </div>
        </div>
        {tab.value === "waiting" ? (
          <WaitingTable q={q} empty={tab.empty} onStart={(email) => setAdding({ email })} />
        ) : (
          <MemberTable status={tab.value === "all" ? null : tab.value} q={q} empty={tab.empty} />
        )}
      </section>
      {adding && (
        <Modal title="Start a membership" onClose={() => setAdding(null)}>
          <AddMemberForm
            email={adding.email}
            onCancel={() => setAdding(null)}
            onCreated={(member) => {
              window.location.hash = membersLink({ member: member.id })
            }}
          />
        </Modal>
      )}
    </div>
  )
}

// The members: the list, or one member when the address names them (#/members?member=5).
export default function MembersPage() {
  const memberId = useHashValue(() => hashId("member"))
  return memberId === null ? <MemberList /> : <MemberDetail key={memberId} memberId={memberId} />
}
