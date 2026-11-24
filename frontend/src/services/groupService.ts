// fetch helpers for training groups: /api/v1/groups. Trainers and staff start them; the rest follows group permissions.
import type { Group, GroupMember, GroupPage, MemberFlag } from "../types/workout"
import { request } from "./api"

const BASE = "/api/v1/groups"
const PAGE_SIZE = 20

export function listGroups(offset: number): Promise<GroupPage> {
  const params = new URLSearchParams({ offset: String(offset), limit: String(PAGE_SIZE) })
  return request<GroupPage>(`${BASE}?${params}`)
}

export const createGroup = (name: string) => request<Group>(BASE, { method: "POST", body: JSON.stringify({ name }) })

export const getGroup = (id: number) => request<Group>(`${BASE}/${id}`)

export const renameGroup = (id: number, name: string) =>
  request<Group>(`${BASE}/${id}`, { method: "PATCH", body: JSON.stringify({ name }) })

export const deleteGroup = (id: number) => request<void>(`${BASE}/${id}`, { method: "DELETE" })

export const listMembers = (groupId: number) => request<GroupMember[]>(`${BASE}/${groupId}/members`)

export const addMember = (groupId: number, body: { email: string } & Record<MemberFlag, boolean>) =>
  request<GroupMember>(`${BASE}/${groupId}/members`, { method: "POST", body: JSON.stringify(body) })

export const updateMember = (groupId: number, userId: number, changes: Partial<Record<MemberFlag, boolean>>) =>
  request<GroupMember>(`${BASE}/${groupId}/members/${userId}`, { method: "PATCH", body: JSON.stringify(changes) })

/** The owner removes a member, or a member leaves with their own id. */
export const removeMember = (groupId: number, userId: number) =>
  request<void>(`${BASE}/${groupId}/members/${userId}`, { method: "DELETE" })
