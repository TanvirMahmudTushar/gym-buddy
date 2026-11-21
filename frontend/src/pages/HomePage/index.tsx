import { useEffect, useState } from "react"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import { listMembers } from "../../services/memberService"
import AddMemberForm from "../../components/AddMemberForm"
import MemberDetail from "../../components/MemberDetail"
import MemberList, { FILTERS, type Filter } from "../../components/MemberList"
import TodayCheckIns from "../../components/TodayCheckIns"
import WaitingList from "../../components/WaitingList"
import type { Member } from "../../types/member"
import { errorText, hashParams, membersLink } from "../../utils/member"

/** The list filter named in the address (#/members?filter=expiring_soon), so other pages can link straight to it. */
function filterFromHash(): Filter {
  const value = hashParams().get("filter")
  return FILTERS.find((f) => f.value === value)?.value ?? "all"
}

/** The member named in the address (#/members?member=5): any page that shows a member's name links here. */
function memberFromHash(): number | null {
  const id = Number(hashParams().get("member"))
  return Number.isInteger(id) && id > 0 ? id : null
}

// The members page: today's check-ins, the searchable member list, people waiting for a membership and the add
// form on the left; details of the selected member on the right.
export default function HomePage() {
  const [members, setMembers] = useState<Member[]>([])
  const [filter, setFilter] = useState<Filter>(filterFromHash)
  const [search, setSearch] = useState("")
  const query = useDebouncedValue(search)
  const [selectedId, setSelectedId] = useState<number | null>(memberFromHash)
  // Members ticked for bulk delete; separate from selectedId, the member shown in the details panel.
  const [checkedIds, setCheckedIds] = useState<number[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState("")
  // Bumped to reload the first page after a change.
  const [reloadKey, setReloadKey] = useState(0)
  // Bumped after a check-in, to reload the Checked in today card.
  const [checkInKey, setCheckInKey] = useState(0)
  // The account whose email Start membership put in the Add member form; key makes a second click on the same one count.
  const [start, setStart] = useState<{ email: string; key: number } | null>(null)
  // #/members?show=waiting (from the overview) opens with the waiting list in view.
  const [showWaiting] = useState(() => hashParams().get("show") === "waiting")

  const status = filter === "all" ? null : filter

  // Keep the address in step with the filter and the open member, so a reload or a shared link shows the same.
  // replaceState does not add history entries or fire hashchange.
  useEffect(() => {
    window.history.replaceState(null, "", membersLink({ filter, member: selectedId }))
  }, [filter, selectedId])

  // A link to another member followed while this page is open (the address changes, the page stays).
  useEffect(() => {
    const onHashChange = () => {
      setFilter(filterFromHash())
      setSelectedId(memberFromHash())
    }
    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [])

  // Read list: load the first page whenever the filter or search changes or a reload is asked for.
  useEffect(() => {
    let ignore = false
    setLoading(true)
    setError("")
    listMembers(0, status, query)
      .then((page) => {
        if (ignore) return
        setMembers(page.items)
        setTotal(page.total)
        // Only members still on screen can stay ticked, so nothing hidden gets deleted.
        setCheckedIds((prev) => prev.filter((id) => page.items.some((m) => m.id === id)))
      })
      .catch((err) => !ignore && setError(errorText(err)))
      .finally(() => !ignore && setLoading(false))
    return () => {
      ignore = true
    }
  }, [status, query, reloadKey])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const page = await listMembers(members.length, status, query)
      setMembers((prev) => [...prev, ...page.items])
      setTotal(page.total)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setLoadingMore(false)
    }
  }

  function handleCreated(member: Member) {
    setFilter("all")
    setSearch("")
    setStart(null)
    setSelectedId(member.id)
    setReloadKey((k) => k + 1)
  }

  function handleDeleted() {
    setSelectedId(null)
    setReloadKey((k) => k + 1)
  }

  function handleFilterChange(next: Filter) {
    setFilter(next)
    setCheckedIds([])
  }

  function handleBulkDeleted(ids: number[]) {
    setCheckedIds([])
    setSelectedId((current) => (current !== null && ids.includes(current) ? null : current))
    setReloadKey((k) => k + 1)
  }

  return (
    <div className="layout">
      <div className="column">
        {/* Also reloads after deletes, which remove a member's check-ins. */}
        <TodayCheckIns refreshKey={checkInKey + reloadKey} onSelect={setSelectedId} />
        <MemberList
          members={members}
          filter={filter}
          onFilterChange={handleFilterChange}
          search={search}
          onSearchChange={setSearch}
          query={query}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={loading}
          error={error}
          total={total}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          checkedIds={checkedIds}
          onCheckedChange={setCheckedIds}
          onBulkDeleted={handleBulkDeleted}
        />
        {/* Reloads with the member list: starting a membership moves the person from this list to that one. */}
        <WaitingList refreshKey={reloadKey} scrollOnOpen={showWaiting} onStart={(email) => setStart((s) => ({ email, key: (s?.key ?? 0) + 1 }))} />
        <AddMemberForm onCreated={handleCreated} start={start} />
      </div>
      <aside className="column">
        <MemberDetail
          memberId={selectedId}
          onChanged={() => setReloadKey((k) => k + 1)}
          onDeleted={handleDeleted}
          onCheckedIn={() => setCheckInKey((k) => k + 1)}
        />
      </aside>
    </div>
  )
}
