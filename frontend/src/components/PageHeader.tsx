import type { ReactNode } from "react"
import Icon from "./Icon"

interface Props {
  title: ReactNode
  /** One line under the title. */
  subtitle?: ReactNode
  /** The page's main buttons, at the right. */
  children?: ReactNode
  /** The list this page was opened from. */
  back?: { href: string; label: string }
}

// The top of every page: what it is, and its main buttons.
export default function PageHeader({ title, subtitle, children, back }: Props) {
  return (
    <header className="page-header">
      <div>
        {back && (
          <a className="back" href={back.href}>
            <Icon name="back" /> {back.label}
          </a>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="actions">{children}</div>}
    </header>
  )
}
