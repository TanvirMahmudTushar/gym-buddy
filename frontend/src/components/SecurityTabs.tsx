// The two halves of the Security section: every event, and who is failing to log in.
export default function SecurityTabs({ current }: { current: "security" | "activity" }) {
  return (
    <div className="chips" role="group" aria-label="What to show">
      <a className="chip" href="#/security" aria-current={current === "security" ? "true" : undefined}>
        Failed logins
      </a>
      <a className="chip" href="#/activity" aria-current={current === "activity" ? "true" : undefined}>
        Activity log
      </a>
    </div>
  )
}
