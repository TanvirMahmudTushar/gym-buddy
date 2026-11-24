import StatusPill from "../../components/StatusPill"
import { usePlans } from "../../context/PlansContext"
import { usePagedList } from "../../hooks/usePagedList"
import { listMyClients } from "../../services/trainerService"
import { formatDate, formatDateTime, memberStatus } from "../../utils/member"
import { trainingLink } from "../../utils/workout"

const load = (_filters: null, offset: number) => listMyClients(offset)

// Trainers: the members they are the personal trainer of. Staff pick a member's trainer on the Members page.
export default function MyClientsPage() {
  const { planLabel } = usePlans()
  const list = usePagedList(load, null)

  return (
    <section className="card" aria-labelledby="clients-heading">
      <h2 id="clients-heading">My clients {list.total > 0 && <span className="hint">({list.total})</span>}</h2>
      <p className="hint">
        The members you are the personal trainer of. To give them workouts, add them to one of your{" "}
        <a href={trainingLink("groups")}>training groups</a> by their email.
      </p>
      {list.error && (
        <p className="error" role="alert">
          {list.error}
        </p>
      )}
      {list.loading && list.items.length === 0 ? (
        <p className="empty">Loading your clients…</p>
      ) : list.items.length === 0 ? (
        !list.error && <p className="empty">You have no clients yet. A Gym Manager picks each member's trainer.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Phone</th>
                <th>Plan</th>
                <th>Membership</th>
                <th>Last visit</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((c) => (
                <tr key={c.id}>
                  <td className="name wrap">
                    {c.name}
                    <div className="hint">{c.email}</div>
                  </td>
                  <td>{c.phone ?? "—"}</td>
                  <td>{planLabel(c.plan)}</td>
                  <td>
                    <StatusPill status={memberStatus(c)} />
                    <div className="hint">until {formatDate(c.expires_on)}</div>
                  </td>
                  <td>{c.last_visit_at ? formatDateTime(c.last_visit_at) : "No visits yet"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.items.length > 0 && (
        <div className="list-foot">
          <span>
            Showing {list.items.length} of {list.total}
          </span>
          {list.items.length < list.total && (
            <button onClick={list.loadMore} disabled={list.loadingMore}>
              {list.loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
