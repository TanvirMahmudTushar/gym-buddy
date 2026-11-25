import ListState from "../../components/ListState"
import PageHeader from "../../components/PageHeader"
import Pager from "../../components/Pager"
import StatusPill from "../../components/StatusPill"
import { usePlans } from "../../context/PlansContext"
import { usePagedList } from "../../hooks/usePagedList"
import { listMyClients } from "../../services/trainerService"
import { memberStatus } from "../../utils/member"
import { formatDate, formatDateTime } from "../../utils/time"
import { trainingLink } from "../../utils/workout"

const load = (_filters: null, offset: number) => listMyClients(offset)

// Trainers: the members they are the personal trainer of. Staff pick a member's trainer on the Members page.
export default function MyClientsPage() {
  const { planLabel } = usePlans()
  const list = usePagedList(load, null)

  return (
    <div className="page">
      <PageHeader
        title="My clients"
        subtitle={
          <>
            The members you are the personal trainer of. Add them to one of your <a href={trainingLink("groups")}>training groups</a> to give
            them workouts.
          </>
        }
      />
      <section className="card">
        <ListState loading={list.loading} error={list.error} isEmpty={list.items.length === 0} empty="You have no clients yet. A Gym Manager picks each member's trainer.">
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
                    <td className="name">
                      {c.name}
                      <span className="hint">{c.email}</span>
                    </td>
                    <td data-label="Phone">{c.phone ?? "—"}</td>
                    <td data-label="Plan">{planLabel(c.plan)}</td>
                    <td data-label="Membership">
                      <span>
                        <StatusPill status={memberStatus(c)} />
                        <span className="hint">until {formatDate(c.expires_on)}</span>
                      </span>
                    </td>
                    <td data-label="Last visit">{c.last_visit_at ? formatDateTime(c.last_visit_at) : "No visits yet"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager {...list} onChange={list.goTo} />
        </ListState>
      </section>
    </div>
  )
}
