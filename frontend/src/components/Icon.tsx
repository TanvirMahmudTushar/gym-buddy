// The app's icons, drawn on a 24 by 24 grid. They are decoration next to a label, so screen readers skip them.
const PATHS = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z",
  members: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.6 3-5.5 6.5-5.5s5.9 1.9 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.5 3.5 5.2",
  attendance: "M5 4h14v16H5zM8.5 12.2l2.5 2.5 4.8-5.2",
  payments: "M3 6h18v12H3zM3 10h18M7 15h4",
  classes: "M4 6h16v14H4zM4 10h16M8 3.5V7M16 3.5V7",
  training: "M3 9v6M6 6.5v11M18 6.5v11M21 9v6M6 12h12",
  equipment: "M14.5 6.5a4 4 0 0 0-5.3 5L3.5 17.2l3.3 3.3 5.7-5.7a4 4 0 0 0 5-5.3l-2.6 2.6-2.7-.6-.6-2.7z",
  announcements: "M4 10v4h3l7 4.5v-13L7 10zM17.5 9a4 4 0 0 1 0 6",
  plans: "M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4zM13 5v14",
  expenses: "M6 3.5h12v17l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  users: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.8-3.8 3.6-5.8 7.5-5.8s6.7 2 7.5 5.8",
  security: "M12 3.5 4.5 6.5v5c0 4.5 3 7.6 7.5 9 4.5-1.4 7.5-4.5 7.5-9v-5z",
  activity: "M3 12h4l3-7.5 4 15 3-7.5h4",
  clients: "M12 20.5S4 15.6 4 9.8A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 8 2.2c0 5.8-8 10.7-8 10.7z",
  membership: "M3 5.5h18v13H3zM7.5 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5 15.5c.4-1.5 1.2-2 2.5-2s2.1.5 2.5 2M14 9.5h4M14 13h4",
  account: "M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM6 18.5c1-2.5 3-3.8 6-3.8s5 1.3 6 3.8",
  logout: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h9",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  back: "M14.5 6 8.5 12l6 6",
  plus: "M12 5v14M5 12h14",
  download: "M12 4v11M7.5 10.5 12 15l4.5-4.5M5 20h14",
} as const

export type IconName = keyof typeof PATHS

export default function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  )
}
