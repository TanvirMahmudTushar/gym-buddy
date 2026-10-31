import { useEffect, useState } from "react"
import { PAGE_SIZE, listMembers } from "./api"
import AddMemberForm from "./components/AddMemberForm"
import MemberDetail from "./components/MemberDetail"
import MemberList, { type Filter } from "./components/MemberList"
import { type Member, errorText } from "./members"

// The whole MVP is this one page: add form and member list on the left, details of the selected member on the right.
export default function App() {
  const [members, setMembers] = useState<Member[]>([])
  const [filter, setFilter] = useState<Filter>("all")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState("")
  // Bumped to reload the first page after a change.
  const [reloadKey, setReloadKey] = useState(0)

  const status = filter === "all" ? null : filter

  // Read list: load the first page whenever the filter changes or a reload is asked for.
  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    listMembers(0, status)
      .then((page) => {
        if (ignore) return
        setMembers(page)
        setHasMore(page.length === PAGE_SIZE)
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [status, reloadKey])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listMembers(members.length, status)
      setMembers((prev) => [...prev, ...page])
      setHasMore(page.length === PAGE_SIZE)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  function handleCreated(member: Member) {
    setFilter("all")
    setSelectedId(member.id)
    setReloadKey((k) => k + 1)
  }

  function handleDeleted() {
    setSelectedId(null)
    setReloadKey((k) => k + 1)
  }

  return (
    <div className="page">
      <header>
        <h1>Gym Buddy</h1>
        <span className="tagline">Member records for the front desk</span>
      </header>
      <div className="layout">
        <div className="column">
          <AddMemberForm onCreated={handleCreated} />
          <MemberList
            members={members}
            filter={filter}
            onFilterChange={setFilter}
            selectedId={selectedId}
            onSelect={setSelectedId}
            loading={loading}
            error={error}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
          />
        </div>
        <aside className="column">
          <MemberDetail
            memberId={selectedId}
            onChanged={() => setReloadKey((k) => k + 1)}
            onDeleted={handleDeleted}
          />
        </aside>
      </div>
    </div>
  )
}
