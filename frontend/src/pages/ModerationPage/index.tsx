import { useEffect, useState } from "react"
import ModerationGroups from "../../components/ModerationGroups"
import ModerationWorkouts from "../../components/ModerationWorkouts"
import { usersLink } from "../../utils/auth"
import { hashParams } from "../../utils/member"

type Tab = "workouts" | "groups"

/** The tab and the owner named in the address (#/moderation?tab=groups&owner=5), so a user's details can link here. */
function readHash(): { tab: Tab; owner: number | null } {
  const params = hashParams()
  const owner = Number(params.get("owner"))
  return { tab: params.get("tab") === "groups" ? "groups" : "workouts", owner: Number.isInteger(owner) && owner > 0 ? owner : null }
}

function moderationLink(tab: Tab, owner: number | null): string {
  const params = new URLSearchParams()
  if (tab === "groups") params.set("tab", "groups")
  if (owner) params.set("owner", String(owner))
  return params.toString() ? `#/moderation?${params}` : "#/moderation"
}

// Admins only: find and remove anyone's workouts and training groups (content moderation), and export them.
export default function ModerationPage() {
  const [{ tab, owner }, setView] = useState(readHash)
  // The owner's name, once known from a clicked row; a link from a user's details gives only the id.
  const [ownerLabel, setOwnerLabel] = useState<string | null>(null)

  useEffect(() => {
    window.history.replaceState(null, "", moderationLink(tab, owner))
  }, [tab, owner])

  const pickOwner = (id: number, label: string) => {
    setOwnerLabel(label)
    setView((v) => ({ ...v, owner: id }))
  }

  return (
    <div className="column">
      <section className="card" aria-labelledby="moderation-heading">
        <div className="toolbar">
          <h2 id="moderation-heading">Moderation</h2>
          <div className="chips" role="group" aria-label="What to moderate">
            {(["workouts", "groups"] as Tab[]).map((t) => (
              <button key={t} type="button" className="chip" aria-pressed={tab === t} onClick={() => setView((v) => ({ ...v, tab: t }))}>
                {t === "workouts" ? "Workouts" : "Groups"}
              </button>
            ))}
          </div>
        </div>
        <p className="hint">
          Find and remove anyone's workouts and training groups, including personal workouts nobody else can see. You
          cannot edit them, and a delete cannot be undone. Every delete and every CSV download is recorded in the
          activity log, with the owner as the account affected.
        </p>
        {owner && (
          <p className="hint">
            Only content by <a href={usersLink(owner)}>{ownerLabel ?? `account #${owner}`}</a>.{" "}
            <button
              type="button"
              className="linklike"
              onClick={() => {
                setOwnerLabel(null)
                setView((v) => ({ ...v, owner: null }))
              }}
            >
              Show everyone's
            </button>
          </p>
        )}
      </section>
      {tab === "workouts" ? (
        <ModerationWorkouts ownerId={owner} onPickOwner={pickOwner} />
      ) : (
        <ModerationGroups ownerId={owner} onPickOwner={pickOwner} />
      )}
    </div>
  )
}
