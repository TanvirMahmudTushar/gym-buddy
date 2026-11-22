// Workout and training group types, matching the FastAPI schemas (TDD 5.3).

export interface Workout {
  id: number
  title: string
  /** YYYY-MM-DD */
  workout_date: string
  notes: string | null
  /** null for a personal workout, which only its owner can see. */
  group_id: number | null
  group_name: string | null
  /** Who added it; null once that account is deleted. */
  owner_id: number | null
  owner_name: string | null
  assigned_to: number | null
  assigned_to_name: string | null
  created_at: string
  updated_at: string
}

export interface WorkoutPage {
  items: Workout[]
  total: number
  offset: number
  limit: number
}

/** Add or edit a workout. group_id and assigned_to only when adding to a group. */
export interface WorkoutBody {
  title: string
  workout_date: string
  notes: string | null
  group_id?: number
  assigned_to?: number
}

/** What I may do in one group (backend/app/rbac.py, GroupPermission). The owner holds all five. */
export type GroupPermission = "read" | "create" | "update" | "assign" | "manage"

export interface Group {
  id: number
  name: string
  owner_id: number
  owner_name: string
  created_at: string
  /** The owner included. */
  member_count: number
  workout_count: number
  my_permissions: GroupPermission[]
}

export interface GroupPage {
  items: Group[]
  total: number
  offset: number
  limit: number
}

/** Someone in a group. The owner's row always has every permission. */
export interface GroupMember {
  user_id: number
  name: string
  /** Shown to the group's owner only. */
  email: string | null
  is_owner: boolean
  can_create: boolean
  can_update: boolean
  can_assign: boolean
  added_at: string
}

/** The three permissions the owner ticks for each member. */
export type MemberFlag = "can_create" | "can_update" | "can_assign"
