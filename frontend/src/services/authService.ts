// fetch helpers for sign up, log in, log out, sessions and the logged-in user's own account.
import type { LoginResult, Me, SessionInfo, SignupBody, User } from "../types/auth"
import { request } from "./api"

export const signup = (body: SignupBody) =>
  request<User>("/api/v1/auth/signup", { method: "POST", body: JSON.stringify(body) })

export const login = (email: string, password: string) =>
  request<LoginResult>("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email, password }) })

/** Ends this browser's session on the server and clears the refresh cookie. */
export const logout = () => request<void>("/api/v1/auth/logout", { method: "POST" })

/** My login devices: one for each refresh token that is still valid. */
export const listMySessions = () => request<SessionInfo[]>("/api/v1/users/me/sessions")

/** Log one device out: its refresh cookie and access token stop working at once. */
export const revokeMySession = (id: number) => request<void>(`/api/v1/users/me/sessions/${id}`, { method: "DELETE" })

export const getMe = () => request<Me>("/api/v1/users/me")

export const renameMe = (name: string) =>
  request<Me>("/api/v1/users/me", { method: "PATCH", body: JSON.stringify({ name }) })

export const changePassword = (currentPassword: string, newPassword: string) =>
  request<void>("/api/v1/users/me/password", {
    method: "POST",
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  })
