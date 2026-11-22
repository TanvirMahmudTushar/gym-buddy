// fetch helpers for workouts: /api/v1/workouts. Any logged-in account; group workouts follow group permissions.
import type { Workout, WorkoutBody, WorkoutPage } from "../types/workout"
import { request } from "./api"

const BASE = "/api/v1/workouts"
const PAGE_SIZE = 20

const page = (path: string, offset: number) =>
  request<WorkoutPage>(`${path}?${new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) })}`)

/** My personal workouts (in no group), latest date first. */
export const listMyWorkouts = (offset: number) => page(BASE, offset)

/** Group workouts assigned to me, from every group I am in. */
export const listAssignedToMe = (offset: number) => page(`${BASE}/assigned`, offset)

/** A group's workouts, for anyone in the group. */
export const listGroupWorkouts = (groupId: number, offset: number) => page(`/api/v1/groups/${groupId}/workouts`, offset)

export const createWorkout = (body: WorkoutBody) => request<Workout>(BASE, { method: "POST", body: JSON.stringify(body) })

export const updateWorkout = (id: number, body: Pick<WorkoutBody, "title" | "workout_date" | "notes">) =>
  request<Workout>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify(body) })

/** Assign a group workout to someone in the group, or unassign it with null. */
export const assignWorkout = (id: number, userId: number | null) =>
  request<Workout>(`${BASE}/${id}/assignee`, { method: "PUT", body: JSON.stringify({ user_id: userId }) })

export const deleteWorkout = (id: number) => request<void>(`${BASE}/${id}`, { method: "DELETE" })
